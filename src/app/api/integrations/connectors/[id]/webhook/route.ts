import { errorResponse, jsonResponse } from "@/lib/api";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { handleConnectorWebhook } from "@/lib/integrations/service";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = async (req: Request, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-dispatch-webhook-secret");

  const [connection] = await db
    .select({ userId: integrationConnections.userId })
    .from(integrationConnections)
    .where(eq(integrationConnections.id, id))
    .limit(1);

  if (!connection) {
    return errorResponse("Connector not found", 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  try {
    const result = await handleConnectorWebhook({
      userId: connection.userId,
      connectionId: id,
      secret,
      payload: body as Record<string, unknown>,
    });
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process webhook";
    const statusCode = message === "Connector not found" ? 404 : 403;
    return errorResponse(message, statusCode);
  }
};
