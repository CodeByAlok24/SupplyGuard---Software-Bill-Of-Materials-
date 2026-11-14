import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const execFileAsync = promisify(execFile);

type LockPackage = {
  name?: string;
  version?: string;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  dev?: boolean;
  license?: string;
};
type Lockfile = { name?: string; packages: Record<string, LockPackage> };
type ParsedComponent = { purl: string; name: string; version: string; path: string; dependencyType: "DIRECT" | "TRANSITIVE"; license?: string; licenseSource?: string };
type OsvVulnerability = { id: string; aliases?: string[]; summary?: string; details?: string; modified?: string; published?: string; severity?: Array<{ type?: string; score?: string }>; database_specific?: { severity?: string }; affected?: unknown };
type OsvResponse = { vulns?: OsvVulnerability[] };

export type ProgressItem = {
  purl: string;
  name: string;
  version: string;
  direct: boolean;
  license: string | null;
  licenseStatus: "done" | "pending";
  advisories: number;
  maxSeverity: string | null;
};
export type ProgressState = {
  total: number;
  processed: number;
  items: ProgressItem[];
  capped: boolean;
  updatedAt: string;
};

async function writeProgress(scanJobId: string, progress: ProgressState) {
  try {
    await prisma.scanJob.update({ where: { id: scanJobId }, data: { progress: progress as unknown as Prisma.InputJsonValue } });
  } catch {
    // Progress is advisory; never fail the scan over it.
  }
}

const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1 };
function worstSeverity(a: string | null, b: string | null) {
  const rank = (value: string | null) => (value ? severityRank[value.toUpperCase()] ?? 0 : 0);
  return rank(a) >= rank(b) ? a : b;
}

const PROGRESS_CAP = 1500;

async function setStage(scanJobId: string, stage: string | null) {
  try {
    await prisma.scanJob.update({ where: { id: scanJobId }, data: { stage } });
  } catch {
    // Stage tracking is advisory; never fail the scan over it.
  }
}

function packageName(path: string, entry: LockPackage) {
  if (entry.name) return entry.name;
  const pieces = path.split("node_modules/");
  return pieces[pieces.length - 1] || path;
}

function purl(name: string, version: string) {
  const encodedName = encodeURIComponent(name).replace(/%2F/gi, "/");
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function resolveChild(parentPath: string, name: string, packages: Record<string, LockPackage>) {
  let base = parentPath;
  while (base) {
    const candidate = `${base}/node_modules/${name}`;
    if (packages[candidate]) return candidate;
    const cut = base.lastIndexOf("/node_modules/");
    if (cut < 0) break;
    base = base.slice(0, cut);
  }
  const topLevel = `node_modules/${name}`;
  return packages[topLevel] ? topLevel : undefined;
}

async function retrieveLicense(component: ParsedComponent) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(component.name)}/${encodeURIComponent(component.version)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { accept: "application/json" } });
    if (!response.ok) return { state: "PARTIAL" as const };
    const metadata = await response.json() as { license?: string | { type?: string } };
    const license = typeof metadata.license === "string" ? metadata.license.trim() : "";
    return license ? { state: "COMPLETE" as const, license, source: "npm-registry" } : { state: "COMPLETE" as const };
  } catch {
    return { state: "PARTIAL" as const };
  }
}

async function withConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>, onItem?: (index: number, result: R) => void | Promise<void>) {
  const output = new Array<R>(items.length);
  for (let offset = 0; offset < items.length; offset += concurrency) {
    const group = items.slice(offset, offset + concurrency);
    const results = await Promise.all(group.map(task));
    output.splice(offset, group.length, ...results);
    if (onItem) await Promise.all(results.map((result, index) => onItem(offset + index, result)));
  }
  return output;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, delayMs = 750): Promise<Response> {
  let lastCause: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastCause = error instanceof Error ? (error.cause ?? error.message) : error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  const cause = lastCause && typeof lastCause === "object" && "code" in lastCause ? (lastCause as { code?: string }).code : String(lastCause);
  throw new Error(`Could not reach api.osv.dev after ${attempts} attempts${cause ? ` (${cause})` : ""}.`);
}

const osvDetailCache = new Map<string, OsvVulnerability>();

