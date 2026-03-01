import {
  createEmptyBatch,
  enrichBatchWithImplicitProjects,
  ensureMarkdownSections,
  fingerprintBuffer,
  normalizeImportDate,
  normalizeTaskPriority,
  stableKey,
  trimmed,
} from "@/lib/imports/helpers";
import type { ImportAdapterDefinition } from "@/lib/imports/types";

function unfoldIcs(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseIcsProperties(lines: string[]) {
  const properties = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).split(";")[0].toUpperCase();
    const value = line.slice(separator + 1);
    properties.set(key, value);
  }
  return properties;
}

export const icsImportAdapter: ImportAdapterDefinition = {
  format: "ics",
  label: "iCalendar (.ics)",
  description:
    "Imports VTODO and VEVENT records into Dispatch tasks, preserving dates, summaries, descriptions, and completion state where available.",
  expectedStructure:
    "A UTF-8 `.ics` file containing VTODO or VEVENT blocks. UID, SUMMARY, DESCRIPTION, DUE/DTSTART, and STATUS are mapped when present.",
  sampleHint:
    "Dispatch-generated ICS exports use `UID:<task-id>@dispatch.local`, VTODO for dated tasks, and VEVENT fallback for items without due dates.",
  compatibility: {
    exact: ["Summary/title", "Description", "Date-only due values", "Completion state", "Dispatch UID round-trip markers"],
    approximate: ["VEVENT imports map into tasks rather than calendar events", "Datetime values are normalized into the user's date in their timezone"],
    unsupported: ["Recurring rules are preserved only as warnings", "Calendar attendees and alarms"],
  },
  parse: async (context) => {
    const fingerprint = fingerprintBuffer(context.buffer);
    const batch = createEmptyBatch(context.fileName, fingerprint);
    const lines = unfoldIcs(context.text);
    let currentType: "VTODO" | "VEVENT" | null = null;
    let currentLines: string[] = [];

    function flushCurrent() {
      if (!currentType || currentLines.length === 0) return;
      const properties = parseIcsProperties(currentLines);
      const title = trimmed(properties.get("SUMMARY"));
      if (!title) return;

      const uid = properties.get("UID") ?? null;
      const dueDate = normalizeImportDate(
        properties.get("DUE") ?? properties.get("DTSTART") ?? properties.get("DTSTAMP") ?? null,
        context.userTimeZone,
      );
      const status = (properties.get("STATUS") ?? "").toUpperCase();
      const completed = ["COMPLETED", "CONFIRMED"].includes(status) || properties.has("COMPLETED");
      const priority = normalizeTaskPriority(properties.get("PRIORITY"));
      const description = ensureMarkdownSections({
        description: properties.get("DESCRIPTION") ?? "",
      });

      if (properties.has("RRULE")) {
        batch.warnings.push(`Recurring rule on "${title}" was not imported and should be recreated manually.`);
      }

      if (!context.options.includeCompleted && completed) {
        batch.skipped.push({
          sourceKey: `ics:${uid ?? stableKey([title, dueDate])}`,
          reason: "Completed items were excluded.",
        });
        return;
      }

      batch.tasks.push({
        sourceKey: uid?.replace("@dispatch.local", "") ?? `ics:${stableKey([title, dueDate])}`,
        externalId: uid ?? null,
        title,
        description,
        status: completed ? "done" : "open",
        priority,
        dueDate,
        projectName: null,
        metadata: {
          importedFrom: "ics",
          component: currentType,
        },
        archived: false,
      });
    }

    for (const line of lines) {
      if (line === "BEGIN:VTODO") {
        currentType = "VTODO";
        currentLines = [];
        continue;
      }
      if (line === "BEGIN:VEVENT") {
        currentType = "VEVENT";
        currentLines = [];
        continue;
      }
      if (line === "END:VTODO" || line === "END:VEVENT") {
        flushCurrent();
        currentType = null;
        currentLines = [];
        continue;
      }
      if (currentType) {
        currentLines.push(line);
      }
    }

    enrichBatchWithImplicitProjects(batch);
    return batch;
  },
};
