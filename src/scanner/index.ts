/**
 * Scan orchestrator.
 *
 * Collects files, parses them with tree-sitter, extracts symbols/imports,
 * and stores results in the code intelligence tables.
 *
 * Two modes:
 * - Full scan: walks the whole project tree, replaces all data.
 * - Incremental: only re-scans specified files, replaces just their rows.
 */
import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize, posix, resolve, sep } from "node:path";
import {
  type ImportRecord,
  type SymbolRecord,
  replaceAllImports,
  replaceAllSymbols,
  replaceFileData,
} from "../server/db/code-queries.js";
import type { ScanResult } from "../shared/types.js";
import { collectFiles } from "./collector.js";
import { type ExtractedImport, type ExtractedSymbol, extract } from "./extractors/index.js";
import { SUPPORTED_EXTENSIONS, grammarForExtension, initParser, parseSource } from "./parser.js";

/**
 * Convert an extractor's symbol/import output + file path into DB records.
 */
function buildRecords(
  file: string,
  projectPath: string,
  extractedSymbols: ExtractedSymbol[],
  extractedImports: ExtractedImport[],
): { symbols: SymbolRecord[]; imports: ImportRecord[] } {
  const symbols: SymbolRecord[] = extractedSymbols.map((s) => ({
    name: s.name,
    kind: s.kind,
    file,
    line: s.line,
    exported: s.exported,
    parent: s.parent,
    signature: s.signature,
    metadata: s.metadata,
  }));

  const imports: ImportRecord[] = extractedImports.map((i) => ({
    importer: file,
    imported: resolveImportPath(file, i.source, projectPath),
    names: i.names,
  }));

  return { symbols, imports };
}

/**
 * Resolve a relative import to a project-relative file path.
 * For non-relative imports (e.g., "hono"), keep the bare module name.
 */
function resolveImportPath(importer: string, source: string, _projectPath: string): string {
  // Non-relative imports: return as-is (library, package, etc.)
  if (!source.startsWith(".") && !source.startsWith("/")) {
    return source;
  }

  // Relative: resolve against the importer's directory
  const importerDir = dirname(importer);
  const resolved = normalize(join(importerDir, source));

  // Normalize to forward slashes for consistency with stored file paths
  return resolved.split(sep).join(posix.sep);
}

/**
 * Determine the dominant language of a project from file counts.
 */
function detectLanguages(files: string[]): string[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const grammar = grammarForExtension(ext);
    if (grammar) {
      // Collapse tsx into typescript for language reporting
      const lang = grammar === "tsx" ? "typescript" : grammar;
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

/**
 * Full scan: walk the project, parse everything, replace all data.
 */
export async function runScan(projectId: string, projectPath: string): Promise<ScanResult> {
  const started = Date.now();
  await initParser();

  const absProjectPath = resolve(projectPath);
  const files = collectFiles(absProjectPath);

  const allSymbols: SymbolRecord[] = [];
  const allImports: ImportRecord[] = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const grammarName = grammarForExtension(ext);
    if (!grammarName) continue;

    let source: string;
    try {
      source = readFileSync(join(absProjectPath, file), "utf-8");
    } catch {
      continue; // Unreadable file, skip
    }

    const tree = await parseSource(source, ext);
    if (!tree) continue;

    try {
      const { symbols, imports } = extract(grammarName, tree);
      const recs = buildRecords(file, absProjectPath, symbols, imports);
      allSymbols.push(...recs.symbols);
      allImports.push(...recs.imports);
    } catch {
      // Extraction failure on a single file — skip and continue
    }
  }

  replaceAllSymbols(projectId, allSymbols);
  replaceAllImports(projectId, allImports);

  return {
    files_scanned: files.length,
    symbols: allSymbols.length,
    imports: allImports.length,
    duration_ms: Date.now() - started,
    languages: detectLanguages(files),
    incremental: false,
  };
}

/**
 * Incremental scan: re-scan only the given files (project-relative paths).
 * Files that no longer exist are removed from the index.
 */
export async function runIncrementalScan(
  projectId: string,
  projectPath: string,
  changedFiles: string[],
): Promise<ScanResult> {
  const started = Date.now();
  await initParser();

  const absProjectPath = resolve(projectPath);

  // Filter to only supported extensions
  const supportedFiles = changedFiles.filter((f) =>
    SUPPORTED_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  const allSymbols: SymbolRecord[] = [];
  const allImports: ImportRecord[] = [];
  const processedFiles: string[] = [];

  for (const file of supportedFiles) {
    const absFile = join(absProjectPath, file);
    const ext = extname(file).toLowerCase();
    const grammarName = grammarForExtension(ext);
    if (!grammarName) continue;

    processedFiles.push(file);

    let source: string;
    try {
      source = readFileSync(absFile, "utf-8");
    } catch {
      // File deleted — still include in processedFiles so its rows get purged
      continue;
    }

    const tree = await parseSource(source, ext);
    if (!tree) continue;

    try {
      const { symbols, imports } = extract(grammarName, tree);
      const recs = buildRecords(file, absProjectPath, symbols, imports);
      allSymbols.push(...recs.symbols);
      allImports.push(...recs.imports);
    } catch {
      // Extraction failure — skip
    }
  }

  replaceFileData(projectId, processedFiles, allSymbols, allImports);

  return {
    files_scanned: processedFiles.length,
    symbols: allSymbols.length,
    imports: allImports.length,
    duration_ms: Date.now() - started,
    languages: detectLanguages(processedFiles),
    incremental: true,
  };
}
