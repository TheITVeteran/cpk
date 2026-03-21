# codepakt

CLI-first coordination layer for autonomous AI coding agents.

Two interfaces to the same backend:
- **CLI** (`cpk`) — for AI agents (~250 tokens per interaction)
- **Web dashboard** — for humans (kanban board at `http://localhost:41920`)

Dumb server, smart agents. No LLM on the server. Agents do all planning and decomposition. The server stores state and enforces concurrency.

## Install

```bash
npm i -g codepakt
```

Requires Node 20+. macOS and Linux only.

## Quick Start

```bash
# Start the server (daemon, port 41920)
cpk server start

# Create a project
cpk init --path ./my-project

# Or create from a PRD (agent reads it, creates tasks)
cpk init --path ./my-project --prd ./PRD.md

# Add tasks
cpk task add --title "Set up auth" --epic "Auth" --priority high

# Agent picks up work (atomic, no registration needed)
cpk task pickup --agent backend-dev

# Mark done
cpk task done <task-id> --agent backend-dev --notes "Implemented JWT auth"

# Open the dashboard
open http://localhost:41920
```

## CLI Commands

### Server
```bash
cpk server start         # Start daemon (port 41920)
cpk server stop          # Stop daemon
cpk server status        # Check if running
cpk server logs          # Last 50 lines of server log
cpk server logs -f       # Follow logs in real time
cpk server logs -n 200   # Last 200 lines
```

### Projects
```bash
cpk init --path <dir>              # Create project
cpk init --path <dir> --prd <file> # Create from PRD
```

### Tasks
```bash
cpk task add --title "..." [--epic "..." --priority high --capabilities "ts,api"]
cpk task add --batch tasks.json    # Bulk create
cpk task list [--epic "Auth"]      # List (with optional epic filter)
cpk task show <id>                 # Task details
cpk task pickup --agent <name>      # Atomic claim (no registration needed)
cpk task pickup --agent <n> --id T-001  # Claim specific task
cpk task done <id> --agent <name> --notes "..."  # Complete
cpk task block <id> --agent <name> --reason "..." # Mark blocked
cpk task unblock <id>              # Unblock
cpk task mine --agent <name>       # My assigned tasks
```

### Agents
```bash
cpk agent list             # List agents (auto-populated from interactions)
```

### Knowledge Base
```bash
cpk docs write --title "..." --content "..." [--type decision --section architecture]
cpk docs search "query"
cpk docs list
cpk docs read <id>
```

### Board & Generation
```bash
cpk board status       # Board health summary
cpk generate           # Generate .codepakt/AGENTS.md + .codepakt/CLAUDE.md
cpk agents-md generate # Alias for cpk generate (backward compat)
```

## Architecture

Single npm package. No Docker required for default setup.

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
- Capability matching happens inside the transaction
- Per-project databases at `.codepakt/data.db` — portable, no shared state
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
| `<project>/.codepakt/CLAUDE.md` | Generated Claude Code coordination instructions (committed to git) |

## Dashboard

The web dashboard serves from the same Hono server at `http://localhost:41920`:
- Kanban board (open → in-progress → review → done)
- Blocked tasks section
- Agent sidebar with status
- Task detail panel
- Create task modal
- Project switcher
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
