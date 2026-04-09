export const TASK_STATUSES = [
  "backlog",
  "open",
  "in-progress",
  "review",
  "blocked",
  "done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["P0", "P1", "P2"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DOC_TYPES = ["operational", "decision", "reference", "learning"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const SYMBOL_KINDS = [
  "function",
  "class",
  "interface",
  "type",
  "method",
  "variable",
] as const;

export const SUPPORTED_LANGUAGES = ["typescript", "javascript", "python", "go"] as const;

/**
 * Valid status transitions.
 * Permissive — the server is a dumb store, the human is the orchestrator.
 * Any status can move to any other status. The only constraint: you can't
 * transition to the same status you're already in.
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ["open", "in-progress", "review", "blocked", "done"],
  open: ["backlog", "in-progress", "review", "blocked", "done"],
  "in-progress": ["backlog", "open", "review", "blocked", "done"],
  review: ["backlog", "open", "in-progress", "blocked", "done"],
  blocked: ["backlog", "open", "in-progress", "review", "done"],
  done: ["backlog", "open", "in-progress", "review", "blocked"],
} as const;

export const DEFAULT_PORT = 41920;
export const DEFAULT_DATA_DIR = "~/.codepakt";
export const PID_FILE = "server.pid";
export const LOG_FILE = "server.log";
export const DB_FILE = "data.db";
export const CONFIG_FILE = "config.json";
export const PROJECT_CONFIG_DIR = ".codepakt";

export const API_PREFIX = "/api";
export const VERSION = "0.2.0";
export const COORDINATION_VERSION_PREFIX = "<!-- cpk_version:";

/**
 * Resolve ~ to actual home directory
 */
export function resolveDataDir(dir: string): string {
  if (dir.startsWith("~/")) {
    const home = process.env["HOME"];
    if (!home) throw new Error("HOME environment variable not set");
    return dir.replace("~", home);
  }
  return dir;
}
