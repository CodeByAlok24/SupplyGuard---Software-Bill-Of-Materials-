"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, apiUrl, ApiError } from "@/lib/api";
import {
  AlertTriangleIcon,
  CheckIcon,
  CubeIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  GitForkIcon,
  GoogleIcon,
  HomeIcon,
  InfoIcon,
  SettingsIcon,
  ShieldMarkFilled,
} from "@/components/Icons";

export default function SignupPage() {
  const router = useRouter();
  const [googleReady, setGoogleReady] = useState(false);

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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.auth.register({ name: fullName, email, workspaceName, password });
      router.push("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Account creation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[46%_54%] bg-surface font-sans">
      {/* Left Column: Create Workspace Form */}
      <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-12 max-w-[560px] w-full mx-auto">
        <div>
          {/* Header Row: Logo + Log in Link */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5"
              aria-label="SupplyGuard home"
            >
              <ShieldMarkFilled className="h-8 w-8 text-brand shrink-0" />
              <span className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-ink">
                SupplyGuard
              </span>
            </Link>

            <p className="text-[13px] text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-bold text-[#6d21e8] hover:text-brand-deep transition-colors"
              >
                Log in
              </Link>
            </p>
          </div>

          {/* Form Header */}
          <div className="mt-8">
            <h1 className="text-[30px] sm:text-[34px] font-bold tracking-tight text-ink">
              Create your workspace
            </h1>
            <p className="mt-1 text-[14px] text-muted">
              Start building a clearer picture of your software supply chain.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            {/* Full name + Work email */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="full-name"
                  className="block text-[13px] font-semibold text-ink"
                >
                  Full name
                </label>
                <input suppressHydrationWarning
                  id="full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Chen"
                  required
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface py-2 px-3 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
                />
              </div>

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
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  required
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface py-2 px-3 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            {/* Workspace name */}
            <div>
              <label
                htmlFor="workspace-name"
                className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"
              >
                Workspace name
                <InfoIcon className="h-3.5 w-3.5 text-muted-light" />
              </label>
              <input suppressHydrationWarning
                id="workspace-name"
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Acme Engineering"
                required
                className="mt-1.5 w-full rounded-lg border border-line bg-surface py-2 px-3 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
              />
              <p className="mt-1 text-[11.5px] text-muted">
                This is your organization&apos;s workspace in SupplyGuard.
              </p>
            </div>

            {/* Create password */}
            <div>
              <label
                htmlFor="password"
                className="block text-[13px] font-semibold text-ink"
              >
                Create password
              </label>
              <div className="relative mt-1.5">
                <input suppressHydrationWarning
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  placeholder="Create password"
                  required
                  className="w-full rounded-lg border border-line bg-surface py-2 pr-10 pl-3 text-[13.5px] text-ink transition-colors hover:border-line focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-light hover:text-ink transition-colors"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="mt-2 text-[11.5px] text-muted">Use at least 12 characters. Password length is validated here and by the API.</p>
            </div>

            {/* Terms Checkbox */}
            <div className="pt-1">
              <label className="flex items-start gap-2 cursor-pointer select-none text-[12.5px] text-ink">
                <input suppressHydrationWarning
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  required
                  className="h-4 w-4 rounded border-gray-300 text-[#6d21e8] focus:ring-[#6d21e8] mt-0.5"
                />
                <span>
                  I agree to the{" "}
                  <span className="font-semibold">Terms of Service</span>{" "}
                  and{" "}
                  <span className="font-semibold">Privacy Policy</span>
                  .
                </span>
              </label>
            </div>

            {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p> : null}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="mt-2 w-full rounded-lg bg-brand-dark py-2.5 text-[14px] font-bold text-white shadow-xs transition-colors hover:bg-brand-deep"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-1.5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line-soft" />
              </div>
              <span className="relative bg-surface px-3 text-[11px] font-semibold text-muted-light uppercase tracking-wider">
                OR
              </span>
            </div>

            {/* Google Signup Button */}
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
                  ? "flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-tint"
                  : "flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-lg border border-line bg-panel py-2.5 text-[13px] font-semibold text-muted shadow-xs"
              }
            >
              <GoogleIcon className="h-4 w-4" />
              <span>
                {googleReady ? "Sign up with Google" : "Google sign-in not configured"}
              </span>
            </a>
          </form>
        </div>

        {/* Footer info */}
        <p className="mt-8 text-center text-[12px] text-muted">
          Your workspace settings can be updated anytime.
        </p>
      </div>

      {/* Right Column: Hero Product Preview & Showcase */}
      <div className="hidden lg:flex flex-col justify-center relative overflow-hidden bg-gradient-to-br from-brand-tint via-panel to-oksoft/40 p-12 xl:p-16 border-l border-line">
        {/* Soft pastel ambient background accents */}
        <div className="absolute -bottom-16 -right-16 w-96 h-96 rounded-full bg-oksoft/30 blur-3xl pointer-events-none" />
        <div className="absolute -top-16 -right-16 w-96 h-96 rounded-full bg-chip/50 blur-3xl pointer-events-none" />

        <div className="max-w-[620px] mx-auto w-full z-10">
          {/* Main Headline */}
          <h2 className="text-[36px] xl:text-[42px] font-bold tracking-tight text-ink leading-[1.18]">
            Everything your team needs to see what ships.
          </h2>

          {/* 3 Value Propositions */}
          <div className="mt-6 flex flex-col gap-3.5 text-[14px] font-bold text-ink">
            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oksoft text-ok">
                <CheckIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </span>
              <span>Build a living component inventory</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oksoft text-ok">
                <CheckIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </span>
              <span>Understand license obligations</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oksoft text-ok">
                <CheckIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </span>
              <span>Prioritize software risk</span>
            </div>
          </div>

          {/* Floating Product Preview Card */}
          <div className="mt-9 rounded-2xl bg-surface/95 p-5 shadow-2xl backdrop-blur-sm border border-white">
            <p className="mb-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">Illustrative preview · example data</p>
            <div className="flex gap-4">
              {/* Mini Left Sidebar */}
              <div className="flex flex-col gap-2 p-1 border-r border-line-soft pr-3 shrink-0">
                <div className="flex items-center gap-1.5 pb-2">
                  <ShieldMarkFilled className="h-4 w-4 text-brand shrink-0" />
                  <span className="text-[11px] font-extrabold text-ink">
                    SupplyGuard
                  </span>
                </div>

                <div className="flex items-center gap-1.5 rounded-lg bg-[#efe7fe] px-2 py-1 text-[10.5px] font-bold text-[#6d21e8]">
                  <HomeIcon className="h-3 w-3" />
                  <span>Overview</span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-medium text-muted">
                  <CubeIcon className="h-3 w-3" />
                  <span>Components</span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-medium text-muted">
                  <GitForkIcon className="h-3 w-3" />
                  <span>Dependencies</span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-medium text-muted">
                  <FileTextIcon className="h-3 w-3" />
                  <span>Licenses</span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-medium text-muted">
                  <AlertTriangleIcon className="h-3 w-3" />
                  <span>Risk</span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-medium text-muted">
                  <SettingsIcon className="h-3 w-3" />
                  <span>Settings</span>
                </div>
              </div>

              {/* Main Preview Area */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div>
                  <h3 className="text-[13px] font-bold text-ink">
                    Example workspace
                  </h3>
                  <p className="text-[10px] text-muted">Workspace overview</p>
                </div>

                {/* Top 2 Cards */}
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {/* Gauge card */}
                  <div className="flex items-center gap-2.5 rounded-xl border border-line-soft bg-panel p-2.5">
                    <div className="relative h-10 w-10 shrink-0">
                      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke="#dcfce7"
                          strokeWidth="3.5"
                        />
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeDasharray="92 100"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-[8.5px] font-bold text-ink">
                        92/100
                      </div>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[10.5px] font-bold text-ink">
                        Supply chain health
                        <InfoIcon className="h-2.5 w-2.5 text-muted-light" />
                      </p>
                    </div>
                  </div>

                  {/* Components card */}
                  <div className="rounded-xl border border-line-soft bg-surface p-2.5 shadow-2xs">
                    <p className="text-[18px] font-bold text-ink leading-tight">
                      1,248
                    </p>
                    <p className="text-[10.5px] text-muted">components</p>
                  </div>
                </div>

                {/* Bottom 2 Cards */}
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  {/* Top components */}
                  <div className="rounded-xl border border-line-soft bg-surface p-2.5 shadow-2xs">
                    <p className="text-[11px] font-bold text-ink mb-1.5">
                      Top components
                    </p>
                    <div className="flex flex-col gap-1 text-[9.5px]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">web-app</span>
                        <span className="text-muted">1.14.0</span>
                        <span className="rounded bg-oksoft px-1 text-[8.5px] font-bold text-ok">
                          Low
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">api-core</span>
                        <span className="text-muted">2.8.4</span>
                        <span className="rounded bg-warnsoft px-1 text-[8.5px] font-bold text-warn">
                          Medium
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">data-utils</span>
                        <span className="text-muted">3.2.1</span>
                        <span className="rounded bg-oksoft px-1 text-[8.5px] font-bold text-ok">
                          Low
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">auth-client</span>
                        <span className="text-muted">1.9.0</span>
                        <span className="rounded bg-warnsoft px-1 text-[8.5px] font-bold text-warn">
                          Medium
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dependency graph preview */}
                  <div className="rounded-xl border border-line-soft bg-surface p-2.5 shadow-2xs flex flex-col justify-between">
                    <p className="text-[11px] font-bold text-ink mb-1">
                      Dependency graph
                    </p>

                    {/* Graphic illustration */}
                    <div className="relative h-20 w-full flex items-center justify-center">
                      {/* Center Node */}
                      <div className="z-10 h-7 w-7 rounded-lg bg-brand shadow-sm flex items-center justify-center">
                        <CubeIcon className="h-4 w-4 text-white" />
                      </div>

                      {/* Surrounding Nodes & Lines */}
                      <div className="absolute top-1 h-4 w-4 rounded bg-chip" />
                      <div className="absolute bottom-1 h-4 w-4 rounded bg-chip" />
                      <div className="absolute left-1 h-4 w-4 rounded bg-oksoft" />
                      <div className="absolute right-1 top-2 h-4 w-4 rounded bg-oksoft" />
                      <div className="absolute right-1 bottom-2 h-4 w-4 rounded bg-[#bbf7d0]" />
                      <div className="absolute left-2 bottom-3 h-4 w-4 rounded bg-[#fed7aa]" />

                      {/* Faint connecting lines */}
                      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                        <line x1="50%" y1="50%" x2="50%" y2="10%" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="50%" y1="50%" x2="50%" y2="90%" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="50%" y1="50%" x2="10%" y2="50%" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="50%" y1="50%" x2="90%" y2="20%" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="50%" y1="50%" x2="90%" y2="80%" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="#e2e8f0" strokeWidth="1" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
