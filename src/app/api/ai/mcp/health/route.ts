import { jsonResponse, withAuth } from "@/lib/api";

async function probeMcp(url: string): Promise<{ reachable: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    // MCP endpoint usually returns 405 on GET when healthy; treat that as reachable.
    return { reachable: response.status < 500 };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { reachable: false, error: "Timed out connecting to MCP server." };
    }
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown MCP connection error.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const GET = withAuth(async () => {
  const url = process.env.MCP_SERVER_URL?.trim() || "http://localhost:3001/mcp";
  const result = await probeMcp(url);
  return jsonResponse({ url, ...result });
}, { allowApiKey: false });
