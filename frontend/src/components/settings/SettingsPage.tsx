"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, apiUrl, type LicenseDecision, type WorkspaceRole } from "@/lib/api";
import { GithubIcon, SettingsIcon } from "@/components/Icons";

type Policy = { id?: string; licenseExpression: string; decision: LicenseDecision; note?: string | null };

export default function SettingsPage() {
  const [role, setRole] = useState<WorkspaceRole>("VIEWER");
  const [workspaceName, setWorkspaceName] = useState("");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [integrations, setIntegrations] = useState<{ gitProvider: { configured: boolean; provider: string; privateRepositories: boolean }; osv: { configured: boolean; endpoint: string } } | null>(null);
  const [github, setGithub] = useState<{ configured: boolean; connected: boolean; source: string | null; login: string | null; name: string | null; scope: string | null; connectedAt: string | null } | null>(null);
  const [patToken, setPatToken] = useState("");
  const [connectingPat, setConnectingPat] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.settings.workspace(), api.licenses.policies(), api.settings.integrations(), api.github.settings()]).then(([workspace, policyResult, integrationResult, githubResult]) => {
      if (!active) return;
      setRole(workspace.role); setWorkspaceName(workspace.item.name); setPolicies(policyResult.items); setIntegrations(integrationResult); setGithub(githubResult);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load workspace settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const canManage = role === "OWNER" || role === "ADMIN";

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingWorkspace(true); setError(""); setNotice("");
    try {
      const { item } = await api.settings.updateWorkspace(workspaceName.trim());
      setWorkspaceName(item.name);
      window.dispatchEvent(new CustomEvent("supplyguard:workspace-updated", { detail: item.name }));
      setNotice("Workspace name saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Workspace settings could not be saved."); }
    finally { setSavingWorkspace(false); }
  }

  async function savePolicies() {
    setSavingPolicies(true); setError(""); setNotice("");
    try {
      const result = await api.licenses.savePolicies(policies.map(({ licenseExpression, decision, note }) => ({ licenseExpression: licenseExpression.trim(), decision, ...(note?.trim() ? { note: note.trim() } : {}) })));
      setPolicies(result.items); setNotice("License policy rules saved. Rules apply to future scans.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "License policies could not be saved."); }
    finally { setSavingPolicies(false); }
  }

  function updatePolicy(index: number, update: Partial<Policy>) {
    setPolicies((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  }

  async function savePat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setConnectingPat(true); setError(""); setNotice("");
    try {
      const result = await api.github.connectPat(patToken.trim());
      const settings = await api.github.settings();
      setGithub(settings); setPatToken("");
      setNotice(`Connected as ${result.login}. You can now list repositories and scan private repos in the Scanner.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not connect GitHub. Check the token and try again."); }
    finally { setConnectingPat(false); }
  }

  async function disconnectGithub() {
    setDisconnecting(true); setError(""); setNotice("");
    try {
      await api.github.disconnect();
      const settings = await api.github.settings();
      setGithub(settings); setNotice("GitHub disconnected.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not disconnect GitHub."); }
    finally { setDisconnecting(false); }
  }

  return <div className="flex flex-col gap-5">
    <header><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-light"><span>Workspace</span><span>/</span><span className="font-semibold text-ink">Settings</span></nav><h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">Settings</h1><p className="mt-1 text-[13px] text-muted">Workspace identity and software license policy.</p></header>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-xs text-red-800">{error}</p> : null}{notice ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">{notice}</p> : null}
    {loading ? <div role="status" className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">Loading settings…</div> : <>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><SettingsIcon className="h-4 w-4" /></span><div><h2 className="text-[15px] font-bold text-ink">Workspace</h2><p className="mt-1 text-[11px] text-muted">Your role: {role.toLowerCase()}.</p></div></div><form onSubmit={saveWorkspace} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><label htmlFor="workspace-name" className="block text-xs font-semibold text-ink">Workspace name</label><input suppressHydrationWarning id="workspace-name" required minLength={2} maxLength={100} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} disabled={!canManage} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm disabled:bg-panel-deep" /></div><button type="submit" disabled={!canManage || savingWorkspace} title={!canManage ? "Only workspace owners and administrators can change the workspace name." : undefined} className="rounded-lg bg-brand-dark px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingWorkspace ? "Saving…" : "Save workspace"}</button></form>{!canManage ? <p className="mt-2 text-[11px] text-muted">Contact a workspace owner or administrator to change these settings.</p> : null}</section>

      <section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-[15px] font-bold text-ink">License policy</h2><p className="mt-1 max-w-2xl text-[11.5px] text-muted">Rules match the license metadata observed for packages. Policy decisions never change the underlying observation.</p></div><button type="button" disabled={!canManage} onClick={() => setPolicies((items) => [...items, { licenseExpression: "", decision: "REVIEW", note: "" }])} title={!canManage ? "Only workspace owners and administrators can change license policy." : undefined} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50">Add rule</button></div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-900">Unknown / needs review is always kept separate from license policy. SupplyGuard never guesses an unknown license.</div>
        {policies.length === 0 ? <p className="mt-4 rounded-lg bg-panel p-4 text-xs text-muted">No license rules configured. Observed licenses will be marked for review until a matching rule is added. Unknown licenses always require review.</p> : <div className="mt-4 space-y-3">{policies.map((policy, index) => <div key={policy.id || `new-${index}`} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-[1fr_170px_1fr_auto] md:items-end"><div><label htmlFor={`license-rule-${index}`} className="block text-[10px] font-semibold text-muted">License expression</label><input suppressHydrationWarning id={`license-rule-${index}`} value={policy.licenseExpression} onChange={(event) => updatePolicy(index, { licenseExpression: event.target.value })} disabled={!canManage} placeholder="e.g. MIT" className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-xs disabled:bg-panel-deep" /></div><div><label htmlFor={`license-decision-${index}`} className="block text-[10px] font-semibold text-muted">Decision</label><select id={`license-decision-${index}`} value={policy.decision} onChange={(event) => updatePolicy(index, { decision: event.target.value as LicenseDecision })} disabled={!canManage} className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-xs disabled:bg-panel-deep"><option value="REVIEW">Needs review</option><option value="ALLOW">Allow</option><option value="BLOCK">Block</option></select></div><div><label htmlFor={`license-note-${index}`} className="block text-[10px] font-semibold text-muted">Note (optional)</label><input suppressHydrationWarning id={`license-note-${index}`} value={policy.note || ""} onChange={(event) => updatePolicy(index, { note: event.target.value })} disabled={!canManage} maxLength={1000} className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-xs disabled:bg-panel-deep" /></div><button type="button" disabled={!canManage} onClick={() => setPolicies((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-md px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">Remove</button></div>)}</div>}
        <div className="mt-4 flex items-center justify-between gap-3"><p className="text-[10.5px] text-muted">Policy changes apply to future scans. Existing findings retain their recorded decision.</p><button type="button" disabled={!canManage || savingPolicies} onClick={() => void savePolicies()} title={!canManage ? "Only workspace owners and administrators can change license policy." : undefined} className="shrink-0 rounded-lg bg-brand-dark px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingPolicies ? "Saving…" : "Save policy"}</button></div>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-chip text-ink"><GithubIcon className="h-5 w-5" /></span><div><h2 className="text-[15px] font-bold text-ink">GitHub connection</h2><p className="mt-0.5 text-[11px] text-muted">Connect GitHub to list your repositories in the Scanner, check lockfiles, and scan private repositories.</p></div></div>
        {!github ? <p className="mt-4 text-xs text-muted">Loading GitHub status…</p> : github.connected ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[12px] font-bold text-white">{github.login?.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-ink">{github.name || github.login} <span className="font-normal text-muted">@{github.login}</span></p><p className="mt-0.5 text-[10.5px] text-muted">Connected via {github.source === "pat" ? "Personal Access Token" : "GitHub OAuth"}{github.scope ? ` · scopes: ${github.scope}` : ""}</p></div></div><button type="button" onClick={() => void disconnectGithub()} disabled={disconnecting} className="shrink-0 rounded-lg border border-red-200 bg-surface px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{disconnecting ? "Disconnecting…" : "Disconnect"}</button></div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3"><p className="text-[13px] font-semibold text-ink">One-click sign-in (OAuth)</p><p className="text-[11px] text-muted">{github.configured ? "Server OAuth credentials detected. Click to connect with your GitHub account." : "Not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in server/.env to enable."}</p><a href={github.configured ? apiUrl("/auth/github") : undefined} role={github.configured ? "link" : "button"} aria-disabled={!github.configured} onClick={(e) => { if (!github.configured) e.preventDefault(); }} title={github.configured ? "Authorize with GitHub" : "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in server/.env"} className={github.configured ? "mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-90" : "mt-auto inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-muted"}><GithubIcon className="h-4 w-4" />Connect with GitHub</a></div>
            <form onSubmit={savePat} className="flex flex-col gap-2 rounded-lg border border-line p-3"><p className="text-[13px] font-semibold text-ink">Or paste a Personal Access Token</p><p className="text-[11px] text-muted">github.com/settings/tokens → generate a <strong>classic</strong> token with <code>repo</code> and <code>read:user</code> scopes. Takes ~1 minute.</p><div className="mt-auto flex flex-col gap-2 sm:flex-row"><input suppressHydrationWarning type="password" value={patToken} onChange={(event) => setPatToken(event.target.value)} required minLength={10} placeholder="ghp_…" autoComplete="off" aria-label="GitHub Personal Access Token" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 font-mono text-[11px] outline-none focus:border-brand" /><button type="submit" disabled={connectingPat || !patToken.trim()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#24292f] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{connectingPat ? "Connecting…" : "Connect"}</button></div></form>
          </div>
        )}
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-xs"><h2 className="text-[15px] font-bold text-ink">Integrations</h2><p className="mt-1 text-[11.5px] text-muted">Connection status for the external services used during scans.</p><div className="mt-4 space-y-3"><div className="flex items-start justify-between gap-3 rounded-lg border border-line p-3"><div><p className="text-[13px] font-semibold text-ink">GitHub repository scanning</p><p className="mt-0.5 text-[11.5px] text-muted">{integrations?.gitProvider.privateRepositories ? "Server token configured — public and private repositories via GIT_PROVIDER_TOKEN." : "Available — public repositories with no token. Connect GitHub above to scan private repos."}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${integrations?.gitProvider.configured || github?.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{integrations?.gitProvider.configured || github?.connected ? "Available" : "Unavailable"}</span></div><div className="flex items-start justify-between gap-3 rounded-lg border border-line p-3"><div><p className="text-[13px] font-semibold text-ink">OSV vulnerability database</p><p className="mt-0.5 text-[11.5px] text-muted">{integrations?.osv.configured ? `Connected — ${integrations.osv.endpoint}` : "Unavailable"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${integrations?.osv.configured ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{integrations?.osv.configured ? "Connected" : "Unavailable"}</span></div></div></section>
      <p className="text-[11px] text-muted-light">Team member management and notification delivery are not configured yet. Password reset is implemented and activates once <code>SMTP_USER</code> and <code>SMTP_PASS</code> in <code>server/.env</code> pass verification.</p>
    </>}
  </div>;
}
