import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/supplyguard_test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";

const { app } = await import("./api.js");
const { prisma } = await import("./db.js");
const { registry } = await import("./metrics.js");

beforeAll(async () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  const { hash } = { hash: await import("bcryptjs").then((m) => m.default.hash("test-password-123", 4)) };
  const user = await prisma.user.create({ data: { email: `metrics-${suffix}@example.test`, name: "Metrics Test", passwordHash: hash } });
  const workspace = await prisma.workspace.create({ data: { name: "Metrics Workspace", slug: `metrics-${suffix}`, createdAt: new Date() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
  void suffix;
  (globalThis as Record<string, unknown>).__metricsTestUserEmail = user.email;
});

afterAll(async () => {
  delete process.env.METRICS_TOKEN;
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("metrics registry", () => {
  it("registers the custom SupplyGuard metrics", () => {
    for (const name of [
      "supplyguard_scans_total",
      "supplyguard_scan_duration_seconds",
      "supplyguard_osv_checks_total",
      "supplyguard_license_checks_total",
      "supplyguard_reports_generated_total",
      "supplyguard_http_requests_total",
      "supplyguard_http_request_duration_seconds",
      "supplyguard_queue_depth",
    ]) {
      expect(registry.getSingleMetric(name), name).toBeTruthy();
    }
  });
});

describe("GET /metrics", () => {
  it("serves Prometheus text format with custom metric names", async () => {
    const response = await request(app).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("supplyguard_http_requests_total");
    expect(response.text).toContain("# HELP supplyguard_http_requests_total");
    expect(response.text).toContain("nodejs_");
  });

  it("normalizes cuid-like path segments to :id to bound cardinality", async () => {
    const token = process.env.METRICS_TOKEN;
    delete process.env.METRICS_TOKEN;
    await request(app).get("/scans/cmwcyqgjo0003m6gkr38oi1ep"); // 404 but counted
    const response = await request(app).get("/metrics");
    expect(response.text).toContain('route="/scans/:id"');
    expect(response.text).not.toContain("cmwcyqgjo0003m6gkr38oi1ep");
    process.env.METRICS_TOKEN = token;
  });

  it("requires Authorization: Bearer when METRICS_TOKEN is set", async () => {
    process.env.METRICS_TOKEN = "test-metrics-token";
    expect((await request(app).get("/metrics")).status).toBe(401);
    expect((await request(app).get("/metrics").set("Authorization", "Bearer wrong")).status).toBe(401);
    const ok = await request(app).get("/metrics").set("Authorization", "Bearer test-metrics-token");
    expect(ok.status).toBe(200);
    expect(ok.text).toContain("supplyguard_http_requests_total");
    delete process.env.METRICS_TOKEN;
  });
});
