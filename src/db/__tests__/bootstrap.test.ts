import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ensureSchemaColumns } from "@/db/bootstrap";

const opened: Database.Database[] = [];

function createSqlite(schemaSql: string): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(schemaSql);
  opened.push(sqlite);
  return sqlite;
}

function columnNames(sqlite: Database.Database, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

afterEach(() => {
  while (opened.length > 0) {
    const sqlite = opened.pop()!;
    sqlite.close();
  }
});

describe("ensureSchemaColumns", () => {
  it("adds missing user preference columns used by profile routes", () => {
    const sqlite = createSqlite(`
      CREATE TABLE "user" (
        "id" text PRIMARY KEY NOT NULL,
        "email" text
      );
    `);

    ensureSchemaColumns(sqlite);

    const columns = columnNames(sqlite, "user");
    expect(columns).toContain("timeZone");
    expect(columns).toContain("templatePresets");
  });

  it("adds missing task recurrence columns", () => {
    const sqlite = createSqlite(`
      CREATE TABLE "task" (
        "id" text PRIMARY KEY NOT NULL,
        "title" text NOT NULL
      );
    `);

    ensureSchemaColumns(sqlite);

    const columns = columnNames(sqlite, "task");
    expect(columns).toContain("recurrenceType");
    expect(columns).toContain("recurrenceRule");
    expect(columns).toContain("recurrenceBehavior");
    expect(columns).toContain("recurrenceSeriesId");
    expect(columns).toContain("recurrenceProcessedAt");
  });

  it("creates recurrence series table when missing", () => {
    const sqlite = createSqlite(`
      CREATE TABLE "user" (
        "id" text PRIMARY KEY NOT NULL
      );
      CREATE TABLE "project" (
        "id" text PRIMARY KEY NOT NULL
      );
    `);

    ensureSchemaColumns(sqlite);

    const tables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recurrence_series' LIMIT 1",
    ).get() as { name: string } | undefined;
    expect(tables?.name).toBe("recurrence_series");
  });

  it("adds missing security setting columns used by admin routes", () => {
    const sqlite = createSqlite(`
      CREATE TABLE "security_setting" (
        "id" integer PRIMARY KEY NOT NULL DEFAULT 1,
        "databaseEncryptionEnabled" integer NOT NULL DEFAULT 0,
        "updatedAt" text NOT NULL
      );
    `);

    ensureSchemaColumns(sqlite);

    const columns = columnNames(sqlite, "security_setting");
    expect(columns).toContain("shareAiApiKeyWithUsers");
    expect(columns).toContain("userRegistrationEnabled");
  });

  it("creates integration connector tables when missing", () => {
    const sqlite = createSqlite(`
      CREATE TABLE "user" (
        "id" text PRIMARY KEY NOT NULL
      );
      CREATE TABLE "project" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" text
      );
      CREATE TABLE "task" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" text
      );
    `);

    ensureSchemaColumns(sqlite);

    const tables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name in ('integration_connection', 'integration_project_mapping', 'integration_task_mapping', 'integration_outbox', 'integration_audit_log')",
    ).all() as Array<{ name: string }>;

    expect(tables.map((entry) => entry.name)).toEqual([
      "integration_connection",
      "integration_project_mapping",
      "integration_task_mapping",
      "integration_outbox",
      "integration_audit_log",
    ]);
  });

  it("creates import tracking tables when missing", () => {
    const sqlite = createSqlite(`
      CREATE TABLE "user" (
        "id" text PRIMARY KEY NOT NULL
      );
    `);

    ensureSchemaColumns(sqlite);

    const tables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name in ('import_session', 'import_item_mapping')",
    ).all() as Array<{ name: string }>;

    expect(tables.map((entry) => entry.name)).toEqual([
      "import_session",
      "import_item_mapping",
    ]);
  });
});
