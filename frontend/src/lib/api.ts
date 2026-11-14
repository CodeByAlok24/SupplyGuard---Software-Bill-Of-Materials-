export type WorkspaceRole = "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";
export type LicenseDecision = "ALLOW" | "BLOCK" | "REVIEW";

export type User = { id: string; name: string; email: string };
export type Workspace = { id: string; name: string; slug?: string; role: WorkspaceRole };
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  repositoryUrl: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
  scans?: Array<{ id: string; status: string; stage?: string | null; componentCount: number; vulnerabilityCount: number; licenseReviewCount: number; createdAt: string; vulnerabilityCheckStatus: string; vulnerabilityCheckError?: string | null; licenseCheckStatus: string; licenseCheckError?: string | null }>;
};
export type ScanProgressItem = { purl: string; name: string; version: string; direct: boolean; license: string | null; licenseStatus: "done" | "pending"; advisories: number; maxSeverity: string | null };
export type ScanProgress = { total: number; processed: number; items: ScanProgressItem[]; capped: boolean; updatedAt: string } | null;
export type ScanJob = {
  id: string;
  project: { id: string; name: string };
  status: "queued" | "running" | "completed" | "failed";
  stage?: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: { code: string | null; message: string } | null;
  counts: { components: number; vulnerabilities: number; licenseReview: number };
  integrations: { osv: { status: string; error: string | null }; licenses: { status: string; error: string | null } };
  progress?: ScanProgress;
};
export type LicenseFinding = {
  id: string;
  observedExpression: string | null;
  observationSource: string | null;
  decision: LicenseDecision;
  policyRule: string | null;
  reviewStatus: string;
  component: { id: string; name: string; version: string; purl: string; licenseExpression: string | null; licenseSource: string | null };
  scanJob: { id: string; project: { id: string; name: string } };
  reviews: Array<{ decision: LicenseDecision; note: string | null; createdAt: string }>;
};
export type VulnerabilityFinding = {
  id: string;
  osvId: string;
  aliases: string[];
  summary: string | null;
  severity: string | null;
  cvssScore: number | null;
  modifiedAt: string | null;
  affected: unknown;
  component: { id: string; name: string; version: string; purl: string };
  scanJob: { id: string; vulnerabilityCheckStatus: string; vulnerabilityCheckError: string | null; project: { id: string; name: string } };
};
export type ComponentRecord = {
  id: string;
  purl: string;
  name: string;
  version: string;
  packageType: string;
  licenseExpression: string | null;
  dependencyType: "DIRECT" | "TRANSITIVE";
  licenseSource: string | null;
  licenseObservedAt: string | null;
  licenseFindings: Array<{ id: string; decision: LicenseDecision; reviewStatus: string }>;
  vulnerabilities: Array<{ id: string; osvId: string; severity: string | null; summary: string | null }>;
};
export type SbomUpload = { id: string; fileName: string; format: string; componentCount: number; createdAt: string };
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
export type SbomComparisonItem = { id: string; project: { id: string; name: string }; sbomUpload: { id: string; fileName: string; componentCount: number; createdAt: string } | null; coverageScore: number; matchedComponents: number; createdAt: string; report: CoverageReport };
export type DependencyRelationship = {
  id: string;
  parent: { purl: string; name: string; version: string };
  child: { purl: string; name: string; version: string };
};
export type GateCheck = { id: string; label: string; status: "pass" | "review" | "fail"; detail: string };
export type ScanReviewVulnerability = { id: string; osvId: string; aliases: string[]; summary: string | null; severity: string | null; cvssScore: number | null; modifiedAt: string | null; component: { id: string; name: string; version: string; purl: string } };
export type ScanReviewLicense = { id: string; observedExpression: string | null; observationSource: string | null; decision: LicenseDecision; policyRule: string | null; reviewStatus: string; component: { id: string; name: string; version: string; purl: string }; reviews: Array<{ decision: LicenseDecision; note: string | null; createdAt: string }> };
export type ScanDiffVulnerability = { osvId: string; component: string; version: string; severity: string | null; summary: string | null };
export type ScanReview = {
  scan: {
    id: string;
    project: { id: string; name: string };
    status: string;
    stage: string | null;
    source: string;
    uploadName: string | null;
    repositoryUrl: string | null;
    branch: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    counts: { components: number; vulnerabilities: number; licenseReview: number };
    integrations: { osv: { status: string; error: string | null }; licenses: { status: string; error: string | null } };
  };
  gate: { verdict: "READY" | "REVIEW" | "BLOCKED"; checks: GateCheck[]; note: string };
  remediation: Array<{
    componentId: string;
    name: string;
    version: string;
    fixedVersion: string | null;
    severity: string | null;
    advisories: Array<{ osvId: string; summary: string | null; severity: string | null }>;
    command: string | null;
    path: Array<{ name: string; version: string }>;
    direct: boolean;
  }>;
  diff: null | {
    previousScanId: string;
    previousCompletedAt: string | null;
    vulnerabilities: { added: ScanDiffVulnerability[]; resolved: ScanDiffVulnerability[] };
    components: { added: Array<{ name: string; version: string }>; removed: Array<{ name: string; version: string }>; upgraded: Array<{ name: string; from: string; to: string }> };
    licenseChanges: Array<{ name: string; from: string | null; to: string | null }>;
  };
  severityCounts: { critical: number; high: number; moderate: number; low: number; unknown: number };
  findings: { vulnerabilities: ScanReviewVulnerability[]; licenses: ScanReviewLicense[] };
};
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

