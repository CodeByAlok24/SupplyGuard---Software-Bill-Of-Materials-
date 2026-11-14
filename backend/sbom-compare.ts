import type { Component, DependencyEdge } from "@prisma/client";

// ── Key normalization ─────────────────────────────────────────────
// npm name@version is the strongest identity we have across a lockfile and an
// SBOM. Purls are compared as a fallback (percent-decoding applied so
// `pkg:npm/%40scope/pkg@1` and `pkg:npm/@scope/pkg@1` match).
export function normalizeNameVersion(name: string, version: string) {
  return `${String(name).trim().toLowerCase()}@${String(version).trim().toLowerCase()}`;
}

export function normalizePurl(purl: string) {
  try {
    return decodeURIComponent(String(purl).trim().toLowerCase()).split(/[?#]/)[0];
  } catch {
    return String(purl).trim().toLowerCase();
  }
}

type SbomComponent = { name?: string; version?: string; purl?: string; "bom-ref"?: string; bomRef?: string; scope?: string; licenses?: unknown[] };
type SbomDependency = { ref?: string; dependsOn?: string[] };
type SbomDocument = { bomFormat?: string; specVersion?: string; version?: number; components?: SbomComponent[]; dependencies?: SbomDependency[] };

function componentKey(component: Pick<Component, "purl" | "name" | "version">) {
  return normalizePurl(component.purl);
}

function componentNameKey(component: Pick<Component, "name" | "version">) {
  return normalizeNameVersion(component.name, component.version);
}

export type CoverageItem = { key: string; name: string; version: string; purl: string | null; direct: boolean; explanation: string };
export type CoverageEdge = { parent: string; child: string; explanation: string };
export type CoverageMetadataGap = { name: string; version: string; missing: string[]; explanation: string };
export type CoverageExtra = { name: string; version: string; purl: string | null; explanation: string };

export type CoverageReport = {
  formula: string;
  generatedAt: string;
  lockfileScanJobId: string;
  sbom: { format: string; specVersion: string | null; componentCount: number; dependencyEdges: number };
  lockfile: { componentCount: number; dependencyEdges: number };
  coverageScore: number;
  matchedComponents: number;
  missingComponents: CoverageItem[];
  missingEdges: CoverageEdge[];
  metadataGaps: CoverageMetadataGap[];
  extraComponents: CoverageExtra[];
  notes: string[];
};

export function parseSbom(document: unknown): { doc: SbomDocument; components: SbomComponent[]; dependencies: SbomDependency[] } {
  if (!document || typeof document !== "object") throw new Error("The uploaded file is not a JSON document.");
  const doc = document as SbomDocument;
  if (String(doc.bomFormat || "").toLowerCase() !== "cyclonedx") {
    throw new Error("The uploaded file is not a CycloneDX SBOM (bomFormat must be \"CycloneDX\").");
  }
  const components = Array.isArray(doc.components) ? doc.components : [];
  const dependencies = Array.isArray(doc.dependencies) ? doc.dependencies : [];
  return { doc, components, dependencies };
}

export function compareSbomAgainstLockfile(args: {
  scanJobId: string;
  lockfileComponents: Component[];
  lockfileEdges: Array<Pick<DependencyEdge, "parentComponentId" | "childComponentId">>;
  sbom: unknown;
}): CoverageReport {
  const { scanJobId, lockfileComponents, lockfileEdges, sbom } = args;
  const { doc, components: sbomComponents, dependencies: sbomDependencies } = parseSbom(sbom);

  const componentById = new Map(lockfileComponents.map((component) => [component.id, component]));

  // Index the SBOM two ways so name@version and purl matching both work,
  // regardless of which one the SBOM author used as the component identity.
  const sbomByName = new Map<string, SbomComponent>();
  const sbomByPurl = new Map<string, SbomComponent>();
  const sbomByBomRef = new Map<string, SbomComponent>();
  for (const component of sbomComponents) {
    if (component.name && component.version) sbomByName.set(normalizeNameVersion(component.name, component.version), component);
    if (component.purl) sbomByPurl.set(normalizePurl(component.purl), component);
    const ref = component["bom-ref"] ?? component.bomRef;
    if (ref) sbomByBomRef.set(normalizePurl(String(ref)), component);
  }

  const notes: string[] = [];
  const matched: Component[] = [];
  const missing: CoverageItem[] = [];
  for (const component of lockfileComponents) {
    const byPurl = sbomByPurl.get(componentKey(component));
    const byName = sbomByName.get(componentNameKey(component));
    if (byPurl || byName) { matched.push(component); continue; }
    missing.push({
      key: component.purl,
      name: component.name,
      version: component.version,
      purl: component.purl,
      direct: component.dependencyType === "DIRECT",
      explanation: component.dependencyType === "DIRECT"
        ? "This is a direct (top-level) dependency of the project. Its absence means the SBOM omits packages the project explicitly declares — the inventory is incomplete for every consumer."
        : "This transitive dependency is present in the lockfile but not in the SBOM. Consumers of the SBOM cannot see this package at all, so findings and license terms for it go unreported.",
    });
  }

  // Metadata gaps on matched components
  const metadataGaps: CoverageMetadataGap[] = [];
  for (const component of matched) {
    const purlKey = componentKey(component);
    const sbomComponent = sbomByPurl.get(purlKey) || sbomByName.get(componentNameKey(component));
    if (!sbomComponent) continue;
    const missingFields: string[] = [];
    if (!sbomComponent.version) missingFields.push("version");
    if (!sbomComponent.purl && !(sbomComponent["bom-ref"] ?? sbomComponent.bomRef)) missingFields.push("purl/bom-ref");
    if (!Array.isArray(sbomComponent.licenses) || sbomComponent.licenses.length === 0) missingFields.push("licenses");
    if (missingFields.length) {
      metadataGaps.push({
        name: component.name,
        version: component.version,
        missing: missingFields,
        explanation: `The SBOM lists this component but without ${missingFields.join(", ")}. Downstream tools (license scanners, vulnerability matchers, policy engines) cannot resolve it unambiguously, weakening every conclusion built on it.`,
      });
    }
  }

  // Dependency edges: compare the lockfile graph with the SBOM dependencies[].
  // CycloneDX refs may be bom-refs or purls, so resolve every ref back to a
  // component and compare canonical name@version pairs.
  const namePair = (name: string, version: string) => normalizeNameVersion(name, version);
  const sbomNodeKeys = new Set<string>();
  for (const component of sbomComponents) {
    if (component.name && component.version) sbomNodeKeys.add(namePair(component.name, component.version));
  }
  const refToNameKey = (ref?: string): string | null => {
    if (!ref) return null;
    const normalized = normalizePurl(String(ref));
    const byRef = sbomByBomRef.get(normalized) || sbomByPurl.get(normalized);
    if (byRef?.name && byRef?.version) return namePair(byRef.name, byRef.version);
    // Fall back to treating the ref itself as name@version if it looks like one.
    const at = normalized.lastIndexOf("@");
    if (at > 0) {
      const candidate = normalizeNameVersion(normalized.slice(0, at).split("/").pop() || "", normalized.slice(at + 1));
      if (sbomNodeKeys.has(candidate)) return candidate;
      return candidate;
    }
    return null;
  };
  const sbomEdgeKeys = new Set<string>();
  for (const dependency of sbomDependencies) {
    const parentKey = refToNameKey(dependency.ref);
    for (const childRef of dependency.dependsOn || []) {
      const childKey = refToNameKey(childRef);
      if (parentKey && childKey) sbomEdgeKeys.add(`${parentKey}→${childKey}`);
    }
  }
  const edgeKey = (parent: Pick<Component, "name" | "version">, child: Pick<Component, "name" | "version">) =>
    `${namePair(parent.name, parent.version)}→${namePair(child.name, child.version)}`;

  const missingEdges: CoverageEdge[] = [];
  for (const edge of lockfileEdges) {
    const parent = componentById.get(edge.parentComponentId);
    const child = componentById.get(edge.childComponentId);
    if (!parent || !child) continue;
    const found = sbomEdgeKeys.has(edgeKey(parent, child));
    if (found) continue;
    const parentInSbom = sbomNodeKeys.has(namePair(parent.name, parent.version));
    const childInSbom = sbomNodeKeys.has(namePair(child.name, child.version));
    missingEdges.push({
      parent: `${parent.name}@${parent.version}`,
      child: `${child.name}@${child.version}`,
      explanation: parentInSbom && childInSbom
        ? "Both packages are present in the SBOM but the relationship between them is not recorded. Dependency-aware analysis (reachability, transitive risk paths) silently degrades to flat package listing."
        : "The relationship cannot be represented because at least one endpoint is missing from the SBOM components[].",
    });
  }

  // Packages present in the SBOM but absent from this lockfile's comparison set.
  const lockfileNames = new Set(lockfileComponents.map(componentNameKey));
  const lockfilePurls = new Set(lockfileComponents.map(componentKey));
  const extraComponents: CoverageExtra[] = [];
  for (const component of sbomComponents) {
    const purl = component.purl ? normalizePurl(component.purl) : null;
    if (purl && lockfilePurls.has(purl)) continue;
    if (component.name && component.version && lockfileNames.has(normalizeNameVersion(component.name, component.version))) continue;
    extraComponents.push({
      name: component.name || "(unknown)",
      version: component.version || "(unknown)",
      purl: component.purl || null,
      explanation: "Present in the SBOM but not in the compared lockfile. This is expected if the SBOM was generated from a different lockfile, but from this scan's perspective it is unverifiable — treat it as out of scope until explained.",
    });
  }

  const total = lockfileComponents.length;
  const matchedCount = matched.length;
  const coverageScore = total === 0 ? 100 : Math.round((matchedCount / total) * 1000) / 10;
  if (total === 0) notes.push("The lockfile comparison set is empty; coverage is reported as 100 by convention.");
  if (sbomComponents.length === 0) notes.push("The uploaded SBOM declares no components[]; nothing can be matched.");
  if (missing.length > 0) notes.push("Missing direct dependencies matter most: they are the project's declared intent and are entirely invisible to SBOM consumers.");

  return {
    formula: "coverageScore = matchedComponents / totalLockfileComponents * 100. Matching tries the normalized purl first, then a case-insensitive name@version fallback. Edges compare (parent, child) name@version pairs from the lockfile graph against the SBOM dependencies[] (bom-ref resolved back to components).",
    generatedAt: new Date().toISOString(),
    lockfileScanJobId: scanJobId,
    sbom: { format: String(doc.bomFormat || "unknown"), specVersion: doc.specVersion ?? null, componentCount: sbomComponents.length, dependencyEdges: sbomEdgeKeys.size },
    lockfile: { componentCount: lockfileComponents.length, dependencyEdges: lockfileEdges.length },
    coverageScore,
    matchedComponents: matchedCount,
    missingComponents: missing,
    missingEdges,
    metadataGaps,
    extraComponents,
    notes,
  };
}
