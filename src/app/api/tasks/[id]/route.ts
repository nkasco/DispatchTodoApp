import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import {
  isTaskRecurrenceType,
  parseTaskCustomRecurrenceRule,
  serializeTaskCustomRecurrenceRule,
  type TaskRecurrenceType,
} from "@/lib/task-recurrence";
import { db } from "@/db";
import { tasks, projects } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const VALID_STATUSES = ["open", "in_progress", "done"] as const;
const VALID_PRIORITIES = ["low", "medium", "high"] as const;

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/tasks/[id] — get a single task */
export const GET = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

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
    projectId,
    recurrenceType,
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

  if (projectId !== undefined && projectId !== null && typeof projectId !== "string") {
    return errorResponse("projectId must be a string or null", 400);
  }

  if (recurrenceType !== undefined && !isTaskRecurrenceType(recurrenceType)) {
    return errorResponse("recurrenceType must be one of: none, daily, weekly, monthly, custom", 400);
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
      recurrenceType: tasks.recurrenceType,
      recurrenceRule: tasks.recurrenceRule,
    })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user!.id!), isNull(tasks.deletedAt)));

  if (!existing) {
    return errorResponse("Task not found", 404);
  }

  const hasRecurrenceType = Object.prototype.hasOwnProperty.call(body, "recurrenceType");
  const hasRecurrenceRule = Object.prototype.hasOwnProperty.call(body, "recurrenceRule");

  const nextRecurrenceType = hasRecurrenceType
    ? recurrenceType as TaskRecurrenceType
    : existing.recurrenceType;
  let nextRecurrenceRule = existing.recurrenceRule;

  if (hasRecurrenceRule) {
    if (recurrenceRule === null) {
      nextRecurrenceRule = null;
    } else {
      const parsedRule = parseTaskCustomRecurrenceRule(recurrenceRule);
      if (!parsedRule) {
        return errorResponse(
          "recurrenceRule must include interval (1-365) and unit (day|week|month)",
          400,
        );
      }
      nextRecurrenceRule = serializeTaskCustomRecurrenceRule(parsedRule);
    }
  }

  if (nextRecurrenceType === "custom") {
    if (!nextRecurrenceRule) {
      return errorResponse("recurrenceRule is required when recurrenceType is custom", 400);
    }
  } else {
    if (hasRecurrenceRule && recurrenceRule !== null && recurrenceRule !== undefined) {
      return errorResponse("recurrenceRule can only be set when recurrenceType is custom", 400);
    }
    if (hasRecurrenceType) {
      nextRecurrenceRule = null;
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (title !== undefined) updates.title = (title as string).trim();
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (projectId !== undefined) updates.projectId = resolvedProjectId;
  if (hasRecurrenceType) updates.recurrenceType = nextRecurrenceType;
  if (hasRecurrenceRule || hasRecurrenceType) updates.recurrenceRule = nextRecurrenceRule;

  const [updated] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning();

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
