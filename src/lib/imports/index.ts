import { db } from "@/db";
import {
  dispatches,
  importItemMappings,
  importSessions,
  notes,
  projects,
  tasks,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { boardJsonImportAdapter } from "@/lib/imports/board-json";
import { csvImportAdapter } from "@/lib/imports/csv";
import { dispatchRoundtripImportAdapter } from "@/lib/imports/dispatch-roundtrip";
import {
  buildPreviewSample,
  countsFromBatch,
  decodeImportBase64,
  fingerprintBuffer,
  resolveImportOptions,
  resolveImportTimeZone,
  textFromBuffer,
} from "@/lib/imports/helpers";
import { icsImportAdapter } from "@/lib/imports/ics";
import { plainTextImportAdapter } from "@/lib/imports/plain-text";
import type {
  CanonicalImportBatch,
  ImportAdapterDefinition,
  ImportCommitResponse,
  ImportDuplicateMode,
  ImportEntityType,
  ImportPreviewResponse,
  ImportRequestPayload,
  ImportSourceFormat,
} from "@/lib/imports/types";
import { workspaceZipImportAdapter } from "@/lib/imports/workspace-zip";

const IMPORT_ADAPTERS: Record<ImportSourceFormat, ImportAdapterDefinition> = {
  csv: csvImportAdapter,
  board_json: boardJsonImportAdapter,
  workspace_zip: workspaceZipImportAdapter,
  ics: icsImportAdapter,
  plain_text: plainTextImportAdapter,
  dispatch_roundtrip: dispatchRoundtripImportAdapter,
};

function getImportAdapter(format: ImportSourceFormat) {
  return IMPORT_ADAPTERS[format];
}

export function listImportAdapters() {
  return Object.values(IMPORT_ADAPTERS).map((adapter) => ({
    format: adapter.format,
    label: adapter.label,
    description: adapter.description,
    expectedStructure: adapter.expectedStructure,
    sampleHint: adapter.sampleHint,
    compatibility: adapter.compatibility,
  }));
}

async function parseImportBatch(params: {
  payload: ImportRequestPayload;
  userTimeZone: string | null;
}): Promise<{ adapter: ImportAdapterDefinition; batch: CanonicalImportBatch; fingerprint: string }> {
  const adapter = getImportAdapter(params.payload.format);
  const options = resolveImportOptions(params.payload.options);
  const buffer = decodeImportBase64(params.payload.contentBase64);
  const fingerprint = fingerprintBuffer(buffer);
  const batch = await adapter.parse({
    fileName: params.payload.fileName,
    mimeType: params.payload.mimeType ?? null,
    buffer,
    text: textFromBuffer(buffer),
    userTimeZone: resolveImportTimeZone(params.userTimeZone),
    options,
    fieldMapping: params.payload.fieldMapping ?? null,
  });

  return { adapter, batch, fingerprint };
}

function manifestForBatch(params: {
  payload: ImportRequestPayload;
  batch: CanonicalImportBatch;
  fingerprint: string;
  adapter: ImportAdapterDefinition;
}) {
  return {
    sourceFormat: params.payload.format,
    fileName: params.payload.fileName,
    fingerprint: params.fingerprint,
    options: resolveImportOptions(params.payload.options),
    counts: countsFromBatch(params.batch),
    warnings: params.batch.warnings,
    inferredMappings: params.batch.inferredMappings,
    mappingSuggestions: params.batch.mappingSuggestions,
    adapter: {
      label: params.adapter.label,
      description: params.adapter.description,
      expectedStructure: params.adapter.expectedStructure,
      sampleHint: params.adapter.sampleHint,
      compatibility: params.adapter.compatibility,
    },
    sourceMetadata: params.batch.sourceMetadata,
  };
}

async function createPreviewSession(params: {
  userId: string;
  payload: ImportRequestPayload;
  batch: CanonicalImportBatch;
  fingerprint: string;
  adapter: ImportAdapterDefinition;
}) {
  const manifest = manifestForBatch(params);
  const now = new Date().toISOString();
  const [session] = await db
    .insert(importSessions)
    .values({
      userId: params.userId,
      sourceFormat: params.payload.format,
      status: "previewed",
      fileName: params.payload.fileName,
      fingerprint: params.fingerprint,
      duplicateMode: resolveImportOptions(params.payload.options).duplicateMode,
      options: JSON.stringify(resolveImportOptions(params.payload.options)),
      manifest: JSON.stringify(manifest),
      warningCount: params.batch.warnings.length,
      skippedCount: params.batch.skipped.length,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: importSessions.id });

  return session.id;
}

async function ensurePreviewSessionOwnership(userId: string, sessionId: string, fingerprint: string) {
  const [session] = await db
    .select({
      id: importSessions.id,
      fingerprint: importSessions.fingerprint,
      userId: importSessions.userId,
    })
    .from(importSessions)
    .where(and(eq(importSessions.id, sessionId), eq(importSessions.userId, userId)))
    .limit(1);

  if (!session) {
    throw new Error("Import preview session not found");
  }

  if (session.fingerprint !== fingerprint) {
    throw new Error("Import preview session does not match the uploaded file");
  }

  return session.id;
}

async function notePreviousImports(userId: string, fingerprint: string, batch: CanonicalImportBatch) {
  const previous = await db
    .select({ id: importSessions.id, createdAt: importSessions.createdAt })
    .from(importSessions)
    .where(and(eq(importSessions.userId, userId), eq(importSessions.fingerprint, fingerprint), eq(importSessions.status, "committed")))
    .limit(1);

  if (previous[0]) {
    batch.warnings.push(`This file fingerprint was already imported on ${previous[0].createdAt}. Duplicate handling will determine what happens on commit.`);
  }
}

export async function previewImport(params: {
  userId: string;
  userTimeZone: string | null;
  payload: ImportRequestPayload;
}): Promise<ImportPreviewResponse> {
  const { adapter, batch, fingerprint } = await parseImportBatch({
    payload: params.payload,
    userTimeZone: params.userTimeZone,
  });
  await notePreviousImports(params.userId, fingerprint, batch);
  const sessionId = await createPreviewSession({
    userId: params.userId,
    payload: params.payload,
    batch,
    fingerprint,
    adapter,
  });

  return {
    sessionId,
    format: params.payload.format,
    fileName: params.payload.fileName,
    counts: countsFromBatch(batch),
    warnings: batch.warnings,
    inferredMappings: batch.inferredMappings,
    mappingSuggestions: batch.mappingSuggestions ?? null,
    sample: buildPreviewSample(batch),
    guide: {
      label: adapter.label,
      description: adapter.description,
      expectedStructure: adapter.expectedStructure,
      sampleHint: adapter.sampleHint,
      compatibility: adapter.compatibility,
    },
  };
}

function applyDuplicateSuffix(title: string) {
  return title.endsWith("(Imported copy)") ? title : `${title} (Imported copy)`;
}

function findExistingEntityId(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], params: {
  userId: string;
  sourceFormat: ImportSourceFormat;
  entityType: ImportEntityType;
  sourceKey: string;
  duplicateMode: ImportDuplicateMode;
  fallback: {
    title?: string;
    dueDate?: string | null;
    name?: string;
    date?: string;
    projectId?: string | null;
  };
}) {
  const mapping = tx
    .select({
      dispatchEntityId: importItemMappings.dispatchEntityId,
      dispatchEntityType: importItemMappings.dispatchEntityType,
    })
    .from(importItemMappings)
    .where(
      and(
        eq(importItemMappings.userId, params.userId),
        eq(importItemMappings.sourceFormat, params.sourceFormat),
        eq(importItemMappings.entityType, params.entityType),
        eq(importItemMappings.sourceKey, params.sourceKey),
      ),
    )
    .limit(1)
    .get();

  if (mapping) {
    return mapping.dispatchEntityId;
  }

  if (params.duplicateMode !== "merge") {
    return null;
  }

  if (params.entityType === "project" && params.fallback.name) {
    const existing = tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, params.userId), eq(projects.name, params.fallback.name), isNull(projects.deletedAt)))
      .limit(1)
      .get();
    return existing?.id ?? null;
  }

  if (params.entityType === "task" && params.fallback.title) {
    const dueDateClause = params.fallback.dueDate ? eq(tasks.dueDate, params.fallback.dueDate) : isNull(tasks.dueDate);
    const projectClause = params.fallback.projectId ? eq(tasks.projectId, params.fallback.projectId) : isNull(tasks.projectId);
    const existing = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, params.userId),
          eq(tasks.title, params.fallback.title),
          dueDateClause,
          projectClause,
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1)
      .get();
    return existing?.id ?? null;
  }

  if (params.entityType === "note" && params.fallback.title) {
    const existing = tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.userId, params.userId), eq(notes.title, params.fallback.title), isNull(notes.deletedAt)))
      .limit(1)
      .get();
    return existing?.id ?? null;
  }

  if (params.entityType === "dispatch" && params.fallback.date) {
    const existing = tx
      .select({ id: dispatches.id })
      .from(dispatches)
      .where(and(eq(dispatches.userId, params.userId), eq(dispatches.date, params.fallback.date)))
      .limit(1)
      .get();
    return existing?.id ?? null;
  }

  return null;
}

