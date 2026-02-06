# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dispatch is a locally-hosted personal web application built with Next.js (App Router), React, Tailwind CSS v4, SQLite via Drizzle ORM, and NextAuth.js for OAuth2 authentication. It exposes REST APIs consumed by the client-side UI.

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
```

## Architecture

- **App Router** (`src/app/`) — Next.js 16 App Router. Pages are React Server Components by default; add `"use client"` directive for client components.
- **REST API routes** (`src/app/api/`) — Next.js Route Handlers. Each route exports HTTP verb functions (`GET`, `POST`, `PUT`, `DELETE`). Protected routes use the `withAuth` wrapper from `src/lib/api.ts`.
- **Auth** (`src/auth.ts`) — NextAuth.js v5 config. The catch-all handler lives at `src/app/api/auth/[...nextauth]/route.ts`. OAuth2 providers are configured in `src/auth.ts`.
- **Database** (`src/db/`) — Drizzle ORM with better-sqlite3. Schema defined in `src/db/schema.ts`, client exported from `src/db/index.ts`. SQLite file is `dispatch.db` at project root (gitignored).
- **Shared UI** (`src/components/`) — Reusable React components.
- **Utilities** (`src/lib/`) — Shared helpers. `api.ts` provides `withAuth`, `jsonResponse`, and `errorResponse` for consistent API patterns.
- **Drizzle migrations** (`drizzle/`) — Generated migration SQL files. Config in `drizzle.config.ts`.

## Key Patterns

- API routes that require authentication should use `withAuth(async (req, session) => { ... })` which returns 401 for unauthenticated requests.
- Use `jsonResponse(data)` and `errorResponse(message, status)` for consistent API responses.
- All database schema changes go in `src/db/schema.ts`, then run `npm run db:generate` to create a migration.
- Tailwind CSS v4 uses `@import "tailwindcss"` in CSS (no `tailwind.config.js` needed). PostCSS configured via `@tailwindcss/postcss` plugin.
- Environment variables go in `.env.local` (gitignored). Auth secrets: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.
