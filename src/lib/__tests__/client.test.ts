import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError, TASKS_CHANGED_EVENT } from "@/lib/client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Tasks ----

describe("api.tasks", () => {
  describe("list", () => {
    it("fetches /api/tasks with no params", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      const result = await api.tasks.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }));
      expect(result).toEqual([]);
    });

    it("appends status filter as query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.tasks.list({ status: "open" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("status=open");
    });

    it("appends priority filter as query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.tasks.list({ priority: "high" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("priority=high");
    });

    it("appends both filters", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.tasks.list({ status: "done", priority: "low" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("status=done");
      expect(url).toContain("priority=low");
    });

    it("omits undefined filters", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.tasks.list({ status: undefined });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("/api/tasks");
    });

    it("appends page and limit params", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }));

      await api.tasks.list({ page: 1, limit: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("page=1");
      expect(url).toContain("limit=20");
    });
  });

  describe("get", () => {
    it("fetches /api/tasks/:id", async () => {
      const task = { id: "abc", title: "Test" };
      mockFetch.mockResolvedValueOnce(jsonOk(task));

      const result = await api.tasks.get("abc");

      expect(mockFetch).toHaveBeenCalledWith("/api/tasks/abc", expect.anything());
      expect(result).toEqual(task);
    });
  });

  describe("create", () => {
    it("posts to /api/tasks", async () => {
      const task = { id: "new", title: "Do thing" };
      mockFetch.mockResolvedValueOnce(jsonOk(task));

      const result = await api.tasks.create({ title: "Do thing" });

      expect(mockFetch).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Do thing" }),
      }));
      expect(result).toEqual(task);
    });

    it("includes optional fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await api.tasks.create({
        title: "Task",
        description: "Desc",
        status: "in_progress",
        priority: "high",
        dueDate: "2025-01-01",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        title: "Task",
        description: "Desc",
        status: "in_progress",
        priority: "high",
        dueDate: "2025-01-01",
      });
    });
  });

  describe("update", () => {
    it("puts to /api/tasks/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ id: "abc", title: "Updated" }));

      await api.tasks.update("abc", { title: "Updated" });

      expect(mockFetch).toHaveBeenCalledWith("/api/tasks/abc", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ title: "Updated" }),
      }));
    });

    it("sends dueDate null to clear it", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await api.tasks.update("abc", { dueDate: null });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.dueDate).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes /api/tasks/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ deleted: true }));

      const result = await api.tasks.delete("abc");

      expect(mockFetch).toHaveBeenCalledWith("/api/tasks/abc", expect.objectContaining({
        method: "DELETE",
      }));
      expect(result).toEqual({ deleted: true });
    });
  });

  describe("mutation events", () => {
    it("emits tasks:changed for create, update, and delete", async () => {
      const originalWindow = (globalThis as { window?: unknown }).window;
      const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;
      const dispatchEvent = vi.fn();

      class TestCustomEvent {
        type: string;
        detail: unknown;

        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      }

      (globalThis as { window?: unknown }).window = { dispatchEvent };
      (globalThis as { CustomEvent?: unknown }).CustomEvent = TestCustomEvent;

      mockFetch
        .mockResolvedValueOnce(jsonOk({ id: "c1", title: "Created" }))
        .mockResolvedValueOnce(jsonOk({ id: "u1", title: "Updated" }))
        .mockResolvedValueOnce(jsonOk({ deleted: true }));

      try {
        await api.tasks.create({ title: "Created" });
        await api.tasks.update("u1", { title: "Updated" });
        await api.tasks.delete("d1");
      } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
        (globalThis as { CustomEvent?: unknown }).CustomEvent = originalCustomEvent;
      }

      expect(dispatchEvent).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: TASKS_CHANGED_EVENT,
          detail: { action: "create", taskId: "c1" },
        }),
      );
      expect(dispatchEvent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: TASKS_CHANGED_EVENT,
          detail: { action: "update", taskId: "u1" },
        }),
      );
      expect(dispatchEvent).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          type: TASKS_CHANGED_EVENT,
          detail: { action: "delete", taskId: "d1" },
        }),
      );
    });
  });
});

// ---- Notes ----

