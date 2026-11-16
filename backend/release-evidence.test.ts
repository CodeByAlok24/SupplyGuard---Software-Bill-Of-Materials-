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
const { normalizeDigest, normalizeSha, normalizeGitHubUrl, releaseEvidenceCreateSchema } = await import("./release-evidence.js");

const PASSWORD = "test-password-123";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function workspaceFixture(label: string, role: string) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const user = await prisma.user.create({ data: { email: `re-${label}-${suffix}@example.test`, name: `RE Test ${label}`, passwordHash: hash } });
  const workspace = await prisma.workspace.create({ data: { name: `RE Workspace ${label}`, slug: `re-${label}-${suffix}`, createdAt: new Date() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: role as never } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, name: `RE Project ${label}` } });
  return { user, workspace, project };
}

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(response.status, "login should succeed").toBe(200);
  return agent;
}

type Fixture = Awaited<ReturnType<typeof workspaceFixture>>;
let ownerA: Fixture;
let ownerB: Fixture;
let analystA: Fixture;
let viewerA: Fixture;

beforeAll(async () => {
  // wipe test database in dependency-safe order
  await prisma.releaseEvidence.deleteMany();
  await prisma.reviewDecision.deleteMany();
  await prisma.licenseFinding.deleteMany();
  await prisma.vulnerabilityFinding.deleteMany();
  await prisma.dependencyEdge.deleteMany();
  await prisma.component.deleteMany();
  await prisma.scanJob.deleteMany();
  await prisma.report.deleteMany();
  await prisma.sbomComparison.deleteMany();
  await prisma.sbomUpload.deleteMany();
  await prisma.project.deleteMany();
  await prisma.licensePolicy.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.gitHubConnection.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  ownerA = await workspaceFixture("a", "OWNER");
  ownerB = await workspaceFixture("b", "OWNER");
  analystA = await prisma.user.create({ data: { email: `re-analyst-${suffix}@example.test`, name: "RE Analyst", passwordHash: await bcrypt.hash(PASSWORD, 4) } }).then(async (user) => {
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: ownerA.workspace.id, role: "ANALYST" } });
    return { ...ownerA, user };
  });
  viewerA = await prisma.user.create({ data: { email: `re-viewer-${suffix}@example.test`, name: "RE Viewer", passwordHash: await bcrypt.hash(PASSWORD, 4) } }).then(async (user) => {
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: ownerA.workspace.id, role: "VIEWER" } });
    return { ...ownerA, user };
  });
});

