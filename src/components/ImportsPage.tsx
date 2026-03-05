"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/CustomSelect";
import {
  api,
  type ImportCommitResponse,
  type ImportDuplicateMode,
  type ImportFieldMapping,
  type ImportPreviewResponse,
  type ImportSourceFormat,
} from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import {
  IconCalendar,
  IconCheckCircle,
  IconCode,
  IconDocument,
  IconFolder,
  IconGrid,
  IconInbox,
  IconPuzzle,
} from "@/components/icons";

type WizardStep = "format" | "upload" | "mapping" | "preview" | "result";

const IMPORT_FORMATS: Array<{
  format: ImportSourceFormat;
  label: string;
  description: string;
  expectedStructure: string;
  sampleHint: string;
  compatibility: {
    exact: string[];
    approximate: string[];
    unsupported: string[];
  };
}> = [
  {
    format: "csv",
    label: "Structured CSV / Spreadsheet",
    description: "Import flat task tables from spreadsheets and common app exports with configurable field mapping.",
    expectedStructure: "CSV headers for title plus optional description, status, priority, due date, project, and completion columns.",
    sampleHint: "Works well with task app spreadsheet exports and Dispatch CSV exports.",
    compatibility: {
      exact: ["Task title", "Status", "Priority", "Due date", "Project name"],
      approximate: ["Labels and comments become imported metadata", "Completion booleans normalize into task status"],
      unsupported: ["Attachments", "Remote automation rules"],
    },
  },
  {
    format: "board_json",
    label: "Board-Style JSON",
    description: "Convert kanban-style board exports into Dispatch projects, tasks, checklist markdown, and note-style history.",
    expectedStructure: "JSON with boards/lists/cards or projects/tasks plus optional checklists, comments, labels, and archive flags.",
    sampleHint: "Typical exports include boards -> lists -> cards with names like Todo, Doing, and Done.",
    compatibility: {
      exact: ["Board/project names", "Card titles", "Due dates", "Checklist text"],
      approximate: ["Comments append into markdown", "List names infer task status buckets"],
      unsupported: ["Board automations", "Member assignments", "Cover images"],
    },
  },
  {
    format: "workspace_zip",
    label: "Workspace ZIP",
    description: "Import mixed workspace bundles by splitting pages into notes, dated logs into dispatches, and CSV tables into tasks.",
    expectedStructure: "ZIP archive containing markdown, HTML, TXT, CSV, and optionally nested asset folders.",
    sampleHint: "Markdown/HTML pages become notes. CSV files become tasks. Dated dispatch pages import when paths contain ISO dates.",
    compatibility: {
      exact: ["Markdown pages", "CSV task tables", "Dispatch-like dated pages"],
      approximate: ["Attachments become a manifest note", "HTML is converted to plain text"],
      unsupported: ["Binary assets as first-class app attachments", "Workspace automations"],
    },
  },
  {
    format: "ics",
    label: "iCalendar (.ics)",
    description: "Import VTODO and VEVENT exports into Dispatch tasks with timezone-aware date handling.",
    expectedStructure: "UTF-8 iCalendar file containing VTODO and/or VEVENT components.",
    sampleHint: "Dispatch ICS exports and many calendar/task apps will round-trip through this path.",
    compatibility: {
      exact: ["Title", "Description", "Date values", "Completion state"],
      approximate: ["VEVENTs become tasks", "Datetime values collapse into the user timezone's date"],
      unsupported: ["Attendees", "Alarms", "Full recurrence fidelity"],
    },
  },
  {
    format: "plain_text",
    label: "Plain-Text Tasks",
    description: "Import tokenized text task files including Dispatch plain-text exports.",
    expectedStructure: "One task per line, ideally `- [ ] Task due:YYYY-MM-DD @project #dispatch:id`.",
    sampleHint: "Indented wrapped lines become description content.",
    compatibility: {
      exact: ["Completion marker", "Due-date token", "Project tag", "Dispatch ids when present"],
      approximate: ["Inline metadata becomes note sections"],
      unsupported: ["Attachments", "Rich subtasks"],
    },
  },
  {
    format: "dispatch_roundtrip",
    label: "Dispatch Round-Trip",
    description: "Restore files produced by Dispatch exports with stronger source-id preservation and duplicate handling.",
    expectedStructure: "Dispatch CSV, Dispatch plain-text, or Dispatch ICS export files.",
    sampleHint: "Best for backup/restore and portability from phase 18 exports.",
    compatibility: {
      exact: ["Dispatch source ids", "Task content", "Completion state in supported formats"],
      approximate: ["Project inference follows the export file shape"],
      unsupported: ["Deleted-state history", "Export response headers that are not part of the file body"],
    },
  },
];

