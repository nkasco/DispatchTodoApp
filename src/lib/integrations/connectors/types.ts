import type { Project, Task } from "@/lib/client";

export type ConnectorProvider = "rest" | "caldav" | "local_uri";
export type ConnectorStatus = "active" | "disabled" | "error";
export type ConnectorSyncDirection = "push" | "pull" | "bidirectional";
export type ConnectorAuditLevel = "info" | "warning" | "error";
export type ConnectorConflictState = "none" | "last_write_wins" | "needs_review";
export type ConnectorOutboxStatus = "pending" | "processing" | "retry" | "delivered" | "failed";
export type ConnectorOutboxAction = "create" | "update" | "delete";

export interface ConnectorCapabilityFlags {
  pushTasks: boolean;
  pullTasks: boolean;
  biDirectional: boolean;
  pushProjects: boolean;
  webhooks: boolean;
  exportOnly: boolean;
  localOnly: boolean;
  requiresDesktopBridge: boolean;
}

export interface RestConnectorSettings {
  taskPath: string;
  projectPath: string;
  healthPath: string;
}

export interface CaldavConnectorSettings {
  collectionUrl: string;
  useEventFallback: boolean;
}

export interface LocalUriConnectorSettings {
  createTemplate: string;
  updateTemplate: string;
  deleteTemplate: string;
  bridgeMode: boolean;
  bridgeDirectory: string | null;
}

export type ConnectorSettings =
  | RestConnectorSettings
  | CaldavConnectorSettings
  | LocalUriConnectorSettings;

export interface ConnectorAuthSummary {
  hasToken: boolean;
  maskedToken: string | null;
  username?: string | null;
}

export interface ConnectorRecord {
  id: string;
  userId: string;
  name: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  syncDirection: ConnectorSyncDirection;
  baseUrl: string | null;
  capabilityFlags: ConnectorCapabilityFlags;
  settings: ConnectorSettings;
  auth: ConnectorAuthSummary;
  webhookSecret: string | null;
  webhookUrl: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  pendingCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorAuditEntry {
  id: string;
  connectionId: string;
  level: ConnectorAuditLevel;
  eventType: string;
  message: string;
  details: string | null;
  createdAt: string;
}

export interface ConnectorSyncResult {
  processed: number;
  delivered: number;
  failed: number;
  pending: number;
  lastSyncedAt: string | null;
}

export interface ConnectorTestResult {
  ok: boolean;
  message: string;
}

export interface ConnectorSyncPayload {
  action: ConnectorOutboxAction;
  task: Task;
  project: Project | null;
  externalTaskId?: string | null;
  externalProjectId?: string | null;
}

export interface ConnectorWebhookPayload {
  action?: string;
  externalTaskId?: string;
  updatedAt?: string;
  title?: string;
  description?: string | null;
  status?: Task["status"];
  priority?: Task["priority"];
  dueDate?: string | null;
}

export interface ConnectorAdapterContext {
  connection: ConnectorRecord;
}

export interface ConnectorAdapter {
  provider: ConnectorProvider;
  label: string;
  description: string;
  capabilityFlags: ConnectorCapabilityFlags;
  defaults: (baseUrl: string | null) => ConnectorSettings;
  validateConfig: (params: {
    baseUrl: string | null;
    settings: unknown;
    authToken?: string | null;
    username?: string | null;
    password?: string | null;
  }) => { baseUrl: string | null; settings: ConnectorSettings };
  testConnection: (params: {
    baseUrl: string | null;
    settings: ConnectorSettings;
    auth: Record<string, string | null>;
  }) => Promise<ConnectorTestResult>;
  pushTask: (params: {
    connection: ConnectorRecord;
    settings: ConnectorSettings;
    auth: Record<string, string | null>;
    payload: ConnectorSyncPayload;
  }) => Promise<{ externalTaskId?: string | null; externalProjectId?: string | null; warning?: string | null }>;
  deleteTask: (params: {
    connection: ConnectorRecord;
    settings: ConnectorSettings;
    auth: Record<string, string | null>;
    payload: ConnectorSyncPayload;
  }) => Promise<{ warning?: string | null }>;
  handleWebhook?: (params: {
    connection: ConnectorRecord;
    payload: ConnectorWebhookPayload;
  }) => Promise<{ message: string; conflictState?: ConnectorConflictState }>;
}
