import { createHash } from "node:crypto";
import JSZip from "jszip";
import { getIsoDateForTimeZone, isValidTimeZone, resolveEffectiveTimeZone } from "@/lib/timezone";
import type {
  CanonicalImportBatch,
  CanonicalImportDispatch,
  CanonicalImportNote,
  CanonicalImportProject,
  CanonicalImportTask,
  ImportFieldMapping,
  ImportOptions,
  ImportRequestPayload,
  ImportSourceFormat,
} from "@/lib/imports/types";

export const IMPORT_ADAPTER_VERSION = "1.0";
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_ARCHIVE_ENTRIES = 200;

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  duplicateMode: "skip",
  includeCompleted: true,
  includeArchived: false,
  includeComments: true,
  includeAttachments: false,
};

export function parseImportRequestPayload(body: unknown): ImportRequestPayload {
  const payload = body as Record<string, unknown>;
  const format = payload.format;
  const fileName = payload.fileName;
  const contentBase64 = payload.contentBase64;

  if (
    format !== "csv"
    && format !== "board_json"
    && format !== "workspace_zip"
    && format !== "ics"
    && format !== "plain_text"
    && format !== "dispatch_roundtrip"
  ) {
    throw new Error("format must be one of: csv, board_json, workspace_zip, ics, plain_text, dispatch_roundtrip");
  }

  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("fileName is required");
  }

  if (typeof contentBase64 !== "string" || !contentBase64.trim()) {
    throw new Error("contentBase64 is required");
  }

  return {
    format,
    fileName: fileName.trim(),
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : null,
    contentBase64: contentBase64.trim(),
    options: (payload.options as Partial<ImportOptions> | undefined) ?? undefined,
    fieldMapping: (payload.fieldMapping as ImportFieldMapping | undefined) ?? undefined,
    previewSessionId: typeof payload.previewSessionId === "string" ? payload.previewSessionId : null,
    testForceFailureAt:
      payload.testForceFailureAt === "after_projects" ? payload.testForceFailureAt : null,
  };
}

export function resolveImportOptions(options?: Partial<ImportOptions>): ImportOptions {
  return {
    duplicateMode:
      options?.duplicateMode === "create_copy" || options?.duplicateMode === "merge" || options?.duplicateMode === "skip"
        ? options.duplicateMode
        : DEFAULT_IMPORT_OPTIONS.duplicateMode,
    includeCompleted: typeof options?.includeCompleted === "boolean" ? options.includeCompleted : DEFAULT_IMPORT_OPTIONS.includeCompleted,
    includeArchived: typeof options?.includeArchived === "boolean" ? options.includeArchived : DEFAULT_IMPORT_OPTIONS.includeArchived,
    includeComments: typeof options?.includeComments === "boolean" ? options.includeComments : DEFAULT_IMPORT_OPTIONS.includeComments,
    includeAttachments: typeof options?.includeAttachments === "boolean" ? options.includeAttachments : DEFAULT_IMPORT_OPTIONS.includeAttachments,
  };
}

export function decodeImportBase64(contentBase64: string): Buffer {
  const buffer = Buffer.from(contentBase64, "base64");
  if (buffer.length === 0) {
    throw new Error("Uploaded file is empty");
  }
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`Import exceeds ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB. Use a smaller export or split the source file.`);
  }
  return buffer;
}

export function fingerprintBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function textFromBuffer(buffer: Buffer): string {
  return buffer.toString("utf8");
}

export function stableKey(parts: Array<string | null | undefined>): string {
  return createHash("sha1")
    .update(parts.filter((value): value is string => Boolean(value)).join("|"))
    .digest("hex");
}

export function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeImportDate(value: string | null | undefined, timeZone?: string | null): string | null {
  if (!value) return null;
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const parsed = new Date(trimmedValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getIsoDateForTimeZone(parsed, timeZone ?? null);
}

export function resolveImportTimeZone(timeZone?: string | null): string {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  return resolveEffectiveTimeZone(timeZone);
}

export function normalizeTaskStatus(raw: string | null | undefined): CanonicalImportTask["status"] {
  const value = (raw ?? "").trim().toLowerCase();
  if (["done", "complete", "completed", "closed"].includes(value)) return "done";
  if (["in_progress", "in progress", "doing", "active"].includes(value)) return "in_progress";
  return "open";
}

export function normalizeProjectStatus(raw: string | null | undefined): CanonicalImportProject["status"] {
  const value = (raw ?? "").trim().toLowerCase();
  if (["completed", "done", "closed", "archived"].includes(value)) return "completed";
  if (["paused", "on hold", "hold"].includes(value)) return "paused";
  return "active";
}

export function normalizeTaskPriority(raw: string | null | undefined): CanonicalImportTask["priority"] {
  const value = (raw ?? "").trim().toLowerCase();
  if (["high", "urgent", "p1", "1"].includes(value)) return "high";
  if (["low", "p3", "3"].includes(value)) return "low";
  return "medium";
}

export function normalizeBoolean(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "done", "completed"].includes(value);
}

