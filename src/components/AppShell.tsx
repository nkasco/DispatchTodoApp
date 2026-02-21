"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/Sidebar";
import { BrandMark } from "@/components/BrandMark";
import { SearchOverlay } from "@/components/SearchOverlay";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ShortcutHelpOverlay } from "@/components/ShortcutHelpOverlay";
import { IconList, IconSearch } from "@/components/icons";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, update } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const refreshAttemptedRef = useRef(false);
  const initialRouteRef = useRef(true);

  useEffect(() => {
    refreshAttemptedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (pathname === "/login") return;
    if (status !== "unauthenticated" || refreshAttemptedRef.current) return;
    refreshAttemptedRef.current = true;
    void update();
  }, [pathname, status, update]);

  useEffect(() => {
    if (initialRouteRef.current) {
      initialRouteRef.current = false;
      return;
    }

    setRouteLoading(true);
    const timer = setTimeout(() => setRouteLoading(false), 420);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Render login page without the app shell.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div
        className={`pointer-events-none fixed left-0 top-0 z-[120] h-0.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-500 transition-all duration-500 ${
          routeLoading ? "w-full opacity-100" : "w-0 opacity-0"
        }`}
      />
      <KeyboardShortcuts
        onSearchOpen={() => setSearchOpen(true)}
        onShortcutHelp={() => setShortcutHelpOpen(true)}
      />
      <Suspense>
        <Sidebar
          onSearchOpen={() => setSearchOpen(true)}
          onShortcutHelp={() => setShortcutHelpOpen(true)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      </Suspense>
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-[125] bg-black/45 backdrop-blur-[1px] xl:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <main className="app-main-scrollbar min-w-0 flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
        <div className="sticky top-0 z-[110] flex h-14 items-center justify-between border-b border-neutral-200/80 bg-neutral-50/90 px-3 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-950/90 sm:px-4 xl:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300/70 bg-white/80 text-neutral-700 shadow-sm transition-colors hover:bg-white dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-900"
            aria-label="Open navigation"
          >
            <IconList className="h-4.5 w-4.5" />
          </button>

          <Link href="/" className="inline-flex items-center gap-2.5">
            <BrandMark compact className="h-8 w-8 rounded-xl" iconClassName="h-4 w-4" />
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Dispatch</span>
          </Link>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300/70 bg-white/80 text-neutral-700 shadow-sm transition-colors hover:bg-white dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-900"
            aria-label="Open search"
          >
            <IconSearch className="h-4.5 w-4.5" />
          </button>
        </div>
        {children}
      </main>
      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} />
      )}
      {shortcutHelpOpen && (
        <ShortcutHelpOverlay onClose={() => setShortcutHelpOpen(false)} />
      )}
    </div>
  );
}
