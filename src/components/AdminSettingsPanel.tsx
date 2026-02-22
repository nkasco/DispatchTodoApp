"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, type AdminSecuritySettings, type AdminUser, type AdminVersionStatus, type UserRole } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { CustomSelect } from "@/components/CustomSelect";
import { IconCheckCircle, IconChevronDown, IconClock, IconKey, IconShield, IconTrash } from "@/components/icons";
import { USER_CREATION_DISABLED_MESSAGE } from "@/lib/security-messages";

interface AdminSettingsPanelProps {
  currentUserId: string;
}

type CreateUserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

function formatTimestamp(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getVersionStatusUi(status: AdminVersionStatus | null) {
  if (!status) {
    return {
      label: "Status Unavailable",
      detail: "The current version status is not available yet.",
      pillClass:
        "border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
      panelClass:
        "border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/50 text-neutral-700 dark:text-neutral-300",
    };
  }

  if (status.comparison === "up_to_date") {
    return {
      label: "Up to Date",
      detail: "This installation matches the latest published version.",
      pillClass:
        "border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
      panelClass:
        "border-emerald-200 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200",
    };
  }

  if (status.comparison === "behind") {
    return {
      label: "Update Available",
      detail: "A newer published version is available on GitHub.",
      pillClass:
        "border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
      panelClass:
        "border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200",
    };
  }

  if (status.comparison === "ahead") {
    return {
      label: "Ahead of Latest Release",
      detail: "This instance is running a version newer than the latest published release.",
      pillClass:
        "border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
      panelClass:
        "border-sky-200 dark:border-sky-900 bg-sky-50/80 dark:bg-sky-950/20 text-sky-800 dark:text-sky-200",
    };
  }

  return {
    label: "Status Unknown",
    detail: "Dispatch could not determine whether this instance is up to date.",
    pillClass:
      "border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
    panelClass:
      "border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/50 text-neutral-700 dark:text-neutral-300",
  };
}

export function AdminSettingsPanel({ currentUserId }: AdminSettingsPanelProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [security, setSecurity] = useState<AdminSecuritySettings | null>(null);
  const [versionStatus, setVersionStatus] = useState<AdminVersionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionLoading, setVersionLoading] = useState(true);
  const [versionRefreshing, setVersionRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    name: "",
    email: "",
    password: "",
    role: "member",
  });
  const [passwordResets, setPasswordResets] = useState<Record<string, string>>({});
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionPassphrase, setEncryptionPassphrase] = useState("");
  const [shareAiApiKeyWithUsers, setShareAiApiKeyWithUsers] = useState(false);
  const [userRegistrationEnabled, setUserRegistrationEnabled] = useState(true);
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const roleOptions = useMemo(
    () => [
      { value: "member", label: "Member", dot: "bg-neutral-400" },
      { value: "admin", label: "Administrator", dot: "bg-red-500" },
    ],
    [],
  );
  const versionUi = useMemo(() => getVersionStatusUi(versionStatus), [versionStatus]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextSecurity] = await Promise.all([
        api.admin.listUsers(),
        api.admin.getSecurity(),
      ]);
      setUsers(nextUsers);
      setSecurity(nextSecurity);
      setEncryptionEnabled(nextSecurity.databaseEncryptionEnabled);
      setShareAiApiKeyWithUsers(nextSecurity.shareAiApiKeyWithUsers);
      setUserRegistrationEnabled(nextSecurity.userRegistrationEnabled);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load administration data");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshVersionStatus = useCallback(async (showToastOnError: boolean, showLoadingSkeleton: boolean = false) => {
    if (showLoadingSkeleton) {
      setVersionLoading(true);
    }
    setVersionRefreshing(true);
    try {
      const nextStatus = await api.admin.getVersionStatus();
      setVersionStatus(nextStatus);
      if (nextStatus.error && showToastOnError) {
        toast.info(nextStatus.error);
      }
    } catch (error) {
      if (showToastOnError) {
        toast.error(error instanceof Error ? error.message : "Failed to load version status");
      }
    } finally {
      setVersionLoading(false);
      setVersionRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshAll();
    void refreshVersionStatus(false, true);
  }, [refreshAll, refreshVersionStatus]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userRegistrationEnabled) {
      toast.error(USER_CREATION_DISABLED_MESSAGE);
      return;
    }

    if (!createForm.email || !createForm.password) {
      toast.error("Email and password are required");
      return;
    }

    setBusyKey("create-user");
    try {
      await api.admin.createUser({
        name: createForm.name || undefined,
        email: createForm.email,
        password: createForm.password,
        role: createForm.role,
      });

      setCreateForm({ name: "", email: "", password: "", role: "member" });
      toast.success("User created");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    } finally {
      setBusyKey(null);
    }
  }

  async function runUserAction(
    userId: string,
    action:
      | { action: "freeze" }
      | { action: "unfreeze" }
      | { action: "set_role"; role: UserRole }
      | { action: "reset_password"; password: string },
  ) {
    setBusyKey(`${userId}:${action.action}`);
    try {
      await api.admin.updateUser(userId, action);
      toast.success("User updated");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    const target = usersById.get(userId);
    if (!target) return;

    const confirmed = window.confirm(`Delete account for ${target.email ?? target.name ?? userId}?`);
    if (!confirmed) return;

    setBusyKey(`${userId}:delete`);
    try {
      await api.admin.deleteUser(userId);
      toast.success("User deleted");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveEncryption() {
    if (encryptionEnabled && encryptionPassphrase.length < 12) {
      toast.error("Passphrase must be at least 12 characters");
      return;
    }

    setBusyKey("encryption");
    try {
      const next = await api.admin.updateSecurity({
        enabled: encryptionEnabled,
        passphrase: encryptionEnabled ? encryptionPassphrase : undefined,
      });
      setSecurity(next);
      setEncryptionEnabled(next.databaseEncryptionEnabled);
      setUserRegistrationEnabled(next.userRegistrationEnabled);
      setEncryptionPassphrase("");
      toast.success("Security settings updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update encryption settings");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveAiKeySharing() {
    setBusyKey("ai-key-sharing");
    try {
      const next = await api.admin.updateSecurity({
        shareAiApiKeyWithUsers,
      });
      setSecurity(next);
      setShareAiApiKeyWithUsers(next.shareAiApiKeyWithUsers);
      setUserRegistrationEnabled(next.userRegistrationEnabled);
      toast.success("AI key sharing setting updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update AI key sharing");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveUserRegistration() {
    setBusyKey("user-registration");
    try {
      const next = await api.admin.updateSecurity({
        userRegistrationEnabled,
      });
      setSecurity(next);
      setUserRegistrationEnabled(next.userRegistrationEnabled);
      toast.success("User registration setting updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user registration setting");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading administration controls...</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <IconShield className="w-4 h-4" />
            Administration
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Elevated account controls, role delegation, and security settings.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-red-300/80 dark:border-red-800/70 bg-red-100/90 dark:bg-red-900/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700 dark:text-red-300">
          Administrator Access
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-sky-200 dark:border-sky-900/60 bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:from-sky-950/35 dark:via-neutral-900 dark:to-emerald-950/20 p-4 space-y-3">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-300/30 blur-2xl dark:bg-sky-500/20" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
              <IconCheckCircle className="w-4 h-4" />
              Platform Version Status
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">
              Compare this running instance against the latest published Dispatch release.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void refreshVersionStatus(true);
            }}
            disabled={versionRefreshing}
            className="rounded-lg border border-sky-300/80 dark:border-sky-800 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-white/70 dark:bg-sky-950/30 hover:bg-white dark:hover:bg-sky-900/40 disabled:opacity-60"
          >
            {versionRefreshing ? "Checking..." : "Refresh"}
          </button>
        </div>

        {versionLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-10 rounded-lg bg-white/70 dark:bg-neutral-800/60" />
            <div className="h-10 rounded-lg bg-white/70 dark:bg-neutral-800/60" />
          </div>
        ) : (
          <div className="relative space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-sky-200 dark:border-sky-900/70 bg-sky-50/70 dark:bg-sky-950/30 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">Running</p>
                <p className="mt-1 text-sm font-semibold text-sky-900 dark:text-sky-100">v{versionStatus?.runningVersion ?? "unknown"}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">Latest Published</p>
                <p className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  {versionStatus?.latestVersion ? `v${versionStatus.latestVersion}` : "Unavailable"}
                </p>
              </div>
            </div>

            <div className={`rounded-lg border px-3 py-2 ${versionUi.panelClass}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${versionUi.pillClass}`}>
                  {versionUi.label}
                </span>
                <span className="text-xs">{versionUi.detail}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <IconClock className="w-3.5 h-3.5" />
                  Checked: {formatTimestamp(versionStatus?.checkedAt ?? null)}
                </span>
                {versionStatus?.publishedAt && (
                  <span className="inline-flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5" />
                    Published: {formatTimestamp(versionStatus.publishedAt)}
                  </span>
                )}
              </div>
              {versionStatus?.error && (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                  {versionStatus.error}
                </p>
              )}
              {versionStatus?.comparison === "behind" && (
                <div className="mt-3 rounded-md border border-amber-300/80 dark:border-amber-800/70 bg-amber-100/70 dark:bg-amber-900/30 p-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                  <p className="font-medium">Update available. Pull the latest version:</p>
                  <p>
                    <code className="rounded bg-white/70 dark:bg-neutral-900/70 px-1.5 py-0.5">./dispatch.sh pull</code>
                    {" "}or{" "}
                    <code className="rounded bg-white/70 dark:bg-neutral-900/70 px-1.5 py-0.5">.\dispatch.ps1 pull</code>
                  </p>
                </div>
              )}
              {versionStatus?.latestReleaseUrl && (
                <div className="mt-3 flex justify-end">
                  <a
                    href={versionStatus.latestReleaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:no-underline"
                  >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    View latest on GitHub
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Create User</h3>
        {!userRegistrationEnabled && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {USER_CREATION_DISABLED_MESSAGE}
          </p>
        )}
        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <input
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Name"
            disabled={!userRegistrationEnabled}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <input
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email"
            type="email"
            disabled={!userRegistrationEnabled}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <input
            value={createForm.password}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Password"
            type="password"
            disabled={!userRegistrationEnabled}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <CustomSelect
            label="Role"
            value={createForm.role}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, role: value as UserRole }))}
            options={roleOptions}
            disabled={!userRegistrationEnabled}
          />
          <button
            type="submit"
            disabled={busyKey === "create-user" || !userRegistrationEnabled}
            className="h-[42px] rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">User Registration</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Control whether Dispatch allows creation of new user accounts across registration and admin user creation.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={userRegistrationEnabled}
              onChange={(event) => setUserRegistrationEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            Allow new user creation
          </label>
          <button
            onClick={handleSaveUserRegistration}
            disabled={busyKey === "user-registration"}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
        <button
          type="button"
          onClick={() => setUserManagementOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors"
        >
          <span>User Management</span>
          <IconChevronDown
            className={`w-4 h-4 text-neutral-500 transition-transform ${
              userManagementOpen ? "" : "-rotate-90"
            }`}
          />
        </button>
        {userManagementOpen && (
          <div className="space-y-3">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const nextRole = user.role === "admin" ? "member" : "admin";
            const resetValue = passwordResets[user.id] ?? "";
            const providerSet = new Set(user.providers.map((provider) => provider.toLowerCase()));
            const hasGitHubProvider = providerSet.has("github");
            const hasLocalCredentials = user.hasPassword;
            return (
              <div
                key={user.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/70 px-3 py-3 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {user.name ?? "Unnamed User"}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user.email ?? user.id}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-1 text-neutral-700 dark:text-neutral-300">
                      {user.role === "admin" ? "Admin" : "Member"}
                    </span>
                    {hasGitHubProvider && (
                      <span className="rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-1">
                        GitHub
                      </span>
                    )}
                    {hasLocalCredentials && (
                      <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-1">
                        Local
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-1 ${
                        user.frozenAt
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      }`}
                    >
                      {user.frozenAt ? "Frozen" : "Active"}
                    </span>
                    {isSelf && (
                      <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-1">
                        You
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runUserAction(user.id, { action: user.frozenAt ? "unfreeze" : "freeze" })}
                    disabled={busyKey === `${user.id}:${user.frozenAt ? "unfreeze" : "freeze"}` || isSelf}
                    className="rounded-md border border-neutral-300 dark:border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {user.frozenAt ? "Unfreeze" : "Freeze"}
                  </button>
                  <button
                    onClick={() => runUserAction(user.id, { action: "set_role", role: nextRole })}
                    disabled={busyKey === `${user.id}:set_role` || isSelf}
                    className="rounded-md border border-neutral-300 dark:border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {user.role === "admin" ? "Demote to Member" : "Promote to Admin"}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={busyKey === `${user.id}:delete` || isSelf}
                    className="rounded-md border border-red-300 dark:border-red-800 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    value={resetValue}
                    onChange={(event) =>
                      setPasswordResets((prev) => ({
                        ...prev,
                        [user.id]: event.target.value,
                      }))
                    }
                    placeholder="New password (min 8 chars)"
                    className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-100 dark:placeholder:text-neutral-500 sm:min-w-[220px] sm:flex-1"
                  />
                  <button
                    onClick={() => {
                      if (resetValue.length < 8) {
                        toast.error("Password must be at least 8 characters");
                        return;
                      }
                      void runUserAction(user.id, { action: "reset_password", password: resetValue });
                      setPasswordResets((prev) => ({ ...prev, [user.id]: "" }));
                    }}
                    disabled={busyKey === `${user.id}:reset_password`}
                    className="rounded-md border border-blue-300 dark:border-blue-800 px-2.5 py-1.5 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <IconKey className="w-4 h-4" />
          Personal Assistant Key Sharing
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Allow Dispatch users without their own provider key to use an administrator-managed AI API key.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={shareAiApiKeyWithUsers}
              onChange={(event) => setShareAiApiKeyWithUsers(event.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            Make admin API key available to all users
          </label>
          <button
            onClick={handleSaveAiKeySharing}
            disabled={busyKey === "ai-key-sharing"}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Default is off.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <IconKey className="w-4 h-4" />
          Data-at-Rest Protection
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Optional SQLCipher-backed encryption for the SQLite file. Default is off.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-1 text-neutral-700 dark:text-neutral-300">
            SQLCipher: {security?.sqlCipherAvailable ? "available" : "not available"}
          </span>
          <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-1 text-neutral-700 dark:text-neutral-300">
            Encryption: {security?.databaseEncryptionEnabled ? "enabled" : "disabled"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={encryptionEnabled}
              onChange={(event) => setEncryptionEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            Enable encryption
          </label>
          <input
            type="password"
            value={encryptionPassphrase}
            onChange={(event) => setEncryptionPassphrase(event.target.value)}
            placeholder="Encryption passphrase"
            disabled={!encryptionEnabled}
            className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-100 dark:placeholder:text-neutral-500 sm:min-w-[260px] sm:flex-1"
          />
          <button
            onClick={handleSaveEncryption}
            disabled={busyKey === "encryption"}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
