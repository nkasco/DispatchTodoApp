# Dispatch — Implementation Plan

## Phase 1: Authentication & User Foundation

Get OAuth2 login working end-to-end so all subsequent work can happen behind a protected session.

- [ ] **1.1** Register a GitHub OAuth App and populate `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` in `.env.local`.
- [ ] **1.2** Generate the initial Drizzle migration from the existing schema (`users`, `accounts`, `sessions`) and apply it to create `dispatch.db`.
- [ ] **1.3** Wire NextAuth.js to persist users/accounts/sessions into SQLite via a Drizzle adapter (or manual callbacks).
- [ ] **1.4** Build a sign-in page (`src/app/login/page.tsx`) with a "Sign in with GitHub" button.
- [ ] **1.5** Build a minimal top-level layout with a nav bar that shows the authenticated user's name/avatar and a sign-out button.
- [ ] **1.6** Confirm the `withAuth` wrapper correctly rejects unauthenticated API calls with 401.

## Phase 2: Core Data Model & CRUD APIs

Define the first domain entities and build the REST endpoints that the UI will consume.

- [ ] **2.1** Design the tasks table schema in `src/db/schema.ts` — fields: `id`, `userId`, `title`, `description`, `status` (enum: open/in_progress/done), `priority` (low/medium/high), `dueDate`, `createdAt`, `updatedAt`.
- [ ] **2.2** Design the notes table schema — fields: `id`, `userId`, `title`, `content` (markdown text), `createdAt`, `updatedAt`.
- [ ] **2.3** Generate and run a Drizzle migration for the new tables.
- [ ] **2.4** Implement `GET /api/tasks` (list, with filters for status/priority), `POST /api/tasks` (create).
- [ ] **2.5** Implement `GET /api/tasks/[id]`, `PUT /api/tasks/[id]`, `DELETE /api/tasks/[id]`.
- [ ] **2.6** Implement `GET /api/notes`, `POST /api/notes`.
- [ ] **2.7** Implement `GET /api/notes/[id]`, `PUT /api/notes/[id]`, `DELETE /api/notes/[id]`.
- [ ] **2.8** Add input validation for all POST/PUT endpoints (reject malformed payloads with 400).

## Phase 3: UI — Task & Note Management

Build the front-end pages that let the user interact with tasks and notes.

- [ ] **3.1** Create a dashboard page (`/`) showing a summary: open task count, recent notes, upcoming due dates.
- [ ] **3.2** Build a tasks list page (`/tasks`) with filtering (status, priority) and sorting (due date, created date).
- [ ] **3.3** Build a task detail/edit page or modal for creating and editing a single task.
- [ ] **3.4** Build a notes list page (`/notes`) with search-by-title.
- [ ] **3.5** Build a note editor page (`/notes/[id]`) with a markdown text area and live preview.
- [ ] **3.6** Implement a shared `useFetch` hook or thin API client (`src/lib/client.ts`) to standardize client-side API calls with error handling.
- [ ] **3.7** Add optimistic UI updates for task status toggles (open -> done, etc.).

## Phase 4: Daily Dispatch View & Workflow

The signature feature: a daily "dispatch" view that aggregates what's relevant for today.

- [ ] **4.1** Design a `dispatches` table — fields: `id`, `userId`, `date` (unique per user per day), `summary` (markdown), `createdAt`, `updatedAt`.
- [ ] **4.2** Implement CRUD API routes for dispatches (`/api/dispatches`, `/api/dispatches/[id]`).
- [ ] **4.3** Build the daily dispatch page (`/dispatch`) that auto-creates today's entry if it doesn't exist.
- [ ] **4.4** Show today's tasks (due today or overdue) inline within the dispatch view.
- [ ] **4.5** Allow linking/unlinking tasks to a dispatch (a join table or JSON array of task IDs).
- [ ] **4.6** Add a "complete day" action that marks the dispatch as finalized and rolls unfinished tasks to the next day.

## Phase 5: Polish, Search & Quality of Life

Harden the app and add cross-cutting features that make daily use pleasant.

- [ ] **5.1** Add global search across tasks, notes, and dispatches (SQLite FTS5 or simple `LIKE` queries).
- [ ] **5.2** Add keyboard shortcuts for common actions (new task, new note, navigate to dispatch).
- [ ] **5.3** Add a dark mode toggle (Tailwind's `dark:` variant, stored in localStorage).
- [ ] **5.4** Add toast notifications for success/error feedback on mutations.
- [ ] **5.5** Add pagination to list endpoints and UI (`?page=&limit=` query params).
- [ ] **5.6** Write a seed script (`src/db/seed.ts`) that populates sample data for development.
- [ ] **5.7** Review and harden all API routes: rate-limit awareness, consistent error messages, edge cases.
