import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { users } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const { POST } = await import("@/app/api/auth/register/route");

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  // --- Successful registration ---

  it("registers a new user with name, email, and password", async () => {
    const res = await POST(jsonReq({
      name: "Nate",
      email: "nate@example.com",
      password: "test12345",
    }) as any);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.message).toBe("Registration successful");
  });

  it("creates a user record in the database", async () => {
    await POST(jsonReq({
      name: "Nate",
      email: "nate@example.com",
      password: "test12345",
    }) as any);

    const [user] = testDb.db.select().from(users).all();
    expect(user).toBeDefined();
    expect(user.email).toBe("nate@example.com");
    expect(user.name).toBe("Nate");
    expect(user.role).toBe("admin");
  });

  it("hashes the password (does not store plaintext)", async () => {
    await POST(jsonReq({
      name: "Nate",
      email: "nate@example.com",
      password: "test12345",
    }) as any);

    const [user] = testDb.db.select().from(users).all();
    expect(user.password).toBeDefined();
    expect(user.password).not.toBe("test12345");
    expect(user.password!.startsWith("$2")).toBe(true); // bcrypt hash prefix
  });

  it("uses email prefix as name when name is not provided", async () => {
    const res = await POST(jsonReq({
      email: "airforceones@gmail.com",
      password: "test12345",
    }) as any);
    expect(res.status).toBe(201);

    const [user] = testDb.db.select().from(users).all();
    expect(user.name).toBe("airforceones");
    expect(user.role).toBe("admin");
  });

  it("assigns member role for non-first users", async () => {
    await POST(jsonReq({
      name: "First",
      email: "first@example.com",
      password: "test12345",
    }) as any);

    const secondRes = await POST(jsonReq({
      name: "Second",
      email: "second@example.com",
      password: "test12345",
    }) as any);

    expect(secondRes.status).toBe(201);

    const allUsers = testDb.db.select().from(users).all();
    const second = allUsers.find((user) => user.email === "second@example.com");
    expect(second?.role).toBe("member");
  });

  // --- Validation ---

  it("rejects missing email", async () => {
    const res = await POST(jsonReq({
      password: "test12345",
    }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing password", async () => {
    const res = await POST(jsonReq({
      email: "nate@example.com",
    }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const res = await POST(jsonReq({
      email: "not-an-email",
      password: "test12345",
    }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects password shorter than 8 characters", async () => {
    const res = await POST(jsonReq({
      email: "nate@example.com",
      password: "short",
    }) as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("8 characters");
  });

  // --- Duplicate prevention ---

  it("rejects duplicate email registration", async () => {
    await POST(jsonReq({
      email: "nate@example.com",
      password: "test12345",
    }) as any);

    const res = await POST(jsonReq({
      email: "nate@example.com",
      password: "different12345",
    }) as any);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already registered");
  });

  // --- Edge cases ---

  it("rejects invalid JSON body", async () => {
    const res = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    }) as any);
    expect(res.status).toBe(500);
  });

  it("rejects non-string email", async () => {
    const res = await POST(jsonReq({
      email: 12345,
      password: "test12345",
    }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects non-string password", async () => {
    const res = await POST(jsonReq({
      email: "nate@example.com",
      password: 12345678,
    }) as any);
    expect(res.status).toBe(400);
  });
});
