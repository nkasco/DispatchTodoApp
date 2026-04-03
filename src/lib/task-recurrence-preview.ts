import type { RecurrenceSeries, Task } from "@/lib/client";
import { formatDueDateTime } from "@/lib/due-time";
import {
  describeTaskRecurrence,
  getNextTaskRecurrenceDate,
  getNextTaskRecurrenceOnOrAfter,
} from "@/lib/task-recurrence";

export const RECURRENCE_BEHAVIOR_LABELS = {
  after_completion: "After Completion",
  duplicate_on_schedule: "Duplicate On Schedule",
} as const;

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTaskRecurrencePreview(task: Task): {
  cadence: string;
  next: string | null;
  detail: string;
} {
  const cadence = describeTaskRecurrence(task.recurrenceType, task.recurrenceRule);
  const todayIsoDate = getTodayIsoDate();

  if (task.recurrenceBehavior === "after_completion") {
    const anchor = task.dueDate && task.dueDate > todayIsoDate
      ? task.dueDate
      : todayIsoDate;
    const next = getNextTaskRecurrenceDate(
      anchor,
      task.recurrenceType,
      task.recurrenceRule,
    );

    return {
      cadence,
      next,
      detail: next
        ? `If completed today, next occurrence is scheduled for ${next} (active at midnight).`
        : "Set a valid recurrence rule to preview the next occurrence.",
    };
  }

  const next = task.dueDate
    ? getNextTaskRecurrenceOnOrAfter(
      task.dueDate,
      task.recurrenceType,
      task.recurrenceRule,
      todayIsoDate,
    )
    : null;

  return {
    cadence,
    next,
    detail: task.dueDate
      ? (next ? `Next scheduled duplicate: ${next} (active at midnight).` : "Unable to calculate the next duplicate date.")
      : "Add a due date to anchor schedule-based duplicates.",
  };
}

export function getRecurrenceSeriesPreview(series: RecurrenceSeries): {
  cadence: string;
  next: string;
  detail: string;
} {
  const cadence = describeTaskRecurrence(series.recurrenceType, series.recurrenceRule);
  const nextDue = formatDueDateTime(series.nextDueDate, series.dueTime) ?? series.nextDueDate;
  const detail = series.recurrenceBehavior === "after_completion"
    ? `Next instance due ${nextDue}. Completing an instance advances this date.`
    : `Next scheduled instance due ${nextDue}. Instances are created on schedule dates using this due time.`;

  return {
    cadence,
    next: series.nextDueDate,
    detail,
  };
}
