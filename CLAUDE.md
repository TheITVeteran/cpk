@import .codepakt/CLAUDE.md

# Codepakt — CLI Package

> `codepakt` — Single npm package: CLI + embedded Hono server + SQLite + web dashboard.

## What This Is

The core deliverable of Codepakt. Install it, run `cpk server start`, and you have a coordination server with bundled SQLite on port **41920**. No Docker, no Postgres, no external dependencies.

## Status — v0.2.0 (code intelligence)

**v0.1 (shipped):** daemon server, SQLite DB, task CRUD, atomic pickup, dependency resolution, CLI commands, web dashboard, coordination file generation.

**v0.2 (new):** Code intelligence via tree-sitter WASM. `cpk scan` parses the codebase and stores symbols/imports in SQLite. `cpk code symbols/imports/dependents/summary` query the index. `cpk scan --install-hook` installs a pre-commit hook for incremental updates. 32 tests passing (24 query + 8 parser).

## Architecture

```
Single npm package: codepakt
├── CLI commands     (cpk task pickup, cpk docs search, etc. — Commander.js)
├── Daemon server    (cpk server start — Hono on :41920, fork + detach)
├── Web dashboard    (vanilla JS, served from / on same Hono server)
├── SQLite           (better-sqlite3, ~/.codepakt/data.db)
└── API routes       (/api/*)
```

- **PID file:** `~/.codepakt/server.pid`
- **Database:** `~/.codepakt/data.db`
- **No ORM.** Direct better-sqlite3 with typed query functions.
- **macOS + Ubuntu only.** Windows is not supported.

## Dev Commands

```bash
pnpm dev              # Run server locally (tsx watch)
pnpm dev:cli          # Run CLI in dev mode
pnpm test             # Vitest
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
```

## Package Manager

pnpm (single package, not monorepo)

## Tech Stack

- **Runtime**: Node 20+
- **Server**: Hono (daemon, fork + detach, port 41920)
- **DB**: SQLite via better-sqlite3 (no ORM, typed query functions)
- **CLI**: Commander.js + tsx
- **Validation**: Zod (shared schemas between CLI and server)
- **Dashboard**: Vanilla JS + CSS custom properties (served from same Hono server at `/`)
- **Build**: tsup
- **Linting**: Biome
- **Testing**: Vitest

## Key Design Decisions

1. **Single npm package** — CLI + server + embedded SQLite all in `codepakt`. `npm i -g` and `cpk server start` — 30 seconds to running. No Docker required.
2. **SQLite only in v0.1** — SQLite with WAL mode + `BEGIN IMMEDIATE` transactions gives atomic task pickup for solo devs. Postgres comes in v0.2.
3. **No ORM** — Direct better-sqlite3 with typed query functions. Simpler, faster, no abstraction leaks.
4. **Daemon server** — `cpk server start` forks and detaches. PID tracked at `~/.codepakt/server.pid`. `cpk server stop` kills cleanly.
5. **CLI-first, not MCP** — MCP loads tool schemas into every agent context (5,000-21,000 tokens). CLI costs ~250 tokens per call. 10-15x cheaper.
6. **Dumb server, smart agents** — No LLM on the server. No Claude/OpenAI API key required. Agents do all planning and decomposition via CLI commands.
7. **Agent-powered board setup** — No server-side PRD decomposition. `cpk init --prd` stores the PRD in the KB. The agent reads it and creates tasks using `cpk task add`.
8. **Web dashboard** — Vanilla JS kanban board served from the same Hono server at `/`. API at `/api/*`. No separate frontend build/deploy.
9. **Verification blocks** — Every task has a `verify` field: a concrete command that proves completion.
10. **No auth in v0.1** — No API keys needed. Auth comes in v0.2 with Postgres.

## Project Structure

```
cli/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entry point
│   │   ├── config.ts             # .codepakt/config.json management
│   │   ├── helpers.ts            # CLI utilities
│   │   ├── api-client.ts         # HTTP client for server
│   │   └── commands/
│   │       ├── server.ts         # cpk server start/stop/status/logs
│   │       ├── init.ts           # cpk init [--prd]
│   │       ├── task.ts           # cpk task add/pickup/done/block/mine/list/show
│   │       ├── agent.ts          # cpk agent list
│   │       ├── board.ts          # cpk board status
│   │       ├── docs.ts           # cpk docs write/read/search/list
│   │       ├── generate.ts       # cpk generate (AGENTS.md + CLAUDE.md)
│   │       ├── agents-md.ts      # cpk agents-md generate (alias → generate)
│   │       ├── scan.ts           # cpk scan [--incremental|--install-hook|--remove-hook]
│   │       ├── code.ts           # cpk code symbols/imports/dependents/summary
│   │       └── config-cmd.ts     # cpk config set/show
│   ├── scanner/                  # v0.2 code intelligence
│   │   ├── parser.ts             # tree-sitter WASM init + parse
│   │   ├── collector.ts          # file discovery with .gitignore
│   │   ├── index.ts              # scan orchestrator (full + incremental)
│   │   ├── parser.test.ts
│   │   └── extractors/
│   │       ├── index.ts          # language dispatcher
│   │       ├── typescript.ts     # TS/JS symbol + import extraction
│   │       ├── python.ts         # (stub)
│   │       └── go.ts             # (stub)
│   ├── server/
│   │   ├── index.ts              # Hono app entry
│   │   ├── start.ts              # Server startup
│   │   ├── daemon.ts             # Fork + detach logic, PID management
│   │   ├── db/
│   │   │   ├── index.ts          # better-sqlite3 connection, schema v3
│   │   │   ├── queries.ts        # Typed query functions (no ORM)
│   │   │   ├── queries.test.ts   # DB query tests
│   │   │   └── code-queries.ts   # v0.2: symbols, imports, dependents queries
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   ├── projects.ts
│   │   │   ├── tasks.ts
│   │   │   ├── agents.ts
│   │   │   ├── docs.ts
│   │   │   ├── board.ts
│   │   │   ├── events.ts
│   │   │   ├── code.ts           # v0.2: /api/scan, /api/code/*
│   │   │   └── dashboard.ts      # Serves web UI at /
│   │   ├── services/
│   │   │   ├── tasks.ts
│   │   │   ├── agents.ts
│   │   │   └── docs.ts
│   │   └── middleware/
│   │       └── error.ts
│   ├── dashboard/
│   │   ├── design-system.ts      # Token definitions (dark + light)
│   │   └── theme.css             # CSS custom properties
│   └── shared/
│       ├── constants.ts          # Status values, priorities
│       ├── schemas.ts            # Zod schemas (task, agent, doc, etc.)
│       └── types.ts              # TypeScript types derived from schemas
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
└── CLAUDE.md                     # This file
```