function upsertImportMapping(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], params: {
  userId: string;
  sourceFormat: ImportSourceFormat;
  entityType: ImportEntityType;
  sourceKey: string;
  dispatchEntityId: string;
  dispatchEntityType: ImportEntityType;
  fingerprint: string;
}) {
  const now = new Date().toISOString();
  const existing = tx
    .select({ id: importItemMappings.id })
    .from(importItemMappings)
    .where(
      and(
        eq(importItemMappings.userId, params.userId),
        eq(importItemMappings.sourceFormat, params.sourceFormat),
        eq(importItemMappings.entityType, params.entityType),
        eq(importItemMappings.sourceKey, params.sourceKey),
      ),
    )
    .limit(1)
    .get();

  if (existing) {
    tx
      .update(importItemMappings)
      .set({
        dispatchEntityId: params.dispatchEntityId,
        dispatchEntityType: params.dispatchEntityType,
        lastFingerprint: params.fingerprint,
        lastImportedAt: now,
        updatedAt: now,
      })
      .where(eq(importItemMappings.id, existing.id))
      .run();
    return;
  }

  tx.insert(importItemMappings).values({
    userId: params.userId,
    sourceFormat: params.sourceFormat,
    entityType: params.entityType,
    sourceKey: params.sourceKey,
    dispatchEntityId: params.dispatchEntityId,
    dispatchEntityType: params.dispatchEntityType,
    lastFingerprint: params.fingerprint,
    lastImportedAt: now,
    createdAt: now,
    updatedAt: now,
  }).run();
}

