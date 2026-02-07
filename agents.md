# agents.md

Instructions for AI coding agents working on this repository.

## First Steps

**Read `spec.md` before making any changes.** It contains the complete project specification including architecture, data model, every API endpoint, the full file structure, UI component inventory, and established patterns. This will save you from exploring the codebase from scratch.

## Project Summary

Dispatch is a locally-hosted personal task/note/project management app. Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + SQLite (Drizzle ORM) + NextAuth.js v5 (GitHub OAuth + local credentials).

## Environment

- **OS**: Windows. Never use Unix-only commands (`rm`, `mkdir -p`, `cat`, `chmod`). Use PowerShell-compatible commands.
- **Shell**: PowerShell. Chain commands with `;` not `&&`.

## Key Commands

```
npm run dev          # Dev server at localhost:3000
npm run build        # Production build (use to verify changes compile)
npm test             # Run Vitest tests
npm run db:generate  # Generate Drizzle migrations after schema changes
npm run db:push      # Push schema to DB (dev shortcut)
```

## Architecture at a Glance

- **Pages**: `src/app/` — Server Components by default, `"use client"` for client components
- **API Routes**: `src/app/api/` — REST handlers using `withAuth()` wrapper for auth
- **Components**: `src/components/` — 24 components (see spec.md for full list)
- **Database**: `src/db/schema.ts` (Drizzle tables), `src/db/index.ts` (client singleton)
- **Auth**: `src/auth.ts` — NextAuth.js v5 config with GitHub OAuth + Credentials
- **Utilities**: `src/lib/api.ts` (auth helpers), `src/lib/client.ts` (typed API client)
- **Tests**: `src/**/__tests__/` with helpers in `src/test/`

## Conventions to Follow

1. **Auth**: Protected API routes use `withAuth(async (req, session) => { ... })`. Returns 401 if unauthenticated.
2. **API Responses**: Always use `jsonResponse(data)` and `errorResponse(message, status)`.
3. **Schema Changes**: Edit `src/db/schema.ts`, then run `npm run db:generate`.
4. **Styling**: Tailwind CSS v4 — `@import "tailwindcss"` in CSS, no `tailwind.config.js`.
5. **Soft Deletes**: Tasks, notes, projects use `deletedAt` field. Never hard-delete these.
6. **Task Completion**: Optimistic UI + undo toast (`toast.undo()`) pattern across all task pages.
7. **Tests**: New API routes should have integration tests mocking `@/auth` and `@/db`.
8. **Env Vars**: `.env.local` (gitignored) — `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.

## Files You Should Know

| File | What It Does |
|------|-------------|
| `spec.md` | **Full project specification** — read this first |
| `CLAUDE.md` | Claude Code-specific instructions |
| `src/db/schema.ts` | All database table definitions |
| `src/auth.ts` | Authentication configuration |
| `src/lib/api.ts` | `withAuth`, `jsonResponse`, `errorResponse` helpers |
| `src/lib/client.ts` | Typed frontend API client with all resource methods |
| `src/components/ToastProvider.tsx` | Toast system (success, error, info, undo) |
| `src/app/globals.css` | Custom animations and keyframes |
