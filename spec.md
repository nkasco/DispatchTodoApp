# Dispatch — Project Specification

## Purpose

Dispatch is a personal, locally-hosted web application for managing tasks, notes, projects, and daily workflows in a single unified interface. It is a private tool — built, hosted, and consumed by a single user on their local machine.

## Core Principles

- **Local-first**: Runs on `localhost`, data stays on disk in a SQLite file. No cloud dependency for data storage.
- **Single user, authenticated**: OAuth2 login (GitHub) and local credentials gate access. Even though it's local, auth prevents accidental exposure if the port is reachable on the network.
- **REST API driven**: The UI is a React SPA that communicates with Next.js API Route Handlers over standard REST (JSON request/response). No GraphQL.
- **Actionable assistant**: Personal Assistant chat can invoke app actions through a local MCP (Model Context Protocol) server.
- **Simple and fast**: SQLite for zero-ops persistence. No external database server to manage.

## Tech Stack

| Layer          | Technology                                 |
| -------------- | ------------------------------------------ |
| Framework      | Next.js 16.1.6 (App Router)               |
| Language       | TypeScript 5.9                             |
| UI             | React 19, Tailwind CSS v4                  |
| Database       | SQLite via better-sqlite3                  |
| ORM            | Drizzle ORM 0.45                           |
| Authentication | NextAuth.js v5-beta (OAuth2 + Credentials) |
| AI             | Vercel AI SDK (`ai`, `@ai-sdk/*`) + MCP    |
| Runtime        | Node.js                                    |
| Testing        | Vitest 4.0                                 |

## Authentication

- **GitHub OAuth**: Conditionally enabled when `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` env vars are set.
- **Local Credentials**: Email/password registration and login via bcryptjs hashing. Registration endpoint at `POST /api/auth/register`.
- **Role-based administration**: The first account created is automatically assigned the `admin` role.
- **Account freeze controls**: Frozen accounts are blocked from sign-in and protected API access.
- All API routes (except `/api/auth/*`) require a valid session.
- The `withAuth` wrapper in `src/lib/api.ts` enforces this at the route level.
- **API Key Auth**: Alternative authentication via `Authorization: Bearer <key>` or `X-API-Key: <key>` headers for programmatic access. Keys managed at `/api/api-keys`.
- Sessions are JWT-based (required for Credentials provider compatibility with Drizzle adapter).
- Custom sign-in page at `/login`.
- Optional SQLCipher-backed at-rest database encryption is managed from the admin controls on `/profile`.

## Data Model

### Auth Tables
- **users** — `id`, `name`, `email` (unique), `emailVerified`, `image`, `password`, `role` (`member`/`admin`), `frozenAt?`, `showAdminQuickAccess`, `assistantEnabled`. Supports both OAuth (image from provider) and credentials (password hash).
- **accounts** — OAuth provider link records. Composite PK on `provider` + `providerAccountId`.
- **sessions** — Session token tracking with expiry.

### Domain Tables
- **tasks** — `id`, `userId`, `projectId?`, `title`, `description?`, `status` (open/in_progress/done), `priority` (low/medium/high), `dueDate?`, `deletedAt?`, `createdAt`, `updatedAt`. Indexed on userId, status, priority, projectId.
- **notes** — `id`, `userId`, `title`, `content?`, `deletedAt?`, `createdAt`, `updatedAt`. Indexed on userId.
- **projects** — `id`, `userId`, `name`, `description?`, `status` (active/paused/completed), `color`, `deletedAt?`, `createdAt`, `updatedAt`. Indexed on userId, status. Six color options: blue, emerald, amber, rose, violet, slate.
- **dispatches** — `id`, `userId`, `date` (YYYY-MM-DD, unique per user per day), `summary?`, `finalized` (boolean), `createdAt`, `updatedAt`. Indexed on userId+date.
- **dispatchTasks** — `dispatchId`, `taskId`. Composite PK join table.
- **apiKeys** — `id`, `userId`, `name`, `key` (unique), `lastUsedAt?`, `createdAt`.
- **securitySettings** — singleton app-level security flags including `databaseEncryptionEnabled`.
- **aiConfigs** (`ai_config`) — `id`, `userId`, `provider`, `apiKey` (encrypted), `baseUrl?`, `model`, `isActive`, `createdAt`, `updatedAt`.
- **chatConversations** (`chat_conversations`) — `id`, `userId`, `title`, `createdAt`, `updatedAt`.
- **chatMessages** (`chat_messages`) — `id`, `conversationId`, `role`, `content`, `model?`, `tokenCount?`, `createdAt`.

