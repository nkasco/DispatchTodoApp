import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { db } from "@/db";
import { dispatches, dispatchTasks, tasks } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/dispatches/[id]/tasks — list tasks linked to a dispatch */
export const GET = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  // Verify dispatch belongs to user
  const [dispatch] = await db
    .select({ id: dispatches.id })
    .from(dispatches)
    .where(and(eq(dispatches.id, id), eq(dispatches.userId, session.user!.id!)));

  if (!dispatch) {
    return errorResponse("Dispatch not found", 404);
  }

  // Get linked tasks via join
  const linked = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      recurrenceType: tasks.recurrenceType,
      recurrenceBehavior: tasks.recurrenceBehavior,
      recurrenceRule: tasks.recurrenceRule,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(dispatchTasks)
    .innerJoin(tasks, eq(dispatchTasks.taskId, tasks.id))
    .where(and(eq(dispatchTasks.dispatchId, id), isNull(tasks.deletedAt)));

  return jsonResponse(linked);
});

/** POST /api/dispatches/[id]/tasks — link a task to a dispatch */
export const POST = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { taskId } = body as Record<string, unknown>;

  if (!taskId || typeof taskId !== "string") {
    return errorResponse("taskId is required and must be a string", 400);
  }

  // Verify dispatch belongs to user
  const [dispatch] = await db
    .select({ id: dispatches.id, finalized: dispatches.finalized })
    .from(dispatches)
    .where(and(eq(dispatches.id, id), eq(dispatches.userId, session.user!.id!)));

  if (!dispatch) {
    return errorResponse("Dispatch not found", 404);
  }

  if (dispatch.finalized) {
    return errorResponse("Cannot modify a finalized dispatch", 400);
  }

  // Verify task belongs to user
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user!.id!)));

  if (!task) {
    return errorResponse("Task not found", 404);
  }

  // Check if already linked
  const [existingLink] = await db
    .select()
    .from(dispatchTasks)
    .where(and(eq(dispatchTasks.dispatchId, id), eq(dispatchTasks.taskId, taskId)));

  if (existingLink) {
    return errorResponse("Task is already linked to this dispatch", 409);
  }

  await db.insert(dispatchTasks).values({ dispatchId: id, taskId });

  return jsonResponse({ linked: true }, 201);
});

/** DELETE /api/dispatches/[id]/tasks — unlink a task from a dispatch */
export const DELETE = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { taskId } = body as Record<string, unknown>;

  if (!taskId || typeof taskId !== "string") {
    return errorResponse("taskId is required and must be a string", 400);
  }

  // Verify dispatch belongs to user
  const [dispatch] = await db
    .select({ id: dispatches.id, finalized: dispatches.finalized })
    .from(dispatches)
    .where(and(eq(dispatches.id, id), eq(dispatches.userId, session.user!.id!)));

  if (!dispatch) {
    return errorResponse("Dispatch not found", 404);
  }

  if (dispatch.finalized) {
    return errorResponse("Cannot modify a finalized dispatch", 400);
  }

  // Check link exists
  const [link] = await db
    .select()
    .from(dispatchTasks)
    .where(and(eq(dispatchTasks.dispatchId, id), eq(dispatchTasks.taskId, taskId)));

  if (!link) {
    return errorResponse("Task is not linked to this dispatch", 404);
  }

  await db
    .delete(dispatchTasks)
    .where(and(eq(dispatchTasks.dispatchId, id), eq(dispatchTasks.taskId, taskId)));

  return jsonResponse({ unlinked: true });
});
