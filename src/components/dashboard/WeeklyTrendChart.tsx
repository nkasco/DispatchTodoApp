"use client";

import { useMemo } from "react";
import type { DailyPoint } from "@/lib/insights";

type WeeklyTrendChartProps = {
  points: DailyPoint[];
};

function toWeekdayLabel(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", { weekday: "short" });
}

export function WeeklyTrendChart({ points }: WeeklyTrendChartProps) {
  const chart = useMemo(() => {
    if (points.length === 0) {
      return {
        maxValue: 1,
        linePath: "",
      };
    }

    const maxValue = Math.max(
      1,
      ...points.flatMap((point) => [point.created, point.completed]),
    );
    const width = 100;
    const height = 100;
    const step = points.length > 1 ? width / (points.length - 1) : width;

    const linePath = points
      .map((point, index) => {
        const x = index * step;
        const y = height - (point.completed / maxValue) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    return {
      maxValue,
      linePath,
    };
  }, [points]);

  const hasData = points.some((point) => point.created > 0 || point.completed > 0);

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300/80 bg-white/65 p-8 text-center text-sm text-neutral-500 dark:border-neutral-600/80 dark:bg-neutral-800/35 dark:text-neutral-400">
        No weekly trend data yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="h-36 rounded-xl border border-neutral-200/80 bg-white/70 p-2.5 dark:border-neutral-700/80 dark:bg-neutral-800/40">
        <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
          {points.map((point, index) => {
            const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 50;
            const barHeight = (point.created / chart.maxValue) * 100;
            const y = 100 - barHeight;
            return (
              <rect
                key={`${point.dateKey}-bar`}
                x={Math.max(0, x - 1.25)}
                y={y}
                width={2.5}
                height={barHeight}
                rx={0.8}
                className="fill-cyan-400/70 dark:fill-cyan-500/45"
              />
            );
          })}
          <path
            d={chart.linePath}
            fill="none"
            className="stroke-blue-600 dark:stroke-blue-300"
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
                r={1.3}
                className="fill-blue-600 dark:fill-blue-300"
              />
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {points.map((point) => (
          <span key={`${point.dateKey}-label`}>{toWeekdayLabel(point.dateKey)}</span>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3 text-[10px] text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400 dark:bg-cyan-500" />
          Created
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-300" />
          Completed
        </span>
      </div>
    </div>
  );
}
