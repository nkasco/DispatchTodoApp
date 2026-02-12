import { errorResponse, jsonResponse, withAuth } from "@/lib/api";
import { getActiveAiConfigForUser, providerLabel, testConnectionForConfig } from "@/lib/ai";

export const GET = withAuth(async (_req, session) => {
  const config = await getActiveAiConfigForUser(session.user.id);
  if (!config) {
    return errorResponse("No AI provider is configured.", 400);
  }

  try {
    const result = await testConnectionForConfig(config);
    return jsonResponse({
      success: true,
      provider: config.provider,
      providerLabel: providerLabel(config.provider),
      model: result.modelId,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Connection test failed.",
      400,
    );
  }
}, { allowApiKey: false });
