import { and, eq } from "drizzle-orm";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { db } from "@/db";
import { chatConversations, chatMessages, users } from "@/db/schema";
import {
  createLanguageModelFromConfig,
  extractTextFromUIMessage,
  getActiveAiConfigForUser,
} from "@/lib/ai";
import { errorResponse, withAuth } from "@/lib/api";

type ChatRequestBody = {
  conversationId?: string;
  messages?: UIMessage[];
};

function buildSystemPrompt(params: { mcpAvailable: boolean; nowIso: string }): string {
  const todayUtc = params.nowIso.slice(0, 10);
  return [
    "You are Dispatch Personal Assistant for a personal productivity app.",
    `Today is ${todayUtc} (UTC). Use this when the user says today, tomorrow, or yesterday unless they provide explicit dates.`,
    "Scope: help with Dispatch tasks, notes, projects, dispatches, and search.",
    "Be concise, accurate, and action-oriented.",
    "Never claim data was changed unless a tool call actually succeeded.",
    "Ask for explicit user confirmation before destructive actions (deletes or completing/finalizing a dispatch day).",
    "When users refer to projects by name, resolve by projectName (or search/list first) before projectId-only calls.",
    params.mcpAvailable
      ? "Dispatch MCP tools are available for read/write actions."
      : "Dispatch MCP tools are unavailable. Do not claim that you changed data.",
  ].join(" ");
}

function isUIMessageArray(value: unknown): value is UIMessage[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      typeof (message as UIMessage).id === "string" &&
      ((message as UIMessage).role === "user" ||
        (message as UIMessage).role === "assistant" ||
        (message as UIMessage).role === "system") &&
      Array.isArray((message as UIMessage).parts),
  );
}

async function closeMcpClient(client: MCPClient | null) {
  if (!client) return;
  try {
    await client.close();
  } catch {
    // Ignore close errors.
  }
}

export const POST = withAuth(async (req, session) => {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const userId = session.user.id;
  const conversationId = body.conversationId?.trim();
  if (!conversationId) {
    return errorResponse("conversationId is required", 400);
  }

  if (!isUIMessageArray(body.messages) || body.messages.length === 0) {
    return errorResponse("messages must be a non-empty array", 400);
  }

  const [userPrefs] = await db
    .select({ assistantEnabled: users.assistantEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userPrefs && !userPrefs.assistantEnabled) {
    return errorResponse("Personal Assistant is disabled for this account.", 403);
  }

  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    return errorResponse("Conversation not found", 404);
  }

  const config = await getActiveAiConfigForUser(userId);
  if (!config) {
    return errorResponse("AI provider is not configured. Configure it in Profile > AI Assistant.", 400);
  }

  let model;
  let resolvedModelId: string;
  try {
    const resolved = createLanguageModelFromConfig(config);
    model = resolved.model;
    resolvedModelId = resolved.modelId;
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid AI configuration.", 400);
  }

  const messages = body.messages;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUserMessage) {
    return errorResponse("A user message is required.", 400);
  }

  const userText = extractTextFromUIMessage(lastUserMessage);
  if (!userText) {
    return errorResponse("The latest user message is empty.", 400);
  }

  const now = new Date().toISOString();
  await db.insert(chatMessages).values({
    conversationId,
    role: "user",
    content: userText,
    model: config.model,
    createdAt: now,
  });

  await db
    .update(chatConversations)
    .set({ updatedAt: now })
    .where(eq(chatConversations.id, conversationId));

  const mcpServerUrl = process.env.MCP_SERVER_URL?.trim() || "http://localhost:3001/mcp";
  let mcpClient: MCPClient | null = null;
  let mcpTools: any = undefined;
  let mcpAvailable = false;

  try {
    mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: mcpServerUrl,
        headers: { "x-dispatch-user-id": userId },
      },
    });

    mcpTools = await mcpClient.tools();
    mcpAvailable = true;
  } catch {
    mcpTools = undefined;
  }

  const systemPrompt = buildSystemPrompt({ mcpAvailable, nowIso: now });

  const modelMessages = await convertToModelMessages(
    messages.map((message) => {
      const { id: _id, ...rest } = message;
      return rest;
    }),
  );

  const result = streamText({
    model,
    messages: modelMessages,
    system: systemPrompt,
    tools: mcpTools,
    stopWhen: stepCountIs(5),
    onAbort: async () => {
      await closeMcpClient(mcpClient);
    },
    onError: async () => {
      await closeMcpClient(mcpClient);
    },
    onFinish: async (event) => {
      const assistantText = event.text.trim();
      if (assistantText) {
        const persistedAt = new Date().toISOString();
        await db.insert(chatMessages).values({
          conversationId,
          role: "assistant",
          content: assistantText,
          model: resolvedModelId,
          tokenCount: event.totalUsage.totalTokens ?? null,
          createdAt: persistedAt,
        });

        await db
          .update(chatConversations)
          .set({ updatedAt: persistedAt })
          .where(eq(chatConversations.id, conversationId));
      }

      await closeMcpClient(mcpClient);
    },
  });

  return result.toUIMessageStreamResponse({ originalMessages: messages });
}, { allowApiKey: false });
