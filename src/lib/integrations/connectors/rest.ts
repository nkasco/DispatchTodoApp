import type { ConnectorAdapter, RestConnectorSettings } from "@/lib/integrations/connectors/types";

function buildHeaders(auth: Record<string, string | null>, includeJson = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  return headers;
}

function normalizePath(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function requireUrl(baseUrl: string | null): string {
  if (!baseUrl?.trim()) {
    throw new Error("Base URL is required for the REST connector.");
  }
  return baseUrl.trim().replace(/\/+$/, "");
}

export const restConnectorAdapter: ConnectorAdapter = {
  provider: "rest",
  label: "REST/OAuth",
  description:
    "Generic token-authenticated REST connector for task systems that expose project and task endpoints.",
  capabilityFlags: {
    pushTasks: true,
    pullTasks: true,
    biDirectional: true,
    pushProjects: true,
    webhooks: true,
    exportOnly: false,
    localOnly: false,
    requiresDesktopBridge: false,
  },
  defaults: () => ({
    taskPath: "/tasks",
    projectPath: "/projects",
    healthPath: "/health",
  }),
  validateConfig: ({ baseUrl, settings }) => {
    const resolved = settings as Partial<RestConnectorSettings> | undefined;
    requireUrl(baseUrl);
    return {
      baseUrl,
      settings: {
        taskPath: normalizePath(resolved?.taskPath ?? "/tasks", "/tasks"),
        projectPath: normalizePath(resolved?.projectPath ?? "/projects", "/projects"),
        healthPath: normalizePath(resolved?.healthPath ?? "/health", "/health"),
      },
    };
  },
  testConnection: async ({ baseUrl, settings, auth }) => {
    const config = settings as RestConnectorSettings;
    const url = `${requireUrl(baseUrl)}${config.healthPath}`;
    const response = await fetch(url, {
      headers: buildHeaders(auth, false),
    });

    if (!response.ok) {
      return { ok: false, message: `Health check failed with ${response.status} ${response.statusText}` };
    }

    return { ok: true, message: `Connected to ${url}` };
  },
  pushTask: async ({ connection, settings, auth, payload }) => {
    const config = settings as RestConnectorSettings;
    const baseUrl = requireUrl(connection.baseUrl);
    const method = payload.externalTaskId ? "PUT" : "POST";
    const taskUrl = payload.externalTaskId
      ? `${baseUrl}${config.taskPath}/${encodeURIComponent(payload.externalTaskId)}`
      : `${baseUrl}${config.taskPath}`;

    const response = await fetch(taskUrl, {
      method,
      headers: buildHeaders(auth),
      body: JSON.stringify({
        externalId: payload.task.id,
        title: payload.task.title,
        description: payload.task.description,
        status: payload.task.status,
        priority: payload.task.priority,
        dueDate: payload.task.dueDate,
        completed: payload.task.status === "done",
        projectId: payload.externalProjectId ?? payload.project?.id ?? null,
        projectName: payload.project?.name ?? null,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `REST connector sync failed with ${response.status}`);
    }

    let externalTaskId = payload.externalTaskId ?? null;
    try {
      const data = await response.json() as { id?: string };
      if (typeof data.id === "string" && data.id.trim()) {
        externalTaskId = data.id.trim();
      }
    } catch {
      // Some endpoints may return 204 or plain text.
    }

    return {
      externalTaskId,
      externalProjectId: payload.externalProjectId ?? payload.project?.id ?? null,
    };
  },
  deleteTask: async ({ connection, settings, auth, payload }) => {
    if (!payload.externalTaskId) {
      return { warning: "No external task mapping existed yet." };
    }

    const config = settings as RestConnectorSettings;
    const response = await fetch(
      `${requireUrl(connection.baseUrl)}${config.taskPath}/${encodeURIComponent(payload.externalTaskId)}`,
      {
        method: "DELETE",
        headers: buildHeaders(auth, false),
      },
    );

    if (!response.ok && response.status !== 404) {
      const message = await response.text();
      throw new Error(message || `REST connector delete failed with ${response.status}`);
    }

    return {};
  },
  handleWebhook: async ({ payload }) => ({
    message: payload.externalTaskId
      ? `Webhook received for external task ${payload.externalTaskId}`
      : "Webhook received",
  }),
};
