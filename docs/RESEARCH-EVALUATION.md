# Research Evaluation Protocol — SupplyGuard Release Evidence

**Status: proposed, not executed. No results exist. No claims about efficacy,
superiority, or novelty are made.** This document defines a reproducible
protocol. It exists so the evaluation can be run properly later; it is not a
substitute for running it, and it must not be circulated as evidence of impact.

---

## 1. The question

> Given a scan of a Node.js lockfile and its vulnerability/license findings,
> how much does adding (a) artifact↔deployment evidence linked to the scanned
> SBOM, and (b) separately displayed SLO context, improve a practitioner's
> ability to find, correctly attribute, and prioritize remediation of affected
> deployed services — compared to (a0) SBOM and vulnerability data alone?

## 2. Conditions

| Condition | What the participant sees |
|---|---|
| **A — Baseline** | The SupplyGuard scan review UI with SBOM, findings tables, severity, fix plan, change review — but **no** release evidence widgets: no `impact` fields, no evidence page, no SLO context, no attestation panel. |
| **B — Evidence + SLO context** | The same UI **plus** the finding-impact panel (status: verified/linked/unverified/missing), registered deployment mappings (digest→service/env/region), provenance attestation status (always `unverified`), and manual SLO cards with computed error budgets shown **beside** findings (never merged into severity or the verdict). |

Both conditions are the same application with different features enabled —
measured on **one** machine, same dataset, counterbalanced order (A→B and
B→A), washout period, screen recording optional.

## 3. Dataset

A fixed, reproducible dataset, not a live one:

- npm project: `github.com/CodeByAlok24/HAQMS` (public), scanned from its
  `package-lock.json` with the current OSV snapshot **at protocol run time —
  the snapshot date is recorded**. Findings will therefore drift; the commit
  SHA pins which is used. The restored development database (see `backups/`)
  contains an already-completed scan of this project and may be used instead,
  with the scan ID recorded.
- Release evidence for the demo project is **synthesized by the experimenter**
  (never presented as real deployment data): a digest-linked evidence entry
  for the artifact built from the scanned SBOM (`subjectMatchesArtifact = true`),
  a deliberately **stale** evidence entry registered *before* the scan
  completed, an unlinked project (`unverified` status), and one project with
  no evidence at all (`missing`).
- One deliberately non-matching attestation (subject digest ≠ artifact digest)
  for the mismatch path.
- SLO entries for the linked service: one healthy manual SLO
  (`observedValue ≥ target`), one manually entered "exhausted" budget; both
  labeled Manual with recorded observation timestamps.
- Findings ground truth: which packages OSV reports (fixed set), and which
  services the artifact runs on (fixed: `api`/`production`).

Synthetic ≠ fabricated reality — every value is labeled Manual inside the app.

## 4. Tasks (per condition, per participant)

1. **T1 — Affected-service search.** "Which production service(s) are affected
   by finding X?" Measured: wall-clock seconds to first correct answer
   (log the wrong answers too).
2. **T2 — Attribution classification.** For 10 findings spanning verified /
   linked / unverified / missing / stale evidence, participants label each as
   "affected / not affected / cannot tell". Scored against registered evidence
   ground truth (precision, recall, and false-attribution rate).
3. **T3 — Remediation prioritization.** Participants order 5 remediations for
   the same findings. Scored against the attribution-informed order
   (affected deployed services first, then unlinked, then missing) and against
   plain severity-first order. Inter-rater agreement (e.g., Kendall's W or
   pairwise agreement) reported descriptively; no significance claim without
   a paired test.
4. **T4 — Stale-evidence detection.** A stale evidence entry is present.
   Scored as binary: did the participant explicitly mention staleness as a
   reason not to trust/attribute? (Yes/No; time to mention, if noted.)
5. **T5 — False attribution count.** Number of times a participant attributes
   a finding to a service that registered evidence does not support.
6. **T6 — Effort (informational).** Minutes to hand-register one release
   evidence entry and one SLO, if the participant has not seen the UI before.

## 5. Measures and statistics

- **Time to find affected services** (T1): median [IQR] seconds, paired
  difference per participant, Wilcoxon signed-rank test; report effect size
  (r or Hodges–Lehmann median difference).
- **Correct service identification** (T2): precision / recall / F1, per
  participant, by evidence status bucket.
- **Remediation ordering** (T3): agreement with attribution-informed order
  vs agreement with severity-first order; report both.
- **Stale-evidence detection** (T4): proportion detected; no inference.
- **False attribution** (T5): count per participant; paired comparison A vs B.
- Report all raw data, the analysis script, and the scan/dataset IDs. No
  p-values without a stated two-sided α = 0.05; multiple comparisons noted.
- **No efficacy claims without a sample size rationale** (n ≥ 8, ideally
  12–16 engineers who actually do dependency security reviews). A convenience
  sample is fine for a pilot; label it a pilot.

## 6. What would invalidate the result

- Single dataset, single outcome snapshot (OSV is not static).
- Learning effects despite counterbalancing — wash out between conditions.
- Participants with strong prior knowledge of the codebase — measure and
  report prior-experience covariates.
- Synthetic evidence interacting with real UI hints (e.g., participants trust
  green "verified" chips wholesale — measure blind trust: did anyone flag that
  a digest match is not authenticity? Report "trusts-unverified-attestation"
  rate as a secondary measure).
- Ecological validity: one lockfile, one repo, one OSV snapshot.

## 7. What this evaluation will NOT claim

- **No novelty claim** until a structured literature and product review is
  done (see §8). Even then, "novel" requires that the exact combination
  (OSV findings + SBOM + manual digest↔deployment mapping + SLO context in
  one local-first tool) be absent from every compared tool/paper — otherwise
  call it an *integration study*, which is the honest framing.
- **No causation claims** beyond the measured tasks; no "prevents incidents".
- **No claim that SLO data belongs in a security verdict** — the protocol
  displays SLO context beside findings and measures prioritization, never
  verdict changes. Severity and SLO are never combined by the tool.
- **No external validity** beyond npm/CycloneDX ecosystems and self-hosted
  single-cluster deployments.

## 8. Required product and literature review (before any publication)

Compare against, at minimum: OWASP Dependency-Track, npm audit, GitHub
Dependabot alerts, Snyk, Trivy/Grype (+ cosign/attest for provenance),
anchoretc tooling, Socket, Renovate. For each: does it show (a) affected
deployed service(s) at scan time, (b) artifact-digest-keyed deployment
mappings, (c) SLO/error-budget context beside findings? Literature: SLSA /
in-toto papers, SBOM adoption studies, vulnerability-triage burden studies,
dependency-confusion/malicious-package UX work, reliability-SLO
decision-support research. **None of this has been done yet.** Any claim
beyond "we built X and measured Y on Z participants" requires it.

## 9. Reproducibility checklist

1. Fix the commit hash of the evaluated build (git SHA recorded; this repo
   currently has one initial commit — hash printed in the appendix of the
   final writeup).
2. Export the exact dev database used for the study **without user data**
   (or use a synthetic evidence set as in §3).
3. Record OSV snapshot date (`modifiedAt` range shown in the UI).
4. Run migrations, seed nothing (schema only), build, and script the
   synthetic evidence registration exactly as listed in §3.
5. Publish task scripts, scoring rubric, analysis notebook/script, and raw
   timing data alongside the paper/report.

## 10. Current status

Nothing has been run or measured. All numbers like "162 findings" describe
the demo database, not the study. When this is executed, replace §10 with:
setup description, participant demographics, results tables, limitations, and
the statement that review for novelty was completed per §8 — or withdraw any
novelty framing and say "we evaluated an integration".
