"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type LicenseDecision, type LicenseFinding } from "@/lib/api";
import { SearchIcon, ScaleIcon } from "@/components/Icons";

export default function LicenseCompliancePage() {
  const [findings, setFindings] = useState<LicenseFinding[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<LicenseFinding | null>(null);
  const [decision, setDecision] = useState<LicenseDecision>("REVIEW");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const loadFindings = useCallback(async () => {
    setLoading(true); setError("");
    try { setFindings((await api.licenses.findings()).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load license findings."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    api.licenses.findings().then(({ items }) => { if (active) setFindings(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load license findings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => findings.filter((finding) => {
    const search = query.trim().toLowerCase();
    const license = finding.observedExpression || "unknown / needs review";
    if (search && !`${finding.component.name} ${finding.component.version} ${license} ${finding.scanJob.project.name}`.toLowerCase().includes(search)) return false;
    if (status !== "all" && finding.decision !== status) return false;
    return true;
  }), [findings, query, status]);

  function openReview(finding: LicenseFinding) {
    setSelected(finding); setDecision(finding.decision); setNote(finding.reviews[0]?.note || ""); setActionError("");
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setActionError(""); setNotice("");
    try {
      const result = await api.licenses.review(selected.id, { decision, note: note.trim() || undefined });
      setFindings((items) => items.map((finding) => finding.id === selected.id ? { ...finding, decision: result.item.decision as LicenseDecision, reviewStatus: String(result.item.reviewStatus), reviews: [{ decision, note: note.trim() || null, createdAt: new Date().toISOString() }] } : finding));
      setNotice(`Review saved for ${selected.component.name}.`);
      setSelected(null);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Review could not be saved."); }
    finally { setSaving(false); }
  }

  const openCount = findings.filter((finding) => finding.decision === "REVIEW" && finding.reviewStatus === "OPEN").length;

  return <div className="flex flex-col gap-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-light"><span>Workspace</span><span>/</span><span className="font-semibold text-ink">License Compliance</span></nav><h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">License Compliance</h1><p className="mt-1 text-[13px] text-muted">Observed package license metadata is evaluated separately against workspace policy.</p></div><Link href="/settings" className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-panel">Manage license policy</Link></header>
    {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2 text-xs text-emerald-800">{notice}</p> : null}
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">License observations</p><p className="mt-1 text-2xl font-bold text-ink">{loading ? "—" : findings.length}</p></div><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Unknown / needs review</p><p className="mt-1 text-2xl font-bold text-amber-800">{loading ? "—" : findings.filter((finding) => !finding.observedExpression).length}</p></div><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Policy review open</p><p className="mt-1 text-2xl font-bold text-ink">{loading ? "—" : openCount}</p></div></section>
    <section className="rounded-xl border border-line bg-surface shadow-xs"><div className="flex flex-col gap-3 border-b border-line-soft p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-ink">License findings</h2><p className="mt-1 text-[11px] text-muted">No license is inferred when registry metadata is missing.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><SearchIcon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-light" /><input suppressHydrationWarning aria-label="Search license findings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search package or license…" className="rounded-lg border border-line py-1.5 pr-2 pl-8 text-xs" /></div><select aria-label="Filter license decision" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs"><option value="all">All decisions</option><option value="REVIEW">Needs review</option><option value="BLOCK">Blocked</option><option value="ALLOW">Allowed</option></select></div></div>
      {loading ? <div role="status" className="p-8 text-center text-sm text-muted">Loading license findings…</div> : error ? <div className="p-6"><p role="alert" className="text-sm text-red-800">{error}</p><button type="button" onClick={() => void loadFindings()} className="mt-3 text-xs font-semibold underline">Retry</button></div> : filtered.length === 0 ? <div className="p-8 text-center"><ScaleIcon className="mx-auto h-8 w-8 text-brand" /><h3 className="mt-3 text-sm font-bold text-ink">{findings.length ? "No matching findings" : "No license findings yet"}</h3><p className="mt-1 text-xs text-muted">{findings.length ? "Adjust the search or decision filter." : "Upload a package-lock.json and complete a scan to create license findings."}</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[12px]"><thead className="bg-panel text-muted"><tr><th className="px-4 py-3 font-semibold">Component</th><th className="px-4 py-3 font-semibold">Project</th><th className="px-4 py-3 font-semibold">Observed license</th><th className="px-4 py-3 font-semibold">Evidence source</th><th className="px-4 py-3 font-semibold">Policy decision</th><th className="px-4 py-3 font-semibold">Review</th><th className="px-4 py-3 font-semibold">Action</th></tr></thead><tbody className="divide-y divide-line-soft">{filtered.map((finding) => <tr id={`license-finding-${finding.id}`} key={finding.id} tabIndex={-1}><td className="px-4 py-3"><span className="font-bold text-ink">{finding.component.name}</span><span className="ml-1 text-muted">{finding.component.version}</span></td><td className="px-4 py-3 text-muted">{finding.scanJob.project.name}</td><td className="px-4 py-3">{finding.observedExpression || <span className="font-semibold text-amber-800">Unknown / needs review</span>}</td><td className="px-4 py-3 text-muted">{finding.observationSource || "No license metadata source"}</td><td className="px-4 py-3"><span className="capitalize">{finding.decision.toLowerCase()}</span>{finding.policyRule ? <span className="ml-1 text-muted">· {finding.policyRule}</span> : null}</td><td className="px-4 py-3 capitalize text-muted">{finding.reviewStatus.toLowerCase()}</td><td className="px-4 py-3"><button type="button" onClick={() => openReview(finding)} className="text-xs font-semibold text-brand-dark underline">Review</button></td></tr>)}</tbody></table></div>}
    </section>
    {selected ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="license-review-title" className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl"><h2 id="license-review-title" className="text-lg font-bold text-ink">Review {selected.component.name}</h2><p className="mt-1 text-xs text-muted">Observed license: {selected.observedExpression || "Unknown / needs review"}. Source: {selected.observationSource || "No source metadata"}.</p><form onSubmit={saveReview} className="mt-5 flex flex-col gap-4"><div><label htmlFor="license-decision" className="block text-xs font-semibold text-ink">Decision</label><select id="license-decision" value={decision} onChange={(event) => setDecision(event.target.value as LicenseDecision)} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm"><option value="REVIEW">Needs review</option><option value="ALLOW">Allow</option><option value="BLOCK">Block</option></select></div><div><label htmlFor="review-note" className="block text-xs font-semibold text-ink">Reviewer note <span className="font-normal text-muted">(optional)</span></label><textarea suppressHydrationWarning id="review-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm" /></div>{actionError ? <p role="alert" className="text-xs text-red-700">{actionError}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Cancel</button><button disabled={saving} className="rounded-lg bg-brand-dark px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save review"}</button></div></form></section></div> : null}
  </div>;
}
