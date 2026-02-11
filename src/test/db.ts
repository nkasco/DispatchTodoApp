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
      "deletedAt" text,
      "createdAt" text NOT NULL DEFAULT (current_timestamp),
      "updatedAt" text NOT NULL DEFAULT (current_timestamp)
    );

    CREATE INDEX "task_userId_idx" ON "task" ("userId");
    CREATE INDEX "task_projectId_idx" ON "task" ("projectId");
    CREATE INDEX "task_status_idx" ON "task" ("status");
    CREATE INDEX "task_priority_idx" ON "task" ("priority");

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

    CREATE TABLE "security_setting" (
      "id" integer PRIMARY KEY NOT NULL DEFAULT 1,
      "databaseEncryptionEnabled" integer NOT NULL DEFAULT 0,
      "shareAiApiKeyWithUsers" integer NOT NULL DEFAULT 0,
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