describe("api.notes", () => {
  describe("list", () => {
    it("fetches /api/notes with no params", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      const result = await api.notes.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/notes", expect.anything());
      expect(result).toEqual([]);
    });

    it("appends search query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.notes.list({ search: "hello" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("search=hello");
    });

    it("appends page and limit params", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ data: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 0 } }));

      await api.notes.list({ page: 2, limit: 10 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("page=2");
      expect(url).toContain("limit=10");
    });
  });

  describe("get", () => {
    it("fetches /api/notes/:id", async () => {
      const note = { id: "n1", title: "My Note" };
      mockFetch.mockResolvedValueOnce(jsonOk(note));

      const result = await api.notes.get("n1");

      expect(mockFetch).toHaveBeenCalledWith("/api/notes/n1", expect.anything());
      expect(result).toEqual(note);
    });
  });

  describe("create", () => {
    it("posts to /api/notes", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ id: "new", title: "Note" }));

      const result = await api.notes.create({ title: "Note" });

      expect(mockFetch).toHaveBeenCalledWith("/api/notes", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Note" }),
      }));
      expect(result).toEqual({ id: "new", title: "Note" });
    });

    it("includes content", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await api.notes.create({ title: "Note", content: "# Hello" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.content).toBe("# Hello");
    });
  });

  describe("update", () => {
    it("puts to /api/notes/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ id: "n1", title: "Updated" }));

      await api.notes.update("n1", { title: "Updated" });

      expect(mockFetch).toHaveBeenCalledWith("/api/notes/n1", expect.objectContaining({
        method: "PUT",
      }));
    });
  });

  describe("delete", () => {
    it("deletes /api/notes/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ deleted: true }));

      const result = await api.notes.delete("n1");

      expect(mockFetch).toHaveBeenCalledWith("/api/notes/n1", expect.objectContaining({
        method: "DELETE",
      }));
      expect(result).toEqual({ deleted: true });
    });
  });
});

// ---- Dispatches ----

describe("api.dispatches", () => {
  describe("list", () => {
    it("fetches /api/dispatches with no params", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      const result = await api.dispatches.list();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("/api/dispatches");
      expect(result).toEqual([]);
    });

    it("accepts a date string shorthand", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.dispatches.list("2025-06-15");

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("date=2025-06-15");
    });

    it("accepts an object with date param", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([]));

      await api.dispatches.list({ date: "2025-06-15" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("date=2025-06-15");
    });

    it("appends page and limit params", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }));

      await api.dispatches.list({ page: 1, limit: 10 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("page=1");
      expect(url).toContain("limit=10");
    });
  });

  describe("get", () => {
    it("fetches /api/dispatches/:id", async () => {
      const dispatch = { id: "d1", date: "2025-06-15" };
      mockFetch.mockResolvedValueOnce(jsonOk(dispatch));

      const result = await api.dispatches.get("d1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1", expect.anything());
      expect(result).toEqual(dispatch);
    });
  });

  describe("create", () => {
    it("posts to /api/dispatches", async () => {
      const dispatch = { id: "d1", date: "2025-06-15" };
      mockFetch.mockResolvedValueOnce(jsonOk(dispatch));

      const result = await api.dispatches.create({ date: "2025-06-15" });

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ date: "2025-06-15" }),
      }));
      expect(result).toEqual(dispatch);
    });

    it("includes optional summary", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await api.dispatches.create({ date: "2025-06-15", summary: "Good day" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.summary).toBe("Good day");
    });

    it("throws ApiError on 409 duplicate", async () => {
      mockFetch.mockResolvedValueOnce(jsonError("A dispatch already exists for this date", 409));

      const err = await api.dispatches.create({ date: "2025-06-15" }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(409);
    });
  });

  describe("update", () => {
    it("puts to /api/dispatches/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ id: "d1", summary: "Updated" }));

      await api.dispatches.update("d1", { summary: "Updated" });

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ summary: "Updated" }),
      }));
    });
  });

  describe("delete", () => {
    it("deletes /api/dispatches/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ deleted: true }));

      const result = await api.dispatches.delete("d1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1", expect.objectContaining({
        method: "DELETE",
      }));
      expect(result).toEqual({ deleted: true });
    });
  });

  describe("getTasks", () => {
    it("fetches /api/dispatches/:id/tasks", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk([{ id: "t1", title: "Task 1" }]));

      const result = await api.dispatches.getTasks("d1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1/tasks", expect.anything());
      expect(result).toEqual([{ id: "t1", title: "Task 1" }]);
    });
  });

  describe("linkTask", () => {
    it("posts taskId to /api/dispatches/:id/tasks", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ linked: true }));

      const result = await api.dispatches.linkTask("d1", "t1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1/tasks", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ taskId: "t1" }),
      }));
      expect(result).toEqual({ linked: true });
    });
  });

  describe("unlinkTask", () => {
    it("deletes taskId from /api/dispatches/:id/tasks", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ unlinked: true }));

      const result = await api.dispatches.unlinkTask("d1", "t1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1/tasks", expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ taskId: "t1" }),
      }));
      expect(result).toEqual({ unlinked: true });
    });
  });

  describe("complete", () => {
    it("posts to /api/dispatches/:id/complete", async () => {
      const result = { dispatch: { id: "d1", finalized: true }, rolledOver: 0, nextDispatchId: null };
      mockFetch.mockResolvedValueOnce(jsonOk(result));

      const res = await api.dispatches.complete("d1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1/complete", expect.objectContaining({
        method: "POST",
      }));
      expect(res).toEqual(result);
    });
  });

  describe("unfinalize", () => {
    it("posts to /api/dispatches/:id/unfinalize", async () => {
      const result = { dispatch: { id: "d1", finalized: false }, hasNextDispatch: false, nextDispatchDate: null };
      mockFetch.mockResolvedValueOnce(jsonOk(result));

      const res = await api.dispatches.unfinalize("d1");

      expect(mockFetch).toHaveBeenCalledWith("/api/dispatches/d1/unfinalize", expect.objectContaining({
        method: "POST",
      }));
      expect(res).toEqual(result);
    });
  });

  describe("calendar", () => {
    it("fetches /api/dispatches/calendar with year and month", async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ dates: {} }));

      await api.dispatches.calendar(2025, 6);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("year=2025");
      expect(url).toContain("month=6");
    });
  });
});

