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

  const { showAdminQuickAccess } = body as Record<string, unknown>;

  if (typeof showAdminQuickAccess !== "boolean") {
    return errorResponse("showAdminQuickAccess must be a boolean", 400);
  }

  const [updated] = await db
    .update(users)
    .set({ showAdminQuickAccess })
    .where(eq(users.id, session.user.id))
    .returning({
      showAdminQuickAccess: users.showAdminQuickAccess,
    });

  return jsonResponse({
    showAdminQuickAccess: updated?.showAdminQuickAccess ?? showAdminQuickAccess,
  });
}, { allowApiKey: false });
