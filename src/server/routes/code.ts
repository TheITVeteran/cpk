/**
 * Code intelligence API routes.
 *
 * POST /scan — run a full or incremental scan
 * GET /code/symbols — query symbols
 * GET /code/imports — query what a file imports
 * GET /code/dependents — query who imports a file
 * GET /code/summary — project overview
 */
import { Hono } from "hono";
import { runIncrementalScan, runScan } from "../../scanner/index.js";
import * as codeDb from "../db/code-queries.js";
import { getProjectEntry } from "../db/project-index.js";
import { BadRequestError, NotFoundError } from "../middleware/error.js";

const code = new Hono();

code.post("/scan", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const entry = getProjectEntry(projectId);
  if (!entry) throw new NotFoundError("Project not found");

  const body = (await c.req.json().catch(() => ({}))) as {
    incremental?: boolean;
    files?: string[];
  };

  if (body.incremental && Array.isArray(body.files)) {
    const result = await runIncrementalScan(projectId, entry.path, body.files);
    return c.json({ data: result });
  }

  const result = await runScan(projectId, entry.path);
  return c.json({ data: result });
});

code.get("/code/symbols", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const name = c.req.query("name");
  const kind = c.req.query("kind");
  const file = c.req.query("file");
  const exportedRaw = c.req.query("exported");
  const limitRaw = c.req.query("limit");

  const filters: Parameters<typeof codeDb.querySymbols>[1] = {};
  if (name) filters.name = name;
  if (kind) filters.kind = kind;
  if (file) filters.file = file;
  if (exportedRaw !== undefined) filters.exported = exportedRaw === "true" || exportedRaw === "1";
  if (limitRaw) filters.limit = Number.parseInt(limitRaw, 10);

  const results = codeDb.querySymbols(projectId, filters);
  return c.json({ data: results });
});

code.get("/code/imports", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const file = c.req.query("file");
  if (!file) throw new BadRequestError("file query param required");

  const results = codeDb.queryImports(projectId, file);
  return c.json({ data: results });
});

code.get("/code/dependents", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const file = c.req.query("file");
  if (!file) throw new BadRequestError("file query param required");

  const results = codeDb.queryDependents(projectId, file);
  return c.json({ data: results });
});

code.get("/code/summary", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const summary = codeDb.getCodeSummary(projectId);
  return c.json({ data: summary });
});

export default code;
