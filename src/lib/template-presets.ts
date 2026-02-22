import {
  isTaskRecurrenceType,
  parseTaskCustomRecurrenceRule,
  serializeTaskCustomRecurrenceRule,
  type TaskRecurrenceType,
} from "@/lib/task-recurrence";

export interface TaskTemplatePreset {
  id: string;
  name: string;
  title: string;
  description: string;
  recurrenceType: TaskRecurrenceType;
  recurrenceRule: string | null;
}

export interface TextTemplatePreset {
  id: string;
  name: string;
  content: string;
}

export interface TemplatePresets {
  tasks: TaskTemplatePreset[];
  notes: TextTemplatePreset[];
  dispatches: TextTemplatePreset[];
}

const MAX_PRESETS_PER_KIND = 50;

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value.trim();
}

function parseTaskPreset(value: unknown): TaskTemplatePreset {
  if (!value || typeof value !== "object") {
    throw new Error("task template entry must be an object");
  }

  const entry = value as Record<string, unknown>;
  const id = ensureString(entry.id, "task template id");
  const name = ensureString(entry.name, "task template name");
  const title = ensureString(entry.title, "task template title");
  const description = typeof entry.description === "string" ? entry.description : "";

  if (!id) throw new Error("task template id is required");
  if (!name) throw new Error("task template name is required");
  if (!title) throw new Error("task template title is required");

  const recurrenceTypeRaw = entry.recurrenceType;
  const recurrenceType = isTaskRecurrenceType(recurrenceTypeRaw) ? recurrenceTypeRaw : "none";

  let recurrenceRule: string | null = null;
  if (recurrenceType === "custom") {
    const parsedRule = parseTaskCustomRecurrenceRule(entry.recurrenceRule);
    if (!parsedRule) {
      throw new Error("task template custom recurrence requires a valid recurrenceRule");
    }
    recurrenceRule = serializeTaskCustomRecurrenceRule(parsedRule);
  }

  return {
    id,
    name,
    title,
    description,
    recurrenceType,
    recurrenceRule,
  };
}

function parseTextPreset(value: unknown, kind: "note" | "dispatch"): TextTemplatePreset {
  if (!value || typeof value !== "object") {
    throw new Error(`${kind} template entry must be an object`);
  }

  const entry = value as Record<string, unknown>;
  const id = ensureString(entry.id, `${kind} template id`);
  const name = ensureString(entry.name, `${kind} template name`);
  const content = ensureString(entry.content, `${kind} template content`);

  if (!id) throw new Error(`${kind} template id is required`);
  if (!name) throw new Error(`${kind} template name is required`);

  return { id, name, content };
}

function ensureArrayLimit<T>(items: T[], kind: string): T[] {
  if (items.length > MAX_PRESETS_PER_KIND) {
    throw new Error(`${kind} templates exceed the limit of ${MAX_PRESETS_PER_KIND}`);
  }
  return items;
}

export function emptyTemplatePresets(): TemplatePresets {
  return {
    tasks: [],
    notes: [],
    dispatches: [],
  };
}

export function parseStoredTemplatePresets(value: unknown): TemplatePresets {
  try {
    if (!value) return emptyTemplatePresets();
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return emptyTemplatePresets();

    const payload = parsed as Record<string, unknown>;
    const tasksRaw = Array.isArray(payload.tasks) ? payload.tasks : [];
    const notesRaw = Array.isArray(payload.notes) ? payload.notes : [];
    const dispatchesRaw = Array.isArray(payload.dispatches) ? payload.dispatches : [];

    return {
      tasks: ensureArrayLimit(tasksRaw.map((entry) => parseTaskPreset(entry)), "task"),
      notes: ensureArrayLimit(notesRaw.map((entry) => parseTextPreset(entry, "note")), "note"),
      dispatches: ensureArrayLimit(
        dispatchesRaw.map((entry) => parseTextPreset(entry, "dispatch")),
        "dispatch",
      ),
    };
  } catch {
    return emptyTemplatePresets();
  }
}

export function validateTemplatePresetsInput(value: unknown): TemplatePresets {
  if (!value || typeof value !== "object") {
    throw new Error("templatePresets must be an object");
  }

  const payload = value as Record<string, unknown>;
  const tasksRaw = payload.tasks;
  const notesRaw = payload.notes;
  const dispatchesRaw = payload.dispatches;

  if (!Array.isArray(tasksRaw) || !Array.isArray(notesRaw) || !Array.isArray(dispatchesRaw)) {
    throw new Error("templatePresets must include tasks, notes, and dispatches arrays");
  }

  return {
    tasks: ensureArrayLimit(tasksRaw.map((entry) => parseTaskPreset(entry)), "task"),
    notes: ensureArrayLimit(notesRaw.map((entry) => parseTextPreset(entry, "note")), "note"),
    dispatches: ensureArrayLimit(
      dispatchesRaw.map((entry) => parseTextPreset(entry, "dispatch")),
      "dispatch",
    ),
  };
}

export function serializeTemplatePresets(value: TemplatePresets): string {
  return JSON.stringify(value);
}
