"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  api,
  type Note,
  type ProjectWithStats,
  type Task,
  type TaskStatus,
} from "@/lib/client";
import { buildDailyPoints } from "@/lib/insights";
import { useDashboardLayout, type DashboardWidgetId } from "@/lib/dashboard-layout";
import { PROJECT_COLORS } from "@/lib/projects";
import { addDaysToIsoDate, getIsoDateForTimeZone } from "@/lib/timezone";
import { DashboardCustomizePanel } from "@/components/dashboard/DashboardCustomizePanel";
import { PriorityDistribution } from "@/components/dashboard/PriorityDistribution";
import { ProjectProgressRings } from "@/components/dashboard/ProjectProgressRings";
import { TaskStatusDonut } from "@/components/dashboard/TaskStatusDonut";
import {
  IconCalendar,
  IconCog,
  IconDocument,
  IconGrid,
  IconSearch,
} from "@/components/icons";

const STATUS_BADGES: Record<TaskStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const WIDGET_SPAN_CLASSES: Record<DashboardWidgetId, string> = {
  "hero-stats": "xl:col-span-4",
  "task-donut": "xl:col-span-2",
  upcoming: "xl:col-span-2",
  "priority-dist": "xl:col-span-1",
  "project-rings": "xl:col-span-1",
  "project-signals": "xl:col-span-2",
  "recent-activity": "xl:col-span-4",
};

type ActivityItem = {
  id: string;
  type: "task" | "note";
  title: string;
  date: string;
  status?: TaskStatus;
};

type WidgetData = {
  activeCount: number;
  openCount: number;
  inProgressCount: number;
  doneCount: number;
  notesCount: number;
  notesThisWeek: number;
  dispatchCount: number;
  sparklinePath: string;
  focusPercent: number;
  focusLabel: string;
  focusHeadline: string;
  focusSubtext: string;
  focusTone: string;
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
  priorityCounts: { high: number; medium: number; low: number };
  topProjects: ProjectWithStats[];
  recentProjectActivity: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    projectName: string;
    updatedAt: string;
  }>;
  upcoming: Task[];
  recentTaskActivity: ActivityItem[];
  recentNoteActivity: ActivityItem[];
};

