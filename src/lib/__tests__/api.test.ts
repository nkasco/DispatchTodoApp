import { describe, it, expect, beforeEach } from "vitest";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { mockSession } from "@/test/setup";

describe("jsonResponse", () => {
  it("returns JSON with 200 by default", async () => {
    const res = jsonResponse({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("accepts a custom status code", async () => {
    const res = jsonResponse({ id: 1 }, 201);
    expect(res.status).toBe(201);
  });
});

describe("errorResponse", () => {
  it("returns JSON error with 500 by default", async () => {
    const res = errorResponse("Something went wrong");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong" });
  });

  it("accepts a custom status code", async () => {
    const res = errorResponse("Not found", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("withAuth", () => {
  beforeEach(() => {
    mockSession(null);
  });

  it("returns 401 when no session exists", async () => {
    const handler = withAuth(async () => jsonResponse({ ok: true }));
    const req = new Request("http://localhost/api/test");
    const res = await handler(req, {});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("calls handler with session when authenticated", async () => {
    mockSession({ user: { id: "user-1", name: "Test", email: "test@test.com" } });
    const handler = withAuth(async (_req, session) => {
      return jsonResponse({ userId: session.user!.id });
    });
    const req = new Request("http://localhost/api/test");
    const res = await handler(req, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "user-1" });
  });

  it("passes route context through to the handler", async () => {
    mockSession({ user: { id: "user-1", name: "Test", email: "test@test.com" } });
    const mockCtx = { params: Promise.resolve({ id: "abc" }) };
    const handler = withAuth(async (_req, _session, ctx) => {
      const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
      return jsonResponse({ id });
    });
    const req = new Request("http://localhost/api/test");
    const res = await handler(req, mockCtx);
    expect(await res.json()).toEqual({ id: "abc" });
  });

  it("returns 403 when account is frozen", async () => {
    mockSession({
      user: {
        id: "user-1",
        name: "Test",
        email: "test@test.com",
        isFrozen: true,
      },
    });
    const handler = withAuth(async () => jsonResponse({ ok: true }));
    const req = new Request("http://localhost/api/test");
    const res = await handler(req, {});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Account is frozen" });
  });
});
