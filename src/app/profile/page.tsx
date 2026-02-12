import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { tasks, notes, projects, dispatches, accounts, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ProfilePreferences } from "@/components/ProfilePreferences";

export default async function Profile() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;

  const userId = session.user.id!;

  const [
    [{ taskCount }],
    [{ noteCount }],
    [{ projectCount }],
    [{ dispatchCount }],
    [{ doneCount }],
    linkedAccounts,
    [currentUserRecord],
  ] = await Promise.all([
    db.select({ taskCount: sql<number>`count(*)` }).from(tasks).where(eq(tasks.userId, userId)),
    db.select({ noteCount: sql<number>`count(*)` }).from(notes).where(eq(notes.userId, userId)),
    db.select({ projectCount: sql<number>`count(*)` }).from(projects).where(eq(projects.userId, userId)),
    db.select({ dispatchCount: sql<number>`count(*)` }).from(dispatches).where(eq(dispatches.userId, userId)),
    db
      .select({ doneCount: sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)` })
      .from(tasks)
      .where(eq(tasks.userId, userId)),
    db.select({ provider: accounts.provider }).from(accounts).where(eq(accounts.userId, userId)),
    db
      .select({
        role: users.role,
        showAdminQuickAccess: users.showAdminQuickAccess,
        assistantEnabled: users.assistantEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  const providers = linkedAccounts.map((a) => a.provider).filter(Boolean);
  const completionPercent = taskCount > 0 ? Math.round(((doneCount ?? 0) / taskCount) * 100) : 0;
  const isAdmin = currentUserRecord?.role === "admin";
  const showAdminQuickAccess = currentUserRecord?.showAdminQuickAccess ?? true;
  const assistantEnabled = currentUserRecord?.assistantEnabled ?? true;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold dark:text-white">Profile</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Your account details and preferences.
        </p>
      </div>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
              <svg className="w-9 h-9 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
              </svg>
            </div>
          )}
          <div>
            <p className="text-lg font-semibold dark:text-white">
              {user.name ?? "Unnamed User"}
            </p>
            {isAdmin && (
              <span className="inline-flex mt-1 rounded-full border border-amber-300/80 dark:border-amber-700/70 bg-amber-100/90 dark:bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800 dark:text-amber-300">
                Administrator
              </span>
            )}
            {user.email && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {user.email}
              </p>
            )}
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              {providers.length > 0 ? `Connected via ${providers.join(", ")}` : "No linked providers"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1">
            User ID: {userId}
          </span>
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1">
            Task Completion: {completionPercent}%
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Tasks" value={taskCount} color="blue" />
        <StatCard label="Notes" value={noteCount} color="purple" />
        <StatCard label="Projects" value={projectCount} color="green" />
        <StatCard label="Dispatches" value={dispatchCount} color="yellow" />
      </section>

      <ProfilePreferences
        isAdmin={isAdmin}
        showAdminQuickAccess={showAdminQuickAccess}
        assistantEnabled={assistantEnabled}
      />

      {isAdmin && (
        <section className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-yellow-50 dark:from-amber-950/30 dark:via-neutral-900 dark:to-yellow-950/20 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Administration</h2>
          <p className="text-xs text-amber-700/80 dark:text-amber-400 mt-1">
            Access administrator controls for user management and security settings.
          </p>
          <div className="mt-4">
            <Link
              href="/administration"
              className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-all active:scale-95"
            >
              Open Administration
            </Link>
          </div>
        </section>
      )}

    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "purple" | "green" | "yellow";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
    green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium mt-1">{label}</p>
    </div>
  );
}
