"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type AdminSecuritySettings, type AdminUser, type UserRole } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { CustomSelect } from "@/components/CustomSelect";
import { IconChevronDown, IconKey, IconShield, IconTrash } from "@/components/icons";

interface AdminSettingsPanelProps {
  currentUserId: string;
}

type CreateUserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export function AdminSettingsPanel({ currentUserId }: AdminSettingsPanelProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [security, setSecurity] = useState<AdminSecuritySettings | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const roleOptions = useMemo(
    () => [
      { value: "member", label: "Member", dot: "bg-neutral-400" },
      { value: "admin", label: "Administrator", dot: "bg-red-500" },
    ],
    [],
  );

  async function refreshAll() {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load administration data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      toast.success("AI key sharing setting updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update AI key sharing");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading administration controls...</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-4">
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

      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Create User</h3>
        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <input
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Name"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <input
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email"
            type="email"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <input
            value={createForm.password}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Password"
            type="password"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <CustomSelect
            label="Role"
            value={createForm.role}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, role: value as UserRole }))}
            options={roleOptions}
          />
          <button
            type="submit"
            disabled={busyKey === "create-user"}
            className="h-[42px] rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Create
          </button>
        </form>
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
                    className="min-w-[220px] flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
        <div className="flex items-center gap-2 text-xs">
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
            className="min-w-[260px] flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
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
