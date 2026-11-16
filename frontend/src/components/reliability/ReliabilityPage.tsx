"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type Project, type Slo, type SloInput, type WorkspaceRole } from "@/lib/api";
import { TrendingUpIcon, ShieldCheckIcon, XIcon, InfoIcon } from "@/components/Icons";
import { errorBudgetLabel, errorBudgetTone } from "@/components/impact/ImpactBits";

const ENV_OPTIONS = ["production", "staging", "development", "preview", "internal"];

function emptyForm(): SloInput {
  return { service: "", environment: "", name: "", target: 99.9, indicatorName: "", observedValue: null, windowDays: null, observedAt: null, note: null };
}

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] focus:border-brand focus:outline-none";

function Field({ label, htmlFor, required, hint, children }: { label: string; htmlFor?: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold text-ink">{label} {required ? <span className="text-muted-light">(required)</span> : null}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[10px] text-muted-light">{hint}</p> : null}
    </div>
  );
}

function BudgetBar({ slo }: { slo: Slo }) {
  const budget = slo.errorBudget;
  if (budget.status === "not_calculable") {
    return <p className="rounded-lg bg-panel px-3 py-2 text-[10.5px] text-muted">Error budget not calculable — add an observed value, a window and the observation time.</p>;
  }
  const consumed = Math.min(100, budget.consumedPercent ?? 0);
  const tone = budget.status === "exhausted" ? "bg-red-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Budget consumed</span>
        <span className="text-[12px] font-bold text-ink">{budget.consumedPercent}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-panel-deep" role="img" aria-label={`Error budget ${budget.consumedPercent}% consumed, ${budget.remainingPercent}% remaining`}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${consumed}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9.5px] text-muted-light">
        <span>Allowed {budget.budgetPercent}%</span>
        <span>{budget.remainingPercent}% remaining</span>
      </div>
    </div>
  );
}

