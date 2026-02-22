import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSession } from "@/test/setup";
import { createTestDb } from "@/test/db";
import { users } from "@/db/schema";

// Set up a fresh in-memory DB before each test and mock @/db
let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

// Import route handlers AFTER mocks are set up
const { GET, POST } = await import("@/app/api/tasks/route");
const {
  GET: GET_BY_ID,
  PUT,
  DELETE,
} = await import("@/app/api/tasks/[id]/route");
const { POST: CREATE_PROJECT } = await import("@/app/api/projects/route");

const TEST_USER = { id: "user-1", name: "Test User", email: "test@test.com" };
const OTHER_USER = { id: "user-2", name: "Other User", email: "other@test.com" };

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

describe("Tasks API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    // Seed test users
    testDb.db.insert(users).values(TEST_USER).run();
    testDb.db.insert(users).values(OTHER_USER).run();
    mockSession({ user: TEST_USER });
  });

  // --- Authentication ---

  describe("authentication", () => {
    it("GET /api/tasks returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await GET(new Request("http://localhost/api/tasks"), {});
      expect(res.status).toBe(401);
    });

    it("POST /api/tasks returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "test" }),
        {}
      );
      expect(res.status).toBe(401);
    });
  });

  // --- POST /api/tasks ---

  describe("POST /api/tasks", () => {
    it("creates a task with just a title", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "My task" }),
        {}
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.title).toBe("My task");
      expect(data.status).toBe("open");
      expect(data.priority).toBe("medium");
      expect(data.recurrenceBehavior).toBe("after_completion");
      expect(data.userId).toBe(TEST_USER.id);
      expect(data.id).toBeDefined();
    });

    it("creates a task with all fields", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Full task",
          description: "Some details",
          status: "in_progress",
          priority: "high",
          dueDate: "2025-12-31",
        }),
        {}
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.title).toBe("Full task");
      expect(data.description).toBe("Some details");
      expect(data.status).toBe("in_progress");
      expect(data.priority).toBe("high");
      expect(data.dueDate).toBe("2025-12-31");
    });

    it("creates a recurring task with built-in recurrence", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Daily standup",
          recurrenceType: "daily",
        }),
        {}
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.recurrenceType).toBe("daily");
      expect(data.recurrenceBehavior).toBe("after_completion");
      expect(data.recurrenceRule).toBeNull();
    });

    it("creates a recurring task with custom recurrence rule", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Pay rent reminder",
          recurrenceType: "custom",
          recurrenceRule: { interval: 2, unit: "week" },
        }),
        {}
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.recurrenceType).toBe("custom");
      expect(data.recurrenceBehavior).toBe("after_completion");
      expect(JSON.parse(data.recurrenceRule)).toEqual({ interval: 2, unit: "week" });
    });

    it("trims whitespace from title", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "  padded  " }),
        {}
      );
      const data = await res.json();
      expect(data.title).toBe("padded");
    });

    it("rejects missing title", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {}),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty string title", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "   " }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects non-string title", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: 123 }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid status", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          status: "invalid",
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid priority", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          priority: "critical",
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid recurrenceType", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          recurrenceType: "hourly",
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid recurrenceBehavior", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          recurrenceType: "daily",
          recurrenceBehavior: "after_close",
        }),
        {},
      );
      expect(res.status).toBe(400);
    });

    it("requires dueDate for duplicate_on_schedule recurrence behavior", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Schedule duplicate",
          recurrenceType: "weekly",
          recurrenceBehavior: "duplicate_on_schedule",
        }),
        {},
      );
      expect(res.status).toBe(400);
    });

    it("rejects recurrenceRule for non-custom recurrence", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          recurrenceType: "daily",
          recurrenceRule: { interval: 3, unit: "day" },
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects custom recurrence without rule", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          recurrenceType: "custom",
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects non-string description", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "test",
          description: 42,
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid JSON body", async () => {
      const res = await POST(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not json",
        }),
        {}
      );
      expect(res.status).toBe(400);
    });
  });

  // --- GET /api/tasks ---

  describe("GET /api/tasks", () => {
    beforeEach(async () => {
      // Seed tasks
      await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Open low",
          status: "open",
          priority: "low",
        }),
        {}
      );
      await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Done high",
          status: "done",
          priority: "high",
        }),
        {}
      );
      await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "In progress medium",
          status: "in_progress",
          priority: "medium",
        }),
        {}
      );
    });

    it("returns all tasks for the current user", async () => {
      const res = await GET(new Request("http://localhost/api/tasks"), {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(3);
    });

    it("filters by status", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?status=open"),
        {}
      );
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Open low");
    });

    it("filters by priority", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?priority=high"),
        {}
      );
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Done high");
    });

    it("filters by both status and priority", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?status=in_progress&priority=medium"),
        {}
      );
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("In progress medium");
    });

    it("rejects invalid status filter", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?status=bogus"),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid priority filter", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?priority=bogus"),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("returns paginated response when page param is present", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?page=1&limit=2"),
        {}
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(2);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(2);
      expect(data.pagination.total).toBe(3);
      expect(data.pagination.totalPages).toBe(2);
    });

    it("returns second page of paginated results", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?page=2&limit=2"),
        {}
      );
      const data = await res.json();
      expect(data.data).toHaveLength(1); // 3 total, page 2 with limit 2
      expect(data.pagination.page).toBe(2);
    });

    it("paginates with filters", async () => {
      const res = await GET(
        new Request("http://localhost/api/tasks?status=open&page=1&limit=10"),
        {}
      );
      const data = await res.json();
      expect(data.data).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
    });

    it("does not return tasks belonging to other users", async () => {
      // Create task as other user
      mockSession({ user: OTHER_USER });
      await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Other user task" }),
        {}
      );

      // Switch back and list
      mockSession({ user: TEST_USER });
      const res = await GET(new Request("http://localhost/api/tasks"), {});
      const data = await res.json();
      expect(data).toHaveLength(3); // Only the 3 seeded tasks
      expect(data.every((t: { userId: string }) => t.userId === TEST_USER.id)).toBe(true);
    });
  });

  // --- GET /api/tasks/[id] ---

  describe("GET /api/tasks/[id]", () => {
    it("returns a single task", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Single task" }),
        {}
      );
      const created = await createRes.json();

      const res = await GET_BY_ID(
        new Request(`http://localhost/api/tasks/${created.id}`),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(created.id);
      expect(data.title).toBe("Single task");
    });

    it("returns 404 for nonexistent task", async () => {
      const res = await GET_BY_ID(
        new Request("http://localhost/api/tasks/nonexistent"),
        ctx("nonexistent")
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's task", async () => {
      // Create as other user
      mockSession({ user: OTHER_USER });
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Secret task" }),
        {}
      );
      const created = await createRes.json();

      // Try to read as test user
      mockSession({ user: TEST_USER });
      const res = await GET_BY_ID(
        new Request(`http://localhost/api/tasks/${created.id}`),
        ctx(created.id)
      );
      expect(res.status).toBe(404);
    });
  });

  // --- PUT /api/tasks/[id] ---

  describe("PUT /api/tasks/[id]", () => {
    it("updates task fields", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Old title" }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          title: "New title",
          status: "done",
          priority: "high",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBe("New title");
      expect(data.status).toBe("done");
      expect(data.priority).toBe("high");
    });

    it("updates updatedAt timestamp", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Timing test" }),
        {}
      );
      const created = await createRes.json();

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          title: "Updated",
        }),
        ctx(created.id)
      );
      const data = await res.json();
      expect(data.updatedAt).not.toBe(created.updatedAt);
    });

    it("allows partial updates", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Original",
          description: "Keep me",
        }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          status: "done",
        }),
        ctx(created.id)
      );
      const data = await res.json();
      expect(data.title).toBe("Original");
      expect(data.description).toBe("Keep me");
      expect(data.status).toBe("done");
    });

    it("returns 404 for nonexistent task", async () => {
      const res = await PUT(
        jsonReq("http://localhost/api/tasks/nonexistent", "PUT", {
          title: "Nope",
        }),
        ctx("nonexistent")
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's task", async () => {
      mockSession({ user: OTHER_USER });
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Theirs" }),
        {}
      );
      const created = await createRes.json();

      mockSession({ user: TEST_USER });
      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          title: "Mine now",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(404);
    });

    it("rejects invalid status on update", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "test" }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          status: "invalid",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty title on update", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "test" }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          title: "",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(400);
    });

    it("updates recurrence settings", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Recurring" }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          recurrenceType: "custom",
          recurrenceRule: { interval: 3, unit: "day" },
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.recurrenceType).toBe("custom");
      expect(data.recurrenceBehavior).toBe("after_completion");
      expect(JSON.parse(data.recurrenceRule)).toEqual({ interval: 3, unit: "day" });
    });

    it("updates recurrence behavior when valid", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Scheduled duplicate",
          recurrenceType: "weekly",
          dueDate: "2026-03-01",
        }),
        {},
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          recurrenceBehavior: "duplicate_on_schedule",
        }),
        ctx(created.id),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.recurrenceBehavior).toBe("duplicate_on_schedule");
    });

    it("rejects duplicate_on_schedule when dueDate is not set on update", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "No due date recurring",
          recurrenceType: "weekly",
        }),
        {},
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          recurrenceBehavior: "duplicate_on_schedule",
        }),
        ctx(created.id),
      );

      expect(res.status).toBe(400);
    });

    it("clears recurrenceRule when recurrenceType changes away from custom", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Recurring",
          recurrenceType: "custom",
          recurrenceRule: { interval: 2, unit: "week" },
        }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          recurrenceType: "monthly",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.recurrenceType).toBe("monthly");
      expect(data.recurrenceRule).toBeNull();
    });

    it("rejects recurrenceRule updates unless recurrenceType is custom", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Not recurring" }),
        {}
      );
      const created = await createRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${created.id}`, "PUT", {
          recurrenceRule: { interval: 2, unit: "week" },
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(400);
    });
  });

  // --- DELETE /api/tasks/[id] ---

  describe("DELETE /api/tasks/[id]", () => {
    it("deletes a task", async () => {
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Delete me" }),
        {}
      );
      const created = await createRes.json();

      const res = await DELETE(
        new Request(`http://localhost/api/tasks/${created.id}`, {
          method: "DELETE",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      // Confirm it's gone
      const getRes = await GET_BY_ID(
        new Request(`http://localhost/api/tasks/${created.id}`),
        ctx(created.id)
      );
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for nonexistent task", async () => {
      const res = await DELETE(
        new Request("http://localhost/api/tasks/nonexistent", {
          method: "DELETE",
        }),
        ctx("nonexistent")
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's task", async () => {
      mockSession({ user: OTHER_USER });
      const createRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Not yours" }),
        {}
      );
      const created = await createRes.json();

      mockSession({ user: TEST_USER });
      const res = await DELETE(
        new Request(`http://localhost/api/tasks/${created.id}`, {
          method: "DELETE",
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(404);
    });
  });

  // --- Project integration ---

  describe("project integration", () => {
    it("filters by projectId", async () => {
      const projectRes = await CREATE_PROJECT(
        jsonReq("http://localhost/api/projects", "POST", { name: "Project A" }),
        {}
      );
      const project = await projectRes.json();

      await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Project task",
          projectId: project.id,
        }),
        {}
      );
      await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Unassigned" }),
        {}
      );

      const res = await GET(
        new Request(`http://localhost/api/tasks?projectId=${project.id}`),
        {}
      );
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Project task");
    });

    it("filters unassigned tasks with projectId=none", async () => {
      const projectRes = await CREATE_PROJECT(
        jsonReq("http://localhost/api/projects", "POST", { name: "Project B" }),
        {}
      );
      const project = await projectRes.json();

      await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Assigned",
          projectId: project.id,
        }),
        {}
      );
      await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Unassigned" }),
        {}
      );

      const res = await GET(
        new Request("http://localhost/api/tasks?projectId=none"),
        {}
      );
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Unassigned");
    });

    it("rejects invalid projectId on create", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Bad project",
          projectId: "missing",
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("allows updating projectId", async () => {
      const projectRes = await CREATE_PROJECT(
        jsonReq("http://localhost/api/projects", "POST", { name: "Project C" }),
        {}
      );
      const project = await projectRes.json();

      const taskRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Move me" }),
        {}
      );
      const task = await taskRes.json();

      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${task.id}`, "PUT", {
          projectId: project.id,
        }),
        ctx(task.id)
      );
      const data = await res.json();
      expect(data.projectId).toBe(project.id);
    });

    it("rejects assigning another user's project", async () => {
      mockSession({ user: OTHER_USER });
      const otherProjectRes = await CREATE_PROJECT(
        jsonReq("http://localhost/api/projects", "POST", { name: "Other Project" }),
        {}
      );
      const otherProject = await otherProjectRes.json();

      mockSession({ user: TEST_USER });
      const res = await POST(
        jsonReq("http://localhost/api/tasks", "POST", {
          title: "Bad assignment",
          projectId: otherProject.id,
        }),
        {}
      );
      expect(res.status).toBe(400);
    });

    it("rejects updating to another user's project", async () => {
      const taskRes = await POST(
        jsonReq("http://localhost/api/tasks", "POST", { title: "Mine" }),
        {}
      );
      const task = await taskRes.json();

      mockSession({ user: OTHER_USER });
      const otherProjectRes = await CREATE_PROJECT(
        jsonReq("http://localhost/api/projects", "POST", { name: "Other Project" }),
        {}
      );
      const otherProject = await otherProjectRes.json();

      mockSession({ user: TEST_USER });
      const res = await PUT(
        jsonReq(`http://localhost/api/tasks/${task.id}`, "PUT", {
          projectId: otherProject.id,
        }),
        ctx(task.id)
      );
      expect(res.status).toBe(400);
    });
  });
});
