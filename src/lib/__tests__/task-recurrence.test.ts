import { describe, expect, it } from "vitest";
import {
  describeTaskRecurrence,
  doesIsoDateMatchTaskRecurrenceRule,
  getNextTaskRecurrenceDate,
  parseTaskCustomRecurrenceRule,
  validateTaskRecurrenceRule,
} from "@/lib/task-recurrence";

describe("task recurrence", () => {
  it("normalizes weekly weekday rules", () => {
    expect(
      parseTaskCustomRecurrenceRule({
        interval: 1,
        unit: "week",
        weekdays: ["fri", "mon", "fri"],
      }),
    ).toEqual({
      interval: 1,
      unit: "week",
      weekdays: ["mon", "fri"],
    });
  });

  it("describes weekly weekday recurrences", () => {
    expect(
      describeTaskRecurrence("weekly", {
        interval: 1,
        unit: "week",
        weekdays: ["mon", "wed", "fri"],
      }),
    ).toBe("Every week on Mon, Wed, Fri");
  });

  it("calculates the next selected weekday in the same weekly cycle", () => {
    expect(
      getNextTaskRecurrenceDate("2026-04-06", "weekly", {
        interval: 1,
        unit: "week",
        weekdays: ["mon", "fri"],
      }),
    ).toBe("2026-04-10");
  });

  it("calculates the next nth-weekday monthly occurrence", () => {
    expect(
      getNextTaskRecurrenceDate("2026-04-13", "monthly", {
        interval: 1,
        unit: "month",
        monthlyPattern: {
          kind: "nth_weekday",
          ordinal: 2,
          weekday: "mon",
        },
      }),
    ).toBe("2026-05-11");
  });

  it("matches dates against nth-weekday monthly rules", () => {
    const rule = {
      interval: 1,
      unit: "month" as const,
      monthlyPattern: {
        kind: "nth_weekday" as const,
        ordinal: -1 as const,
        weekday: "fri" as const,
      },
    };

    expect(doesIsoDateMatchTaskRecurrenceRule("2026-04-24", "monthly", rule)).toBe(true);
    expect(doesIsoDateMatchTaskRecurrenceRule("2026-04-17", "monthly", rule)).toBe(false);
  });

  it("accepts advanced weekly rules for weekly recurrence", () => {
    const result = validateTaskRecurrenceRule("weekly", {
      interval: 1,
      unit: "week",
      weekdays: ["mon", "thu"],
    });

    expect(result.error).toBeNull();
    expect(result.storedRule).toBe(JSON.stringify({
      interval: 1,
      unit: "week",
      weekdays: ["mon", "thu"],
    }));
  });

  it("rejects incompatible monthly rules for weekly recurrence", () => {
    const result = validateTaskRecurrenceRule("weekly", {
      interval: 1,
      unit: "month",
      monthlyPattern: {
        kind: "nth_weekday",
        ordinal: 2,
        weekday: "mon",
      },
    });

    expect(result.error).toContain("weekly recurrence");
  });
});
