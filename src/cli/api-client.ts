/**
 * HTTP client for talking to the Codepakt server.
 * All CLI commands use this to call the API.
 */
import type {
  Agent,
  BoardStatus,
  CodeImport,
  CodeSummary,
  CodeSymbol,
  Doc,
  DocCreateInput,
  Event,
  Project,
  ScanResult,
  SymbolQueryInput,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "../shared/types.js";

interface ApiErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private projectId?: string,
  ) {}

  private qs(): string {
    return this.projectId ? `project_id=${this.projectId}` : "";
  }

  private async request<T>(path: string, options?: RequestInit, timeoutMs = 10000): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      const body = (await res.json()) as { data?: T } & ApiErrorResponse;

      if (!res.ok) {
        throw new ApiClientError(
          res.status,
          body.error ?? "unknown",
          body.message ?? `HTTP ${res.status}`,
          body.details,
        );
      }

      return body.data as T;
    } catch (err) {
      if (err instanceof ApiClientError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new ApiClientError(0, "timeout", `Request timed out after ${timeoutMs / 1000}s`);
      }
      throw new ApiClientError(
        0,
        "connection_error",
        `Cannot connect to server at ${this.baseUrl}. Is it running? Try: cpk server start`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setProjectId(id: string): void {
    this.projectId = id;
  }

  // --- Health ---

  async health(): Promise<{ status: string; version: string; uptime_seconds: number }> {
    // Health endpoint returns plain object (no { data: ... } wrapper)
    const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new ApiClientError(res.status, "health_check_failed", `HTTP ${res.status}`);
    return res.json() as Promise<{ status: string; version: string; uptime_seconds: number }>;
  }

  // --- Projects ---

  async createProject(input: {
    name: string;
    description?: string;
    path?: string;
  }): Promise<Project> {
    return this.request("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listProjects(): Promise<Project[]> {
    return this.request("/api/projects");
  }

  async getProject(id: string): Promise<Project> {
    return this.request(`/api/projects/${id}`);
  }

  // --- Tasks ---

  async createTask(input: TaskCreateInput): Promise<Task> {
    return this.request(`/api/tasks?${this.qs()}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async createTasksBatch(inputs: TaskCreateInput[]): Promise<Task[]> {
    return this.request(`/api/tasks?${this.qs()}`, {
      method: "POST",
      body: JSON.stringify(inputs),
    });
  }

  async listTasks(filters?: {
    status?: string;
    assignee?: string;
    epic?: string;
    limit?: number;
  }): Promise<Task[]> {
    const params = new URLSearchParams(this.qs());
    if (filters?.status) params.set("status", filters.status);
    if (filters?.assignee) params.set("assignee", filters.assignee);
    if (filters?.epic) params.set("epic", filters.epic);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/tasks?${params.toString()}`);
  }

  async getTask(id: string): Promise<Task> {
    return this.request(`/api/tasks/${id}?${this.qs()}`);
  }

  async getMyTasks(agentName: string): Promise<Task[]> {
    return this.request(`/api/tasks/mine?${this.qs()}&agent=${encodeURIComponent(agentName)}`);
  }

  async pickupTask(agentName: string, taskId?: string): Promise<Task> {
    const params = new URLSearchParams(this.qs());
    if (taskId) params.set("task_id", taskId);
    return this.request(`/api/tasks/pickup?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ agent: agentName }),
    });
  }

  async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
    return this.request(`/api/tasks/${id}?${this.qs()}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async completeTask(id: string, agentName: string, notes?: string): Promise<Task> {
    return this.request(
      `/api/tasks/${id}/done?${this.qs()}&agent=${encodeURIComponent(agentName)}`,
      {
        method: "POST",
        body: JSON.stringify({ notes }),
      },
    );
  }

  async blockTask(id: string, reason: string, agentName?: string): Promise<Task> {
    const params = new URLSearchParams(this.qs());
    if (agentName) params.set("agent", agentName);
    return this.request(`/api/tasks/${id}/block?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async unblockTask(id: string): Promise<Task> {
    return this.request(`/api/tasks/${id}/unblock?${this.qs()}`, { method: "POST" });
  }

  // --- Board ---

  async getBoardStatus(): Promise<BoardStatus> {
    return this.request(`/api/board/status?${this.qs()}`);
  }

  // --- Agents ---

  async listAgents(): Promise<Agent[]> {
    return this.request(`/api/agents?${this.qs()}`);
  }

  // --- Events ---

  async listEvents(filters?: {
    task_id?: string;
    agent?: string;
    limit?: number;
  }): Promise<Event[]> {
    const params = new URLSearchParams(this.qs());
    if (filters?.task_id) params.set("task_id", filters.task_id);
    if (filters?.agent) params.set("agent", filters.agent);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/events?${params.toString()}`);
  }

  // --- Docs ---

  async createDoc(input: DocCreateInput): Promise<Doc> {
    return this.request(`/api/docs?${this.qs()}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async searchDocs(query: string, filters?: { type?: string; limit?: number }): Promise<Doc[]> {
    const params = new URLSearchParams(this.qs());
    params.set("q", query);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/docs/search?${params.toString()}`);
  }

  async listDocs(filters?: { type?: string }): Promise<Doc[]> {
    const params = new URLSearchParams(this.qs());
    if (filters?.type) params.set("type", filters.type);
    return this.request(`/api/docs?${params.toString()}`);
  }

  async getDoc(id: string): Promise<Doc> {
    return this.request(`/api/docs/${id}?${this.qs()}`);
  }

  // --- Code intelligence (v0.2) ---

  async scan(opts?: { incremental?: boolean; files?: string[] }): Promise<ScanResult> {
    // Scan can take 30-60s for large codebases; use a longer timeout.
    return this.request(
      `/api/scan?${this.qs()}`,
      {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      },
      120000,
    );
  }

  async querySymbols(filters: SymbolQueryInput & { limit?: number } = {}): Promise<CodeSymbol[]> {
    const params = new URLSearchParams(this.qs());
    if (filters.name) params.set("name", filters.name);
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.file) params.set("file", filters.file);
    if (filters.exported !== undefined) params.set("exported", String(filters.exported));
    if (filters.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/code/symbols?${params.toString()}`);
  }

  async queryCodeImports(file: string): Promise<CodeImport[]> {
    const params = new URLSearchParams(this.qs());
    params.set("file", file);
    return this.request(`/api/code/imports?${params.toString()}`);
  }

  async queryDependents(file: string): Promise<CodeImport[]> {
    const params = new URLSearchParams(this.qs());
    params.set("file", file);
    return this.request(`/api/code/dependents?${params.toString()}`);
  }

  async getCodeSummary(): Promise<CodeSummary> {
    return this.request(`/api/code/summary?${this.qs()}`);
  }
}
