"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  api,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type Project,
} from "@/lib/client";
import { TaskModal } from "@/components/TaskModal";
import { Pagination } from "@/components/Pagination";
import { CustomSelect } from "@/components/CustomSelect";
import { useToast } from "@/components/ToastProvider";
import { IconPlus, IconPencil, IconTrash } from "@/components/icons";
import { PROJECT_COLORS } from "@/lib/projects";

type SortField = "createdAt" | "dueDate" | "priority";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">(
    (searchParams.get("status") as TaskStatus) || "",
  );
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">(
    (searchParams.get("priority") as TaskPriority) || "",
  );
  const [projectFilter, setProjectFilter] = useState(
    searchParams.get("projectId") || "",
  );
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [showCompleted, setShowCompleted] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const hasActiveFilters = Boolean(statusFilter || priorityFilter || projectFilter);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.tasks.list({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        projectId: projectFilter || undefined,
        page,
        limit: 20,
      });
      if (Array.isArray(data)) {
        setTasks(data);
        setTotalPages(1);
      } else {
        setTasks(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, projectFilter, page]);

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

  // Listen for keyboard shortcut to create new task
  useEffect(() => {
    function handleNewTask() {
      setEditingTask(null);
      setModalOpen(true);
    }
    window.addEventListener("shortcut:new-task", handleNewTask);
    return () => window.removeEventListener("shortcut:new-task", handleNewTask);
  }, []);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, projectFilter]);

  useEffect(() => {
    const nextStatus = (searchParams.get("status") as TaskStatus) || "";
    const nextPriority = (searchParams.get("priority") as TaskPriority) || "";
    const nextProject = searchParams.get("projectId") || "";
    setStatusFilter((prev) => (prev === nextStatus ? prev : nextStatus));
    setPriorityFilter((prev) => (prev === nextPriority ? prev : nextPriority));
    setProjectFilter((prev) => (prev === nextProject ? prev : nextProject));
  }, [searchParams]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (projectFilter) params.set("projectId", projectFilter);
    const qs = params.toString();
    router.replace(`/tasks${qs ? "?" + qs : ""}`, { scroll: false });
  }, [statusFilter, priorityFilter, projectFilter, router]);

  // Open modal when arriving from quick add
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setEditingTask(null);
    setModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(`/tasks${qs ? "?" + qs : ""}`, { scroll: false });
  }, [searchParams, router]);

  const filteredTasks = showCompleted
    ? tasks
    : tasks.filter((task) => task.status !== "done");

  const sorted = [...filteredTasks].sort((a, b) => {
    if (sortBy === "dueDate") {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (sortBy === "priority") {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  async function handleStatusToggle(task: Task) {
    const next: TaskStatus =
      task.status === "open"
        ? "in_progress"
        : task.status === "in_progress"
          ? "done"
          : "open";

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

  async function handleDelete(id: string) {
    setDeletingId(id);
    setTimeout(async () => {
      const prev = tasks;
      setTasks((t) => t.filter((x) => x.id !== id));
      setDeletingId(null);
      try {
        await api.tasks.delete(id);
        toast.success("Task deleted");
      } catch {
        setTasks(prev);
        toast.error("Failed to delete task");
      }
    }, 300);
  }

  function handleSaved() {
    setModalOpen(false);
    setEditingTask(null);
    fetchTasks();
    toast.success("Task saved");
  }

  // Compute stats
  const openCount = tasks.filter((t) => t.status === "open").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const hasAnyTasks = tasks.length > 0;
  const emptyMessage = statusFilter || priorityFilter || projectFilter
    ? "Try adjusting your filters."
    : hasAnyTasks && !showCompleted
      ? "All tasks are completed. Toggle Show Completed to view them."
      : "Create your first task to get started.";

  const statusFilterOptions = [
    { value: "", label: "All", dot: "bg-neutral-400" },
    { value: "open", label: "Open", dot: "bg-blue-500" },
    { value: "in_progress", label: "In Progress", dot: "bg-yellow-500" },
    { value: "done", label: "Done", dot: "bg-green-500" },
  ];

  const priorityFilterOptions = [
    { value: "", label: "All", dot: "bg-neutral-400" },
    { value: "high", label: "High", dot: "bg-red-500" },
    { value: "medium", label: "Medium", dot: "bg-yellow-500" },
    { value: "low", label: "Low", dot: "bg-neutral-400" },
  ];

  const projectOptions = useMemo(() => {
    const base = [
      { value: "", label: "All", dot: "bg-neutral-400" },
      { value: "none", label: "Unassigned", dot: "bg-neutral-300" },
    ];
    const mapped = [...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: project.id,
        label: project.name,
        dot: PROJECT_COLORS[project.color]?.dot ?? "bg-neutral-400",
      }));
    return [...base, ...mapped];
  }, [projects]);

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  const sortOptions = [
    { value: "createdAt", label: "Newest" },
    { value: "dueDate", label: "Due Date" },
    { value: "priority", label: "Priority" },
  ];

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Tasks</h1>
          {!loading && tasks.length > 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              <span className="text-blue-600 dark:text-blue-400 font-medium">{openCount} open</span>
              <span className="mx-1.5">&middot;</span>
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">{inProgressCount} in progress</span>
              <span className="mx-1.5">&middot;</span>
              <span className="text-green-600 dark:text-green-400 font-medium">{doneCount} done</span>
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setEditingTask(null);
            setModalOpen(true);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5 shadow-sm"
        >
          <IconPlus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Filters & sort */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <FilterGroup
              label="Status"
              value={statusFilter}
              options={statusFilterOptions}
              onChange={(v) => setStatusFilter(v as TaskStatus | "")}
            />
            <FilterGroup
              label="Priority"
              value={priorityFilter}
              options={priorityFilterOptions}
              onChange={(v) => setPriorityFilter(v as TaskPriority | "")}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                Project
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {projectOptions.map((option) => {
                  const active = projectFilter === option.value;
                  return (
                    <button
                      key={`project-${option.value || "all"}`}
                      type="button"
                      onClick={() => setProjectFilter(option.value)}
                      title={option.label}
                      aria-pressed={active}
                      className={`group inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? "border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 shadow-sm"
                          : "border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${option.dot ?? "bg-neutral-400"}`} />
                      <span
                        className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out ${
                          active
                            ? "max-w-[12rem] opacity-100 translate-x-0"
                            : "max-w-0 opacity-0 -translate-x-1 group-hover:max-w-[12rem] group-hover:opacity-100 group-hover:translate-x-0"
                        }`}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setStatusFilter("");
                  setPriorityFilter("");
                  setProjectFilter("");
                }}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                Sort
              </span>
              <div className="w-36">
                <CustomSelect
                  label=""
                  value={sortBy}
                  onChange={(v: string) => setSortBy(v as SortField)}
                  options={sortOptions}
                />
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showCompleted}
              onClick={() => setShowCompleted((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
            >
              <span>Show Completed</span>
              <span
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  showCompleted ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                    showCompleted ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-4 ${i > 1 ? "border-t border-neutral-100 dark:border-neutral-800/50" : ""}`}
            >
              <div className="w-3 h-3 rounded-full skeleton-shimmer" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded skeleton-shimmer" />
                <div className="h-3 w-32 rounded skeleton-shimmer" />
              </div>
              <div className="h-5 w-14 rounded-full skeleton-shimmer" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-16 text-center">
          <IconInboxEmpty className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-neutral-400 font-medium">No tasks found</p>
          <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1 mb-4">
            {emptyMessage}
          </p>
          {!statusFilter && !priorityFilter && !projectFilter && (
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
          )}
        </div>
      ) : (
        <ul className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
          {sorted.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              project={task.projectId ? projectMap.get(task.projectId) ?? null : null}
              index={i}
              isDeleting={deletingId === task.id}
              isFlashing={flashingId === task.id}
              onStatusToggle={() => handleStatusToggle(task)}
              onEdit={() => {
                setEditingTask(task);
                setModalOpen(true);
              }}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {modalOpen && (
        <TaskModal
          task={editingTask}
          defaultProjectId={editingTask ? undefined : projectFilter || undefined}
          onClose={() => {
            setModalOpen(false);
            setEditingTask(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ---- Sub-components ----

function IconInboxEmpty({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-17.5 0a2.25 2.25 0 0 0-2.25 2.25v1.5a2.25 2.25 0 0 0 2.25 2.25h15.5a2.25 2.25 0 0 0 2.25-2.25v-1.5a2.25 2.25 0 0 0-2.25-2.25m-17.5 0V6.75A2.25 2.25 0 0 1 4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v6.75" />
    </svg>
  );
}

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

type FilterOption = { value: string; label: string; dot?: string };

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {label}
      </span>
      <div className="inline-flex flex-wrap rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={`${label}-${option.value || "all"}`}
              type="button"
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                active
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
              aria-pressed={active}
            >
              {option.dot && (
                <span className={`h-2 w-2 rounded-full ${option.dot}`} />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  project,
  index,
  isDeleting,
  isFlashing,
  onStatusToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  project: Project | null;
  index: number;
  isDeleting: boolean;
  isFlashing: boolean;
  onStatusToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [ringKey, setRingKey] = useState(0);

  function handleStatusClick() {
    setRingKey((k) => k + 1);
    onStatusToggle();
  }

  return (
    <li
      className={`group flex items-center gap-3 p-4 transition-all duration-200 ${
        index > 0 ? "border-t border-neutral-100 dark:border-neutral-800/50" : ""
      } ${
        task.status === "done" ? "opacity-60" : ""
      } ${
        isDeleting ? "animate-slide-out-right overflow-hidden" : ""
      } ${
        isFlashing ? "animate-row-flash" : ""
      } hover:bg-neutral-50 dark:hover:bg-neutral-800/30 hover:-translate-y-px hover:shadow-sm`}
      style={{ listStyle: "none" }}
    >
      <button
        onClick={handleStatusClick}
        title={`Status: ${STATUS_STYLES[task.status].label} (click to cycle)`}
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

      <div className="flex items-center gap-2">
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
      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all inline-flex items-center gap-1.5"
          title="Edit task"
        >
          <IconPencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95 transition-all"
          title="Delete task"
        >
          <IconTrash className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}
