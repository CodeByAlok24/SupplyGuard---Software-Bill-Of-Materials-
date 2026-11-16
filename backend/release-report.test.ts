import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/supplyguard_test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";

const { app } = await import("./api.js");
const { prisma } = await import("./db.js");
const { csvCell, buildReleaseEvidenceReport, buildReleaseEvidenceCsv } = await import("./release-report.js");

const PASSWORD = "test-password-123";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SBOM_DIGEST = `sha256:${"9".repeat(64)}`;
const ARTIFACT_DIGEST = `sha256:${"8".repeat(64)}`;

async function makeWorkspace(label: string) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const user = await prisma.user.create({ data: { email: `rr-${label}-${suffix}@example.test`, name: `RR Test ${label}`, passwordHash: hash } });
  const workspace = await prisma.workspace.create({ data: { name: `RR Workspace ${label}`, slug: `rr-${label}-${suffix}`, createdAt: new Date() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, name: `RR Project ${label}` } });
  return { user, workspace, project };
}

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(response.status, "login should succeed").toBe(200);
  return agent;
}

type Fixture = Awaited<ReturnType<typeof makeWorkspace>>;
let full: Fixture;      // completed scan with evidence hooked up
let empty: Fixture;     // completed scan with zero evidence
let fullScanId: string;
let emptyScanId: string;

