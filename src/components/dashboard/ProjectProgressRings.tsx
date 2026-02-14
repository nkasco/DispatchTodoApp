"use client";
import { PROJECT_COLORS } from "@/lib/projects";

type ProjectRingItem = {
  id: string;
  name: string;
  color: string;
  doneCount: number;
  totalCount: number;
};

type ProjectProgressRingsProps = {
  projects: ProjectRingItem[];
};

const RING_COLORS: Record<string, string> = {
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  slate: "#64748b",
};

export function ProjectProgressRings({ projects }: ProjectProgressRingsProps) {
  const chartProjects = projects.slice(0, 3);

  if (chartProjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300/80 bg-white/65 p-8 text-center text-sm text-neutral-500 dark:border-neutral-600/80 dark:bg-neutral-800/35 dark:text-neutral-400">
        Add tasks to projects to see progress rings.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto flex h-44 w-44 items-center justify-center">
        <svg viewBox="0 0 120 120" className="-rotate-90 h-full w-full">
          {chartProjects.map((project, index) => {
            const radius = 42 - index * 9;
            const circumference = 2 * Math.PI * radius;
            const percent =
              project.totalCount > 0
                ? Math.round((project.doneCount / project.totalCount) * 100)
                : 0;
            const dash = (percent / 100) * circumference;
            const trackClass =
              "stroke-neutral-200/85 dark:stroke-neutral-700/70";
            const ringColor = RING_COLORS[project.color] ?? RING_COLORS.blue;

            return (
              <g key={project.id}>
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  strokeWidth="7"
                  className={trackClass}
                />
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  stroke={ringColor}
                  strokeDasharray={`${dash} ${Math.max(circumference - dash, 0)}`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="space-y-2 text-xs">
        {chartProjects.map((project) => {
          const percent =
            project.totalCount > 0
              ? Math.round((project.doneCount / project.totalCount) * 100)
              : 0;
          const colorDot = PROJECT_COLORS[project.color]?.dot ?? "bg-blue-500";
          return (
            <div
              key={`${project.id}-legend`}
              className="flex items-center justify-between rounded-xl border border-neutral-200/70 bg-white/70 px-3 py-2 dark:border-neutral-700/80 dark:bg-neutral-800/40"
            >
              <div className="inline-flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${colorDot}`} />
                <span className="truncate font-medium text-neutral-700 dark:text-neutral-200">
                  {project.name}
                </span>
              </div>
              <span className="text-neutral-600 dark:text-neutral-300">
                {percent}% ({project.doneCount}/{project.totalCount})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
