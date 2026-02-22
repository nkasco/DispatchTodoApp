import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isValidTimeZone } from "@/lib/timezone";
import {
  parseStoredTemplatePresets,
  serializeTemplatePresets,
  validateTemplatePresetsInput,
} from "@/lib/template-presets";

export const GET = withAuth(async (_req, session) => {
  const [preferences] = await db
    .select({
      showAdminQuickAccess: users.showAdminQuickAccess,
      assistantEnabled: users.assistantEnabled,
      timeZone: users.timeZone,
      templatePresets: users.templatePresets,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return jsonResponse({
    user: session.user,
    showAdminQuickAccess: preferences?.showAdminQuickAccess ?? true,
    assistantEnabled: preferences?.assistantEnabled ?? true,
    timeZone: preferences?.timeZone ?? null,
    templatePresets: parseStoredTemplatePresets(preferences?.templatePresets),
  });
}, { allowApiKey: false });

export const PUT = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { showAdminQuickAccess, assistantEnabled, timeZone, templatePresets } = body as Record<string, unknown>;

  if (showAdminQuickAccess !== undefined && typeof showAdminQuickAccess !== "boolean") {
    return errorResponse("showAdminQuickAccess must be a boolean", 400);
  }

  if (assistantEnabled !== undefined && typeof assistantEnabled !== "boolean") {
    return errorResponse("assistantEnabled must be a boolean", 400);
  }

  if (timeZone !== undefined && timeZone !== null && typeof timeZone !== "string") {
    return errorResponse("timeZone must be a string or null", 400);
  }

  if (typeof timeZone === "string") {
    const trimmed = timeZone.trim();
    if (!trimmed) {
      return errorResponse("timeZone cannot be an empty string", 400);
    }
    if (!isValidTimeZone(trimmed)) {
      return errorResponse("timeZone must be a valid IANA timezone", 400);
    }
  }

  let validatedTemplatePresets: ReturnType<typeof parseStoredTemplatePresets> | undefined;
  if (templatePresets !== undefined) {
    try {
      validatedTemplatePresets = validateTemplatePresetsInput(templatePresets);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "Invalid templatePresets payload", 400);
    }
  }

  if (
    showAdminQuickAccess === undefined
    && assistantEnabled === undefined
    && timeZone === undefined
    && templatePresets === undefined
  ) {
    return errorResponse("At least one preference field is required", 400);
  }

  const updates: Record<string, unknown> = {};
  if (showAdminQuickAccess !== undefined) updates.showAdminQuickAccess = showAdminQuickAccess;
  if (assistantEnabled !== undefined) updates.assistantEnabled = assistantEnabled;
  if (timeZone !== undefined) updates.timeZone = typeof timeZone === "string" ? timeZone.trim() : null;
  if (validatedTemplatePresets !== undefined) {
    updates.templatePresets = serializeTemplatePresets(validatedTemplatePresets);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, session.user.id))
    .returning({
      showAdminQuickAccess: users.showAdminQuickAccess,
      assistantEnabled: users.assistantEnabled,
      timeZone: users.timeZone,
      templatePresets: users.templatePresets,
    });

  return jsonResponse({
    showAdminQuickAccess:
      updated?.showAdminQuickAccess ?? (showAdminQuickAccess as boolean | undefined) ?? true,
    assistantEnabled:
      updated?.assistantEnabled ?? (assistantEnabled as boolean | undefined) ?? true,
    timeZone: updated?.timeZone ?? (typeof timeZone === "string" ? timeZone.trim() : null),
    templatePresets: parseStoredTemplatePresets(updated?.templatePresets),
  });
}, { allowApiKey: false });
