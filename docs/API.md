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

## Findings, reviews, and reports

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/licenses/findings` | List license observations and policy decisions |
| PATCH | `/licenses/findings/:findingId/review` | Record allow/block/needs-review decision and reviewer note |
| GET | `/vulnerabilities/findings` | List OSV vulnerability matches |
| GET, POST | `/reports` | List or generate a report for a completed scan |
| GET | `/reports/:reportId/download` | Download a generated report |

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
