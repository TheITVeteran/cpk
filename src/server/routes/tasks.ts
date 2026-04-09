import { Hono } from "hono";
import { STATUS_TRANSITIONS } from "../../shared/constants.js";
import type { TaskStatus } from "../../shared/constants.js";
import {
  TaskBatchCreateSchema,
  TaskBlockSchema,
  TaskCompleteSchema,
  TaskCreateSchema,
  TaskListQuerySchema,
  TaskPickupSchema,
} from "../../shared/schemas.js";
import * as db from "../db/queries.js";
import { BadRequestError, NotFoundError } from "../middleware/error.js";

const tasks = new Hono();

/**
 * All task routes require project_id as a query param or in the path.
 * For v0.1, we use query param: ?project_id=xxx
 */

tasks.post("/tasks", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const body = await c.req.json();

  // Detect batch vs single
  if (Array.isArray(body)) {
    const inputs = TaskBatchCreateSchema.parse(body);
    const created = db.createTasksBatch(projectId, inputs);
    return c.json({ data: created }, 201);
  }

  const input = TaskCreateSchema.parse(body);
  const task = db.createTask(projectId, input);
  return c.json({ data: task }, 201);
});

tasks.get("/tasks", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const query = TaskListQuerySchema.parse({
    status: c.req.query("status"),
    assignee: c.req.query("assignee"),
    epic: c.req.query("epic"),
    limit: c.req.query("limit"),
  });

  const list = db.listTasks(projectId, query);
  return c.json({ data: list });
});

tasks.get("/tasks/mine", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");
  const agent = c.req.query("agent");
  if (!agent) throw new BadRequestError("agent query param required");

  const list = db.getAgentTasks(projectId, agent);
  return c.json({ data: list });
});

tasks.get("/tasks/:id", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const task = db.getTask(projectId, c.req.param("id"));
  if (!task) throw new NotFoundError("Task not found");
  return c.json({ data: task });
});

tasks.post("/tasks/pickup", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const body = await c.req.json();
  const input = TaskPickupSchema.parse(body);

  const taskId = c.req.query("task_id");

  if (taskId) {
    const result = db.pickupSpecificTask(projectId, input.agent, taskId);
    if (result.error) {
      return c.json({ error: "pickup_failed", message: result.error }, 400);
    }
    return c.json({ data: result.task });
  }

  const task = db.pickupTask(projectId, input.agent);
  if (!task) {
    return c.json({ error: "no_tasks_available", message: "No open tasks available" }, 404);
  }

  return c.json({ data: task });
});

tasks.patch("/tasks/:id", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const taskId = c.req.param("id");
  const existing = db.getTask(projectId, taskId);
  if (!existing) throw new NotFoundError("Task not found");

  const body = await c.req.json();
  const input = body as Record<string, unknown>;

  // Validate status transitions if status is being changed
  if (input["status"] && typeof input["status"] === "string") {
    const newStatus = input["status"] as TaskStatus;
    const allowed = STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestError(
        `Cannot transition from '${existing.status}' to '${newStatus}'. Allowed: ${allowed.join(", ") || "none"}`,
      );
    }
  }

  const updated = db.updateTask(projectId, existing.id, input);
  if (!updated) throw new NotFoundError("Task not found");
  return c.json({ data: updated });
});

tasks.post("/tasks/:id/done", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const taskId = c.req.param("id");
  const existing = db.getTask(projectId, taskId);
  if (!existing) throw new NotFoundError("Task not found");

  const body = await c.req.json().catch(() => ({}));
  const input = TaskCompleteSchema.parse(body);

  if (existing.status === "in-progress") {
    // Agent completing: straight to done, triggers dependency resolution
    const agent = c.req.query("agent") ?? existing.assignee ?? "unknown";
    const task = db.completeTask(projectId, existing.id, agent, input.notes);
    if (!task) throw new BadRequestError("Cannot complete task");
    return c.json({ data: task });
  }

  if (existing.status === "review") {
    // Approving a reviewed task: move to done
    const reviewer = c.req.query("agent") ?? undefined;
    const task = db.markTaskDone(projectId, existing.id, reviewer);
    if (!task) throw new BadRequestError("Cannot mark task as done");
    return c.json({ data: task });
  }

  throw new BadRequestError(
    `Task is '${existing.status}'. Can only complete from 'in-progress' or 'review'.`,
  );
});

tasks.post("/tasks/:id/block", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const taskId = c.req.param("id");
  const existing = db.getTask(projectId, taskId);
  if (!existing) throw new NotFoundError("Task not found");

  const body = await c.req.json();
  const input = TaskBlockSchema.parse(body);
  const agent = c.req.query("agent") ?? existing.assignee ?? "unknown";

  const task = db.blockTask(projectId, existing.id, agent, input.reason);
  if (!task) throw new BadRequestError("Cannot block task");
  return c.json({ data: task });
});

tasks.post("/tasks/:id/unblock", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const taskId = c.req.param("id");
  const existing = db.getTask(projectId, taskId);
  if (!existing) throw new NotFoundError("Task not found");

  const task = db.unblockTask(projectId, existing.id);
  if (!task) throw new BadRequestError("Cannot unblock task");
  return c.json({ data: task });
});

export default tasks;
