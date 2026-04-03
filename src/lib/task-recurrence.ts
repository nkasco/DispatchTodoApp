export const TASK_RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly", "custom"] as const;
export type TaskRecurrenceType = typeof TASK_RECURRENCE_TYPES[number];

export const TASK_RECURRENCE_BEHAVIORS = [
  "after_completion",
  "duplicate_on_schedule",
] as const;
export type TaskRecurrenceBehavior = typeof TASK_RECURRENCE_BEHAVIORS[number];

export const TASK_CUSTOM_RECURRENCE_UNITS = ["day", "week", "month"] as const;
export type TaskCustomRecurrenceUnit = typeof TASK_CUSTOM_RECURRENCE_UNITS[number];

export const TASK_RECURRENCE_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type TaskRecurrenceWeekday = typeof TASK_RECURRENCE_WEEKDAYS[number];

export const TASK_RECURRENCE_MONTHLY_ORDINALS = [1, 2, 3, 4, -1] as const;
export type TaskRecurrenceMonthlyOrdinal = typeof TASK_RECURRENCE_MONTHLY_ORDINALS[number];

export const TASK_RECURRENCE_WEEKDAY_LABELS: Record<TaskRecurrenceWeekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

export const TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS: Record<TaskRecurrenceMonthlyOrdinal, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  "-1": "last",
};

export interface TaskMonthlyWeekdayPattern {
  kind: "nth_weekday";
  ordinal: TaskRecurrenceMonthlyOrdinal;
  weekday: TaskRecurrenceWeekday;
}

export interface TaskCustomRecurrenceRule {
  interval: number;
  unit: TaskCustomRecurrenceUnit;
  weekdays?: TaskRecurrenceWeekday[];
  monthlyPattern?: TaskMonthlyWeekdayPattern;
}

