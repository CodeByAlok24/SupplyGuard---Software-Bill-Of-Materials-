# SupplyGuard REST API

Base URL: `http://localhost:4000/api/v1` in local development. All protected
endpoints require the `sg_session` HTTP-only cookie issued by the auth routes.
Every lookup is scoped to a workspace membership on the server.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a user and initial workspace; returns user and workspace |
| POST | `/auth/login` | Verify credentials and issue session cookie |
| POST | `/auth/logout` | Revoke current session cookie |
| GET | `/auth/me` | Return current user and active workspace |

## Projects and scans

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/projects` | List or create a project |
| GET, PATCH, DELETE | `/projects/:projectId` | Read, update, or delete a workspace project |
| POST | `/projects/:projectId/scans` | Multipart upload (`package-lock.json`); returns `202 { jobId, status }` |
| GET | `/scans/:jobId` | Read queued/running/completed/failed status and counts |
| GET | `/scans/:jobId/review` | Release verdict, fix plan, dependency paths, and diff against the previous completed scan |
| GET | `/scans/:jobId/sbom` | Download the generated CycloneDX JSON document |
| GET | `/projects/:projectId/components` | List components and dependency relationships |

Repository scans use `POST /projects/:projectId/scans/repository` and require a
GitHub connection (OAuth or a personal access token). Uploads are capped at
20 MB and must be valid npm lockfile v2 or v3 JSON.

## SBOM coverage (lockfile vs SBOM comparison)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/projects/:projectId/sbom-uploads` | Multipart upload of a CycloneDX JSON SBOM; returns `201 { item }` |
| GET | `/projects/:projectId/sbom-uploads` | List SBOM uploads for the project |
| POST | `/scans/:jobId/compare` | Compare an uploaded SBOM against the scan's lockfile components; body `{ "sbomUploadId": "…" }`; returns `201 { item }` with the coverage report |
| GET | `/comparisons/:id` | Read a stored comparison (coverage score + full report) |
| GET | `/comparisons/:id/report` | Download the coverage report as JSON |

Coverage formula (fixed, visible in the response):
`coverageScore = matchedComponents / totalLockfileComponents * 100`.
Matching tries the normalized CycloneDX purl first, then a case-insensitive
`name@version` fallback. Dependency edges compare `(parent, child)` name@version
pairs from the lockfile graph against the SBOM `dependencies[]` (bom-refs are
resolved back to components).

The report lists missing components, missing dependency relationships, and
metadata gaps (missing version, package identity, or licenses), each with a
human-readable explanation of why it reduces confidence in SBOM consumers.
Packages present only in the SBOM are listed separately as informational
extras and do not affect the score. A lockfile with zero components reports
100 by convention.

### Release review

`GET /scans/:jobId/review` returns a release verdict (`READY`, `REVIEW`, or
`BLOCKED`) with the exact checks behind it, a fix plan built from the OSV
affected ranges stored at scan time, the dependency path for each vulnerable
package, and a diff against the previous completed scan of the same project.

The gate rules are fixed and visible in the response: critical or high OSV
advisories and blocked licenses produce `BLOCKED`; unresolved license decisions,
moderate/unrated advisories, or incomplete OSV/license checks produce `REVIEW`.
The verdict is a release check, not a guarantee that the code is safe.

## Release evidence (manual chain links)

A manually registered chain: source repo/commit → build → SBOM → artifact →
deployment. Every field is optional; anything not supplied is stored as
“not provided” (never inferred). Evidence source is always `manual`; the
verification state is `unverified` by default and can only be advanced to
`user_asserted` by a human explicitly claiming they checked the values —
never by the system. Entries are workspace-scoped; create/update require
`OWNER`, `ADMIN` or `ANALYST`; delete requires `OWNER` or `ADMIN`; reads are
allowed for any workspace member.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/projects/:projectId/release-evidence` | List evidence entries for the project |
| POST | `/projects/:projectId/release-evidence` | Create an entry (validates digests, SHAs, URLs) |
| GET | `/release-evidence/:id` | Read one entry |
| PATCH | `/release-evidence/:id` | Update fields (same validation) |
| DELETE | `/release-evidence/:id` | Delete an entry (`OWNER`/`ADMIN` only) |

Digest validation: `sha256:` + 64 lowercase hex, or `sha512:` + 128 lowercase hex.
A bare 64/128 lowercase hex string is accepted and normalised to the `sha256:`/`sha512:` form.
Commit SHAs must be 40 or 64 lowercase hex (uppercase accepted, normalised).
Repository URLs must be absolute `https://host/path` or SSH `git@host:path` or `git@host:path.git`.

