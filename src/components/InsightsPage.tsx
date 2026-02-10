"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, TASKS_CHANGED_EVENT, type Task } from "@/lib/client";
import {
  buildDailyPoints,
  calculateInsightsTotals,
  shouldApplyInsightsFetchResult,
  shouldFinalizeInsightsLoading,
  type DailyPoint,
} from "@/lib/insights";
import { IconCalendar, IconChartBar, IconCheckCircle } from "@/components/icons";

const RANGE_OPTIONS = [7, 14, 30, 90] as const;

type RangeOption = (typeof RANGE_OPTIONS)[number];

export function InsightsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState<RangeOption>(30);
  const mountedRef = useRef(true);
  const fetchVersionRef = useRef(0);

  const fetchTasks = useCallback(async (withLoading = false) => {
    const requestVersion = ++fetchVersionRef.current;
    if (withLoading && mountedRef.current) {
      setLoading(true);
    }

    try {
      const result = await api.tasks.list();
      if (
        !shouldApplyInsightsFetchResult(
          requestVersion,
          fetchVersionRef.current,
          mountedRef.current,
        )
      ) {
        return;
      }
      setTasks(Array.isArray(result) ? result : result.data);
    } finally {
      if (shouldFinalizeInsightsLoading(withLoading, mountedRef.current)) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchTasks(true);
  }, [fetchTasks]);

  useEffect(() => {
    function handleTasksChanged() {
      void fetchTasks();
    }

    function handleFocus() {
      void fetchTasks();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void fetchTasks();
      }
    }

    window.addEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchTasks]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    },
    [],
  );

  const points = useMemo<DailyPoint[]>(() => buildDailyPoints(tasks, rangeDays), [rangeDays, tasks]);
  const totals = useMemo(() => calculateInsightsTotals(points), [points]);

  const chart = useMemo(() => {
    if (points.length === 0) {
      return {
        linePath: "",
        maxValue: 1,
      };
    }

    const maxValue = Math.max(
      1,
      ...points.flatMap((point) => [point.created, point.completed]),
    );
    const width = 100;
    const height = 100;
    const step = points.length > 1 ? width / (points.length - 1) : width;

    const path = points
      .map((point, index) => {
        const x = index * step;
        const y = height - (point.completed / maxValue) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    return {
      linePath: path,
      maxValue,
    };
  }, [points]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <div className="h-8 w-56 rounded skeleton-shimmer" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-24 rounded-xl skeleton-shimmer" />
          ))}
        </div>
        <div className="h-80 rounded-2xl skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-900/30">
            <IconChartBar className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Insights</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Completion trends and momentum over time.
            </p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRangeDays(option)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                rangeDays === option
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<IconCheckCircle className="w-4 h-4" />}
          label="Completed"
          value={totals.completed.toString()}
          subtext={`Last ${rangeDays} days`}
          tone="emerald"
        />
        <StatCard
          icon={<IconCalendar className="w-4 h-4" />}
          label="Created"
          value={totals.created.toString()}
          subtext={`Last ${rangeDays} days`}
          tone="blue"
        />
        <StatCard
          icon={<IconChartBar className="w-4 h-4" />}
          label="Completion Rate"
          value={`${totals.completionRate}%`}
          subtext={totals.peakDay ? `Peak: ${totals.peakDay.label}` : "No activity"}
          tone="amber"
        />
      </div>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Completion Trend
          </h2>
          <div className="text-xs text-neutral-400 dark:text-neutral-500">
            Line: completed · Bars: created
          </div>
        </div>
        {points.every((point) => point.created === 0 && point.completed === 0) ? (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No trend data in this range yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-72 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/50 p-4">
              <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
                {points.map((point, index) => {
                  const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 50;
                  const height = (point.created / chart.maxValue) * 100;
                  const y = 100 - height;
                  return (
                    <rect
                      key={`${point.dateKey}-bar`}
                      x={Math.max(0, x - 1.1)}
                      y={y}
                      width={2.2}
                      height={height}
                      rx={0.7}
                      className="fill-blue-300/70 dark:fill-blue-800/60"
                    />
                  );
                })}
                <path
                  d={chart.linePath}
                  fill="none"
                  className="stroke-emerald-500 dark:stroke-emerald-400"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((point, index) => {
                  const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 50;
                  const y = 100 - (point.completed / chart.maxValue) * 100;
                  return (
                    <circle
                      key={`${point.dateKey}-dot`}
                      cx={x}
                      cy={y}
                      r={1.2}
                      className="fill-emerald-500 dark:fill-emerald-300"
                    />
                  );
                })}
              </svg>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
              {points.filter((_, index) => index % Math.ceil(points.length / 6 || 1) === 0).map((point) => (
                <div
                  key={`${point.dateKey}-label`}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5 text-neutral-500 dark:text-neutral-400"
                >
                  {point.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext: string;
  tone: "emerald" | "blue" | "amber";
}) {
  const toneClasses = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100",
    blue:
      "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100",
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses[tone]}`}>
      <div className="inline-flex items-center gap-1.5 text-xs font-medium opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{subtext}</p>
    </div>
  );
}
