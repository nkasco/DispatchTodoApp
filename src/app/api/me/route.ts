import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const { showAdminQuickAccess, assistantEnabled } = body as Record<string, unknown>;

  if (showAdminQuickAccess !== undefined && typeof showAdminQuickAccess !== "boolean") {
    return errorResponse("showAdminQuickAccess must be a boolean", 400);
  }

  if (assistantEnabled !== undefined && typeof assistantEnabled !== "boolean") {
    return errorResponse("assistantEnabled must be a boolean", 400);
  }

  if (showAdminQuickAccess === undefined && assistantEnabled === undefined) {
    return errorResponse("At least one preference field is required", 400);
  }

  const updates: Record<string, unknown> = {};
  if (showAdminQuickAccess !== undefined) updates.showAdminQuickAccess = showAdminQuickAccess;
  if (assistantEnabled !== undefined) updates.assistantEnabled = assistantEnabled;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, session.user.id))
    .returning({
      showAdminQuickAccess: users.showAdminQuickAccess,
      assistantEnabled: users.assistantEnabled,
    });

  return jsonResponse({
    showAdminQuickAccess:
      updated?.showAdminQuickAccess ?? (showAdminQuickAccess as boolean | undefined) ?? true,
    assistantEnabled:
      updated?.assistantEnabled ?? (assistantEnabled as boolean | undefined) ?? true,
  });
}, { allowApiKey: false });
