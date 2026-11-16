import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db.js";

// SupplyGuard's own operational metrics — no business data, no findings.
// Served at GET /metrics (outside /api/v1). Unauthenticated by default for
// localhost scraping; set METRICS_TOKEN to require `Authorization: Bearer`.
// Nothing here is derived from OSV, licenses, or release evidence beyond
// simple counts of scan/check/report activity.

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const scansTotal = new Counter({
  name: "supplyguard_scans_total",
  help: "Scan jobs that reached a terminal state, by result and source.",
  labelNames: ["result", "source"],
  registers: [registry],
});

export const scanDurationSeconds = new Histogram({
  name: "supplyguard_scan_duration_seconds",
  help: "Wall-clock duration of a scan job, worker start to terminal state.",
  buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800],
  labelNames: ["source"],
  registers: [registry],
});

export const osvChecksTotal = new Counter({
  name: "supplyguard_osv_checks_total",
  help: "OSV integration outcomes recorded at scan completion.",
  labelNames: ["status"],
  registers: [registry],
});

export const licenseChecksTotal = new Counter({
  name: "supplyguard_license_checks_total",
  help: "License metadata lookup outcomes recorded at scan completion.",
  labelNames: ["status"],
  registers: [registry],
});

export const reportsGeneratedTotal = new Counter({
  name: "supplyguard_reports_generated_total",
  help: "Reports generated, by format.",
  labelNames: ["format"],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: "supplyguard_http_requests_total",
  help: "HTTP requests to the API, by method, normalized route and status class.",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "supplyguard_http_request_duration_seconds",
  help: "HTTP request duration in seconds, by method.",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 10],
  labelNames: ["method"],
  registers: [registry],
});

// Queue depth is expensive to poll on every scrape; prom-client's collect()
// runs only when scraped, so we hit pg-boss only then, guarded.
export const queueDepth = new Gauge({
  name: "supplyguard_queue_depth",
  help: "Jobs waiting or being processed for the supplyguard-scan queue (-1 when pg-boss schema is unavailable).",
  labelNames: ["queue"],
  registers: [registry],
  async collect() {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ depth: bigint | number }>>(
        "SELECT count(*) AS depth FROM pgboss.job WHERE name = 'supplyguard-scan' AND state IN ('created', 'retry', 'active')",
      );
      const value = rows[0]?.depth;
      this.set({ queue: "supplyguard-scan" }, value === undefined ? -1 : Number(value));
    } catch {
      this.set({ queue: "supplyguard-scan" }, -1);
    }
  },
});

// Normalize cuid/uuid-like path segments to :id to keep label cardinality bounded.
const ID_SEGMENT = /[a-z][a-z0-9]{23,31}|[0-9a-f]{8}-[0-9a-f-]{27,36}/g;

export function normalizeRoute(path: string): string {
  const clean = path.split("?")[0].replace(/\/{2,}/g, "/");
  const normalized = clean.replace(ID_SEGMENT, ":id").slice(0, 160);
  return normalized || "/";
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const method = req.method.toUpperCase();
  res.on("finish", () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = normalizeRoute(req.originalUrl || req.path || "/");
    httpRequestsTotal.inc({ method, route, status: String(res.statusCode) }, 1);
    httpRequestDurationSeconds.observe({ method }, seconds);
  });
  next();
}

/** GET /metrics — optionally guarded by METRICS_TOKEN (Bearer). */
export async function metricsHandler(req: Request, res: Response) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const header = req.headers.authorization || "";
    if (header !== `Bearer ${token}`) {
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.status(401).send("unauthorized\n");
      return;
    }
  }
  res.setHeader("content-type", registry.contentType);
  res.send(await registry.metrics());
}

// The scan worker is a separate process with its own counters — scrape it on
// its own port or its scan metrics are invisible to Prometheus.
export async function startWorkerMetricsServer(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const { createServer } = await import("node:http");
  const port = Number(process.env.WORKER_METRICS_PORT || 4001);
  const server = createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "/";
    if (req.method !== "GET" || url !== "/metrics") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found\n");
      return;
    }
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
      res.end("unauthorized\n");
      return;
    }
    registry.metrics().then(
      (body) => {
        res.writeHead(200, { "content-type": registry.contentType });
        res.end(body);
      },
      () => {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("metrics unavailable\n");
      },
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  console.log(`Worker metrics on http://127.0.0.1:${port}/metrics`);
}
