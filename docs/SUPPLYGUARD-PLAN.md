# SupplyGuard — Architecture, Data Flow, and Build Plan

Status snapshot and target plan for the SBOM + deployment-aware supply-chain risk platform.
Everything in this document is either **(done)**, **(partial)**, or **(not started)**.

---

## 1. What already exists (current state)

| Capability | State | Notes |
|---|---|---|
| Landing, login, register, reset flow | done | OAuth redirects work; callback not verified end-to-end by the owner |
| Workspace + projects + multi-tenant isolation | done | Per-workspace data, roles OWNER/ADMIN/ANALYST/VIEWER |
| SBOM generation from `package-lock.json` (v2/v3) | done | CycloneDX 1.6 JSON, stored on `ScanJob.sbom` |
| Upload + repository scan, background worker (pg-boss) | done | Real stage progress (`queued → … → finalizing`) |
| OSV vulnerability matching incl. enriched details | done | Severity/summary/affected ranges via per-ID enrichment |
| License policy engine (ALLOW/BLOCK/REVIEW) | done | Workspace-scoped, stored decisions |
| Components inventory + dependency tree graph | done | 34-edge graph renders in `/components` |
| Release Review (verdict, fix plan, diff) | done | Explainable READY/REVIEW/BLOCKED gate |
| Reports (SBOM JSON, license CSV, vuln CSV) | done | Stored in DB, downloadable |
| PostgreSQL + Prisma | done | PostgreSQL 18, user-managed persistent cluster at `~/.local/share/supplyguard/pgdata` (not `/tmp`); survives reboots and temp-dir wipes; `ensure-db.sh` auto-starts it |
| **SBOM vs lockfile comparison (coverage gaps)** | **done (local MVP)** | `SbomUpload`/`SbomComparison` models, `/sbom-uploads` + `/comparisons` API, "SBOM coverage" tab on Components page with explanations per gap |
| **Cloud deployment mapping by image digest (manual)** | **done (manual phase)** | `ReleaseEvidence` registers digest→service/env by hand; finding impact attributes findings only on bit-exact SBOM-digest match; `/scans/:jobId/impact` + impact everywhere; deployment ingestion from AWS still **not started** |
| **Release evidence CRUD** | **done** | `ReleaseEvidence` model, `/evidence` UI, routes incl. digest validation/normalization; workspace-scoped; manual-only |
| **Provenance attestation (parse-only)** | **done (parse-only)** | See above |
| **App metrics (/metrics) + Grafana dashboard** | **done (running locally)** | Prometheus 3.5.0 on `127.0.0.1:9090` + Grafana 12.0.2 on `:3001` (user-local, no system packages; dashboard provisioned; scan panels empty until a scan runs); endpoints `unauthenticated` localhost default, `METRICS_TOKEN` supported |
| **SLSA/in-toto provenance attestation** | **done (parse-only)** | Standard formats (SLSA v1/v0.2, DSSE); validated, stored **unverified**; subject↔artifact digest comparison; **no signature verification** — trust root not configured |
| **SLO / error-budget display** | **done (manual phase)** | SLOs registered by hand per service+environment; error budgets computed at read time; **no live telemetry** (OTel/Prometheus/CloudWatch adapter boundary exists, providers not implemented) |
| **Export evidence-based impact report** | **done (manual phase)** | `release-evidence-json` / `release-evidence-csv` report formats; CSV formula-injection escaped; findings×deployments rows |
| AWS deployment (ECS/RDS/S3/SQS/CI) | not started | Blocked on credentials; will cost money |
| Research evaluation harness | **design only** | No code exists; protocol sketched in `docs/RESEARCH-EVALUATION.md`; no measurements taken; not novelty-reviewed |

---

## 2. Target architecture (local-first, cloud-optional)

```
┌────────────────────────── Local (now) ──────────────────────────┐
│                                                                 │
│  Browser ──► Next.js (3000) ──► Express API (4000) ──► Postgres │
│                                    │                              │
│                                    ├─► pg-boss queue ──► Worker   │
│                                    │        │                     │
│                                    │        ├─► OSV API (network) │
│                                    │        └─► lockfile parse /  │
│                                    │            SBOM build        │
│                                    │                              │
│                             ScanJob.sbom (Json column)            │
└─────────────────────────────────────────────────────────────────┘
                    ▲ later phase, when AWS is provisioned ▲
┌───────────────────────────── Cloud ──────────────────────────────┐
│  GitHub Actions ──► build image ──► ECR ──► ECS/Fargate task     │
│       │                                   │                       │
│       └─► push SBOM + lockfile to S3      ├─► RDS Postgres        │
│                                            └─► SQS compare jobs   │
│  ECS service image digest ───────────────► DeploymentLink table   │
│  OpenTelemetry → Prometheus/Grafana or CloudWatch (SLO display)   │
└──────────────────────────────────────────────────────────────────┘
```

