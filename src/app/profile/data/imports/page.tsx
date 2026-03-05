import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ImportsPage } from "@/components/ImportsPage";

export default async function ProfileDataImportsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <ImportsPage backHref="/profile/data" backLabel="Back to Data Management" />;
}
