import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import PgBoss from "pg-boss";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { requireRole, requireSession, issueSession, setSessionCookie } from "./auth.js";
import { prisma } from "./db.js";
import { sendMail, smtpConfigured } from "./mailer.js";
import { buildDiff, buildGate, buildRemediations } from "./scan-review.js";
import { buildImpact, type ImpactEntry } from "./release-impact.js";
import { parseProvenance, sanitizeFileName, ProvenanceError, ATTESTATION_MAX_BYTES } from "./provenance.js";
import { buildReleaseEvidenceReport, buildReleaseEvidenceCsv, releaseEvidenceReportName, csvCell } from "./release-report.js";
import { metricsMiddleware, metricsHandler, reportsGeneratedTotal } from "./metrics.js";
import { sloCreateSchema, sloUpdateSchema, validateSloMerged, computeErrorBudget } from "./slo.js";
import { TELEMETRY_STATUS } from "./telemetry.js";
import { releaseEvidenceCreateSchema, releaseEvidenceUpdateSchema } from "./release-evidence.js";
import { parseSbom, compareSbomAgainstLockfile } from "./sbom-compare.js";

const app = express();
const api = express.Router();
const port = Number(process.env.API_PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const attestationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ATTESTATION_MAX_BYTES, files: 1 } });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be configured before starting the API.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be configured with at least 32 characters.");
const boss = new PgBoss({ connectionString: databaseUrl });

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: frontendOrigin, credentials: true, exposedHeaders: ["Content-Disposition"] }));
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  const header = req.headers.cookie || "";
  req.cookies = Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    let value = part.slice(index + 1).trim();
    try { value = decodeURIComponent(value); } catch { /* Keep the original cookie value. */ }
    return [part.slice(0, index).trim(), value];
  }).filter(([key]) => key));
  void _res;
  next();
});

// SupplyGuard's own scrape endpoint (outside /api/v1), optionally token-guarded.
app.get("/metrics", metricsHandler);
app.use(metricsMiddleware);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200),
  workspaceName: z.string().trim().min(2).max(100),
});
const loginSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(200), rememberMe: z.boolean().optional().default(true) });
const projectSchema = z.object({ name: z.string().trim().min(1).max(100), repositoryUrl: z.union([z.url(), z.null()]).optional(), defaultBranch: z.string().trim().max(100).optional() });

function publicError(res: express.Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

api.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

api.post("/auth/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_registration", parsed.error.issues[0]?.message || "Check the registration fields.");
  const { name, email, password, workspaceName } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) return publicError(res, 409, "email_in_use", "An account already exists for this email.");
  const passwordHash = await bcrypt.hash(password, 12);
  const slug = `${workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"}-${crypto.randomUUID().slice(0, 8)}`;
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const workspace = await tx.workspace.create({ data: { name: workspaceName, slug } });
    await tx.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
    return { user, workspace };
  });
  setSessionCookie(res, issueSession(created.user.id, created.workspace.id));
  res.status(201).json({ user: { id: created.user.id, name: created.user.name, email: created.user.email }, workspace: { id: created.workspace.id, name: created.workspace.name, role: "OWNER" } });
});

api.post("/auth/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_login", "Enter a valid email and password.");
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, include: { memberships: { include: { workspace: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
  if (user && !user.passwordHash) return publicError(res, 401, "google_account", "This account uses Google sign-in. Continue with Google instead.");
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash!))) return publicError(res, 401, "invalid_credentials", "Email or password is incorrect.");
  const membership = user.memberships[0];
  if (!membership) return publicError(res, 403, "no_workspace", "This account has no workspace access.");
  setSessionCookie(res, issueSession(user.id, membership.workspaceId), parsed.data.rememberMe);
  res.json({ user: { id: user.id, name: user.name, email: user.email }, workspace: { id: membership.workspace.id, name: membership.workspace.name, role: membership.role } });
});

api.post("/auth/logout", (_req, res) => {
  res.clearCookie("sg_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(204).end();
});

api.get("/auth/me", requireSession, async (req, res) => {
  const workspace = await prisma.workspace.findUnique({ where: { id: req.auth!.workspaceId }, select: { id: true, name: true, slug: true } });
  res.json({ user: { id: req.auth!.userId, name: req.auth!.name, email: req.auth!.email }, workspace: { ...workspace, role: req.auth!.role } });
});

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/v1/auth/google/callback`;
const googleConfigured = Boolean(googleClientId && googleClientSecret);

const githubClientId = process.env.GITHUB_CLIENT_ID || "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || "";
const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL || `http://localhost:${port}/api/v1/auth/github/callback`;
const githubConfigured = Boolean(githubClientId && githubClientSecret);

/**
 * OAuth provider calls are the most fragile part of sign-in. Retry transient
 * network/5xx failures a few times and label the failure so the login page can
 * show an honest, actionable message.
 */
async function oauthFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (response.status >= 500 && attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not reach the OAuth provider.");
}

function isOauthNetworkFailure(error: unknown): boolean {
  const err = error as { cause?: { code?: string }; message?: string } | null;
  const code = err?.cause?.code || "";
  const networkCodes = new Set(["ENETUNREACH", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
  if (networkCodes.has(code)) return true;
  return typeof err?.message === "string" && /fetch failed/i.test(err.message);
}

async function githubFetch(accessToken: string, path: string) {
  const response = await oauthFetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "SupplyGuard",
    },
  });
  return response;
}

async function githubProfile(accessToken: string) {
  const profileRes = await githubFetch(accessToken, "/user");
  if (!profileRes.ok) throw new Error(`GitHub profile request failed (${profileRes.status}).`);
  const profile = (await profileRes.json()) as { id?: number; login?: string; name?: string | null; email?: string | null };
  let email = profile.email?.toLowerCase() || null;
  if (!email) {
    const emailsRes = await githubFetch(accessToken, "/user/emails");
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((entry) => entry.primary && entry.verified) || emails.find((entry) => entry.verified) || emails[0];
      email = primary?.email?.toLowerCase() || null;
    }
  }
  if (!email) throw new Error("GitHub account did not provide a verified email address. Make the email public or grant the user:email scope.");
  return { login: profile.login || "github-user", name: profile.name?.trim() || profile.login || "GitHub user", email };
}

const forgotPasswordSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()) });
const resetPasswordSchema = z.object({ token: z.string().min(16).max(200), password: z.string().min(12).max(200) });

api.post("/auth/forgot-password", authLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_email", "Enter a valid email address.");
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const resetTokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash, resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) } });
    const link = `${frontendOrigin}/reset-password?token=${token}`;
    if (smtpConfigured) {
      try {
        await sendMail({
          to: user.email,
          subject: "Reset your SupplyGuard password",
          text: [
            "We received a request to reset your SupplyGuard password.",
            "",
            "Open this link within 1 hour to choose a new password:",
            link,
            "",
            "If you did not request this, you can safely ignore this email.",
          ].join("\n"),
          html: `<p>We received a request to reset your SupplyGuard password.</p><p><a href="${link}">Reset your password</a> (this link expires in 1 hour).</p><p>If you did not request this, you can safely ignore this email.</p>`,
        });
        console.log(`Password reset email sent to ${user.email}`);
      } catch (error) {
        console.error("Password reset email failed:", error instanceof Error ? error.message : error);
        console.warn(`[dev] Email could not be delivered. Password reset link for ${user.email}: ${link}`);
      }
    } else {
      console.warn(`[dev] SMTP is not configured, so no email was sent. Password reset link for ${user.email}: ${link}`);
      console.warn("[dev] Set SMTP_USER and SMTP_PASS in backend/.env (Gmail app password) to send real reset emails.");
    }
  }
  res.status(200).json({ message: "If an account exists for that email, a reset link has been sent." });
});

