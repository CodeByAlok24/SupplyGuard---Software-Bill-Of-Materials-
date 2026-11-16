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
const { parseProvenance, ProvenanceError, ATTESTATION_MAX_BYTES } = await import("./provenance.js");

const PASSWORD = "test-password-123";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const digestA = "a".repeat(64);
const gitShaB = "b".repeat(40);
const sha512C = "c".repeat(128);

const slsaV1Statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: "ghcr.io/example/app:v1", digest: { sha256: digestA } }],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://github.com/actions/build-type-v1",
      builder: { id: "https://github.com/actions/runner/hosted" },
      resolvedDependencies: [
        { uri: "git+https://github.com/CodeByAlok24/example.git", digest: { gitCommit: gitShaB, sha1: gitShaB } },
        { uri: "pkg:npm/left-pad@1.3.0", digest: { sha512: sha512C } },
      ],
    },
    runDetails: {
      builder: { id: "https://github.com/actions/runner/v2.311.0" },
      metadata: { invocationId: "run-123", startedOn: "2026-11-14T10:00:00Z", finishedOn: "2026-11-14T10:05:00Z" },
    },
  },
};

const slsaV02Statement = {
  _type: "https://in-toto.io/Statement/v0.1",
  subject: [{ name: "ghcr.io/example/app:v0.2", digest: { sha256: digestA } }],
  predicateType: "https://slsa.dev/provenance/v0.2",
  predicate: {
    buildType: "https://slsa.dev/provenance/v0.2",
    builder: { id: "https://github.com/actions/runner/v2" },
    invocation: { configSource: { uri: "git+https://github.com/CodeByAlok24/example.git", digest: { gitCommit: "d".repeat(40) } } },
    materials: [{ uri: "git+https://github.com/CodeByAlok24/example.git", digest: { gitCommit: "d".repeat(40) } }],
    metadata: { buildInvocationId: "job-42", buildStartedOn: "2026-11-14T10:00:00Z" },
  },
};

const asDsse = (statement: unknown, sig = "ZmFrZXNpZw==") => Buffer.from(JSON.stringify({
  payload: Buffer.from(JSON.stringify(statement), "utf8").toString("base64"),
  payloadType: "application/vnd.in-toto+json",
  signatures: [{ keyid: "test-key", sig }],
}), "utf8");

async function makeWorkspace(label: string, role: string) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const user = await prisma.user.create({ data: { email: `prov-${label}-${suffix}@example.test`, name: `Prov Test ${label}`, passwordHash: hash } });
  const workspace = await prisma.workspace.create({ data: { name: `Prov Workspace ${label}`, slug: `prov-${label}-${suffix}`, createdAt: new Date() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: role as never } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, name: `Prov Project ${label}` } });
  return { user, workspace, project };
}

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(response.status, "login should succeed").toBe(200);
  return agent;
}

type Fixture = Awaited<ReturnType<typeof makeWorkspace>>;
let ownerA: Fixture;
let ownerB: Fixture;
let analystA: Fixture;
let viewerA: Fixture;
let evidenceId: string;
let evidenceNoArtifactId: string;

beforeAll(async () => {
  await prisma.provenanceAttestation.deleteMany();
  await prisma.releaseEvidence.deleteMany();
  await prisma.serviceLevelObjective.deleteMany();
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

  ownerA = await makeWorkspace("a", "OWNER");
  ownerB = await makeWorkspace("b", "OWNER");
  analystA = await prisma.user.create({ data: { email: `prov-analyst-${suffix}@example.test`, name: "Prov Analyst", passwordHash: await bcrypt.hash(PASSWORD, 4) } }).then(async (user) => {
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: ownerA.workspace.id, role: "ANALYST" } });
    return { ...ownerA, user };
  });
  viewerA = await prisma.user.create({ data: { email: `prov-viewer-${suffix}@example.test`, name: "Prov Viewer", passwordHash: await bcrypt.hash(PASSWORD, 4) } }).then(async (user) => {
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: ownerA.workspace.id, role: "VIEWER" } });
    return { ...ownerA, user };
  });

  const withArtifact = await prisma.releaseEvidence.create({ data: {
    workspaceId: ownerA.workspace.id,
    projectId: ownerA.project.id,
    repositoryUrl: "https://github.com/CodeByAlok24/example.git",
    commitSha: gitShaB,
    artifactName: "ghcr.io/example/app:v1",
    artifactDigest: `sha256:${digestA}`,
    evidenceSource: "MANUAL",
    verificationState: "USER_ASSERTED",
    createdById: ownerA.user.id,
  } });
  evidenceId = withArtifact.id;
  const withoutArtifact = await prisma.releaseEvidence.create({ data: {
    workspaceId: ownerA.workspace.id,
    projectId: ownerA.project.id,
    evidenceSource: "MANUAL",
    verificationState: "UNVERIFIED",
    createdById: ownerA.user.id,
  } });
  evidenceNoArtifactId = withoutArtifact.id;
});

