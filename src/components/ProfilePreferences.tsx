"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ToastProvider";
import { api, type AIConfig, type AIModelInfo, type AIProvider } from "@/lib/client";
import { IconKey, IconMoon, IconSparkles, IconSun } from "@/components/icons";

const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "ollama", label: "Ollama" },
  { value: "lmstudio", label: "LM Studio" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_BASE_URL: Record<AIProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
  custom: "",
};

const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.5-flash",
  ollama: "llama3.2",
  lmstudio: "llama3.2",
  custom: "gpt-4o-mini",
};

export function ProfilePreferences({
  isAdmin = false,
  showAdminQuickAccess = true,
  assistantEnabled = true,
}: {
  isAdmin?: boolean;
  showAdminQuickAccess?: boolean;
  assistantEnabled?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const { update } = useSession();
  const { toast } = useToast();

  const [showAdminButton, setShowAdminButton] = useState(showAdminQuickAccess);
  const [assistantVisible, setAssistantVisible] = useState(assistantEnabled);
  const [savingAdminButtonPref, setSavingAdminButtonPref] = useState(false);
  const [savingAssistantVisibility, setSavingAssistantVisibility] = useState(false);

  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [activeConfig, setActiveConfig] = useState<AIConfig | null>(null);
  const [aiReadOnly, setAiReadOnly] = useState(false);
  const [aiReadOnlyReason, setAiReadOnlyReason] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL.openai);
  const [model, setModel] = useState(DEFAULT_MODEL.openai);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [shareAiApiKeyWithUsers, setShareAiApiKeyWithUsers] = useState(false);
  const [loadingAiKeySharing, setLoadingAiKeySharing] = useState(false);
  const [savingAiKeySharing, setSavingAiKeySharing] = useState(false);

  const providerRequiresApiKey = useMemo(
    () => provider === "openai" || provider === "anthropic" || provider === "google",
    [provider],
  );
  const activeConfigMatchesProvider = activeConfig?.provider === provider;
  const hasSavedApiKey = Boolean(activeConfigMatchesProvider && activeConfig?.hasApiKey);
  const maskedSavedApiKey = activeConfigMatchesProvider ? activeConfig?.maskedApiKey : null;
  const hasUnsavedApiKey = apiKeyInput.trim().length > 0;

  const loadConfig = useCallback(async () => {
    setAiLoading(true);
    try {
      const result = await api.ai.config.get();
      const config = result.config;
      setAiReadOnly(Boolean(result.readOnly));
      setAiReadOnlyReason(result.readOnlyReason ?? null);
      setActiveConfig(config);
      if (config) {
        setProvider(config.provider);
        setBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL[config.provider]);
        setModel(config.model);
      } else if (result.defaults) {
        setProvider(result.defaults.provider);
        setBaseUrl(result.defaults.baseUrl ?? DEFAULT_BASE_URL[result.defaults.provider]);
        setModel(result.defaults.model);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load AI config");
    } finally {
      setAiLoading(false);
    }
  }, [toast]);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const result = await api.ai.config.models();
      setModels(result.models);
      if (result.models.length > 0 && !result.models.some((entry) => entry.id === model)) {
        setModel(result.models[0].id);
      }
    } catch {
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [model]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!activeConfig) return;
    void loadModels();
  }, [activeConfig, loadModels]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoadingAiKeySharing(true);
    (async () => {
      try {
        const security = await api.admin.getSecurity();
        if (!active) return;
        setShareAiApiKeyWithUsers(security.shareAiApiKeyWithUsers);
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Failed to load admin AI sharing setting");
        }
      } finally {
        if (active) {
          setLoadingAiKeySharing(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isAdmin, toast]);

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

  async function handleToggleAssistantVisibility() {
    const next = !assistantVisible;
    setAssistantVisible(next);
    setSavingAssistantVisibility(true);

    try {
      await api.me.updatePreferences({ assistantEnabled: next });
      await update();
      toast.success(next ? "Personal Assistant enabled" : "Personal Assistant hidden");
    } catch (error) {
      setAssistantVisible(!next);
      toast.error(error instanceof Error ? error.message : "Failed to update assistant visibility");
    } finally {
      setSavingAssistantVisibility(false);
    }
  }

  async function handleSaveAiConfig() {
    if (aiReadOnly) {
      toast.info(aiReadOnlyReason ?? "AI settings are managed by an administrator.");
      return;
    }

    setAiSaving(true);
    try {
      const payload: {
        provider: AIProvider;
        baseUrl: string | null;
        model: string;
        apiKey?: string | null;
      } = {
        provider,
        baseUrl: baseUrl.trim() || null,
        model: model.trim() || DEFAULT_MODEL[provider],
      };

      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }

      const result = await api.ai.config.update(payload);
      setApiKeyInput("");
      setShowApiKey(false);

      try {
        const refreshed = await api.ai.config.get();
        setAiReadOnly(Boolean(refreshed.readOnly));
        setAiReadOnlyReason(refreshed.readOnlyReason ?? null);
        const config = refreshed.config ?? result.config;
        setActiveConfig(config);
        if (config) {
          setProvider(config.provider);
          setBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL[config.provider]);
          setModel(config.model);
        }
      } catch {
        setActiveConfig(result.config);
      }

      await loadModels();
      toast.success("AI configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save AI configuration");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      const result = await api.ai.config.test();
      toast.success(`Connected to ${result.providerLabel} (${result.model})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSaveAiKeySharing() {
    setSavingAiKeySharing(true);
    try {
      const updated = await api.admin.updateSecurity({ shareAiApiKeyWithUsers });
      setShareAiApiKeyWithUsers(updated.shareAiApiKeyWithUsers);
      toast.success("Admin AI key sharing updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update admin AI key sharing");
    } finally {
      setSavingAiKeySharing(false);
    }
  }

  return (
    <div className="space-y-5">
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
            <p className="text-xs text-neutral-400 dark:text-neutral-500">Switch between light and dark mode.</p>
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

        <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Personal Assistant</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Show or hide Assistant in the sidebar and shortcuts.
            </p>
          </div>
          <button
            onClick={handleToggleAssistantVisibility}
            disabled={savingAssistantVisibility}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 disabled:opacity-60 ${
              assistantVisible
                ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
                : "border border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {assistantVisible ? "Enabled" : "Hidden"}
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Admin Quick Access Button</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Show or hide the icon-only admin button in the sidebar.
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

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm space-y-4">
        <div>
          <div>
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              <IconSparkles className="w-4 h-4 text-blue-500" />
              Personal Assistant
            </h2>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              Configure your provider and credentials. Dispatch does not use your data to train models or enhance responses.
            </p>
          </div>
        </div>

        {aiLoading ? (
          <div className="space-y-3">
            <div className="h-10 rounded-lg skeleton-shimmer" />
            <div className="h-10 rounded-lg skeleton-shimmer" />
            <div className="h-10 rounded-lg skeleton-shimmer" />
          </div>
        ) : (
          <>
            {aiReadOnly && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {aiReadOnlyReason ?? "AI settings are currently managed by an administrator."}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Provider
                <select
                  value={provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as AIProvider;
                    setProvider(nextProvider);
                    setApiKeyInput("");
                    setShowApiKey(false);
                    setBaseUrl(DEFAULT_BASE_URL[nextProvider]);
                    setModel(DEFAULT_MODEL[nextProvider]);
                    setModels([]);
                  }}
                  disabled={aiReadOnly}
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100"
                >
                  {PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Base URL
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={DEFAULT_BASE_URL[provider]}
                  disabled={aiReadOnly}
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                API Key
                <div className="mt-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <IconKey className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(event) => setApiKeyInput(event.target.value)}
                      placeholder={maskedSavedApiKey || "Enter API key"}
                      disabled={aiReadOnly}
                      className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-2 pl-9 pr-3 text-sm text-neutral-800 dark:text-neutral-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    disabled={aiReadOnly}
                    className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
                {hasSavedApiKey && !apiKeyInput && (
                  <span className="mt-1 block text-[11px] text-neutral-400 dark:text-neutral-500">
                    Saved key: {maskedSavedApiKey}
                  </span>
                )}
                {providerRequiresApiKey && !hasSavedApiKey && !hasUnsavedApiKey && (
                  <span className="mt-1 block text-[11px] font-medium text-amber-600 dark:text-amber-300">
                    Save your API key first. Model options appear after you save configuration.
                  </span>
                )}
                {providerRequiresApiKey && hasUnsavedApiKey && (
                  <span className="mt-1 block text-[11px] font-medium text-blue-600 dark:text-blue-300">
                    API key entered. Click Save Configuration, then Reload Models to populate the model selector.
                  </span>
                )}
              </label>

              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Model
                {models.length > 0 ? (
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={aiReadOnly}
                    className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100"
                  >
                    {models.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={DEFAULT_MODEL[provider]}
                    disabled={aiReadOnly}
                    className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100"
                  />
                )}
                <span className="mt-1 block text-[11px] text-neutral-400 dark:text-neutral-500">
                  {loadingModels
                    ? "Loading models..."
                    : models.length > 0
                      ? `${models.length} model(s) found`
                      : providerRequiresApiKey && !hasSavedApiKey
                        ? "Save API key + configuration to load selectable models."
                        : "Manual model entry"}
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleSaveAiConfig()}
                disabled={aiSaving || aiReadOnly}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-all active:scale-95"
              >
                {aiSaving ? "Saving..." : "Save Configuration"}
              </button>
              <button
                onClick={() => void handleTestConnection()}
                disabled={testingConnection || aiSaving}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60 transition-all active:scale-95"
              >
                {testingConnection ? "Testing..." : "Test Connection"}
              </button>
              <button
                onClick={() => void loadModels()}
                disabled={loadingModels}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60 transition-all active:scale-95"
              >
                Reload Models
              </button>
            </div>

            {isAdmin && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Admin: Shared AI API Key
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Allow users without their own provider key to use an administrator-managed API key. Default is off.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={shareAiApiKeyWithUsers}
                      onChange={(event) => setShareAiApiKeyWithUsers(event.target.checked)}
                      disabled={loadingAiKeySharing || savingAiKeySharing}
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                    />
                    Make admin API key available to all Dispatch users
                  </label>
                  <button
                    onClick={() => void handleSaveAiKeySharing()}
                    disabled={loadingAiKeySharing || savingAiKeySharing}
                    className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60 transition-all active:scale-95"
                  >
                    {savingAiKeySharing ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
