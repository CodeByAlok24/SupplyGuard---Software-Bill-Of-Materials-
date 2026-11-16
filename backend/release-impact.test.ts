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
const { buildImpact } = await import("./release-impact.js");

const PASSWORD = "test-password-123";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function makeWorkspace(label: string, role: string) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const user = await prisma.user.create({ data: { email: `ri-${label}-${suffix}@example.test`, name: `RI Test ${label}`, passwordHash: hash } });
  const workspace = await prisma.workspace.create({ data: { name: `RI Workspace ${label}`, slug: `ri-${label}-${suffix}`, createdAt: new Date() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: role as never } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, name: `RI Project ${label}` } });
  return { user, workspace, project };
}

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(response.status, "login should succeed").toBe(200);
  return agent;
}

type Fixture = Awaited<ReturnType<typeof makeWorkspace>>;
let fixtureA: Fixture; // workspace with a completed scan, findings and evidence
let fixtureB: Fixture; // another workspace (isolation checks)

// helpers to build the in-memory inputs for buildImpact
const comp = (id: string, name: string, version: string, purl: string) => ({ id, name, version, purl });
const edge = (p: string, c: string) => ({ parentComponentId: p, childComponentId: c });

describe("buildImpact (unit)", () => {
  const job = { id: "scan-1", completedAt: new Date("2026-11-14T12:00:00.000Z"), sbomDigest: "sha256:" + "a".repeat(64) };
  const components = [comp("root", "app", "1.0.0", "pkg:npm/app@1.0.0"), comp("lib", "handlebars", "4.7.9", "pkg:npm/handlebars@4.7.9")];
  const edges = [edge("root", "lib")];
  const vulnerabilities = [{ id: "vuln-1", componentId: "lib", severity: "HIGH", osvId: "GHSA-test" }];
  const licenses = [{ id: "lic-1", componentId: "lib", decision: "REVIEW" as const, observedExpression: "MIT" }];
  const baseEvidence = (over: Partial<{ id: string; scanJobId: string | null; sbomDigest: string | null; updatedAt: Date; artifactName: string | null; artifactDigest: string | null; deployService: string | null; deployEnvironment: string | null; deployRegion: string | null; verificationState: "UNVERIFIED" | "USER_ASSERTED" }>) => ({
    id: over.id ?? "ev-1",
    scanJobId: over.scanJobId ?? null,
    sbomDigest: over.sbomDigest ?? null,
    updatedAt: over.updatedAt ?? new Date("2026-11-14T13:00:00.000Z"),
    artifactName: over.artifactName ?? null,
    artifactDigest: over.artifactDigest ?? null,
    deployService: over.deployService ?? null,
    deployEnvironment: over.deployEnvironment ?? null,
    deployRegion: over.deployRegion ?? null,
    verificationState: over.verificationState ?? ("UNVERIFIED" as const),
  });

  it("matches a bare-hex scan digest against prefixed evidence digest (normalisation both ways)", () => {
    const bareJob = { id: "scan-3", completedAt: new Date("2026-11-14T12:00:00.000Z"), sbomDigest: "a".repeat(64) };
    const result = buildImpact({
      job: bareJob,
      components,
      edges,
      vulnerabilities,
      licenses,
      evidence: [baseEvidence({ sbomDigest: "sha256:" + "a".repeat(64), deployService: "api" })],
    });
    for (const entry of result) {
      expect(entry.status).toBe("verified");
      expect(entry.services[0]?.service).toBe("api");
    }
  });

  it("returns missing when no evidence exists", () => {
    const result = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence: [] });
    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.status).toBe("missing");
      expect(entry.services).toHaveLength(0);
      expect(entry.reason).toMatch(/no release evidence/i);
      expect(entry.dependencyPath.map((p) => p.name)).toEqual(["app", "handlebars"]);
    }
  });

  it("returns verified when SBOM digest matches evidence exactly and lists the deployment", () => {
    const result = buildImpact({
      job,
      components,
      edges,
      vulnerabilities,
      licenses,
      evidence: [baseEvidence({ id: "ev-verified", sbomDigest: job.sbomDigest, deployService: "api", deployEnvironment: "production", deployRegion: "eu-central-1", artifactName: "ghcr.io/x/y:1", artifactDigest: "sha256:" + "b".repeat(64), verificationState: "USER_ASSERTED", updatedAt: new Date("2026-11-14T13:00:00.000Z") })],
    });
    for (const entry of result) {
      expect(entry.status).toBe("verified");
      expect(entry.stale).toBe(false);
      expect(entry.services).toHaveLength(1);
      expect(entry.services[0]).toMatchObject({ service: "api", environment: "production", region: "eu-central-1", artifactName: "ghcr.io/x/y:1", source: "manual", verificationState: "USER_ASSERTED", evidenceId: "ev-verified" });
    }
  });

  it("returns linked when evidence references the scan explicitly, without digest match", () => {
    const result = buildImpact({
      job,
      components,
      edges,
      vulnerabilities,
      licenses,
      evidence: [baseEvidence({ id: "ev-linked", scanJobId: job.id, deployService: "web", deployEnvironment: "staging" })],
    });
    for (const entry of result) {
      expect(entry.status).toBe("linked");
      expect(entry.services[0]?.service).toBe("web");
    }
  });

  it("returns unverified when evidence exists but matches neither scan nor digest", () => {
    const result = buildImpact({
      job,
      components,
      edges,
      vulnerabilities,
      licenses,
      evidence: [baseEvidence({ id: "ev-other", sbomDigest: "sha256:" + "f".repeat(64), deployService: "worker" })],
    });
    for (const entry of result) {
      expect(entry.status).toBe("unverified");
      expect(entry.services).toHaveLength(0); // no claim about deployments
    }
  });

  it("flags stale when evidence was registered before the scan completed", () => {
    const result = buildImpact({
      job,
      components,
      edges,
      vulnerabilities,
      licenses,
      evidence: [baseEvidence({ sbomDigest: job.sbomDigest, updatedAt: new Date("2026-11-01T00:00:00.000Z"), deployService: "api" })],
    });
    for (const entry of result) expect(entry.stale).toBe(true);
  });

  it("handles missing completedAt or sbomDigest honestly", () => {
    const inProgress = { id: "scan-2", completedAt: null, sbomDigest: null };
    const result = buildImpact({ job: inProgress, components, edges, vulnerabilities, licenses, evidence: [baseEvidence({ sbomDigest: "sha256:" + "a".repeat(64) })] });
    for (const entry of result) {
      expect(entry.status).toBe("unverified"); // digest cannot match when scan has none
    }
  });

  it("never changes severity — carries component info through", () => {
    const result = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence: [] });
    const vuln = result.find((entry) => entry.findingType === "vulnerability");
    expect(vuln?.componentName).toBe("handlebars");
    expect(vuln?.componentVersion).toBe("4.7.9");
    expect(vuln?.componentPurl).toBe("pkg:npm/handlebars@4.7.9");
  });
});

