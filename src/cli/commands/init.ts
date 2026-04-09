import { basename, resolve } from "node:path";
import { Command } from "commander";
import { saveConfig } from "../config.js";
import { createClient, handleError } from "../helpers.js";
import { runGenerate } from "./generate.js";

export const initCommand = new Command("init")
  .description("Initialize a Codepakt project in the current directory")
  .option("-n, --name <name>", "Project name (defaults to directory name)")
  .option("--prd <path>", "Path to PRD markdown file (stores in KB)")
  .action(async (opts: { name?: string; prd?: string }) => {
    try {
      const client = createClient();
      const name = opts.name ?? basename(process.cwd());
      const projectPath = resolve(process.cwd());

      // Create project with path → server creates .codepakt/data.db here
      const project = await client.createProject({ name, path: projectPath });
      console.log(`Project created: ${project.name} (${project.id})`);

      // Save config
      saveConfig({
        url: client.getBaseUrl(),
        project_id: project.id,
      });
      console.log(".codepakt/config.json created");

      // If PRD provided, store it in docs
      if (opts.prd) {
        const { readFileSync } = await import("node:fs");
        const prdContent = readFileSync(opts.prd, "utf-8");

        client.setProjectId(project.id);
        await client.createDoc({
          type: "reference",
          title: "PRD",
          body: prdContent,
          tags: ["prd", "requirements"],
          author: "human",
        });
        console.log(`PRD stored in knowledge base (${opts.prd})`);

        // Seed board setup guide
        await client.createDoc({
          type: "reference",
          title: "Board Setup Guide",
          body: BOARD_SETUP_GUIDE,
          tags: ["guide", "setup"],
          author: "system",
        });
        console.log("Board Setup Guide seeded");
      }

      // Generate .codepakt/AGENTS.md and .codepakt/CLAUDE.md
      console.log("");
      console.log("Generating coordination files...");
      await runGenerate(projectPath);

      console.log("");
      console.log("Next steps:");
      if (opts.prd) {
        console.log("  Ask your agent to set up the board:");
        console.log('    "Read the PRD with `cpk docs search prd` and decompose it');
        console.log('     into tasks using `cpk task add`. Follow the Board Setup Guide."');
      } else {
        console.log('  cpk task add --title "First task" --priority P0');
      }
    } catch (err) {
      handleError(err);
    }
  });

const BOARD_SETUP_GUIDE = `# Board Setup Guide

When asked to set up a task board from a PRD or project description:

1. Read the PRD: \`cpk docs search prd\`
2. Identify major feature areas (epics)
3. Decompose each area into atomic tasks (max 1 day of work each)
4. For each task, create it with:

   cpk task add \\
     --title "..." \\
     --description "..." \\
     --priority P0|P1|P2 \\
     --depends-on T-001,T-002 \\
     --verify "concrete command that proves completion" \\
     --acceptance-criteria "criterion 1" --acceptance-criteria "criterion 2"

5. Or use batch mode for efficiency:
   cpk task add --batch tasks.json

6. Verify the board: \`cpk board status\`

## Guidelines
- Tasks should be atomic: one concern, one agent, one session
- Every task needs a \`verify\` block: a runnable command proving completion
- Wire dependencies: T-003 shouldn't start before T-001 is done
- Include acceptance criteria: how to know the task is actually done
`;
