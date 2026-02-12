import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigs } from "@/db/schema";
import { errorResponse, jsonResponse, withAuth } from "@/lib/api";
import {
  AI_PROVIDERS,
  getActiveAiConfigForUser,
  isAiApiKeySharingEnabled,
  getDefaultBaseUrl,
  getDefaultModel,
  isAIProvider,
  normalizeBaseUrl,
  providerLabel,
} from "@/lib/ai";
import { encryptAiApiKey, maskApiKey } from "@/lib/ai-encryption";

export const GET = withAuth(async (_req, session) => {
  const readOnly = session.user.role !== "admin" && await isAiApiKeySharingEnabled();
  const readOnlyReason = readOnly
    ? "AI settings are managed by an administrator while shared key access is enabled."
    : null;
  const config = await getActiveAiConfigForUser(session.user.id);
  if (!config) {
    return jsonResponse({
      config: null,
      defaults: {
        provider: "openai",
        model: getDefaultModel("openai"),
        baseUrl: getDefaultBaseUrl("openai"),
      },
      readOnly,
      readOnlyReason,
    });
  }

  return jsonResponse({
    config: {
      id: config.id,
      provider: config.provider,
      providerLabel: providerLabel(config.provider),
      model: config.model,
      baseUrl: config.baseUrl,
      isActive: config.isActive,
      hasApiKey: Boolean(config.apiKey),
      maskedApiKey: maskApiKey(config.apiKey),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    },
    readOnly,
    readOnlyReason,
  });
}, { allowApiKey: false });

export const PUT = withAuth(async (req, session) => {
  if (session.user.role !== "admin" && await isAiApiKeySharingEnabled()) {
    return errorResponse("AI settings are read-only while admin key sharing is enabled", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const {
    provider,
    apiKey,
    baseUrl,
    model,
    isActive,
  } = body as Record<string, unknown>;

  if (provider !== undefined && !isAIProvider(provider)) {
    return errorResponse(`provider must be one of: ${AI_PROVIDERS.join(", ")}`, 400);
  }

  if (apiKey !== undefined && apiKey !== null && typeof apiKey !== "string") {
    return errorResponse("apiKey must be a string or null", 400);
  }

  if (baseUrl !== undefined && baseUrl !== null && typeof baseUrl !== "string") {
    return errorResponse("baseUrl must be a string or null", 400);
  }

  if (model !== undefined && (typeof model !== "string" || model.trim().length === 0)) {
    return errorResponse("model must be a non-empty string when provided", 400);
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    return errorResponse("isActive must be a boolean", 400);
  }

  const userId = session.user.id;
  const existing = await db
    .select()
    .from(aiConfigs)
    .where(eq(aiConfigs.userId, userId))
    .orderBy(desc(aiConfigs.updatedAt));

  const active = existing.find((row) => row.isActive) ?? existing[0];
  const nextProvider = provider ?? active?.provider ?? "openai";
  if (!isAIProvider(nextProvider)) {
    return errorResponse("Unsupported provider", 400);
  }
  const providerChanged = Boolean(active && active.provider !== nextProvider);

  const nextModel = (model as string | undefined)?.trim() || active?.model || getDefaultModel(nextProvider);
  const nextBaseUrl = baseUrl !== undefined
    ? normalizeBaseUrl(baseUrl as string | null)
    : normalizeBaseUrl(active?.baseUrl);

  let encryptedApiKey: string | null | undefined;
  if (apiKey !== undefined) {
    const trimmed = (apiKey as string | null)?.trim() ?? "";
    encryptedApiKey = trimmed ? encryptAiApiKey(trimmed) : null;
  } else if (providerChanged) {
    // Avoid carrying credentials across providers when the provider changes.
    encryptedApiKey = null;
  }

  const now = new Date().toISOString();
  if (isActive !== false) {
    await db
      .update(aiConfigs)
      .set({ isActive: false, updatedAt: now })
      .where(and(eq(aiConfigs.userId, userId), eq(aiConfigs.isActive, true)));
  }

  let updatedId: string;
  if (active) {
    const [updated] = await db
      .update(aiConfigs)
      .set({
        provider: nextProvider,
        model: nextModel,
        baseUrl: nextBaseUrl,
        isActive: isActive ?? true,
        ...(encryptedApiKey !== undefined ? { apiKey: encryptedApiKey } : {}),
        updatedAt: now,
      })
      .where(eq(aiConfigs.id, active.id))
      .returning({ id: aiConfigs.id });
    updatedId = updated.id;
  } else {
    const [created] = await db
      .insert(aiConfigs)
      .values({
        userId,
        provider: nextProvider,
        model: nextModel,
        baseUrl: nextBaseUrl,
        isActive: isActive ?? true,
        apiKey: encryptedApiKey ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: aiConfigs.id });
    updatedId = created.id;
  }

  const current = await getActiveAiConfigForUser(userId);
  if (!current) {
    return errorResponse("Failed to load updated AI config", 500);
  }

  return jsonResponse({
    config: {
      id: updatedId,
      provider: current.provider,
      providerLabel: providerLabel(current.provider),
      model: current.model,
      baseUrl: current.baseUrl,
      isActive: current.isActive,
      hasApiKey: Boolean(current.apiKey),
      maskedApiKey: maskApiKey(current.apiKey),
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    },
  });
}, { allowApiKey: false });
