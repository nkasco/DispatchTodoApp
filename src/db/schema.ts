import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- NextAuth tables (must match @auth/drizzle-adapter expectations) ---

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  password: text("password"), // hashed password for local accounts
  role: text("role", { enum: ["member", "admin"] }).notNull().default("member"),
  frozenAt: text("frozenAt"),
  timeZone: text("timeZone"),
  templatePresets: text("templatePresets"),
  showAdminQuickAccess: integer("showAdminQuickAccess", { mode: "boolean" })
    .notNull()
    .default(true),
  assistantEnabled: integer("assistantEnabled", { mode: "boolean" })
    .notNull()
    .default(true),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

// --- Domain tables ---

export const projects = sqliteTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "paused", "completed"] })
      .notNull()
      .default("active"),
    color: text("color").notNull().default("blue"),
    deletedAt: text("deletedAt"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("project_userId_idx").on(table.userId),
    index("project_status_idx").on(table.status),
  ]
);

export const tasks = sqliteTable(
  "task",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("projectId").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: ["open", "in_progress", "done"] })
      .notNull()
      .default("open"),
    priority: text("priority", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    dueDate: text("dueDate"),
    recurrenceType: text("recurrenceType", {
      enum: ["none", "daily", "weekly", "monthly", "custom"],
    })
      .notNull()
      .default("none"),
    recurrenceBehavior: text("recurrenceBehavior", {
      enum: ["after_completion", "duplicate_on_schedule"],
    })
      .notNull()
      .default("after_completion"),
    recurrenceRule: text("recurrenceRule"),
    recurrenceSeriesId: text("recurrenceSeriesId"),
    recurrenceProcessedAt: text("recurrenceProcessedAt"),
    deletedAt: text("deletedAt"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("task_userId_idx").on(table.userId),
    index("task_projectId_idx").on(table.projectId),
    index("task_status_idx").on(table.status),
    index("task_priority_idx").on(table.priority),
    index("task_recurrenceSeriesId_idx").on(table.recurrenceSeriesId),
  ]
);

export const recurrenceSeries = sqliteTable(
  "recurrence_series",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("projectId").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    recurrenceType: text("recurrenceType", {
      enum: ["daily", "weekly", "monthly", "custom"],
    }).notNull(),
    recurrenceBehavior: text("recurrenceBehavior", {
      enum: ["after_completion", "duplicate_on_schedule"],
    })
      .notNull()
      .default("after_completion"),
    recurrenceRule: text("recurrenceRule"),
    nextDueDate: text("nextDueDate").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    deletedAt: text("deletedAt"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("recurrence_series_userId_idx").on(table.userId),
    index("recurrence_series_projectId_idx").on(table.projectId),
    index("recurrence_series_active_idx").on(table.active),
    index("recurrence_series_nextDueDate_idx").on(table.nextDueDate),
  ],
);

export const dispatches = sqliteTable(
  "dispatch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD, unique per user per day
    summary: text("summary"),
    finalized: integer("finalized", { mode: "boolean" }).notNull().default(false),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("dispatch_userId_idx").on(table.userId),
    index("dispatch_date_idx").on(table.userId, table.date),
  ]
);

export const dispatchTasks = sqliteTable(
  "dispatch_task",
  {
    dispatchId: text("dispatchId")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    taskId: text("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.dispatchId, table.taskId] }),
  ]
);

export const notes = sqliteTable(
  "note",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    deletedAt: text("deletedAt"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("note_userId_idx").on(table.userId)]
);

export const apiKeys = sqliteTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    lastUsedAt: text("lastUsedAt"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("api_key_userId_idx").on(table.userId),
    index("api_key_key_idx").on(table.key),
  ]
);

export const integrationConnections = sqliteTable(
  "integration_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider", { enum: ["rest", "caldav", "local_uri"] }).notNull(),
    status: text("status", { enum: ["active", "disabled", "error"] })
      .notNull()
      .default("active"),
    syncDirection: text("syncDirection", {
      enum: ["push", "pull", "bidirectional"],
    })
      .notNull()
      .default("push"),
    baseUrl: text("baseUrl"),
    authConfig: text("authConfig"),
    settings: text("settings"),
    capabilityFlags: text("capabilityFlags").notNull().default("{}"),
    webhookSecret: text("webhookSecret"),
    lastSyncedAt: text("lastSyncedAt"),
    lastError: text("lastError"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("integration_connection_userId_idx").on(table.userId),
    index("integration_connection_provider_idx").on(table.provider),
    index("integration_connection_status_idx").on(table.status),
  ],
);

export const integrationProjectMappings = sqliteTable(
  "integration_project_mapping",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectionId: text("connectionId")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    externalProjectId: text("externalProjectId").notNull(),
    externalProjectName: text("externalProjectName"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("integration_project_mapping_connection_project_unique").on(
      table.connectionId,
      table.projectId,
    ),
    uniqueIndex("integration_project_mapping_connection_external_unique").on(
      table.connectionId,
      table.externalProjectId,
    ),
  ],
);