afterAll(async () => {
  await prisma.provenanceAttestation.deleteMany();
  await prisma.releaseEvidence.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("parseProvenance (unit)", () => {
  it("parses a SLSA v1 bare statement and extracts builder, revision and materials", () => {
    const parsed = parseProvenance(Buffer.from(JSON.stringify(slsaV1Statement)), `sha256:${digestA}`);
    expect(parsed.envelope).toBe("statement");
    expect(parsed.predicateType).toBe("https://slsa.dev/provenance/v1");
    expect(parsed.statementType).toBe("https://in-toto.io/Statement/v1");
    expect(parsed.builderId).toBe("https://github.com/actions/runner/v2.311.0");
    expect(parsed.buildType).toBe("https://github.com/actions/build-type-v1");
    expect(parsed.buildInvocationId).toBe("run-123");
    expect(parsed.startedOn).toBe("2026-11-14T10:00:00.000Z");
    expect(parsed.sourceRepoUrl).toBe("git+https://github.com/CodeByAlok24/example.git");
    expect(parsed.sourceRevision).toBe(gitShaB);
    expect(parsed.materials).toHaveLength(2);
    expect(parsed.subjectName).toBe("ghcr.io/example/app:v1");
    expect(parsed.subjectDigest).toBe(`sha256:${digestA}`);
    expect(parsed.subjectMatchesArtifact).toBe(true);
    expect(parsed.signatureState).toBe("unverified");
    expect(parsed.signatureCount).toBe(0);
    expect(parsed.payloadDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("parses a DSSE-wrapped SLSA v1 statement and records signatures WITHOUT verifying", () => {
    const parsed = parseProvenance(asDsse(slsaV1Statement), `sha256:${digestA}`);
    expect(parsed.envelope).toBe("dsse");
    expect(parsed.signatureCount).toBe(1);
    expect(parsed.signatureState).toBe("unverified");
    expect(parsed.builderId).toBe("https://github.com/actions/runner/v2.311.0");
  });

  it("parses a SLSA v0.2 statement via configSource", () => {
    const parsed = parseProvenance(Buffer.from(JSON.stringify(slsaV02Statement)), `sha256:${digestA}`);
    expect(parsed.predicateType).toBe("https://slsa.dev/provenance/v0.2");
    expect(parsed.statementType).toBe("https://in-toto.io/Statement/v0.1");
    expect(parsed.sourceRepoUrl).toBe("git+https://github.com/CodeByAlok24/example.git");
    expect(parsed.sourceRevision).toBe("d".repeat(40));
    expect(parsed.buildInvocationId).toBe("job-42");
  });

  it("digest mismatch sets subjectMatchesArtifact=false", () => {
    const parsed = parseProvenance(Buffer.from(JSON.stringify(slsaV1Statement)), `sha256:${"f".repeat(64)}`);
    expect(parsed.subjectMatchesArtifact).toBe(false);
  });

  it("no registered artifact digest produces subjectMatchesArtifact=null", () => {
    const parsed = parseProvenance(Buffer.from(JSON.stringify(slsaV1Statement)), null);
    expect(parsed.subjectMatchesArtifact).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(() => parseProvenance(Buffer.from("{not json"), null)).toThrow(ProvenanceError);
    try { parseProvenance(Buffer.from("{not json"), null); } catch (error) { expect((error as { code: string }).code).toBe("invalid_json"); }
  });

  it("rejects an empty file", () => {
    expect(() => parseProvenance(Buffer.alloc(0), null)).toThrow(ProvenanceError);
  });

  it("rejects an oversized file", () => {
    const big = Buffer.alloc(ATTESTATION_MAX_BYTES + 1, 123);
    expect(() => parseProvenance(big, null)).toThrow(ProvenanceError);
  });

  it("rejects wrong predicateType", () => {
    const bad = { ...slsaV1Statement, predicateType: "https://example.com/not-provenance" };
    try { parseProvenance(Buffer.from(JSON.stringify(bad)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("unsupported_predicate"); }
  });

  it("rejects a malformed SLSA predicate with invalid_predicate (never a 500)", () => {
    const bad = JSON.parse(JSON.stringify(slsaV1Statement));
    bad.predicate.buildDefinition.resolvedDependencies[1].digest.sha512 = "tooshort";
    try { parseProvenance(Buffer.from(JSON.stringify(bad)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("invalid_predicate"); }
  });

  it("rejects wrong statement _type", () => {
    const bad = { ...slsaV1Statement, _type: "https://in-toto.io/Statement/v2" };
    try { parseProvenance(Buffer.from(JSON.stringify(bad)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("unsupported_statement_type"); }
  });

  it("rejects an invalid subject digest", () => {
    const bad = {
      ...slsaV1Statement,
      subject: [{ name: "x", digest: { sha256: "z".repeat(64) } }],
    };
    try { parseProvenance(Buffer.from(JSON.stringify(bad)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("invalid_statement"); }
  });

  it("rejects a file:// material URI", () => {
    const bad = JSON.parse(JSON.stringify(slsaV1Statement));
    bad.predicate.buildDefinition.resolvedDependencies = [{ uri: "file:///etc/passwd", digest: { sha256: digestA } }];
    try { parseProvenance(Buffer.from(JSON.stringify(bad)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("invalid_uri"); }
  });

  it("rejects a material URI with embedded credentials", () => {
    const bad = JSON.parse(JSON.stringify(slsaV1Statement));
    bad.predicate.buildDefinition.resolvedDependencies = [{ uri: "https://user:secret@github.com/example/repo.git", digest: { gitCommit: gitShaB } }];
    try { parseProvenance(Buffer.from(JSON.stringify(bad)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("invalid_uri"); }
  });

  it("rejects DSSE with an unexpected payloadType", () => {
    const dsse = { payload: Buffer.from("{}").toString("base64"), payloadType: "application/vnd.dev.cosign.simplesigning.v1+json", signatures: [{ sig: "x" }] };
    try { parseProvenance(Buffer.from(JSON.stringify(dsse)), null); expect.unreachable(); } catch (error) { expect((error as { code: string }).code).toBe("unsupported_payload_type"); }
  });

  it("never stores or returns invocation parameters (secret leakage)", () => {
    const leaky = JSON.parse(JSON.stringify(slsaV1Statement));
    leaky.predicate.buildDefinition.externalParameters = { awsAccessKey: "AKIA_FAKE" };
    const parsed = parseProvenance(Buffer.from(JSON.stringify(leaky)), null);
    expect(JSON.stringify(parsed)).not.toContain("AKIA_FAKE");
  });
});

describe("attestation API", () => {
  it("uploads, parses and reports a digest match for a registered artifact", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const response = await agent
      .post(`/api/v1/release-evidence/${evidenceId}/attestation`)
      .attach("file", asDsse(slsaV1Statement), "release.intoto.json");
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const item = response.body.item;
    expect(item.signatureState).toBe("unverified");
    expect(item.signatureCount).toBe(1);
    expect(item.subjectMatchesArtifact).toBe(true);
    expect(item.builderId).toBe("https://github.com/actions/runner/v2.311.0");
    expect(item.sourceRevision).toBe(gitShaB);
    expect(item.materials).toHaveLength(2);
  });

  it("reports a digest mismatch without altering evidence data", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const mismatch = JSON.parse(JSON.stringify(slsaV1Statement));
    mismatch.subject = [{ name: "ghcr.io/example/app:v1", digest: { sha256: "e".repeat(64) } }];
    const response = await agent
      .post(`/api/v1/release-evidence/${evidenceId}/attestation`)
      .attach("file", Buffer.from(JSON.stringify(mismatch)), "mismatch.intoto.json");
    expect(response.status).toBe(201);
    expect(response.body.item.subjectMatchesArtifact).toBe(false);

    const evidence = await agent.get(`/api/v1/release-evidence/${evidenceId}`);
    expect(evidence.body.item.artifactDigest).toBe(`sha256:${digestA}`);
    expect(evidence.body.item.verificationState).toBe("user_asserted");
  });

  it("subjectMatchesArtifact is null when the evidence has no artifact digest", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const response = await agent
      .post(`/api/v1/release-evidence/${evidenceNoArtifactId}/attestation`)
      .attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "no-artifact.intoto.json");
    expect(response.status).toBe(201);
    expect(response.body.item.subjectMatchesArtifact).toBeNull();
  });

  it("re-upload replaces the attestation instead of duplicating", async () => {
    const agent = await loginAgent(ownerA.user.email);
    await agent.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "one.intoto.json");
    const replacement = JSON.parse(JSON.stringify(slsaV1Statement));
    replacement.subject = [{ name: "ghcr.io/example/app:v2", digest: { sha256: digestA } }];
    const response = await agent.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(replacement)), "two.intoto.json");
    expect(response.status).toBe(201);
    expect(response.body.item.subjectName).toBe("ghcr.io/example/app:v2");
    const list = await agent.get(`/api/v1/release-evidence/${evidenceId}`);
    expect(list.body.item.attestation.subjectName).toBe("ghcr.io/example/app:v2");
  });

  it("rejects malformed JSON with 400 invalid_json", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const response = await agent.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from("{nope"), "broken.json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_json");
  });

  it("rejects unsupported provenance with 400", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const response = await agent.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify({ hello: "world" })), "nope.json");
    expect(response.status).toBe(400);
  });

  it("enforces the 2 MB size limit with 400", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const big = Buffer.alloc(ATTESTATION_MAX_BYTES + 1, 65);
    const response = await agent.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", big, "big.intoto.json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("limit_file_size");
  });

  it("VIEWER cannot upload; ANALYST can upload; only OWNER/ADMIN can delete", async () => {
    const agentViewer = await loginAgent(viewerA.user.email);
    const agentAnalyst = await loginAgent(analystA.user.email);
    const agentOwner = await loginAgent(ownerA.user.email);

    expect((await agentViewer.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "v.json")).status).toBe(403);
    expect((await agentAnalyst.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "a.json")).status).toBe(201);
    expect((await agentAnalyst.delete(`/api/v1/release-evidence/${evidenceId}/attestation`)).status).toBe(403);
    expect((await agentViewer.get(`/api/v1/release-evidence/${evidenceId}/attestation`)).status).toBe(200);
    expect((await agentOwner.delete(`/api/v1/release-evidence/${evidenceId}/attestation`)).status).toBe(204);
    expect((await agentOwner.get(`/api/v1/release-evidence/${evidenceId}/attestation`)).status).toBe(404);
  });

  it("cross-workspace isolation: cannot see, upload to, or delete another workspace's attestation", async () => {
    const agentA = await loginAgent(ownerA.user.email);
    const agentB = await loginAgent(ownerB.user.email);
    await agentA.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "a.json");
    expect((await agentB.get(`/api/v1/release-evidence/${evidenceId}/attestation`)).status).toBe(404);
    expect((await agentB.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "b.json")).status).toBe(404);
    expect((await agentB.delete(`/api/v1/release-evidence/${evidenceId}/attestation`)).status).toBe(404);
  });

  it("unauthenticated upload is rejected", async () => {
    const response = await request(app).post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", Buffer.from(JSON.stringify(slsaV1Statement)), "u.json");
    expect(response.status).toBe(401);
  });

  it("evidence detail embeds the attestation with signatureState=unverified", async () => {
    const agent = await loginAgent(ownerA.user.email);
    await agent.post(`/api/v1/release-evidence/${evidenceId}/attestation`).attach("file", asDsse(slsaV1Statement), "embed.intoto.json");
    const response = await agent.get(`/api/v1/release-evidence/${evidenceId}`);
    expect(response.status).toBe(200);
    const attestation = response.body.item.attestation;
    expect(attestation).toBeTruthy();
    expect(attestation.signatureState).toBe("unverified");
    expect(attestation.subjectMatchesArtifact).toBe(true);
  });
});
