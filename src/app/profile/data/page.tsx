import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function ProfileDataManagementPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 animate-fade-in-up">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
          Profile
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Data Management</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Process imports and exports from one place. Choose a workflow below.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/profile/data/exports"
          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
        >
          <p className="text-lg font-semibold text-neutral-900 dark:text-white">Exports</p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Generate CSV, plain-text, and ICS task exports with previews, filters, and scope controls.
          </p>
          <span className="mt-4 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
            Open Exports
          </span>
        </Link>

        <Link
          href="/profile/data/imports"
          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
        >
          <p className="text-lg font-semibold text-neutral-900 dark:text-white">Imports</p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Launch the guided wizard for CSV, board JSON, workspace ZIP, ICS, plain-text, and Dispatch round-trip imports.
          </p>
          <span className="mt-4 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
            Open Imports
          </span>
        </Link>
      </section>

      <div>
        <Link
          href="/profile"
          className="inline-flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Back to Profile
        </Link>
      </div>
    </div>
  );
}
