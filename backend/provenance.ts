import { createHash } from "node:crypto";
import { z } from "zod";

// Safe inspection of standard build provenance attestations.
//
// Accepted, established formats only — nothing custom:
//   - SLSA Provenance v1.0  (https://slsa.dev/provenance/v1)   as an in-toto Statement
//   - SLSA Provenance v0.2  (https://slsa.dev/provenance/v0.2) as an in-toto Statement (legacy)
//   - Either wrapped in a DSSE envelope (application/vnd.in-toto+json)
//
// Security model:
//   - No execution of any kind (pure JSON.parse + zod validation).
//   - No network access — no URL from the attestation is ever fetched.
//   - URIs are validated against a scheme allowlist; credentials in URIs are rejected.
//   - Digests must be lowercase hex of the correct length per algorithm.
//   - The DSSE payload is decoded with a hard cap; nothing is stored except the
//     sha256 of the bytes received and validated display fields.
//   - invocation/externalParameters are NEVER stored — they can carry secrets.
//   - Signatures are counted, never verified. signatureState is always "unverified".
//
// Digest matching compares the attestation's subjects against the artifact
// digest registered on the release evidence. A match proves only that both
// documents name the same digest — not that the attestation is authentic.

export const ATTESTATION_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export class ProvenanceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ProvenanceError";
  }
}

const SLSA_V1 = "https://slsa.dev/provenance/v1";
const SLSA_V02 = "https://slsa.dev/provenance/v0.2";
const STATEMENT_V1 = "https://in-toto.io/Statement/v1";
const STATEMENT_V01 = "https://in-toto.io/Statement/v0.1";

// ---------------------------------------------------------------------------
// URIs: scheme allowlist, no credentials, no file/data/javascript schemes.
// ---------------------------------------------------------------------------

const ALLOWED_URI_SCHEMES = new Set(["http", "https", "ssh", "git", "git+http", "git+https", "git+ssh", "pkg"]);

export function normalizeUri(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.length === 0) throw new ProvenanceError("invalid_uri", "A material URI is empty.");
  if (trimmed.length > 500) throw new ProvenanceError("invalid_uri", "A material URI exceeds 500 characters.");
  // scp-like SSH remote: git@host:path
  if (/^git@[a-z0-9.-]+:[a-z0-9._/~-]+$/i.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProvenanceError("invalid_uri", "A material URI is not a valid URI.");
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (!ALLOWED_URI_SCHEMES.has(scheme)) {
    throw new ProvenanceError("invalid_uri", `Unsupported URI scheme "${scheme}". Allowed: http, https, ssh, git(+http, +https, +ssh), pkg.`);
  }
  if (scheme.startsWith("git+")) {
    const inner = scheme.slice(4);
    if (!["http", "https", "ssh", "git"].includes(inner)) throw new ProvenanceError("invalid_uri", `Unsupported URI scheme "${scheme}".`);
    if (!url.hostname) throw new ProvenanceError("invalid_uri", "A material URI is missing a host.");
    if (url.username || url.password) throw new ProvenanceError("invalid_uri", "Material URIs must not contain credentials.");
    return trimmed;
  }
  if (scheme === "http" || scheme === "https") {
    if (!url.hostname) throw new ProvenanceError("invalid_uri", "A material URI is missing a host.");
    if (url.username || url.password) throw new ProvenanceError("invalid_uri", "Material URIs must not contain credentials.");
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

const digestAlg = z.string().regex(/^[a-z][a-z0-9_-]{0,19}$/i, "Digest algorithm names must be alphanumeric.");

const digestMapSchema = z
  .record(digestAlg, z.string().min(1).max(128))
  .superRefine((map, ctx) => {
    for (const [algRaw, valueRaw] of Object.entries(map)) {
      const alg = algRaw.toLowerCase();
      const value = valueRaw.trim().toLowerCase();
      if (!/^[0-9a-f]+$/.test(value)) {
        ctx.addIssue({ code: "custom", message: `Digest for "${alg}" must be hexadecimal.` });
        continue;
      }
      const expected = alg === "sha256" ? 64 : alg === "sha512" ? 128 : alg === "sha1" || alg === "gitcommit" ? 40 : null;
      if (expected !== null && value.length !== expected) {
        ctx.addIssue({ code: "custom", message: `Digest for "${alg}" must be ${expected} hexadecimal characters.` });
      } else if (expected === null && (value.length < 32 || value.length > 128 || value.length % 2 !== 0)) {
        ctx.addIssue({ code: "custom", message: `Digest for "${alg}" has an unexpected length.` });
      }
    }
  })
  .transform((map) => Object.fromEntries(Object.entries(map).map(([alg, value]) => [alg.toLowerCase(), value.trim().toLowerCase()])));

const subjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required.").max(500),
  digest: digestMapSchema,
});

