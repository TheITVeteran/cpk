/**
 * Project Index — registry of all known Codepakt projects.
 *
 * Stored at ~/.codepakt/index.json. Maps project IDs to their DB file paths
 * and tracks schema versions for migration management.
 *
 * Hybrid model:
 *   ~/.codepakt/index.json        ← knows about all projects
 *   /path/to/project/.codepakt/data.db  ← each project's actual data
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DB_FILE,
  DEFAULT_DATA_DIR,
  PROJECT_CONFIG_DIR,
  resolveDataDir,
} from "../../shared/constants.js";

export interface ProjectIndexEntry {
  id: string;
  name: string;
  path: string; // absolute path to project root (where .codepakt/ lives)
  db_path: string; // absolute path to .codepakt/data.db
  schema_version: number;
  last_accessed: string; // ISO timestamp
  created_at: string;
}

export interface ProjectIndex {
  version: number; // index format version
  projects: ProjectIndexEntry[];
}

const INDEX_FILE = "index.json";
const INDEX_VERSION = 1;

function getIndexPath(): string {
  const dataDir = resolveDataDir(process.env["CPK_DATA_DIR"] ?? DEFAULT_DATA_DIR);
  return join(dataDir, INDEX_FILE);
}

function ensureGlobalDir(): string {
  const dataDir = resolveDataDir(process.env["CPK_DATA_DIR"] ?? DEFAULT_DATA_DIR);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

/**
 * Load the project index. Creates it if it doesn't exist.
 */
export function loadIndex(): ProjectIndex {
  const indexPath = getIndexPath();
  if (!existsSync(indexPath)) {
    return { version: INDEX_VERSION, projects: [] };
  }
  try {
    const raw = readFileSync(indexPath, "utf-8");
    return JSON.parse(raw) as ProjectIndex;
  } catch {
    return { version: INDEX_VERSION, projects: [] };
  }
}

/**
 * Save the project index.
 */
export function saveIndex(index: ProjectIndex): void {
  ensureGlobalDir();
  const indexPath = getIndexPath();
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
}

/**
 * Register a project in the index.
 * Called by `cpk init` when creating a new project.
 */
export function registerProject(
  id: string,
  name: string,
  projectDir: string,
  schemaVersion: number,
): ProjectIndexEntry {
  const index = loadIndex();

  const dbPath = join(projectDir, PROJECT_CONFIG_DIR, DB_FILE);
  const now = new Date().toISOString();

  // Check if already registered — by path (same directory = same project)
  const existingByPath = index.projects.find((p) => p.path === projectDir);
  if (existingByPath) {
    existingByPath.id = id;
    existingByPath.name = name;
    existingByPath.db_path = dbPath;
    existingByPath.schema_version = schemaVersion;
    existingByPath.last_accessed = now;
    saveIndex(index);
    return existingByPath;
  }

  // Also check by id (shouldn't happen, but defensive)
  const existingById = index.projects.find((p) => p.id === id);
  if (existingById) {
    existingById.name = name;
    existingById.path = projectDir;
    existingById.db_path = dbPath;
    existingById.schema_version = schemaVersion;
    existingById.last_accessed = now;
    saveIndex(index);
    return existingById;
  }

  const entry: ProjectIndexEntry = {
    id,
    name,
    path: projectDir,
    db_path: dbPath,
    schema_version: schemaVersion,
    last_accessed: now,
    created_at: now,
  };

  index.projects.push(entry);
  saveIndex(index);
  return entry;
}

/**
 * Update last_accessed timestamp for a project.
 */
export function touchProject(id: string): void {
  const index = loadIndex();
  const entry = index.projects.find((p) => p.id === id);
  if (entry) {
    entry.last_accessed = new Date().toISOString();
    saveIndex(index);
  }
}

/**
 * Update schema version for a project in the index.
 */
export function updateSchemaVersion(id: string, version: number): void {
  const index = loadIndex();
  const entry = index.projects.find((p) => p.id === id);
  if (entry) {
    entry.schema_version = version;
    saveIndex(index);
  }
}

/**
 * Remove a project from the index.
 */
export function unregisterProject(id: string): void {
  const index = loadIndex();
  index.projects = index.projects.filter((p) => p.id !== id);
  saveIndex(index);
}

/**
 * Get a project entry by ID.
 */
export function getProjectEntry(id: string): ProjectIndexEntry | undefined {
  const index = loadIndex();
  return index.projects.find((p) => p.id === id);
}

/**
 * Get all project entries, sorted by last accessed (most recent first).
 */
export function listProjectEntries(): ProjectIndexEntry[] {
  const index = loadIndex();
  return [...index.projects].sort(
    (a, b) => new Date(b.last_accessed).getTime() - new Date(a.last_accessed).getTime(),
  );
}

/**
 * Find project entry by directory path.
 */
export function getProjectByPath(projectDir: string): ProjectIndexEntry | undefined {
  const index = loadIndex();
  return index.projects.find((p) => p.path === projectDir);
}

/**
 * Get projects that need migration (schema_version < current).
 */
export function getProjectsNeedingMigration(currentVersion: number): ProjectIndexEntry[] {
  const index = loadIndex();
  return index.projects.filter((p) => p.schema_version < currentVersion);
}
