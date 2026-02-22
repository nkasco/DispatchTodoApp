let fallbackCounter = 0;

function generateFallbackId() {
  fallbackCounter += 1;
  const timestamp = Date.now().toString(36);
  const counter = fallbackCounter.toString(36).padStart(4, "0");
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `id_${timestamp}_${counter}_${random}`;
}

export function generateClientId() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // Older browsers and some environments can throw here; use local fallback.
  }

  return generateFallbackId();
}
