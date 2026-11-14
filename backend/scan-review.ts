import type { Component, LicenseFinding, ScanJob, VulnerabilityFinding } from "@prisma/client";

type Severity = "CRITICAL" | "HIGH" | "MODERATE" | "MEDIUM" | "LOW" | null;

type GateCheck = {
  id: string;
  label: string;
  status: "pass" | "review" | "fail";
  detail: string;
};

export type Gate = {
  verdict: "READY" | "REVIEW" | "BLOCKED";
  checks: GateCheck[];
  note: string;
};

type VulnWithComponent = VulnerabilityFinding & { component: Pick<Component, "id" | "name" | "version" | "purl"> };
type LicenseWithComponent = LicenseFinding & { component: Pick<Component, "id" | "name" | "version" | "purl"> };

function severityRank(severity: Severity) {
  switch (severity) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "MODERATE":
    case "MEDIUM": return 2;
    case "LOW": return 1;
    default: return 0;
  }
}

export function highestSeverity(vulns: Array<{ severity: string | null }>): Severity {
  let highest: Severity = null;
  for (const vuln of vulns) {
    const normalized = (vuln.severity || "").toUpperCase() as Severity;
    if (severityRank(normalized) > severityRank(highest)) highest = normalized || null;
  }
  return highest;
}

function compareVersions(a: string, b: string) {
  const [aCore, aPre] = a.split("-", 2);
  const [bCore, bPre] = b.split("-", 2);
  const aParts = aCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = bCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (aPre && bPre) return aPre.localeCompare(bPre);
  return 0;
}

function packageMatches(entry: unknown, component: Pick<Component, "name" | "purl">) {
  if (!entry || typeof entry !== "object") return false;
  const pkg = (entry as { package?: { name?: string; purl?: string } }).package;
  if (!pkg) return false;
  if (pkg.name === component.name) return true;
  if (pkg.purl && component.purl.startsWith(`${pkg.purl}@`)) return true;
  return false;
}

/** Minimum published fix for a component, taken from the OSV affected ranges we stored with the finding. */
export function fixedVersionFor(vuln: Pick<VulnerabilityFinding, "affected">, component: Pick<Component, "name" | "version" | "purl">) {
  const affected = Array.isArray(vuln.affected) ? vuln.affected : [];
  const fixes: string[] = [];
  for (const entry of affected) {
    if (!packageMatches(entry, component)) continue;
    const ranges = (entry as { ranges?: Array<{ events?: Array<{ fixed?: string }> }> }).ranges;
    for (const range of ranges || []) {
      for (const event of range.events || []) {
        if (event.fixed) fixes.push(event.fixed);
      }
    }
  }
  const newer = fixes.filter((version) => compareVersions(version, component.version) > 0);
  if (!newer.length) return null;
  return newer.sort(compareVersions)[newer.length - 1];
}

export type Remediation = {
  componentId: string;
  name: string;
  version: string;
  fixedVersion: string | null;
  severity: Severity;
  advisories: Array<{ osvId: string; summary: string | null; severity: string | null }>;
  command: string | null;
  path: Array<{ name: string; version: string }>;
  direct: boolean;
};

export function buildRemediations(
  vulns: VulnWithComponent[],
  components: Component[],
  edges: Array<{ parentComponentId: string; childComponentId: string }>,
): Remediation[] {
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parents.get(edge.childComponentId) || [];
    list.push(edge.parentComponentId);
    parents.set(edge.childComponentId, list);
  }
  const byId = new Map(components.map((component) => [component.id, component]));

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

  const grouped = new Map<string, Remediation>();
  for (const vuln of vulns) {
    const existing = grouped.get(vuln.componentId);
    const severity = (vuln.severity || "").toUpperCase() as Severity;
    if (existing) {
      existing.advisories.push({ osvId: vuln.osvId, summary: vuln.summary, severity: vuln.severity });
      if (severityRank(severity || null) > severityRank(existing.severity)) existing.severity = severity || null;
      continue;
    }
    const fixedVersion = fixedVersionFor(vuln, vuln.component);
    grouped.set(vuln.componentId, {
      componentId: vuln.componentId,
      name: vuln.component.name,
      version: vuln.component.version,
      fixedVersion,
      severity: severity || null,
      advisories: [{ osvId: vuln.osvId, summary: vuln.summary, severity: vuln.severity }],
      command: fixedVersion ? `npm install ${vuln.component.name}@${fixedVersion}` : null,
      path: pathTo(vuln.componentId),
      direct: !parents.has(vuln.componentId),
    });
  }

  // Recompute the fix across all advisories for the component: choose the highest published fix.
  for (const item of grouped.values()) {
    const component = byId.get(item.componentId);
    if (!component) continue;
    const fixes = vulns
      .filter((vuln) => vuln.componentId === item.componentId)
      .map((vuln) => fixedVersionFor(vuln, component))
      .filter((version): version is string => Boolean(version));
    const best = fixes.sort(compareVersions).at(-1) || null;
    item.fixedVersion = best;
    item.command = best ? `npm install ${component.name}@${best}` : null;
  }

  return [...grouped.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.name.localeCompare(b.name));
}

