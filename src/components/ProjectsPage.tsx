"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ProjectWithStats, type Task, type TaskStatus } from "@/lib/client";
import { ProjectModal } from "@/components/ProjectModal";
import { TaskModal } from "@/components/TaskModal";
import { useToast } from "@/components/ToastProvider";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconCheckCircle,
  IconCalendar,
  IconBolt,
  IconClock,
} from "@/components/icons";
import { PROJECT_COLORS } from "@/lib/projects";

const STATUS_BADGES: Record<TaskStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

const PROJECT_STATUS_ICONS: Record<
  string,
  (props: { className?: string }) => React.ReactElement
> = {
  active: IconBolt,
  paused: IconClock,
  completed: IconCheckCircle,
};

const COMPLETE_DISMISS_MS = 420;

export function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithStats | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<string[]>([]);
  const completionTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const selectedId = searchParams.get("projectId") || "";
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );
  const visibleProjects = useMemo(
    () =>
      showCompletedProjects
        ? projects
        : projects.filter((project) => project.status !== "completed"),
    [projects, showCompletedProjects],
  );
  const visibleTasks = useMemo(
    () => (
      showCompleted
        ? tasks
        : tasks.filter((task) => task.status !== "done" || completingTaskIds.includes(task.id))
    ),
    [tasks, showCompleted, completingTaskIds],
  );

  function queueCompletionCleanup(taskId: string) {
    const existing = completionTimeoutsRef.current[taskId];
    if (existing) {
      clearTimeout(existing);
    }
    completionTimeoutsRef.current[taskId] = setTimeout(() => {
      setCompletingTaskIds((prev) => prev.filter((id) => id !== taskId));
      delete completionTimeoutsRef.current[taskId];
    }, COMPLETE_DISMISS_MS);
  }

  function clearCompletionState(taskId: string) {
    const timeout = completionTimeoutsRef.current[taskId];
    if (timeout) {
      clearTimeout(timeout);
      delete completionTimeoutsRef.current[taskId];
    }
    setCompletingTaskIds((prev) => prev.filter((id) => id !== taskId));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.projects
      .listWithStats()
      .then((data) => {
        if (!active) return;
        setProjects(Array.isArray(data) ? data : data.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId && visibleProjects.length > 0) {
      router.replace(`/projects?projectId=${visibleProjects[0].id}`, { scroll: false });
      return;
    }
    if (!showCompletedProjects && selectedProject?.status === "completed") {
      const nextProject = projects.find((project) => project.status !== "completed");
      if (nextProject) {
        router.replace(`/projects?projectId=${nextProject.id}`, { scroll: false });
      }
    }
  }, [selectedId, projects, router, visibleProjects, showCompletedProjects, selectedProject]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setEditingProject(null);
    setModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(`/projects${qs ? "?" + qs : ""}`, { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!deletingId) return;
    function handleCancel(event: MouseEvent) {
      const target = event.target as Element | null;
      const deleteButton = target?.closest("[data-project-delete]");
      if (deleteButton?.getAttribute("data-project-delete") === deletingId) {
        return;
      }
      setDeletingId(null);
    }
    document.addEventListener("mousedown", handleCancel);
    return () => document.removeEventListener("mousedown", handleCancel);
  }, [deletingId]);

  useEffect(() => {
    if (!deletingTaskId) return;
    function handleCancel(event: MouseEvent) {
      const target = event.target as Element | null;
      const deleteButton = target?.closest("[data-task-delete]");
      if (deleteButton?.getAttribute("data-task-delete") === deletingTaskId) {
        return;
      }
      setDeletingTaskId(null);
    }
    document.addEventListener("mousedown", handleCancel);
    return () => document.removeEventListener("mousedown", handleCancel);
  }, [deletingTaskId]);

  useEffect(
    () => () => {
      Object.values(completionTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
    },
    [],
  );

  useEffect(() => {
    if (!selectedId) {
      setTasks([]);
      return;
    }
    let active = true;
    setLoadingTasks(true);
    api.projects
      .getTasks(selectedId)
      .then((data) => {
        if (!active) return;
        setTasks(Array.isArray(data) ? data : data.data);
      })
      .finally(() => {
        if (active) setLoadingTasks(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function refreshProjects() {
    const data = await api.projects.listWithStats();
    setProjects(Array.isArray(data) ? data : data.data);
  }

  async function handleDelete(id: string) {
    if (deletingId === id) {
      try {
        await api.projects.delete(id);
        toast.success("Project deleted");
        setDeletingId(null);
        await refreshProjects();
        window.dispatchEvent(new CustomEvent("projects:refresh"));
        if (selectedId === id) {
          router.replace("/projects", { scroll: false });
        }
      } catch {
        toast.error("Failed to delete project");
      }
      return;
    }
    setDeletingId(id);
    setTimeout(() => setDeletingId(null), 2500);
  }

  function handleSaved() {
    setModalOpen(false);
    setEditingProject(null);
    refreshProjects();
    toast.success("Project saved");
    window.dispatchEvent(new CustomEvent("projects:refresh"));
  }

  async function handleTaskStatusToggle(task: Task) {
    const nextStatus: TaskStatus =
      task.status === "open" ? "in_progress" : "open";

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
    );

    try {
      await api.tasks.update(task.id, { status: nextStatus });
      await refreshProjects();
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      );
      toast.error("Failed to update task status");
    }
  }

  async function handleTaskDoneToggle(task: Task) {
    const nextStatus: TaskStatus = task.status === "done" ? "open" : "done";
    const previousStatus = task.status;
    const shouldAnimateDismiss = nextStatus === "done" && !showCompleted;

    if (completingTaskIds.includes(task.id)) {
      return;
    }

    if (shouldAnimateDismiss) {
      setCompletingTaskIds((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]));
      queueCompletionCleanup(task.id);
    } else {
      clearCompletionState(task.id);
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
    );

    try {
      await api.tasks.update(task.id, { status: nextStatus });
      await refreshProjects();
      if (nextStatus === "done") {
        toast.undo(`"${task.title}" completed`, async () => {
          clearCompletionState(task.id);
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
          );
          try {
            await api.tasks.update(task.id, { status: previousStatus });
            await refreshProjects();
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
        prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t)),
      );
      toast.error("Failed to update task status");
    }
  }

  function handleTaskEdit(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setEditingTask(task);
      setTaskModalOpen(true);
    }
  }

  async function handleTaskDelete(taskId: string) {
    if (deletingTaskId === taskId) {
      try {
        await api.tasks.delete(taskId);
        toast.success("Task deleted");
        setDeletingTaskId(null);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        await refreshProjects();
      } catch {
        toast.error("Failed to delete task");
      }
      return;
    }
    setDeletingTaskId(taskId);
    setTimeout(() => setDeletingTaskId(null), 2500);
  }

  async function handleTaskSaved() {
    setTaskModalOpen(false);
    setEditingTask(null);
    toast.success("Task saved");
    if (selectedId) {
      const data = await api.projects.getTasks(selectedId);
      setTasks(Array.isArray(data) ? data : data.data);
    }
    await refreshProjects();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="space-y-6">
          <div className="h-8 w-48 rounded skeleton-shimmer" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl skeleton-shimmer" />
              ))}
            </div>
            <div className="lg:col-span-2 h-64 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Projects</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Group related tasks into focused projects.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProject(null);
            setModalOpen(true);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5 shadow-sm"
        >
          <IconPlus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-16 text-center">
          <IconCheckCircle className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-neutral-400 font-medium">No projects yet</p>
          <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1 mb-4">
            Create your first project to start grouping tasks.
          </p>
          <button
            onClick={() => {
              setEditingProject(null);
              setModalOpen(true);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5"
          >
            <IconPlus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div key={selectedProject?.id ?? "empty"} className="animate-fade-in-up">
              {!selectedProject ? (
                <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
                  <IconCalendar className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                  <p className="text-neutral-500 dark:text-neutral-400 font-medium">
                    Select a project to view details
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${PROJECT_COLORS[selectedProject.color]?.dot ?? "bg-blue-500"}`} />
                        <h2 className="text-xl font-semibold dark:text-white truncate">
                          {selectedProject.name}
                        </h2>
                      </div>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        {selectedProject.description || "No description added yet."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingProject(selectedProject);
                          setModalOpen(true);
                        }}
                        className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95 inline-flex items-center gap-1.5"
                      >
                        <IconPencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(selectedProject.id)}
                        data-project-delete={selectedProject.id}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-95 inline-flex items-center gap-1.5 ${
                          deletingId === selectedProject.id
                            ? "bg-red-600 text-white hover:bg-red-500"
                            : "border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-600"
                        }`}
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                        {deletingId === selectedProject.id ? "Confirm" : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatPill label="Open" value={selectedProject.stats.open} color="blue" />
                    <StatPill label="In-Progress" value={selectedProject.stats.inProgress} color="yellow" />
                    <StatPill label="Done" value={selectedProject.stats.done} color="green" />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                      Quick Actions
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setEditingTask(null);
                          setTaskModalOpen(true);
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5"
                      >
                        <IconPlus className="w-3.5 h-3.5" />
                        New Task
                      </button>
                      <button
                        onClick={() => router.push(`/tasks?projectId=${selectedProject.id}`)}
                        className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
                      >
                        View Tasks
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        Project Tasks
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          {selectedProject.stats.done}/{selectedProject.stats.total} done
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={showCompleted}
                          onClick={() => setShowCompleted((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
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

                  {loadingTasks ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 rounded-lg skeleton-shimmer" />
                      ))}
                    </div>
                  ) : visibleTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
                      <IconCheckCircle className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
                      <p className="text-sm text-neutral-400 dark:text-neutral-500">
                        {tasks.length === 0
                          ? "No tasks in this project yet"
                          : "All tasks are completed. Toggle Show Completed to view them."}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                      {visibleTasks.map((task, i) => {
                        const isCompleting = completingTaskIds.includes(task.id);
                        return (
                          <div
                            key={task.id}
                            className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                              i > 0 ? "border-t border-neutral-100 dark:border-neutral-800/60" : ""
                            } ${
                              task.status === "done" && !isCompleting ? "opacity-60" : ""
                            } ${
                              isCompleting ? "animate-task-complete-dismiss" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={task.status === "done" || isCompleting}
                              onChange={() => handleTaskDoneToggle(task)}
                              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                            />
                            <span
                              className={`flex-1 truncate dark:text-white ${
                                task.status === "done" && !isCompleting
                                  ? "line-through text-neutral-400 dark:text-neutral-500"
                                  : ""
                              } ${
                                isCompleting ? "task-title-completing" : ""
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.status !== "done" && (
                              <button
                                type="button"
                                onClick={() => handleTaskStatusToggle(task)}
                                title="Click to toggle status"
                                className={`text-xs font-medium px-2 py-0.5 rounded-full transition-all active:scale-95 ${STATUS_BADGES[task.status]}`}
                              >
                                {task.status === "in_progress" ? "in-progress" : task.status}
                              </button>
                            )}
                            {task.dueDate && (
                              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                                {task.dueDate}
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleTaskEdit(task.id)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
                                title="Edit task"
                              >
                                <IconPencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTaskDelete(task.id)}
                                data-task-delete={task.id}
                                className={`p-1.5 rounded-lg transition-all active:scale-95 ${
                                  deletingTaskId === task.id
                                    ? "bg-red-600 text-white hover:bg-red-500"
                                    : "text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                }`}
                                title={deletingTaskId === task.id ? "Click again to confirm" : "Delete task"}
                              >
                                <IconTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                Projects
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={showCompletedProjects}
                onClick={() => setShowCompletedProjects((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
              >
                <span>Show Completed</span>
                <span
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    showCompletedProjects ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-700"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                      showCompletedProjects ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
            {visibleProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center">
                <IconCheckCircle className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
                <p className="text-sm text-neutral-400 dark:text-neutral-500">
                  {projects.length === 0
                    ? "No projects yet"
                    : "All projects are completed. Toggle Show Completed to view them."}
                </p>
              </div>
            ) : (
              visibleProjects.map((project) => {
              const active = project.id === selectedId;
              const color = PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue;
              const StatusIcon = PROJECT_STATUS_ICONS[project.status] ?? IconClock;
              const statusLabel =
                PROJECT_STATUS_LABELS[project.status] ?? project.status;
              return (
                <button
                  key={project.id}
                  onClick={() =>
                    router.replace(`/projects?projectId=${project.id}`, { scroll: false })
                  }
                  className={`w-full text-left rounded-xl border p-4 transition-all hover:-translate-y-px hover:shadow-sm ${
                    active
                      ? "border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                      : "border-neutral-200/70 dark:border-neutral-800/60 bg-white/70 dark:bg-neutral-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                      <p className="text-sm font-semibold truncate dark:text-white">
                        {project.name}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/70 dark:border-neutral-700/70 bg-white/70 dark:bg-neutral-900/60 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300"
                      title={statusLabel}
                      aria-label={statusLabel}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusLabel}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{project.stats.total} tasks</span>
                    <span className="text-green-600 dark:text-green-400">
                      {project.stats.done} done
                    </span>
                  </div>
                </button>
              );
            })
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <ProjectModal
          project={editingProject}
          onClose={() => {
            setModalOpen(false);
            setEditingProject(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {taskModalOpen && (
        <TaskModal
          task={editingTask}
          defaultProjectId={selectedProject?.id}
          onClose={() => {
            setTaskModalOpen(false);
            setEditingTask(null);
          }}
          onSaved={handleTaskSaved}
        />
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "yellow" | "green";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
    green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color]}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs font-medium mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}
