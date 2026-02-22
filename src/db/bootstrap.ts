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
  for (const spec of REQUIRED_COLUMNS) {
    if (!tableExists(sqlite, spec.table)) {
      continue;
    }

    if (!hasColumn(sqlite, spec.table, spec.column)) {
      sqlite.exec(spec.addSql);
    }
  }
}
