import { withAuth, errorResponse, jsonResponse } from "@/lib/api";
import {
  createConnectorForUser,
  getConnectorConflictsForUser,
  listConnectionsForUser,
  listConnectorAuditEntriesForUser,
  listConnectorCatalog,
} from "@/lib/integrations/service";
import type { ConnectorProvider } from "@/lib/integrations/connectors/types";

export const GET = withAuth(async (_req, session) => {
  const [connections, audit, conflicts] = await Promise.all([
    listConnectionsForUser(session.user.id),
    listConnectorAuditEntriesForUser(session.user.id),
    getConnectorConflictsForUser(session.user.id),
  ]);

  return jsonResponse({
    connectors: connections,
    catalog: listConnectorCatalog(),
    audit,
    conflicts,
  });
}, { allowApiKey: false });

export const POST = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const {
    name,
    provider,
    syncDirection,
    baseUrl,
    settings,
    authToken,
    username,
    password,
  } = body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !name.trim()) {
    return errorResponse("name is required", 400);
  }

  if (provider !== "rest" && provider !== "caldav" && provider !== "local_uri") {
    return errorResponse("provider must be one of: rest, caldav, local_uri", 400);
  }

  if (syncDirection !== "push" && syncDirection !== "pull" && syncDirection !== "bidirectional") {
    return errorResponse("syncDirection must be one of: push, pull, bidirectional", 400);
  }

  try {
    const connector = await createConnectorForUser({
      userId: session.user.id,
      name,
      provider: provider as ConnectorProvider,
      syncDirection,
      baseUrl: typeof baseUrl === "string" ? baseUrl : null,
      settings,
      authToken: typeof authToken === "string" ? authToken : null,
      username: typeof username === "string" ? username : null,
      password: typeof password === "string" ? password : null,
    });

    return jsonResponse(connector, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Failed to create connector", 400);
  }
}, { allowApiKey: false });
