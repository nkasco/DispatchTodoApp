"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type RecycleBinItem } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { IconTrash } from "@/components/icons";

const TYPE_LABELS: Record<string, string> = {
  task: "Task",
  note: "Note",
  project: "Project",
};

const TYPE_COLORS: Record<string, string> = {
  task: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  note: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  project: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function daysUntilPurge(deletedAt: string, retentionDays: number): number {
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Math.max(0, Math.ceil((purgeAt - now) / (24 * 60 * 60 * 1000)));
}

function formatDeletedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function RecycleBinPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "task" | "note" | "project">("all");

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.recycleBin.list();
      setItems(data.items);
      setRetentionDays(data.retentionDays);
    } catch {
      toast.error("Failed to load recycle bin");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleRestore(item: RecycleBinItem) {
    setActionInProgress(item.id);
    try {
      await api.recycleBin.restore(item.id, item.type);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(`${TYPE_LABELS[item.type]} restored`);
    } catch {
      toast.error("Failed to restore item");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handlePermanentDelete(item: RecycleBinItem) {
    setActionInProgress(item.id);
    try {
      await api.recycleBin.permanentDelete(item.id, item.type);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(`${TYPE_LABELS[item.type]} permanently deleted`);
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setActionInProgress(null);
    }
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);

  const counts = {
    all: items.length,
    task: items.filter((i) => i.type === "task").length,
    note: items.filter((i) => i.type === "note").length,
    project: items.filter((i) => i.type === "project").length,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
            <IconTrash className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Recycle Bin</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Deleted items are kept for {retentionDays} days before being permanently removed.
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "task", "note", "project"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] ${
              filter === t
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {t === "all" ? "All" : `${TYPE_LABELS[t]}s`}
            <span className="ml-1.5 text-xs opacity-60">{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-neutral-100 dark:bg-neutral-800/50 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 mb-4">
            <IconTrash className="w-8 h-8 text-neutral-400 dark:text-neutral-500" />
          </div>
          <p className="text-lg font-medium text-neutral-600 dark:text-neutral-300">
            {items.length === 0 ? "Recycle bin is empty" : "No matching items"}
          </p>
          <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1">
            {items.length === 0
              ? "Deleted tasks, notes, and projects will appear here."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
          {filtered.map((item, idx) => {
            const isActing = actionInProgress === item.id;
            const remaining = daysUntilPurge(item.deletedAt, retentionDays);

            return (
              <div
                key={`${item.type}-${item.id}`}
                className={`flex flex-col items-start gap-3 px-4 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
                  idx > 0 ? "border-t border-neutral-100 dark:border-neutral-800" : ""
                } ${isActing ? "opacity-50 pointer-events-none" : ""}`}
              >
                {/* Type badge */}
                <span
                  className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[item.type]}`}
                >
                  {TYPE_LABELS[item.type]}
                </span>

                {/* Title + deletion info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                    Deleted {formatDeletedDate(item.deletedAt)}
                    {" · "}
                    <span className={remaining <= 3 ? "text-red-500 dark:text-red-400 font-medium" : ""}>
                      {remaining === 0 ? "Purging soon" : `${remaining}d remaining`}
                    </span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={isActing}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors active:scale-[0.97]"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(item)}
                    disabled={isActing}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors active:scale-[0.97]"
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