### Soft-Delete & Recycle Bin
- Tasks, notes, and projects use soft-delete: `DELETE` sets a `deletedAt` timestamp instead of removing the row.
- Soft-deleted items are excluded from all list, get, and search queries.
- The Recycle Bin (`/recycle-bin`) shows all soft-deleted items with the option to restore or permanently delete.
- Items are automatically purged after 30 days.

## API Design

- Routes live under `src/app/api/`.
- Each resource gets its own directory (e.g., `src/app/api/tasks/route.ts`).
- Standard HTTP verbs: `GET` (list/read), `POST` (create), `PUT` (update), `DELETE` (soft-delete).
- All responses use a consistent JSON envelope via `jsonResponse()` and `errorResponse()` helpers.
- Route params for single-resource operations use Next.js dynamic segments (e.g., `src/app/api/tasks/[id]/route.ts`).
- Pagination via `?page=&limit=` query params on list endpoints, parsed by `src/lib/pagination.ts`.
- Global search via `GET /api/search?q=` across tasks, notes, dispatches, and projects.
- Recycle bin via `GET /api/recycle-bin` (list deleted items) and `POST /api/recycle-bin` (restore or permanently delete).

### Resource Endpoints
| Resource    | List/Create            | Get/Update/Delete           | Extras                                                    |
| ----------- | ---------------------- | --------------------------- | --------------------------------------------------------- |
| Tasks       | `/api/tasks`           | `/api/tasks/[id]`           | Filters: status, priority, projectId                      |
| Notes       | `/api/notes`           | `/api/notes/[id]`           | Filter: search (title)                                    |
| Projects    | `/api/projects`        | `/api/projects/[id]`        | `/api/projects/[id]/tasks`, `?include=stats`              |
| Dispatches  | `/api/dispatches`      | `/api/dispatches/[id]`      | `.../tasks`, `.../complete`, `.../unfinalize`, `/calendar` |
| Recycle Bin | `/api/recycle-bin`     | --                          | POST with action: restore / delete                        |
| Search      | `/api/search?q=`       | --                          | Cross-entity search                                       |
| Profile     | `/api/me`              | --                          | Current user info                                         |
| API Keys    | `/api/api-keys`        | `/api/api-keys/[id]`        | Key management for programmatic access                    |
| Admin Users | `/api/admin/users`     | `/api/admin/users/[id]`     | Admin user creation, deletion, freeze, role/password actions |
| Admin Security | `/api/admin/security` | --                        | Admin database encryption settings                        |
| AI Config   | `/api/ai/config`       | --                          | `/api/ai/config/test`, `/api/ai/models`                  |
| AI Chat     | `/api/ai/chat`         | --                          | Streaming assistant endpoint                              |
| AI Conversations | `/api/ai/conversations` | `/api/ai/conversations/[id]` | Create/list/get/update/delete conversations              |
| MCP Health  | `/api/ai/mcp/health`   | --                          | MCP server reachability indicator                         |
| Auth        | `/api/auth/[...nextauth]` | --                       | NextAuth.js catch-all                                     |
| Register    | `/api/auth/register`   | --                          | POST email/password registration                          |

## Personal Assistant (Beta) + MCP

