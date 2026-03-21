# codepakt

CLI-first coordination layer for autonomous AI coding agents.

Two interfaces to the same backend:
- **CLI** (`cpk`) — for AI agents (~250 tokens per interaction)
- **Web dashboard** — for humans (kanban board at `http://localhost:41920`)

Dumb server, smart agents. No LLM on the server. Agents do all planning and decomposition. The server stores state and enforces concurrency.

![codepakt dashboard](dashboard.png)

## Install

```bash
npm i -g codepakt
```

Requires Node 20+. macOS and Linux only.

## Quick Start

```bash
# Start the server (daemon, port 41920)
cpk server start

# Initialize a project in the current directory
cpk init --name my-project

# Or initialize from a PRD (stores it in the knowledge base)
cpk init --name my-project --prd ./PRD.md

# Add tasks
cpk task add --title "Set up auth" --epic "Auth" --priority P0

# Agent picks up work (atomic, no registration needed)
cpk task pickup --agent backend

# Mark done (moves to review — human approves from dashboard)
cpk task done T-001 --agent backend --notes "Implemented JWT auth"

# Open the dashboard
open http://localhost:41920
```

## CLI Commands

### Server
```bash
cpk server start             # Start daemon (port 41920)
cpk server start --port 8080 # Custom port
cpk server stop              # Stop daemon
cpk server status            # Check if running
cpk server logs              # Last 50 lines of server log
cpk server logs -f           # Follow logs in real time
cpk server logs -n 200       # Last 200 lines
```

### Init
```bash
cpk init                          # Initialize project (uses directory name)
cpk init --name my-app            # Initialize with custom name
cpk init --name my-app --prd PRD.md  # Initialize + store PRD in knowledge base
```

### Tasks
```bash
cpk task add --title "..." --priority P1       # Create task (P0, P1, P2)
cpk task add --title "..." --depends-on T-001  # With dependency
cpk task add --title "..." --verify "pnpm test" --epic "Auth"
cpk task add --batch tasks.json                # Bulk create from JSON

cpk task list                          # List all tasks
cpk task list --status open            # Filter by status
cpk task list --assignee backend       # Filter by agent
cpk task list --epic "Auth"            # Filter by epic

cpk task show T-001                    # Full task details
cpk task update T-001 --status open    # Update status (any → any)
cpk task update T-001 --priority P0    # Update priority
cpk task update T-001 --assignee claude  # Reassign

cpk task pickup --agent backend        # Claim highest-priority available task
cpk task pickup --agent backend --id T-003  # Claim specific task
cpk task mine --agent backend          # My in-progress + review tasks

cpk task done T-001 --agent backend --notes "..."  # Complete (in-progress → review)
cpk task block T-001 --agent backend --reason "..." # Mark blocked
cpk task unblock T-001                 # Unblock (blocked → open)
```

### Agents
```bash
cpk agent list             # List agents (auto-populated from interactions)
```

### Knowledge Base
```bash
cpk docs write --type learning --title "..." --body "..."  # Create doc (type required)
cpk docs write --type decision --title "..." --body "..." --tags "auth,jwt"
cpk docs search "query"            # Full-text search
cpk docs search "auth" --type reference  # Filter by type
cpk docs list                      # List all docs
cpk docs list --type decision      # Filter by type
cpk docs read <id>                 # Read full document
```

### Board & Generation
```bash
cpk board status           # Board health summary
cpk generate               # Generate .codepakt/AGENTS.md + .codepakt/CLAUDE.md
cpk agents-md generate     # Alias for cpk generate (backward compat)
```

### Config
```bash
cpk config show                            # Show current config
cpk config set url http://localhost:8080   # Point at different server
cpk config set project_id proj_abc123      # Switch project
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CPK_AGENT` | Agent name. Alternative to `--agent` flag. |
| `CPK_PORT` | Override default server port (41920). |

## Task Lifecycle

```
backlog → open → in-progress → review → done
                     │
                     ▼
                  blocked → open
```

- `cpk task done` moves `in-progress → review` (not straight to done)
- Dependencies resolve when a task reaches **review** — the pipeline keeps moving
- `review → done` is the human approval step (from dashboard or `cpk task update`)
- Status transitions are fully permissive via `cpk task update`

## Architecture

Single npm package. No Docker required.

```
codepakt
├── CLI        Commander.js, ~250 tokens per interaction
├── Server     Hono, daemon (fork + detach), port 41920
├── Dashboard  Vanilla JS kanban, served at / on same server
├── Database   SQLite via better-sqlite3, WAL mode
└── API        REST at /api/*
```

**Key design choices:**
- Atomic task pickup via `BEGIN IMMEDIATE` transactions — no race conditions
- No capability matching — capabilities are informational metadata, not enforced
- Per-project databases at `<project>/.codepakt/data.db` — portable, no shared state
- Global index at `~/.codepakt/index.json` for project discovery
- All mutations logged to events table

**File locations:**

| File | Purpose |
|------|---------|
| `~/.codepakt/index.json` | Global project index |
| `~/.codepakt/server.pid` | Daemon PID file |
| `~/.codepakt/server.log` | Server logs (`cpk server logs` to view) |
| `<project>/.codepakt/data.db` | Per-project SQLite database |
| `<project>/.codepakt/config.json` | Project CLI config (server URL, project ID) |
| `<project>/.codepakt/AGENTS.md` | Generated agent protocol + roster (committed to git) |
| `<project>/.codepakt/CLAUDE.md` | Generated Claude Code instructions (committed to git) |

## Dashboard

The web dashboard serves from the same Hono server at `http://localhost:41920`:
- Kanban board (backlog → open → in-progress → review → done)
- Blocked tasks section
- Collapsible agent sidebar (left side)
- Task detail panel with notes
- Drag-and-drop between columns
- Add task form
- Dark/light theme

## Development

```bash
pnpm install
pnpm dev          # Server with hot reload
pnpm dev:cli      # CLI in dev mode
pnpm test         # Run tests
pnpm typecheck    # Type check
pnpm lint         # Biome lint
pnpm build        # Build with tsup
```

## License

MIT
