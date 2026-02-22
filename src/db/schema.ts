import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
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
  ]
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
