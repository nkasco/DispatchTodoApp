"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  api,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TaskRecurrenceType,
  type TaskCustomRecurrenceUnit,
  type TaskTemplatePreset,
  type Project,
} from "@/lib/client";
import { PROJECT_COLORS } from "@/lib/projects";
import { CustomSelect } from "@/components/CustomSelect";
import { parseTaskCustomRecurrenceRule } from "@/lib/task-recurrence";
import { renderTemplate } from "@/lib/templates";

export function TaskModal({
  task,
  defaultProjectId,
  onClose,
  onSaved,
}: {
  task: Task | null;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = task !== null;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium",
  );
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const parsedRecurrenceRule = parseTaskCustomRecurrenceRule(task?.recurrenceRule);
  const [recurrenceType, setRecurrenceType] = useState<TaskRecurrenceType>(
    task?.recurrenceType ?? "none",
  );
  const [customInterval, setCustomInterval] = useState<string>(
    String(parsedRecurrenceRule?.interval ?? 2),
  );
  const [customUnit, setCustomUnit] = useState<TaskCustomRecurrenceUnit>(
    parsedRecurrenceRule?.unit ?? "week",
  );
  const [projectId, setProjectId] = useState(
    task?.projectId ?? defaultProjectId ?? "",
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [activeTemplateField, setActiveTemplateField] = useState<"title" | "description">("title");
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplatePreset[]>([]);
  const [loadingTaskTemplates, setLoadingTaskTemplates] = useState(false);
  const [showTemplateHelp, setShowTemplateHelp] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let active = true;
    api.projects.list().then((data) => {
      if (!active) return;
      setProjects(Array.isArray(data) ? data : data.data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showTemplateHelp) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowTemplateHelp(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showTemplateHelp]);

  useEffect(() => {
    let active = true;
    setLoadingTaskTemplates(true);
    api.me
      .getPreferences()
      .then((preferences) => {
        if (!active) return;
        setTaskTemplates(preferences.templatePresets.tasks);
      })
      .catch(() => {
        if (!active) return;
        setTaskTemplates([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingTaskTemplates(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (recurrenceType === "custom") {
      const interval = Number(customInterval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        setError("Custom recurrence interval must be a whole number between 1 and 365.");
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      if (isEditing) {
        await api.tasks.update(task.id, {
          title: title.trim(),
          description: description || undefined,
          status,
          priority,
          dueDate: dueDate || null,
          projectId: projectId || null,
          recurrenceType,
          recurrenceRule:
            recurrenceType === "custom"
              ? {
                  interval: Number(customInterval),
                  unit: customUnit,
                }
              : null,
        });
      } else {
        await api.tasks.create({
          title: title.trim(),
          description: description || undefined,
          status,
          priority,
          dueDate: dueDate || undefined,
          projectId: projectId || null,
          recurrenceType,
          recurrenceRule:
            recurrenceType === "custom"
              ? {
                  interval: Number(customInterval),
                  unit: customUnit,
                }
              : null,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  const statusOptions = [
    { value: "open", label: "Open", dot: "bg-blue-500" },
    { value: "in_progress", label: "In Progress", dot: "bg-yellow-500" },
    { value: "done", label: "Done", dot: "bg-green-500" },
  ];

  const priorityOptions = [
    { value: "low", label: "Low", dot: "bg-neutral-400" },
    { value: "medium", label: "Medium", dot: "bg-yellow-500" },
    { value: "high", label: "High", dot: "bg-red-500" },
  ];

  const projectOptions = [
    { value: "", label: "No Project", dot: "bg-neutral-300" },
    ...projects
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: project.id,
        label: project.name,
        dot: PROJECT_COLORS[project.color]?.dot ?? "bg-neutral-400",
      })),
  ];

  const recurrenceTypeOptions = [
    { value: "none", label: "No recurrence", dot: "bg-neutral-300" },
    { value: "daily", label: "Daily", dot: "bg-blue-500" },
    { value: "weekly", label: "Weekly", dot: "bg-emerald-500" },
    { value: "monthly", label: "Monthly", dot: "bg-amber-500" },
    { value: "custom", label: "Custom", dot: "bg-violet-500" },
  ];

  const customUnitOptions = [
    { value: "day", label: "Day(s)" },
    { value: "week", label: "Week(s)" },
    { value: "month", label: "Month(s)" },
  ];

  const templateTokens = [
    { label: "Date", token: "{{date:YYYY-MM-DD}}" },
    { label: "Weekend Block", token: "{{if:day=sat}}...{{/if}}" },
    { label: "Specific Date Block", token: "{{if:month=jan&dom=05}}...{{/if}}" },
  ];

  const previewReferenceDate = dueDate || new Date().toISOString();
  const renderedTitlePreview = renderTemplate(title, { referenceDate: previewReferenceDate });
  const renderedDescriptionPreview = renderTemplate(description, { referenceDate: previewReferenceDate });

  function insertTemplateToken(token: string) {
    const target =
      activeTemplateField === "title"
        ? titleInputRef.current
        : descriptionInputRef.current;

    if (!target) return;

    const selectionStart = target.selectionStart ?? target.value.length;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const value = target.value;
    const nextValue = value.slice(0, selectionStart) + token + value.slice(selectionEnd);
    const nextCursor = selectionStart + token.length;

    if (activeTemplateField === "title") {
      setTitle(nextValue);
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    } else {
      setDescription(nextValue);
      setTimeout(() => {
        descriptionInputRef.current?.focus();
        descriptionInputRef.current?.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    }
  }

  function applyTaskTemplate(template: TaskTemplatePreset) {
    setTitle(template.title);
    setDescription(template.description);
    setRecurrenceType(template.recurrenceType);

    if (template.recurrenceType === "custom") {
      const parsedRule = parseTaskCustomRecurrenceRule(template.recurrenceRule);
      if (parsedRule) {
        setCustomInterval(String(parsedRule.interval));
        setCustomUnit(parsedRule.unit);
      } else {
        setCustomInterval("2");
        setCustomUnit("week");
      }
    } else {
      setCustomInterval("2");
      setCustomUnit("week");
    }

    setError("");
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-8 sm:py-12">
      <div
        className="absolute inset-0 bg-black/40 animate-backdrop-enter"
        onClick={onClose}
      />

      <form
        onSubmit={handleSubmit}
        className="relative my-auto w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900 space-y-4 animate-modal-enter"
      >
        <h2 className="text-lg font-semibold dark:text-white">
          {isEditing ? "Edit Task" : "New Task"}
        </h2>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Title
          </label>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setActiveTemplateField("title")}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Description
          </label>
          <textarea
            ref={descriptionInputRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setActiveTemplateField("description")}
            rows={3}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none resize-none transition-colors"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-blue-100 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Template Helpers
            </p>
            <button
              type="button"
              onClick={() => setShowTemplateHelp(true)}
              aria-label="How template helpers work"
              aria-haspopup="dialog"
              aria-expanded={showTemplateHelp}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 dark:border-blue-800 bg-white/80 dark:bg-blue-950/40 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-white dark:hover:bg-blue-950/60 active:scale-95 transition-all"
            >
              i
            </button>
          </div>
          <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
            Inserting into: <span className="font-semibold">{activeTemplateField === "title" ? "Title" : "Description"}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {templateTokens.map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => insertTemplateToken(entry.token)}
                className="rounded-full border border-blue-200 dark:border-blue-800 bg-white/80 dark:bg-blue-950/30 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-white dark:hover:bg-blue-950/50 active:scale-95 transition-all"
              >
                {entry.label}
              </button>
            ))}
          </div>
          {(title.includes("{{") || description.includes("{{")) && (
            <div className="rounded-lg border border-blue-200/80 dark:border-blue-900/70 bg-white/70 dark:bg-blue-950/20 p-2 text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <p><span className="font-semibold">Preview title:</span> {renderedTitlePreview || "(empty)"}</p>
              <p><span className="font-semibold">Preview description:</span> {renderedDescriptionPreview || "(empty)"}</p>
            </div>
          )}
        </div>

        {showTemplateHelp && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-black/50 animate-backdrop-enter"
              onClick={() => setShowTemplateHelp(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-lg rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-2xl space-y-4 animate-modal-enter"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Template Helper Guide
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTemplateHelp(false)}
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
                >
                  Close
                </button>
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Helpers are placeholders you can put in task title or description. They render
                automatically using the task due date (or today if no due date is set).
              </p>

              <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-3">
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Date Placeholder
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Use <code className="rounded bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5">{"{{date:YYYY-MM-DD}}"}</code> to insert a formatted date.
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Example: <code className="rounded bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5">Standup {"{{date:MMM D}}"}</code>
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-3">
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Conditional Blocks
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Use blocks like <code className="rounded bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5">{"{{if:day=sat}}...{{/if}}"}</code> to show text only on matching dates.
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Combine conditions with <code className="rounded bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5">&amp;</code>, for example <code className="rounded bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5">{"{{if:month=jan&dom=05}}"}Anniversary{"{{/if}}"}</code>.
                </p>
              </div>

              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Tip: Use the live preview in this section to validate helper output before saving.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Saved Task Templates
          </p>
          {loadingTaskTemplates ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading templates...</p>
          ) : taskTemplates.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No saved task templates yet. Add them in Profile {"->"} Template Library.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {taskTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTaskTemplate(template)}
                  className="rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-500 active:scale-95 transition-all"
                >
                  {template.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PillGroup
            label="Status"
            value={status}
            options={statusOptions}
            onChange={(v) => setStatus(v as TaskStatus)}
          />

          <PillGroup
            label="Priority"
            value={priority}
            options={priorityOptions}
            onChange={(v) => setPriority(v as TaskPriority)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[0.8fr_1.2fr] gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Due Date
            </p>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            />
          </div>

          <CustomSelect
            label="Project"
            value={projectId}
            onChange={(v: string) => setProjectId(v)}
            options={projectOptions}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60 p-3">
          <PillGroup
            label="Recurrence"
            value={recurrenceType}
            options={recurrenceTypeOptions}
            onChange={(v) => setRecurrenceType(v as TaskRecurrenceType)}
          />
          {recurrenceType === "custom" && (
            <div className="grid grid-cols-[0.6fr_1fr] gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  Interval
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={customInterval}
                  onChange={(e) => setCustomInterval(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
                />
              </div>
              <CustomSelect
                label="Custom Rule Unit"
                value={customUnit}
                onChange={(v: string) => setCustomUnit(v as TaskCustomRecurrenceUnit)}
                options={customUnitOptions}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 active:scale-95 transition-all inline-flex items-center gap-2"
          >
            {saving && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spinner" />
            )}
            {saving ? "Saving..." : isEditing ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

type PillOption = { value: string; label: string; dot?: string };

function PillGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PillOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
      <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={`${label}-${option.value}`}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-white/80 text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-white dark:hover:border-neutral-500"
              }`}
            >
              {option.dot && <span className={`h-2.5 w-2.5 rounded-full ${option.dot}`} />}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