export function ensureMarkdownSections(params: {
  description?: string | null;
  checklist?: string[];
  comments?: string[];
  metadata?: Record<string, unknown>;
}): string {
  const sections: string[] = [];
  if (trimmed(params.description)) {
    sections.push(trimmed(params.description));
  }

  if (params.checklist && params.checklist.length > 0) {
    sections.push(["## Checklist", ...params.checklist.map((item) => `- [ ] ${item}`)].join("\n"));
  }

  if (params.comments && params.comments.length > 0) {
    sections.push(["## Comments", ...params.comments.map((item) => `- ${item}`)].join("\n"));
  }

  const metadataEntries = Object.entries(params.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (metadataEntries.length > 0) {
    sections.push(["## Imported Metadata", ...metadataEntries.map(([key, value]) => `- ${key}: ${String(value)}`)].join("\n"));
  }

  return sections.join("\n\n").trim();
}

export function appendWarning(batch: CanonicalImportBatch, warning: string) {
  if (!batch.warnings.includes(warning)) {
    batch.warnings.push(warning);
  }
}

export function createEmptyBatch(fileName: string, fingerprint: string): CanonicalImportBatch {
  return {
    tasks: [],
    projects: [],
    notes: [],
    dispatches: [],
    warnings: [],
    inferredMappings: [],
    skipped: [],
    mappingSuggestions: null,
    sourceMetadata: {
      formatVersion: IMPORT_ADAPTER_VERSION,
      fingerprint,
      fileName,
      detectedVariant: null,
    },
  };
}

export function uniqueBySourceKey<T extends { sourceKey: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.sourceKey)) {
      map.set(item.sourceKey, item);
    }
  }
  return Array.from(map.values());
}

export function enrichBatchWithImplicitProjects(batch: CanonicalImportBatch) {
  const existing = new Set(batch.projects.map((project) => project.name.toLowerCase()));
  const referenced = new Set<string>();

  for (const task of batch.tasks) {
    if (task.projectName) referenced.add(task.projectName);
  }
  for (const note of batch.notes) {
    if (note.relatedProjectName) referenced.add(note.relatedProjectName);
  }

  for (const name of referenced) {
    if (existing.has(name.toLowerCase())) continue;
    batch.projects.push({
      sourceKey: `implicit-project:${stableKey([name])}`,
      externalId: null,
      name,
      description: "Created implicitly from imported task/note references.",
      status: "active",
      metadata: { implicit: true },
      archived: false,
    });
    batch.inferredMappings.push(`Created a project shell for "${name}" because imported records referenced it.`);
  }

  batch.projects = uniqueBySourceKey(batch.projects);
}

export function buildPreviewSample(batch: CanonicalImportBatch) {
  return {
    tasks: batch.tasks.slice(0, 3).map((task) => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectName: task.projectName,
    })),
    projects: batch.projects.slice(0, 3).map((project) => ({
      name: project.name,
      status: project.status,
    })),
    notes: batch.notes.slice(0, 3).map((note) => ({
      title: note.title,
    })),
    dispatches: batch.dispatches.slice(0, 3).map((dispatch) => ({
      date: dispatch.date,
    })),
  };
}

export function countsFromBatch(batch: CanonicalImportBatch) {
  return {
    tasks: batch.tasks.length,
    projects: batch.projects.length,
    notes: batch.notes.length,
    dispatches: batch.dispatches.length,
    skipped: batch.skipped.length,
  };
}

export function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw new Error(`Import exceeds ${MAX_IMPORT_ROWS} rows. Split the spreadsheet into smaller files.`);
  }

  const headers = rows[0].map((value) => value.trim());
  const dataRows = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
  return { headers, rows: dataRows };
}

export function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function detectCsvMapping(headers: string[]): { mapping: ImportFieldMapping; inferred: string[] } {
  const byNormalized = new Map(headers.map((header) => [normalizedHeader(header), header]));
  const mapping: ImportFieldMapping = {};
  const inferred: string[] = [];

  const candidates: Array<[keyof ImportFieldMapping, string[]]> = [
    ["title", ["title", "task", "tasktitle", "name", "summary"]],
    ["description", ["description", "details", "content", "notes"]],
    ["status", ["status", "state", "list"]],
    ["priority", ["priority", "importance"]],
    ["dueDate", ["duedate", "due", "deadline", "date"]],
    ["project", ["project", "board", "listname", "labels"]],
    ["completed", ["completed", "done", "isdone"]],
    ["sourceId", ["dispatchtaskid", "id", "externalid", "uid"]],
    ["dispatchDate", ["dispatchdate", "date"]],
  ];

  for (const [field, variants] of candidates) {
    const hit = variants.map((variant) => byNormalized.get(variant)).find(Boolean);
    if (hit) {
      mapping[field] = hit;
      inferred.push(`Mapped ${field} to "${hit}".`);
    }
  }

  return { mapping, inferred };
}

export async function loadZipEntries(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length > MAX_IMPORT_ARCHIVE_ENTRIES) {
    throw new Error(`Archive exceeds ${MAX_IMPORT_ARCHIVE_ENTRIES} entries. Use a smaller workspace export.`);
  }
  return files;
}

export function fileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot + 1).toLowerCase();
}

export function isMarkdownPath(path: string): boolean {
  return [".md", ".markdown"].some((suffix) => path.toLowerCase().endsWith(suffix));
}

export function isHtmlPath(path: string): boolean {
  return [".html", ".htm"].some((suffix) => path.toLowerCase().endsWith(suffix));
}

export function isCsvPath(path: string): boolean {
  return path.toLowerCase().endsWith(".csv");
}

export function isTextPath(path: string): boolean {
  return path.toLowerCase().endsWith(".txt");
}

export function pickImportFormatFromFileName(fileName: string): ImportSourceFormat | null {
  const ext = fileExtension(fileName);
  if (ext === "csv") return "csv";
  if (ext === "json") return "board_json";
  if (ext === "zip") return "workspace_zip";
  if (ext === "ics") return "ics";
  if (ext === "txt" || ext === "taskpaper") return "plain_text";
  return null;
}
