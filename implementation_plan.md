# Dispatch — Implementation Plan

## Phase 1: Authentication & User Foundation

Get OAuth2 login working end-to-end so all subsequent work can happen behind a protected session.

- [x] **1.1** Register a GitHub OAuth App and populate `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` in `.env.local`.
- [x] **1.2** Generate the initial Drizzle migration from the existing schema (`users`, `accounts`, `sessions`) and apply it to create `dispatch.db`.
- [x] **1.3** Wire NextAuth.js to persist users/accounts/sessions into SQLite via a Drizzle adapter (or manual callbacks).
- [x] **1.4** Build a sign-in page (`src/app/login/page.tsx`) with a "Sign in with GitHub" button.
- [x] **1.5** Build a minimal top-level layout with a nav bar that shows the authenticated user's name/avatar and a sign-out button.
- [x] **1.6** Confirm the `withAuth` wrapper correctly rejects unauthenticated API calls with 401.

## Phase 2: Core Data Model & CRUD APIs

Define the first domain entities and build the REST endpoints that the UI will consume.

- [x] **2.1** Design the tasks table schema in `src/db/schema.ts` — fields: `id`, `userId`, `title`, `description`, `status` (enum: open/in_progress/done), `priority` (low/medium/high), `dueDate`, `createdAt`, `updatedAt`.
- [x] **2.2** Design the notes table schema — fields: `id`, `userId`, `title`, `content` (markdown text), `createdAt`, `updatedAt`.
- [x] **2.3** Generate and run a Drizzle migration for the new tables.
- [x] **2.4** Implement `GET /api/tasks` (list, with filters for status/priority), `POST /api/tasks` (create).
- [x] **2.5** Implement `GET /api/tasks/[id]`, `PUT /api/tasks/[id]`, `DELETE /api/tasks/[id]`.
- [x] **2.6** Implement `GET /api/notes`, `POST /api/notes`.
- [x] **2.7** Implement `GET /api/notes/[id]`, `PUT /api/notes/[id]`, `DELETE /api/notes/[id]`.
- [x] **2.8** Add input validation for all POST/PUT endpoints (reject malformed payloads with 400).

## Phase 2.5: Test Infrastructure & Coverage for Phases 1–2

Set up Vitest and write tests covering the authentication layer and all CRUD API routes.

- [x] **2.5.1** Install Vitest, configure `vitest.config.ts` with path aliases, add `npm run test` / `npm run test:watch` scripts.
- [x] **2.5.2** Create test helpers: in-memory SQLite test database factory (`src/test/db.ts`), mock session controller and `NextResponse` mock (`src/test/setup.ts`).
- [x] **2.5.3** Write unit tests for `withAuth`, `jsonResponse`, `errorResponse` in `src/lib/__tests__/api.test.ts` — covers 401 rejection, session pass-through, route context forwarding, and response formatting.
- [x] **2.5.4** Write integration tests for tasks CRUD in `src/app/api/tasks/__tests__/route.test.ts` — covers create, list, filter by status/priority, get by id, update (partial & full), delete, ownership isolation, and input validation (32 tests).
- [x] **2.5.5** Write integration tests for notes CRUD in `src/app/api/notes/__tests__/route.test.ts` — covers create, list, search-by-title, get by id, update, delete, ownership isolation, and input validation (27 tests).

## Phase 3: UI — Task & Note Management

Build the front-end pages that let the user interact with tasks and notes.

- [ ] ** 3.0.1** Ensure GitHub account creation works.
- [x] **3.1** Create a dashboard page (`/`) showing a summary: open task count, recent notes, upcoming due dates.
- [x] **3.2** Build a tasks list page (`/tasks`) with filtering (status, priority) and sorting (due date, created date).
- [x] **3.3** Build a task detail/edit page or modal for creating and editing a single task.
- [x] **3.4** Build a notes list page (`/notes`) with search-by-title.
- [x] **3.5** Build a note editor page (`/notes/[id]`) with a markdown text area and live preview.
- [x] **3.6** Implement a shared `useFetch` hook or thin API client (`src/lib/client.ts`) to standardize client-side API calls with error handling.
- [x] **3.7** Add optimistic UI updates for task status toggles (open -> done, etc.).
- [x] **3.8** Write tests for the API client (`src/lib/client.ts`) covering fetch wrappers, error handling, and response parsing (21 tests).