// ---- Dispatch get-or-create pattern (mirrors DispatchPage.tsx logic) ----

describe("dispatch get-or-create pattern", () => {
  it("creates a dispatch when list returns empty", async () => {
    const dispatch = { id: "d1", date: "2025-06-15", summary: null };
    mockFetch
      .mockResolvedValueOnce(jsonOk([]))           // list returns empty
      .mockResolvedValueOnce(jsonOk(dispatch));     // create succeeds

    const list = await api.dispatches.list("2025-06-15") as any[];
    let d = list[0] ?? null;

    if (!d) {
      d = await api.dispatches.create({ date: "2025-06-15" });
    }

    expect(d).toEqual(dispatch);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses existing dispatch when list returns one", async () => {
    const dispatch = { id: "d1", date: "2025-06-15", summary: null };
    mockFetch.mockResolvedValueOnce(jsonOk([dispatch]));

    const list = await api.dispatches.list("2025-06-15") as any[];
    let d = list[0] ?? null;

    // Should not need to create
    expect(d).toEqual(dispatch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles 409 race condition by re-fetching", async () => {
    const dispatch = { id: "d1", date: "2025-06-15", summary: null };
    mockFetch
      .mockResolvedValueOnce(jsonOk([]))                                              // first list returns empty
      .mockResolvedValueOnce(jsonError("A dispatch already exists for this date", 409)) // create fails (race)
      .mockResolvedValueOnce(jsonOk([dispatch]));                                      // retry list succeeds

    const list = await api.dispatches.list("2025-06-15") as any[];
    let d = list[0] ?? null;

    if (!d) {
      try {
        d = await api.dispatches.create({ date: "2025-06-15" });
      } catch {
        // Race condition — re-fetch
        const retry = await api.dispatches.list("2025-06-15") as any[];
        d = retry[0] ?? null;
      }
    }

    expect(d).toEqual(dispatch);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ---- Search ----

describe("api.search", () => {
  it("fetches /api/search with query param", async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({ tasks: [], notes: [], dispatches: [] }));

    const result = await api.search("dashboard");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/search");
    expect(url).toContain("q=dashboard");
    expect(result).toEqual({ tasks: [], notes: [], dispatches: [] });
  });
});

// ---- Error handling ----

describe("error handling", () => {
  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(jsonError("Not found", 404));

    const err = await api.tasks.get("bad").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
  });

  it("throws ApiError with fallback message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 500 }),
    );

    await expect(api.tasks.list()).rejects.toThrow("Request failed");
  });

  it("throws ApiError on 401 unauthorized", async () => {
    mockFetch.mockResolvedValueOnce(jsonError("Unauthorized", 401));

    await expect(api.notes.list()).rejects.toThrow(ApiError);
  });
});
