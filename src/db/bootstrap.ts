import type Database from "better-sqlite3";

type ColumnBootstrap = {
  table: string;
  column: string;
  addSql: string;
};

const REQUIRED_COLUMNS: ColumnBootstrap[] = [
  {
    table: "user",
    column: "timeZone",
    addSql: 'ALTER TABLE "user" ADD COLUMN "timeZone" text',
  },
  {
    table: "user",
    column: "templatePresets",
    addSql: 'ALTER TABLE "user" ADD COLUMN "templatePresets" text',
  },
  {
    table: "task",
    column: "recurrenceType",
    addSql: 'ALTER TABLE "task" ADD COLUMN "recurrenceType" text NOT NULL DEFAULT \'none\'',
  },
  {
    table: "task",
    column: "recurrenceRule",
    addSql: 'ALTER TABLE "task" ADD COLUMN "recurrenceRule" text',
  },
  {
    table: "task",
    column: "recurrenceBehavior",
    addSql:
      'ALTER TABLE "task" ADD COLUMN "recurrenceBehavior" text NOT NULL DEFAULT \'after_completion\'',
  },
  {
    table: "task",
    column: "recurrenceSeriesId",
    addSql: 'ALTER TABLE "task" ADD COLUMN "recurrenceSeriesId" text',
  },
  {
    table: "task",
    column: "recurrenceProcessedAt",
    addSql: 'ALTER TABLE "task" ADD COLUMN "recurrenceProcessedAt" text',
  },
  {
    table: "security_setting",
    column: "shareAiApiKeyWithUsers",
    addSql:
      'ALTER TABLE "security_setting" ADD COLUMN "shareAiApiKeyWithUsers" integer NOT NULL DEFAULT 0',
  },
  {
    table: "security_setting",
    column: "userRegistrationEnabled",
    addSql:
      'ALTER TABLE "security_setting" ADD COLUMN "userRegistrationEnabled" integer NOT NULL DEFAULT 1',
  },
];

