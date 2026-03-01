import { icsExportAdapter } from "@/lib/exports/ics";
import type { ConnectorAdapter, CaldavConnectorSettings } from "@/lib/integrations/connectors/types";

function requireCollectionUrl(settings: CaldavConnectorSettings): string {
  const url = settings.collectionUrl.trim().replace(/\/+$/, "");
  if (!url) {
    throw new Error("CalDAV collection URL is required.");
  }
  return url;
}

function buildHeaders(auth: Record<string, string | null>): HeadersInit {
  if (auth.username && auth.password) {
    const token = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
      "Content-Type": "text/calendar; charset=utf-8",
    };
  }

  if (auth.token) {
    return {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "text/calendar; charset=utf-8",
    };
  }

  return {
    "Content-Type": "text/calendar; charset=utf-8",
  };
}

export const caldavConnectorAdapter: ConnectorAdapter = {
  provider: "caldav",
  label: "CalDAV",
  description:
    "Calendar-standard connector that pushes Dispatch tasks as VTODO resources to a configured CalDAV collection.",
  capabilityFlags: {
    pushTasks: true,
    pullTasks: false,
    biDirectional: false,
    pushProjects: false,
    webhooks: false,
    exportOnly: false,
    localOnly: false,
    requiresDesktopBridge: false,
  },
  defaults: (baseUrl) => ({
    collectionUrl: baseUrl ?? "",
    useEventFallback: true,
  }),
  validateConfig: ({ baseUrl, settings }) => {
    const resolved = settings as Partial<CaldavConnectorSettings> | undefined;
    const collectionUrl = (resolved?.collectionUrl ?? baseUrl ?? "").trim();
    if (!collectionUrl) {
      throw new Error("collectionUrl is required for the CalDAV connector.");
    }
    return {
      baseUrl: collectionUrl,
      settings: {
        collectionUrl,
        useEventFallback: resolved?.useEventFallback ?? true,
      },
    };
  },
  testConnection: async ({ settings, auth }) => {
    const config = settings as CaldavConnectorSettings;
    const response = await fetch(requireCollectionUrl(config), {
      method: "OPTIONS",
      headers: buildHeaders(auth),
    });

    if (!response.ok) {
      return { ok: false, message: `CalDAV endpoint responded with ${response.status}` };
    }

    return { ok: true, message: `Connected to ${config.collectionUrl}` };
  },
  pushTask: async ({ settings, auth, payload }) => {
    const config = settings as CaldavConnectorSettings;
    const content = icsExportAdapter.serialize({
      dataset: {
        tasks: [payload.task],
        projects: payload.project ? [payload.project] : [],
      },
      filters: {
        scope: payload.project ? "tasks_and_projects" : "tasks_only",
        includeCompleted: true,
        startDate: null,
        endDate: null,
      },
      generatedAt: new Date().toISOString(),
      timeZone: "UTC",
    });
    const fileName = `${payload.externalTaskId ?? payload.task.id}.ics`;
    const response = await fetch(`${requireCollectionUrl(config)}/${encodeURIComponent(fileName)}`, {
      method: "PUT",
      headers: buildHeaders(auth),
      body: content,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `CalDAV push failed with ${response.status}`);
    }

    return {
      externalTaskId: fileName,
      warning: payload.task.dueDate ? null : "Task had no due date and was exported with a VEVENT fallback.",
    };
  },
  deleteTask: async ({ settings, auth, payload }) => {
    if (!payload.externalTaskId) {
      return { warning: "No CalDAV resource existed yet." };
    }

    const config = settings as CaldavConnectorSettings;
    const response = await fetch(`${requireCollectionUrl(config)}/${encodeURIComponent(payload.externalTaskId)}`, {
      method: "DELETE",
      headers: buildHeaders(auth),
    });

    if (!response.ok && response.status !== 404) {
      const message = await response.text();
      throw new Error(message || `CalDAV delete failed with ${response.status}`);
    }

    return {};
  },
};