## Phase 4: Daily Dispatch View & Workflow

The signature feature: a daily "dispatch" view that aggregates what's relevant for today.

- [x] **4.1** Design a `dispatches` table — fields: `id`, `userId`, `date` (unique per user per day), `summary` (markdown), `finalized` (boolean), `createdAt`, `updatedAt`. Also a `dispatch_tasks` join table for linking tasks.
- [x] **4.2** Implement CRUD API routes for dispatches (`/api/dispatches`, `/api/dispatches/[id]`).
- [x] **4.3** Write integration tests for dispatch CRUD routes (create, get, update, delete, auto-create today, ownership isolation) — 25 tests.
- [x] **4.4** Build the daily dispatch page (`/dispatch`) that auto-creates today's entry if it doesn't exist.
- [x] **4.5** Show today's tasks (due today or overdue) inline within the dispatch view.
- [x] **4.6** Allow linking/unlinking tasks to a dispatch via `dispatch_tasks` join table and `/api/dispatches/[id]/tasks` endpoint.
- [x] **4.7** Add a "complete day" action (`/api/dispatches/[id]/complete`) that marks the dispatch as finalized and rolls unfinished tasks to the next day.
- [x] **4.8** Write tests for dispatch-specific logic: task linking, day completion, task rollover — 18 tests.

## Phase 5: Polish, Search & Quality of Life

Harden the app and add cross-cutting features that make daily use pleasant.