async function fetchOsvDetail(id: string): Promise<OsvVulnerability | null> {
  const cached = osvDetailCache.get(id);
  if (cached) return cached;
  try {
    const response = await fetchWithRetry(
      `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
      { headers: { "user-agent": "SupplyGuard (github.com/SupplyGuard)" }, signal: AbortSignal.timeout(20000) },
      3,
      500,
    );
    if (!response.ok) return null;
    const detail = await response.json() as OsvVulnerability;
    if (osvDetailCache.size > 2000) osvDetailCache.clear();
    osvDetailCache.set(id, detail);
    return detail;
  } catch {
    return null;
  }
}

// The OSV querybatch endpoint returns only `{ id, modified }`. The full advisory
// (severity, summary, affected ranges, fixed versions) must be fetched per ID.
async function enrichOsvFindings(findings: Array<{ purl: string; vuln: OsvVulnerability }>) {
  const ids = [...new Set(findings.map((item) => item.vuln.id))];
  const details = new Map<string, OsvVulnerability>();
  let missing = 0;
  await withConcurrency(ids, 10, async (id) => {
    const detail = await fetchOsvDetail(id);
    if (detail) details.set(id, detail);
    else missing += 1;
  });
  return {
    findings: findings.map((item) => ({ ...item, vuln: { ...item.vuln, ...(details.get(item.vuln.id) || {}) } })),
    missing,
    total: ids.length,
  };
}

async function queryOsv(components: ParsedComponent[]) {
  const findings: Array<{ purl: string; vuln: OsvVulnerability }> = [];
  for (let offset = 0; offset < components.length; offset += 1000) {
    const group = components.slice(offset, offset + 1000);
    const response = await fetchWithRetry(
      "https://api.osv.dev/v1/querybatch",
      {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "SupplyGuard (github.com/SupplyGuard)" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ queries: group.map((item) => ({ package: { purl: item.purl } })) }),
      },
    );
    if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}.`);
    const payload = await response.json() as { results?: OsvResponse[] };
    for (const [index, result] of (payload.results || []).entries()) {
      for (const vuln of result.vulns || []) findings.push({ purl: group[index]!.purl, vuln });
    }
  }
  return findings;
}

type ScanOptions = { includeTransitive?: boolean; includeDevDependencies?: boolean; lookupLicenses?: boolean };

type ScanJobWithRelations = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

async function loadJob(scanJobId: string) {
  return prisma.scanJob.findUnique({ where: { id: scanJobId }, include: { project: true, workspace: { include: { policies: true } } } });
}