- Personal Assistant is available at `/assistant` with streaming chat (`/api/ai/chat`) and conversation history (`/api/ai/conversations`).
- Dispatch uses a local MCP (Model Context Protocol) server (`src/mcp-server/index.ts`) to expose first-party tools to the model.
- MCP tools cover tasks, notes, projects, dispatches, and cross-entity search (`src/mcp-server/tools/*`).
- Chat requests pass authenticated user context to MCP via `x-dispatch-user-id`, and MCP tools require this header for scoped access.
- MCP connectivity is surfaced to users through `/api/ai/mcp/health` and an online/offline indicator in the Assistant UI.

## File Structure

```
src/
  app/
    layout.tsx                      # Root layout with Providers + AppShell
    page.tsx                        # Dashboard (/)
    globals.css                     # Tailwind imports + 17 custom keyframe animations
    login/page.tsx                  # Login page
    tasks/page.tsx                  # Tasks list
    notes/page.tsx                  # Notes list
    notes/[id]/page.tsx             # Note editor
    dispatch/page.tsx               # Daily dispatch
    assistant/page.tsx              # Personal Assistant
    projects/page.tsx               # Projects list
    inbox/page.tsx                  # Priority inbox
    recycle-bin/page.tsx            # Recycle bin
    profile/page.tsx                # User profile (server component with DB queries)
    integrations/page.tsx           # API documentation + key management
    api/                            # All REST API route handlers (see endpoints above)
      admin/users/route.ts          # Admin user list/create
      admin/users/[id]/route.ts     # Admin user mutate/delete
      admin/security/route.ts       # Admin security/encryption controls
  components/
    Providers.tsx                   # Composes SessionProvider + ThemeProvider + ToastProvider
    AppShell.tsx                    # Authenticated layout shell: Sidebar + SearchOverlay + KeyboardShortcuts
    Sidebar.tsx                     # Collapsible nav sidebar with sections: Overview, Workspace, Projects, Account
    Dashboard.tsx                   # Home dashboard with stats, recent items, quick links
    TasksPage.tsx                   # Tasks page: filters, sorting, pagination, inline status/done toggle, undo
    ProjectsPage.tsx                # Projects page: project list, task detail, status management, undo
    PriorityInboxPage.tsx           # Priority inbox: overdue, due today, high priority sections, snooze, undo
    DispatchPage.tsx                # Daily dispatch: task list, completion, finalization, history
    DispatchHistoryOverlay.tsx      # Calendar overlay for dispatch history navigation
    NotesPage.tsx                   # Notes list: grid/list view, search, delete
    NoteEditor.tsx                  # Markdown note editor with formatting toolbar
    RecycleBinPage.tsx              # Recycle bin: restore, permanent delete, retention timers
    ProfilePreferences.tsx          # Theme toggle, API key management, sign-out
    AssistantPage.tsx               # Personal Assistant chat UI + conversation manager
    AdminSettingsPanel.tsx          # Admin-only control plane in Profile
    IntegrationsPage.tsx            # API docs with curl/fetch/PowerShell code generation
    SearchOverlay.tsx               # Global search overlay (Ctrl+K) with debounced cross-entity results
    KeyboardShortcuts.tsx           # Global keyboard shortcut handler
    ShortcutHelpOverlay.tsx         # Shortcut reference modal (? key)
    ToastProvider.tsx               # Toast notification system: success, error, info, undo variants
    ThemeProvider.tsx                # Dark/light theme context, persisted to localStorage
    TaskModal.tsx                   # Create/edit task modal
    ProjectModal.tsx                # Create/edit project modal
    CustomSelect.tsx                # Reusable styled dropdown
    Pagination.tsx                  # Pagination controls
    icons.tsx                       # SVG icon library (25+ icons)
  lib/
    api.ts                          # withAuth, withAdminAuth, getApiKeyFromRequest, resolveApiKeySession, jsonResponse, errorResponse
    client.ts                       # Typed API client with all resource methods + type exports
    ai.ts                           # AI config/model/provider helpers + model factory
    ai-encryption.ts                # AES-GCM API key encryption helpers
    projects.ts                     # PROJECT_COLORS config, PROJECT_COLOR_OPTIONS, PROJECT_STATUS_OPTIONS
    pagination.ts                   # parsePagination, paginatedResponse helpers
  mcp-server/
    index.ts                        # Standalone MCP HTTP server entrypoint
    tools/                          # Dispatch action tools: tasks, notes, projects, dispatches, search
  db/
    schema.ts                       # All Drizzle table definitions + indexes
    index.ts                        # Database client singleton (better-sqlite3)
    seed.ts                         # Database seed script (npm run db:seed)
  auth.ts                           # NextAuth.js v5 config (GitHub + Credentials providers)
  test/
    db.ts                           # createTestDb() - in-memory SQLite factory for tests
    setup.ts                        # mockSession(), NextResponse mock, global test setup
```

