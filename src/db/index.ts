import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { applyDbEncryptionAtStartup } from "@/lib/db-encryption";

export const sqlite = new Database(process.env.DATABASE_URL || "./dispatch.db");
applyDbEncryptionAtStartup(sqlite);

function ensureUserTimeZoneColumn() {
  const table = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user' LIMIT 1")
    .get() as { name: string } | undefined;
  if (!table) return;

  const columns = sqlite.prepare("PRAGMA table_info('user')").all() as Array<{ name: string }>;
  const hasTimeZone = columns.some((column) => column.name === "timeZone");
  if (!hasTimeZone) {
    sqlite.exec('ALTER TABLE "user" ADD COLUMN "timeZone" text');
  }
}

ensureUserTimeZoneColumn();

export const db = drizzle(sqlite, { schema });
