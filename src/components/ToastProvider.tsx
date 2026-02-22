"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { generateClientId } from "@/lib/id";

type ToastVariant = "success" | "error" | "info" | "undo";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  onUndo?: () => void;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    undo: (message: string, onUndo: () => void) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant, onUndo?: () => void) => {
    const id = generateClientId();
    setToasts((prev) => [...prev, { id, message, variant, onUndo }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    toast: {
      success: (msg) => addToast(msg, "success"),
      error: (msg) => addToast(msg, "error"),
      info: (msg) => addToast(msg, "info"),
      undo: (msg, onUndo) => addToast(msg, "undo", onUndo),
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ---- Toast item ----

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-neutral-900 text-white",
  undo: "bg-neutral-900 text-white",
};

const UNDO_DURATION_MS = 5000;
const DEFAULT_DURATION_MS = 4000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isUndo = toast.variant === "undo";
  const duration = isUndo ? UNDO_DURATION_MS : DEFAULT_DURATION_MS;

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss, duration]);

  function handleUndo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    toast.onUndo?.();
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 ${
        VARIANT_STYLES[toast.variant]
      } ${exiting ? "opacity-0 translate-x-4" : "animate-[slide-in-right_0.2s_ease-out]"}`}
    >
      <span className="flex-1">{toast.message}</span>
      {isUndo && toast.onUndo && (
        <button
          onClick={handleUndo}
          className="ml-2 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
        >
          Undo
        </button>
      )}
      <button
        onClick={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setExiting(true);
          setTimeout(() => onDismiss(toast.id), 200);
        }}
        className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
      >
        &times;
      </button>
    </div>
  );
}
