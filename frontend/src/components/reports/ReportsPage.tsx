"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type Project } from "@/lib/api";
import { DownloadIcon, FileTextIcon } from "@/components/Icons";

type ReportRecord = { id: string; name: string; format: string; createdAt: string; scanJob: { id: string; project: { name: string } } };
type Format = "cyclonedx-json" | "licenses-csv" | "vulnerabilities-csv";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scanJobId, setScanJobId] = useState("");
  const [format, setFormat] = useState<Format>("cyclonedx-json");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.reports.list(), api.projects.list()]).then(([reportResult, projectResult]) => {
      if (!active) return;
      setReports(reportResult.items); setProjects(projectResult.items);
      const scan = projectResult.items.flatMap((project) => (project.scans || []).filter((item) => item.status === "COMPLETED").map((item) => ({ id: item.id, createdAt: item.createdAt }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (scan) setScanJobId(scan.id);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load reports."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const scans = projects.flatMap((project) => (project.scans || []).filter((scan) => scan.status === "COMPLETED").map((scan) => ({ ...scan, projectName: project.name }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filtered = useMemo(() => reports.filter((report) => !query.trim() || `${report.name} ${report.format} ${report.scanJob.project.name}`.toLowerCase().includes(query.trim().toLowerCase())), [reports, query]);

  async function generateReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const { item } = await api.reports.create(scanJobId, format);
      const updated = await api.reports.list();
      setReports(updated.items);
      setNotice(`${item.name} was generated.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Report generation failed."); }
    finally { setBusy(false); }
  }

  async function downloadReport(report: ReportRecord) {
    setError(""); setNotice("");
    try { await api.reports.download(report.id); setNotice(`${report.name} downloaded.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Report download failed."); }
  }

  return <div className="flex flex-col gap-5">
    <header><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-light"><span>Workspace</span><span>/</span><span className="font-semibold text-ink">Reports</span></nav><h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Reports</h1><p className="mt-1 text-[13px] text-muted">Generate downloadable SBOM and findings reports from completed scans.</p></header>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-xs text-red-800">{error}</p> : null}{notice ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">{notice}</p> : null}
    <section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><FileTextIcon className="h-4 w-4" /></span><div><h2 className="text-[15px] font-bold text-ink">Generate a report</h2><p className="mt-1 text-xs text-muted">Exports use data stored for a completed scan.</p></div></div>
      {loading ? <p role="status" className="mt-4 text-xs text-muted">Loading completed scans…</p> : scans.length === 0 ? <div className="mt-4 rounded-lg bg-panel p-4"><p className="text-xs text-muted">No completed scans are available yet.</p><Link href="/scanner" className="mt-2 inline-block text-xs font-semibold text-brand-dark underline">Run an npm lockfile scan</Link></div> : <form onSubmit={generateReport} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><div><label htmlFor="report-scan" className="block text-xs font-semibold text-ink">Completed scan</label><select id="report-scan" required value={scanJobId} onChange={(event) => setScanJobId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs">{scans.map((scan) => <option value={scan.id} key={scan.id}>{scan.projectName} · {new Date(scan.createdAt).toLocaleString()}</option>)}</select></div><div><label htmlFor="report-format" className="block text-xs font-semibold text-ink">Format</label><select id="report-format" value={format} onChange={(event) => setFormat(event.target.value as Format)} className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs"><option value="cyclonedx-json">CycloneDX 1.6 JSON SBOM</option><option value="licenses-csv">License findings CSV</option><option value="vulnerabilities-csv">OSV findings CSV</option></select></div><button disabled={busy || !scanJobId} className="rounded-lg bg-brand-dark px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Generating…" : "Generate report"}</button></form>}
    </section>
    <section className="rounded-xl border border-line bg-surface shadow-xs"><div className="flex flex-col gap-3 border-b border-line-soft p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-ink">Generated reports</h2><p className="mt-1 text-[11px] text-muted">Reports are stored in the active workspace.</p></div><input suppressHydrationWarning aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports…" className="rounded-lg border border-line px-3 py-1.5 text-xs sm:w-64" /></div>
      {loading ? <p role="status" className="p-8 text-center text-sm text-muted">Loading reports…</p> : filtered.length === 0 ? <div className="p-8 text-center"><FileTextIcon className="mx-auto h-8 w-8 text-muted" /><h3 className="mt-3 text-sm font-bold text-ink">{reports.length ? "No matching reports" : "No reports generated"}</h3><p className="mt-1 text-xs text-muted">Generate a report from a completed scan to see it here.</p></div> : <div className="divide-y divide-line-soft">{filtered.map((report) => <div key={report.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="truncate text-[13px] font-bold text-ink">{report.name}</h3><p className="mt-1 text-[11px] text-muted">{report.scanJob.project.name} · {report.format.includes("cyclonedx") ? "CycloneDX JSON" : "CSV"} · {new Date(report.createdAt).toLocaleString()}</p></div><button type="button" onClick={() => void downloadReport(report)} className="inline-flex items-center gap-2 self-start rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-panel sm:self-auto"><DownloadIcon className="h-3.5 w-3.5" />Download</button></div>)}</div>}
    </section>
  </div>;
}
