"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type ApiKey } from "@/lib/client";
import { IconCode, IconCopy, IconKey, IconPlus, IconPuzzle, IconTrash } from "@/components/icons";

type Method = "GET" | "POST" | "PUT" | "DELETE";
type SnippetMode = "curl" | "fetch" | "powershell";
const ACTIVE_API_KEY_STORAGE_KEY = "dispatch.active-api-key-id";

type Endpoint = {
  id: string;
  category: "tasks" | "projects" | "notes" | "dispatches";
  method: Method;
  path: string;
  summary: string;
  params?: string[];
  body?: string;
  response: string;
};

const ENDPOINTS: Endpoint[] = [
  { id: "tasks-list", category: "tasks", method: "GET", path: "/api/tasks", summary: "List tasks", params: ["status", "priority", "projectId", "page", "limit"], response: `[{ "id": "task_1", "title": "Ship docs" }]` },
  { id: "tasks-create", category: "tasks", method: "POST", path: "/api/tasks", summary: "Create task", body: `{ "title": "New task", "priority": "high" }`, response: `{ "id": "task_1", "title": "New task" }` },
  { id: "tasks-update", category: "tasks", method: "PUT", path: "/api/tasks/{id}", summary: "Update task", params: ["id"], body: `{ "status": "done" }`, response: `{ "id": "task_1", "status": "done" }` },
  { id: "tasks-delete", category: "tasks", method: "DELETE", path: "/api/tasks/{id}", summary: "Delete task", params: ["id"], response: `{ "deleted": true }` },

  { id: "projects-list", category: "projects", method: "GET", path: "/api/projects", summary: "List projects", params: ["status", "include", "page", "limit"], response: `[{ "id": "proj_1", "name": "Platform" }]` },
  { id: "projects-create", category: "projects", method: "POST", path: "/api/projects", summary: "Create project", body: `{ "name": "Integrations Revamp", "color": "blue" }`, response: `{ "id": "proj_1", "name": "Integrations Revamp" }` },
  { id: "projects-update", category: "projects", method: "PUT", path: "/api/projects/{id}", summary: "Update project", params: ["id"], body: `{ "status": "paused" }`, response: `{ "id": "proj_1", "status": "paused" }` },
  { id: "projects-delete", category: "projects", method: "DELETE", path: "/api/projects/{id}", summary: "Delete project", params: ["id"], response: `{ "deleted": true }` },

  { id: "notes-list", category: "notes", method: "GET", path: "/api/notes", summary: "List notes", params: ["search", "page", "limit"], response: `[{ "id": "note_1", "title": "Dispatch API notes" }]` },
  { id: "notes-create", category: "notes", method: "POST", path: "/api/notes", summary: "Create note", body: `{ "title": "New note", "content": "..." }`, response: `{ "id": "note_1", "title": "New note" }` },
  { id: "notes-update", category: "notes", method: "PUT", path: "/api/notes/{id}", summary: "Update note", params: ["id"], body: `{ "content": "Updated" }`, response: `{ "id": "note_1", "content": "Updated" }` },
  { id: "notes-delete", category: "notes", method: "DELETE", path: "/api/notes/{id}", summary: "Delete note", params: ["id"], response: `{ "deleted": true }` },

  { id: "dispatches-list", category: "dispatches", method: "GET", path: "/api/dispatches", summary: "List dispatches", params: ["date", "page", "limit"], response: `[{ "id": "disp_1", "date": "2026-02-07" }]` },
  { id: "dispatches-create", category: "dispatches", method: "POST", path: "/api/dispatches", summary: "Create dispatch", body: `{ "date": "2026-02-07", "summary": "Plan work" }`, response: `{ "id": "disp_1", "date": "2026-02-07" }` },
  { id: "dispatches-complete", category: "dispatches", method: "POST", path: "/api/dispatches/{id}/complete", summary: "Complete dispatch", params: ["id"], response: `{ "rolledOver": 2, "nextDispatchId": "disp_2" }` },
  { id: "dispatches-unfinalize", category: "dispatches", method: "POST", path: "/api/dispatches/{id}/unfinalize", summary: "Unfinalize dispatch", params: ["id"], response: `{ "hasNextDispatch": true }` },
];