const REQUIRED_TABLES_SQL = [
  `
  CREATE TABLE IF NOT EXISTS "recurrence_series" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "projectId" text REFERENCES "project"("id") ON DELETE SET NULL,
    "title" text NOT NULL,
    "description" text,
    "priority" text NOT NULL DEFAULT 'medium',
    "recurrenceType" text NOT NULL,
    "recurrenceBehavior" text NOT NULL DEFAULT 'after_completion',
    "recurrenceRule" text,
    "nextDueDate" text NOT NULL,
    "active" integer NOT NULL DEFAULT 1,
    "deletedAt" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE INDEX IF NOT EXISTS "recurrence_series_userId_idx" ON "recurrence_series" ("userId");
  CREATE INDEX IF NOT EXISTS "recurrence_series_projectId_idx" ON "recurrence_series" ("projectId");
  CREATE INDEX IF NOT EXISTS "recurrence_series_active_idx" ON "recurrence_series" ("active");
  CREATE INDEX IF NOT EXISTS "recurrence_series_nextDueDate_idx" ON "recurrence_series" ("nextDueDate");
  `,
  `
  CREATE TABLE IF NOT EXISTS "integration_connection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "provider" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "syncDirection" text NOT NULL DEFAULT 'push',
    "baseUrl" text,
    "authConfig" text,
    "settings" text,
    "capabilityFlags" text NOT NULL DEFAULT '{}',
    "webhookSecret" text,
    "lastSyncedAt" text,
    "lastError" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE INDEX IF NOT EXISTS "integration_connection_userId_idx" ON "integration_connection" ("userId");
  CREATE INDEX IF NOT EXISTS "integration_connection_provider_idx" ON "integration_connection" ("provider");
  CREATE INDEX IF NOT EXISTS "integration_connection_status_idx" ON "integration_connection" ("status");

  CREATE TABLE IF NOT EXISTS "integration_project_mapping" (
    "id" text PRIMARY KEY NOT NULL,
    "connectionId" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE CASCADE,
    "projectId" text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
    "externalProjectId" text NOT NULL,
    "externalProjectName" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "integration_project_mapping_connection_project_unique"
    ON "integration_project_mapping" ("connectionId", "projectId");
  CREATE UNIQUE INDEX IF NOT EXISTS "integration_project_mapping_connection_external_unique"
    ON "integration_project_mapping" ("connectionId", "externalProjectId");

  CREATE TABLE IF NOT EXISTS "integration_task_mapping" (
    "id" text PRIMARY KEY NOT NULL,
    "connectionId" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE CASCADE,
    "taskId" text NOT NULL REFERENCES "task"("id") ON DELETE CASCADE,
    "projectId" text REFERENCES "project"("id") ON DELETE SET NULL,
    "externalTaskId" text NOT NULL,
    "externalProjectId" text,
    "lastSyncedAt" text,
    "lastLocalUpdatedAt" text,
    "lastExternalUpdatedAt" text,
    "conflictState" text NOT NULL DEFAULT 'none',
    "conflictMessage" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "integration_task_mapping_connection_task_unique"
    ON "integration_task_mapping" ("connectionId", "taskId");
  CREATE UNIQUE INDEX IF NOT EXISTS "integration_task_mapping_connection_external_unique"
    ON "integration_task_mapping" ("connectionId", "externalTaskId");
  CREATE INDEX IF NOT EXISTS "integration_task_mapping_projectId_idx" ON "integration_task_mapping" ("projectId");
  CREATE INDEX IF NOT EXISTS "integration_task_mapping_conflictState_idx" ON "integration_task_mapping" ("conflictState");

  CREATE TABLE IF NOT EXISTS "integration_outbox" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "connectionId" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE CASCADE,
    "entityType" text NOT NULL DEFAULT 'task',
    "entityId" text NOT NULL,
    "action" text NOT NULL,
    "payload" text NOT NULL,
    "idempotencyKey" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "attempts" integer NOT NULL DEFAULT 0,
    "nextAttemptAt" text,
    "lastError" text,
    "deliveredAt" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "integration_outbox_idempotency_unique" ON "integration_outbox" ("idempotencyKey");
  CREATE INDEX IF NOT EXISTS "integration_outbox_connection_status_idx" ON "integration_outbox" ("connectionId", "status");
  CREATE INDEX IF NOT EXISTS "integration_outbox_nextAttemptAt_idx" ON "integration_outbox" ("nextAttemptAt");

  CREATE TABLE IF NOT EXISTS "integration_audit_log" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "connectionId" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE CASCADE,
    "level" text NOT NULL DEFAULT 'info',
    "eventType" text NOT NULL,
    "message" text NOT NULL,
    "details" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE INDEX IF NOT EXISTS "integration_audit_log_connection_idx" ON "integration_audit_log" ("connectionId");
  CREATE INDEX IF NOT EXISTS "integration_audit_log_createdAt_idx" ON "integration_audit_log" ("createdAt");

  CREATE TABLE IF NOT EXISTS "import_session" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "sourceFormat" text NOT NULL,
    "status" text NOT NULL DEFAULT 'previewed',
    "fileName" text NOT NULL,
    "fingerprint" text NOT NULL,
    "duplicateMode" text NOT NULL DEFAULT 'skip',
    "options" text,
    "manifest" text,
    "warningCount" integer NOT NULL DEFAULT 0,
    "createdCount" integer NOT NULL DEFAULT 0,
    "updatedCount" integer NOT NULL DEFAULT 0,
    "skippedCount" integer NOT NULL DEFAULT 0,
    "errorMessage" text,
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE INDEX IF NOT EXISTS "import_session_userId_idx" ON "import_session" ("userId");
  CREATE INDEX IF NOT EXISTS "import_session_format_idx" ON "import_session" ("sourceFormat");
  CREATE INDEX IF NOT EXISTS "import_session_fingerprint_idx" ON "import_session" ("fingerprint");

  CREATE TABLE IF NOT EXISTS "import_item_mapping" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "sourceFormat" text NOT NULL,
    "entityType" text NOT NULL,
    "sourceKey" text NOT NULL,
    "dispatchEntityId" text NOT NULL,
    "dispatchEntityType" text NOT NULL,
    "lastFingerprint" text NOT NULL,
    "lastImportedAt" text NOT NULL DEFAULT (current_timestamp),
    "createdAt" text NOT NULL DEFAULT (current_timestamp),
    "updatedAt" text NOT NULL DEFAULT (current_timestamp)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "import_item_mapping_unique"
    ON "import_item_mapping" ("userId", "sourceFormat", "entityType", "sourceKey");
  CREATE INDEX IF NOT EXISTS "import_item_mapping_dispatch_idx"
    ON "import_item_mapping" ("dispatchEntityType", "dispatchEntityId");
  `,
];

function tableExists(sqlite: Database.Database, table: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { name: string } | undefined;
  return Boolean(row?.name);
}

function hasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name?: string }>;
  return columns.some((entry) => entry?.name === column);
}

export function ensureSchemaColumns(sqlite: Database.Database) {
  for (const createSql of REQUIRED_TABLES_SQL) {
    sqlite.exec(createSql);
  }

  for (const spec of REQUIRED_COLUMNS) {
    if (!tableExists(sqlite, spec.table)) {
      continue;
    }

    if (!hasColumn(sqlite, spec.table, spec.column)) {
      sqlite.exec(spec.addSql);
    }
  }
}
