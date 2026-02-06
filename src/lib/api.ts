import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Wraps an API route handler with authentication.
 * Returns 401 if the user is not authenticated.
 */
export function withAuth(
  handler: (req: Request, session: Session) => Promise<NextResponse>
) {
  return async (req: Request) => {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, session);
  };
}

/**
 * Standard JSON error response.
 */
export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard JSON success response.
 */
export function jsonResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}
