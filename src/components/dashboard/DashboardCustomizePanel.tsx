"use client";

import { useEffect, useRef, useState } from "react";
import {
  type DashboardWidgetId,
  type DashboardWidgetState,
} from "@/lib/dashboard-layout";
import { IconGripVertical } from "@/components/icons";

type DashboardCustomizePanelProps = {
  open: boolean;
  widgets: DashboardWidgetState[];
  onClose: () => void;
  onToggleWidget: (id: DashboardWidgetId) => void;
  onReorderWidgets: (fromIndex: number, toIndex: number) => void;
  onResetLayout: () => void;
};

export function DashboardCustomizePanel({
  open,
  widgets,
  onClose,
  onToggleWidget,
  onReorderWidgets,
  onResetLayout,
}: DashboardCustomizePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      onClose();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-12 z-30 w-[min(92vw,24rem)] rounded-2xl border border-neutral-200/80 bg-white/95 p-4 shadow-xl dark:border-neutral-700/80 dark:bg-neutral-900/90"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Customize Dashboard
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Toggle widgets and drag to reorder.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetLayout}
          className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Reset
        </button>
      </div>

      <div className="space-y-1">
        {widgets.map((widget, index) => {
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <div
              key={widget.id}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                setDropIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", widget.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) {
                  onReorderWidgets(dragIndex, index);
                }
                setDragIndex(null);
                setDropIndex(null);
              }}
              className={`rounded-xl border px-3 py-2.5 transition ${
                isDropTarget
                  ? "border-cyan-300 bg-cyan-50/70 dark:border-cyan-700 dark:bg-cyan-900/25"
                  : "border-neutral-200/80 bg-neutral-50/60 dark:border-neutral-700/80 dark:bg-neutral-800/45"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex min-w-0 items-center gap-2">
                  <span className="text-neutral-400 dark:text-neutral-500">
                    <IconGripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {widget.label}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {widget.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleWidget(widget.id)}
                  aria-pressed={widget.visible}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    widget.visible ? "bg-cyan-500" : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                      widget.visible ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
