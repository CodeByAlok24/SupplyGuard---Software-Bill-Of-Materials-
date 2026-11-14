"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, apiUrl, ApiError } from "@/lib/api";
import Link from "next/link";
import Image from "next/image";
import { GoogleIcon, GithubIcon } from "@/components/Icons";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [googleReady, setGoogleReady] = useState(false);
  const [githubReady, setGithubReady] = useState(false);

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.auth.register({
        name,
        email,
        password,
        workspaceName,
      });
      // Auto-login after register
      await api.auth.login({ email, password });
      router.push("/overview");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || "Registration failed. Please try again."
          : "Registration failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md bg-surface rounded-xl shadow-sm p-8">
        <Link href="/" className="inline-flex items-center" aria-label="SupplyGuard home">
          <Image
            src="/logo.png"
            alt="SupplyGuard"
            width={150}
            height={39}
            className="h-9 w-auto object-contain logo-dark-flip"
            priority
          />
        </Link>
        <div className="flex items-center justify-between mt-6 mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-ink">
            Create account
          </h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          noValidate
        >
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Full name
            </label>
            <input suppressHydrationWarning
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Chen"
              required
              className="w-full rounded-lg border border-line bg-surface py-2.5 px-3.5 text-sm text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Work email
            </label>
            <input suppressHydrationWarning
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@company.com"
              required
              className="w-full rounded-lg border border-line bg-surface py-2.5 px-3.5 text-sm text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="workspaceName"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Workspace name
            </label>
            <input suppressHydrationWarning
              id="workspaceName"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Engineering"
              required
              className="w-full rounded-lg border border-line bg-surface py-2.5 px-3.5 text-sm text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Password
            </label>
            <input suppressHydrationWarning
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••"
              minLength={12}
              required
              className="w-full rounded-lg border border-line bg-surface py-2.5 px-3.5 text-sm text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Confirm password
            </label>
            <input suppressHydrationWarning
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={12}
              required
              className="w-full rounded-lg border border-line bg-surface py-2.5 px-3.5 text-sm text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-dark"
          >
            {loading ? "Creating account…" : "Create account"}
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
                ? "Sign up with Google"
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
                ? "Sign up with GitHub"
                : "GitHub sign-in not configured"}
            </span>
          </a>

          <p className="mt-2 text-sm text-muted-light">
            Already have an account?{" "}
            <a
              href="/login"
              className="font-bold text-brand hover:text-[#6d21e8] transition-colors"
            >
              Sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}