/** Absolute URL for API endpoints (used for top-level navigations such as OAuth redirects). */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError(`Could not connect to the SupplyGuard API at ${API_BASE}.`, 0, "api_unavailable");
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as ApiErrorBody | T | null;
  if (!response.ok) {
    const apiError = body && typeof body === "object" && "error" in body ? body.error : undefined;
    throw new ApiError(apiError?.message || `Request failed (${response.status}).`, response.status, apiError?.code || "request_failed");
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string; workspaceName: string }) => request<{ user: User; workspace: Workspace }>("/auth/register", json(body)),
    login: (body: { email: string; password: string; rememberMe?: boolean }) => request<{ user: User; workspace: Workspace }>("/auth/login", json(body)),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
    me: () => request<{ user: User; workspace: Workspace }>("/auth/me"),
    forgotPassword: (email: string) => request<{ message: string }>("/auth/forgot-password", json({ email })),
    resetPassword: (token: string, password: string) => request<{ message: string }>("/auth/reset-password", json({ token, password })),
    googleStatus: () => request<{ configured: boolean }>("/auth/google/status"),
    githubStatus: () => request<{ configured: boolean }>("/auth/github/status"),
  },
  github: {
    settings: () =>
      request<{ configured: boolean; connected: boolean; source: string | null; login: string | null; name: string | null; scope: string | null; connectedAt: string | null }>("/settings/github"),
    connectPat: (token: string) =>
      request<{ connected: boolean; login: string; source: string }>("/settings/github/token", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    disconnect: () => request<void>("/settings/github", { method: "DELETE" }),
    repos: () =>
      request<{ items: Array<{ id: number; name: string; fullName: string; description: string | null; private: boolean; htmlUrl: string; cloneUrl: string; defaultBranch: string }> }>("/github/repos"),
    check: (owner: string, repo: string) =>
      request<{ found: boolean; branch?: string; private?: boolean; htmlUrl?: string; path?: string; lockfileVersion?: number; packageCount?: number; directDependencies?: number; projectName?: string }>(
        `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check`,
      ),
  },
  projects: {
    list: () => request<{ items: Project[] }>("/projects"),
    create: (body: { name: string; repositoryUrl?: string; defaultBranch?: string }) => request<{ item: Project }>("/projects", json(body)),
    get: (id: string) => request<{ item: Project }>(`/projects/${encodeURIComponent(id)}`),
    update: (id: string, body: Partial<Pick<Project, "name" | "repositoryUrl" | "defaultBranch">>) => request<{ item: Project }>(`/projects/${encodeURIComponent(id)}`, { ...json(body), method: "PATCH" }),
    delete: (id: string) => request<void>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
    components: (id: string) => request<{ items: ComponentRecord[]; dependencies: DependencyRelationship[] }>(`/projects/${encodeURIComponent(id)}/components`),
    startUploadScan: (id: string, file: File, options: { includeTransitive: boolean; includeDevDependencies: boolean; lookupLicenses: boolean }) => {
      const form = new FormData();
      form.set("file", file);
      Object.entries(options).forEach(([key, value]) => form.set(key, String(value)));
      return request<{ jobId: string; status: string; message: string }>(`/projects/${encodeURIComponent(id)}/scans`, { method: "POST", body: form });
    },
    startRepositoryScan: (id: string, repositoryUrl: string, branch?: string) => request<{ jobId: string; status: string }>(`/projects/${encodeURIComponent(id)}/scans/repository`, { ...json({ repositoryUrl, branch }), method: "POST" }),
    listSbomUploads: (id: string) => request<{ items: SbomUpload[] }>(`/projects/${encodeURIComponent(id)}/sbom-uploads`),
    uploadSbom: (id: string, file: File) => {
      const form = new FormData();
      form.set("file", file);
      return request<{ item: SbomUpload }>(`/projects/${encodeURIComponent(id)}/sbom-uploads`, { method: "POST", body: form });
    },
  },
  scans: {
    get: (id: string) => request<{ item: ScanJob }>(`/scans/${encodeURIComponent(id)}`),
    review: (id: string) => request<{ item: ScanReview }>(`/scans/${encodeURIComponent(id)}/review`),
    downloadSbom: (id: string) => download(`/scans/${encodeURIComponent(id)}/sbom`),
  },
  licenses: {
    findings: () => request<{ items: LicenseFinding[] }>("/licenses/findings"),
    review: (id: string, body: { decision: LicenseDecision; note?: string }) => request<{ item: Record<string, unknown> }>(`/licenses/findings/${encodeURIComponent(id)}/review`, { ...json(body), method: "PATCH" }),
    policies: () => request<{ items: Array<{ id: string; licenseExpression: string; decision: LicenseDecision; note: string | null }> }>("/settings/license-policies"),
    savePolicies: (items: Array<{ licenseExpression: string; decision: LicenseDecision; note?: string }>) => request<{ items: Array<{ id: string; licenseExpression: string; decision: LicenseDecision; note: string | null }> }>("/settings/license-policies", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) }),
  },
  settings: {
    workspace: () => request<{ item: { id: string; name: string; slug: string; createdAt: string }; role: WorkspaceRole }>("/settings/workspace"),
    updateWorkspace: (name: string) => request<{ item: { id: string; name: string; slug: string; createdAt: string } }>("/settings/workspace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }),
    integrations: () => request<{ gitProvider: { configured: boolean; provider: string; privateRepositories: boolean }; osv: { configured: boolean; endpoint: string } }>("/settings/integrations"),
  },
  vulnerabilities: { findings: () => request<{ items: VulnerabilityFinding[] }>("/vulnerabilities/findings") },
  comparisons: {
    create: (scanJobId: string, sbomUploadId: string) => request<{ item: SbomComparisonItem }>(`/scans/${encodeURIComponent(scanJobId)}/compare`, json({ sbomUploadId })),
    get: (id: string) => request<{ item: SbomComparisonItem }>(`/comparisons/${encodeURIComponent(id)}`),
    downloadReport: (id: string) => download(`/comparisons/${encodeURIComponent(id)}/report`),
  },
  reports: {
    list: () => request<{ items: Array<{ id: string; name: string; format: string; createdAt: string; scanJob: { id: string; project: { name: string } } }> }>("/reports"),
    create: (scanJobId: string, format: "cyclonedx-json" | "licenses-csv" | "vulnerabilities-csv") => request<{ item: { id: string; name: string; format: string; createdAt: string } }>("/reports", json({ scanJobId, format })),
    download: (id: string) => download(`/reports/${encodeURIComponent(id)}/download`),
  },
};

async function download(path: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError(`Could not connect to the SupplyGuard API at ${API_BASE}.`, 0, "api_unavailable");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(body?.error?.message || `Download failed (${response.status}).`, response.status, body?.error?.code || "download_failed");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || "supplyguard-download";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
