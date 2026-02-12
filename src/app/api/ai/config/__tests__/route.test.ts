import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";
import { aiConfigs, securitySettings, users } from "@/db/schema";
import { encryptAiApiKey } from "@/lib/ai-encryption";

let testDb: ReturnType<typeof createTestDb>;
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "dispatch-test-secret";

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const { GET, PUT } = await import("@/app/api/ai/config/route");

const TEST_USER = {
  id: "user-ai-1",
  name: "AI User",
  email: "ai@example.com",
  role: "member" as const,
  showAdminQuickAccess: true,
  assistantEnabled: true,
};

function putReq(body: unknown) {
  return new Request("http://localhost/api/ai/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI Config API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.db.insert(users).values(TEST_USER).run();
    mockSession({
      user: {
        id: TEST_USER.id,
        name: TEST_USER.name,
        email: TEST_USER.email,
        role: TEST_USER.role,
        assistantEnabled: true,
      },
    });
  });

  it("GET returns null when config is not set", async () => {
    const res = await GET(new Request("http://localhost/api/ai/config"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config).toBeNull();
    expect(data.readOnly).toBe(false);
  });

  it("GET falls back to shared admin API key when enabled", async () => {
    testDb.db.insert(users).values({
      id: "admin-ai-1",
      name: "Admin AI",
      email: "admin-ai@example.com",
      role: "admin",
      showAdminQuickAccess: true,
      assistantEnabled: true,
    }).run();

    testDb.db.insert(aiConfigs).values({
      id: "cfg-admin-shared",
      userId: "admin-ai-1",
      provider: "openai",
      apiKey: encryptAiApiKey("sk-shared-admin-123"),
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    testDb.db.insert(securitySettings).values({
      id: 1,
      databaseEncryptionEnabled: false,
      shareAiApiKeyWithUsers: true,
      updatedAt: new Date().toISOString(),
    }).run();

    const res = await GET(new Request("http://localhost/api/ai/config"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config).not.toBeNull();
    expect(data.config.provider).toBe("openai");
    expect(data.config.hasApiKey).toBe(true);
    expect(data.readOnly).toBe(true);
  });

  it("PUT is rejected for member users when admin key sharing is enabled", async () => {
    testDb.db.insert(securitySettings).values({
      id: 1,
      databaseEncryptionEnabled: false,
      shareAiApiKeyWithUsers: true,
      updatedAt: new Date().toISOString(),
    }).run();

    const res = await PUT(
      putReq({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-should-be-blocked",
      }),
      {},
    );

    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error).toContain("read-only");
  });

  it("PUT remains available for admins when admin key sharing is enabled", async () => {
    mockSession({
      user: {
        id: TEST_USER.id,
        name: TEST_USER.name,
        email: TEST_USER.email,
        role: "admin",
        assistantEnabled: true,
      },
    });

    testDb.db.insert(securitySettings).values({
      id: 1,
      databaseEncryptionEnabled: false,
      shareAiApiKeyWithUsers: true,
      updatedAt: new Date().toISOString(),
    }).run();

    const res = await PUT(
      putReq({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-admin-still-allowed",
      }),
      {},
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.config.provider).toBe("openai");
    expect(payload.config.hasApiKey).toBe(true);
  });

  it("PUT creates config and encrypts API key", async () => {
    const res = await PUT(
      putReq({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-test-1234567890",
      }),
      {},
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.config.provider).toBe("openai");
    expect(payload.config.hasApiKey).toBe(true);
    expect(payload.config.maskedApiKey).toContain("...");

    const [stored] = testDb.db
      .select({ apiKey: aiConfigs.apiKey, provider: aiConfigs.provider })
      .from(aiConfigs)
      .where(eq(aiConfigs.userId, TEST_USER.id))
      .all();

    expect(stored.provider).toBe("openai");
    expect(stored.apiKey).toBeTruthy();
    expect(stored.apiKey).not.toContain("sk-test-1234567890");
  });

  it("GET returns masked key only", async () => {
    await PUT(
      putReq({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-test-abcdef123456",
      }),
      {},
    );

    const res = await GET(new Request("http://localhost/api/ai/config"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.hasApiKey).toBe(true);
    expect(data.config.maskedApiKey).toContain("...");
  });

  it("PUT rejects invalid provider", async () => {
    const res = await PUT(
      putReq({
        provider: "not-a-provider",
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("clears saved api key when switching providers without a new key", async () => {
    const first = await PUT(
      putReq({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-test-initial-openai",
      }),
      {},
    );
    expect(first.status).toBe(200);

    const second = await PUT(
      putReq({
        provider: "anthropic",
        model: "claude-3-5-haiku-latest",
      }),
      {},
    );
    expect(second.status).toBe(200);

    const payload = await second.json();
    expect(payload.config.provider).toBe("anthropic");
    expect(payload.config.hasApiKey).toBe(false);
    expect(payload.config.maskedApiKey).toBeNull();
  });
});