## Finding impact (finding → artifact → deployment)

Every vulnerability and license finding carries an `impact` object computed
from the scan's recorded evidence. It never changes vulnerability severity or
license decisions; it only states what the evidence chain shows.

`GET /scans/:jobId/impact` returns the full picture for one scan: the scan's
`sbomDigest` (present once the scan completes; `null` while running), severity
counts, and one impact entry per finding:

```json
{
  "item": {
    "scan": { "id": "…", "sbomDigest": "sha256:…", "…": "…" },
    "severityCounts": { "critical": 0, "high": 0, "moderate": 0, "low": 0, "unknown": 0 },
    "impact": [ { "findingId": "…", "findingType": "vulnerability", "componentName": "…", "componentVersion": "…", "componentPurl": "…", "dependencyPath": [ { "name": "…", "version": "…" } ], "status": "missing", "reason": "…", "evidenceUpdatedAt": null, "stale": false, "services": [] } ]
  }
}
```

Status values (deterministic, fixed rules):

| Status | Meaning |
| --- | --- |
| `verified` | The scan's `sbomDigest` is bit-exact to a digest in manually registered release evidence. Only then is the finding attributed to the registered artifact and deployments. |
| `linked` | Evidence explicitly references this scan (`scanJobId`) but no SBOM digest match is asserted (manual mapping). |
| `unverified` | The project has release evidence, but none references this SBOM or scan — the finding cannot be attributed to a deployment. |
| `missing` | No release evidence is registered for the project. |

`stale: true` means the newest evidence for the project was registered
*before this scan completed* — it cannot describe this scan's artifact.

`services` lists the deployments registered on the matching evidence entry:
`service`, `environment`, `region`, `artifactName`, `artifactDigest`,
`source` (always `manual`), `verificationState` (`unverified` or
`user_asserted`), the `evidenceId`, and any manually registered
`slos` matching the service+environment (see below). Missing fields are
`null` — never inferred. SLO data is attached for context only; it never
changes severity, license decisions, or the release verdict.

The same `impact` is embedded per finding in:

- `GET /scans/:jobId/review` → `item.findings.vulnerabilities[].impact` / `item.findings.licenses[].impact`, plus `item.evidence.sbomDigest` and `item.evidence.impact[]`
- `GET /vulnerabilities/findings` and `GET /licenses/findings` → `items[].impact` (workspace-wide)

The digest stored on a scan is `sha256` of exactly the bytes served by
`GET /scans/:jobId/sbom`, so `sha256sum` of the downloaded SBOM always
matches a `verified` comparison.

## Provenance attestations (SLSA / in-toto — safe parsing only)

SupplyGuard can **parse and structurally validate** a standard build
provenance attestation uploaded against a release evidence entry, and compare
the attestation's subject digest to the artifact digest registered on that
evidence. This is **not** cryptographic verification.

**Accepted formats** (established standards only — no custom format):

- SLSA Provenance v1.0 (`https://slsa.dev/provenance/v1`) — in-toto Statement v1
- SLSA Provenance v0.2 (`https://slsa.dev/provenance/v0.2`) — in-toto Statement v0.1
- Either wrapped in a DSSE envelope (`payloadType` must be `application/vnd.in-toto+json`); DSSE signatures are **counted, never verified** — nothing is checked against key material and no trust root is configured.

