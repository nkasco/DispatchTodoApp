"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  api,
  type Dispatch,
  type Task,
  type TaskStatus,
  type TextTemplatePreset,
} from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { DispatchHistoryOverlay } from "@/components/DispatchHistoryOverlay";
import { renderTemplate } from "@/lib/templates";
import {
  IconBolt,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconDocument,
  IconPlus,
  IconSearch,
} from "@/components/icons";
import { addDaysToIsoDate, formatIsoDateForDisplay, getIsoDateForTimeZone } from "@/lib/timezone";

const STATUS_STYLES: Record<TaskStatus, { dot: string; label: string; ring: string }> = {
  open: { dot: "bg-blue-500", label: "Open", ring: "text-blue-500" },
  in_progress: { dot: "bg-yellow-500", label: "In Progress", ring: "text-yellow-500" },
  done: { dot: "bg-green-500", label: "Done", ring: "text-green-500" },
};

const COMPLETE_DISMISS_MS = 420;

export function DispatchPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const today = getIsoDateForTimeZone(new Date(), session?.user?.timeZone ?? null);
  const [date, setDate] = useState(today);
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSummary, setSavedSummary] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [showAddTasks, setShowAddTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [unfinalizing, setUnfinalizing] = useState(false);
  const [unfinalizeWarning, setUnfinalizeWarning] = useState<{ nextDate: string } | null>(null);
  const [completingIds, setCompletingIds] = useState<string[]>([]);
  const [dispatchTemplates, setDispatchTemplates] = useState<TextTemplatePreset[]>([]);
  const [loadingDispatchTemplates, setLoadingDispatchTemplates] = useState(false);
  const completionTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const previousTodayRef = useRef(today);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    previousTodayRef.current = today;
    setDate((current) => (current === previousToday ? today : current));
  }, [today]);

  const fetchDispatch = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.dispatches.list(date) as Dispatch[];
      let d = list[0] ?? null;

      if (!d) {
        try {
          d = await api.dispatches.create({ date });
        } catch {
          // Race condition (e.g. Strict Mode double-invoke) — re-fetch
          const retry = await api.dispatches.list(date) as Dispatch[];
          d = retry[0] ?? null;
        }
      }

      setDispatch(d);
      setSummary(d.summary ?? "");

      const tasks = await api.dispatches.getTasks(d.id);
      setLinkedTasks(tasks);

      const all = await api.tasks.list() as Task[];
      setAllTasks(all);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchDispatch();
  }, [fetchDispatch]);

  useEffect(() => {
    if (!confirmComplete) return;
    const timer = setTimeout(() => setConfirmComplete(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmComplete]);

  useEffect(() => {
    setTaskSearch("");
  }, [date]);

  useEffect(
    () => () => {
      Object.values(completionTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
    },
    [],
  );

  useEffect(() => {
    let active = true;
    setLoadingDispatchTemplates(true);
    api.me
      .getPreferences()
      .then((preferences) => {
        if (!active) return;
        setDispatchTemplates(preferences.templatePresets.dispatches);
      })
      .catch(() => {
        if (!active) return;
        setDispatchTemplates([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingDispatchTemplates(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function queueCompletionCleanup(taskId: string) {
    const existing = completionTimeoutsRef.current[taskId];
    if (existing) {
      clearTimeout(existing);
    }
    completionTimeoutsRef.current[taskId] = setTimeout(() => {
      setCompletingIds((prev) => prev.filter((id) => id !== taskId));
      delete completionTimeoutsRef.current[taskId];
    }, COMPLETE_DISMISS_MS);
  }

  function clearCompletionState(taskId: string) {
    const timeout = completionTimeoutsRef.current[taskId];
    if (timeout) {
      clearTimeout(timeout);
      delete completionTimeoutsRef.current[taskId];
    }
    setCompletingIds((prev) => prev.filter((id) => id !== taskId));
  }

  async function handleSaveSummary() {
    if (!dispatch) return;
    setSaving(true);
    try {
      const updated = await api.dispatches.update(dispatch.id, { summary });
      setDispatch(updated);
      setSavedSummary(true);
      setTimeout(() => setSavedSummary(false), 2000);
      toast.success("Summary saved");
    } catch {
      toast.error("Failed to save summary");
    } finally {
      setSaving(false);
    }
  }

  function applyDispatchTemplate(template: TextTemplatePreset) {
    setSummary(template.content);
  }

  async function handleLinkTask(taskId: string) {
    if (!dispatch) return;
    try {
      await api.dispatches.linkTask(dispatch.id, taskId);
      fetchDispatch();
    } catch {
      toast.error("Failed to link task");
    }
  }

  async function handleUnlinkTask(taskId: string) {
    if (!dispatch) return;
    setLinkedTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.dispatches.unlinkTask(dispatch.id, taskId);
    } catch {
      fetchDispatch();
      toast.error("Failed to remove task");
    }
  }

  async function handleStatusToggle(task: Task) {
    const next: TaskStatus = task.status === "open" ? "in_progress" : "open";

    setLinkedTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    setAllTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );

    try {
      await api.tasks.update(task.id, { status: next });
    } catch {
      fetchDispatch();
      toast.error("Failed to update task status");
    }
  }

  async function handleDoneToggle(task: Task) {
    const next: TaskStatus = task.status === "done" ? "open" : "done";
    const previousStatus = task.status;

    if (completingIds.includes(task.id)) {
      return;
    }

    if (next === "done") {
      setCompletingIds((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]));
      queueCompletionCleanup(task.id);
    } else {
      clearCompletionState(task.id);
    }

    setLinkedTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    setAllTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );

    try {
      await api.tasks.update(task.id, { status: next });
      if (next === "done") {
        toast.undo(
          `"${renderTemplate(task.title, { referenceDate: task.dueDate ?? task.createdAt })}" completed`,
          async () => {
            clearCompletionState(task.id);
            setLinkedTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
            );
            setAllTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
            );
            try {
              await api.tasks.update(task.id, { status: previousStatus });
            } catch {
              setLinkedTasks((prev) =>
                prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)),
              );
              setAllTasks((prev) =>
                prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)),
              );
              toast.error("Failed to undo");
            }
          },
        );
      }
    } catch {
      clearCompletionState(task.id);
      setLinkedTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
      );
      setAllTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
      );
      toast.error("Failed to update task status");
    }
  }

  async function handleComplete() {
    if (!dispatch) return;
    setCompleting(true);
    try {
      const result = await api.dispatches.complete(dispatch.id);
      setDispatch(result.dispatch);
      toast.success("Day completed!");
      if (result.nextDispatchId) {
        setDate(addDaysToIsoDate(date, 1));
      } else {
        fetchDispatch();
      }
    } catch {
      toast.error("Failed to complete day");
    } finally {
      setCompleting(false);
    }
  }

  async function handleCompleteClick() {
    if (completing) return;
    if (!confirmComplete) {
      setConfirmComplete(true);
      return;
    }
    setConfirmComplete(false);
    await handleComplete();
  }

  async function handleUnfinalizeClick() {
    if (!dispatch || unfinalizing) return;
    setUnfinalizing(true);
    try {
      const result = await api.dispatches.unfinalize(dispatch.id);
      if (result.hasNextDispatch) {
        setUnfinalizeWarning({ nextDate: result.nextDispatchDate! });
      } else {
        setDispatch(result.dispatch);
        toast.success("Dispatch reopened for editing");
      }
    } catch {
      toast.error("Failed to unfinalize dispatch");
    } finally {
      setUnfinalizing(false);
    }
  }

  function handleConfirmUnfinalize() {
    if (!dispatch) return;
    setDispatch({ ...dispatch, finalized: false });
    setUnfinalizeWarning(null);
    toast.success("Dispatch reopened for editing");
  }

  function navigateDay(offset: number) {
    setDate(addDaysToIsoDate(date, offset));
  }

  const isToday = date === today;

  const linkedIds = new Set(linkedTasks.map((t) => t.id));
  const availableTasks = allTasks.filter(
    (t) => !linkedIds.has(t.id) && t.status !== "done",
  );
  const normalizedSearch = taskSearch.trim().toLowerCase();
  const filteredAvailableTasks = availableTasks.filter((task) => {
    if (!normalizedSearch) return true;
    const haystack = [
      task.title,
      task.description ?? "",
      task.dueDate ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const overdueTasks = linkedTasks.filter(
    (t) => t.dueDate && t.dueDate < date && t.status !== "done",
  );
  const dueTodayTasks = linkedTasks.filter(
    (t) => t.dueDate === date && t.status !== "done",
  );
  const otherTasks = linkedTasks.filter(
    (t) =>
      !overdueTasks.includes(t) &&
      !dueTodayTasks.includes(t),
  );

  const doneCount = linkedTasks.filter((t) => t.status === "done").length;
  const progressPercent = linkedTasks.length > 0 ? Math.round((doneCount / linkedTasks.length) * 100) : 0;
  const renderedSummary = renderTemplate(dispatch?.summary ?? "", { referenceDate: date });

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="space-y-4">
          <div className="h-8 w-64 rounded skeleton-shimmer" />
          <div className="h-32 rounded-xl skeleton-shimmer" />
          <div className="h-48 rounded-xl skeleton-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Header with date navigation */}
      <div className="animate-fade-in-up space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <IconBolt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold dark:text-white">
              {isToday ? "Today's Dispatch" : "Dispatch"}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {formatIsoDateForDisplay(date, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigateDay(-1)}
            className="rounded-lg border border-neutral-300 px-2 py-1 text-sm transition-all hover:bg-neutral-50 active:scale-95 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            &larr;
          </button>
          <button
            onClick={() => navigateDay(1)}
            className="rounded-lg border border-neutral-300 px-2 py-1 text-sm transition-all hover:bg-neutral-50 active:scale-95 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            &rarr;
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(today)}
              className="rounded-lg bg-neutral-100 px-3 py-1 text-sm font-medium transition-all hover:bg-neutral-200 active:scale-95 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1 text-sm font-medium transition-all hover:bg-neutral-200 active:scale-95 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            title="View dispatch history"
          >
            <IconClock className="w-3.5 h-3.5" />
            History
          </button>
          {dispatch?.finalized && (
            <button
              onClick={handleUnfinalizeClick}
              disabled={unfinalizing}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 transition-all hover:bg-green-200 active:scale-95 disabled:opacity-50 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60"
              title="Click to unfinalize and edit this dispatch"
            >
              <IconCheck className="w-3.5 h-3.5" />
              {unfinalizing ? "Reopening..." : "Finalized • Edit"}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {linkedTasks.length > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
            <span>{doneCount} of {linkedTasks.length} tasks complete</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Description */}
      <section
        className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-blue-50 via-white to-emerald-50 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 shadow-sm overflow-hidden animate-fade-in-up"
        style={{ animationDelay: "75ms" }}
      >
        <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-[1.2fr_1fr] md:p-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                <IconCalendar className="w-4 h-4" />
              </span>
              Daily Dispatch
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              A focused snapshot of your day
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Dispatches combine the tasks you plan to tackle with a short daily summary,
              giving you one place to plan, track, and close out the day.
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Treat the summary as a planning note, personal journal, or quick gratitude and
              reflection entry. Your saved summary is automatically retained in Notes history.
            </p>
          </div>
          <div className="rounded-xl border border-white/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/60 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              How to use Dispatch
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200/60 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 px-3 py-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  <IconSearch className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">Search & link tasks</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Pick what matters today.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200/60 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 px-3 py-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <IconDocument className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">Write a quick summary</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Capture goals, gratitude, and reflections.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200/60 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 px-3 py-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
                  <IconCheckCircle className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">Complete the day</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Unfinished tasks roll forward.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/50">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Daily Summary</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Planning note, journal entry, or gratitude reflection for {date}.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {dispatch?.finalized ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
              {renderedSummary || "No summary written."}
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50 p-2.5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Saved Dispatch Templates
                </p>
                {loadingDispatchTemplates ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading templates...</p>
                ) : dispatchTemplates.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No dispatch templates yet. Add them in Profile {"->"} Template Library.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dispatchTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyDispatchTemplate(template)}
                        className="rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-500 active:scale-95 transition-all"
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Write your plan, journal notes, gratitude, or end-of-day reflection..."
                rows={4}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none resize-none transition-colors"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveSummary}
                  disabled={saving}
                  className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-1.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 active:scale-95 transition-all inline-flex items-center gap-2"
                >
                  {saving && (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spinner" />
                  )}
                  {saving ? "Saving..." : savedSummary ? "Saved!" : "Save Summary"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Linked tasks */}
      <section className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800/50">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Tasks</h2>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {doneCount}/{linkedTasks.length} done
            </span>
          </div>

          <div>
            {overdueTasks.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide bg-red-50/50 dark:bg-red-900/10">Overdue</p>
                {overdueTasks.map((task, i) => (
                  <LinkedTaskRow
                    key={task.id}
                    task={task}
                    index={i}
                    finalized={dispatch?.finalized ?? false}
                    isCompleting={completingIds.includes(task.id)}
                    onDoneToggle={() => handleDoneToggle(task)}
                    onStatusToggle={() => handleStatusToggle(task)}
                    onUnlink={() => handleUnlinkTask(task.id)}
                  />
                ))}
              </div>
            )}

            {dueTodayTasks.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wide bg-yellow-50/50 dark:bg-yellow-900/10">Due Today</p>
                {dueTodayTasks.map((task, i) => (
                  <LinkedTaskRow
                    key={task.id}
                    task={task}
                    index={i}
                    finalized={dispatch?.finalized ?? false}
                    isCompleting={completingIds.includes(task.id)}
                    onDoneToggle={() => handleDoneToggle(task)}
                    onStatusToggle={() => handleStatusToggle(task)}
                    onUnlink={() => handleUnlinkTask(task.id)}
                  />
                ))}
              </div>
            )}

            {otherTasks.length > 0 && (
              <div>
                {(overdueTasks.length > 0 || dueTodayTasks.length > 0) && (
                  <p className="px-4 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Other</p>
                )}
                {otherTasks.map((task, i) => (
                  <LinkedTaskRow
                    key={task.id}
                    task={task}
                    index={i}
                    finalized={dispatch?.finalized ?? false}
                    isCompleting={completingIds.includes(task.id)}
                    onDoneToggle={() => handleDoneToggle(task)}
                    onStatusToggle={() => handleStatusToggle(task)}
                    onUnlink={() => handleUnlinkTask(task.id)}
                  />
                ))}
              </div>
            )}

            {linkedTasks.length === 0 && (
              <div className="p-8 text-center">
                <svg className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <p className="text-sm text-neutral-400 dark:text-neutral-500">
                  No tasks linked to this dispatch yet
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Add task picker */}
      {!dispatch?.finalized && availableTasks.length > 0 && (
        <section className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
          <button
            onClick={() => setShowAddTasks(!showAddTasks)}
            className="flex items-center gap-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 active:scale-95 transition-all"
          >
            <IconPlus className={`w-4 h-4 transition-transform duration-200 ${showAddTasks ? "rotate-45" : ""}`} />
            Link tasks to dispatch
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showAddTasks ? "max-h-80 mt-3 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 overflow-hidden">
              <div className="border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/80 dark:bg-neutral-900/60 px-3 py-2.5">
                <div className="relative">
                  <IconSearch className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks to link..."
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-2 pl-9 pr-10 text-sm text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-shadow"
                    aria-label="Search tasks to link"
                  />
                  {taskSearch && (
                    <button
                      type="button"
                      onClick={() => setTaskSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Showing {filteredAvailableTasks.length} of {availableTasks.length} available tasks
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredAvailableTasks.length === 0 ? (
                  <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
                    No tasks match your search.
                  </div>
                ) : (
                  filteredAvailableTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleLinkTask(task.id)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/30 dark:text-neutral-300 transition-colors border-b border-neutral-100 dark:border-neutral-800/50 last:border-0"
                    >
                      <span
                        className={`block h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_STYLES[task.status].dot}`}
                      />
                      <span className="flex-1 truncate">
                        {renderTemplate(task.title, { referenceDate: task.dueDate ?? task.createdAt })}
                      </span>
                      {task.dueDate && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">{task.dueDate}</span>
                      )}
                      <IconPlus className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Complete day button */}
      {dispatch && !dispatch.finalized && (
        <div className="flex justify-end pt-2 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
          <button
            onClick={handleCompleteClick}
            disabled={completing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-500 active:scale-95 disabled:opacity-50 sm:w-auto"
          >
            {completing ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spinner" />
            ) : (
              <IconCheck className="w-4 h-4" />
            )}
            {completing ? "Completing..." : confirmComplete ? "Confirm Complete" : "Complete Day"}
          </button>
        </div>
      )}

      {/* Unfinalize warning modal */}
      {unfinalizeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 animate-backdrop-enter" onClick={() => setUnfinalizeWarning(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 p-6 shadow-2xl mx-4 animate-modal-enter">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              Unfinalize Dispatch?
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-6">
              This dispatch rolled over unfinished tasks to{" "}
              <span className="font-medium text-neutral-900 dark:text-white">
                {formatIsoDateForDisplay(unfinalizeWarning.nextDate, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              . Those tasks will remain on that date if you reopen this dispatch.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setUnfinalizeWarning(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnfinalize}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 active:scale-95 transition-all"
              >
                Reopen Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <DispatchHistoryOverlay
          currentDate={date}
          onClose={() => setShowHistory(false)}
          onDateSelect={(newDate) => {
            setDate(newDate);
            setShowHistory(false);
          }}
        />
      )}
    </div>
  );
}

// ---- Sub-components ----

function LinkedTaskRow({
  task,
  index,
  finalized,
  isCompleting,
  onDoneToggle,
  onStatusToggle,
  onUnlink,
}: {
  task: Task;
  index: number;
  finalized: boolean;
  isCompleting: boolean;
  onDoneToggle: () => void;
  onStatusToggle: () => void;
  onUnlink: () => void;
}) {
  const [ringKey, setRingKey] = useState(0);
  const referenceDate = task.dueDate ?? task.createdAt;
  const renderedTitle = renderTemplate(task.title, { referenceDate });
  const renderedDescription = task.description
    ? renderTemplate(task.description, { referenceDate })
    : "";

  function handleStatusClick() {
    setRingKey((k) => k + 1);
    onStatusToggle();
  }

  return (
    <div
      className={`group flex flex-wrap items-start gap-2.5 border-b border-neutral-100 px-4 py-3 transition-all duration-200 last:border-0 dark:border-neutral-800/50 sm:items-center sm:gap-3 ${
        task.status === "done" && !isCompleting ? "opacity-60" : ""
      } hover:bg-neutral-50 dark:hover:bg-neutral-800/30`}
    >
      <button
        onClick={onDoneToggle}
        disabled={finalized}
        title={task.status === "done" ? "Mark as not done" : "Mark as done"}
        className="flex-shrink-0 w-5 h-5 rounded border-2 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all active:scale-95 flex items-center justify-center disabled:cursor-default"
      >
        {(task.status === "done" || isCompleting) && (
          <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {task.status !== "done" && (
        <button
          onClick={handleStatusClick}
          disabled={finalized}
          title={`Status: ${STATUS_STYLES[task.status].label} (click to toggle open/in progress)`}
          className="flex-shrink-0 disabled:cursor-default relative"
        >
          <span
            className={`block h-3 w-3 rounded-full ${STATUS_STYLES[task.status].dot} transition-colors`}
          />
          {ringKey > 0 && (
            <span
              key={ringKey}
              className={`absolute inset-0 rounded-full animate-status-ring ${STATUS_STYLES[task.status].ring}`}
            />
          )}
        </button>
      )}

      <div className="order-2 min-w-0 basis-[calc(100%-2rem)] sm:order-none sm:flex-1">
        <p
          className={`text-sm font-medium truncate dark:text-white ${
            task.status === "done" && !isCompleting ? "line-through" : ""
          } ${isCompleting ? "task-title-completing" : ""}`}
        >
          {renderedTitle}
        </p>
        {renderedDescription && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
            {renderedDescription}
          </p>
        )}
      </div>

      {task.dueDate && (
        <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
          {task.dueDate}
        </span>
      )}

      {!finalized && (
        <button
          onClick={onUnlink}
          className="ml-auto text-xs text-neutral-400 opacity-100 transition-all hover:text-red-500 active:scale-95 dark:hover:text-red-400 sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100"
          title="Remove from dispatch"
        >
          Remove
        </button>
      )}
    </div>
  );
}
