import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";
import { securitySettings } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: ReturnType<typeof createTestDb>;
let sqlCipherAvailable = true;
let encryptionState = {
  enabled: false,
  encryptedKey: null as string | null,
  updatedAt: new Date(0).toISOString(),
};

const sqliteStub = {
  pragma: vi.fn(),
  prepare: vi.fn(() => ({ get: vi.fn(() => ({ count: 1 })) })),
};

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
  get sqlite() {
    return sqliteStub as any;
  },
}));

vi.mock("@/lib/db-encryption", () => ({
  applySqlCipherKey: vi.fn(),
  applySqlCipherRekey: vi.fn(),
  decryptDbPassphrase: vi.fn((value: string) => value.replace(/^enc:/, "")),
  encryptDbPassphrase: vi.fn((value: string) => `enc:${value}`),
  isSqlCipherAvailable: vi.fn(() => sqlCipherAvailable),
  readDbEncryptionState: vi.fn(() => encryptionState),
  verifyDatabaseReadable: vi.fn(() => true),
  writeDbEncryptionState: vi.fn((next: typeof encryptionState) => {
    encryptionState = next;
  }),
}));

const { GET, PUT } = await import("@/app/api/admin/security/route");

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Admin Security API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    sqlCipherAvailable = true;
    encryptionState = {
      enabled: false,
      encryptedKey: null,
      updatedAt: new Date(0).toISOString(),
    };
    sqliteStub.pragma.mockReset();
    sqliteStub.prepare.mockReset();
    sqliteStub.prepare.mockReturnValue({ get: vi.fn(() => ({ count: 1 })) });
    mockSession({
      user: {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
      },
    });
  });

  it("returns default encryption settings", async () => {
    const res = await GET(new Request("http://localhost/api/admin/security"), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.databaseEncryptionEnabled).toBe(false);
    expect(data.sqlCipherAvailable).toBe(true);

    const [stored] = testDb.db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.id, 1))
      .all();
    expect(stored).toBeDefined();
  });

  it("rejects enabling encryption when SQLCipher is unavailable", async () => {
    sqlCipherAvailable = false;
    const res = await PUT(
      jsonReq("http://localhost/api/admin/security", { enabled: true, passphrase: "supersecure123" }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("SQLCipher");
  });

  it("enables encryption and stores encrypted key state", async () => {
    const res = await PUT(
      jsonReq("http://localhost/api/admin/security", { enabled: true, passphrase: "supersecure123" }),
      {},
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.databaseEncryptionEnabled).toBe(true);

    expect(encryptionState.enabled).toBe(true);
    expect(encryptionState.encryptedKey).toBe("enc:supersecure123");

    const [stored] = testDb.db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.id, 1))
      .all();
    expect(stored?.databaseEncryptionEnabled).toBe(true);
  });

  it("disables encryption and clears key state", async () => {
    encryptionState = {
      enabled: true,
      encryptedKey: "enc:supersecure123",
      updatedAt: new Date().toISOString(),
    };

    const res = await PUT(
      jsonReq("http://localhost/api/admin/security", { enabled: false }),
      {},
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.databaseEncryptionEnabled).toBe(false);
    expect(encryptionState.enabled).toBe(false);
    expect(encryptionState.encryptedKey).toBeNull();
  });
});
