import "dotenv/config";
import PgBoss from "pg-boss";
import { prisma } from "./db.js";
import { processRepositoryScan, processScan } from "./scanner.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be configured before starting the worker.");
const boss = new PgBoss({ connectionString: databaseUrl });

await boss.start();
await boss.createQueue("supplyguard-scan");
await boss.work("supplyguard-scan", { batchSize: 1 }, async (jobs) => {
  for (const job of jobs) {
    const scanJobId = (job.data as { scanJobId?: string } | undefined)?.scanJobId;
    if (!scanJobId) continue;
    try {
      const source = (job.data as { source?: string } | undefined)?.source;
      if (source === "repository") await processRepositoryScan(scanJobId);
      else await processScan(scanJobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed unexpectedly.";
      await prisma.scanJob.updateMany({ where: { id: scanJobId, status: { not: "COMPLETED" } }, data: { status: "FAILED", errorCode: "scan_failed", errorMessage: message, completedAt: new Date() } });
      console.error(`Scan ${scanJobId} failed:`, message);
    }
  }
});

console.log("SupplyGuard scan worker is listening for jobs.");

process.on("SIGTERM", async () => { await boss.stop(); await prisma.$disconnect(); process.exit(0); });
