"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  api,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type Project,
} from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { IconInbox, IconClock, IconTrash } from "@/components/icons";
import { PROJECT_COLORS } from "@/lib/projects";
import { addDaysToIsoDate, formatIsoDateForDisplay, getIsoDateForTimeZone } from "@/lib/timezone";

const STATUS_STYLES: Record<TaskStatus, { dot: string; label: string; ring: string }> = {
  open: { dot: "bg-blue-500", label: "Open", ring: "text-blue-500" },
  in_progress: { dot: "bg-yellow-500", label: "In Progress", ring: "text-yellow-500" },
  done: { dot: "bg-green-500", label: "Done", ring: "text-green-500" },
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  low: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const COMPLETE_DISMISS_MS = 420;

export function PriorityInboxPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<string[]>([]);
  const completionTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const today = getIsoDateForTimeZone(new Date(), session?.user?.timeZone ?? null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.tasks.list();
      setTasks(Array.isArray(data) ? data : data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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

  useEffect(
    () => () => {
      Object.values(completionTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
    },
    [],
  );

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

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const sortByPriority = (a: Task, b: Task) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];

  const overdueTasks = tasks
    .filter(
      (t) => t.dueDate && t.dueDate < today && (t.status !== "done" || completingIds.includes(t.id)),
    )
    .sort(sortByPriority);

  const dueTodayTasks = tasks
    .filter(
      (t) => t.dueDate === today && (t.status !== "done" || completingIds.includes(t.id)),
    )
    .sort(sortByPriority);

  const highPriorityNoDueTasks = tasks
    .filter(
      (t) =>
        !t.dueDate
        && t.priority === "high"
        && (t.status !== "done" || completingIds.includes(t.id)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totalCount = overdueTasks.length + dueTodayTasks.length + highPriorityNoDueTasks.length;

  async function handleStatusToggle(task: Task) {
    // Toggle only between open and in_progress
    const next: TaskStatus =
      task.status === "open" ? "in_progress" : "open";

    setFlashingId(task.id);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    setTimeout(() => setFlashingId(null), 600);

    try {
      await api.tasks.update(task.id, { status: next });
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: task.status } : t,
        ),
      );
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

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );

    try {
      await api.tasks.update(task.id, { status: next });
      if (next === "done") {
        toast.undo(`"${task.title}" completed`, async () => {
          clearCompletionState(task.id);
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
          );
          try {
            await api.tasks.update(task.id, { status: previousStatus });
          } catch {
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)),
            );
            toast.error("Failed to undo");
          }
        });
      }
    } catch {
      clearCompletionState(task.id);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: previousStatus } : t,
        ),
      );
      toast.error("Failed to update task status");
    }
  }

  async function handleSnooze(task: Task, days: number | null) {
    setSnoozeMenuId(null);

    let newDueDate: string | null = null;
    if (days !== null) {
      newDueDate = addDaysToIsoDate(today, days);
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, dueDate: newDueDate } : t)),
    );

    try {
      await api.tasks.update(task.id, { dueDate: newDueDate });
      toast.success(
        days === null
          ? "Task snoozed indefinitely"
          : `Snoozed until ${newDueDate}`
      );
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, dueDate: task.dueDate } : t,
        ),
      );
      toast.error("Failed to snooze task");
    }
  }

  async function handleDelete(taskId: string) {
    try {
      await api.tasks.delete(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDeletingId(null);
      toast.success("Task deleted");
    } catch {
      setDeletingId(null);
      toast.error("Failed to delete task");
    }
  }

  function handleCancelDelete() {
    setDeletingId(null);
  }

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
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <IconInbox className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Priority Inbox</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {formatIsoDateForDisplay(today, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
              &middot; {totalCount} {totalCount === 1 ? "item" : "items"} need attention
            </p>
          </div>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center">
          <IconInbox className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold dark:text-white mb-1">All clear</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Nothing due today and no overdue tasks. Nice work!
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <Section
              label="Overdue"
              count={overdueTasks.length}
              className="text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10"
            >
              {overdueTasks.map((task, i) => (
                <InboxTaskRow
                  key={task.id}
                  task={task}
                  project={task.projectId ? projectMap.get(task.projectId) ?? null : null}
                  index={i}
                  isFlashing={flashingId === task.id}
                  isCompleting={completingIds.includes(task.id)}
                  snoozeMenuOpen={snoozeMenuId === task.id}
                  deletingConfirm={deletingId === task.id}
                  onDoneToggle={() => handleDoneToggle(task)}
                  onStatusToggle={() => handleStatusToggle(task)}
                  onSnoozeClick={() => setSnoozeMenuId(task.id)}
                  onSnoozeSelect={(days) => handleSnooze(task, days)}
                  onSnoozeClose={() => setSnoozeMenuId(null)}
                  onDeleteClick={() => setDeletingId(task.id)}
                  onDeleteConfirm={() => handleDelete(task.id)}
                  onDeleteCancel={handleCancelDelete}
                />
              ))}
            </Section>
          )}

          {/* Due Today */}
          {dueTodayTasks.length > 0 && (
            <Section
              label="Due Today"
              count={dueTodayTasks.length}
              className="text-yellow-600 dark:text-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/10"
            >
              {dueTodayTasks.map((task, i) => (
                <InboxTaskRow
                  key={task.id}
                  task={task}
                  project={task.projectId ? projectMap.get(task.projectId) ?? null : null}
                  index={i}
                  isFlashing={flashingId === task.id}
                  isCompleting={completingIds.includes(task.id)}
                  snoozeMenuOpen={snoozeMenuId === task.id}
                  deletingConfirm={deletingId === task.id}
                  onDoneToggle={() => handleDoneToggle(task)}
                  onStatusToggle={() => handleStatusToggle(task)}
                  onSnoozeClick={() => setSnoozeMenuId(task.id)}
                  onSnoozeSelect={(days) => handleSnooze(task, days)}
                  onSnoozeClose={() => setSnoozeMenuId(null)}
                  onDeleteClick={() => setDeletingId(task.id)}
                  onDeleteConfirm={() => handleDelete(task.id)}
                  onDeleteCancel={handleCancelDelete}
                />
              ))}
            </Section>
          )}

          {/* High Priority (no due date) */}
          {highPriorityNoDueTasks.length > 0 && (
            <Section
              label="High Priority"
              count={highPriorityNoDueTasks.length}
              className="text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
            >
              {highPriorityNoDueTasks.map((task, i) => (
                <InboxTaskRow
                  key={task.id}
                  task={task}
                  project={task.projectId ? projectMap.get(task.projectId) ?? null : null}
                  index={i}
                  isFlashing={flashingId === task.id}
                  isCompleting={completingIds.includes(task.id)}
                  snoozeMenuOpen={snoozeMenuId === task.id}
                  deletingConfirm={deletingId === task.id}
                  onDoneToggle={() => handleDoneToggle(task)}
                  onStatusToggle={() => handleStatusToggle(task)}
                  onSnoozeClick={() => setSnoozeMenuId(task.id)}
                  onSnoozeSelect={(days) => handleSnooze(task, days)}
                  onSnoozeClose={() => setSnoozeMenuId(null)}
                  onDeleteClick={() => setDeletingId(task.id)}
                  onDeleteConfirm={() => handleDelete(task.id)}
                  onDeleteCancel={handleCancelDelete}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  count,
  className,
  children,
}: {
  label: string;
  count: number;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`px-4 py-2 text-xs font-medium uppercase tracking-wide ${className}`}>
        {label} ({count})
      </p>
      {children}
    </div>
  );
}

function InboxTaskRow({
  task,
  project,
  index,
  isFlashing,
  isCompleting,
  snoozeMenuOpen,
  deletingConfirm,
  onDoneToggle,
  onStatusToggle,
  onSnoozeClick,
  onSnoozeSelect,
  onSnoozeClose,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  task: Task;
  project: Project | null;
  index: number;
  isFlashing: boolean;
  isCompleting: boolean;
  snoozeMenuOpen: boolean;
  deletingConfirm: boolean;
  onDoneToggle: () => void;
  onStatusToggle: () => void;
  onSnoozeClick: () => void;
  onSnoozeSelect: (days: number | null) => void;
  onSnoozeClose: () => void;
  onDeleteClick: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const [ringKey, setRingKey] = useState(0);

  function handleStatusClick() {
    if (task.status !== "done") {
      setRingKey((k) => k + 1);
      onStatusToggle();
    }
  }

  // Close snooze menu when clicking outside
  useEffect(() => {
    if (!snoozeMenuOpen) return;

    function handleClickOutside() {
      onSnoozeClose();
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [snoozeMenuOpen, onSnoozeClose]);

  // Close delete confirmation when clicking outside
  useEffect(() => {
    if (!deletingConfirm) return;

    function handleClickOutside() {
      onDeleteCancel();
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [deletingConfirm, onDeleteCancel]);

  return (
    <div
      className={`group relative flex flex-wrap items-start gap-2.5 p-4 transition-all duration-200 sm:items-center sm:gap-3 ${
        index > 0 ? "border-t border-neutral-100 dark:border-neutral-800/50" : ""
      } ${
        task.status === "done" && !isCompleting ? "opacity-60" : ""
      } ${
        isFlashing ? "animate-row-flash" : ""
      } ${
        isCompleting ? "animate-task-complete-dismiss" : ""
      } ${!snoozeMenuOpen && !deletingConfirm ? "hover:bg-neutral-50 dark:hover:bg-neutral-800/30" : ""} ${
        snoozeMenuOpen || deletingConfirm ? "z-10" : ""
      }`}
    >
      {/* Done checkbox */}
      <button
        onClick={onDoneToggle}
        title={task.status === "done" ? "Mark as not done" : "Mark as done"}
        className="flex-shrink-0 w-5 h-5 rounded border-2 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all active:scale-95 flex items-center justify-center"
      >
        {(task.status === "done" || isCompleting) && (
          <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="order-2 min-w-0 basis-[calc(100%-2rem)] sm:order-none sm:flex-1">
        <p
          className={`text-sm font-medium truncate dark:text-white ${
            task.status === "done" && !isCompleting ? "line-through" : ""
          } ${isCompleting ? "task-title-completing" : ""}`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
            {task.description}
          </p>
        )}
      </div>

      <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
        {/* Status badge (only for open/in_progress) */}
        {task.status !== "done" && (
          <button
            onClick={handleStatusClick}
            title={`Status: ${STATUS_STYLES[task.status].label} (click to toggle)`}
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-100 transition-all active:scale-95"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inset-0 rounded-full ${STATUS_STYLES[task.status].dot} transition-colors`}
              />
              {ringKey > 0 && (
                <span
                  key={ringKey}
                  className={`absolute inset-0 rounded-full animate-status-ring ${STATUS_STYLES[task.status].ring}`}
                />
              )}
            </span>
            <span>{STATUS_STYLES[task.status].label}</span>
          </button>
        )}

        {project && (
          <span
            title={`Project: ${project.name}`}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              PROJECT_COLORS[project.color]?.badge ?? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${PROJECT_COLORS[project.color]?.dot ?? "bg-neutral-400"}`} />
            {project.name}
          </span>
        )}
        <span
          title={`Priority: ${task.priority}`}
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[task.priority]}`}
        >
          {task.priority}
        </span>
        {task.dueDate && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
            {task.dueDate}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="order-4 ml-auto flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100 sm:order-none sm:ml-0">
        {/* Snooze button */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSnoozeClick();
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all inline-flex items-center gap-1.5"
            title="Snooze task"
          >
            <IconClock className="w-3.5 h-3.5" />
            Snooze
          </button>

          {/* Snooze menu */}
          {snoozeMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl z-50 overflow-hidden animate-fade-in"
            >
              <button
                onClick={() => onSnoozeSelect(1)}
                className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                1 day
              </button>
              <button
                onClick={() => onSnoozeSelect(7)}
                className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-t border-neutral-100 dark:border-neutral-800"
              >
                1 week
              </button>
              <button
                onClick={() => onSnoozeSelect(null)}
                className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-t border-neutral-100 dark:border-neutral-800"
              >
                Indefinitely
              </button>
            </div>
          )}
        </div>

        {/* Delete button */}
        {!deletingConfirm ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            className="rounded-md p-1.5 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95 transition-all"
            title="Delete task"
          >
            <IconTrash className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConfirm();
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 active:scale-95 transition-all animate-fade-in"
            title="Click to confirm deletion"
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  );
}