Non-negotiable invariants:
- Analysis is **background jobs**, never blocking web requests (already true via pg-boss).
- Secrets live server-side only (JWT_SECRET, DB password, OAuth secrets in `backend/.env`).
- All reads/writes scoped by `workspaceId` (already true).
- Never present mock data as live results — unconfigured integrations must say "not connected".
- Finding severity is **never** altered by SLO status. SLO/error-budget is shown beside findings, not merged into them.

---

## 3. Data flow

### 3.1 Scan + comparison flow (new)

```
lockfile ───────────────► parse → components[], edges[] ─┐
                                                        ├─► ScanJob (components/edges stored)
uploaded SBOM ─────────► parse (CycloneDX) ──────────────┘
                                                        │
                          compare(components, sbomComponents)
                          compare(edges, sbomDependencies)
                          check metadata completeness (purl, version, license)
                                                        │
                                        SbomComparison.coverageReport
```

### 3.2 Deployment-aware flow (AWS phase)

```
CI/CD: build image → tag = git sha → push ECR (digest sha256:…)
SBOM generated at build → uploaded to S3 (sbom/<project>/<digest>.cdx.json)

Deploy job registers:  DeploymentLink { digest, service, env, region, ecsCluster, taskDef }

App matches:  Component.purl ↔ sbom components; SBOM ↔ DeploymentLink by digest

UI shows:  service (prod/stage) · digest · SLO target (e.g. 99.9%) · current
           availability · error-budget remaining — beside each finding
```

If AWS is not provisioned, `DeploymentLink` can be **entered manually** by the user (digest + service name + env). The app never fabricates links; manual entries are labeled "manually registered".

---

> **Status (Nov 2026):** the *manual* phase of this design shipped: `ReleaseEvidence`
> (digest → service/environment mapping, SLOs, SLSA attestation parsing), routes
> `GET/POST/PATCH/DELETE /release-evidence*`, `GET/POST /scans/:jobId/impact`,
> workspace-wide impact on findings endpoints, `/evidence` and `/reliability` pages,
> release-evidence report formats. The `DeploymentLink` / `SloConfig` models sketched
> below were **not** implemented — manual registration was implemented instead.
> Auto-ingestion (AWS/ECR/ECS) and live telemetry remain **not started**.

## 4. Database model additions

Keep existing models. Add:

```prisma
model SbomUpload {
  id          String   @id @default(cuid())
  workspaceId String
  projectId   String
  fileName    String
  format      String   // "cyclonedx-json"
  content     Json     // the raw SBOM document
  createdById String?
  createdAt   DateTime @default(now())
  project     Project  @relation(fields:[projectId], references:[id], onDelete: Cascade)
}

model SbomComparison {
  id            String   @id @default(cuid())
  workspaceId   String
  projectId     String
  lockfileScanJobId String?   // the scan whose lockfile we compare against
  sbomUploadId  String?
  coverageScore Float    // 0–100, with documented formula
  report        Json     // see §4.1
  createdAt     DateTime @default(now())
  project       Project  @relation(fields:[projectId], references:[id], onDelete: Cascade)
  @@index([workspaceId, createdAt])
}

model DeploymentLink {
  id           String   @id @default(cuid())
  workspaceId  String
  projectId    String
  digest       String   // sha256:…
  serviceName  String
  environment  String   // "production" | "staging" | …
  region       String?
  ecsCluster   String?
  ecsService   String?
  imageUri     String?
  source       String   // "aws-ecr/ecs" | "manual"
  createdAt    DateTime @default(now())
  @@unique([projectId, digest])
  @@index([workspaceId, createdAt])
}

model SloConfig {
  id           String   @id @default(cuid())
  workspaceId  String
  serviceName  String
  sliMetric    String   // e.g. "availability", "latency"
  target       Float    // e.g. 99.9
  windowDays   Int      // e.g. 30
  source       String   // "manual" | "cloudwatch" | "prometheus"
  currentValue Float?   // last known; labeled with source + checkedAt
  errorBudgetUsed Float? // 0–1
  checkedAt    DateTime?
  @@unique([workspaceId, serviceName])
}
```

### 4.1 `SbomComparison.report` shape

