"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ReleaseEvidence, type ReleaseEvidenceInput, type Project, type WorkspaceRole, type ProvenanceAttestation } from "@/lib/api";
import { CopyIcon, CheckIcon, FileTextIcon, ShieldCheckIcon, XIcon, InfoIcon } from "@/components/Icons";

const PROVIDER_OPTIONS = ["github-actions", "gitlab-ci", "jenkins", "circleci", "buildkite", "manual"];
const FORMAT_OPTIONS = ["cyclonedx", "spdx"];
const ENV_OPTIONS = ["production", "staging", "development", "preview", "internal"];

function emptyForm(): ReleaseEvidenceInput {
  return {
    scanJobId: null,
    repositoryUrl: null,
    commitSha: null,
    sbomName: null,
    sbomFormat: null,
    sbomSerialNumber: null,
    sbomGeneratedAt: null,
    sbomDigest: null,
    artifactName: null,
    artifactDigest: null,
    buildProvider: null,
    buildWorkflow: null,
    buildRunId: null,
    buildRunUrl: null,
    deployService: null,
    deployEnvironment: null,
    deployRegion: null,
    deployAt: null,
    verificationState: "UNVERIFIED",
    note: null,
  };
}

function NotProvided({ children = "Not provided" }: { children?: React.ReactNode }) {
  return <span className="italic text-muted-light">{children}</span>;
}

function Field({ label, htmlFor, required, hint, className, children }: { label: string; htmlFor?: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold text-ink">
        {label} {required ? <span className="text-muted-light">(required)</span> : null}
      </label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[10px] leading-relaxed text-muted-light">{hint}</p> : null}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-light">{title}</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">{label}</p>
      <div className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] focus:border-brand focus:outline-none";
const selectCls = `${inputCls} disabled:opacity-60`;

function Copy({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} aria-label={copied ? `${label} copied` : `Copy ${label}`} title={copied ? "Copied" : `Copy ${label}`} className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted hover:text-ink">
      {copied ? <CheckIcon className="h-3 w-3 text-emerald-600" /> : <CopyIcon className="h-3 w-3" />}
    </button>
  );
}

