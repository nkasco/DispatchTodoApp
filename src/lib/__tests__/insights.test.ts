import {
  buildDailyPoints,
  calculateInsightsTotals,
  normalizeIsoDate,
  shouldApplyInsightsFetchResult,
  shouldFinalizeInsightsLoading,
  toLocalDateKey,
} from "@/lib/insights";

describe("insights utilities", () => {
  describe("toLocalDateKey", () => {
    it("returns YYYY-MM-DD in local time", () => {
      const date = new Date(2026, 1, 10, 23, 59, 59, 999);
      expect(toLocalDateKey(date)).toBe("2026-02-10");
    });
  });

  describe("normalizeIsoDate", () => {
    it("returns null for invalid dates", () => {
      expect(normalizeIsoDate("not-a-date")).toBeNull();
    });

    it("returns a Date for valid ISO timestamps", () => {
      const parsed = normalizeIsoDate("2026-02-10T12:00:00.000Z");
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.toISOString()).toBe("2026-02-10T12:00:00.000Z");
    });
  });

  describe("buildDailyPoints", () => {
    it("builds created/completed counts by local day within range", () => {
      const now = new Date(2026, 1, 10, 12, 0, 0, 0);
      const dayMinus2 = new Date(2026, 1, 8, 9, 0, 0, 0);
      const dayMinus1 = new Date(2026, 1, 9, 9, 0, 0, 0);
      const day0 = new Date(2026, 1, 10, 9, 0, 0, 0);
      const outOfRangeCreated = new Date(2026, 1, 1, 9, 0, 0, 0);

      const tasks = [
        {
          createdAt: day0.toISOString(),
          updatedAt: day0.toISOString(),
          status: "open" as const,
        },
        {
          createdAt: dayMinus1.toISOString(),
          updatedAt: day0.toISOString(),
          status: "done" as const,
        },
        {
          createdAt: outOfRangeCreated.toISOString(),
          updatedAt: dayMinus1.toISOString(),
          status: "done" as const,
        },
        {
          createdAt: dayMinus2.toISOString(),
          updatedAt: day0.toISOString(),
          status: "in_progress" as const,
        },
        {
          createdAt: "bad-date",
          updatedAt: "also-bad",
          status: "done" as const,
        },
      ];

      const points = buildDailyPoints(tasks, 3, now);
      const byKey = new Map(points.map((point) => [point.dateKey, point]));
      const keyMinus2 = toLocalDateKey(dayMinus2);
      const keyMinus1 = toLocalDateKey(dayMinus1);
      const key0 = toLocalDateKey(day0);

      expect(points).toHaveLength(3);
      expect(byKey.get(keyMinus2)).toMatchObject({ created: 1, completed: 0 });
      expect(byKey.get(keyMinus1)).toMatchObject({ created: 1, completed: 1 });
      expect(byKey.get(key0)).toMatchObject({ created: 1, completed: 1 });
    });

    it("returns empty points for non-positive ranges", () => {
      expect(buildDailyPoints([], 0)).toEqual([]);
      expect(buildDailyPoints([], -5)).toEqual([]);
    });
  });

  describe("calculateInsightsTotals", () => {
    it("computes totals, completion rate, and peak day", () => {
      const points = [
        { dateKey: "2026-02-08", label: "Feb 8", created: 2, completed: 1 },
        { dateKey: "2026-02-09", label: "Feb 9", created: 3, completed: 3 },
        { dateKey: "2026-02-10", label: "Feb 10", created: 5, completed: 1 },
      ];

      const totals = calculateInsightsTotals(points);
      expect(totals.created).toBe(10);
      expect(totals.completed).toBe(5);
      expect(totals.completionRate).toBe(50);
      expect(totals.peakDay).toMatchObject({ dateKey: "2026-02-09" });
    });

    it("returns 0 completion rate when nothing was created", () => {
      const totals = calculateInsightsTotals([
        { dateKey: "2026-02-10", label: "Feb 10", created: 0, completed: 5 },
      ]);
      expect(totals.completionRate).toBe(0);
    });
  });

  describe("fetch-state guards", () => {
    it("applies results only for mounted latest requests", () => {
      expect(shouldApplyInsightsFetchResult(2, 2, true)).toBe(true);
      expect(shouldApplyInsightsFetchResult(1, 2, true)).toBe(false);
      expect(shouldApplyInsightsFetchResult(2, 2, false)).toBe(false);
    });

    it("clears initial loading for mounted fetches even when request became stale", () => {
      expect(shouldApplyInsightsFetchResult(1, 2, true)).toBe(false);
      expect(shouldFinalizeInsightsLoading(true, true)).toBe(true);
    });
  });
});
