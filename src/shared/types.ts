import type { z } from "zod";
import type { DocType, Priority, TaskStatus } from "./constants.js";
import type {
  DocCreateSchema,
  ProjectCreateSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
} from "./schemas.js";

// --- Inferred input types ---

export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type DocCreateInput = z.infer<typeof DocCreateSchema>;

// --- Domain types (what the DB returns) ---

export interface Project {
  id: string;
  name: string;
  description: string | null;
  next_task_number: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  task_number: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: string | null;
  priority: Priority;
  epic: string | null;
  capabilities: string[];
  depends_on: string[];
  deps_met: boolean;
  acceptance_criteria: string[];
  context_refs: string[];
  verify: string | null;
  notes: string[];
  blocker_reason: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Agent {
  id: string;
  project_id: string;
  name: string;
  status: string;
  current_task_id: string | null;
  last_seen: string;
}

export interface Event {
  id: string;
  project_id: string;
  task_id: string | null;
  agent: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface Doc {
  id: string;
  project_id: string;
  type: DocType;
  title: string;
  body: string;
  section: string | null;
  tags: string[];
  author: string | null;
  created_at: string;
  updated_at: string;
}

// --- API response types ---

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface BoardStatus {
  total: number;
  by_status: Record<TaskStatus, number>;
  blocked_tasks: Task[];
  agent_activity: Agent[];
}

// --- Code intelligence types (v0.2) ---

export type SymbolKind = "function" | "class" | "interface" | "type" | "method" | "variable";

export interface CodeSymbol {
  id: string;
  project_id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  exported: boolean;
  parent: string | null;
  signature: string | null;
  metadata: Record<string, unknown>;
  scanned_at: string;
}

export interface CodeImport {
  id: string;
  project_id: string;
  importer: string;
  imported: string;
  names: string[];
  scanned_at: string;
}

export interface ScanResult {
  files_scanned: number;
  symbols: number;
  imports: number;
  duration_ms: number;
  languages: string[];
  incremental: boolean;
}

export interface CodeSummary {
  files_scanned: number;
  symbols_count: number;
  imports_count: number;
  by_kind: Record<string, number>;
  by_language: Record<string, number>;
  last_scan: string | null;
}

export interface SymbolQueryInput {
  name?: string;
  kind?: string;
  file?: string;
  exported?: boolean;
}

// --- Config types ---

export interface ProjectConfig {
  url: string;
  project_id: string;
}
