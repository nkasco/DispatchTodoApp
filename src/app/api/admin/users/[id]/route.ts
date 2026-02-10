import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { withAdminAuth, jsonResponse, errorResponse } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

const VALID_ROLES = ["member", "admin"] as const;

type RouteContext = { params: Promise<{ id: string }> };

async function getUserById(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      frozenAt: users.frozenAt,
      password: users.password,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row;
}

async function countAdmins(): Promise<number> {
  const [{ count }] = await db
    .select({
      count: sql<number>`sum(case when ${users.role} = 'admin' then 1 else 0 end)`,
    })
    .from(users);

  return count ?? 0;
}

/** PUT /api/admin/users/[id] — mutate a user account (admin only) */
export const PUT = withAdminAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { action, role, password } = body as Record<string, unknown>;
  if (typeof action !== "string") {
    return errorResponse("action is required", 400);
  }

  const existing = await getUserById(id);
  if (!existing) {
    return errorResponse("User not found", 404);
  }

  if (action === "freeze") {
    if (id === session.user.id) {
      return errorResponse("You cannot freeze your own account", 400);
    }

    const [updated] = await db
      .update(users)
      .set({ frozenAt: existing.frozenAt ?? new Date().toISOString() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        frozenAt: users.frozenAt,
      });

    return jsonResponse({ ...updated, role: updated.role ?? "member" });
  }

  if (action === "unfreeze") {
    const [updated] = await db
      .update(users)
      .set({ frozenAt: null })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        frozenAt: users.frozenAt,
      });

    return jsonResponse({ ...updated, role: updated.role ?? "member" });
  }

  if (action === "set_role") {
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      return errorResponse(`role must be one of: ${VALID_ROLES.join(", ")}`, 400);
    }

    const nextRole = role as (typeof VALID_ROLES)[number];
    if (nextRole === "member" && existing.role === "admin") {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return errorResponse("At least one administrator account is required", 400);
      }
      if (id === session.user.id) {
        return errorResponse("You cannot demote your own administrator account", 400);
      }
    }

    const [updated] = await db
      .update(users)
      .set({ role: nextRole })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        frozenAt: users.frozenAt,
      });

    return jsonResponse({ ...updated, role: updated.role ?? "member" });
  }

  if (action === "reset_password") {
    if (!password || typeof password !== "string") {
      return errorResponse("password is required", 400);
    }

    if (password.length < 8) {
      return errorResponse("password must be at least 8 characters", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [updated] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        frozenAt: users.frozenAt,
      });

    return jsonResponse({ ...updated, role: updated.role ?? "member" });
  }

  return errorResponse("Unsupported action", 400);
});

/** DELETE /api/admin/users/[id] — remove a user account (admin only) */
export const DELETE = withAdminAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  if (id === session.user.id) {
    return errorResponse("You cannot delete your own account", 400);
  }

  const existing = await getUserById(id);
  if (!existing) {
    return errorResponse("User not found", 404);
  }

  if (existing.role === "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return errorResponse("At least one administrator account is required", 400);
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return jsonResponse({ deleted: true });
});

