import { db } from "@/db";
import {
  integrationAuditLogs,
  integrationConnections,
  integrationOutbox,
  integrationProjectMappings,
  integrationTaskMappings,
  projects,
  tasks,
} from "@/db/schema";
import { decryptConnectorSecret, encryptConnectorSecret, maskConnectorSecret } from "@/lib/integrations/encryption";
import { getConnectorAdapter, listConnectorAdapters } from "@/lib/integrations/connectors";
import type {
  ConnectorAuditEntry,
  ConnectorAuditLevel,
  ConnectorConflictState,
  ConnectorProvider,
  ConnectorRecord,
  ConnectorSettings,
  ConnectorSyncPayload,
  ConnectorSyncResult,
  ConnectorWebhookPayload,
} from "@/lib/integrations/connectors/types";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

type StoredAuthConfig = {
  token?: string | null;
  username?: string | null;
  password?: string | null;
};

type ConnectionRow = typeof integrationConnections.$inferSelect;

function parseStoredJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeAuthConfig(auth: StoredAuthConfig): string | null {
  const normalized = {
    token: auth.token?.trim() || null,
    username: auth.username?.trim() || null,
    password: auth.password?.trim() || null,
  };

  if (!normalized.token && !normalized.username && !normalized.password) {
    return null;
  }

  return encryptConnectorSecret(JSON.stringify(normalized));
}

function parseStoredAuthConfig(value: string | null): StoredAuthConfig {
  if (!value) return {};
  try {
    return JSON.parse(decryptConnectorSecret(value)) as StoredAuthConfig;
  } catch {
    return {};
  }
}

function normalizeCapabilityFlags(provider: ConnectorProvider) {
  return getConnectorAdapter(provider).capabilityFlags;
}

function buildWebhookUrl(connectionId: string, webhookSecret: string | null) {
  if (!webhookSecret) return null;
  return `/api/integrations/connectors/${connectionId}/webhook?secret=${webhookSecret}`;
}

function maskAuthSummary(auth: StoredAuthConfig) {
  return {
    hasToken: Boolean(auth.token),
    maskedToken: maskConnectorSecret(auth.token ?? null),
    username: auth.username ?? null,
  };
}

