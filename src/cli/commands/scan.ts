import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
/**
 * `cpk scan` — code intelligence scan command.
 *
 * Modes:
 *   cpk scan                      Full scan
 *   cpk scan --incremental        Only files changed in the staged index (git hook use)
 *   cpk scan --changed-only       Alias for --incremental
 *   cpk scan --install-hook       Install pre-commit git hook
 *   cpk scan --remove-hook        Remove pre-commit git hook
 */
import { Command } from "commander";
import { runIncrementalScan, runScan } from "../../scanner/index.js";
import { handleError, output, requireProjectId } from "../helpers.js";
import { openLocalProjectDb } from "../local-db.js";

const HOOK_MARKER_START = "# >>> codepakt hook begin >>>";
const HOOK_MARKER_END = "# <<< codepakt hook end <<<";
const HOOK_SNIPPET = `${HOOK_MARKER_START}
# codepakt: incremental code index update
if command -v cpk >/dev/null 2>&1; then
  cpk scan --incremental 2>/dev/null || true
fi
${HOOK_MARKER_END}`;

function findGitRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function getStagedFiles(): string[] {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

function installHook(): void {
  const gitRoot = findGitRoot(process.cwd());
  if (!gitRoot) {
    console.error("Not a git repository. Run `cpk scan --install-hook` inside a git repo.");
    process.exit(1);
  }

  const hooksDir = join(gitRoot, ".git", "hooks");
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

  const hookPath = join(hooksDir, "pre-commit");
  let content: string;

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (existing.includes(HOOK_MARKER_START)) {
      console.log("Hook already installed at .git/hooks/pre-commit");
      return;
    }
    // Append codepakt block to existing hook
    content = `${existing.trimEnd()}\n\n${HOOK_SNIPPET}\n`;
  } else {
    content = `#!/bin/sh\n${HOOK_SNIPPET}\n`;
  }

  writeFileSync(hookPath, content, "utf-8");
  chmodSync(hookPath, 0o755);
  console.log("Installed pre-commit hook at .git/hooks/pre-commit");
}

function removeHook(): void {
  const gitRoot = findGitRoot(process.cwd());
  if (!gitRoot) {
    console.error("Not a git repository.");
    process.exit(1);
  }

  const hookPath = join(gitRoot, ".git", "hooks", "pre-commit");
  if (!existsSync(hookPath)) {
    console.log("No pre-commit hook to remove.");
    return;
  }

  const existing = readFileSync(hookPath, "utf-8");
  if (!existing.includes(HOOK_MARKER_START)) {
    console.log("Pre-commit hook exists but contains no codepakt block. Not modifying.");
    return;
  }

  // Strip the codepakt block
  const before = existing.split(HOOK_MARKER_START)[0]?.trimEnd() ?? "";
  const after = existing.split(HOOK_MARKER_END)[1] ?? "";
  const cleaned = `${before}${after}`.trim();

  if (cleaned === "#!/bin/sh" || cleaned.length === 0) {
    // Nothing left but shebang — remove the whole file
    rmSync(hookPath);
    console.log("Removed pre-commit hook (only contained codepakt block).");
  } else {
    writeFileSync(hookPath, `${cleaned}\n`, "utf-8");
    console.log("Removed codepakt block from pre-commit hook.");
  }
}

export const scanCommand = new Command("scan")
  .description("Scan codebase and index symbols/imports for fast agent queries")
  .option("--incremental", "Only scan files changed in the git staged index")
  .option("--changed-only", "Alias for --incremental")
  .option("--install-hook", "Install a pre-commit git hook that runs incremental scans")
  .option("--remove-hook", "Remove the pre-commit git hook")
  .option("--human", "Human-readable output")
  .action(
    async (opts: {
      incremental?: boolean;
      changedOnly?: boolean;
      installHook?: boolean;
      removeHook?: boolean;
      human?: boolean;
    }) => {
      try {
        if (opts.installHook) {
          installHook();
          return;
        }
        if (opts.removeHook) {
          removeHook();
          return;
        }

        // Code intelligence works against the local SQLite file directly.
        // No running server required — scan is a standalone operation.
        const projectId = requireProjectId();
        const projectPath = openLocalProjectDb(projectId);

        const incremental = opts.incremental || opts.changedOnly;
        if (incremental) {
          const files = getStagedFiles();
          if (files.length === 0) {
            output(
              {
                files_scanned: 0,
                symbols: 0,
                imports: 0,
                duration_ms: 0,
                languages: [],
                incremental: true,
              },
              opts.human,
            );
            return;
          }
          const result = await runIncrementalScan(projectId, projectPath, files);
          output(result, opts.human);
        } else {
          const result = await runScan(projectId, projectPath);
          output(result, opts.human);
        }
      } catch (err) {
        handleError(err);
      }
    },
  );