afterAll(async () => {
  await prisma.releaseEvidence.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("normalizeDigest", () => {
  it("normalises a bare sha256 hex string", () => {
    expect(normalizeDigest("a".repeat(64))).toBe(`sha256:${"a".repeat(64)}`);
  });
  it("normalises uppercase input", () => {
    expect(normalizeDigest(`sha256:${"A".repeat(64)}`)).toBe(`sha256:${"a".repeat(64)}`);
  });
  it("keeps sha512", () => {
    expect(normalizeDigest(`sha512:${"b".repeat(128)}`)).toBe(`sha512:${"b".repeat(128)}`);
  });
  it("rejects wrong length", () => {
    expect(normalizeDigest(`sha256:${"a".repeat(63)}`)).toBeNull();
  });
  it("rejects non-hex", () => {
    expect(normalizeDigest(`sha256:${"g".repeat(64)}`)).toBeNull();
  });
  it("rejects unknown algorithms", () => {
    expect(normalizeDigest(`md5:${"a".repeat(32)}`)).toBeNull();
  });
  it("treats empty as not provided", () => {
    expect(normalizeDigest("")).toBeNull();
    expect(normalizeDigest("   ")).toBeNull();
    expect(normalizeDigest(null)).toBeNull();
  });
});

describe("normalizeSha", () => {
  it("accepts 40-hex (SHA-1) and 64-hex (SHA-256)", () => {
    expect(normalizeSha("a".repeat(40))).toBe("a".repeat(40));
    expect(normalizeSha("B".repeat(64))).toBe("b".repeat(64));
  });
  it("rejects invalid input", () => {
    expect(normalizeSha("g".repeat(40))).toBeNull();
    expect(normalizeSha("a".repeat(41))).toBeNull();
    expect(normalizeSha("short")).toBeNull();
  });
});

describe("releaseEvidenceCreateSchema", () => {
  it("accepts a minimal payload", () => {
    expect(releaseEvidenceCreateSchema.safeParse({}).success).toBe(true);
  });
  it("rejects malformed digests", () => {
    const r = releaseEvidenceCreateSchema.safeParse({ artifactDigest: "deadbeef", repositoryUrl: "https://github.com/a/b" });
    expect(r.success).toBe(false);
  });
  it("rejects malformed commit SHAs", () => {
    expect(releaseEvidenceCreateSchema.safeParse({ commitSha: "xyz" }).success).toBe(false);
    expect(releaseEvidenceCreateSchema.safeParse({ commitSha: "a".repeat(39) }).success).toBe(false);
  });
  it("rejects non-http repository URLs", () => {
    expect(releaseEvidenceCreateSchema.safeParse({ repositoryUrl: "ftp://x/y" }).success).toBe(false);
  });
  it("rejects unknown verification states", () => {
    expect(releaseEvidenceCreateSchema.safeParse({ verificationState: "VERIFIED" }).success).toBe(false);
  });
  it("rejects unexpected keys (strict)", () => {
    expect(releaseEvidenceCreateSchema.safeParse({ evidenceSource: "MANUAL", madeUp: true }).success).toBe(false);
  });
});

describe("release evidence API", () => {
  it("creates, reads, updates and deletes within one workspace", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const created = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({
      repositoryUrl: "https://github.com/CodeByAlok24/SupplyGuard---Software-Bill-Of-Materials-.git",
      commitSha: "a".repeat(40),
      sbomName: "supplyguard.cdx.json",
      sbomFormat: "CycloneDX",
      sbomDigest: "b".repeat(64),
      artifactName: "ghcr.io/codebyalok24/supplyguard",
      artifactDigest: "c".repeat(64),
      buildProvider: "github-actions",
      buildWorkflow: "release.yml",
      buildRunId: "12345",
      buildRunUrl: "https://github.com/CodeByAlok24/SupplyGuard---Software-Bill-Of-Materials-/actions/runs/12345",
      deployService: "api",
      deployEnvironment: "production",
      deployRegion: "eu-central-1",
      deployAt: "2026-11-14T12:00:00.000Z",
      note: "First release evidence entry.",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.item.evidenceSource).toBe("manual");
    expect(created.body.item.artifactDigest).toBe(`sha256:${"c".repeat(64)}`);
    expect(created.body.item.commitSha).toBe("a".repeat(40));
    const id = created.body.item.id;

    const fetched = await agent.get(`/api/v1/release-evidence/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.item.deployRegion).toBe("eu-central-1");

    const patched = await agent.patch(`/api/v1/release-evidence/${id}`).send({ deployEnvironment: "staging", note: "Re-verified manually." });
    expect(patched.status).toBe(200);
    expect(patched.body.item.deployEnvironment).toBe("staging");
    expect(patched.body.item.note).toBe("Re-verified manually.");

    const listed = await agent.get(`/api/v1/projects/${ownerA.project.id}/release-evidence`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);

    const deleted = await agent.delete(`/api/v1/release-evidence/${id}`);
    expect(deleted.status).toBe(204);
    const afterDelete = await agent.get(`/api/v1/release-evidence/${id}`);
    expect(afterDelete.status).toBe(404);
  });

  it("does not let another workspace see, update or delete evidence", async () => {
    const agentA = await loginAgent(ownerA.user.email);
    const agentB = await loginAgent(ownerB.user.email);
    const created = await agentA.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ artifactName: "private-artifact", artifactDigest: "c".repeat(64) });
    expect(created.status).toBe(201);
    const id = created.body.item.id as string;

    const listFromB = await agentB.get(`/api/v1/projects/${ownerB.project.id}/release-evidence`);
    expect(listFromB.status).toBe(200);
    expect(listFromB.body.items).toHaveLength(0);

    const listAFromB = await agentB.get(`/api/v1/projects/${ownerA.project.id}/release-evidence`);
    expect(listAFromB.status).toBe(404);

    expect((await agentB.get(`/api/v1/release-evidence/${id}`)).status).toBe(404);
    expect((await agentB.patch(`/api/v1/release-evidence/${id}`).send({ deployEnvironment: "production" })).status).toBe(404);
    expect((await agentB.delete(`/api/v1/release-evidence/${id}`)).status).toBe(404);
  });

  it("denies write access to VIEWER role but allows read", async () => {
    const agentViewer = await loginAgent(viewerA.user.email);
    const createdByOwner = await loginAgent(ownerA.user.email);
    const created = await createdByOwner.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ artifactName: "viewer-test" });
    const id = created.body.item.id as string;

    expect((await agentViewer.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({})).status).toBe(403);
    expect((await agentViewer.patch(`/api/v1/release-evidence/${id}`).send({ note: "hijack" })).status).toBe(403);
    expect((await agentViewer.delete(`/api/v1/release-evidence/${id}`)).status).toBe(403);
    const read = await agentViewer.get(`/api/v1/release-evidence/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.item.artifactName).toBe("viewer-test");
  });

  it("denies DELETE to ANALYST but allows create and update", async () => {
    const agentAnalyst = await loginAgent(analystA.user.email);
    const created = await agentAnalyst.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ artifactName: "analyst-created" });
    expect(created.status).toBe(201);
    const id = created.body.item.id as string;
    const patched = await agentAnalyst.patch(`/api/v1/release-evidence/${id}`).send({ note: "analyst note" });
    expect(patched.status).toBe(200);
    expect((await agentAnalyst.delete(`/api/v1/release-evidence/${id}`)).status).toBe(403);
  });

  it("rejects malformed input with 400", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const bad = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ artifactDigest: "not-a-digest" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_evidence");
    const badSha = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ commitSha: "xyz" });
    expect(badSha.status).toBe(400);
    const badUrl = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ repositoryUrl: "not a url" });
    expect(badUrl.status).toBe(400);
  });

  it("rejects a scanJobId that does not belong to the project", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const other = await loginAgent(ownerB.user.email);
    const scanB = await prisma.scanJob.create({ data: { workspaceId: ownerB.workspace.id, projectId: ownerB.project.id, status: "COMPLETED" } });
    const response = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ scanJobId: scanB.id });
    expect(response.status).toBe(400);
    await prisma.scanJob.delete({ where: { id: scanB.id } });
    void other;
  });

  it("always sets evidenceSource to MANUAL", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const created = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ note: "attempt to forge" as never });
    expect(created.status).toBe(201);
    expect(created.body.item.evidenceSource).toBe("manual");
    const forged = await agent.post(`/api/v1/projects/${ownerA.project.id}/release-evidence`).send({ evidenceSource: "MANUAL", verificationState: "UNVERIFIED" } as never);
    expect(forged.status).toBe(400);
  });
});