```json
{
  "formula": "coverage = matched_components / total_lockfile_components",
  "sbomComponents": 123, "lockfileComponents": 129,
  "matchedComponents": 118, "coverageScore": 91.5,
  "missingComponents": [ { "purl": "pkg:npm/ws@8.18.0", "direct": true, "explanation": "Lockfile requires it; SBOM components[] has no entry (by name@version)." } ],
  "missingEdges":    [ { "parent": "…", "child": "…", "explanation": "SBOM dependencies[] does not contain this relationship." } ],
  "metadataGaps":    [ { "purl": "…", "missing": ["licenses", "bom-ref"], "explanation": "…" } ],
  "extraComponents": [ { "purl": "…", "explanation": "In SBOM but absent from lockfile comparison set — may be stale or out-of-ecosystem." } ]
}
```

### 4.2 Explicitly NOT doing

- No severity adjustment from SLO/error-budget. They are displayed side-by-side only.
- No fabricated digests, services, or SLO values. Missing integrations show "not connected" with setup steps.
- No "AI" opaque scoring without a documented formula — every score shows its formula.

---

## 5. API additions

**Implemented** (Nov 2026): `/sbom-uploads`, `/comparisons/*`, `/release-evidence*`,
`/scans/:jobId/impact`, `/vulnerabilities/findings` + `/licenses/findings` (embed
impact), `/telemetry/status`, `/projects/:id/slos`, `/slos/:id`,
`/release-evidence/:id/attestation`, `POST /reports` formats
`release-evidence-json` / `release-evidence-csv`.

**Not implemented** (sketched below, superseded — kept for the cloud phase):

```
POST /projects/:projectId/deployments         # auto-ingested digest registration
GET  /projects/:projectId/deployments         # digest ↔ service map from CI/cloud
GET  /deployments/:id/impact                  # findings + live SLO/error-budget
PUT  /settings/slos                           # upsert SloConfig (cloudwatch/prometheus-backed)
```

All workspace-scoped, all behind `requireSession` + `requireRole` where needed.

---

## 6. Pages — what changes

> **Status (Nov 2026):** all of these now exist in *manual* form: `/evidence` (Release
> evidence page), `/reliability` (Reliability context page), "Deployment impact" section
> and impact chips on the Release Review page, impact columns + filters on Vulnerabilities
> and License Compliance pages, and the release-evidence report formats on the Reports
> page. "Cloud Deployments & Reliability" as an *auto-connected* view remains not started.

| Page | Change |
|---|---|
| Cloud Deployments & Reliability (new) | Service/digest/env/SLO/error-budget table; links findings to services; "not connected" when no telemetry source |
| Components & Dependencies | Add "SBOM coverage" panel: upload + compare result, coverage score, missing list |
| Release Review | Add "Deployment impact" section when digest matches a DeploymentLink |
| Reports | Add "Impact report" export (findings × SLO × services) |
| Overview | Add tile: "SBOM coverage: X% of Y components" once comparison exists |
| Others | unchanged |

---

## 7. Research evaluation (proposal — scope pending)

**Research question.** Does comparing an SBOM against its lockfile reveal missing
components and relationships that flat SBOM review misses, and does deployment
context help users identify affected services?

**Baseline.** Flat SBOM review: parse SBOM alone, no lockfile comparison.
**Treatment.** Lockfile-vs-SBOM comparison + deployment linking.
**Corpus.** Public npm projects (Express, React, Express boilerplates) plus
**controlled mutations**: delete random components/edges/metadata from a known-good
CycloneDX document, then measure detection.

**Metrics.** Detection accuracy (precision/recall of missing items), false alarms
(extra components flagged that are legitimate), comparison runtime, and
wrong-attribution rate when digests are stale.

**Related work (from general knowledge — VERIFY before citing).**
OWASP Dependency-Track ingests SBOMs and tracks vulnerabilities but does not
score SBOM *completeness against the lockfile* or bind findings to ECS uptime.
`sbom-utility` (Accenture) validates CycloneDX structure, not repository-vs-SBOM
content coverage. NTIA *minimum elements* define what an SBOM must contain,
not whether one instance is complete. OSV provides advisories, not completeness.
Sigstore/in-toto address provenance, not coverage.
**Do not claim novelty** until a real literature + tool survey is done — the
honest claim today is "deployment-aware SBOM completeness together with SLO
context" as an integration, not a new method.

**Limits of the comparison (document in the report).**
- Only lockfile-declared packages are comparable (no vendored/binary-only deps).
- Name@version equality misses renames and forks.
- Transitive edges depend on lockfile structure, not on runtime behavior.
- SBOMs generated from a different lockfile version will produce false gaps.
- SLO is an operational signal, not a security signal; they are shown side by side, never merged.

---

## 8. Setup checklist (beginner order)

Each step lists where to run it, what success looks like, and common fixes.

**0. Prereqs** — Node ≥ 20.9 (`node -v`), npm, PostgreSQL 18 (`psql --version`; install via `sudo pacman -S postgresql`). No Docker required — the database runs as a user-managed cluster (`initdb -D ~/.local/share/supplyguard/pgdata`) with the data persisted outside `/tmp`.

