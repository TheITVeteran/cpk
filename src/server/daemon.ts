/**
 * Daemon management for the Codepakt server.
 * Unix-only (macOS + Ubuntu). Uses fork + detach with PID file.
 */
import { fork } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_PORT,
  LOG_FILE,
  PID_FILE,
  resolveDataDir,
} from "../shared/constants.js";

function getDataDir(): string {
  return resolveDataDir(process.env["CPK_DATA_DIR"] ?? DEFAULT_DATA_DIR);
}

function getPidPath(): string {
  return join(getDataDir(), PID_FILE);
}

/**
 * Check if a process with the given PID is actually running.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = just check existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Read PID from file. Returns undefined if file doesn't exist or PID is stale.
 */
export function readPid(): number | undefined {
  const pidPath = getPidPath();
  if (!existsSync(pidPath)) return undefined;

  const pid = Number.parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
  if (Number.isNaN(pid)) {
    // Corrupt PID file — clean up
    unlinkSync(pidPath);
    return undefined;
  }

  if (!isProcessRunning(pid)) {
    // Stale PID file (process crashed or was killed)
    unlinkSync(pidPath);
    return undefined;
  }

  return pid;
}

/**
 * Check if the daemon is currently running.
 */
export function isDaemonRunning(): { running: boolean; pid?: number } {
  const pid = readPid();
  return pid ? { running: true, pid } : { running: false };
}

/**
 * Start the daemon. Forks a detached child process.
 * Returns the PID on success.
 */
export function startDaemon(options?: { port?: number; dataDir?: string }): number {
  const existing = isDaemonRunning();
  if (existing.running) {
    return existing.pid!;
  }

  const dataDir = options?.dataDir ?? getDataDir();
  const port = options?.port ?? (Number(process.env["CPK_PORT"]) || DEFAULT_PORT);

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const logPath = join(dataDir, LOG_FILE);
  const pidPath = join(dataDir, PID_FILE);

  // Resolve the server start script
  // In prod (npm link / global install): dist/server/start.js
  // In dev (tsx): src/server/start.ts
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Walk up to find the package root (where dist/ and src/ live)
  // __dirname could be dist/cli/, dist/server/, src/server/, etc.
  let pkgRoot = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(pkgRoot, "package.json"))) break;
    pkgRoot = dirname(pkgRoot);
  }

  // Prefer built JS, fall back to TS source (dev mode)
  const startScriptDist = join(pkgRoot, "dist", "server", "start.js");
  const startScriptSrc = join(pkgRoot, "src", "server", "start.ts");

  const scriptPath = existsSync(startScriptDist) ? startScriptDist : startScriptSrc;

  // Open log file for stdout/stderr
  const logFd = openSync(logPath, "a");

  const child = fork(scriptPath, [], {
    detached: true,
    stdio: ["ignore", logFd, logFd, "ipc"],
    env: {
      ...process.env,
      CPK_PORT: String(port),
      CPK_DATA_DIR: dataDir,
    },
    execArgv: scriptPath.endsWith(".ts") ? ["--import", "tsx"] : [],
  });

  // Write PID file
  if (child.pid) {
    writeFileSync(pidPath, String(child.pid));
  }

  // Detach the child — parent can exit
  child.unref();
  child.disconnect();

  return child.pid!;
}

/**
 * Stop the daemon by sending SIGTERM.
 */
export function stopDaemon(): boolean {
  const pid = readPid();
  if (!pid) return false;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process already gone
  }

  // Clean up PID file
  const pidPath = getPidPath();
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }

  return true;
}
