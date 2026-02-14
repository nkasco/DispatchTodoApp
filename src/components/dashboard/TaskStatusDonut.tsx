"use client";

type TaskStatusDonutProps = {
  openCount: number;
  inProgressCount: number;
  doneCount: number;
};

type Segment = {
  key: "open" | "in_progress" | "done";
  label: string;
  value: number;
  colorClass: string;
  ringColorClass: string;
  barColorClass: string;
};

export function TaskStatusDonut({
  openCount,
  inProgressCount,
  doneCount,
}: TaskStatusDonutProps) {
  const segments: Segment[] = [
    {
      key: "open",
      label: "Open",
      value: openCount,
      colorClass: "text-blue-600 dark:text-blue-300",
      ringColorClass: "stroke-blue-500 dark:stroke-blue-400",
      barColorClass: "bg-blue-500 dark:bg-blue-400",
    },
    {
      key: "in_progress",
      label: "In progress",
      value: inProgressCount,
      colorClass: "text-amber-600 dark:text-amber-300",
      ringColorClass: "stroke-amber-500 dark:stroke-amber-400",
      barColorClass: "bg-amber-500 dark:bg-amber-400",
    },
    {
      key: "done",
      label: "Done",
      value: doneCount,
      colorClass: "text-emerald-600 dark:text-emerald-300",
      ringColorClass: "stroke-emerald-500 dark:stroke-emerald-400",
      barColorClass: "bg-emerald-500 dark:bg-emerald-400",
    },
  ];

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const activeCount = openCount + inProgressCount;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offsetSoFar = 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] gap-3 items-center">
      <div className="relative mx-auto h-32 w-32">
        <svg
          viewBox="0 0 120 120"
          className="-rotate-90 h-full w-full"
          aria-label="Task status distribution chart"
          role="img"
        >
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="12"
            className="stroke-neutral-200/85 dark:stroke-neutral-700/70"
          />
          {total > 0 &&
            segments.map((segment) => {
              const ratio = segment.value / total;
              const dash = circumference * ratio;
              const gap = Math.max(circumference - dash, 0);
              const offset = offsetSoFar;
              offsetSoFar += dash;

              return (
                <circle
                  key={segment.key}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  className={segment.ringColorClass}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offset}
                />
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Active
          </p>
          <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {activeCount}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {segments.map((segment) => {
          const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <div
              key={segment.key}
              className="rounded-lg border border-neutral-200/70 bg-white/70 px-2.5 py-1.5 dark:border-neutral-700/70 dark:bg-neutral-800/40"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <p className={`font-semibold ${segment.colorClass}`}>{segment.label}</p>
                <p className="text-neutral-700 dark:text-neutral-200">
                  {segment.value} <span className="text-neutral-500 dark:text-neutral-400">({percent}%)</span>
                </p>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-700/80">
                <div className={`h-full ${segment.barColorClass}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
