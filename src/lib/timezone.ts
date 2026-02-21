const isoDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getIsoDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = isoDateFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  isoDateFormatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && isValidTimeZone(resolved)) return resolved;
  } catch {
    // Ignore and fall back.
  }

  return "UTC";
}

export function resolveEffectiveTimeZone(timeZone?: string | null): string {
  if (typeof timeZone === "string") {
    const trimmed = timeZone.trim();
    if (trimmed && isValidTimeZone(trimmed)) return trimmed;
  }
  return getRuntimeTimeZone();
}

export function getIsoDateForTimeZone(date: Date, timeZone?: string | null): string {
  const resolved = resolveEffectiveTimeZone(timeZone);
  const formatter = getIsoDateFormatter(resolved);
  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export function addDaysToIsoDate(date: string, days: number): string {
  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return date;
  }

  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function formatIsoDateForDisplay(
  date: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-US",
): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    ...options,
    timeZone: "UTC",
  });
}

