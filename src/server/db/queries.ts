import { randomUUID } from "node:crypto";
import type { DocCreateInput, TaskCreateInput, TaskUpdateInput } from "../../shared/types.js";
import type { Agent, Doc, Event, Task } from "../../shared/types.js";
import { getDb } from "./index.js";

// --- JSON helpers ---

function parseJsonArray(val: unknown): string[] {
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(val: unknown): Record<string, unknown> | null {
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function boolFromInt(val: unknown): boolean {
  return val === 1;
}

// --- Row mappers ---

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: row["id"] as string,
    project_id: row["project_id"] as string,
    task_number: row["task_number"] as string,
    title: row["title"] as string,
    description: (row["description"] as string) ?? null,
    status: row["status"] as Task["status"],
    assignee: (row["assignee"] as string) ?? null,
    priority: row["priority"] as Task["priority"],
    epic: (row["epic"] as string) ?? null,
    capabilities: parseJsonArray(row["capabilities"]),
    depends_on: parseJsonArray(row["depends_on"]),
    deps_met: boolFromInt(row["deps_met"]),
    acceptance_criteria: parseJsonArray(row["acceptance_criteria"]),
    context_refs: parseJsonArray(row["context_refs"]),
    verify: (row["verify"] as string) ?? null,
    notes: parseJsonArray(row["notes"]),
    blocker_reason: (row["blocker_reason"] as string) ?? null,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
    started_at: (row["started_at"] as string) ?? null,
    completed_at: (row["completed_at"] as string) ?? null,
  };
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: row["id"] as string,
    project_id: row["project_id"] as string,
    name: row["name"] as string,
    status: row["status"] as string,
    current_task_id: (row["current_task_id"] as string) ?? null,
    last_seen: row["last_seen"] as string,
  };
}

function mapEvent(row: Record<string, unknown>): Event {
  return {
    id: row["id"] as string,
    project_id: row["project_id"] as string,
    task_id: (row["task_id"] as string) ?? null,
    agent: (row["agent"] as string) ?? null,
    action: row["action"] as string,
    detail: parseJsonObject(row["detail"]),
    created_at: row["created_at"] as string,
  };
}

