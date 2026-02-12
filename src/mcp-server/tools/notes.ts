import { and, desc, eq, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { requireUserId, textResult } from "@/mcp-server/tools/context";

function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function registerNoteTools(server: McpServer) {
  server.registerTool(
    "list-notes",
    {
      description: "List notes for the current user, optionally filtered by title search.",
      inputSchema: {
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const filters = [eq(notes.userId, userId), isNull(notes.deletedAt)];
      if (args.search?.trim()) {
        const pattern = `%${escapeLike(args.search.trim().toLowerCase())}%`;
        filters.push(like(sql`LOWER(${notes.title})`, pattern));
      }

      const rows = await db
        .select()
        .from(notes)
        .where(and(...filters))
        .orderBy(desc(notes.updatedAt))
        .limit(args.limit ?? 30);

      return textResult(`Found ${rows.length} note(s).`, { notes: rows });
    },
  );

  server.registerTool(
    "create-note",
    {
      description: "Create a new note.",
      inputSchema: {
        title: z.string().min(1).max(200),
        content: z.string().optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const now = new Date().toISOString();
      const [note] = await db
        .insert(notes)
        .values({
          userId,
          title: args.title.trim(),
          content: args.content,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return textResult(`Note created: ${note.title}`, { note });
    },
  );

  server.registerTool(
    "update-note",
    {
      description: "Update an existing note.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const [existing] = await db
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.id, args.id), eq(notes.userId, userId), isNull(notes.deletedAt)))
        .limit(1);

      if (!existing) throw new Error("Note not found.");

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (args.title !== undefined) updates.title = args.title.trim();
      if (args.content !== undefined) updates.content = args.content;

      const [note] = await db
        .update(notes)
        .set(updates)
        .where(eq(notes.id, args.id))
        .returning();

      return textResult(`Note updated: ${note.title}`, { note });
    },
  );

  server.registerTool(
    "delete-note",
    {
      description: "Soft-delete a note.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args, extra) => {
      const userId = requireUserId(extra);
      const now = new Date().toISOString();
      const [note] = await db
        .update(notes)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(notes.id, args.id), eq(notes.userId, userId), isNull(notes.deletedAt)))
        .returning();

      if (!note) throw new Error("Note not found.");
      return textResult(`Note deleted: ${note.title}`, { noteId: note.id });
    },
  );
}