- [x] **5.1** Add global search across tasks, notes, and dispatches (SQLite FTS5 or simple `LIKE` queries).
- [x] **5.2** Add keyboard shortcuts for common actions (new task, new note, navigate to dispatch).
- [x] **5.3** Add a dark mode toggle (Tailwind's `dark:` variant, stored in localStorage).
- [x] **5.4** Add toast notifications for success/error feedback on mutations.
- [x] **5.5** Add pagination to list endpoints and UI (`?page=&limit=` query params).
- [x] **5.6** Write a seed script (`src/db/seed.ts`) that populates sample data for development.
- [x] **5.7** Review and harden all API routes: rate-limit awareness, consistent error messages, edge cases.
- [x] **5.8** Write tests for search endpoint, pagination logic, and any new API routes added in this phase.
- [x] **5.9** Ensure `npm test` passes in CI-like fashion (all tests green, no flaky tests) as a final gate.
- [x] **5.10** Add a left sidebar navigation, it must be collapsible with an icon and animated collapse/fly-out. Realign particular navigation items from the top so that they make more sense.

## Phase 6: GitHub Authentication

Fix the authentication flow so GitHub OAuth works end-to-end. Currently only a local/test account is available.

- [x] **6.1** Verify GitHub OAuth App settings (callback URL, client ID/secret) are correctly configured in `.env.local`.
- [x] **6.2** Debug and fix the NextAuth.js GitHub provider flow — ensure the OAuth redirect, callback, and session creation all work.
- [x] **6.3** Ensure new GitHub users are persisted to the `users` and `accounts` tables on first sign-in.
- [x] **6.4** Test the full login → session → protected routes → sign-out cycle with a real GitHub account.
- [x] **6.5** Handle edge cases: expired sessions, revoked tokens, duplicate account linking.

## Phase 7: Theme Overhaul — True Dark Mode

Replace the current navy-tinted dark theme with a deeper, true-dark palette for better contrast and a more modern aesthetic.

- [x] **7.1** Audit all dark mode color values across components — replace `gray-800`/`gray-900`/`gray-950` navy tones with neutral/zinc/stone equivalents or true blacks.
- [x] **7.2** Update the sidebar palette — shift from `bg-gray-950` to a deeper neutral dark (`bg-neutral-950` or `bg-zinc-950`).
- [x] **7.3** Update the main content area background — make `dark:bg-gray-900` darker and more neutral.
- [x] **7.4** Update cards, inputs, modals, and overlays to use the new darker palette consistently.
- [x] **7.5** Adjust text contrast ratios — ensure all text meets WCAG AA on the new darker backgrounds.
- [x] **7.6** Update the search overlay, toast notifications, and shortcut help modal to match the new palette.
- [x] **7.7** Visual verification — screenshot every page in both themes and confirm consistent look.

## Phase 8: UI Enhancement — Animations, Hover States & Visual Density

Upgrade the entire interface from functional-minimal to polished and interactive. Replace plain text and basic controls with richer UI elements, add motion throughout, and make every page feel full and intentional.

### 8A — Global Animations & Transitions

- [x] **8.1** Add modal enter/exit animations — fade + scale-up for TaskModal, ShortcutHelpOverlay; slide-down + fade for SearchOverlay. Use CSS `@keyframes` and Tailwind `animate-*` utilities.
- [x] **8.2** Add page/section mount animations — staggered fade-in-up for list items (task rows, note cards, dispatch tasks) so content cascades in rather than appearing all at once.
- [x] **8.3** Animate task status changes — when a status dot is clicked, pulse/ring-expand the dot and briefly highlight the row with a color wash before settling.
- [x] **8.4** Add smooth height transitions for collapsible sections — the dispatch "Add Tasks" picker, filter panels, and any expandable content should animate open/closed rather than toggling instantly.
- [ ] **8.5** Animate the theme toggle — cross-fade or rotate the Sun/Moon icon on switch, and apply a brief full-page opacity transition so the theme change feels intentional.
- [x] **8.6** Add delete confirmation animations — when a delete button is clicked, slide the item out or fade-to-red before removal rather than instantly vanishing.
- [x] **8.7** Add button press feedback — subtle scale-down (`active:scale-95`) on all clickable buttons and interactive cards so clicks feel tactile.

### 8B — Hover States & Micro-Interactions

- [x] **8.8** Enhance task row hovers — on hover, lift the row slightly (`hover:-translate-y-px`), add a subtle shadow, and reveal action buttons (Edit / Delete) that are hidden at rest.
- [x] **8.9** Enhance note card hovers — scale the card up slightly (`hover:scale-[1.02]`), deepen the shadow, and shift the border color. The delete button already reveals on hover; add a smooth fade for it.
- [ ] **8.10** Add hover tooltips to icon-only elements — the sidebar collapse toggle, status dots, priority badges, and the theme toggle should show descriptive tooltips on hover.
- [x] **8.11** Enhance the "New Task" / "New Note" buttons — add an icon (+ symbol), give them a gradient or accent background, and add a hover glow/shadow effect so they stand out as primary actions.
- [x] **8.12** Add focus-visible rings to all interactive elements — inputs, buttons, links, and cards should show a visible `ring-2 ring-blue-500/50` outline on keyboard focus for accessibility.
- [x] **8.13** Enhance pagination controls — replace the plain Previous/Next text buttons with pill-shaped controls, add page number indicators between them, and show hover background fills.

### 8C — Richer UI Controls

- [x] **8.14** Replace all native `<select>` dropdowns (status, priority, sort filters) with custom styled dropdown menus — rounded, with icons per option, smooth open/close animation, and keyboard navigation.
- [ ] **8.15** Upgrade form inputs across TaskModal and the login page — add floating labels or inset labels, subtle inner shadows, and animated focus borders that expand from center.
- [x] **8.16** Replace the plain "Saving..." / "Saved" text in NoteEditor with an animated status indicator — a spinner while saving, a checkmark that fades in on save, auto-hiding after 2 seconds.
- [x] **8.17** Upgrade the login page — add a subtle background pattern or gradient, a card container with shadow and depth, and a loading spinner on the sign-in button during OAuth redirect.

### 8D — Visual Density & Page Utilization

- [x] **8.18** Expand the Dashboard — add a "Quick Actions" row (large icon buttons for New Task, New Note, Open Dispatch, Search), a progress bar or ring showing today's task completion percentage, and a "Recent Activity" timeline beneath the existing two-column section.
- [x] **8.19** Enhance the empty states — replace plain text with illustrated empty states (SVG illustrations or large icons) and clear call-to-action buttons, not just text links.
- [x] **8.20** Add card-based layouts with shadows and depth — task rows should live inside a unified card container with dividers between rows rather than floating as separate bordered boxes. Note cards should have drop shadows.
- [x] **8.21** Add header stats/badges to list pages — the Tasks page header should show inline counts (e.g., "12 open · 3 in progress · 8 done") and the Notes page should show total count. These should animate when values change.
- [x] **8.22** Improve the Dispatch page layout — give the Daily Summary and Tasks sections card-style containers with headers, add a visual timeline or progress indicator for the day, and make the "Complete Day" button more prominent with an icon and confirmation step.

### 8E — Loading & Skeleton Polish

- [x] **8.23** Upgrade loading skeletons from simple pulsing boxes to shimmer/wave skeletons — a gradient sweep animation across placeholder shapes that more closely mirror the actual content layout (title lines, avatar circles, badge pills).
- [x] **8.24** Add loading spinners to async buttons — the "Save Summary", "Complete Day", "Create Task", and "Save Note" buttons should show an inline spinner and disable during their API call, then animate to a success state.

### 8F — Visual Verification

- [X] **8.25** Screenshot every page in both themes and verify: animations are smooth, hover states are consistent, page space is well-utilized, no layout shifts or visual regressions. (In progress: light theme screenshots still needed for Dispatch and Login.)

## Phase 9: Dashboard & Navigation Refinements

Targeted UX fixes and navigation balance across dashboard, tasks, and sidebar.

- [x] **9.1** Fix spacing in the Dashboard Recent Activity section between the text and the colored decoration.
- [x] **9.2** Audit dashboard widgets that link to the Tasks page — inventory the 4 task-linked widgets and document redundancy vs. notes/dispatches.
- [x] **9.3** Create a rebalancing plan for dashboard navigation emphasis — define which widgets should link to Tasks, Notes, and Dispatches (and how many of each).
- [x] **9.4** Implement the dashboard widget rebalance from the plan so task links are proportional to notes/dispatches.
- [x] **9.5** Revamp the Tasks page interactions so the flow feels cohesive and intentional (filters, row actions, status toggles, and detail/edit affordances).
- [x] **9.6** Eliminate the slight flicker when the Dashboard and Dispatch pages load.
- [x] **9.7** Add a User Profile page and link to it from the sidebar.
- [x] **9.8** Move the user profile section to the bottom of the sidebar.
- [x] **9.9** Introduce four Quick Add buttons in the top on the main menu of the sidebar, with the 4th button reserved for Search.
- [x] **9.10** When the search textbox appears, prevent the selection highlight from showing so it does not disrupt the UI aesthetic.

## Phase 10: Projects & Profile Enrichment

Introduce Projects as first-class groupings of tasks, tighten task/project synergy, and expand the Profile page.

- [x] **10.1** Design the `projects` table schema (id, userId, name, description, status, color, createdAt, updatedAt) and add `projectId` (nullable) to `tasks` with indexes.
- [x] **10.2** Generate and run a Drizzle migration for `projects` and the `tasks.projectId` column.
- [x] **10.3** Implement `/api/projects` CRUD and `/api/projects/[id]` endpoints; add `/api/projects/[id]/tasks` to list tasks by project; update `/api/tasks` to accept `projectId` filters and updates.
- [x] **10.4** Update Tasks UI to reflect project synergy: project filters, project badges in rows, and project-aware creation/edit flows.
- [x] **10.5** Build the Projects page: list + create/edit, project detail view with task list, stats, and quick actions.
- [x] **10.6** Add a collapsible "Projects" section in the sidebar that shows active projects (with counts) and highlights the current project.
- [x] **10.7** Add project signals to the dashboard (active project progress, recent project activity) without overpowering tasks/notes.
- [x] **10.8** Expand the Profile page content (account details, usage stats for tasks/notes/projects, preferences, and shortcuts).
- [x] **10.9** Add tests for projects API routes and tasks/projects integration (filters, assignment, ownership).

## Phase 11: Recycle Bin (Soft-Delete)

Add a recycle bin that holds deleted tasks, notes, and projects for 30 days before permanently purging them.

- [x] **11.1** Add `deletedAt` (nullable text) column to `tasks`, `notes`, and `projects` tables. Generate and apply migration.
- [x] **11.2** Convert all DELETE handlers for tasks, notes, and projects to soft-delete (set `deletedAt` timestamp instead of hard-deleting the row).
- [x] **11.3** Add `isNull(deletedAt)` filters to all list, get-by-id, update, and search queries so soft-deleted items are invisible to normal views.
- [x] **11.4** Create `/api/recycle-bin` — GET lists all soft-deleted items across entity types; POST accepts `{id, type, action}` to restore or permanently delete.
- [x] **11.5** Auto-purge: on each recycle bin list request, permanently delete items whose `deletedAt` is older than 30 days.
- [x] **11.6** Add `recycleBin` methods to the client API (`src/lib/client.ts`).
- [x] **11.7** Build the Recycle Bin UI page (`/recycle-bin`) with type filter tabs, restore/delete-forever actions, and days-remaining indicator.
- [x] **11.8** Add a Recycle Bin link (with trash icon) to the sidebar Workspace section below Notes.
- [x] **11.9** Update `spec.md` to reflect the full current feature set including soft-delete, recycle bin, and all pages/endpoints.

## Phase 12: UX Consistency, Insights & Responsive Experience

Address cross-page UX inconsistencies, strengthen Dispatch as a daily workflow/journal hub, add visual branding, and ensure strong multi-device responsiveness.

- [X] **12.1** Ensure GitHub OAuth sign-in uses the same login transition animation sequence currently used for local credentials sign-in.
- [x] **12.2** Fix Project creation modal positioning bug where the popup drifts lower as project count increases.
- [x] **12.3** Fix Task creation modal positioning bug on the Tasks page where, when multiple tasks exist, the popup appears at the very top without expected margin.
- [x] **12.4** Rearrange the Dashboard "Recent Activity" section layout on the Dashboard page for clearer hierarchy and spacing. Bump the version to v0.1.1
- [ ] **12.5** Persist and honor the Projects subsection collapsed state even when the full sidebar is collapsed and expanded again.
- [x] **12.6** Add a new **Insights** section (name candidate replacing "History") with completion trend visualizations over time (e.g., line/bar charts, selectable ranges).
- [x] **12.7** Update Dispatch page verbaige to explicitly position Daily Summary as examples such as a planning note or personal journal (including gratitude/reflection use).
- [x] **12.8** On Dispatch save, auto-create or update a same-day linked Note entry so the Daily Summary is retained in Notes history. The note name should have the date in it, "Daily Dispatch - <date>" format, this format will also make it easier to know if it should create a new note or update an existing one.
- [x] **12.9** Allow completion of linked tasks directly from the Dispatch page with existing optimistic update + undo behavior parity. UI elements should allow the checkboxes too.
- [x] **12.10** Add app branding assets: favicon (lightning bolt candidate) and initial logo treatment for app identity.
- [x] **12.11** There is a subtle flicker when loading any page because of the way it queries the data via API. Any way to make this smoother? Maybe the page loads but the areas that are loading have loading bars and animations to show the content once it's pulled back

## Phase 13: Administration, Account Control & Data-At-Rest Security Protection

Add a secure admin control plane with explicit role management and optional database encryption controls.

- [x] **13.1** Add an **Administration** settings section, visible only to administrator accounts, surfaced from the Profile page. Add a nice badge of honor to the page.
- [x] **13.2** Implement first-user bootstrap logic so the very first account created is automatically assigned the administrator role.
- [x] **13.3** Add administrator user-management actions: reset password, freeze/unfreeze account access, create and delete user accounts.
- [x] **13.4** Add administrator role delegation so an existing admin can promote or demote other user accounts to/from administrator status.
- [x] **13.5** Add optional support for encrypting the SQLite database at rest.
- [x] **13.6** Add an administrator-controlled setting to enable or disable at-rest database encryption, defaulted to **off**. Bump the version to v0.2.0

## Phase 14: Personal Assistant — AI Chat Integration

Incorporate a conversational AI assistant into Dispatch, powered by cloud LLM providers (OpenAI, Anthropic, Google Gemini) or locally-running models (Ollama, LM Studio). Uses the **Vercel AI SDK** (`ai`) as the unified abstraction layer — one codebase, any model.

### Research Summary

| Option | Package / Tool | Notes |
|--------|---------------|-------|
| Unified SDK | `ai` (Vercel AI SDK v6) | Single `streamText()` API across all providers. First-class Next.js App Router support with `useChat()` hook for streaming. |
| OpenAI | `@ai-sdk/openai` | GPT-4o, o-series, etc. |
| Anthropic | `@ai-sdk/anthropic` | Claude Opus, Sonnet, Haiku. |
| Google Gemini | `@ai-sdk/google` | Gemini 2.5 Pro/Flash, etc. |
| Local models | `@ai-sdk/openai-compatible` | Connects to any OpenAI-compatible endpoint. Ollama serves on `localhost:11434/v1`, LM Studio on `localhost:1234/v1`. Same integration code for both. |
| Ollama | External tool (not an npm dep) | CLI/server for running open-source models locally. `ollama pull llama3.2` to download, auto-serves an OpenAI-compatible API. GPU-accelerated. |
| LM Studio | External tool (not an npm dep) | Desktop GUI alternative to Ollama. Also exposes OpenAI-compatible API. |
| Chat UI | Custom build with `useChat()` | Build chat bubbles, markdown rendering, and streaming indicator with Tailwind CSS to match existing Dispatch design system. No heavy third-party chat UI library needed. |

### 14A — Data Model & Configuration

- [x] **14.1** Design an `ai_config` table — fields: `id`, `userId`, `provider` (enum: `openai` / `anthropic` / `google` / `ollama` / `lmstudio` / `custom`), `apiKey` (encrypted, nullable — not needed for local models), `baseUrl` (nullable — for custom/local endpoints, e.g. `http://localhost:11434/v1`), `model` (string — e.g. `gpt-4o`, `claude-sonnet-4-5-20250929`, `llama3.2`), `isActive` (boolean, default true), `createdAt`, `updatedAt`. One active config per user.
- [x] **14.2** Design a `chat_conversations` table — fields: `id`, `userId`, `title` (auto-generated or user-editable), `createdAt`, `updatedAt`. And a `chat_messages` table — fields: `id`, `conversationId`, `role` (enum: `user` / `assistant` / `system`), `content` (text), `model` (string — which model generated this response), `tokenCount` (nullable integer), `createdAt`.
- [x] **14.3** Generate and run the Drizzle migration for `ai_config`, `chat_conversations`, and `chat_messages`.
- [x] **14.4** Add a `assistantEnabled` boolean column (default `true`) to the `users` table. This controls whether the Personal Assistant feature is visible in the sidebar and accessible to the user. Generate migration.

### 14B — API Key Management & Provider Setup

- [x] **14.5** Implement `GET /api/ai/config` and `PUT /api/ai/config` — read and update the user's active AI provider configuration. API keys must be encrypted at rest (use AES-256 or similar with `AUTH_SECRET` as the encryption key). The GET endpoint should return a masked key (e.g. `sk-...abc123`), never the raw key.
- [x] **14.6** Implement `GET /api/ai/config/test` — validates the current configuration by making a minimal API call (e.g. list models or send a single-token completion) and returns success/failure with an error message if applicable.
- [x] **14.7** Implement `GET /api/ai/models` — returns available models for the configured provider. For cloud providers, fetches from the provider's model list API. For Ollama/LM Studio, queries the local `/v1/models` endpoint and returns what's installed.

### 14C — Chat API & Streaming

- [x] **14.8** Install core dependencies: `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`.
- [x] **14.9** Build a provider factory module (`src/lib/ai.ts`) that reads the user's `ai_config` and returns the appropriate AI SDK model instance. For `openai`/`anthropic`/`google`, use the dedicated provider packages. For `ollama`/`lmstudio`/`custom`, use `createOpenAICompatible()` pointed at the configured `baseUrl`.
- [x] **14.10** Implement `POST /api/ai/chat` — the streaming chat endpoint. Accepts `{ conversationId, messages }`, loads the user's AI config, calls `streamText()` with the resolved model, and returns `result.toUIMessageStreamResponse()`. Persists the user message and assistant response to `chat_messages` after streaming completes.
- [x] **14.11** Implement conversation CRUD: `GET /api/ai/conversations` (list), `POST /api/ai/conversations` (create), `GET /api/ai/conversations/[id]` (get with messages), `DELETE /api/ai/conversations/[id]` (delete conversation and its messages).

### 14D — Personal Assistant UI

- [x] **14.12** Build the Personal Assistant page (`/assistant`) with a two-panel layout: conversation list sidebar (left) and active chat area (right). Use the `useChat()` hook from `@ai-sdk/react` for streaming message display.
- [x] **14.13** Build the chat interface: message bubbles (user right-aligned, assistant left-aligned), markdown rendering for assistant responses (reuse existing markdown rendering from NoteEditor), auto-scroll to newest message, typing/streaming indicator, and an input bar with send button at the bottom.
- [x] **14.14** Add conversation management UI: new conversation button, conversation title editing, delete conversation with confirmation, conversation list sorted by most recent activity.
- [x] **14.15** Add model/provider indicator in the chat header — show which model is active (e.g. "GPT-4o" or "llama3.2 (local)") with a quick link to settings if no provider is configured.
- [x] **14.16** Add the Personal Assistant link to the sidebar, positioned above the Dispatch link. Use a sparkles/brain/chat-bubble icon. Respect the `assistantEnabled` user preference — hide the link entirely when disabled.
- [x] **14.17** Add empty state for first-time users who haven't configured an AI provider yet — show a friendly setup prompt with a link to the AI configuration section on the Profile page.

### 14E — Profile Page Integration & Visibility Toggle

- [x] **14.18** Add an **AI Assistant** settings section to the Profile page (`/profile`). Include: provider selector dropdown (OpenAI / Anthropic / Google Gemini / Ollama / LM Studio / Custom), API key input (password-masked, with show/hide toggle), base URL input (auto-filled for known providers, editable for custom/local), model selector (populated from `GET /api/ai/models` after config is saved), and a "Test Connection" button that calls the test endpoint.
- [x] **14.19** Add a **Personal Assistant visibility toggle** to the Profile page (within the AI Assistant settings section or the Preferences section). This toggle updates the `assistantEnabled` field on the user record. When toggled off: the sidebar link is hidden, the `/assistant` page redirects to the dashboard, and the keyboard shortcut (if any) is disabled. Default is **on**.
- [x] **14.20** Implement `PUT /api/me` (or extend existing) to accept `assistantEnabled` boolean updates. Update the session/user context so the sidebar can read this preference without an extra API call.

### 14F — Polish & Quality

- [x] **14.21** Add a keyboard shortcut for opening the Personal Assistant (e.g. `Alt+A` or `Ctrl+Shift+A`), registered in the existing keyboard shortcut system and listed in the shortcut help overlay.
- [x] **14.22** Handle error states gracefully: provider not configured, invalid API key, local model server not running (connection refused), rate limits, and network timeouts. Show clear, actionable error messages inline in the chat.
- [x] **14.23** Add loading/streaming animations consistent with the Dispatch design system — shimmer skeleton for initial load, animated dots or cursor for streaming responses.
- [x] **14.24** Write integration tests for AI config CRUD, conversation CRUD, and the chat endpoint (mock the AI SDK's `streamText` to avoid real API calls in tests).
- [x] **14.25** Update `spec.md` to document the Personal Assistant feature, new tables, new API endpoints, and new components. Bump the version to v0.3.0.

### 14G — MCP Server (Model Context Protocol) for Tool Use

Give the Personal Assistant the ability to **take actions** inside Dispatch — managing tasks, notes, projects, and dispatches — via a self-hosted MCP server. The AI SDK's `@ai-sdk/mcp` client connects to the MCP server, discovers available tools, and passes them to `streamText()` so the LLM can call them autonomously during a conversation.

**Architecture**: A separate Node.js process (`src/mcp-server/`) running alongside Next.js. It imports the Drizzle schema and DB client directly (no HTTP self-calls) and serves tools over Streamable HTTP on a configurable port (default `3001`). The chat API route creates an MCP client per request, fetches the tool set, and hands it to the AI SDK.

```
Browser (useChat)  ──>  POST /api/ai/chat  ──>  MCP Client (@ai-sdk/mcp)
                              │                         │ Streamable HTTP
                              │                         v
                              │                   MCP Server (:3001)
                              │                   ├─ task tools
                              │                   ├─ note tools
                              │                   ├─ project tools
                              │                   ├─ dispatch tools
                              │                   └─ search tool
                              │                         │
                              │                    Drizzle ORM ──> dispatch.db
                              v
                        LLM (any provider)
```

- [x] **14.26** Install MCP dependencies: `@ai-sdk/mcp`, `@modelcontextprotocol/server`, `@modelcontextprotocol/node`. Add `concurrently` and `tsx` as dev dependencies for running the MCP server alongside Next.js.
- [x] **14.27** Scaffold the MCP server entry point (`src/mcp-server/index.ts`): create a `McpServer` instance, start a `NodeStreamableHTTPServerTransport` on `process.env.MCP_PORT || 3001`, and add CORS headers for `localhost:3000`. Add `npm run mcp:dev` (tsx watch) and update `npm run dev` to run both Next.js and the MCP server via `concurrently`.
- [x] **14.28** Register **task tools** (`src/mcp-server/tools/tasks.ts`): `list-tasks` (with status/priority/project filters), `create-task`, `update-task` (title, description, status, priority, dueDate, projectId), `complete-task` (shorthand to set status=done), `delete-task` (soft-delete). All tools scope queries to the authenticated user's ID.
- [x] **14.29** Register **note tools** (`src/mcp-server/tools/notes.ts`): `list-notes` (with title search), `create-note`, `update-note` (title, content), `delete-note` (soft-delete).
- [x] **14.30** Register **project tools** (`src/mcp-server/tools/projects.ts`): `list-projects` (with status filter), `create-project`, `update-project` (name, description, status, color), `get-project-tasks` (list tasks within a project).
- [x] **14.31** Register **dispatch tools** (`src/mcp-server/tools/dispatches.ts`): `get-today-dispatch` (auto-creates if missing), `update-dispatch-summary`, `link-task-to-dispatch`, `unlink-task-from-dispatch`, `complete-dispatch` (finalize day and roll unfinished tasks).
- [x] **14.32** Register a **search tool** (`src/mcp-server/tools/search.ts`): `search` — cross-entity search across tasks, notes, projects, and dispatches using the same LIKE-query logic as `GET /api/search`.
- [x] **14.33** Implement user context passing: the chat API route (`POST /api/ai/chat`) must forward the authenticated user's ID to the MCP server so all tool operations are scoped correctly. Use a custom header or include `userId` in the MCP client's request metadata. The MCP server must reject tool calls that lack a valid user context.
- [x] **14.34** Update the chat API route to create an `@ai-sdk/mcp` client, call `client.tools()`, and merge the MCP tools into the `streamText()` call. Use `stopWhen: stepCountIs(5)` to cap multi-step tool-calling loops. Add a system prompt instructing the model that it has access to Dispatch tools and should confirm before destructive actions (deletes, completing a dispatch day).
- [x] **14.35** Add tool-call UI rendering in the chat interface — when the assistant calls a tool, show an inline indicator (e.g. "Creating task: Buy groceries..." with a spinner, then "Task created" with a link) so the user can see what actions the AI took. Use the AI SDK's `parts` array on messages to detect `tool-invocation` parts.
- [x] **14.36** Write tests for the MCP server tools: mock the Drizzle DB, register tools, invoke them via the MCP client SDK, and assert correct DB operations and response formats. Test user-scoping isolation (tools should never return or modify another user's data).
- [x] **14.37** Add a health-check indicator for the MCP server connection in the Personal Assistant UI — show a green/red dot or badge indicating whether the tool server is reachable. If unreachable, the assistant still works for conversation but tools are unavailable; show a warning banner explaining this.

Phase 15 - Multi-Device Optimizations
- [ ] **15.1** Validate and improve responsive behavior for iPhone-sized screens, iPad/tablet breakpoints, and smaller desktop windows.

