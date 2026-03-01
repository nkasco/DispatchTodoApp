import { withAuth, errorResponse, jsonResponse } from "@/lib/api";
import { testConnectorForUser } from "@/lib/integrations/service";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  try {
    const result = await testConnectorForUser(session.user.id, id);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to test connector";
    const statusCode = message === "Connector not found" ? 404 : 400;
    return errorResponse(message, statusCode);
  }
}, { allowApiKey: false });
