import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";
import { aiConfigs, chatConversations, chatMessages, users } from "@/db/schema";
import { encryptAiApiKey } from "@/lib/ai-encryption";

let testDb: ReturnType<typeof createTestDb>;
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "dispatch-test-secret";

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const streamTextMock = vi.fn((options: any) => ({
  toUIMessageStreamResponse: () => {
    void options.onFinish?.({
      text: "Assistant response",
      totalUsage: { totalTokens: 42 },
    });
    return new Response("ok", { status: 200 });
  },
}));

vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(async () => []),
  stepCountIs: vi.fn(() => () => false),
  streamText: streamTextMock,
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: vi.fn(async () => ({
    tools: vi.fn(async () => ({})),
    close: vi.fn(async () => undefined),
  })),
}));

const { POST } = await import("@/app/api/ai/chat/route");

const TEST_USER = {
  id: "user-chat-route",
  name: "Assistant User",
  email: "assistant@example.com",
  role: "member" as const,
  showAdminQuickAccess: true,
  assistantEnabled: true,
};

function chatReq(body: unknown) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI Chat API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    streamTextMock.mockClear();

    testDb.db.insert(users).values(TEST_USER).run();
    testDb.db.insert(chatConversations).values({
      id: "conv-chat-1",
      userId: TEST_USER.id,
      title: "Conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

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

  it("returns 400 when no AI config exists", async () => {
    const res = await POST(
      chatReq({
        conversationId: "conv-chat-1",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("streams and persists user + assistant messages", async () => {
    testDb.db.insert(aiConfigs).values({
      id: "cfg-1",
      userId: TEST_USER.id,
      provider: "openai",
      apiKey: encryptAiApiKey("sk-test-xyz"),
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    const res = await POST(
      chatReq({
        conversationId: "conv-chat-1",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Plan my day" }] }],
      }),
      {},
    );

    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const call = streamTextMock.mock.calls[0]?.[0] as { system?: string } | undefined;
    expect(call?.system).toContain("You are Dispatch Personal Assistant");
    expect(call?.system).toContain(`Today is ${new Date().toISOString().slice(0, 10)} (UTC).`);
    expect(call?.system).toContain("Scope: help with Dispatch tasks, notes, projects, dispatches, and search.");

    await new Promise((resolve) => setTimeout(resolve, 0));

    const saved = testDb.db
      .select({
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, "conv-chat-1"))
      .all();

    expect(saved).toHaveLength(2);
    expect(saved.some((row) => row.role === "user" && row.content === "Plan my day")).toBe(true);
    expect(saved.some((row) => row.role === "assistant" && row.content === "Assistant response")).toBe(true);

    const [conversation] = testDb.db
      .select({ updatedAt: chatConversations.updatedAt })
      .from(chatConversations)
      .where(and(eq(chatConversations.id, "conv-chat-1"), eq(chatConversations.userId, TEST_USER.id)))
      .all();
    expect(conversation.updatedAt).toBeTruthy();
  });
});
