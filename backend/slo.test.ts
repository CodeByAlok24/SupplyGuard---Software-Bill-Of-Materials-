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
const { computeErrorBudget, sloCreateSchema, validateSloMerged } = await import("./slo.js");
const { getSloProvider, TELEMETRY_STATUS } = await import("./telemetry.js");
const { buildImpact } = await import("./release-impact.js");

const PASSWORD = "test-password-123";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function makeWorkspace(label: string, role: string) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const user = await prisma.user.create({ data: { email: `slo-${label}-${suffix}@example.test`, name: `SLO Test ${label}`, passwordHash: hash } });
  const workspace = await prisma.workspace.create({ data: { name: `SLO Workspace ${label}`, slug: `slo-${label}-${suffix}`, createdAt: new Date() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: role as never } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, name: `SLO Project ${label}` } });
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

beforeAll(async () => {
  await prisma.serviceLevelObjective.deleteMany();
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

  ownerA = await makeWorkspace("a", "OWNER");
  ownerB = await makeWorkspace("b", "OWNER");
  analystA = await prisma.user.create({ data: { email: `slo-analyst-${suffix}@example.test`, name: "SLO Analyst", passwordHash: await bcrypt.hash(PASSWORD, 4) } }).then(async (user) => {
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: ownerA.workspace.id, role: "ANALYST" } });
    return { ...ownerA, user };
  });
  viewerA = await prisma.user.create({ data: { email: `slo-viewer-${suffix}@example.test`, name: "SLO Viewer", passwordHash: await bcrypt.hash(PASSWORD, 4) } }).then(async (user) => {
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: ownerA.workspace.id, role: "VIEWER" } });
    return { ...ownerA, user };
  });
});

