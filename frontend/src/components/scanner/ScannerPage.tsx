"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, type Project, type ScanJob, type ScanProgressItem } from "@/lib/api";
import { XIcon, CheckIcon, ClockIcon, CloudUploadIcon, CubeIcon, GithubIcon, InfoIcon, UploadIcon } from "@/components/Icons";

type Options = { includeTransitive: boolean; includeDevDependencies: boolean; lookupLicenses: boolean };
const emptyCounts = { components: 0, vulnerabilities: 0, licenseReview: 0 };

const scanStages: Array<{ key: string; label: string; description: string }> = [
  { key: "queued", label: "Queued", description: "Waiting for the background worker" },
  { key: "fetching", label: "Source", description: "Reading the lockfile / cloning the repository" },
  { key: "analyzing", label: "Analyze components", description: "Parsing the lockfile into the component graph" },
  { key: "licenses", label: "License metadata", description: "Resolving a license for every package" },
  { key: "osv", label: "OSV lookup", description: "Checking every package against OSV advisories" },
  { key: "finalizing", label: "Finish", description: "Generating the CycloneDX 1.6 SBOM" },
];

function stageState(job: ScanJob, index: number): "done" | "active" | "pending" | "failed" {
  if (job.status === "completed") return "done";
  const current = job.stage ? Math.max(0, scanStages.findIndex((step) => step.key === job.stage)) : job.status === "queued" ? 0 : scanStages.length - 1;
  if (job.status === "failed") return index < current ? "done" : index === current ? "failed" : "pending";
  if (index < current) return "done";
  if (index === current) return "active";
  return "pending";
}

const feedSeverityStyle: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MODERATE: "bg-amber-100 text-amber-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};

