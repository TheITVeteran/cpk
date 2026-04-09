import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import {
  COORDINATION_VERSION_PREFIX,
  PROJECT_CONFIG_DIR,
  VERSION,
} from "../../shared/constants.js";
import { getProjectEntry } from "../db/project-index.js";
import * as db from "../db/queries.js";
import { BadRequestError } from "../middleware/error.js";

/**
 * Check if coordination files in the project are stale (version mismatch).
 */
function checkCoordinationVersion(projectId: string): {
  stale: boolean;
  file_version?: string;
  cli_version: string;
} {
  const entry = getProjectEntry(projectId);
  if (!entry) return { stale: false, cli_version: VERSION };

  const claudePath = join(entry.path, PROJECT_CONFIG_DIR, "CLAUDE.md");
  if (!existsSync(claudePath)) return { stale: true, cli_version: VERSION };

  try {
    const firstLine = readFileSync(claudePath, "utf-8").split("\n")[0] ?? "";
    if (!firstLine.startsWith(COORDINATION_VERSION_PREFIX))
      return { stale: true, cli_version: VERSION };

    const fileVersion = firstLine
      .replace(COORDINATION_VERSION_PREFIX, "")
      .replace("-->", "")
      .trim();
    return { stale: fileVersion !== VERSION, file_version: fileVersion, cli_version: VERSION };
  } catch {
    return { stale: false, cli_version: VERSION };
  }
}

const board = new Hono();

board.get("/board/status", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const status = db.getBoardStatus(projectId);
  const coordination = checkCoordinationVersion(projectId);

  return c.json({ data: { ...status, coordination } });
});

export default board;
