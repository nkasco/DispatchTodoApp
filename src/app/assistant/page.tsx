import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AssistantPage } from "@/components/AssistantPage";

export default async function Assistant() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [record] = await db
    .select({ assistantEnabled: users.assistantEnabled })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (record && !record.assistantEnabled) {
    redirect("/");
  }

  return <AssistantPage />;
}
