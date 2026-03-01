import {
  createEmptyBatch,
  enrichBatchWithImplicitProjects,
  ensureMarkdownSections,
  fingerprintBuffer,
  normalizeImportDate,
  stableKey,
  trimmed,
} from "@/lib/imports/helpers";
import type { ImportAdapterDefinition } from "@/lib/imports/types";

const TOKEN_PATTERN = /(?:^|\s)(due:\d{4}-\d{2}-\d{2}|@[a-zA-Z0-9_-]+|#dispatch:[a-zA-Z0-9_-]+)/g;

function parseLine(line: string, timeZone: string | null) {
  const trimmedLine = line.trim();
  if (!trimmedLine) return null;
  const match = trimmedLine.match(/^- \[( |x)\] (.+)$/i);
  if (!match) return null;

  const completed = match[1].toLowerCase() === "x";
  const body = match[2];
  const tokens = Array.from(body.matchAll(TOKEN_PATTERN)).map((entry) => entry[1]);
  const title = body.replace(TOKEN_PATTERN, "").replace(/\s+!!$/, "").trim();
  const dueToken = tokens.find((token) => token.startsWith("due:"));
  const projectToken = tokens.find((token) => token.startsWith("@"));
  const dispatchToken = tokens.find((token) => token.startsWith("#dispatch:"));
  const priority = body.includes("!!") ? "high" : body.includes("!") ? "medium" : "low";

  return {
    sourceKey: dispatchToken ? dispatchToken.slice("#dispatch:".length) : `plain:${stableKey([trimmedLine])}`,
    externalId: dispatchToken ? dispatchToken.slice("#dispatch:".length) : null,
    title,
    dueDate: normalizeImportDate(dueToken ? dueToken.slice("due:".length) : null, timeZone),
    projectName: projectToken ? projectToken.slice(1) : null,
    status: completed ? "done" as const : "open" as const,
    priority: priority as "low" | "medium" | "high",
  };
}

export const plainTextImportAdapter: ImportAdapterDefinition = {
  format: "plain_text",
  label: "Plain-Text Tasks",
  description:
    "Imports text-first task files, including Dispatch plain-text exports with completion markers, due-date tokens, and project/context tags.",
  expectedStructure:
    "One task per line, ideally in `- [ ] Task title due:YYYY-MM-DD @project #dispatch:id` form. Wrapped indented lines become note content.",
  sampleHint:
    "Dispatch plain-text exports use `- [ ]` markers, `due:` tokens, `@project` tags, and `#dispatch:` ids for round-trip imports.",
  compatibility: {
    exact: ["Task title", "Completion marker", "Due date token", "Project tag", "Dispatch source id when present"],
    approximate: ["Inline metadata becomes markdown notes", "Unsupported tokens are preserved in metadata sections"],
    unsupported: ["Attachments", "Subtask completion state beyond plain checklist text"],
  },
  parse: async (context) => {
    const fingerprint = fingerprintBuffer(context.buffer);
    const batch = createEmptyBatch(context.fileName, fingerprint);
    const lines = context.text.replace(/\r\n/g, "\n").split("\n");

    let currentDescription: string[] = [];
    let currentTaskIndex = -1;

    for (const rawLine of lines) {
      if (rawLine.startsWith("  ") && currentTaskIndex >= 0) {
        currentDescription.push(rawLine.trim());
        continue;
      }

      if (currentTaskIndex >= 0 && currentDescription.length > 0) {
        batch.tasks[currentTaskIndex].description = ensureMarkdownSections({
          description: currentDescription.join("\n"),
        });
        currentDescription = [];
      }

      const parsed = parseLine(rawLine, context.userTimeZone);
      if (!parsed) continue;
      if (!context.options.includeCompleted && parsed.status === "done") {
        batch.skipped.push({ sourceKey: parsed.sourceKey, reason: "Completed items were excluded." });
        currentTaskIndex = -1;
        continue;
      }

      batch.tasks.push({
        sourceKey: parsed.sourceKey,
        externalId: parsed.externalId,
        title: parsed.title,
        description: "",
        status: parsed.status,
        priority: parsed.priority,
        dueDate: parsed.dueDate,
        projectName: parsed.projectName,
        metadata: {
          importedFrom: "plain_text",
        },
        archived: false,
      });
      currentTaskIndex = batch.tasks.length - 1;
    }

    if (currentTaskIndex >= 0 && currentDescription.length > 0) {
      batch.tasks[currentTaskIndex].description = ensureMarkdownSections({
        description: currentDescription.join("\n"),
      });
    }

    enrichBatchWithImplicitProjects(batch);
    return batch;
  },
};
