import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerDispatchTools } from "@/mcp-server/tools/dispatches";
import { registerNoteTools } from "@/mcp-server/tools/notes";
import { registerProjectTools } from "@/mcp-server/tools/projects";
import { registerSearchTool } from "@/mcp-server/tools/search";
import { registerTaskTools } from "@/mcp-server/tools/tasks";

const MCP_PORT = Number(process.env.MCP_PORT || 3001);
const ALLOWED_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

function createDispatchMcpServer() {
  const server = new McpServer(
    { name: "dispatch-mcp-server", version: "0.4.0" },
    { capabilities: { logging: {} } },
  );

  registerTaskTools(server);
  registerNoteTools(server);
  registerProjectTools(server);
  registerDispatchTools(server);
  registerSearchTool(server);

  return server;
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id, last-event-id, x-dispatch-user-id, Accept",
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw);
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
    return;
  }

  const mcpServer = createDispatchMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    const body = await readJsonBody(req);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error.",
          },
          id: null,
        }),
      );
    }
  } finally {
    res.on("close", () => {
      void transport.close();
      void mcpServer.close();
    });
  }
}

const server = createServer(async (req, res) => {
  setCorsHeaders(req, res);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, port: MCP_PORT }));
    return;
  }

  if (url.pathname === "/mcp") {
    await handleMcpRequest(req, res);
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(MCP_PORT, () => {
  console.log(`[mcp] Dispatch MCP server listening on http://localhost:${MCP_PORT}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
