import {
  createEmptyBatch,
  fingerprintBuffer,
  isCsvPath,
  isHtmlPath,
  isMarkdownPath,
  isTextPath,
  loadZipEntries,
  normalizeImportDate,
  stableKey,
  stripHtml,
} from "@/lib/imports/helpers";
import { csvImportAdapter } from "@/lib/imports/csv";
import type { ImportAdapterDefinition } from "@/lib/imports/types";

export const workspaceZipImportAdapter: ImportAdapterDefinition = {
  format: "workspace_zip",
  label: "Workspace ZIP",
  description:
    "Imports mixed workspace bundles by extracting CSV task tables, long-form pages as notes, and dated dispatch documents when present.",
  expectedStructure:
    "A ZIP archive containing markdown, HTML, TXT, CSV, and optionally nested asset folders. Files are imported by extension and path heuristics.",
  sampleHint:
    "Markdown/HTML pages become notes, CSV files are parsed as task tables, and files in dispatch/history folders with YYYY-MM-DD names become dispatch summaries.",
  compatibility: {
    exact: ["Markdown pages as notes", "CSV tasks inside the archive", "Dispatch-like dated pages when filenames contain ISO dates"],
    approximate: ["Attachments become an asset manifest note when enabled", "HTML is converted to plain text content"],
    unsupported: ["Binary attachments as first-class Dispatch assets", "Workspace-specific permissions and automation"],
  },
  parse: async (context) => {
    const fingerprint = fingerprintBuffer(context.buffer);
    const batch = createEmptyBatch(context.fileName, fingerprint);
    const files = await loadZipEntries(context.buffer);
    const assetPaths: string[] = [];

    for (const file of files) {
      const fileName = file.name;
      const content = await file.async("string");
      if (/(^|\/)(assets?|attachments?)(\/|$)/i.test(fileName)) {
        assetPaths.push(fileName);
        continue;
      }

      if (isCsvPath(fileName)) {
        const nested = await csvImportAdapter.parse({
          ...context,
          fileName,
          buffer: Buffer.from(content, "utf8"),
          text: content,
        });
        batch.tasks.push(...nested.tasks.map((task) => ({
          ...task,
          sourceKey: `zip:${fileName}:${task.sourceKey}`,
        })));
        batch.projects.push(...nested.projects.map((project) => ({
          ...project,
          sourceKey: `zip:${fileName}:${project.sourceKey}`,
        })));
        batch.warnings.push(...nested.warnings);
        batch.inferredMappings.push(...nested.inferredMappings);
        batch.skipped.push(...nested.skipped);
        continue;
      }

      if (isMarkdownPath(fileName) || isHtmlPath(fileName) || isTextPath(fileName)) {
        const normalizedContent = isHtmlPath(fileName) ? stripHtml(content) : content.trim();
        const title = fileName.split("/").pop() ?? fileName;
        const dateMatch = title.match(/\d{4}-\d{2}-\d{2}/);
        if (/dispatch/i.test(fileName) && dateMatch) {
          batch.dispatches.push({
            sourceKey: `zip-dispatch:${fileName}`,
            externalId: null,
            date: normalizeImportDate(dateMatch[0], context.userTimeZone) ?? dateMatch[0],
            summary: normalizedContent,
            metadata: {
              sourcePath: fileName,
            },
          });
          continue;
        }

        batch.notes.push({
          sourceKey: `zip-note:${fileName}`,
          externalId: null,
          title: title.replace(/\.[^.]+$/, ""),
          content: normalizedContent,
          relatedProjectName: null,
          metadata: {
            sourcePath: fileName,
          },
        });
        continue;
      }

      assetPaths.push(fileName);
    }

    if (assetPaths.length > 0) {
      if (context.options.includeAttachments) {
        batch.notes.push({
          sourceKey: `zip-assets:${stableKey(assetPaths)}`,
          externalId: null,
          title: `Imported Assets Manifest - ${context.fileName}`,
          content: ["# Imported Assets", ...assetPaths.map((path) => `- ${path}`)].join("\n"),
          relatedProjectName: null,
          metadata: {
            source: "workspace_zip",
          },
        });
      } else {
        batch.warnings.push(
          `${assetPaths.length} attachment or asset file(s) were skipped. Enable attachment preservation to keep a manifest note.`,
        );
      }
    }

    return batch;
  },
};
