import { z } from "zod";

// Release evidence is a manually registered chain link. The formats below
// constrain anything a user can type so downstream verification tooling
// can trust identifiers and digests — without inventing values the user
// did not actually provide.

export function normalizeDigest(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;
  const match = value.match(/^(sha256|sha512):([0-9a-f]+)$/);
  if (match) {
    const expected = match[1] === "sha256" ? 64 : 128;
    return match[2].length === expected ? `${match[1]}:${match[2]}` : null;
  }
  if (/^[0-9a-f]{64}$/.test(value)) return `sha256:${value}`;
  if (/^[0-9a-f]{128}$/.test(value)) return `sha512:${value}`;
  return null;
}

export function normalizeSha(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;
  return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function normalizeHttpUrl(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  return url.toString();
}

export function normalizeGitHubUrl(input: string | null | undefined): string | null {
  const value = normalizeHttpUrl(input);
  if (value) return value;
  if (typeof input !== "string") return null;
  const ssh = input.trim();
  // scp-like SSH remote: git@github.com:org/repo(.git)?
  if (/^git@[a-z0-9.-]+:[a-z0-9._/-]+\.git$/i.test(ssh)) return ssh;
  if (/^git@[a-z0-9.-]+:[a-z0-9._/-]+$/i.test(ssh)) return ssh;
  return null;
}

const optionalTrimmed = (max: number, label: string) =>
  z.string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullable()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : null));

export const releaseEvidenceCreateSchema = z.object({
  scanJobId: z.string().trim().min(1).max(64).nullable().optional().transform((value) => value && value.trim() ? value.trim() : null),
  repositoryUrl: z.string().trim().max(500).nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const normalized = normalizeGitHubUrl(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Enter a valid repository URL (https://host/path or git@host:path[.git])." });
        return z.NEVER;
      }
      return normalized;
    }),
  commitSha: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const normalized = normalizeSha(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Commit SHA must be 40 or 64 hexadecimal characters." });
        return z.NEVER;
      }
      return normalized;
    }),
  sbomName: optionalTrimmed(200, "SBOM name"),
  sbomFormat: optionalTrimmed(50, "SBOM format"),
  sbomSerialNumber: optionalTrimmed(100, "SBOM serial number"),
  sbomGeneratedAt: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: "custom", message: "SBOM generated timestamp must be a valid date/time (ISO 8601)." });
        return z.NEVER;
      }
      return parsed;
    }),
  sbomDigest: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const normalized = normalizeDigest(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "SBOM digest must be sha256:<64 hex> or sha512:<128 hex>." });
        return z.NEVER;
      }
      return normalized;
    }),
  artifactName: optionalTrimmed(200, "Artifact name"),
  artifactDigest: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const normalized = normalizeDigest(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Artifact digest must be sha256:<64 hex> or sha512:<128 hex>." });
        return z.NEVER;
      }
      return normalized;
    }),
  buildProvider: optionalTrimmed(100, "Build provider"),
  buildWorkflow: optionalTrimmed(200, "Build workflow"),
  buildRunId: optionalTrimmed(100, "Build run identifier"),
  buildRunUrl: z.string().trim().max(1000).nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const normalized = normalizeHttpUrl(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Build run URL must be an absolute http(s) URL." });
        return z.NEVER;
      }
      return normalized;
    }),
  deployService: optionalTrimmed(100, "Deploy service"),
  deployEnvironment: optionalTrimmed(50, "Deploy environment"),
  deployRegion: z.string().trim().max(32,"Deploy region must be 32 characters or fewer.").nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const region = value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(region)) {
        ctx.addIssue({ code: "custom", message: "Deploy region must be lowercase letters, digits and dashes (e.g. eu-central-1)." });
        return z.NEVER;
      }
      return region;
    }),
  deployAt: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: "custom", message: "Deployment timestamp must be a valid date/time (ISO 8601)." });
        return z.NEVER;
      }
      return parsed;
    }),
  verificationState: z.enum(["UNVERIFIED", "USER_ASSERTED"]).optional().default("UNVERIFIED"),
  note: optionalTrimmed(2000, "Note"),
}).strict();
export type ReleaseEvidenceCreateInput = z.infer<typeof releaseEvidenceCreateSchema>;

export const releaseEvidenceUpdateSchema = releaseEvidenceCreateSchema.partial();
export type ReleaseEvidenceUpdateInput = z.infer<typeof releaseEvidenceUpdateSchema>;