export function ReliabilityPage() {
  const [role, setRole] = useState<WorkspaceRole>("VIEWER");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [items, setItems] = useState<Slo[] | null>(null);
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Slo | null>(null);
  const [form, setForm] = useState<SloInput>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const canWrite = role === "OWNER" || role === "ADMIN" || role === "ANALYST";
  const canDelete = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
    let active = true;
    Promise.all([api.projects.list(), api.auth.me()])
      .then(([projectResult, me]) => { if (!active) return; setRole(me.workspace.role); setProjects(projectResult.items); setError(""); setSelectedProjectId((current) => (current && projectResult.items.some((p) => p.id === current) ? current : projectResult.items[0]?.id ?? "")); })
      .catch((reason: unknown) => { if (!active) return; setError(reason instanceof Error ? reason.message : "Could not load workspace."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const loadSlos = useCallback(async (projectId: string) => {
    try {
      const { items: slos } = await api.slo.list(projectId);
      setItems(slos);
      setLoadedProjectId(projectId);
      setError("");
    } catch (reason: unknown) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Could not load SLOs.");
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    let active = true;
    const projectId = selectedProjectId;
    Promise.resolve().then(() => { if (active) void loadSlos(projectId); });
    return () => { active = false; };
  }, [selectedProjectId, loadSlos]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(slo: Slo) {
    setEditing(slo);
    setForm({ service: slo.service, environment: slo.environment, name: slo.name, target: slo.target, indicatorName: slo.indicatorName, observedValue: slo.observedValue, windowDays: slo.windowDays, observedAt: slo.observedAt, note: slo.note });
    setFormError("");
    setDialogOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setBusy(true);
    setFormError("");
    try {
      if (editing) {
        await api.slo.update(editing.id, form);
        setNotice("SLO updated.");
      } else {
        await api.slo.create(selectedProjectId, form);
        setNotice("SLO registered.");
      }
      setDialogOpen(false);
      await loadSlos(selectedProjectId);
    } catch (reason: unknown) {
      setFormError(reason instanceof Error ? reason.message : "Could not save the SLO.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(slo: Slo) {
    if (!window.confirm(`Remove SLO “${slo.name}” for ${slo.service} (${slo.environment})?`)) return;
    setError("");
    setNotice("");
    try {
      await api.slo.remove(slo.id);
      setNotice("SLO removed.");
      await loadSlos(selectedProjectId);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not remove the SLO.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-light"><span>Workspace</span><span>/</span><span className="text-ink">Reliability context</span></nav>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Reliability context</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">Manual SLO records shown beside security findings — never part of their severity or the release verdict. <strong>Nothing here is measured automatically.</strong></p>
        </div>
        {canWrite && ready ? <button type="button" onClick={openCreate} className="w-fit shrink-0 rounded-lg bg-brand-dark px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep">Add SLO</button> : null}
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
          <button type="button" onClick={() => selectedProjectId ? loadSlos(selectedProjectId) : undefined} className="text-[11px] font-semibold text-red-800 underline">Retry</button>
        </div>
      ) : null}

      {!canWrite && ready ? (
        <p className="flex items-start gap-2 rounded-lg bg-panel-deep px-3 py-2 text-[11.5px] text-muted"><ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Your role is <strong>{role.toLowerCase()}</strong> — read-only. Ask a workspace owner or administrator to add or edit SLOs.</p>
      ) : null}

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="slo-project" className="text-[10px] font-bold uppercase tracking-wide text-muted-light">Project</label>
            {projects.length > 1 ? (
              <select id="slo-project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            ) : (
              <span className="text-[12.5px] font-semibold text-ink">{projects[0]?.name ?? "No project"}</span>
            )}
            {items ? <span className="rounded-full bg-chip px-2 py-0.5 text-[10px] font-semibold text-muted">{items.length} SLO{items.length === 1 ? "" : "s"}</span> : null}
          </div>
          <span className="hidden text-[10px] text-muted-light sm:inline">Source: manual entry — no telemetry queried</span>
        </div>
        <details className="border-t border-line-soft px-4 py-2.5 text-[11px] text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden"><InfoIcon className="h-3.5 w-3.5 shrink-0 text-brand" />How error budgets are computed</summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            <p>No OpenTelemetry, Prometheus or CloudWatch provider is configured or queried. Every number below comes from your entry.</p>
            <p className="rounded bg-panel px-2 py-1 font-mono text-[10.5px] text-ink">budget = 100 − target · consumed = (100 − observed) / budget × 100</p>
            <p>Missing or invalid observations show “Not calculable” — never a fabricated number. Nothing here changes vulnerability severity or the release verdict.</p>
          </div>
        </details>
      </div>

      {!ready || loadedProjectId !== selectedProjectId || items === null ? (
        <div role="status" className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{!ready ? "Checking your workspace…" : "Loading SLOs…"}</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <TrendingUpIcon className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-3 text-sm font-bold text-ink">No projects yet</h2>
          <p className="mt-1 text-xs text-muted">Create a project and run a scan first — SLOs attach to the services you register as deployed in Release evidence.</p>
          <Link href="/projects" className="mt-4 inline-block rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">Go to Projects</Link>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <TrendingUpIcon className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-3 text-sm font-bold text-ink">No SLOs registered yet</h2>
          <p className="mt-1 text-xs text-muted">Register the availability or latency objectives for a service you have also registered as deployed in Release evidence. Values are entered manually; nothing is measured automatically.</p>
          {canWrite ? <button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">Add the first SLO</button> : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((slo) => (
            <section key={slo.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[15px] font-bold text-ink">{slo.name}</h2>
                    <span className="rounded-full bg-chip px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">Manual</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${errorBudgetTone(slo.errorBudget.status)}`}>{errorBudgetLabel(slo.errorBudget.status)}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted">
                    <span className="font-semibold text-ink">{slo.service}</span>
                    <span className="mx-1 text-muted-light">·</span>{slo.environment}
                    <span className="mx-1 text-muted-light">·</span><span className="font-mono">{slo.indicatorName}</span>
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => openEdit(slo)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-panel hover:text-ink">Edit</button>
                    {canDelete ? <button type="button" onClick={() => remove(slo)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-red-50 hover:text-red-700">Delete</button> : null}
                  </div>
                ) : null}
              </div>

              <dl className="divide-y divide-line-soft border-y border-line-soft bg-panel/60 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:block sm:py-2.5">
                  <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Target</dt>
                  <dd className="text-[13px] font-bold text-ink sm:mt-0.5">{slo.target}%</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:block sm:py-2.5">
                  <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Observed{slo.windowDays !== null ? ` · ${slo.windowDays}d` : ""}</dt>
                  <dd className={`text-[13px] font-bold sm:mt-0.5 ${slo.observedValue === null ? "text-muted-light" : "text-ink"}`}>{slo.observedValue !== null ? `${slo.observedValue}%` : "Not provided"}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:block sm:py-2.5">
                  <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-light">Last observed</dt>
                  <dd className={`text-[13px] font-bold sm:mt-0.5 ${slo.observedAt ? "text-ink" : "text-muted-light"}`}>{slo.observedAt ? new Date(slo.observedAt).toLocaleDateString() : "Not provided"}</dd>
                </div>
              </dl>

              <div className="flex-1 px-5 py-3.5">
                <BudgetBar slo={slo} />
                {slo.note ? <p className="mt-3 whitespace-pre-wrap border-t border-line-soft pt-2.5 text-[11px] leading-relaxed text-muted">{slo.note}</p> : null}
              </div>

              <p className="flex flex-wrap items-center gap-x-1.5 border-t border-line-soft px-5 py-2 text-[9.5px] text-muted-light">
                <span>Added {new Date(slo.createdAt).toLocaleDateString()}</span>
                {slo.createdBy ? <><span aria-hidden>·</span><span>{slo.createdBy.name}</span></> : null}
                <span aria-hidden>·</span>
                <span>values entered by hand</span>
              </p>
            </section>
          ))}
        </div>
      )}

      {dialogOpen ? (
        <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }} className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="slo-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="slo-dialog-title" className="text-lg font-bold text-ink">{editing ? "Edit SLO" : "Register SLO"}</h2>
                <p className="mt-1 text-[11px] text-muted">Source is <strong>Manual</strong> — SupplyGuard never queries telemetry. Enter what your dashboards or reports show, with the window and timestamp.</p>
              </div>
              <button type="button" onClick={() => setDialogOpen(false)} aria-label="Close dialog" className="text-muted hover:text-ink"><XIcon className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Service" htmlFor="slo-service" required><input id="slo-service" required value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })} placeholder="api" className={inputCls} /></Field>
                <Field label="Environment" htmlFor="slo-env" required><input id="slo-env" required list="slo-envs" value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })} placeholder="production" className={inputCls} /><datalist id="slo-envs">{ENV_OPTIONS.map((value) => <option key={value} value={value} />)}</datalist></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="SLO name" htmlFor="slo-name" required><input id="slo-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Availability" className={inputCls} /></Field>
                <Field label="Indicator name" htmlFor="slo-indicator" required hint="What the number measures, e.g. availability_ratio, p95_latency_ms"><input id="slo-indicator" required value={form.indicatorName} onChange={(event) => setForm({ ...form, indicatorName: event.target.value })} placeholder="availability_ratio" className={inputCls} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Target (%)" htmlFor="slo-target" required hint="Same scale as the observed value — e.g. 99.9"><input id="slo-target" required type="number" min={0.0001} max={100} step="any" value={form.target} onChange={(event) => setForm({ ...form, target: Number(event.target.value) })} className={inputCls} /></Field>
                <Field label="Observed value (%)" htmlFor="slo-observed" hint="Optional. Leave empty to show “Not calculable”"><input id="slo-observed" type="number" min={0} max={100} step="any" value={form.observedValue ?? ""} onChange={(event) => setForm({ ...form, observedValue: event.target.value === "" ? null : Number(event.target.value) })} placeholder="99.95" className={inputCls} /></Field>
                <Field label="Window (days)" htmlFor="slo-window" hint="Required when observed value is set"><input id="slo-window" type="number" min={1} max={365} step={1} value={form.windowDays ?? ""} onChange={(event) => setForm({ ...form, windowDays: event.target.value === "" ? null : Number(event.target.value) })} placeholder="30" className={inputCls} /></Field>
                <Field label="Observed at" htmlFor="slo-observed-at" hint="Required when observed value is set"><input id="slo-observed-at" type="datetime-local" value={form.observedAt ? form.observedAt.slice(0, 16) : ""} onChange={(event) => setForm({ ...form, observedAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className={inputCls} /></Field>
              </div>
              <Field label="Note" htmlFor="slo-note"><textarea id="slo-note" rows={2} value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value || null })} placeholder="Where this number came from — report/dashboard link, who measured it, etc." className={inputCls} /></Field>
              {formError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800">{formError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg border border-line px-4 py-2 text-[12px] font-semibold text-ink hover:bg-panel">Cancel</button>
                <button type="submit" disabled={busy} className="rounded-lg bg-brand-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Register SLO"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
