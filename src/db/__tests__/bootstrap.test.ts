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
});
