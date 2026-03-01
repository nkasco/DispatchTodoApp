import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectorAdapter, LocalUriConnectorSettings } from "@/lib/integrations/connectors/types";

function applyTemplate(template: string, params: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => encodeURIComponent(params[key] ?? ""));
}

function resolveBridgeDirectory(settings: LocalUriConnectorSettings, connectionId: string): string {
  if (settings.bridgeDirectory?.trim()) {
    return settings.bridgeDirectory.trim();
  }
  return path.join(process.cwd(), ".dispatch-local-bridge", connectionId);
}

export const localUriConnectorAdapter: ConnectorAdapter = {
  provider: "local_uri",
  label: "Local Automation",
  description:
    "Desktop-focused connector that writes URI-scheme or JSON bridge commands for local automation tools without a public cloud API.",
  capabilityFlags: {
    pushTasks: true,
    pullTasks: false,
    biDirectional: false,
    pushProjects: false,
    webhooks: false,
    exportOnly: false,
    localOnly: true,
    requiresDesktopBridge: true,
  },
  defaults: () => ({
    createTemplate: "app:///add?title={{title}}&token={{token}}",
    updateTemplate: "app:///update?id={{externalId}}&title={{title}}&token={{token}}",
    deleteTemplate: "app:///delete?id={{externalId}}&token={{token}}",
    bridgeMode: true,
    bridgeDirectory: null,
  }),
  validateConfig: ({ settings }) => {
    const resolved = settings as Partial<LocalUriConnectorSettings> | undefined;
    const createTemplate = resolved?.createTemplate?.trim() ?? "";
    const updateTemplate = resolved?.updateTemplate?.trim() ?? "";
    const deleteTemplate = resolved?.deleteTemplate?.trim() ?? "";

    if (!createTemplate || !updateTemplate || !deleteTemplate) {
      throw new Error("All local automation URI templates are required.");
    }

    return {
      baseUrl: null,
      settings: {
        createTemplate,
        updateTemplate,
        deleteTemplate,
        bridgeMode: resolved?.bridgeMode ?? true,
        bridgeDirectory: resolved?.bridgeDirectory?.trim() || null,
      },
    };
  },
  testConnection: async ({ settings }) => {
    const config = settings as LocalUriConnectorSettings;
    if (!config.bridgeMode) {
      return { ok: true, message: "Manual URI mode enabled." };
    }

    const bridgeDirectory = resolveBridgeDirectory(config, "test");
    await mkdir(bridgeDirectory, { recursive: true });
    return { ok: true, message: `Bridge directory ready at ${bridgeDirectory}` };
  },
  pushTask: async ({ connection, settings, auth, payload }) => {
    const config = settings as LocalUriConnectorSettings;
    const externalId = payload.externalTaskId ?? payload.task.id;
    const template = payload.externalTaskId ? config.updateTemplate : config.createTemplate;
    const uri = applyTemplate(template, {
      title: payload.task.title,
      description: payload.task.description ?? "",
      dueDate: payload.task.dueDate ?? "",
      externalId,
      token: auth.token ?? "",
    });

    if (config.bridgeMode) {
      const bridgeDirectory = resolveBridgeDirectory(config, connection.id);
      await mkdir(bridgeDirectory, { recursive: true });
      const filePath = path.join(bridgeDirectory, `${Date.now()}-${payload.action}.json`);
      await writeFile(
        filePath,
        JSON.stringify({
          type: "dispatch-local-uri",
          uri,
          action: payload.action,
          taskId: payload.task.id,
          externalId,
          generatedAt: new Date().toISOString(),
        }, null, 2),
        "utf8",
      );
      return { externalTaskId: externalId };
    }

    return {
      externalTaskId: externalId,
      warning: `Manual URI generated: ${uri}`,
    };
  },
  deleteTask: async ({ connection, settings, auth, payload }) => {
    const config = settings as LocalUriConnectorSettings;
    const externalId = payload.externalTaskId ?? payload.task.id;
    const uri = applyTemplate(config.deleteTemplate, {
      title: payload.task.title,
      description: payload.task.description ?? "",
      dueDate: payload.task.dueDate ?? "",
      externalId,
      token: auth.token ?? "",
    });

    if (config.bridgeMode) {
      const bridgeDirectory = resolveBridgeDirectory(config, connection.id);
      await mkdir(bridgeDirectory, { recursive: true });
      const filePath = path.join(bridgeDirectory, `${Date.now()}-delete.json`);
      await writeFile(
        filePath,
        JSON.stringify({
          type: "dispatch-local-uri",
          uri,
          action: "delete",
          taskId: payload.task.id,
          externalId,
          generatedAt: new Date().toISOString(),
        }, null, 2),
        "utf8",
      );
      return {};
    }

    return {
      warning: `Manual URI generated: ${uri}`,
    };
  },
};
