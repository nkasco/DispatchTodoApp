import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { projects, recurrenceSeries, tasks } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";
import {
  doesIsoDateMatchTaskRecurrenceRule,
  getTaskRecurrenceDateConstraintMessage,
  getNextTaskRecurrenceDate,
  validateTaskRecurrenceRule,
} from "@/lib/task-recurrence";
import { getTodayIsoDate } from "@/lib/task-recurrence-rollover";
import { syncRecurrenceSeriesForUser } from "@/lib/recurrence-series-sync";
import { isValidDueTime } from "@/lib/due-time";

const TASK_STATUS = ["open", "in_progress", "done"] as const;
const TASK_PRIORITY = ["low", "medium", "high"] as const;
const TASK_RECURRENCE = ["none", "daily", "weekly", "monthly", "custom"] as const;
const TASK_RECURRENCE_BEHAVIOR = ["after_completion", "duplicate_on_schedule"] as const;
const TASK_CUSTOM_RECURRENCE_UNIT = ["day", "week", "month"] as const;
const TASK_RECURRENCE_WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const TASK_RECURRENCE_MONTHLY_ORDINAL = [1, 2, 3, 4, -1] as const;

const customRecurrenceRuleSchema = z.object({
  interval: z.number().int().min(1).max(365),
  unit: z.enum(TASK_CUSTOM_RECURRENCE_UNIT),
  weekdays: z.array(z.enum(TASK_RECURRENCE_WEEKDAY)).min(1).optional(),
  monthlyPattern: z.object({
    kind: z.literal("nth_weekday"),
    ordinal: z.union(TASK_RECURRENCE_MONTHLY_ORDINAL.map((ordinal) => z.literal(ordinal)) as [
      z.ZodLiteral<1>,
      z.ZodLiteral<2>,
      z.ZodLiteral<3>,
      z.ZodLiteral<4>,
      z.ZodLiteral<-1>,
    ]),
    weekday: z.enum(TASK_RECURRENCE_WEEKDAY),
  }).optional(),
});

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "list-tasks",
    {
      description: "List tasks for the current user, optionally filtered by status/priority/project.",
      inputSchema: {
        status: z.enum(TASK_STATUS).optional(),
        priority: z.enum(TASK_PRIORITY).optional(),
        projectId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const todayIsoDate = getTodayIsoDate(null);
      await syncRecurrenceSeriesForUser(userId, todayIsoDate);
      const filters = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];
      if (args.status) filters.push(eq(tasks.status, args.status));
      if (args.priority) filters.push(eq(tasks.priority, args.priority));
      if (args.projectId) filters.push(eq(tasks.projectId, args.projectId));

      const rows = await db
        .select()
        .from(tasks)
        .where(and(...filters))
        .orderBy(desc(tasks.updatedAt))
        .limit(args.limit ?? 30);

      return textResult(`Found ${rows.length} task(s).`, { tasks: rows });
    },
  );

  server.registerTool(
    "create-task",
    {
      description: "Create a new task.",
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().max(5000).optional(),
        status: z.enum(TASK_STATUS).optional(),
        priority: z.enum(TASK_PRIORITY).optional(),
        dueDate: z.string().optional(),
        dueTime: z.string().optional(),
        projectId: z.string().nullable().optional(),
        recurrenceType: z.enum(TASK_RECURRENCE).optional(),
        recurrenceBehavior: z.enum(TASK_RECURRENCE_BEHAVIOR).optional(),
        recurrenceRule: customRecurrenceRuleSchema.nullable().optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      if (args.dueTime !== undefined && !isValidDueTime(args.dueTime)) {
        throw new Error("dueTime must be a valid 24-hour time in HH:MM format.");
      }
      if (args.projectId) {
        const [project] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, args.projectId),
              eq(projects.userId, userId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1);
        if (!project) throw new Error("projectId does not match an active project for this user.");
      }

      const recurrenceType = args.recurrenceType ?? "none";
      const recurrenceBehavior = recurrenceType === "none"
        ? "after_completion"
        : args.recurrenceBehavior ?? "after_completion";
      const recurrenceValidation = validateTaskRecurrenceRule(recurrenceType, args.recurrenceRule);
      if (recurrenceValidation.error) {
        throw new Error(recurrenceValidation.error);
      }
      const recurrenceRule = recurrenceValidation.storedRule;

      if (
        recurrenceType !== "none"
        && recurrenceBehavior === "duplicate_on_schedule"
        && (!args.dueDate || args.dueDate.trim().length === 0)
      ) {
        throw new Error("dueDate is required when recurrenceBehavior is duplicate_on_schedule.");
      }

      if (args.dueTime !== undefined && (!args.dueDate || args.dueDate.trim().length === 0)) {
        throw new Error("dueDate is required when dueTime is set.");
      }

      if (
        recurrenceType !== "none"
        && args.dueDate
        && !doesIsoDateMatchTaskRecurrenceRule(args.dueDate, recurrenceType, recurrenceValidation.parsedRule)
      ) {
        throw new Error(
          getTaskRecurrenceDateConstraintMessage("dueDate", recurrenceType, recurrenceValidation.parsedRule)
            ?? "dueDate does not match the recurrence rule.",
        );
      }

      const now = new Date().toISOString();
      const [task] = await db
        .insert(tasks)
        .values({
          userId,
          title: args.title.trim(),
          description: args.description,
          status: args.status ?? "open",
          priority: args.priority ?? "medium",
          dueDate: args.dueDate,
          dueTime: args.dueTime,
          projectId: args.projectId ?? null,
          recurrenceType,
          recurrenceBehavior,
          recurrenceRule,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return textResult(`Task created: ${task.title}`, { task });
    },
  );

  server.registerTool(
    "update-task",
    {
      description: "Update an existing task.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(5000).optional(),
        status: z.enum(TASK_STATUS).optional(),
        priority: z.enum(TASK_PRIORITY).optional(),
        dueDate: z.string().nullable().optional(),
        dueTime: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        recurrenceType: z.enum(TASK_RECURRENCE).optional(),
        recurrenceBehavior: z.enum(TASK_RECURRENCE_BEHAVIOR).optional(),
        recurrenceRule: customRecurrenceRuleSchema.nullable().optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
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
        .where(and(eq(tasks.id, args.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
        .limit(1);

      if (!existing) throw new Error("Task not found.");

      if (args.dueTime !== undefined && args.dueTime !== null && !isValidDueTime(args.dueTime)) {
        throw new Error("dueTime must be a valid 24-hour time in HH:MM format.");
      }

      if (args.projectId) {
        const [project] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, args.projectId),
              eq(projects.userId, userId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1);
        if (!project) throw new Error("projectId does not match an active project for this user.");
      }

      const hasRecurrenceType = Object.prototype.hasOwnProperty.call(args, "recurrenceType");
      const hasRecurrenceBehavior = Object.prototype.hasOwnProperty.call(args, "recurrenceBehavior");
      const hasRecurrenceRule = Object.prototype.hasOwnProperty.call(args, "recurrenceRule");
      const nextRecurrenceType = hasRecurrenceType
        ? args.recurrenceType!
        : existing.recurrenceType;
      let nextRecurrenceBehavior = hasRecurrenceBehavior
        ? args.recurrenceBehavior!
        : existing.recurrenceBehavior;
      const nextDueDate = args.dueDate !== undefined ? args.dueDate : existing.dueDate;
      const nextDueTime = args.dueTime !== undefined ? args.dueTime : existing.dueTime;
      const rawNextRecurrenceRule = hasRecurrenceRule
        ? args.recurrenceRule
        : (hasRecurrenceType && args.recurrenceType !== existing.recurrenceType ? null : existing.recurrenceRule);
      const recurrenceValidation = validateTaskRecurrenceRule(nextRecurrenceType, rawNextRecurrenceRule);
      if (recurrenceValidation.error) {
        throw new Error(recurrenceValidation.error);
      }
      const nextRecurrenceRule = recurrenceValidation.storedRule;

      if (nextRecurrenceType === "none") {
        nextRecurrenceBehavior = "after_completion";
      } else if (nextRecurrenceBehavior === "duplicate_on_schedule" && !nextDueDate) {
        throw new Error("dueDate is required when recurrenceBehavior is duplicate_on_schedule.");
      }

      if (nextDueTime && !nextDueDate) {
        throw new Error("dueDate is required when dueTime is set.");
      }

      if (
        nextRecurrenceType !== "none"
        && nextDueDate
        && !doesIsoDateMatchTaskRecurrenceRule(nextDueDate, nextRecurrenceType, recurrenceValidation.parsedRule)
      ) {
        throw new Error(
          getTaskRecurrenceDateConstraintMessage("dueDate", nextRecurrenceType, recurrenceValidation.parsedRule)
            ?? "dueDate does not match the recurrence rule.",
        );
      }

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (args.title !== undefined) updates.title = args.title.trim();
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
      if (args.dueTime !== undefined) updates.dueTime = args.dueTime;
      if (args.projectId !== undefined) updates.projectId = args.projectId;
      if (hasRecurrenceType) updates.recurrenceType = nextRecurrenceType;
      if (hasRecurrenceBehavior || hasRecurrenceType) {
        updates.recurrenceBehavior = nextRecurrenceBehavior;
      }
      if (hasRecurrenceRule || hasRecurrenceType) updates.recurrenceRule = nextRecurrenceRule;

      const [updated] = await db
        .update(tasks)
        .set(updates)
        .where(eq(tasks.id, args.id))
        .returning();

      if (
        args.status === "done"
        && existing.status !== "done"
        && existing.recurrenceSeriesId
        && !existing.recurrenceProcessedAt
      ) {
        const todayIsoDate = getTodayIsoDate(null);
        const [series] = await db
          .select({
            id: recurrenceSeries.id,
            recurrenceType: recurrenceSeries.recurrenceType,
            recurrenceBehavior: recurrenceSeries.recurrenceBehavior,
            recurrenceRule: recurrenceSeries.recurrenceRule,
          })
          .from(recurrenceSeries)
          .where(
            and(
              eq(recurrenceSeries.id, existing.recurrenceSeriesId),
              eq(recurrenceSeries.userId, userId),
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
              .where(and(eq(tasks.id, args.id), isNull(tasks.recurrenceProcessedAt)))
              .returning({ id: tasks.id });
            if (!lock) {
              return textResult(`Task updated: ${updated.title}`, { task: updated });
            }

            await db
              .update(recurrenceSeries)
              .set({ nextDueDate, updatedAt: processedAt })
              .where(eq(recurrenceSeries.id, series.id));
          }
        }
      }

      return textResult(`Task updated: ${updated.title}`, { task: updated });
    },
  );

  server.registerTool(
    "complete-task",
    {
      description: "Mark a task as done.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
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
          recurrenceType: tasks.recurrenceType,
          recurrenceBehavior: tasks.recurrenceBehavior,
          recurrenceRule: tasks.recurrenceRule,
          recurrenceSeriesId: tasks.recurrenceSeriesId,
          recurrenceProcessedAt: tasks.recurrenceProcessedAt,
        })
        .from(tasks)
        .where(and(eq(tasks.id, args.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
        .limit(1);

      if (!existing) throw new Error("Task not found.");

      const [task] = await db
        .update(tasks)
        .set({ status: "done", updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, args.id))
        .returning();

      if (existing.status !== "done" && existing.recurrenceSeriesId && !existing.recurrenceProcessedAt) {
        const todayIsoDate = getTodayIsoDate(null);
        const [series] = await db
          .select({
            id: recurrenceSeries.id,
            recurrenceType: recurrenceSeries.recurrenceType,
            recurrenceBehavior: recurrenceSeries.recurrenceBehavior,
            recurrenceRule: recurrenceSeries.recurrenceRule,
          })
          .from(recurrenceSeries)
          .where(
            and(
              eq(recurrenceSeries.id, existing.recurrenceSeriesId),
              eq(recurrenceSeries.userId, userId),
              isNull(recurrenceSeries.deletedAt),
              eq(recurrenceSeries.active, true),
            ),
          )
          .limit(1);

        if (series?.recurrenceBehavior === "after_completion") {
          const anchorIsoDate = task.dueDate && task.dueDate > todayIsoDate
            ? task.dueDate
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
              .where(and(eq(tasks.id, args.id), isNull(tasks.recurrenceProcessedAt)))
              .returning({ id: tasks.id });
            if (!lock) {
              return textResult(`Task completed: ${task.title}`, { task });
            }

            await db
              .update(recurrenceSeries)
              .set({ nextDueDate, updatedAt: processedAt })
              .where(eq(recurrenceSeries.id, series.id));
          }
        }
      }

      return textResult(`Task completed: ${task.title}`, { task });
    },
  );

  server.registerTool(
    "delete-task",
    {
      description: "Soft-delete a task.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const now = new Date().toISOString();
      const [task] = await db
        .update(tasks)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(tasks.id, args.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
        .returning();

      if (!task) throw new Error("Task not found.");
      return textResult(`Task deleted: ${task.title}`, { taskId: task.id });
    },
  );
}
