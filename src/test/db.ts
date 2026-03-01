import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Creates a fresh in-memory SQLite database with the full schema.
 * Returns the Drizzle client instance.
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // Create all tables matching the schema
  sqlite.exec(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text,
      "email" text,
      "emailVerified" integer,
      "image" text,
      "password" text,
      "role" text NOT NULL DEFAULT 'member',
      "frozenAt" text,
      "timeZone" text,
      "templatePresets" text,
      "showAdminQuickAccess" integer NOT NULL DEFAULT 1,
      "assistantEnabled" integer NOT NULL DEFAULT 1
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");

    CREATE TABLE "account" (
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "type" text NOT NULL,
      "provider" text NOT NULL,
      "providerAccountId" text NOT NULL,
      "refresh_token" text,
      "access_token" text,
      "expires_at" integer,
      "token_type" text,
      "scope" text,
      "id_token" text,
      "session_state" text,
      PRIMARY KEY ("provider", "providerAccountId")
    );

    CREATE TABLE "session" (
      "sessionToken" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "expires" integer NOT NULL
    );

    CREATE TABLE "project" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "description" text,
      "status" text NOT NULL DEFAULT 'active',
      "color" text NOT NULL DEFAULT 'blue',
      "deletedAt" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "project_userId_idx" ON "project" ("userId");
    CREATE INDEX "project_status_idx" ON "project" ("status");

    CREATE TABLE "task" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "projectId" text REFERENCES "project"("id") ON DELETE SET NULL,
      "title" text NOT NULL,
      "description" text,
      "status" text NOT NULL DEFAULT 'open',
      "priority" text NOT NULL DEFAULT 'medium',
      "dueDate" text,
      "recurrenceType" text NOT NULL DEFAULT 'none',
      "recurrenceBehavior" text NOT NULL DEFAULT 'after_completion',
      "recurrenceRule" text,
      "recurrenceSeriesId" text,
      "recurrenceProcessedAt" text,
      "deletedAt" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "task_userId_idx" ON "task" ("userId");
    CREATE INDEX "task_projectId_idx" ON "task" ("projectId");
    CREATE INDEX "task_status_idx" ON "task" ("status");
    CREATE INDEX "task_priority_idx" ON "task" ("priority");
    CREATE INDEX "task_recurrenceSeriesId_idx" ON "task" ("recurrenceSeriesId");

    CREATE TABLE "recurrence_series" (
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

    CREATE INDEX "recurrence_series_userId_idx" ON "recurrence_series" ("userId");
    CREATE INDEX "recurrence_series_projectId_idx" ON "recurrence_series" ("projectId");
    CREATE INDEX "recurrence_series_active_idx" ON "recurrence_series" ("active");
    CREATE INDEX "recurrence_series_nextDueDate_idx" ON "recurrence_series" ("nextDueDate");

    CREATE TABLE "note" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "content" text,
      "deletedAt" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "note_userId_idx" ON "note" ("userId");

    CREATE TABLE "dispatch" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "date" text NOT NULL,
      "summary" text,
      "finalized" integer NOT NULL DEFAULT 0,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "dispatch_userId_idx" ON "dispatch" ("userId");
    CREATE INDEX "dispatch_date_idx" ON "dispatch" ("userId", "date");

    CREATE TABLE "dispatch_task" (
      "dispatchId" text NOT NULL REFERENCES "dispatch"("id") ON DELETE CASCADE,
      "taskId" text NOT NULL REFERENCES "task"("id") ON DELETE CASCADE,
      PRIMARY KEY ("dispatchId", "taskId")
    );

    CREATE TABLE "api_key" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "key" text NOT NULL,
      "lastUsedAt" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE UNIQUE INDEX "api_key_key_unique" ON "api_key" ("key");
    CREATE INDEX "api_key_userId_idx" ON "api_key" ("userId");
    CREATE INDEX "api_key_key_idx" ON "api_key" ("key");

    CREATE TABLE "integration_connection" (
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

    CREATE INDEX "integration_connection_userId_idx" ON "integration_connection" ("userId");
    CREATE INDEX "integration_connection_provider_idx" ON "integration_connection" ("provider");
    CREATE INDEX "integration_connection_status_idx" ON "integration_connection" ("status");

    CREATE TABLE "integration_project_mapping" (
      "id" text PRIMARY KEY NOT NULL,
      "connectionId" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE CASCADE,
      "projectId" text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
      "externalProjectId" text NOT NULL,
      "externalProjectName" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE UNIQUE INDEX "integration_project_mapping_connection_project_unique"
      ON "integration_project_mapping" ("connectionId", "projectId");
    CREATE UNIQUE INDEX "integration_project_mapping_connection_external_unique"
      ON "integration_project_mapping" ("connectionId", "externalProjectId");

    CREATE TABLE "integration_task_mapping" (
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

    CREATE UNIQUE INDEX "integration_task_mapping_connection_task_unique"
      ON "integration_task_mapping" ("connectionId", "taskId");
    CREATE UNIQUE INDEX "integration_task_mapping_connection_external_unique"
      ON "integration_task_mapping" ("connectionId", "externalTaskId");
    CREATE INDEX "integration_task_mapping_projectId_idx" ON "integration_task_mapping" ("projectId");
    CREATE INDEX "integration_task_mapping_conflictState_idx" ON "integration_task_mapping" ("conflictState");

    CREATE TABLE "integration_outbox" (
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

    CREATE UNIQUE INDEX "integration_outbox_idempotency_unique" ON "integration_outbox" ("idempotencyKey");
    CREATE INDEX "integration_outbox_connection_status_idx" ON "integration_outbox" ("connectionId", "status");
    CREATE INDEX "integration_outbox_nextAttemptAt_idx" ON "integration_outbox" ("nextAttemptAt");

    CREATE TABLE "integration_audit_log" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "connectionId" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE CASCADE,
      "level" text NOT NULL DEFAULT 'info',
      "eventType" text NOT NULL,
      "message" text NOT NULL,
      "details" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "integration_audit_log_connection_idx" ON "integration_audit_log" ("connectionId");
    CREATE INDEX "integration_audit_log_createdAt_idx" ON "integration_audit_log" ("createdAt");

    CREATE TABLE "import_session" (
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

    CREATE INDEX "import_session_userId_idx" ON "import_session" ("userId");
    CREATE INDEX "import_session_format_idx" ON "import_session" ("sourceFormat");
    CREATE INDEX "import_session_fingerprint_idx" ON "import_session" ("fingerprint");

    CREATE TABLE "import_item_mapping" (
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

    CREATE UNIQUE INDEX "import_item_mapping_unique"
      ON "import_item_mapping" ("userId", "sourceFormat", "entityType", "sourceKey");
    CREATE INDEX "import_item_mapping_dispatch_idx" ON "import_item_mapping" ("dispatchEntityType", "dispatchEntityId");

    CREATE TABLE "security_setting" (
      "id" integer PRIMARY KEY NOT NULL DEFAULT 1,
      "databaseEncryptionEnabled" integer NOT NULL DEFAULT 0,
      "shareAiApiKeyWithUsers" integer NOT NULL DEFAULT 0,
      "userRegistrationEnabled" integer NOT NULL DEFAULT 1,
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE TABLE "ai_config" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "provider" text NOT NULL DEFAULT 'openai',
      "apiKey" text,
      "baseUrl" text,
      "model" text NOT NULL DEFAULT 'gpt-4o-mini',
      "isActive" integer NOT NULL DEFAULT 1,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "ai_config_userId_idx" ON "ai_config" ("userId");
    CREATE INDEX "ai_config_active_idx" ON "ai_config" ("userId", "isActive");

    CREATE TABLE "chat_conversations" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "title" text NOT NULL DEFAULT 'New conversation',
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "chat_conversation_userId_idx" ON "chat_conversations" ("userId");
    CREATE INDEX "chat_conversation_updatedAt_idx" ON "chat_conversations" ("updatedAt");

    CREATE TABLE "chat_messages" (
      "id" text PRIMARY KEY NOT NULL,
      "conversationId" text NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
      "role" text NOT NULL,
      "content" text NOT NULL,
      "model" text,
      "tokenCount" integer,
      "createdAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "chat_message_conversationId_idx" ON "chat_messages" ("conversationId");
    CREATE INDEX "chat_message_createdAt_idx" ON "chat_messages" ("createdAt");
  `);

  return { db, sqlite };
}
