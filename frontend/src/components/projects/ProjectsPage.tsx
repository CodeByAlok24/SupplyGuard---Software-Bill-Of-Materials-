"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type Project } from "@/lib/api";
import { CubeIcon, FolderIcon, SearchIcon } from "@/components/Icons";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true); setError("");
    try { setProjects((await api.projects.list()).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load projects."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    api.projects.list().then(({ items }) => { if (active) setProjects(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load projects."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => !normalized || project.name.toLowerCase().includes(normalized) || project.repositoryUrl?.toLowerCase().includes(normalized));
  }, [projects, query]);

  function openCreate() { setEditing(null); setName(""); setRepositoryUrl(""); setError(""); setNotice(""); setDialogOpen(true); }
  function openEdit(project: Project) { setEditing(project); setName(project.name); setRepositoryUrl(project.repositoryUrl || ""); setError(""); setNotice(""); setDialogOpen(true); }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (editing) {
        const result = await api.projects.update(editing.id, { name: name.trim(), repositoryUrl: repositoryUrl.trim() || null });
        setProjects((items) => items.map((project) => project.id === editing.id ? { ...project, ...result.item } : project));
        setNotice("Project changes saved.");
      } else {
        const result = await api.projects.create({ name: name.trim(), ...(repositoryUrl ? { repositoryUrl } : {}) });
        setProjects((items) => [result.item, ...items]);
        setNotice("Project created.");
      }
      setDialogOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Project could not be saved."); }
    finally { setBusy(false); }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete ${project.name} and its scans? This cannot be undone.`)) return;
    setError(""); setNotice("");
    try { await api.projects.delete(project.id); setProjects((items) => items.filter((item) => item.id !== project.id)); setNotice(`${project.name} deleted.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Project could not be deleted."); }
  }

  return <div className="flex flex-col gap-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-light"><span>Workspace</span><span>/</span><span className="font-semibold text-ink">Projects</span></nav><h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Projects</h1><p className="mt-1 text-[13px] text-muted">Manage the projects and scan results in this workspace.</p></div><button type="button" onClick={openCreate} className="rounded-lg bg-brand-dark px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep">Add project</button></header>
    {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-[12px] text-emerald-800">{notice}</p> : null}
    {error && !dialogOpen ? <div className="rounded-lg bg-red-50 px-4 py-3"><p role="alert" className="text-[12.5px] text-red-800">{error}</p><button type="button" onClick={() => void loadProjects()} className="mt-2 text-xs font-semibold text-red-800 underline">Retry</button></div> : null}
    <section className="rounded-xl border border-line bg-surface shadow-xs"><div className="flex flex-col gap-3 border-b border-line-soft p-4 md:flex-row md:items-center md:justify-between"><div className="relative w-full md:max-w-sm"><SearchIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-light" /><input suppressHydrationWarning value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search projects" placeholder="Search projects…" className="w-full rounded-lg border border-line py-2 pr-3 pl-9 text-[12.5px] focus:border-brand focus:outline-none" /></div><div className="flex items-center gap-2"><span className="mr-1 text-[11px] text-muted">{filtered.length} projects</span><button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${view === "grid" ? "border-brand bg-brand-tint text-brand-dark" : "border-line text-muted"}`}>Grid</button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${view === "list" ? "border-brand bg-brand-tint text-brand-dark" : "border-line text-muted"}`}>List</button></div></div>
      {loading ? <div role="status" className="p-8 text-center text-sm text-muted">Loading projects…</div> : filtered.length === 0 ? <div className="p-9 text-center"><FolderIcon className="mx-auto h-8 w-8 text-brand" /><h2 className="mt-3 text-base font-bold text-ink">{projects.length ? "No matching projects" : "No projects yet"}</h2><p className="mt-1 text-sm text-muted">{projects.length ? "Try another search." : "Create a project before uploading a lockfile for analysis."}</p>{!projects.length ? <button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">Add your first project</button> : null}</div> : <div className={view === "grid" ? "grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3" : "divide-y divide-line-soft"}>{filtered.map((project) => {
        const scan = project.scans?.[0];
        return <article key={project.id} className={view === "grid" ? "rounded-xl border border-line p-4" : "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"}>
          <div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel-deep text-brand-dark"><CubeIcon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="truncate text-[14px] font-bold text-ink">{project.name}</h2><p className="mt-0.5 truncate text-[11px] text-muted">{project.repositoryUrl || "No repository connected"}</p><p className="mt-2 text-[11px] text-muted">{scan ? `${scan.componentCount.toLocaleString()} components · latest scan ${scan.status.toLowerCase()}` : "No scan results yet"}</p></div></div>
          <div className="flex items-center gap-2">{scan ? <Link href={`/scans/${scan.id}`} className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-brand-dark hover:bg-brand-tint">Review</Link> : null}<button type="button" onClick={() => openEdit(project)} className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-panel">Edit</button><button type="button" onClick={() => void deleteProject(project)} className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50">Delete</button></div>
        </article>;
      })}</div>}
    </section>
    {dialogOpen ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="project-dialog-title" className="text-lg font-bold text-ink">{editing ? "Edit project" : "Add project"}</h2><p className="mt-1 text-xs text-muted">Project metadata is stored in your workspace.</p></div><button type="button" onClick={() => setDialogOpen(false)} aria-label="Close dialog" className="rounded-md px-2 py-1 text-muted hover:bg-brand-tint">×</button></div><form onSubmit={saveProject} className="mt-5 flex flex-col gap-4"><div><label htmlFor="project-name" className="block text-xs font-semibold text-ink">Project name</label><input suppressHydrationWarning id="project-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm" /></div><div><label htmlFor="project-repository" className="block text-xs font-semibold text-ink">Repository URL <span className="font-normal text-muted">(optional)</span></label><input suppressHydrationWarning id="project-repository" type="url" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/org/repo" className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm" /><p className="mt-1 text-[11px] text-muted">Saving a URL does not connect or scan the repository.</p></div>{error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Cancel</button><button disabled={busy} className="rounded-lg bg-brand-dark px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : editing ? "Save changes" : "Create project"}</button></div></form></section></div> : null}
  </div>;
}
