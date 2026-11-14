"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type LicenseFinding, type Project, type User, type VulnerabilityFinding } from "@/lib/api";
import { AlertTriangleIcon, CubeIcon, FolderIcon, PlayIcon, ScaleIcon } from "@/components/Icons";

type OverviewData = { user: User; projects: Project[]; licenses: LicenseFinding[]; vulnerabilities: VulnerabilityFinding[] };

async function getOverviewData(): Promise<OverviewData> {
  const [identity, projectResult, licenseResult, vulnerabilityResult] = await Promise.all([
    api.auth.me(), api.projects.list(), api.licenses.findings(), api.vulnerabilities.findings(),
  ]);
  return { user: identity.user, projects: projectResult.items, licenses: licenseResult.items, vulnerabilities: vulnerabilityResult.items };
}

function Metric({ label, value, icon: Icon, href }: { label: string; value: number; icon: typeof FolderIcon; href: string }) {
  return <Link href={href} className="rounded-xl border border-line bg-surface p-5 shadow-xs transition-colors hover:border-line"><div className="flex items-center justify-between"><span className="text-[12px] font-semibold text-muted">{label}</span><Icon className="h-4 w-4 text-brand" /></div><p className="mt-3 text-3xl font-bold tracking-tight text-ink">{value.toLocaleString()}</p></Link>;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setData(await getOverviewData());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load workspace data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    getOverviewData().then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load workspace data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const componentCount = data?.projects.reduce((total, project) => total + (project.scans?.[0]?.componentCount || 0), 0) || 0;
  const reviewCount = data?.licenses.filter((finding) => finding.decision === "REVIEW" && finding.reviewStatus === "OPEN").length || 0;

  return <div className="flex flex-col gap-5 lg:gap-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-light"><span>Workspace</span><span>/</span><span className="font-semibold text-ink">Overview</span></nav><h1 className="mt-2 text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">{data ? `Welcome, ${data.user.name.split(" ")[0]}` : "Workspace overview"}</h1><p className="mt-1 text-[13.5px] text-muted">Current project and analysis results from your workspace.</p></div><Link href="/scanner" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-dark px-4 py-2 text-[13px] font-semibold text-white shadow-xs hover:bg-brand-deep"><PlayIcon className="h-3.5 w-3.5" />New scan</Link></header>
    {loading ? <div role="status" className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Loading workspace results…</div> : null}
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-5"><p role="alert" className="text-sm text-red-800">{error}</p><button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold text-red-800 underline">Retry</button></div> : null}
    {!loading && !error && data ? <>
      {data.projects.length === 0 ? <section className="rounded-xl border border-dashed border-line bg-surface p-8 text-center"><FolderIcon className="mx-auto h-8 w-8 text-brand" /><h2 className="mt-3 text-lg font-bold text-ink">No projects yet</h2><p className="mt-1 text-sm text-muted">Create a project and upload a package-lock.json to generate your first SBOM.</p><Link href="/scanner" className="mt-4 inline-flex rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">Start a scan</Link></section> : <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Projects" value={data.projects.length} icon={FolderIcon} href="/projects" /><Metric label="Components in latest scans" value={componentCount} icon={CubeIcon} href="/components" /><Metric label="License reviews open" value={reviewCount} icon={ScaleIcon} href="/licenses" /><Metric label="OSV findings" value={data.vulnerabilities.length} icon={AlertTriangleIcon} href="/vulnerabilities" /></section>
        <section className="rounded-xl border border-line bg-surface shadow-xs"><div className="flex items-center justify-between border-b border-line-soft px-5 py-4"><div><h2 className="text-[15px] font-bold text-ink">Projects</h2><p className="mt-0.5 text-[11.5px] text-muted">Latest completed or queued scan per project.</p></div><Link href="/projects" className="text-xs font-semibold text-brand-dark">All projects</Link></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[12px]"><thead><tr className="text-muted"><th className="px-5 py-3 font-semibold">Project</th><th className="px-5 py-3 font-semibold">Latest scan</th><th className="px-5 py-3 font-semibold">Components</th><th className="px-5 py-3 font-semibold">Updated</th></tr></thead><tbody className="divide-y divide-line-soft">{data.projects.slice(0, 6).map((project) => { const scan = project.scans?.[0]; return <tr key={project.id}><td className="px-5 py-3"><Link href={scan ? `/scans/${scan.id}` : "/projects"} className="font-bold text-ink hover:text-brand-dark">{project.name}</Link></td><td className="px-5 py-3 capitalize text-muted">{scan?.status.toLowerCase() || "Not scanned"}</td><td className="px-5 py-3 text-muted">{scan?.componentCount.toLocaleString() ?? "—"}</td><td className="px-5 py-3 text-muted">{scan ? new Date(scan.createdAt).toLocaleString() : "—"}</td></tr>; })}</tbody></table></div>
          {data.projects.length === 0 ? <p className="p-5 text-sm text-muted">No project results available.</p> : null}
        </section>
        {data.projects.every((project) => !project.scans?.length) ? <p className="text-[11.5px] text-muted-light">Projects are listed above. Results will appear after a scan finishes.</p> : null}
      </>}
    </> : null}
  </div>;
}
