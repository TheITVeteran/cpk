import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_CONFIG_DIR } from "../../shared/constants.js";
import type { Agent, Project } from "../../shared/types.js";
import { createClient, handleError, requireProjectId } from "../helpers.js";

/**
 * Generate .codepakt/AGENTS.md content from project + agent data.
 */
function generateAgentsMd(project: Project, agents: Agent[]): string {
  const lines: string[] = [];

  lines.push("# AGENTS.md");
  lines.push("");
  lines.push(`> Project: **${project.name}** — coordinated via [Codepakt](https://codepakt.com)`);
  lines.push("");

  lines.push("## Prerequisites");
  lines.push("- Install: `npm i -g codepakt`");
  lines.push("- Start server: `cpk server start` (runs on port 41920)");
  lines.push("- Dashboard: http://localhost:41920");
  lines.push("");

  lines.push("## Workflow (follow exactly)");
  lines.push("");
  lines.push("All output is JSON. Parse it programmatically.");
  lines.push("");
  lines.push("```bash");
  lines.push("# 1. Check assigned tasks");
  lines.push("cpk task mine --agent <your-name>");
  lines.push("");
  lines.push("# 2. Pick up next available task");
  lines.push("cpk task pickup --agent <your-name>");
  lines.push("");
  lines.push("# 3. Read task details");
  lines.push("cpk task show T-001");
  lines.push("");
  lines.push("# 4. Do the work");
  lines.push("");
  lines.push("# 5. Mark complete");
  lines.push('cpk task done T-001 --agent <your-name> --notes "what you did"');
  lines.push("");
  lines.push("# 6. If blocked");
  lines.push('cpk task block T-001 --agent <your-name> --reason "why"');
  lines.push("");
  lines.push("# 7. Create tasks (command is 'add', NOT 'create')");
  lines.push('cpk task add --title "Fix bug" --priority P0');
  lines.push('cpk task add --title "Feature" --priority P1 --epic "Auth" --depends-on T-001');
  lines.push("");
  lines.push("# 8. Other useful commands");
  lines.push("cpk task list                        # All tasks");
  lines.push("cpk task list --status open           # Filter by status");
  lines.push("cpk task unblock T-001               # Remove block");
  lines.push("cpk board status                     # Board health");
  lines.push('cpk docs search "topic"              # Search knowledge base');
  lines.push("```");
  lines.push("");

  lines.push("## Task Lifecycle");
  lines.push("backlog → open → in-progress → **done** (dependencies resolve immediately)");
  lines.push("`task done` goes straight to done — no review gate. Review is optional (human-managed).");
  lines.push("");

  lines.push("## Important");
  lines.push("- Command is `task add` — NOT `task create`");
  lines.push("- `--agent` is required on: `task pickup`, `task done`, `task block`, `task mine`");
  lines.push("- Alternative: `export CPK_AGENT=<your-name>` to skip `--agent` each time");
  lines.push("- Every command needs a subcommand: `cpk board status` (NOT `cpk board`)");
  lines.push("- Server must be running: `cpk server start` (check with `cpk server status`)");

  if (agents.length > 0) {
    lines.push("");
    lines.push("## Active Agents");
    for (const agent of agents) {
      const taskInfo = agent.current_task_id ? `working on ${agent.current_task_id}` : "idle";
      lines.push(`- **${agent.name}** (${taskInfo})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Generate .codepakt/CLAUDE.md content with coordination instructions.
 */
function generateClaudeMd(project: Project, agents: Agent[]): string {
  const lines: string[] = [];

  lines.push("# Codepakt — Project Coordination");
  lines.push("");
  lines.push(`> Project: **${project.name}** — coordinated via [Codepakt](https://codepakt.com)`);
  lines.push(">");
  lines.push("> All `cpk` commands output JSON. Parse it programmatically — do not display raw JSON to the user.");
  lines.push(">");
  lines.push("> Every command requires a subcommand (e.g. `cpk board status`, not `cpk board`).");
  lines.push("");

  lines.push("## Session Start");
  lines.push("Run these at the start of every session:");
  lines.push("```bash");
  lines.push("cpk server status                    # Ensure server is running (start with: cpk server start)");
  lines.push("cpk task mine --agent <your-name>    # Check assigned tasks");
  lines.push("cpk task list                        # All tasks on the board");
  lines.push("cpk board status                     # Board health summary");
  lines.push("```");
  lines.push("");

  lines.push("## Complete Command Reference");
  lines.push("");
  lines.push("### Create Tasks (command is `add`, NOT `create`)");
  lines.push("```bash");
  lines.push('cpk task add --title "Fix auth bug" --priority P0');
  lines.push('cpk task add --title "Build login" --priority P1 --epic "Auth" --depends-on T-001');
  lines.push('cpk task add --title "Add tests" --description "..." --verify "pnpm test" --acceptance-criteria "All pass"');
  lines.push("cpk task add --batch tasks.json      # Bulk create from JSON file");
  lines.push("```");
  lines.push("");

  lines.push("### List & Inspect Tasks");
  lines.push("```bash");
  lines.push("cpk task list                        # All tasks");
  lines.push("cpk task list --status open           # Filter: open|in-progress|review|blocked|done|backlog");
  lines.push('cpk task list --epic "Auth"           # Filter by epic');
  lines.push("cpk task list --assignee claude       # Filter by agent");
  lines.push("cpk task show T-001                   # Full details for one task");
  lines.push("```");
  lines.push("");

  lines.push("### Work on Tasks (--agent required)");
  lines.push("```bash");
  lines.push("cpk task mine --agent <name>          # My assigned tasks");
  lines.push("cpk task pickup --agent <name>        # Claim next available (highest priority, deps met)");
  lines.push("cpk task pickup --agent <name> --id T-001  # Claim specific task");
  lines.push('cpk task done T-001 --agent <name> --notes "what you did"  # Complete');
  lines.push('cpk task block T-001 --agent <name> --reason "why"         # Block');
  lines.push("cpk task unblock T-001               # Remove block, return to open");
  lines.push("```");
  lines.push("");

  lines.push("### Knowledge Base");
  lines.push("```bash");
  lines.push('cpk docs search "auth"               # Search docs');
  lines.push("cpk docs list                        # List all docs");
  lines.push("cpk docs read <doc-id>               # Read full doc");
  lines.push('cpk docs write --type learning --title "..." --body "..."');
  lines.push("# doc types: operational | decision | reference | learning");
  lines.push("```");
  lines.push("");

  lines.push("### Server & Board");
  lines.push("```bash");
  lines.push("cpk server start                     # Start daemon (port 41920)");
  lines.push("cpk server stop                      # Stop daemon");
  lines.push("cpk server status                    # Check if running");
  lines.push("cpk server logs                      # Last 50 lines");
  lines.push("cpk server logs -f                   # Follow in real time");
  lines.push("cpk board status                     # Task counts + blocked tasks");
  lines.push("cpk agent list                       # Agents that have interacted");
  lines.push("```");
  lines.push("");

  lines.push("## Task Lifecycle");
  lines.push("```");
  lines.push("backlog ──→ open ──→ in-progress ──→ done");
  lines.push("                         ↓");
  lines.push("                      blocked ──→ open");
  lines.push("```");
  lines.push("- `task done` goes **straight to done** (no review gate). Dependencies resolve immediately.");
  lines.push("- `review` is optional — human can move tasks there manually from the dashboard.");
  lines.push("- `backlog` = waiting on dependencies. Auto-transitions to `open` when deps are met.");
  lines.push("");

  lines.push("## Rules");
  lines.push("- The command is `task add` — NOT `task create`, NOT `task new`");
  lines.push("- `--agent` is **required** on: `task pickup`, `task done`, `task block`, `task mine`");
  lines.push("- Alternative: `export CPK_AGENT=<name>` to skip `--agent` each time");
  lines.push("- Every command needs a subcommand: `cpk board status` NOT `cpk board`");
  lines.push("- Dashboard: http://localhost:41920");

  if (agents.length > 0) {
    lines.push("");
    lines.push("## Active Agents");
    for (const agent of agents) {
      const taskInfo = agent.current_task_id ? `working on ${agent.current_task_id}` : "idle";
      lines.push(`- **${agent.name}** (${taskInfo})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Write generated file to .codepakt/ and handle the root file.
 * - Always writes to .codepakt/<filename> (codepakt owns this)
 * - For root CLAUDE.md: creates if missing, or prepends @import if missing from existing
 * - For root AGENTS.md: creates if missing, never modifies existing
 */
function writeGeneratedFile(
  projectDir: string,
  filename: string,
  content: string,
  rootContent: string,
): { codepaktPath: string; rootCreated: boolean; rootExists: boolean; rootUpdated: boolean } {
  const codepaktDir = join(projectDir, PROJECT_CONFIG_DIR);
  const codepaktPath = join(codepaktDir, filename);
  const rootPath = join(projectDir, filename);

  // Always write to .codepakt/
  writeFileSync(codepaktPath, content, "utf-8");

  // Handle root file
  const rootExists = existsSync(rootPath);
  let rootCreated = false;
  let rootUpdated = false;

  if (!rootExists) {
    writeFileSync(rootPath, rootContent, "utf-8");
    rootCreated = true;
  } else if (filename === "CLAUDE.md") {
    // For CLAUDE.md: prepend @import if not already present
    const existing = readFileSync(rootPath, "utf-8");
    const importLine = `@import .codepakt/CLAUDE.md`;
    if (!existing.includes(importLine)) {
      writeFileSync(rootPath, `${importLine}\n\n${existing}`, "utf-8");
      rootUpdated = true;
    }
  }

  return { codepaktPath, rootCreated, rootExists, rootUpdated };
}

/**
 * Update .codepakt/.gitignore to only ignore config and DB files,
 * not the generated .md files.
 */
function updateGitignore(projectDir: string): void {
  const gitignorePath = join(projectDir, PROJECT_CONFIG_DIR, ".gitignore");
  const desired = `config.json\n*.db\n*.db-wal\n*.db-shm\n`;

  // Read existing content to check if it needs updating
  if (existsSync(gitignorePath)) {
    const current = readFileSync(gitignorePath, "utf-8");
    if (current === desired) return;
  }

  writeFileSync(gitignorePath, desired, "utf-8");
}

/**
 * Core generate logic — shared between `cpk generate` and `cpk init`.
 */
export async function runGenerate(projectDir?: string): Promise<void> {
  const projectId = requireProjectId();
  const client = createClient();
  const dir = projectDir ?? process.cwd();

  const [projects, agents] = await Promise.all([
    client.listProjects(),
    client.listAgents(),
  ]);

  if (projects.length === 0) {
    console.error("No projects found. Run `cpk init` first.");
    process.exit(1);
  }

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  if (!project) {
    console.error("No projects found. Run `cpk init` first.");
    process.exit(1);
  }

  // Update .gitignore before writing files
  updateGitignore(dir);

  // Generate and write AGENTS.md
  const agentsContent = generateAgentsMd(project, agents);
  const agentsRootContent = `<!-- This project uses Codepakt for task coordination. -->\n<!-- See .codepakt/AGENTS.md for the agent protocol and roster. -->\n`;
  const agentsResult = writeGeneratedFile(dir, "AGENTS.md", agentsContent, agentsRootContent);

  console.log(`  .codepakt/AGENTS.md written`);
  if (agentsResult.rootCreated) {
    console.log(`  AGENTS.md created (references .codepakt/AGENTS.md)`);
  } else if (agentsResult.rootExists) {
    console.log(`  AGENTS.md exists — not modified (codepakt manages .codepakt/AGENTS.md)`);
  }

  // Generate and write CLAUDE.md
  const claudeContent = generateClaudeMd(project, agents);
  const claudeRootContent = `@import .codepakt/CLAUDE.md\n`;
  const claudeResult = writeGeneratedFile(dir, "CLAUDE.md", claudeContent, claudeRootContent);

  console.log(`  .codepakt/CLAUDE.md written`);
  if (claudeResult.rootCreated) {
    console.log(`  CLAUDE.md created (imports .codepakt/CLAUDE.md)`);
  } else if (claudeResult.rootUpdated) {
    console.log(`  CLAUDE.md updated — prepended @import .codepakt/CLAUDE.md`);
  } else if (claudeResult.rootExists) {
    console.log(`  CLAUDE.md already imports .codepakt/CLAUDE.md`);
  }
}

export const generateCommand = new Command("generate")
  .description("Generate .codepakt/AGENTS.md and .codepakt/CLAUDE.md from project state")
  .action(async () => {
    try {
      console.log("Generating coordination files...");
      await runGenerate();
    } catch (err) {
      handleError(err);
    }
  });
