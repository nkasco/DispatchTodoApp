import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";
import { chatConversations, chatMessages, users } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const listRoute = await import("@/app/api/ai/conversations/route");
const detailRoute = await import("@/app/api/ai/conversations/[id]/route");

const TEST_USER = {
  id: "user-chat-1",
  name: "Chat User",
  email: "chat@example.com",
  role: "member" as const,
  showAdminQuickAccess: true,
  assistantEnabled: true,
};

function postReq(body: unknown) {
  return new Request("http://localhost/api/ai/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putReq(url: string, body: unknown) {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI Conversations API", () => {
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

  it("POST creates a conversation", async () => {
    const res = await listRoute.POST(postReq({ title: "Daily planning" }), {});
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Daily planning");
  });

  it("POST without title generates a timestamped default title", async () => {
    const res = await listRoute.POST(postReq({}), {});
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toMatch(/^Conversation - /);
  });

  it("POST with a generic default title rewrites to a timestamped title", async () => {
    const res = await listRoute.POST(postReq({ title: "New conversation" }), {});
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toMatch(/^Conversation - /);
    expect(data.title).not.toBe("New conversation");
  });

  it("GET list includes message count and latest preview", async () => {
    const now = new Date().toISOString();
    testDb.db.insert(chatConversations).values({
      id: "conv-1",
      userId: TEST_USER.id,
      title: "Conv",
      createdAt: now,
      updatedAt: now,
    }).run();

    testDb.db.insert(chatMessages).values({
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "Hello assistant",
      createdAt: now,
      model: null,
      tokenCount: null,
    }).run();

    const res = await listRoute.GET(new Request("http://localhost/api/ai/conversations"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].messageCount).toBe(1);
    expect(data[0].lastMessage.content).toBe("Hello assistant");
  });

  it("GET list normalizes legacy generic conversation titles", async () => {
    const now = new Date().toISOString();
    testDb.db.insert(chatConversations).values({
      id: "conv-legacy-title",
      userId: TEST_USER.id,
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
    }).run();

    const res = await listRoute.GET(new Request("http://localhost/api/ai/conversations"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].title).toMatch(/^Conversation - /);
  });

  it("GET detail returns conversation and ui messages", async () => {
    const now = new Date().toISOString();
    testDb.db.insert(chatConversations).values({
      id: "conv-2",
      userId: TEST_USER.id,
      title: "Details",
      createdAt: now,
      updatedAt: now,
    }).run();
    testDb.db.insert(chatMessages).values({
      id: "msg-2",
      conversationId: "conv-2",
      role: "assistant",
      content: "Hi there",
      createdAt: now,
      model: "gpt-4o-mini",
      tokenCount: 12,
    }).run();

    const res = await detailRoute.GET(
      new Request("http://localhost/api/ai/conversations/conv-2"),
      { params: Promise.resolve({ id: "conv-2" }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.id).toBe("conv-2");
    expect(data.messages).toHaveLength(1);
    expect(data.uiMessages[0].parts[0].text).toBe("Hi there");
  });

  it("GET detail normalizes legacy generic conversation titles", async () => {
    const now = new Date().toISOString();
    testDb.db.insert(chatConversations).values({
      id: "conv-legacy-detail",
      userId: TEST_USER.id,
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
    }).run();

    const res = await detailRoute.GET(
      new Request("http://localhost/api/ai/conversations/conv-legacy-detail"),
      { params: Promise.resolve({ id: "conv-legacy-detail" }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.title).toMatch(/^Conversation - /);
  });

  it("PUT updates title and DELETE removes conversation", async () => {
    const now = new Date().toISOString();
    testDb.db.insert(chatConversations).values({
      id: "conv-3",
      userId: TEST_USER.id,
      title: "Old",
      createdAt: now,
      updatedAt: now,
    }).run();

    const updateRes = await detailRoute.PUT(
      putReq("http://localhost/api/ai/conversations/conv-3", { title: "Updated" }),
      { params: Promise.resolve({ id: "conv-3" }) },
    );
    expect(updateRes.status).toBe(200);

    const [updated] = testDb.db
      .select({ title: chatConversations.title })
      .from(chatConversations)
      .where(eq(chatConversations.id, "conv-3"))
      .all();
    expect(updated.title).toBe("Updated");

    const deleteRes = await detailRoute.DELETE(
      new Request("http://localhost/api/ai/conversations/conv-3", { method: "DELETE" }),
      { params: Promise.resolve({ id: "conv-3" }) },
    );
    expect(deleteRes.status).toBe(200);

    const remaining = testDb.db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, "conv-3"))
      .all();
    expect(remaining).toHaveLength(0);
  });
});
