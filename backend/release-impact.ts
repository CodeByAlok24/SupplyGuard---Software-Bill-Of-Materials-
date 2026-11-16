import type { Component, DependencyEdge, LicenseFinding, VulnerabilityFinding, ReleaseEvidence, ScanJob, ServiceLevelObjective } from "@prisma/client";
import { computeErrorBudget, type SloErrorBudget } from "./slo.js";

// Evidence impact computation.
//
// An outcome can only claim a deployment is affected when a finding's
// component is present in the scanned SBOM (always true for this scan) AND a
// manually registered release-evidence record links that SBOM (by explicit
// scan link or by bit-exact digest) to an immutable artifact digest AND that
// artifact is registered as deployed to a service/environment.
// Severity is never recomputed here — it stays exactly what OSV or the
// license policy engine produced. SLO data (also manual) is attached beside
// the deployment for context; it never influences severity or the verdict.

export type ImpactStatus = "verified" | "linked" | "unverified" | "missing";

// Digests are stored as sha256:<hex> on both sides; tolerate a bare 64/128-hex
// value on either side so comparisons never silently fail.
function digestKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(v)) return `sha256:${v}`;
  if (/^[0-9a-f]{128}$/.test(v)) return `sha512:${v}`;
  return v;
}

const tokenKey = (value: string | null | undefined): string | null => {
  const v = value?.trim().toLowerCase();
  return v ? v : null;
};

export type ImpactSlo = {
  id: string;
  name: string;
  target: number;
  indicatorName: string;
  observedValue: number | null;
  windowDays: number | null;
  observedAt: string | null;
  source: "manual";
  errorBudget: SloErrorBudget;
};

export type ImpactService = {
  service: string | null;
  environment: string | null;
  region: string | null;
  artifactName: string | null;
  artifactDigest: string | null;
  source: "manual";
  verificationState: string;
  evidenceId: string;
  slos: ImpactSlo[];
};

export type ImpactEntry = {
  findingId: string;
  findingType: "vulnerability" | "license";
  componentName: string;
  componentVersion: string;
  componentPurl: string;
  dependencyPath: Array<{ name: string; version: string }>;
  // What we can honestly claim
  status: ImpactStatus;
  reason: string;
  evidenceUpdatedAt: string | null;
  stale: boolean;
  services: ImpactService[];
};

type Edge = Pick<DependencyEdge, "parentComponentId" | "childComponentId">;
type ComponentLite = Pick<Component, "id" | "name" | "version" | "purl">;
type VulnFindingLite = Pick<VulnerabilityFinding, "id" | "componentId" | "severity" | "osvId">;
type LicenseFindingLite = Pick<LicenseFinding, "id" | "componentId" | "decision" | "observedExpression">;
type EvidenceLite = Pick<ReleaseEvidence, "id" | "scanJobId" | "sbomDigest" | "artifactName" | "artifactDigest" | "deployService" | "deployEnvironment" | "deployRegion" | "updatedAt" | "verificationState">;
type SloLite = Pick<ServiceLevelObjective, "id" | "service" | "environment" | "name" | "target" | "indicatorName" | "observedValue" | "windowDays" | "observedAt">;

// Evidence registered before this scan completed cannot describe this scan's artifact.

