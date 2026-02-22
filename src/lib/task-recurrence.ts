export const TASK_RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly", "custom"] as const;
export type TaskRecurrenceType = typeof TASK_RECURRENCE_TYPES[number];

export const TASK_RECURRENCE_BEHAVIORS = [
  "after_completion",
  "duplicate_on_schedule",
] as const;
export type TaskRecurrenceBehavior = typeof TASK_RECURRENCE_BEHAVIORS[number];

export const TASK_CUSTOM_RECURRENCE_UNITS = ["day", "week", "month"] as const;
export type TaskCustomRecurrenceUnit = typeof TASK_CUSTOM_RECURRENCE_UNITS[number];

export interface TaskCustomRecurrenceRule {
  interval: number;
  unit: TaskCustomRecurrenceUnit;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTaskRecurrenceType(value: unknown): value is TaskRecurrenceType {
  return (
    typeof value === "string"
    && (TASK_RECURRENCE_TYPES as readonly string[]).includes(value)
  );
}

export function isTaskRecurrenceBehavior(value: unknown): value is TaskRecurrenceBehavior {
  return (
    typeof value === "string"
    && (TASK_RECURRENCE_BEHAVIORS as readonly string[]).includes(value)
  );
}

export function parseTaskCustomRecurrenceRule(value: unknown): TaskCustomRecurrenceRule | null {
  if (typeof value === "string") {
    try {
      return parseTaskCustomRecurrenceRule(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (!isObject(value)) {
    return null;
  }

  const intervalRaw = value.interval;
  const unitRaw = value.unit;

  if (!Number.isInteger(intervalRaw) || (intervalRaw as number) < 1 || (intervalRaw as number) > 365) {
    return null;
  }

  if (
    typeof unitRaw !== "string"
    || !(TASK_CUSTOM_RECURRENCE_UNITS as readonly string[]).includes(unitRaw)
  ) {
    return null;
  }

  return {
    interval: intervalRaw as number,
    unit: unitRaw as TaskCustomRecurrenceUnit,
  };
}

export function serializeTaskCustomRecurrenceRule(rule: TaskCustomRecurrenceRule): string {
  return JSON.stringify(rule);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(date: Date, amount: number): Date {
  const next = new Date(date.getTime());
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

export function getResolvedTaskRecurrenceRule(
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): TaskCustomRecurrenceRule | null {
  if (recurrenceType === "none") return null;
  if (recurrenceType === "daily") return { interval: 1, unit: "day" };
  if (recurrenceType === "weekly") return { interval: 1, unit: "week" };
  if (recurrenceType === "monthly") return { interval: 1, unit: "month" };
  return parseTaskCustomRecurrenceRule(recurrenceRule);
}

export function describeTaskRecurrence(
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): string {
  const resolved = getResolvedTaskRecurrenceRule(recurrenceType, recurrenceRule);
  if (!resolved) return "No recurrence";

  if (resolved.interval === 1) {
    if (resolved.unit === "day") return "Every day";
    if (resolved.unit === "week") return "Every week";
    return "Every month";
  }

  return `Every ${resolved.interval} ${resolved.unit}s`;
}

export function getNextTaskRecurrenceDate(
  anchorIsoDate: string,
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): string | null {
  const resolvedRule = getResolvedTaskRecurrenceRule(recurrenceType, recurrenceRule);
  if (!resolvedRule) return null;

  const anchorDate = parseIsoDate(anchorIsoDate);
  if (!anchorDate) return null;

  const next = new Date(anchorDate.getTime());
  if (resolvedRule.unit === "day") {
    next.setUTCDate(next.getUTCDate() + resolvedRule.interval);
  } else if (resolvedRule.unit === "week") {
    next.setUTCDate(next.getUTCDate() + (resolvedRule.interval * 7));
  } else {
    return toIsoDate(addMonthsClamped(next, resolvedRule.interval));
  }

  return toIsoDate(next);
}

export function getNextTaskRecurrenceOnOrAfter(
  anchorIsoDate: string,
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
  onOrAfterIsoDate: string,
): string | null {
  let cursor = anchorIsoDate;
  const target = parseIsoDate(onOrAfterIsoDate);
  if (!target) return null;

  for (let i = 0; i < 4000; i += 1) {
    const cursorDate = parseIsoDate(cursor);
    if (!cursorDate) return null;
    if (cursorDate.getTime() >= target.getTime()) {
      return cursor;
    }

    const next = getNextTaskRecurrenceDate(cursor, recurrenceType, recurrenceRule);
    if (!next) return null;
    cursor = next;
  }

  return null;
}
