"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Note } from "@/lib/client";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/components/ToastProvider";
import { IconPlus, IconTrash } from "@/components/icons";

export function NotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.notes.list({
        search: search || undefined,
        page,
        limit: 20,
      });
      if (Array.isArray(data)) {
        setNotes(data);
        setTotalPages(1);
      } else {
        setNotes(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timeout = setTimeout(fetchNotes, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchNotes, search]);

  // Reset page on search change
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Listen for keyboard shortcut to create new note
  useEffect(() => {
    window.addEventListener("shortcut:new-note", handleCreate);
    return () => window.removeEventListener("shortcut:new-note", handleCreate);
  }, []);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(`/notes${qs ? "?" + qs : ""}`, { scroll: false });
    void handleCreate();
  }, [searchParams, router]);

  async function handleCreate() {
    try {
      const note = await api.notes.create({ title: "Untitled Note" });
      router.push(`/notes/${note.id}`);
    } catch {
      toast.error("Failed to create note");
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setTimeout(async () => {
      const prev = notes;
      setNotes((n) => n.filter((x) => x.id !== id));
      setDeletingId(null);
      try {
        await api.notes.delete(id);
        toast.success("Note deleted");
      } catch {
        setNotes(prev);
        toast.error("Failed to delete note");
      }
    }, 300);
  }

  const sorted = [...notes].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Notes</h1>
          {!loading && notes.length > 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              <span className="font-medium">{notes.length}</span> note{notes.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5 shadow-sm"
        >
          <IconPlus className="w-4 h-4" />
          New Note
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search notes by title..."
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
      />

      {/* Notes grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl p-4 space-y-3 border border-neutral-200 dark:border-neutral-800">
              <div className="h-4 w-3/4 rounded skeleton-shimmer" />
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded skeleton-shimmer" />
                <div className="h-3 w-5/6 rounded skeleton-shimmer" />
                <div className="h-3 w-2/3 rounded skeleton-shimmer" />
              </div>
              <div className="h-3 w-24 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-16 text-center">
          <svg className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-neutral-500 dark:text-neutral-400 font-medium">
            {search ? "No notes match your search" : "No notes yet"}
          </p>
          <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1 mb-4">
            {search ? "Try a different search term." : "Create your first note to get started."}
          </p>
          {!search && (
            <button
              onClick={handleCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95 transition-all inline-flex items-center gap-1.5"
            >
              <IconPlus className="w-4 h-4" />
              Create Note
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((note, i) => (
            <NoteCard
              key={note.id}
              note={note}
              index={i}
              isDeleting={deletingId === note.id}
              onClick={() => router.push(`/notes/${note.id}`)}
              onDelete={() => handleDelete(note.id)}
            />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function NoteCard({
  note,
  index,
  isDeleting,
  onClick,
  onDelete,
}: {
  note: Note;
  index: number;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02] hover:border-neutral-300 dark:hover:border-neutral-700 animate-fade-in-up ${
        isDeleting ? "!animate-slide-out-right" : ""
      }`}
      style={{ animationDelay: isDeleting ? "0ms" : `${index * 50}ms` }}
      onClick={onClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 rounded-md p-1.5 text-neutral-300 dark:text-neutral-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all active:scale-95"
        title="Delete note"
      >
        <IconTrash className="w-3.5 h-3.5" />
      </button>
      <h3 className="font-medium text-sm truncate dark:text-white">{note.title}</h3>
      {note.content && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 line-clamp-3">{note.content}</p>
      )}
      <p className="text-xs text-neutral-300 dark:text-neutral-600 mt-3">
        {new Date(note.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
