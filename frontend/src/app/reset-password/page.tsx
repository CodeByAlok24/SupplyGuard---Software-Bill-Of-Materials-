"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { ArrowLeftIcon, CheckIcon } from "@/components/Icons";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setToken(new URLSearchParams(window.location.search).get("token"));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }
    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login?reset=success"), 1500);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reset the password. Please request a new reset link."
      );
    } finally {
      setLoading(false);
    }
  }

  const tokenMissing = token === null;

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

        {done ? (
          <div className="mt-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-oksoft text-ok">
              <CheckIcon className="h-5 w-5" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">
              Password updated
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              You can now sign in with your new password. Redirecting…
            </p>
            <Link
              href="/login?reset=success"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-dark"
            >
              Continue to sign in
            </Link>
          </div>
        ) : token === undefined ? (
          <p role="status" className="mt-8 text-[13.5px] text-muted">
            Checking your reset link…
          </p>
        ) : tokenMissing ? (
          <div className="mt-8">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
              Invalid reset link
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              This reset link is missing its token. Request a new link from the
              sign-in page.
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-dark"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Request a new reset link
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-8 font-display text-[28px] font-extrabold tracking-tight text-ink">
              Choose a new password
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              Use at least 12 characters. Avoid reusing a password you use
              elsewhere.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="password"
                  className="block text-[13px] font-semibold text-ink"
                >
                  New password
                </label>
                <div className="relative mt-1.5">
                  <input suppressHydrationWarning
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 12 characters"
                    required
                    minLength={12}
                    autoFocus
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

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-[13px] font-semibold text-ink"
                >
                  Confirm password
                </label>
                <input suppressHydrationWarning
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat the password"
                  required
                  minLength={12}
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
                />
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating password…" : "Update password"}
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] text-muted">
              <Link
                href="/forgot-password"
                className="font-bold text-brand transition-colors hover:text-brand-dark"
              >
                Request a new reset link
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}