import { withAuth, errorResponse, jsonResponse } from "@/lib/api";
import {
  deleteConnectorForUser,
  getConnectionForUser,
  updateConnectorForUser,
} from "@/lib/integrations/service";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const connector = await getConnectionForUser(session.user.id, id);
  if (!connector) {
    return errorResponse("Connector not found", 404);
  }

  return jsonResponse(connector);
}, { allowApiKey: false });

export const PUT = withAuth(async (req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const {
    name,
    status,
    syncDirection,
    baseUrl,
    settings,
    authToken,
    username,
    password,
  } = body as Record<string, unknown>;

  try {
    const connector = await updateConnectorForUser({
      userId: session.user.id,
      connectionId: id,
      name: typeof name === "string" ? name : undefined,
      status: status === "active" || status === "disabled" || status === "error" ? status : undefined,
      syncDirection:
        syncDirection === "push" || syncDirection === "pull" || syncDirection === "bidirectional"
          ? syncDirection
          : undefined,
      baseUrl: typeof baseUrl === "string" ? baseUrl : undefined,
      settings,
      authToken: typeof authToken === "string" ? authToken : undefined,
      username: typeof username === "string" ? username : undefined,
      password: typeof password === "string" ? password : undefined,
    });

    return jsonResponse(connector);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update connector";
    const statusCode = message === "Connector not found" ? 404 : 400;
    return errorResponse(message, statusCode);
  }
}, { allowApiKey: false });

export const DELETE = withAuth(async (_req, session, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  try {
    await deleteConnectorForUser(session.user.id, id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete connector";
    const statusCode = message === "Connector not found" ? 404 : 400;
    return errorResponse(message, statusCode);
  }
}, { allowApiKey: false });