**1. Clone & install** — `cd "/home/alokrdas/Projects/Cloud - SBOM" && npm install && npm --prefix backend install`. Success: exit 0. Fix peer/dep errors: delete `node_modules` and retry.

**2. Environment** — `cp backend/.env.example backend/.env && cp frontend/.env.local.example frontend/.env.local`, set `JWT_SECRET` (≥ 32 chars) and `DATABASE_URL`. Success: files exist, no secrets committed. **Never paste real secrets into chat or commit them.**

**3. Start the database** — `npm run db:start` (PostgreSQL cluster at `~/.local/share/supplyguard/pgdata`, port 5432). Success: `npm run db:status` shows server running and `curl localhost:5432` reachable (psql auth works). `dev:api` / `dev:worker` start it automatically when not already up.

**4. Generate client + migrate** — `npm run db:generate && npm run db:migrate`. Success: migrations applied. Verify: `psql "$DATABASE_URL" -c '\dt' | head`.

**5. Run the stack** — three terminals: `npm run dev`, `npm run dev:api`, `npm run dev:worker`. Success: `curl localhost:4000/api/v1/health` → `{"status":"ok","database":"connected"}` and `curl localhost:3000` → 200.

**6. Sample scan** — `/register`, upload a `package-lock.json` at `/scanner`. Success: scan reaches `completed`, SBOM download works (CycloneDX 1.6), OSV findings appear, **Release Review** shows a verdict.

**7. Checks** — `npm run lint`, `npm run build`, `npm --prefix backend run typecheck`. Success: all pass.

**8. AWS phase (costs money)** — only after local MVP works. See §9.

---

## 9. AWS phase (flagged costs)

Nothing here is required for the local MVP. Steps, IAM, and GitHub Actions
secrets will be documented when you provision accounts. Sketch:

- S3 bucket for SBOM uploads/reports (`s3:PutObject`/`GetObject`).
- ECR + ECS Fargate service; task role with ECR pull + CloudWatch write.
- RDS PostgreSQL (or keep the local DB for the MVP and provision RDS later).
- SQS analysis queue (optional; pg-boss works fine locally — SQS adds AWS-native decoupling, not correctness).
- GitHub Actions: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or OIDC role) in repo secrets; workflow builds image → pushes → SBOM to S3 → registers digest.

**Cost flags:** ECS tasks, RDS, NAT gateways, and data transfer all bill monthly. Local alternatives: keep everything in the existing local stack; simulate deployment registration manually (digest + service + env) and simulate SLOs as *labeled manual entries* until CloudWatch/Prometheus is connected.

---

## 10. Implemented (this pass)

- `SbomUpload` + `SbomComparison` Prisma models, migration `sbom-comparison` applied.
- `POST /projects/:projectId/sbom-uploads`, `GET /projects/:projectId/sbom-uploads`,
  `POST /scans/:jobId/compare`, `GET /comparisons/:id`, `GET /comparisons/:id/report`.
- Comparison engine in `backend/sbom-compare.ts`: coverage score (visible formula),
  missing components with per-item explanations (direct flagged), missing dependency
  relationships, metadata gaps (version/purl/licenses), extra-vs-lockfile extras as info.
- "SBOM coverage" tab on the Components page: upload, compare, score, gap lists,
  downloadable JSON report. Verified end-to-end: intact SBOM scores 100/100; a deliberately
  sabotaged SBOM (component removed + edges removed + licenses stripped) scores 75/100
  and reports the missing component, the missing edge, and the metadata gap with reasons.
- **Not yet deployed to any cloud. All data structures for cloud phases exist; no AWS code runs.**

## 11. Honest status (verified Nov 14, 2026 against the code)

- Working locally today: scan, SBOM, findings, policies, reports, release review,
  release evidence registration + finding impact, manual SLOs, provenance attestation
  parsing, release-evidence reports.
- SBOM-vs-lockfile comparison **exists** (`SbomComparison`, `/sbom-uploads`, `/comparisons/*`) and is exercised by the Components page.
- Deployment attribution is **manual-only** (release evidence digest match); nothing is ingested from AWS/ECR/ECS; SLO data is **manual** (no telemetry integration); provenance signatures are **never verified**.
- SMTP reset flow unverified (Google rejects the configured app password); Google OAuth restricted to Testing-mode users; GitHub OAuth round-trip unverified end-to-end.
- DB is a persistent user-managed PostgreSQL 18 cluster (`~/.local/share/supplyguard/pgdata`); `/tmp` is no longer used. Docker Compose (postgres:18-alpine) is documented but untested on this machine.
- Nothing is presented as deployed on AWS or as having live telemetry until you provide/provision it.
