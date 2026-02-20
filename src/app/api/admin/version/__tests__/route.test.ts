import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSession } from "@/test/setup";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { GET } = await import("@/app/api/admin/version/route");

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Admin Version API", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.NEXT_PUBLIC_APP_VERSION = "0.4.2";
    mockSession({
      user: {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
      },
    });
  });

  it("returns up_to_date when running version matches README package badge version", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: "v0.4.2",
      }),
    );

    const res = await GET(new Request("http://localhost/api/admin/version"), {});
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.comparison).toBe("up_to_date");
    expect(data.source).toBe("package_json_badge");
    expect(data.latestVersion).toBe("0.4.2");
  });

  it("returns behind when a newer version is available", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: "v0.4.3",
      }),
    );

    const res = await GET(new Request("http://localhost/api/admin/version"), {});
    const data = await res.json();
    expect(data.comparison).toBe("behind");
    expect(data.latestVersion).toBe("0.4.3");
  });

  it("falls back to repository package.json when README badge endpoint is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, 404));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        encoding: "base64",
        content: Buffer.from(JSON.stringify({ version: "0.4.2" }), "utf8").toString("base64"),
      }),
    );

    const res = await GET(new Request("http://localhost/api/admin/version"), {});
    const data = await res.json();
    expect(data.source).toBe("package_json");
    expect(data.latestVersion).toBe("0.4.2");
    expect(data.comparison).toBe("up_to_date");
  });

  it("returns unknown status if no version can be resolved", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Rate limit" }, 403));
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, 404));

    const res = await GET(new Request("http://localhost/api/admin/version"), {});
    const data = await res.json();
    expect(data.comparison).toBe("unknown");
    expect(data.error).toContain("Unable to resolve repository package.json version");
  });

  it("rejects non-admin requests", async () => {
    mockSession({
      user: {
        id: "member-1",
        name: "Member",
        email: "member@example.com",
        role: "member",
      },
    });

    const res = await GET(new Request("http://localhost/api/admin/version"), {});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
