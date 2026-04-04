import { and, eq, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { recurrenceSeries, tasks } from "@/db/schema";
import { getNextTaskRecurrenceDate } from "@/lib/task-recurrence";

type SeriesRow = {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  dueTime: string | null;
  recurrenceType: "daily" | "weekly" | "monthly" | "custom";
  recurrenceBehavior: "after_completion" | "duplicate_on_schedule";
  recurrenceRule: string | null;
  nextDueDate: string;
};

function isIsoDate(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function migrateLegacyTaskRecurrencesForUser(userId: string, todayIsoDate: string): Promise<void> {
  const legacyRows = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      dueTime: tasks.dueTime,
      recurrenceType: tasks.recurrenceType,
      recurrenceBehavior: tasks.recurrenceBehavior,
      recurrenceRule: tasks.recurrenceRule,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNull(tasks.recurrenceSeriesId),
        ne(tasks.recurrenceType, "none"),
      ),
    );

  for (const row of legacyRows) {
    if (row.recurrenceType === "none") {
      continue;
    }

    const now = new Date().toISOString();
    const dueAnchor = isIsoDate(row.dueDate) ? row.dueDate : todayIsoDate;
    const completionAnchor = dueAnchor > todayIsoDate ? dueAnchor : todayIsoDate;
    const nextDueDate = row.status === "done"
      ? (
          getNextTaskRecurrenceDate(
            completionAnchor,
            row.recurrenceType,
            row.recurrenceRule,
          ) ?? completionAnchor
        )
      : dueAnchor;

    const [createdSeries] = await db
      .insert(recurrenceSeries)
      .values({
        userId: row.userId,
        projectId: row.projectId,
        title: row.title,
        description: row.description,
        priority: row.priority,
        dueTime: row.dueTime,
        recurrenceType: row.recurrenceType,
        recurrenceBehavior: row.recurrenceBehavior,
        recurrenceRule: row.recurrenceRule,
        nextDueDate,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: recurrenceSeries.id });

    if (!createdSeries) {
      continue;
    }

    await db
      .update(tasks)
      .set({
        recurrenceSeriesId: createdSeries.id,
        recurrenceType: "none",
        recurrenceBehavior: "after_completion",
        recurrenceRule: null,
        recurrenceProcessedAt: row.status === "done" ? now : null,
        updatedAt: now,
      })
      .where(eq(tasks.id, row.id));
  }
}

async function hasOutstandingInstance(seriesId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.recurrenceSeriesId, seriesId),
        isNull(tasks.deletedAt),
        ne(tasks.status, "done"),
      ),
    )
    .limit(1);

  return Boolean(row?.id);
}

async function hasMaterializedDueDate(seriesId: string, dueDate: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.recurrenceSeriesId, seriesId),
        eq(tasks.dueDate, dueDate),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row?.id);
}

async function materializeSeries(series: SeriesRow, dueDate: string) {
  const now = new Date().toISOString();
  await db.insert(tasks).values({
    userId: series.userId,
    projectId: series.projectId,
    title: series.title,
    description: series.description,
    status: "open",
    priority: series.priority,
    dueDate,
    dueTime: series.dueTime,
    recurrenceType: "none",
    recurrenceBehavior: "after_completion",
    recurrenceRule: null,
    recurrenceSeriesId: series.id,
    recurrenceProcessedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function syncRecurrenceSeriesForUser(userId: string, todayIsoDate: string): Promise<void> {
  await migrateLegacyTaskRecurrencesForUser(userId, todayIsoDate);

  const seriesRows = await db
    .select({
      id: recurrenceSeries.id,
      userId: recurrenceSeries.userId,
      projectId: recurrenceSeries.projectId,
      title: recurrenceSeries.title,
      description: recurrenceSeries.description,
      priority: recurrenceSeries.priority,
      dueTime: recurrenceSeries.dueTime,
      recurrenceType: recurrenceSeries.recurrenceType,
      recurrenceBehavior: recurrenceSeries.recurrenceBehavior,
      recurrenceRule: recurrenceSeries.recurrenceRule,
      nextDueDate: recurrenceSeries.nextDueDate,
    })
    .from(recurrenceSeries)
    .where(
      and(
        eq(recurrenceSeries.userId, userId),
        isNull(recurrenceSeries.deletedAt),
        eq(recurrenceSeries.active, true),
        lte(recurrenceSeries.nextDueDate, todayIsoDate),
      ),
    );

  for (const series of seriesRows as SeriesRow[]) {
    if (series.recurrenceBehavior === "after_completion") {
      const hasOpenInstance = await hasOutstandingInstance(series.id);
      if (hasOpenInstance) {
        continue;
      }

      const alreadyMaterialized = await hasMaterializedDueDate(series.id, series.nextDueDate);
      if (!alreadyMaterialized) {
        await materializeSeries(series, series.nextDueDate);
      }
      continue;
    }

    let cursor = series.nextDueDate;
    for (let i = 0; i < 500; i += 1) {
      if (cursor > todayIsoDate) {
        break;
      }

      const alreadyMaterialized = await hasMaterializedDueDate(series.id, cursor);
      if (!alreadyMaterialized) {
        await materializeSeries(series, cursor);
      }

      const next = getNextTaskRecurrenceDate(cursor, series.recurrenceType, series.recurrenceRule);
      if (!next || next === cursor) {
        break;
      }
      cursor = next;
    }

    if (cursor !== series.nextDueDate) {
      await db
        .update(recurrenceSeries)
        .set({ nextDueDate: cursor, updatedAt: new Date().toISOString() })
        .where(eq(recurrenceSeries.id, series.id));
    }
  }
}
