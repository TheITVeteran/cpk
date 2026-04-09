/**
 * `cpk code` — query the code intelligence index.
 *
 * These commands read directly from the local .codepakt/data.db file.
 * No server daemon required — pure local SQLite reads.
 *
 * Subcommands:
 *   cpk code symbols [--name X] [--kind function] [--file src/] [--exported]
 *   cpk code imports --file src/foo.ts
 *   cpk code dependents --file src/foo.ts
 *   cpk code summary
 */
import { Command } from "commander";
import * as codeDb from "../../server/db/code-queries.js";
import { handleError, output, requireProjectId } from "../helpers.js";
import { openLocalProjectDb } from "../local-db.js";

export const codeCommand = new Command("code").description("Query the code intelligence index");

codeCommand
  .command("symbols")
  .description("Find symbols by name, kind, file, or export status")
  .option("-n, --name <name>", "Symbol name (LIKE match)")
  .option("-k, --kind <kind>", "Symbol kind: function, class, interface, type, method, variable")
  .option("-f, --file <path>", "File or directory prefix")
  .option("--exported", "Only exported symbols")
  .option("-l, --limit <n>", "Max results (default: 100, max: 500)")
  .option("--human", "Human-readable output")
  .action(
    async (opts: {
      name?: string;
      kind?: string;
      file?: string;
      exported?: boolean;
      limit?: string;
      human?: boolean;
    }) => {
      try {
        const projectId = requireProjectId();
        openLocalProjectDb(projectId);
        const results = codeDb.querySymbols(projectId, {
          name: opts.name,
          kind: opts.kind,
          file: opts.file,
          exported: opts.exported,
          limit: opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
        });
        output(results, opts.human);
      } catch (err) {
        handleError(err);
      }
    },
  );

codeCommand
  .command("imports")
  .description("Show what a file imports")
  .requiredOption("-f, --file <path>", "File path (relative to project root)")
  .option("--human", "Human-readable output")
  .action(async (opts: { file: string; human?: boolean }) => {
    try {
      const projectId = requireProjectId();
      openLocalProjectDb(projectId);
      const results = codeDb.queryImports(projectId, opts.file);
      output(results, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

codeCommand
  .command("dependents")
  .description("Show which files import a given file")
  .requiredOption("-f, --file <path>", "File path (relative to project root)")
  .option("--human", "Human-readable output")
  .action(async (opts: { file: string; human?: boolean }) => {
    try {
      const projectId = requireProjectId();
      openLocalProjectDb(projectId);
      const results = codeDb.queryDependents(projectId, opts.file);
      output(results, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

codeCommand
  .command("summary")
  .description("Project overview: files scanned, symbol counts, languages")
  .option("--human", "Human-readable output")
  .action(async (opts: { human?: boolean }) => {
    try {
      const projectId = requireProjectId();
      openLocalProjectDb(projectId);
      const summary = codeDb.getCodeSummary(projectId);
      output(summary, opts.human);
    } catch (err) {
      handleError(err);
    }
  });
