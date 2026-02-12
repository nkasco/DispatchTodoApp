import { errorResponse, jsonResponse, withAuth } from "@/lib/api";
import { getActiveAiConfigForUser, listModelsForConfig, providerLabel } from "@/lib/ai";

export const GET = withAuth(async (_req, session) => {
  const config = await getActiveAiConfigForUser(session.user.id);
  if (!config) {
    return errorResponse("No AI provider is configured.", 400);
  }

  try {
    const models = await listModelsForConfig(config);
    return jsonResponse({
      provider: config.provider,
      providerLabel: providerLabel(config.provider),
      model: config.model,
      models,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to fetch models.",
      400,
    );
  }
}, { allowApiKey: false });
