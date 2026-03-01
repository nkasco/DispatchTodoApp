import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { importItemMappings, importSessions, projects, tasks, users } from "@/db/schema";
import { createTestDb } from "@/test/db";
import { mockSession } from "@/test/setup";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const { POST: PREVIEW } = await import("@/app/api/imports/preview/route");
const { POST: COMMIT } = await import("@/app/api/imports/route");

const FIXTURES_DIR = path.join(process.cwd(), "src", "test", "fixtures", "imports");

const TEST_USER = { id: "user-1", name: "Test User", email: "test@test.com", timeZone: "America/New_York" };
const OTHER_USER = { id: "user-2", name: "Other User", email: "other@test.com", timeZone: "UTC" };

function loadFixture(fileName: string) {
  return readFileSync(path.join(FIXTURES_DIR, fileName), "utf8");
}

function toBase64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

function jsonReq(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function csvPayload(overrides?: Record<string, unknown>) {
  return {
    format: "csv",
    fileName: "csv-sample.csv",
    mimeType: "text/csv",
    contentBase64: toBase64(loadFixture("csv-sample.csv")),
    options: {
      duplicateMode: "skip",
      includeCompleted: true,
      includeArchived: false,
      includeComments: true,
      includeAttachments: false,
    },
    ...overrides,
  };
}

function boardPayload(overrides?: Record<string, unknown>) {
  return {
    format: "board_json",
    fileName: "board-sample.json",
    mimeType: "application/json",
    contentBase64: toBase64(loadFixture("board-sample.json")),
    options: {
      duplicateMode: "skip",
      includeCompleted: true,
      includeArchived: false,
      includeComments: true,
      includeAttachments: false,
    },
    ...overrides,
  };
}

describe("Imports API", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.db.insert(users).values(TEST_USER).run();
    testDb.db.insert(users).values(OTHER_USER).run();
    mockSession({ user: TEST_USER });
  });

  it("requires authentication for preview and commit", async () => {
    mockSession(null);

    const previewRes = await PREVIEW(jsonReq("http://localhost/api/imports/preview", csvPayload()), {});
    const commitRes = await COMMIT(jsonReq("http://localhost/api/imports", csvPayload()), {});

    expect(previewRes.status).toBe(401);
    expect(commitRes.status).toBe(401);
  });

  it("creates preview sessions with counts, warnings, and manifest data", async () => {
    const res = await PREVIEW(jsonReq("http://localhost/api/imports/preview", csvPayload({
      options: {
        duplicateMode: "skip",
        includeCompleted: false,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      },
    })), {});

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.counts).toEqual({
      tasks: 1,
      projects: 1,
      notes: 0,
      dispatches: 0,
      skipped: 1,
    });
    expect(data.mappingSuggestions?.fieldMapping.title).toBe("Task Title");

    const [session] = await testDb.db
      .select()
      .from(importSessions)
      .where(eq(importSessions.id, data.sessionId));

    expect(session.status).toBe("previewed");
    expect(session.sourceFormat).toBe("csv");
    expect(session.warningCount).toBe(0);
    expect(session.skippedCount).toBe(1);
    expect(JSON.parse(session.manifest ?? "{}")).toMatchObject({
      sourceFormat: "csv",
      counts: { tasks: 1, projects: 1, notes: 0, dispatches: 0, skipped: 1 },
    });
  });

  it("commits imports, persists mappings, and normalizes board content into Dispatch records", async () => {
    const previewRes = await PREVIEW(jsonReq("http://localhost/api/imports/preview", boardPayload()), {});
    const preview = await previewRes.json();

    const commitRes = await COMMIT(jsonReq("http://localhost/api/imports", boardPayload({
      previewSessionId: preview.sessionId,
    })), {});

    expect(commitRes.status).toBe(200);
    const data = await commitRes.json();
    expect(data.created).toBeGreaterThan(0);
    expect(data.updated).toBe(0);
    expect(data.skipped).toBe(0);

    const importedTasks = await testDb.db.select().from(tasks).where(eq(tasks.userId, TEST_USER.id));
    const importedProjects = await testDb.db.select().from(projects).where(eq(projects.userId, TEST_USER.id));
    const mappings = await testDb.db.select().from(importItemMappings).where(eq(importItemMappings.userId, TEST_USER.id));
    const [session] = await testDb.db.select().from(importSessions).where(eq(importSessions.id, data.sessionId));
    const heroRefreshTask = importedTasks.find((task) => task.title === "Ship hero refresh");

    expect(importedProjects).toHaveLength(1);
    expect(importedTasks).toHaveLength(2);
    expect(heroRefreshTask?.description).toContain("## Checklist");
    expect(heroRefreshTask?.description).toContain("## Comments");
    expect(mappings).toHaveLength(3);
    expect(session.status).toBe("committed");
    expect(session.createdCount).toBe(3);
    expect(session.errorMessage).toBeNull();
  });

  it("skips duplicate re-imports for the same user without creating extra rows", async () => {
    const firstRes = await COMMIT(jsonReq("http://localhost/api/imports", csvPayload()), {});
    expect(firstRes.status).toBe(200);

    const previewRes = await PREVIEW(jsonReq("http://localhost/api/imports/preview", csvPayload()), {});
    const preview = await previewRes.json();
    expect(preview.warnings.some((warning: string) => warning.includes("already imported"))).toBe(true);

    const secondRes = await COMMIT(jsonReq("http://localhost/api/imports", csvPayload()), {});
    expect(secondRes.status).toBe(200);
    const second = await secondRes.json();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(4);

    const importedTasks = await testDb.db.select().from(tasks).where(eq(tasks.userId, TEST_USER.id));
    const importedProjects = await testDb.db.select().from(projects).where(eq(projects.userId, TEST_USER.id));
    expect(importedTasks).toHaveLength(2);
    expect(importedProjects).toHaveLength(2);
  });

  it("enforces preview-session ownership across users", async () => {
    const previewRes = await PREVIEW(jsonReq("http://localhost/api/imports/preview", csvPayload()), {});
    const preview = await previewRes.json();

    mockSession({ user: OTHER_USER });
    const commitRes = await COMMIT(jsonReq("http://localhost/api/imports", csvPayload({
      previewSessionId: preview.sessionId,
    })), {});

    expect(commitRes.status).toBe(400);
    await expect(commitRes.json()).resolves.toEqual({ error: "Import preview session not found" });

    const otherUserTasks = await testDb.db.select().from(tasks).where(eq(tasks.userId, OTHER_USER.id));
    expect(otherUserTasks).toHaveLength(0);
  });

  it("rolls back committed writes when a staged import fails", async () => {
    const res = await COMMIT(jsonReq("http://localhost/api/imports", csvPayload({
      testForceFailureAt: "after_projects",
    })), {});

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Forced failure after project import" });

    const importedTasks = await testDb.db.select().from(tasks).where(eq(tasks.userId, TEST_USER.id));
    const importedProjects = await testDb.db.select().from(projects).where(eq(projects.userId, TEST_USER.id));
    const [session] = await testDb.db.select().from(importSessions).orderBy(importSessions.createdAt);

    expect(importedTasks).toHaveLength(0);
    expect(importedProjects).toHaveLength(0);
    expect(session.status).toBe("failed");
    expect(session.errorMessage).toBe("Forced failure after project import");
  });

  it("rejects previews that exceed CSV row guardrails", async () => {
    const rows = ["Title"];
    for (let index = 0; index < 5001; index += 1) {
      rows.push(`Task ${index + 1}`);
    }

    const res = await PREVIEW(jsonReq("http://localhost/api/imports/preview", {
      format: "csv",
      fileName: "large.csv",
      mimeType: "text/csv",
      contentBase64: toBase64(rows.join("\n")),
    }), {});

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Import exceeds 5000 rows. Split the spreadsheet into smaller files.",
    });
  });
});
