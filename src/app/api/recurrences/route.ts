import { and, desc, eq, isNull } from "drizzle-orm";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { db } from "@/db";
import { projects, recurrenceSeries } from "@/db/schema";
import { syncRecurrenceSeriesForUser } from "@/lib/recurrence-series-sync";
import { getTodayIsoDate } from "@/lib/task-recurrence-rollover";
import {
  isTaskRecurrenceBehavior,
  parseTaskCustomRecurrenceRule,
  serializeTaskCustomRecurrenceRule,
  type TaskRecurrenceBehavior,
  type TaskRecurrenceType,
} from "@/lib/task-recurrence";
import { isValidDueTime } from "@/lib/due-time";

const VALID_PRIORITIES = ["low", "medium", "high"] as const;
const VALID_SERIES_TYPES = ["daily", "weekly", "monthly", "custom"] as const;

function isSeriesType(value: unknown): value is Exclude<TaskRecurrenceType, "none"> {
  return typeof value === "string" && VALID_SERIES_TYPES.includes(value as typeof VALID_SERIES_TYPES[number]);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** GET /api/recurrences — list recurrence series for current user */
export const GET = withAuth(async (_req, session) => {
  const todayIsoDate = getTodayIsoDate(session.user.timeZone ?? null);
  await syncRecurrenceSeriesForUser(session.user!.id!, todayIsoDate);

  const rows = await db
    .select()
    .from(recurrenceSeries)
    .where(and(eq(recurrenceSeries.userId, session.user!.id!), isNull(recurrenceSeries.deletedAt)))
    .orderBy(desc(recurrenceSeries.updatedAt));

  return jsonResponse(rows);
});

/** POST /api/recurrences — create recurrence series */
export const POST = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const {
    title,
    description,
    priority,
    projectId,
    recurrenceType,
    recurrenceBehavior,
    recurrenceRule,
    nextDueDate,
    dueTime,
    active,
  } = body as Record<string, unknown>;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return errorResponse("title is required and must be a non-empty string", 400);
  }
  if ((title as string).length > 500) {
    return errorResponse("title must be at most 500 characters", 400);
  }
  if (description !== undefined && typeof description !== "string") {
    return errorResponse("description must be a string", 400);
  }
  if (description && (description as string).length > 5000) {
    return errorResponse("description must be at most 5000 characters", 400);
  }
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
    return errorResponse(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`, 400);
  }
  if (projectId !== undefined && projectId !== null && typeof projectId !== "string") {
    return errorResponse("projectId must be a string or null", 400);
  }
  if (!isSeriesType(recurrenceType)) {
    return errorResponse("recurrenceType must be one of: daily, weekly, monthly, custom", 400);
  }
  if (recurrenceBehavior !== undefined && !isTaskRecurrenceBehavior(recurrenceBehavior)) {
    return errorResponse(
      "recurrenceBehavior must be one of: after_completion, duplicate_on_schedule",
      400,
    );
  }
  if (!nextDueDate || typeof nextDueDate !== "string") {
    return errorResponse("nextDueDate is required and must be an ISO date string", 400);
  }
  if (!isIsoDate(nextDueDate)) {
    return errorResponse("nextDueDate must be a YYYY-MM-DD date", 400);
  }
  if (dueTime !== undefined && dueTime !== null && typeof dueTime !== "string") {
    return errorResponse("dueTime must be a string (HH:MM) or null", 400);
  }
  if (typeof dueTime === "string" && !isValidDueTime(dueTime)) {
    return errorResponse("dueTime must be a valid 24-hour time in HH:MM format", 400);
  }
  if (active !== undefined && typeof active !== "boolean") {
    return errorResponse("active must be a boolean", 400);
  }

  let resolvedProjectId: string | null | undefined = undefined;
  if (projectId === null) {
    resolvedProjectId = null;
  } else if (projectId !== undefined) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId as string), eq(projects.userId, session.user!.id!)));
    if (!project) {
      return errorResponse("projectId does not match an existing project", 400);
    }
    resolvedProjectId = projectId as string;
  }

  const resolvedBehavior = (recurrenceBehavior as TaskRecurrenceBehavior | undefined) ?? "after_completion";
  let resolvedRule: string | null = null;

  if (recurrenceType === "custom") {
    const parsed = parseTaskCustomRecurrenceRule(recurrenceRule);
    if (!parsed) {
      return errorResponse(
        "recurrenceRule is required for custom recurrence and must include interval (1-365) and unit (day|week|month)",
        400,
      );
    }
    resolvedRule = serializeTaskCustomRecurrenceRule(parsed);
  } else if (recurrenceRule !== undefined && recurrenceRule !== null) {
    return errorResponse("recurrenceRule can only be set when recurrenceType is custom", 400);
  }

  const now = new Date().toISOString();
  const [created] = await db
    .insert(recurrenceSeries)
    .values({
      userId: session.user!.id!,
      title: (title as string).trim(),
      description: description as string | undefined,
      priority: (priority as typeof VALID_PRIORITIES[number]) ?? "medium",
      projectId: resolvedProjectId ?? null,
      recurrenceType,
      recurrenceBehavior: resolvedBehavior,
      recurrenceRule: resolvedRule,
      nextDueDate: nextDueDate as string,
      dueTime: dueTime as string | null | undefined,
      active: (active as boolean | undefined) ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return jsonResponse(created, 201);
});
