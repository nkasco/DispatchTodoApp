import { getIsoDateForTimeZone } from "@/lib/timezone";

type DateParts = {
  iso: string;
  year: number;
  month: number;
  dayOfMonth: number;
  dayOfWeek: number;
};

export interface TemplateRenderOptions {
  referenceDate?: Date | string | null;
  timeZone?: string | null;
}

const SHORT_DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const LONG_DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const SHORT_MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;
const LONG_MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveReferenceIsoDate(referenceDate: Date | string | null | undefined, timeZone?: string | null): string {
  if (typeof referenceDate === "string") {
    const trimmed = referenceDate.trim();
    if (isIsoDate(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return getIsoDateForTimeZone(parsed, timeZone);
    }
  }

  if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
    return getIsoDateForTimeZone(referenceDate, timeZone);
  }

  return getIsoDateForTimeZone(new Date(), timeZone);
}

function parseIsoDateParts(iso: string): DateParts {
  const [yearRaw, monthRaw, dayRaw] = iso.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const dayOfMonth = Number(dayRaw);
  const asUtcDate = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const dayOfWeek = asUtcDate.getUTCDay();

  return { iso, year, month, dayOfMonth, dayOfWeek };
}

function evaluateCondition(condition: string, dateParts: DateParts): boolean {
  const checks = condition
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean);

  if (checks.length === 0) {
    return false;
  }

  for (const check of checks) {
    const [keyRaw, valueRaw] = check.split("=");
    if (!keyRaw || valueRaw === undefined) {
      return false;
    }

    const key = keyRaw.trim().toLowerCase();
    const value = valueRaw.trim().toLowerCase();

    if (key === "day") {
      const dayShort = SHORT_DAY_NAMES[dateParts.dayOfWeek];
      const dayLong = LONG_DAY_NAMES[dateParts.dayOfWeek];
      const dayNumber = String(dateParts.dayOfWeek);
      if (value !== dayShort && value !== dayLong && value !== dayNumber) {
        return false;
      }
      continue;
    }

    if (key === "month") {
      const monthIndex = dateParts.month - 1;
      const monthShort = SHORT_MONTH_NAMES[monthIndex];
      const monthLong = LONG_MONTH_NAMES[monthIndex];
      const monthNum = String(dateParts.month);
      const monthPadded = String(dateParts.month).padStart(2, "0");
      if (value !== monthShort && value !== monthLong && value !== monthNum && value !== monthPadded) {
        return false;
      }
      continue;
    }

    if (key === "dom") {
      const dayNum = String(dateParts.dayOfMonth);
      const dayPadded = String(dateParts.dayOfMonth).padStart(2, "0");
      if (value !== dayNum && value !== dayPadded) {
        return false;
      }
      continue;
    }

    if (key === "year") {
      if (value !== String(dateParts.year)) {
        return false;
      }
      continue;
    }

    if (key === "date") {
      if (value !== dateParts.iso.toLowerCase()) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
}

function renderConditionalBlocks(input: string, dateParts: DateParts): string {
  const conditionalPattern = /\{\{if:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/gi;
  let output = input;

  // Re-run replacement so nested blocks are resolved from inside out.
  for (let i = 0; i < 16; i += 1) {
    const next = output.replace(conditionalPattern, (_match, conditionRaw: string, content: string) => {
      return evaluateCondition(conditionRaw, dateParts) ? content : "";
    });
    if (next === output) {
      break;
    }
    output = next;
  }

  return output;
}

function formatIsoDate(iso: string, format: string): string {
  const [yearRaw, monthRaw, dayRaw] = iso.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();

  const tokenMap: Record<string, string> = {
    YYYY: String(year),
    YY: String(year).slice(-2),
    MMMM: LONG_MONTH_NAMES[month - 1],
    MMM: SHORT_MONTH_NAMES[month - 1],
    MM: String(month).padStart(2, "0"),
    M: String(month),
    DD: String(day).padStart(2, "0"),
    D: String(day),
    dddd: LONG_DAY_NAMES[dayOfWeek],
    ddd: SHORT_DAY_NAMES[dayOfWeek],
  };

  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g, (token) => tokenMap[token] ?? token);
}

export function renderTemplate(input: string | null | undefined, options: TemplateRenderOptions = {}): string {
  if (!input) {
    return "";
  }

  const referenceIso = resolveReferenceIsoDate(options.referenceDate, options.timeZone);
  const dateParts = parseIsoDateParts(referenceIso);
  const withConditionals = renderConditionalBlocks(input, dateParts);

  return withConditionals.replace(/\{\{date:([^}]+)\}\}/gi, (_match, formatRaw: string) => {
    const format = formatRaw.trim();
    return format ? formatIsoDate(referenceIso, format) : referenceIso;
  });
}
