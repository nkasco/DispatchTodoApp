"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  api,
  type Project,
  type TaskCustomRecurrenceRule,
  type TaskRecurrenceMonthlyOrdinal,
  type TaskRecurrenceWeekday,
  type RecurrenceSeries,
  type TaskCustomRecurrenceUnit,
  type TaskPriority,
  type TaskRecurrenceBehavior,
  type TaskTemplatePreset,
} from "@/lib/client";
import { formatDueDateTime } from "@/lib/due-time";
import {
  doesIsoDateMatchTaskRecurrenceRule,
  getTaskRecurrenceDateConstraintMessage,
  parseTaskCustomRecurrenceRule,
  TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS,
  TASK_RECURRENCE_WEEKDAY_LABELS,
} from "@/lib/task-recurrence";
import { PROJECT_COLORS } from "@/lib/projects";
import { CustomSelect } from "@/components/CustomSelect";
import { renderTemplate } from "@/lib/templates";

type SeriesType = RecurrenceSeries["recurrenceType"];
type MonthlyMode = "same_date" | "nth_weekday";

const WEEKDAY_PICKER_ORDER: TaskRecurrenceWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MONTHLY_ORDINAL_OPTIONS = [
  { value: "1", label: TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS[1] },
  { value: "2", label: TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS[2] },
  { value: "3", label: TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS[3] },
  { value: "4", label: TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS[4] },
  { value: "-1", label: TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS[-1] },
];
const WEEKDAY_SELECT_OPTIONS = WEEKDAY_PICKER_ORDER.map((weekday) => ({
  value: weekday,
  label: TASK_RECURRENCE_WEEKDAY_LABELS[weekday],
}));

function getWeekdayFromIsoDate(value?: string | null): TaskRecurrenceWeekday {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "mon";
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return "mon";
  }

  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  return weekdays[date.getUTCDay()];
}