function mapDoc(row: Record<string, unknown>): Doc {
  return {
    id: row["id"] as string,
    project_id: row["project_id"] as string,
    type: row["type"] as Doc["type"],
    title: row["title"] as string,
    body: row["body"] as string,
    section: (row["section"] as string) ?? null,
    tags: parseJsonArray(row["tags"]),
    author: (row["author"] as string) ?? null,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

// ============================================================
// METADATA (key-value store for project-level settings)
// ============================================================

export function getMetadata(projectId: string, key: string): string | undefined {
  const db = getDb(projectId);
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setMetadata(projectId: string, key: string, value: string): void {
  const db = getDb(projectId);
  db.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

function getNextTaskNumber(projectId: string): number {
  const val = getMetadata(projectId, "next_task_number");
  return val ? Number.parseInt(val, 10) : 1;
}

function incrementTaskNumber(projectId: string): void {
  const current = getNextTaskNumber(projectId);
  setMetadata(projectId, "next_task_number", String(current + 1));
}

// ============================================================
// TASKS
// ============================================================

/**
 * Create a task with auto-generated task_number.
 * Runs inside a transaction for atomic numbering.
 */
export function createTask(projectId: string, input: TaskCreateInput): Task {
  const db = getDb(projectId);

  const task = db.transaction(() => {
    // Get and increment task number atomically
    const num = getNextTaskNumber(projectId);
    const taskNumber = `T-${String(num).padStart(3, "0")}`;
    incrementTaskNumber(projectId);

    // Compute deps_met: true if depends_on is empty, otherwise check if all deps are done
    const depsMet = computeDepsMet(projectId, input.depends_on);

    // If task has unmet deps, force status to backlog
    const status = !depsMet && input.status === "open" ? "backlog" : input.status;

    const id = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, project_id, task_number, title, description, status, priority, epic, capabilities, depends_on, deps_met, acceptance_criteria, context_refs, verify)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      projectId,
      taskNumber,
      input.title,
      input.description ?? null,
      status,
      input.priority,
      input.epic ?? null,
      JSON.stringify(input.capabilities ?? []),
      JSON.stringify(input.depends_on ?? []),
      depsMet ? 1 : 0,
      JSON.stringify(input.acceptance_criteria ?? []),
      JSON.stringify(input.context_refs ?? []),
      input.verify ?? null
    );

    // Log event
    logEventInternal(projectId, "task_created", { task_number: taskNumber, title: input.title }, id);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>;
  })();

  return mapTask(task);
}

/**
 * Batch create tasks. Returns all created tasks.
 */
export function createTasksBatch(projectId: string, inputs: TaskCreateInput[]): Task[] {
  const db = getDb(projectId);

  const tasks = db.transaction(() => {
    return inputs.map((input) => createTask(projectId, input));
  })();

  return tasks;
}

export function getTask(projectId: string, idOrNumber: string): Task | undefined {
  const db = getDb(projectId);
  const isTaskNumber = idOrNumber.match(/^T-\d+$/);

  const row = isTaskNumber
    ? (db
        .prepare("SELECT * FROM tasks WHERE project_id = ? AND task_number = ?")
        .get(projectId, idOrNumber) as Record<string, unknown> | undefined)
    : (db
        .prepare("SELECT * FROM tasks WHERE project_id = ? AND id = ?")
        .get(projectId, idOrNumber) as Record<string, unknown> | undefined);

  return row ? mapTask(row) : undefined;
}

export function listTasks(
  projectId: string,
  filters?: { status?: string; assignee?: string; epic?: string; limit?: number }
): Task[] {
  const db = getDb(projectId);
  let sql = "SELECT * FROM tasks WHERE project_id = ?";
  const params: unknown[] = [projectId];

  if (filters?.status) {
    sql += " AND status = ?";
    params.push(filters.status);
  }
  if (filters?.assignee) {
    sql += " AND assignee = ?";
    params.push(filters.assignee);
  }
  if (filters?.epic) {
    sql += " AND epic = ?";
    params.push(filters.epic);
  }

  sql += " ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, created_at ASC";

  if (filters?.limit) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapTask);
}

/**
 * Get tasks assigned to a specific agent (in-progress or review).
 */
export function getAgentTasks(projectId: string, agentName: string): Task[] {
  const db = getDb(projectId);
  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE project_id = ? AND assignee = ? AND status IN ('in-progress', 'review')
       ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, created_at ASC`
    )
    .all(projectId, agentName) as Record<string, unknown>[];
  return rows.map(mapTask);
}

/**
 * Upsert an agent record. Auto-created on first interaction (pickup/done/block).
 * No registration needed — agents are just name strings.
 */
function upsertAgent(projectId: string, name: string): void {
  const db = getDb(projectId);
  db.prepare(
    `INSERT INTO agents (id, project_id, name, last_seen)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, name) DO UPDATE SET last_seen = datetime('now')`
  ).run(randomUUID(), projectId, name);
}

/**
 * Atomic task pickup using BEGIN IMMEDIATE.
 * Finds highest-priority open task with deps_met=true, assigns to agent.
 * Agent is auto-created on first pickup — no registration needed.
 */
export function pickupTask(projectId: string, agentName: string): Task | undefined {
  const db = getDb(projectId);

  const result = db.transaction(() => {
    upsertAgent(projectId, agentName);

    const match = db
      .prepare(
        `SELECT * FROM tasks
         WHERE project_id = ?
           AND status = 'open'
           AND deps_met = 1
         ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, created_at ASC
         LIMIT 1`
      )
      .get(projectId) as Record<string, unknown> | undefined;

    if (!match) return undefined;

    const taskId = match["id"] as string;

    db.prepare(
      `UPDATE tasks SET status = 'in-progress', assignee = ?, started_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(agentName, taskId);

    db.prepare(
      `UPDATE agents SET status = 'working', current_task_id = ? WHERE project_id = ? AND name = ?`
    ).run(taskId, projectId, agentName);

    logEventInternal(projectId, "task_pickup", { agent: agentName }, taskId, agentName);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
  })();

  return result ? mapTask(result) : undefined;
}

/**
 * Pick up a specific task by task_number.
 */
