import { describe, expect, it, vi } from "vitest";
import { formatDashboardTimestamp } from "@/components/Dashboard";

describe("Dashboard timestamp formatting", () => {
  it("keeps activity timestamps at full precision", () => {
    const toLocaleString = vi
      .spyOn(Date.prototype, "toLocaleString")
      .mockReturnValue("Apr 3, 2026, 9:15 AM");
    const toLocaleDateString = vi
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockReturnValue("Apr 3, 2026");

    expect(formatDashboardTimestamp("2026-04-03T09:15:00.000Z")).toBe("Apr 3, 2026, 9:15 AM");
    expect(toLocaleString).toHaveBeenCalledTimes(1);
    expect(toLocaleDateString).not.toHaveBeenCalled();
  });
});
