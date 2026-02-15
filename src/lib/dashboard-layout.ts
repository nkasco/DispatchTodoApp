"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type DashboardWidgetId =
  | "hero-stats"
  | "task-donut"
  | "upcoming"
  | "priority-dist"
  | "project-signals"
  | "project-rings"
  | "recent-activity";

export type DashboardWidgetDefinition = {
  id: DashboardWidgetId;
  label: string;
  description: string;
  defaultVisible: boolean;
};

export type DashboardWidgetState = DashboardWidgetDefinition & {
  visible: boolean;
};

type StoredDashboardLayout = {
  order?: string[];
  visibility?: Record<string, boolean>;
};

const STORAGE_KEY = "dispatch.dashboard.layout.v2";

const DASHBOARD_WIDGET_REGISTRY: DashboardWidgetDefinition[] = [
  {
    id: "hero-stats",
    label: "Hero + Quick Stats",
    description: "Active tasks hero with notes and dispatch summaries.",
    defaultVisible: true,
  },
  {
    id: "task-donut",
    label: "Task Status Donut",
    description: "Deadline focus and open/in-progress/done breakdown.",
    defaultVisible: true,
  },
  {
    id: "upcoming",
    label: "Upcoming Deadlines",
    description: "Overdue, today, and next-up due dates.",
    defaultVisible: true,
  },
  {
    id: "priority-dist",
    label: "Priority Distribution",
    description: "Active task mix across high, medium, and low priority.",
    defaultVisible: true,
  },
  {
    id: "project-rings",
    label: "Project Progress Rings",
    description: "Concentric completion rings for top projects.",
    defaultVisible: true,
  },
  {
    id: "project-signals",
    label: "Project Signals",
    description: "Active projects and recent project-linked task changes.",
    defaultVisible: true,
  },
  {
    id: "recent-activity",
    label: "Recent Activity",
    description: "Latest task and note activity cards.",
    defaultVisible: true,
  },
];

const DASHBOARD_WIDGET_IDS = new Set<DashboardWidgetId>(
  DASHBOARD_WIDGET_REGISTRY.map((widget) => widget.id),
);

function isWidgetId(value: string): value is DashboardWidgetId {
  return DASHBOARD_WIDGET_IDS.has(value as DashboardWidgetId);
}

function getDefaultLayout(): DashboardWidgetState[] {
  return DASHBOARD_WIDGET_REGISTRY.map((widget) => ({
    ...widget,
    visible: widget.defaultVisible,
  }));
}

function mergeWithRegistry(stored: StoredDashboardLayout | null): DashboardWidgetState[] {
  const defaults = getDefaultLayout();
  if (!stored) return defaults;

  const savedOrder = (stored.order ?? []).filter(isWidgetId);
  const mergedOrder = [
    ...savedOrder,
    ...defaults.map((item) => item.id).filter((id) => !savedOrder.includes(id)),
  ];

  const visibility = stored.visibility ?? {};
  const defaultMap = new Map(defaults.map((widget) => [widget.id, widget]));

  return mergedOrder
    .map((id) => {
      const base = defaultMap.get(id);
      if (!base) return null;
      return {
        ...base,
        visible:
          typeof visibility[id] === "boolean" ? visibility[id] : base.defaultVisible,
      };
    })
    .filter((widget): widget is DashboardWidgetState => Boolean(widget));
}

function readStoredLayout(): StoredDashboardLayout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDashboardLayout;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredLayout(layout: DashboardWidgetState[]) {
  const payload: StoredDashboardLayout = {
    order: layout.map((item) => item.id),
    visibility: Object.fromEntries(layout.map((item) => [item.id, item.visible])),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<DashboardWidgetState[]>(() => getDefaultLayout());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const merged = mergeWithRegistry(readStoredLayout());
    setWidgets(merged);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    writeStoredLayout(widgets);
  }, [isReady, widgets]);

  const toggleWidget = useCallback((id: DashboardWidgetId) => {
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, visible: !widget.visible } : widget,
      ),
    );
  }, []);

  const reorderWidgets = useCallback((fromIndex: number, toIndex: number) => {
    setWidgets((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length ||
        fromIndex === toIndex
      ) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setWidgets(getDefaultLayout());
  }, []);

  const visibleWidgets = useMemo(
    () => widgets.filter((widget) => widget.visible),
    [widgets],
  );

  return {
    widgets,
    visibleWidgets,
    isReady,
    toggleWidget,
    reorderWidgets,
    resetLayout,
  };
}
