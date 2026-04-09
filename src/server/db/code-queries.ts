/**
 * Code intelligence queries (v0.2).
 *
 * Kept separate from queries.ts to keep concerns isolated.
 * All functions take projectId as first arg, follow the pattern
 * of getDb(projectId) -> prepare(sql) -> run/all/get.
 */
import { randomUUID } from "node:crypto";
import type {
  CodeImport,
  CodeSummary,
  CodeSymbol,
  SymbolKind,
  SymbolQueryInput,
} from "../../shared/types.js";
import { getDb } from "./index.js";

// --- Row mappers ---

function parseJsonArray(val: unknown): string[] {
  if (typeof val !== "string") return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(val: unknown): Record<string, unknown> {
  if (typeof val !== "string") return {};
  try {
    const parsed = JSON.parse(val);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapSymbol(row: Record<string, unknown>): CodeSymbol {
  return {
    id: row["id"] as string,
    project_id: row["project_id"] as string,
    name: row["name"] as string,
    kind: row["kind"] as SymbolKind,
    file: row["file"] as string,
    line: row["line"] as number,
    exported: Number(row["exported"]) === 1,
    parent: (row["parent"] as string | null) ?? null,
    signature: (row["signature"] as string | null) ?? null,
    metadata: parseJsonObject(row["metadata"]),
    scanned_at: row["scanned_at"] as string,
  };
}

function mapImport(row: Record<string, unknown>): CodeImport {
  return {
    id: row["id"] as string,
    project_id: row["project_id"] as string,
    importer: row["importer"] as string,
    imported: row["imported"] as string,
    names: parseJsonArray(row["names"]),
    scanned_at: row["scanned_at"] as string,
  };
}

// --- Inserts / deletes ---

export interface SymbolRecord {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  exported: boolean;
  parent: string | null;
  signature: string | null;
  metadata: Record<string, unknown>;
}

export interface ImportRecord {
  importer: string;
  imported: string;
  names: string[];
}

/**
 * Replace all symbols for a project (full rescan).
 */
export function replaceAllSymbols(projectId: string, records: SymbolRecord[]): void {
  const db = getDb(projectId);
  const insert = db.prepare(
    `INSERT INTO symbols (id, project_id, name, kind, file, line, exported, parent, signature, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const txn = db.transaction((recs: SymbolRecord[]) => {
    db.prepare("DELETE FROM symbols WHERE project_id = ?").run(projectId);
    for (const r of recs) {
      insert.run(
        randomUUID(),
        projectId,
        r.name,
        r.kind,
        r.file,
        r.line,
        r.exported ? 1 : 0,
        r.parent,
        r.signature,
        JSON.stringify(r.metadata ?? {}),
      );
    }
  });

  txn(records);
}

/**
 * Replace all imports for a project (full rescan).
 */
export function replaceAllImports(projectId: string, records: ImportRecord[]): void {
  const db = getDb(projectId);
  const insert = db.prepare(
    `INSERT INTO imports (id, project_id, importer, imported, names)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const txn = db.transaction((recs: ImportRecord[]) => {
    db.prepare("DELETE FROM imports WHERE project_id = ?").run(projectId);
    for (const r of recs) {
      insert.run(randomUUID(), projectId, r.importer, r.imported, JSON.stringify(r.names ?? []));
    }
  });

  txn(records);
}

/**
 * Replace symbols and imports for a specific set of files (incremental rescan).
 * Removes existing rows for those files, then inserts the new ones.
 */
export function replaceFileData(
  projectId: string,
  files: string[],
  symbols: SymbolRecord[],
  imports: ImportRecord[],
): void {
  if (files.length === 0) return;
  const db = getDb(projectId);

  const symInsert = db.prepare(
    `INSERT INTO symbols (id, project_id, name, kind, file, line, exported, parent, signature, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const impInsert = db.prepare(
    `INSERT INTO imports (id, project_id, importer, imported, names)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const delSym = db.prepare("DELETE FROM symbols WHERE project_id = ? AND file = ?");
  const delImp = db.prepare("DELETE FROM imports WHERE project_id = ? AND importer = ?");

  const txn = db.transaction(() => {
    for (const file of files) {
      delSym.run(projectId, file);
      delImp.run(projectId, file);
    }
    for (const r of symbols) {
      symInsert.run(
        randomUUID(),
        projectId,
        r.name,
        r.kind,
        r.file,
        r.line,
        r.exported ? 1 : 0,
        r.parent,
        r.signature,
        JSON.stringify(r.metadata ?? {}),
      );
    }
    for (const r of imports) {
      impInsert.run(randomUUID(), projectId, r.importer, r.imported, JSON.stringify(r.names ?? []));
    }
  });

  txn();
}

export function clearCodeData(projectId: string): void {
  const db = getDb(projectId);
  db.transaction(() => {
    db.prepare("DELETE FROM symbols WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM imports WHERE project_id = ?").run(projectId);
  })();
}

// --- Queries ---

/**
 * Query symbols by name (LIKE), kind, file prefix, or exported flag.
 * Defaults: limit 100.
 */
export function querySymbols(
  projectId: string,
  filters: SymbolQueryInput & { limit?: number } = {},
): CodeSymbol[] {
  const db = getDb(projectId);
  const clauses: string[] = ["project_id = ?"];
  const params: unknown[] = [projectId];

  if (filters.name) {
    clauses.push("name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.kind) {
    clauses.push("kind = ?");
    params.push(filters.kind);
  }
  if (filters.file) {
    // Prefix match so `src/auth/` returns all files under that directory
    clauses.push("file LIKE ?");
    params.push(`${filters.file}%`);
  }
  if (filters.exported !== undefined) {
    clauses.push("exported = ?");
    params.push(filters.exported ? 1 : 0);
  }

  const limit = Math.min(filters.limit ?? 100, 500);
  const sql = `SELECT * FROM symbols WHERE ${clauses.join(" AND ")} ORDER BY file, line LIMIT ${limit}`;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapSymbol);
}

/**
 * Query imports for a specific file (what does this file import).
 */
export function queryImports(projectId: string, file: string): CodeImport[] {
  const db = getDb(projectId);
  const rows = db
    .prepare("SELECT * FROM imports WHERE project_id = ? AND importer = ? ORDER BY imported")
    .all(projectId, file) as Record<string, unknown>[];
  return rows.map(mapImport);
}

/**
 * Query dependents for a specific file (who imports this file).
 * Uses LIKE to match both `./foo` and `./foo.js` style import paths.
 */
export function queryDependents(projectId: string, file: string): CodeImport[] {
  const db = getDb(projectId);
  // Strip leading ./ and .js/.ts extensions for matching
  const basename = file.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  const rows = db
    .prepare(
      `SELECT * FROM imports
       WHERE project_id = ?
         AND (imported = ? OR imported LIKE ? OR imported LIKE ?)
       ORDER BY importer`,
    )
    .all(projectId, file, `%${basename}`, `%${basename}.%`) as Record<string, unknown>[];
  return rows.map(mapImport);
}

/**
 * Aggregate stats about the scanned codebase.
 */
export function getCodeSummary(projectId: string): CodeSummary {
  const db = getDb(projectId);

  const filesRow = db
    .prepare("SELECT COUNT(DISTINCT file) as count FROM symbols WHERE project_id = ?")
    .get(projectId) as { count: number } | undefined;

  const symbolsRow = db
    .prepare("SELECT COUNT(*) as count FROM symbols WHERE project_id = ?")
    .get(projectId) as { count: number } | undefined;

  const importsRow = db
    .prepare("SELECT COUNT(*) as count FROM imports WHERE project_id = ?")
    .get(projectId) as { count: number } | undefined;

  const byKindRows = db
    .prepare("SELECT kind, COUNT(*) as count FROM symbols WHERE project_id = ? GROUP BY kind")
    .all(projectId) as { kind: string; count: number }[];

  const byLangRows = db
    .prepare(
      `SELECT
         CASE
           WHEN file LIKE '%.ts' OR file LIKE '%.tsx' THEN 'typescript'
           WHEN file LIKE '%.js' OR file LIKE '%.jsx' OR file LIKE '%.mjs' OR file LIKE '%.cjs' THEN 'javascript'
           WHEN file LIKE '%.py' THEN 'python'
           WHEN file LIKE '%.go' THEN 'go'
           ELSE 'other'
         END as lang,
         COUNT(DISTINCT file) as count
       FROM symbols
       WHERE project_id = ?
       GROUP BY lang`,
    )
    .all(projectId) as { lang: string; count: number }[];

  const lastScanRow = db
    .prepare("SELECT MAX(scanned_at) as last FROM symbols WHERE project_id = ?")
    .get(projectId) as { last: string | null } | undefined;

  const by_kind: Record<string, number> = {};
  for (const r of byKindRows) by_kind[r.kind] = r.count;

  const by_language: Record<string, number> = {};
  for (const r of byLangRows) by_language[r.lang] = r.count;

  return {
    files_scanned: filesRow?.count ?? 0,
    symbols_count: symbolsRow?.count ?? 0,
    imports_count: importsRow?.count ?? 0,
    by_kind,
    by_language,
    last_scan: lastScanRow?.last ?? null,
  };
}
