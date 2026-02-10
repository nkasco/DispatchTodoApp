import { db, sqlite } from "@/db";
import { securitySettings } from "@/db/schema";
import { withAdminAuth, jsonResponse, errorResponse } from "@/lib/api";
import {
  applySqlCipherKey,
  applySqlCipherRekey,
  decryptDbPassphrase,
  encryptDbPassphrase,
  isSqlCipherAvailable,
  readDbEncryptionState,
  verifyDatabaseReadable,
  writeDbEncryptionState,
} from "@/lib/db-encryption";
import { eq } from "drizzle-orm";

const SETTINGS_ID = 1;

async function ensureSecuritySettingsRow() {
  const [existing] = await db
    .select()
    .from(securitySettings)
    .where(eq(securitySettings.id, SETTINGS_ID))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(securitySettings)
    .values({
      id: SETTINGS_ID,
      databaseEncryptionEnabled: false,
      updatedAt: new Date().toISOString(),
    })
    .returning();

  return created;
}

/** GET /api/admin/security — current security/encryption status (admin only) */
export const GET = withAdminAuth(async () => {
  const row = await ensureSecuritySettingsRow();
  const fileState = readDbEncryptionState();

  return jsonResponse({
    databaseEncryptionEnabled: Boolean(row.databaseEncryptionEnabled),
    sqlCipherAvailable: isSqlCipherAvailable(sqlite),
    configured: Boolean(fileState.encryptedKey),
    updatedAt: row.updatedAt,
  });
});

/** PUT /api/admin/security — enable/disable database encryption (admin only) */
export const PUT = withAdminAuth(async (req) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { enabled, passphrase } = body as Record<string, unknown>;
  if (typeof enabled !== "boolean") {
    return errorResponse("enabled must be a boolean", 400);
  }

  const sqlCipherAvailable = isSqlCipherAvailable(sqlite);
  const now = new Date().toISOString();
  const fileState = readDbEncryptionState();

  if (enabled) {
    if (!sqlCipherAvailable) {
      return errorResponse("SQLCipher support is not available in this runtime.", 400);
    }

    if (!passphrase || typeof passphrase !== "string") {
      return errorResponse("passphrase is required when enabling encryption", 400);
    }

    if (passphrase.length < 12) {
      return errorResponse("passphrase must be at least 12 characters", 400);
    }

    try {
      if (fileState.enabled && fileState.encryptedKey) {
        applySqlCipherKey(sqlite, decryptDbPassphrase(fileState.encryptedKey));
      }
      applySqlCipherRekey(sqlite, passphrase);
      if (!verifyDatabaseReadable(sqlite)) {
        return errorResponse("Database could not be verified after encryption update", 500);
      }
    } catch (error) {
      console.error("Failed to enable database encryption:", error);
      return errorResponse("Failed to enable database encryption", 500);
    }

    writeDbEncryptionState({
      enabled: true,
      encryptedKey: encryptDbPassphrase(passphrase),
      updatedAt: now,
    });

    await ensureSecuritySettingsRow();
    await db
      .update(securitySettings)
      .set({
        databaseEncryptionEnabled: true,
        updatedAt: now,
      })
      .where(eq(securitySettings.id, SETTINGS_ID));

    return jsonResponse({
      databaseEncryptionEnabled: true,
      sqlCipherAvailable: true,
      configured: true,
      updatedAt: now,
    });
  }

  if (fileState.enabled && fileState.encryptedKey) {
    if (!sqlCipherAvailable) {
      return errorResponse("SQLCipher support is required to disable current encrypted database.", 400);
    }

    try {
      applySqlCipherKey(sqlite, decryptDbPassphrase(fileState.encryptedKey));
      applySqlCipherRekey(sqlite, "");
      if (!verifyDatabaseReadable(sqlite)) {
        return errorResponse("Database could not be verified after encryption update", 500);
      }
    } catch (error) {
      console.error("Failed to disable database encryption:", error);
      return errorResponse("Failed to disable database encryption", 500);
    }
  }

  writeDbEncryptionState({
    enabled: false,
    encryptedKey: null,
    updatedAt: now,
  });

  await ensureSecuritySettingsRow();
  await db
    .update(securitySettings)
    .set({
      databaseEncryptionEnabled: false,
      updatedAt: now,
    })
    .where(eq(securitySettings.id, SETTINGS_ID));

  return jsonResponse({
    databaseEncryptionEnabled: false,
    sqlCipherAvailable,
    configured: false,
    updatedAt: now,
  });
});