function sanitizeConnectionRow(
  row: ConnectionRow & { pendingCount?: number | null; failedCount?: number | null },
): ConnectorRecord {
  const auth = parseStoredAuthConfig(row.authConfig);
  const provider = row.provider as ConnectorProvider;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    provider,
    status: row.status as ConnectorRecord["status"],
    syncDirection: row.syncDirection as ConnectorRecord["syncDirection"],
    baseUrl: row.baseUrl,
    capabilityFlags: parseStoredJson(row.capabilityFlags, normalizeCapabilityFlags(provider)),
    settings: parseStoredJson<ConnectorSettings>(row.settings, getConnectorAdapter(provider).defaults(row.baseUrl)),
    auth: maskAuthSummary(auth),
    webhookSecret: row.webhookSecret,
    webhookUrl: buildWebhookUrl(row.id, row.webhookSecret),
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    pendingCount: row.pendingCount ?? 0,
    failedCount: row.failedCount ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function logAudit(params: {
  userId: string;
  connectionId: string;
  level?: ConnectorAuditLevel;
  eventType: string;
  message: string;
  details?: unknown;
}) {
  await db.insert(integrationAuditLogs).values({
    userId: params.userId,
    connectionId: params.connectionId,
    level: params.level ?? "info",
    eventType: params.eventType,
    message: params.message,
    details: params.details === undefined ? null : JSON.stringify(params.details),
    createdAt: new Date().toISOString(),
  });
}

async function fetchConnectionRows(userId: string) {
  return db
    .select({
      id: integrationConnections.id,
      userId: integrationConnections.userId,
      name: integrationConnections.name,
      provider: integrationConnections.provider,
      status: integrationConnections.status,
      syncDirection: integrationConnections.syncDirection,
      baseUrl: integrationConnections.baseUrl,
      authConfig: integrationConnections.authConfig,
      settings: integrationConnections.settings,
      capabilityFlags: integrationConnections.capabilityFlags,
      webhookSecret: integrationConnections.webhookSecret,
      lastSyncedAt: integrationConnections.lastSyncedAt,
      lastError: integrationConnections.lastError,
      createdAt: integrationConnections.createdAt,
      updatedAt: integrationConnections.updatedAt,
      pendingCount: sql<number>`sum(case when ${integrationOutbox.status} in ('pending', 'retry', 'processing') then 1 else 0 end)`,
      failedCount: sql<number>`sum(case when ${integrationOutbox.status} = 'failed' then 1 else 0 end)`,
    })
    .from(integrationConnections)
    .leftJoin(integrationOutbox, eq(integrationOutbox.connectionId, integrationConnections.id))
    .where(eq(integrationConnections.userId, userId))
    .groupBy(integrationConnections.id)
    .orderBy(integrationConnections.createdAt);
}

export async function listConnectionsForUser(userId: string): Promise<ConnectorRecord[]> {
  const rows = await fetchConnectionRows(userId);
  return rows.map((row) => sanitizeConnectionRow(row));
}

export async function listConnectorAuditEntriesForUser(userId: string, limit = 24): Promise<ConnectorAuditEntry[]> {
  const rows = await db
    .select({
      id: integrationAuditLogs.id,
      connectionId: integrationAuditLogs.connectionId,
      level: integrationAuditLogs.level,
      eventType: integrationAuditLogs.eventType,
      message: integrationAuditLogs.message,
      details: integrationAuditLogs.details,
      createdAt: integrationAuditLogs.createdAt,
    })
    .from(integrationAuditLogs)
    .where(eq(integrationAuditLogs.userId, userId))
    .orderBy(desc(integrationAuditLogs.createdAt))
    .limit(limit);

  return rows;
}

export async function getConnectionForUser(userId: string, connectionId: string): Promise<ConnectorRecord | null> {
  const rows = await fetchConnectionRows(userId);
  const row = rows.find((entry) => entry.id === connectionId);
  return row ? sanitizeConnectionRow(row) : null;
}

async function getInternalConnection(userId: string, connectionId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.id, connectionId), eq(integrationConnections.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createConnectorForUser(params: {
  userId: string;
  name: string;
  provider: ConnectorProvider;
  syncDirection: ConnectorRecord["syncDirection"];
  baseUrl?: string | null;
  settings?: unknown;
  authToken?: string | null;
  username?: string | null;
  password?: string | null;
}) {
  const adapter = getConnectorAdapter(params.provider);
  const validated = adapter.validateConfig({
    baseUrl: params.baseUrl ?? null,
    settings: params.settings,
    authToken: params.authToken ?? null,
    username: params.username ?? null,
    password: params.password ?? null,
  });
  const now = new Date().toISOString();
  const [row] = await db
    .insert(integrationConnections)
    .values({
      userId: params.userId,
      name: params.name.trim(),
      provider: params.provider,
      status: "active",
      syncDirection: params.syncDirection,
      baseUrl: validated.baseUrl,
      authConfig: serializeAuthConfig({
        token: params.authToken ?? null,
        username: params.username ?? null,
        password: params.password ?? null,
      }),
      settings: JSON.stringify(validated.settings),
      capabilityFlags: JSON.stringify(adapter.capabilityFlags),
      webhookSecret: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await logAudit({
    userId: params.userId,
    connectionId: row.id,
    eventType: "connector.created",
    message: `${adapter.label} connector created.`,
  });

  return getConnectionForUser(params.userId, row.id);
}

export async function updateConnectorForUser(params: {
  userId: string;
  connectionId: string;
  name?: string;
  status?: ConnectorRecord["status"];
  syncDirection?: ConnectorRecord["syncDirection"];
  baseUrl?: string | null;
  settings?: unknown;
  authToken?: string | null;
  username?: string | null;
  password?: string | null;
}) {
  const existing = await getInternalConnection(params.userId, params.connectionId);
  if (!existing) {
    throw new Error("Connector not found");
  }

  const adapter = getConnectorAdapter(existing.provider as ConnectorProvider);
  const existingAuth = parseStoredAuthConfig(existing.authConfig);
  const validated = adapter.validateConfig({
    baseUrl: params.baseUrl ?? existing.baseUrl,
    settings: params.settings ?? parseStoredJson(existing.settings, adapter.defaults(existing.baseUrl)),
    authToken: params.authToken ?? existingAuth.token ?? null,
    username: params.username ?? existingAuth.username ?? null,
    password: params.password ?? existingAuth.password ?? null,
  });

  await db
    .update(integrationConnections)
    .set({
      name: params.name?.trim() || existing.name,
      status: params.status ?? existing.status,
      syncDirection: params.syncDirection ?? existing.syncDirection,
      baseUrl: validated.baseUrl,
      authConfig: serializeAuthConfig({
        token: params.authToken ?? existingAuth.token ?? null,
        username: params.username ?? existingAuth.username ?? null,
        password: params.password ?? existingAuth.password ?? null,
      }),
      settings: JSON.stringify(validated.settings),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrationConnections.id, params.connectionId));

  await logAudit({
    userId: params.userId,
    connectionId: params.connectionId,
    eventType: "connector.updated",
    message: `${adapter.label} connector updated.`,
  });

  return getConnectionForUser(params.userId, params.connectionId);
}

export async function deleteConnectorForUser(userId: string, connectionId: string) {
  const existing = await getInternalConnection(userId, connectionId);
  if (!existing) {
    throw new Error("Connector not found");
  }

  await db.delete(integrationConnections).where(eq(integrationConnections.id, connectionId));
}

export async function testConnectorForUser(userId: string, connectionId: string) {
  const existing = await getInternalConnection(userId, connectionId);
  if (!existing) {
    throw new Error("Connector not found");
  }

  const adapter = getConnectorAdapter(existing.provider as ConnectorProvider);
  const auth = parseStoredAuthConfig(existing.authConfig);
  const settings = parseStoredJson<ConnectorSettings>(
    existing.settings,
    adapter.defaults(existing.baseUrl),
  );
  const result = await adapter.testConnection({
    baseUrl: existing.baseUrl,
    settings,
    auth: {
      token: auth.token ?? null,
      username: auth.username ?? null,
      password: auth.password ?? null,
    },
  });

  await db
    .update(integrationConnections)
    .set({
      status: result.ok ? "active" : "error",
      lastError: result.ok ? null : result.message,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrationConnections.id, connectionId));

  await logAudit({
    userId,
    connectionId,
    level: result.ok ? "info" : "error",
    eventType: "connector.test",
    message: result.message,
  });

  return result;
}

export function listConnectorCatalog() {
  return listConnectorAdapters().map((adapter) => ({
    provider: adapter.provider,
    label: adapter.label,
    description: adapter.description,
    capabilityFlags: adapter.capabilityFlags,
  }));
}

async function enqueueOutboxItem(params: {
  userId: string;
  connectionId: string;
  action: ConnectorSyncPayload["action"];
  task: typeof tasks.$inferSelect;
  project: typeof projects.$inferSelect | null;
}) {
  const idempotencyKey = `${params.connectionId}:${params.action}:${params.task.id}:${params.task.updatedAt}:${params.task.deletedAt ?? "live"}`;
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    task: params.task,
    project: params.project,
    action: params.action,
  });

  const [existing] = await db
    .select({ id: integrationOutbox.id })
    .from(integrationOutbox)
    .where(eq(integrationOutbox.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(integrationOutbox).values({
    userId: params.userId,
    connectionId: params.connectionId,
    entityType: "task",
    entityId: params.task.id,
    action: params.action,
    payload,
    idempotencyKey,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export async function enqueueTaskMutationForConnectors(params: {
  userId: string;
  taskId: string;
  action: ConnectorSyncPayload["action"];
}) {
  const [taskRow] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, params.taskId))
    .limit(1);

  if (!taskRow) {
    return;
  }

  const projectRow = taskRow.projectId
    ? (await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, taskRow.projectId), eq(projects.userId, params.userId)))
        .limit(1))[0] ?? null
    : null;

  const connections = await db
    .select({ id: integrationConnections.id, status: integrationConnections.status })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.userId, params.userId),
        or(eq(integrationConnections.status, "active"), eq(integrationConnections.status, "error")),
      ),
    );

  for (const connection of connections) {
    await enqueueOutboxItem({
      userId: params.userId,
      connectionId: connection.id,
      action: params.action,
      task: taskRow,
      project: projectRow,
    });
  }
}

