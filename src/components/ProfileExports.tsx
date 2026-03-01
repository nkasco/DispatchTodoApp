"use client";

import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/CustomSelect";
import { IconCalendar, IconCheckCircle, IconCode, IconDocument } from "@/components/icons";
import { api, type ExportFormat, type ExportPreview, type ExportScope } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string }> = [
  { value: "csv", label: "Structured CSV" },
  { value: "plain_text", label: "Plain-Text Tasks" },
  { value: "ics", label: "iCalendar (.ics)" },
];

const SCOPE_OPTIONS: Array<{ value: ExportScope; label: string }> = [
  { value: "tasks_only", label: "Tasks only" },
  { value: "tasks_and_projects", label: "Tasks + projects" },
];

const FORMAT_ICONS = {
  csv: IconCode,
  plain_text: IconDocument,
  ics: IconCalendar,
} as const;

export function ProfileExports() {
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [scope, setScope] = useState<ExportScope>("tasks_only");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const formatLabel = useMemo(
    () => FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? "Export",
    [format],
  );
  const ActiveIcon = FORMAT_ICONS[format];

  async function handlePreview() {
    setPreviewing(true);
    try {
      const result = await api.exports.previewTasks({
        format,
        scope,
        includeCompleted,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to build export preview");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await api.exports.downloadTasks({
        format,
        scope,
        includeCompleted,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(href);

      toast.success(`Exported ${result.fileName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export tasks");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Exports</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Generate task exports optimized for the target system instead of a single lowest-common-denominator file.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
          <IconCheckCircle className="h-3.5 w-3.5" />
          Export Ready
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomSelect
              label="Format"
              value={format}
              onChange={(value) => setFormat(value as ExportFormat)}
              options={FORMAT_OPTIONS}
            />
            <CustomSelect
              label="Scope"
              value={scope}
              onChange={(value) => setScope(value as ExportScope)}
              options={SCOPE_OPTIONS}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              Start Date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
              />
            </label>
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              End Date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(event) => setIncludeCompleted(event.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            Include completed tasks
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={previewing}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-60"
            >
              {previewing ? "Building Preview..." : "Preview Export"}
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-60"
            >
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-sky-50 via-white to-indigo-50 dark:from-sky-950/20 dark:via-neutral-900 dark:to-indigo-950/20 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/80 dark:bg-neutral-900/80 p-2 shadow-sm">
              <ActiveIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">{formatLabel}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {preview?.adapter.description ?? "Select a format to see compatibility notes and fallback rules."}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
            <div>
              <p className="font-semibold text-neutral-800 dark:text-neutral-100">Compatibility Notes</p>
              <p className="mt-1">
                {format === "csv" && "Best for spreadsheets, importer wizards, and generic task tools that expect flat tabular data."}
                {format === "plain_text" && "Best for markdown-centric and plain-text task apps that understand inline tokens and tags."}
                {format === "ics" && "Best for calendar/task ecosystems that accept .ics imports, especially VTODO or calendar-feed workflows."}
              </p>
            </div>
            <div>
              <p className="font-semibold text-neutral-800 dark:text-neutral-100">Known Constraints</p>
              <p className="mt-1">
                {format === "csv" && "Hierarchies and Dispatch-only metadata are flattened into rows and label-style columns."}
                {format === "plain_text" && "Structured recurrence and rich formatting are converted into inline text tokens and metadata tags."}
                {format === "ics" && "Fields unsupported by iCalendar importers are omitted, and tasks without due dates fall back to VEVENT blocks."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-100 dark:bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
              {preview.counts.tasks} task{preview.counts.tasks === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {preview.counts.projects} project{preview.counts.projects === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {preview.fileName}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <PreviewList title="Omitted Fields" items={preview.omittedFields} emptyLabel="No omitted fields." />
            <PreviewList title="Fallback Mappings" items={preview.fallbackMappings} emptyLabel="No fallback mappings." />
            <PreviewList title="Warnings" items={preview.warnings} emptyLabel="No warnings for this export." />
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-2 text-xs text-neutral-600 dark:text-neutral-300">
          {items.map((item) => (
            <li key={item} className="leading-5">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
