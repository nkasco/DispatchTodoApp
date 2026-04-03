import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSession } from "@/test/setup";
import { createTestDb } from "@/test/db";
import { recurrenceSeries, tasks, users } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const { GET, POST } = await import("@/app/api/recurrences/route");
const { PUT, DELETE } = await import("@/app/api/recurrences/[id]/route");
const { GET: GET_TASKS } = await import("@/app/api/tasks/route");

const TEST_USER = { id: "user-1", name: "Test User", email: "test@test.com", timeZone: "UTC" };

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Recurrences API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.db.insert(users).values(TEST_USER).run();
    mockSession({ user: TEST_USER });
  });

  it("creates a recurrence series with description and dueTime", async () => {
    const res = await POST(
      jsonReq("http://localhost/api/recurrences", "POST", {
        title: "Morning review",
        description: "Check inbox and triage tasks",
        recurrenceType: "daily",
        nextDueDate: "2099-01-01",
        dueTime: "09:00",
      }),
      {},
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.description).toBe("Check inbox and triage tasks");
    expect(data.dueTime).toBe("09:00");
  });

  it("rejects invalid dueTime values", async () => {
    const res = await POST(
      jsonReq("http://localhost/api/recurrences", "POST", {
        title: "Morning review",
        recurrenceType: "daily",
        nextDueDate: "2099-01-01",
        dueTime: "24:30",
      }),
      {},
    );

    expect(res.status).toBe(400);
  });

  it("updates dueTime for an existing recurrence series", async () => {
    await testDb.db.insert(recurrenceSeries).values({
      id: "series-1",
      userId: TEST_USER.id,
      title: "Morning review",
      recurrenceType: "daily",
      recurrenceBehavior: "after_completion",
      recurrenceRule: null,
      nextDueDate: "2099-01-01",
      dueTime: "09:00",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await PUT(
      jsonReq("http://localhost/api/recurrences/series-1", "PUT", {
        description: "Updated description",
        dueTime: "09:30",
      }),
      ctx("series-1"),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.description).toBe("Updated description");
    expect(data.dueTime).toBe("09:30");
  });

  it("materializes dueTime onto generated task instances", async () => {
    const now = new Date().toISOString();
    await testDb.db.insert(recurrenceSeries).values({
      id: "series-1",
      userId: TEST_USER.id,
      title: "Morning review",
      description: "Check inbox and triage tasks",
      recurrenceType: "daily",
      recurrenceBehavior: "after_completion",
      recurrenceRule: null,
      nextDueDate: todayIsoUtc(),
      dueTime: "09:00",
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const res = await GET_TASKS(new Request("http://localhost/api/tasks"), {});
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe(todayIsoUtc());
    expect(rows[0].dueTime).toBe("09:00");

    const taskRows = await testDb.db.select().from(tasks);
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0].dueTime).toBe("09:00");
  });

  it("lists dueTime on recurrence series responses", async () => {
    await testDb.db.insert(recurrenceSeries).values({
      id: "series-1",
      userId: TEST_USER.id,
      title: "Morning review",
      recurrenceType: "daily",
      recurrenceBehavior: "after_completion",
      recurrenceRule: null,
      nextDueDate: "2099-01-01",
      dueTime: "09:00",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await GET(new Request("http://localhost/api/recurrences"), {});
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].dueTime).toBe("09:00");
  });

  it("soft deletes recurrence series", async () => {
    await testDb.db.insert(recurrenceSeries).values({
      id: "series-1",
      userId: TEST_USER.id,
      title: "Morning review",
      recurrenceType: "daily",
      recurrenceBehavior: "after_completion",
      recurrenceRule: null,
      nextDueDate: "2099-01-01",
      dueTime: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await DELETE(new Request("http://localhost/api/recurrences/series-1", { method: "DELETE" }), ctx("series-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });
});
