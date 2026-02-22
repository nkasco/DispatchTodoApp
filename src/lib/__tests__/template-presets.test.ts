import { describe, expect, it } from "vitest";
import {
  emptyTemplatePresets,
  parseStoredTemplatePresets,
  serializeTemplatePresets,
  validateTemplatePresetsInput,
} from "@/lib/template-presets";

describe("template presets", () => {
  it("returns empty presets when stored value is invalid", () => {
    expect(parseStoredTemplatePresets("not-json")).toEqual(emptyTemplatePresets());
  });

  it("parses a valid stored template payload", () => {
    const payload = {
      tasks: [
        {
          id: "task-template-1",
          name: "Weekly review",
          title: "Review {{date:YYYY-MM-DD}}",
          description: "Close out and plan ahead",
          recurrenceType: "none",
          recurrenceBehavior: "after_completion",
          recurrenceRule: null,
        },
      ],
      notes: [{ id: "note-template-1", name: "Standup", content: "## Standup" }],
      dispatches: [{ id: "dispatch-template-1", name: "EOD", content: "Wins:\n- " }],
    };

    expect(parseStoredTemplatePresets(JSON.stringify(payload))).toEqual({
      ...payload,
      dispatches: [{ id: "dispatch-template-1", name: "EOD", content: "Wins:\n-" }],
    });
  });

  it("normalizes custom recurrence rule values", () => {
    const payload = {
      tasks: [
        {
          id: "task-template-1",
          name: "Biweekly planning",
          title: "Planning",
          description: "",
          recurrenceType: "custom",
          recurrenceBehavior: "duplicate_on_schedule",
          recurrenceRule: { interval: 2, unit: "week" },
        },
      ],
      notes: [],
      dispatches: [],
    };

    expect(validateTemplatePresetsInput(payload)).toEqual({
      tasks: [
        {
          ...payload.tasks[0],
          recurrenceRule: JSON.stringify({ interval: 2, unit: "week" }),
        },
      ],
      notes: [],
      dispatches: [],
    });
  });

  it("defaults recurrenceBehavior for legacy task templates", () => {
    const payload = {
      tasks: [
        {
          id: "task-template-legacy",
          name: "Legacy",
          title: "Legacy title",
          description: "",
          recurrenceType: "weekly",
          recurrenceRule: null,
        },
      ],
      notes: [],
      dispatches: [],
    };

    expect(validateTemplatePresetsInput(payload).tasks[0].recurrenceBehavior).toBe("after_completion");
  });

  it("rejects malformed payloads", () => {
    expect(() => validateTemplatePresetsInput({ tasks: [] })).toThrow(
      "templatePresets must include tasks, notes, and dispatches arrays",
    );
  });

  it("serializes and parses template presets", () => {
    const payload = {
      tasks: [],
      notes: [{ id: "note-template-1", name: "Journal", content: "Today..." }],
      dispatches: [],
    };

    const serialized = serializeTemplatePresets(payload);
    expect(parseStoredTemplatePresets(serialized)).toEqual(payload);
  });
});
