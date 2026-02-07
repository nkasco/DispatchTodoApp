"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  IconGrid,
  IconCalendar,
  IconCheckCircle,
  IconDocument,
  IconSearch,
  IconChevronLeft,
  IconChevronDown,
  IconSignOut,
  IconSun,
  IconMoon,
  IconBolt,
  IconUser,
  IconPlus,
  IconHelp,
} from "@/components/icons";

interface SidebarProps {
  onSearchOpen: () => void;
  onShortcutHelp: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const OVERVIEW_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: IconGrid },
];

const WORKSPACE_NAV: NavItem[] = [
  { href: "/dispatch", label: "Dispatch", icon: IconCalendar },
  { href: "/tasks", label: "Tasks", icon: IconCheckCircle },
  { href: "/notes", label: "Notes", icon: IconDocument },
];

export function Sidebar({ onSearchOpen, onShortcutHelp }: SidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    main: true,
    workspace: true,
    utilities: true,
    account: true,
  });

  // Read collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function toggleSection(key: string) {
    if (collapsed) return;
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const quickActions = [
    {
      key: "task",
      label: "New Task",
      icon: IconPlus,
      onClick: () => {
        if (pathname.startsWith("/tasks")) {
          window.dispatchEvent(new CustomEvent("shortcut:new-task"));
          return;
        }
        router.push("/tasks?new=1");
      },
    },
    {
      key: "note",
      label: "New Note",
      icon: IconDocument,
      onClick: () => {
        if (pathname.startsWith("/notes")) {
          window.dispatchEvent(new CustomEvent("shortcut:new-note"));
          return;
        }
        router.push("/notes?new=1");
      },
    },
    {
      key: "dispatch",
      label: "Open Dispatch",
      icon: IconCalendar,
      onClick: () => router.push("/dispatch"),
    },
    {
      key: "search",
      label: "Search",
      icon: IconSearch,
      onClick: onSearchOpen,
    },
  ];

  const utilities = [
    { key: "search", label: "Search", icon: IconSearch, onClick: onSearchOpen },
    { key: "shortcuts", label: "Shortcuts", icon: IconHelp, onClick: onShortcutHelp },
  ];

  return (
    <aside
      className={`flex flex-col bg-neutral-950 text-neutral-400 transition-all duration-300 ease-in-out h-screen flex-shrink-0 border-r border-neutral-800/50 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-neutral-800/50">
        <IconBolt className="w-6 h-6 text-blue-400 flex-shrink-0" />
        <span
          className={`text-lg font-bold text-white whitespace-nowrap transition-all duration-300 ${
            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          }`}
        >
          Dispatch
        </span>
      </div>

      {/* Search trigger */}
      <div className="px-3 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={onSearchOpen}
          className={`flex items-center gap-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-500 transition-all hover:border-neutral-700 hover:text-neutral-400 active:scale-95 ${
            collapsed ? "px-2.5 py-2 justify-center" : "px-3 py-2"
          }`}
        >
          <IconSearch className="w-4 h-4 flex-shrink-0" />
          <span
            className={`text-sm whitespace-nowrap transition-all duration-300 ${
              collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
            }`}
          >
            Search...
          </span>
          {!collapsed && (
            <kbd className="ml-auto text-xs text-neutral-600 bg-neutral-800 rounded px-1.5 py-0.5">
              Ctrl+K
            </kbd>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {/* Overview section */}
        <div>
          <button
            onClick={() => toggleSection("main")}
            className={`flex items-center w-full mb-1 ${
              collapsed ? "justify-center px-2" : "justify-between px-2"
            }`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap transition-all duration-300 ${
                collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
              }`}
            >
              Overview
            </span>
            {!collapsed && (
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.main ? "" : "-rotate-90"
                }`}
              />
            )}
          </button>

          {(sectionsOpen.main || collapsed) && (
            <div className="space-y-3">
              <ul className="space-y-0.5">
                {OVERVIEW_NAV.map((item, index) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                          active
                            ? "bg-neutral-800/60 text-white"
                            : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                        } ${collapsed ? "justify-center px-2" : ""}`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${
                            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                      {index === 0 && (
                        <div className="flex items-center justify-center gap-2 px-3 pt-2 pb-1">
                          {quickActions.map((action) => {
                            const ActionIcon = action.icon;
                            return (
                              <button
                                key={action.key}
                                onClick={action.onClick}
                                title={action.label}
                                aria-label={action.label}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700/70 bg-neutral-900/50 text-neutral-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-neutral-800/80 hover:text-white transition-all active:scale-[0.97] flex-shrink-0"
                              >
                                <ActionIcon className="w-4 h-4 flex-shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Workspace section */}
        <div className="pt-3 border-t border-neutral-800/50">
          <button
            onClick={() => toggleSection("workspace")}
            className={`flex items-center w-full mb-1 ${
              collapsed ? "justify-center px-2" : "justify-between px-2"
            }`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap transition-all duration-300 ${
                collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
              }`}
            >
              Workspace
            </span>
            {!collapsed && (
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.workspace ? "" : "-rotate-90"
                }`}
              />
            )}
          </button>

          {(sectionsOpen.workspace || collapsed) && (
            <ul className="space-y-0.5">
              {WORKSPACE_NAV.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                        active
                          ? "bg-neutral-800/60 text-white"
                          : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                      } ${collapsed ? "justify-center px-2" : ""}`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span
                        className={`whitespace-nowrap transition-all duration-300 ${
                          collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                        }`}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Utilities section */}
        <div className="pt-3 border-t border-neutral-800/50">
          <button
            onClick={() => toggleSection("utilities")}
            className={`flex items-center w-full mb-1 ${
              collapsed ? "justify-center px-2" : "justify-between px-2"
            }`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap transition-all duration-300 ${
                collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
              }`}
            >
              Utilities
            </span>
            {!collapsed && (
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.utilities ? "" : "-rotate-90"
                }`}
              />
            )}
          </button>

          {(sectionsOpen.utilities || collapsed) && (
            <ul className="space-y-0.5">
              {utilities.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <button
                      onClick={item.onClick}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                        collapsed ? "justify-center px-2" : ""
                      } text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span
                        className={`whitespace-nowrap transition-all duration-300 ${
                          collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      {/* Account section */}
      {session?.user && (
        <div className="border-t border-neutral-800/50 px-3 py-3 flex-shrink-0">
          <button
            onClick={() => toggleSection("account")}
            className={`flex items-center w-full mb-2 ${
              collapsed ? "justify-center px-2" : "justify-between px-2"
            }`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap transition-all duration-300 ${
                collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
              }`}
            >
              Account
            </span>
            {!collapsed && (
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.account ? "" : "-rotate-90"
                }`}
              />
            )}
          </button>

          {(sectionsOpen.account || collapsed) && (
            <ul className="space-y-0.5">
              {/* User info */}
              <li
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  collapsed ? "justify-center px-2" : ""
                }`}
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-5 h-5 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-neutral-700 flex-shrink-0" />
                )}
                <span
                  className={`text-sm text-neutral-300 truncate whitespace-nowrap transition-all duration-300 ${
                    collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                  }`}
                >
                  {session.user.name || session.user.email}
                </span>
              </li>

              {/* Profile */}
              <li>
                <Link
                  href="/profile"
                  title={collapsed ? "Profile" : undefined}
                  className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 transition-colors ${
                    collapsed ? "justify-center px-2" : ""
                  }`}
                >
                  <IconUser className="w-5 h-5 flex-shrink-0" />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                    }`}
                  >
                    Profile
                  </span>
                </Link>
              </li>

              {/* Theme toggle */}
              <li>
                <button
                  onClick={toggleTheme}
                  title={collapsed ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : undefined}
                  className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 transition-all active:scale-[0.97] ${
                    collapsed ? "justify-center px-2" : ""
                  }`}
                >
                  {theme === "dark" ? (
                    <IconSun key="sun" className="w-5 h-5 flex-shrink-0 animate-icon-spin-in" />
                  ) : (
                    <IconMoon key="moon" className="w-5 h-5 flex-shrink-0 animate-icon-spin-in" />
                  )}
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                    }`}
                  >
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </span>
                </button>
              </li>

              {/* Sign out */}
              <li>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  title={collapsed ? "Sign out" : undefined}
                  className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 transition-colors ${
                    collapsed ? "justify-center px-2" : ""
                  }`}
                >
                  <IconSignOut className="w-5 h-5 flex-shrink-0" />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                    }`}
                  >
                    Sign out
                  </span>
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-neutral-800/50 p-3 flex-shrink-0">
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center w-full rounded-lg py-2 text-neutral-500 hover:bg-neutral-800/40 hover:text-neutral-300 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconChevronLeft
            className={`w-5 h-5 transition-transform duration-300 ${
              collapsed ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    </aside>
  );
}