async function cloneRepository(repositoryUrl: string, branch: string, accessToken?: string | null) {
  const directory = await mkdtemp(path.join(tmpdir(), "supplyguard-repo-"));
  const token = accessToken || process.env.GIT_PROVIDER_TOKEN;
  let url = repositoryUrl;
  if (token && url.startsWith("https://github.com/")) {
    url = `https://x-access-token:${token}@github.com/${url.slice("https://github.com/".length)}`;
  }
  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, url, directory], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    const raw = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not clone the repository. ${token ? raw.split(token).join("***") : raw}`);
  }
  return directory;
}

async function findLockfile(directory: string) {
  for (const name of ["package-lock.json", "npm-shrinkwrap.json"]) {
    const candidate = path.join(directory, name);
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("No package-lock.json or npm-shrinkwrap.json was found in the repository root.");
}

async function analyzeLockfile(job: ScanJobWithRelations, lockfile: Lockfile, options: ScanOptions) {
  await setStage(job.id, "analyzing");
  const rootDependencies = {
    ...lockfile.packages[""]?.dependencies,
    ...lockfile.packages[""]?.devDependencies,
    ...lockfile.packages[""]?.optionalDependencies,
  };
  const directPaths = new Set(Object.keys(rootDependencies).flatMap((name) => {
    const path = resolveChild("", name, lockfile.packages);
    return path ? [path] : [];
  }));
  const entries = Object.entries(lockfile.packages).filter(([path, entry]) =>
    path.startsWith("node_modules/") && entry.version &&
    (options.includeTransitive !== false || directPaths.has(path)) &&
    (options.includeDevDependencies !== false || !entry.dev));
  const unique = new Map<string, ParsedComponent>();
  for (const [path, entry] of entries) {
    const component = {
    purl: purl(packageName(path, entry), entry.version!),
    name: packageName(path, entry),
    version: entry.version!,
    path,
      dependencyType: directPaths.has(path) ? "DIRECT" as const : "TRANSITIVE" as const,
    ...(entry.license?.trim() ? { license: entry.license.trim(), licenseSource: "package-lock" } : {}),
    };
    if (!unique.has(component.purl)) unique.set(component.purl, component);
    else if (!unique.get(component.purl)?.license && component.license) unique.set(component.purl, component);
    if (directPaths.has(path) && unique.has(component.purl)) unique.get(component.purl)!.dependencyType = "DIRECT";
  }
  const components = [...unique.values()];
  if (components.length === 0) throw new Error("No installed npm packages were found in this package-lock.json.");

  // Live per-package progress: the worker persists a snapshot the UI polls.
  const progressItems: ProgressItem[] = components.slice(0, PROGRESS_CAP).map((component) => ({
    purl: component.purl,
    name: component.name,
    version: component.version,
    direct: component.dependencyType === "DIRECT",
    license: component.license?.trim() || null,
    licenseStatus: component.license ? "done" : "pending",
    advisories: 0,
    maxSeverity: null,
  }));
  const progressState: ProgressState = {
    total: components.length,
    processed: progressItems.filter((item) => item.licenseStatus === "done").length,
    items: progressItems,
    capped: components.length > PROGRESS_CAP,
    updatedAt: new Date().toISOString(),
  };
  const purlIndex = new Map(progressItems.map((item, index) => [item.purl, index]));
  let lastFlush = 0;
  const flushProgress = async (force = false) => {
    if (!force && Date.now() - lastFlush < 250) return;
    lastFlush = Date.now();
    progressState.processed = progressItems.filter((item) => item.licenseStatus === "done").length;
    progressState.updatedAt = new Date().toISOString();
    await writeProgress(job.id, progressState);
  };

  let licenseCheckStatus = options.lookupLicenses === false ? "NOT_REQUESTED" : "COMPLETE";
  await setStage(job.id, "licenses");
  await flushProgress(true);
  const licenses = await withConcurrency(components, 25, async (component) => {
    if (component.license) return { state: "COMPLETE" as const, license: component.license, source: component.licenseSource };
    if (options.lookupLicenses === false) return { state: "COMPLETE" as const };
    return retrieveLicense(component);
  }, async (index, result) => {
    const item = progressState.items[index];
    if (!item) return;
    if (result.license) { item.license = result.license; item.licenseStatus = "done"; }
    else if (result.state === "COMPLETE") { item.licenseStatus = "done"; }
    await flushProgress();
  });
  if (licenses.some((item) => item.state === "PARTIAL")) licenseCheckStatus = "PARTIAL";
  for (const [index, result] of licenses.entries()) {
    if (result.license) {
      components[index]!.license = result.license;
      components[index]!.licenseSource = result.source;
    }
  }

  await flushProgress(true);

  const componentRows = await prisma.$transaction(components.map((component) => prisma.component.create({

    data: {
      scanJobId: job.id,
      purl: component.purl,
      name: component.name,
      version: component.version,
      dependencyType: component.dependencyType,
      licenseExpression: component.license ?? null,
      licenseSource: component.licenseSource ?? null,
      licenseObservedAt: component.license ? new Date() : null,
    },
  })));
  const componentByPurl = new Map(componentRows.map((item) => [item.purl, item]));
  const purlByPath = new Map(entries.map(([path, entry]) => [path, purl(packageName(path, entry), entry.version!)]));
  const packageMap = lockfile.packages;
  const edgeInputs: Array<{ scanJobId: string; parentComponentId: string; childComponentId: string }> = [];
  for (const [path, entry] of Object.entries(packageMap)) {
    if (path && !path.startsWith("node_modules/")) continue;
    const parentPurl = path ? purlByPath.get(path) : undefined;
    const parent = parentPurl ? componentByPurl.get(parentPurl) : undefined;
    for (const childName of Object.keys(entry.dependencies || {})) {
      const childPath = resolveChild(path, childName, packageMap);
      const childPurl = childPath ? purlByPath.get(childPath) : undefined;
      const child = childPurl ? componentByPurl.get(childPurl) : undefined;
      if (parent && child && parent.id !== child.id) edgeInputs.push({ scanJobId: job.id, parentComponentId: parent.id, childComponentId: child.id });
    }
  }
  if (edgeInputs.length) await prisma.dependencyEdge.createMany({ data: edgeInputs, skipDuplicates: true });

  const licenseFindingInputs = componentRows.map((component) => {
    const policy = component.licenseExpression ? job.workspace.policies.find((item) => item.licenseExpression === component.licenseExpression) : undefined;
    return {
      scanJobId: job.id,
      componentId: component.id,
      observedExpression: component.licenseExpression,
      observationSource: component.licenseSource,
      decision: component.licenseExpression ? policy?.decision ?? "REVIEW" as const : "REVIEW" as const,
      policyRule: policy?.licenseExpression ?? null,
      reviewStatus: "OPEN",
    };
  });
  await prisma.licenseFinding.createMany({ data: licenseFindingInputs });

  await setStage(job.id, "osv");
  let vulnerabilityCheckStatus = "COMPLETE";
  let vulnerabilityCheckError: string | null = null;
  try {
    const batchResults = await queryOsv(components);
    const enriched = await enrichOsvFindings(batchResults);
    const vulnerabilityResults = enriched.findings;
    const advisoryCounts = new Map<string, number>();
    const advisorySeverities = new Map<string, string | null>();
    for (const { purl: componentPurl, vuln } of vulnerabilityResults) {
      advisoryCounts.set(componentPurl, (advisoryCounts.get(componentPurl) || 0) + 1);
      advisorySeverities.set(componentPurl, worstSeverity(advisorySeverities.get(componentPurl) ?? null, vuln.database_specific?.severity?.toUpperCase() || null));
    }
    for (const [purl, index] of purlIndex) {
      const item = progressState.items[index];
      if (!item) continue;
      item.advisories = advisoryCounts.get(purl) ?? 0;
      item.maxSeverity = advisorySeverities.get(purl) ?? null;
    }
    await flushProgress(true);
    if (enriched.missing > 0) {
      vulnerabilityCheckStatus = "PARTIAL";
      vulnerabilityCheckError = `${enriched.missing} of ${enriched.total} OSV advisory records could not be loaded; severity and fix details may be missing.`;
    }
    const vulnInputs = vulnerabilityResults.flatMap(({ purl: componentPurl, vuln }) => {
      const component = componentByPurl.get(componentPurl);
      if (!component) return [];
      const score = vuln.severity?.find((item) => item.type?.startsWith("CVSS"))?.score;
      return [{
        scanJobId: job.id,
        componentId: component.id,
        osvId: vuln.id,
        aliases: vuln.aliases || [],
        summary: vuln.summary,
        severity: vuln.database_specific?.severity?.toUpperCase() || null,
        cvssScore: score && /^\d+(\.\d+)?$/.test(score) ? Number(score) : null,
        modifiedAt: vuln.modified ? new Date(vuln.modified) : null,
        affected: vuln.affected as object | undefined,
      }];
    });
    if (vulnInputs.length) await prisma.vulnerabilityFinding.createMany({ data: vulnInputs, skipDuplicates: true });
  } catch (error) {
    vulnerabilityCheckStatus = "UNAVAILABLE";
    vulnerabilityCheckError = error instanceof Error ? error.message : "OSV lookup failed.";
  }

  await setStage(job.id, "finalizing");
  await flushProgress(true);
  const rootName = `supplyguard-${job.project.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}`;
  const rootComponent = {
    type: "application",
    "bom-ref": purl(rootName, "1.0.0"),
    name: job.project.name,
    version: "1.0.0",
    purl: purl(rootName, "1.0.0"),
  };
  const sbomComponents = components.map((component) => ({
    type: "library",
    "bom-ref": component.purl,
    name: component.name,
    version: component.version,
    purl: component.purl,
    ...(component.license ? { licenses: [{ license: { name: component.license } }] } : {}),
  }));
  const directDependencyPurls = Object.keys(rootDependencies).flatMap((name) => {
    const path = resolveChild("", name, lockfile.packages);
    if (path && options.includeDevDependencies === false && lockfile.packages[path]?.dev) return [];
    const childPurl = path ? purlByPath.get(path) : undefined;
    return childPurl ? [childPurl] : [];
  });
  const dependencyMap = new Map<string, Set<string>>();
  for (const purl of directDependencyPurls) dependencyMap.set(rootComponent["bom-ref"], new Set([...(dependencyMap.get(rootComponent["bom-ref"]) || []), purl]));
  for (const edge of edgeInputs) {
    const parentPurl = componentRows.find((item) => item.id === edge.parentComponentId)!.purl;
    const childPurl = componentRows.find((item) => item.id === edge.childComponentId)!.purl;
    if (!dependencyMap.has(parentPurl)) dependencyMap.set(parentPurl, new Set());
    dependencyMap.get(parentPurl)!.add(childPurl);
  }
  const dependencies = [...dependencyMap].map(([ref, dependsOn]) => ({ ref, dependsOn: [...dependsOn] }));
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: { timestamp: new Date().toISOString(), tools: { components: [{ type: "application", name: "SupplyGuard", version: "1.0.0" }] }, component: rootComponent },
    components: sbomComponents,
    dependencies,
  };

  const [vulnerabilityCount, licenseReviewCount] = await Promise.all([
    prisma.vulnerabilityFinding.count({ where: { scanJobId: job.id } }),
    prisma.licenseFinding.count({ where: { scanJobId: job.id, decision: "REVIEW" } }),
  ]);
  await prisma.scanJob.update({ where: { id: job.id }, data: {
    status: "COMPLETED",
    stage: null,
    completedAt: new Date(),
    componentCount: components.length,
    vulnerabilityCount,
    licenseReviewCount,
    sbom,
    vulnerabilityCheckStatus,
    vulnerabilityCheckError,
    licenseCheckStatus,
  } });
}

export async function processScan(scanJobId: string) {
  const job = await loadJob(scanJobId);
  if (!job) throw new Error("Scan job no longer exists.");
  await prisma.scanJob.update({ where: { id: job.id }, data: { status: "RUNNING", stage: "fetching", startedAt: new Date(), errorCode: null, errorMessage: null } });
  const lockfile = job.lockfile as unknown as Lockfile | null;
  if (!lockfile || typeof lockfile !== "object" || !lockfile.packages) throw new Error("This scan has no lockfile to analyze.");
  await analyzeLockfile(job, lockfile, (job.options || {}) as ScanOptions);
}

export async function processRepositoryScan(scanJobId: string) {
  const job = await loadJob(scanJobId);
  if (!job) throw new Error("Scan job no longer exists.");
  if (!job.repositoryUrl) throw new Error("This scan has no repository URL.");
  let accessToken: string | null = null;
  if (job.createdById) {
    const owned = await prisma.gitHubConnection.findUnique({ where: { userId: job.createdById } });
    accessToken = owned?.accessToken || null;
  }
  if (!accessToken) {
    const workspaceConnection = await prisma.gitHubConnection.findFirst({ where: { user: { memberships: { some: { workspaceId: job.workspaceId } } } } });
    accessToken = workspaceConnection?.accessToken || null;
  }
  await prisma.scanJob.update({ where: { id: job.id }, data: { status: "RUNNING", stage: "fetching", startedAt: new Date(), errorCode: null, errorMessage: null } });
  let directory: string | null = null;
  try {
    directory = await cloneRepository(job.repositoryUrl, job.branch || "main", accessToken);
    const lockfilePath = await findLockfile(directory);
    const parsed: unknown = JSON.parse(await readFile(lockfilePath, "utf8"));
    const record = parsed as { lockfileVersion?: number; packages?: unknown };
    if (![2, 3].includes(record?.lockfileVersion || 0) || !record?.packages || typeof record.packages !== "object") {
      throw new Error("The repository lockfile must be an npm package-lock.json with lockfile version 2 or 3.");
    }
    await prisma.scanJob.update({ where: { id: job.id }, data: { lockfile: parsed as Prisma.InputJsonValue, uploadName: path.basename(lockfilePath) } });
    await analyzeLockfile(job, parsed as unknown as Lockfile, (job.options || {}) as ScanOptions);
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
