import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { errorResponse, jsonResponse, withAuth } from "@/lib/api";
import {
  defaultConversationTitle,
  isGenericConversationTitle,
  normalizeConversationTitle,
} from "./title";

export const GET = withAuth(async (_req, session) => {
  const userId = session.user.id;
  const conversations = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt));

  if (conversations.length === 0) {
    return jsonResponse([]);
  }

  const normalizedConversations = conversations.map((conversation) => ({
    ...conversation,
    title: normalizeConversationTitle(conversation.title, conversation.createdAt),
  }));

  const ids = normalizedConversations.map((conversation) => conversation.id);
  const counts = await db
    .select({
      conversationId: chatMessages.conversationId,
      count: sql<number>`count(*)`,
    })
    .from(chatMessages)
    .where(inArray(chatMessages.conversationId, ids))
    .groupBy(chatMessages.conversationId);

  const countMap = new Map<string, number>(counts.map((row) => [row.conversationId, row.count]));

  const latestMessages = await Promise.all(
    conversations.map(async (conversation) => {
      const [message] = await db
        .select({
          content: chatMessages.content,
          role: chatMessages.role,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conversation.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      return [conversation.id, message ?? null] as const;
    }),
  );

  const latestMap = new Map(latestMessages);

  return jsonResponse(
    normalizedConversations.map((conversation) => ({
      ...conversation,
      messageCount: countMap.get(conversation.id) ?? 0,
      lastMessage: latestMap.get(conversation.id),
    })),
  );
}, { allowApiKey: false });

export const POST = withAuth(async (req, session) => {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { title } = body as Record<string, unknown>;
  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
    return errorResponse("title must be a non-empty string when provided", 400);
  }

  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (trimmedTitle.length > 200) {
    return errorResponse("title must be at most 200 characters", 400);
  }

  const now = new Date().toISOString();
  const resolvedTitle =
    trimmedTitle.length > 0 && !isGenericConversationTitle(trimmedTitle)
      ? trimmedTitle
      : defaultConversationTitle(new Date(now));

  const [conversation] = await db
    .insert(chatConversations)
    .values({
      userId: session.user.id,
      title: resolvedTitle,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return jsonResponse(conversation, 201);
}, { allowApiKey: false });
