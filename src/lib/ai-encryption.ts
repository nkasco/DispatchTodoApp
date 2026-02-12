import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required for AI key encryption.");
  }
  return secret;
}

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "dispatch-ai-config", 32);
}

export function encryptAiApiKey(apiKey: string): string {
  const iv = randomBytes(12);
  const key = deriveKey(getAuthSecret());
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptAiApiKey(payload: string): string {
  const [ivB64, authTagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted API key format.");
  }

  const key = deriveKey(getAuthSecret());
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function maskApiKey(apiKey: string | null): string | null {
  if (!apiKey) return null;
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-6)}`;
}
