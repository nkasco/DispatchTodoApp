import { vi } from "vitest";

// Mock next-auth's auth() — individual tests override via mockSession()
type MockSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role?: "member" | "admin";
    isFrozen?: boolean;
    showAdminQuickAccess?: boolean;
    assistantEnabled?: boolean;
  };
} | null;

let currentSession: MockSession = null;

vi.mock("@/auth", () => ({
  auth: vi.fn(() => Promise.resolve(currentSession)),
}));

/**
 * Set the mock session for subsequent API calls.
 * Pass `null` to simulate an unauthenticated request.
 */
export function mockSession(
  session: MockSession
) {
  currentSession = session;
}

// Mock NextResponse since it's only available in a Next.js runtime
vi.mock("next/server", () => {
  class MockNextResponse extends Response {
    static json(data: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: { "content-type": "application/json", ...init?.headers },
      });
    }
  }
  return { NextResponse: MockNextResponse };
});