beforeAll(async () => {
  await prisma.provenanceAttestation.deleteMany();
  await prisma.releaseEvidence.deleteMany();
  await prisma.serviceLevelObjective.deleteMany();
  await prisma.report.deleteMany();
  await prisma.reviewDecision.deleteMany();
  await prisma.licenseFinding.deleteMany();
  await prisma.vulnerabilityFinding.deleteMany();
  await prisma.dependencyEdge.deleteMany();
  await prisma.component.deleteMany();
  await prisma.scanJob.deleteMany();
  await prisma.sbomComparison.deleteMany();
  await prisma.sbomUpload.deleteMany();
  await prisma.project.deleteMany();
  await prisma.licensePolicy.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.gitHubConnection.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  async function completedScan(fixture: Fixture, componentName: string) {
    const scan = await prisma.scanJob.create({
      data: {
        workspaceId: fixture.workspace.id,
        projectId: fixture.project.id,
        status: "COMPLETED",
        source: "upload",
        uploadName: "package-lock.json",
        repositoryUrl: "https://github.com/CodeByAlok24/example.git",
        branch: "main",
        completedAt: new Date("2026-11-14T12:00:00.000Z"),
        componentCount: 2,
        vulnerabilityCount: 1,
        licenseReviewCount: 1,
        vulnerabilityCheckStatus: "COMPLETED",
        licenseCheckStatus: "COMPLETED",
        sbomDigest: SBOM_DIGEST,
      },
    });
    const root = await prisma.component.create({ data: { scanJobId: scan.id, purl: "pkg:npm/app@1.0.0", name: "app", version: "1.0.0", dependencyType: "DIRECT" } });
    const lib = await prisma.component.create({ data: { scanJobId: scan.id, purl: `pkg:npm/${componentName}@1.0.0`, name: componentName, version: "1.0.0" } });
    await prisma.dependencyEdge.create({ data: { scanJobId: scan.id, parentComponentId: root.id, childComponentId: lib.id } });
    await prisma.vulnerabilityFinding.create({ data: { scanJobId: scan.id, componentId: lib.id, osvId: "GHSA-report-test", aliases: ["CVE-2026-0001"], summary: "Injected advisory", severity: "HIGH" } });
    await prisma.licenseFinding.create({ data: { scanJobId: scan.id, componentId: lib.id, observedExpression: "MIT", decision: "ALLOW" } });
    return scan;
  }

  full = await makeWorkspace("full");
  const fullScan = await completedScan(full, "left-pad");
  fullScanId = fullScan.id;
  const evidence = await prisma.releaseEvidence.create({ data: {
    workspaceId: full.workspace.id,
    projectId: full.project.id,
    scanJobId: fullScan.id,
    repositoryUrl: "https://github.com/CodeByAlok24/example.git",
    commitSha: "b".repeat(40),
    sbomName: "example.cdx.json",
    sbomFormat: "CycloneDX 1.6",
    sbomDigest: SBOM_DIGEST,
    artifactName: "ghcr.io/example/app:report",
    artifactDigest: ARTIFACT_DIGEST,
    buildProvider: "github-actions",
    buildWorkflow: "release.yml",
    buildRunId: "777",
    deployService: "api",
    deployEnvironment: "production",
    deployRegion: "eu-central-1",
    deployAt: new Date("2026-11-14T14:00:00.000Z"),
    evidenceSource: "MANUAL",
    verificationState: "USER_ASSERTED",
    createdById: full.user.id,
  } });
  await prisma.provenanceAttestation.create({ data: {
    evidenceId: evidence.id,
    workspaceId: full.workspace.id,
    envelope: "statement",
    predicateType: "https://slsa.dev/provenance/v1",
    statementType: "https://in-toto.io/Statement/v1",
    payloadDigest: `sha256:${"7".repeat(64)}`,
    rawBytes: 2048,
    subjectName: "ghcr.io/example/app:report",
    subjectDigest: ARTIFACT_DIGEST,
    subjectCount: 1,
    subjects: [{ name: "ghcr.io/example/app:report", digest: { sha256: "8".repeat(64) } }],
    subjectMatchesArtifact: true,
    builderId: "https://github.com/actions/runner/v2",
    buildType: "https://github.com/actions/build-type-v1",
    buildInvocationId: "run-777",
    sourceRepoUrl: "git+https://github.com/CodeByAlok24/example.git",
    sourceRevision: "b".repeat(40),
    materials: [{ uri: "git+https://github.com/CodeByAlok24/example.git", digest: { gitCommit: "b".repeat(40) } }],
    signatureCount: 0,
    signatureState: "unverified",
    createdById: full.user.id,
  } });
  await prisma.serviceLevelObjective.create({ data: {
    workspaceId: full.workspace.id,
    projectId: full.project.id,
    service: "api",
    environment: "production",
    name: "Availability",
    target: 99.9,
    indicatorName: "availability_ratio",
    observedValue: 99.95,
    windowDays: 30,
    observedAt: new Date("2026-11-13T12:00:00.000Z"),
    source: "MANUAL",
    createdById: full.user.id,
  } });
  await prisma.serviceLevelObjective.create({ data: {
    workspaceId: full.workspace.id,
    projectId: full.project.id,
    service: "api",
    environment: "production",
    name: "Latency (report-only)",
    target: 95,
    indicatorName: "p95_latency_ratio",
    source: "MANUAL",
    createdById: full.user.id,
  } });

  empty = await makeWorkspace("empty");
  const emptyScan = await completedScan(empty, "=SUM(1,1)"); // spreadsheet-formula component name
  emptyScanId = emptyScan.id;
});

