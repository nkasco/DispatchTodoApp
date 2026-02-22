"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Project, type Task } from "@/lib/client";
import { TaskModal } from "@/components/TaskModal";
import { useToast } from "@/components/ToastProvider";
import { IconCheckCircle, IconChevronLeft, IconPencil, IconPlus } from "@/components/icons";
import { PROJECT_COLORS } from "@/lib/projects";
import { getTaskRecurrencePreview, RECURRENCE_BEHAVIOR_LABELS } from "@/lib/task-recurrence-preview";

const PRIORITY_BADGE: Record<Task["priority"], string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  low: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

const STATUS_BADGE: Record<Task["status"], string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export function RecurringTasksPage() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const fetchRecurringTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.tasks.list();
      const allTasks = Array.isArray(result) ? result : result.data;
      setTasks(allTasks.filter((task) => task.recurrenceType !== "none"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecurringTasks();
  }, [fetchRecurringTasks]);

  useEffect(() => {
    let active = true;
    api.projects.list().then((result) => {
      if (!active) return;
      setProjects(Array.isArray(result) ? result : result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tasks],
  );
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  function handleSaved() {
    setModalOpen(false);
    setEditingTask(null);
    fetchRecurringTasks();
    toast.success("Task saved");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
          >
            <IconChevronLeft className="h-4 w-4" />
            Back to Tasks
          </Link>
          <h1 className="mt-2 text-2xl font-bold dark:text-white">Recurring Task Manager</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Manage recurrence behavior and preview when tasks reappear.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTask(null);
            setModalOpen(true);
          }}
          className="inline-flex self-start items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-500 active:scale-95 sm:self-auto"
        >
          <IconPlus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className={`space-y-2 p-4 ${index > 1 ? "border-t border-neutral-100 dark:border-neutral-800/50" : ""}`}
            >
              <div className="h-4 w-56 rounded skeleton-shimmer" />
              <div className="h-3 w-72 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-14 text-center">
          <IconCheckCircle className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-neutral-400 font-medium">No recurring tasks yet</p>
          <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1 mb-4">
            Create a task and set recurrence to start tracking reappearance behavior.
          </p>
          <button
            onClick={() => {
              setEditingTask(null);
              setModalOpen(true);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5"
          >
            <IconPlus className="w-4 h-4" />
            Create Task
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-4 sm:p-5 space-y-2">
          {sortedTasks.map((task) => {
            const preview = getTaskRecurrencePreview(task);
            const project = task.projectId ? projectMap.get(task.projectId) ?? null : null;

            return (
              <div
                key={task.id}
                className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-white/90 dark:bg-neutral-900/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                      {task.title}
                    </p>
                    {task.description ? (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {task.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[task.priority]}`}>
                        {task.priority}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[task.status]}`}>
                        {task.status === "in_progress" ? "in progress" : task.status}
                      </span>
                      {project ? (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            PROJECT_COLORS[project.color]?.badge
                            ?? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${PROJECT_COLORS[project.color]?.dot ?? "bg-neutral-400"}`} />
                          {project.name}
                        </span>
                      ) : null}
                      {task.dueDate ? (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          Due {task.dueDate}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {preview.cadence} • {RECURRENCE_BEHAVIOR_LABELS[task.recurrenceBehavior]}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {preview.detail}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(task);
                      setModalOpen(true);
                    }}
                    className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all inline-flex items-center gap-1"
                  >
                    <IconPencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <TaskModal
          task={editingTask}
          onClose={() => {
            setModalOpen(false);
            setEditingTask(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
