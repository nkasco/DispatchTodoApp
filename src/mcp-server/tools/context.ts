type HeaderMap = Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderMap | undefined, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
  return null;
}

export function requireUserId(extra: { requestInfo?: { headers: HeaderMap } } | undefined): string {
  const userId = readHeader(extra?.requestInfo?.headers, "x-dispatch-user-id")?.trim();
  if (!userId) {
    throw new Error("Missing user context. Provide x-dispatch-user-id.");
  }
  return userId;
}

export function textResult(text: string, data?: Record<string, unknown>) {
  let payloadText = text;
  if (data !== undefined && data !== null) {
    try {
      const serialized = JSON.stringify(data);
      const maxLen = 12000;
      payloadText =
        serialized.length <= maxLen
          ? `${text}\n\nDATA: ${serialized}`
          : `${text}\n\nDATA: ${serialized.slice(0, maxLen)}...(truncated)`;
    } catch {
      payloadText = text;
    }
  }

  return {
    content: [{ type: "text" as const, text: payloadText }],
    ...(data !== undefined && data !== null ? { structuredContent: data } : {}),
  };
}
