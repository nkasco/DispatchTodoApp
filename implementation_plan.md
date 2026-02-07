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

- [ ] **9.1** Fix spacing in the Dashboard Recent Activity section between the text and the colored decoration.
- [ ] **9.2** Audit dashboard widgets that link to the Tasks page — inventory the 4 task-linked widgets and document redundancy vs. notes/dispatches.
- [ ] **9.3** Create a rebalancing plan for dashboard navigation emphasis — define which widgets should link to Tasks, Notes, and Dispatches (and how many of each).
- [ ] **9.4** Implement the dashboard widget rebalance from the plan so task links are proportional to notes/dispatches.
- [ ] **9.5** Revamp the Tasks page interactions so the flow feels cohesive and intentional (filters, row actions, status toggles, and detail/edit affordances).
- [ ] **9.6** Eliminate the slight flicker when the Dashboard and Dispatch pages load.
- [ ] **9.7** Add a User Profile page and link to it from the sidebar.
- [ ] **9.8** Move the user profile section to the bottom of the sidebar.
- [ ] **9.9** Introduce four Quick Add buttons in the top on the main menu of the sidebar, with the 4th button reserved for Search.
- [ ] **9.10** When the search textbox appears, prevent the selection highlight from showing so it does not disrupt the UI aesthetic.
