import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./LoginForm";
import { BrandMark } from "@/components/BrandMark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { error } = await searchParams;
  const hasGitHub = !!(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.3.0";

  const errorMessages: Record<string, string> = {
    OAuthAccountNotLinked: "This GitHub account is already linked to a different user.",
    OAuthCallbackError: "GitHub sign-in was cancelled or failed.",
    AccessDenied: "Access denied. Sign-in was rejected.",
    Default: "Something went wrong. Please try again.",
  };

  return (
    <main id="login-page-root" className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: "32px 32px",
      }} />

      <div id="login-shell" className="relative w-full max-w-sm animate-fade-in-up">
        {/* Card */}
        <div id="login-card" className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-xl space-y-6 text-center">
          {/* Logo */}
          <div>
            <BrandMark className="mb-4" />
            <h1 className="text-2xl font-bold tracking-tight dark:text-white">Dispatch</h1>
            <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">Sign in to continue</p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              {errorMessages[error] || errorMessages.Default}
            </div>
          )}

          <div className="space-y-3">
            {hasGitHub && (
              <form
                action={async () => {
                  "use server";
                  await signIn("github", { redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 dark:bg-white px-4 py-3 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 active:scale-[0.98] transition-all shadow-sm"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Sign in with GitHub
                </button>
              </form>
            )}
            {hasGitHub && (
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
                <span className="text-xs text-neutral-400 dark:text-neutral-500">or</span>
                <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
              </div>
            )}
            <LoginForm />
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 dark:text-neutral-600 mt-4">
          Personal task management · v{appVersion}
        </p>
      </div>
    </main>
  );
}
