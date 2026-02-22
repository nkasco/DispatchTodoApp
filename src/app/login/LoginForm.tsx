"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { USER_CREATION_DISABLED_MESSAGE } from "@/lib/security-messages";

interface LoginFormProps {
  userRegistrationEnabled: boolean;
}

export function LoginForm({ userRegistrationEnabled }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSuccessAnimating, setIsSuccessAnimating] = useState(false);
  const successTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      document.getElementById("login-page-root")?.classList.remove("login-page-exit");
      document.getElementById("login-shell")?.classList.remove("login-shell-exit");
      document.getElementById("login-card")?.classList.remove("login-card-fly-out");
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userRegistrationEnabled && mode === "register") {
      setMode("login");
    }
  }, [mode, userRegistrationEnabled]);

  const handleSuccessfulLogin = () => {
    const root = document.getElementById("login-page-root");
    const shell = document.getElementById("login-shell");
    const card = document.getElementById("login-card");

    if (!root || !shell || !card) {
      router.replace("/");
      router.refresh();
      return;
    }

    setIsSuccessAnimating(true);

    root.classList.remove("login-page-exit");
    shell.classList.remove("login-shell-exit");
    card.classList.remove("login-card-fly-out");

    // Force reflow so a repeated successful login can replay the animation.
    void card.offsetWidth;

    requestAnimationFrame(() => {
      root.classList.add("login-page-exit");
      shell.classList.add("login-shell-exit");
      card.classList.add("login-card-fly-out");
    });

    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 240 : 850;

    successTimeoutRef.current = window.setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, delay);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        if (!userRegistrationEnabled) {
          setError(USER_CREATION_DISABLED_MESSAGE);
          setLoading(false);
          return;
        }

        // Register new user
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Registration failed");
          setLoading(false);
          return;
        }

        // After successful registration, sign in
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError("Registration successful but login failed. Please try logging in.");
          setLoading(false);
        } else if (result?.ok) {
          handleSuccessfulLogin();
        }
      } else {
        // Login existing user
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError("Invalid email or password");
          setLoading(false);
        } else if (result?.ok) {
          handleSuccessfulLogin();
        }
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "register" && (
          <input
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
            placeholder="Name (optional)"
          />
        )}
        <input
          name="email"
          type="email"
          autoComplete={mode === "login" ? "username" : "email"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
          placeholder="Email"
        />
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors"
          placeholder="Password (min. 8 characters)"
        />
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </div>
        )}
        {!userRegistrationEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {USER_CREATION_DISABLED_MESSAGE}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || isSuccessAnimating}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSuccessAnimating ? "Launching dashboard..." : loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>
      </form>

      {userRegistrationEnabled && (
        <div className="text-center text-sm">
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            disabled={loading || isSuccessAnimating}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
          </button>
        </div>
      )}
    </div>
  );
}
