import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { tasks, notes, dispatches, dispatchTasks, users, projects } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const sqlite = new Database("./dispatch.db");
const db = drizzle(sqlite);

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

async function seed() {
  console.log("Seeding database...");

  // Keep a deterministic local credentials account for development.
  const seedEmail = "test@dispatch.local";
  const seedPasswordHash = await bcrypt.hash("test", 10);
  let [user] = await db.select().from(users).where(eq(users.email, seedEmail)).limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        name: "Test User",
        email: seedEmail,
        password: seedPasswordHash,
        role: "admin",
      })
      .returning();
    console.log("Created seed user:", user.email);
  } else {
    await db
      .update(users)
      .set({ password: seedPasswordHash, role: "admin" })
      .where(eq(users.id, user.id));
    console.log("Using existing user:", user.email);
  }

  const userId = user.id;

  // Clear existing seed data for this user
  await db.delete(dispatchTasks);
  await db.delete(dispatches).where(eq(dispatches.userId, userId));
  await db.delete(tasks).where(eq(tasks.userId, userId));
  await db.delete(notes).where(eq(notes.userId, userId));
  await db.delete(projects).where(eq(projects.userId, userId));

  const now = new Date().toISOString();

  // Create projects
  const projectData = [
    { name: "Website Revamp", description: "Refresh the marketing site and landing pages", status: "active" as const, color: "blue" as const },
    { name: "Product Launch", description: "Prepare for the next release cycle", status: "active" as const, color: "emerald" as const },
    { name: "Internal Ops", description: "Quality and tooling improvements", status: "paused" as const, color: "amber" as const },
  ];

  const createdProjects = await db
    .insert(projects)
    .values(
      projectData.map((p) => ({
        userId,
        name: p.name,
        description: p.description,
        status: p.status,
        color: p.color,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();

  console.log(`Created ${createdProjects.length} projects`);

  const [website, launch, ops] = createdProjects;

  // Create 10 tasks
  const taskData = [
    { title: "Set up CI/CD pipeline", description: "Configure GitHub Actions for automated testing and deployment", status: "open" as const, priority: "high" as const, dueDate: todayStr(1), projectId: ops?.id },
    { title: "Design landing page mockup", description: "Create wireframes for the new marketing site", status: "in_progress" as const, priority: "high" as const, dueDate: todayStr(0), projectId: website?.id },
    { title: "Write API documentation", description: "Document all REST endpoints with examples", status: "open" as const, priority: "medium" as const, dueDate: todayStr(3), projectId: launch?.id },
    { title: "Fix login redirect bug", description: "Users redirected to wrong page after OAuth login", status: "done" as const, priority: "high" as const, dueDate: todayStr(-2), projectId: ops?.id },
    { title: "Add dark mode support", description: "Implement theme toggle with system preference detection", status: "in_progress" as const, priority: "medium" as const, dueDate: todayStr(5), projectId: website?.id },
    { title: "Review pull requests", description: null, status: "open" as const, priority: "medium" as const, dueDate: todayStr(0), projectId: launch?.id },
    { title: "Update dependencies", description: "Run npm audit and update outdated packages", status: "open" as const, priority: "low" as const, dueDate: todayStr(7), projectId: ops?.id },
    { title: "Write unit tests for auth module", description: "Cover edge cases: expired tokens, invalid sessions", status: "open" as const, priority: "medium" as const, dueDate: todayStr(4), projectId: launch?.id },
    { title: "Optimize database queries", description: "Add indexes and reduce N+1 queries on dashboard", status: "done" as const, priority: "low" as const, dueDate: null, projectId: ops?.id },
    { title: "Plan sprint retrospective", description: "Prepare agenda and gather team feedback", status: "open" as const, priority: "low" as const, dueDate: todayStr(2), projectId: website?.id },
  ];

  const createdTasks = await db
    .insert(tasks)
    .values(
      taskData.map((t) => ({
        userId,
        projectId: t.projectId ?? null,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();

  console.log(`Created ${createdTasks.length} tasks`);

  // Create 5 notes
  const noteData = [
    {
      title: "Meeting Notes - Sprint Planning",
      content: `## Sprint 12 Planning\n\n### Goals\n- Complete auth module\n- Start dashboard redesign\n- Fix critical bugs from backlog\n\n### Action Items\n1. @alice - Auth token refresh\n2. @bob - Dashboard wireframes\n3. @charlie - Bug triage\n\n### Notes\nTeam velocity has improved. We can take on 2 more story points this sprint.`,
    },
    {
      title: "Architecture Decision Record: Database Choice",
      content: `# ADR-001: SQLite for Local Development\n\n## Context\nWe need a database that works well for a locally-hosted personal app.\n\n## Decision\nUse SQLite via better-sqlite3 with Drizzle ORM.\n\n## Consequences\n- **Positive**: Zero setup, fast reads, file-based backup\n- **Negative**: No concurrent writes, limited full-text search`,
    },
    {
      title: "Quick Ideas",
      content: `- Add keyboard shortcuts for common actions\n- Global search across tasks, notes, dispatches\n- Email digest of daily dispatch\n- Calendar view for tasks with due dates\n- Export data as JSON/CSV`,
    },
    {
      title: "Debugging Notes",
      content: `## OAuth Redirect Issue\n\nProblem: After GitHub login, user lands on /api/auth/callback instead of /\n\nRoot cause: \`NEXTAUTH_URL\` not set in .env.local\n\nFix: Added \`NEXTAUTH_URL=http://localhost:3000\` to .env.local`,
    },
    {
      title: "Weekly Review Template",
      content: `## Week of [date]\n\n### Accomplished\n- \n\n### Blocked On\n- \n\n### Next Week\n- \n\n### Reflections\n- `,
    },
  ];

  const createdNotes = await db
    .insert(notes)
    .values(
      noteData.map((n) => ({
        userId,
        title: n.title,
        content: n.content,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();

  console.log(`Created ${createdNotes.length} notes`);

  // Create 3 dispatches
  const dispatchData = [
    { date: todayStr(0), summary: "Focused on bug fixes and code review. Made good progress on the auth module. Need to circle back on the landing page design tomorrow." },
    { date: todayStr(-1), summary: "Sprint planning day. Estimated stories and assigned tasks. Reviewed architecture decisions with the team." },
    { date: todayStr(-2), summary: "Wrapped up the database optimization work. Queries are 3x faster now. Started investigating the login redirect bug.", finalized: true },
  ];

  const createdDispatches = await db
    .insert(dispatches)
    .values(
      dispatchData.map((d) => ({
        userId,
        date: d.date,
        summary: d.summary,
        finalized: d.finalized ?? false,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();

  console.log(`Created ${createdDispatches.length} dispatches`);

  // Link tasks to today's dispatch
  const todayDispatch = createdDispatches[0];
  const tasksToLink = createdTasks.filter((t) => t.status !== "done").slice(0, 5);

  await db.insert(dispatchTasks).values(
    tasksToLink.map((t) => ({
      dispatchId: todayDispatch.id,
      taskId: t.id,
    })),
  );

  console.log(`Linked ${tasksToLink.length} tasks to today's dispatch`);

  // Link some tasks to yesterday's dispatch
  const yesterdayDispatch = createdDispatches[1];
  const yesterdayTasks = createdTasks.slice(2, 5);

  await db.insert(dispatchTasks).values(
    yesterdayTasks.map((t) => ({
      dispatchId: yesterdayDispatch.id,
      taskId: t.id,
    })),
  );

  console.log(`Linked ${yesterdayTasks.length} tasks to yesterday's dispatch`);

  console.log("\nSeed complete!");
  sqlite.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
