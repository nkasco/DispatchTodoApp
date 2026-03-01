import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";
import { projects, tasks, users } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const connectorsRoute = await import("@/app/api/integrations/connectors/route");
const connectorDetailRoute = await import("@/app/api/integrations/connectors/[id]/route");
const connectorTestRoute = await import("@/app/api/integrations/connectors/[id]/test/route");
const connectorSyncRoute = await import("@/app/api/integrations/connectors/[id]/sync/route");
const connectorWebhookRoute = await import("@/app/api/integrations/connectors/[id]/webhook/route");
const integrationsService = await import("@/lib/integrations/service");

const TEST_USER = {
  id: "user-1",
  name: "Connector User",
  email: "connector@example.com",
  role: "member" as const,
  timeZone: "UTC",
};

const OTHER_USER = {
  id: "user-2",
  name: "Other User",
  email: "other@example.com",
  role: "member" as const,
  timeZone: "UTC",
};

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("integration connector API routes", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "dispatch-test-secret";
    testDb = createTestDb();
    mockFetch.mockReset();
    testDb.db.insert(users).values([TEST_USER, OTHER_USER]).run();
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
      title: "Sync task",
      status: "open",
      priority: "high",
      dueDate: "2026-03-05",
      recurrenceType: "none",
      recurrenceBehavior: "after_completion",
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }).run();
    mockSession({
      user: {
        id: TEST_USER.id,
        name: TEST_USER.name,
        email: TEST_USER.email,
        role: TEST_USER.role,
        timeZone: TEST_USER.timeZone,
      },
    });
  });

  it("GET lists connectors with catalog metadata", async () => {
    await integrationsService.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "push",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });

    const res = await connectorsRoute.GET(new Request("http://localhost/api/integrations/connectors"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.connectors).toHaveLength(1);
    expect(data.catalog.some((entry: { provider: string }) => entry.provider === "rest")).toBe(true);
    expect(data.audit.length).toBeGreaterThan(0);
  });

  it("POST creates a connector", async () => {
    const res = await connectorsRoute.POST(
      jsonReq("http://localhost/api/integrations/connectors", "POST", {
        name: "Remote Tasks",
        provider: "rest",
        syncDirection: "push",
        baseUrl: "https://tasks.example.com/api",
        settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
        authToken: "secret-token",
      }),
      {},
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Remote Tasks");
    expect(data.provider).toBe("rest");
    expect(data.auth.hasToken).toBe(true);
  });

  it("GET /[id] returns a single connector and PUT updates it", async () => {
    const connector = await integrationsService.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "push",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });

    const getRes = await connectorDetailRoute.GET(
      new Request(`http://localhost/api/integrations/connectors/${connector!.id}`),
      { params: Promise.resolve({ id: connector!.id }) },
    );
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).id).toBe(connector!.id);

    const putRes = await connectorDetailRoute.PUT(
      jsonReq(`http://localhost/api/integrations/connectors/${connector!.id}`, "PUT", {
        name: "Updated Connector",
        status: "disabled",
      }),
      { params: Promise.resolve({ id: connector!.id }) },
    );
    expect(putRes.status).toBe(200);
    const updated = await putRes.json();
    expect(updated.name).toBe("Updated Connector");
    expect(updated.status).toBe("disabled");
  });

  it("POST /[id]/test validates a connector with its adapter", async () => {
    const connector = await integrationsService.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "push",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const res = await connectorTestRoute.POST(
      jsonReq(`http://localhost/api/integrations/connectors/${connector!.id}/test`, "POST", {}),
      { params: Promise.resolve({ id: connector!.id }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("POST /[id]/sync processes queued outbox work", async () => {
    const connector = await integrationsService.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "push",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });
    await integrationsService.enqueueTaskMutationForConnectors({
      userId: TEST_USER.id,
      taskId: "task-1",
      action: "create",
    });
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "remote-task-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await connectorSyncRoute.POST(
      jsonReq(`http://localhost/api/integrations/connectors/${connector!.id}/sync`, "POST", {}),
      { params: Promise.resolve({ id: connector!.id }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processed).toBe(1);
    expect(data.delivered).toBe(1);
  });

  it("POST /[id]/webhook accepts valid secrets and rejects invalid ones", async () => {
    const connector = await integrationsService.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "rest",
      syncDirection: "bidirectional",
      baseUrl: "https://tasks.example.com/api",
      settings: { taskPath: "/tasks", projectPath: "/projects", healthPath: "/health" },
      authToken: "secret-token",
    });

    const badRes = await connectorWebhookRoute.POST(
      jsonReq(`http://localhost/api/integrations/connectors/${connector!.id}/webhook?secret=bad`, "POST", {
        externalTaskId: "remote-task-1",
      }),
      { params: Promise.resolve({ id: connector!.id }) },
    );
    expect(badRes.status).toBe(403);

    const goodRes = await connectorWebhookRoute.POST(
      jsonReq(`http://localhost/api/integrations/connectors/${connector!.id}/webhook?secret=${connector!.webhookSecret}`, "POST", {
        externalTaskId: "remote-task-1",
        updatedAt: "2026-03-01T11:00:00.000Z",
      }),
      { params: Promise.resolve({ id: connector!.id }) },
    );
    expect(goodRes.status).toBe(200);
    expect((await goodRes.json()).ok).toBe(true);
  });

  it("DELETE /[id] removes a connector", async () => {
    const connector = await integrationsService.createConnectorForUser({
      userId: TEST_USER.id,
      name: "Remote Tasks",
      provider: "local_uri",
      syncDirection: "push",
      settings: {
        createTemplate: "app:///add?title={{title}}",
        updateTemplate: "app:///update?id={{externalId}}",
        deleteTemplate: "app:///delete?id={{externalId}}",
        bridgeMode: false,
        bridgeDirectory: null,
      },
      authToken: "secret-token",
    });

    const res = await connectorDetailRoute.DELETE(
      new Request(`http://localhost/api/integrations/connectors/${connector!.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: connector!.id }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });

  it("requires authentication for protected connector routes", async () => {
    mockSession(null);
    const res = await connectorsRoute.GET(new Request("http://localhost/api/integrations/connectors"), {});
    expect(res.status).toBe(401);
  });
});
