import { prisma } from "./db.js";
import { computeErrorBudget, type SloErrorBudget } from "./slo.js";
import { buildImpact } from "./release-impact.js";

// Release evidence report builder.
//
// Produces two artifacts from a completed scan and the release evidence
// registered for its project:
//   - release-evidence-json: the full machine-readable report
//   - release-evidence-csv: one row per finding x deployment (human spreadsheet)
//
// The report never includes secrets, tokens, SQL, or filesystem paths — it
// serializes only validated display fields. Provenance attestations are
// reported as PARSED, never as cryptographically verified. SLO data is
// manual; it never influences severity, decisions, or the release verdict.

/** Escape a value for inclusion in a spreadsheet cell.
 *  - RFC4180 quoting (always wrapped in quotes, " doubled)
 *  - neutralizes formula injection: a leading = + - @ (or whitespace/tab/CR before it) is prefixed with a single quote
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const dangerous = /^[\t\r\n ]*[=+\-@]/.test(raw);
  const sanitized = dangerous ? `'${raw}` : raw;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export const REPORT_RULES = [
  "Release verdict (from stored scan results, fixed rules): any critical/high OSV advisory or a BLOCK license decision → BLOCKED; unresolved license REVIEW, moderate or unrated advisories, or incomplete OSV/license checks → REVIEW; otherwise READY. This is a release check, not a proof of safety.",
  "Impact attribution: a finding is attributed to a deployment only when the finding's component is in this scan's SBOM AND registered release evidence references this scan's SBOM by bit-exact digest (verified) or links this scan explicitly (linked). Evidence predating scan completion is flagged stale. Otherwise attribution is impossible (unverified/missing) and no service is named.",
  "Error budget: budgetPercent = 100 − target; consumedPercent = (100 − observedValue) / budgetPercent × 100; remainingPercent = max(0, 100 − consumedPercent); a boundary case (observedBad == budget) counts as exhausted; observedValue on a scale other than the target's produces meaningless numbers; missing or invalid observations report not_calculable. SLO data never changes severity, license decisions, or the verdict.",
  "Digests are stored normalized as sha256:<64 hex> or sha512:<128 hex> (bare hex is normalized on read/compare). The scan's SBOM digest is sha256 of the exact JSON bytes served by GET /scans/:jobId/sbom.",
  "Provenance attestations are parsed for structure only. No signature is verified (no trust root is configured). subjectMatchesArtifact proves both documents name the same digest — nothing about authenticity or builder identity.",
  "CSV cells are quoted and any leading = + - @ (after optional whitespace) is neutralized with a single-quote prefix to defeat spreadsheet formula injection.",
] as const;

export const REPORT_LIMITATIONS = [
  "OSV covers known, cataloged advisories only; absence of findings is not proof of safety. OSV snapshot differs after scan completion.",
  "All release evidence and SLO data in this report were entered manually (source = manual). SupplyGuard does not query CI/CD, artifact registries, or telemetry systems; nothing here is a live or verified measurement.",
  "Provenance attestations are parsed, never cryptographically verified; subjectMatchesArtifact means only that digests are equal.",
  "License decisions reflect the workspace policy recorded at scan time; they are policy verdicts, not legal advice.",
  "The SBOM is a snapshot of dependency metadata at scan time (npm lockfile v2/v3). Transitive dependency edges follow the lockfile, not runtime resolution.",
  "Vulnerability severity comes solely from OSV advisory metadata (or 'Unrated'); it is never adjusted for deployment or reliability context.",
  "Registered evidence or reports may be manually edited by workspace users with the required roles; treat 'User-asserted' (verificationState=user_asserted) as a human claim, not as a machine check.",
  "Report contains exactly what was stored — no independent re-check is performed at generation time.",
] as const;

export async function buildReleaseEvidenceReport(scanJobId: string, workspaceId: string, generatedAt = new Date()) {
  const job = await prisma.scanJob.findFirst({
    where: { id: scanJobId, workspaceId, status: "COMPLETED" },
    include: {
      project: { select: { id: true, name: true } },
      components: true,
      vulnerabilityFindings: { include: { component: { select: { id: true, name: true, version: true, purl: true } } } },
      licenseFindings: { include: { component: { select: { id: true, name: true, version: true, purl: true } }, reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { decision: true, note: true, createdAt: true } } } },
    },
  });
  if (!job) return null;

  const edges = await prisma.dependencyEdge.findMany({ where: { scanJobId: job.id }, select: { parentComponentId: true, childComponentId: true } });
  const [evidence, slos] = await Promise.all([
    prisma.releaseEvidence.findMany({ where: { workspaceId, projectId: job.projectId }, include: { attestation: true }, orderBy: { createdAt: "desc" } }),
    prisma.serviceLevelObjective.findMany({ where: { workspaceId, projectId: job.projectId } }),
  ]);

  const impact = buildImpact({
    job: { id: job.id, completedAt: job.completedAt, sbomDigest: job.sbomDigest ?? null },
    components: job.components.map((c) => ({ id: c.id, name: c.name, version: c.version, purl: c.purl })),
    edges,
    vulnerabilities: job.vulnerabilityFindings.map((v) => ({ id: v.id, componentId: v.componentId, severity: v.severity, osvId: v.osvId })),
    licenses: job.licenseFindings.map((v) => ({ id: v.id, componentId: v.componentId, decision: v.decision, observedExpression: v.observedExpression })),
    evidence,
    slos,
  });
  const impactById = new Map(impact.map((entry) => [entry.findingId, entry]));
  const impactStatusCounts = { verified: 0, linked: 0, unverified: 0, missing: 0, stale: 0 };
  for (const entry of impact) {
    impactStatusCounts[entry.status] += 1;
    if (entry.stale) impactStatusCounts.stale += 1;
  }

  const scanCompletedAt = job.completedAt?.getTime() ?? null;
  const releaseEvidence = evidence.map((entry) => {
    const stale = scanCompletedAt !== null && entry.updatedAt.getTime() < scanCompletedAt;
    return {
      id: entry.id,
      linkedToThisScan: entry.scanJobId === job.id,
      repositoryUrl: entry.repositoryUrl,
      commitSha: entry.commitSha,
      sbomName: entry.sbomName,
      sbomFormat: entry.sbomFormat,
      sbomSerialNumber: entry.sbomSerialNumber,
      sbomGeneratedAt: entry.sbomGeneratedAt?.toISOString() ?? null,
      sbomDigest: entry.sbomDigest,
      artifactName: entry.artifactName,
      artifactDigest: entry.artifactDigest,
      buildProvider: entry.buildProvider,
      buildWorkflow: entry.buildWorkflow,
      buildRunId: entry.buildRunId,
      buildRunUrl: entry.buildRunUrl,
      deployService: entry.deployService,
      deployEnvironment: entry.deployEnvironment,
      deployRegion: entry.deployRegion,
      deployAt: entry.deployAt?.toISOString() ?? null,
      source: entry.evidenceSource.toLowerCase(),
      verificationState: entry.verificationState.toLowerCase(),
      evidenceStale: stale,
      updatedAt: entry.updatedAt.toISOString(),
      attestation: entry.attestation ? {
        envelope: entry.attestation.envelope,
        predicateType: entry.attestation.predicateType,
        statementType: entry.attestation.statementType,
        payloadDigest: entry.attestation.payloadDigest,
        subjectName: entry.attestation.subjectName,
        subjectDigest: entry.attestation.subjectDigest,
        subjectCount: entry.attestation.subjectCount,
        subjectMatchesArtifact: entry.attestation.subjectMatchesArtifact,
        builderId: entry.attestation.builderId,
        buildType: entry.attestation.buildType,
        buildInvocationId: entry.attestation.buildInvocationId,
        startedOn: entry.attestation.startedOn?.toISOString() ?? null,
        finishedOn: entry.attestation.finishedOn?.toISOString() ?? null,
        sourceRepoUrl: entry.attestation.sourceRepoUrl,
        sourceRevision: entry.attestation.sourceRevision,
        materials: entry.attestation.materials,
        signatureCount: entry.attestation.signatureCount,
        signatureState: entry.attestation.signatureState, // always "unverified" by design
        parsedAt: entry.attestation.parsedAt.toISOString(),
        note: "Parsed, never cryptographically verified. subjectMatchesArtifact proves only that digests are equal.",
      } : null,
    };
  });

  const sloReport = slos.map((slo) => {
    const errorBudget: SloErrorBudget = computeErrorBudget(slo.target, slo.observedValue);
    return {
      id: slo.id,
      service: slo.service,
      environment: slo.environment,
      name: slo.name,
      indicatorName: slo.indicatorName,
      target: slo.target,
      observedValue: slo.observedValue,
      windowDays: slo.windowDays,
      observedAt: slo.observedAt?.toISOString() ?? null,
      source: slo.source.toLowerCase(),
      errorBudget,
      note: slo.note,
      updatedAt: slo.updatedAt.toISOString(),
    };
  });

  const report = {
    report: "supplyguard-release-evidence",
    reportVersion: 1,
    generatedAt: generatedAt.toISOString(),
    project: { id: job.project.id, name: job.project.name },
    scan: {
      id: job.id,
      status: job.status.toLowerCase(),
      source: job.source,
      uploadName: job.uploadName,
      repositoryUrl: job.repositoryUrl,
      branch: job.branch,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      componentCount: job.componentCount,
      vulnerabilityCount: job.vulnerabilityCount,
      licenseReviewCount: job.licenseReviewCount,
      osvCheck: job.vulnerabilityCheckStatus.toLowerCase(),
      osvCheckError: job.vulnerabilityCheckError,
      licenseCheck: job.licenseCheckStatus.toLowerCase(),
      licenseCheckError: job.licenseCheckError,
      sbomFormat: "CycloneDX 1.6",
      sbomDigest: job.sbomDigest ?? null,
    },
    releaseEvidence,
    findings: {
      vulnerabilities: job.vulnerabilityFindings.map((finding) => ({
        osvId: finding.osvId,
        aliases: finding.aliases,
        summary: finding.summary,
        severity: finding.severity ?? null,
        cvssScore: finding.cvssScore ?? null,
        modifiedAt: finding.modifiedAt?.toISOString() ?? null,
        component: { name: finding.component.name, version: finding.component.version, purl: finding.component.purl },
        impact: impactById.get(finding.id) ?? null,
      })),
      licenses: job.licenseFindings.map((finding) => ({
        component: { name: finding.component.name, version: finding.component.version, purl: finding.component.purl },
        observedExpression: finding.observedExpression,
        observationSource: finding.observationSource,
        decision: finding.decision,
        policyRule: finding.policyRule,
        reviewStatus: finding.reviewStatus,
        review: finding.reviews[0] ?? null,
        impact: impactById.get(finding.id) ?? null,
      })),
    },
    slos: sloReport,
    impactStatusCounts,
    rules: [...REPORT_RULES],
    limitations: [...REPORT_LIMITATIONS],
  } as const;

  return report;
}

export async function buildReleaseEvidenceCsv(scanJobId: string, workspaceId: string): Promise<string | null> {
  const report = await buildReleaseEvidenceReport(scanJobId, workspaceId, new Date());
  if (!report) return null;
  const header = [
    "findingType", "findingId", "component", "version", "componentPurl",
    "severity_or_decision", "impactStatus", "impactStale",
    "sbomDigest", "artifactDigest", "deployService", "deployEnvironment", "deployRegion", "artifactName", "evidenceUpdatedAt",
    "sloNames",
  ].join(",");
  const lines = [header];
  const sbomDigest = report.scan.sbomDigest ?? "";
  for (const finding of report.findings.vulnerabilities) {
    const imp = finding.impact;
    if (!imp) continue;
    const services = imp.services.length ? imp.services : [null];
    for (const service of services) {
      lines.push([
        "vulnerability", imp.findingId, finding.component.name, finding.component.version, finding.component.purl,
        finding.severity ?? "Unrated", imp.status, imp.stale ? "true" : "false",
        sbomDigest,
        service?.artifactDigest ?? "",
        service?.service ?? "",
        service?.environment ?? "",
        service?.region ?? "",
        service?.artifactName ?? "",
        imp.evidenceUpdatedAt ?? "",
        service ? service.slos.map((slo) => slo.name).join("; ") : "",
      ].map(csvCell).join(","));
    }
  }
  for (const finding of report.findings.licenses) {
    const imp = finding.impact;
    if (!imp) continue;
    const services = imp.services.length ? imp.services : [null];
    for (const service of services) {
      lines.push([
        "license", imp.findingId, finding.component.name, finding.component.version, finding.component.purl,
        finding.decision, imp.status, imp.stale ? "true" : "false",
        sbomDigest,
        service?.artifactDigest ?? "",
        service?.service ?? "",
        service?.environment ?? "",
        service?.region ?? "",
        service?.artifactName ?? "",
        imp.evidenceUpdatedAt ?? "",
        service ? service.slos.map((slo) => slo.name).join("; ") : "",
      ].map(csvCell).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

export function releaseEvidenceReportName(projectName: string, format: string, digest: string | null): string {
  const safe = projectName.replace(/[^a-z0-9_-]+/gi, "-");
  const short = digest ? digest.match(/[0-9a-f]{12}/)?.[0] : "nodigest";
  return `${safe}-release-evidence-${short}.${format}`;
}

