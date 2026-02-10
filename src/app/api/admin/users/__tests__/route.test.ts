import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const { GET, POST } = await import("@/app/api/admin/users/route");
const { PUT, DELETE } = await import("@/app/api/admin/users/[id]/route");

const ADMIN_USER = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
  password: "$2a$10$existingadminhash",
  role: "admin" as const,
};

const MEMBER_USER = {
  id: "member-1",
  name: "Member",
  email: "member@example.com",
  password: "$2a$10$existingmemberhash",
  role: "member" as const,
};

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

describe("Admin Users API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.db.insert(users).values(ADMIN_USER).run();
    testDb.db.insert(users).values(MEMBER_USER).run();
    mockSession({
      user: {
        id: ADMIN_USER.id,
        name: ADMIN_USER.name,
        email: ADMIN_USER.email,
        role: "admin",
      },
    });
  });

  describe("authorization", () => {
    it("rejects non-admin access", async () => {
      mockSession({
        user: {
          id: MEMBER_USER.id,
          name: MEMBER_USER.name,
          email: MEMBER_USER.email,
          role: "member",
        },
      });

      const res = await GET(new Request("http://localhost/api/admin/users"), {});
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });
  });

  describe("GET /api/admin/users", () => {
    it("lists users with admin metadata", async () => {
      const res = await GET(new Request("http://localhost/api/admin/users"), {});
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveLength(2);
      expect(data[0]).toHaveProperty("hasPassword");
      expect(data[0]).toHaveProperty("providers");
      expect(data[0]).not.toHaveProperty("password");
    });
  });

  describe("POST /api/admin/users", () => {
    it("creates a new member user", async () => {
      const res = await POST(
        jsonReq("http://localhost/api/admin/users", "POST", {
          email: "new.user@example.com",
          password: "password123",
          name: "New User",
        }),
        {},
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.email).toBe("new.user@example.com");
      expect(data.role).toBe("member");

      const [created] = testDb.db.select().from(users).where(eq(users.email, "new.user@example.com")).all();
      expect(created).toBeDefined();
      expect(created?.password).toBeTruthy();
      expect(created?.password).not.toBe("password123");
    });
  });

  describe("PUT /api/admin/users/[id]", () => {
    it("freezes and unfreezes a user", async () => {
      const freezeRes = await PUT(
        jsonReq(`http://localhost/api/admin/users/${MEMBER_USER.id}`, "PUT", { action: "freeze" }),
        ctx(MEMBER_USER.id),
      );
      expect(freezeRes.status).toBe(200);
      const frozen = await freezeRes.json();
      expect(frozen.frozenAt).toBeTruthy();

      const unfreezeRes = await PUT(
        jsonReq(`http://localhost/api/admin/users/${MEMBER_USER.id}`, "PUT", { action: "unfreeze" }),
        ctx(MEMBER_USER.id),
      );
      expect(unfreezeRes.status).toBe(200);
      const unfrozen = await unfreezeRes.json();
      expect(unfrozen.frozenAt).toBeNull();
    });

    it("promotes and demotes roles with safety checks", async () => {
      const promoteRes = await PUT(
        jsonReq(`http://localhost/api/admin/users/${MEMBER_USER.id}`, "PUT", {
          action: "set_role",
          role: "admin",
        }),
        ctx(MEMBER_USER.id),
      );
      expect(promoteRes.status).toBe(200);
      expect((await promoteRes.json()).role).toBe("admin");

      const demoteRes = await PUT(
        jsonReq(`http://localhost/api/admin/users/${MEMBER_USER.id}`, "PUT", {
          action: "set_role",
          role: "member",
        }),
        ctx(MEMBER_USER.id),
      );
      expect(demoteRes.status).toBe(200);
      expect((await demoteRes.json()).role).toBe("member");
    });

    it("blocks demoting the last admin", async () => {
      await testDb.db.delete(users).where(eq(users.id, MEMBER_USER.id)).run();

      const res = await PUT(
        jsonReq(`http://localhost/api/admin/users/${ADMIN_USER.id}`, "PUT", {
          action: "set_role",
          role: "member",
        }),
        ctx(ADMIN_USER.id),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("At least one administrator");
    });

    it("resets user password", async () => {
      const res = await PUT(
        jsonReq(`http://localhost/api/admin/users/${MEMBER_USER.id}`, "PUT", {
          action: "reset_password",
          password: "newpassword123",
        }),
        ctx(MEMBER_USER.id),
      );

      expect(res.status).toBe(200);
      const [updated] = testDb.db.select().from(users).where(eq(users.id, MEMBER_USER.id)).all();
      expect(updated.password).toBeTruthy();
      expect(updated.password).not.toBe("newpassword123");
    });
  });

  describe("DELETE /api/admin/users/[id]", () => {
    it("blocks deleting your own account", async () => {
      const res = await DELETE(new Request(`http://localhost/api/admin/users/${ADMIN_USER.id}`, { method: "DELETE" }), ctx(ADMIN_USER.id));
      expect(res.status).toBe(400);
    });

    it("deletes a user account", async () => {
      const res = await DELETE(
        new Request(`http://localhost/api/admin/users/${MEMBER_USER.id}`, { method: "DELETE" }),
        ctx(MEMBER_USER.id),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      const [deleted] = testDb.db.select().from(users).where(eq(users.id, MEMBER_USER.id)).all();
      expect(deleted).toBeUndefined();
    });
  });
});
