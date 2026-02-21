import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isValidTimeZone } from "@/lib/timezone";

export const GET = withAuth(async (_req, session) => {
  return jsonResponse({ user: session.user });
}, { allowApiKey: false });

export const PUT = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { showAdminQuickAccess, assistantEnabled, timeZone } = body as Record<string, unknown>;

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

  if (showAdminQuickAccess === undefined && assistantEnabled === undefined && timeZone === undefined) {
    return errorResponse("At least one preference field is required", 400);
  }

  const updates: Record<string, unknown> = {};
  if (showAdminQuickAccess !== undefined) updates.showAdminQuickAccess = showAdminQuickAccess;
  if (assistantEnabled !== undefined) updates.assistantEnabled = assistantEnabled;
  if (timeZone !== undefined) updates.timeZone = typeof timeZone === "string" ? timeZone.trim() : null;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, session.user.id))
    .returning({
      showAdminQuickAccess: users.showAdminQuickAccess,
      assistantEnabled: users.assistantEnabled,
      timeZone: users.timeZone,
    });

  return jsonResponse({
    showAdminQuickAccess:
      updated?.showAdminQuickAccess ?? (showAdminQuickAccess as boolean | undefined) ?? true,
    assistantEnabled:
      updated?.assistantEnabled ?? (assistantEnabled as boolean | undefined) ?? true,
    timeZone: updated?.timeZone ?? (typeof timeZone === "string" ? timeZone.trim() : null),
  });
}, { allowApiKey: false });