**Explicitly not implemented:** signature verification of any kind (no
cosign/sigstore/Fulcio/Rekor integration, no public-key pinning, no
certificate-chain validation). Every attestation is stored with
`signatureState: "unverified"` and the UI labels it **“Unverified”**. A
matching subject digest proves both documents name the same digest — nothing
about authenticity or builder identity.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/release-evidence/:id/attestation` | Upload attestation (multipart `file`, ≤ 2 MB; `OWNER`/`ADMIN`/`ANALYST`). Replaces any previous attestation for the evidence. |
| GET | `/release-evidence/:id/attestation` | Read the parsed attestation |
| DELETE | `/release-evidence/:id/attestation` | Remove it (`OWNER`/`ADMIN`) |

The evidence detail/list responses also embed the parsed `attestation`.

**What is extracted and stored:** envelope type, statement/predicate types,
`payloadDigest` (sha256 of the exact uploaded bytes), subjects (name +
validated lowercase-hex digests), builder id, build type, invocation id,
start/finish timestamps, source repository + revision (from
`resolvedDependencies` / `materials` / `configSource`, deterministic rules
only), materials (validated, ≤ 50), signature count, file size. **Invocation
or external parameters are never stored** — they can carry secrets.
**Deliberately absent:** any raw payload retention; only the payload digest
is kept.

**Validation rules:** 2 MB size cap (both at upload and after DSSE
base64-decoding); JSON must parse; `_type` must be a supported Statement type;
`predicateType` must be SLSA provenance; subjects ≤ 25; materials ≤ 50; URIs
must use http/https/ssh/git(+http,+https,+ssh)/pkg with no embedded
credentials (any `file:`, `data:`, `javascript:` etc. is rejected); digests
must be hexadecimal of the algorithm's required length (sha256 → 64,
sha512 → 128, sha1/gitCommit → 40); timestamps must be ISO 8601; duplicate
schemas are rejected, digests are compared case-insensitively but stored
lowercase.

**Digest matching:** `subjectMatchesArtifact` is `true`/`false` when the
evidence has an artifact digest (matching on the same algorithm), otherwise
`null`. A mismatch does **not** alter the evidence record — it is reported
for you to act on.

**Errors:** malformed JSON → `400 invalid_json`; oversize → `400
limit_file_size`; unsupported format → `400 unsupported_predicate` /
`unsupported_statement_type` / `unsupported_payload_type`; malformed
predicate → `400 invalid_predicate`; unreadable URI digest → `400
invalid_uri` / `invalid_statement` / `invalid_timestamp`. These are user
input problems, never server errors, and no raw content appears in
responses.

## Service level objectives (manual reliability context)

SLOs are **user-entered only**. SupplyGuard does not have a live
OpenTelemetry, Prometheus or CloudWatch integration — none is configured or
queried. `GET /telemetry/status` reports `manual: "available (user-entered
values only)"` and `opentelemetry` / `prometheus` / `cloudwatch`:
`"not implemented"`. Every SLO is labeled **Manual**.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/telemetry/status` | Which telemetry providers exist (only `manual`) |
| GET | `/projects/:projectId/slos` | List SLOs for the project |
| POST | `/projects/:projectId/slos` | Register an SLO (`OWNER`/`ADMIN`/`ANALYST`) |
| GET | `/slos/:id` | Read one SLO |
| PATCH | `/slos/:id` | Update (same validation, merged with stored values) |
| DELETE | `/slos/:id` | Delete an SLO (`OWNER`/`ADMIN` only) |

Fields: `service` and `environment` (required, normalized to lowercase
tokens for deterministic matching against release evidence), `name` and
`indicatorName` (required), `target` (required, percentage scale,
`0 < target ≤ 100`), plus optional `observedValue` (same scale,
`0–100`), `windowDays` (whole days, 1–365), `observedAt` (ISO 8601) and
`note`. An `observedValue` requires a window and a timestamp; a window
without an observed value is rejected. Duplicate
`(service, environment, name)` per project returns `409`.

**Error budget formula** (computed at read time, never stored):

```
budgetPercent      = 100 - target
observedBadPercent = 100 - observedValue        (only when observedValue is set)
consumedPercent    = observedBadPercent / budgetPercent * 100
remainingPercent   = max(0, 100 - consumedPercent)
status             = "exhausted" when observedBadPercent >= budgetPercent
                     "within"    otherwise
                     "not_calculable" when observedValue is missing/invalid
```

Notes and limits:

- The observed value is assumed to share the target's scale
  (e.g. availability / success ratio as a percentage). Other units are
  unsupported and will produce misleading numbers — pick the indicator name
  to make the scale obvious.
- `target = 100` yields a zero budget: any bad fraction exhausts it.
- Boundary case (`observedBad == budget`) counts as **exhausted**.
- `not_calculable` returns `null` numerics for the observed side; only the
  target-derived `budgetPercent` is still shown.
- PATCH merges stored + update and revalidates the pair, so you cannot end
  in an inconsistent state (e.g. an observed value without a window).
- Matching to findings is case-insensitive on service+environment; SLOs do
  not affect vulnerability severity, license decisions, the release verdict,
  or OSV/license policy evaluation.
- Adapter boundary: `backend/telemetry.ts` defines `SloProvider`. Only the
  manual provider is registered. Implementing a real provider means code
  changes there — it cannot be enabled from the UI or the API.

## Operational metrics (outside /api/v1)

`GET /metrics` serves Prometheus text format: default Node process metrics,
`supplyguard_http_requests_total{method, route, status}` with normalized route
labels (cuid/uuid-like segments → `:id`), a duration histogram, scan outcome
counters (`supplyguard_scans_total{result, source}`), scan duration histogram,
OSV/license check outcome counters, report-generation counters, and
`supplyguard_queue_depth{queue}` (pg-boss pending+active jobs; `-1` when the
pg-boss schema is unavailable).

No findings, no user input, no secrets are included. Metrics are in-memory and
reset on process restart. Unauthenticated by default for localhost scraping;
set `METRICS_TOKEN` in `backend/.env` to require `Authorization: Bearer`.

## Findings, reviews, and reports

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/licenses/findings` | List license observations and policy decisions |
| PATCH | `/licenses/findings/:findingId/review` | Record allow/block/needs-review decision and reviewer note |
| GET | `/vulnerabilities/findings` | List OSV vulnerability matches |
| GET, POST | `/reports` | List or generate a report for a completed scan |
| GET | `/reports/:reportId/download` | Download a generated report |

