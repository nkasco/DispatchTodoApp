"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "@/components/CustomSelect";
import {
  api,
  type ConnectorAuditEntry,
  type ConnectorCatalogEntry,
  type ConnectorConflictEntry,
  type ConnectorProvider,
  type ConnectorRecord,
  type ConnectorSyncDirection,
} from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import {
  IconBolt,
  IconCalendar,
  IconCheckCircle,
  IconCode,
  IconCopy,
  IconPuzzle,
  IconShield,
  IconTrash,
} from "@/components/icons";

const PROVIDER_OPTIONS: Array<{ value: ConnectorProvider; label: string }> = [
  { value: "rest", label: "REST/OAuth" },
  { value: "caldav", label: "CalDAV" },
  { value: "local_uri", label: "Local Automation" },
];

const SYNC_OPTIONS: Array<{ value: ConnectorSyncDirection; label: string }> = [
  { value: "push", label: "Push only" },
  { value: "pull", label: "Pull only" },
  { value: "bidirectional", label: "Bi-directional" },
];

const PROVIDER_ICONS = {
  rest: IconCode,
  caldav: IconCalendar,
  local_uri: IconBolt,
} as const;

export function ExternalTaskConnectorsSection() {
  const { toast } = useToast();
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([]);
  const [audit, setAudit] = useState<ConnectorAuditEntry[]>([]);
  const [conflicts, setConflicts] = useState<ConnectorConflictEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runningIds, setRunningIds] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ConnectorProvider>("rest");
  const [syncDirection, setSyncDirection] = useState<ConnectorSyncDirection>("push");
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [taskPath, setTaskPath] = useState("/tasks");
  const [projectPath, setProjectPath] = useState("/projects");
  const [healthPath, setHealthPath] = useState("/health");
  const [collectionUrl, setCollectionUrl] = useState("");
  const [useEventFallback, setUseEventFallback] = useState(true);
  const [createTemplate, setCreateTemplate] = useState("app:///add?title={{title}}&token={{token}}");
  const [updateTemplate, setUpdateTemplate] = useState("app:///update?id={{externalId}}&title={{title}}&token={{token}}");
  const [deleteTemplate, setDeleteTemplate] = useState("app:///delete?id={{externalId}}&token={{token}}");
  const [bridgeMode, setBridgeMode] = useState(true);
  const [bridgeDirectory, setBridgeDirectory] = useState("");

  const activeCatalog = useMemo(
    () => catalog.find((entry) => entry.provider === provider) ?? null,
    [catalog, provider],
  );

  async function loadConnectors() {
    setLoading(true);
    try {
      const result = await api.integrations.connectors.list();
      setConnectors(result.connectors);
      setCatalog(result.catalog);
      setAudit(result.audit);
      setConflicts(result.conflicts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConnectors();
  }, []);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Connector name is required");
      return;
    }

    setCreating(true);
    try {
      const settings =
        provider === "rest"
          ? { taskPath, projectPath, healthPath }
          : provider === "caldav"
            ? { collectionUrl, useEventFallback }
            : { createTemplate, updateTemplate, deleteTemplate, bridgeMode, bridgeDirectory: bridgeDirectory || null };

      await api.integrations.connectors.create({
        name: name.trim(),
        provider,
        syncDirection,
        baseUrl: provider === "caldav" ? collectionUrl : baseUrl || null,
        settings,
        authToken: authToken || null,
        username: username || null,
        password: password || null,
      });

      setName("");
      setAuthToken("");
      setUsername("");
      setPassword("");
      toast.success("Connector created");
      await loadConnectors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create connector");
    } finally {
      setCreating(false);
    }
  }

  async function runAction(id: string, action: "test" | "sync" | "delete" | "disable" | "enable") {
    setRunningIds((prev) => [...prev, id]);
    try {
      if (action === "test") {
        const result = await api.integrations.connectors.test(id);
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } else if (action === "sync") {
        const result = await api.integrations.connectors.sync(id);
        toast.success(`Processed ${result.processed} item(s), delivered ${result.delivered}`);
      } else if (action === "delete") {
        await api.integrations.connectors.delete(id);
        toast.success("Connector deleted");
      } else if (action === "disable" || action === "enable") {
        await api.integrations.connectors.update(id, { status: action === "disable" ? "disabled" : "active" });
        toast.success(action === "disable" ? "Connector disabled" : "Connector enabled");
      }

      await loadConnectors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connector action failed");
    } finally {
      setRunningIds((prev) => prev.filter((entry) => entry !== id));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <IconPuzzle className="w-6 h-6 text-amber-500" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">External Task Connectors</h2>
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl">
            Connect Dispatch to external task systems with connector-specific sync rules, encrypted tokens, manual re-sync,
            webhook intake, and audit visibility.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">
          Plain-text formats remain export-only in v1. Use CSV or ICS exports for import-only targets.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Add Connector</h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Choose a connector type and provide the connection details or local automation templates it needs.
            </p>
          </div>

          <label className="text-xs text-neutral-500 dark:text-neutral-400">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My external task system"
              className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <CustomSelect
              label="Provider"
              value={provider}
              onChange={(value) => setProvider(value as ConnectorProvider)}
              options={PROVIDER_OPTIONS}
            />
            <CustomSelect
              label="Sync Direction"
              value={syncDirection}
              onChange={(value) => setSyncDirection(value as ConnectorSyncDirection)}
              options={SYNC_OPTIONS}
            />
          </div>

          {provider === "rest" && (
            <>
              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Base URL
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://tasks.example.com/api"
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Task Path" value={taskPath} onChange={setTaskPath} />
                <TextField label="Project Path" value={projectPath} onChange={setProjectPath} />
                <TextField label="Health Path" value={healthPath} onChange={setHealthPath} />
              </div>
            </>
          )}

          {provider === "caldav" && (
            <>
              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Collection URL
                <input
                  value={collectionUrl}
                  onChange={(event) => setCollectionUrl(event.target.value)}
                  placeholder="https://dav.example.com/tasks/dispatch"
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
                />
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={useEventFallback}
                  onChange={(event) => setUseEventFallback(event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                />
                Use VEVENT fallback for tasks without due dates
              </label>
            </>
          )}

          {provider === "local_uri" && (
            <>
              <TextAreaField label="Create URI Template" value={createTemplate} onChange={setCreateTemplate} />
              <TextAreaField label="Update URI Template" value={updateTemplate} onChange={setUpdateTemplate} />
              <TextAreaField label="Delete URI Template" value={deleteTemplate} onChange={setDeleteTemplate} />
              <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={bridgeMode}
                  onChange={(event) => setBridgeMode(event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                />
                Enable desktop bridge mode
              </label>
              <TextField label="Bridge Directory (optional)" value={bridgeDirectory} onChange={setBridgeDirectory} />
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Auth Token" value={authToken} onChange={setAuthToken} type="password" />
            <TextField label="Username" value={username} onChange={setUsername} />
            <TextField label="Password" value={password} onChange={setPassword} type="password" />
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-all active:scale-95 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Connector"}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-amber-50 via-white to-sky-50 dark:from-amber-950/20 dark:via-neutral-900 dark:to-sky-950/20 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white dark:bg-neutral-900 p-2 shadow-sm">
              {activeCatalog ? (
                <ProviderIcon provider={activeCatalog.provider} className="h-5 w-5 text-amber-600 dark:text-amber-300" />
              ) : (
                <IconShield className="h-5 w-5 text-amber-600 dark:text-amber-300" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                {activeCatalog?.label ?? "Connector capabilities"}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {activeCatalog?.description ?? "Choose a connector to review its capability footprint."}
              </p>
            </div>
          </div>

          {activeCatalog && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <CapabilityPill label="Push tasks" active={activeCatalog.capabilityFlags.pushTasks} />
              <CapabilityPill label="Pull tasks" active={activeCatalog.capabilityFlags.pullTasks} />
              <CapabilityPill label="Bi-directional" active={activeCatalog.capabilityFlags.biDirectional} />
              <CapabilityPill label="Webhooks" active={activeCatalog.capabilityFlags.webhooks} />
              <CapabilityPill label="Push projects" active={activeCatalog.capabilityFlags.pushProjects} />
              <CapabilityPill label="Desktop bridge" active={activeCatalog.capabilityFlags.requiresDesktopBridge} />
              <CapabilityPill label="Local only" active={activeCatalog.capabilityFlags.localOnly} />
              <CapabilityPill label="Export only" active={activeCatalog.capabilityFlags.exportOnly} />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading connectors...</div>
      ) : connectors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No connectors configured yet.
        </div>
      ) : (
        <div className="space-y-4">
          {connectors.map((connector) => (
            <div
              key={connector.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2">
                      <ProviderIcon provider={connector.provider} className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-white">{connector.name}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {connector.provider} · {connector.syncDirection} · status {connector.status}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <ConnectorStat label="Pending" value={String(connector.pendingCount)} />
                    <ConnectorStat label="Failed" value={String(connector.failedCount)} />
                    <ConnectorStat label="Last sync" value={connector.lastSyncedAt ? new Date(connector.lastSyncedAt).toLocaleString() : "Never"} />
                  </div>
                  {connector.lastError && (
                    <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{connector.lastError}</p>
                  )}
                  {connector.webhookUrl && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <code className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1">{connector.webhookUrl}</code>
                      <button
                        type="button"
                        onClick={() => void copy(connector.webhookUrl ?? "")}
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <IconCopy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runAction(connector.id, "test")}
                    disabled={runningIds.includes(connector.id)}
                    className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction(connector.id, "sync")}
                    disabled={runningIds.includes(connector.id)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                  >
                    Sync
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction(connector.id, connector.status === "disabled" ? "enable" : "disable")}
                    disabled={runningIds.includes(connector.id)}
                    className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {connector.status === "disabled" ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction(connector.id, "delete")}
                    disabled={runningIds.includes(connector.id)}
                    className="rounded-lg border border-rose-300 dark:border-rose-900/60 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 p-4">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Sync Audit Log</h3>
          <div className="mt-3 space-y-3">
            {audit.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">No sync activity yet.</p>
            ) : (
              audit.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={`font-semibold ${entry.level === "error" ? "text-rose-600 dark:text-rose-300" : entry.level === "warning" ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}`}>
                      {entry.eventType}
                    </span>
                    <span className="text-neutral-400 dark:text-neutral-500">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">{entry.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 p-4">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Conflict Markers</h3>
          <div className="mt-3 space-y-3">
            {conflicts.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">No conflicts detected.</p>
            ) : (
              conflicts.slice(0, 8).map((conflict) => (
                <div key={`${conflict.connectionId}-${conflict.taskId}`} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{conflict.taskTitle}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${conflict.conflictState === "needs_review" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                      {conflict.conflictState}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {conflict.conflictMessage ?? "Conflict detected"} · External ID {conflict.externalTaskId}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProviderIcon({ provider, className }: { provider: ConnectorProvider; className?: string }) {
  const Icon = PROVIDER_ICONS[provider];
  return <Icon className={className} />;
}

function CapabilityPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-neutral-200 bg-white text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"}`}>
      {label}
    </div>
  );
}

function ConnectorStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-neutral-600 dark:text-neutral-300">
      {label}: {value}
    </span>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs text-neutral-500 dark:text-neutral-400">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-neutral-500 dark:text-neutral-400">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
      />
    </label>
  );
}
