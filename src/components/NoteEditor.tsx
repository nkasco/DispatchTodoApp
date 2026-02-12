"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import { api, type Note } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconDocument,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@/components/icons";

function mergeClass(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

export const markdownComponents = {
  h1: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className={mergeClass(
        "text-3xl font-semibold text-neutral-900 dark:text-neutral-100 mt-6 mb-3",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className={mergeClass(
        "text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mt-6 mb-3",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className={mergeClass(
        "text-xl font-semibold text-neutral-900 dark:text-neutral-100 mt-5 mb-2",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className={mergeClass("leading-7 text-neutral-700 dark:text-neutral-200 mt-3", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul
      className={mergeClass(
        "list-disc pl-6 mt-3 space-y-1 text-neutral-700 dark:text-neutral-200",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }: HTMLAttributes<HTMLOListElement>) => (
    <ol
      className={mergeClass(
        "list-decimal pl-6 mt-3 space-y-1 text-neutral-700 dark:text-neutral-200",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }: HTMLAttributes<HTMLLIElement>) => (
    <li className={mergeClass("leading-7", className)} {...props} />
  ),
  a: ({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className={mergeClass(
        "text-blue-600 dark:text-blue-400 underline underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
    <blockquote
      className={mergeClass(
        "border-l-2 border-neutral-200 dark:border-neutral-700 pl-4 italic text-neutral-600 dark:text-neutral-300 mt-4",
        className,
      )}
      {...props}
    />
  ),
  code: ({
    className,
    children,
    inline,
    ...props
  }: HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
    if (inline) {
      return (
        <code
          className={mergeClass(
            "rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 text-[0.85em] font-mono text-neutral-800 dark:text-neutral-200",
            className,
          )}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={mergeClass("text-[0.85em] font-mono", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ className, ...props }: HTMLAttributes<HTMLPreElement>) => (
    <pre
      className={mergeClass(
        "mt-4 overflow-x-auto rounded-xl bg-neutral-950 text-neutral-100 p-4 text-sm",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }: HTMLAttributes<HTMLHRElement>) => (
    <hr
      className={mergeClass("my-6 border-neutral-200 dark:border-neutral-700", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }: HTMLAttributes<HTMLTableElement>) => (
    <table
      className={mergeClass(
        "w-full text-sm border-collapse mt-4 text-neutral-700 dark:text-neutral-200",
        className,
      )}
      {...props}
    />
  ),
  thead: ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className={mergeClass("text-left", className)} {...props} />
  ),
  th: ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className={mergeClass(
        "border-b border-neutral-200 dark:border-neutral-700 px-3 py-2 font-semibold",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
    <td
      className={mergeClass(
        "border-b border-neutral-200 dark:border-neutral-800 px-3 py-2",
        className,
      )}
      {...props}
    />
  ),
  img: ({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      className={mergeClass(
        "max-w-full rounded-lg border border-neutral-200 dark:border-neutral-800 my-4",
        className,
      )}
      {...props}
    />
  ),
};

export function NoteEditor({ noteId }: { noteId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copying, setCopying] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    api.notes
      .get(noteId)
      .then((n) => {
        setNote(n);
        setTitle(n.title);
        setContent(n.content ?? "");
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [noteId]);

  useEffect(() => {
    if (!deleteConfirm) return;
    function handlePointerDown(event: MouseEvent) {
      if (deleteButtonRef.current?.contains(event.target as Node)) return;
      setDeleteConfirm(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [deleteConfirm]);

  const save = useCallback(
    async (t: string, c: string) => {
      setSaving(true);
      setSaved(false);
      try {
        const updated = await api.notes.update(noteId, {
          title: t.trim() || "Untitled Note",
          content: c,
        });
        setNote(updated);
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 2000);
      } catch {
        toast.error("Failed to save note");
      } finally {
        setSaving(false);
      }
    },
    [noteId, toast],
  );

  // Auto-save on changes (debounced 1s)
  function handleChange(newTitle: string, newContent: string) {
    setTitle(newTitle);
    setContent(newContent);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => save(newTitle, newContent), 1000);
  }

  async function handleDelete() {
    if (!note) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
      deleteTimeout.current = setTimeout(() => setDeleteConfirm(false), 2500);
      return;
    }
    setDeleting(true);
    try {
      await api.notes.delete(note.id);
      toast.success("Note deleted");
      router.push("/notes");
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
      toast.error("Failed to delete note");
    }
  }

  async function handleCopy() {
    if (copying) return;
    setCopying(true);
    try {
      const payload = `${title?.trim() || "Untitled Note"}\n\n${content}`.trim();
      await navigator.clipboard.writeText(payload);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy note");
    } finally {
      setCopying(false);
    }
  }

  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const created = await api.notes.create({
        title: `${title?.trim() || "Untitled Note"} (Copy)`,
        content,
      });
      toast.success("Note duplicated");
      router.push(`/notes/${created.id}`);
    } catch {
      toast.error("Failed to duplicate note");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const safeTitle = (title?.trim() || "untitled-note")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const fileName = `${safeTitle || "untitled-note"}.md`;
      const payload = `${title?.trim() || "Untitled Note"}\n\n${content}`.trim();
      const blob = new Blob([payload], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported markdown");
    } catch {
      toast.error("Failed to export note");
    } finally {
      setExporting(false);
    }
  }

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = content.length;
    const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
    return { words, chars, minutes };
  }, [content]);

  const createdAt = note?.createdAt ? new Date(note.createdAt) : null;
  const updatedAt = note?.updatedAt ? new Date(note.updatedAt) : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="space-y-4">
          <div className="h-8 w-64 rounded skeleton-shimmer" />
          <div className="h-96 rounded-lg skeleton-shimmer" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center py-20">
        <svg className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <h1 className="text-xl font-bold dark:text-white">Note not found</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-2">
          This note may have been deleted.{" "}
          <button
            onClick={() => router.push("/notes")}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to notes
          </button>
        </p>
      </div>
    );
  }

  const isPreview = mode === "preview";

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-indigo-500/10" />
        <div className="relative p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => router.push("/notes")}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 active:scale-95 transition-all"
            >
              &larr; Back to notes
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs min-w-[70px] justify-end">
                {saving && (
                  <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <span className="inline-block w-3 h-3 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spinner" />
                    Saving
                  </span>
                )}
                {!saving && saved && (
                  <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 animate-check-appear">
                    <IconCheck className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
              </div>
              <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-1 bg-white/70 dark:bg-neutral-900/70">
                <button
                  onClick={() => {
                    setMode("preview");
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    isPreview
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => {
                    setMode("edit");
                    setTimeout(() => titleRef.current?.focus(), 0);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    !isPreview
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  }`}
                >
                  Edit
                </button>
              </div>
              <button
                onClick={handleCopy}
                disabled={copying}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
              >
                {copying ? "Copying..." : "Copy"}
              </button>
              <button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95 inline-flex items-center gap-1.5"
              >
                <IconPlus className="w-3.5 h-3.5" />
                {duplicating ? "Duplicating..." : "Duplicate"}
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-95"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
              <button
                ref={deleteButtonRef}
                onClick={handleDelete}
                disabled={deleting}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-95 inline-flex items-center gap-1.5 ${
                  deleteConfirm
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                }`}
              >
                {deleting ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spinner" />
                ) : (
                  <IconTrash className="w-3.5 h-3.5" />
                )}
                {deleteConfirm ? "Confirm" : "Delete"}
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <IconDocument className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              {isPreview ? (
                <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white truncate">
                  {title || "Untitled Note"}
                </h1>
              ) : (
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => handleChange(e.target.value, content)}
                  placeholder="Note title..."
                  className="w-full text-2xl font-semibold border-none outline-none bg-transparent dark:text-white placeholder:text-neutral-400"
                />
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="inline-flex items-center gap-1.5">
                  <IconCalendar className="w-3.5 h-3.5" />
                  {createdAt ? createdAt.toLocaleDateString() : "Unknown date"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconClock className="w-3.5 h-3.5" />
                  {updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No updates yet"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconPencil className="w-3.5 h-3.5" />
                  {stats.words} words
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {isPreview ? (
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 min-h-[420px] animate-fade-in-up shadow-sm text-neutral-700 dark:text-neutral-100">
              {content ? (
                <Markdown components={markdownComponents}>{content}</Markdown>
              ) : (
                <div className="flex flex-col items-center justify-center h-[360px] text-center">
                  <IconDocument className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mb-3" />
                  <p className="text-neutral-500 dark:text-neutral-400 font-medium">
                    Nothing here yet
                  </p>
                  <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1">
                    Start writing to see your note come alive.
                  </p>
                  <button
                    onClick={() => {
                      setMode("edit");
                      setTimeout(() => titleRef.current?.focus(), 0);
                    }}
                    className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5"
                  >
                    <IconPencil className="w-4 h-4" />
                    Start Writing
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={content}
                onChange={(e) => handleChange(title, e.target.value)}
                placeholder="Write your note in markdown..."
                className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-sm font-mono dark:text-neutral-200 min-h-[420px] resize-y focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors shadow-sm"
              />
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                Markdown supported. Use `#` for headings, `-` for lists, and triple backticks for code blocks.
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Note Stats
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatCard label="Words" value={stats.words.toString()} tone="blue" />
              <StatCard label="Chars" value={stats.chars.toString()} tone="violet" />
              <StatCard label="Read" value={`${stats.minutes}m`} tone="amber" />
              <StatCard
                label="Status"
                value={saving ? "Saving" : saved ? "Saved" : "Idle"}
                tone="emerald"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Details
            </h3>
            <div className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400 dark:text-neutral-500">Created</span>
                <span>{createdAt ? createdAt.toLocaleDateString() : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400 dark:text-neutral-500">Updated</span>
                <span>{updatedAt ? updatedAt.toLocaleDateString() : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400 dark:text-neutral-500">Mode</span>
                <span>{isPreview ? "Preview" : "Edit"}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "violet" | "amber" | "emerald";
}) {
  const tones = {
    blue: "border-blue-200/60 bg-blue-50/60 text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-100",
    violet:
      "border-violet-200/60 bg-violet-50/60 text-violet-800 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-100",
    amber:
      "border-amber-200/60 bg-amber-50/60 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100",
    emerald:
      "border-emerald-200/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-100",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] uppercase tracking-wide text-current/70">
        {label}
      </p>
      <p className="text-sm font-semibold mt-1">
        {value}
      </p>
    </div>
  );
}