export function Dashboard({ userName }: { userName: string }) {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const {
    widgets,
    visibleWidgets,
    isReady,
    toggleWidget,
    reorderWidgets,
    resetLayout,
  } = useDashboardLayout();

  useEffect(() => {
    let active = true;
    Promise.all([
      api.tasks.list(),
      api.notes.list(),
      api.dispatches.list({ page: 1, limit: 1 }),
      api.projects.listWithStats({ status: "active" }),
    ])
      .then(([t, n, d, p]) => {
        if (!active) return;
        setTasks(Array.isArray(t) ? t : t.data);
        setNotes(Array.isArray(n) ? n : n.data);
        setProjects(Array.isArray(p) ? p : p.data);
        setDispatchCount(Array.isArray(d) ? d.length : d.pagination.total);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openTasks = tasks.filter((task) => task.status === "open");
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const activeTasks = tasks.filter((task) => task.status !== "done");

  const today = getIsoDateForTimeZone(new Date(), session?.user?.timeZone ?? null);
  const focusWindowDays = 7;
  const focusEndIso = addDaysToIsoDate(today, focusWindowDays);

  const overdue = tasks.filter(
    (task) => task.dueDate && task.dueDate < today && task.status !== "done",
  );
  const dueToday = tasks.filter(
    (task) => task.dueDate?.startsWith(today) && task.status !== "done",
  );
  const dueSoon = tasks.filter(
    (task) =>
      task.dueDate && task.dueDate > today && task.dueDate <= focusEndIso && task.status !== "done",
  );

  const upcoming = tasks
    .filter((task) => task.dueDate && task.dueDate > today && task.status !== "done")
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 4);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const notesThisWeek = notes.filter(
    (note) => new Date(note.updatedAt).getTime() >= weekStart.getTime(),
  ).length;

  const recentActivity: ActivityItem[] = [
    ...tasks.map((task) => ({
      id: `task-${task.id}`,
      type: "task" as const,
      title: task.title,
      date: task.updatedAt,
      status: task.status,
    })),
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      type: "note" as const,
      title: note.title,
      date: note.updatedAt,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const recentTaskActivity = recentActivity.filter((item) => item.type === "task").slice(0, 4);
  const recentNoteActivity = recentActivity.filter((item) => item.type === "note").slice(0, 4);

  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const topProjects = [...projects]
    .filter((project) => project.stats.total > 0)
    .sort((a, b) => b.stats.total - a.stats.total)
    .slice(0, 3);

  const recentProjectActivity = [...tasks]
    .filter((task) => Boolean(task.projectId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      projectName: projectMap.get(task.projectId || "")?.name ?? "Project",
      updatedAt: task.updatedAt,
    }));

  const focusTasks = tasks.filter((task) => task.dueDate && task.dueDate <= focusEndIso);
  const focusDone = focusTasks.filter((task) => task.status === "done");
  const focusPercent = focusTasks.length > 0 ? Math.round((focusDone.length / focusTasks.length) * 100) : 100;
  const focusLabel = focusTasks.length > 0 ? `${focusDone.length}/${focusTasks.length}` : "Clear";
  const focusHeadline = focusTasks.length > 0 ? `${focusPercent}%` : "All clear";
  const focusSubtext =
    focusTasks.length > 0
      ? `Resolved ${focusDone.length} of ${focusTasks.length} due in ${focusWindowDays} days`
      : `No tasks due in the next ${focusWindowDays} days`;
  const focusTone =
    overdue.length > 0
      ? "text-red-500 dark:text-red-400"
      : dueToday.length > 0
        ? "text-amber-500 dark:text-amber-400"
        : dueSoon.length > 0
          ? "text-emerald-500 dark:text-emerald-400"
          : "text-neutral-400 dark:text-neutral-500";

  const dailyPoints = useMemo(() => buildDailyPoints(tasks, 7), [tasks]);
  const sparklinePath = useMemo(() => {
    if (dailyPoints.length === 0) return "";
    const values = dailyPoints.map((point) => point.created + point.completed);
    const maxValue = Math.max(1, ...values);
    const width = 120;
    const height = 36;
    const step = values.length > 1 ? width / (values.length - 1) : width;

    return values
      .map((value, index) => {
        const x = index * step;
        const y = height - (value / maxValue) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [dailyPoints]);

  const priorityCounts = {
    high: activeTasks.filter((task) => task.priority === "high").length,
    medium: activeTasks.filter((task) => task.priority === "medium").length,
    low: activeTasks.filter((task) => task.priority === "low").length,
  };

  const widgetData: WidgetData = {
    activeCount: openTasks.length + inProgressTasks.length,
    openCount: openTasks.length,
    inProgressCount: inProgressTasks.length,
    doneCount: doneTasks.length,
    notesCount: notes.length,
    notesThisWeek,
    dispatchCount,
    sparklinePath,
    focusPercent,
    focusLabel,
    focusHeadline,
    focusSubtext,
    focusTone,
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    dueSoonCount: dueSoon.length,
    priorityCounts,
    topProjects,
    recentProjectActivity,
    upcoming,
    recentTaskActivity,
    recentNoteActivity,
  };

  if (loading) {
    return (
      <div className="dashboard-warm">
        <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="h-9 w-52 rounded-xl skeleton-shimmer" />
            <div className="h-10 w-40 rounded-xl skeleton-shimmer" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div className="h-48 rounded-3xl skeleton-shimmer xl:col-span-4" />
            <div className="h-72 rounded-3xl skeleton-shimmer xl:col-span-2" />
            <div className="h-72 rounded-3xl skeleton-shimmer xl:col-span-2" />
            <div className="h-56 rounded-3xl skeleton-shimmer" />
            <div className="h-56 rounded-3xl skeleton-shimmer" />
            <div className="h-56 rounded-3xl skeleton-shimmer xl:col-span-2" />
            <div className="h-52 rounded-3xl skeleton-shimmer xl:col-span-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-warm">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100/80 text-cyan-700 shadow-sm dark:bg-cyan-900/30 dark:text-cyan-300">
              <IconGrid className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Dashboard</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Welcome back, {userName}. Analytics at a glance.</p>
            </div>
          </div>

          <div className="relative flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200/80 bg-white/70 px-3.5 py-2 text-sm text-neutral-700 shadow-sm transition-colors hover:bg-white dark:border-neutral-700/80 dark:bg-neutral-800/50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <IconSearch className="h-4 w-4" />
              <span>Search</span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">Ctrl+K</span>
            </button>
            <button
              type="button"
              onClick={() => setCustomizeOpen((current) => !current)}
              disabled={!isReady}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200/80 bg-white/70 px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700/80 dark:bg-neutral-800/50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <IconCog className="h-4 w-4" />
              Customize
            </button>
            <DashboardCustomizePanel
              open={customizeOpen}
              widgets={widgets}
              onClose={() => setCustomizeOpen(false)}
              onToggleWidget={toggleWidget}
              onReorderWidgets={reorderWidgets}
              onResetLayout={resetLayout}
            />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
          {visibleWidgets.map((widget) => (
            <div key={widget.id} className={`${WIDGET_SPAN_CLASSES[widget.id]} h-full`}>
              <DashboardWidget widgetId={widget.id} data={widgetData} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function DashboardWidget({
  widgetId,
  data,
}: {
  widgetId: DashboardWidgetId;
  data: WidgetData;
}) {
  switch (widgetId) {
    case "hero-stats":
      return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            href="/tasks"
            className="dashboard-card dashboard-card-interactive dashboard-hero-gradient h-full md:col-span-2 group relative overflow-hidden p-5 text-white"
          >
            <div className="relative flex h-full flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-100/90">
                  Active Tasks
                </p>
                <p className="mt-2 text-4xl font-semibold">{data.activeCount}</p>
                <p className="mt-1 text-sm text-cyan-100/90">
                  {data.openCount} open - {data.inProgressCount} in progress
                </p>
              </div>
              <div className="rounded-xl bg-white/15 p-2.5">
                <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-cyan-100/80">
                  Recent task activity
                </div>
                {data.sparklinePath ? (
                  <svg viewBox="0 0 120 36" className="h-9 w-full">
                    <path
                      d={data.sparklinePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <div className="h-9 rounded-lg bg-white/10" />
                )}
              </div>
            </div>
          </Link>

          <Link href="/notes" className="dashboard-card dashboard-card-interactive h-full p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                  Notes
                </p>
                <p className="mt-2 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">
                  {data.notesCount}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {data.notesThisWeek} updated this week
                </p>
              </div>
              <span className="rounded-xl bg-violet-100/80 p-2 text-violet-700 dark:bg-violet-900/35 dark:text-violet-300">
                <IconDocument className="h-4 w-4" />
              </span>
            </div>
          </Link>

          <Link href="/dispatch" className="dashboard-card dashboard-card-interactive h-full p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                  Dispatches
                </p>
                <p className="mt-2 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">
                  {data.dispatchCount}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Continue your daily review
                </p>
              </div>
              <span className="rounded-xl bg-emerald-100/80 p-2 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300">
                <IconCalendar className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </div>
      );
    case "task-donut":
      return (
        <section className="dashboard-card dashboard-card-interactive h-full p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Deadline Focus</h2>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{data.focusSubtext}</p>
            </div>
            <FocusRing percent={data.focusPercent} toneClass={data.focusTone} label={data.focusLabel} />
          </div>
          <div className="mb-3 rounded-xl border border-neutral-200/80 bg-white/65 px-3 py-2 dark:border-neutral-700/80 dark:bg-neutral-800/35">
            <p className="text-xs uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">Completion window</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{data.focusHeadline}</p>
          </div>
          <TaskStatusDonut
            openCount={data.openCount}
            inProgressCount={data.inProgressCount}
            doneCount={data.doneCount}
          />
          <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
            <StatPill label="Overdue" value={data.overdueCount} color="red" />
            <StatPill label="Today" value={data.dueTodayCount} color="amber" />
            <StatPill label="Soon" value={data.dueSoonCount} color="emerald" />
          </div>
        </section>
      );
    case "priority-dist":
      return (
        <section className="dashboard-card dashboard-card-interactive h-full p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Priority Distribution</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Active tasks by urgency.</p>
          </div>
          <PriorityDistribution
            highCount={data.priorityCounts.high}
            mediumCount={data.priorityCounts.medium}
            lowCount={data.priorityCounts.low}
          />
        </section>
      );
    case "project-rings":
      return (
        <section className="dashboard-card dashboard-card-interactive h-full p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Project Rings</h2>
            <Link href="/projects" className="text-xs text-cyan-700 hover:underline dark:text-cyan-300">Projects</Link>
          </div>
          <ProjectProgressRings
            projects={data.topProjects.map((project) => ({
              id: project.id,
              name: project.name,
              color: project.color,
              doneCount: project.stats.done,
              totalCount: project.stats.total,
            }))}
          />
        </section>
      );
    case "project-signals":
      return (
        <div className="grid h-full grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="dashboard-card dashboard-card-interactive h-full p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Active Projects</h2>
              <Link href="/projects" className="text-xs text-cyan-700 hover:underline dark:text-cyan-300">View all</Link>
            </div>
            {data.topProjects.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">No active projects yet.</p>
            ) : (
              <div className="space-y-2">
                {data.topProjects.map((project) => {
                  const color = PROJECT_COLORS[project.color]?.dot ?? "bg-blue-500";
                  const percent = project.stats.total > 0 ? Math.round((project.stats.done / project.stats.total) * 100) : 0;
                  return (
                    <div key={project.id} className="space-y-1 rounded-xl border border-neutral-200/70 bg-white/70 px-3 py-2 transition-colors hover:bg-white/95 dark:border-neutral-700/80 dark:bg-neutral-800/35 dark:hover:bg-neutral-800/55">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="inline-flex min-w-0 items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                          <span className="truncate font-medium text-neutral-700 dark:text-neutral-200">{project.name}</span>
                        </div>
                        <span className="text-neutral-500 dark:text-neutral-400">{project.stats.done}/{project.stats.total}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                        <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="dashboard-card dashboard-card-interactive h-full p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Project Activity</h2>
              <Link href="/projects" className="text-xs text-cyan-700 hover:underline dark:text-cyan-300">Projects</Link>
            </div>
            {data.recentProjectActivity.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">No project task updates yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.recentProjectActivity.map((item) => (
                  <div key={item.id} className="rounded-xl border border-neutral-200/70 bg-white/70 px-3 py-2 text-xs transition-colors hover:bg-white/95 dark:border-neutral-700/80 dark:bg-neutral-800/35 dark:hover:bg-neutral-800/55">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-neutral-500 dark:text-neutral-400">{item.projectName}</p>
                        <p className="truncate font-medium text-neutral-700 dark:text-neutral-200">{item.title}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGES[item.status]}`}>
                        {item.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{new Date(item.updatedAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      );
    case "upcoming":
      return (
        <section className="dashboard-card dashboard-card-interactive h-full p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Upcoming Deadlines</h2>
            <Link href="/tasks" className="text-xs text-cyan-700 hover:underline dark:text-cyan-300">Tasks</Link>
          </div>
          {data.upcoming.length === 0 && data.overdueCount === 0 && data.dueTodayCount === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300/80 bg-white/65 p-8 text-center text-sm text-neutral-500 dark:border-neutral-600/80 dark:bg-neutral-800/35 dark:text-neutral-400">
              No upcoming deadlines.
            </div>
          ) : (
            <div className="space-y-2">
              {data.upcoming.map((task, index) => (
                <DueItem key={task.id} task={task} index={index} />
              ))}
            </div>
          )}
        </section>
      );
    case "recent-activity":
      return (
        <section className="dashboard-card dashboard-card-interactive h-full p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Recent Activity</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Task and note updates across your workspace.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActivityCard title="Task Activity" emptyMessage="No task updates yet." items={data.recentTaskActivity} />
            <ActivityCard title="Note Activity" emptyMessage="No note updates yet." items={data.recentNoteActivity} />
          </div>
        </section>
      );
    default:
      return null;
  }
}

function ActivityCard({
  title,
  emptyMessage,
  items,
}: {
  title: string;
  emptyMessage: string;
  items: ActivityItem[];
}) {
  return (
    <div className="h-full rounded-xl border border-neutral-200/70 bg-white/70 p-3 dark:border-neutral-700/80 dark:bg-neutral-800/35">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const dotClass =
              item.type === "note"
                ? "bg-violet-500"
                : item.status === "done"
                  ? "bg-emerald-500"
                  : item.status === "in_progress"
                    ? "bg-amber-500"
                    : "bg-blue-500";
            const label =
              item.type === "note"
                ? "Updated note"
                : item.status === "done"
                  ? "Completed task"
                  : "Updated task";

            return (
              <li key={item.id} className="rounded-lg border border-neutral-200/70 bg-neutral-50/80 px-2.5 py-2 transition-colors hover:bg-neutral-50 dark:border-neutral-700/80 dark:bg-neutral-900/55 dark:hover:bg-neutral-900/75">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-700 dark:text-neutral-200">
                      <span className="font-medium">{label}:</span> {item.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {new Date(item.date).toLocaleString()}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FocusRing({
  percent,
  toneClass,
  label,
}: {
  percent: number;
  toneClass: string;
  label: string;
}) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width="48" height="48" viewBox="0 0 56 56" className="-rotate-90 flex-shrink-0">
      <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="5" className="stroke-neutral-200 dark:stroke-neutral-700" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className={toneClass}
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <text
        x="28"
        y="28"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-neutral-700 text-[10px] font-semibold dark:fill-neutral-300 rotate-90 origin-center"
      >
        {label}
      </text>
    </svg>
  );
}
function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "red" | "amber" | "emerald";
}) {
  const colorMap = {
    red: "bg-red-100 text-red-700 dark:bg-red-900/35 dark:text-red-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300",
  };

  return (
    <div className={`rounded-xl px-2.5 py-1.5 text-center ${colorMap[color]}`}>
      <p className="text-[11px] uppercase tracking-[0.1em]">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function DueItem({ task, index }: { task: Task; index: number }) {
  return (
    <div
      className={`rounded-xl border border-neutral-200/70 bg-white/70 px-3 py-2 transition-colors hover:bg-white/95 dark:border-neutral-700/80 dark:bg-neutral-800/35 dark:hover:bg-neutral-800/55 ${
        index > 0 ? "mt-2" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">{task.title}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Due {task.dueDate}</p>
        </div>
      </div>
    </div>
  );
}
