import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { integrationTaskMappings, projects, tasks, users } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const service = await import("@/lib/integrations/service");

const TEST_USER = {
  id: "user-1",
  name: "Connector User",
  email: "connector@example.com",
  role: "member" as const,
  timeZone: "UTC",
};

describe("integration service", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "dispatch-test-secret";
    testDb = createTestDb();
    mockFetch.mockReset();
    testDb.db.insert(users).values(TEST_USER).run();
    testDb.db.insert(projects).values({
      id: "project-1",
      userId: TEST_USER.id,
      name: "Platform",
      status: "active",
      color: "blue",
    }).run();
    testDb.db.insert(tasks).values({
      id: "task-1",
      userId: TEST_USER.id,
      projectId: "project-1",
      title: "Sync this task",
      description: "Connector sync",
      status: "open",
      priority: "high",
      dueDate: "2026-03-05",
      recurrenceType: "none",
      recurrenceBehavior: "after_completion",
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }).run();
  });

  it("creates and lists sanitized connectors", async () => {
    await service.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "bidirectional",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });

    const connections = await service.listConnectionsForUser(TEST_USER.id);
    expect(connections).toHaveLength(1);
    expect(connections[0].auth.hasToken).toBe(true);
    expect(connections[0].auth.maskedToken).not.toContain("secret-token");
    expect(connections[0].webhookUrl).toContain("/api/integrations/connectors/");
  });

  it("enqueues and delivers task mutations through the REST connector outbox", async () => {
    const connector = await service.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "push",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "remote-task-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await service.enqueueTaskMutationForConnectors({
      userId: TEST_USER.id,
      taskId: "task-1",
      action: "create",
    });

    const result = await service.processConnectorOutbox({
      userId: TEST_USER.id,
      connectionId: connector!.id,
    });

    expect(result.delivered).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://tasks.example.com/api/tasks",
      expect.objectContaining({ method: "POST" }),
    );

    const [mapping] = testDb.db
      .select({ externalTaskId: integrationTaskMappings.externalTaskId })
      .from(integrationTaskMappings)
      .where(eq(integrationTaskMappings.taskId, "task-1"))
      .all();

    expect(mapping.externalTaskId).toBe("remote-task-1");
  });

  it("marks webhook conflicts when an external change arrives after a newer local edit", async () => {
    const connector = await service.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "bidirectional",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });

    testDb.db.insert(integrationTaskMappings).values({
      connectionId: connector!.id,
      taskId: "task-1",
      projectId: "project-1",
      externalTaskId: "remote-task-1",
      conflictState: "none",
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }).run();

    testDb.db
      .update(tasks)
      .set({ updatedAt: "2026-03-02T12:00:00.000Z" })
      .where(eq(tasks.id, "task-1"))
      .run();

    await service.handleConnectorWebhook({
      userId: TEST_USER.id,
      connectionId: connector!.id,
      secret: connector!.webhookSecret,
      payload: {
        externalTaskId: "remote-task-1",
        updatedAt: "2026-03-01T11:00:00.000Z",
        title: "External title",
      },
    });

    const [mapping] = testDb.db
      .select({
        conflictState: integrationTaskMappings.conflictState,
        conflictMessage: integrationTaskMappings.conflictMessage,
      })
      .from(integrationTaskMappings)
      .where(eq(integrationTaskMappings.taskId, "task-1"))
      .all();

    expect(mapping.conflictState).toBe("needs_review");
    expect(mapping.conflictMessage).toContain("newer local edit");
  });
});
