"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, type SearchResults } from "@/lib/client";
import { IconSearch } from "@/components/icons";

interface SearchOverlayProps {
  onClose: () => void;
}

type ResultItem =
  | { type: "task"; id: string; title: string; subtitle: string | null }
  | { type: "note"; id: string; title: string; subtitle: string | null }
  | { type: "dispatch"; id: string; title: string; subtitle: string | null };

export function SearchOverlay({ onClose }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    requestAnimationFrame(() => {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    });
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.search(q.trim());
      setResults(data);
      setSelectedIndex(0);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  // Flatten results for keyboard navigation
  const flatItems: ResultItem[] = [];
  if (results) {
    for (const task of results.tasks) {
      flatItems.push({
        type: "task",
        id: task.id,
        title: task.title,
        subtitle: task.description,
      });
    }
    for (const note of results.notes) {
      flatItems.push({
        type: "note",
        id: note.id,
        title: note.title,
        subtitle: note.content?.slice(0, 100) ?? null,
      });
    }
    for (const dispatch of results.dispatches) {
      flatItems.push({
        type: "dispatch",
        id: dispatch.id,
        title: `Dispatch: ${dispatch.date}`,
        subtitle: dispatch.summary?.slice(0, 100) ?? null,
      });
    }
  }

  function navigateToItem(item: ResultItem) {
    onClose();
    switch (item.type) {
      case "task":
        router.push("/tasks");
        break;
      case "note":
        router.push(`/notes/${item.id}`);
        break;
      case "dispatch":
        router.push("/dispatch");
        break;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      e.preventDefault();
      navigateToItem(flatItems[selectedIndex]);
    }
  }

  const hasResults = flatItems.length > 0;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 animate-backdrop-enter" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-neutral-900 shadow-2xl mx-4 overflow-hidden animate-slide-down-fade">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <IconSearch className="w-5 h-5 text-neutral-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, notes, dispatches..."
            className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none"
          />
          <kbd className="text-xs text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
              <span className="inline-block w-4 h-4 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spinner mr-2 align-middle" />
              Searching...
            </div>
          )}

          {!loading && hasQuery && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && hasResults && (
            <div className="py-2">
              {results!.tasks.length > 0 && (
                <ResultSection
                  label="Tasks"
                  items={flatItems.filter((i) => i.type === "task")}
                  allItems={flatItems}
                  selectedIndex={selectedIndex}
                  onSelect={navigateToItem}
                />
              )}
              {results!.notes.length > 0 && (
                <ResultSection
                  label="Notes"
                  items={flatItems.filter((i) => i.type === "note")}
                  allItems={flatItems}
                  selectedIndex={selectedIndex}
                  onSelect={navigateToItem}
                />
              )}
              {results!.dispatches.length > 0 && (
                <ResultSection
                  label="Dispatches"
                  items={flatItems.filter((i) => i.type === "dispatch")}
                  allItems={flatItems}
                  selectedIndex={selectedIndex}
                  onSelect={navigateToItem}
                />
              )}
            </div>
          )}

          {!loading && !hasQuery && (
            <div className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Start typing to search across all your data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultSection({
  label,
  items,
  allItems,
  selectedIndex,
  onSelect,
}: {
  label: string;
  items: ResultItem[];
  allItems: ResultItem[];
  selectedIndex: number;
  onSelect: (item: ResultItem) => void;
}) {
  return (
    <div>
      <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
      {items.map((item, i) => {
        const globalIndex = allItems.indexOf(item);
        const isSelected = globalIndex === selectedIndex;
        return (
          <button
            key={`${item.type}-${item.id}`}
            onClick={() => onSelect(item)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
              isSelected
                ? "bg-neutral-100 dark:bg-neutral-800"
                : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            }`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <TypeBadge type={item.type} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-neutral-900 dark:text-white truncate">
                {item.title}
              </p>
              {item.subtitle && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                  {item.subtitle}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TypeBadge({ type }: { type: ResultItem["type"] }) {
  const styles = {
    task: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
    note: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300",
    dispatch:
      "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300",
  };
  const labels = { task: "T", note: "N", dispatch: "D" };

  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold flex-shrink-0 ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}