afterAll(async () => {
  await prisma.serviceLevelObjective.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("computeErrorBudget", () => {
  it("within budget: observed 99.95 against 99.9 target", () => {
    const budget = computeErrorBudget(99.9, 99.95);
    expect(budget.budgetPercent).toBeCloseTo(0.1, 4);
    expect(budget.observedBadPercent).toBeCloseTo(0.05, 4);
    expect(budget.consumedPercent).toBeCloseTo(50, 1);
    expect(budget.remainingPercent).toBeCloseTo(50, 1);
    expect(budget.status).toBe("within");
    expect(budget.formula).toContain("100 − target");
  });

  it("exhausted: observed 99.5 against 99.9 target", () => {
    const budget = computeErrorBudget(99.9, 99.5);
    expect(budget.status).toBe("exhausted");
    expect(budget.consumedPercent).toBeCloseTo(500, 1);
    expect(budget.remainingPercent).toBe(0);
  });

  it("not_calculable: missing observation produces nulls, never fabricated numbers", () => {
    for (const missing of [null, undefined, Number.NaN]) {
      const budget = computeErrorBudget(99.9, missing);
      expect(budget.status).toBe("not_calculable");
      expect(budget.observedBadPercent).toBeNull();
      expect(budget.consumedPercent).toBeNull();
      expect(budget.remainingPercent).toBeNull();
      expect(budget.budgetPercent).toBeCloseTo(0.1, 4); // target-derived part still shown
    }
  });

  it("target = 100: zero budget — any bad fraction exhausts it, zero bad leaves it intact", () => {
    expect(computeErrorBudget(100, 100).status).toBe("within");
    expect(computeErrorBudget(100, 100).remainingPercent).toBe(100);
    const exhausted = computeErrorBudget(100, 99);
    expect(exhausted.status).toBe("exhausted");
    expect(exhausted.remainingPercent).toBe(0);
  });

  it("exactly at budget boundary counts as exhausted", () => {
    const budget = computeErrorBudget(99.9, 99.9); // bad == budget == 0.1
    expect(budget.status).toBe("exhausted");
    expect(budget.consumedPercent).toBeCloseTo(100, 1);
  });
});

describe("sloCreateSchema", () => {
  const base = { service: "API", environment: "Production", name: "Availability", target: 99.9, indicatorName: "availability_ratio" };

  it("normalizes service and environment to lowercase trimmed tokens", () => {
    const parsed = sloCreateSchema.parse(base);
    expect(parsed.service).toBe("api");
    expect(parsed.environment).toBe("production");
    expect(parsed.source).toBe("MANUAL");
  });

  it("rejects targets outside (0, 100]", () => {
    for (const target of [0, -1, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sloCreateSchema.safeParse({ ...base, target }).success).toBe(false);
    }
    expect(sloCreateSchema.safeParse({ ...base, target: 100 }).success).toBe(true);
  });

  it("rejects observed values outside [0, 100]", () => {
    expect(sloCreateSchema.safeParse({ ...base, observedValue: 100.5, windowDays: 30, observedAt: new Date().toISOString() }).success).toBe(false);
    expect(sloCreateSchema.safeParse({ ...base, observedValue: -1, windowDays: 30, observedAt: new Date().toISOString() }).success).toBe(false);
  });

  it("requires window + timestamp when an observed value is set", () => {
    expect(sloCreateSchema.safeParse({ ...base, observedValue: 99.9 }).success).toBe(false);
    expect(sloCreateSchema.safeParse({ ...base, observedValue: 99.9, windowDays: 30 }).success).toBe(false);
    expect(sloCreateSchema.safeParse({ ...base, observedValue: 99.9, observedAt: new Date().toISOString() }).success).toBe(false);
    expect(sloCreateSchema.safeParse({ ...base, observedValue: 99.9, windowDays: 30, observedAt: new Date().toISOString() }).success).toBe(true);
  });

  it("rejects a window without an observed value", () => {
    expect(sloCreateSchema.safeParse({ ...base, windowDays: 30 }).success).toBe(false);
  });

  it("rejects unknown keys (strict, e.g. no telemetry URLs smuggled in)", () => {
    expect(sloCreateSchema.safeParse({ ...base, telemetryUrl: "http://collector:4318" }).success).toBe(false);
  });

  it("rejects non-MANUAL sources", () => {
    expect(sloCreateSchema.safeParse({ ...base, source: "cloudwatch" }).success).toBe(false);
  });
});

describe("telemetry adapter boundary", () => {
  it("only the manual provider is registered; others return null", () => {
    expect(getSloProvider("manual")?.source).toBe("manual");
    for (const source of ["opentelemetry", "prometheus", "cloudwatch", "made-up"]) {
      expect(getSloProvider(source)).toBeNull();
    }
    expect(TELEMETRY_STATUS.opentelemetry).toBe("not implemented");
    expect(TELEMETRY_STATUS.prometheus).toBe("not implemented");
    expect(TELEMETRY_STATUS.cloudwatch).toBe("not implemented");
  });
});

describe("SLO API", () => {
  it("creates, reads and computes error budget in the response", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const created = await agent.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({
      service: "API",
      environment: "PRODUCTION",
      name: "Availability",
      target: 99.9,
      indicatorName: "availability_ratio",
      observedValue: 99.95,
      windowDays: 30,
      observedAt: "2026-11-13T12:00:00.000Z",
      note: "Measured by the on-call rotation, exported to a notepad.",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.item.source).toBe("manual");
    expect(created.body.item.service).toBe("api");
    expect(created.body.item.environment).toBe("production");
    expect(created.body.item.errorBudget.status).toBe("within");
    expect(created.body.item.errorBudget.budgetPercent).toBeCloseTo(0.1, 4);

    const fetched = await agent.get(`/api/v1/slos/${created.body.item.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.item.errorBudget.status).toBe("within");
  });

  it("duplicate service+environment+name is rejected with 409", async () => {
    const agent = await loginAgent(ownerA.user.email);
    await agent.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({ service: "web", environment: "staging", name: "Latency", target: 95, indicatorName: "p95_ms" });
    const dup = await agent.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({ service: "web", environment: "staging", name: "Latency", target: 95, indicatorName: "p95_ms" });
    expect(dup.status).toBe(409);
  });

  it("creating with invalid target returns 400", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const bad = await agent.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({ service: "x", environment: "y", name: "n", target: 0, indicatorName: "i" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_slo");
  });

  it("list is workspace-scoped and only shows the project's SLOs", async () => {
    const agentA = await loginAgent(ownerA.user.email);
    const agentB = await loginAgent(ownerB.user.email);
    const listA = await agentA.get(`/api/v1/projects/${ownerA.project.id}/slos`);
    expect(listA.status).toBe(200);
    expect(listA.body.items.length).toBeGreaterThanOrEqual(2);
    const listB = await agentB.get(`/api/v1/projects/${ownerB.project.id}/slos`);
    expect(listB.body.items).toHaveLength(0);
    expect((await agentB.get(`/api/v1/projects/${ownerA.project.id}/slos`)).status).toBe(404);
  });

  it("cross-workspace read/patch/delete are all 404", async () => {
    const agentA = await loginAgent(ownerA.user.email);
    const agentB = await loginAgent(ownerB.user.email);
    const created = await agentA.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({ service: "isolation-test", environment: "prod", name: "Isolation", target: 99, indicatorName: "x" });
    const id = created.body.item.id as string;
    expect((await agentB.get(`/api/v1/slos/${id}`)).status).toBe(404);
    expect((await agentB.patch(`/api/v1/slos/${id}`).send({ target: 50 })).status).toBe(404);
    expect((await agentB.delete(`/api/v1/slos/${id}`)).status).toBe(404);
  });

  it("VIEWER can read but not write; ANALYST can write but not delete; OWNER can delete", async () => {
    const agentViewer = await loginAgent(viewerA.user.email);
    const agentAnalyst = await loginAgent(analystA.user.email);
    const agentOwner = await loginAgent(ownerA.user.email);

    const created = await agentOwner.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({ service: "perms-test", environment: "prod", name: "Permissions", target: 99.5, indicatorName: "y" });
    const id = created.body.item.id as string;

    expect((await agentViewer.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({ service: "p2", environment: "prod", name: "Nope", target: 99, indicatorName: "y" })).status).toBe(403);
    expect((await agentViewer.patch(`/api/v1/slos/${id}`).send({ target: 98 })).status).toBe(403);
    expect((await agentViewer.delete(`/api/v1/slos/${id}`)).status).toBe(403);
    expect((await agentViewer.get(`/api/v1/slos/${id}`)).status).toBe(200);

    const patched = await agentAnalyst.patch(`/api/v1/slos/${id}`).send({ target: 99.99 });
    expect(patched.status).toBe(200);
    expect(patched.body.item.target).toBe(99.99);
    expect((await agentAnalyst.delete(`/api/v1/slos/${id}`)).status).toBe(403);

    expect((await agentOwner.delete(`/api/v1/slos/${id}`)).status).toBe(204);
    expect((await agentOwner.get(`/api/v1/slos/${id}`)).status).toBe(404);
  });

  it("PATCH merges stored values and rejects a merged record without window/timestamp", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const created = await agent.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({
      service: "merge-test",
      environment: "prod",
      name: "Merge",
      target: 99,
      indicatorName: "m",
    });
    const id = created.body.item.id as string;
    // setting observedValue alone must fail (no window, no timestamp stored)
    const bad = await agent.patch(`/api/v1/slos/${id}`).send({ observedValue: 99.5 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_slo");
    // setting all three together succeeds
    const good = await agent.patch(`/api/v1/slos/${id}`).send({ observedValue: 99.5, windowDays: 28, observedAt: "2026-11-10T00:00:00.000Z" });
    expect(good.status).toBe(200);
    expect(good.body.item.errorBudget.status).toBe("within");
  });

  it("PATCH clearing observedValue while a window remains is rejected", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const created = await agent.post(`/api/v1/projects/${ownerA.project.id}/slos`).send({
      service: "clear-test",
      environment: "prod",
      name: "Clear",
      target: 99,
      indicatorName: "c",
      observedValue: 99.5,
      windowDays: 30,
      observedAt: "2026-11-10T00:00:00.000Z",
    });
    const id = created.body.item.id as string;
    const bad = await agent.patch(`/api/v1/slos/${id}`).send({ observedValue: null });
    expect(bad.status).toBe(400);
    const clearBoth = await agent.patch(`/api/v1/slos/${id}`).send({ observedValue: null, windowDays: null, observedAt: null });
    expect(clearBoth.status).toBe(200);
    expect(clearBoth.body.item.errorBudget.status).toBe("not_calculable");
  });

  it("validateSloMerged rejects cross-field violations directly", () => {
    expect(validateSloMerged({ service: "s", environment: "e", name: "n", target: 99, indicatorName: "i", observedValue: 99, windowDays: null, observedAt: null, source: "MANUAL", note: null }).success).toBe(false);
  });
});

describe("SLO in finding impact view", () => {
  const job = { id: "scan-slo", completedAt: new Date("2026-11-14T12:00:00.000Z"), sbomDigest: "sha256:" + "9".repeat(64) };
  const components = [{ id: "root", name: "app", version: "1.0.0", purl: "pkg:npm/app@1.0.0" }, { id: "lib", name: "left-pad", version: "1.3.0", purl: "pkg:npm/left-pad@1.3.0" }];
  const edges = [{ parentComponentId: "root", childComponentId: "lib" }];
  const vulnerabilities = [{ id: "vuln-slo", componentId: "lib", severity: "CRITICAL", osvId: "GHSA-slo-test" }];
  const licenses = [{ id: "lic-slo", componentId: "lib", decision: "REVIEW" as const, observedExpression: "MIT" }];
  const evidence = [{
    id: "ev-slo",
    scanJobId: job.id,
    sbomDigest: job.sbomDigest,
    artifactName: "ghcr.io/example/app:slo",
    artifactDigest: "sha256:" + "8".repeat(64),
    deployService: "Checkout-API", // mixed case on purpose: matching is case-insensitive
    deployEnvironment: "PRODUCTION",
    deployRegion: "eu-central-1",
    updatedAt: new Date("2026-11-14T13:00:00.000Z"),
    verificationState: "UNVERIFIED" as const,
  }];
  const slos = [
    { id: "slo-match", service: "checkout-api", environment: "production", name: "Availability", target: 99.9, indicatorName: "availability_ratio", observedValue: 99.95, windowDays: 30, observedAt: new Date("2026-11-13T00:00:00.000Z") },
    { id: "slo-other-env", service: "checkout-api", environment: "staging", name: "Staging latency", target: 95, indicatorName: "p95_ms", observedValue: null, windowDays: null, observedAt: null },
    { id: "slo-other-service", service: "billing", environment: "production", name: "Billing availability", target: 99, indicatorName: "x", observedValue: null, windowDays: null, observedAt: null },
  ];

  it("attaches matching SLOs (case-insensitive service/environment) beside deployments", () => {
    const result = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence, slos });
    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.services).toHaveLength(1);
      const matched = entry.services[0].slos;
      expect(matched.map((slo) => slo.id)).toEqual(["slo-match"]);
      expect(matched[0].errorBudget.status).toBe("within");
      expect(matched[0].source).toBe("manual");
    }
  });

  it("attaches nothing when service/environment do not match", () => {
    const result = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence, slos: [slos[1], slos[2]] });
    for (const entry of result) expect(entry.services[0].slos).toEqual([]);
  });

  it("attaches no SLOs when evidence has no service/environment (missing values stay missing)", () => {
    const noDeploy = [{ ...evidence[0], deployService: null, deployEnvironment: null }];
    const result = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence: noDeploy, slos });
    for (const entry of result) expect(entry.services[0].slos).toEqual([]);
  });

  it("SLO presence never changes severity or impact status", () => {
    const withSlo = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence, slos });
    const withoutSlo = buildImpact({ job, components, edges, vulnerabilities, licenses, evidence, slos: [] });
    expect(withSlo.map((e) => [e.status, e.findingId])).toEqual(withoutSlo.map((e) => [e.status, e.findingId]));
    expect(withSlo[0].componentName).toBe(withoutSlo[0].componentName);
  });
});

describe("telemetry status endpoint", () => {
  it("reports manual available and the rest not implemented", async () => {
    const agent = await loginAgent(ownerA.user.email);
    const response = await agent.get("/api/v1/telemetry/status");
    expect(response.status).toBe(200);
    expect(response.body.item.manual).toContain("available");
    expect(response.body.item.opentelemetry).toBe("not implemented");
    expect(response.body.item.prometheus).toBe("not implemented");
    expect(response.body.item.cloudwatch).toBe("not implemented");
  });
});