export const integrationTaskMappings = sqliteTable(
  "integration_task_mapping",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectionId: text("connectionId")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    taskId: text("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: text("projectId").references(() => projects.id, { onDelete: "set null" }),
    externalTaskId: text("externalTaskId").notNull(),
    externalProjectId: text("externalProjectId"),
    lastSyncedAt: text("lastSyncedAt"),
    lastLocalUpdatedAt: text("lastLocalUpdatedAt"),
    lastExternalUpdatedAt: text("lastExternalUpdatedAt"),
    conflictState: text("conflictState", {
      enum: ["none", "last_write_wins", "needs_review"],
    })
      .notNull()
      .default("none"),
    conflictMessage: text("conflictMessage"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("integration_task_mapping_connection_task_unique").on(
      table.connectionId,
      table.taskId,
    ),
    uniqueIndex("integration_task_mapping_connection_external_unique").on(
      table.connectionId,
      table.externalTaskId,
    ),
    index("integration_task_mapping_projectId_idx").on(table.projectId),
    index("integration_task_mapping_conflictState_idx").on(table.conflictState),
  ],
);

export const integrationOutbox = sqliteTable(
  "integration_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connectionId")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    entityType: text("entityType", { enum: ["task"] }).notNull().default("task"),
    entityId: text("entityId").notNull(),
    action: text("action", { enum: ["create", "update", "delete"] }).notNull(),
    payload: text("payload").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "retry", "delivered", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("nextAttemptAt"),
    lastError: text("lastError"),
    deliveredAt: text("deliveredAt"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("integration_outbox_idempotency_unique").on(table.idempotencyKey),
    index("integration_outbox_connection_status_idx").on(table.connectionId, table.status),
    index("integration_outbox_nextAttemptAt_idx").on(table.nextAttemptAt),
  ],
);

export const integrationAuditLogs = sqliteTable(
  "integration_audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connectionId")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    level: text("level", { enum: ["info", "warning", "error"] }).notNull().default("info"),
    eventType: text("eventType").notNull(),
    message: text("message").notNull(),
    details: text("details"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("integration_audit_log_connection_idx").on(table.connectionId),
    index("integration_audit_log_createdAt_idx").on(table.createdAt),
  ],
);

export const importSessions = sqliteTable(
  "import_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceFormat: text("sourceFormat", {
      enum: ["csv", "board_json", "workspace_zip", "ics", "plain_text", "dispatch_roundtrip"],
    }).notNull(),
    status: text("status", { enum: ["previewed", "committed", "failed"] })
      .notNull()
      .default("previewed"),
    fileName: text("fileName").notNull(),
    fingerprint: text("fingerprint").notNull(),
    duplicateMode: text("duplicateMode", { enum: ["skip", "create_copy", "merge"] })
      .notNull()
      .default("skip"),
    options: text("options"),
    manifest: text("manifest"),
    warningCount: integer("warningCount").notNull().default(0),
    createdCount: integer("createdCount").notNull().default(0),
    updatedCount: integer("updatedCount").notNull().default(0),
    skippedCount: integer("skippedCount").notNull().default(0),
    errorMessage: text("errorMessage"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("import_session_userId_idx").on(table.userId),
    index("import_session_format_idx").on(table.sourceFormat),
    index("import_session_fingerprint_idx").on(table.fingerprint),
  ],
);

export const importItemMappings = sqliteTable(
  "import_item_mapping",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceFormat: text("sourceFormat", {
      enum: ["csv", "board_json", "workspace_zip", "ics", "plain_text", "dispatch_roundtrip"],
    }).notNull(),
    entityType: text("entityType", { enum: ["task", "project", "note", "dispatch"] }).notNull(),
    sourceKey: text("sourceKey").notNull(),
    dispatchEntityId: text("dispatchEntityId").notNull(),
    dispatchEntityType: text("dispatchEntityType", { enum: ["task", "project", "note", "dispatch"] }).notNull(),
    lastFingerprint: text("lastFingerprint").notNull(),
    lastImportedAt: text("lastImportedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("import_item_mapping_unique").on(
      table.userId,
      table.sourceFormat,
      table.entityType,
      table.sourceKey,
    ),
    index("import_item_mapping_dispatch_idx").on(table.dispatchEntityType, table.dispatchEntityId),
  ],
);

export const securitySettings = sqliteTable("security_setting", {
  id: integer("id").primaryKey().notNull().default(1),
  databaseEncryptionEnabled: integer("databaseEncryptionEnabled", { mode: "boolean" })
    .notNull()
    .default(false),
  shareAiApiKeyWithUsers: integer("shareAiApiKeyWithUsers", { mode: "boolean" })
    .notNull()
    .default(false),
  userRegistrationEnabled: integer("userRegistrationEnabled", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: text("updatedAt")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const aiConfigs = sqliteTable(
  "ai_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["openai", "anthropic", "google", "ollama", "lmstudio", "custom"],
    })
      .notNull()
      .default("openai"),
    apiKey: text("apiKey"),
    baseUrl: text("baseUrl"),
    model: text("model").notNull().default("gpt-4o-mini"),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("ai_config_userId_idx").on(table.userId),
    index("ai_config_active_idx").on(table.userId, table.isActive),
  ]
);

export const chatConversations = sqliteTable(
  "chat_conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updatedAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("chat_conversation_userId_idx").on(table.userId),
    index("chat_conversation_updatedAt_idx").on(table.updatedAt),
  ]
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversationId")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    model: text("model"),
    tokenCount: integer("tokenCount"),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("chat_message_conversationId_idx").on(table.conversationId),
    index("chat_message_createdAt_idx").on(table.createdAt),
  ]
);