## UI Patterns

### Layout
- `AppShell` wraps all authenticated pages: renders `Sidebar` (left) + main content area.
- Sidebar is collapsible with sections: Overview (Dashboard, Dispatch), Workspace (Inbox, Tasks, Notes), Projects (dynamic list), Account (Integrations, Shortcuts, Profile).
- Dark mode toggle in sidebar footer. Theme persisted to localStorage via `ThemeProvider`.

### Toast System
- `ToastProvider` at root provides `toast.success()`, `toast.error()`, `toast.info()`, and `toast.undo()`.
- Toasts render fixed bottom-right. Auto-dismiss after 4s (5s for undo).
- Undo toasts show an "Undo" button that calls a callback to revert the action.

### Task Completion Flow
- Marking a task as done triggers a dismiss animation (`animate-task-complete-dismiss`, 420ms).
- An undo toast appears with the task title allowing the user to revert completion.
- Optimistic UI updates with API rollback on failure.
- `completingIds` state + `completionTimeoutsRef` manage animation timing.
- This pattern is consistent across TasksPage, ProjectsPage, and PriorityInboxPage.

### Keyboard Shortcuts
- `Ctrl+K` or `/` — Open search overlay
- `n t` — New task modal
- `n n` — New note
- `g h` — Go to dashboard
- `g d` — Go to dispatch
- `Alt+A` (or `Ctrl+Shift+A`) — Open Personal Assistant (when enabled)
- `g t` — Go to tasks
- `?` — Show shortcut help overlay

### Animations (globals.css)
17 custom keyframe animations: slide-in-right, modal-enter, backdrop-enter, slide-down-fade, fade-in-up, status-ring, row-flash, task-complete-dismiss, task-strike-through, slide-out-right, shimmer, icon-spin-in, check-appear, spinner, login-shell-exit, login-card-fly-out, login-page-exit.

### Profile Avatars
- OAuth users display their provider profile image.
- Local/credentials users display a user silhouette SVG icon as the fallback avatar (in both the sidebar and profile page).

## Hosting

- Runs locally via `npm run dev` during development.
- `npm run dev` runs both Next.js and the MCP server concurrently.
- Production mode via `npm run build && npm run start` for a more optimized local server.
- No deployment target — this is a personal localhost application.
- App version exposed via `NEXT_PUBLIC_APP_VERSION` from package.json.

## Testing

- Vitest for unit and integration tests, colocated with source under `__tests__/` directories.
- Test helpers provide in-memory SQLite database factory (`src/test/db.ts`) and auth mocking (`src/test/setup.ts`).
- Tests mock `@/auth` for session control and `@/db` with an in-memory SQLite instance.
- When appropriate, test with the chrome-devtools MCP for visual/interactive verification. Check to see if a dev server is already running before trying to start a new one.

## Environment Variables (.env.local)

| Variable            | Purpose                              |
| ------------------- | ------------------------------------ |
| `AUTH_SECRET`       | NextAuth.js JWT signing secret       |
| `AUTH_GITHUB_ID`    | GitHub OAuth app client ID           |
| `AUTH_GITHUB_SECRET`| GitHub OAuth app client secret       |
| `DISPATCH_SECURITY_CONFIG_PATH` | Optional override for local encryption state file path |
