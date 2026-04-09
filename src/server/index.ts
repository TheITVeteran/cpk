import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { API_PREFIX } from "../shared/constants.js";
import { handleError } from "./middleware/error.js";
import agents from "./routes/agents.js";
import board from "./routes/board.js";
import code from "./routes/code.js";
import dashboard from "./routes/dashboard.js";
import docs from "./routes/docs.js";
import events from "./routes/events.js";
import health from "./routes/health.js";
import projects from "./routes/projects.js";
import tasks from "./routes/tasks.js";

export function createApp(): Hono {
  const app = new Hono();

  // Global middleware
  app.use("*", cors());
  app.use("*", logger());

  // Error handler
  app.onError(handleError);

  // Health check (no prefix — accessible at /health)
  app.route("/", health);

  // API routes under /api prefix
  const api = new Hono();
  api.route("/", projects);
  api.route("/", tasks);
  api.route("/", agents);
  api.route("/", docs);
  api.route("/", board);
  api.route("/", events);
  api.route("/", code);

  app.route(API_PREFIX, api);

  // Dashboard at root
  app.route("/", dashboard);

  return app;
}
