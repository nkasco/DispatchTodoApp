# Dispatch — Project Specification

## Purpose

Dispatch is a personal, locally-hosted web application for managing tasks, notes, and daily workflows in a single unified interface. It is a private tool — built, hosted, and consumed by a single user on their local machine.

## Core Principles

- **Local-first**: Runs on `localhost`, data stays on disk in a SQLite file. No cloud dependency for data storage.
- **Single user, authenticated**: OAuth2 login (GitHub) gates access. Even though it's local, auth prevents accidental exposure if the port is reachable on the network.
- **REST API driven**: The UI is a React SPA that communicates with Next.js API Route Handlers over standard REST (JSON request/response). No GraphQL.
- **Simple and fast**: SQLite for zero-ops persistence. No external database server to manage.

## Tech Stack

| Layer          | Technology                        |
| -------------- | --------------------------------- |
| Framework      | Next.js 16 (App Router)          |
| Language       | TypeScript                        |
| UI             | React 19, Tailwind CSS v4         |
| Database       | SQLite via better-sqlite3         |
| ORM            | Drizzle ORM                       |
| Authentication | NextAuth.js v5 (OAuth2 / GitHub) |
| Runtime        | Node.js                           |

## Authentication

- OAuth2 via NextAuth.js with GitHub as the initial provider.
- All API routes (except `/api/auth/*`) require a valid session.
- The `withAuth` wrapper in `src/lib/api.ts` enforces this at the route level.
- Sessions are managed by NextAuth.js (JWT-based by default).

## Data Model (Initial)

The initial schema supports authentication bookkeeping:

- **users** — Profile info synced from the OAuth provider.
- **accounts** — OAuth provider link records (supports multiple providers per user).
- **sessions** — Active session tracking.

Domain-specific tables (tasks, notes, etc.) will be added in subsequent phases.

## API Design

- Routes live under `src/app/api/`.
- Each resource gets its own directory (e.g., `src/app/api/tasks/route.ts`).
- Standard HTTP verbs: `GET` (list/read), `POST` (create), `PUT` (update), `DELETE` (remove).
- All responses use a consistent JSON envelope via `jsonResponse()` and `errorResponse()` helpers.
- Route params for single-resource operations use Next.js dynamic segments (e.g., `src/app/api/tasks/[id]/route.ts`).

## UI Structure

- Next.js App Router pages under `src/app/`.
- Client-side data fetching from REST APIs (using `fetch` or a thin wrapper).
- Reusable components in `src/components/`.
- Tailwind CSS v4 for all styling — no component library initially.

## Hosting

- Runs locally via `npm run dev` during development.
- Production mode via `npm run build && npm run start` for a more optimized local server.
- No deployment target — this is a personal localhost application.
