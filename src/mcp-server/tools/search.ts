import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { dispatches, notes, projects, tasks } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";

function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function registerSearchTool(server: McpServer) {
  server.registerTool(
    "search",
    {
      description: "Search tasks, notes, projects, and dispatch summaries.",
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const pattern = `%${escapeLike(args.query.trim().toLowerCase())}%`;
      const limit = args.limit ?? 10;

      const [matchedTasks, matchedNotes, matchedProjects, matchedDispatches] = await Promise.all([
        db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              isNull(tasks.deletedAt),
              or(
                like(sql`LOWER(${tasks.title})`, pattern),
                like(sql`LOWER(${tasks.description})`, pattern),
              ),
            ),
          )
          .limit(limit),

        db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.userId, userId),
              isNull(notes.deletedAt),
              or(
                like(sql`LOWER(${notes.title})`, pattern),
                like(sql`LOWER(${notes.content})`, pattern),
              ),
            ),
          )
          .limit(limit),

        db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.userId, userId),
              isNull(projects.deletedAt),
              or(
                like(sql`LOWER(${projects.name})`, pattern),
                like(sql`LOWER(${projects.description})`, pattern),
              ),
            ),
          )
          .limit(limit),

        db
          .select()
          .from(dispatches)
          .where(
            and(
              eq(dispatches.userId, userId),
              like(sql`LOWER(${dispatches.summary})`, pattern),
            ),
          )
          .limit(limit),
      ]);

      return textResult("Search complete.", {
        tasks: matchedTasks,
        notes: matchedNotes,
        projects: matchedProjects,
        dispatches: matchedDispatches,
      });
    },
  );
}
