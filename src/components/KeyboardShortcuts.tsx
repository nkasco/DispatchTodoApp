"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface KeyboardShortcutsProps {
  onSearchOpen: () => void;
  onShortcutHelp: () => void;
}

export function KeyboardShortcuts({
  onSearchOpen,
  onShortcutHelp,
}: KeyboardShortcutsProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const lastKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName;

      // Skip when focused on input elements
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+K / Cmd+K — open search (works everywhere)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onSearchOpen();
        return;
      }

      // / — open search
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onSearchOpen();
        return;
      }

      // ? — shortcut help
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onShortcutHelp();
        return;
      }

      // Alt+A or Ctrl+Shift+A — open Personal Assistant
      const assistantEnabled = session?.user?.assistantEnabled ?? true;
      if (
        assistantEnabled &&
        ((e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "a") ||
          (e.ctrlKey && e.shiftKey && !e.metaKey && e.key.toLowerCase() === "a"))
      ) {
        e.preventDefault();
        router.push("/assistant");
        return;
      }

      // Escape — close overlays (handled by individual overlays)

      // Sequence-based shortcuts: g+d, g+i, g+t, g+n, g+h, n+t, n+n
      const key = e.key.toLowerCase();
      const lastKey = lastKeyRef.current;

      if (lastKey === "g") {
        lastKeyRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        switch (key) {
          case "d":
            e.preventDefault();
            router.push("/dispatch");
            return;
          case "i":
            e.preventDefault();
            router.push("/insights");
            return;
          case "t":
            e.preventDefault();
            router.push("/tasks");
            return;
          case "n":
            e.preventDefault();
            router.push("/notes");
            return;
          case "h":
            e.preventDefault();
            router.push("/");
            return;
        }
      }

      if (lastKey === "n") {
        lastKeyRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        switch (key) {
          case "t":
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("shortcut:new-task"));
            return;
          case "n":
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("shortcut:new-note"));
            return;
        }
      }

      // Track key for sequences
      if (key === "g" || key === "n") {
        lastKeyRef.current = key;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          lastKeyRef.current = null;
        }, 500);
      } else {
        lastKeyRef.current = null;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, onSearchOpen, onShortcutHelp, session?.user?.assistantEnabled]);

  return null;
}
