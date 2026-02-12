import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn(async () => ({ text: "OK" }));
const openAiProviderMock = vi.fn((_modelId: string) => ({ mocked: true }));
const createOpenAiMock = vi.fn(() => openAiProviderMock);

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAiMock,
}));

describe("testConnectionForConfig", () => {
  beforeEach(() => {
    generateTextMock.mockClear();
    openAiProviderMock.mockClear();
    createOpenAiMock.mockClear();
  });

  it("uses a provider-safe max output token value for probe requests", async () => {
    const { testConnectionForConfig } = await import("@/lib/ai");

    await testConnectionForConfig({
      id: "cfg-1",
      userId: "user-1",
      provider: "openai",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Respond with OK.",
        maxOutputTokens: 32,
        temperature: 0,
      }),
    );
  });
});
