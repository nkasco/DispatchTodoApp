import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { jsonResponse, errorResponse } from "@/lib/api";
import { normalizeEmail, isValidEmail } from "@/lib/auth-email";
import { USER_CREATION_DISABLED_MESSAGE } from "@/lib/security-messages";
import { isUserRegistrationEnabled } from "@/lib/security-settings";

export async function POST(req: NextRequest) {
  try {
    if (!(await isUserRegistrationEnabled())) {
      return errorResponse(USER_CREATION_DISABLED_MESSAGE, 403);
    }

    const body = await req.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || !password) {
      return errorResponse("Email and password are required", 400);
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return errorResponse("Invalid input", 400);
    }

    const normalizedEmail = normalizeEmail(email);

    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      return errorResponse("Invalid email format", 400);
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      return errorResponse("Password must be at least 8 characters", 400);
    }

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return errorResponse("Email already registered", 409);
    }

    const [{ userCount }] = await db
      .select({ userCount: sql<number>`count(*)` })
      .from(users);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: normalizedEmail,
      name: name || normalizedEmail.split("@")[0],
      password: hashedPassword,
      role: (userCount ?? 0) === 0 ? "admin" : "member",
    });

    return jsonResponse(
      { message: "Registration successful" },
      201
    );
  } catch (error) {
    console.error("Registration error:", error);
    return errorResponse("Registration failed", 500);
  }
}
