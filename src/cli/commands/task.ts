import { readFileSync } from "node:fs";
import { Command } from "commander";
import type { TaskCreateInput } from "../../shared/types.js";
import {
  createClient,
  handleError,
  output,
  requireAgentName,
  requireProjectId,
} from "../helpers.js";

export const taskCommand = new Command("task").description("Manage tasks");

taskCommand
  .command("add")
  .description("Create a new task (or batch create from JSON file)")
  .option("-t, --title <title>", "Task title")
  .option("-d, --description <desc>", "Task description")
  .option("-p, --priority <p>", "Priority: P0, P1, P2", "P1")
  .option("-e, --epic <epic>", "Epic/feature area name")
  .option("--capabilities <caps>", "Capability tags (informational, not enforced on pickup)")
  .option("--depends-on <deps>", "Comma-separated task numbers (e.g. T-001,T-002)")
  .option("--verify <cmd>", "Verification command")
  .option("--acceptance-criteria <ac...>", "Acceptance criteria (repeatable)")
  .option("--context-refs <refs...>", "KB doc references (e.g. docs/architecture#auth)")
  .option("--status <s>", "Initial status: open or backlog", "open")
  .option("--batch <file>", "Path to JSON file for batch creation")
  .option("--human", "Human-readable output")
  .action(async (opts) => {
    try {
      requireProjectId();
      const client = createClient();

      if (opts.batch) {
        const raw = readFileSync(opts.batch, "utf-8");
        const inputs = JSON.parse(raw) as TaskCreateInput[];
        const tasks = await client.createTasksBatch(inputs);
        console.log(`${tasks.length} tasks created.`);
        output(tasks, opts.human);
        return;
      }

      if (!opts.title) {
        console.error("--title is required (or use --batch for bulk creation)");
        process.exit(1);
      }

      const input: TaskCreateInput = {
        title: opts.title,
        description: opts.description,
        priority: opts.priority,
        epic: opts.epic,
        capabilities: opts.capabilities
          ? opts.capabilities.split(",").map((s: string) => s.trim())
          : [],
        depends_on: opts.dependsOn ? opts.dependsOn.split(",").map((s: string) => s.trim()) : [],
        verify: opts.verify,
        acceptance_criteria: opts.acceptanceCriteria ?? [],
        context_refs: opts.contextRefs ?? [],
        status: opts.status,
      };

      const task = await client.createTask(input);
      output(task, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("list")
  .description("List tasks")
  .option("-s, --status <status>", "Filter by status")
  .option("-a, --assignee <agent>", "Filter by assignee")
  .option("-e, --epic <epic>", "Filter by epic")
  .option("-l, --limit <n>", "Max results", "100")
  .option("--human", "Human-readable output")
  .action(async (opts) => {
    try {
      requireProjectId();
      const client = createClient();
      const tasks = await client.listTasks({
        status: opts.status,
        assignee: opts.assignee,
        epic: opts.epic,
        limit: Number(opts.limit),
      });
      output(tasks, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("update <id>")
  .description("Update task fields (status, priority, assignee, epic, etc.)")
  .option("-s, --status <status>", "New status (backlog, open, in-progress, review, blocked, done)")
  .option("-p, --priority <priority>", "New priority (P0, P1, P2)")
  .option("-a, --assignee <name>", "Assign to agent")
  .option("-e, --epic <epic>", "Set epic")
  .option("--title <title>", "Update title")
  .option("--description <desc>", "Update description")
  .option("--verify <cmd>", "Update verify command")
  .option("--human", "Human-readable output")
  .action(
    async (
      id: string,
      opts: {
        status?: string;
        priority?: string;
        assignee?: string;
        epic?: string;
        title?: string;
        description?: string;
        verify?: string;
        human?: boolean;
      },
    ) => {
      try {
        requireProjectId();
        const client = createClient();

        const updates: Record<string, unknown> = {};
        if (opts.status !== undefined) updates.status = opts.status;
        if (opts.priority !== undefined) updates.priority = opts.priority;
        if (opts.assignee !== undefined) updates.assignee = opts.assignee;
        if (opts.epic !== undefined) updates.epic = opts.epic;
        if (opts.title !== undefined) updates.title = opts.title;
        if (opts.description !== undefined) updates.description = opts.description;
        if (opts.verify !== undefined) updates.verify = opts.verify;

        if (Object.keys(updates).length === 0) {
          console.error(
            "No fields to update. Use --status, --priority, --assignee, --epic, --title, --description, or --verify.",
          );
          process.exit(1);
        }

        const task = await client.updateTask(id, updates);
        output(task, opts.human);
      } catch (err) {
        handleError(err);
      }
    },
  );

taskCommand
  .command("show <id>")
  .description("Show task details (by ID or task number like T-001)")
  .option("--human", "Human-readable output")
  .action(async (id: string, opts: { human?: boolean }) => {
    try {
      requireProjectId();
      const client = createClient();
      const task = await client.getTask(id);
      output(task, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("mine")
  .description("Show my current tasks (in-progress + review)")
  .option("-a, --agent <name>", "Agent name (or set CPK_AGENT env var)")
  .option("--human", "Human-readable output")
  .action(async (opts: { agent?: string; human?: boolean }) => {
    try {
      requireProjectId();
      const agent = requireAgentName(opts.agent);
      const client = createClient();
      const tasks = await client.getMyTasks(agent);
      output(tasks, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("pickup")
  .description("Claim the highest-priority available task")
  .option("-a, --agent <name>", "Agent name (or set CPK_AGENT env var)")
  .option("--id <taskId>", "Pick up a specific task by number")
  .option("--human", "Human-readable output")
  .action(async (opts: { agent?: string; id?: string; human?: boolean }) => {
    try {
      requireProjectId();
      const agent = requireAgentName(opts.agent);
      const client = createClient();
      const task = await client.pickupTask(agent, opts.id);
      output(task, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("done <id>")
  .description("Complete a task (in-progress → review, or review → done)")
  .option("-a, --agent <name>", "Agent name (or set CPK_AGENT env var)")
  .option("--notes <notes>", "Completion notes")
  .option("--human", "Human-readable output")
  .action(async (id: string, opts: { agent?: string; notes?: string; human?: boolean }) => {
    try {
      requireProjectId();
      const agent = requireAgentName(opts.agent);
      const client = createClient();
      const task = await client.completeTask(id, agent, opts.notes);
      output(task, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("block <id>")
  .description("Mark a task as blocked")
  .option("-a, --agent <name>", "Agent name (or set CPK_AGENT env var)")
  .requiredOption("-r, --reason <reason>", "Reason for blocking")
  .option("--human", "Human-readable output")
  .action(async (id: string, opts: { agent?: string; reason: string; human?: boolean }) => {
    try {
      requireProjectId();
      const agent = requireAgentName(opts.agent);
      const client = createClient();
      const task = await client.blockTask(id, opts.reason, agent);
      output(task, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

taskCommand
  .command("unblock <id>")
  .description("Unblock a task (blocked → open)")
  .option("--human", "Human-readable output")
  .action(async (id: string, opts: { human?: boolean }) => {
    try {
      requireProjectId();
      const client = createClient();
      const task = await client.unblockTask(id);
      output(task, opts.human);
    } catch (err) {
      handleError(err);
    }
  });
