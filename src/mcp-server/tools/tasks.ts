import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";
import {
  parseTaskCustomRecurrenceRule,
  serializeTaskCustomRecurrenceRule,
} from "@/lib/task-recurrence";

const TASK_STATUS = ["open", "in_progress", "done"] as const;
const TASK_PRIORITY = ["low", "medium", "high"] as const;
const TASK_RECURRENCE = ["none", "daily", "weekly", "monthly", "custom"] as const;
const TASK_RECURRENCE_BEHAVIOR = ["after_completion", "duplicate_on_schedule"] as const;
const TASK_CUSTOM_RECURRENCE_UNIT = ["day", "week", "month"] as const;

const customRecurrenceRuleSchema = z.object({
  interval: z.number().int().min(1).max(365),
  unit: z.enum(TASK_CUSTOM_RECURRENCE_UNIT),
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
        projectId: z.string().nullable().optional(),
        recurrenceType: z.enum(TASK_RECURRENCE).optional(),
        recurrenceBehavior: z.enum(TASK_RECURRENCE_BEHAVIOR).optional(),
        recurrenceRule: customRecurrenceRuleSchema.nullable().optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
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
      let recurrenceRule: string | null = null;
      if (recurrenceType === "custom") {
        const parsed = parseTaskCustomRecurrenceRule(args.recurrenceRule);
        if (!parsed) {
          throw new Error(
            "Custom recurrence requires recurrenceRule with interval (1-365) and unit (day|week|month).",
          );
        }
        recurrenceRule = serializeTaskCustomRecurrenceRule(parsed);
      } else if (args.recurrenceRule !== undefined && args.recurrenceRule !== null) {
        throw new Error("recurrenceRule can only be set when recurrenceType is custom.");
      }

      if (
        recurrenceType !== "none"
        && recurrenceBehavior === "duplicate_on_schedule"
        && (!args.dueDate || args.dueDate.trim().length === 0)
      ) {
        throw new Error("dueDate is required when recurrenceBehavior is duplicate_on_schedule.");
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
          dueDate: tasks.dueDate,
          recurrenceType: tasks.recurrenceType,
          recurrenceBehavior: tasks.recurrenceBehavior,
          recurrenceRule: tasks.recurrenceRule,
        })
        .from(tasks)
        .where(and(eq(tasks.id, args.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
        .limit(1);

      if (!existing) throw new Error("Task not found.");

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
      let nextRecurrenceRule = existing.recurrenceRule;
      const nextDueDate = args.dueDate !== undefined ? args.dueDate : existing.dueDate;

      if (hasRecurrenceRule) {
        if (args.recurrenceRule === null) {
          nextRecurrenceRule = null;
        } else {
          const parsed = parseTaskCustomRecurrenceRule(args.recurrenceRule);
          if (!parsed) {
            throw new Error("recurrenceRule must include interval (1-365) and unit (day|week|month).");
          }
          nextRecurrenceRule = serializeTaskCustomRecurrenceRule(parsed);
        }
      }

      if (nextRecurrenceType === "custom") {
        if (!nextRecurrenceRule) {
          throw new Error("recurrenceRule is required when recurrenceType is custom.");
        }
      } else {
        if (hasRecurrenceRule && args.recurrenceRule !== null && args.recurrenceRule !== undefined) {
          throw new Error("recurrenceRule can only be set when recurrenceType is custom.");
        }
        if (hasRecurrenceType) {
          nextRecurrenceRule = null;
        }
      }

      if (nextRecurrenceType === "none") {
        nextRecurrenceBehavior = "after_completion";
      } else if (nextRecurrenceBehavior === "duplicate_on_schedule" && !nextDueDate) {
        throw new Error("dueDate is required when recurrenceBehavior is duplicate_on_schedule.");
      }

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (args.title !== undefined) updates.title = args.title.trim();
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
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
      const [task] = await db
        .update(tasks)
        .set({ status: "done", updatedAt: new Date().toISOString() })
        .where(and(eq(tasks.id, args.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
        .returning();

      if (!task) throw new Error("Task not found.");
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
