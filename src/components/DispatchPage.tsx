"use client";

import { useEffect, useState, useCallback } from "react";
import {
  api,
  type Dispatch,
  type Task,
  type TaskStatus,
} from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { IconCheck, IconPlus } from "@/components/icons";

const STATUS_STYLES: Record<TaskStatus, { dot: string; label: string; ring: string }> = {
  open: { dot: "bg-blue-500", label: "Open", ring: "text-blue-500" },
  in_progress: { dot: "bg-yellow-500", label: "In Progress", ring: "text-yellow-500" },
  done: { dot: "bg-green-500", label: "Done", ring: "text-green-500" },
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function DispatchPage() {
  const { toast } = useToast();
  const [date, setDate] = useState(todayStr);
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSummary, setSavedSummary] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [showAddTasks, setShowAddTasks] = useState(false);

  const fetchDispatch = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.dispatches.list(date);
      let d = list[0] ?? null;

      if (!d) {
        d = await api.dispatches.create({ date });
      }

      setDispatch(d);
      setSummary(d.summary ?? "");

      const tasks = await api.dispatches.getTasks(d.id);
      setLinkedTasks(tasks);

      const all = await api.tasks.list();
      setAllTasks(all);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchDispatch();
  }, [fetchDispatch]);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 120);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!confirmComplete) return;
    const timer = setTimeout(() => setConfirmComplete(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmComplete]);

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
    const next: TaskStatus =
      task.status === "open"
        ? "in_progress"
        : task.status === "in_progress"
          ? "done"
          : "open";

    setLinkedTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );

    try {
      await api.tasks.update(task.id, { status: next });
    } catch {
      fetchDispatch();
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
        const nextDate = new Date(date + "T00:00:00");
        nextDate.setDate(nextDate.getDate() + 1);
        setDate(nextDate.toISOString().split("T")[0]);
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

  function navigateDay(offset: number) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().split("T")[0]);
  }

  const isToday = date === todayStr();

  const linkedIds = new Set(linkedTasks.map((t) => t.id));
  const availableTasks = allTasks.filter(
    (t) => !linkedIds.has(t.id) && t.status !== "done",
  );

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

  if (loading && showSkeleton) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="space-y-4">
          <div className="h-8 w-64 rounded skeleton-shimmer" />
          <div className="h-32 rounded-xl skeleton-shimmer" />
          <div className="h-48 rounded-xl skeleton-shimmer" />
        </div>
      </div>
    );
  }
  if (loading) {
    return <div className="mx-auto max-w-5xl p-6" />;
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Header with date navigation */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateDay(-1)}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 dark:text-neutral-300 active:scale-95 transition-all"
          >
            &larr;
          </button>
          <div>
            <h1 className="text-2xl font-bold dark:text-white">
              {isToday ? "Today's Dispatch" : "Dispatch"}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={() => navigateDay(1)}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 dark:text-neutral-300 active:scale-95 transition-all"
          >
            &rarr;
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(todayStr())}
              className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 dark:text-neutral-200 active:scale-95 transition-all"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {dispatch?.finalized && (
            <span className="rounded-full bg-green-100 dark:bg-green-900/40 px-3 py-1 text-sm font-medium text-green-700 dark:text-green-300 inline-flex items-center gap-1.5">
              <IconCheck className="w-3.5 h-3.5" />
              Finalized
            </span>
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

      {/* Summary */}
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/50">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Daily Summary</h2>
        </div>
        <div className="p-4 space-y-3">
          {dispatch?.finalized ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
              {dispatch.summary || "No summary written."}
            </p>
          ) : (
            <>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Write your daily summary, goals, or notes..."
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
          <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/50 flex items-center justify-between">
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
              showAddTasks ? "max-h-64 mt-3 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                {availableTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleLinkTask(task.id)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/30 dark:text-neutral-300 transition-colors border-b border-neutral-100 dark:border-neutral-800/50 last:border-0"
                  >
                    <span
                      className={`block h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_STYLES[task.status].dot}`}
                    />
                    <span className="flex-1 truncate">{task.title}</span>
                    {task.dueDate && (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">{task.dueDate}</span>
                    )}
                    <IconPlus className="w-3.5 h-3.5 text-neutral-400" />
                  </button>
                ))}
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
            className="rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 active:scale-95 transition-all inline-flex items-center gap-2 shadow-sm"
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
    </div>
  );
}

// ---- Sub-components ----

function LinkedTaskRow({
  task,
  index,
  finalized,
  onStatusToggle,
  onUnlink,
}: {
  task: Task;
  index: number;
  finalized: boolean;
  onStatusToggle: () => void;
  onUnlink: () => void;
}) {
  const [ringKey, setRingKey] = useState(0);

  function handleStatusClick() {
    setRingKey((k) => k + 1);
    onStatusToggle();
  }

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 transition-all duration-200 border-b border-neutral-100 dark:border-neutral-800/50 last:border-0 ${
        task.status === "done" ? "opacity-60" : ""
      } hover:bg-neutral-50 dark:hover:bg-neutral-800/30`}
    >
      <button
        onClick={handleStatusClick}
        disabled={finalized}
        title={`Status: ${STATUS_STYLES[task.status].label} (click to cycle)`}
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

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate dark:text-white ${task.status === "done" ? "line-through" : ""}`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
            {task.description}
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
          className="text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 active:scale-95 transition-all"
          title="Remove from dispatch"
        >
          Remove
        </button>
      )}
    </div>
  );
}