const materialSchema = z.object({
  uri: z.string().trim().min(1).max(500),
  digest: digestMapSchema,
  name: z.string().trim().max(255).optional(),
});

// ---------------------------------------------------------------------------
// in-toto Statement + SLSA predicates
// ---------------------------------------------------------------------------

const statementSchema = z.object({
  _type: z.string().trim().min(1).max(100),
  subject: z.array(subjectSchema).min(1, "At least one subject is required.").max(25, "At most 25 subjects are supported."),
  predicateType: z.string().trim().max(200),
  predicate: z.record(z.string(), z.unknown()),
});

const slsaV1Schema = z.object({
  buildDefinition: z.object({
    buildType: z.string().trim().min(1).max(500).optional(),
    builder: z.object({ id: z.string().trim().min(1).max(500) }).optional(),
    resolvedDependencies: z.array(materialSchema).max(50, "At most 50 materials are supported.").optional(),
  }).passthrough().optional(),
  runDetails: z.object({
    builder: z.object({ id: z.string().trim().min(1).max(500) }).optional(),
    metadata: z.object({
      invocationId: z.string().trim().max(500).optional(),
      startedOn: z.string().max(64).optional(),
      finishedOn: z.string().max(64).optional(),
    }).optional(),
  }).passthrough().optional(),
}).passthrough();