Report formats (`POST /reports` body `{ "scanJobId", "format" }`):

| Format | Mime | Content |
| --- | --- | --- |
| `cyclonedx-json` | `application/vnd.cyclonedx+json` | SBOM of the scan (CycloneDX 1.6) |
| `licenses-csv` | `text/csv` | License findings CSV |
| `vulnerabilities-csv` | `text/csv` | OSV findings CSV |
| `release-evidence-json` | `application/json` | Full release evidence report |
| `release-evidence-csv` | `text/csv` | Findings × deployments flat rows |

**Release evidence report** (`release-evidence-json`): `report` marker,
`reportVersion`, `generatedAt`; `project` (id/name) and `scan` (id, status,
source, repository, branch, timestamps, component/vulnerability/license
counts, OSV and license check states, `sbomFormat` `CycloneDX 1.6`,
`sbomDigest`); `releaseEvidence[]` — every entry registered for the project
with `linkedToThisScan`, digests, deployment mapping, source/verification
state, staleness vs the scan completion time, and any **embedded
attestation** (`signatureState` is always `unverified`, with
`subjectMatchesArtifact` and a note that equality of digests ≠ authenticity);
`findings.vulnerabilities[]` and `findings.licenses[]` with severity/decision
and the per-finding `impact` object (status, reason, dependency path,
stale flag, attributed services and their manual SLOs);
`slos[]` — manual SLOs with source, observation time and the computed
`errorBudget` (`within`/`exhausted`/`not_calculable`);
`impactStatusCounts`; and the fixed `rules` and `limitations` text.

**CSV safety:** every cell is quoted; a leading `=`, `+`, `-`, `@` (after
optional whitespace/tab/CR) is prefixed with a single quote to neutralize
spreadsheet formula injection. No secrets, tokens, SQL, or internal paths
appear in any report variant.

The report is produced from stored scan results; nothing is re-queried or
re-verified at generation time.

## Settings

| Method | Path | Purpose |
| --- | --- | --- |
| GET, PUT | `/settings/license-policies` | Read or replace workspace license policy rules |
| GET, PUT | `/settings/workspace` | Read or update the workspace name |

## Response conventions

Success responses use JSON. Errors use `{ "error": { "code", "message", "details?" } }`.
Collection routes return `{ items }`. IDs are opaque strings. Dates are ISO-8601.
Unknown license metadata is stored as `null` and displayed as **Unknown / needs
review**; policy evaluation never invents a license expression.

# Data model

The Prisma schema in `backend/prisma/schema.prisma` is the authoritative model.

- `User`, `Workspace`, `WorkspaceMember`: authenticated identity and role-based
  workspace boundary (`OWNER`, `ADMIN`, `ANALYST`, `VIEWER`).
- `Project`: workspace-owned npm project and optional repository metadata.
- Workspace settings: workspace name; membership role determines who can update it.
- `ScanJob`: durable queued job lifecycle and result/error metadata.
- `Component`: package identity, purl, version, and license observation plus
  provenance. A missing observation remains unknown.
- `DependencyEdge`: directed parent-to-child relationship within a scan.
- `LicenseFinding`: observed license evidence kept separate from the workspace
  `LicensePolicy` decision.
- `VulnerabilityFinding`: OSV identifier, aliases, severity, and affected ranges.
- `ReviewDecision`: immutable audit record for a human review of a license finding.
- `Report`: generated downloadable artifact associated with a completed scan.

The API and worker are separate Node processes. The Express API writes a
`ScanJob` and enqueues it in PostgreSQL-backed `pg-boss`; the worker reads the
uploaded lockfile, creates the SBOM and findings, and updates the job. The
browser only talks to Express through `src/lib/api.ts`.
