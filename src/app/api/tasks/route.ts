import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import {
  isTaskRecurrenceBehavior,
  isTaskRecurrenceType,
  parseTaskCustomRecurrenceRule,
  serializeTaskCustomRecurrenceRule,
  type TaskRecurrenceBehavior,
  type TaskRecurrenceType,
} from "@/lib/task-recurrence";
import { db } from "@/db";
import { tasks, projects } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

const VALID_STATUSES = ["open", "in_progress", "done"] as const;
const VALID_PRIORITIES = ["low", "medium", "high"] as const;

/** GET /api/tasks — list tasks for the current user, with optional filters */
export const GET = withAuth(async (req, session) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const projectId = url.searchParams.get("projectId");

  const conditions = [eq(tasks.userId, session.user!.id!), isNull(tasks.deletedAt)];

  if (status) {
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return errorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    }
    conditions.push(eq(tasks.status, status as typeof VALID_STATUSES[number]));
  }

  if (priority) {
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return errorResponse(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    conditions.push(eq(tasks.priority, priority as typeof VALID_PRIORITIES[number]));
  }

  if (projectId) {
    if (projectId === "none") {
      conditions.push(isNull(tasks.projectId));
    } else {
      conditions.push(eq(tasks.projectId, projectId));
    }
  }

  const where = and(...conditions);
  const pagination = parsePagination(url);

  if (pagination) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(where);

    const results = await db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(tasks.createdAt)
      .limit(pagination.limit)
      .offset((pagination.page - 1) * pagination.limit);

    return jsonResponse(paginatedResponse(results, count, pagination));
  }

  const results = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(tasks.createdAt);

  return jsonResponse(results);
});

/** POST /api/tasks — create a new task */
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
    status,
    priority,
    dueDate,
    projectId,
    recurrenceType,
    recurrenceBehavior,
    recurrenceRule,
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

  if (dueDate !== undefined && typeof dueDate !== "string") {
    return errorResponse("dueDate must be a string (ISO date)", 400);
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

  const resolvedRecurrenceType = (recurrenceType as TaskRecurrenceType | undefined) ?? "none";
  const resolvedRecurrenceBehavior = resolvedRecurrenceType === "none"
    ? "after_completion"
    : (recurrenceBehavior as TaskRecurrenceBehavior | undefined) ?? "after_completion";
  let resolvedRecurrenceRule: string | null = null;

  if (resolvedRecurrenceType === "custom") {
    const parsedRule = parseTaskCustomRecurrenceRule(recurrenceRule);
    if (!parsedRule) {
      return errorResponse(
        "recurrenceRule is required for custom recurrence and must include interval (1-365) and unit (day|week|month)",
        400,
      );
    }
    resolvedRecurrenceRule = serializeTaskCustomRecurrenceRule(parsedRule);
  } else if (recurrenceRule !== undefined && recurrenceRule !== null) {
    return errorResponse("recurrenceRule can only be set when recurrenceType is custom", 400);
  }

  if (
    resolvedRecurrenceType !== "none"
    && resolvedRecurrenceBehavior === "duplicate_on_schedule"
    && (!dueDate || typeof dueDate !== "string" || dueDate.trim().length === 0)
  ) {
    return errorResponse(
      "dueDate is required when recurrenceBehavior is duplicate_on_schedule",
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

  const now = new Date().toISOString();

  const [task] = await db
    .insert(tasks)
    .values({
      userId: session.user!.id!,
      projectId: resolvedProjectId ?? null,
      title: (title as string).trim(),
      description: description as string | undefined,
      status: (status as typeof VALID_STATUSES[number]) ?? "open",
      priority: (priority as typeof VALID_PRIORITIES[number]) ?? "medium",
      dueDate: dueDate as string | undefined,
      recurrenceType: resolvedRecurrenceType,
      recurrenceBehavior: resolvedRecurrenceBehavior,
      recurrenceRule: resolvedRecurrenceRule,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return jsonResponse(task, 201);
});
