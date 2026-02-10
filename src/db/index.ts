import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { applyDbEncryptionAtStartup } from "@/lib/db-encryption";

export const sqlite = new Database(process.env.DATABASE_URL || "./dispatch.db");
applyDbEncryptionAtStartup(sqlite);

export const db = drizzle(sqlite, { schema });
