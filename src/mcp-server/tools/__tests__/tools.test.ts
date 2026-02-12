import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMCPClient } from "@ai-sdk/mcp";
import { createTestDb } from "@/test/db";
import { tasks, users } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

const { registerTaskTools } = await import("@/mcp-server/tools/tasks");

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createTestMcpServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }

    const mcpServer = new McpServer({ name: "test-mcp", version: "1.0.0" });
    registerTaskTools(mcpServer);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    try {
      const body = await readJsonBody(req);
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500).end();
      }
    } finally {
      res.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });
    }
  });
}

describe("MCP Task Tools", () => {
  let server: ReturnType<typeof createTestMcpServer>;
  let port = 0;

  beforeEach(async () => {
    testDb = createTestDb();
    testDb.db.insert(users).values([
      {
        id: "user-a",
        name: "User A",
        email: "a@example.com",
        role: "member",
        showAdminQuickAccess: true,
        assistantEnabled: true,
      },
      {
        id: "user-b",
        name: "User B",
        email: "b@example.com",
        role: "member",
        showAdminQuickAccess: true,
        assistantEnabled: true,
      },
    ]).run();

    const now = new Date().toISOString();
    testDb.db.insert(tasks).values([
      {
        id: "task-a-1",
        userId: "user-a",
        title: "A task",
        status: "open",
        priority: "medium",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "task-b-1",
        userId: "user-b",
        title: "B task",
        status: "open",
        priority: "medium",
        createdAt: now,
        updatedAt: now,
      },
    ]).run();

    server = createTestMcpServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        port = typeof address === "object" && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("scopes list-tasks to the authenticated user context", async () => {
    const client = await createMCPClient({
      transport: {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { "x-dispatch-user-id": "user-a" },
      },
    });

    const tools = await client.tools();
    const result = await tools["list-tasks"].execute({ limit: 20 });
    const listedTasks = (result as any).structuredContent?.tasks ?? [];

    expect(Array.isArray(listedTasks)).toBe(true);
    expect(listedTasks).toHaveLength(1);
    expect(listedTasks[0].title).toBe("A task");

    await client.close();
  });

  it("keeps created tasks isolated between users", async () => {
    const clientA = await createMCPClient({
      transport: {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { "x-dispatch-user-id": "user-a" },
      },
    });
    const clientB = await createMCPClient({
      transport: {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { "x-dispatch-user-id": "user-b" },
      },
    });

    const toolsA = await clientA.tools();
    const toolsB = await clientB.tools();

    await toolsA["create-task"].execute({ title: "A private task" });

    const listA = await toolsA["list-tasks"].execute({ limit: 20 });
    const listB = await toolsB["list-tasks"].execute({ limit: 20 });

    const tasksA = ((listA as any).structuredContent?.tasks ?? []) as Array<{ title: string }>;
    const tasksB = ((listB as any).structuredContent?.tasks ?? []) as Array<{ title: string }>;

    expect(tasksA.some((task) => task.title === "A private task")).toBe(true);
    expect(tasksB.some((task) => task.title === "A private task")).toBe(false);

    await clientA.close();
    await clientB.close();
  });
});