const CATEGORY_LABELS: Record<Endpoint["category"], string> = {
  tasks: "Tasks",
  projects: "Projects",
  notes: "Notes",
  dispatches: "Dispatches",
};

const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  POST: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  DELETE: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function buildCurl(baseUrl: string, endpoint: Endpoint, apiKey: string) {
  const path = endpoint.path.replace("{id}", "RESOURCE_ID");
  const lines = [
    `curl -X ${endpoint.method} \\`,
    `  -H "Authorization: Bearer ${apiKey}" \\`,
    ...(endpoint.body
      ? [`  -H "Content-Type: application/json" \\`, `  -d '${endpoint.body}' \\`]
      : []),
    `  "${baseUrl}${path}"`,
  ];
  return lines.join("\n");
}

function buildFetch(baseUrl: string, endpoint: Endpoint, apiKey: string) {
  const path = endpoint.path.replace("{id}", "RESOURCE_ID");
  return [
    `const res = await fetch("${baseUrl}${path}", {`,
    `  method: "${endpoint.method}",`,
    `  headers: {`,
    `    "Authorization": "Bearer ${apiKey}",`,
    ...(endpoint.body ? [`    "Content-Type": "application/json",`] : []),
    `  },`,
    ...(endpoint.body ? [`  body: JSON.stringify(${endpoint.body}),`] : []),
    `});`,
    `const data = await res.json();`,
    `console.log(data);`,
  ].join("\n");
}

function buildPowerShell(baseUrl: string, endpoint: Endpoint, apiKey: string) {
  const path = endpoint.path.replace("{id}", "RESOURCE_ID");
  const method = endpoint.method === "DELETE" ? "Delete" : endpoint.method === "PUT" ? "Put" : endpoint.method === "POST" ? "Post" : "Get";
  return [
    `$headers = @{`,
    `  "Authorization" = "Bearer ${apiKey}"`,
    ...(endpoint.body ? [`  "Content-Type" = "application/json"`] : []),
    `}`,
    ...(endpoint.body ? [`$body = '${endpoint.body}'`] : []),
    `$response = Invoke-RestMethod -Method ${method} -Uri "${baseUrl}${path}" -Headers $headers${endpoint.body ? " -Body $body" : ""}`,
    `$response`,
  ].join("\n");
}

