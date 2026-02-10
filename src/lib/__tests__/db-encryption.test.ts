import { describe, expect, it, vi } from "vitest";
import { isSqlCipherAvailable } from "@/lib/db-encryption";

describe("isSqlCipherAvailable", () => {
  it("returns true when cipher_version is reported", () => {
    const sqlite = {
      pragma: vi.fn((statement: string) =>
        statement === "cipher_version" ? "4.6.1 community" : undefined,
      ),
    };

    expect(isSqlCipherAvailable(sqlite as any)).toBe(true);
  });

  it("returns true when sqlite3mc cipher pragma is reported", () => {
    const sqlite = {
      pragma: vi.fn((statement: string) => {
        if (statement === "cipher_version") return undefined;
        if (statement === "cipher") return "chacha20";
        return undefined;
      }),
    };

    expect(isSqlCipherAvailable(sqlite as any)).toBe(true);
  });

  it("returns false when cipher pragmas are unavailable", () => {
    const sqlite = {
      pragma: vi.fn(() => undefined),
    };

    expect(isSqlCipherAvailable(sqlite as any)).toBe(false);
  });
});