describe("impact API", () => {
  let scanA: { id: string };
  let sbomDigestA: string;

  beforeAll(async () => {
    fixtureA = await makeWorkspace("a", "OWNER");
    fixtureB = await makeWorkspace("b", "OWNER");

    const scan = await prisma.scanJob.create({
      data: {
        workspaceId: fixtureA.workspace.id,
        projectId: fixtureA.project.id,
        status: "COMPLETED",
        source: "upload",
        uploadName: "package-lock.json",
        completedAt: new Date("2026-11-14T12:00:00.000Z"),
        componentCount: 2,
        vulnerabilityCount: 1,
        licenseReviewCount: 1,
        vulnerabilityCheckStatus: "COMPLETED",
        licenseCheckStatus: "COMPLETED",
      },
    });
    scanA = scan;
    sbomDigestA = "sha256:" + "e".repeat(64);
    await prisma.scanJob.update({ where: { id: scan.id }, data: { sbomDigest: sbomDigestA } });

    const root = await prisma.component.create({ data: { scanJobId: scan.id, purl: "pkg:npm/app@1.0.0", name: "app", version: "1.0.0", dependencyType: "DIRECT" } });
    const lib = await prisma.component.create({ data: { scanJobId: scan.id, purl: "pkg:npm/handlebars@4.7.9", name: "handlebars", version: "4.7.9" } });
    await prisma.dependencyEdge.create({ data: { scanJobId: scan.id, parentComponentId: root.id, childComponentId: lib.id } });
    await prisma.vulnerabilityFinding.create({ data: { scanJobId: scan.id, componentId: lib.id, osvId: "GHSA-test-0001", aliases: ["CVE-0000-0001"], severity: "HIGH", summary: "Test advisory" } });
    await prisma.licenseFinding.create({ data: { scanJobId: scan.id, componentId: lib.id, observedExpression: "MIT", decision: "REVIEW" } });
  });

  afterAll(async () => {
    await prisma.dependencyEdge.deleteMany();
    await prisma.vulnerabilityFinding.deleteMany();
    await prisma.licenseFinding.deleteMany();
    await prisma.component.deleteMany();
    await prisma.scanJob.deleteMany();
    await prisma.releaseEvidence.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("returns missing across the board when no evidence exists", async () => {
    const agent = await loginAgent(fixtureA.user.email);
    const response = await agent.get(`/api/v1/scans/${scanA.id}/impact`);
    expect(response.status).toBe(200);
    expect(response.body.item.scan.sbomDigest).toBe(sbomDigestA);
    expect(response.body.item.impact).toHaveLength(2);
    for (const entry of response.body.item.impact) expect(entry.status).toBe("missing");
  });

  it("returns verified once evidence with a matching digest is registered, with deployment details", async () => {
    const agent = await loginAgent(fixtureA.user.email);
    const created = await agent.post(`/api/v1/projects/${fixtureA.project.id}/release-evidence`).send({
      scanJobId: scanA.id,
      sbomDigest: sbomDigestA,
      artifactName: "ghcr.io/example/app:v1",
      artifactDigest: "sha256:" + "c".repeat(64),
      deployService: "api",
      deployEnvironment: "production",
      deployRegion: "eu-central-1",
      deployAt: "2026-11-14T14:00:00.000Z",
      verificationState: "USER_ASSERTED",
    });
    expect(created.status).toBe(201);

    const response = await agent.get(`/api/v1/scans/${scanA.id}/impact`);
    expect(response.status).toBe(200);
    for (const entry of response.body.item.impact) {
      expect(entry.status).toBe("verified");
      expect(entry.services).toHaveLength(1);
      expect(entry.services[0].environment).toBe("production");
    }

    // review endpoint carries the same impact per finding
    const review = await agent.get(`/api/v1/scans/${scanA.id}/review`);
    expect(review.status).toBe(200);
    const vulnImpact = review.body.item.findings.vulnerabilities[0].impact;
    expect(vulnImpact?.status).toBe("verified");
    const licImpact = review.body.item.findings.licenses[0].impact;
    expect(licImpact?.status).toBe("verified");
    expect(review.body.item.evidence.sbomDigest).toBe(sbomDigestA);
  });

  it("cross-workspace isolation: cannot see or compute impact for another workspace's scan", async () => {
    const agentB = await loginAgent(fixtureB.user.email);
    expect((await agentB.get(`/api/v1/scans/${scanA.id}/impact`)).status).toBe(404);
    expect((await agentB.get(`/api/v1/scans/${scanA.id}/review`)).status).toBe(404);
    const list = await agentB.get(`/api/v1/projects/${fixtureB.project.id}/release-evidence`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it("unauthenticated access is rejected", async () => {
    expect((await request(app).get(`/api/v1/scans/${scanA.id}/impact`)).status).toBe(401);
  });
});
