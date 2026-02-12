export function defaultConversationTitle(date = new Date()): string {
  const stamp = date.toLocaleString("en-US", {
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

export function normalizeConversationTitle(rawTitle: string, createdAt: string): string {
  if (!isGenericConversationTitle(rawTitle)) {
    return rawTitle;
  }

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) {
    return defaultConversationTitle();
  }

  return defaultConversationTitle(createdDate);
}
