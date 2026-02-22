import type { Task } from "@/lib/client";
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
    const next = getNextTaskRecurrenceDate(
      task.dueDate ?? todayIsoDate,
      task.recurrenceType,
      task.recurrenceRule,
    );

    return {
      cadence,
      next,
      detail: next
        ? `If completed today, next occurrence is ${next}.`
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
      ? (next ? `Next scheduled duplicate: ${next}.` : "Unable to calculate the next duplicate date.")
      : "Add a due date to anchor schedule-based duplicates.",
  };
}