const DUPLICATE_OPTIONS: Array<{ value: ImportDuplicateMode; label: string }> = [
  { value: "skip", label: "Skip duplicates" },
  { value: "merge", label: "Merge into existing" },
  { value: "create_copy", label: "Create copies" },
];

const FIELD_OPTIONS: Array<keyof ImportFieldMapping> = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "project",
  "completed",
  "notes",
  "sourceId",
  "dispatchDate",
];

const FORMAT_ICONS = {
  csv: IconCode,
  board_json: IconGrid,
  workspace_zip: IconFolder,
  ics: IconCalendar,
  plain_text: IconDocument,
  dispatch_roundtrip: IconInbox,
} as const;

interface ImportsPageProps {
  backHref?: string;
  backLabel?: string;
}

export function ImportsPage({ backHref = "/profile", backLabel = "Back to Profile" }: ImportsPageProps = {}) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("format");
  const [format, setFormat] = useState<ImportSourceFormat>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>("skip");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeComments, setIncludeComments] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<ImportFieldMapping>({});
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeFormat = useMemo(
    () => IMPORT_FORMATS.find((entry) => entry.format === format) ?? IMPORT_FORMATS[0],
    [format],
  );
  const ActiveIcon = FORMAT_ICONS[format];

  async function fileToBase64(input: File) {
    const arrayBuffer = await input.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  async function analyzeFile() {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }

    setLoading(true);
    try {
      const previewResult = await api.imports.preview({
        format,
        fileName: file.name,
        mimeType: file.type || null,
        contentBase64: await fileToBase64(file),
        options: {
          duplicateMode,
          includeCompleted,
          includeArchived,
          includeComments,
          includeAttachments,
        },
      });

      setErrorMessage(null);
      setPreview(previewResult);
      setFieldMapping(previewResult.mappingSuggestions?.fieldMapping ?? {});
      setStep(previewResult.mappingSuggestions ? "mapping" : "preview");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze import";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshPreviewWithMapping() {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }

    setLoading(true);
    try {
      const previewResult = await api.imports.preview({
        format,
        fileName: file.name,
        mimeType: file.type || null,
        contentBase64: await fileToBase64(file),
        options: {
          duplicateMode,
          includeCompleted,
          includeArchived,
          includeComments,
          includeAttachments,
        },
        fieldMapping,
      });
      setErrorMessage(null);
      setPreview(previewResult);
      setStep("preview");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview import";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function commitImport() {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    if (!preview) {
      toast.error("Preview the import first");
      return;
    }

    setLoading(true);
    try {
      const commitResult = await api.imports.commit({
        format,
        fileName: file.name,
        mimeType: file.type || null,
        contentBase64: await fileToBase64(file),
        options: {
          duplicateMode,
          includeCompleted,
          includeArchived,
          includeComments,
          includeAttachments,
        },
        fieldMapping,
        previewSessionId: preview.sessionId,
      });
      setErrorMessage(null);
      setResult(commitResult);
      setStep("result");
      toast.success(`Imported ${commitResult.created + commitResult.updated} item(s)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to commit import";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 animate-fade-in-up">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-500/20">
            <ActiveIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Imports</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Guided migration into Dispatch with preview-first validation instead of a blind file upload.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["1", "Choose source"],
            ["2", "Upload + options"],
            ["3", "Map fields"],
            ["4", "Preview + commit"],
          ].map(([index, label]) => (
            <div key={index} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                Step {index}
              </p>
              <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-sky-50 via-white to-orange-50 dark:from-sky-950/20 dark:via-neutral-900 dark:to-orange-950/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Format Guide</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Pick the source that best matches your export. Each adapter has different strengths, caveats, and preservation rules.
            </p>
          </div>
          <Link
            href={backHref}
            className="inline-flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-white/80 dark:hover:bg-neutral-800 transition-colors"
          >
            {backLabel}
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {IMPORT_FORMATS.map((entry) => {
              const Icon = FORMAT_ICONS[entry.format];
              const active = entry.format === format;
              return (
                <button
                  key={entry.format}
                  type="button"
                  onClick={() => {
                    setFormat(entry.format);
                    setErrorMessage(null);
                    setPreview(null);
                    setResult(null);
                    setStep("upload");
                  }}
                  className={`rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                    active
                      ? "border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Icon className={`h-5 w-5 ${active ? "text-white" : "text-blue-600 dark:text-blue-300"}`} />
                    {active && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold">{entry.label}</p>
                  <p className={`mt-2 text-xs leading-5 ${active ? "text-blue-50" : "text-neutral-500 dark:text-neutral-400"}`}>
                    {entry.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/85 dark:bg-neutral-900 p-4">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">{activeFormat.label}</p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{activeFormat.expectedStructure}</p>
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{activeFormat.sampleHint}</p>

            <CompatibilitySection title="Preserved Exactly" items={activeFormat.compatibility.exact} tone="emerald" />
            <CompatibilitySection title="Approximated" items={activeFormat.compatibility.approximate} tone="amber" />
            <CompatibilitySection title="Not Imported" items={activeFormat.compatibility.unsupported} tone="rose" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Upload and Import Controls</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Choose the source file, set duplicate handling, and decide how much history or archived data to preserve.
            </p>
          </div>

          <label className="block rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-950/40 px-4 py-6 text-center">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              {file ? file.name : "Choose an export file"}
            </span>
            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
              {file ? `${Math.round(file.size / 1024)} KB` : "Supported: CSV, JSON, ZIP, ICS, TXT"}
            </span>
            <input
              type="file"
              onChange={(event) => {
                setErrorMessage(null);
                setFile(event.target.files?.[0] ?? null);
              }}
              className="mt-4 block w-full text-xs text-neutral-500 dark:text-neutral-400"
            />
          </label>

          <CustomSelect
            label="Duplicate Handling"
            value={duplicateMode}
            onChange={(value) => setDuplicateMode(value as ImportDuplicateMode)}
            options={DUPLICATE_OPTIONS}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={includeCompleted} onChange={setIncludeCompleted} label="Include completed items" />
            <Toggle checked={includeArchived} onChange={setIncludeArchived} label="Include archived boards/projects" />
            <Toggle checked={includeComments} onChange={setIncludeComments} label="Import comments/history" />
            <Toggle checked={includeAttachments} onChange={setIncludeAttachments} label="Preserve attachments as manifests" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void analyzeFile()}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-60"
            >
              {loading ? "Analyzing..." : "Analyze File"}
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => setStep(preview.mappingSuggestions ? "mapping" : "preview")}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Resume Preview
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-4">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Import issue</p>
              <p className="mt-1 text-sm text-rose-700/90 dark:text-rose-200">{errorMessage}</p>
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-300/80">
                Write-stage failures roll back cleanly, so Dispatch does not keep partial imports.
              </p>
            </div>
          )}

          {step === "mapping" && preview?.mappingSuggestions ? (
            <>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Field Mapping</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Adjust the detected column mapping before generating the dry-run preview.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {FIELD_OPTIONS.map((field) => (
                  <CustomSelect
                    key={field}
                    label={field}
                    value={fieldMapping[field] ?? ""}
                    onChange={(value) => setFieldMapping((prev) => ({ ...prev, [field]: value || undefined }))}
                    options={[
                      { value: "", label: "Not mapped" },
                      ...preview.mappingSuggestions!.availableColumns.map((column) => ({
                        value: column,
                        label: column,
                      })),
                    ]}
                  />
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void refreshPreviewWithMapping()}
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-60"
                >
                  {loading ? "Previewing..." : "Preview Import"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Back
                </button>
              </div>
            </>
          ) : step === "preview" && preview ? (
            <>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Dry-Run Preview</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Review the migration impact before anything is written.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PreviewCount label="Tasks" value={preview.counts.tasks} />
                <PreviewCount label="Projects" value={preview.counts.projects} />
                <PreviewCount label="Notes" value={preview.counts.notes} />
                <PreviewCount label="Dispatches" value={preview.counts.dispatches} />
                <PreviewCount label="Skipped" value={preview.counts.skipped} />
              </div>
              <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                  Sample Records
                </p>
                <div className="mt-3 space-y-3 text-sm">
                  {preview.sample.tasks.map((task) => (
                    <div key={task.title} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
                      <p className="font-medium text-neutral-800 dark:text-neutral-200">{task.title}</p>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {task.status} · {task.priority} · {task.dueDate ?? "No due date"} · {task.projectName ?? "No project"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <PreviewLists preview={preview} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void commitImport()}
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-60"
                >
                  {loading ? "Importing..." : "Commit Import"}
                </button>
                {preview.mappingSuggestions && (
                  <button
                    type="button"
                    onClick={() => setStep("mapping")}
                    className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    Adjust Mapping
                  </button>
                )}
              </div>
            </>
          ) : step === "result" && result ? (
            <>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/30 p-2 text-emerald-700 dark:text-emerald-300">
                  <IconCheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Import Complete</h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Created {result.created}, updated {result.updated}, skipped {result.skipped}.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {result.details.map((detail) => (
                  <div key={`${detail.entityType}-${detail.title}`} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 px-3 py-2">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{detail.title}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {detail.entityType} · {detail.action}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                  Migration Notes
                </p>
                <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                  {includeAttachments
                    ? "Attachments and assets are preserved as manifest references when a direct Dispatch import is not available."
                    : "Attachments and assets were not imported. Enable attachment preservation on the next run if you want manifest notes."}
                </p>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Imports commit transactionally. If a write-stage failure happens, Dispatch rolls back instead of leaving partial records behind.
                </p>
              </div>
              {result.warnings.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
                    Warnings
                  </p>
                  <ul className="mt-2 space-y-2 text-sm text-amber-800 dark:text-amber-200">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={result.links.tasks} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
                  Open Tasks
                </Link>
                <Link href={result.links.notes} className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                  Open Notes
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setPreview(null);
                    setStep("format");
                  }}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Import Another File
                </button>
              </div>
            </>
          ) : (
            <EmptyState step={step} />
          )}
        </div>
      </section>
    </div>
  );
}

function CompatibilitySection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber" | "rose";
}) {
  const tones = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300",
    rose: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300",
  };

  return (
    <div className={`mt-4 rounded-xl border px-3 py-3 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em]">{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
      />
      {label}
    </label>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}

function PreviewLists({ preview }: { preview: ImportPreviewResponse }) {
  const blocks = [
    { title: "Warnings", items: preview.warnings },
    { title: "Inferred Mappings", items: preview.inferredMappings },
  ];

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {blocks.map((block) => (
        <div key={block.title} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">{block.title}</p>
          {block.items.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">None</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ step }: { step: WizardStep }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-950/20 px-6 py-10 text-center">
      <div className="rounded-full bg-blue-100 dark:bg-blue-950/30 p-4 text-blue-700 dark:text-blue-300">
        <IconPuzzle className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">
        {step === "format" ? "Choose a source format" : "Analyze a file to continue"}
      </h2>
      <p className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
        The wizard will walk you through source guidance, upload options, field mapping where needed, a dry-run preview, and a transactional commit.
      </p>
    </div>
  );
}
