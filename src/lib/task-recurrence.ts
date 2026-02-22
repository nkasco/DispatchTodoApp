export const TASK_RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly", "custom"] as const;
export type TaskRecurrenceType = typeof TASK_RECURRENCE_TYPES[number];

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