function short(value: string | null, start = 8, end = 6) {
  if (!value) return null;
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function digestShort(digest: string | null) {
  if (!digest) return null;
  return digest.length > 18 ? `${digest.slice(0, 10)}…${digest.slice(-8)}` : digest;
}

export function ReleaseEvidencePage() {
  const [role, setRole] = useState<WorkspaceRole>("VIEWER");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [items, setItems] = useState<ReleaseEvidence[] | null>(null);
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseEvidence | null>(null);
  const [form, setForm] = useState<ReleaseEvidenceInput>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [attestationBusy, setAttestationBusy] = useState(false);
  const [attestationError, setAttestationError] = useState("");
  const attestationInputRef = useRef<HTMLInputElement>(null);

  const canWrite = role === "OWNER" || role === "ADMIN" || role === "ANALYST";
  const canDelete = role === "OWNER" || role === "ADMIN";
  const selected = items?.find((item) => item.id === selectedId) ?? null;

  const load = useCallback(async () => {
    try {
      const [projectResult, me] = await Promise.all([api.projects.list(), api.auth.me()]);
      setRole(me.workspace.role);
      setProjects(projectResult.items);
      setError("");
      setSelectedProjectId((current) => (current && projectResult.items.some((p) => p.id === current) ? current : projectResult.items[0]?.id ?? ""));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not load workspace.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  const loadEvidence = useCallback(async (projectId: string) => {
    try {
      const { items: evidenceItems } = await api.releaseEvidence.list(projectId);
      setItems(evidenceItems);
      setLoadedProjectId(projectId);
      setSelectedId((current) => evidenceItems.find((item) => item.id === current)?.id ?? evidenceItems[0]?.id ?? "");
      setError("");
    } catch (reason: unknown) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Could not load release evidence.");
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    let active = true;
    const projectId = selectedProjectId;
    Promise.resolve().then(() => { if (active) void loadEvidence(projectId); });
    return () => { active = false; };
  }, [selectedProjectId, loadEvidence]);

  function openCreate(scanId?: string, scanSource?: { repositoryUrl: string | null; commitSha?: string | null; sbomGeneratedAt?: string | null }) {
    setEditing(null);
    setForm({ ...emptyForm(), scanJobId: scanId ?? null, repositoryUrl: scanSource?.repositoryUrl ?? null, commitSha: scanSource?.commitSha ?? null, sbomGeneratedAt: scanSource?.sbomGeneratedAt ?? null });
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(item: ReleaseEvidence) {
    setEditing(item);
    setForm({
      scanJobId: item.scanJobId,
      repositoryUrl: item.repositoryUrl,
      commitSha: item.commitSha,
      sbomName: item.sbomName,
      sbomFormat: item.sbomFormat,
      sbomSerialNumber: item.sbomSerialNumber,
      sbomGeneratedAt: item.sbomGeneratedAt,
      sbomDigest: item.sbomDigest,
      artifactName: item.artifactName,
      artifactDigest: item.artifactDigest,
      buildProvider: item.buildProvider,
      buildWorkflow: item.buildWorkflow,
      buildRunId: item.buildRunId,
      buildRunUrl: item.buildRunUrl,
      deployService: item.deployService,
      deployEnvironment: item.deployEnvironment,
      deployRegion: item.deployRegion,
      deployAt: item.deployAt,
      verificationState: item.verificationState === "user_asserted" ? "USER_ASSERTED" : "UNVERIFIED",
      note: item.note,
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setBusy(true); setFormError("");
    try {
      if (editing) {
        await api.releaseEvidence.update(editing.id, form);
        setNotice("Release evidence updated.");
      } else {
        await api.releaseEvidence.create(selectedProjectId, form);
        setNotice("Release evidence registered.");
      }
      setDialogOpen(false);
      await loadEvidence(selectedProjectId);
    } catch (reason: unknown) {
      setFormError(reason instanceof Error ? reason.message : "Could not save release evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ReleaseEvidence) {
    if (!window.confirm("Remove this release evidence entry? This cannot be undone.")) return;
    setError(""); setNotice("");
    try {
      await api.releaseEvidence.remove(item.id);
      setNotice("Release evidence removed.");
      await loadEvidence(selectedProjectId);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not remove release evidence.");
    }
  }

  async function uploadAttestation(file: File) {
    if (!selected) return;
    setAttestationBusy(true); setAttestationError(""); setNotice("");
    try {
      await api.releaseEvidence.uploadAttestation(selected.id, file);
      setNotice("Attestation parsed and stored. Signature verification is not implemented — treat it as unverified.");
      await loadEvidence(selectedProjectId);
    } catch (reason: unknown) {
      setAttestationError(reason instanceof Error ? reason.message : "Could not parse the attestation.");
    } finally {
      setAttestationBusy(false);
      if (attestationInputRef.current) attestationInputRef.current.value = "";
    }
  }

  async function removeAttestation() {
    if (!selected) return;
    if (!window.confirm("Remove the provenance attestation for this evidence entry?")) return;
    setAttestationBusy(true); setAttestationError(""); setNotice("");
    try {
      await api.releaseEvidence.removeAttestation(selected.id);
      setNotice("Attestation removed.");
      await loadEvidence(selectedProjectId);
    } catch (reason: unknown) {
      setAttestationError(reason instanceof Error ? reason.message : "Could not remove the attestation.");
    } finally {
      setAttestationBusy(false);
    }
  }

  const verifiedCount = items?.filter((item) => item.sbomDigest || item.artifactDigest).length ?? 0;
  const fullChainCount = items?.filter((item) => item.repositoryUrl && item.commitSha && item.sbomDigest && item.artifactDigest && item.deployService).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-light"><span>Workspace</span><span>/</span><span className="text-ink">Release evidence</span></nav>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Release evidence</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">Manual record of repository → build → SBOM → artifact → deployment, used to tell whether a finding reaches something you shipped. <strong>Nothing here is inferred or verified automatically.</strong></p>
        </div>
        {canWrite && ready ? <button type="button" onClick={() => openCreate()} className="w-fit shrink-0 rounded-lg bg-brand-dark px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep">Add evidence</button> : null}
      </header>

      {notice ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification" className="shrink-0 rounded p-0.5 text-emerald-700 hover:text-emerald-900"><XIcon className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}
      {error && !dialogOpen ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p role="alert" className="flex-1 text-[12px] text-red-800">{error}</p>
          <button type="button" onClick={() => selectedProjectId ? loadEvidence(selectedProjectId) : load()} className="text-[11px] font-semibold text-red-800 underline">Retry</button>
        </div>
      ) : null}
      {!canWrite && ready ? (
        <p className="flex items-start gap-2 rounded-lg bg-panel-deep px-3 py-2 text-[11.5px] text-muted"><ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Your role is <strong>{role.toLowerCase()}</strong> — read-only. Ask a workspace owner or administrator to add or edit evidence.</p>
      ) : null}

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="evidence-project" className="text-[10px] font-bold uppercase tracking-wide text-muted-light">Project</label>
            {projects.length > 1 ? (
              <select id="evidence-project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            ) : (
              <span className="text-[12.5px] font-semibold text-ink">{projects[0]?.name ?? "No project"}</span>
            )}
            {items ? <span className="rounded-full bg-chip px-2 py-0.5 text-[10px] font-semibold text-muted">{items.length} {items.length === 1 ? "entry" : "entries"}</span> : null}
          </div>
          <span className="hidden text-[10px] text-muted-light sm:inline">Source: manual entry — never verified automatically</span>
        </div>

        <dl className="divide-y divide-line-soft border-t border-line-soft bg-panel/60 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:block sm:py-2.5">
            <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Entries</dt>
            <dd className="text-[13px] font-bold text-ink sm:mt-0.5">{items === null ? "—" : items.length}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:block sm:py-2.5">
            <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">With a digest</dt>
            <dd className={`text-[13px] font-bold sm:mt-0.5 ${verifiedCount === 0 ? "text-muted-light" : "text-ink"}`}>{items === null ? "—" : verifiedCount}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:block sm:py-2.5">
            <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Full chain recorded</dt>
            <dd className={`text-[13px] font-bold sm:mt-0.5 ${fullChainCount === 0 ? "text-muted-light" : "text-ink"}`}>{items === null ? "—" : fullChainCount}</dd>
          </div>
        </dl>

        <details className="border-t border-line-soft px-4 py-2.5 text-[11px] text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden"><InfoIcon className="h-3.5 w-3.5 shrink-0 text-brand" />How an entry is judged</summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            <p><strong className="text-ink">Verified</strong> — the recorded SBOM digest matches the digest of the scan&apos;s own SBOM, byte for byte.</p>
            <p><strong className="text-ink">Linked</strong> — a human linked this entry to the scan; no digest was asserted.</p>
            <p><strong className="text-ink">Unverified</strong> — entries exist for the project, but none references this SBOM or scan.</p>
            <p><strong className="text-ink">Missing</strong> — nothing registered. <strong className="text-ink">Stale</strong> — the entry was last edited before the scan finished.</p>
            <p>No signature is checked anywhere, so a matching digest proves both documents name the same artifact — nothing more.</p>
          </div>
        </details>
      </div>

      {!ready || loadedProjectId !== selectedProjectId || items === null ? (
        <div role="status" className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{!ready ? "Checking your workspace…" : "Loading release evidence…"}</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint"><FileTextIcon className="h-5 w-5 text-brand" /></span>
          <h2 className="mt-3 text-[15px] font-bold text-ink">No projects yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted">Create a project and run a scan first — evidence entries connect its artifact digest to deployments.</p>
          {ready ? <Link href="/projects" className="mt-4 inline-block rounded-lg bg-brand-dark px-4 py-2 text-[12.5px] font-semibold text-white">Go to Projects</Link> : null}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint"><FileTextIcon className="h-5 w-5 text-brand" /></span>
          <h2 className="mt-3 text-[15px] font-bold text-ink">No release evidence yet</h2>
          <p className="mx-auto mt-1 max-w-lg text-[12px] leading-relaxed text-muted">Link a repository commit, build, SBOM and artifact to a deployment so findings can be attributed to what you actually shipped. Every field is optional — blanks stay marked “Not provided”.</p>
          {canWrite ? <button type="button" onClick={() => openCreate()} className="mt-4 rounded-lg bg-brand-dark px-4 py-2 text-[12.5px] font-semibold text-white">Add the first entry</button> : null}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5"><h2 className="text-[13px] font-bold text-ink">Entries</h2><span className="text-[10.5px] text-muted-light">{items.length} {items.length === 1 ? "record" : "records"}</span></div>
            <ul className="divide-y divide-line-soft">
              {items.map((item) => {
                const active = selectedId === item.id;
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => setSelectedId(item.id)} aria-pressed={active} className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-panel ${active ? "bg-panel-deep" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11.5px] font-semibold text-ink">{item.commitSha ? short(item.commitSha, 10, 8) : "No commit SHA"}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${item.verificationState === "user_asserted" ? "bg-emerald-100 text-emerald-800" : "bg-chip text-muted"}`}>{item.verificationState === "user_asserted" ? "Asserted" : "Unverified"}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted">{item.repositoryUrl || <NotProvided />}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] text-muted">
                        <span className="rounded bg-panel-deep px-1.5 py-0.5 font-mono">{item.artifactDigest ? digestShort(item.artifactDigest) : "no artifact digest"}</span>
                        <span className="rounded bg-panel-deep px-1.5 py-0.5">{item.deployService || "no service"}</span>
                        <span className="rounded bg-panel-deep px-1.5 py-0.5">{item.deployEnvironment || "not deployed"}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {selected ? (
            <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-bold text-ink">Evidence chain</h2>
                    <span className="rounded-full bg-chip px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">Manual</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${selected.verificationState === "user_asserted" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{selected.verificationState === "user_asserted" ? "User-asserted" : "Unverified"}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{selected.verificationState === "user_asserted" ? "A human asserted this chain by hand — no cryptographic check was performed." : "Not cryptographically verified — these are values you entered."}</p>
                </div>
                {canWrite ? (
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => openEdit(selected)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-panel hover:text-ink">Edit</button>
                    {canDelete ? <button type="button" onClick={() => remove(selected)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-red-50 hover:text-red-700">Delete</button> : null}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-x-6 gap-y-4 border-t border-line-soft px-5 py-4 sm:grid-cols-2">
                <Group label="Repository">
                  <p className="break-words">{selected.repositoryUrl ? <a href={selected.repositoryUrl.startsWith("git@") ? `https://${selected.repositoryUrl.slice(4).replace(":", "/").replace(/\.git$/, "")}` : selected.repositoryUrl} target="_blank" rel="noreferrer" title={selected.repositoryUrl} className="text-brand-dark underline">{selected.repositoryUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")}</a> : <NotProvided />}</p>
                  <p className="flex items-center gap-1 font-mono text-[10.5px] text-muted"><span className="truncate">commit {selected.commitSha ? short(selected.commitSha, 12, 8) : "not provided"}</span>{selected.commitSha ? <Copy value={selected.commitSha} label="commit SHA" /> : null}</p>
                </Group>
                <Group label="Build">
                  <p>{selected.buildProvider ? <span className="font-semibold">{selected.buildProvider}{selected.buildWorkflow ? ` · ${selected.buildWorkflow}` : ""}</span> : <NotProvided />}{selected.buildRunUrl ? <a href={selected.buildRunUrl} target="_blank" rel="noreferrer" className="ml-2 text-[10.5px] font-semibold text-brand-dark underline">View run</a> : null}</p>
                  <p className="font-mono text-[10.5px] text-muted">{selected.buildRunId ? `run ${selected.buildRunId}` : "run ID not provided"}</p>
                </Group>
                <Group label="SBOM">
                  <p className="break-words">{selected.sbomName ?? <NotProvided />}{selected.sbomFormat ? <span className="text-muted"> · {selected.sbomFormat}</span> : null}</p>
                  {selected.sbomSerialNumber ? <p className="truncate font-mono text-[10px] text-muted" title={selected.sbomSerialNumber}>serial {selected.sbomSerialNumber}</p> : null}
                  <p className="text-[10.5px] text-muted">{selected.sbomGeneratedAt ? new Date(selected.sbomGeneratedAt).toLocaleString() : "generated timestamp not provided"}</p>
                  <p className="flex items-center gap-1 font-mono text-[10px] text-muted"><span className="truncate" title={selected.sbomDigest ?? undefined}>{selected.sbomDigest ? digestShort(selected.sbomDigest) : "digest not provided"}</span>{selected.sbomDigest ? <Copy value={selected.sbomDigest} label="SBOM digest" /> : null}</p>
                </Group>
                <Group label="Artifact">
                  <p className="break-words">{selected.artifactName ?? <NotProvided />}</p>
                  <p className="flex items-center gap-1 font-mono text-[10px] text-muted"><span className="truncate" title={selected.artifactDigest ?? undefined}>{selected.artifactDigest ? digestShort(selected.artifactDigest) : "digest not provided"}</span>{selected.artifactDigest ? <Copy value={selected.artifactDigest} label="artifact digest" /> : null}</p>
                </Group>
                <Group label="Deployment">
                  <p>{selected.deployService ?? <NotProvided>service</NotProvided>}{selected.deployEnvironment ? <span className="text-muted"> · {selected.deployEnvironment}</span> : null}{selected.deployRegion ? <span className="text-muted"> · {selected.deployRegion}</span> : null}</p>
                  <p className="text-[10.5px] text-muted">{selected.deployAt ? new Date(selected.deployAt).toLocaleString() : "deployed timestamp not provided"}</p>
                </Group>
                <Group label="Linked scan">
                  {selected.scan ? <p><Link href={`/scans/${selected.scan.id}`} className="font-semibold text-brand-dark underline">Scan {selected.scan.id.slice(-8)} · {selected.scan.status}</Link><span className="ml-2 text-[10.5px] text-muted">{new Date(selected.scan.createdAt).toLocaleString()}</span></p> : <p className="text-muted">No scan linked — impact stays unverified.</p>}
                </Group>
              </div>

              <div className="border-t border-line-soft px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Provenance attestation</p>
                  <div className="flex items-center gap-2">
                    {selected.attestation && canDelete ? <button type="button" onClick={() => void removeAttestation()} disabled={attestationBusy} className="rounded-md px-2 py-1 text-[10.5px] font-semibold text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-50">Remove</button> : null}
                    {canWrite ? <button type="button" onClick={() => attestationInputRef.current?.click()} disabled={attestationBusy} className="rounded-md border border-line px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-panel disabled:opacity-50">{attestationBusy ? "Parsing…" : selected.attestation ? "Replace attestation" : "Upload attestation"}</button> : null}
                    {canWrite ? <input ref={attestationInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttestation(file); }} /> : null}
                  </div>
                </div>
                {attestationError ? <p role="alert" className="mt-2 text-[11px] text-red-700">{attestationError}</p> : null}
                {!selected.attestation ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">No attestation registered. Optional — upload a standard SLSA provenance file (in-toto Statement, optionally DSSE-wrapped). <strong className="text-ink">Parsing only: SupplyGuard never verifies signatures.</strong></p>
                ) : (
                  <AttestationBody attestation={selected.attestation} artifactDigest={selected.artifactDigest} />
                )}
              </div>

              {selected.note ? (
                <div className="border-t border-line-soft px-5 py-3">
                  <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Note</p>
                  <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">{selected.note}</p>
                </div>
              ) : null}
            </section>
          ) : <section className="rounded-xl border border-line bg-surface p-6 text-[12.5px] text-muted">Select an entry to see its chain.</section>}
        </div>
      )}

      {dialogOpen ? (
        <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialogOpen(false); }} className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="evidence-dialog-title" className="text-lg font-bold text-ink">{editing ? "Edit release evidence" : "Register release evidence"}</h2>
                <p className="mt-1 text-[11px] text-muted">Source is <strong>Manual</strong> — these are values you entered, not cryptographically verified. Leave anything unknown blank; it stays “Not provided”.</p>
              </div>
              <button type="button" onClick={() => setDialogOpen(false)} aria-label="Close dialog" className="text-muted hover:text-ink"><XIcon className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-5">
              <FormSection title="Source">
                <Field label="Repository URL"><input type="url" value={form.repositoryUrl ?? ""} onChange={(e) => setForm({ ...form, repositoryUrl: e.target.value || null })} placeholder="https://github.com/org/repo(.git)" className={inputCls} /></Field>
                <Field label="Commit SHA"><input value={form.commitSha ?? ""} onChange={(e) => setForm({ ...form, commitSha: e.target.value || null })} placeholder="40 or 64 hex characters" className={`${inputCls} font-mono`} /></Field>
                <Field label="Linked scan" className="sm:col-span-2" hint="Optional. Linking a scan records that a human matched this entry to that SBOM; it does not verify the digest."><select value={form.scanJobId ?? ""} onChange={(e) => setForm({ ...form, scanJobId: e.target.value || null })} className={selectCls}><option value="">None</option>{(projects.find((p) => p.id === selectedProjectId)?.scans || []).map((scan) => <option key={scan.id} value={scan.id}>{scan.status} · {new Date(scan.createdAt).toLocaleDateString()}</option>)}</select></Field>
              </FormSection>

              <FormSection title="Build">
                <Field label="Build provider"><input list="providers" value={form.buildProvider ?? ""} onChange={(e) => setForm({ ...form, buildProvider: e.target.value || null })} placeholder="github-actions, manual…" className={inputCls} /><datalist id="providers">{PROVIDER_OPTIONS.map((value) => <option key={value} value={value} />)}</datalist></Field>
                <Field label="Build workflow"><input value={form.buildWorkflow ?? ""} onChange={(e) => setForm({ ...form, buildWorkflow: e.target.value || null })} placeholder="release.yml" className={inputCls} /></Field>
                <Field label="Build run ID"><input value={form.buildRunId ?? ""} onChange={(e) => setForm({ ...form, buildRunId: e.target.value || null })} placeholder="1234567890" className={inputCls} /></Field>
                <Field label="Build run URL"><input type="url" value={form.buildRunUrl ?? ""} onChange={(e) => setForm({ ...form, buildRunUrl: e.target.value || null })} placeholder="https://github.com/org/repo/actions/runs/…" className={inputCls} /></Field>
              </FormSection>

              <FormSection title="SBOM">
                <Field label="SBOM name"><input value={form.sbomName ?? ""} onChange={(e) => setForm({ ...form, sbomName: e.target.value || null })} placeholder="sbom.cdx.json" className={inputCls} /></Field>
                <Field label="SBOM format"><select value={form.sbomFormat ?? ""} onChange={(e) => setForm({ ...form, sbomFormat: e.target.value || null })} className={selectCls}><option value="">Not provided</option>{FORMAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                <Field label="SBOM serial number"><input value={form.sbomSerialNumber ?? ""} onChange={(e) => setForm({ ...form, sbomSerialNumber: e.target.value || null })} placeholder="urn:uuid:…" className={inputCls} /></Field>
                <Field label="SBOM generated"><input type="datetime-local" value={form.sbomGeneratedAt ? form.sbomGeneratedAt.slice(0, 16) : ""} onChange={(e) => setForm({ ...form, sbomGeneratedAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputCls} /></Field>
                <Field label="SBOM digest" htmlFor="sbom-digest" className="sm:col-span-2" hint="Must match the scan's own SBOM digest exactly to count as verified."><input id="sbom-digest" value={form.sbomDigest ?? ""} onChange={(e) => setForm({ ...form, sbomDigest: e.target.value || null })} placeholder="sha256:<64 hex>" className={`${inputCls} font-mono`} /></Field>
              </FormSection>

              <FormSection title="Artifact">
                <Field label="Artifact name"><input value={form.artifactName ?? ""} onChange={(e) => setForm({ ...form, artifactName: e.target.value || null })} placeholder="ghcr.io/org/image" className={inputCls} /></Field>
                <Field label="Artifact digest" htmlFor="artifact-digest" hint="The exact image or package digest that was deployed."><input id="artifact-digest" value={form.artifactDigest ?? ""} onChange={(e) => setForm({ ...form, artifactDigest: e.target.value || null })} placeholder="sha256:<64 hex>" className={`${inputCls} font-mono`} /></Field>
              </FormSection>

              <FormSection title="Deployment">
                <Field label="Deploy service"><input value={form.deployService ?? ""} onChange={(e) => setForm({ ...form, deployService: e.target.value || null })} placeholder="api / web / worker" className={inputCls} /></Field>
                <Field label="Deploy environment"><input list="envs" value={form.deployEnvironment ?? ""} onChange={(e) => setForm({ ...form, deployEnvironment: e.target.value || null })} placeholder="production" className={inputCls} /><datalist id="envs">{ENV_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist></Field>
                <Field label="Deploy region"><input value={form.deployRegion ?? ""} onChange={(e) => setForm({ ...form, deployRegion: e.target.value || null })} placeholder="eu-central-1" className={inputCls} /></Field>
                <Field label="Deployed at"><input type="datetime-local" value={form.deployAt ? form.deployAt.slice(0, 16) : ""} onChange={(e) => setForm({ ...form, deployAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputCls} /></Field>
              </FormSection>

              <FormSection title="Verification">
                <Field label="Verification state" className="sm:col-span-2" hint="Unverified is the honest default. “User-asserted” records that a human checked this chain by hand — no signature is ever verified."><select value={form.verificationState ?? "UNVERIFIED"} onChange={(e) => setForm({ ...form, verificationState: e.target.value as "UNVERIFIED" | "USER_ASSERTED" })} className={selectCls}><option value="UNVERIFIED">Unverified (default)</option><option value="USER_ASSERTED">User-asserted</option></select></Field>
              </FormSection>

              <Field label="Note"><textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value || null })} placeholder="How this evidence was produced, links to change-ticket, etc." className={inputCls} /></Field>
              {formError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800">{formError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg border border-line px-4 py-2 text-[12px] font-semibold text-ink hover:bg-panel">Cancel</button>
                <button type="submit" disabled={busy} className="rounded-lg bg-brand-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Register evidence"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function AttestationBody({ attestation, artifactDigest }: { attestation: ProvenanceAttestation; artifactDigest: string | null }) {
  const match = attestation.subjectMatchesArtifact;
  const matchBadge = match === true
    ? { cls: "bg-emerald-100 text-emerald-800", text: "Subject digest matches the artifact digest" }
    : match === false
      ? { cls: "bg-red-100 text-red-800", text: "Subject digest does NOT match the artifact digest" }
      : { cls: "bg-chip text-muted", text: "No artifact digest registered to compare" };
  const repoLink = attestation.sourceRepoUrl
    ? attestation.sourceRepoUrl.startsWith("git+") ? attestation.sourceRepoUrl.slice(4) : attestation.sourceRepoUrl.startsWith("git@") ? `https://${attestation.sourceRepoUrl.slice(4).replace(":", "/").replace(/\.git$/, "")}` : attestation.sourceRepoUrl
    : null;
  const repoHref = repoLink && /^https?:\/\//.test(repoLink) ? repoLink : null;
  const slsaLabel = attestation.predicateType.endsWith("/v1") ? "SLSA v1" : "SLSA v0.2";
  const statementLabel = attestation.statementType.includes("v0.1") ? "in-toto v0.1" : "in-toto v1";
  const materials = attestation.materials ?? [];
  return (
    <div className="mt-2 space-y-2.5 text-[11px] text-muted">
      <p className="break-all"><span className="font-semibold text-ink">Format</span> · {slsaLabel} · {statementLabel} · {attestation.envelope === "dsse" ? "DSSE envelope" : "in-toto statement"} · payload <span className="font-mono">{attestation.payloadDigest.slice(0, 19)}…</span></p>
      <p className="break-all"><span className="font-semibold text-ink">Subject</span>{attestation.subjectCount > 1 ? `s (${attestation.subjectCount})` : ""} · {attestation.subjectName ?? <NotProvided />}<br /><span className="font-mono text-[10px]">{attestation.subjectDigest ?? "none"}</span>{attestation.subjectDigest ? <Copy value={attestation.subjectDigest} label="subject digest" /> : null}</p>
      <p>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${matchBadge.cls}`}>{matchBadge.text}</span>
        {artifactDigest ? <span className="ml-2 font-mono text-[10px]">vs registered {artifactDigest.slice(0, 23)}…</span> : null}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <p><span className="font-semibold text-ink">Builder</span><br />{attestation.builderId ? <span className="break-all font-mono text-[10px]">{attestation.builderId}</span> : <NotProvided />}</p>
        <p><span className="font-semibold text-ink">Build type</span><br />{attestation.buildType ? <span className="break-all">{attestation.buildType}</span> : <NotProvided />}</p>
        <p><span className="font-semibold text-ink">Build invocation</span><br />{attestation.buildInvocationId ?? <NotProvided />}</p>
        <p><span className="font-semibold text-ink">Started / finished</span><br />{attestation.startedOn ? new Date(attestation.startedOn).toLocaleString() : "Not provided"}{attestation.finishedOn ? ` → ${new Date(attestation.finishedOn).toLocaleString()}` : ""}</p>
      </div>
      <div className="break-all"><span className="font-semibold text-ink">Source repository</span><br />{attestation.sourceRepoUrl ? (repoHref ? <a href={repoHref} target="_blank" rel="noreferrer" className="text-brand-dark underline">{attestation.sourceRepoUrl}</a> : <span className="font-mono text-[10px]">{attestation.sourceRepoUrl}</span>) : <NotProvided />}{attestation.sourceRevision ? <><br /><span className="font-mono text-[10px]">revision {attestation.sourceRevision}</span><Copy value={attestation.sourceRevision} label="source revision" /></> : null}</div>
      {materials.length > 0 ? (
        <div><span className="font-semibold text-ink">Materials ({materials.length})</span><ul className="mt-1 max-h-40 overflow-y-auto font-mono text-[9.5px] text-muted">{materials.slice(0, 8).map((material, index) => (<li key={`${material.uri}-${index}`} className="break-all border-b border-line-soft py-0.5">{material.uri}</li>))}{materials.length > 8 ? <li className="py-0.5 italic">+{materials.length - 8} more</li> : null}</ul></div>
      ) : (
        <p><span className="font-semibold text-ink">Materials</span> · none declared</p>
      )}
      <p className="border-t border-line-soft pt-2"><span className="font-semibold text-ink">Signature</span> · {attestation.signatureCount} recorded · <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-bold uppercase text-amber-800">Unverified</span><br /><span className="text-[10px]">Signature verification is not implemented in SupplyGuard — this attestation was parsed, not cryptographically verified. A matching subject digest proves both documents name the same digest, nothing more.</span></p>
      <p className="text-[9px] text-muted-light">File {attestation.fileName ?? "attestation"} · {attestation.rawBytes} bytes · parsed {new Date(attestation.parsedAt).toLocaleString()} · source: manual upload</p>
    </div>
  );
}
