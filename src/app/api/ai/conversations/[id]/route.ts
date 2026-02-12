import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { dbMessageToUIMessage } from "@/lib/ai";
import { errorResponse, jsonResponse, withAuth } from "@/lib/api";
import { normalizeConversationTitle } from "../title";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const userId = session.user.id;

  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    return errorResponse("Conversation not found", 404);
  }

  const normalizedConversation = {
    ...conversation,
    title: normalizeConversationTitle(conversation.title, conversation.createdAt),
  };

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, id))
    .orderBy(asc(chatMessages.createdAt));

  return jsonResponse({
    conversation: normalizedConversation,
    messages,
    uiMessages: messages.map((message) =>
      dbMessageToUIMessage({
        id: message.id,
        role: message.role,
        content: message.content,
      }),
    ),
  });
}, { allowApiKey: false });

export const PUT = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { title } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim().length === 0) {
    return errorResponse("title is required", 400);
  }
  if (title.length > 200) {
    return errorResponse("title must be at most 200 characters", 400);
  }

  const [existing] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)))
    .limit(1);

  if (!existing) {
    return errorResponse("Conversation not found", 404);
  }

  const [updated] = await db
    .update(chatConversations)
    .set({
      title: title.trim(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(chatConversations.id, id))
    .returning();

  return jsonResponse(updated);
}, { allowApiKey: false });

export const DELETE = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const userId = session.user.id;

  const [existing] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)))
    .limit(1);

  if (!existing) {
    return errorResponse("Conversation not found", 404);
  }

  await db.delete(chatConversations).where(eq(chatConversations.id, id));
  return jsonResponse({ deleted: true });
}, { allowApiKey: false });