api.post("/auth/reset-password", authLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_reset", "Enter a token and a password of at least 12 characters.");
  const resetTokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const user = await prisma.user.findFirst({ where: { resetTokenHash, resetTokenExpires: { gt: new Date() } } });
  if (!user) return publicError(res, 400, "invalid_token", "This reset link is invalid or has expired.");
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, resetTokenHash: null, resetTokenExpires: null } });
  res.status(200).json({ message: "Password updated. You can now sign in." });
});

api.get("/auth/google/status", (_req, res) => {
  res.json({ configured: googleConfigured });
});

api.get("/auth/google", (_req, res) => {
  if (!googleConfigured) return res.redirect(`${frontendOrigin}/login?error=google_not_configured`);
  const state = randomBytes(16).toString("hex");
  res.cookie("sg_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000, path: "/" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId);
  url.searchParams.set("redirect_uri", googleCallbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

api.get("/auth/google/callback", async (req, res) => {
  const fail = (reason = "unknown") => res.redirect(`${frontendOrigin}/login?error=google_failed&reason=${encodeURIComponent(reason)}`);
  if (!googleConfigured) return res.redirect(`${frontendOrigin}/login?error=google_not_configured`);
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error) return fail(`provider_${error}`);
  if (!code || !state) return fail("missing_code");
  if (req.cookies?.sg_oauth_state !== state) return fail("state_mismatch");
  res.clearCookie("sg_oauth_state", { path: "/" });
  try {
    const tokenRes = await oauthFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: googleClientId, client_secret: googleClientSecret, redirect_uri: googleCallbackUrl, grant_type: "authorization_code" }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error(`Google token exchange failed (${tokenRes.status}): ${body.slice(0, 300)}`);
      return fail(`token_${tokenRes.status}`);
    }
    const tokens = await tokenRes.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error("Google did not return an access token.");
    const infoRes = await oauthFetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!infoRes.ok) throw new Error(`Google userinfo request failed (${infoRes.status}).`);
    const info = await infoRes.json() as { email?: string; name?: string };
    const email = String(info.email || "").toLowerCase();
    if (!email) throw new Error("Google account did not provide an email address.");
    const name = info.name?.trim() || email.split("@")[0];
    const existing = await prisma.user.findUnique({ where: { email }, include: { memberships: { include: { workspace: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
    if (existing) {
      const membership = existing.memberships[0];
      if (!membership) return fail();
      setSessionCookie(res, issueSession(existing.id, membership.workspaceId), true);
      return res.redirect(`${frontendOrigin}/overview`);
    }
    const slug = `${(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace").slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}`;
    const workspace = await prisma.workspace.create({ data: { name: `${name}'s Workspace`, slug } });
    const user = await prisma.user.create({ data: { name, email, passwordHash: null } });
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
    setSessionCookie(res, issueSession(user.id, workspace.id), true);
    return res.redirect(`${frontendOrigin}/overview`);
  } catch (error) {
    console.error("Google sign-in failed:", error instanceof Error ? error.message : error);
    return fail(isOauthNetworkFailure(error) ? "network" : "unknown");
  }
});

api.get("/auth/github/status", (_req, res) => {
  res.json({ configured: githubConfigured });
});

api.get("/auth/github", (_req, res) => {
  if (!githubConfigured) return res.redirect(`${frontendOrigin}/login?error=github_not_configured`);
  const state = randomBytes(16).toString("hex");
  res.cookie("sg_github_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000, path: "/" });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", githubClientId);
  url.searchParams.set("redirect_uri", githubCallbackUrl);
  url.searchParams.set("scope", "repo read:user user:email");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

api.get("/auth/github/callback", async (req, res) => {
  const fail = (reason = "unknown") => res.redirect(`${frontendOrigin}/login?error=github_failed&reason=${encodeURIComponent(reason)}`);
  if (!githubConfigured) return res.redirect(`${frontendOrigin}/login?error=github_not_configured`);
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error) return fail(`provider_${error}`);
  if (!code || !state) return fail("missing_code");
  if (req.cookies?.sg_github_state !== state) return fail("state_mismatch");
  res.clearCookie("sg_github_state", { path: "/" });
  try {
    const tokenRes = await oauthFetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "SupplyGuard" },
      body: JSON.stringify({ client_id: githubClientId, client_secret: githubClientSecret, code, redirect_uri: githubCallbackUrl }),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: string; scope?: string; error?: string };
    if (!tokenBody.access_token) {
      console.error(`GitHub token exchange failed (${tokenRes.status}): ${JSON.stringify(tokenBody).slice(0, 300)}`);
      return fail(`token_${tokenBody.error || tokenRes.status}`);
    }
    const accessToken = tokenBody.access_token;
    const scope = tokenBody.scope || "";
    const profile = await githubProfile(accessToken);
    const existing = await prisma.user.findUnique({ where: { email: profile.email }, include: { memberships: { include: { workspace: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
    if (existing) {
      const membership = existing.memberships[0];
      if (!membership) return fail();
      await prisma.gitHubConnection.upsert({
        where: { userId: existing.id },
        update: { source: "oauth", login: profile.login, name: profile.name, accessToken, scope },
        create: { userId: existing.id, source: "oauth", login: profile.login, name: profile.name, accessToken, scope },
      });
      setSessionCookie(res, issueSession(existing.id, membership.workspaceId), true);
      return res.redirect(`${frontendOrigin}/settings?connected=github`);
    }
    const name = profile.name || profile.login;
    const slug = `${(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace").slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}`;
    const workspace = await prisma.workspace.create({ data: { name: `${name}'s Workspace`, slug } });
    const user = await prisma.user.create({ data: { name, email: profile.email, passwordHash: null } });
    await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
    await prisma.gitHubConnection.create({ data: { userId: user.id, source: "oauth", login: profile.login, name: profile.name, accessToken, scope } });
    setSessionCookie(res, issueSession(user.id, workspace.id), true);
    return res.redirect(`${frontendOrigin}/settings?connected=github`);
  } catch (error) {
    console.error("GitHub sign-in failed:", error instanceof Error ? error.message : error);
    return fail(isOauthNetworkFailure(error) ? "network" : "unknown");
  }
});

api.use(requireSession);

api.get("/settings/github", async (req, res) => {
  const connection = await prisma.gitHubConnection.findUnique({ where: { userId: req.auth!.userId } });
  res.json({
    configured: githubConfigured,
    connected: Boolean(connection),
    source: connection?.source || null,
    login: connection?.login || null,
    name: connection?.name || null,
    scope: connection?.scope || null,
    connectedAt: connection?.connectedAt || null,
  });
});

api.put("/settings/github/token", async (req, res) => {
  const schema = z.object({ token: z.string().trim().min(1).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_token", "Enter a GitHub Personal Access Token.");
  const token = parsed.data.token;
  const response = await githubFetch(token, "/user");
  if (!response.ok) return publicError(res, 401, "github_token_rejected", "GitHub rejected that token. Check that it has the repo and read:user scopes.");
  const profile = (await response.json()) as { login?: string; name?: string | null };
  const scope = response.headers.get("x-oauth-scopes") || "";
  const login = profile.login || "github-user";
  await prisma.gitHubConnection.upsert({
    where: { userId: req.auth!.userId },
    update: { source: "pat", login, name: profile.name?.trim() || login, accessToken: token, scope },
    create: { userId: req.auth!.userId, source: "pat", login, name: profile.name?.trim() || login, accessToken: token, scope },
  });
  res.json({ connected: true, login, source: "pat" });
});

api.delete("/settings/github", async (req, res) => {
  await prisma.gitHubConnection.deleteMany({ where: { userId: req.auth!.userId } });
  res.status(204).end();
});

api.get("/github/repos", async (req, res) => {
  const connection = await prisma.gitHubConnection.findUnique({ where: { userId: req.auth!.userId } });
  if (!connection) return publicError(res, 404, "github_not_connected", "Connect GitHub in Settings before listing repositories.");
  const response = await githubFetch(connection.accessToken, "/user/repos?per_page=100&sort=updated&direction=desc");
  if (!response.ok) return publicError(res, 502, "github_unavailable", `GitHub returned HTTP ${response.status} while listing repositories.`);
  const items = (await response.json()) as Array<{ id: number; name: string; full_name: string; private: boolean; html_url: string; clone_url: string; default_branch: string; description: string | null }>;
  res.json({ items: items.map((item) => ({ id: item.id, name: item.name, fullName: item.full_name, description: item.description, private: item.private, htmlUrl: item.html_url, cloneUrl: item.clone_url, defaultBranch: item.default_branch })) });
});

api.get("/github/repos/:owner/:repo/check", async (req, res) => {
  const { owner, repo } = req.params as { owner: string; repo: string };
  const connection = await prisma.gitHubConnection.findUnique({ where: { userId: req.auth!.userId } });
  if (!connection) return publicError(res, 404, "github_not_connected", "Connect GitHub in Settings before scanning repositories.");
  const repoRes = await githubFetch(connection.accessToken, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (repoRes.status === 404) return publicError(res, 404, "repo_not_found", "Repository not found or you do not have access to it.");
  if (!repoRes.ok) return publicError(res, 502, "github_unavailable", `GitHub returned HTTP ${repoRes.status} for the repository.`);
  const repoData = (await repoRes.json()) as { default_branch: string; private: boolean; html_url: string };
  const branch = repoData.default_branch || "main";
  const rawHeaders = { headers: { accept: "application/vnd.github.raw+json", authorization: `Bearer ${connection.accessToken}`, "user-agent": "SupplyGuard" } };

  async function readLockfile(path: string) {
    try {
      const raw = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${path}`, rawHeaders);
      if (!raw.ok) return null;
      const text = await raw.text();
      const parsed = JSON.parse(text) as { lockfileVersion?: number; name?: string; packages?: Record<string, unknown> };
      if (![2, 3].includes(parsed.lockfileVersion || 0) || !parsed.packages || typeof parsed.packages !== "object") return null;
      const packages = Object.keys(parsed.packages);
      const roots = parsed.packages[""] as { dependencies?: Record<string, string> } | undefined;
      return { path, lockfileVersion: parsed.lockfileVersion, packageCount: Math.max(0, packages.length - 1), directDependencies: Object.keys(roots?.dependencies || {}).length, projectName: parsed.name || repo };
    } catch {
      return null;
    }
  }

  const candidates = ["package-lock.json", "npm-shrinkwrap.json"];
  let result = null;
  for (const candidate of candidates) {
    result = await readLockfile(candidate);
    if (result) break;
  }
  if (!result) return res.json({ found: false, branch, private: repoData.private, htmlUrl: repoData.html_url });
  res.json({ found: true, branch, private: repoData.private, htmlUrl: repoData.html_url, ...result });
});

api.get("/projects", async (req, res) => {
  const items = await prisma.project.findMany({
    where: { workspaceId: req.auth!.workspaceId }, orderBy: { updatedAt: "desc" },
    include: { scans: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, stage: true, componentCount: true, vulnerabilityCount: true, licenseReviewCount: true, createdAt: true, vulnerabilityCheckStatus: true, vulnerabilityCheckError: true, licenseCheckStatus: true, licenseCheckError: true } } },
  });
  res.json({ items });
});

api.post("/projects", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_project", parsed.error.issues[0]?.message || "Check the project details.");
  const item = await prisma.project.create({ data: { ...parsed.data, workspaceId: req.auth!.workspaceId } });
  res.status(201).json({ item });
});

api.get("/projects/:projectId", async (req, res) => {
  const item = await prisma.project.findFirst({ where: { id: req.params.projectId, workspaceId: req.auth!.workspaceId }, include: { scans: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, stage: true, uploadName: true, componentCount: true, vulnerabilityCount: true, licenseReviewCount: true, vulnerabilityCheckStatus: true, licenseCheckStatus: true, createdAt: true, startedAt: true, completedAt: true, errorCode: true, errorMessage: true } } } });
  if (!item) return publicError(res, 404, "project_not_found", "Project not found.");
  res.json({ item });
});

api.patch("/projects/:projectId", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_project", "Check the project details.");
  const projectId = req.params.projectId as string;
  const existing = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!existing) return publicError(res, 404, "project_not_found", "Project not found.");
  const item = await prisma.project.update({ where: { id: existing.id }, data: parsed.data });
  res.json({ item });
});

api.delete("/projects/:projectId", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const projectId = req.params.projectId as string;
  const existing = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId }, select: { id: true } });
  if (!existing) return publicError(res, 404, "project_not_found", "Project not found.");
  await prisma.project.delete({ where: { id: existing.id } });
  res.status(204).end();
});

api.post("/projects/:projectId/scans", requireRole("OWNER", "ADMIN", "ANALYST"), upload.single("file"), async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  if (!req.file) return publicError(res, 400, "file_required", "Choose a package-lock.json file to scan.");
  const isPackageLock = /(^|-)package-lock\.json$/i.test(req.file.originalname) || /^npm-shrinkwrap\.json$/i.test(req.file.originalname);
  if (!isPackageLock) return publicError(res, 400, "invalid_file_name", "Upload a package-lock.json or npm-shrinkwrap.json file.");
  let lockfile: unknown;
  try { lockfile = JSON.parse(req.file.buffer.toString("utf8")); }
  catch { return publicError(res, 400, "invalid_json", "The uploaded file is not valid JSON."); }
  const record = lockfile as { lockfileVersion?: number; name?: string; packages?: unknown };
  if (![2, 3].includes(record?.lockfileVersion || 0) || !record?.packages || typeof record.packages !== "object") {
    return publicError(res, 422, "unsupported_lockfile", "Use an npm package-lock.json file with lockfile version 2 or 3.");
  }
  const optionFlag = (value: unknown, fallback: boolean) => value === undefined ? fallback : value === "true" || value === true;
  const options = {
    includeTransitive: optionFlag(req.body?.includeTransitive, true),
    includeDevDependencies: optionFlag(req.body?.includeDevDependencies, true),
    lookupLicenses: optionFlag(req.body?.lookupLicenses, true),
  };
  const job = await prisma.scanJob.create({ data: { workspaceId: req.auth!.workspaceId, projectId: project.id, createdById: req.auth!.userId, uploadName: req.file.originalname, options, lockfile: lockfile as Prisma.InputJsonValue } });
  const enqueuedId = await boss.send("supplyguard-scan", { scanJobId: job.id }, { retryLimit: 1, expireInSeconds: 1800 }).catch(() => null);
  if (!enqueuedId) {
    await prisma.scanJob.update({ where: { id: job.id }, data: { status: "FAILED", errorCode: "queue_unavailable", errorMessage: "The scan queue is unavailable. Start the worker service and try again." } });
    return publicError(res, 503, "queue_unavailable", "The scan queue is unavailable. Start the worker service and try again.");
  }
  res.status(202).json({ jobId: job.id, status: job.status, message: "Scan queued." });
});

api.post("/projects/:projectId/scans/repository", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  const schema = z.object({
    repositoryUrl: z.url(),
    branch: z.string().trim().min(1).max(200).optional(),
    options: z.object({
      includeTransitive: z.boolean().optional(),
      includeDevDependencies: z.boolean().optional(),
      lookupLicenses: z.boolean().optional(),
    }).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_repository", parsed.error.issues[0]?.message || "Enter a valid repository URL and branch.");
  const { repositoryUrl, branch, options } = parsed.data;
  const job = await prisma.scanJob.create({
    data: {
      workspaceId: req.auth!.workspaceId,
      projectId: project.id,
      source: "repository",
      createdById: req.auth!.userId,
      repositoryUrl,
      branch: branch || "main",
      options: { includeTransitive: true, includeDevDependencies: true, lookupLicenses: true, ...(options || {}) },
    },
  });
  const enqueuedId = await boss.send("supplyguard-scan", { scanJobId: job.id, source: "repository" }, { retryLimit: 1, expireInSeconds: 1800 }).catch(() => null);
  if (!enqueuedId) {
    await prisma.scanJob.update({ where: { id: job.id }, data: { status: "FAILED", errorCode: "queue_unavailable", errorMessage: "The scan queue is unavailable. Start the worker service and try again." } });
    return publicError(res, 503, "queue_unavailable", "The scan queue is unavailable. Start the worker service and try again.");
  }
  res.status(202).json({ jobId: job.id, status: job.status, message: "Repository scan queued." });
});

api.get("/settings/integrations", async (_req, res) => {
  res.json({
    gitProvider: {
      configured: true,
      provider: "github",
      privateRepositories: Boolean(process.env.GIT_PROVIDER_TOKEN),
    },
    osv: { configured: true, endpoint: "https://api.osv.dev" },
  });
});

api.get("/scans/:jobId", async (req, res) => {
  const job = await prisma.scanJob.findFirst({ where: { id: req.params.jobId, workspaceId: req.auth!.workspaceId }, include: { project: { select: { id: true, name: true } } } });
  if (!job) return publicError(res, 404, "scan_not_found", "Scan not found.");
  res.json({ item: { id: job.id, project: job.project, status: job.status.toLowerCase(), stage: job.stage, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt, error: job.errorMessage ? { code: job.errorCode, message: job.errorMessage } : null, counts: { components: job.componentCount, vulnerabilities: job.vulnerabilityCount, licenseReview: job.licenseReviewCount }, integrations: { osv: { status: job.vulnerabilityCheckStatus.toLowerCase(), error: job.vulnerabilityCheckError }, licenses: { status: job.licenseCheckStatus.toLowerCase(), error: job.licenseCheckError } }, progress: job.progress ?? null } });
});

async function loadReviewScan(jobId: string, workspaceId: string) {
  return prisma.scanJob.findFirst({
    where: { id: jobId, workspaceId },
    include: {
      project: { select: { id: true, name: true } },
      components: true,
      vulnerabilityFindings: { include: { component: { select: { id: true, name: true, version: true, purl: true } } } },
      licenseFindings: {
        include: {
          component: { select: { id: true, name: true, version: true, purl: true } },
          reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { decision: true, note: true, createdAt: true } },
        },
      },
    },
  });
}

function projectEvidence(workspaceId: string, projectId: string) {
  return prisma.releaseEvidence.findMany({ where: { workspaceId, projectId }, orderBy: { createdAt: "desc" } });
}

function projectSlos(workspaceId: string, projectId: string) {
  return prisma.serviceLevelObjective.findMany({ where: { workspaceId, projectId }, orderBy: [{ service: "asc" }, { name: "asc" }] });
}

function workspaceSlos(workspaceId: string) {
  return prisma.serviceLevelObjective.findMany({ where: { workspaceId } });
}

type ReviewScan = NonNullable<Awaited<ReturnType<typeof loadReviewScan>>>;

// Compute finding -> artifact/deployment impact for every completed scan in a
// workspace. Used by the workspace-wide findings endpoints so each finding can
// render its honest evidence status. Deterministic: severity is never read or
// modified here.
async function workspaceImpact(workspaceId: string) {
  const scans = await prisma.scanJob.findMany({
    where: { workspaceId, status: "COMPLETED" },
    select: { id: true, completedAt: true, sbomDigest: true, projectId: true },
  });
  if (scans.length === 0) return new Map<string, ImpactEntry>();
  const [evidence, slos] = await Promise.all([
    prisma.releaseEvidence.findMany({ where: { workspaceId } }),
    prisma.serviceLevelObjective.findMany({ where: { workspaceId } }),
  ]);
  const evidenceByProject = new Map<string, typeof evidence>();
  for (const item of evidence) {
    const list = evidenceByProject.get(item.projectId) ?? [];
    list.push(item);
    evidenceByProject.set(item.projectId, list);
  }
  const slosByProject = new Map<string, typeof slos>();
  for (const item of slos) {
    const list = slosByProject.get(item.projectId) ?? [];
    list.push(item);
    slosByProject.set(item.projectId, list);
  }
  const map = new Map<string, ImpactEntry>();
  for (const scan of scans) {
    const [components, edges, vulnerabilities, licenses] = await Promise.all([
      prisma.component.findMany({ where: { scanJobId: scan.id }, select: { id: true, name: true, version: true, purl: true } }),
      prisma.dependencyEdge.findMany({ where: { scanJobId: scan.id }, select: { parentComponentId: true, childComponentId: true } }),
      prisma.vulnerabilityFinding.findMany({ where: { scanJobId: scan.id }, select: { id: true, componentId: true, severity: true, osvId: true } }),
      prisma.licenseFinding.findMany({ where: { scanJobId: scan.id }, select: { id: true, componentId: true, decision: true, observedExpression: true } }),
    ]);
    const entries = buildImpact({
      job: { id: scan.id, completedAt: scan.completedAt, sbomDigest: scan.sbomDigest ?? null },
      components,
      edges,
      vulnerabilities,
      licenses,
      evidence: evidenceByProject.get(scan.projectId) ?? [],
      slos: slosByProject.get(scan.projectId) ?? [],
    });
    for (const entry of entries) map.set(entry.findingId, entry);
  }
  return map;
}

async function computeScanImpact(job: ReviewScan, edges: Array<{ parentComponentId: string; childComponentId: string }>, workspaceId: string) {
  return buildImpact({
    job: { id: job.id, completedAt: job.completedAt, sbomDigest: job.sbomDigest ?? null },
    components: job.components.map((c) => ({ id: c.id, name: c.name, version: c.version, purl: c.purl })),
    edges,
    vulnerabilities: job.vulnerabilityFindings.map((v) => ({ id: v.id, componentId: v.componentId, severity: v.severity, osvId: v.osvId })),
    licenses: job.licenseFindings.map((v) => ({ id: v.id, componentId: v.componentId, decision: v.decision, observedExpression: v.observedExpression })),
    evidence: await projectEvidence(workspaceId, job.projectId),
    slos: await projectSlos(workspaceId, job.projectId),
  });
}

api.get("/scans/:jobId/review", async (req, res) => {
  const job = await loadReviewScan(req.params.jobId as string, req.auth!.workspaceId);
  if (!job) return publicError(res, 404, "scan_not_found", "Scan not found.");

  const edges = await prisma.dependencyEdge.findMany({ where: { scanJobId: job.id }, select: { parentComponentId: true, childComponentId: true } });
  const gate = buildGate(job, job.vulnerabilityFindings, job.licenseFindings);
  const remediation = buildRemediations(job.vulnerabilityFindings, job.components, edges);

  const previous = job.status === "COMPLETED" ? await prisma.scanJob.findFirst({
    where: { projectId: job.projectId, status: "COMPLETED", id: { not: job.id }, completedAt: { lt: job.completedAt || job.createdAt } },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      completedAt: true,
      components: true,
      vulnerabilityFindings: { include: { component: { select: { id: true, name: true, version: true, purl: true } } } },
      licenseFindings: { include: { component: { select: { id: true, name: true, version: true, purl: true } } } },
    },
  }) : null;

  const impact = await computeScanImpact(job, edges, req.auth!.workspaceId);
  const impactById = new Map(impact.map((entry) => [entry.findingId, entry]));

  const diff = job.status === "COMPLETED" ? buildDiff(
    { vulns: job.vulnerabilityFindings, components: job.components, licenses: job.licenseFindings },
    previous ? { scanId: previous.id, completedAt: previous.completedAt, vulns: previous.vulnerabilityFindings, components: previous.components, licenses: previous.licenseFindings } : null,
  ) : null;

  const severityCounts = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  for (const vuln of job.vulnerabilityFindings) {
    const severity = (vuln.severity || "").toUpperCase();
    if (severity === "CRITICAL") severityCounts.critical += 1;
    else if (severity === "HIGH") severityCounts.high += 1;
    else if (severity === "MODERATE" || severity === "MEDIUM") severityCounts.moderate += 1;
    else if (severity === "LOW") severityCounts.low += 1;
    else severityCounts.unknown += 1;
  }

  res.json({
    item: {
      scan: {
        id: job.id,
        project: job.project,
        status: job.status.toLowerCase(),
        stage: job.stage,
        source: job.source,
        uploadName: job.uploadName,
        repositoryUrl: job.repositoryUrl,
        branch: job.branch,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        counts: { components: job.componentCount, vulnerabilities: job.vulnerabilityCount, licenseReview: job.licenseReviewCount },
        integrations: { osv: { status: job.vulnerabilityCheckStatus.toLowerCase(), error: job.vulnerabilityCheckError }, licenses: { status: job.licenseCheckStatus.toLowerCase(), error: job.licenseCheckError } },
      },
      gate,
      remediation,
      diff,
      severityCounts,
      findings: {
        vulnerabilities: job.vulnerabilityFindings.map((vuln) => ({ id: vuln.id, osvId: vuln.osvId, aliases: vuln.aliases, summary: vuln.summary, severity: vuln.severity, cvssScore: vuln.cvssScore, modifiedAt: vuln.modifiedAt, component: vuln.component, impact: impactById.get(vuln.id) ?? null })),
        licenses: job.licenseFindings.map((finding) => ({ id: finding.id, observedExpression: finding.observedExpression, observationSource: finding.observationSource, decision: finding.decision, policyRule: finding.policyRule, reviewStatus: finding.reviewStatus, component: finding.component, reviews: finding.reviews, impact: impactById.get(finding.id) ?? null })),
      },
      evidence: {
        sbomDigest: job.sbomDigest ?? null,
        impact,
      },
    },
  });
});

api.get("/scans/:jobId/impact", async (req, res) => {
  const job = await loadReviewScan(req.params.jobId as string, req.auth!.workspaceId);
  if (!job) return publicError(res, 404, "scan_not_found", "Scan not found.");
  const edges = await prisma.dependencyEdge.findMany({ where: { scanJobId: job.id }, select: { parentComponentId: true, childComponentId: true } });
  const impact = await computeScanImpact(job, edges, req.auth!.workspaceId);
  const severityCounts = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  for (const vuln of job.vulnerabilityFindings) {
    const severity = (vuln.severity || "").toUpperCase();
    if (severity === "CRITICAL") severityCounts.critical += 1;
    else if (severity === "HIGH") severityCounts.high += 1;
    else if (severity === "MODERATE" || severity === "MEDIUM") severityCounts.moderate += 1;
    else if (severity === "LOW") severityCounts.low += 1;
    else severityCounts.unknown += 1;
  }
  res.json({
    item: {
      scan: {
        id: job.id,
        project: job.project,
        status: job.status.toLowerCase(),
        stage: job.stage,
        source: job.source,
        uploadName: job.uploadName,
        repositoryUrl: job.repositoryUrl,
        branch: job.branch,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        sbomDigest: job.sbomDigest ?? null,
        counts: { components: job.componentCount, vulnerabilities: job.vulnerabilityCount, licenseReview: job.licenseReviewCount },
      },
      severityCounts,
      impact,
    },
  });
});

api.get("/scans/:jobId/sbom", async (req, res) => {
  const job = await prisma.scanJob.findFirst({ where: { id: req.params.jobId, workspaceId: req.auth!.workspaceId }, select: { status: true, sbom: true, project: { select: { name: true } } } });
  if (!job) return publicError(res, 404, "scan_not_found", "Scan not found.");
  if (job.status !== "COMPLETED" || !job.sbom) return publicError(res, 409, "sbom_not_ready", "The SBOM is available after the scan completes.");
  res.setHeader("Content-Type", "application/vnd.cyclonedx+json; version=1.6");
  res.setHeader("Content-Disposition", `attachment; filename="${job.project.name.replace(/[^a-z0-9_-]+/gi, "-")}.cdx.json"`);
  res.send(JSON.stringify(job.sbom, null, 2));
});

api.get("/projects/:projectId/components", async (req, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.projectId, workspaceId: req.auth!.workspaceId }, select: { id: true } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  const scan = await prisma.scanJob.findFirst({ where: { projectId: project.id, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { id: true } });
  if (!scan) return res.json({ items: [], dependencies: [] });
  const [items, dependencies] = await Promise.all([
    prisma.component.findMany({ where: { scanJobId: scan.id }, include: { licenseFindings: true, vulnerabilities: true }, orderBy: { name: "asc" } }),
    prisma.dependencyEdge.findMany({ where: { scanJobId: scan.id }, include: { parent: { select: { purl: true, name: true, version: true } }, child: { select: { purl: true, name: true, version: true } } } }),
  ]);
  res.json({ items, dependencies });
});

api.get("/licenses/findings", async (req, res) => {
  const [items, impact] = await Promise.all([
    prisma.licenseFinding.findMany({ where: { scanJob: { workspaceId: req.auth!.workspaceId } }, select: { id: true, observedExpression: true, observationSource: true, decision: true, policyRule: true, reviewStatus: true, component: { select: { id: true, name: true, version: true, purl: true, licenseExpression: true, licenseSource: true } }, scanJob: { select: { id: true, project: { select: { id: true, name: true } } } }, reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { decision: true, note: true, createdAt: true } } }, orderBy: { scanJob: { createdAt: "desc" } } }),
    workspaceImpact(req.auth!.workspaceId),
  ]);
  res.json({ items: items.map((item) => ({ ...item, impact: impact.get(item.id) ?? null })) });
});

api.patch("/licenses/findings/:findingId/review", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const schema = z.object({ decision: z.enum(["ALLOW", "BLOCK", "REVIEW"]), note: z.string().trim().max(2000).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_review", "Choose allow, block, or needs review.");
  const findingId = req.params.findingId as string;
  const finding = await prisma.licenseFinding.findFirst({ where: { id: findingId, scanJob: { workspaceId: req.auth!.workspaceId } } });
  if (!finding) return publicError(res, 404, "finding_not_found", "License finding not found.");
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.licenseFinding.update({ where: { id: finding.id }, data: { decision: parsed.data.decision, reviewStatus: "REVIEWED" } });
    await tx.reviewDecision.create({ data: { licenseFindingId: finding.id, reviewerId: req.auth!.userId, decision: parsed.data.decision, note: parsed.data.note } });
    return updated;
  });
  res.json({ item });
});

api.get("/vulnerabilities/findings", async (req, res) => {
  const [items, impact] = await Promise.all([
    prisma.vulnerabilityFinding.findMany({ where: { scanJob: { workspaceId: req.auth!.workspaceId } }, select: { id: true, osvId: true, aliases: true, summary: true, severity: true, cvssScore: true, modifiedAt: true, affected: true, component: { select: { id: true, name: true, version: true, purl: true } }, scanJob: { select: { id: true, vulnerabilityCheckStatus: true, vulnerabilityCheckError: true, project: { select: { id: true, name: true } } } } }, orderBy: { scanJob: { createdAt: "desc" } } }),
    workspaceImpact(req.auth!.workspaceId),
  ]);
  res.json({ items: items.map((item) => ({ ...item, impact: impact.get(item.id) ?? null })) });
});

api.get("/settings/license-policies", async (req, res) => {
  const items = await prisma.licensePolicy.findMany({ where: { workspaceId: req.auth!.workspaceId }, orderBy: { licenseExpression: "asc" } });
  res.json({ items });
});

api.put("/settings/license-policies", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const schema = z.object({ items: z.array(z.object({ licenseExpression: z.string().trim().min(1).max(200), decision: z.enum(["ALLOW", "BLOCK", "REVIEW"]), note: z.string().trim().max(1000).optional() })).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_policies", "Check the license policy rules.");
  await prisma.$transaction([
    prisma.licensePolicy.deleteMany({ where: { workspaceId: req.auth!.workspaceId } }),
    prisma.licensePolicy.createMany({ data: parsed.data.items.map((item) => ({ ...item, workspaceId: req.auth!.workspaceId })) }),
  ]);
  const items = await prisma.licensePolicy.findMany({ where: { workspaceId: req.auth!.workspaceId }, orderBy: { licenseExpression: "asc" } });
  res.json({ items });
});

api.get("/settings/workspace", async (req, res) => {
  const item = await prisma.workspace.findUnique({ where: { id: req.auth!.workspaceId }, select: { id: true, name: true, slug: true, createdAt: true } });
  if (!item) return publicError(res, 404, "workspace_not_found", "Workspace not found.");
  res.json({ item, role: req.auth!.role });
});

api.put("/settings/workspace", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100) }).safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_workspace", "Workspace name must be between 2 and 100 characters.");
  const item = await prisma.workspace.update({ where: { id: req.auth!.workspaceId }, data: { name: parsed.data.name }, select: { id: true, name: true, slug: true, createdAt: true } });
  res.json({ item });
});

api.get("/reports", async (req, res) => {
  const items = await prisma.report.findMany({ where: { workspaceId: req.auth!.workspaceId }, select: { id: true, name: true, format: true, createdAt: true, scanJob: { select: { id: true, project: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } });
  res.json({ items });
});

api.post("/reports", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const schema = z.object({ scanJobId: z.string().min(1).max(64), format: z.enum(["cyclonedx-json", "licenses-csv", "vulnerabilities-csv", "release-evidence-json", "release-evidence-csv"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_report", "Choose a report format and completed scan.");
  const job = await prisma.scanJob.findFirst({ where: { id: parsed.data.scanJobId, workspaceId: req.auth!.workspaceId, status: "COMPLETED" }, include: { project: true } });
  if (!job) return publicError(res, 404, "scan_not_found", "Completed scan not found.");
  let content: string;
  let mimeType = "text/csv; charset=utf-8";
  if (parsed.data.format === "release-evidence-json" || parsed.data.format === "release-evidence-csv") {
    if (parsed.data.format === "release-evidence-json") {
      const report = await buildReleaseEvidenceReport(job.id, req.auth!.workspaceId);
      if (!report) return publicError(res, 409, "report_unavailable", "The completed scan could not be read for the report.");
      content = JSON.stringify(report, null, 2);
      mimeType = "application/json; charset=utf-8";
    } else {
      const csv = await buildReleaseEvidenceCsv(job.id, req.auth!.workspaceId);
      if (!csv) return publicError(res, 409, "report_unavailable", "The completed scan could not be read for the report.");
      content = csv;
      mimeType = "text/csv; charset=utf-8";
    }
    const sbomDigest = job.sbomDigest ?? null;
    const item = await prisma.report.create({ data: { workspaceId: req.auth!.workspaceId, scanJobId: job.id, name: releaseEvidenceReportName(job.project.name, parsed.data.format === "release-evidence-json" ? "json" : "csv", sbomDigest), format: mimeType, content } });
    reportsGeneratedTotal.inc({ format: parsed.data.format }, 1);
    return res.status(201).json({ item: { id: item.id, name: item.name, format: item.format, createdAt: item.createdAt } });
  }
  if (parsed.data.format === "cyclonedx-json") {
    if (!job.sbom) return publicError(res, 409, "sbom_not_ready", "This scan has no generated SBOM.");
    content = JSON.stringify(job.sbom, null, 2);
    mimeType = "application/vnd.cyclonedx+json; version=1.6";
  } else if (parsed.data.format === "licenses-csv") {
    const rows = await prisma.licenseFinding.findMany({ where: { scanJobId: job.id }, include: { component: true } });
    content = ["component,version,license,decision,reviewStatus", ...rows.map((row) => [row.component.name, row.component.version, row.observedExpression || "Unknown / needs review", row.decision, row.reviewStatus].map(csvCell).join(","))].join("\n") + "\n";
  } else {
    const rows = await prisma.vulnerabilityFinding.findMany({ where: { scanJobId: job.id }, include: { component: true } });
    content = ["component,version,osvId,severity,summary", ...rows.map((row) => [row.component.name, row.component.version, row.osvId, row.severity || "Unknown", row.summary || ""].map(csvCell).join(","))].join("\n") + "\n";
  }
  const name = `${job.project.name}-${parsed.data.format}`;
  const item = await prisma.report.create({ data: { workspaceId: req.auth!.workspaceId, scanJobId: job.id, name, format: mimeType, content } });
  reportsGeneratedTotal.inc({ format: parsed.data.format }, 1);
  res.status(201).json({ item: { id: item.id, name: item.name, format: item.format, createdAt: item.createdAt } });
});

api.get("/reports/:reportId/download", async (req, res) => {
  const item = await prisma.report.findFirst({ where: { id: req.params.reportId, workspaceId: req.auth!.workspaceId } });
  if (!item) return publicError(res, 404, "report_not_found", "Report not found.");
  const ext = item.format.includes("cyclonedx") ? "cdx.json" : item.format.includes("json") ? "release-evidence.json" : "csv";
  res.setHeader("Content-Type", item.format);
  res.setHeader("Content-Disposition", `attachment; filename="${item.name.replace(/[^a-z0-9_-]+/gi, "-")}.${ext}"`);
  res.send(item.content);
});

api.post("/projects/:projectId/sbom-uploads", requireRole("OWNER", "ADMIN", "ANALYST"), upload.single("file"), async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  if (!req.file) return publicError(res, 400, "file_required", "Upload a CycloneDX JSON SBOM file.");
  let document: unknown;
  try { document = JSON.parse(req.file.buffer.toString("utf8")); }
  catch { return publicError(res, 400, "invalid_json", "The uploaded file is not valid JSON."); }
  let parsed;
  try { parsed = parseSbom(document); }
  catch (error) { return publicError(res, 422, "unsupported_sbom", error instanceof Error ? error.message : "The file is not a CycloneDX SBOM."); }
  const saved = await prisma.sbomUpload.create({ data: { workspaceId: req.auth!.workspaceId, projectId: project.id, fileName: req.file.originalname, content: document as Prisma.InputJsonValue, componentCount: parsed.components.length, createdById: req.auth!.userId }, select: { id: true, fileName: true, componentCount: true, createdAt: true } });
  res.status(201).json({ item: saved });
});

api.get("/projects/:projectId/sbom-uploads", async (req, res) => {
  const items = await prisma.sbomUpload.findMany({ where: { projectId: req.params.projectId as string, workspaceId: req.auth!.workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, format: true, componentCount: true, createdAt: true } });
  res.json({ items });
});

api.post("/scans/:jobId/compare", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const schema = z.object({ sbomUploadId: z.string().min(1).max(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return publicError(res, 400, "invalid_comparison", "Choose an SBOM to compare against.");
  const job = await prisma.scanJob.findFirst({ where: { id: req.params.jobId as string, workspaceId: req.auth!.workspaceId }, include: { components: true } });
  if (!job) return publicError(res, 404, "scan_not_found", "Scan not found.");
  if (job.components.length === 0) return publicError(res, 409, "scan_not_ready", "Run a completed scan with components before comparing.");
  const sbomUpload = await prisma.sbomUpload.findFirst({ where: { id: parsed.data.sbomUploadId, projectId: job.projectId, workspaceId: req.auth!.workspaceId } });
  if (!sbomUpload) return publicError(res, 404, "sbom_not_found", "SBOM upload not found for this project.");
  const lockfileEdges = await prisma.dependencyEdge.findMany({ where: { scanJobId: job.id }, select: { parentComponentId: true, childComponentId: true } });
  const report = compareSbomAgainstLockfile({ scanJobId: job.id, lockfileComponents: job.components, lockfileEdges, sbom: sbomUpload.content });
  const saved = await prisma.sbomComparison.create({ data: { workspaceId: req.auth!.workspaceId, projectId: job.projectId, lockfileScanJobId: job.id, sbomUploadId: sbomUpload.id, coverageScore: report.coverageScore, matchedComponents: report.matchedComponents, report: report as unknown as Prisma.InputJsonValue }, select: { id: true, coverageScore: true, matchedComponents: true, createdAt: true } });
  res.status(201).json({ item: { ...saved, report } });
});

api.get("/comparisons/:id", async (req, res) => {
  const item = await prisma.sbomComparison.findFirst({ where: { id: req.params.id as string, workspaceId: req.auth!.workspaceId }, include: { project: { select: { id: true, name: true } }, sbomUpload: { select: { id: true, fileName: true, componentCount: true, createdAt: true } } } });
  if (!item) return publicError(res, 404, "comparison_not_found", "Comparison not found.");
  res.json({ item: { id: item.id, project: item.project, sbomUpload: item.sbomUpload, coverageScore: item.coverageScore, matchedComponents: item.matchedComponents, createdAt: item.createdAt, report: item.report } });
});

api.get("/comparisons/:id/report", async (req, res) => {
  const item = await prisma.sbomComparison.findFirst({ where: { id: req.params.id as string, workspaceId: req.auth!.workspaceId }, include: { project: { select: { name: true } } } });
  if (!item) return publicError(res, 404, "comparison_not_found", "Comparison not found.");
  const safeName = item.project.name.replace(/[^a-z0-9_-]+/gi, "-");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-sbom-coverage-report.json"`);
  res.send(JSON.stringify(item.report, null, 2));
});

// Release evidence: manually registered links in the chain
// source → build → SBOM → artifact → deploy. Workspace-scoped; the source
// is always MANUAL and completeness is never invented.
const evidenceSelect = {
  id: true,
  projectId: true,
  scanJobId: true,
  repositoryUrl: true,
  commitSha: true,
  sbomName: true,
  sbomFormat: true,
  sbomSerialNumber: true,
  sbomGeneratedAt: true,
  sbomDigest: true,
  artifactName: true,
  artifactDigest: true,
  buildProvider: true,
  buildWorkflow: true,
  buildRunId: true,
  buildRunUrl: true,
  deployService: true,
  deployEnvironment: true,
  deployRegion: true,
  deployAt: true,
  evidenceSource: true,
  verificationState: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  scanJob: { select: { id: true, status: true, stage: true, createdAt: true, repositoryUrl: true, branch: true, source: true } },
  attestation: {
    select: {
      id: true,
      envelope: true,
      predicateType: true,
      statementType: true,
      payloadDigest: true,
      rawBytes: true,
      fileName: true,
      subjectName: true,
      subjectDigest: true,
      subjectCount: true,
      subjects: true,
      subjectMatchesArtifact: true,
      builderId: true,
      buildType: true,
      buildInvocationId: true,
      startedOn: true,
      finishedOn: true,
      sourceRepoUrl: true,
      sourceRevision: true,
      materials: true,
      signatureCount: true,
      signatureState: true,
      parsedAt: true,
    },
  },
} as const;

async function findEvidenceInWorkspace(id: string, workspaceId: string) {
  return prisma.releaseEvidence.findFirst({ where: { id, workspaceId }, select: evidenceSelect });
}

function shapeEvidence(item: NonNullable<Awaited<ReturnType<typeof findEvidenceInWorkspace>>>) {
  return {
    ...item,
    evidenceSource: item.evidenceSource.toLowerCase(),
    verificationState: item.verificationState.toLowerCase(),
    scan: item.scanJob ? { id: item.scanJob.id, status: item.scanJob.status.toLowerCase(), stage: item.scanJob.stage, createdAt: item.scanJob.createdAt, repositoryUrl: item.scanJob.repositoryUrl, branch: item.scanJob.branch, source: item.scanJob.source } : null,
    scanJob: undefined,
  };
}

api.get("/projects/:projectId/release-evidence", async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  const items = await prisma.releaseEvidence.findMany({ where: { workspaceId: req.auth!.workspaceId, projectId: project.id }, select: evidenceSelect, orderBy: { createdAt: "desc" } });
  res.json({ items: items.map(shapeEvidence) });
});

api.post("/projects/:projectId/release-evidence", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  const parsed = releaseEvidenceCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return publicError(res, 400, "invalid_evidence", parsed.error.issues[0]?.message || "Check the evidence fields.");
  if (parsed.data.scanJobId) {
    const scan = await prisma.scanJob.findFirst({ where: { id: parsed.data.scanJobId, workspaceId: req.auth!.workspaceId, projectId: project.id }, select: { id: true } });
    if (!scan) return publicError(res, 400, "invalid_evidence", "That scan does not belong to this project.");
  }
  const created = await prisma.releaseEvidence.create({ data: { ...parsed.data, workspaceId: req.auth!.workspaceId, projectId: project.id, createdById: req.auth!.userId, evidenceSource: "MANUAL" }, select: evidenceSelect });
  res.status(201).json({ item: shapeEvidence(created) });
});

api.get("/release-evidence/:id", async (req, res) => {
  const item = await findEvidenceInWorkspace(req.params.id as string, req.auth!.workspaceId);
  if (!item) return publicError(res, 404, "evidence_not_found", "Release evidence not found.");
  res.json({ item: shapeEvidence(item) });
});

api.patch("/release-evidence/:id", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.releaseEvidence.findFirst({ where: { id, workspaceId: req.auth!.workspaceId }, select: { id: true, projectId: true } });
  if (!existing) return publicError(res, 404, "evidence_not_found", "Release evidence not found.");
  const parsed = releaseEvidenceUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return publicError(res, 400, "invalid_evidence", parsed.error.issues[0]?.message || "Check the evidence fields.");
  if (parsed.data.scanJobId) {
    const scan = await prisma.scanJob.findFirst({ where: { id: parsed.data.scanJobId, workspaceId: req.auth!.workspaceId, projectId: existing.projectId }, select: { id: true } });
    if (!scan) return publicError(res, 400, "invalid_evidence", "That scan does not belong to this project.");
  }
  const updated = await prisma.releaseEvidence.update({ where: { id }, data: parsed.data, select: evidenceSelect });
  res.json({ item: shapeEvidence(updated) });
});

api.delete("/release-evidence/:id", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.releaseEvidence.findFirst({ where: { id, workspaceId: req.auth!.workspaceId }, select: { id: true } });
  if (!existing) return publicError(res, 404, "evidence_not_found", "Release evidence not found.");
  await prisma.releaseEvidence.delete({ where: { id } });
  res.status(204).end();
});

// Provenance attestations: SAFE PARSING + DIGEST MATCHING ONLY.
// DSSE/in-toto signatures are counted but never verified — no trust root is
// configured. Every attestation's signatureState is "unverified" and the UI
// says exactly that. Nothing here proves the artifact was built by anyone.
const attestationSelect = {
  id: true,
  envelope: true,
  predicateType: true,
  statementType: true,
  payloadDigest: true,
  rawBytes: true,
  fileName: true,
  subjectName: true,
  subjectDigest: true,
  subjectCount: true,
  subjects: true,
  subjectMatchesArtifact: true,
  builderId: true,
  buildType: true,
  buildInvocationId: true,
  startedOn: true,
  finishedOn: true,
  sourceRepoUrl: true,
  sourceRevision: true,
  materials: true,
  signatureCount: true,
  signatureState: true,
  parsedAt: true,
} as const;

api.post("/release-evidence/:id/attestation", requireRole("OWNER", "ADMIN", "ANALYST"), attestationUpload.single("file"), async (req, res) => {
  const id = req.params.id as string;
  const evidence = await prisma.releaseEvidence.findFirst({ where: { id, workspaceId: req.auth!.workspaceId }, select: { id: true, artifactDigest: true } });
  if (!evidence) return publicError(res, 404, "evidence_not_found", "Release evidence not found.");
  if (!req.file) return publicError(res, 400, "file_required", "Upload a SLSA provenance attestation (an in-toto Statement, optionally DSSE-wrapped).");
  try {
    const parsed = parseProvenance(req.file.buffer, evidence.artifactDigest);
    const data = {
      workspaceId: req.auth!.workspaceId,
      envelope: parsed.envelope,
      predicateType: parsed.predicateType,
      statementType: parsed.statementType,
      payloadDigest: parsed.payloadDigest,
      rawBytes: parsed.rawBytes,
      fileName: sanitizeFileName(req.file.originalname),
      subjectName: parsed.subjectName,
      subjectDigest: parsed.subjectDigest,
      subjectCount: parsed.subjects.length,
      subjects: parsed.subjects.map((subject) => ({ name: subject.name, digest: subject.digest })) as Prisma.InputJsonValue,
      subjectMatchesArtifact: parsed.subjectMatchesArtifact,
      builderId: parsed.builderId,
      buildType: parsed.buildType,
      buildInvocationId: parsed.buildInvocationId,
      startedOn: parsed.startedOn ? new Date(parsed.startedOn) : null,
      finishedOn: parsed.finishedOn ? new Date(parsed.finishedOn) : null,
      sourceRepoUrl: parsed.sourceRepoUrl,
      sourceRevision: parsed.sourceRevision,
      materials: parsed.materials.map((material) => ({ uri: material.uri, digest: material.digest })) as Prisma.InputJsonValue,
      signatureCount: parsed.signatureCount,
      signatureState: "unverified",
      createdById: req.auth!.userId,
    };
    const saved = await prisma.provenanceAttestation.upsert({
      where: { evidenceId: id },
      create: { ...data, evidenceId: id },
      update: data,
      select: attestationSelect,
    });
    res.status(201).json({ item: saved });
  } catch (error) {
    if (error instanceof ProvenanceError) return publicError(res, 400, error.code, error.message);
    throw error;
  }
});

api.get("/release-evidence/:id/attestation", async (req, res) => {
  const id = req.params.id as string;
  const item = await prisma.provenanceAttestation.findFirst({ where: { evidenceId: id, workspaceId: req.auth!.workspaceId }, select: attestationSelect });
  if (!item) return publicError(res, 404, "attestation_not_found", "No provenance attestation is registered for this evidence.");
  res.json({ item });
});

api.delete("/release-evidence/:id/attestation", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.provenanceAttestation.findFirst({ where: { evidenceId: id, workspaceId: req.auth!.workspaceId }, select: { id: true } });
  if (!existing) return publicError(res, 404, "attestation_not_found", "No provenance attestation is registered for this evidence.");
  await prisma.provenanceAttestation.delete({ where: { id: existing.id } });
  res.status(204).end();
});

// Service level objectives: manual reliability context for registered services.
// Source is always MANUAL; there is no live telemetry integration. errorBudget
// is computed at read time from the stored values — never stored, never a score.
const sloSelect = {
  id: true,
  projectId: true,
  service: true,
  environment: true,
  name: true,
  target: true,
  indicatorName: true,
  observedValue: true,
  windowDays: true,
  observedAt: true,
  source: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

type SloRow = Awaited<ReturnType<typeof findSloInWorkspace>>;

async function findSloInWorkspace(id: string, workspaceId: string) {
  return prisma.serviceLevelObjective.findFirst({ where: { id, workspaceId }, select: sloSelect });
}

function shapeSlo(item: NonNullable<SloRow>) {
  return {
    ...item,
    source: item.source.toLowerCase(),
    errorBudget: computeErrorBudget(item.target, item.observedValue),
  };
}

api.get("/telemetry/status", async (_req, res) => {
  res.json({ item: { ...TELEMETRY_STATUS } });
});

api.get("/projects/:projectId/slos", async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  const items = await prisma.serviceLevelObjective.findMany({ where: { workspaceId: req.auth!.workspaceId, projectId: project.id }, select: sloSelect, orderBy: [{ service: "asc" }, { environment: "asc" }, { name: "asc" }] });
  res.json({ items: items.map(shapeSlo) });
});

api.post("/projects/:projectId/slos", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.auth!.workspaceId } });
  if (!project) return publicError(res, 404, "project_not_found", "Project not found.");
  const parsed = sloCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return publicError(res, 400, "invalid_slo", parsed.error.issues[0]?.message || "Check the SLO fields.");
  const created = await prisma.serviceLevelObjective.create({ data: { ...parsed.data, workspaceId: req.auth!.workspaceId, projectId: project.id, createdById: req.auth!.userId, source: "MANUAL" }, select: sloSelect });
  res.status(201).json({ item: shapeSlo(created) });
});

api.get("/slos/:id", async (req, res) => {
  const item = await findSloInWorkspace(req.params.id as string, req.auth!.workspaceId);
  if (!item) return publicError(res, 404, "slo_not_found", "SLO not found.");
  res.json({ item: shapeSlo(item) });
});

api.patch("/slos/:id", requireRole("OWNER", "ADMIN", "ANALYST"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await findSloInWorkspace(id, req.auth!.workspaceId);
  if (!existing) return publicError(res, 404, "slo_not_found", "SLO not found.");
  const parsed = sloUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return publicError(res, 400, "invalid_slo", parsed.error.issues[0]?.message || "Check the SLO fields.");
  const update = parsed.data;
  // Merge stored + update, then validate the pair with the full rules.
  const merged = {
    service: update.service ?? existing.service,
    environment: update.environment ?? existing.environment,
    name: update.name ?? existing.name,
    target: update.target ?? existing.target,
    indicatorName: update.indicatorName ?? existing.indicatorName,
    observedValue: update.observedValue === undefined ? existing.observedValue : update.observedValue,
    windowDays: update.windowDays === undefined ? existing.windowDays : update.windowDays,
    observedAt: update.observedAt === undefined
      ? (existing.observedAt ? existing.observedAt.toISOString() : null)
      : update.observedAt instanceof Date
        ? update.observedAt.toISOString()
        : update.observedAt,
    source: "MANUAL",
    note: update.note === undefined ? existing.note : update.note,
  };
  const validated = validateSloMerged(merged);
  if (!validated.success) return publicError(res, 400, "invalid_slo", validated.error.issues[0]?.message || "Check the SLO fields.");
  const updated = await prisma.serviceLevelObjective.update({ where: { id }, data: validated.data, select: sloSelect });
  res.json({ item: shapeSlo(updated) });
});

api.delete("/slos/:id", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.serviceLevelObjective.findFirst({ where: { id, workspaceId: req.auth!.workspaceId }, select: { id: true } });
  if (!existing) return publicError(res, 404, "slo_not_found", "SLO not found.");
  await prisma.serviceLevelObjective.delete({ where: { id } });
  res.status(204).end();
});

app.use("/api/v1", api);
const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  if (error instanceof multer.MulterError) {
    const isAttestation = typeof req?.path === "string" && req.path.includes("attestation");
    const message = error.code === "LIMIT_FILE_SIZE"
      ? isAttestation
        ? "The attestation is too large. Maximum size is 2 MB."
        : "The file is too large. Maximum size is 20 MB."
      : "Choose one file to upload.";
    return publicError(res, 400, error.code.toLowerCase(), message);
  }
  if (error?.code === "P2002") return publicError(res, 409, "already_exists", "A record with those details already exists.");
  console.error("API error", error);
  return publicError(res, 500, "internal_error", "Something went wrong. Please try again.");
};
app.use(errorHandler);

export { app };
if (process.env.NODE_ENV !== "test") {
  await boss.start();
  await boss.createQueue("supplyguard-scan");
  app.listen(port, () => console.log(`SupplyGuard API listening on http://localhost:${port}/api/v1`));

  process.on("SIGTERM", async () => { await boss.stop(); await prisma.$disconnect(); process.exit(0); });
}
