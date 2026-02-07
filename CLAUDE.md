# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Always read `spec.md` first.** It contains the full project specification: architecture, data model, API endpoints, file structure, UI patterns, and component inventory. Consult it before making changes to understand how things fit together.

## Environment

- **OS**: Windows. Always use compatible commands — never use Unix/macOS-only commands (`rm`, `mkdir -p`, `cat`, `chmod`, etc.).
- **Shell**: PowerShell. Use `&&` only in `cmd.exe`; in PowerShell chain with `;` or use separate commands.

## Project Overview

Dispatch is a locally-hosted personal web application built with Next.js (App Router), React, Tailwind CSS v4, SQLite via Drizzle ORM, and NextAuth.js for authentication (GitHub OAuth + local credentials). It exposes REST APIs consumed by the client-side UI.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migrations from schema changes
npm run db:migrate   # Run pending migrations
npm run db:push      # Push schema directly to DB (dev shortcut, skips migration files)
npm run db:studio    # Open Drizzle Studio GUI for the database
npm run db:seed      # Seed database with sample data
npm test             # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
```

## Architecture

- **App Router** (`src/app/`) — Next.js 16 App Router. Pages are React Server Components by default; add `"use client"` directive for client components.
- **REST API routes** (`src/app/api/`) — Next.js Route Handlers. Each route exports HTTP verb functions (`GET`, `POST`, `PUT`, `DELETE`). Protected routes use the `withAuth` wrapper from `src/lib/api.ts`.
- **Auth** (`src/auth.ts`) — NextAuth.js v5 config. GitHub OAuth (conditional on env vars) + Credentials (email/password with bcryptjs). JWT session strategy. Route handler at `src/app/api/auth/[...nextauth]/route.ts`.
- **Database** (`src/db/`) — Drizzle ORM with better-sqlite3. Schema defined in `src/db/schema.ts`, client exported from `src/db/index.ts`. SQLite file is `dispatch.db` at project root (gitignored).
- **Shared UI** (`src/components/`) — 24 reusable React components. See `spec.md` for the full inventory.
- **Utilities** (`src/lib/`) — `api.ts` (withAuth, jsonResponse, errorResponse), `client.ts` (typed API client), `projects.ts` (color config), `pagination.ts` (pagination helpers).
- **Drizzle migrations** (`drizzle/`) — Generated migration SQL files. Config in `drizzle.config.ts`.
- **Tests** (`src/**/__tests__/`) — Vitest tests colocated with source. Test helpers in `src/test/` provide an in-memory SQLite database factory and auth mock. Config in `vitest.config.ts`.

## Key Patterns

- API routes that require authentication should use `withAuth(async (req, session) => { ... })` which returns 401 for unauthenticated requests.
- Use `jsonResponse(data)` and `errorResponse(message, status)` for consistent API responses.
- All database schema changes go in `src/db/schema.ts`, then run `npm run db:generate` to create a migration.
- Tailwind CSS v4 uses `@import "tailwindcss"` in CSS (no `tailwind.config.js` needed). PostCSS configured via `@tailwindcss/postcss` plugin.
- Environment variables go in `.env.local` (gitignored). Auth secrets: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.
- New API routes should have corresponding integration tests. Tests mock `@/auth` for session control and `@/db` with an in-memory SQLite instance from `src/test/db.ts`.
- Task completion uses optimistic UI updates with undo toasts (`toast.undo()`) across TasksPage, ProjectsPage, and PriorityInboxPage.
- Soft-delete pattern: tasks, notes, and projects set `deletedAt` instead of removing rows. Recycle bin handles restore/purge.
- API key authentication supported via `Authorization: Bearer <key>` or `X-API-Key: <key>` headers.
