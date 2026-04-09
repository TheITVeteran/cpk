#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "../shared/constants.js";
import { agentCommand } from "./commands/agent.js";
import { agentsMdCommand } from "./commands/agents-md.js";
import { boardCommand } from "./commands/board.js";
import { codeCommand } from "./commands/code.js";
import { configCommand } from "./commands/config-cmd.js";
import { docsCommand } from "./commands/docs.js";
import { generateCommand } from "./commands/generate.js";
import { initCommand } from "./commands/init.js";
import { scanCommand } from "./commands/scan.js";
import { serverCommand } from "./commands/server.js";
import { taskCommand } from "./commands/task.js";
import { warnIfStaleCoordinationFiles } from "./helpers.js";

// Check for stale coordination files before running any command
warnIfStaleCoordinationFiles();

const program = new Command();

program
  .name("cpk")
  .description("Codepakt — CLI-first coordination layer for AI coding agents")
  .version(VERSION);

program.addCommand(serverCommand);
program.addCommand(initCommand);
program.addCommand(taskCommand);
program.addCommand(boardCommand);
program.addCommand(configCommand);
program.addCommand(docsCommand);
program.addCommand(generateCommand);
program.addCommand(agentsMdCommand); // backward compat — delegates to generate
program.addCommand(agentCommand);
program.addCommand(scanCommand);
program.addCommand(codeCommand);

program.parse();