type TaskRecurrenceValidationResult = {
  parsedRule: TaskCustomRecurrenceRule | null;
  storedRule: string | null;
  error: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_TO_UTC_DAY: Record<TaskRecurrenceWeekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const UTC_DAY_TO_WEEKDAY = TASK_RECURRENCE_WEEKDAYS;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function pluralize(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}

function sortWeekdays(days: TaskRecurrenceWeekday[]): TaskRecurrenceWeekday[] {
  return [...days].sort((left, right) => WEEKDAY_TO_UTC_DAY[left] - WEEKDAY_TO_UTC_DAY[right]);
}

function parseTaskRecurrenceWeekdays(value: unknown): TaskRecurrenceWeekday[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = new Set<TaskRecurrenceWeekday>();
  for (const entry of value) {
    if (
      typeof entry !== "string"
      || !(TASK_RECURRENCE_WEEKDAYS as readonly string[]).includes(entry)
    ) {
      return null;
    }
    normalized.add(entry as TaskRecurrenceWeekday);
  }

  return sortWeekdays([...normalized]);
}

function parseTaskMonthlyPattern(value: unknown): TaskMonthlyWeekdayPattern | null {
  if (!isObject(value)) {
    return null;
  }

  const kind = value.kind;
  const ordinal = value.ordinal;
  const weekday = value.weekday;

  if (kind !== "nth_weekday") {
    return null;
  }

  if (
    !Number.isInteger(ordinal)
    || !(TASK_RECURRENCE_MONTHLY_ORDINALS as readonly number[]).includes(ordinal as number)
  ) {
    return null;
  }

  if (
    typeof weekday !== "string"
    || !(TASK_RECURRENCE_WEEKDAYS as readonly string[]).includes(weekday)
  ) {
    return null;
  }

  return {
    kind,
    ordinal: ordinal as TaskRecurrenceMonthlyOrdinal,
    weekday: weekday as TaskRecurrenceWeekday,
  };
}

function getDefaultTaskRecurrenceRule(recurrenceType: TaskRecurrenceType): TaskCustomRecurrenceRule | null {
  if (recurrenceType === "none") return null;
  if (recurrenceType === "daily") return { interval: 1, unit: "day" };
  if (recurrenceType === "weekly") return { interval: 1, unit: "week" };
  if (recurrenceType === "monthly") return { interval: 1, unit: "month" };
  return null;
}

function isRecurringTypeWithRule(recurrenceType: TaskRecurrenceType): recurrenceType is Exclude<TaskRecurrenceType, "none" | "daily"> {
  return recurrenceType === "weekly" || recurrenceType === "monthly" || recurrenceType === "custom";
}

function getTaskRecurrenceRuleError(recurrenceType: TaskRecurrenceType): string {
  if (recurrenceType === "weekly") {
    return "recurrenceRule for weekly recurrence must use interval 1, unit week, and optional weekdays";
  }

  if (recurrenceType === "monthly") {
    return "recurrenceRule for monthly recurrence must use interval 1, unit month, and optional monthlyPattern";
  }

  return "recurrenceRule must include interval (1-365), unit (day|week|month), and any optional weekday pattern fields";
}

function normalizeRuleForType(
  recurrenceType: Exclude<TaskRecurrenceType, "none" | "daily">,
  parsedRule: TaskCustomRecurrenceRule | null,
): TaskCustomRecurrenceRule | null {
  if (!parsedRule) {
    return recurrenceType === "custom" ? null : getDefaultTaskRecurrenceRule(recurrenceType);
  }

  if (recurrenceType === "weekly") {
    if (parsedRule.unit !== "week" || parsedRule.interval !== 1) {
      return null;
    }
    return parsedRule;
  }

  if (recurrenceType === "monthly") {
    if (parsedRule.unit !== "month" || parsedRule.interval !== 1) {
      return null;
    }
    return parsedRule;
  }

  return parsedRule;
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
  const rawWeekdays = hasOwn(value, "weekdays") ? value.weekdays : undefined;
  const rawMonthlyPattern = hasOwn(value, "monthlyPattern") ? value.monthlyPattern : undefined;

  if (!Number.isInteger(intervalRaw) || (intervalRaw as number) < 1 || (intervalRaw as number) > 365) {
    return null;
  }

  if (
    typeof unitRaw !== "string"
    || !(TASK_CUSTOM_RECURRENCE_UNITS as readonly string[]).includes(unitRaw)
  ) {
    return null;
  }

  const rule: TaskCustomRecurrenceRule = {
    interval: intervalRaw as number,
    unit: unitRaw as TaskCustomRecurrenceUnit,
  };

  if (rawWeekdays !== undefined) {
    const weekdays = parseTaskRecurrenceWeekdays(rawWeekdays);
    if (!weekdays) {
      return null;
    }
    if (rule.unit !== "week") {
      return null;
    }
    if (weekdays.length > 0) {
      rule.weekdays = weekdays;
    }
  }

  if (rawMonthlyPattern !== undefined) {
    const monthlyPattern = parseTaskMonthlyPattern(rawMonthlyPattern);
    if (!monthlyPattern || rule.unit !== "month") {
      return null;
    }
    rule.monthlyPattern = monthlyPattern;
  }

  if (rule.unit === "day" && (rule.weekdays || rule.monthlyPattern)) {
    return null;
  }

  if (rule.unit === "week" && rule.monthlyPattern) {
    return null;
  }

  if (rule.unit === "month" && rule.weekdays) {
    return null;
  }

  return rule;
}

export function validateTaskRecurrenceRule(
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): TaskRecurrenceValidationResult {
  const hasRuleValue = recurrenceRule !== undefined && recurrenceRule !== null;

  if (recurrenceType === "none") {
    if (hasRuleValue) {
      return {
        parsedRule: null,
        storedRule: null,
        error: "recurrenceRule can only be set when recurrenceType is weekly, monthly, or custom",
      };
    }

    return { parsedRule: null, storedRule: null, error: null };
  }

  if (recurrenceType === "daily") {
    if (hasRuleValue) {
      return {
        parsedRule: null,
        storedRule: null,
        error: "recurrenceRule is not supported for daily recurrence",
      };
    }

    return {
      parsedRule: { interval: 1, unit: "day" },
      storedRule: null,
      error: null,
    };
  }

  const parsedRule = hasRuleValue ? parseTaskCustomRecurrenceRule(recurrenceRule) : null;
  const normalizedRule = normalizeRuleForType(recurrenceType, parsedRule);

  if (recurrenceType === "custom" && !hasRuleValue) {
    return {
      parsedRule: null,
      storedRule: null,
      error: getTaskRecurrenceRuleError(recurrenceType),
    };
  }

  if (hasRuleValue && !normalizedRule) {
    return {
      parsedRule: null,
      storedRule: null,
      error: getTaskRecurrenceRuleError(recurrenceType),
    };
  }

  if (recurrenceType === "custom" && !normalizedRule) {
    return {
      parsedRule: null,
      storedRule: null,
      error: getTaskRecurrenceRuleError(recurrenceType),
    };
  }

  return {
    parsedRule: normalizedRule,
    storedRule: hasRuleValue && normalizedRule ? serializeTaskCustomRecurrenceRule(normalizedRule) : null,
    error: null,
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

function addDays(date: Date, amount: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
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

function startOfIsoWeek(date: Date): Date {
  const next = new Date(date.getTime());
  const utcDay = next.getUTCDay();
  const diff = utcDay === 0 ? -6 : 1 - utcDay;
  next.setUTCDate(next.getUTCDate() + diff);
  return next;
}

function diffWholeDays(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / DAY_MS);
}

function getTaskRecurrenceWeekdayFromDate(date: Date): TaskRecurrenceWeekday {
  return UTC_DAY_TO_WEEKDAY[date.getUTCDay()];
}

function getNthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: TaskRecurrenceWeekday,
  ordinal: TaskRecurrenceMonthlyOrdinal,
): Date | null {
  const targetUtcDay = WEEKDAY_TO_UTC_DAY[weekday];

  if (ordinal === -1) {
    const candidate = new Date(Date.UTC(year, monthIndex + 1, 0));
    const delta = (candidate.getUTCDay() - targetUtcDay + 7) % 7;
    candidate.setUTCDate(candidate.getUTCDate() - delta);
    return candidate;
  }

  const candidate = new Date(Date.UTC(year, monthIndex, 1));
  const delta = (targetUtcDay - candidate.getUTCDay() + 7) % 7;
  candidate.setUTCDate(1 + delta + ((ordinal - 1) * 7));

  return candidate.getUTCMonth() === monthIndex ? candidate : null;
}

function getNextWeeklyRecurrenceDate(anchorDate: Date, rule: TaskCustomRecurrenceRule): string | null {
  const allowedWeekdays = new Set(
    (rule.weekdays && rule.weekdays.length > 0)
      ? rule.weekdays
      : [getTaskRecurrenceWeekdayFromDate(anchorDate)],
  );
  const anchorWeekStart = startOfIsoWeek(anchorDate);

  for (let offset = 1; offset <= 4000; offset += 1) {
    const candidate = addDays(anchorDate, offset);
    if (!allowedWeekdays.has(getTaskRecurrenceWeekdayFromDate(candidate))) {
      continue;
    }

    const candidateWeekStart = startOfIsoWeek(candidate);
    const weeksFromAnchor = Math.floor(diffWholeDays(candidateWeekStart, anchorWeekStart) / 7);
    if (weeksFromAnchor % rule.interval === 0) {
      return toIsoDate(candidate);
    }
  }

  return null;
}

function getNextMonthlyRecurrenceDate(anchorDate: Date, rule: TaskCustomRecurrenceRule): string | null {
  if (!rule.monthlyPattern) {
    return toIsoDate(addMonthsClamped(anchorDate, rule.interval));
  }

  const anchorMonthIndex = (anchorDate.getUTCFullYear() * 12) + anchorDate.getUTCMonth();
  for (let monthDelta = 0; monthDelta <= 5000; monthDelta += 1) {
    if (monthDelta % rule.interval !== 0) {
      continue;
    }

    const currentMonthIndex = anchorMonthIndex + monthDelta;
    const year = Math.floor(currentMonthIndex / 12);
    const monthIndex = currentMonthIndex % 12;
    const candidate = getNthWeekdayOfMonth(
      year,
      monthIndex,
      rule.monthlyPattern.weekday,
      rule.monthlyPattern.ordinal,
    );

    if (candidate && candidate.getTime() > anchorDate.getTime()) {
      return toIsoDate(candidate);
    }
  }

  return null;
}

export function getResolvedTaskRecurrenceRule(
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): TaskCustomRecurrenceRule | null {
  const defaultRule = getDefaultTaskRecurrenceRule(recurrenceType);
  if (!isRecurringTypeWithRule(recurrenceType)) {
    return defaultRule;
  }

  const parsedRule = parseTaskCustomRecurrenceRule(recurrenceRule);
  return normalizeRuleForType(recurrenceType, parsedRule) ?? defaultRule;
}

export function doesIsoDateMatchTaskRecurrenceRule(
  isoDate: string,
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): boolean {
  const date = parseIsoDate(isoDate);
  if (!date) {
    return false;
  }

  const resolvedRule = getResolvedTaskRecurrenceRule(recurrenceType, recurrenceRule);
  if (!resolvedRule) {
    return false;
  }

  if (resolvedRule.unit === "week" && resolvedRule.weekdays && resolvedRule.weekdays.length > 0) {
    return resolvedRule.weekdays.includes(getTaskRecurrenceWeekdayFromDate(date));
  }

  if (resolvedRule.unit === "month" && resolvedRule.monthlyPattern) {
    const candidate = getNthWeekdayOfMonth(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      resolvedRule.monthlyPattern.weekday,
      resolvedRule.monthlyPattern.ordinal,
    );
    return candidate ? toIsoDate(candidate) === isoDate : false;
  }

  return true;
}

export function getTaskRecurrenceDateConstraintMessage(
  fieldName: string,
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): string | null {
  const resolvedRule = getResolvedTaskRecurrenceRule(recurrenceType, recurrenceRule);
  if (!resolvedRule) {
    return null;
  }

  if (resolvedRule.unit === "week" && resolvedRule.weekdays && resolvedRule.weekdays.length > 0) {
    return `${fieldName} must fall on one of the selected weekdays`;
  }

  if (resolvedRule.unit === "month" && resolvedRule.monthlyPattern) {
    return `${fieldName} must match the selected monthly occurrence`;
  }

  return null;
}

export function describeTaskRecurrence(
  recurrenceType: TaskRecurrenceType,
  recurrenceRule: unknown,
): string {
  const resolved = getResolvedTaskRecurrenceRule(recurrenceType, recurrenceRule);
  if (!resolved) return "No recurrence";

  if (resolved.unit === "day") {
    return resolved.interval === 1 ? "Every day" : `Every ${resolved.interval} days`;
  }

  if (resolved.unit === "week") {
    const base = resolved.interval === 1 ? "Every week" : `Every ${resolved.interval} weeks`;
    if (!resolved.weekdays || resolved.weekdays.length === 0) {
      return base;
    }
    const weekdayList = resolved.weekdays
      .map((weekday) => TASK_RECURRENCE_WEEKDAY_LABELS[weekday])
      .join(", ");
    return `${base} on ${weekdayList}`;
  }

  if (resolved.monthlyPattern) {
    const base = resolved.interval === 1 ? "Every month" : `Every ${resolved.interval} months`;
    return `${base} on the ${TASK_RECURRENCE_MONTHLY_ORDINAL_LABELS[resolved.monthlyPattern.ordinal]} ${TASK_RECURRENCE_WEEKDAY_LABELS[resolved.monthlyPattern.weekday]}`;
  }

  return resolved.interval === 1
    ? "Every month"
    : `Every ${resolved.interval} ${pluralize(resolved.interval, "month")}`;
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

  if (resolvedRule.unit === "day") {
    return toIsoDate(addDays(anchorDate, resolvedRule.interval));
  }

  if (resolvedRule.unit === "week") {
    return getNextWeeklyRecurrenceDate(anchorDate, resolvedRule);
  }

  return getNextMonthlyRecurrenceDate(anchorDate, resolvedRule);
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
