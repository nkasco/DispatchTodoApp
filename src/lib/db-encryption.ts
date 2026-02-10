import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type Database from "better-sqlite3";

export type DbEncryptionState = {
  enabled: boolean;
  encryptedKey: string | null;
  updatedAt: string;
};

const DEFAULT_STATE: DbEncryptionState = {
  enabled: false,
  encryptedKey: null,
  updatedAt: new Date(0).toISOString(),
};

function resolveSecurityStatePath(): string {
  const overridePath = process.env.DISPATCH_SECURITY_CONFIG_PATH?.trim();
  if (overridePath) {
    return resolve(process.cwd(), overridePath);
  }

  const databasePath = process.env.DATABASE_URL?.trim();
  if (databasePath && !databasePath.startsWith("file:") && databasePath !== ":memory:") {
    return resolve(dirname(databasePath), ".dispatch-security.json");
  }

  return resolve(process.cwd(), ".dispatch-security.json");
}

const SECURITY_STATE_PATH = resolveSecurityStatePath();
let lastAppliedStateFingerprint: string | null = null;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required to manage database encryption settings.");
  }
  return secret;
}

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "dispatch-db-encryption", 32);
}

function normalizeState(value: unknown): DbEncryptionState {
  if (!value || typeof value !== "object") return DEFAULT_STATE;

  const candidate = value as Partial<DbEncryptionState>;
  const enabled = Boolean(candidate.enabled);
  const encryptedKey = typeof candidate.encryptedKey === "string" ? candidate.encryptedKey : null;
  const updatedAt =
    typeof candidate.updatedAt === "string" && candidate.updatedAt.length > 0
      ? candidate.updatedAt
      : DEFAULT_STATE.updatedAt;

  return {
    enabled,
    encryptedKey,
    updatedAt,
  };
}

export function readDbEncryptionState(): DbEncryptionState {
  if (!existsSync(SECURITY_STATE_PATH)) return DEFAULT_STATE;

  try {
    const raw = readFileSync(SECURITY_STATE_PATH, "utf-8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
}

export function writeDbEncryptionState(state: DbEncryptionState) {
  const dir = dirname(SECURITY_STATE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(SECURITY_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  lastAppliedStateFingerprint = null;
}

export function encryptDbPassphrase(passphrase: string): string {
  const iv = randomBytes(12);
  const key = deriveKey(getAuthSecret());
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(passphrase, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptDbPassphrase(payload: string): string {
  const [ivB64, authTagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted database key payload.");
  }

  const key = deriveKey(getAuthSecret());
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function resolveDbPassphrase(state: DbEncryptionState): string | null {
  if (!state.enabled || !state.encryptedKey) return null;
  return decryptDbPassphrase(state.encryptedKey);
}

function escapeSqliteString(value: string): string {
  return value.replace(/'/g, "''");
}

export function isSqlCipherAvailable(sqlite: Database.Database): boolean {
  try {
    const version = sqlite.pragma("cipher_version", { simple: true }) as unknown;
    if (typeof version === "string" && version.trim().length > 0) {
      return true;
    }
  } catch {
    // Continue to sqlite3mc probe.
  }

  try {
    const cipher = sqlite.pragma("cipher", { simple: true }) as unknown;
    return typeof cipher === "string" && cipher.trim().length > 0;
  } catch {
    return false;
  }
}

export function applySqlCipherKey(sqlite: Database.Database, passphrase: string) {
  sqlite.pragma(`key = '${escapeSqliteString(passphrase)}'`);
}

export function applySqlCipherRekey(sqlite: Database.Database, passphrase: string) {
  sqlite.pragma(`rekey = '${escapeSqliteString(passphrase)}'`);
}

export function verifyDatabaseReadable(sqlite: Database.Database): boolean {
  try {
    sqlite.prepare("SELECT count(*) as count FROM sqlite_master").get();
    return true;
  } catch {
    return false;
  }
}

export function applyDbEncryptionAtStartup(sqlite: Database.Database) {
  return ensureDbEncryptionForRuntime(sqlite);
}

function getStateFingerprint(state: DbEncryptionState): string {
  return `${state.enabled ? "1" : "0"}:${state.updatedAt}`;
}

export function ensureDbEncryptionForRuntime(sqlite: Database.Database) {
  const state = readDbEncryptionState();
  const fingerprint = getStateFingerprint(state);
  if (lastAppliedStateFingerprint === fingerprint) {
    return state;
  }

  if (!state.enabled) {
    if (isSqlCipherAvailable(sqlite)) {
      applySqlCipherKey(sqlite, "");
    }
    if (!verifyDatabaseReadable(sqlite)) {
      throw new Error("Failed to read the unencrypted database after encryption state update.");
    }
    lastAppliedStateFingerprint = fingerprint;
    return state;
  }

  if (!isSqlCipherAvailable(sqlite)) {
    throw new Error("Database encryption is enabled but SQLCipher support is not available.");
  }

  const passphrase = resolveDbPassphrase(state);
  if (!passphrase) {
    throw new Error("Database encryption is enabled but no passphrase is configured.");
  }

  applySqlCipherKey(sqlite, passphrase);
  if (!verifyDatabaseReadable(sqlite)) {
    throw new Error("Failed to unlock the encrypted database with the configured passphrase.");
  }

  lastAppliedStateFingerprint = fingerprint;
  return state;
}
