"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/components/ThemeProvider";
import { api, type ProjectWithStats } from "@/lib/client";
import { PROJECT_COLORS } from "@/lib/projects";
import { BrandMark } from "@/components/BrandMark";
import {
  IconGrid,
  IconCalendar,
  IconChartBar,
  IconCheckCircle,
  IconDocument,
  IconFolder,
  IconSearch,
  IconChevronDown,
  IconSignOut,
  IconSun,
  IconMoon,
  IconPlus,
  IconHelp,
  IconInbox,
  IconTrash,
  IconList,
  IconPuzzle,
  IconShield,
  IconSparkles,
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
  { href: "/inbox", label: "Priority Inbox", icon: IconInbox },
  { href: "/tasks", label: "Tasks", icon: IconCheckCircle },
  { href: "/notes", label: "Notes", icon: IconDocument },
  { href: "/insights", label: "Insights", icon: IconChartBar },
  { href: "/recycle-bin", label: "Recycle Bin", icon: IconTrash },
];

export function Sidebar({ onSearchOpen, onShortcutHelp }: SidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.4.0";

  const defaultSectionsOpen = useMemo(
    () => ({
      main: true,
      workspace: true,
      projects: true,
      account: true,
    }),
    [],
  );

  const [collapsed, setCollapsed] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>(
    defaultSectionsOpen,
  );
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.projects.listWithStats({ status: "active" });
      setProjects(Array.isArray(data) ? data : data.data);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    function handleRefresh() {
      fetchProjects();
    }
    window.addEventListener("projects:refresh", handleRefresh);
    return () => window.removeEventListener("projects:refresh", handleRefresh);
  }, [fetchProjects]);

  // Read collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);

    const sectionState = localStorage.getItem("sidebar-sections-open");
    if (!sectionState) return;

    try {
      const parsed = JSON.parse(sectionState) as Record<string, boolean>;
      setSectionsOpen((prev) => ({
        ...prev,
        ...defaultSectionsOpen,
        ...parsed,
      }));
    } catch {
      setSectionsOpen(defaultSectionsOpen);
    }
  }, [defaultSectionsOpen]);

  useEffect(() => {
    localStorage.setItem("sidebar-sections-open", JSON.stringify(sectionsOpen));
  }, [sectionsOpen]);

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

  const profileActive = isActive("/profile");
  const integrationsActive = isActive("/integrations");
  const canShowAdminQuickAccess = session?.user?.role === "admin" && (session?.user?.showAdminQuickAccess ?? true);

  const currentProjectId = useMemo(() => {
    if (pathname.startsWith("/projects") || pathname.startsWith("/tasks")) {
      return searchParams.get("projectId") || "";
    }
    return "";
  }, [pathname, searchParams]);

  const projectsRootActive = pathname.startsWith("/projects") && !currentProjectId;
  const workspaceNavItems = useMemo(() => {
    const items = [...WORKSPACE_NAV];
    if (session?.user?.assistantEnabled ?? true) {
      items.unshift({ href: "/assistant", label: "Personal Assistant", icon: IconSparkles });
    }
    return items;
  }, [session?.user?.assistantEnabled]);

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
  const quickActionClassName =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/40 bg-blue-500/20 text-blue-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] hover:bg-blue-500/30 hover:border-blue-400/60 hover:text-white transition-all active:scale-[0.97] flex-shrink-0";

  return (
    <aside
      className={`flex flex-col bg-neutral-950 text-neutral-400 transition-all duration-300 ease-in-out h-screen flex-shrink-0 border-r border-neutral-800/50 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand */}
      <div className={`flex flex-shrink-0 border-b border-neutral-800/50 ${
        collapsed ? "flex-col items-center gap-2 py-3" : "items-center justify-between h-14 px-3"
      }`}>
        <Link
          href="/"
          className={`flex items-center hover:opacity-80 transition-opacity ${
            collapsed ? "" : "gap-3 min-w-0"
          }`}
          title={collapsed ? `Dispatch v${appVersion}` : "Go to Dashboard"}
        >
          <BrandMark compact className="flex-shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-lg font-bold text-white whitespace-nowrap">
                Dispatch
              </span>
              <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                v{appVersion}
              </p>
            </div>
          )}
        </Link>
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-500 hover:bg-neutral-800/40 hover:text-neutral-300 transition-colors flex-shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconList className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className={`sidebar-scrollbar flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-4 ${
        collapsed ? "px-2" : "px-3"
      }`}>
        {/* Overview section */}
        <div>
          {!collapsed && (
            <button
              onClick={() => toggleSection("main")}
              className="flex items-center w-full mb-1 justify-between px-2"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                Overview
              </span>
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.main ? "" : "-rotate-90"
                }`}
              />
            </button>
          )}

          {(sectionsOpen.main || collapsed) && (
            <div className="space-y-3">
              {!collapsed && (
                <div className="flex items-center justify-center gap-2 px-3 pt-2 pb-1">
                  {quickActions.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={action.key}
                        onClick={action.onClick}
                        title={action.label}
                        aria-label={action.label}
                        className={quickActionClassName}
                      >
                        <ActionIcon className="w-4 h-4 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
              <ul className="space-y-0.5">
                {OVERVIEW_NAV.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`group/nav flex items-center rounded-lg py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                          active
                            ? "bg-neutral-800/60 text-white"
                            : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                        } ${collapsed ? "justify-center" : "gap-3 px-3"}`}
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
            </div>
          )}
        </div>

        {/* Workspace section */}
        <div className="pt-3 border-t border-neutral-800/50">
          {!collapsed && (
            <button
              onClick={() => toggleSection("workspace")}
              className="flex items-center w-full mb-1 justify-between px-2"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                Workspace
              </span>
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.workspace ? "" : "-rotate-90"
                }`}
              />
            </button>
          )}

          {(sectionsOpen.workspace || collapsed) && (
            <ul className="space-y-0.5">
              {workspaceNavItems.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group/nav flex items-center rounded-lg py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                        active
                          ? "bg-neutral-800/60 text-white"
                          : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                      } ${collapsed ? "justify-center" : "gap-3 px-3"}`}
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

        {/* Projects section */}
        <div className="pt-3 border-t border-neutral-800/50">
          {!collapsed && (
            <button
              onClick={() => toggleSection("projects")}
              className="flex items-center w-full mb-1 justify-between px-2"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                Projects
              </span>
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.projects ? "" : "-rotate-90"
                }`}
              />
            </button>
          )}

          {(sectionsOpen.projects || collapsed) && (
            <ul className="space-y-0.5">
              <li>
                <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
                  <Link
                    href="/projects"
                    title={collapsed ? "All Projects" : undefined}
                    className={`group/nav flex items-center rounded-lg py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                      projectsRootActive
                        ? "bg-neutral-800/60 text-white"
                        : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                    } ${collapsed ? "justify-center" : "flex-1 gap-3 px-3"}`}
                  >
                    <IconFolder className="w-5 h-5 flex-shrink-0" />
                    <span
                      className={`whitespace-nowrap transition-all duration-300 flex-1 ${
                        collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                      }`}
                    >
                      All Projects
                    </span>
                  </Link>
                  {!collapsed && (
                    <button
                      onClick={() => router.push("/projects?new=1")}
                      title="New Project"
                      aria-label="New Project"
                      className="group/new-project flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900/50 text-neutral-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-neutral-800/80 hover:text-white transition-all active:scale-[0.97]"
                    >
                      <IconPlus className="w-3.5 h-3.5 transition-transform duration-200 group-hover/new-project:rotate-90" />
                    </button>
                  )}
                </div>
              </li>
              {projects.length === 0 ? (
                <li className={`px-3 py-2 text-xs text-neutral-600 ${collapsed ? "hidden" : ""}`}>
                  No active projects
                </li>
              ) : (
                projects.map((project) => {
                  const active = project.id === currentProjectId;
                  const color = PROJECT_COLORS[project.color]?.dot ?? "bg-blue-500";
                  return (
                    <li key={project.id}>
                      <Link
                        href={`/projects?projectId=${project.id}`}
                        title={collapsed ? project.name : undefined}
                        className={`group/nav flex items-center rounded-lg py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                          active
                            ? "bg-neutral-800/60 text-white"
                            : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                        } ${collapsed ? "justify-center" : "gap-3 px-3"}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${color}`} />
                        {!collapsed && (
                          <>
                            <span className="whitespace-nowrap flex-1">
                              {project.name}
                            </span>
                            <span className="text-xs text-neutral-500 group-hover/nav:text-neutral-300">
                              {project.stats.total}
                            </span>
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

      </nav>

      {/* Account section */}
      {session?.user && (
        <div className={`border-t border-neutral-800/50 py-3 flex-shrink-0 ${
          collapsed ? "px-2" : "px-3"
        }`}>
          {!collapsed && (
            <button
              onClick={() => toggleSection("account")}
              className="flex items-center w-full mb-2 justify-between px-2"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                Account
              </span>
              <IconChevronDown
                className={`w-3.5 h-3.5 text-neutral-600 transition-transform duration-200 ${
                  sectionsOpen.account ? "" : "-rotate-90"
                }`}
              />
            </button>
          )}

          {(sectionsOpen.account || collapsed) && (
            <ul className="space-y-0.5">
              {/* Theme toggle */}
              <li>
                <button
                  onClick={toggleTheme}
                  title={collapsed ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : undefined}
                  className={`flex items-center w-full rounded-lg py-2 text-sm text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 transition-all active:scale-[0.97] ${
                    collapsed ? "justify-center" : "gap-3 px-3"
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

              {/* Integrations */}
              <li>
                <Link
                  href="/integrations"
                  title={collapsed ? "Integrations" : undefined}
                  className={`flex items-center rounded-lg py-2 text-sm transition-all ${
                    integrationsActive
                      ? "bg-neutral-800/60 text-white"
                      : "text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200"
                  } ${collapsed ? "justify-center" : "gap-3 px-3"}`}
                >
                  <IconPuzzle className="w-5 h-5 flex-shrink-0" />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                    }`}
                  >
                    Integrations
                  </span>
                </Link>
              </li>

              {/* Shortcuts */}
              <li>
                <button
                  onClick={onShortcutHelp}
                  title={collapsed ? "Shortcuts" : undefined}
                  className={`flex items-center w-full rounded-lg py-2 text-sm text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 transition-colors ${
                    collapsed ? "justify-center" : "gap-3 px-3"
                  }`}
                >
                  <IconHelp className="w-5 h-5 flex-shrink-0" />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                    }`}
                  >
                    Shortcuts
                  </span>
                </button>
              </li>

              {/* Profile */}
              <li>
                <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
                  <Link
                    href="/profile"
                    title={collapsed ? "Profile" : undefined}
                    className={`flex items-center rounded-lg py-2 transition-all ${
                      profileActive
                        ? "bg-neutral-800/60 text-white"
                        : "text-neutral-300 hover:bg-neutral-800/40 hover:text-neutral-200"
                    } ${collapsed ? "justify-center" : "flex-1 gap-3 px-3"}`}
                  >
                    {session.user.image ? (
                      <img
                        src={session.user.image}
                        alt=""
                        className="w-5 h-5 rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-neutral-700 flex-shrink-0 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
                        </svg>
                      </div>
                    )}
                    <span
                      className={`text-sm truncate whitespace-nowrap transition-all duration-300 ${
                        collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                      }`}
                    >
                      {session.user.name || session.user.email}
                    </span>
                  </Link>
                  {!collapsed && (
                    <div className="flex items-center gap-1.5">
                      {canShowAdminQuickAccess && (
                        <Link
                          href="/administration"
                          title="Administration"
                          aria-label="Administration"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-700/60 bg-red-950/20 text-red-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-red-900/40 hover:text-red-200 transition-all active:scale-[0.97]"
                        >
                          <IconShield className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        title="Sign out"
                        aria-label="Sign out"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900/50 text-neutral-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-neutral-800/80 hover:text-white transition-all active:scale-[0.97]"
                      >
                        <IconSignOut className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            </ul>
          )}
        </div>
      )}

    </aside>
  );
}
