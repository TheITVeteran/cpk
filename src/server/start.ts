import { existsSync, mkdirSync } from "node:fs";
/**
 * Server entry point. Used by:
 * - `pnpm dev` (tsx watch)
 * - Daemon child process (forked by CLI)
 */
import { serve } from "@hono/node-server";
import { DEFAULT_DATA_DIR, DEFAULT_PORT, resolveDataDir } from "../shared/constants.js";
import { openDatabase, setProjectResolver } from "./db/index.js";
import { getProjectEntry } from "./db/project-index.js";
import { createApp } from "./index.js";

const port = Number(process.env["CPK_PORT"]) || DEFAULT_PORT;
const dataDir = resolveDataDir(process.env["CPK_DATA_DIR"] ?? DEFAULT_DATA_DIR);

// Ensure global config directory exists (for index.json, server.pid, server.log)
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// No global data.db — each project has its own at .codepakt/data.db
// Wire the project index resolver so getDb(projectId) auto-opens the right DB
setProjectResolver((projectId: string) => {
  const entry = getProjectEntry(projectId);
  if (entry) {
    return openDatabase(entry.db_path, projectId);
  }
  return undefined;
});

// Create and start the Hono app
const app = createApp();

console.log(`Codepakt server starting...`);
console.log(`  Port:     ${port}`);
console.log(`  Data dir: ${dataDir}`);
console.log(`  PID:      ${process.pid}`);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Codepakt server running at http://localhost:${info.port}`);
  },
);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  process.exit(0);
});
