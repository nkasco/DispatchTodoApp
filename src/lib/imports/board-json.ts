import {
  createEmptyBatch,
  enrichBatchWithImplicitProjects,
  ensureMarkdownSections,
  fingerprintBuffer,
  normalizeImportDate,
  normalizeProjectStatus,
  normalizeTaskPriority,
  normalizeTaskStatus,
  stableKey,
  trimmed,
} from "@/lib/imports/helpers";
import type { ImportAdapterDefinition } from "@/lib/imports/types";

type BoardList = {
  id?: string;
  name?: string;
  cards?: BoardCard[];
};

type BoardCard = {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  due?: string | null;
  dueDate?: string | null;
  status?: string;
  priority?: string;
  labels?: string[];
  checklist?: Array<{ text?: string; title?: string }>;
  comments?: Array<{ text?: string; body?: string }>;
  archived?: boolean;
  completed?: boolean;
};

type BoardShape = {
  boards?: Array<{
    id?: string;
    name?: string;
    description?: string;
    status?: string;
    archived?: boolean;
    lists?: BoardList[];
  }>;
  projects?: Array<{
    id?: string;
    name?: string;
    description?: string;
    status?: string;
    tasks?: BoardCard[];
  }>;
};

function listToStatus(listName: string | undefined, fallback?: string | null) {
  const listStatus = normalizeTaskStatus(listName ?? fallback ?? "");
  return listStatus;
}

export const boardJsonImportAdapter: ImportAdapterDefinition = {
  format: "board_json",
  label: "Board-Style JSON",
  description:
    "Imports kanban-style exports by converting boards into projects and cards into Dispatch tasks, with checklist/comments preserved in markdown.",
  expectedStructure:
    "A JSON document containing boards/lists/cards or projects/tasks, optionally with labels, checklists, comments, due dates, and archive flags.",
  sampleHint:
    "Typical exports include boards -> lists -> cards. List names such as Todo, Doing, and Done map into Dispatch task status values.",
  compatibility: {
    exact: ["Project/board names", "Task titles", "Due dates when provided", "Checklist text"],
    approximate: ["Comments become markdown sections", "List names map into open/in progress/done status buckets"],
    unsupported: ["Board automations", "Member assignments", "Cover images"],
  },
  parse: async (context) => {
    const fingerprint = fingerprintBuffer(context.buffer);
    const batch = createEmptyBatch(context.fileName, fingerprint);
    const parsed = JSON.parse(context.text) as BoardShape;
    const boardEntries = parsed.boards ?? parsed.projects ?? [];

    for (const board of boardEntries) {
      const boardName = trimmed(board.name);
      if (!boardName) continue;

      const archived = Boolean("archived" in board && board.archived);
      if (archived && !context.options.includeArchived) {
        batch.skipped.push({
          sourceKey: `board:${board.id ?? boardName}`,
          reason: "Archived boards were excluded.",
        });
        continue;
      }

      batch.projects.push({
        sourceKey: `board:${board.id ?? stableKey([boardName])}`,
        externalId: board.id ?? null,
        name: boardName,
        description: trimmed(board.description),
        status: normalizeProjectStatus(board.status ?? (archived ? "completed" : "active")),
        metadata: {
          importedFrom: "board_json",
        },
        archived,
      });

      const lists = "lists" in board && Array.isArray(board.lists)
        ? board.lists
        : [{ name: "Imported", cards: "tasks" in board && Array.isArray(board.tasks) ? board.tasks : [] }];

      for (const list of lists) {
        const cards = Array.isArray(list.cards) ? list.cards : [];
        for (const card of cards) {
          const title = trimmed(card.title ?? card.name);
          if (!title) {
            batch.skipped.push({
              sourceKey: `card:${card.id ?? stableKey([list.name ?? "", JSON.stringify(card)])}`,
              reason: "Card had no title.",
            });
            continue;
          }

          const completed = Boolean(card.completed) || normalizeTaskStatus(card.status) === "done" || normalizeTaskStatus(list.name) === "done";
          if (completed && !context.options.includeCompleted) {
            batch.skipped.push({
              sourceKey: `card:${card.id ?? title}`,
              reason: "Completed cards were excluded.",
            });
            continue;
          }

          const archivedCard = Boolean(card.archived);
          if (archivedCard && !context.options.includeArchived) {
            batch.skipped.push({
              sourceKey: `card:${card.id ?? title}`,
              reason: "Archived cards were excluded.",
            });
            continue;
          }

          const checklist = (card.checklist ?? []).map((item) => trimmed(item.text ?? item.title)).filter(Boolean);
          const comments = context.options.includeComments
            ? (card.comments ?? []).map((item) => trimmed(item.text ?? item.body)).filter(Boolean)
            : [];

          batch.tasks.push({
            sourceKey: `card:${card.id ?? stableKey([boardName, list.name ?? "", title])}`,
            externalId: card.id ?? null,
            title,
            description: ensureMarkdownSections({
              description: card.description ?? "",
              checklist,
              comments,
              metadata: {
                labels: (card.labels ?? []).join(", ") || null,
                list: list.name ?? null,
              },
            }),
            status: completed ? "done" : listToStatus(list.name, card.status),
            priority: normalizeTaskPriority(card.priority),
            dueDate: normalizeImportDate(card.dueDate ?? card.due ?? null, context.userTimeZone),
            projectName: boardName,
            metadata: {
              importedFrom: "board_json",
              list: list.name ?? null,
            },
            archived: archivedCard,
          });
        }
      }
    }

    enrichBatchWithImplicitProjects(batch);
    return batch;
  },
};
