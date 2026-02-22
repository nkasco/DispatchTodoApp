import { afterEach, describe, expect, it, vi } from "vitest";
import { generateClientId } from "@/lib/id";

describe("generateClientId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses crypto.randomUUID when available", () => {
    const randomUUID = vi.fn(() => "uuid-123");
    vi.stubGlobal("crypto", { randomUUID });

    expect(generateClientId()).toBe("uuid-123");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("falls back when crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    const id = generateClientId();

    expect(id).toMatch(/^id_[0-9a-z]+_[0-9a-z]+_[0-9a-z]+$/);
  });

  it("falls back when randomUUID throws", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("Not supported");
      },
    });

    const id = generateClientId();

    expect(id).toMatch(/^id_[0-9a-z]+_[0-9a-z]+_[0-9a-z]+$/);
  });

  it("produces unique fallback ids across sequential calls", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.12345678);

    const first = generateClientId();
    const second = generateClientId();

    expect(first).not.toBe(second);
  });
});