function nextRetryIso(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, attempts * attempts));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

async function updateMappingAfterDelivery(params: {
  connectionId: string;
  taskId: string;
  projectId: string | null;
  externalTaskId: string;
  externalProjectId: string | null;
  localUpdatedAt: string;
}) {
  const now = new Date().toISOString();
  const [existing] = await db
    .select({ id: integrationTaskMappings.id })
    .from(integrationTaskMappings)
    .where(
      and(
        eq(integrationTaskMappings.connectionId, params.connectionId),
        eq(integrationTaskMappings.taskId, params.taskId),
      ),
    )
    .limit(1);

  if (params.projectId && params.externalProjectId) {
    const [projectMapping] = await db
      .select({ id: integrationProjectMappings.id })
      .from(integrationProjectMappings)
      .where(
        and(
          eq(integrationProjectMappings.connectionId, params.connectionId),
          eq(integrationProjectMappings.projectId, params.projectId),
        ),
      )
      .limit(1);

    if (!projectMapping) {
      await db.insert(integrationProjectMappings).values({
        connectionId: params.connectionId,
        projectId: params.projectId,
        externalProjectId: params.externalProjectId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (existing) {
    await db
      .update(integrationTaskMappings)
      .set({
        projectId: params.projectId,
        externalTaskId: params.externalTaskId,
        externalProjectId: params.externalProjectId,
        lastSyncedAt: now,
        lastLocalUpdatedAt: params.localUpdatedAt,
        conflictState: "none",
        conflictMessage: null,
        updatedAt: now,
      })
      .where(eq(integrationTaskMappings.id, existing.id));
    return;
  }

  await db.insert(integrationTaskMappings).values({
    connectionId: params.connectionId,
    taskId: params.taskId,
    projectId: params.projectId,
    externalTaskId: params.externalTaskId,
    externalProjectId: params.externalProjectId,
    lastSyncedAt: now,
    lastLocalUpdatedAt: params.localUpdatedAt,
    createdAt: now,
    updatedAt: now,
  });
}

async function processSingleOutboxItem(itemId: string): Promise<{
  delivered: boolean;
  warning?: string | null;
}> {
  const [item] = await db
    .select()
    .from(integrationOutbox)
    .where(eq(integrationOutbox.id, itemId))
    .limit(1);

  if (!item) {
    return { delivered: false, warning: "Outbox item not found." };
  }

  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, item.connectionId))
    .limit(1);

  if (!connection || connection.status === "disabled") {
    return { delivered: false, warning: "Connector is disabled or missing." };
  }

  const adapter = getConnectorAdapter(connection.provider as ConnectorProvider);
  const auth = parseStoredAuthConfig(connection.authConfig);
  const settings = parseStoredJson<ConnectorSettings>(
    connection.settings,
    adapter.defaults(connection.baseUrl),
  );
  const payload = parseStoredJson<{
    task: typeof tasks.$inferSelect;
    project: typeof projects.$inferSelect | null;
    action: ConnectorSyncPayload["action"];
  }>(item.payload, {
    task: {} as typeof tasks.$inferSelect,
    project: null,
    action: item.action as ConnectorSyncPayload["action"],
  });

  const [mapping] = await db
    .select()
    .from(integrationTaskMappings)
    .where(
      and(
        eq(integrationTaskMappings.connectionId, connection.id),
        eq(integrationTaskMappings.taskId, payload.task.id),
      ),
    )
    .limit(1);

  await db
    .update(integrationOutbox)
    .set({
      status: "processing",
      attempts: item.attempts + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrationOutbox.id, item.id));

  try {
    const syncPayload: ConnectorSyncPayload = {
      action: payload.action,
      task: payload.task,
      project: payload.project,
      externalTaskId: mapping?.externalTaskId ?? null,
      externalProjectId: mapping?.externalProjectId ?? null,
    };

    let result: { warning?: string | null; externalTaskId?: string | null; externalProjectId?: string | null };
    if (payload.action === "delete") {
      result = await adapter.deleteTask({
        connection: sanitizeConnectionRow(connection),
        settings,
        auth: {
          token: auth.token ?? null,
          username: auth.username ?? null,
          password: auth.password ?? null,
        },
        payload: syncPayload,
      });
    } else {
      result = await adapter.pushTask({
        connection: sanitizeConnectionRow(connection),
        settings,
        auth: {
          token: auth.token ?? null,
          username: auth.username ?? null,
          password: auth.password ?? null,
        },
        payload: syncPayload,
      });
    }

    if (payload.action !== "delete") {
      await updateMappingAfterDelivery({
        connectionId: connection.id,
        taskId: payload.task.id,
        projectId: payload.project?.id ?? null,
        externalTaskId: result.externalTaskId ?? mapping?.externalTaskId ?? payload.task.id,
        externalProjectId: result.externalProjectId ?? mapping?.externalProjectId ?? payload.project?.id ?? null,
        localUpdatedAt: payload.task.updatedAt,
      });
    }

    await db
      .update(integrationOutbox)
      .set({
        status: "delivered",
        deliveredAt: new Date().toISOString(),
        lastError: result.warning ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationOutbox.id, item.id));

    await db
      .update(integrationConnections)
      .set({
        status: "active",
        lastSyncedAt: new Date().toISOString(),
        lastError: result.warning ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationConnections.id, connection.id));

    await logAudit({
      userId: item.userId,
      connectionId: item.connectionId,
      level: result.warning ? "warning" : "info",
      eventType: "sync.delivered",
      message: result.warning ?? `Delivered ${payload.action} for task ${payload.task.title}`,
      details: { taskId: payload.task.id, externalTaskId: mapping?.externalTaskId ?? null },
    });

    return { delivered: true, warning: result.warning ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connector sync failed";
    const attempts = item.attempts + 1;
    const nextStatus = attempts >= 5 ? "failed" : "retry";
    await db
      .update(integrationOutbox)
      .set({
        status: nextStatus,
        lastError: message,
        nextAttemptAt: nextRetryIso(attempts),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationOutbox.id, item.id));

    await db
      .update(integrationConnections)
      .set({
        status: "error",
        lastError: message,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationConnections.id, connection.id));

    await logAudit({
      userId: item.userId,
      connectionId: item.connectionId,
      level: "error",
      eventType: "sync.failed",
      message,
      details: { itemId: item.id, attempts },
    });

    return { delivered: false, warning: message };
  }
}

export async function processConnectorOutbox(params: {
  userId: string;
  connectionId?: string;
  limit?: number;
}): Promise<ConnectorSyncResult> {
  const now = new Date().toISOString();
  const conditions = [
    eq(integrationOutbox.userId, params.userId),
    or(eq(integrationOutbox.status, "pending"), eq(integrationOutbox.status, "retry"), eq(integrationOutbox.status, "processing")),
    or(isNull(integrationOutbox.nextAttemptAt), lte(integrationOutbox.nextAttemptAt, now)),
  ];

  if (params.connectionId) {
    conditions.push(eq(integrationOutbox.connectionId, params.connectionId));
  }

  const items = await db
    .select({ id: integrationOutbox.id })
    .from(integrationOutbox)
    .where(and(...conditions))
    .orderBy(integrationOutbox.createdAt)
    .limit(params.limit ?? 25);

  let delivered = 0;
  let failed = 0;

  for (const item of items) {
    const result = await processSingleOutboxItem(item.id);
    if (result.delivered) {
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  const pendingConditions = [eq(integrationOutbox.userId, params.userId)];
  if (params.connectionId) {
    pendingConditions.push(eq(integrationOutbox.connectionId, params.connectionId));
  }

  const [counts] = await db
    .select({
      pending: sql<number>`sum(case when ${integrationOutbox.status} in ('pending', 'retry', 'processing') then 1 else 0 end)`,
    })
    .from(integrationOutbox)
    .where(and(...pendingConditions));

  return {
    processed: items.length,
    delivered,
    failed,
    pending: counts?.pending ?? 0,
    lastSyncedAt: delivered > 0 ? new Date().toISOString() : null,
  };
}

async function markConflict(params: {
  connectionId: string;
  taskId: string;
  state: ConnectorConflictState;
  message: string;
  externalUpdatedAt: string | null;
}) {
  await db
    .update(integrationTaskMappings)
    .set({
      conflictState: params.state,
      conflictMessage: params.message,
      lastExternalUpdatedAt: params.externalUpdatedAt,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(integrationTaskMappings.connectionId, params.connectionId),
        eq(integrationTaskMappings.taskId, params.taskId),
      ),
    );
}

export async function handleConnectorWebhook(params: {
  userId: string;
  connectionId: string;
  secret: string | null;
  payload: ConnectorWebhookPayload;
}) {
  const connection = await getInternalConnection(params.userId, params.connectionId);
  if (!connection) {
    throw new Error("Connector not found");
  }

  if (!connection.webhookSecret || connection.webhookSecret !== params.secret) {
    throw new Error("Invalid webhook secret");
  }

  const adapter = getConnectorAdapter(connection.provider as ConnectorProvider);
  const sanitizedConnection = sanitizeConnectionRow(connection);

  let adapterMessage = "Webhook received";
  if (adapter.handleWebhook) {
    const adapterResult = await adapter.handleWebhook({
      connection: sanitizedConnection,
      payload: params.payload,
    });
    adapterMessage = adapterResult.message;
  }

  if (params.payload.externalTaskId) {
    const [mapping] = await db
      .select()
      .from(integrationTaskMappings)
      .where(
        and(
          eq(integrationTaskMappings.connectionId, params.connectionId),
          eq(integrationTaskMappings.externalTaskId, params.payload.externalTaskId),
        ),
      )
      .limit(1);

    if (mapping) {
      const [localTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, mapping.taskId))
        .limit(1);

      if (localTask) {
        const externalUpdatedAt = params.payload.updatedAt ?? null;
        if (externalUpdatedAt && externalUpdatedAt >= localTask.updatedAt) {
          const updates: Record<string, unknown> = {
            updatedAt: externalUpdatedAt,
          };
          if (params.payload.title !== undefined) updates.title = params.payload.title;
          if (params.payload.description !== undefined) updates.description = params.payload.description;
          if (params.payload.status !== undefined) updates.status = params.payload.status;
          if (params.payload.priority !== undefined) updates.priority = params.payload.priority;
          if (params.payload.dueDate !== undefined) updates.dueDate = params.payload.dueDate;

          await db.update(tasks).set(updates).where(eq(tasks.id, localTask.id));
          await markConflict({
            connectionId: params.connectionId,
            taskId: localTask.id,
            state: "last_write_wins",
            message: "External change applied via last-write-wins policy.",
            externalUpdatedAt,
          });
        } else {
          await markConflict({
            connectionId: params.connectionId,
            taskId: localTask.id,
            state: "needs_review",
            message: "External change arrived after a newer local edit.",
            externalUpdatedAt,
          });
        }
      }
    }
  }

  await db
    .update(integrationConnections)
    .set({
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrationConnections.id, params.connectionId));

  await logAudit({
    userId: params.userId,
    connectionId: params.connectionId,
    eventType: "webhook.received",
    message: adapterMessage,
    details: params.payload,
  });

  return { ok: true, message: adapterMessage };
}

export async function getConnectorConflictsForUser(userId: string) {
  const rows = await db
    .select({
      connectionId: integrationTaskMappings.connectionId,
      taskId: integrationTaskMappings.taskId,
      conflictState: integrationTaskMappings.conflictState,
      conflictMessage: integrationTaskMappings.conflictMessage,
      externalTaskId: integrationTaskMappings.externalTaskId,
      updatedAt: integrationTaskMappings.updatedAt,
      taskTitle: tasks.title,
    })
    .from(integrationTaskMappings)
    .innerJoin(tasks, eq(tasks.id, integrationTaskMappings.taskId))
    .innerJoin(integrationConnections, eq(integrationConnections.id, integrationTaskMappings.connectionId))
    .where(
      and(
        eq(integrationConnections.userId, userId),
        inArray(integrationTaskMappings.conflictState, ["last_write_wins", "needs_review"]),
      ),
    )
    .orderBy(desc(integrationTaskMappings.updatedAt));

  return rows;
}