afterAll(async () => {
  await prisma.provenanceAttestation.deleteMany();
  await prisma.releaseEvidence.deleteMany();
  await prisma.serviceLevelObjective.deleteMany();
  await prisma.report.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("csvCell", () => {
  it("wraps plain values in quotes", () => {
    expect(csvCell("hello")).toBe('"hello"');
    expect(csvCell("")).toBe('""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
  it("doubles embedded quotes", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("neutralizes formula injection: leading = + - @", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(csvCell("+1+1")).toBe("\"'+1+1\"");
    expect(csvCell("-10+20")).toBe("\"'-10+20\"");
    expect(csvCell("@SUM(1)")).toBe("\"'@SUM(1)\"");
  });
  it("neutralizes formula injection after leading whitespace/tabs/CR", () => {
    expect(csvCell("  =1+1")).toBe("\"'  =1+1\"");
    expect(csvCell("\t=1+1")).toBe("\"'\t=1+1\"");
    expect(csvCell("\r=1+1")).toBe("\"'\r=1+1\"");
  });
  it("does not touch equals signs that are not the leading character", () => {
    expect(csvCell("a=b")).toBe('"a=b"');
    expect(csvCell("license = MIT")).toBe('"license = MIT"');
  });
});

describe("buildReleaseEvidenceReport", () => {
  it("returns null for an unknown scan", async () => {
    expect(await buildReleaseEvidenceReport("does-not-exist", full.workspace.id)).toBeNull();
  });

  it("includes project, scan, SBOM identity/digest, evidence, attestation and SLOs", async () => {
    const report = await buildReleaseEvidenceReport(fullScanId, full.workspace.id, new Date("2026-11-14T18:00:00.000Z"));
    expect(report).not.toBeNull();
    expect(report!.generatedAt).toBe("2026-11-14T18:00:00.000Z");
    expect(report!.project.name).toBe(`RR Project full`);
    expect(report!.scan.id).toBe(fullScanId);
    expect(report!.scan.sbomFormat).toBe("CycloneDX 1.6");
    expect(report!.scan.sbomDigest).toBe(SBOM_DIGEST);
    expect(report!.scan.osvCheck).toBe("completed");

    expect(report!.releaseEvidence).toHaveLength(1);
    const entry = report!.releaseEvidence[0];
    expect(entry.linkedToThisScan).toBe(true);
    expect(entry.artifactDigest).toBe(ARTIFACT_DIGEST);
    expect(entry.deployService).toBe("api");
    expect(entry.deployEnvironment).toBe("production");
    expect(entry.evidenceStale).toBe(false);
    // attestation embedded, always unverified
    expect(entry.attestation).not.toBeNull();
    expect(entry.attestation!.signatureState).toBe("unverified");
    expect(entry.attestation!.subjectMatchesArtifact).toBe(true);
    expect(entry.attestation!.sourceRepoUrl).toBe("git+https://github.com/CodeByAlok24/example.git");
    expect(entry.attestation!.sourceRevision).toBe("b".repeat(40));

    // findings carry impact and both are verified + attributed to api/production
    expect(report!.findings.vulnerabilities).toHaveLength(1);
    expect(report!.findings.vulnerabilities[0].impact?.status).toBe("verified");
    expect(report!.findings.vulnerabilities[0].impact?.services[0].slos.map((slo) => slo.name)).toContain("Availability");
    expect(report!.findings.licenses[0].impact?.status).toBe("verified");
    expect(report!.impactStatusCounts.verified).toBe(2);

    // SLOs are manual, with observation timestamps where set; one not_calculable
    expect(report!.slos).toHaveLength(2);
    const availability = report!.slos.find((slo) => slo.name === "Availability")!;
    expect(availability.source).toBe("manual");
    expect(availability.observedAt).toBe("2026-11-13T12:00:00.000Z");
    expect(availability.errorBudget.status).toBe("within");
    const latency = report!.slos.find((slo) => slo.name.startsWith("Latency"))!;
    expect(latency.errorBudget.status).toBe("not_calculable");
    expect(latency.observedValue).toBeNull();

    // rules & limitations are embedded and non-empty
    expect(report!.rules.length).toBeGreaterThanOrEqual(5);
    expect(report!.limitations.length).toBeGreaterThanOrEqual(5);
  });

  it("never leaks secrets or filesystem paths into the report", async () => {
    const report = await buildReleaseEvidenceReport(fullScanId, full.workspace.id);
    const text = JSON.stringify(report);
    for (const forbidden of ["DATABASE_URL", "JWT_SECRET", "process.env", "SMTP_PASS", "/tmp/", "/home/", "AKIA", "nodemailer"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("represents missing evidence honestly in an empty-evidence scan", async () => {
    const report = await buildReleaseEvidenceReport(emptyScanId, empty.workspace.id);
    expect(report).not.toBeNull();
    expect(report!.releaseEvidence).toEqual([]);
    expect(report!.findings.vulnerabilities[0].impact?.status).toBe("missing");
    expect(report!.findings.licenses[0].impact?.status).toBe("missing");
    expect(report!.impactStatusCounts.missing).toBe(2);
    expect(report!.slos).toEqual([]);
  });
});

describe("buildReleaseEvidenceCsv", () => {
  it("emits one row per finding x deployment and neutralizes formula cells", async () => {
    const csv = await buildReleaseEvidenceCsv(fullScanId, full.workspace.id);
    expect(csv).not.toBeNull();
    const lines = csv!.trimEnd().split("\n");
    expect(lines[0]).toContain("findingType,findingId,component");
    expect(lines.length).toBe(3); // 1 vuln + 1 license, each with 1 deployment row
    const vulnRow = lines.find((line) => line.startsWith('"vulnerability"'))!;
    expect(vulnRow).toContain('"HIGH"');
    expect(vulnRow).toContain('"api"');
    expect(vulnRow).toContain('"production"');
    expect(vulnRow).toContain('"Availability; Latency (report-only)"');
    const licenseRow = lines.find((line) => line.startsWith('"license"'))!;
    expect(licenseRow).toContain('"ALLOW"');
  });

  it("neutralizes a spreadsheet-formula component name in the missing-evidence scan", async () => {
    const csv = await buildReleaseEvidenceCsv(emptyScanId, empty.workspace.id);
    const lines = csv!.trimEnd().split("\n");
    const licenseRow = lines.find((line) => line.startsWith('"license"'))!;
    // component name is the 3rd cell
    const cells = licenseRow.match(/"(?:[^"]|"")*"/g)!;
    expect(cells[2]).toBe("\"'=SUM(1,1)\"");
  });
});

describe("report API endpoints", () => {
  it("generates and downloads a release-evidence JSON report", async () => {
    const agent = await loginAgent(full.user.email);
    const created = await agent.post("/api/v1/reports").send({ scanJobId: fullScanId, format: "release-evidence-json" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.item.name).toMatch(/^RR-Project-full-release-evidence-[0-9a-f]{12}\.json$/);
    const download = await agent.get(`/api/v1/reports/${created.body.item.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("application/json");
    const parsed = JSON.parse(download.text);
    expect(parsed.report).toBe("supplyguard-release-evidence");
    expect(parsed.scan.sbomDigest).toBe(SBOM_DIGEST);
    expect(parsed.releaseEvidence[0].attestation.signatureState).toBe("unverified");
    expect(parsed.findings.vulnerabilities[0].impact.status).toBe("verified");
  });

  it("generates and downloads the CSV variant with escaped cells", async () => {
    const agent = await loginAgent(empty.user.email);
    const created = await agent.post("/api/v1/reports").send({ scanJobId: emptyScanId, format: "release-evidence-csv" });
    expect(created.status).toBe(201);
    const download = await agent.get(`/api/v1/reports/${created.body.item.id}/download`);
    expect(download.headers["content-type"]).toContain("text/csv");
    expect(download.text).toContain('"' + "'=SUM(1,1)" + '"');
  });

  it("rejects unknown report formats", async () => {
    const agent = await loginAgent(full.user.email);
    const response = await agent.post("/api/v1/reports").send({ scanJobId: fullScanId, format: "release-evidence-xml" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_report");
  });

  it("licenses-csv and vulnerabilities-csv now escape formula cells", async () => {
    const agent = await loginAgent(empty.user.email);
    const licenses = await agent.post("/api/v1/reports").send({ scanJobId: emptyScanId, format: "licenses-csv" });
    expect(licenses.status).toBe(201);
    const download = await agent.get(`/api/v1/reports/${licenses.body.item.id}/download`);
    expect(download.text).toContain('"' + "'=SUM(1,1)" + '"');
  });
});