## Database

SQLite at `~/.codepakt/data.db`. Tables: `projects`, `tasks`, `agents`, `events`, `docs`, `symbols`, `imports`.

Schema version: **3**. Migrations in `src/server/db/index.ts` `migrateSchema()`. v2→v3 is non-destructive (CREATE TABLE + CREATE INDEX only).

No ORM. Task/agent/doc queries in `src/server/db/queries.ts`. Code intelligence queries in `src/server/db/code-queries.ts` (kept separate to isolate concerns).

Atomic task pickup uses `BEGIN IMMEDIATE` transactions. Agent auto-upserted inside the transaction.

## Code Intelligence (v0.2)

`cpk scan` uses tree-sitter WASM to parse source files and populate `symbols` and `imports` tables.

- Parser: `web-tree-sitter@0.24.7`, marked external in tsup (loads WASM at runtime).
- Grammar WASM files: `grammars/tree-sitter-{typescript,tsx,javascript,python,go}.wasm` (~6MB total unpacked, ~750KB packed).
- Grammar runtime: the `tree-sitter.wasm` runtime ships in `node_modules/web-tree-sitter/`.
- Extractors: `src/scanner/extractors/` — TypeScript is full MVP, Python/Go are stubs.
- Full scan: `runScan()` walks the project, respects `.gitignore`/`.codepaktignore`, parses each supported file, replaces all data.
- Incremental scan: `runIncrementalScan()` takes a list of files (from `git diff --cached`) and replaces just their rows.
- Pre-commit hook: `cpk scan --install-hook` writes to `.git/hooks/pre-commit`. Hook runs `cpk scan --incremental` on every commit.

Query CLI:
- `cpk code symbols --name X --kind function --file src/auth/ --exported`
- `cpk code imports --file src/foo.ts`
- `cpk code dependents --file src/shared/types.ts`
- `cpk code summary`

## CLI Commands

```bash
cpk server start               # Start daemon (:41920, SQLite)
cpk server stop                # Stop daemon
cpk server status              # Check if running
cpk init                       # Empty project + config
cpk init --prd <path>          # Store PRD in KB
cpk task add --title "..."     # Create a task
cpk task add --batch file.json # Bulk create
cpk task mine                  # My open tasks (~120 tokens output)
cpk task pickup                # Atomic task claim
cpk task done <id> --notes "." # Complete with notes
cpk task block <id> --reason   # Mark blocked
cpk task list --epic "Auth"    # Filter by epic
cpk docs search "query"        # Search KB
cpk docs write --type decision # Write to KB
cpk agent list                 # List agents (auto-populated)
cpk generate                   # Generate .codepakt/AGENTS.md + .codepakt/CLAUDE.md
cpk agents-md generate         # Alias for cpk generate
cpk board status               # Board health
cpk server logs                # Last 50 lines of server log
cpk server logs -f             # Follow logs in real time
# v0.2 code intelligence
cpk scan                       # Full scan
cpk scan --incremental         # Only scan staged files (hook mode)
cpk scan --install-hook        # Install pre-commit git hook
cpk scan --remove-hook         # Remove pre-commit git hook
cpk code summary               # Project overview
cpk code symbols --name X      # Find symbol by name
cpk code imports --file X.ts   # What does this file import
cpk code dependents --file X.ts # Who imports this file
```

## Conventions

- Strict TypeScript (no `any`)
- Zod validation at API boundaries
- All mutations log to events table
- Tests for every query function
- Conventional commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`
- No AI/Claude signatures in commits or code
- Biome for linting and formatting

## What NOT to Do

- Don't put any LLM/AI on the server. The server is dumb. Agents are smart.
- Don't require Docker for default setup. SQLite is the default.
- Don't build MCP integration. The whole point is CLI-based, token-lean.
- Don't build web UI complexity beyond kanban. No analytics, no charts.
- Don't add auth in v0.1. No API keys needed yet.
- Don't use an ORM. Direct better-sqlite3 with typed query functions.
- Don't support Windows. macOS + Ubuntu only.
- Don't build server-side PRD decomposition. Agents do this via `cpk task add`.

## Phase Boundaries

| Phase | Scope |
|-------|-------|
| **v0.1** | SQLite + CLI + dashboard + npm publish (shipped) |
| **v0.2** | Code intelligence via tree-sitter WASM: scan, symbols/imports/dependents/summary queries, pre-commit hook, incremental updates |
| **v0.3+** | Postgres backend, richer schemas, auth, framework-specific detection (routes, models, components), blast-radius/call graph |
| **v1.0** | Cloud, teams, billing, embeddings |

Do not build v0.3+ features (Postgres, auth, framework detection) during v0.2.
