import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AdminSettingsPanel } from "@/components/AdminSettingsPanel";

export default async function AdministrationPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [userRecord] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!userRecord || userRecord.role !== "admin") {
    redirect("/profile");
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Administration</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            User management, role delegation, and security controls.
          </p>
        </div>
        <Link
          href="/profile"
          className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
        >
          Back to Profile
        </Link>
      </div>

      <AdminSettingsPanel currentUserId={session.user.id} />
    </div>
  );
}

