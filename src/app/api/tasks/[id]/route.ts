import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import {
  doesIsoDateMatchTaskRecurrenceRule,
  getNextTaskRecurrenceDate,
  getTaskRecurrenceDateConstraintMessage,
  isTaskRecurrenceBehavior,
  isTaskRecurrenceType,
  type TaskRecurrenceBehavior,
  type TaskRecurrenceType,
  validateTaskRecurrenceRule,
} from "@/lib/task-recurrence";
import { getTodayIsoDate } from "@/lib/task-recurrence-rollover";
import { syncRecurrenceSeriesForUser } from "@/lib/recurrence-series-sync";
import { isValidDueTime } from "@/lib/due-time";
import { db } from "@/db";
import { tasks, projects, recurrenceSeries } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const VALID_STATUSES = ["open", "in_progress", "done"] as const;
const VALID_PRIORITIES = ["low", "medium", "high"] as const;

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/tasks/[id] — get a single task */
export const GET = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const todayIsoDate = getTodayIsoDate(session.user.timeZone ?? null);

  await syncRecurrenceSeriesForUser(session.user!.id!, todayIsoDate);

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user!.id!), isNull(tasks.deletedAt)));

  if (!task) {
    return errorResponse("Task not found", 404);
  }

  return jsonResponse(task);
});

