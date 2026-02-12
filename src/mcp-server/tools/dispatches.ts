import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { dispatches, dispatchTasks, tasks } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";

function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function getOrCreateDispatch(userId: string, date: string) {
  const [existing] = await db
    .select()
    .from(dispatches)
    .where(and(eq(dispatches.userId, userId), eq(dispatches.date, date)))
    .limit(1);
  if (existing) return existing;

  const now = new Date().toISOString();
  const [created] = await db
    .insert(dispatches)
    .values({
      userId,
      date,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created;
}

export function registerDispatchTools(server: McpServer) {
  server.registerTool(
    "get-today-dispatch",
    {
      description: "Get today's dispatch (auto-creates if missing).",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra);
      const dispatch = await getOrCreateDispatch(userId, todayISODate());
      return textResult("Today's dispatch loaded.", { dispatch });
    },
  );

  server.registerTool(
    "update-dispatch-summary",
    {
      description: "Update a dispatch summary.",
      inputSchema: {
        summary: z.string().max(10000),
        dispatchId: z.string().optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const dispatch = args.dispatchId
        ? await (async () => {
            const [row] = await db
              .select()
              .from(dispatches)
              .where(and(eq(dispatches.id, args.dispatchId!), eq(dispatches.userId, userId)))
              .limit(1);
            return row ?? null;
          })()
        : await getOrCreateDispatch(userId, todayISODate());

      if (!dispatch) throw new Error("Dispatch not found.");
      if (dispatch.finalized) throw new Error("Cannot update summary on a finalized dispatch.");

      const [updated] = await db
        .update(dispatches)
        .set({ summary: args.summary, updatedAt: new Date().toISOString() })
        .where(eq(dispatches.id, dispatch.id))
        .returning();

      return textResult("Dispatch summary updated.", { dispatch: updated });
    },
  );

  server.registerTool(
    "link-task-to-dispatch",
    {
      description: "Link a task to a dispatch.",
      inputSchema: {
        dispatchId: z.string().min(1),
        taskId: z.string().min(1),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);

      const [dispatch] = await db
        .select()
        .from(dispatches)
        .where(and(eq(dispatches.id, args.dispatchId), eq(dispatches.userId, userId)))
        .limit(1);
      if (!dispatch) throw new Error("Dispatch not found.");
      if (dispatch.finalized) throw new Error("Cannot modify a finalized dispatch.");

      const [task] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, args.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
        .limit(1);
      if (!task) throw new Error("Task not found.");

      const [existing] = await db
        .select({ dispatchId: dispatchTasks.dispatchId })
        .from(dispatchTasks)
        .where(and(eq(dispatchTasks.dispatchId, dispatch.id), eq(dispatchTasks.taskId, task.id)))
        .limit(1);
      if (!existing) {
        await db.insert(dispatchTasks).values({ dispatchId: dispatch.id, taskId: task.id });
      }

      return textResult("Task linked to dispatch.", { dispatchId: dispatch.id, taskId: task.id });
    },
  );

  server.registerTool(
    "unlink-task-from-dispatch",
    {
      description: "Unlink a task from a dispatch.",
      inputSchema: {
        dispatchId: z.string().min(1),
        taskId: z.string().min(1),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const [dispatch] = await db
        .select({ id: dispatches.id, finalized: dispatches.finalized })
        .from(dispatches)
        .where(and(eq(dispatches.id, args.dispatchId), eq(dispatches.userId, userId)))
        .limit(1);
      if (!dispatch) throw new Error("Dispatch not found.");
      if (dispatch.finalized) throw new Error("Cannot modify a finalized dispatch.");

      await db
        .delete(dispatchTasks)
        .where(and(eq(dispatchTasks.dispatchId, dispatch.id), eq(dispatchTasks.taskId, args.taskId)));

      return textResult("Task unlinked from dispatch.", { dispatchId: dispatch.id, taskId: args.taskId });
    },
  );

  server.registerTool(
    "complete-dispatch",
    {
      description: "Finalize a dispatch and roll unfinished tasks to the next day.",
      inputSchema: {
        dispatchId: z.string().min(1),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const [dispatch] = await db
        .select()
        .from(dispatches)
        .where(and(eq(dispatches.id, args.dispatchId), eq(dispatches.userId, userId)))
        .limit(1);
      if (!dispatch) throw new Error("Dispatch not found.");
      if (dispatch.finalized) throw new Error("Dispatch is already finalized.");

      const linked = await db
        .select({
          taskId: tasks.id,
          status: tasks.status,
        })
        .from(dispatchTasks)
        .innerJoin(tasks, eq(dispatchTasks.taskId, tasks.id))
        .where(and(eq(dispatchTasks.dispatchId, dispatch.id), isNull(tasks.deletedAt)));

      const unfinishedTaskIds = linked.filter((row) => row.status !== "done").map((row) => row.taskId);
      const now = new Date().toISOString();

      const [finalized] = await db
        .update(dispatches)
        .set({ finalized: true, updatedAt: now })
        .where(eq(dispatches.id, dispatch.id))
        .returning();

      let nextDispatchId: string | null = null;
      if (unfinishedTaskIds.length > 0) {
        const next = await getOrCreateDispatch(userId, nextDate(dispatch.date));
        nextDispatchId = next.id;

        for (const taskId of unfinishedTaskIds) {
          const [existing] = await db
            .select({ dispatchId: dispatchTasks.dispatchId })
            .from(dispatchTasks)
            .where(and(eq(dispatchTasks.dispatchId, next.id), eq(dispatchTasks.taskId, taskId)))
            .limit(1);
          if (!existing) {
            await db.insert(dispatchTasks).values({ dispatchId: next.id, taskId });
          }
        }
      }

      return textResult("Dispatch completed.", {
        dispatch: finalized,
        rolledOver: unfinishedTaskIds.length,
        nextDispatchId,
      });
    },
  );
}
