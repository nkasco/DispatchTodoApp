"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { markdownComponents } from "@/components/NoteEditor";
import { useToast } from "@/components/ToastProvider";
import {
  api,
  type AIConfig,
  type ChatConversation,
  type ChatConversationDetail,
} from "@/lib/client";
import { IconPencil, IconPlus, IconSparkles, IconTrash } from "@/components/icons";

function modelBadgeLabel(config: AIConfig | null): string {
  if (!config) return "No provider";
  if (config.provider === "ollama" || config.provider === "lmstudio") {
    return `${config.model} (local)`;
  }
  return config.model;
}

type McpHealth = { reachable: boolean; url: string; error?: string };

export function AssistantPage() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationDetail, setActiveConversationDetail] = useState<ChatConversationDetail | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [mcpHealth, setMcpHealth] = useState<McpHealth | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const loadConversations = useCallback(async () => {
    const rows = await api.ai.conversations.list();
    setConversations(rows);
    if (!rows.length) {
      setActiveConversationId(null);
      setActiveConversationDetail(null);
      return;
    }

    setActiveConversationId((current) => {
      if (current && rows.some((row) => row.id === current)) {
        return current;
      }
      return rows[0].id;
    });
  }, []);

  const loadActiveConversation = useCallback(async (conversationId: string) => {
    setLoadingConversation(true);
    try {
      const detail = await api.ai.conversations.get(conversationId);
      setActiveConversationDetail(detail);
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : "Failed to load conversation");
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const checkMcpHealth = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setMcpLoading(true);
    }

    try {
      const result = await api.ai.mcpHealth();
      setMcpHealth((previous) => {
        if (
          previous?.reachable === result.reachable &&
          previous?.url === result.url &&
          previous?.error === result.error
        ) {
          return previous;
        }
        return result;
      });
    } catch (error) {
      const failed = {
        reachable: false,
        url: "http://localhost:3001/mcp",
        error: error instanceof Error ? error.message : "MCP health check failed.",
      };
      setMcpHealth((previous) => {
        if (
          previous?.reachable === failed.reachable &&
          previous?.url === failed.url &&
          previous?.error === failed.error
        ) {
          return previous;
        }
        return failed;
      });
    } finally {
      if (!silent) {
        setMcpLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [configResult] = await Promise.all([api.ai.config.get(), loadConversations(), checkMcpHealth()]);
        if (!active) return;
        setConfig(configResult.config);
      } catch (error) {
        if (active) {
          toastRef.current.error(error instanceof Error ? error.message : "Failed to load assistant");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [checkMcpHealth, loadConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    void loadActiveConversation(activeConversationId);
  }, [activeConversationId, loadActiveConversation]);

  useEffect(() => {
    const timer = setInterval(() => {
      void checkMcpHealth({ silent: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [checkMcpHealth]);

  async function handleCreateConversation() {
    try {
      const created = await api.ai.conversations.create();
      await loadConversations();
      setActiveConversationId(created.id);
      toast.success("Conversation created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create conversation");
    }
  }

  async function handleDeleteConversation(conversationId: string) {
    if (!window.confirm("Delete this conversation and all messages?")) return;
    try {
      await api.ai.conversations.delete(conversationId);
      await loadConversations();
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete conversation");
    }
  }

  async function handleSaveConversationTitle(conversationId: string) {
    const title = editingTitle.trim();
    if (!title) return;
    try {
      const updated = await api.ai.conversations.update(conversationId, { title });
      setConversations((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, title: updated.title, updatedAt: updated.updatedAt } : row)),
      );
      setActiveConversationDetail((prev) =>
        prev && prev.conversation.id === updated.id
          ? { ...prev, conversation: { ...prev.conversation, title: updated.title, updatedAt: updated.updatedAt } }
          : prev,
      );
      setEditingConversationId(null);
      toast.success("Conversation renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename conversation");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="h-10 rounded-xl skeleton-shimmer" />
            <div className="h-16 rounded-xl skeleton-shimmer" />
            <div className="h-16 rounded-xl skeleton-shimmer" />
          </div>
          <div className="space-y-3">
            <div className="h-12 rounded-xl skeleton-shimmer" />
            <div className="h-64 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
            <IconSparkles className="w-6 h-6 text-blue-600 dark:text-blue-300" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">Set up your Personal Assistant (Beta)</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Configure an AI provider in Profile before using chat.
          </p>
          <Link
            href="/profile"
            className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all active:scale-95"
          >
            Open Profile Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
            <IconSparkles className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Personal Assistant (Beta)</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Active model: <span className="font-medium text-neutral-700 dark:text-neutral-300">{modelBadgeLabel(config)}</span>
            </p>
          </div>
        </div>
        <Link
          href="/profile"
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
        >
          AI Settings
        </Link>
      </div>

      <div className="grid min-h-[70vh] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="max-h-[70vh] min-h-[320px] overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-sm flex flex-col">
          <button
            onClick={handleCreateConversation}
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all active:scale-95"
          >
            <IconPlus className="w-4 h-4" />
            New Conversation
          </button>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {conversations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
                No conversations yet.
              </p>
            ) : (
              conversations.map((conversation) => {
                const active = activeConversationId === conversation.id;
                const editing = editingConversationId === conversation.id;
                return (
                  <div
                    key={conversation.id}
                    className={`rounded-lg border px-2 py-2 transition-all ${
                      active
                        ? "border-blue-300 bg-blue-50/80 dark:border-blue-700 dark:bg-blue-900/20"
                        : "border-transparent hover:border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-800 dark:hover:bg-neutral-800/40"
                    }`}
                  >
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveConversationTitle(conversation.id);
                            if (e.key === "Escape") setEditingConversationId(null);
                          }}
                          className="min-w-0 flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-100"
                          autoFocus
                        />
                        <button
                          onClick={() => void handleSaveConversationTitle(conversation.id)}
                          className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveConversationId(conversation.id)}
                        className="w-full text-left"
                      >
                        <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">{conversation.title}</p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {conversation.lastMessage?.content || "No messages yet"}
                        </p>
                      </button>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingConversationId(conversation.id);
                          setEditingTitle(conversation.title);
                        }}
                        className="rounded-md p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700/60"
                        title="Rename conversation"
                      >
                        <IconPencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDeleteConversation(conversation.id)}
                        className="rounded-md p-1 text-neutral-500 hover:bg-red-100 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                        title="Delete conversation"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
          {activeConversationId ? (
            loadingConversation || !activeConversationDetail ? (
              <div className="p-4 space-y-3">
                <div className="h-10 rounded-xl skeleton-shimmer" />
                <div className="h-16 rounded-xl skeleton-shimmer" />
                <div className="h-16 rounded-xl skeleton-shimmer" />
              </div>
            ) : (
              <ConversationChat
                key={activeConversationId}
                conversationId={activeConversationId}
                initialMessages={activeConversationDetail.uiMessages}
                modelLabel={modelBadgeLabel(config)}
                mcpHealth={mcpHealth}
                mcpLoading={mcpLoading}
                onActivity={loadConversations}
              />
            )
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Create a conversation to begin.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationChat({
  conversationId,
  initialMessages,
  modelLabel,
  mcpHealth,
  mcpLoading,
  onActivity,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  modelLabel: string;
  mcpHealth: McpHealth | null;
  mcpLoading: boolean;
  onActivity: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: { conversationId },
      }),
    [conversationId],
  );

  const { messages, status, error, sendMessage, clearError } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      void onActivity();
    },
    onError: (chatError) => {
      toast.error(chatError.message);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput("");
    await sendMessage({ text: value });
  }

  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Model: <span className="font-medium">{modelLabel}</span>
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Tools:{" "}
            <span
              className={`inline-flex items-center gap-1 ${
                mcpHealth?.reachable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  mcpHealth?.reachable ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {mcpLoading ? "Checking..." : mcpHealth?.reachable ? "Online" : "Offline"}
            </span>
          </p>
        </div>
        {mcpHealth && !mcpHealth.reachable && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/70 dark:bg-amber-900/20 dark:text-amber-300">
            MCP tools are unavailable. Chat still works, but actions like creating tasks from assistant replies are disabled.
          </p>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Ask anything about your tasks, notes, projects, or today&apos;s plan.
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {(status === "submitted" || status === "streaming") && (
          <div className="flex items-center gap-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300 w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center justify-between gap-2">
            <span>{error.message}</span>
            <button
              onClick={clearError}
              className="rounded-md px-2 py-1 text-[11px] font-medium hover:bg-red-100 dark:hover:bg-red-900/50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-neutral-200 dark:border-neutral-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                (event.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
              }
            }}
            placeholder="Ask Dispatch Assistant..."
            rows={2}
            className="min-h-[72px] flex-1 resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === "submitted" || status === "streaming"}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-all active:scale-95"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const containerClass = isUser ? "justify-end" : "justify-start";
  const bubbleClass = isUser
    ? "bg-blue-600 text-white"
    : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className={`flex ${containerClass}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${bubbleClass}`}>
        <div className="space-y-2">
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <div
                  key={`${message.id}-text-${index}`}
                  className={isUser ? "prose prose-sm prose-invert max-w-none" : "prose prose-sm dark:prose-invert max-w-none"}
                >
                  <Markdown components={markdownComponents}>{part.text}</Markdown>
                </div>
              );
            }

            if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
              const toolName = part.type === "dynamic-tool" ? part.toolName : part.type.replace("tool-", "");
              const state = (part as { state?: string }).state ?? "input-available";
              const statusLabel =
                state === "output-available"
                  ? "Completed"
                  : state === "output-error"
                    ? "Failed"
                    : state === "output-denied"
                      ? "Denied"
                      : "Running";
              return (
                <div
                  key={`${message.id}-tool-${index}`}
                  className="rounded-lg border border-neutral-300/70 bg-white/80 px-2 py-2 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200"
                >
                  <p className="font-semibold">
                    {statusLabel}: {toolName}
                  </p>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}
