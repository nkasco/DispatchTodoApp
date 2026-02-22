import bcrypt from "bcryptjs";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { withAdminAuth, jsonResponse, errorResponse } from "@/lib/api";
import { normalizeEmail, isValidEmail } from "@/lib/auth-email";
import { USER_CREATION_DISABLED_MESSAGE } from "@/lib/security-messages";
import { isUserRegistrationEnabled } from "@/lib/security-settings";
import { eq } from "drizzle-orm";

const VALID_ROLES = ["member", "admin"] as const;

/** GET /api/admin/users — list all users (admin only) */
export const GET = withAdminAuth(async () => {
  const [userRows, accountRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        frozenAt: users.frozenAt,
        password: users.password,
      })
      .from(users)
      .orderBy(users.email),
    db
      .select({
        userId: accounts.userId,
        provider: accounts.provider,
      })
      .from(accounts),
  ]);

  const providersByUser = new Map<string, string[]>();
  for (const account of accountRows) {
    const existing = providersByUser.get(account.userId) ?? [];
    if (!existing.includes(account.provider)) {
      existing.push(account.provider);
      providersByUser.set(account.userId, existing);
    }
  }

  return jsonResponse(
    userRows.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role ?? "member",
      frozenAt: user.frozenAt,
      hasPassword: Boolean(user.password),
      providers: providersByUser.get(user.id) ?? [],
    })),
  );
});

/** POST /api/admin/users — create a user account (admin only) */
export const POST = withAdminAuth(async (req) => {
  if (!(await isUserRegistrationEnabled())) {
    return errorResponse(USER_CREATION_DISABLED_MESSAGE, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { name, email, password, role } = body as Record<string, unknown>;

  if (!email || typeof email !== "string") {
    return errorResponse("email is required", 400);
  }

  if (!password || typeof password !== "string") {
    return errorResponse("password is required", 400);
  }

  if (password.length < 8) {
    return errorResponse("password must be at least 8 characters", 400);
  }

  if (name !== undefined && typeof name !== "string") {
    return errorResponse("name must be a string", 400);
  }

  if (role !== undefined && !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return errorResponse(`role must be one of: ${VALID_ROLES.join(", ")}`, 400);
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return errorResponse("Invalid email format", 400);
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    return errorResponse("Email already registered", 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name: typeof name === "string" && name.trim().length > 0 ? name.trim() : normalizedEmail.split("@")[0],
      email: normalizedEmail,
      password: hashedPassword,
      role: (role as (typeof VALID_ROLES)[number] | undefined) ?? "member",
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      frozenAt: users.frozenAt,
    });

  return jsonResponse(
    {
      ...created,
      role: created.role ?? "member",
      hasPassword: true,
      providers: [],
    },
    201,
  );
});