export async function commitImport(params: {
  userId: string;
  userTimeZone: string | null;
  payload: ImportRequestPayload;
}): Promise<ImportCommitResponse> {
  const { adapter, batch, fingerprint } = await parseImportBatch({
    payload: params.payload,
    userTimeZone: params.userTimeZone,
  });
  const options = resolveImportOptions(params.payload.options);
  const sessionId = params.payload.previewSessionId
    ? await ensurePreviewSessionOwnership(params.userId, params.payload.previewSessionId, fingerprint)
    : await createPreviewSession({
        userId: params.userId,
        payload: params.payload,
        batch,
        fingerprint,
        adapter,
      });

  let created = 0;
  let updated = 0;
  let skipped = batch.skipped.length;
  const details: ImportCommitResponse["details"] = [];

  try {
    db.transaction((tx) => {
      const projectIdsByName = new Map<string, string>();

      for (const project of batch.projects) {
        const existingId = findExistingEntityId(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "project",
          sourceKey: project.sourceKey,
          duplicateMode: options.duplicateMode,
          fallback: { name: project.name },
        });

        if (existingId && options.duplicateMode === "skip") {
          skipped += 1;
          details.push({ entityType: "project", title: project.name, action: "skipped" });
          projectIdsByName.set(project.name.toLowerCase(), existingId);
          continue;
        }

        const now = new Date().toISOString();
        let projectId = existingId;
        const name = existingId && options.duplicateMode === "create_copy" ? applyDuplicateSuffix(project.name) : project.name;

        if (projectId && options.duplicateMode === "merge") {
          tx
            .update(projects)
            .set({
              name,
              description: project.description,
              status: project.status,
              updatedAt: now,
            })
            .where(eq(projects.id, projectId))
            .run();
          updated += 1;
          details.push({ entityType: "project", title: name, action: "updated" });
        } else {
          const inserted = tx
            .insert(projects)
            .values({
              userId: params.userId,
              name,
              description: project.description,
              status: project.status,
              color: "blue",
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: projects.id })
            .get();
          projectId = inserted.id;
          created += 1;
          details.push({ entityType: "project", title: name, action: "created" });
        }

        projectIdsByName.set(project.name.toLowerCase(), projectId!);
        upsertImportMapping(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "project",
          sourceKey: project.sourceKey,
          dispatchEntityId: projectId!,
          dispatchEntityType: "project",
          fingerprint,
        });
      }

      if (params.payload.testForceFailureAt === "after_projects" && process.env.NODE_ENV === "test") {
        throw new Error("Forced failure after project import");
      }

      for (const note of batch.notes) {
        const existingId = findExistingEntityId(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "note",
          sourceKey: note.sourceKey,
          duplicateMode: options.duplicateMode,
          fallback: { title: note.title },
        });

        if (existingId && options.duplicateMode === "skip") {
          skipped += 1;
          details.push({ entityType: "note", title: note.title, action: "skipped" });
          continue;
        }

        const now = new Date().toISOString();
        let noteId = existingId;
        const title = existingId && options.duplicateMode === "create_copy" ? applyDuplicateSuffix(note.title) : note.title;
        if (noteId && options.duplicateMode === "merge") {
          tx
            .update(notes)
            .set({
              title,
              content: note.content,
              updatedAt: now,
            })
            .where(eq(notes.id, noteId))
            .run();
          updated += 1;
          details.push({ entityType: "note", title, action: "updated" });
        } else {
          const inserted = tx
            .insert(notes)
            .values({
              userId: params.userId,
              title,
              content: note.content,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: notes.id })
            .get();
          noteId = inserted.id;
          created += 1;
          details.push({ entityType: "note", title, action: "created" });
        }

        upsertImportMapping(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "note",
          sourceKey: note.sourceKey,
          dispatchEntityId: noteId!,
          dispatchEntityType: "note",
          fingerprint,
        });
      }

      for (const dispatch of batch.dispatches) {
        const existingId = findExistingEntityId(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "dispatch",
          sourceKey: dispatch.sourceKey,
          duplicateMode: options.duplicateMode === "create_copy" ? "merge" : options.duplicateMode,
          fallback: { date: dispatch.date },
        });

        if (existingId && options.duplicateMode === "skip") {
          skipped += 1;
          details.push({ entityType: "dispatch", title: dispatch.date, action: "skipped" });
          continue;
        }

        const now = new Date().toISOString();
        let dispatchId = existingId;
        if (dispatchId) {
          tx
            .update(dispatches)
            .set({
              summary: dispatch.summary,
              updatedAt: now,
            })
            .where(eq(dispatches.id, dispatchId))
            .run();
          updated += 1;
          details.push({ entityType: "dispatch", title: dispatch.date, action: "updated" });
        } else {
          const inserted = tx
            .insert(dispatches)
            .values({
              userId: params.userId,
              date: dispatch.date,
              summary: dispatch.summary,
              finalized: false,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: dispatches.id })
            .get();
          dispatchId = inserted.id;
          created += 1;
          details.push({ entityType: "dispatch", title: dispatch.date, action: "created" });
        }

        upsertImportMapping(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "dispatch",
          sourceKey: dispatch.sourceKey,
          dispatchEntityId: dispatchId!,
          dispatchEntityType: "dispatch",
          fingerprint,
        });
      }

      for (const task of batch.tasks) {
        const projectId = task.projectName ? projectIdsByName.get(task.projectName.toLowerCase()) ?? null : null;
        const existingId = findExistingEntityId(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "task",
          sourceKey: task.sourceKey,
          duplicateMode: options.duplicateMode,
          fallback: { title: task.title, dueDate: task.dueDate, projectId },
        });

        if (existingId && options.duplicateMode === "skip") {
          skipped += 1;
          details.push({ entityType: "task", title: task.title, action: "skipped" });
          continue;
        }

        const now = new Date().toISOString();
        let taskId = existingId;
        const title = existingId && options.duplicateMode === "create_copy" ? applyDuplicateSuffix(task.title) : task.title;
        if (taskId && options.duplicateMode === "merge") {
          tx
            .update(tasks)
            .set({
              title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate,
              projectId,
              updatedAt: now,
            })
            .where(eq(tasks.id, taskId))
            .run();
          updated += 1;
          details.push({ entityType: "task", title, action: "updated" });
        } else {
          const inserted = tx
            .insert(tasks)
            .values({
              userId: params.userId,
              projectId,
              title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate,
              recurrenceType: "none",
              recurrenceBehavior: "after_completion",
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: tasks.id })
            .get();
          taskId = inserted.id;
          created += 1;
          details.push({ entityType: "task", title, action: "created" });
        }

        upsertImportMapping(tx, {
          userId: params.userId,
          sourceFormat: params.payload.format,
          entityType: "task",
          sourceKey: task.sourceKey,
          dispatchEntityId: taskId!,
          dispatchEntityType: "task",
          fingerprint,
        });
      }
    });

    const now = new Date().toISOString();
    await db
      .update(importSessions)
      .set({
        status: "committed",
        manifest: JSON.stringify(manifestForBatch({ payload: params.payload, batch, fingerprint, adapter })),
        warningCount: batch.warnings.length,
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(importSessions.id, sessionId));
  } catch (error) {
    await db
      .update(importSessions)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Import failed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(importSessions.id, sessionId));
    throw error;
  }

  return {
    sessionId,
    created,
    updated,
    skipped,
    warnings: batch.warnings,
    links: {
      tasks: "/tasks",
      notes: "/notes",
      projects: "/projects",
      dispatches: "/dispatch",
    },
    details: details.slice(0, 24),
  };
}
