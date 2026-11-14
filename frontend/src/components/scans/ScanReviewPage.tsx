"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type GateCheck, type ScanReview } from "@/lib/api";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
  DownloadIcon,
  InfoIcon,
  ScaleIcon,
  ShieldCheckIcon,
  XIcon,
} from "@/components/Icons";

const verdictStyles = {
  READY: { label: "Ready to ship", wrapper: "border-emerald-200 bg-emerald-50", title: "text-emerald-800", icon: CheckCircleIcon },
  REVIEW: { label: "Needs review", wrapper: "border-amber-200 bg-amber-50", title: "text-amber-900", icon: AlertTriangleIcon },
  BLOCKED: { label: "Blocked", wrapper: "border-red-200 bg-red-50", title: "text-red-800", icon: XIcon },
} as const;

const severityStyles: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MODERATE: "bg-amber-100 text-amber-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};

function severityPill(severity: string | null) {
  const label = severity ? severity.toUpperCase() : "UNRATED";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${severityStyles[label] || "bg-chip text-muted"}`}>{label}</span>;
}

function CheckRow({ check }: { check: GateCheck }) {
  const icon = check.status === "pass"
    ? <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
    : check.status === "fail"
      ? <XIcon className="h-4 w-4 text-red-600" />
      : <AlertTriangleIcon className="h-4 w-4 text-amber-600" />;
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink">{check.label}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">{check.detail}</p>
      </div>
    </li>
  );
}

function SectionCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11.5px] text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-[12px] text-muted">{children}</p>;
}

export function ScanReviewPage({ scanId }: { scanId: string }) {
  const [review, setReview] = useState<ScanReview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { item } = await api.scans.review(scanId);
      setReview(item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this scan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api.scans.review(scanId)
      .then(({ item }) => { if (active) { setReview(item); setError(""); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load this scan."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scanId]);

  async function downloadSbom() {
    if (!review) return;
    setNotice("");
    setError("");
    try {
      await api.scans.downloadSbom(review.scan.id);
      setNotice("Download started — check your browser's downloads.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SBOM download failed.");
    }
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  if (loading) {
    return <div role="status" className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">Loading scan review…</div>;
  }

  if (error || !review) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p role="alert" className="text-sm text-red-800">{error || "Could not load this scan."}</p>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={() => void load()} className="text-xs font-semibold text-red-800 underline">Retry</button>
          <Link href="/projects" className="text-xs font-semibold text-red-800 underline">Back to projects</Link>
        </div>
      </div>
    );
  }

  const { scan, gate, remediation, diff, severityCounts, findings } = review;
  const verdict = verdictStyles[gate.verdict];
  const VerdictIcon = verdict.icon;
  const completed = scan.status === "completed";
  const fixable = remediation.filter((item) => item.fixedVersion).length;
  const pathLabel = (item: ScanReview["remediation"][number]) => item.direct || item.path.length <= 1
    ? "Direct dependency"
    : item.path.map((step) => `${step.name}@${step.version}`).join(" → ");
  const inaccessibleOsv = scan.integrations.osv.status === "unavailable" || scan.integrations.osv.status === "partial";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-muted-light">
            <span>Workspace</span><span>/</span>
            <Link href="/projects" className="hover:text-brand-dark">Projects</Link><span>/</span>
            <span className="font-semibold text-ink">{scan.project.name}</span><span>/</span>
            <span className="font-semibold text-ink">Release review</span>
          </nav>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Release review</h1>
          <p className="mt-1 text-[13px] text-muted">
            {scan.project.name} · {completed && scan.completedAt ? new Date(scan.completedAt).toLocaleString() : `scan ${scan.status}`} ·{" "}
            {scan.source === "repository" ? `repository ${scan.repositoryUrl || ""}` : scan.uploadName || "uploaded lockfile"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/components?project=${encodeURIComponent(scan.project.id)}`} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink hover:bg-panel">Inspect components</Link>
          <button type="button" onClick={() => void downloadSbom()} disabled={!completed || !scan.counts.components} className="inline-flex items-center gap-2 rounded-lg bg-brand-dark px-4 py-2 text-[12px] font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50">
            <DownloadIcon className="h-3.5 w-3.5" /> Download SBOM
          </button>
        </div>
      </header>

      {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">{notice}</p> : null}

      {!completed ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><ClockIcon className="h-4 w-4 text-brand" /> This scan is {scan.status}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            {scan.stage ? `Current stage: ${scan.stage}. ` : ""}The release verdict and fix plan appear when the worker finishes and the SBOM is stored.
          </p>
          <Link href="/scanner" className="mt-3 inline-block text-xs font-semibold text-brand-dark underline">Open SBOM Scanner</Link>
        </section>
      ) : (
        <>
          <section className={`rounded-xl border p-5 ${verdict.wrapper}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface/70"><VerdictIcon className="h-5 w-5" /></span>
                <div>
                  <p className={`text-[18px] font-bold ${verdict.title}`}>{verdict.label}</p>
                  <p className="mt-1 max-w-2xl text-[12px] text-muted">{gate.note}</p>
                </div>
              </div>
              <div className="flex gap-3 text-center">
                <div className="rounded-lg bg-surface/70 px-3 py-2"><p className="text-lg font-bold text-ink">{fixable}</p><p className="text-[10px] font-semibold text-muted">fixable</p></div>
                <div className="rounded-lg bg-surface/70 px-3 py-2"><p className="text-lg font-bold text-ink">{remediation.length}</p><p className="text-[10px] font-semibold text-muted">vulnerable packages</p></div>
                <div className="rounded-lg bg-surface/70 px-3 py-2"><p className="text-lg font-bold text-ink">{findings.licenses.filter((item) => item.decision === "REVIEW").length}</p><p className="text-[10px] font-semibold text-muted">license decisions</p></div>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            <SectionCard title="Gate checks" subtitle="Fixed rules, applied to this scan's stored results.">
              <ul className="divide-y divide-line-soft px-5">
                {gate.checks.map((check) => <CheckRow key={check.id} check={check} />)}
              </ul>
            </SectionCard>

            <SectionCard title="At a glance" subtitle="Everything below comes from this scan, not the latest workspace state.">
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 lg:grid-cols-2">
                {[
                  { label: "Components", value: scan.counts.components, icon: CubeIcon },
                  { label: "OSV findings", value: scan.counts.vulnerabilities, icon: AlertTriangleIcon },
                  { label: "License reviews", value: scan.counts.licenseReview, icon: ScaleIcon },
                  { label: "CycloneDX", value: completed ? "Ready" : "—", icon: ShieldCheckIcon },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-line-soft bg-panel p-3">
                    <metric.icon className="h-4 w-4 text-brand" />
                    <p className="mt-2 text-xl font-bold text-ink">{typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</p>
                    <p className="text-[10.5px] font-semibold text-muted">{metric.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 px-5 pb-4">
                {severityCounts.critical ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">{severityCounts.critical} critical</span> : null}
                {severityCounts.high ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">{severityCounts.high} high</span> : null}
                {severityCounts.moderate ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{severityCounts.moderate} moderate</span> : null}
                {severityCounts.low ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">{severityCounts.low} low</span> : null}
                {severityCounts.unknown ? <span className="rounded-full bg-chip px-2 py-0.5 text-[10px] font-bold text-muted">{severityCounts.unknown} unrated</span> : null}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Fix plan"
            subtitle="Upgrade targets are the lowest versions that clear every OSV advisory recorded for each package."
            action={<Link href="/vulnerabilities" className="text-xs font-semibold text-brand-dark">All findings</Link>}
          >
            {remediation.length === 0 ? (
              <EmptyLine>
                {inaccessibleOsv
                  ? `No findings were recorded, but OSV did not complete (${scan.integrations.osv.error || scan.integrations.osv.status}). Treat this as unknown, not clean.`
                  : "No vulnerable packages were found in this scan."}
              </EmptyLine>
            ) : (
              <ul className="divide-y divide-line-soft">
                {remediation.map((item) => (
                  <li key={item.componentId} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-ink">{item.name}<span className="ml-1 font-normal text-muted">@{item.version}</span></p>
                        <p className="mt-0.5 break-words text-[11px] text-muted">
                          {item.direct ? "Direct dependency" : <>via {pathLabel(item)}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {severityPill(item.severity)}
                        {item.fixedVersion ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <ArrowRightIcon className="h-3 w-3" /> {item.fixedVersion}
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">No published fix</span>
                        )}
                        {item.fixedVersion && item.version.split(".")[0] !== item.fixedVersion.split(".")[0] ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">major upgrade</span> : null}
                      </div>
                    </div>
                    <p className="mt-2 text-[11.5px] text-muted">
      <span>{item.advisories.length} {item.advisories.length === 1 ? "advisory" : "advisories"}: {item.advisories.slice(0, 2).map((advisory) => advisory.osvId).join(", ")}{item.advisories.length > 2 ? ` +${item.advisories.length - 2} more` : ""}</span>
                    </p>
                    {item.command ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded-md bg-ink px-2.5 py-1.5 font-mono text-[11px] text-surface">{item.command}</code>
                        <button type="button" onClick={() => void copyCommand(item.command as string)} className="rounded-md border border-line px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-panel">
                          {copied === item.command ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Change review" subtitle="Compared with the previous completed scan of this project.">
            {!diff ? (
              <EmptyLine>This is the first completed scan for {scan.project.name}, so there is nothing to compare yet. The next scan will show new and resolved findings here.</EmptyLine>
            ) : (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { label: "New advisories", value: diff.vulnerabilities.added.length, tone: diff.vulnerabilities.added.length ? "text-red-700" : "text-ink" },
                    { label: "Resolved advisories", value: diff.vulnerabilities.resolved.length, tone: diff.vulnerabilities.resolved.length ? "text-emerald-700" : "text-ink" },
                    { label: "Added packages", value: diff.components.added.length, tone: "text-ink" },
                    { label: "Upgraded packages", value: diff.components.upgraded.length, tone: "text-ink" },
                    { label: "Removed packages", value: diff.components.removed.length, tone: "text-ink" },
                  ].map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-line-soft p-3">
                      <p className={`text-xl font-bold ${metric.tone}`}>{metric.value}</p>
                      <p className="text-[10.5px] font-semibold text-muted">{metric.label}</p>
                    </div>
                  ))}
                </div>

                {diff.vulnerabilities.added.length ? (
                  <div>
                    <h3 className="text-[11px] font-bold tracking-wide text-red-700 uppercase">New since last scan</h3>
                    <ul className="mt-2 space-y-1">
                      {diff.vulnerabilities.added.slice(0, 8).map((item) => (
                        <li key={`${item.osvId}-${item.component}@${item.version}`} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                          <a href={`https://osv.dev/vulnerability/${encodeURIComponent(item.osvId)}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-dark underline">{item.osvId}</a>
                          <span className="text-muted">{item.component}@{item.version}</span>
                          {severityPill(item.severity)}
                        </li>
                      ))}
                    </ul>
                    {diff.vulnerabilities.added.length > 8 ? <p className="mt-1 text-[11px] text-muted">+{diff.vulnerabilities.added.length - 8} more</p> : null}
                  </div>
                ) : null}

                {diff.vulnerabilities.resolved.length ? (
                  <div>
                    <h3 className="text-[11px] font-bold tracking-wide text-emerald-700 uppercase">Resolved since last scan</h3>
                    <ul className="mt-2 space-y-1">
                      {diff.vulnerabilities.resolved.slice(0, 8).map((item) => (
                        <li key={`${item.osvId}-${item.component}@${item.version}`} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                          <a href={`https://osv.dev/vulnerability/${encodeURIComponent(item.osvId)}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-dark underline">{item.osvId}</a>
                          <span className="text-muted">{item.component}@{item.version}</span>
                        </li>
                      ))}
                    </ul>
                    {diff.vulnerabilities.resolved.length > 8 ? <p className="mt-1 text-[11px] text-muted">+{diff.vulnerabilities.resolved.length - 8} more</p> : null}
                  </div>
                ) : null}

                {diff.components.upgraded.length ? (
                  <div>
                    <h3 className="text-[11px] font-bold tracking-wide text-ink uppercase">Version changes</h3>
                    <ul className="mt-2 space-y-1 text-[11.5px]">
                      {diff.components.upgraded.slice(0, 10).map((item) => (
                        <li key={item.name} className="text-muted"><span className="font-semibold text-ink">{item.name}</span>: {item.from} → {item.to}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {diff.licenseChanges.length ? (
                  <div>
                    <h3 className="text-[11px] font-bold tracking-wide text-ink uppercase">License metadata changed</h3>
                    <ul className="mt-2 space-y-1 text-[11.5px]">
                      {diff.licenseChanges.slice(0, 8).map((item) => (
                        <li key={item.name} className="text-muted"><span className="font-semibold text-ink">{item.name}</span>: {item.from || "unknown"} → {item.to || "unknown"}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!diff.vulnerabilities.added.length && !diff.vulnerabilities.resolved.length && !diff.components.added.length && !diff.components.removed.length && !diff.components.upgraded.length && !diff.licenseChanges.length ? (
                  <p className="rounded-lg bg-panel p-3 text-[12px] text-muted">No dependency or advisory changes since the previous scan.</p>
                ) : null}

                <p className="text-[10.5px] text-muted-light">
                  Previous scan: <Link href={`/scans/${diff.previousScanId}`} className="font-semibold text-brand-dark underline">{diff.previousScanId.slice(0, 10)}…</Link>
                  {diff.previousCompletedAt ? ` · ${new Date(diff.previousCompletedAt).toLocaleString()}` : ""}
                </p>
              </div>
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Vulnerability findings" subtitle={inaccessibleOsv ? "OSV did not complete; absence of findings is not proof of safety." : "Severity and fix data are read from OSV advisories."} action={<Link href="/vulnerabilities" className="text-xs font-semibold text-brand-dark">Open</Link>}>
              {findings.vulnerabilities.length === 0 ? (
                <EmptyLine>{inaccessibleOsv ? "No findings were recorded because OSV did not finish." : "OSV returned no advisories for this scan."}</EmptyLine>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-[11.5px]">
                    <thead className="bg-panel text-muted"><tr><th className="px-4 py-2.5 font-semibold">Advisory</th><th className="px-4 py-2.5 font-semibold">Package</th><th className="px-4 py-2.5 font-semibold">Severity</th></tr></thead>
                    <tbody className="divide-y divide-line-soft">
                      {findings.vulnerabilities.slice(0, 30).map((finding) => (
                        <tr key={finding.id}>
                          <td className="px-4 py-2.5"><a href={`https://osv.dev/vulnerability/${encodeURIComponent(finding.osvId)}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-dark underline">{finding.osvId}</a></td>
                          <td className="px-4 py-2.5"><span className="font-semibold text-ink">{finding.component.name}</span><span className="ml-1 text-muted">{finding.component.version}</span></td>
                          <td className="px-4 py-2.5">{severityPill(finding.severity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {findings.vulnerabilities.length > 30 ? <p className="px-4 py-2 text-[10.5px] text-muted">Showing 30 of {findings.vulnerabilities.length}. Open the Vulnerabilities page for the full list.</p> : null}
                </div>
              )}
            </SectionCard>

            <SectionCard title="License decisions" subtitle="Policy verdicts recorded for this scan." action={<Link href="/licenses" className="text-xs font-semibold text-brand-dark">Open</Link>}>
              {findings.licenses.length === 0 ? (
                <EmptyLine>No license findings were recorded for this scan.</EmptyLine>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {findings.licenses.slice(0, 12).map((finding) => (
                    <li key={finding.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-ink">{finding.component.name}<span className="ml-1 font-normal text-muted">{finding.component.version}</span></p>
                        <p className="text-[10.5px] text-muted">{finding.observedExpression || "Unknown / needs review"} · {finding.observationSource || "no source"}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${finding.decision === "BLOCK" ? "bg-red-100 text-red-800" : finding.decision === "ALLOW" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{finding.decision}</span>
                    </li>
                  ))}
                </ul>
              )}
              {findings.licenses.length > 12 ? <p className="px-5 py-2 text-[10.5px] text-muted">Showing 12 of {findings.licenses.length}. Review the rest on the License Compliance page.</p> : null}
            </SectionCard>
          </div>

          <section className="rounded-xl border border-line-soft bg-panel p-4">
            <p className="flex items-start gap-2 text-[11px] text-muted">
              <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Honest limits: OSV covers known advisories only. A &ldquo;Ready&rdquo; verdict means no known high or critical advisories and no blocked licenses at scan time — it does not prove the code is safe. License decisions reflect your workspace policy, not legal advice. Stored results are a snapshot; the OSV database changes after the scan.
              </span>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
