// ---- Domain types (mirrors DB schema) ----

export type TaskStatus = "open" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TaskRecurrenceType = "none" | "daily" | "weekly" | "monthly" | "custom";
export type TaskCustomRecurrenceUnit = "day" | "week" | "month";
export type ProjectStatus = "active" | "paused" | "completed";
export type UserRole = "member" | "admin";
export type AIProvider = "openai" | "anthropic" | "google" | "ollama" | "lmstudio" | "custom";

export interface TaskCustomRecurrenceRule {
  interval: number;
  unit: TaskCustomRecurrenceUnit;
}

export interface TaskTemplatePreset {
  id: string;
  name: string;
  title: string;
  description: string;
  recurrenceType: TaskRecurrenceType;
  recurrenceRule: string | null;
}

export interface TextTemplatePreset {
  id: string;
  name: string;
  content: string;
}

export interface TemplatePresets {
  tasks: TaskTemplatePreset[];
  notes: TextTemplatePreset[];
  dispatches: TextTemplatePreset[];
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStats {
  total: number;
  open: number;
  inProgress: number;
  done: number;
}

export interface ProjectWithStats extends Project {
  stats: ProjectStats;
}

export interface Task {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  recurrenceType: TaskRecurrenceType;
  recurrenceRule: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dispatch {
  id: string;
  userId: string;
  date: string;
  summary: string | null;
  finalized: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CompleteResult {
  dispatch: Dispatch;
  rolledOver: number;
  nextDispatchId: string | null;
}

interface UnfinalizeResult {
  dispatch: Dispatch;
  hasNextDispatch: boolean;
  nextDispatchDate: string | null;
}

interface CalendarData {
  dates: Record<string, { finalized: boolean; taskCount: number }>;
}

export interface SearchResults {
  tasks: Task[];
  notes: Note[];
  dispatches: Dispatch[];
  projects: Project[];
}

export interface RecycleBinItem {
  id: string;
  type: "task" | "note" | "project";
  title: string;
  deletedAt: string;
  meta?: Record<string, unknown>;
}

interface RecycleBinResponse {
  items: RecycleBinItem[];
  retentionDays: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  key: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  frozenAt: string | null;
  hasPassword: boolean;
  providers: string[];
}

export interface AdminSecuritySettings {
  databaseEncryptionEnabled: boolean;
  shareAiApiKeyWithUsers: boolean;
  userRegistrationEnabled: boolean;
  sqlCipherAvailable: boolean;
  configured: boolean;
  updatedAt: string;
}

export type AdminVersionComparison = "up_to_date" | "behind" | "ahead" | "unknown";

export interface AdminVersionStatus {
  repositoryUrl: string;
  runningVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  latestReleaseUrl: string | null;
  publishedAt: string | null;
  checkedAt: string;
  comparison: AdminVersionComparison;
  source: "package_json_badge" | "package_json" | "unknown";
  error: string | null;
}

interface MePreferences {
  showAdminQuickAccess?: boolean;
  assistantEnabled?: boolean;
  timeZone?: string | null;
  templatePresets?: TemplatePresets;
}

export interface MePreferencesPayload {
  showAdminQuickAccess: boolean;
  assistantEnabled: boolean;
  timeZone: string | null;
  templatePresets: TemplatePresets;
}

export interface AIConfig {
  id: string;
  provider: AIProvider;
  providerLabel: string;
  model: string;
  baseUrl: string | null;
  isActive: boolean;
  hasApiKey: boolean;
  maskedApiKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIModelInfo {
  id: string;
  label: string;
}

interface AIConfigPayload {
  config: AIConfig | null;
  defaults?: { provider: AIProvider; model: string; baseUrl: string | null };
  readOnly?: boolean;
  readOnlyReason?: string | null;
}

export interface ChatConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: {
    content: string;
    role: "user" | "assistant" | "system";
    createdAt: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface ChatConversationDetail {
  conversation: ChatConversation;
  messages: ChatMessage[];
  uiMessages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    parts: Array<{ type: "text"; text: string }>;
  }>;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---- API error ----

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---- Fetch wrapper ----

export const TASKS_CHANGED_EVENT = "tasks:changed";

function emitTasksChanged(detail: { action: "create" | "update" | "delete"; taskId?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStartupError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500;
  }
  return error instanceof TypeError;
}

async function requestOnce<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError("Invalid JSON response", res.status);
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.error || res.statusText || "Request failed", res.status);
  }

  if (data === null) {
    throw new ApiError("Empty response", res.status);
  }

  return data as T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const canRetryForDevStartup = process.env.NODE_ENV === "development" && method === "GET";
  const maxAttempts = canRetryForDevStartup ? 6 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await requestOnce<T>(path, options);
    } catch (error) {
      const shouldRetry = canRetryForDevStartup && isRetryableStartupError(error) && attempt < maxAttempts;
      if (!shouldRetry) {
        throw error;
      }

      const delayMs = attempt * 350;
      await sleep(delayMs);
    }
  }