export function RecurrenceSeriesModal({
  series,
  projects,
  onClose,
  onSaved,
  onDeleted,
}: {
  series: RecurrenceSeries | null;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isEditing = series !== null;
  const parsedRule = parseTaskCustomRecurrenceRule(series?.recurrenceRule);
  const [title, setTitle] = useState(series?.title ?? "");
  const [description, setDescription] = useState(series?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(series?.priority ?? "medium");
  const [projectId, setProjectId] = useState(series?.projectId ?? "");
  const [recurrenceType, setRecurrenceType] = useState<SeriesType>(series?.recurrenceType ?? "daily");
  const [recurrenceBehavior, setRecurrenceBehavior] = useState<TaskRecurrenceBehavior>(
    series?.recurrenceBehavior ?? "after_completion",
  );
  const [customInterval, setCustomInterval] = useState<string>(String(parsedRule?.interval ?? 2));
  const [customUnit, setCustomUnit] = useState<TaskCustomRecurrenceUnit>(parsedRule?.unit ?? "week");
  const [weeklyDays, setWeeklyDays] = useState<TaskRecurrenceWeekday[]>(
    parsedRule?.unit === "week" ? (parsedRule.weekdays ?? []) : [],
  );
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(
    parsedRule?.unit === "month" && parsedRule.monthlyPattern ? "nth_weekday" : "same_date",
  );
  const [monthlyOrdinal, setMonthlyOrdinal] = useState<TaskRecurrenceMonthlyOrdinal>(
    parsedRule?.unit === "month" && parsedRule.monthlyPattern ? parsedRule.monthlyPattern.ordinal : 1,
  );
  const [monthlyWeekday, setMonthlyWeekday] = useState<TaskRecurrenceWeekday>(
    parsedRule?.unit === "month" && parsedRule.monthlyPattern
      ? parsedRule.monthlyPattern.weekday
      : getWeekdayFromIsoDate(series?.nextDueDate),
  );
  const [nextDueDate, setNextDueDate] = useState(series?.nextDueDate ?? "");
  const [dueTime, setDueTime] = useState(series?.dueTime ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [activeTemplateField, setActiveTemplateField] = useState<"title" | "description">("title");
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplatePreset[]>([]);
  const [loadingTaskTemplates, setLoadingTaskTemplates] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let current = true;
    setLoadingTaskTemplates(true);
    api.me
      .getPreferences()
      .then((preferences) => {
        if (!current) return;
        setTaskTemplates(preferences.templatePresets.tasks);
      })
      .catch(() => {
        if (!current) return;
        setTaskTemplates([]);
      })
      .finally(() => {
        if (!current) return;
        setLoadingTaskTemplates(false);
      });

    return () => {
      current = false;
    };
  }, []);

  function applyTaskTemplate(template: TaskTemplatePreset) {
    const parsed = parseTaskCustomRecurrenceRule(template.recurrenceRule);
    setTitle(template.title);
    setDescription(template.description);
    const templateSeriesType: SeriesType = template.recurrenceType === "none"
      ? "daily"
      : template.recurrenceType;
    setRecurrenceType(templateSeriesType);
    setRecurrenceBehavior(
      template.recurrenceType === "none"
        ? "after_completion"
        : (template.recurrenceBehavior ?? "after_completion"),
    );

    if (parsed) {
      setCustomInterval(String(parsed.interval));
      setCustomUnit(parsed.unit);
      setWeeklyDays(parsed.unit === "week" ? (parsed.weekdays ?? []) : []);
      setMonthlyMode(parsed.unit === "month" && parsed.monthlyPattern ? "nth_weekday" : "same_date");
      setMonthlyOrdinal(parsed.unit === "month" && parsed.monthlyPattern ? parsed.monthlyPattern.ordinal : 1);
      setMonthlyWeekday(
        parsed.unit === "month" && parsed.monthlyPattern
          ? parsed.monthlyPattern.weekday
          : getWeekdayFromIsoDate(nextDueDate),
      );
    } else {
      setCustomInterval("2");
      setCustomUnit("week");
      setWeeklyDays([]);
      setMonthlyMode("same_date");
      setMonthlyOrdinal(1);
      setMonthlyWeekday(getWeekdayFromIsoDate(nextDueDate));
    }
  }

  function handleWeeklyDayToggle(day: TaskRecurrenceWeekday) {
    setWeeklyDays((current) => current.includes(day)
      ? current.filter((entry) => entry !== day)
      : [...current, day].sort(
          (left, right) => WEEKDAY_PICKER_ORDER.indexOf(left) - WEEKDAY_PICKER_ORDER.indexOf(right),
        ));
  }

  function buildRecurrenceRule(): TaskCustomRecurrenceRule | null {
    if (recurrenceType === "daily") {
      return null;
    }

    if (recurrenceType === "weekly") {
      return weeklyDays.length > 0
        ? { interval: 1, unit: "week", weekdays: weeklyDays }
        : null;
    }

    if (recurrenceType === "monthly") {
      return monthlyMode === "nth_weekday"
        ? {
            interval: 1,
            unit: "month",
            monthlyPattern: {
              kind: "nth_weekday",
              ordinal: monthlyOrdinal,
              weekday: monthlyWeekday,
            },
          }
        : null;
    }

    const interval = Number(customInterval);
    const rule: TaskCustomRecurrenceRule = {
      interval,
      unit: customUnit,
    };

    if (customUnit === "week" && weeklyDays.length > 0) {
      rule.weekdays = weeklyDays;
    }

    if (customUnit === "month" && monthlyMode === "nth_weekday") {
      rule.monthlyPattern = {
        kind: "nth_weekday",
        ordinal: monthlyOrdinal,
        weekday: monthlyWeekday,
      };
    }

    return rule;
  }

  function insertTemplateToken(token: string) {
    const target = activeTemplateField === "title"
      ? titleInputRef.current
      : descriptionInputRef.current;
    if (!target) return;

    const selectionStart = target.selectionStart ?? target.value.length;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const currentValue = target.value;
    const nextValue = currentValue.slice(0, selectionStart) + token + currentValue.slice(selectionEnd);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!nextDueDate) {
      setError("Next due date is required.");
      return;
    }
    if (recurrenceType === "custom") {
      const interval = Number(customInterval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        setError("Custom interval must be a whole number between 1 and 365.");
        return;
      }
    }

    const recurrenceRule = buildRecurrenceRule();
    if (
      recurrenceType !== "daily"
      && recurrenceRule
      && !doesIsoDateMatchTaskRecurrenceRule(nextDueDate, recurrenceType, recurrenceRule)
    ) {
      setError(
        getTaskRecurrenceDateConstraintMessage("nextDueDate", recurrenceType, recurrenceRule)
          ?? "Next due date must match the recurrence rule.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        title: title.trim(),
        description: description || undefined,
        priority,
        projectId: projectId || null,
        recurrenceType,
        recurrenceBehavior,
        recurrenceRule,
        nextDueDate,
        dueTime: dueTime || null,
      };

      if (isEditing) {
        await api.recurrences.update(series.id, payload);
      } else {
        await api.recurrences.create(payload);
      }
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save recurrence series");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!series) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }

    setDeleting(true);
    setError("");
    try {
      await api.recurrences.delete(series.id);
      onDeleted();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete recurrence series");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const priorityOptions = [
    { value: "low", label: "Low", dot: "bg-neutral-400" },
    { value: "medium", label: "Medium", dot: "bg-yellow-500" },
    { value: "high", label: "High", dot: "bg-red-500" },
  ];
  const recurrenceTypeOptions = [
    { value: "daily", label: "Daily", dot: "bg-blue-500" },
    { value: "weekly", label: "Weekly", dot: "bg-emerald-500" },
    { value: "monthly", label: "Monthly", dot: "bg-amber-500" },
    { value: "custom", label: "Custom", dot: "bg-violet-500" },
  ];
  const recurrenceBehaviorOptions = [
    { value: "after_completion", label: "After Completion", dot: "bg-blue-500" },
    { value: "duplicate_on_schedule", label: "Duplicate On Schedule", dot: "bg-emerald-500" },
  ];
  const customUnitOptions = [
    { value: "day", label: "Day(s)" },
    { value: "week", label: "Week(s)" },
    { value: "month", label: "Month(s)" },
  ];
  const projectOptions = [
    { value: "", label: "No Project", dot: "bg-neutral-300" },
    ...[...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: project.id,
        label: project.name,
        dot: PROJECT_COLORS[project.color]?.dot ?? "bg-neutral-400",
      })),
  ];
  const templateTokens = [
    { label: "Date", token: "{{date:YYYY-MM-DD}}" },
    { label: "Weekend Block", token: "{{if:day=sat}}...{{/if}}" },
    { label: "Specific Date Block", token: "{{if:month=jan&dom=05}}...{{/if}}" },
  ];
  const previewReferenceDate = nextDueDate || new Date().toISOString();
  const renderedTitlePreview = renderTemplate(title, { referenceDate: previewReferenceDate });
  const renderedDescriptionPreview = renderTemplate(description, { referenceDate: previewReferenceDate });
  const showWeeklyPattern = recurrenceType === "weekly" || (recurrenceType === "custom" && customUnit === "week");
  const showMonthlyPattern = recurrenceType === "monthly" || (recurrenceType === "custom" && customUnit === "month");
  const monthlyModeOptions = [
    { value: "same_date", label: "Same Date", dot: "bg-blue-500" },
    { value: "nth_weekday", label: "Nth Weekday", dot: "bg-amber-500" },
  ];

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-8 sm:py-12">
      <div className="absolute inset-0 bg-black/40 animate-backdrop-enter" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative my-auto w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900 space-y-4 animate-modal-enter"
      >
        <h2 className="text-lg font-semibold dark:text-white">
          {isEditing ? "Edit Recurrence Series" : "New Recurrence Series"}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            Template Helpers
          </p>
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

        <div className="grid grid-cols-1 sm:grid-cols-[0.8fr_1.2fr] gap-4">
          <PillGroup
            label="Priority"
            value={priority}
            options={priorityOptions}
            onChange={(value) => setPriority(value as TaskPriority)}
          />
          <CustomSelect
            label="Project"
            value={projectId}
            onChange={(value: string) => setProjectId(value)}
            options={projectOptions}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60 p-3">
          <PillGroup
            label="Cadence"
            value={recurrenceType}
            options={recurrenceTypeOptions}
            onChange={(value) => setRecurrenceType(value as SeriesType)}
          />
          <PillGroup
            label="Behavior"
            value={recurrenceBehavior}
            options={recurrenceBehaviorOptions}
            onChange={(value) => setRecurrenceBehavior(value as TaskRecurrenceBehavior)}
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Instances are materialized on {formatDueDateTime("the due date", dueTime || null) ?? "the due date"}.
          </p>
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
                label="Custom Unit"
                value={customUnit}
                onChange={(value: string) => setCustomUnit(value as TaskCustomRecurrenceUnit)}
                options={customUnitOptions}
              />
            </div>
          )}
          {showWeeklyPattern && (
            <div className="space-y-2">
              <WeekdayPicker selectedDays={weeklyDays} onToggle={handleWeeklyDayToggle} />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {weeklyDays.length > 0
                  ? "Only the selected weekdays will be scheduled."
                  : "No specific weekdays selected. The schedule follows the weekday of the next due date."}
              </p>
            </div>
          )}
          {showMonthlyPattern && (
            <div className="space-y-3">
              <PillGroup
                label="Monthly Pattern"
                value={monthlyMode}
                options={monthlyModeOptions}
                onChange={(value) => setMonthlyMode(value as MonthlyMode)}
              />
              {monthlyMode === "nth_weekday" ? (
                <div className="grid grid-cols-2 gap-3">
                  <CustomSelect
                    label="Occurrence"
                    value={String(monthlyOrdinal)}
                    onChange={(value: string) => setMonthlyOrdinal(Number(value) as TaskRecurrenceMonthlyOrdinal)}
                    options={MONTHLY_ORDINAL_OPTIONS}
                  />
                  <CustomSelect
                    label="Weekday"
                    value={monthlyWeekday}
                    onChange={(value: string) => setMonthlyWeekday(value as TaskRecurrenceWeekday)}
                    options={WEEKDAY_SELECT_OPTIONS}
                  />
                </div>
              ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Uses the calendar date from the next due date and repeats on that same date each month.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 items-end sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Next Due Date
            </label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Due Time
            </label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <div>
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-95 disabled:opacity-50 ${
                  confirmDelete
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                }`}
              >
                {deleting ? "Deleting..." : confirmDelete ? "Confirm Delete" : "Delete Series"}
              </button>
            ) : null}
          </div>
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

function WeekdayPicker({
  selectedDays,
  onToggle,
}: {
  selectedDays: TaskRecurrenceWeekday[];
  onToggle: (day: TaskRecurrenceWeekday) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Repeat On
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {WEEKDAY_PICKER_ORDER.map((weekday) => {
          const active = selectedDays.includes(weekday);
          return (
            <button
              key={weekday}
              type="button"
              onClick={() => onToggle(weekday)}
              aria-pressed={active}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-white/80 text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-white dark:hover:border-neutral-500"
              }`}
            >
              {TASK_RECURRENCE_WEEKDAY_LABELS[weekday]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
