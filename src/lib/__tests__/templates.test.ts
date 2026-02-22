import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/templates";

describe("renderTemplate", () => {
  it("renders date placeholders", () => {
    const result = renderTemplate("Due {{date:YYYY-MM-DD}}", {
      referenceDate: "2026-02-21",
    });
    expect(result).toBe("Due 2026-02-21");
  });

  it("renders multiple date format tokens", () => {
    const result = renderTemplate("{{date:ddd}} {{date:MMM D, YYYY}}", {
      referenceDate: "2026-02-21",
    });
    expect(result).toBe("sat feb 21, 2026");
  });

  it("includes conditional blocks when predicates match", () => {
    const result = renderTemplate(
      "Morning{{if:day=sat}} Weekend{{/if}}{{if:day=mon}} Workday{{/if}}",
      { referenceDate: "2026-02-21" },
    );
    expect(result).toBe("Morning Weekend");
  });

  it("supports multi-condition blocks", () => {
    const result = renderTemplate(
      "Plan{{if:month=feb&dom=21}} Birthday prep{{/if}}",
      { referenceDate: "2026-02-21" },
    );
    expect(result).toBe("Plan Birthday prep");
  });

  it("drops unknown condition keys for safety", () => {
    const result = renderTemplate("Text{{if:foo=bar}} Hidden{{/if}}", {
      referenceDate: "2026-02-21",
    });
    expect(result).toBe("Text");
  });
});