export function buildImpact(args: {
  job: Pick<ScanJob, "id" | "completedAt" | "sbomDigest">;
  components: ComponentLite[];
  edges: Edge[];
  vulnerabilities: VulnFindingLite[];
  licenses: LicenseFindingLite[];
  evidence: EvidenceLite[];
  slos?: SloLite[];
}): ImpactEntry[] {
  const { job, components, edges, vulnerabilities, licenses, evidence, slos = [] } = args;
  const byId = new Map(components.map((component) => [component.id, component]));
  const slosByKey = new Map<string, ImpactSlo[]>();
  for (const slo of slos) {
    const service = tokenKey(slo.service);
    const environment = tokenKey(slo.environment);
    if (!service || !environment) continue;
    const key = `${service}::${environment}`;
    const list = slosByKey.get(key) ?? [];
    list.push({
      id: slo.id,
      name: slo.name,
      target: slo.target,
      indicatorName: slo.indicatorName,
      observedValue: slo.observedValue,
      windowDays: slo.windowDays,
      observedAt: slo.observedAt ? slo.observedAt.toISOString() : null,
      source: "manual",
      errorBudget: computeErrorBudget(slo.target, slo.observedValue),
    });
    slosByKey.set(key, list);
  }
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parents.get(edge.childComponentId) || [];
    list.push(edge.parentComponentId);
    parents.set(edge.childComponentId, list);
  }
  function pathTo(componentId: string) {
    const path: Array<{ name: string; version: string }> = [];
    const seen = new Set<string>();
    let current: string | undefined = componentId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const component = byId.get(current);
      if (!component) break;
      path.unshift({ name: component.name, version: component.version });
      current = parents.get(current)?.[0];
    }
    return path;
  }

  const usedEvidence = evidence;
  const scanCompleted = job.completedAt?.getTime() ?? null;

  function statusFor(): { status: ImpactStatus; reason: string } {
    const verified = usedEvidence.find((item) => digestKey(item.sbomDigest) && digestKey(item.sbomDigest) === digestKey(job.sbomDigest));
    if (verified) return { status: "verified", reason: "SBOM digest matches the registered evidence record exactly." };
    const linked = usedEvidence.find((item) => item.scanJobId === job.id);
    if (linked) return { status: "linked", reason: "Evidence record explicitly linked to this scan. Digest not asserted (manual)." };
    if (usedEvidence.length > 0) return { status: "unverified", reason: "Evidence exists for this project but no link to this SBOM/scan has been registered. The finding may not affect the deployed artifact." };
    return { status: "missing", reason: "No release evidence registered for this project." };
  }

  function servicesFor(status: ImpactStatus): ImpactService[] {
    return usedEvidence.filter((item) => {
      if (status === "verified") return digestKey(item.sbomDigest) !== null && digestKey(item.sbomDigest) === digestKey(job.sbomDigest);
      if (status === "linked") return item.scanJobId === job.id;
      return false;
    }).map((item) => {
      const service = tokenKey(item.deployService);
      const environment = tokenKey(item.deployEnvironment);
      const matchedSlos = service && environment ? slosByKey.get(`${service}::${environment}`) ?? [] : [];
      return {
        service: item.deployService,
        environment: item.deployEnvironment,
        region: item.deployRegion,
        artifactName: item.artifactName,
        artifactDigest: item.artifactDigest,
        source: "manual" as const,
        verificationState: item.verificationState,
        evidenceId: item.id,
        slos: matchedSlos,
      };
    });
  }

  const entries: ImpactEntry[] = [];
  const latestEvidenceUpdate = usedEvidence.reduce((latest, item) => Math.max(latest, item.updatedAt.getTime()), 0);
  const stale = scanCompleted !== null && latestEvidenceUpdate > 0 ? latestEvidenceUpdate < scanCompleted : null;

  for (const finding of vulnerabilities) {
    const component = byId.get(finding.componentId);
    if (!component) continue;
    const { status, reason } = statusFor();
    entries.push({
      findingId: finding.id,
      findingType: "vulnerability",
      componentName: component.name,
      componentVersion: component.version,
      componentPurl: component.purl,
      dependencyPath: pathTo(component.id),
      status,
      reason,
      evidenceUpdatedAt: latestEvidenceUpdate ? new Date(latestEvidenceUpdate).toISOString() : null,
      stale: stale === null ? false : stale,
      services: servicesFor(status),
    });
  }

  for (const finding of licenses) {
    const component = byId.get(finding.componentId);
    if (!component) continue;
    const { status, reason } = statusFor();
    entries.push({
      findingId: finding.id,
      findingType: "license",
      componentName: component.name,
      componentVersion: component.version,
      componentPurl: component.purl,
      dependencyPath: pathTo(component.id),
      status,
      reason,
      evidenceUpdatedAt: latestEvidenceUpdate ? new Date(latestEvidenceUpdate).toISOString() : null,
      stale: stale === null ? false : stale,
      services: servicesFor(status),
    });
  }

  return entries;
}
