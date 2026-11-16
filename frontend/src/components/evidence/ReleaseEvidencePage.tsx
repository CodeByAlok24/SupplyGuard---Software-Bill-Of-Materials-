"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ReleaseEvidence, type ReleaseEvidenceInput, type Project, type WorkspaceRole, type ProvenanceAttestation } from "@/lib/api";
import { CopyIcon, CheckIcon, FileTextIcon, ShieldCheckIcon, XIcon } from "@/components/Icons";

const SOURCE_LABEL = "Manual";
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

function Field({ label, htmlFor, required, children }: { label: string; htmlFor?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold text-ink">
        {label} {required ? <span className="text-muted-light">(required)</span> : null}
      </label>
      <div className="mt-1">{children}</div>
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-light"><span>Workspace</span><span>/</span><span className="text-ink">Release evidence</span></nav>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Release evidence</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">Manually registered chain links — repository → build → SBOM → artifact → deployment — and the verification state of those links. Source is always <strong>Manual</strong>; nothing here is inferred or verified automatically.</p>
        </div>
        {canWrite && ready ? <button type="button" onClick={() => openCreate()} className="w-fit shrink-0 rounded-lg bg-brand-dark px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep">Add evidence</button> : null}
      </header>

      {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-[12px] text-emerald-800">{notice}</p> : null}
      {error && !dialogOpen ? <div className="rounded-lg bg-red-50 px-4 py-3"><p role="alert" className="text-[12.5px] text-red-800">{error}</p><button type="button" onClick={() => selectedProjectId ? loadEvidence(selectedProjectId) : load()} className="mt-2 text-xs font-semibold text-red-800 underline">Retry</button></div> : null}

      {projects.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="evidence-project" className="text-[12px] font-semibold text-muted">Project</label>
          <select id="evidence-project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px]">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        </div>
      ) : null}

      {!canWrite && ready ? (
        <p className="flex items-start gap-2 rounded-lg bg-panel-deep px-3 py-2.5 text-[11.5px] text-muted"><ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Your role is <strong>{role.toLowerCase()}</strong> — read-only. Ask a workspace owner or administrator to add or edit evidence.</p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Entries</p><p className="mt-1 text-2xl font-bold text-ink">{items === null ? "—" : items.length}</p></div>
        <div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">With artifact/SBOM digest</p><p className="mt-1 text-2xl font-bold text-ink">{items === null ? "—" : verifiedCount}</p></div>
        <div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Full chain recorded</p><p className="mt-1 text-2xl font-bold text-ink">{items === null ? "—" : fullChainCount}</p></div>
      </section>

      {!ready || loadedProjectId !== selectedProjectId || items === null ? (
        <div role="status" className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{!ready ? "Checking your workspace…" : "Loading release evidence…"}</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <FileTextIcon className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-3 text-sm font-bold text-ink">No projects yet</h2>
          <p className="mt-1 text-xs text-muted">Create a project and run a scan first — evidence entries link its artifact digest to deployments.</p>
          {ready ? <Link href="/projects" className="mt-4 inline-block rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">Go to Projects</Link> : null}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <FileTextIcon className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-3 text-sm font-bold text-ink">No release evidence yet</h2>
          <p className="mt-1 text-xs text-muted">Record a manual entry linking a repository commit, build, SBOM and artifact to a deployment. Every field is optional — missing values stay marked “Not provided”.</p>
          {canWrite ? <button type="button" onClick={() => openCreate()} className="mt-4 rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">Add the first entry</button> : null}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
          <section className="rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3"><h2 className="text-sm font-bold text-ink">Evidence entries</h2><span className="text-[11px] text-muted">{items.length} {items.length === 1 ? "entry" : "entries"}</span></div>
            <ul className="divide-y divide-line-soft">
              {items.map((item) => {
                const active = selectedId === item.id;
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => setSelectedId(item.id)} aria-pressed={active} className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-panel ${active ? "bg-panel" : ""}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[11.5px] font-semibold text-ink">{item.commitSha ? short(item.commitSha, 10, 8) : "No commit SHA"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${item.verificationState === "user_asserted" ? "bg-emerald-100 text-emerald-800" : "bg-chip text-muted"}`}>{item.verificationState === "user_asserted" ? "Asserted" : "Unverified"}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted">{item.repositoryUrl || <NotProvided />}</p>
                      <p className="truncate font-mono text-[10.5px] text-muted-light">{item.artifactDigest ? digestShort(item.artifactDigest) : "No artifact digest"} · {item.deployEnvironment || <NotProvided>not deployed</NotProvided>}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {selected ? (
            <section className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft pb-4">
                <div>
                  <h2 className="text-sm font-bold text-ink">Evidence chain</h2>
                  <p className="mt-1 text-[11px] text-muted">{SOURCE_LABEL} · {selected.verificationState === "user_asserted" ? "User-asserted (a human checked this off-network)" : "Unverified — no cryptographic check was performed"}</p>
                </div>
                {canWrite ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => openEdit(selected)} className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-panel">Edit</button>
                    {canDelete ? <button type="button" onClick={() => remove(selected)} className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50">Delete</button> : null}
                  </div>
                ) : null}
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-4 text-[12px] sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Source repository</dt>
                  <dd className="mt-0.5 break-all text-ink">{selected.repositoryUrl ? <a href={selected.repositoryUrl.startsWith("git@") ? `https://${selected.repositoryUrl.slice(4).replace(":", "/").replace(/\.git$/, "")}` : selected.repositoryUrl} target="_blank" rel="noreferrer" className="text-brand-dark underline">{selected.repositoryUrl}</a> : <NotProvided />}</dd>
                  <dd className="mt-1 font-mono text-[11px] text-muted">commit {selected.commitSha ?? <NotProvided />}{selected.commitSha ? <Copy value={selected.commitSha} label="commit SHA" /> : null}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Build</dt>
                  <dd className="mt-0.5 text-ink">{selected.buildProvider ? <span className="font-semibold">{selected.buildProvider}{selected.buildWorkflow ? ` · ${selected.buildWorkflow}` : ""}</span> : <NotProvided />}{selected.buildRunId ? <span className="text-muted"> · run {selected.buildRunId}</span> : null}{selected.buildRunUrl ? <a href={selected.buildRunUrl} target="_blank" rel="noreferrer" className="ml-2 text-[11px] font-semibold text-brand-dark underline">View run</a> : null}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">SBOM</dt>
                  <dd className="mt-0.5 text-ink">{selected.sbomName ?? <NotProvided />}{selected.sbomFormat ? <span className="text-muted"> · {selected.sbomFormat}</span> : null}{selected.sbomSerialNumber ? <span className="text-muted"> · serial {selected.sbomSerialNumber}</span> : null}</dd>
                  <dd className="mt-1 text-[11px] text-muted">{selected.sbomGeneratedAt ? new Date(selected.sbomGeneratedAt).toLocaleString() : <NotProvided>generated timestamp</NotProvided>}</dd>
                  <dd className="mt-0.5 break-all font-mono text-[10.5px] text-muted">digest {selected.sbomDigest ?? <NotProvided />}{selected.sbomDigest ? <Copy value={selected.sbomDigest} label="SBOM digest" /> : null}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Artifact</dt>
                  <dd className="mt-0.5 text-ink">{selected.artifactName ?? <NotProvided />}</dd>
                  <dd className="mt-1 break-all font-mono text-[10.5px] text-muted">{selected.artifactDigest ?? <NotProvided>image/package digest</NotProvided>}{selected.artifactDigest ? <Copy value={selected.artifactDigest} label="artifact digest" /> : null}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Deployment</dt>
                  <dd className="mt-0.5 text-ink">{selected.deployService ?? <NotProvided>service</NotProvided>}{selected.deployEnvironment ? <span className="text-muted"> · {selected.deployEnvironment}</span> : null}{selected.deployRegion ? <span className="text-muted"> · {selected.deployRegion}</span> : null}</dd>
                  <dd className="mt-1 text-[11px] text-muted">{selected.deployAt ? new Date(selected.deployAt).toLocaleString() : <NotProvided>deployed timestamp</NotProvided>}</dd>
                </div>
                <div className="sm:col-span-2 rounded-lg border border-line-soft bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Provenance attestation</dt>
                    <div className="flex items-center gap-2">
                      {selected.attestation && canDelete ? <button type="button" onClick={() => void removeAttestation()} disabled={attestationBusy} className="rounded-md border border-line px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Remove</button> : null}
                      {canWrite ? <button type="button" onClick={() => attestationInputRef.current?.click()} disabled={attestationBusy} className="rounded-md border border-line px-2 py-1 text-[10px] font-semibold text-ink hover:bg-surface disabled:opacity-50">{attestationBusy ? "Parsing…" : selected.attestation ? "Replace attestation" : "Upload attestation"}</button> : null}
                      {canWrite ? <input ref={attestationInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttestation(file); }} /> : null}
                    </div>
                  </div>
                  {attestationError ? <p role="alert" className="mt-2 text-[11px] text-red-700">{attestationError}</p> : null}
                  {!selected.attestation ? (
                    <p className="mt-2 text-[11px] text-muted">No attestation registered. Optional — upload a standard SLSA provenance file (in-toto Statement, optionally DSSE-wrapped). <strong>Parsing only: SupplyGuard never verifies signatures.</strong></p>
                  ) : (
                    <AttestationBody attestation={selected.attestation} artifactDigest={selected.artifactDigest} />
                  )}
                </div>
                {selected.scan ? (
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Linked scan</dt>
                    <dd className="mt-0.5"><Link href={`/scans/${selected.scan.id}`} className="font-semibold text-brand-dark underline">Scan {selected.scan.id.slice(-8)} · {selected.scan.status}</Link><span className="ml-2 text-[10.5px] text-muted">{new Date(selected.scan.createdAt).toLocaleString()}</span></dd>
                  </div>
                ) : null}
                {selected.note ? (
                  <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Note</dt><dd className="mt-0.5 whitespace-pre-wrap text-ink">{selected.note}</dd></div>
                ) : null}
              </dl>
            </section>
          ) : <section className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">Select an entry to see its chain.</section>}
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
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Build provider"><input list="providers" value={form.buildProvider ?? ""} onChange={(e) => setForm({ ...form, buildProvider: e.target.value || null })} placeholder="github-actions, manual…" className={inputCls} /><datalist id="providers">{PROVIDER_OPTIONS.map((value) => <option key={value} value={value} />)}</datalist></Field>
                <Field label="Build workflow"><input value={form.buildWorkflow ?? ""} onChange={(e) => setForm({ ...form, buildWorkflow: e.target.value || null })} placeholder="release.yml" className={inputCls} /></Field>
                <Field label="Build run ID"><input value={form.buildRunId ?? ""} onChange={(e) => setForm({ ...form, buildRunId: e.target.value || null })} placeholder="1234567890" className={inputCls} /></Field>
                <Field label="Repository URL"><input type="url" value={form.repositoryUrl ?? ""} onChange={(e) => setForm({ ...form, repositoryUrl: e.target.value || null })} placeholder="https://github.com/org/repo(.git)" className={inputCls} /></Field>
                <Field label="Commit SHA"><input value={form.commitSha ?? ""} onChange={(e) => setForm({ ...form, commitSha: e.target.value || null })} placeholder="40 or 64 hex characters" className={`${inputCls} font-mono`} /></Field>
                <Field label="Build run URL"><input type="url" value={form.buildRunUrl ?? ""} onChange={(e) => setForm({ ...form, buildRunUrl: e.target.value || null })} placeholder="https://github.com/org/repo/actions/runs/…" className={inputCls} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="SBOM name"><input value={form.sbomName ?? ""} onChange={(e) => setForm({ ...form, sbomName: e.target.value || null })} placeholder="sbom.cdx.json" className={inputCls} /></Field>
                <Field label="SBOM format"><select value={form.sbomFormat ?? ""} onChange={(e) => setForm({ ...form, sbomFormat: e.target.value || null })} className={selectCls}><option value="">Not provided</option>{FORMAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                <Field label="SBOM serial number"><input value={form.sbomSerialNumber ?? ""} onChange={(e) => setForm({ ...form, sbomSerialNumber: e.target.value || null })} placeholder="urn:uuid:…" className={inputCls} /></Field>
                <Field label="SBOM generated"><input type="datetime-local" value={form.sbomGeneratedAt ? form.sbomGeneratedAt.slice(0, 16) : ""} onChange={(e) => setForm({ ...form, sbomGeneratedAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputCls} /></Field>
                <Field label="SBOM digest" htmlFor="sbom-digest"><input id="sbom-digest" value={form.sbomDigest ?? ""} onChange={(e) => setForm({ ...form, sbomDigest: e.target.value || null })} placeholder="sha256:<64 hex>" className={`${inputCls} font-mono`} /></Field>
                <Field label="Artifact name"><input value={form.artifactName ?? ""} onChange={(e) => setForm({ ...form, artifactName: e.target.value || null })} placeholder="ghcr.io/org/image" className={inputCls} /></Field>
                <Field label="Artifact digest" htmlFor="artifact-digest"><input id="artifact-digest" value={form.artifactDigest ?? ""} onChange={(e) => setForm({ ...form, artifactDigest: e.target.value || null })} placeholder="sha256:<64 hex>" className={`${inputCls} font-mono sm:col-span-2`} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Deploy service"><input value={form.deployService ?? ""} onChange={(e) => setForm({ ...form, deployService: e.target.value || null })} placeholder="api / web / worker" className={inputCls} /></Field>
                <Field label="Deploy environment"><input list="envs" value={form.deployEnvironment ?? ""} onChange={(e) => setForm({ ...form, deployEnvironment: e.target.value || null })} placeholder="production" className={inputCls} /><datalist id="envs">{ENV_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist></Field>
                <Field label="Deploy region"><input value={form.deployRegion ?? ""} onChange={(e) => setForm({ ...form, deployRegion: e.target.value || null })} placeholder="eu-central-1" className={inputCls} /></Field>
                <Field label="Deployed at"><input type="datetime-local" value={form.deployAt ? form.deployAt.slice(0, 16) : ""} onChange={(e) => setForm({ ...form, deployAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputCls} /></Field>
                <Field label="Verification state"><select value={form.verificationState ?? "UNVERIFIED"} onChange={(e) => setForm({ ...form, verificationState: e.target.value as "UNVERIFIED" | "USER_ASSERTED" })} className={selectCls}><option value="UNVERIFIED">Unverified (default)</option><option value="USER_ASSERTED">User-asserted</option></select></Field>
                <Field label="Linked scan"><select value={form.scanJobId ?? ""} onChange={(e) => setForm({ ...form, scanJobId: e.target.value || null })} className={selectCls}><option value="">None</option>{(projects.find((p) => p.id === selectedProjectId)?.scans || []).map((scan) => <option key={scan.id} value={scan.id}>{scan.status} · {new Date(scan.createdAt).toLocaleDateString()}</option>)}</select></Field>
              </div>
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
