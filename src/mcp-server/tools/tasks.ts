import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";

const TASK_STATUS = ["open", "in_progress", "done"] as const;
const TASK_PRIORITY = ["low", "medium", "high"] as const;

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
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const [existing] = await db
        .select({ id: tasks.id })
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

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (args.title !== undefined) updates.title = args.title.trim();
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
      if (args.projectId !== undefined) updates.projectId = args.projectId;

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
