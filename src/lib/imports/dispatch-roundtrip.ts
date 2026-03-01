import { csvImportAdapter } from "@/lib/imports/csv";
import { icsImportAdapter } from "@/lib/imports/ics";
import { plainTextImportAdapter } from "@/lib/imports/plain-text";
import {
  createEmptyBatch,
  fileExtension,
  fingerprintBuffer,
} from "@/lib/imports/helpers";
import type { ImportAdapterDefinition } from "@/lib/imports/types";

export const dispatchRoundtripImportAdapter: ImportAdapterDefinition = {
  format: "dispatch_roundtrip",
  label: "Dispatch Round-Trip",
  description:
    "Imports files produced by Dispatch exports with stronger source-id preservation for CSV, plain-text, and ICS round-trip restores.",
  expectedStructure:
    "A Dispatch export file from phase 18, typically CSV with Dispatch Task ID, plain-text with #dispatch:id tokens, or ICS with @dispatch.local UIDs.",
  sampleHint:
    "Round-trip imports preserve Dispatch-generated source identifiers so repeated restore runs can skip, merge, or create copies deterministically.",
  compatibility: {
    exact: ["Dispatch task ids from CSV", "Dispatch #dispatch tokens from plain-text", "Dispatch ICS UIDs"],
    approximate: ["Project inference follows the original export representation", "Timestamps are restored from available file fields only"],
    unsupported: ["Deleted/recycle-bin state", "Export manifest headers when only the file body is available"],
  },
  parse: async (context) => {
    const ext = fileExtension(context.fileName);
    if (ext === "csv" || context.text.startsWith("Title,")) {
      const batch = await csvImportAdapter.parse({
        ...context,
        fieldMapping: {
          title: "Title",
          description: "Description",
          status: "Status",
          priority: "Priority",
          dueDate: "Due Date",
          project: "Project",
          completed: "Completed",
          sourceId: "Dispatch Task ID",
          ...(context.fieldMapping ?? {}),
        },
      });
      batch.sourceMetadata.detectedVariant = "dispatch_csv";
      return batch;
    }

    if (ext === "ics" || context.text.includes("@dispatch.local")) {
      const batch = await icsImportAdapter.parse(context);
      batch.sourceMetadata.detectedVariant = "dispatch_ics";
      return batch;
    }

    if (ext === "txt" || context.text.includes("#dispatch:")) {
      const batch = await plainTextImportAdapter.parse(context);
      batch.sourceMetadata.detectedVariant = "dispatch_plain_text";
      return batch;
    }

    const fallback = createEmptyBatch(context.fileName, fingerprintBuffer(context.buffer));
    fallback.warnings.push("Could not confidently detect a Dispatch round-trip export variant.");
    return fallback;
  },
};
