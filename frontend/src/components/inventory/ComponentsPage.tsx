"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type ComponentRecord, type DependencyRelationship, type Project } from "@/lib/api";
import { DependencyTreeGraph } from "@/components/inventory/DependencyTreeGraph";
import { SbomCoveragePanel } from "@/components/inventory/SbomCoveragePanel";
import { CubeIcon, DownloadIcon, SearchIcon } from "@/components/Icons";

export default function ComponentsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [components, setComponents] = useState<ComponentRecord[]>([]);
  const [dependencies, setDependencies] = useState<DependencyRelationship[]>([]);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<"components" | "graph" | "coverage">("components");
  const [query, setQuery] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [dependencyFilter, setDependencyFilter] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [vulnerabilityFilter, setVulnerabilityFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    api.projects.list().then(({ items }) => {
      if (!active) return;
      setProjects(items);
      const requested = new URLSearchParams(window.location.search).get("project");
      const first = items.find((project) => project.id === requested) || items.find((project) => project.scans?.some((scan) => scan.status === "COMPLETED")) || items[0];
      if (first) setProjectId(first.id);
      else setLoading(false);
    }).catch((reason: unknown) => { if (active) { setError(reason instanceof Error ? reason.message : "Could not load projects."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    api.projects.components(projectId).then(({ items, dependencies: edges }) => {
      if (!active) return;
      setComponents(items); setDependencies(edges); setSelected(items[0]?.id || "");
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load components."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const project = projects.find((item) => item.id === projectId);
  const completedScan = project?.scans?.find((scan) => scan.status === "COMPLETED");
  const selectedComponent = components.find((component) => component.id === selected);
  const licenseOptions = [...new Set(components.flatMap((component) => component.licenseExpression ? [component.licenseExpression] : []))].sort();
  const filtered = useMemo(() => components.filter((component) => {
    const search = query.trim().toLowerCase();
    if (search && !component.name.toLowerCase().includes(search)) return false;
    if (versionFilter.trim() && !component.version.toLowerCase().includes(versionFilter.trim().toLowerCase())) return false;
    if (dependencyFilter !== "all" && component.dependencyType !== dependencyFilter) return false;
    if (licenseFilter === "unknown" && component.licenseExpression) return false;
    if (licenseFilter === "known" && !component.licenseExpression) return false;
    if (licenseFilter !== "all" && licenseFilter !== "unknown" && licenseFilter !== "known" && component.licenseExpression !== licenseFilter) return false;
    if (vulnerabilityFilter === "with-findings" && component.vulnerabilities.length === 0) return false;
    if (vulnerabilityFilter === "without-findings" && component.vulnerabilities.length > 0) return false;
    return true;
  }), [components, query, versionFilter, dependencyFilter, licenseFilter, vulnerabilityFilter]);

  async function downloadSbom() {
    if (!completedScan) return;
    setDownloading(true); setDownloadError("");
    try { await api.scans.downloadSbom(completedScan.id); }
    catch (reason) { setDownloadError(reason instanceof Error ? reason.message : "Could not download the SBOM."); }
    finally { setDownloading(false); }
  }

  return <div className="flex flex-col gap-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-light"><span>Workspace</span><span>/</span><span className="font-semibold text-ink">Components</span></nav><h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Components &amp; Dependencies</h1><p className="mt-1 text-[13px] text-muted">Package inventory from completed npm lockfile scans.</p></div><div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="component-project">Project</label><select id="component-project" value={projectId} onChange={(event) => { setLoading(true); setError(""); setProjectId(event.target.value); }} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px]"><option value="" disabled>Select project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={!completedScan || downloading} title={!completedScan ? "A completed scan is required to export an SBOM." : undefined} onClick={downloadSbom} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"><DownloadIcon className="h-3.5 w-3.5" />{downloading ? "Preparing…" : "Export SBOM"}</button></div></header>
    {downloadError ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-xs text-red-700">{downloadError}</p> : null}
    {loading ? <div role="status" className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">Loading components…</div> : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-5"><p role="alert" className="text-sm text-red-800">{error}</p><button type="button" onClick={() => { setLoading(true); if (projectId) void api.projects.components(projectId).then(({ items, dependencies: edges }) => { setComponents(items); setDependencies(edges); setError(""); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load components.")).finally(() => setLoading(false)); else window.location.reload(); }} className="mt-3 text-xs font-semibold underline">Retry</button></div> : !projects.length ? <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center"><CubeIcon className="mx-auto h-8 w-8 text-brand" /><h2 className="mt-3 font-bold text-ink">No projects yet</h2><p className="mt-1 text-sm text-muted">Run a lockfile scan to populate the component inventory.</p></div> : !components.length ? <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center"><CubeIcon className="mx-auto h-8 w-8 text-brand" /><h2 className="mt-3 font-bold text-ink">No completed scan results</h2><p className="mt-1 text-sm text-muted">This project has no completed scan with component results yet.</p></div> : <>
      <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Components</p><p className="mt-1 text-2xl font-bold text-ink">{components.length.toLocaleString()}</p></div><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Dependency relationships</p><p className="mt-1 text-2xl font-bold text-ink">{dependencies.length.toLocaleString()}</p></div><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Unknown licenses</p><p className="mt-1 text-2xl font-bold text-ink">{components.filter((item) => !item.licenseExpression).length.toLocaleString()}</p></div></section>
      <section className="rounded-xl border border-line bg-surface shadow-xs">
        <div className="flex flex-col gap-3 border-b border-line-soft p-4">
          <div className="flex gap-2">
            <button type="button" aria-pressed={tab === "components"} onClick={() => setTab("components")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "components" ? "bg-brand-tint text-brand-dark" : "text-muted"}`}>Components ({components.length})</button>
            <button type="button" aria-pressed={tab === "graph"} onClick={() => setTab("graph")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "graph" ? "bg-brand-tint text-brand-dark" : "text-muted"}`}>Dependency graph ({dependencies.length})</button>
            <button type="button" aria-pressed={tab === "coverage"} onClick={() => setTab("coverage")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "coverage" ? "bg-brand-tint text-brand-dark" : "text-muted"}`}>SBOM coverage</button>
          </div>
          {tab === "components" ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-light" />
                <input suppressHydrationWarning aria-label="Filter by component name" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Component name…" className="w-full rounded-lg border border-line py-1.5 pr-2 pl-8 text-xs" />
              </div>
              <input suppressHydrationWarning aria-label="Filter by version" value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)} placeholder="Version…" className="rounded-lg border border-line px-2.5 py-1.5 text-xs" />
              <select aria-label="Filter by dependency type" value={dependencyFilter} onChange={(event) => setDependencyFilter(event.target.value)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs">
                <option value="all">All dependency types</option>
                <option value="DIRECT">Direct</option>
                <option value="TRANSITIVE">Transitive</option>
              </select>
              <select aria-label="Filter by license" value={licenseFilter} onChange={(event) => setLicenseFilter(event.target.value)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs">
                <option value="all">All licenses</option>
                <option value="known">Known license</option>
                <option value="unknown">Unknown / needs review</option>
                {licenseOptions.map((license) => <option key={license} value={license}>{license}</option>)}
              </select>
              <select aria-label="Filter by vulnerability status" value={vulnerabilityFilter} onChange={(event) => setVulnerabilityFilter(event.target.value)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs">
                <option value="all">All vulnerability statuses</option>
                <option value="with-findings">Has OSV findings</option>
                <option value="without-findings">No OSV findings</option>
              </select>
            </div>
          ) : null}
        </div>
        {tab === "components" ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[12px]"><thead className="bg-panel text-muted"><tr><th className="px-4 py-3 font-semibold">Component</th><th className="px-4 py-3 font-semibold">Version</th><th className="px-4 py-3 font-semibold">Relationship</th><th className="px-4 py-3 font-semibold">License status</th><th className="px-4 py-3 font-semibold">Finding count</th><th className="px-4 py-3 font-semibold">Details</th></tr></thead><tbody className="divide-y divide-line-soft">{filtered.map((item) => <tr key={item.id} className={selected === item.id ? "bg-panel" : ""}><td className="px-4 py-3 font-bold text-ink">{item.name}</td><td className="px-4 py-3 font-mono text-muted">{item.version}</td><td className="px-4 py-3 capitalize text-muted">{item.dependencyType.toLowerCase()}</td><td className="px-4 py-3">{item.licenseExpression ? <span><span className="font-semibold text-ink">Confirmed</span><span className="ml-1 text-muted">· {item.licenseExpression}</span></span> : <span className="font-semibold text-amber-800">Unknown / needs review</span>}</td><td className="px-4 py-3">{item.licenseFindings.filter((finding) => finding.decision !== "ALLOW").length + item.vulnerabilities.length}</td><td className="px-4 py-3"><button type="button" onClick={() => setSelected(item.id)} className="text-xs font-semibold text-brand-dark underline">View details</button></td></tr>)}</tbody></table>{!filtered.length ? <p className="p-6 text-center text-xs text-muted">No components match these filters.</p> : null}</div> : tab === "graph" ? <DependencyTreeGraph components={components} dependencies={dependencies} query={query} /> : <SbomCoveragePanel projectId={projectId} scanJobId={completedScan?.id || null} />}
      </section>
      {selectedComponent ? <aside className="rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-bold text-ink">{selectedComponent.name} details</h2><p className="mt-1 break-all font-mono text-[11px] text-muted">{selectedComponent.purl}</p><p className="mt-2 text-xs text-muted">Relationship: {selectedComponent.dependencyType.toLowerCase()} dependency.</p><p className="mt-1 text-xs text-muted">License: {selectedComponent.licenseExpression ? `Confirmed as ${selectedComponent.licenseExpression}` : "Unknown / needs review"}</p><p className="mt-1 text-xs text-muted">License source: {selectedComponent.licenseSource || "No source metadata found"}{selectedComponent.licenseObservedAt ? ` · observed ${new Date(selectedComponent.licenseObservedAt).toLocaleString()}` : ""}</p><div className="mt-4"><h3 className="text-xs font-bold text-ink">Dependency relationships</h3>{dependencies.filter((edge) => edge.parent.purl === selectedComponent.purl || edge.child.purl === selectedComponent.purl).length ? <ul className="mt-2 space-y-1 text-xs text-muted">{dependencies.filter((edge) => edge.parent.purl === selectedComponent.purl || edge.child.purl === selectedComponent.purl).map((edge) => <li key={edge.id}>{edge.parent.purl === selectedComponent.purl ? `Depends on ${edge.child.name}@${edge.child.version}` : `Required by ${edge.parent.name}@${edge.parent.version}`}</li>)}</ul> : <p className="mt-2 text-xs text-muted">No dependency edges recorded for this component.</p>}</div><div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold">{selectedComponent.licenseFindings.map((finding) => <Link key={finding.id} href={`/licenses#license-finding-${finding.id}`} className="text-brand-dark underline">Open license finding</Link>)}{selectedComponent.vulnerabilities.map((finding) => <Link key={finding.id} href={`/vulnerabilities#vulnerability-finding-${finding.id}`} className="text-brand-dark underline">Open {finding.osvId}</Link>)}</div></aside> : null}
    </>}
  </div>;
}
