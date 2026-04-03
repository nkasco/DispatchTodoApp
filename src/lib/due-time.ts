export function isValidDueTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function formatDueDateTime(date?: string | null, time?: string | null): string | null {
  if (date && time) return `${date} at ${time}`;
  return date ?? time ?? null;
}

export function compareDueDateTime(
  leftDate?: string | null,
  leftTime?: string | null,
  rightDate?: string | null,
  rightTime?: string | null,
): number {
  if (!leftDate && !rightDate) return 0;
  if (!leftDate) return 1;
  if (!rightDate) return -1;

  const dateCompare = leftDate.localeCompare(rightDate);
  if (dateCompare !== 0) return dateCompare;

  if (!leftTime && !rightTime) return 0;
  if (!leftTime) return 1;
  if (!rightTime) return -1;

  return leftTime.localeCompare(rightTime);
}