const slsaV02Schema = z.object({
  buildType: z.string().trim().min(1).max(500).optional(),
  builder: z.object({ id: z.string().trim().min(1).max(500) }).optional(),
  invocation: z.object({
    configSource: z.object({
      uri: z.string().trim().min(1).max(500),
      digest: digestMapSchema.optional(),
    }).optional(),
  }).passthrough().optional(),
  materials: z.array(materialSchema).max(50, "At most 50 materials are supported.").optional(),
  metadata: z.object({
    buildInvocationId: z.string().max(500).optional(),
    buildStartedOn: z.string().max(64).optional(),
    buildFinishedOn: z.string().max(64).optional(),
  }).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// DSSE envelope
// ---------------------------------------------------------------------------

const dsseEnvelopeSchema = z.object({
  payload: z.string().min(1, "DSSE payload is required.").max(ATTESTATION_MAX_BYTES * 2, "DSSE payload is too large."),
  payloadType: z.string().trim().min(1).max(200),
  signatures: z.array(z.object({ keyid: z.string().max(200).optional(), sig: z.string().max(8192) }).passthrough()).max(20).default([]),
}).passthrough();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParsedSubject = { name: string; digest: Record<string, string>; digestLabel: string };

export type ParsedProvenance = {
  envelope: "dsse" | "statement";
  predicateType: string;
  statementType: string;
  payloadDigest: string;
  rawBytes: number;
  subjects: ParsedSubject[];
  subjectName: string;
  subjectDigest: string;
  subjectMatchesArtifact: boolean | null;
  builderId: string | null;
  buildType: string | null;
  buildInvocationId: string | null;
  startedOn: string | null;
  finishedOn: string | null;
  sourceRepoUrl: string | null;
  sourceRevision: string | null;
  materials: Array<{ uri: string; digest: Record<string, string> }>;
  signatureCount: number;
  /** ALWAYS "unverified" — DSSE signatures are never verified in this build. */
  signatureState: "unverified";
};

function digestLabelFor(map: Record<string, string>): string {
  for (const alg of ["sha256", "sha512", "sha1", "gitcommit"]) {
    if (map[alg]) return `${alg}:${map[alg]}`;
  }
  const first = Object.entries(map)[0];
  return first ? `${first[0]}:${first[1]}` : "none";
}

function parseIsoDate(value: string | undefined, field: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ProvenanceError("invalid_timestamp", `${field} is not a valid date/time.`);
  return parsed.toISOString();
}

function parseStatement(doc: unknown): { statement: z.infer<typeof statementSchema>; raw: Buffer | null } {
  const parsed = statementSchema.safeParse(doc);
  if (!parsed.success) {
    throw new ProvenanceError("invalid_statement", parsed.error.issues[0]?.message || "The file is not an in-toto Statement (expected _type, subject[], predicateType, predicate).");
  }
  return { statement: parsed.data, raw: null };
}

function slsaMaterials(predicate: z.infer<typeof slsaV1Schema> | z.infer<typeof slsaV02Schema>, predicateType: string): Array<{ uri: string; digest: Record<string, string> }> {
  const raw = predicateType === SLSA_V1
    ? (predicate as z.infer<typeof slsaV1Schema>).buildDefinition?.resolvedDependencies
    : (predicate as z.infer<typeof slsaV02Schema>).materials;
  return (raw ?? []).map((material) => ({ uri: normalizeUri(material.uri), digest: material.digest }));
}

function pickSource(materials: Array<{ uri: string; digest: Record<string, string> }>, configSource?: { uri: string; digest?: Record<string, string> } | null) {
  if (configSource?.uri) {
    const revision = configSource.digest?.gitcommit ?? configSource.digest?.sha1 ?? configSource.digest?.sha256 ?? null;
    return { sourceRepoUrl: normalizeUri(configSource.uri), sourceRevision: revision };
  }
  const withCommit = materials.find((material) => material.digest.gitcommit);
  const looksLikeGit = (uri: string) => /^git@/i.test(uri) || /^git(\+\w+)?:/i.test(uri) || /^ssh:\/\//i.test(uri) || /^https?:\/\/.*\.git(@[\w./-]+)?$/i.test(uri);
  const gitLike = withCommit ?? materials.find((material) => looksLikeGit(material.uri));
  const chosen = withCommit ?? gitLike ?? null;
  if (!chosen) return { sourceRepoUrl: null, sourceRevision: null };
  return { sourceRepoUrl: chosen.uri, sourceRevision: chosen.digest.gitcommit ?? chosen.digest.sha1 ?? chosen.digest.sha256 ?? null };
}

export function parseProvenance(raw: Buffer, artifactDigest: string | null): ParsedProvenance {
  if (!Buffer.isBuffer(raw)) throw new ProvenanceError("invalid_input", "Expected raw bytes.");
  if (raw.length === 0) throw new ProvenanceError("empty_file", "The uploaded attestation is empty.");
  if (raw.length > ATTESTATION_MAX_BYTES) throw new ProvenanceError("attestation_too_large", `Attestation exceeds the ${ATTESTATION_MAX_BYTES / 1024 / 1024} MB limit.`);

  let doc: unknown;
  try {
    doc = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ProvenanceError("invalid_json", "The uploaded file is not valid JSON.");
  }

  let envelope: "dsse" | "statement" = "statement";
  let statementDoc: unknown = doc;
  let signatureCount = 0;

  const dsse = dsseEnvelopeSchema.safeParse(doc);
  if (dsse.success) {
    envelope = "dsse";
    if (dsse.data.payloadType !== "application/vnd.in-toto+json") {
      throw new ProvenanceError("unsupported_payload_type", `Unsupported DSSE payloadType "${dsse.data.payloadType}". Expected application/vnd.in-toto+json.`);
    }
    let decoded: Buffer;
    try {
      decoded = Buffer.from(dsse.data.payload, "base64");
    } catch {
      throw new ProvenanceError("invalid_base64", "The DSSE payload is not valid base64.");
    }
    if (decoded.length === 0) throw new ProvenanceError("invalid_base64", "The DSSE payload decodes to zero bytes.");
    if (decoded.length > ATTESTATION_MAX_BYTES) throw new ProvenanceError("payload_too_large", `The decoded DSSE payload exceeds the ${ATTESTATION_MAX_BYTES / 1024 / 1024} MB limit.`);
    try {
      statementDoc = JSON.parse(decoded.toString("utf8"));
    } catch {
      throw new ProvenanceError("invalid_json", "The DSSE payload is not valid JSON.");
    }
    signatureCount = dsse.data.signatures.length;
  }

  const { statement } = parseStatement(statementDoc);

  if (statement._type !== STATEMENT_V1 && statement._type !== STATEMENT_V01) {
    throw new ProvenanceError("unsupported_statement_type", `Unsupported in-toto Statement type "${statement._type}". Expected ${STATEMENT_V1} or ${STATEMENT_V01}.`);
  }
  if (statement.predicateType !== SLSA_V1 && statement.predicateType !== SLSA_V02) {
    throw new ProvenanceError("unsupported_predicate", `Unsupported predicateType "${statement.predicateType}". Only SLSA provenance (v1 and v0.2) is supported.`);
  }

  const predicateType = statement.predicateType;
  let slsaV1: z.infer<typeof slsaV1Schema> | null = null;
  let slsaV02: z.infer<typeof slsaV02Schema> | null = null;
  if (predicateType === SLSA_V1) {
    const result = slsaV1Schema.safeParse(statement.predicate);
    if (!result.success) throw new ProvenanceError("invalid_predicate", result.error.issues[0]?.message || "The SLSA v1 predicate is malformed.");
    slsaV1 = result.data;
  } else {
    const result = slsaV02Schema.safeParse(statement.predicate);
    if (!result.success) throw new ProvenanceError("invalid_predicate", result.error.issues[0]?.message || "The SLSA v0.2 predicate is malformed.");
    slsaV02 = result.data;
  }

  const subjects: ParsedSubject[] = statement.subject.map((subject) => ({
    name: subject.name,
    digest: subject.digest,
    digestLabel: digestLabelFor(subject.digest),
  }));

  const materials = slsaMaterials((slsaV1 ?? slsaV02)!, predicateType);
  const source = pickSource(materials, predicateType === SLSA_V02 ? slsaV02?.invocation?.configSource : null);

  const builderId = slsaV1
    ? slsaV1.runDetails?.builder?.id ?? slsaV1.buildDefinition?.builder?.id ?? null
    : slsaV02?.builder?.id ?? null;
  const buildType = slsaV1 ? slsaV1.buildDefinition?.buildType ?? null : slsaV02?.buildType ?? null;
  const buildInvocationId = slsaV1
    ? slsaV1.runDetails?.metadata?.invocationId ?? null
    : slsaV02?.metadata?.buildInvocationId ?? null;
  const startedOn = parseIsoDate(slsaV1 ? slsaV1.runDetails?.metadata?.startedOn : slsaV02?.metadata?.buildStartedOn, "Build start time");
  const finishedOn = parseIsoDate(slsaV1 ? slsaV1.runDetails?.metadata?.finishedOn : slsaV02?.metadata?.buildFinishedOn, "Build finish time");

  // Digest matching against the registered artifact digest — never a signature check.
  let subjectMatchesArtifact: boolean | null = null;
  if (artifactDigest) {
    const artifact = artifactDigest.trim().toLowerCase();
    const [alg, hex] = artifact.split(":");
    if (alg && hex) {
      subjectMatchesArtifact = subjects.some((subject) => subject.digest[alg] === hex);
    }
  }

  return {
    envelope,
    predicateType,
    statementType: statement._type,
    payloadDigest: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
    rawBytes: raw.length,
    subjects,
    subjectName: subjects[0]?.name ?? "unknown",
    subjectDigest: subjects[0]?.digestLabel ?? "none",
    subjectMatchesArtifact,
    builderId,
    buildType,
    buildInvocationId,
    startedOn,
    finishedOn,
    sourceRepoUrl: source.sourceRepoUrl,
    sourceRevision: source.sourceRevision,
    materials,
    signatureCount,
    signatureState: "unverified",
  };
}

/** Sanitize a user-supplied filename for display. Never used as a filesystem path. */
export function sanitizeFileName(name: string | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return cleaned || null;
}