export function pickupSpecificTask(
  projectId: string,
  agentName: string,
  taskNumber: string
): { task?: Task; error?: string } {
  const db = getDb(projectId);

  return db.transaction(() => {
    upsertAgent(projectId, agentName);

    const row = db
      .prepare(
        `SELECT * FROM tasks WHERE project_id = ? AND task_number = ? AND status = 'open' AND deps_met = 1`
      )
      .get(projectId, taskNumber) as Record<string, unknown> | undefined;

    if (!row) return { error: `Task ${taskNumber} is not available (not open or deps not met)` };

    const taskId = row["id"] as string;

    db.prepare(
      `UPDATE tasks SET status = 'in-progress', assignee = ?, started_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(agentName, taskId);

    db.prepare(
      `UPDATE agents SET status = 'working', current_task_id = ? WHERE project_id = ? AND name = ?`
    ).run(taskId, projectId, agentName);

    logEventInternal(projectId, "task_pickup", { agent: agentName, task_number: taskNumber }, taskId, agentName);

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
    return { task: mapTask(updated) };
  })();
}

export function updateTask(projectId: string, taskId: string, input: TaskUpdateInput): Task | undefined {
  const db = getDb(projectId);

  const result = db.transaction(() => {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return undefined;

    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (input.title !== undefined) {
      sets.push("title = ?");
      params.push(input.title);
    }
    if (input.description !== undefined) {
      sets.push("description = ?");
      params.push(input.description);
    }
    if (input.priority !== undefined) {
      sets.push("priority = ?");
      params.push(input.priority);
    }
    if (input.status !== undefined) {
      sets.push("status = ?");
      params.push(input.status);
    }
    if (input.assignee !== undefined) {
      sets.push("assignee = ?");
      params.push(input.assignee);
    }
    if (input.epic !== undefined) {
      sets.push("epic = ?");
      params.push(input.epic);
    }
    if (input.capabilities !== undefined) {
      sets.push("capabilities = ?");
      params.push(JSON.stringify(input.capabilities));
    }
    if (input.depends_on !== undefined) {
      sets.push("depends_on = ?");
      params.push(JSON.stringify(input.depends_on));
    }
    if (input.acceptance_criteria !== undefined) {
      sets.push("acceptance_criteria = ?");
      params.push(JSON.stringify(input.acceptance_criteria));
    }
    if (input.context_refs !== undefined) {
      sets.push("context_refs = ?");
      params.push(JSON.stringify(input.context_refs));
    }
    if (input.verify !== undefined) {
      sets.push("verify = ?");
      params.push(input.verify);
    }
    if (input.blocker_reason !== undefined) {
      sets.push("blocker_reason = ?");
      params.push(input.blocker_reason);
    }
    if (input.notes !== undefined) {
      sets.push("notes = ?");
      params.push(JSON.stringify(input.notes));
    }

    params.push(taskId, projectId);
    db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`).run(...params);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
  })();

  return result ? mapTask(result) : undefined;
}

/**
 * Complete a task: in-progress → review. Append notes. Trigger dependency resolution.
 * Agent says "I'm done" → task moves to review, deps resolve immediately.
 * Human approves from dashboard later (review → done) — just bookkeeping, doesn't block the pipeline.
 */