  throw new ApiError("Request failed", 500);
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string] => e[1] !== undefined,
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

// ---- Resource clients ----

export const api = {
  tasks: {
    list: (filters?: { status?: TaskStatus; priority?: TaskPriority; projectId?: string; page?: number; limit?: number }) =>
      request<Task[] | PaginatedResponse<Task>>(`/tasks${qs({
        status: filters?.status,
        priority: filters?.priority,
        projectId: filters?.projectId,
        page: filters?.page?.toString(),
        limit: filters?.limit?.toString(),
      })}`),

    get: (id: string) => request<Task>(`/tasks/${id}`),

    create: (data: {
      title: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: string;
      projectId?: string | null;
      recurrenceType?: TaskRecurrenceType;
      recurrenceRule?: TaskCustomRecurrenceRule | null;
    }) =>
      request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }).then((task) => {
        emitTasksChanged({ action: "create", taskId: task.id });
        return task;
      }),

    update: (
      id: string,
      data: {
        title?: string;
        description?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
        dueDate?: string | null;
        projectId?: string | null;
        recurrenceType?: TaskRecurrenceType;
        recurrenceRule?: TaskCustomRecurrenceRule | null;
      },
    ) =>
      request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }).then((task) => {
        emitTasksChanged({ action: "update", taskId: task.id });
        return task;
      }),

    delete: (id: string) =>
      request<{ deleted: true }>(`/tasks/${id}`, { method: "DELETE" }).then((result) => {
        emitTasksChanged({ action: "delete", taskId: id });
        return result;
      }),
  },

  projects: {
    list: (filters?: { status?: ProjectStatus; page?: number; limit?: number }) =>
      request<Project[] | PaginatedResponse<Project>>(`/projects${qs({
        status: filters?.status,
        page: filters?.page?.toString(),
        limit: filters?.limit?.toString(),
      })}`),

    listWithStats: (filters?: { status?: ProjectStatus; page?: number; limit?: number }) =>
      request<ProjectWithStats[] | PaginatedResponse<ProjectWithStats>>(`/projects${qs({
        status: filters?.status,
        page: filters?.page?.toString(),
        limit: filters?.limit?.toString(),
        include: "stats",
      })}`),

    get: (id: string) => request<Project>(`/projects/${id}`),

    create: (data: { name: string; description?: string; status?: ProjectStatus; color?: string }) =>
      request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),

    update: (id: string, data: { name?: string; description?: string; status?: ProjectStatus; color?: string }) =>
      request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<{ deleted: true }>(`/projects/${id}`, { method: "DELETE" }),

    getTasks: (id: string, params?: { page?: number; limit?: number }) =>
      request<Task[] | PaginatedResponse<Task>>(`/projects/${id}/tasks${qs({
        page: params?.page?.toString(),
        limit: params?.limit?.toString(),
      })}`),
  },

  notes: {
    list: (params?: { search?: string; page?: number; limit?: number }) =>
      request<Note[] | PaginatedResponse<Note>>(`/notes${qs({
        search: params?.search,
        page: params?.page?.toString(),
        limit: params?.limit?.toString(),
      })}`),

    get: (id: string) => request<Note>(`/notes/${id}`),

    create: (data: { title: string; content?: string }) =>
      request<Note>("/notes", { method: "POST", body: JSON.stringify(data) }),

    update: (id: string, data: { title?: string; content?: string }) =>
      request<Note>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<{ deleted: true }>(`/notes/${id}`, { method: "DELETE" }),
  },

  dispatches: {
    list: (params?: string | { date?: string; page?: number; limit?: number }) => {
      if (typeof params === "string") {
        return request<Dispatch[]>(`/dispatches${qs({ date: params })}`);
      }
      return request<Dispatch[] | PaginatedResponse<Dispatch>>(`/dispatches${qs({
        date: params?.date,
        page: params?.page?.toString(),
        limit: params?.limit?.toString(),
      })}`);
    },

    get: (id: string) => request<Dispatch>(`/dispatches/${id}`),

    create: (data: { date: string; summary?: string }) =>
      request<Dispatch>("/dispatches", { method: "POST", body: JSON.stringify(data) }),

    update: (id: string, data: { summary?: string }) =>
      request<Dispatch>(`/dispatches/${id}`, { method: "PUT", body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<{ deleted: true }>(`/dispatches/${id}`, { method: "DELETE" }),

    getTasks: (id: string) =>
      request<Task[]>(`/dispatches/${id}/tasks`),

    linkTask: (id: string, taskId: string) =>
      request<{ linked: true }>(`/dispatches/${id}/tasks`, {
        method: "POST",
        body: JSON.stringify({ taskId }),
      }),

    unlinkTask: (id: string, taskId: string) =>
      request<{ unlinked: true }>(`/dispatches/${id}/tasks`, {
        method: "DELETE",
        body: JSON.stringify({ taskId }),
      }),

    complete: (id: string) =>
      request<CompleteResult>(`/dispatches/${id}/complete`, { method: "POST", body: JSON.stringify({}) }),

    unfinalize: (id: string) =>
      request<UnfinalizeResult>(`/dispatches/${id}/unfinalize`, { method: "POST", body: JSON.stringify({}) }),

    calendar: (year: number, month: number) =>
      request<CalendarData>(`/dispatches/calendar${qs({ year: year.toString(), month: month.toString() })}`),
  },

  search: (q: string) =>
    request<SearchResults>(`/search${qs({ q })}`),

  recycleBin: {
    list: () => request<RecycleBinResponse>("/recycle-bin"),

    restore: (id: string, type: "task" | "note" | "project") =>
      request<{ restored: true }>("/recycle-bin", {
        method: "POST",
        body: JSON.stringify({ id, type, action: "restore" }),
      }),

    permanentDelete: (id: string, type: "task" | "note" | "project") =>
      request<{ permanentlyDeleted: true }>("/recycle-bin", {
        method: "POST",
        body: JSON.stringify({ id, type, action: "delete" }),
      }),
  },

  apiKeys: {
    list: () => request<ApiKey[]>("/api-keys"),

    create: (data: { name: string }) =>
      request<ApiKey>("/api-keys", { method: "POST", body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<{ success: true }>(`/api-keys/${id}`, { method: "DELETE" }),
  },

  admin: {
    listUsers: () => request<AdminUser[]>("/admin/users"),

    createUser: (data: { name?: string; email: string; password: string; role?: UserRole }) =>
      request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(data) }),

    updateUser: (
      id: string,
      data:
        | { action: "freeze" }
        | { action: "unfreeze" }
        | { action: "set_role"; role: UserRole }
        | { action: "reset_password"; password: string },
    ) => request<AdminUser>(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),

    deleteUser: (id: string) =>
      request<{ deleted: true }>(`/admin/users/${id}`, { method: "DELETE" }),

    getSecurity: () => request<AdminSecuritySettings>("/admin/security"),

    updateSecurity: (data: { enabled?: boolean; passphrase?: string; shareAiApiKeyWithUsers?: boolean; userRegistrationEnabled?: boolean }) =>
      request<AdminSecuritySettings>("/admin/security", {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    getVersionStatus: () =>
      request<AdminVersionStatus>("/admin/version"),
  },

  ai: {
    config: {
      get: () => request<AIConfigPayload>("/ai/config"),

      update: (data: {
        provider?: AIProvider;
        apiKey?: string | null;
        baseUrl?: string | null;
        model?: string;
        isActive?: boolean;
      }) =>
        request<{ config: AIConfig }>("/ai/config", {
          method: "PUT",
          body: JSON.stringify(data),
        }),

      test: () =>
        request<{ success: boolean; provider: AIProvider; providerLabel: string; model: string }>("/ai/config/test"),

      models: () =>
        request<{ provider: AIProvider; providerLabel: string; model: string; models: AIModelInfo[] }>("/ai/models"),
    },

    conversations: {
      list: () => request<ChatConversation[]>("/ai/conversations"),

      create: (data?: { title?: string }) =>
        request<ChatConversation>("/ai/conversations", {
          method: "POST",
          body: JSON.stringify(data ?? {}),
        }),

      get: (id: string) => request<ChatConversationDetail>(`/ai/conversations/${id}`),

      update: (id: string, data: { title: string }) =>
        request<ChatConversation>(`/ai/conversations/${id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),

      delete: (id: string) =>
        request<{ deleted: true }>(`/ai/conversations/${id}`, { method: "DELETE" }),
    },

    mcpHealth: () =>
      request<{ reachable: boolean; url: string; error?: string }>("/ai/mcp/health"),
  },

  me: {
    getPreferences: () =>
      request<MePreferencesPayload & { user: { id: string } }>("/me"),

    updatePreferences: (data: MePreferences) =>
      request<MePreferencesPayload>("/me", { method: "PUT", body: JSON.stringify(data) }),
  },
};