export function buildGate(
  job: Pick<ScanJob, "vulnerabilityCheckStatus" | "vulnerabilityCheckError" | "licenseCheckStatus" | "licenseCheckError" | "sbom">,
  vulns: Array<{ severity: string | null }>,
  licenses: Array<{ decision: string }>,
): Gate {
  const checks: GateCheck[] = [];
  let failed = false;
  let needsReview = false;

  const critical = vulns.filter((vuln) => (vuln.severity || "").toUpperCase() === "CRITICAL").length;
  const high = vulns.filter((vuln) => (vuln.severity || "").toUpperCase() === "HIGH").length;
  const moderate = vulns.filter((vuln) => ["MODERATE", "MEDIUM"].includes((vuln.severity || "").toUpperCase())).length;
  const unknown = vulns.filter((vuln) => !vuln.severity).length;

  if (job.vulnerabilityCheckStatus === "UNAVAILABLE") {
    needsReview = true;
    checks.push({ id: "osv", label: "OSV vulnerability lookup", status: "review", detail: `Did not complete: ${job.vulnerabilityCheckError || "OSV was unavailable"}. Findings are unknown, not zero.` });
  } else if (job.vulnerabilityCheckStatus === "PARTIAL") {
    needsReview = true;
    checks.push({ id: "osv", label: "OSV vulnerability lookup", status: "review", detail: job.vulnerabilityCheckError || "Some advisory details could not be loaded." });
  } else if (critical + high > 0) {
    failed = true;
    const severityParts = [critical ? `${critical} critical` : "", high ? `${high} high` : ""].filter(Boolean).join(" and ");
    checks.push({ id: "osv", label: "OSV vulnerability lookup", status: "fail", detail: `${severityParts} advisor${critical + high === 1 ? "y" : "ies"} affect ${vulns.length} package finding${vulns.length === 1 ? "" : "s"}.` });
  } else if (moderate + unknown > 0) {
    needsReview = true;
    checks.push({ id: "osv", label: "OSV vulnerability lookup", status: "review", detail: `${moderate + unknown} moderate or unrated advisor${moderate + unknown === 1 ? "y" : "ies"} need a decision.` });
  } else {
    checks.push({ id: "osv", label: "OSV vulnerability lookup", status: "pass", detail: vulns.length ? `${vulns.length} low-severity advisor${vulns.length === 1 ? "y" : "ies"}.` : "No known OSV advisories for this scan." });
  }

  const blocked = licenses.filter((finding) => finding.decision === "BLOCK").length;
  const review = licenses.filter((finding) => finding.decision === "REVIEW").length;
  if (blocked > 0) {
    failed = true;
    checks.push({ id: "licenses", label: "License policy", status: "fail", detail: `${blocked} package${blocked === 1 ? "" : "s"} match a blocked license policy.` });
  } else if (review > 0) {
    needsReview = true;
    checks.push({ id: "licenses", label: "License policy", status: "review", detail: `${review} package${review === 1 ? "" : "s"} still need a license decision.` });
  } else {
    checks.push({ id: "licenses", label: "License policy", status: "pass", detail: licenses.length ? "Every observed license is allowed by the workspace policy." : "No license findings were recorded." });
  }

  if (job.licenseCheckStatus === "PARTIAL" || job.licenseCheckStatus === "UNAVAILABLE") {
    needsReview = true;
    checks.push({ id: "license_metadata", label: "License metadata", status: "review", detail: job.licenseCheckError || "Some package license metadata could not be resolved; unknown licenses require review." });
  } else if (job.licenseCheckStatus === "NOT_REQUESTED") {
    checks.push({ id: "license_metadata", label: "License metadata", status: "pass", detail: "License metadata lookup was not requested for this scan; unresolved licenses appear as review items." });
  } else {
    checks.push({ id: "license_metadata", label: "License metadata", status: "pass", detail: "License metadata lookup completed." });
  }

  if (job.sbom) {
    checks.push({ id: "sbom", label: "CycloneDX SBOM", status: "pass", detail: "A CycloneDX 1.6 document was generated for this scan." });
  } else {
    needsReview = true;
    checks.push({ id: "sbom", label: "CycloneDX SBOM", status: "review", detail: "No SBOM was stored for this scan." });
  }

  return {
    verdict: failed ? "BLOCKED" : needsReview ? "REVIEW" : "READY",
    checks,
    note: "This gate applies fixed, visible rules to known OSV advisories and your workspace license policy. It is a release check, not a guarantee that the code is safe.",
  };
}

