import { withAuth, errorResponse, jsonResponse } from "@/lib/api";
import { processConnectorOutbox } from "@/lib/integrations/service";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  try {
    const result = await processConnectorOutbox({
      userId: session.user.id,
      connectionId: id,
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Failed to sync connector", 400);
  }
}, { allowApiKey: false });
