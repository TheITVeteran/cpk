/**
 * CLI configuration management.
 * Manages per-project .codepakt/config.json and global settings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFIG_FILE,
  DEFAULT_DATA_DIR,
  DEFAULT_PORT,
  PROJECT_CONFIG_DIR,
  resolveDataDir,
} from "../shared/constants.js";
import type { ProjectConfig } from "../shared/types.js";

/**
 * Get the .codepakt directory path for a project.
 */
function getConfigDir(projectDir?: string): string {
  return join(projectDir ?? process.cwd(), PROJECT_CONFIG_DIR);
}

/**
 * Load project config from .codepakt/config.json in the current or specified directory.
 */
export function loadConfig(projectDir?: string): ProjectConfig | undefined {
  const configPath = join(getConfigDir(projectDir), CONFIG_FILE);
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return undefined;
  }
}

/**
 * Save project config to .codepakt/config.json.
 * Auto-creates .codepakt/ directory with .gitignore.
 */
export function saveConfig(config: ProjectConfig, projectDir?: string): void {
  const configDir = getConfigDir(projectDir);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Auto-create .gitignore — only ignore config and DB files, not generated .md docs
  const gitignorePath = join(configDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "config.json\n*.db\n*.db-wal\n*.db-shm\n");
  }

  const configPath = join(configDir, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Get server URL from config, env var, or default.
 */
export function getServerUrl(projectDir?: string): string {
  // Env var takes precedence
  if (process.env["CPK_URL"]) return process.env["CPK_URL"];

  // Then project config
  const config = loadConfig(projectDir);
  if (config?.url) return config.url;

  // Default to localhost
  const port = Number(process.env["CPK_PORT"]) || DEFAULT_PORT;
  return `http://localhost:${port}`;
}

/**
 * Get agent name from env var.
 */
export function getAgentName(): string | undefined {
  return process.env["CPK_AGENT"];
}

/**
 * Get project ID from config.
 */
export function getProjectId(projectDir?: string): string | undefined {
  const config = loadConfig(projectDir);
  return config?.project_id;
}

/**
 * Get the data directory (for server/DB).
 */
export function getDataDir(): string {
  return resolveDataDir(process.env["CPK_DATA_DIR"] ?? DEFAULT_DATA_DIR);
}
