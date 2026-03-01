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
| Testing        | Vitest 4.0 + Testing Library (jsdom)       |

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
- **integrationConnections** (`integration_connection`) — per-user connector records with provider type, encrypted auth, capability flags, webhook secret, sync direction, last sync state, and last error.
- **integrationProjectMappings** / **integrationTaskMappings** — connector mapping tables linking Dispatch project/task ids to external ids with sync timestamps and conflict markers.
- **integrationOutbox** (`integration_outbox`) — durable outbound connector queue with idempotency keys, retry status, backoff timing, and delivery state.
- **integrationAuditLogs** (`integration_audit_log`) — per-user sync audit trail for connector test runs, deliveries, retries, failures, and webhook reconciliation.
- **importSessions** (`import_session`) — per-user import manifests containing source format, file name, fingerprint, duplicate mode, preview/commit status, warning counts, created/updated/skipped totals, and last failure message.
- **importItemMappings** (`import_item_mapping`) — per-user import idempotency table linking stable external/source keys to Dispatch entity ids so repeated imports can skip, merge, or create copies safely.

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
- Task exports via `POST /api/exports/tasks`, supporting preview responses and downloadable files.
- Connector management via `/api/integrations/connectors*` for CRUD, test, manual sync, and webhook intake.
- Import preview/commit via `/api/imports/preview` and `/api/imports`, supporting guided dry runs, duplicate handling, import session logging, and transactional writes.

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
| Exports     | `/api/exports/tasks`   | --                          | Preview/download CSV, plain-text, or ICS task exports     |
| Connectors  | `/api/integrations/connectors` | `/api/integrations/connectors/[id]` | `.../test`, `.../sync`, `.../webhook`           |
| Imports     | `/api/imports`, `/api/imports/preview` | --          | Dry-run preview, transactional commit, duplicate handling |
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
    imports/page.tsx                # Guided import wizard
    integrations/page.tsx           # API documentation + key management
    api/                            # All REST API route handlers (see endpoints above)
      imports/route.ts              # Import commit endpoint
      imports/preview/route.ts      # Import dry-run preview endpoint
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
    ProfileExports.tsx              # Export controls + preview for CSV/plain-text/ICS task exports
    ImportsPage.tsx                 # Guided import wizard with format guide, mapping, preview, and result states
    AssistantPage.tsx               # Personal Assistant chat UI + conversation manager
    AdminSettingsPanel.tsx          # Admin-only control plane in Profile
    IntegrationsPage.tsx            # API docs with curl/fetch/PowerShell code generation
    ExternalTaskConnectorsSection.tsx # Connector management, sync controls, audit log, conflicts
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
    exports/                        # Export adapter registry + CSV/plain-text/ICS serializers
    imports/                        # Import adapter registry + CSV/board/ZIP/ICS/plain-text/round-trip parsers
    integrations/                   # Connector adapters, encryption wrappers, outbox/audit service
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
    fixtures/imports/               # Sample import fixtures and migration regression references
