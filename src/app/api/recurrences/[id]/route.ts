import { and, eq, isNull } from "drizzle-orm";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { db } from "@/db";
import { projects, recurrenceSeries } from "@/db/schema";
import {
  doesIsoDateMatchTaskRecurrenceRule,
  getTaskRecurrenceDateConstraintMessage,
  isTaskRecurrenceBehavior,
  type TaskRecurrenceBehavior,
  type TaskRecurrenceType,
  validateTaskRecurrenceRule,
} from "@/lib/task-recurrence";
import { isValidDueTime } from "@/lib/due-time";

const VALID_PRIORITIES = ["low", "medium", "high"] as const;
const VALID_SERIES_TYPES = ["daily", "weekly", "monthly", "custom"] as const;

type RouteContext = { params: Promise<{ id: string }> };

function isSeriesType(value: unknown): value is Exclude<TaskRecurrenceType, "none"> {
  return typeof value === "string" && VALID_SERIES_TYPES.includes(value as typeof VALID_SERIES_TYPES[number]);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** PUT /api/recurrences/[id] — update recurrence series */
export const PUT = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
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

  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
    return errorResponse("title must be a non-empty string", 400);
  }
  if (title && (title as string).length > 500) {
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
  if (recurrenceType !== undefined && !isSeriesType(recurrenceType)) {
    return errorResponse("recurrenceType must be one of: daily, weekly, monthly, custom", 400);
  }
  if (recurrenceBehavior !== undefined && !isTaskRecurrenceBehavior(recurrenceBehavior)) {
    return errorResponse(
      "recurrenceBehavior must be one of: after_completion, duplicate_on_schedule",
      400,
    );
  }
  if (nextDueDate !== undefined && typeof nextDueDate !== "string") {
    return errorResponse("nextDueDate must be an ISO date string", 400);
  }
  if (typeof nextDueDate === "string" && !isIsoDate(nextDueDate)) {
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

  const [existing] = await db
    .select()
    .from(recurrenceSeries)
    .where(and(eq(recurrenceSeries.id, id), eq(recurrenceSeries.userId, session.user!.id!), isNull(recurrenceSeries.deletedAt)));

  if (!existing) {
    return errorResponse("Recurrence series not found", 404);
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

  const hasRecurrenceType = Object.prototype.hasOwnProperty.call(body, "recurrenceType");
  const hasRecurrenceRule = Object.prototype.hasOwnProperty.call(body, "recurrenceRule");
  const nextType = hasRecurrenceType
    ? recurrenceType as Exclude<TaskRecurrenceType, "none">
    : existing.recurrenceType;
  const rawNextRule = hasRecurrenceRule
    ? recurrenceRule
    : (hasRecurrenceType && recurrenceType !== existing.recurrenceType ? null : existing.recurrenceRule);
  const recurrenceValidation = validateTaskRecurrenceRule(nextType, rawNextRule);
  if (recurrenceValidation.error) {
    return errorResponse(recurrenceValidation.error, 400);
  }
  const nextRule = recurrenceValidation.storedRule;

  const nextNextDueDate = nextDueDate !== undefined ? nextDueDate as string : existing.nextDueDate;
  if (!doesIsoDateMatchTaskRecurrenceRule(nextNextDueDate, nextType, recurrenceValidation.parsedRule)) {
    return errorResponse(
      getTaskRecurrenceDateConstraintMessage("nextDueDate", nextType, recurrenceValidation.parsedRule)
        ?? "nextDueDate does not match the recurrence rule",
      400,
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (title !== undefined) updates.title = (title as string).trim();
  if (description !== undefined) updates.description = description;
  if (priority !== undefined) updates.priority = priority;
  if (projectId !== undefined) updates.projectId = resolvedProjectId;
  if (hasRecurrenceType) updates.recurrenceType = nextType;
  if (recurrenceBehavior !== undefined) updates.recurrenceBehavior = recurrenceBehavior as TaskRecurrenceBehavior;
  if (hasRecurrenceRule || hasRecurrenceType) updates.recurrenceRule = nextRule;
  if (nextDueDate !== undefined) updates.nextDueDate = nextDueDate;
  if (dueTime !== undefined) updates.dueTime = dueTime;
  if (active !== undefined) updates.active = active;

  const [updated] = await db
    .update(recurrenceSeries)
    .set(updates)
    .where(eq(recurrenceSeries.id, id))
    .returning();

  return jsonResponse(updated);
});

/** DELETE /api/recurrences/[id] — soft-delete recurrence series */
export const DELETE = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  const [existing] = await db
    .select({ id: recurrenceSeries.id, deletedAt: recurrenceSeries.deletedAt })
    .from(recurrenceSeries)
    .where(and(eq(recurrenceSeries.id, id), eq(recurrenceSeries.userId, session.user!.id!)));

  if (!existing || existing.deletedAt) {
    return errorResponse("Recurrence series not found", 404);
  }

  await db
    .update(recurrenceSeries)
    .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(recurrenceSeries.id, id));

  return jsonResponse({ deleted: true });
});
