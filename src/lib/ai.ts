import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { generateText, type LanguageModel, type UIMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { db } from "@/db";
import { aiConfigs, securitySettings, users } from "@/db/schema";
import { decryptAiApiKey } from "@/lib/ai-encryption";

export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "lmstudio",
  "custom",
] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];

export type UserAiConfig = Omit<typeof aiConfigs.$inferSelect, "apiKey" | "provider"> & {
  provider: AIProvider;
  apiKey: string | null;
};

export type ModelInfo = {
  id: string;
  label: string;
};

export function isAIProvider(value: unknown): value is AIProvider {
  return AI_PROVIDERS.includes(value as AIProvider);
}

export function isLocalProvider(provider: AIProvider): boolean {
  return provider === "ollama" || provider === "lmstudio";
}

export function requiresApiKey(provider: AIProvider): boolean {
  return provider === "openai" || provider === "anthropic" || provider === "google";
}

export function getDefaultBaseUrl(provider: AIProvider): string | null {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "google":
      return "https://generativelanguage.googleapis.com/v1beta";
    case "ollama":
      return "http://localhost:11434/v1";
    case "lmstudio":
      return "http://localhost:1234/v1";
    case "custom":
      return null;
  }
}

export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "google":
      return "gemini-2.5-flash";
    case "ollama":
    case "lmstudio":
      return "llama3.2";
    case "custom":
      return "gpt-4o-mini";
  }
}

export function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  const trimmed = baseUrl.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

export function providerLabel(provider: AIProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google Gemini";
    case "ollama":
      return "Ollama";
    case "lmstudio":
      return "LM Studio";
    case "custom":
      return "Custom";
  }
}

function isMissingSharedAiColumnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /no such column/i.test(error.message) &&
    error.message.includes("shareAiApiKeyWithUsers")
  );
}

export async function isAiApiKeySharingEnabled(): Promise<boolean> {
  let settings: { shareAiApiKeyWithUsers: boolean | null } | undefined;
  try {
    [settings] = await db
      .select({ shareAiApiKeyWithUsers: securitySettings.shareAiApiKeyWithUsers })
      .from(securitySettings)
      .where(eq(securitySettings.id, 1))
      .limit(1);
  } catch (error) {
    // Backward compatibility when local DB has not yet run the migration.
    if (isMissingSharedAiColumnError(error)) {
      return false;
    }
    throw error;
  }

  return Boolean(settings?.shareAiApiKeyWithUsers);
}

export async function getActiveAiConfigForUser(userId: string): Promise<UserAiConfig | null> {
  const [active] = await db
    .select()
    .from(aiConfigs)
    .where(and(eq(aiConfigs.userId, userId), eq(aiConfigs.isActive, true)))
    .orderBy(desc(aiConfigs.updatedAt))
    .limit(1);

  const [fallback] = active
    ? [active]
    : await db.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).limit(1);
  const userConfig = fallback ? decryptConfigRecord(fallback) : null;

  if (userConfig && (userConfig.apiKey || !requiresApiKey(userConfig.provider))) {
    return userConfig;
  }

  // Optionally allow all users to consume a shared admin API key.
  const sharedMatching = await getSharedAdminAiConfig(userConfig?.provider);
  if (sharedMatching && userConfig) {
    if (sharedMatching.provider === userConfig.provider) {
      return { ...userConfig, apiKey: sharedMatching.apiKey };
    }
  }

  if (sharedMatching && !userConfig) {
    return sharedMatching;
  }

  const sharedAny = await getSharedAdminAiConfig();
  if (sharedAny) {
    return sharedAny;
  }

  if (userConfig) {
    return userConfig;
  }

  return sharedAny;
}

function decryptConfigRecord(record: typeof aiConfigs.$inferSelect): UserAiConfig {
  if (!isAIProvider(record.provider)) {
    throw new Error(`Unsupported AI provider "${record.provider}"`);
  }

  let decryptedApiKey: string | null = null;
  if (record.apiKey) {
    try {
      decryptedApiKey = decryptAiApiKey(record.apiKey);
    } catch {
      throw new Error("Unable to decrypt saved API key. Re-save your AI configuration.");
    }
  }

  return {
    ...record,
    provider: record.provider,
    apiKey: decryptedApiKey,
  };
}

async function getSharedAdminAiConfig(preferredProvider?: AIProvider): Promise<UserAiConfig | null> {
  if (!(await isAiApiKeySharingEnabled())) {
    return null;
  }

  const adminRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));
  const adminIds = adminRows.map((row) => row.id);
  if (adminIds.length === 0) {
    return null;
  }

  const filters = [
    inArray(aiConfigs.userId, adminIds),
    eq(aiConfigs.isActive, true),
    isNotNull(aiConfigs.apiKey),
  ];
  if (preferredProvider) {
    filters.push(eq(aiConfigs.provider, preferredProvider));
  }

  const [matching] = await db
    .select()
    .from(aiConfigs)
    .where(and(...filters))
    .orderBy(desc(aiConfigs.updatedAt))
    .limit(1);

  if (matching) {
    return decryptConfigRecord(matching);
  }

  if (preferredProvider) {
    return null;
  }

  return null;
}

