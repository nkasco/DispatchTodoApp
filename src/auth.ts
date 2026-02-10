import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, sqlite } from "@/db";
import { users, accounts, sessions } from "@/db/schema";
import { ensureDbEncryptionForRuntime } from "@/lib/db-encryption";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

type UserRole = "member" | "admin";

function ensureAuthDatabaseReady() {
  ensureDbEncryptionForRuntime(sqlite);
}

function isStaleJwtSecretError(code: unknown, details: unknown[]): boolean {
  if (typeof code !== "string" || code !== "JWTSessionError") return false;

  const hasSecretMismatchText = (value: unknown): boolean => {
    if (typeof value === "string") {
      return value.toLowerCase().includes("no matching decryption secret");
    }
    if (!value || typeof value !== "object") return false;

    const obj = value as Record<string, unknown>;
    return (
      hasSecretMismatchText(obj.message) ||
      hasSecretMismatchText(obj.cause) ||
      hasSecretMismatchText(obj.error)
    );
  };

  return details.some(hasSecretMismatchText);
}

async function getUserAccess(
  userId: string,
): Promise<{ role: UserRole; isFrozen: boolean; showAdminQuickAccess: boolean }> {
  ensureAuthDatabaseReady();
  const [dbUser] = await db
    .select({
      role: users.role,
      frozenAt: users.frozenAt,
      showAdminQuickAccess: users.showAdminQuickAccess,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    role: (dbUser?.role as UserRole | undefined) ?? "member",
    isFrozen: Boolean(dbUser?.frozenAt),
    showAdminQuickAccess: dbUser?.showAdminQuickAccess ?? true,
  };
}

const providers = [];

// Only add GitHub if credentials are configured
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub);
}

// Credentials provider for local accounts
providers.push(
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      ensureAuthDatabaseReady();
      const email = credentials?.email as string;
      const password = credentials?.password as string;

      if (!email || !password) return null;

      // Find user by email
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !user.password) return null;
      if (user.frozenAt) return null;

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role ?? "member",
        isFrozen: false,
        showAdminQuickAccess: user.showAdminQuickAccess ?? true,
      };
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  providers,
  // Always use JWT — the adapter still persists users/accounts on OAuth sign-in,
  // but JWT avoids the incompatibility between Credentials provider and database sessions.
  session: { strategy: "jwt" },
  logger: {
    error(code, ...message) {
      // Ignore one-time stale session cookies after AUTH_SECRET rotations.
      if (isStaleJwtSecretError(code, message)) return;
      console.error(`[auth][error] ${code}`, ...message);
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      ensureAuthDatabaseReady();
      // Block sign-in if the user record wasn't created (shouldn't happen, but guard)
      if (!user?.id) return false;
      const [dbUser] = await db
        .select({ id: users.id, role: users.role, frozenAt: users.frozenAt })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (!dbUser || dbUser.frozenAt) return false;

      // First account bootstrap: first account in the instance becomes admin.
      const [{ userCount }] = await db.select({ userCount: sql<number>`count(*)` }).from(users);
      if ((userCount ?? 0) === 1 && dbUser.role !== "admin") {
        await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
      }

      // For OAuth providers, check if this provider account is already linked to a different user.
      // The adapter handles linking automatically, but this guards against edge cases.
      if (account?.provider && account.provider !== "credentials") {
        const existing = await db
          .select()
          .from(accounts)
          .where(eq(accounts.providerAccountId, account.providerAccountId))
          .limit(1);
        if (existing.length > 0 && existing[0].userId !== user.id) {
          // This GitHub account is already linked to another user — reject
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user, account }) {
      // On initial sign-in, persist user id and provider info into the JWT
      if (user?.id) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      if (account) {
        token.provider = account.provider;
      }

      if (token.sub) {
        try {
          const access = await getUserAccess(token.sub);
          token.role = access.role;
          token.isFrozen = access.isFrozen;
          token.showAdminQuickAccess = access.showAdminQuickAccess;
        } catch (error) {
          // Avoid invalidating the active session during transient rekey transitions.
          console.error("Failed to refresh JWT access claims from database:", error);
          token.role = (token.role as UserRole | undefined) ?? "member";
          token.isFrozen = Boolean(token.isFrozen);
          token.showAdminQuickAccess = (token.showAdminQuickAccess as boolean | undefined) ?? true;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (token?.sub && session.user) {
        session.user.id = token.sub;
        session.user.role = (token.role as UserRole | undefined) ?? "member";
        session.user.isFrozen = Boolean(token.isFrozen);
        session.user.showAdminQuickAccess = (token.showAdminQuickAccess as boolean | undefined) ?? true;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
