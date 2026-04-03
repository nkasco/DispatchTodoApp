import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [preferences] = await db
    .select({ dashboardDueTimesEnabled: users.dashboardDueTimesEnabled })
    .from(users)
    .where(eq(users.id, session.user.id!))
    .limit(1);

  return (
    <Dashboard
      userName={session.user.name ?? "there"}
      dashboardDueTimesEnabled={preferences?.dashboardDueTimesEnabled ?? false}
    />
  );
}