export function IntegrationsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKey | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(ENDPOINTS[0].id);
  const [snippetMode, setSnippetMode] = useState<SnippetMode>("curl");
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [copied, setCopied] = useState<string | null>(null);
  const [activeApiKeyId, setActiveApiKeyId] = useState<string | null>(null);
  const [tryLoading, setTryLoading] = useState(false);
  const [tryResponse, setTryResponse] = useState<string | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);
  const [tryStatus, setTryStatus] = useState<number | null>(null);
  const [isTryResponseCollapsed, setIsTryResponseCollapsed] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ACTIVE_API_KEY_STORAGE_KEY);
    if (stored) setActiveApiKeyId(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeApiKeyId) {
      window.localStorage.setItem(ACTIVE_API_KEY_STORAGE_KEY, activeApiKeyId);
    } else {
      window.localStorage.removeItem(ACTIVE_API_KEY_STORAGE_KEY);
    }
  }, [activeApiKeyId]);

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ENDPOINTS;
    return ENDPOINTS.filter((e) =>
      `${e.method} ${e.path} ${e.summary} ${e.category}`.toLowerCase().includes(q)
    );
  }, [search]);

  useEffect(() => {
    if (filteredEndpoints.length === 0) return;
    if (!filteredEndpoints.some((e) => e.id === selectedId)) setSelectedId(filteredEndpoints[0].id);
  }, [filteredEndpoints, selectedId]);

  const selectedEndpoint = filteredEndpoints.find((e) => e.id === selectedId) ?? filteredEndpoints[0];
  const activeApiKey = useMemo(
    () => apiKeys.find((key) => key.id === activeApiKeyId) ?? null,
    [apiKeys, activeApiKeyId]
  );
  const snippetApiKey = activeApiKey?.key ?? "YOUR_API_KEY";

  const grouped = useMemo(() => {
    return (Object.keys(CATEGORY_LABELS) as Endpoint["category"][]).map((category) => ({
      category,
      endpoints: filteredEndpoints.filter((e) => e.category === category),
    }));
  }, [filteredEndpoints]);

  const snippet = selectedEndpoint
    ? snippetMode === "curl"
      ? buildCurl(baseUrl, selectedEndpoint, snippetApiKey)
      : snippetMode === "fetch"
        ? buildFetch(baseUrl, selectedEndpoint, snippetApiKey)
        : buildPowerShell(baseUrl, selectedEndpoint, snippetApiKey)
    : "";

  useEffect(() => {
    setTryResponse(null);
    setTryError(null);
    setTryStatus(null);
    setIsTryResponseCollapsed(false);
  }, [selectedEndpoint?.id]);

  async function copyToClipboard(text: string, key?: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (key) {
        setCopied(key);
        window.setTimeout(() => setCopied(null), 1200);
      }
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  async function loadApiKeys() {
    setLoading(true);
    try {
      const keys = await api.apiKeys.list();
      setApiKeys(keys);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (apiKeys.length === 0) {
      setActiveApiKeyId(null);
      return;
    }
    if (activeApiKeyId && apiKeys.some((key) => key.id === activeApiKeyId)) return;
    setActiveApiKeyId(apiKeys[0].id);
  }, [apiKeys, activeApiKeyId]);

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const newKey = await api.apiKeys.create({ name: newKeyName.trim() });
      setApiKeys((prev) => [...prev, newKey]);
      setNewKeyName("");
      setShowNewKeyModal(false);
      setNewlyCreatedKey(newKey);
    } catch (err) {
      console.error("Failed to create API key:", err);
      alert("Failed to create API key. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("Delete this API key? This cannot be undone.")) return;
    try {
      await api.apiKeys.delete(id);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      console.error("Failed to delete API key:", err);
      alert("Failed to delete API key. Please try again.");
    }
  }

  async function handleTryNow() {
    if (!selectedEndpoint) return;
    if (!activeApiKey) {
      setTryError("Select an active API key to run this request.");
      setTryResponse(null);
      setTryStatus(null);
      return;
    }
    setTryLoading(true);
    setTryError(null);
    setTryResponse(null);
    setTryStatus(null);
    setIsTryResponseCollapsed(false);
    try {
      const path = selectedEndpoint.path.replace("{id}", "RESOURCE_ID");
      const url = `${baseUrl}${path}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${activeApiKey.key}`,
      };
      let body: string | undefined;
      if (selectedEndpoint.body) {
        headers["Content-Type"] = "application/json";
        try {
          body = JSON.stringify(JSON.parse(selectedEndpoint.body));
        } catch {
          body = selectedEndpoint.body;
        }
      }
      const res = await fetch(url, {
        method: selectedEndpoint.method,
        headers,
        body,
      });
      setTryStatus(res.status);
      const text = await res.text();
      if (!text) {
        setTryResponse("(empty response)");
      } else {
        try {
          const parsed = JSON.parse(text);
          setTryResponse(JSON.stringify(parsed, null, 2));
        } catch {
          setTryResponse(text);
        }
      }
      if (!res.ok) {
        setTryError(`Request failed with ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setTryError(message);
    } finally {
      setTryLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 animate-fade-in-up">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Integrations</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Manage API keys and consume Dispatch endpoints with copy-ready snippets.</p>
        <div className="rounded-xl border border-sky-200 dark:border-sky-900/60 bg-gradient-to-r from-sky-50 via-cyan-50 to-white dark:from-sky-950/40 dark:via-cyan-950/20 dark:to-neutral-900 p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-semibold text-neutral-900 dark:text-white">Base URL</div>
            <button onClick={() => copyToClipboard(baseUrl, "base-url")} className="mt-1 inline-flex items-center gap-2 text-sky-700 dark:text-sky-300 hover:underline">
              <code>{baseUrl}</code>
              <IconCopy className="w-4 h-4" />
            </button>
          </div>
          <div>
            <div className="font-semibold text-neutral-900 dark:text-white">Auth</div>
            <code className="block mt-1 text-neutral-700 dark:text-neutral-300">Authorization: Bearer YOUR_API_KEY</code>
          </div>
          <div>
            <div className="font-semibold text-neutral-900 dark:text-white">Alternative</div>
            <code className="block mt-1 text-neutral-700 dark:text-neutral-300">x-api-key: YOUR_API_KEY</code>
          </div>
        </div>
      </header>

      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <IconKey className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">API Keys</h2>
          </div>
          <button
            onClick={() => setShowNewKeyModal(true)}
            className="flex items-center gap-2 self-start rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 sm:self-auto"
          >
            <IconPlus className="w-4 h-4" />
            Create API Key
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">Loading...</div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            No API keys yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-neutral-900 dark:text-white">{key.name}</div>
                    {activeApiKeyId === key.id && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <code className="text-sm text-neutral-600 dark:text-neutral-400 font-mono">
                      {key.key.substring(0, 20)}...
                    </code>
                    <button
                      onClick={() => copyToClipboard(key.key, `key-${key.id}`)}
                      title="Copy to clipboard"
                      className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                    >
                      <IconCopy className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    </button>
                    {copied === `key-${key.id}` && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-300">Copied</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="ml-0 flex w-full flex-wrap items-center gap-2 sm:ml-4 sm:w-auto sm:justify-end">
                  <button
                    onClick={() => setActiveApiKeyId(key.id)}
                    disabled={activeApiKeyId === key.id}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      activeApiKeyId === key.id
                        ? "bg-emerald-600 border-emerald-500 text-white cursor-default"
                        : "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {activeApiKeyId === key.id ? "Active key" : "Set active"}
                  </button>
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete API key"
                  >
                    <IconTrash className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <IconCode className="w-6 h-6 text-sky-500" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">API Documentation</h2>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter endpoints..."
            className="w-full md:w-72 px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            {grouped.map((group) =>
              group.endpoints.length === 0 ? null : (
                <div key={group.category} className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/70 text-sm font-semibold text-neutral-900 dark:text-white">
                    {CATEGORY_LABELS[group.category]}
                  </div>
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                    {group.endpoints.map((endpoint) => (
                      <button
                        key={endpoint.id}
                        onClick={() => setSelectedId(endpoint.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          selectedId === endpoint.id
                            ? "bg-sky-50 dark:bg-sky-900/20"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-[11px] font-semibold rounded ${METHOD_STYLES[endpoint.method]}`}>
                            {endpoint.method}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{endpoint.path}</span>
                        </div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">{endpoint.summary}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          <div className="lg:col-span-8 space-y-4">
            {selectedEndpoint ? (
              <>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${METHOD_STYLES[selectedEndpoint.method]}`}>
                      {selectedEndpoint.method}
                    </span>
                    <code className="text-sm font-mono text-neutral-900 dark:text-white">{selectedEndpoint.path}</code>
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{selectedEndpoint.summary}</h3>
                  {selectedEndpoint.params && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                      Params: {selectedEndpoint.params.join(", ")}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/60">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Request Snippet</div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">
                        {activeApiKey ? `Using active key: ${activeApiKey.name}` : "No active key selected; using YOUR_API_KEY placeholder."}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden">
                        <button
                          onClick={() => setSnippetMode("curl")}
                          className={`px-3 py-1 text-xs ${snippetMode === "curl" ? "bg-sky-600 text-white" : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"}`}
                        >
                          cURL
                        </button>
                        <button
                          onClick={() => setSnippetMode("fetch")}
                          className={`px-3 py-1 text-xs ${snippetMode === "fetch" ? "bg-sky-600 text-white" : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"}`}
                        >
                          fetch
                        </button>
                        <button
                          onClick={() => setSnippetMode("powershell")}
                          className={`px-3 py-1 text-xs ${snippetMode === "powershell" ? "bg-sky-600 text-white" : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"}`}
                        >
                          PowerShell
                        </button>
                      </div>
                      <button
                        onClick={() => copyToClipboard(snippet, "snippet")}
                        className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                          copied === "snippet"
                            ? "bg-emerald-600 border-emerald-500 text-white"
                            : "bg-sky-600 border-sky-500 text-white hover:bg-sky-500"
                        }`}
                      >
                        <IconCopy className="w-4 h-4" />
                        {copied === "snippet" ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={handleTryNow}
                        disabled={tryLoading}
                        className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                          tryLoading
                            ? "bg-neutral-300 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 cursor-wait"
                            : "bg-amber-600 border-amber-500 text-white hover:bg-amber-500"
                        }`}
                      >
                        {tryLoading ? "Running..." : "Try Now"}
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 text-sm font-mono overflow-x-auto bg-neutral-950 text-green-300">{snippet}</pre>
                </div>

                {selectedEndpoint.body && (
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                    <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/60 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      Request Body
                    </div>
                    <pre className="p-4 text-sm font-mono overflow-x-auto bg-neutral-950 text-sky-200">{selectedEndpoint.body}</pre>
                  </div>
                )}

                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
                    <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Response</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {tryStatus ? `Status ${tryStatus}` : "Run Try Now to fetch a live response."}
                      </div>
                      <button
                        onClick={() => setIsTryResponseCollapsed((prev) => !prev)}
                        className="inline-flex items-center px-2.5 py-1 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 transition-colors"
                      >
                        {isTryResponseCollapsed ? "Expand" : "Collapse"}
                      </button>
                    </div>
                  </div>
                  {!isTryResponseCollapsed && (
                    <pre className="p-4 text-sm font-mono overflow-x-auto bg-neutral-950 text-emerald-200">
                      {tryError
                        ? `Error: ${tryError}`
                        : tryResponse ?? "(no response yet)"}
                    </pre>
                  )}
                </div>

                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/60 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    Example Response
                  </div>
                  <pre className="p-4 text-sm font-mono overflow-x-auto bg-neutral-950 text-emerald-200">{selectedEndpoint.response}</pre>
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-500 dark:text-neutral-400">No endpoint selected.</div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <IconPuzzle className="w-6 h-6 text-amber-500" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Connectors</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
            <IconPuzzle className="w-12 h-12 text-neutral-400 dark:text-neutral-600" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">Coming Soon</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
            Slack, GitHub, and Linear connectors are on the roadmap. Today, you can integrate directly using the API keys and snippets above.
          </p>
        </div>
      </section>

      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewKeyModal(false)}>
          <div
            className="bg-white dark:bg-neutral-900 rounded-xl p-6 w-full max-w-md border border-neutral-200 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">Create API Key</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production API Key"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewKeyModal(false)}
                className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || creating}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newlyCreatedKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setNewlyCreatedKey(null)}>
          <div
            className="bg-white dark:bg-neutral-900 rounded-xl p-6 w-full max-w-md border border-neutral-200 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">API Key Created</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Make sure to copy your API key now. You won&apos;t be able to see it again.
            </p>
            <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded-lg mb-4">
              <code className="text-sm text-neutral-900 dark:text-white font-mono break-all">{newlyCreatedKey.key}</code>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => copyToClipboard(newlyCreatedKey.key, "new-key")}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <IconCopy className="w-4 h-4" />
                Copy Key
              </button>
              <button
                onClick={() => setNewlyCreatedKey(null)}
                className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Done
              </button>
            </div>
            {copied === "new-key" && <div className="mt-3 text-xs text-emerald-600 dark:text-emerald-300">Copied.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
