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
const SHARE_AI_KEY_COLUMN = "shareAiApiKeyWithUsers";

function ensureAiSharingColumn() {
  const tableInfo = sqlite.pragma("table_info('security_setting')") as Array<{ name?: string }>;
  const hasColumn = tableInfo.some((column) => column?.name === SHARE_AI_KEY_COLUMN);
  if (hasColumn) return;

  sqlite.exec(
    `ALTER TABLE "security_setting" ADD COLUMN "${SHARE_AI_KEY_COLUMN}" integer NOT NULL DEFAULT 0;`,
  );
}

async function ensureSecuritySettingsRow() {
  ensureAiSharingColumn();

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
      shareAiApiKeyWithUsers: false,
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
    shareAiApiKeyWithUsers: Boolean(row.shareAiApiKeyWithUsers),
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

  const { enabled, passphrase, shareAiApiKeyWithUsers } = body as Record<string, unknown>;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return errorResponse("enabled must be a boolean when provided", 400);
  }
  if (shareAiApiKeyWithUsers !== undefined && typeof shareAiApiKeyWithUsers !== "boolean") {
    return errorResponse("shareAiApiKeyWithUsers must be a boolean when provided", 400);
  }
  if (enabled === undefined && shareAiApiKeyWithUsers === undefined) {
    return errorResponse("At least one setting must be provided", 400);
  }

  const sqlCipherAvailable = isSqlCipherAvailable(sqlite);
  const now = new Date().toISOString();
  const current = await ensureSecuritySettingsRow();
  const fileState = readDbEncryptionState();

  if (enabled === undefined) {
    await db
      .update(securitySettings)
      .set({
        shareAiApiKeyWithUsers: shareAiApiKeyWithUsers as boolean,
        updatedAt: now,
      })
      .where(eq(securitySettings.id, SETTINGS_ID));

    return jsonResponse({
      databaseEncryptionEnabled: Boolean(current.databaseEncryptionEnabled),
      shareAiApiKeyWithUsers: Boolean(shareAiApiKeyWithUsers),
      sqlCipherAvailable,
      configured: Boolean(fileState.encryptedKey),
      updatedAt: now,
    });
  }

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

    await db
      .update(securitySettings)
      .set({
        databaseEncryptionEnabled: true,
        shareAiApiKeyWithUsers:
          shareAiApiKeyWithUsers !== undefined
            ? (shareAiApiKeyWithUsers as boolean)
            : Boolean(current.shareAiApiKeyWithUsers),
        updatedAt: now,
      })
      .where(eq(securitySettings.id, SETTINGS_ID));

    return jsonResponse({
      databaseEncryptionEnabled: true,
      shareAiApiKeyWithUsers:
        shareAiApiKeyWithUsers !== undefined
          ? (shareAiApiKeyWithUsers as boolean)
          : Boolean(current.shareAiApiKeyWithUsers),
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

  await db
    .update(securitySettings)
    .set({
      databaseEncryptionEnabled: false,
      shareAiApiKeyWithUsers:
        shareAiApiKeyWithUsers !== undefined
          ? (shareAiApiKeyWithUsers as boolean)
          : Boolean(current.shareAiApiKeyWithUsers),
      updatedAt: now,
    })
    .where(eq(securitySettings.id, SETTINGS_ID));

  return jsonResponse({
    databaseEncryptionEnabled: false,
    shareAiApiKeyWithUsers:
      shareAiApiKeyWithUsers !== undefined
        ? (shareAiApiKeyWithUsers as boolean)
        : Boolean(current.shareAiApiKeyWithUsers),
    sqlCipherAvailable,
    configured: false,
    updatedAt: now,
  });
});
