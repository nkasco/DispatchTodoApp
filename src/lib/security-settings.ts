import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { securitySettings } from "@/db/schema";

const SETTINGS_ID = 1;

const SECURITY_SETTING_COLUMNS = [
  {
    name: "shareAiApiKeyWithUsers",
    statement:
      'ALTER TABLE "security_setting" ADD COLUMN "shareAiApiKeyWithUsers" integer NOT NULL DEFAULT 0;',
  },
  {
    name: "userRegistrationEnabled",
    statement:
      'ALTER TABLE "security_setting" ADD COLUMN "userRegistrationEnabled" integer NOT NULL DEFAULT 1;',
  },
] as const;

type SecuritySettingsRow = typeof securitySettings.$inferSelect;

function ensureSecuritySettingColumns() {
  const tableInfo = sqlite.pragma("table_info('security_setting')") as Array<{ name?: string }>;

  for (const column of SECURITY_SETTING_COLUMNS) {
    const hasColumn = tableInfo.some((entry) => entry?.name === column.name);
    if (!hasColumn) {
      sqlite.exec(column.statement);
    }
  }
}

export async function ensureSecuritySettingsRow(): Promise<SecuritySettingsRow> {
  ensureSecuritySettingColumns();

  const [existing] = await db
    .select()
    .from(securitySettings)
    .where(eq(securitySettings.id, SETTINGS_ID))
    .limit(1);

  if (existing) {
    return existing;
  }

  await db
    .insert(securitySettings)
    .values({
      id: SETTINGS_ID,
      databaseEncryptionEnabled: false,
      shareAiApiKeyWithUsers: false,
      userRegistrationEnabled: true,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: securitySettings.id });

  const [created] = await db
    .select()
    .from(securitySettings)
    .where(eq(securitySettings.id, SETTINGS_ID))
    .limit(1);

  if (!created) {
    throw new Error("Failed to initialize security settings.");
  }

  return created;
}

export async function isUserRegistrationEnabled(): Promise<boolean> {
  const settings = await ensureSecuritySettingsRow();
  return settings.userRegistrationEnabled ?? true;
}