function severityPill(severity: string | null) {
  if (!severity) return null;
  const label = severity.toUpperCase();
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${feedSeverityStyle[label] || "bg-chip text-muted"}`}>{label}</span>;
}

function PackageRow({ item, mode }: { item: ScanProgressItem; mode: "license" | "osv" }) {
  return (
    <li className="flex items-center gap-2 rounded-md py-1 pr-1 text-[11px]">
      {mode === "license" ? (
        item.licenseStatus === "done" ? (
          <CheckIcon className="h-3 w-3 shrink-0 text-emerald-500" />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand-dark" aria-label="Resolving license" />
        )
      ) : item.advisories > 0 ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-label="Has advisories" />
      ) : (
        <CheckIcon className="h-3 w-3 shrink-0 text-emerald-500" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-muted">
        <span className="font-semibold text-ink">{item.name}</span>@{item.version}
      </span>
      {item.direct ? <span className="shrink-0 rounded bg-brand-tint px-1 py-0.5 text-[9px] font-bold uppercase text-brand-dark">direct</span> : null}
      {mode === "license" ? (item.license ? <span className="shrink-0 max-w-40 truncate text-[10px] text-muted">{item.license}</span> : <span className="shrink-0 text-[10px] font-semibold text-amber-800">unknown · review</span>) : null}
      {mode === "osv" ? (item.advisories > 0 ? <span className="flex shrink-0 items-center gap-1"><span className="text-[10px] font-bold text-red-700">{item.advisories} advisor{item.advisories === 1 ? "y" : "ies"}</span>{severityPill(item.maxSeverity)}</span> : <span className="shrink-0 text-[10px] text-muted-light">clean</span>) : null}
    </li>
  );
}

function ScanTracker({ job }: { job: ScanJob }) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>("licenses");
  useEffect(() => {
    if (job.status !== "running" || !job.startedAt) return undefined;
    const startedAt = job.startedAt;
    const id = window.setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))), 1000);
    return () => window.clearInterval(id);
  }, [job.status, job.startedAt]);
  const running = job.status === "running";
  const progress = job.progress ?? null;
  const items = progress?.items ?? [];
  const total = progress?.total ?? 0;
  const licenseResolved = items.filter((item) => item.licenseStatus === "done").length;
  const advisories = items.reduce((sum, item) => sum + item.advisories, 0);
  const advisoryPackages = items.filter((item) => item.advisories > 0).length;
  const feeds: Record<string, { count: number; body: ReactNode } | undefined> = {
    licenses: { count: licenseResolved, body: <ul className="mt-1.5 divide-y divide-line-soft">{items.slice(0, 200).map((item) => <PackageRow key={item.purl} item={item} mode="license" />)}{items.length > 200 ? <li className="pt-1.5 text-[10.5px] text-muted">+{items.length - 200} more packages</li> : null}</ul> },
    osv: { count: advisories, body: items.some((item) => item.advisories > 0) ? <ul className="mt-1.5 divide-y divide-line-soft">{items.filter((item) => item.advisories > 0).map((item) => <PackageRow key={item.purl} item={item} mode="osv" />)}</ul> : <p className="mt-1.5 text-[11px] text-muted">No OSV advisories found for any package in this scan.</p> },
  };

  return (
    <ol aria-label="Scan progress" className="mb-3 divide-y divide-line-soft border-b border-line-soft">
      {scanStages.map((step, index) => {
        const state = stageState(job, index);
        const isDone = state === "done";
        const isActive = state === "active";
        const isFailed = state === "failed";
        const circle = isDone ? "bg-emerald-500 text-white" : isActive ? "bg-brand-dark text-white" : isFailed ? "bg-red-500 text-white" : "border border-line bg-surface text-muted";
        const feed = feeds[step.key];
        const open = expanded === step.key;
        const meta = step.key === "licenses" && total > 0 ? `${licenseResolved}/${total} resolved`
          : step.key === "osv" ? (running ? (advisoryPackages ? `${advisories} advisor${advisories === 1 ? "y" : "ies"} in ${advisoryPackages} package${advisoryPackages === 1 ? "" : "s"}` : "scanning…") : `${advisories} advisor${advisories === 1 ? "y" : "ies"} in ${advisoryPackages} package${advisoryPackages === 1 ? "" : "s"}`)
          : step.key === "analyzing" && total > 0 ? `${total} packages`
          : isDone && step.key === "finalizing" ? "SBOM ready"
          : undefined;
        return (
          <li key={step.key}>
            <div className="flex items-center gap-2.5 py-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${circle} ${isActive ? "animate-pulse" : ""}`}>
                {isDone ? <CheckIcon className="h-3 w-3" /> : isFailed ? <XIcon className="h-3 w-3" /> : <span className={isActive ? "" : ""}>{index + 1}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[12.5px] font-semibold ${state === "pending" ? "text-muted-light" : "text-ink"}`}>
                  {step.label}
                  {isActive && running && elapsed !== null ? <span className="ml-2 font-normal text-muted">{elapsed}s</span> : null}
                </p>
                <p className="text-[10px] text-muted-light">{step.description}</p>
              </div>
              {meta ? <span className="shrink-0 text-[10.5px] font-semibold text-muted">{meta}</span> : null}
              {feed ? (
                <button type="button" onClick={() => setExpanded(open ? null : step.key)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} package feed for ${step.label}`} className="shrink-0 rounded-md border border-line px-1.5 py-1 text-[10px] font-semibold text-ink hover:border-brand hover:text-brand-dark">
                  {open ? "Hide" : `Packages (${feed.count})`}
                </button>
              ) : null}
            </div>
            {feed && open ? <div className="ml-7 border-l border-line-soft pl-3 pb-2">{feed.body}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function ScannerPage() {
  const [source, setSource] = useState<"upload" | "repo">("upload");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [githubRepos, setGithubRepos] = useState<Array<{ id: number; name: string; fullName: string; description: string | null; private: boolean; htmlUrl: string; cloneUrl: string; defaultBranch: string }> | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [checkingLockfile, setCheckingLockfile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lockfileCheck, setLockfileCheck] = useState<{ found: boolean; path?: string; lockfileVersion?: number; packageCount?: number; directDependencies?: number; projectName?: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<Options>({ includeTransitive: true, includeDevDependencies: true, lookupLicenses: true });
  const [job, setJob] = useState<ScanJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api.github.settings().then((settings) => { if (!active) return; setGithubConnected(settings.connected); if (settings.connected) return api.github.repos().then(({ items }) => { if (active) setGithubRepos(items); }); }).catch(() => { if (active) setGithubRepos([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.projects.list().then(({ items }) => { if (active) setProjects(items); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load projects.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    let active = true;
    const timer = window.setInterval(() => api.scans.get(job.id).then(({ item }) => { if (active) { setJob(item); if (item.status === "completed" || item.status === "failed") setNotice(""); } }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not refresh scan status.");
    }), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [job]);

  const recent = useMemo(() => projects.flatMap((project) => (project.scans || []).map((scan) => ({ ...scan, projectId: project.id, projectName: project.name }))).slice(0, 4), [projects]);
  const activeProject = projects.find((project) => project.id === projectId);

async function checkLockfile() {
    const match = repoUrl.trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/\s/]+?)(?:\.git)?\/?$/);
    if (!match) { setLockfileCheck(null); return; }
    setCheckingLockfile(true); setLockfileCheck(null);
    try {
      const [, owner, repo] = match;
      setLockfileCheck(await api.github.check(owner, repo.replace(/\/$/, "")));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not check the repository."); }
    finally { setCheckingLockfile(false); }
  }

  function selectFile(candidate?: File) {
    setFileError(""); setError("");
    if (!candidate) { setFile(null); return; }
    if (![/(^|-)package-lock\.json$/i, /^npm-shrinkwrap\.json$/i].some((pattern) => pattern.test(candidate.name))) { setFile(null); setFileError("Choose a package-lock.json or npm-shrinkwrap.json file."); return; }
    if (candidate.size > 20 * 1024 * 1024) { setFile(null); setFileError("This file is larger than 20 MB. Choose a smaller file."); return; }
    setFile(candidate);
  }

  async function runScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setFileError("");
    if (!activeProject && !projectName.trim()) { setError("Choose a project or enter a name for a new project."); return; }
    setBusy(true);
    try {
      let project = activeProject;
      if (!project && !projectName.trim()) throw new Error("Enter a name for the new project.");
      if (source === "repo") {
        const repositoryUrl = repoUrl.trim();
        if (!/^https?:\/\//i.test(repositoryUrl)) throw new Error("Enter a valid http(s) repository URL.");
        project = project || (await api.projects.create({ name: projectName.trim() })).item;
        const created = project;
        if (!activeProject) { setProjects((items) => [created, ...items]); setProjectId(created.id); }
        const result = await api.projects.startRepositoryScan(project.id, repositoryUrl, branch.trim() || "main");
        setJob({ id: result.jobId, project: { id: project.id, name: project.name }, status: "queued", createdAt: new Date().toISOString(), startedAt: null, completedAt: null, error: null, counts: emptyCounts, integrations: { osv: { status: "pending", error: null }, licenses: { status: "pending", error: null } } });
        setNotice("Repository scan queued. Status will update here while the background job runs.");
        return;
      }
      if (!file) { setFileError("Choose a package-lock.json file before starting the scan."); return; }
      let lockfile: { lockfileVersion?: number; packages?: unknown };
      try { lockfile = JSON.parse(await file.text()) as typeof lockfile; }
      catch { throw new Error("The selected file is not valid JSON."); }
      if (![2, 3].includes(lockfile.lockfileVersion || 0) || !lockfile.packages || typeof lockfile.packages !== "object") throw new Error("Use an npm package-lock.json file with lockfile version 2 or 3.");
      project = project || (await api.projects.create({ name: projectName.trim() })).item;
      const created = project;
      if (!activeProject) { setProjects((items) => [created, ...items]); setProjectId(created.id); }
      const result = await api.projects.startUploadScan(project.id, file, options);
      setJob({ id: result.jobId, project: { id: project.id, name: project.name }, status: "queued", createdAt: new Date().toISOString(), startedAt: null, completedAt: null, error: null, counts: emptyCounts, integrations: { osv: { status: "pending", error: null }, licenses: { status: "pending", error: null } } });
      setNotice("Scan queued. Status will update here while the background job runs.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Scan could not start."); }
    finally { setBusy(false); }
  }

  async function downloadSbom() {
    if (!job) return;
    setDownloadError("");
    try {
      await api.scans.downloadSbom(job.id);
      setNotice("Download started — check your browser's downloads. The file saves as an .cdx.json CycloneDX SBOM.");
    }
    catch (reason) { setDownloadError(reason instanceof Error ? reason.message : "SBOM download failed."); }
  }

  const optionsList: Array<{ key: keyof Options; title: string; description: string }> = [
    { key: "includeTransitive", title: "Include transitive dependencies", description: "Include the full dependency tree in the lockfile." },
    { key: "includeDevDependencies", title: "Include development dependencies", description: "Include packages marked as development dependencies." },
    { key: "lookupLicenses", title: "Look up license metadata", description: "Check npm registry metadata; missing licenses remain unknown." },
  ];

  return <div className="flex flex-col gap-6">
    <div><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-light"><Link href="/overview" className="hover:text-ink">Workspace</Link><span>/</span><span className="font-semibold text-ink">SBOM Scanner</span></nav><h1 className="mt-2 text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">Generate an SBOM</h1><p className="mt-1 text-[13.5px] text-muted">Analyze an npm package lockfile and create a CycloneDX SBOM.</p></div>
    <div className="flex items-center justify-center py-2"><div className="flex items-center gap-3 sm:gap-6">{["Select source", "Analyze", "Review results"].map((step, index) => <div key={step} className="flex items-center gap-3 sm:gap-6">{index > 0 ? <div className="h-0.5 w-10 bg-line sm:w-20" /> : null}<div className="flex flex-col items-center"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${index === 0 || (index === 1 && job) || (index === 2 && job?.status === "completed") ? "bg-brand-dark text-white" : "border border-line bg-surface text-muted"}`}>{index === 0 || (index === 1 && job) || (index === 2 && job?.status === "completed") ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}</span><span className="mt-1.5 text-[11px] font-medium text-muted sm:text-[12px]">{step}</span></div></div>)}</div></div>

    <form onSubmit={runScan} className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
      <section className="rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6"><h2 className="text-[17px] font-bold text-ink">Choose a source</h2><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" aria-pressed={source === "repo"} onClick={() => setSource("repo")} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold ${source === "repo" ? "border-brand-dark bg-panel text-brand-dark" : "border-line text-muted"}`}><GithubIcon className="h-4 w-4" />Repository</button><button type="button" aria-pressed={source === "upload"} onClick={() => setSource("upload")} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold ${source === "upload" ? "border-brand-dark bg-panel text-brand-dark" : "border-line text-muted"}`}><UploadIcon className="h-4 w-4" />Upload lockfile</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="project-select" className="block text-[13px] font-semibold text-ink">Project</label><select id="project-select" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={loading} className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"><option value="">Create a new project…</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>{!projectId ? <div><label htmlFor="project-name" className="block text-[13px] font-semibold text-ink">New project name</label><input suppressHydrationWarning id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} required placeholder="e.g. api-gateway" className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px]" /></div> : null}</div>
        {source === "repo" ? <div className="mt-5 space-y-4">
        {githubRepos && githubRepos.length > 0 ? <div><label htmlFor="repo-select" className="block text-[13px] font-semibold text-ink">Your GitHub repositories</label><select id="repo-select" value={githubRepos.some((item) => item.cloneUrl === repoUrl) ? repoUrl : ""} onChange={(event) => { const selected = githubRepos.find((item) => item.cloneUrl === event.target.value); if (selected) { setRepoUrl(selected.cloneUrl); setBranch(selected.defaultBranch); setLockfileCheck(null); } else { setRepoUrl(""); setLockfileCheck(null); } }} className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] focus:border-brand focus:outline-none"><option value="">Select a repository…</option>{githubRepos.map((item) => <option key={item.id} value={item.cloneUrl}>{item.fullName}{item.private ? " · private" : ""}</option>)}</select></div> : githubConnected ? <p className="rounded-lg border border-line bg-panel p-3 text-[12px] text-muted">GitHub is connected, but no repositories are visible. Make sure your token has <code>repo</code> scope.</p> : <p className="rounded-lg border border-line bg-panel p-3 text-[12px] text-muted">Tip — <Link href="/settings" className="font-semibold text-brand hover:text-brand-dark">connect GitHub in Settings</Link> to pick a repository from a dropdown instead of typing a URL.</p>}
        <div><label htmlFor="repository-url" className="block text-[13px] font-semibold text-ink">Repository URL</label><div className="mt-1.5 flex flex-col gap-2 sm:flex-row"><input suppressHydrationWarning id="repository-url" type="url" value={repoUrl} onChange={(event) => { setRepoUrl(event.target.value); setLockfileCheck(null); }} required placeholder="https://github.com/org/repo" className="w-full rounded-lg border border-line px-3 py-2 text-[13px]" /><button type="button" onClick={() => void checkLockfile()} disabled={checkingLockfile || !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(repoUrl.trim())} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50">{checkingLockfile ? "Checking…" : "Check lockfile"}</button></div></div>
        <div><label htmlFor="branch" className="block text-[13px] font-semibold text-ink">Branch</label><input suppressHydrationWarning id="branch" value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-[13px]" /></div>
        {lockfileCheck ? <p className={lockfileCheck.found ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-900" : "rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900"}>{lockfileCheck.found ? `✓ ${lockfileCheck.path} — lockfile v${lockfileCheck.lockfileVersion} · ${lockfileCheck.packageCount} packages · ${lockfileCheck.directDependencies} direct dependencies` : "No package-lock.json or npm-shrinkwrap.json found in the repository root."}</p> : null}
        <p className="rounded-lg border border-line-soft bg-panel p-3 text-[12px] text-muted">Public and private GitHub repositories are supported (GitLab also works with a public URL). Private repos require a GitHub connection — connect via OAuth in <Link href="/settings" className="font-semibold text-brand hover:text-brand-dark">Settings</Link> or with a Personal Access Token.</p>
      </div> : (<>
        <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer?.files?.[0] ?? undefined); }} className={`mt-5 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-brand bg-[#f4edff]" : "border-line bg-panel"}`}>
        <input suppressHydrationWarning id="lockfile" ref={fileInputRef} type="file" accept=".json,application/json" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0] ?? undefined)} />
        <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Choose a package-lock.json file" className="w-full cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
          <CloudUploadIcon className="mx-auto h-8 w-8 text-brand" />
          <p className="mt-2 text-[13.5px] font-bold text-ink">Upload an npm package lockfile</p>
          <span className="mt-2 inline-block rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-semibold text-brand-dark">{file ? "Choose another file" : "Choose package-lock.json"}</span>
          {file ? <p className="mt-2 text-[12px] font-semibold">{file.name} · {(file.size / 1024).toFixed(0)} KB</p> : <p className="mt-2 text-[11px] text-muted-light">npm or shrinkwrap lockfile · v2/v3 · max 20 MB · or drop it here</p>}
        </button>
        {fileError ? <p role="alert" className="mt-2 text-[12px] text-red-700">{fileError}</p> : null}
        </div>
        <div className="mt-3">
        <button type="button" onClick={() => setPasteMode((value) => !value)} className="text-[11.5px] font-semibold text-brand-dark underline">
          {pasteMode ? "Hide paste mode" : "Can't open the file picker? Paste the lockfile instead"}
        </button>
        {pasteMode ? (
          <div className="mt-2 text-left">
            <textarea suppressHydrationWarning
              aria-label="Paste package-lock.json contents"
              value={pasteText}
              onChange={(event) => {
                const text = event.target.value;
                setPasteText(text); setFileError(""); setError("");
                setFile(text.trim() ? new File([text], "package-lock.json", { type: "application/json" }) : null);
              }}
              placeholder="Paste the full contents of package-lock.json here…"
              className="h-40 w-full rounded-lg border border-line p-3 font-mono text-[11px] focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-muted-light">We upload the pasted text as your package-lock.json. It stays on this machine until the scan runs.</p>
          </div>
        ) : null}
        </div>
        </>)}
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-line-soft bg-panel p-3"><CubeIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" /><p className="text-[12px] text-muted"><strong className="text-ink">Supported input:</strong> npm package-lock.json or npm-shrinkwrap.json, v2 or v3.</p></div>
      </section>

      <div className="flex flex-col gap-5"><section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><h2 className="text-[16px] font-bold text-ink">Analysis options</h2><div className="mt-4 flex flex-col gap-4">{optionsList.map((item) => <label key={item.key} className="flex cursor-pointer items-start gap-3 text-[12.5px] font-semibold text-ink"><input suppressHydrationWarning type="checkbox" checked={options[item.key]} onChange={() => setOptions((previous) => ({ ...previous, [item.key]: !previous[item.key] }))} className="mt-0.5 h-4 w-4 accent-[#6d21e8]" /><span>{item.title}<span className="mt-0.5 block text-[11.5px] font-normal text-muted">{item.description}</span></span></label>)}</div><div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-oksoft p-3"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-ok" /><p className="text-[11.5px] text-ok">OSV vulnerability lookup runs in the background after the SBOM is generated.</p></div></section>
        <section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><h2 className="text-[16px] font-bold text-ink">Recent scans</h2>{loading ? <p className="mt-3 text-[12px] text-muted">Loading scans…</p> : recent.length === 0 ? <p className="mt-3 text-[12px] text-muted">No scans have been run yet.</p> : <ul className="mt-3 divide-y divide-line-soft">{recent.map((scan) => <li key={scan.id} className="flex items-center justify-between gap-2 py-2.5"><Link href={`/scans/${scan.id}`} className="flex min-w-0 items-center gap-2 truncate text-[12px] font-bold text-ink transition-colors hover:text-brand-dark"><CubeIcon className="h-4 w-4 shrink-0 text-muted" />{scan.projectName}</Link><span className="flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-bold capitalize text-muted"><ClockIcon className="h-3 w-3" />{scan.stage ? scanStages.find((step) => step.key === scan.stage)?.label ?? scan.stage : scan.status.toLowerCase()}</span></li>)}</ul>}</section></div>
      <div className="flex flex-col gap-3 lg:col-span-2">{error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p> : null}{notice ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">{notice}</p> : null}{job ? <section className="rounded-xl border border-line bg-surface p-4 text-[12px]"><ScanTracker key={`${job.id}-${job.startedAt ?? "pending"}`} job={job} /><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{job.project.name}</strong><span className="ml-2 rounded-full bg-chip px-2 py-1 font-semibold capitalize">{job.status}</span></div>{job.status === "completed" ? <div className="flex flex-wrap items-center gap-2"><Link href={`/scans/${job.id}`} className="rounded-lg border border-line bg-panel px-3 py-1.5 font-semibold text-brand-dark">Release review</Link><button type="button" onClick={downloadSbom} className="rounded-lg bg-brand-dark px-3 py-1.5 font-semibold text-white">Download CycloneDX SBOM</button></div> : null}</div>{job.status === "running" ? <p className="mt-2 text-muted">Background analysis is running. Status refreshes automatically.</p> : null}{job.status === "completed" ? <p className="mt-2 text-muted">{job.counts.components} components · {job.counts.vulnerabilities} OSV findings · {job.counts.licenseReview} license reviews. OSV: {job.integrations.osv.status}; license metadata: {job.integrations.licenses.status}.</p> : null}{job.status === "failed" ? <p role="alert" className="mt-2 text-red-700">{job.error?.message || "Scan failed."}</p> : null}{job.integrations.osv.error ? <p className="mt-2 text-amber-800">OSV lookup unavailable: {job.integrations.osv.error}</p> : null}{downloadError ? <p role="alert" className="mt-2 text-red-700">{downloadError}</p> : null}</section> : null}<div className="flex items-center justify-between"><p className="text-[12px] text-muted">Scans run in a background worker.</p><div className="flex items-center gap-3"><Link href="/overview" className="rounded-lg border border-line bg-surface px-5 py-2 text-[13px] font-semibold text-ink">Cancel</Link><button type="submit" disabled={busy || loading} className="rounded-lg bg-brand-dark px-5 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Queueing scan…" : source === "repo" ? "Start repository scan" : "Start scan"}</button></div></div></div>
    </form>
  </div>;
}
