import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COORDINATION_VERSION_PREFIX, PROJECT_CONFIG_DIR, VERSION } from "../../shared/constants.js";
import type { Agent } from "../../shared/types.js";
import { createClient, handleError, requireProjectId } from "../helpers.js";

const TEMPLATE_BASE_URL = "https://raw.githubusercontent.com/codepakt/cli/main/templates";

/**
 * Fetch a template from GitHub. Falls back to bundled template on failure.
 */
async function fetchTemplate(filename: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${TEMPLATE_BASE_URL}/${filename}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return await res.text();
    }
  } catch {
    // Network failure — fall back to bundled
  }

  // Bundled fallback: walk up from this file to find templates/
  const __filename = fileURLToPath(import.meta.url);
  let pkgRoot = dirname(__filename);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(pkgRoot, "package.json"))) break;
    pkgRoot = dirname(pkgRoot);
  }
  const bundledPath = join(pkgRoot, "templates", filename);
  if (existsSync(bundledPath)) {
    return readFileSync(bundledPath, "utf-8");
  }

  throw new Error(`Template not found: ${filename} (tried GitHub + bundled)`);
}

/**
 * Build the agents section for interpolation.
 */
function buildAgentsSection(agents: Agent[]): string {
  if (agents.length === 0) return "";
  const lines = ["## Active Agents"];
  for (const agent of agents) {
    const taskInfo = agent.current_task_id ? `working on ${agent.current_task_id}` : "idle";
    lines.push(`- **${agent.name}** (${taskInfo})`);
  }
  return lines.join("\n");
}

/**
 * Interpolate template placeholders with project data.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
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

  // Fetch templates (GitHub first, bundled fallback)
  const [agentsTmpl, claudeTmpl] = await Promise.all([
    fetchTemplate("AGENTS.md.tmpl"),
    fetchTemplate("CLAUDE.md.tmpl"),
  ]);

  const vars: Record<string, string> = {
    VERSION_STAMP: `${COORDINATION_VERSION_PREFIX} ${VERSION} -->`,
    PROJECT_NAME: project.name,
    AGENTS_SECTION: buildAgentsSection(agents),
  };

  // Update .gitignore before writing files
  updateGitignore(dir);

  // Generate and write AGENTS.md
  const agentsContent = interpolate(agentsTmpl, vars);
  const agentsRootContent = `<!-- This project uses Codepakt for task coordination. -->\n<!-- See .codepakt/AGENTS.md for the agent protocol and roster. -->\n`;
  const agentsResult = writeGeneratedFile(dir, "AGENTS.md", agentsContent, agentsRootContent);

  console.log(`  .codepakt/AGENTS.md written`);
  if (agentsResult.rootCreated) {
    console.log(`  AGENTS.md created (references .codepakt/AGENTS.md)`);
  } else if (agentsResult.rootExists) {
    console.log(`  AGENTS.md exists — not modified (codepakt manages .codepakt/AGENTS.md)`);
  }

  // Generate and write CLAUDE.md
  const claudeContent = interpolate(claudeTmpl, vars);
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
