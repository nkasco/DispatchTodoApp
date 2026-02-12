import { and, desc, eq, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";

const PROJECT_STATUS = ["active", "paused", "completed"] as const;
const PROJECT_COLORS = ["blue", "emerald", "amber", "rose", "violet", "slate"] as const;

function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function registerProjectTools(server: McpServer) {
  server.registerTool(
    "list-projects",
    {
      description: "List projects for the current user.",
      inputSchema: {
        status: z.enum(PROJECT_STATUS).optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const filters = [eq(projects.userId, userId), isNull(projects.deletedAt)];
      if (args.status) filters.push(eq(projects.status, args.status));
      if (args.search?.trim()) {
        const pattern = `%${escapeLike(args.search.trim().toLowerCase())}%`;
        filters.push(
          like(sql`LOWER(${projects.name})`, pattern),
        );
      }

      const rows = await db
        .select()
        .from(projects)
        .where(and(...filters))
        .orderBy(desc(projects.updatedAt))
        .limit(args.limit ?? 30);

      return textResult(`Found ${rows.length} project(s).`, { projects: rows });
    },
  );

  server.registerTool(
    "create-project",
    {
      description: "Create a project.",
      inputSchema: {
        name: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        status: z.enum(PROJECT_STATUS).optional(),
        color: z.enum(PROJECT_COLORS).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const now = new Date().toISOString();
      const [project] = await db
        .insert(projects)
        .values({
          userId,
          name: args.name.trim(),
          description: args.description,
          status: args.status ?? "active",
          color: args.color ?? "blue",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return textResult(`Project created: ${project.name}`, { project });
    },
  );

  server.registerTool(
    "update-project",
    {
      description: "Update a project.",
      inputSchema: {
        id: z.string().min(1),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        status: z.enum(PROJECT_STATUS).optional(),
        color: z.enum(PROJECT_COLORS).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const [existing] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, args.id), eq(projects.userId, userId), isNull(projects.deletedAt)))
        .limit(1);

      if (!existing) throw new Error("Project not found.");

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (args.name !== undefined) updates.name = args.name.trim();
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.color !== undefined) updates.color = args.color;

      const [project] = await db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, args.id))
        .returning();

      return textResult(`Project updated: ${project.name}`, { project });
    },
  );

  server.registerTool(
    "get-project-tasks",
    {
      description: "List active tasks within a project.",
      inputSchema: {
        projectId: z.string().optional(),
        projectName: z.string().optional(),
        status: z.enum(["open", "in_progress", "done"] as const).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const projectName = args.projectName?.trim();
      if (!args.projectId && !projectName) {
        throw new Error("Provide projectId or projectName.");
      }

      const [project] = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(
          and(
            eq(projects.userId, userId),
            isNull(projects.deletedAt),
            args.projectId
              ? eq(projects.id, args.projectId)
              : like(sql`LOWER(${projects.name})`, `%${escapeLike((projectName ?? "").toLowerCase())}%`),
          ),
        )
        .orderBy(desc(projects.updatedAt))
        .limit(1);
      if (!project) throw new Error("Project not found.");

      const filters = [
        eq(tasks.userId, userId),
        eq(tasks.projectId, project.id),
        isNull(tasks.deletedAt),
      ];
      if (args.status) filters.push(eq(tasks.status, args.status));

      const rows = await db
        .select()
        .from(tasks)
        .where(and(...filters))
        .orderBy(desc(tasks.updatedAt))
        .limit(args.limit ?? 50);

      return textResult(`Found ${rows.length} task(s) in project "${project.name}".`, {
        project,
        tasks: rows,
      });
    },
  );
}
