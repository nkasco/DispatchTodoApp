<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=240&color=0:0a1020,35:12244a,70:1d4ed8,100:7c3aed&text=Dispatch&fontSize=70&fontColor=ffffff&fontAlignY=40&desc=Local-first%20productivity%20command%20center&descSize=18&descAlignY=62&animation=fadeIn" alt="Dispatch banner" />
</p>

<p align="center"><strong>A polished local-first workspace for tasks, projects, notes, and daily planning.</strong></p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0f172a?style=for-the-badge&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-1d4ed8?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-Local-0ea5e9?style=for-the-badge&logo=sqlite" />
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-0891b2?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#docker-setup-no-npm-recommended">Docker Setup</a> •
  <a href="#local-development-prerequisites">Local Dev Prerequisites</a> •
  <a href="#feature-tour">Feature Tour</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#scripts">Scripts</a>
</p>

---

## Sneak Peek

<p align="center">
  <img src="./docs/assets/dispatch-dashboard-latest.png" alt="Dispatch dashboard screenshot" />
</p>

<p align="center"><em>Clean dark UI, fast keyboard flow, project rollups, deadline focus, and daily dispatch planning in one screen.</em></p>

## Why It Feels Great

| | |
| --- | --- |
| **Local-first by default** | Your data stays on your machine in SQLite (`dispatch.db`). |
| **One workspace for everything** | Tasks, projects, notes, and dispatches stay connected. |
| **Keyboard-friendly UX** | Fast actions, global search, and shortcut support keep flow uninterrupted. |
| **Built for real execution** | Deadline focus, progress rollups, and upcoming work are always visible. |

## Feature Tour

- `Dashboard`: instant visibility into active tasks, notes, dispatches, deadlines, and project activity.
- `Tasks`: status + priority + due dates + project links.
- `Projects`: progress rollups and scoped task lists.
- `Notes`: markdown editing, preview, and export.
- `Dispatch`: daily planning surface with rollover support.
- `Search`: global search across tasks, notes, and dispatch records.
- `Recycle Bin`: restore or permanently remove archived items.
- `Auth`: GitHub OAuth and local development credentials.

## Architecture

```mermaid
flowchart LR
    UI[Next.js App Router + React] --> API[Route Handlers]
    API --> AUTH[NextAuth]
    API --> ORM[Drizzle ORM]
    ORM --> DB[(SQLite on disk)]
```

## Quick Start

### Docker Setup (No npm, Recommended)

Dispatch includes production launchers that create/update `.env.local` and run Docker Compose without npm.

Use one of the following:

```powershell
.\dispatch.ps1 setup
```

```bash
./dispatch.sh setup
```

### Interactive Setup (Developer Alternative)

Dispatch includes an interactive setup wizard that creates `.env.local` and can start Dispatch via Docker Compose.

Use one of the following:

```powershell
npm run setup
```

```powershell
.\dispatch-dev.ps1 setup
```

```bash
./dispatch-dev.sh setup
```

If `.env.local` already exists, the setup wizard asks before overwriting anything.

## Local Development Prerequisites

Use this section only if you are running Dispatch locally with Node.js (`npm run dev`, `npm run build`, `npm run start`).

- [Node.js](https://nodejs.org/) `20.9+` (LTS recommended).  
  Node includes [npm](https://www.npmjs.com/), which is required for local development commands.
- [Git](https://git-scm.com/downloads) (recommended for pulling updates).
- If native module install fails (for `better-sqlite3`), install platform build tools:
  - Windows: [Visual Studio Build Tools (C++ workload)](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - macOS: Xcode Command Line Tools (`xcode-select --install`)

### Manual Setup (Alternative)

### 1. Install

```bash
npm install
```

### 2. Configure env

Create `.env.local`:

```bash
# Required for NextAuth
AUTH_SECRET=your_random_secret
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth (optional)
AUTH_GITHUB_ID=your_github_oauth_client_id
AUTH_GITHUB_SECRET=your_github_oauth_client_secret

# Optional (defaults to ./dispatch.db)
DATABASE_URL=./dispatch.db
```

### 3. Migrate database

```bash
npm run db:migrate
```

### 4. Run app

```bash
npm run dev
```

Open `http://localhost:3000`.

### Dev Login (Optional)

- Seeded account: `test@dispatch.local` / `test`
- Or create a local account from the login page

## Tech Stack

- Next.js App Router
- React 19 + TypeScript
- NextAuth v5
- Drizzle ORM + better-sqlite3
- Tailwind CSS v4
- Vitest

## Scripts

- `npm run setup` - Launch interactive setup wizard (`scripts/setup.ts`)
- `npm run dev` - Start dev server
- `npm run build` - Build production bundle
- `npm run start` - Start production server
- `npm run lint` - Run lint checks
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:migrate` - Apply migrations
- `npm run db:push` - Push schema directly
- `npm run db:studio` - Open Drizzle Studio
- `npm run db:seed` - Seed sample data
- `npm test` - Run test suite

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=120&section=footer&color=0:0a1020,35:12244a,70:1d4ed8,100:7c3aed" alt="footer" />
</p>
