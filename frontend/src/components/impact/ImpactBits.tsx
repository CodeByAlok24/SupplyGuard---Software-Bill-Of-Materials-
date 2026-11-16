"use client";

import type { ImpactEntry, ImpactService, ImpactSlo } from "@/lib/api";

export const IMPACT_STATUS_META: Record<ImpactEntry["status"], { label: string; className: string }> = {
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-800" },
  linked: { label: "Scan-linked", className: "bg-sky-100 text-sky-800" },
  unverified: { label: "Unverified", className: "bg-amber-100 text-amber-800" },
  missing: { label: "Missing", className: "bg-chip text-muted" },
};

export function impactTooltip(impact: ImpactEntry | null | undefined) {
  if (!impact) return "No impact evidence computed for this finding.";
  return `${IMPACT_STATUS_META[impact.status].label} — ${impact.reason}`;
}

export function ImpactChip({ impact }: { impact: ImpactEntry | null | undefined }) {
  if (!impact) return <span className="text-[11px] text-muted">—</span>;
  const meta = IMPACT_STATUS_META[impact.status];
  return (
    <span
      title={impactTooltip(impact)}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
      {impact.stale ? " · stale" : ""}
    </span>
  );
}

export function deploymentText(service: ImpactService) {
  const env = service.environment ?? "Not provided";
  const region = service.region ?? "Not provided";
  return `${service.service ?? "Not provided"} · ${env} · ${region}`;
}

export function shortDigest(digest: string | null | undefined) {
  if (!digest) return null;
  return digest.length > 20 ? `${digest.slice(0, 12)}…${digest.slice(-8)}` : digest;
}

export function dependencyPathText(path: ImpactEntry["dependencyPath"]) {
  if (path.length === 0) return "Unknown path";
  return path.map((step) => `${step.name}@${step.version}`).join(" › ");
}

export function impactTimestamp(impact: ImpactEntry) {
  if (!impact.evidenceUpdatedAt) return "No evidence registered";
  return new Date(impact.evidenceUpdatedAt).toLocaleString();
}

export function errorBudgetLabel(status: ImpactSlo["errorBudget"]["status"]) {
  if (status === "within") return "Within budget";
  if (status === "exhausted") return "Budget exhausted";
  return "Not calculable";
}

export function errorBudgetTone(status: ImpactSlo["errorBudget"]["status"]) {
  if (status === "within") return "bg-emerald-100 text-emerald-800";
  if (status === "exhausted") return "bg-red-100 text-red-800";
  return "bg-chip text-muted";
}

/** Manual SLO context for one registered deployment — shown beside findings, never as severity/verdict input. */
export function SloContextList({ slos }: { slos: ImpactSlo[] }) {
  if (slos.length === 0) {
    return <p className="mt-1 text-[10px] text-muted-light">No manual SLO registered for this service/environment — <a href="/reliability" className="underline">add one</a>.</p>;
  }
  return (
    <ul className="mt-1 space-y-1">
      {slos.map((slo) => (
        <li key={slo.id} className="rounded-md border border-line-soft bg-surface px-2 py-1.5 text-[10px] text-muted">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-ink">{slo.name}</span>
            <span className="rounded-full bg-chip px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-muted">Manual</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-bold ${errorBudgetTone(slo.errorBudget.status)}`}>{errorBudgetLabel(slo.errorBudget.status)}</span>
          </div>
          <p className="mt-0.5">Target {slo.target}% · {slo.indicatorName}{slo.observedValue !== null ? ` · observed ${slo.observedValue}%` : " · observed value not provided"}{slo.windowDays !== null ? ` · window ${slo.windowDays}d` : ""}{slo.observedAt ? ` · ${new Date(slo.observedAt).toLocaleDateString()}` : ""}</p>
          {slo.errorBudget.status !== "not_calculable" ? (
            <p className="mt-0.5">Budget {slo.errorBudget.budgetPercent}% allowed · consumed {slo.errorBudget.consumedPercent}% · remaining {slo.errorBudget.remainingPercent}%{slo.observedValue !== null ? "" : ""}</p>
          ) : (
            <p className="mt-0.5 italic">Error budget not calculable — observed value, window or timestamp missing.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
