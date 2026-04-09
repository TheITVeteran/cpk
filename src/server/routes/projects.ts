import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Hono } from "hono";
import { DB_FILE, PROJECT_CONFIG_DIR } from "../../shared/constants.js";
import { ProjectCreateSchema } from "../../shared/schemas.js";
import { SCHEMA_VERSION, openDatabase } from "../db/index.js";
import {
  getProjectEntry,
  listProjectEntries,
  registerProject,
  touchProject,
} from "../db/project-index.js";
import { BadRequestError, NotFoundError } from "../middleware/error.js";

const projects = new Hono();

/**
 * Create a project.
 *
 * If body includes `path`, creates a project-local DB at <path>/.codepakt/data.db
 * and registers it in the global index.
 *
 * If no `path`, uses the default DB (backward compat for tests).
 */
projects.post("/projects", async (c) => {
  const body = await c.req.json();
  const input = ProjectCreateSchema.parse(body);
  const projectPath = input.path;

  if (!projectPath) {
    throw new BadRequestError("'path' is required. Pass the absolute project directory path.");
  }

  // Open project-specific DB (creates .codepakt/data.db with schema)
  const dbPath = join(projectPath, PROJECT_CONFIG_DIR, DB_FILE);
  openDatabase(dbPath);

  // Generate project ID
  const id = randomUUID();

  // Register in global index with schema version
  registerProject(id, input.name, projectPath, SCHEMA_VERSION);

  // Cache the DB connection keyed by project ID for subsequent requests
  openDatabase(dbPath, id);

  // Initialize task counter in metadata
  const projectDb = openDatabase(dbPath, id);
  projectDb
    .prepare("INSERT OR IGNORE INTO metadata (key, value) VALUES ('next_task_number', '1')")
    .run();

  return c.json(
    {
      data: {
        id,
        name: input.name,
        description: input.description ?? null,
      },
    },
    201,
  );
});

/**
 * List all projects from the global index.
 * Dashboard uses this for the project switcher.
 * Falls back to default DB if no index entries exist.
 */
projects.get("/projects", (c) => {
  const entries = listProjectEntries();
  return c.json({ data: entries });
});

/**
 * Get a specific project's details.
 */
projects.get("/projects/:id", (c) => {
  const id = c.req.param("id");

  const entry = getProjectEntry(id);
  if (!entry) throw new NotFoundError("Project not found");

  touchProject(id);
  return c.json({
    data: {
      id: entry.id,
      name: entry.name,
      path: entry.path,
      schema_version: entry.schema_version,
      last_accessed: entry.last_accessed,
      created_at: entry.created_at,
    },
  });
});

export default projects;
