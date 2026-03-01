import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { boardJsonImportAdapter } from "@/lib/imports/board-json";
import { csvImportAdapter } from "@/lib/imports/csv";
import { dispatchRoundtripImportAdapter } from "@/lib/imports/dispatch-roundtrip";
import { icsImportAdapter } from "@/lib/imports/ics";
import { plainTextImportAdapter } from "@/lib/imports/plain-text";
import { workspaceZipImportAdapter } from "@/lib/imports/workspace-zip";

const FIXTURES_DIR = path.join(process.cwd(), "src", "test", "fixtures", "imports");

function loadTextFixture(fileName: string) {
  return readFileSync(path.join(FIXTURES_DIR, fileName), "utf8");
}

async function buildWorkspaceZipFixture() {
  const zip = new JSZip();
  const workspaceDir = path.join(FIXTURES_DIR, "workspace-bundle");
  const entries = [
    "tasks.csv",
    path.join("notes", "release-notes.md"),
    path.join("dispatch", "2026-03-01.md"),
    path.join("assets", "diagram.txt"),
  ];

  for (const entry of entries) {
    zip.file(entry.replace(/\\/g, "/"), readFileSync(path.join(workspaceDir, entry)));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

describe("import adapters", () => {
  it("parses CSV fixtures with inferred mapping", async () => {
    const text = loadTextFixture("csv-sample.csv");
    const batch = await csvImportAdapter.parse({
      fileName: "csv-sample.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(text, "utf8"),
      text,
      userTimeZone: "America/New_York",
      options: {
        duplicateMode: "skip",
        includeCompleted: true,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      },
      fieldMapping: null,
    });

    expect(batch.tasks).toMatchInlineSnapshot(`
      [
        {
          "archived": false,
          "description": "Review source exports",
          "dueDate": "2026-03-08",
          "externalId": "csv-1",
          "metadata": {
            "importedFrom": "csv",
          },
          "priority": "high",
          "projectName": "Platform",
          "sourceKey": "csv-1",
          "status": "in_progress",
          "title": "Plan migration",
        },
        {
          "archived": false,
          "description": "Legacy notes cleanup",
          "dueDate": "2026-03-02",
          "externalId": "csv-2",
          "metadata": {
            "importedFrom": "csv",
          },
          "priority": "low",
          "projectName": "Ops",
          "sourceKey": "csv-2",
          "status": "done",
          "title": "Archive docs",
        },
      ]
    `);
    expect(batch.mappingSuggestions?.fieldMapping).toEqual({
      title: "Task Title",
      description: "Details",
      status: "State",
      priority: "Importance",
      dueDate: "Deadline",
      project: "Board",
      completed: "Done",
      sourceId: "External ID",
    });
    expect(batch.projects.map((project) => project.name)).toEqual(["Platform", "Ops"]);
    expect(batch.sourceMetadata.fileName).toBe("csv-sample.csv");
  });

  it("parses board JSON, plain text, and ICS fixtures", async () => {
    const boardText = loadTextFixture("board-sample.json");
    const plainText = loadTextFixture("plain-sample.txt");
    const icsText = loadTextFixture("calendar-sample.ics");

    const boardBatch = await boardJsonImportAdapter.parse({
      fileName: "board-sample.json",
      mimeType: "application/json",
      buffer: Buffer.from(boardText, "utf8"),
      text: boardText,
      userTimeZone: "UTC",
      options: {
        duplicateMode: "skip",
        includeCompleted: false,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      },
      fieldMapping: null,
    });
    const plainBatch = await plainTextImportAdapter.parse({
      fileName: "plain-sample.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(plainText, "utf8"),
      text: plainText,
      userTimeZone: "UTC",
      options: {
        duplicateMode: "skip",
        includeCompleted: true,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      },
      fieldMapping: null,
    });
    const icsBatch = await icsImportAdapter.parse({
      fileName: "calendar-sample.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(icsText, "utf8"),
      text: icsText,
      userTimeZone: "UTC",
      options: {
        duplicateMode: "skip",
        includeCompleted: true,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      },
      fieldMapping: null,
    });

    expect(boardBatch.tasks).toHaveLength(1);
    expect(boardBatch.tasks[0].description).toContain("## Checklist");
    expect(boardBatch.tasks[0].projectName).toBe("Website Relaunch");
    expect(plainBatch.tasks[0].sourceKey).toBe("pt-1");
    expect(plainBatch.tasks[1].status).toBe("done");
    expect(icsBatch.tasks.map((task) => task.title)).toEqual([
      "Review contract draft",
      "Archive finance receipts",
    ]);
  });

  it("parses workspace ZIP and Dispatch round-trip fixtures", async () => {
    const zipBuffer = await buildWorkspaceZipFixture();
    const zipBatch = await workspaceZipImportAdapter.parse({
      fileName: "workspace.zip",
      mimeType: "application/zip",
      buffer: zipBuffer,
      text: "",
      userTimeZone: "UTC",
      options: {
        duplicateMode: "skip",
        includeCompleted: true,
        includeArchived: false,
        includeComments: true,
        includeAttachments: true,
      },
      fieldMapping: null,
    });

    const dispatchCsvText = "Title,Description,Status,Priority,Due Date,Project,Completed,Dispatch Task ID\nRestore me,Backup task,open,medium,2026-03-12,Restore,false,dispatch-1";
    const dispatchBatch = await dispatchRoundtripImportAdapter.parse({
      fileName: "dispatch-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(dispatchCsvText, "utf8"),
      text: dispatchCsvText,
      userTimeZone: "UTC",
      options: {
        duplicateMode: "skip",
        includeCompleted: true,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      },
      fieldMapping: null,
    });

    expect(zipBatch.tasks).toHaveLength(1);
    expect(zipBatch.notes.map((note) => note.title)).toContain("release-notes");
    expect(zipBatch.dispatches[0].date).toBe("2026-03-01");
    expect(zipBatch.notes.some((note) => note.title.includes("Assets Manifest"))).toBe(true);
    expect(dispatchBatch.sourceMetadata.detectedVariant).toBe("dispatch_csv");
    expect(dispatchBatch.tasks[0].sourceKey).toBe("dispatch-1");
  });
});
