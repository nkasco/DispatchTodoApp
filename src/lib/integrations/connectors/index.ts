import { caldavConnectorAdapter } from "@/lib/integrations/connectors/caldav";
import { localUriConnectorAdapter } from "@/lib/integrations/connectors/local-uri";
import { restConnectorAdapter } from "@/lib/integrations/connectors/rest";
import type { ConnectorAdapter, ConnectorProvider } from "@/lib/integrations/connectors/types";

const CONNECTOR_ADAPTERS: Record<ConnectorProvider, ConnectorAdapter> = {
  rest: restConnectorAdapter,
  caldav: caldavConnectorAdapter,
  local_uri: localUriConnectorAdapter,
};

export function getConnectorAdapter(provider: ConnectorProvider): ConnectorAdapter {
  return CONNECTOR_ADAPTERS[provider];
}

export function listConnectorAdapters(): ConnectorAdapter[] {
  return Object.values(CONNECTOR_ADAPTERS);
}