export function assertAiConfigReady(config: UserAiConfig) {
  if (requiresApiKey(config.provider) && !config.apiKey) {
    throw new Error(`${providerLabel(config.provider)} API key is required.`);
  }

  if ((config.provider === "custom" || isLocalProvider(config.provider)) && !resolveProviderBaseUrl(config)) {
    throw new Error("Base URL is required for local/custom providers.");
  }
}

function resolveProviderBaseUrl(config: Pick<UserAiConfig, "provider" | "baseUrl">): string | null {
  return normalizeBaseUrl(config.baseUrl) ?? getDefaultBaseUrl(config.provider);
}

export function createLanguageModelFromConfig(config: UserAiConfig): {
  model: LanguageModel;
  modelId: string;
  provider: AIProvider;
  providerName: string;
  isLocal: boolean;
} {
  assertAiConfigReady(config);
  const modelId = config.model?.trim() || getDefaultModel(config.provider);
  const baseUrl = resolveProviderBaseUrl(config);

  switch (config.provider) {
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey ?? undefined,
        baseURL: baseUrl ?? undefined,
      });
      return { model: provider(modelId), modelId, provider: config.provider, providerName: providerLabel(config.provider), isLocal: false };
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey ?? undefined,
        baseURL: baseUrl ?? undefined,
      });
      return { model: provider(modelId), modelId, provider: config.provider, providerName: providerLabel(config.provider), isLocal: false };
    }
    case "google": {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey ?? undefined,
        baseURL: baseUrl ?? undefined,
      });
      return { model: provider(modelId), modelId, provider: config.provider, providerName: providerLabel(config.provider), isLocal: false };
    }
    case "ollama":
    case "lmstudio":
    case "custom": {
      const provider = createOpenAICompatible({
        name: config.provider,
        baseURL: baseUrl ?? "",
        apiKey: config.apiKey ?? undefined,
      });
      return { model: provider(modelId), modelId, provider: config.provider, providerName: providerLabel(config.provider), isLocal: isLocalProvider(config.provider) };
    }
  }
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
      const suffix = detail ? ` ${detail}` : "";
      throw new Error(`${response.status} ${response.statusText}${suffix}`.trim());
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function listModelsForConfig(config: UserAiConfig): Promise<ModelInfo[]> {
  assertAiConfigReady(config);
  const baseUrl = resolveProviderBaseUrl(config);

  switch (config.provider) {
    case "openai": {
      const body = await fetchJsonWithTimeout(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      const data = (body as { data?: Array<{ id?: string }> }).data ?? [];
      return data
        .map((entry) => entry.id?.trim())
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ id, label: id }));
    }

    case "anthropic": {
      const body = await fetchJsonWithTimeout(`${baseUrl}/models`, {
        headers: {
          "x-api-key": config.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
      });
      const data = (body as { data?: Array<{ id?: string; display_name?: string }> }).data ?? [];
      return data
        .map((entry) => {
          const id = entry.id?.trim();
          if (!id) return null;
          return { id, label: entry.display_name?.trim() || id };
        })
        .filter((entry): entry is ModelInfo => Boolean(entry));
    }

    case "google": {
      const key = encodeURIComponent(config.apiKey ?? "");
      const body = await fetchJsonWithTimeout(`${baseUrl}/models?key=${key}`);
      const models = (body as { models?: Array<{ name?: string; displayName?: string }> }).models ?? [];
      return models
        .map((entry) => {
          const name = entry.name?.trim();
          if (!name) return null;
          const id = name.replace(/^models\//, "");
          return { id, label: entry.displayName?.trim() || id };
        })
        .filter((entry): entry is ModelInfo => Boolean(entry));
    }

    case "ollama":
    case "lmstudio":
    case "custom": {
      const headers: Record<string, string> = {};
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const body = await fetchJsonWithTimeout(`${baseUrl}/models`, { headers });
      const data = (body as { data?: Array<{ id?: string }>; models?: Array<{ name?: string; model?: string }> });

      if (Array.isArray(data.data)) {
        return data.data
          .map((entry) => entry.id?.trim())
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ id, label: id }));
      }

      const models = data.models ?? [];
      return models
        .map((entry) => {
          const id = (entry.model ?? entry.name)?.trim();
          if (!id) return null;
          return { id, label: id };
        })
        .filter((entry): entry is ModelInfo => Boolean(entry));
    }
  }
}

export async function testConnectionForConfig(config: UserAiConfig): Promise<{ modelId: string }> {
  const { model, modelId } = createLanguageModelFromConfig(config);
  await generateText({
    model,
    prompt: "Respond with OK.",
    // Keep this above strict provider minima (e.g. OpenAI currently requires >=16 on some models).
    maxOutputTokens: 32,
    temperature: 0,
  });
  return { modelId };
}

export function extractTextFromUIMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function dbMessageToUIMessage(message: {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}
