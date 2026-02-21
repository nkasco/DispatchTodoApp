"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/client";
import { IconCheck, IconChevronLeft } from "@/components/icons";
import { getIsoDateForTimeZone } from "@/lib/timezone";

interface DispatchHistoryOverlayProps {
  currentDate: string;
  onClose: () => void;
  onDateSelect: (date: string) => void;
}

export function DispatchHistoryOverlay({
  currentDate,
  onClose,
  onDateSelect,
}: DispatchHistoryOverlayProps) {
  const { data: session } = useSession();
  const today = getIsoDateForTimeZone(new Date(), session?.user?.timeZone ?? null);
  const [year, setYear] = useState(() => parseInt(currentDate.split("-")[0], 10));
  const [month, setMonth] = useState(() => parseInt(currentDate.split("-")[1], 10));
  const [calendarData, setCalendarData] = useState<Record<string, { finalized: boolean; taskCount: number }>>({});
  const [loading, setLoading] = useState(true);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.dispatches.calendar(year, month);
      setCalendarData(data.dates);
    } catch {
      setCalendarData({});
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

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

  function navigateMonth(offset: number) {
    let newMonth = month + offset;
    let newYear = year;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    setMonth(newMonth);
    setYear(newYear);
  }

  function goToToday() {
    const [todayYear, todayMonth] = today.split("-");
    setYear(parseInt(todayYear, 10));
    setMonth(parseInt(todayMonth, 10));
  }

  // Generate calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

  const calendarDays: (number | null)[] = [];
  // Add empty cells for days before the 1st
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarDays.push(null);
  }
  // Add actual days
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long" });

  function handleDateClick(day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onDateSelect(dateStr);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 animate-backdrop-enter" onClick={onClose} />
      <div className="relative mx-3 w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl animate-slide-down-fade dark:bg-neutral-900 sm:mx-4">
        {/* Header */}
        <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-800 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Dispatch History
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Month navigation */}
        <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-800 sm:px-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateMonth(-1)}
              className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
              aria-label="Previous month"
            >
              <IconChevronLeft className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </button>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {monthName} {year}
            </h3>
            <button
              onClick={() => navigateMonth(1)}
              className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
              aria-label="Next month"
            >
              <IconChevronLeft className="w-5 h-5 text-neutral-600 dark:text-neutral-400 rotate-180" />
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="inline-block w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spinner" />
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-semibold text-neutral-500 dark:text-neutral-400 py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} />;
                  }

                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dispatchInfo = calendarData[dateStr];
                  const isToday = dateStr === today;
                  const isSelected = dateStr === currentDate;
                  const hasDispatch = !!dispatchInfo;

                  return (
                    <button
                      key={day}
                      onClick={() => handleDateClick(day)}
                      className={`
                        relative aspect-square rounded-lg p-2 text-sm font-medium transition-all
                        ${isToday ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-neutral-900" : ""}
                        ${isSelected ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : ""}
                        ${!isSelected && hasDispatch ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white" : ""}
                        ${!isSelected && !hasDispatch ? "text-neutral-400 dark:text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50" : ""}
                        ${!isSelected && hasDispatch ? "hover:bg-neutral-200 dark:hover:bg-neutral-700" : ""}
                        active:scale-95
                      `}
                    >
                      <span className="block">{day}</span>
                      {dispatchInfo && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                          {dispatchInfo.finalized && (
                            <IconCheck className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                          )}
                          {dispatchInfo.taskCount > 0 && (
                            <span className="w-1 h-1 rounded-full bg-blue-500" />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-neutral-200 px-4 py-4 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            <IconCheck className="w-3 h-3 inline text-green-600 dark:text-green-400 mr-1" />
            Finalized
            <span className="mx-2">•</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />
            Has tasks
          </p>
          <button
            onClick={goToToday}
            className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:scale-95 transition-all"
          >
            Today
          </button>
        </div>
      </div>
    </div>
  );
}
