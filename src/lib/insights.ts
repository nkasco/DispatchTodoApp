import type { Task } from "@/lib/client";

export type TaskForInsights = Pick<Task, "createdAt" | "updatedAt" | "status">;

export type DailyPoint = {
  dateKey: string;
  label: string;
  created: number;
  completed: number;
};

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeIsoDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildDailyPoints(
  tasks: TaskForInsights[],
  rangeDays: number,
  now = new Date(),
): DailyPoint[] {
  if (rangeDays <= 0) return [];

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const startDate = addDays(today, -(rangeDays - 1));
  const keys: string[] = [];
  const labels = new Map<string, string>();

  for (let i = 0; i < rangeDays; i += 1) {
    const current = addDays(startDate, i);
    const key = toLocalDateKey(current);
    keys.push(key);
    labels.set(
      key,
      current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    );
  }

  const createdByDay = new Map<string, number>();
  const completedByDay = new Map<string, number>();

  for (const task of tasks) {
    const createdAt = normalizeIsoDate(task.createdAt);
    if (createdAt) {
      const createdKey = toLocalDateKey(createdAt);
      if (labels.has(createdKey)) {
        createdByDay.set(createdKey, (createdByDay.get(createdKey) ?? 0) + 1);
      }
    }

    if (task.status === "done") {
      const completedAt = normalizeIsoDate(task.updatedAt);
      if (completedAt) {
        const completedKey = toLocalDateKey(completedAt);
        if (labels.has(completedKey)) {
          completedByDay.set(completedKey, (completedByDay.get(completedKey) ?? 0) + 1);
        }
      }
    }
  }

  return keys.map((dateKey) => ({
    dateKey,
    label: labels.get(dateKey) ?? dateKey,
    created: createdByDay.get(dateKey) ?? 0,
    completed: completedByDay.get(dateKey) ?? 0,
  }));
}

export function calculateInsightsTotals(points: DailyPoint[]) {
  const created = points.reduce((sum, point) => sum + point.created, 0);
  const completed = points.reduce((sum, point) => sum + point.completed, 0);
  const peakDay = [...points].sort((a, b) => b.completed - a.completed)[0];
  const completionRate = created > 0 ? Math.round((completed / created) * 100) : 0;

  return {
    created,
    completed,
    completionRate,
    peakDay,
  };
}

export function shouldApplyInsightsFetchResult(
  requestVersion: number,
  latestRequestVersion: number,
  isMounted: boolean,
): boolean {
  return isMounted && requestVersion === latestRequestVersion;
}

export function shouldFinalizeInsightsLoading(
  withLoading: boolean,
  isMounted: boolean,
): boolean {
  return withLoading && isMounted;
}
