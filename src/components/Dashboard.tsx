"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Task, type Note, type TaskStatus } from "@/lib/client";
import {
  IconPlus,
  IconDocument,
  IconCalendar,
  IconSearch,
} from "@/components/icons";

export function Dashboard({ userName }: { userName: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 120);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.tasks.list(),
      api.notes.list(),
      api.dispatches.list({ page: 1, limit: 1 }),
    ])
      .then(([t, n, d]) => {
        if (!active) return;
        setTasks(Array.isArray(t) ? t : t.data);
        setNotes(Array.isArray(n) ? n : n.data);
        if (Array.isArray(d)) {
          setDispatchCount(d.length);
        } else {
          setDispatchCount(d.pagination.total);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openTasks = tasks.filter((t) => t.status === "open");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const doneTasks = tasks.filter((t) => t.status === "done");

  const today = new Date().toISOString().split("T")[0];
  const overdue = tasks.filter(
    (t) => t.dueDate && t.dueDate < today && t.status !== "done",
  );
  const dueToday = tasks.filter(
    (t) => t.dueDate?.startsWith(today) && t.status !== "done",
  );
  const upcoming = tasks
    .filter((t) => t.dueDate && t.dueDate > today && t.status !== "done")
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 5);

  const recentNotes = [...notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  type ActivityItem = {
    id: string;
    type: "task" | "note";
    title: string;
    date: string;
    status?: TaskStatus;
  };

  const recentActivity: ActivityItem[] = [
    ...tasks.map((t) => ({
      id: `task-${t.id}`,
      type: "task",
      title: t.title,
      date: t.updatedAt,
      status: t.status,
    })),
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      type: "note",
      title: n.title,
      date: n.updatedAt,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  // Progress calculation
  const totalTasks = tasks.length;
  const completedToday = doneTasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedToday / totalTasks) * 100) : 0;

  if (loading && showSkeleton) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="space-y-6">
          <div className="h-8 w-48 rounded skeleton-shimmer" />
          {/* Quick Actions skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-xl skeleton-shimmer" />
            ))}
          </div>
          {/* Stat cards skeleton */}
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl skeleton-shimmer" />
            ))}
          </div>
          {/* Content skeleton */}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="h-5 w-24 rounded skeleton-shimmer" />
              <div className="h-16 rounded-lg skeleton-shimmer" />
              <div className="h-16 rounded-lg skeleton-shimmer" />
            </div>
            <div className="space-y-3">
              <div className="h-5 w-28 rounded skeleton-shimmer" />
              <div className="h-16 rounded-lg skeleton-shimmer" />
              <div className="h-16 rounded-lg skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (loading) {
    return <div className="mx-auto max-w-5xl p-6" />;
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold dark:text-white">Dashboard</h1>
        <p className="mt-1 text-neutral-500 dark:text-neutral-400">Welcome back, {userName}.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
        <QuickAction
          label="New Task"
          icon={IconPlus}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("shortcut:new-task"));
            router.push("/tasks");
          }}
          color="blue"
        />
        <QuickAction
          label="New Note"
          icon={IconDocument}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("shortcut:new-note"));
            router.push("/notes");
          }}
          color="purple"
        />
        <QuickAction
          label="Dispatch"
          icon={IconCalendar}
          onClick={() => router.push("/dispatch")}
          color="green"
        />
        <QuickAction
          label="Search"
          icon={IconSearch}
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
          color="neutral"
        />
      </div>

      {/* Stats row with progress ring */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <StatCard label="Open Tasks" count={openTasks.length} color="blue" href="/tasks?status=open" />
        <StatCard label="Notes" count={notes.length} color="purple" href="/notes" />
        <StatCard label="Dispatches" count={dispatchCount} color="green" href="/dispatch" />
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 flex items-center gap-4">
          <ProgressRing percent={progressPercent} />
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Completion</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {completedToday} of {totalTasks} tasks
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Due dates */}
        <section className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <h2 className="text-lg font-semibold mb-3 dark:text-white">Upcoming</h2>
          {overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
              <IconCalendar className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-400 dark:text-neutral-500">No upcoming deadlines</p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
              {overdue.map((t, i) => (
                <DueItem key={t.id} task={t} badge="Overdue" badgeColor="red" index={i} />
              ))}
              {dueToday.map((t, i) => (
                <DueItem key={t.id} task={t} badge="Today" badgeColor="yellow" index={overdue.length + i} />
              ))}
              {upcoming.map((t, i) => (
                <DueItem key={t.id} task={t} index={overdue.length + dueToday.length + i} />
              ))}
            </div>
          )}
        </section>

        {/* Recent notes */}
        <section className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold dark:text-white">Recent Notes</h2>
            <Link href="/notes" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>
          {recentNotes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
              <IconDocument className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-400 dark:text-neutral-500">No notes yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
              {recentNotes.map((n, i) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className={`block p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors ${
                    i > 0 ? "border-t border-neutral-100 dark:border-neutral-800/50" : ""
                  }`}
                >
                  <p className="font-medium text-sm truncate dark:text-white">{n.title}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                    {new Date(n.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent Activity */}
      <section className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        <h2 className="text-lg font-semibold mb-3 dark:text-white">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
            <IconCalendar className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No activity yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <ul className="border-l border-neutral-200 dark:border-neutral-800/70 pl-6 space-y-4">
              {recentActivity.map((item) => {
                const dotClass =
                  item.type === "note"
                    ? "bg-purple-500"
                    : item.status === "done"
                      ? "bg-green-500"
                      : item.status === "in_progress"
                        ? "bg-yellow-500"
                        : "bg-blue-500";

                const label =
                  item.type === "note"
                    ? "Updated note"
                    : item.status === "done"
                      ? "Completed task"
                      : "Updated task";

                return (
                  <li key={item.id} className="relative">
                    <span
                      className={`absolute -left-[12px] top-1.5 h-2.5 w-2.5 rounded-full ${dotClass}`}
                    />
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      <span className="font-medium">{label}:</span>{" "}
                      <span className="text-neutral-600 dark:text-neutral-300">{item.title}</span>
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                      {new Date(item.date).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function QuickAction({
  label,
  icon: Icon,
  onClick,
  color,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  color: "blue" | "purple" | "green" | "neutral";
}) {
  const colors = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800/50",
    purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border-purple-200 dark:border-purple-800/50",
    green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800/50",
    neutral: "text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-700",
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-sm font-medium transition-all active:scale-95 ${colors[color]}`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="flex-shrink-0 -rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="4"
        className="text-neutral-200 dark:text-neutral-800" />
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
        stroke="currentColor"
        className="text-green-500 transition-all duration-500"
        strokeDasharray={c}
        strokeDashoffset={offset} />
      <text x="26" y="26" textAnchor="middle" dominantBaseline="central"
        className="text-[11px] font-bold fill-neutral-700 dark:fill-neutral-300 rotate-90 origin-center">
        {percent}%
      </text>
    </svg>
  );
}

function StatCard({
  label,
  count,
  color,
  href,
}: {
  label: string;
  count: number;
  color: "blue" | "yellow" | "green" | "purple";
  href: string;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
    green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  };
  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 ${colors[color]} hover:opacity-80 active:scale-95 transition-all`}
    >
      <p className="text-3xl font-bold">{count}</p>
      <p className="text-sm font-medium mt-1">{label}</p>
    </Link>
  );
}

function DueItem({
  task,
  badge,
  badgeColor,
  index,
}: {
  task: Task;
  badge?: string;
  badgeColor?: "red" | "yellow";
  index: number;
}) {
  const badgeColors = {
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  };
  return (
    <div
      className={`flex items-center gap-2 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors ${
        index > 0 ? "border-t border-neutral-100 dark:border-neutral-800/50" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate dark:text-white">{task.title}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Due {task.dueDate}
        </p>
      </div>
      {badge && badgeColor && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColors[badgeColor]}`}>
          {badge}
        </span>
      )}
    </div>
  );
}