/** PUT /api/tasks/[id] — update a task */
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
    status,
    priority,
    dueDate,
    dueTime,
    projectId,
    recurrenceType,
    recurrenceBehavior,
    recurrenceRule,
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

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return errorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    }
  }

  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return errorResponse(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
  }

  if (dueDate !== undefined && dueDate !== null && typeof dueDate !== "string") {
    return errorResponse("dueDate must be a string (ISO date) or null", 400);
  }

  if (dueTime !== undefined && dueTime !== null && typeof dueTime !== "string") {
    return errorResponse("dueTime must be a string (HH:MM) or null", 400);
  }

  if (typeof dueTime === "string" && !isValidDueTime(dueTime)) {
    return errorResponse("dueTime must be a valid 24-hour time in HH:MM format", 400);
  }

  if (projectId !== undefined && projectId !== null && typeof projectId !== "string") {
    return errorResponse("projectId must be a string or null", 400);
  }

  if (recurrenceType !== undefined && !isTaskRecurrenceType(recurrenceType)) {
    return errorResponse("recurrenceType must be one of: none, daily, weekly, monthly, custom", 400);
  }

  if (recurrenceBehavior !== undefined && !isTaskRecurrenceBehavior(recurrenceBehavior)) {
    return errorResponse(
      "recurrenceBehavior must be one of: after_completion, duplicate_on_schedule",
      400,
    );
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

  // Check task exists, belongs to user, and is not soft-deleted
  const [existing] = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      projectId: tasks.projectId,
      dueDate: tasks.dueDate,
      dueTime: tasks.dueTime,
      recurrenceType: tasks.recurrenceType,
      recurrenceBehavior: tasks.recurrenceBehavior,
      recurrenceRule: tasks.recurrenceRule,
      recurrenceSeriesId: tasks.recurrenceSeriesId,
      recurrenceProcessedAt: tasks.recurrenceProcessedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user!.id!), isNull(tasks.deletedAt)));

  if (!existing) {
    return errorResponse("Task not found", 404);
  }

  const hasRecurrenceType = Object.prototype.hasOwnProperty.call(body, "recurrenceType");
  const hasRecurrenceBehavior = Object.prototype.hasOwnProperty.call(body, "recurrenceBehavior");
  const hasRecurrenceRule = Object.prototype.hasOwnProperty.call(body, "recurrenceRule");

  const nextRecurrenceType = hasRecurrenceType
    ? recurrenceType as TaskRecurrenceType
    : existing.recurrenceType;
  let nextRecurrenceBehavior = hasRecurrenceBehavior
    ? recurrenceBehavior as TaskRecurrenceBehavior
    : existing.recurrenceBehavior;
  let nextRecurrenceRule = existing.recurrenceRule;
  const isDueDateBeingCleared = dueDate !== undefined
    && (dueDate === null || (typeof dueDate === "string" && dueDate.trim().length === 0));
  const nextDueDate = dueDate !== undefined ? dueDate : existing.dueDate;
  const nextDueTime = dueTime !== undefined
    ? dueTime
    : (isDueDateBeingCleared ? null : existing.dueTime);
  const rawNextRecurrenceRule = hasRecurrenceRule
    ? recurrenceRule
    : (hasRecurrenceType && recurrenceType !== existing.recurrenceType ? null : existing.recurrenceRule);
  const recurrenceValidation = validateTaskRecurrenceRule(nextRecurrenceType, rawNextRecurrenceRule);
  if (recurrenceValidation.error) {
    return errorResponse(recurrenceValidation.error, 400);
  }
  nextRecurrenceRule = recurrenceValidation.storedRule;

  if (nextRecurrenceType === "none") {
    nextRecurrenceBehavior = "after_completion";
  } else if (
    nextRecurrenceBehavior === "duplicate_on_schedule"
    && (!nextDueDate || typeof nextDueDate !== "string" || nextDueDate.trim().length === 0)
  ) {
    return errorResponse(
      "dueDate is required when recurrenceBehavior is duplicate_on_schedule",
      400,
    );
  }

  if (typeof nextDueTime === "string" && (!nextDueDate || typeof nextDueDate !== "string" || nextDueDate.trim().length === 0)) {
    return errorResponse("dueDate is required when dueTime is set", 400);
  }

  if (
    nextRecurrenceType !== "none"
    && typeof nextDueDate === "string"
    && nextDueDate.trim().length > 0
    && !doesIsoDateMatchTaskRecurrenceRule(nextDueDate, nextRecurrenceType, recurrenceValidation.parsedRule)
  ) {
    return errorResponse(
      getTaskRecurrenceDateConstraintMessage("dueDate", nextRecurrenceType, recurrenceValidation.parsedRule)
        ?? "dueDate does not match the recurrence rule",
      400,
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (title !== undefined) updates.title = (title as string).trim();
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (dueTime !== undefined || isDueDateBeingCleared) updates.dueTime = nextDueTime;
  if (projectId !== undefined) updates.projectId = resolvedProjectId;
  if (hasRecurrenceType) updates.recurrenceType = nextRecurrenceType;
  if (hasRecurrenceBehavior || hasRecurrenceType) updates.recurrenceBehavior = nextRecurrenceBehavior;
  if (hasRecurrenceRule || hasRecurrenceType) updates.recurrenceRule = nextRecurrenceRule;

  const [updated] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning();

  if (
    status === "done"
    && existing.status !== "done"
    && existing.recurrenceSeriesId
    && !existing.recurrenceProcessedAt
  ) {
    const todayIsoDate = getTodayIsoDate(session.user.timeZone ?? null);
    const [series] = await db
      .select({
        id: recurrenceSeries.id,
        nextDueDate: recurrenceSeries.nextDueDate,
        recurrenceType: recurrenceSeries.recurrenceType,
        recurrenceBehavior: recurrenceSeries.recurrenceBehavior,
        recurrenceRule: recurrenceSeries.recurrenceRule,
      })
      .from(recurrenceSeries)
      .where(
        and(
          eq(recurrenceSeries.id, existing.recurrenceSeriesId),
          eq(recurrenceSeries.userId, session.user!.id!),
          isNull(recurrenceSeries.deletedAt),
          eq(recurrenceSeries.active, true),
        ),
      )
      .limit(1);

    if (series?.recurrenceBehavior === "after_completion") {
      const anchorIsoDate = updated.dueDate && updated.dueDate > todayIsoDate
        ? updated.dueDate
        : todayIsoDate;
      const nextDueDate = getNextTaskRecurrenceDate(
        anchorIsoDate,
        series.recurrenceType,
        series.recurrenceRule,
      );
      if (nextDueDate) {
        const processedAt = new Date().toISOString();
        const [lock] = await db
          .update(tasks)
          .set({ recurrenceProcessedAt: processedAt, updatedAt: processedAt })
          .where(and(eq(tasks.id, id), isNull(tasks.recurrenceProcessedAt)))
          .returning({ id: tasks.id });
        if (!lock) {
          return jsonResponse(updated);
        }

        await db
          .update(recurrenceSeries)
          .set({ nextDueDate, updatedAt: processedAt })
          .where(eq(recurrenceSeries.id, series.id));
      }
    }
  }

  return jsonResponse(updated);
});

/** DELETE /api/tasks/[id] — soft-delete a task (moves to recycle bin) */
export const DELETE = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  const [existing] = await db
    .select({ id: tasks.id, deletedAt: tasks.deletedAt })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user!.id!)));

  if (!existing || existing.deletedAt) {
    return errorResponse("Task not found", 404);
  }

  await db
    .update(tasks)
    .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, id));

  return jsonResponse({ deleted: true });
});
