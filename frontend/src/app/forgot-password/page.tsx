"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { ArrowLeftIcon, CheckIcon } from "@/components/Icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.auth.forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not send the reset link. Please try again."
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

        {done ? (
          <div className="mt-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-oksoft text-ok">
              <CheckIcon className="h-5 w-5" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">
              Check your inbox
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              If an account exists for{" "}
              <span className="font-semibold text-ink">{email}</span>, a password
              reset link has been sent. The link expires in 1 hour.
            </p>
            <p className="mt-3 text-[12px] text-muted-light">
              Can&apos;t find it? Check spam, or wait a few minutes and try
              again.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-dark"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-8 font-display text-[28px] font-extrabold tracking-tight text-ink">
              Forgot your password?
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              Enter the email address for your account and we&apos;ll send you a
              reset link.
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
                  autoFocus
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
                disabled={loading || !email.trim()}
                className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending reset link…" : "Send reset link"}
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] text-muted">
              Remembered it?{" "}
              <Link
                href="/login"
                className="font-bold text-brand transition-colors hover:text-brand-dark"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}