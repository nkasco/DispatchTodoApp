<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=240&color=0:0a1020,35:12244a,70:1d4ed8,100:7c3aed&text=Dispatch&fontSize=70&fontColor=ffffff&fontAlignY=40&desc=A%20polished%20local-first%20workspace%20for%20tasks%2C%20projects%2C%20notes%2C%20and%20daily%20planning.&descSize=18&descAlignY=62&animation=fadeIn" alt="Dispatch banner" />
  <br />
  <a href="https://github.com/nkasco/DispatchTodoApp"><img alt="Version" src="https://img.shields.io/github/package-json/v/nkasco/DispatchTodoApp?style=for-the-badge&label=Version&color=f59e0b" /></a>
  <a href="https://github.com/nkasco/DispatchTodoApp/pkgs/container/dispatchtodoapp"><img alt="Docker Pulls" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fnkasco%2FDispatchTodoApp%2Fdispatchtodoapp&query=%24.downloadCount&label=Docker%20Pulls&color=0ea5e9&style=for-the-badge" /></a>
  <a href="https://github.com/nkasco/DispatchTodoApp/commits/main"><img alt="Last Updated" src="https://img.shields.io/github/last-commit/nkasco/DispatchTodoApp?style=for-the-badge&label=Last%20Updated&color=22c55e" /></a>
  <br />
  <a href="#quick-start">Quick Start</a> •
  <a href="#feature-tour">Feature Tour</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#local-development---prerequisites">Local Dev</a>
</p>

---

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
- `Personal Assistant (Beta)`: streaming AI chat powered by Vercel AI SDK, with in-app actions via a local MCP (Model Context Protocol) tool server.
- `Search`: global search across tasks, notes, and dispatch records.
- `Recycle Bin`: restore or permanently remove archived items.
- `Auth`: GitHub OAuth and local development credentials.

## Tech Stack

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0f172a?style=for-the-badge&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-1d4ed8?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-Local-0ea5e9?style=for-the-badge&logo=sqlite" />
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-0891b2?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

## Quick Start

### Docker Setup (Recommended)

Dispatch includes production launchers that create/update `.env.prod` and run Docker Compose.

Prerequisites:

- Docker Desktop (Windows/macOS) or Docker Engine + Compose plugin (Linux)
- `docker` available on your `PATH`, with Docker running before setup
- Internet access to pull the default image (`ghcr.io/nkasco/dispatchtodoapp:latest`)

Use one of the following:

```powershell
.\dispatch.ps1 setup
```

```bash
./dispatch.sh setup
```

GitHub Auth in Docker:

- During setup, choose `Enable GitHub OAuth sign-in?` and provide `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.
- Set `NEXTAUTH_URL` to the public URL users will open in the browser.
- If this runs on a dedicated server in your home/lab network, use the server hostname or LAN IP in `NEXTAUTH_URL` instead of `localhost`.
- In GitHub OAuth app settings, set the callback URL to:
  - `<NEXTAUTH_URL>/api/auth/callback/github`
  - Example: `http://dispatch-server:3000/api/auth/callback/github`

## Local Development - Prerequisites

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

Create `.env.local` (local Node.js/dev runtime only):

> Docker setup uses `.env.prod`, not `.env.local`.

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

`npm run dev` starts both services:
- Next.js app on `http://localhost:3000`
- Dispatch MCP server on `http://localhost:3001` (used by Personal Assistant tool calling)

### Dev Login (Optional)

- Seeded account: `test@dispatch.local` / `test`
  - Run `npm run db:seed` first to create the seeded account.

*Dispatch is an independent open-source project and is not affiliated with any other software using the name Dispatch.*

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=120&section=footer&color=0:0a1020,35:12244a,70:1d4ed8,100:7c3aed" alt="footer" />
</p>