```

## UI Patterns

### Layout
- `AppShell` wraps all authenticated pages: renders `Sidebar` (left) + main content area.
- Sidebar is collapsible with sections: Overview (Dashboard, Dispatch), Workspace (Inbox, Tasks, Notes), Projects (dynamic list), Account (Integrations, Shortcuts, Profile).
- Dark mode toggle in sidebar footer. Theme persisted to localStorage via `ThemeProvider`.
- `/profile` includes an Exports panel with format descriptions, scope/date filters, preview summaries, and downloadable task exports.
- `/profile` and the sidebar both expose Imports entry points that route to `/imports`.
- `/imports` is a preview-first migration surface with source-format cards, per-format compatibility guidance, upload options, CSV mapping controls, dry-run counts/warnings, and a result state that calls out attachment handling plus transactional rollback safety.
- `/integrations` includes External Task Connectors with encrypted credentials, manual re-sync controls, webhook URLs, conflict markers, and a sync audit log.

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

## Exports & Connector Interop

- Export adapters live under `src/lib/exports/` and currently support structured CSV, plain-text task files, and iCalendar (`.ics`).
- Export previews surface counts, omitted fields, fallback mappings, and warnings before file generation. Download responses include traceability headers for export format, generation time, count, and manifest metadata.
- Export serialization is timezone-aware using the user's profile timezone. Date-range filtering prefers due date and falls back to created date when a task has no due date.
- Connector adapters live under `src/lib/integrations/connectors/` and currently support a generic REST/OAuth task API, CalDAV task collections, and a local automation URI/desktop bridge mode.
- Task create/update/delete mutations enqueue durable outbox jobs. Connector failures never block local task edits; they are retried with backoff and recorded in the audit log.
- Webhook intake supports near-real-time external change detection. Conflict handling defaults to last-write-wins when the external timestamp is newer, while newer local edits leave an explicit conflict marker for review.
- Plain-text task systems remain export-only in v1 connector scope. Local automation is push-oriented with manual or bridge-based reconciliation rather than full bidirectional sync.

## Imports & Migration Onboarding

- Import adapters live under `src/lib/imports/` and normalize every source into a canonical batch containing tasks, projects, notes, dispatch summaries, warnings, skipped rows, mapping suggestions, and source metadata before preview or commit.
- Supported source families are structured CSV/spreadsheets, board-style JSON, workspace ZIP bundles, iCalendar (`.ics`), plain-text task files, and Dispatch round-trip restores from phase 18 exports.
- Preview and commit honor the authenticated user's profile timezone. Date-only values stay date-only, while ambiguous datetimes collapse into the user's effective timezone with explicit warnings where fidelity is reduced.
- Duplicate handling is explicit per run: `skip`, `merge`, or `create_copy`. File fingerprints and stable source ids are stored in `import_session` and `import_item_mapping` so repeat imports remain traceable and safe.
- Import commits are transactional. If the write stage fails, Dispatch records the failed session and rolls back local writes instead of leaving partial tasks, projects, notes, or dispatches behind.
- Conversion rules intentionally preserve foreign concepts as best-effort content: sections/lists become projects or task status, checklists become markdown checklist blocks, comments/history become appended markdown sections, and attachments/assets become manifest references when direct import is unavailable.
- Guardrails cap file size, CSV row count, and ZIP archive entries with clear preview-time errors designed for local-machine operation rather than silent truncation.
- Phase 18 export files are a first-class import source in phase 19. Dispatch CSV, plain-text, and ICS exports round-trip through the `dispatch_roundtrip` adapter with source-id preservation and duplicate detection tuned for restore workflows.
- The UI and docs both expose a compatibility matrix that distinguishes fields preserved exactly, approximated conversions, and intentionally unsupported data for each format family.

## Testing

- Vitest for unit and integration tests, colocated with source under `__tests__/` directories.
- React Testing Library + jsdom cover import wizard UI flows, mapping controls, warnings, success states, and recoverable failure states.
- Test helpers provide in-memory SQLite database factory (`src/test/db.ts`) and auth mocking (`src/test/setup.ts`).
- Tests mock `@/auth` for session control and `@/db` with an in-memory SQLite instance.
- Import regression coverage includes fixture-backed adapter tests, preview/commit API integration tests, rollback checks, and curated local sample fixtures under `src/test/fixtures/imports/`.
- When appropriate, test with the chrome-devtools MCP for visual/interactive verification. Check to see if a dev server is already running before trying to start a new one.

## Environment Variables (.env.local)

| Variable            | Purpose                              |
| ------------------- | ------------------------------------ |
| `AUTH_SECRET`       | NextAuth.js JWT signing secret       |
| `AUTH_GITHUB_ID`    | GitHub OAuth app client ID           |
| `AUTH_GITHUB_SECRET`| GitHub OAuth app client secret       |
| `DISPATCH_SECURITY_CONFIG_PATH` | Optional override for local encryption state file path |
