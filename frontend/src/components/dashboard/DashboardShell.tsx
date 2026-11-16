"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { api, ApiError, type User, type Workspace } from "@/lib/api";
import { ThemeToggle } from "../ThemeToggle";
import {
  AlertTriangleIcon,
  BarChartIcon,
  BuildingIcon,
  FolderIcon,
  HelpCircleIcon,
  HomeIcon,
  LayersIcon,
  MenuIcon,
  FileTextIcon,
  TrendingUpIcon,
  ScaleIcon,
  ScanIcon,
  SettingsIcon,
  XIcon,
} from "../Icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  label: string;
  icon: IconComponent;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Overview", icon: HomeIcon, href: "/overview" },
  { label: "Projects", icon: FolderIcon, href: "/projects" },
  { label: "SBOM Scanner", icon: ScanIcon, href: "/scanner" },
  { label: "Components", icon: LayersIcon, href: "/components" },
  { label: "License Compliance", icon: ScaleIcon, href: "/licenses" },
  { label: "Vulnerabilities", icon: AlertTriangleIcon, href: "/vulnerabilities" },
  { label: "Reports", icon: BarChartIcon, href: "/reports" },
  { label: "Release evidence", icon: FileTextIcon, href: "/evidence" },
  { label: "Reliability", icon: TrendingUpIcon, href: "/reliability" },
  { label: "Settings", icon: SettingsIcon, href: "/settings" },
];

function SidebarContent({ onNavigate, user, workspace }: { onNavigate?: () => void; user: User; workspace: Workspace }) {
  const pathname = usePathname();
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setLogoutError("");
    try {
      await api.auth.logout();
      router.replace("/login");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not sign out.");
      setSigningOut(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-line bg-surface px-4 pt-5 pb-5">
      <Link
        href="/"
        onClick={onNavigate}
        aria-label="SupplyGuard home"
        className="flex items-center px-1"
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

      <div className="mt-5 flex w-full items-center justify-between gap-2.5 rounded-xl border border-line bg-panel px-3 py-2 text-left">
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-medium text-muted-light">Workspace</span>
          <div className="flex items-center gap-2 mt-0.5">
            <BuildingIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="truncate text-[13px] font-bold text-ink">{workspace.name}</span>
          </div>
        </div>
      </div>

      <nav aria-label="Workspace navigation" className="mt-4">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/workspace"
                ? pathname === "/workspace"
                : pathname?.startsWith(item.href);

            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                    active
                      ? "bg-panel-deep font-semibold text-brand-dark"
                      : "font-medium text-muted hover:bg-panel hover:text-brand-dark"
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      active ? "text-brand-dark" : "text-muted-light"
                    }`}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto pt-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-panel hover:text-brand-dark"
          >
            <HelpCircleIcon className="h-[18px] w-[18px] text-muted-light" />
            Help
          </button>
          <ThemeToggle />
        </div>
        {helpOpen ? <p role="status" className="mt-2 rounded-lg bg-panel p-2.5 text-[11px] text-muted">For workspace assistance, contact your administrator. Support integration is not configured.</p> : null}

        <div className="mt-4 flex items-center justify-between gap-2.5 px-1 py-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[11.5px] font-bold text-white">
              {user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink">
              {user.name}
            </span>
          </div>
          <button type="button" disabled={signingOut} onClick={signOut} className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-brand-tint hover:text-brand-dark disabled:opacity-60">
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {logoutError ? <p role="alert" className="px-2 text-[11px] text-red-700">{logoutError}</p> : null}
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState<{ user: User; workspace: Workspace } | null>(null);
  const [sessionState, setSessionState] = useState<"loading" | "ready" | "error">("loading");
  const [sessionError, setSessionError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    api.auth.me().then((result) => {
      if (!active) return;
      setSession(result);
      setSessionState("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setSessionError(error instanceof Error ? error.message : "Could not verify your session.");
      setSessionState("error");
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const handleWorkspaceUpdate = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      if (!name) return;
      setSession((current) => current ? { ...current, workspace: { ...current.workspace, name } } : current);
    };
    window.addEventListener("supplyguard:workspace-updated", handleWorkspaceUpdate);
    return () => window.removeEventListener("supplyguard:workspace-updated", handleWorkspaceUpdate);
  }, []);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-panel-deep">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-dark focus:shadow-lg"
      >
        Skip to content
      </a>

      {session ? <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] lg:block">
        <SidebarContent user={session.user} workspace={session.workspace} />
      </aside> : null}

      {session ? <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="workspace-mobile-nav"
          className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-brand-tint hover:text-brand-dark"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <Link href="/" className="flex items-center" aria-label="SupplyGuard home">
          <Image
            src="/logo.png"
            alt="SupplyGuard"
            width={120}
            height={31}
            className="h-8 w-auto object-contain logo-dark-flip"
            priority
          />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-[11px] font-bold text-brand-dark">
            {session.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </span>
        </div>
      </header> : null}

      {drawerOpen && session ? (
        <div id="workspace-mobile-nav" className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[86vw] bg-surface [box-shadow:0_24px_60px_-20px_rgba(25,21,36,0.45)]">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-brand-tint hover:text-brand-dark"
            >
              <XIcon className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} user={session.user} workspace={session.workspace} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[260px]">
        <main
          id="workspace-main"
          className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
        >
          {sessionState === "loading" ? <p role="status" className="mb-4 rounded-lg bg-surface px-4 py-3 text-sm text-muted">Checking your SupplyGuard session…</p> : null}
          {sessionState === "error" ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p role="alert" className="text-sm text-amber-900">{sessionError}</p>
            {sessionError.startsWith("Could not connect to the SupplyGuard API") ? <details className="mt-2 text-xs text-amber-950">
              <summary className="w-fit cursor-pointer font-semibold">Start the local services</summary>
              <p className="mt-2">In the project folder, install the API dependencies and configure <code>backend/.env</code> (PostgreSQL starts automatically via the user-managed cluster):</p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-amber-100 p-2"><code>{"npm --prefix backend install\ncp backend/.env.example backend/.env\nnpm run dev:api"}</code></pre>
              <p className="mt-2">Set a 32-character <code>JWT_SECRET</code> in <code>backend/.env</code>. The scan worker is needed for scans: <code>npm run dev:worker</code>.</p>
              <p className="mt-2">If this page is open on another device or a remote preview, set <code>NEXT_PUBLIC_API_URL</code> to an API address that device can reach, then restart Next.js.</p>
            </details> : null}
            <button type="button" onClick={() => window.location.reload()} className="mt-2 block text-xs font-semibold text-brand-dark">Retry session check</button>
          </div> : null}
          <div className={session ? "" : "hidden"} aria-hidden={!session}>{children}</div>
        </main>
      </div>
    </div>
  );
}
