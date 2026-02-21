import { resolveEffectiveTimeZone } from "@/lib/timezone";

export function defaultConversationTitle(date = new Date(), timeZone?: string | null): string {
  const resolvedTimeZone = resolveEffectiveTimeZone(timeZone);
  const stamp = date.toLocaleString("en-US", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Conversation - ${stamp}`;
}

export function isGenericConversationTitle(title: string): boolean {
  return title.trim().toLowerCase() === "new conversation";
}

export function normalizeConversationTitle(
  rawTitle: string,
  createdAt: string,
  timeZone?: string | null,
): string {
  if (!isGenericConversationTitle(rawTitle)) {
    return rawTitle;
  }

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) {
    return defaultConversationTitle(new Date(), timeZone);
  }

  return defaultConversationTitle(createdDate, timeZone);
}
