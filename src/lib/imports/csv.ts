import {
  createEmptyBatch,
  detectCsvMapping,
  enrichBatchWithImplicitProjects,
  ensureMarkdownSections,
  fingerprintBuffer,
  normalizeBoolean,
  normalizeImportDate,
  normalizeTaskPriority,
  normalizeTaskStatus,
  parseCsv,
  stableKey,
  trimmed,
} from "@/lib/imports/helpers";
import type { CanonicalImportTask, ImportAdapterDefinition, ImportFieldMapping } from "@/lib/imports/types";

function resolveProjectName(rawValue: string): string | null {
  const trimmedValue = trimmed(rawValue);
  if (!trimmedValue) return null;

  const projectLabel = trimmedValue
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("project:"));

  if (projectLabel) {
    return projectLabel.slice("project:".length).trim() || null;
  }

  return trimmedValue;
}

function mapRowToTask(
  row: Record<string, string>,
  mapping: ImportFieldMapping,
  timeZone: string | null,
): CanonicalImportTask | null {
  const title = trimmed(mapping.title ? row[mapping.title] : "");
  if (!title) return null;

  const status = normalizeTaskStatus(mapping.status ? row[mapping.status] : undefined);
  const completed = mapping.completed ? normalizeBoolean(row[mapping.completed]) : status === "done";
  const finalStatus = completed ? "done" : status;
  const priority = normalizeTaskPriority(mapping.priority ? row[mapping.priority] : undefined);
  const dueDate = normalizeImportDate(mapping.dueDate ? row[mapping.dueDate] : undefined, timeZone);
  const projectName = resolveProjectName(mapping.project ? row[mapping.project] : "");
  const sourceId = trimmed(mapping.sourceId ? row[mapping.sourceId] : "");
  const description = ensureMarkdownSections({
    description: mapping.description ? row[mapping.description] : null,
    metadata: mapping.notes && trimmed(row[mapping.notes]) ? { importedNotes: row[mapping.notes] } : undefined,
  });

  return {
    sourceKey: sourceId || `csv-task:${stableKey([title, dueDate, projectName, description])}`,
    externalId: sourceId || null,
    title,
    description,
    status: finalStatus,
    priority,
    dueDate,
    projectName,
    metadata: {
      importedFrom: "csv",
    },
    archived: false,
  };
}

export const csvImportAdapter: ImportAdapterDefinition = {
  format: "csv",
  label: "Structured CSV / Spreadsheet",
  description:
    "Imports flat task tables from spreadsheets and generic task exporters, with configurable column mapping and smart header detection.",
  expectedStructure:
    "A CSV with headers for title plus optional description, status, priority, due date, project, completion, and source id columns.",
  sampleHint:
    "Dispatch exports include Title, Description, Status, Priority, Due Date, Project, Labels, and Dispatch Task ID columns.",
  compatibility: {
    exact: ["Task title", "Status", "Priority", "Due date", "Project name when present"],
    approximate: ["Labels and comments are appended as imported metadata", "Completion booleans normalize into Dispatch status"],
    unsupported: ["Automation rules", "Remote assignees", "Attachments"],
  },
  parse: async (context) => {
    const fingerprint = fingerprintBuffer(context.buffer);
    const batch = createEmptyBatch(context.fileName, fingerprint);
    const { headers, rows } = parseCsv(context.text);
    const detected = detectCsvMapping(headers);
    const mapping = {
      ...detected.mapping,
      ...(context.fieldMapping ?? {}),
    };

    batch.mappingSuggestions = {
      availableColumns: headers,
      fieldMapping: mapping,
      requiredFields: ["title"],
    };
    batch.inferredMappings.push(...detected.inferred);

    for (const row of rows) {
      const task = mapRowToTask(row, mapping, context.userTimeZone);
      if (!task) {
        batch.skipped.push({
          sourceKey: `csv-row:${stableKey(headers.map((header) => row[header]))}`,
          reason: "Row had no title after mapping.",
        });
        continue;
      }

      if (!context.options.includeCompleted && task.status === "done") {
        batch.skipped.push({ sourceKey: task.sourceKey, reason: "Completed items were excluded." });
        continue;
      }

      batch.tasks.push(task);
    }

    enrichBatchWithImplicitProjects(batch);
    return batch;
  },
};
