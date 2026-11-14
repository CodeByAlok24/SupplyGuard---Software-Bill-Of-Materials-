"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, apiUrl, ApiError } from "@/lib/api";
import { GoogleIcon, GithubIcon } from "@/components/Icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [githubReady, setGithubReady] = useState(false);

function oauthFailureMessage(provider: "Google" | "GitHub", reason: string | null) {
  if (!reason || reason === "unknown") return `${provider} sign-in did not complete. Please try again.`;
  if (reason === "network") return `Couldn't reach ${provider}. Check your internet connection and try again.`;
  if (reason.startsWith("token_")) {
    const detail = reason.slice("token_".length);
    return `${provider} rejected the sign-in (${detail}). Check the OAuth client credentials, the redirect URI, and that your account is approved for this app.`;
  }
  if (reason.startsWith("provider_")) return `${provider} cancelled the sign-in (${reason.slice("provider_".length)}). Try again and approve access.`;
  if (reason === "state_mismatch") return "The sign-in session didn't match this browser. Try again from the same device and browser.";
  if (reason === "missing_code") return `${provider} didn't return a sign-in code. Try again.`;
  return `${provider} sign-in did not complete. Please try again.`;
}

  useEffect(() => {
    const id = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error");
      const reason = params.get("reason");
      if (oauthError === "google_not_configured") {
        setError(
          "Google sign-in is not configured yet. Use your email and password, or ask an administrator to set it up."
        );
      } else if (oauthError === "google_failed") {
        setError(oauthFailureMessage("Google", reason));
      } else if (oauthError === "github_not_configured") {
        setError(
          "GitHub sign-in is not configured yet. Use your email and password, or connect GitHub in Settings with a Personal Access Token."
        );
      } else if (oauthError === "github_failed") {
        setError(oauthFailureMessage("GitHub", reason));
      }
      if (params.get("reset") === "success") {
        setNotice("Password updated. Sign in with your new password.");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let active = true;
    api.auth
      .googleStatus()
      .then(({ configured }) => {
        if (active) setGoogleReady(configured);
      })
      .catch(() => {
        if (active) setGoogleReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    api.auth
      .githubStatus()
      .then(({ configured }) => {
        if (active) setGithubReady(configured);
      })
      .catch(() => {
        if (active) setGithubReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    api.auth
      .me()
      .then(() => {
        if (active) router.replace("/overview");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await api.auth.login({ email, password, rememberMe });
      router.push("/overview");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Sign-in failed. Please check your credentials and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-sm">
        <Link
          href="/"
          className="inline-flex items-center"
          aria-label="SupplyGuard home"
        >
          <Image
            src="/logo.png"
            alt="SupplyGuard"
            width={150}
            height={39}
            className="h-9 w-auto object-contain logo-dark-flip"
            priority
          />
        </Link>

        <h1 className="mt-8 font-display text-[28px] font-extrabold tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Sign in to your SupplyGuard workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-semibold text-ink"
            >
              Work email
            </label>
            <input suppressHydrationWarning
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="alex@company.com"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[13px] font-semibold text-ink"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <input suppressHydrationWarning
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-line bg-surface py-2.5 pr-16 pl-3.5 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[12px] font-semibold text-brand-dark transition-colors hover:text-brand-deep"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[13px]">
            <label className="flex cursor-pointer items-center gap-2 font-medium text-ink select-none">
              <input suppressHydrationWarning
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
              />
              <span>Remember me</span>
            </label>
            <Link
              href="/forgot-password"
              className="font-semibold text-brand transition-colors hover:text-brand-dark"
            >
              Forgot password?
            </Link>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800"
            >
              {notice}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-brand py-2.5 text-[14px] font-bold text-white shadow-xs transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>

          <div className="relative my-2 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line-soft" />
            </div>
            <span className="relative bg-surface px-3 text-[11.5px] font-semibold text-muted-light uppercase tracking-wider">
              OR
            </span>
          </div>

          <a
            href={googleReady ? apiUrl("/auth/google") : undefined}
            role={googleReady ? "link" : "button"}
            aria-disabled={!googleReady}
            onClick={(event) => {
              if (!googleReady) event.preventDefault();
            }}
            title={
              googleReady
                ? "Continue with your Google account"
                : "Google sign-in is not configured. Ask an administrator to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
            }
            className={
              googleReady
                ? "flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-tint"
                : "flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-lg border border-line bg-panel py-2.5 text-[13.5px] font-semibold text-muted shadow-xs"
            }
          >
            <GoogleIcon className="h-4 w-4" />
            <span>
              {googleReady
                ? "Continue with Google"
                : "Google sign-in not configured"}
            </span>
          </a>

          <a
            href={githubReady ? apiUrl("/auth/github") : undefined}
            role={githubReady ? "link" : "button"}
            aria-disabled={!githubReady}
            onClick={(event) => {
              if (!githubReady) event.preventDefault();
            }}
            title={
              githubReady
                ? "Continue with your GitHub account"
                : "GitHub sign-in is not configured. Ask an administrator to set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET."
            }
            className={
              githubReady
                ? "flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-tint"
                : "flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-lg border border-line bg-panel py-2.5 text-[13.5px] font-semibold text-muted shadow-xs"
            }
          >
            <GithubIcon className="h-4 w-4" />
            <span>
              {githubReady
                ? "Continue with GitHub"
                : "GitHub sign-in not configured"}
            </span>
          </a>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted">
          New to SupplyGuard?{" "}
          <Link
            href="/register"
            className="font-bold text-brand transition-colors hover:text-brand-dark"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}