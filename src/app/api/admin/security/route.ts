import { db, sqlite } from "@/db";
import { securitySettings } from "@/db/schema";
import { withAdminAuth, jsonResponse, errorResponse } from "@/lib/api";
import { ensureSecuritySettingsRow } from "@/lib/security-settings";
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

/** GET /api/admin/security — current security/encryption status (admin only) */
export const GET = withAdminAuth(async () => {
  const row = await ensureSecuritySettingsRow();
  const fileState = readDbEncryptionState();

  return jsonResponse({
    databaseEncryptionEnabled: Boolean(row.databaseEncryptionEnabled),
    shareAiApiKeyWithUsers: Boolean(row.shareAiApiKeyWithUsers),
    userRegistrationEnabled: row.userRegistrationEnabled ?? true,
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

  const { enabled, passphrase, shareAiApiKeyWithUsers, userRegistrationEnabled } = body as Record<string, unknown>;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return errorResponse("enabled must be a boolean when provided", 400);
  }
  if (shareAiApiKeyWithUsers !== undefined && typeof shareAiApiKeyWithUsers !== "boolean") {
    return errorResponse("shareAiApiKeyWithUsers must be a boolean when provided", 400);
  }
  if (userRegistrationEnabled !== undefined && typeof userRegistrationEnabled !== "boolean") {
    return errorResponse("userRegistrationEnabled must be a boolean when provided", 400);
  }
  if (enabled === undefined && shareAiApiKeyWithUsers === undefined && userRegistrationEnabled === undefined) {
    return errorResponse("At least one setting must be provided", 400);
  }

  const sqlCipherAvailable = isSqlCipherAvailable(sqlite);
  const now = new Date().toISOString();
  const current = await ensureSecuritySettingsRow();
  const fileState = readDbEncryptionState();
  const nextShareAiApiKeyWithUsers =
    shareAiApiKeyWithUsers !== undefined
      ? (shareAiApiKeyWithUsers as boolean)
      : Boolean(current.shareAiApiKeyWithUsers);
  const nextUserRegistrationEnabled =
    userRegistrationEnabled !== undefined
      ? (userRegistrationEnabled as boolean)
      : (current.userRegistrationEnabled ?? true);

  if (enabled === undefined) {
    await db
      .update(securitySettings)
      .set({
        shareAiApiKeyWithUsers: nextShareAiApiKeyWithUsers,
        userRegistrationEnabled: nextUserRegistrationEnabled,
        updatedAt: now,
      })
      .where(eq(securitySettings.id, SETTINGS_ID));

    return jsonResponse({
      databaseEncryptionEnabled: Boolean(current.databaseEncryptionEnabled),
      shareAiApiKeyWithUsers: nextShareAiApiKeyWithUsers,
      userRegistrationEnabled: nextUserRegistrationEnabled,
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
        shareAiApiKeyWithUsers: nextShareAiApiKeyWithUsers,
        userRegistrationEnabled: nextUserRegistrationEnabled,
        updatedAt: now,
      })
      .where(eq(securitySettings.id, SETTINGS_ID));

    return jsonResponse({
      databaseEncryptionEnabled: true,
      shareAiApiKeyWithUsers: nextShareAiApiKeyWithUsers,
      userRegistrationEnabled: nextUserRegistrationEnabled,
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
      shareAiApiKeyWithUsers: nextShareAiApiKeyWithUsers,
      userRegistrationEnabled: nextUserRegistrationEnabled,
      updatedAt: now,
    })
    .where(eq(securitySettings.id, SETTINGS_ID));

  return jsonResponse({
    databaseEncryptionEnabled: false,
    shareAiApiKeyWithUsers: nextShareAiApiKeyWithUsers,
    userRegistrationEnabled: nextUserRegistrationEnabled,
    sqlCipherAvailable,
    configured: false,
    updatedAt: now,
  });
});
