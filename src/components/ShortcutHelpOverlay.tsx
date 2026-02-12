"use client";

import { useEffect } from "react";

interface ShortcutHelpOverlayProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], description: "Open search" },
  { keys: ["/"], description: "Open search" },
  { keys: ["g", "h"], description: "Go to Dashboard" },
  { keys: ["g", "d"], description: "Go to Dispatch" },
  { keys: ["Alt", "A"], description: "Open Personal Assistant" },
  { keys: ["Ctrl", "Shift", "A"], description: "Open Personal Assistant" },
  { keys: ["g", "i"], description: "Go to Insights" },
  { keys: ["g", "t"], description: "Go to Tasks" },
  { keys: ["g", "n"], description: "Go to Notes" },
  { keys: ["n", "t"], description: "New task" },
  { keys: ["n", "n"], description: "New note" },
  { keys: ["?"], description: "Show shortcuts" },
  { keys: ["Esc"], description: "Close overlay" },
];

export function ShortcutHelpOverlay({ onClose }: ShortcutHelpOverlayProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 p-6 shadow-2xl mx-4">
        <h2 className="text-lg font-semibold dark:text-white mb-4">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-2">
          {SHORTCUTS.map((shortcut, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-sm text-neutral-600 dark:text-neutral-300">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
                    {j > 0 && (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500 mx-0.5">
                        then
                      </span>
                    )}
                    <kbd className="inline-block min-w-[24px] text-center text-xs font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-0.5">
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