export function completeTask(projectId: string, taskId: string, agentName: string, notes?: string): Task | undefined {
  const db = getDb(projectId);

  const result = db.transaction(() => {
    upsertAgent(projectId, agentName);

    const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return undefined;
    if (existing["status"] !== "in-progress") return undefined;

    // Append notes if provided
    let updatedNotes = parseJsonArray(existing["notes"]);
    if (notes) {
      updatedNotes = [...updatedNotes, notes];
    }

    db.prepare(
      `UPDATE tasks SET status = 'review', notes = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(updatedNotes), taskId);

    // Free up the agent
    db.prepare(
      `UPDATE agents SET status = 'idle', current_task_id = NULL WHERE project_id = ? AND name = ?`
    ).run(projectId, agentName);

    const taskNumber = existing["task_number"] as string;
    logEventInternal(projectId, "task_complete", { notes, task_number: taskNumber }, taskId, agentName);

    // Deps resolve on review — don't block the pipeline waiting for human approval
    recalculateDependents(projectId, taskNumber);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
  })();

  return result ? mapTask(result) : undefined;
}

/**
 * Mark task as done (from review). Human approval step — bookkeeping only.
 * Dependencies already resolved when task entered review.
 */
export function markTaskDone(projectId: string, taskId: string): Task | undefined {
  const db = getDb(projectId);

  const result = db.transaction(() => {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return undefined;
    if (existing["status"] !== "review") return undefined;

    db.prepare(
      `UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?`
    ).run(taskId);

    const taskNumber = existing["task_number"] as string;
    logEventInternal(projectId, "task_approved", { task_number: taskNumber }, taskId);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
  })();

  return result ? mapTask(result) : undefined;
}

/**
 * Block a task with a reason.
 */
export function blockTask(projectId: string, taskId: string, agentName: string, reason: string): Task | undefined {
  const db = getDb(projectId);

  const result = db.transaction(() => {
    upsertAgent(projectId, agentName);

    const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return undefined;
    if (existing["status"] !== "in-progress" && existing["status"] !== "open") return undefined;

    db.prepare(
      `UPDATE tasks SET status = 'blocked', blocker_reason = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(reason, taskId);

    // Free up the agent
    db.prepare(
      `UPDATE agents SET status = 'idle', current_task_id = NULL WHERE project_id = ? AND name = ?`
    ).run(projectId, agentName);

    logEventInternal(projectId, "task_blocked", { reason }, taskId, agentName);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
  })();

  return result ? mapTask(result) : undefined;
}

/**
 * Unblock a task: status → open, clear blocker_reason.
 */
export function unblockTask(projectId: string, taskId: string): Task | undefined {
  const db = getDb(projectId);

  const result = db.transaction(() => {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return undefined;
    if (existing["status"] !== "blocked") return undefined;

    db.prepare(
      `UPDATE tasks SET status = 'open', blocker_reason = NULL, assignee = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(taskId);

    logEventInternal(projectId, "task_unblocked", {}, taskId);

    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
  })();

  return result ? mapTask(result) : undefined;
}

// ============================================================
// DEPENDENCY RESOLUTION
// ============================================================

/**
 * Check if all dependencies of a task are complete (review or done).
 * Review counts as complete — deps resolve when the agent finishes, not when the human approves.
 */
function computeDepsMet(projectId: string, dependsOn: string[]): boolean {
  if (dependsOn.length === 0) return true;

  const db = getDb(projectId);
  for (const dep of dependsOn) {
    const row = db
      .prepare("SELECT status FROM tasks WHERE project_id = ? AND task_number = ?")
      .get(projectId, dep) as { status: string } | undefined;
    if (!row || (row.status !== "done" && row.status !== "review")) return false;
  }
  return true;
}

/**
 * After a task is marked done, find all tasks that depend on it and recalculate deps_met.
 * If deps_met becomes true and task is in backlog, transition to open.
 */
function recalculateDependents(projectId: string, completedTaskNumber: string): void {
  const db = getDb(projectId);

  // Find all tasks in this project that have this task in their depends_on
  const allTasks = db
    .prepare("SELECT * FROM tasks WHERE project_id = ? AND status IN ('backlog', 'open', 'blocked')")
    .all(projectId) as Record<string, unknown>[];

  for (const row of allTasks) {
    const deps = parseJsonArray(row["depends_on"]);
    if (!deps.includes(completedTaskNumber)) continue;

    // Check if ALL deps are now done
    const allDepsDone = computeDepsMet(projectId, deps);
    if (allDepsDone) {
      const taskId = row["id"] as string;
      const currentStatus = row["status"] as string;

      db.prepare("UPDATE tasks SET deps_met = 1, updated_at = datetime('now') WHERE id = ?").run(taskId);

      // Auto-transition backlog → open when deps are met
      if (currentStatus === "backlog") {
        db.prepare("UPDATE tasks SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(taskId);
        logEventInternal(projectId, "deps_met", { task_number: row["task_number"] as string }, taskId);
      }
    }
  }
}

// ============================================================
// AGENTS
// ============================================================

export function getAgent(projectId: string, name: string): Agent | undefined {
  const db = getDb(projectId);
  const row = db
    .prepare("SELECT * FROM agents WHERE project_id = ? AND name = ?")
    .get(projectId, name) as Record<string, unknown> | undefined;
  return row ? mapAgent(row) : undefined;
}

export function listAgents(projectId: string): Agent[] {
  const db = getDb(projectId);
  const rows = db
    .prepare("SELECT * FROM agents WHERE project_id = ? ORDER BY last_seen DESC")
    .all(projectId) as Record<string, unknown>[];
  return rows.map(mapAgent);
}

// ============================================================
// EVENTS
// ============================================================

function logEventInternal(
  projectId: string,
  action: string,
  detail?: Record<string, unknown>,
  taskId?: string,
  agent?: string
): void {
  const db = getDb(projectId);
  db.prepare(
    `INSERT INTO events (id, project_id, task_id, agent, action, detail) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), projectId, taskId ?? null, agent ?? null, action, detail ? JSON.stringify(detail) : null);
}

export function logEvent(
  projectId: string,
  action: string,
  detail?: Record<string, unknown>,
  taskId?: string,
  agent?: string
): Event {
  const db = getDb(projectId);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO events (id, project_id, task_id, agent, action, detail) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, taskId ?? null, agent ?? null, action, detail ? JSON.stringify(detail) : null);

  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as Record<string, unknown>;
  return mapEvent(row);
}

export function listEvents(
  projectId: string,
  filters?: { task_id?: string; agent?: string; limit?: number }
): Event[] {
  const db = getDb(projectId);
  let sql = "SELECT * FROM events WHERE project_id = ?";
  const params: unknown[] = [projectId];

  if (filters?.task_id) {
    sql += " AND task_id = ?";
    params.push(filters.task_id);
  }
  if (filters?.agent) {
    sql += " AND agent = ?";
    params.push(filters.agent);
  }

  sql += " ORDER BY created_at DESC";

  const limit = filters?.limit ?? 50;
  sql += " LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapEvent);
}

// ============================================================
// DOCS
// ============================================================

export function createDoc(projectId: string, input: DocCreateInput): Doc {
  const db = getDb(projectId);
  const id = randomUUID();

  db.prepare(
    `INSERT INTO docs (id, project_id, type, title, body, section, tags, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, input.type, input.title, input.body, input.section ?? null, JSON.stringify(input.tags), input.author ?? null);

  const row = db.prepare("SELECT * FROM docs WHERE id = ?").get(id) as Record<string, unknown>;
  return mapDoc(row);
}

export function getDoc(projectId: string, id: string): Doc | undefined {
  const db = getDb(projectId);
  const row = db
    .prepare("SELECT * FROM docs WHERE id = ? AND project_id = ?")
    .get(id, projectId) as Record<string, unknown> | undefined;
  return row ? mapDoc(row) : undefined;
}

export function searchDocs(
  projectId: string,
  query: string,
  filters?: { type?: string; limit?: number }
): Doc[] {
  const db = getDb(projectId);

  // Simple keyword search using LIKE
  let sql = "SELECT * FROM docs WHERE project_id = ? AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)";
  const pattern = `%${query}%`;
  const params: unknown[] = [projectId, pattern, pattern, pattern];

  if (filters?.type) {
    sql += " AND type = ?";
    params.push(filters.type);
  }

  sql += " ORDER BY CASE type WHEN 'operational' THEN 0 WHEN 'decision' THEN 1 WHEN 'reference' THEN 2 ELSE 3 END, updated_at DESC";

  const limit = filters?.limit ?? 10;
  sql += " LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapDoc);
}

export function listDocs(projectId: string, filters?: { type?: string }): Doc[] {
  const db = getDb(projectId);
  let sql = "SELECT * FROM docs WHERE project_id = ?";
  const params: unknown[] = [projectId];

  if (filters?.type) {
    sql += " AND type = ?";
    params.push(filters.type);
  }

  sql += " ORDER BY updated_at DESC";

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapDoc);
}

// ============================================================
// BOARD
// ============================================================

export function getBoardStatus(projectId: string): {
  total: number;
  by_status: Record<string, number>;
  blocked_tasks: Task[];
  agent_activity: Agent[];
} {
  const db = getDb(projectId);

  const counts = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status`
    )
    .all(projectId) as { status: string; count: number }[];

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of counts) {
    byStatus[row.status] = row.count;
    total += row.count;
  }

  const blockedRows = db
    .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = 'blocked' ORDER BY updated_at DESC")
    .all(projectId) as Record<string, unknown>[];

  const agentRows = db
    .prepare("SELECT * FROM agents WHERE project_id = ? ORDER BY name ASC")
    .all(projectId) as Record<string, unknown>[];

  return {
    total,
    by_status: byStatus,
    blocked_tasks: blockedRows.map(mapTask),
    agent_activity: agentRows.map(mapAgent),
  };
}
