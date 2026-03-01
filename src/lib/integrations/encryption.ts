import { decryptAiApiKey, encryptAiApiKey, maskApiKey } from "@/lib/ai-encryption";

export function encryptConnectorSecret(value: string): string {
  return encryptAiApiKey(value);
}

export function decryptConnectorSecret(value: string): string {
  return decryptAiApiKey(value);
}

export function maskConnectorSecret(value: string | null): string | null {
  return maskApiKey(value);
}
