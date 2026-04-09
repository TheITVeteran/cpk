import { Command } from "commander";
import { isDaemonRunning, startDaemon, stopDaemon } from "../../server/daemon.js";
import { DEFAULT_PORT } from "../../shared/constants.js";
import { ApiClient } from "../api-client.js";
import { getDataDir } from "../config.js";

export const serverCommand = new Command("server").description("Manage the Codepakt server daemon");

serverCommand
  .command("start")
  .description("Start the Codepakt server daemon")
  .option("-p, --port <port>", "Port number", String(DEFAULT_PORT))
  .option("-d, --data <dir>", "Data directory")
  .action(async (opts: { port: string; data?: string }) => {
    const port = Number.parseInt(opts.port, 10);
    const dataDir = opts.data ?? getDataDir();

    const existing = isDaemonRunning();
    if (existing.running) {
      console.log(`Server already running on :${port} (PID: ${existing.pid})`);
      return;
    }

    console.log("Starting Codepakt server...");
    const pid = startDaemon({ port, dataDir });

    // Poll health endpoint until ready (up to 10s)
    const client = new ApiClient(`http://localhost:${port}`);
    let healthy = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const health = await client.health();
        console.log(`Server running on :${port} (PID: ${pid})`);
        console.log(`  Version:  ${health.version}`);
        healthy = true;
        break;
      } catch {
        // Not ready yet, retry
      }
    }
    if (!healthy) {
      console.log(`Server started (PID: ${pid}) but health check failed after 10s.`);
      console.log(`  Check logs: cpk server logs`);
    }
  });

serverCommand
  .command("stop")
  .description("Stop the Codepakt server daemon")
  .action(() => {
    const stopped = stopDaemon();
    if (stopped) {
      console.log("Server stopped.");
    } else {
      console.log("Server is not running.");
    }
  });

serverCommand
  .command("status")
  .description("Check Codepakt server status")
  .action(async () => {
    const { running, pid } = isDaemonRunning();
    if (!running) {
      console.log("Server is not running.");
      return;
    }

    const port = Number(process.env["CPK_PORT"]) || DEFAULT_PORT;
    try {
      const client = new ApiClient(`http://localhost:${port}`);
      const health = await client.health();
      console.log(`Server running on :${port} (PID: ${pid})`);
      console.log(`  Version: ${health.version}`);
      console.log(`  Uptime:  ${health.uptime_seconds}s`);
    } catch {
      console.log(`Server process running (PID: ${pid}) but not responding on :${port}.`);
    }
  });

serverCommand
  .command("logs")
  .description("Show server logs")
  .option("-f, --follow", "Follow log output")
  .option("-n, --lines <n>", "Number of lines to show", "50")
  .action(async (opts: { follow: boolean; lines: string }) => {
    const { execSync, spawn } = await import("node:child_process");
    const { join } = await import("node:path");
    const logPath = join(getDataDir(), "server.log");

    try {
      if (opts.follow) {
        const tail = spawn("tail", ["-f", logPath], { stdio: "inherit" });
        tail.on("error", () => console.error(`Log file not found: ${logPath}`));
      } else {
        const output = execSync(`tail -n ${opts.lines} "${logPath}"`, { encoding: "utf-8" });
        console.log(output);
      }
    } catch {
      console.error(`Log file not found: ${logPath}`);
    }
  });
