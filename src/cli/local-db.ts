/**
 * Direct local database access for CLI commands.
 *
 * Some commands (code queries, scan) operate purely on local data and don't
 * need the HTTP server to be running. This helper resolves the project's
 * DB path from the index and opens it directly via better-sqlite3.
 *
 * Used by: `cpk scan`, `cpk code *`
 */
import { existsSync } from "node:fs";
import { openDatabase } from "../server/db/index.js";
import { getProjectEntry } from "../server/db/project-index.js";

/**
 * Open the local SQLite database for a project by ID.
 * Throws if the project isn't in the index or the DB file doesn't exist.
 *
 * Returns the absolute path to the project root so callers (like scan)
 * can walk the file tree.
 */
export function openLocalProjectDb(projectId: string): string {
  const entry = getProjectEntry(projectId);
  if (!entry) {
    throw new Error(
      `Project ${projectId} not found in ~/.codepakt/index.json. Run \`cpk init\` to register it.`,
    );
  }

  if (!existsSync(entry.db_path)) {
    throw new Error(
      `Database not found at ${entry.db_path}. The project may have been moved or deleted.`,
    );
  }

  // openDatabase runs schema migrations automatically if needed.
  openDatabase(entry.db_path, projectId);
  return entry.path;
}
