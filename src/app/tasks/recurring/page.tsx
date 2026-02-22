import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RecurringTasksPage } from "@/components/RecurringTasksPage";

export default async function RecurringTasks() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <RecurringTasksPage />;
}
