import { withAuth, errorResponse, jsonResponse } from "@/lib/api";
import { commitImport } from "@/lib/imports";
import { parseImportRequestPayload } from "@/lib/imports/helpers";

export const POST = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  try {
    const payload = parseImportRequestPayload(body);
    const result = await commitImport({
      userId: session.user.id,
      userTimeZone: session.user.timeZone ?? null,
      payload,
    });
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to commit import";
    const status = /required|format|empty|exceeds|match|not found|Forced failure/.test(message) ? 400 : 500;
    return errorResponse(message, status);
  }
}, { allowApiKey: false });
