"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SbomComparisonItem, type SbomUpload } from "@/lib/api";
import { AlertTriangleIcon, CheckCircleIcon, DownloadIcon, ShieldCheckIcon, UploadIcon } from "@/components/Icons";

function coverageTone(score: number) {
  if (score >= 95) return { ring: "border-emerald-200 bg-emerald-50", text: "text-emerald-800" };
  if (score >= 70) return { ring: "border-amber-200 bg-amber-50", text: "text-amber-900" };
  return { ring: "border-red-200 bg-red-50", text: "text-red-800" };
}

function Section({ title, subtitle, tone, children }: { title: string; subtitle: string; tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const toneClass = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-red-700";
  return (
    <section className="rounded-xl border border-line bg-surface shadow-xs">
      <div className="border-b border-line-soft px-5 py-4">
        <h3 className={`text-[13px] font-bold tracking-wide uppercase ${toneClass}`}>{title}</h3>
        <p className="mt-0.5 text-[11.5px] text-muted">{subtitle}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function SbomCoveragePanel({ projectId, scanJobId }: { projectId: string; scanJobId: string | null }) {
  const [uploadsState, setUploadsState] = useState<{ project: string; items: SbomUpload[] | null }>({ project: "", items: null });
  const uploads = projectId && uploadsState.project === projectId ? uploadsState.items : null;
  const [uploading, setUploading] = useState(false);
  const [comparingId, setComparingId] = useState<string | null>(null);
  const [result, setResult] = useState<SbomComparisonItem | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUploads = useCallback(async () => {
    try {
      const { items } = await api.projects.listSbomUploads(projectId);
      setUploadsState({ project: projectId, items });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load SBOM uploads.");
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    api.projects.listSbomUploads(projectId)
      .then(({ items }) => { if (active) setUploadsState({ project: projectId, items }); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load SBOM uploads."); });
    return () => { active = false; };
  }, [projectId]);

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true); setError("");
    try {
      await api.projects.uploadSbom(projectId, file);
      await loadUploads();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The SBOM could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function runComparison(sbomUploadId: string) {
    if (!scanJobId) { setError("Run a completed lockfile scan first — the comparison compares an SBOM against the scan's lockfile results."); return; }
    setComparingId(sbomUploadId); setError("");
    try {
      const { item } = await api.comparisons.create(scanJobId, sbomUploadId);
      setResult(item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The comparison could not be run.");
    } finally {
      setComparingId(null);
    }
  }

  async function downloadReport() {
    if (!result) return;
    setDownloading(true); setError("");
    try { await api.comparisons.downloadReport(result.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not download the report."); }
    finally { setDownloading(false); }
  }

  const tone = result ? coverageTone(result.coverageScore) : null;
  const report = result?.report;

  return (
    <div className="p-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><ShieldCheckIcon className="h-4 w-4 text-brand" /> SBOM coverage</h2>
        <p className="mt-1 text-[12px] text-muted">
          Upload a CycloneDX SBOM for this project and compare it against the lockfile this workspace scanned. The report lists exactly what is missing — components, dependency relationships, and metadata — so consumers of the SBOM know how much they can trust it.
        </p>
        <p className="mt-2 text-[10.5px] text-muted-light">Score formula: matched components ÷ total lockfile components × 100. Matching tries normalized CycloneDX purl, then case-insensitive name@version.</p>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p> : null}

      <div className="mt-4 rounded-xl border border-line bg-surface shadow-xs p-5">
        <h3 className="text-[13px] font-bold text-ink">1. Upload an SBOM</h3>
        <p className="mt-1 text-[11.5px] text-muted">Must be a CycloneDX JSON document (<code>.cdx.json</code>). Maximum 20 MB.</p>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink hover:border-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50">
          <UploadIcon className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload SBOM"}
        </button>
        <input suppressHydrationWarning ref={fileInputRef} type="file" accept=".json,.cdx.json,application/json" className="sr-only" onChange={onUpload} disabled={uploading} />

        {uploads && uploads.length > 0 ? (
          <ul className="mt-4 divide-y divide-line-soft">
            {uploads.map((upload) => (
              <li key={upload.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-ink">{upload.fileName}</p>
                  <p className="text-[10.5px] text-muted">{upload.componentCount} components · {new Date(upload.createdAt).toLocaleString()}</p>
                </div>
                <button type="button" onClick={() => void runComparison(upload.id)} disabled={comparingId === upload.id || !scanJobId} title={!scanJobId ? "A completed scan is required" : undefined} className="rounded-lg bg-brand px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">
                  {comparingId === upload.id ? "Comparing…" : scanJobId ? "Compare with lockfile" : "Scan required"}
                </button>
              </li>
            ))}
          </ul>
        ) : uploads ? <p className="mt-3 text-[12px] text-muted">No SBOM uploaded yet.</p> : null}
      </div>

      {report && tone ? (
        <>
          <div className={`mt-4 rounded-xl border p-5 ${tone.ring}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={`text-[42px] font-bold leading-none ${tone.text}`}>{report.coverageScore}<span className="text-xl">%</span></p>
                <p className="mt-2 text-[12px] text-muted">{report.matchedComponents} of {report.lockfile.componentCount} lockfile components are represented in the SBOM · {report.sbom.componentCount} components in SBOM · {report.sbom.dependencyEdges} dependency edges recorded</p>
                {result?.sbomUpload ? <p className="mt-1 text-[10.5px] text-muted-light">Compared with scan {report.lockfileScanJobId.slice(0, 10)}… against {result.sbomUpload.fileName}</p> : null}
              </div>
              <button type="button" onClick={() => void downloadReport()} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-[11.5px] font-semibold text-white disabled:opacity-50">
                <DownloadIcon className="h-3.5 w-3.5" /> {downloading ? "Downloading…" : "Download report (JSON)"}
              </button>
            </div>
            {report.notes.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] text-muted">
                {report.notes.map((note, index) => <li key={index}>{note}</li>)}
              </ul>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Section title={`Missing components (${report.missingComponents.length})`} subtitle="Lockfile packages absent from the SBOM. Each one is invisible to SBOM consumers." tone={report.missingComponents.length ? "bad" : "ok"}>
              {report.missingComponents.length === 0 ? (
                <p className="flex items-center gap-2 text-[12px] text-emerald-800"><CheckCircleIcon className="h-4 w-4" /> Every lockfile component appears in the SBOM.</p>
              ) : (
                <ul className="space-y-2.5">
                  {report.missingComponents.map((item) => (
                    <li key={item.key} className="rounded-lg border border-red-100 bg-red-50/60 p-3">
                      <p className="text-[12px] font-semibold text-ink">{item.name}<span className="font-normal text-muted">@{item.version}</span>{item.direct ? <span className="ml-2 rounded bg-brand-tint px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-dark">direct</span> : null}</p>
                      <p className="mt-1 text-[10.5px] text-muted">{item.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Missing relationships (${report.missingEdges.length})`} subtitle="Dependency edges from the lockfile graph absent from the SBOM." tone={report.missingEdges.length ? "warn" : "ok"}>
              {report.missingEdges.length === 0 ? (
                <p className="flex items-center gap-2 text-[12px] text-emerald-800"><CheckCircleIcon className="h-4 w-4" /> All recorded dependency relationships are represented.</p>
              ) : (
                <ul className="space-y-2.5">
                  {report.missingEdges.map((edge, index) => (
                    <li key={index} className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <p className="text-[11.5px] font-semibold text-ink">{edge.parent} <span className="text-muted">→</span> {edge.child}</p>
                      <p className="mt-1 text-[10.5px] text-muted">{edge.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Metadata gaps (${report.metadataGaps.length})`} subtitle="Components present but missing version, package identity, or license metadata." tone={report.metadataGaps.length ? "warn" : "ok"}>
              {report.metadataGaps.length === 0 ? (
                <p className="flex items-center gap-2 text-[12px] text-emerald-800"><CheckCircleIcon className="h-4 w-4" /> Every matched component carries full identity metadata.</p>
              ) : (
                <ul className="space-y-2.5">
                  {report.metadataGaps.map((gap, index) => (
                    <li key={index} className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <p className="text-[12px] font-semibold text-ink">{gap.name}<span className="font-normal text-muted">@{gap.version}</span></p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-amber-800">missing: {gap.missing.join(", ")}</p>
                      <p className="mt-1 text-[10.5px] text-muted">{gap.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {report.extraComponents.length > 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-surface p-5">
              <h3 className="text-[12px] font-bold text-ink">In the SBOM but not in this lockfile ({report.extraComponents.length})</h3>
              <p className="mt-1 text-[11px] text-muted">Informational — could be stale entries or from a different lockfile. Not counted against coverage.</p>
              <ul className="mt-3 divide-y divide-line-soft">
                {report.extraComponents.slice(0, 15).map((extra, index) => (
                  <li key={index} className="py-2 text-[12px] text-muted">{extra.name}<span className="font-mono">@{extra.version}</span></li>
                ))}
              </ul>
              {report.extraComponents.length > 15 ? <p className="mt-2 text-[10.5px] text-muted">+{report.extraComponents.length - 15} more</p> : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-[11px] text-muted"><AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Upload an SBOM and run the comparison to see the coverage report.</p>
      )}
    </div>
  );
}
