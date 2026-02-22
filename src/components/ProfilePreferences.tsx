"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ToastProvider";
import {
  api,
  type AIConfig,
  type AIModelInfo,
  type AIProvider,
  type TemplatePresets,
} from "@/lib/client";
import { IconKey, IconMoon, IconSparkles, IconSun } from "@/components/icons";
import { CustomSelect } from "@/components/CustomSelect";
import { isValidTimeZone } from "@/lib/timezone";
import { generateClientId } from "@/lib/id";

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

const COMMON_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function ProfilePreferences({
  isAdmin = false,
  showAdminQuickAccess = true,
  assistantEnabled = true,
  timeZone = null,
  templatePresets = { tasks: [], notes: [], dispatches: [] },
}: {
  isAdmin?: boolean;
  showAdminQuickAccess?: boolean;
  assistantEnabled?: boolean;
  timeZone?: string | null;
  templatePresets?: TemplatePresets;
}) {
  const { theme, toggleTheme } = useTheme();
  const { update } = useSession();
  const { toast } = useToast();

  const [showAdminButton, setShowAdminButton] = useState(showAdminQuickAccess);
  const [assistantVisible, setAssistantVisible] = useState(assistantEnabled);
  const [savingAdminButtonPref, setSavingAdminButtonPref] = useState(false);
  const [savingAssistantVisibility, setSavingAssistantVisibility] = useState(false);
  const [timezoneValue, setTimezoneValue] = useState(timeZone ?? "");
  const [timeZoneOptions, setTimeZoneOptions] = useState<Array<{ value: string; label: string }>>([
    { value: "", label: "System default (auto)" },
  ]);
  const [timeZonePickerOpen, setTimeZonePickerOpen] = useState(false);
  const [timeZoneHighlightIndex, setTimeZoneHighlightIndex] = useState(0);
  const timeZonePickerRef = useRef<HTMLDivElement>(null);
  const [savingTimeZone, setSavingTimeZone] = useState(false);
  const [detectedSystemTimeZone, setDetectedSystemTimeZone] = useState<string | null>(null);
  const autoAppliedSystemTimeZoneRef = useRef(false);

  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

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
  const [profileTemplates, setProfileTemplates] = useState<TemplatePresets>(templatePresets);
  const [templateKind, setTemplateKind] = useState<"tasks" | "notes" | "dispatches">("tasks");
  const [templateName, setTemplateName] = useState("");
  const [taskTemplateTitle, setTaskTemplateTitle] = useState("");
  const [taskTemplateDescription, setTaskTemplateDescription] = useState("");
  const [textTemplateContent, setTextTemplateContent] = useState("");
  const [savingTemplateLibrary, setSavingTemplateLibrary] = useState(false);

  const providerRequiresApiKey = useMemo(
    () => provider === "openai" || provider === "anthropic" || provider === "google",
    [provider],
  );
  const activeConfigMatchesProvider = activeConfig?.provider === provider;
  const hasSavedApiKey = Boolean(activeConfigMatchesProvider && activeConfig?.hasApiKey);
  const maskedSavedApiKey = activeConfigMatchesProvider ? activeConfig?.maskedApiKey : null;
  const hasUnsavedApiKey = apiKeyInput.trim().length > 0;
  const providerSelectOptions = useMemo(
    () => PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const modelSelectOptions = useMemo(
    () => models.map((entry) => ({ value: entry.id, label: entry.label })),
    [models],
  );
  const filteredTimeZoneOptions = useMemo(() => {
    const query = timezoneValue.trim().toLowerCase();
    if (!query) return timeZoneOptions;

    return timeZoneOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [timeZoneOptions, timezoneValue]);
  const activeTemplateItems = profileTemplates[templateKind];
  const templateKindOptions = [
    { value: "tasks", label: "Tasks" },
    { value: "notes", label: "Notes" },
    { value: "dispatches", label: "Dispatch" },
  ] as const;

  useEffect(() => {
    setTimezoneValue(timeZone ?? "");
  }, [timeZone]);

  useEffect(() => {
    setProfileTemplates(templatePresets);
  }, [templatePresets]);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && isValidTimeZone(detected)) {
        setDetectedSystemTimeZone(detected);
      }
    } catch {
      setDetectedSystemTimeZone(null);
    }
  }, []);

  useEffect(() => {
    const hasSupportedValuesOf = typeof Intl.supportedValuesOf === "function";
    const discovered = hasSupportedValuesOf ? Intl.supportedValuesOf("timeZone") : COMMON_TIME_ZONES;

    const uniqueZones = new Set<string>(discovered);
    if (detectedSystemTimeZone) uniqueZones.add(detectedSystemTimeZone);
    if (timeZone) uniqueZones.add(timeZone);

    const sorted = Array.from(uniqueZones).sort((a, b) => a.localeCompare(b));
    setTimeZoneOptions([
      { value: "", label: "System default (auto)" },
      ...sorted.map((zone) => ({ value: zone, label: zone })),
    ]);
  }, [detectedSystemTimeZone, timeZone]);

  useEffect(() => {
    if (!timeZonePickerOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (timeZonePickerRef.current && !timeZonePickerRef.current.contains(event.target as Node)) {
        setTimeZonePickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [timeZonePickerOpen]);

  useEffect(() => {
    setTimeZoneHighlightIndex(0);
  }, [timezoneValue]);

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

  const loadModels = useCallback(async (options?: { allowWithoutActiveConfig?: boolean }) => {
    if (!activeConfig && !options?.allowWithoutActiveConfig) {
      setModels([]);
      return;
    }

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
  }, [activeConfig, model]);

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

  const saveTimeZone = useCallback(async (nextTimeZone: string | null, options?: { silent?: boolean }) => {
    setSavingTimeZone(true);
    try {
      const updated = await api.me.updatePreferences({ timeZone: nextTimeZone });
      setTimezoneValue(updated.timeZone ?? "");
      await update();
      if (!options?.silent) {
        toast.success(updated.timeZone ? `Timezone set to ${updated.timeZone}` : "Timezone cleared");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update timezone");
    } finally {
      setSavingTimeZone(false);
    }
  }, [toast, update]);

  const handleSaveTimeZone = useCallback(async () => {
    const trimmed = timezoneValue.trim();
    if (!trimmed) {
      await saveTimeZone(null);
      return;
    }

    if (!isValidTimeZone(trimmed)) {
      toast.error("Enter a valid IANA timezone (for example: America/Los_Angeles)");
      return;
    }

    await saveTimeZone(trimmed);
  }, [saveTimeZone, timezoneValue, toast]);

  const handleTimeZoneInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!timeZonePickerOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setTimeZonePickerOpen(true);
      return;
    }

    if (!timeZonePickerOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setTimeZoneHighlightIndex((previous) => Math.min(previous + 1, Math.max(filteredTimeZoneOptions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setTimeZoneHighlightIndex((previous) => Math.max(previous - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const highlighted = filteredTimeZoneOptions[timeZoneHighlightIndex];
      if (highlighted) {
        event.preventDefault();
        setTimezoneValue(highlighted.value);
        setTimeZonePickerOpen(false);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setTimeZonePickerOpen(false);
    }
  }, [filteredTimeZoneOptions, timeZoneHighlightIndex, timeZonePickerOpen]);

  useEffect(() => {
    if (autoAppliedSystemTimeZoneRef.current) return;
    if (!detectedSystemTimeZone) return;
    if ((timeZone ?? "").trim().length > 0) return;

    autoAppliedSystemTimeZoneRef.current = true;
    setTimezoneValue(detectedSystemTimeZone);
    void saveTimeZone(detectedSystemTimeZone, { silent: true });
  }, [detectedSystemTimeZone, saveTimeZone, timeZone]);

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

      await loadModels({ allowWithoutActiveConfig: true });
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

  function resetTemplateDraft() {
    setTemplateName("");
    setTaskTemplateTitle("");
    setTaskTemplateDescription("");
    setTextTemplateContent("");
  }

  async function persistTemplateLibrary(nextTemplates: TemplatePresets) {
    setSavingTemplateLibrary(true);
    try {
      const updated = await api.me.updatePreferences({ templatePresets: nextTemplates });
      setProfileTemplates(updated.templatePresets);
      toast.success("Template library updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update template library");
    } finally {
      setSavingTemplateLibrary(false);
    }
  }

  async function handleAddTemplate() {
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      toast.error("Template name is required");
      return;
    }

    if (templateKind === "tasks") {
      const trimmedTitle = taskTemplateTitle.trim();
      if (!trimmedTitle) {
        toast.error("Task template title is required");
        return;
      }

      const nextTemplates: TemplatePresets = {
        ...profileTemplates,
        tasks: [
          ...profileTemplates.tasks,
          {
            id: generateClientId(),
            name: trimmedName,
            title: trimmedTitle,
            description: taskTemplateDescription,
            recurrenceType: "none",
            recurrenceRule: null,
          },
        ],
      };
      await persistTemplateLibrary(nextTemplates);
      resetTemplateDraft();
      return;
    }

    const trimmedContent = textTemplateContent.trim();
    if (!trimmedContent) {
      toast.error("Template content is required");
      return;
    }

    if (templateKind === "notes") {
      const nextTemplates: TemplatePresets = {
        ...profileTemplates,
        notes: [
          ...profileTemplates.notes,
          {
            id: generateClientId(),
            name: trimmedName,
            content: trimmedContent,
          },
        ],
      };
      await persistTemplateLibrary(nextTemplates);
      resetTemplateDraft();
      return;
    }

    const nextTemplates: TemplatePresets = {
      ...profileTemplates,
      dispatches: [
        ...profileTemplates.dispatches,
        {
          id: generateClientId(),
          name: trimmedName,
          content: trimmedContent,
        },
      ],
    };
    await persistTemplateLibrary(nextTemplates);
    resetTemplateDraft();
  }

  async function handleDeleteTemplate(id: string) {
    if (templateKind === "tasks") {
      const nextTemplates: TemplatePresets = {
        ...profileTemplates,
        tasks: profileTemplates.tasks.filter((entry) => entry.id !== id),
      };
      await persistTemplateLibrary(nextTemplates);
      return;
    }

    if (templateKind === "notes") {
      const nextTemplates: TemplatePresets = {
        ...profileTemplates,
        notes: profileTemplates.notes.filter((entry) => entry.id !== id),
      };
      await persistTemplateLibrary(nextTemplates);
      return;
    }

    const nextTemplates: TemplatePresets = {
      ...profileTemplates,
      dispatches: profileTemplates.dispatches.filter((entry) => entry.id !== id),
    };
    await persistTemplateLibrary(nextTemplates);
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

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Timezone</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Used for “today” calculations across Dispatch and Assistant date context.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div ref={timeZonePickerRef} className="relative">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Timezone
              </label>
              <input
                type="text"
                value={timezoneValue}
                onChange={(event) => {
                  setTimezoneValue(event.target.value);
                  setTimeZonePickerOpen(true);
                }}
                onFocus={() => setTimeZonePickerOpen(true)}
                onKeyDown={handleTimeZoneInputKeyDown}
                placeholder="System default (auto)"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
              />
              {timeZonePickerOpen && (
                <div
                  className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg animate-fade-in-up"
                  style={{ animationDuration: "0.15s" }}
                >
                  {filteredTimeZoneOptions.length > 0 ? (
                    filteredTimeZoneOptions.map((option, index) => (
                      <button
                        key={`${option.value || "system-default"}-${index}`}
                        type="button"
                        onMouseEnter={() => setTimeZoneHighlightIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setTimezoneValue(option.value);
                          setTimeZonePickerOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          index === timeZoneHighlightIndex
                            ? "bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-white"
                            : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                      No matching timezones.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => void handleSaveTimeZone()}
              disabled={savingTimeZone}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-all active:scale-95"
            >
              {savingTimeZone ? "Saving..." : "Save"}
            </button>
          </div>
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
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Template Library</h2>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            Save reusable templates for tasks, notes, and dispatch summaries.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1">
          {templateKindOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTemplateKind(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                templateKind === option.value
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">
            Template Name
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Morning planning template"
              className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            />
          </label>

          {templateKind === "tasks" ? (
            <div className="space-y-3">
              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Task Title Template
                <input
                  value={taskTemplateTitle}
                  onChange={(event) => setTaskTemplateTitle(event.target.value)}
                  placeholder="Plan {{date:YYYY-MM-DD}} priorities"
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
                />
              </label>
              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Task Description Template
                <textarea
                  value={taskTemplateDescription}
                  onChange={(event) => setTaskTemplateDescription(event.target.value)}
                  placeholder="Top outcomes, blockers, and next actions..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
                />
              </label>
            </div>
          ) : (
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              Template Content
              <textarea
                value={textTemplateContent}
                onChange={(event) => setTextTemplateContent(event.target.value)}
                placeholder={templateKind === "notes" ? "## Notes for {{date:YYYY-MM-DD}}" : "Today: {{date:YYYY-MM-DD}} ..."}
                rows={4}
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
              />
            </label>
          )}

          <button
            onClick={() => void handleAddTemplate()}
            disabled={savingTemplateLibrary}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-all active:scale-95"
          >
            {savingTemplateLibrary ? "Saving..." : "Save Template"}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Saved Templates
          </p>
          {activeTemplateItems.length === 0 ? (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">No templates saved for this section yet.</p>
          ) : (
            activeTemplateItems.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 truncate">{entry.name}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                    {"title" in entry ? entry.title : entry.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteTemplate(entry.id)}
                  disabled={savingTemplateLibrary}
                  className="rounded-md border border-red-200 dark:border-red-900/50 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-all active:scale-95"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
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
              <CustomSelect
                label="Provider"
                value={provider}
                onChange={(value) => {
                  const nextProvider = value as AIProvider;
                  setProvider(nextProvider);
                  setApiKeyInput("");
                  setBaseUrl(DEFAULT_BASE_URL[nextProvider]);
                  setModel(DEFAULT_MODEL[nextProvider]);
                  setModels([]);
                }}
                options={providerSelectOptions}
                disabled={aiReadOnly}
              />

              <label className="text-xs text-neutral-500 dark:text-neutral-400">
                Base URL
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={DEFAULT_BASE_URL[provider]}
                  disabled={aiReadOnly}
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                      type="password"
                      value={apiKeyInput}
                      onChange={(event) => setApiKeyInput(event.target.value)}
                      placeholder={maskedSavedApiKey || "Enter API key"}
                      disabled={aiReadOnly}
                      className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 py-2 pl-9 pr-3 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
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

              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {models.length > 0 ? (
                  <CustomSelect
                    label="Model"
                    value={model}
                    onChange={(value) => setModel(value)}
                    options={modelSelectOptions}
                    disabled={aiReadOnly}
                  />
                ) : (
                  <label className="text-xs text-neutral-500 dark:text-neutral-400">
                    Model
                    <input
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder={DEFAULT_MODEL[provider]}
                      disabled={aiReadOnly}
                      className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
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
              </div>
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
                disabled={loadingModels || !activeConfig}
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
