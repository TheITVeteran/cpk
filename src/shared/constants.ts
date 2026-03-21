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

/**
 * Valid status transitions. Key = current status, value = allowed next statuses.
 * The server enforces these — invalid transitions are rejected with 400.
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ["open"],
  open: ["in-progress", "blocked"],
  "in-progress": ["done", "review", "blocked", "open"],
  review: ["done", "in-progress"],
  blocked: ["open"],
  done: [],
} as const;

export const DEFAULT_PORT = 41920;
export const DEFAULT_DATA_DIR = "~/.codepakt";
export const PID_FILE = "server.pid";
export const LOG_FILE = "server.log";
export const DB_FILE = "data.db";
export const CONFIG_FILE = "config.json";
export const PROJECT_CONFIG_DIR = ".codepakt";

export const API_PREFIX = "/api";

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
