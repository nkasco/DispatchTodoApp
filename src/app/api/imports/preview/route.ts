import { withAuth, errorResponse, jsonResponse } from "@/lib/api";
import { parseImportRequestPayload } from "@/lib/imports/helpers";
import { previewImport } from "@/lib/imports";

export const POST = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  try {
    const payload = parseImportRequestPayload(body);
    const result = await previewImport({
      userId: session.user.id,
      userTimeZone: session.user.timeZone ?? null,
      payload,
    });
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview import";
    const status = /required|format|empty|exceeds|match/.test(message) ? 400 : 500;
    return errorResponse(message, status);
  }
}, { allowApiKey: false });
