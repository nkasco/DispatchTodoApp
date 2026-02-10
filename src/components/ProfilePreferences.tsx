"use client";

import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { IconSun, IconMoon } from "@/components/icons";
import { api } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { signOut, useSession } from "next-auth/react";

export function ProfilePreferences({
  isAdmin = false,
  showAdminQuickAccess = true,
}: {
  isAdmin?: boolean;
  showAdminQuickAccess?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const { update } = useSession();
  const { toast } = useToast();
  const [showAdminButton, setShowAdminButton] = useState(showAdminQuickAccess);
  const [savingAdminButtonPref, setSavingAdminButtonPref] = useState(false);

  async function handleToggleAdminButton() {
    const next = !showAdminButton;
    setShowAdminButton(next);
    setSavingAdminButtonPref(true);

    try {
      await api.me.updatePreferences({ showAdminQuickAccess: next });
      await update();
    } catch (error) {
      setShowAdminButton(!next);
      toast.error(error instanceof Error ? error.message : "Failed to update preference");
    } finally {
      setSavingAdminButtonPref(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Preferences</h2>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            Personalize how Dispatch looks and feels.
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-all active:scale-95"
        >
          Sign Out
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Theme</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Switch between light and dark mode.
          </p>
        </div>
        <button
          onClick={toggleTheme}
          className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95 inline-flex items-center gap-2"
        >
          {theme === "dark" ? (
            <>
              <IconSun className="w-4 h-4" />
              Light Mode
            </>
          ) : (
            <>
              <IconMoon className="w-4 h-4" />
              Dark Mode
            </>
          )}
        </button>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Admin Quick Access Button</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Show or hide the icon-only admin button in the sidebar next to Sign Out.
            </p>
          </div>
          <button
            onClick={handleToggleAdminButton}
            disabled={savingAdminButtonPref}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 disabled:opacity-60 ${
              showAdminButton
                ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
                : "border border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {showAdminButton ? "Shown" : "Hidden"}
          </button>
        </div>
      )}
    </div>
  );
}