type DiffVuln = { osvId: string; component: string; version: string; severity: string | null; summary: string | null };

export type ScanDiff = {
  previousScanId: string;
  previousCompletedAt: Date | null;
  vulnerabilities: { added: DiffVuln[]; resolved: DiffVuln[] };
  components: {
    added: Array<{ name: string; version: string }>;
    removed: Array<{ name: string; version: string }>;
    upgraded: Array<{ name: string; from: string; to: string }>;
  };
  licenseChanges: Array<{ name: string; from: string | null; to: string | null }>;
};

export function buildDiff(
  current: { vulns: VulnWithComponent[]; components: Component[]; licenses: LicenseWithComponent[] },
  previous: { scanId: string; completedAt: Date | null; vulns: VulnWithComponent[]; components: Component[]; licenses: LicenseWithComponent[] } | null,
): ScanDiff | null {
  if (!previous) return null;
  const key = (vuln: { osvId: string; component: { name: string; version?: string; id?: string } }) => `${vuln.osvId}::${vuln.component.id ?? `${vuln.component.name}@${vuln.component.version ?? ""}`}`;
  const currentVulns = new Set(current.vulns.map(key));
  const previousVulns = new Set(previous.vulns.map(key));
  const describe = (vuln: VulnWithComponent): DiffVuln => ({ osvId: vuln.osvId, component: vuln.component.name, version: vuln.component.version, severity: vuln.severity, summary: vuln.summary });

  const addedVulns = current.vulns.filter((vuln) => !previousVulns.has(key(vuln))).map(describe);
  const resolvedVulns = previous.vulns.filter((vuln) => !currentVulns.has(key(vuln))).map(describe);

  const currentByName = new Map(current.components.map((component) => [component.name, component]));
  const previousByName = new Map(previous.components.map((component) => [component.name, component]));
  const addedComponents = current.components.filter((component) => !previousByName.has(component.name)).map((component) => ({ name: component.name, version: component.version }));
  const removedComponents = previous.components.filter((component) => !currentByName.has(component.name)).map((component) => ({ name: component.name, version: component.version }));
  const upgradedComponents = current.components.flatMap((component) => {
    const before = previousByName.get(component.name);
    if (!before || before.version === component.version) return [];
    return [{ name: component.name, from: before.version, to: component.version }];
  });

  const previousLicenses = new Map(previous.licenses.map((finding) => [finding.component.name, finding.observedExpression]));
  const licenseChanges = current.licenses.flatMap((finding) => {
    const before = previousLicenses.get(finding.component.name);
    if (before === undefined || before === finding.observedExpression) return [];
    return [{ name: finding.component.name, from: before, to: finding.observedExpression }];
  });

  return {
    previousScanId: previous.scanId,
    previousCompletedAt: previous.completedAt,
    vulnerabilities: { added: addedVulns, resolved: resolvedVulns },
    components: { added: addedComponents, removed: removedComponents, upgraded: upgradedComponents },
    licenseChanges,
  };
}
