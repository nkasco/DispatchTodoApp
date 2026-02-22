import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb } from "@/test/db";
import { users } from "@/db/schema";

type TestDb = ReturnType<typeof createTestDb>;

describe("Credentials auth email normalization", () => {
  let testDb: TestDb;
  let capturedConfig: { providers?: Array<{ id?: string; authorize?: (credentials: Record<string, unknown>) => Promise<unknown> }> } | null;

  beforeEach(() => {
    testDb = createTestDb();
    capturedConfig = null;
  });

  afterEach(() => {
    testDb.sqlite.close();
  });

  async function loadAuthorize() {
    vi.resetModules();
    vi.unmock("@/auth");

    vi.doMock("@/db", () => ({
      get db() {
        return testDb.db;
      },
      get sqlite() {
        return testDb.sqlite;
      },
    }));
    vi.doMock("@/lib/db-encryption", () => ({
      ensureDbEncryptionForRuntime: vi.fn(),
    }));
    vi.doMock("@auth/drizzle-adapter", () => ({
      DrizzleAdapter: vi.fn(() => ({})),
    }));
    vi.doMock("next-auth/providers/github", () => ({
      default: vi.fn(() => ({ id: "github" })),
    }));
    vi.doMock("next-auth/providers/credentials", () => ({
      default: vi.fn((config: Record<string, unknown>) => ({ id: "credentials", ...config })),
    }));
    vi.doMock("next-auth", () => ({
      default: vi.fn((config: typeof capturedConfig) => {
        capturedConfig = config;
        return {
          handlers: {},
          auth: vi.fn(),
          signIn: vi.fn(),
        };
      }),
    }));

    await import("@/auth");

    const credentialsProvider = capturedConfig?.providers?.find((provider) => provider.id === "credentials");
    if (!credentialsProvider?.authorize) {
      throw new Error("Credentials provider authorize callback was not found.");
    }

    return credentialsProvider.authorize;
  }

  async function seedCredentialsUser() {
    await testDb.db.insert(users).values({
      id: "user-1",
      email: "person@example.com",
      name: "Person",
      password: await bcrypt.hash("test12345", 10),
      role: "member",
    });
  }

  it("authenticates with mixed-case email", async () => {
    await seedCredentialsUser();
    const authorize = await loadAuthorize();

    const result = await authorize({
      email: "Person@Example.COM",
      password: "test12345",
    });

    expect(result).toMatchObject({
      id: "user-1",
      email: "person@example.com",
    });
  });

  it("authenticates with surrounding whitespace in email", async () => {
    await seedCredentialsUser();
    const authorize = await loadAuthorize();

    const result = await authorize({
      email: "  person@example.com   ",
      password: "test12345",
    });

    expect(result).toMatchObject({
      id: "user-1",
      email: "person@example.com",
    });
  });
});
