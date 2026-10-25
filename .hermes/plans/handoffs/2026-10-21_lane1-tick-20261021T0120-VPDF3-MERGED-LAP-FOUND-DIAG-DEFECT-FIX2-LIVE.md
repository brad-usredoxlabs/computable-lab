# Handoff — lane 1 tick 2026-10-21 01:20 → VPDF-3 MERGED (b42b2ca8) · LIVE LAP FOUND A REAL DEFECT → FIX2 LIVE · BROWSER GATE LIVE · QMS8-C PROVISIONAL POSTED

Author: orchestrator cron tick l1t0040 — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## Reconciliation (first-hand)

- ADV RE-REVIEW (cycle 2) ACCEPT: receipts/VPDF-3/advreview-vpdf3-l1t0020-fix1.md
  (VERDICT: accept, 0 defects; reviewer ran its own D1a/D1b/D2 mutation controls,
  all RED where required, tree restored). Reviewer pid 3471559 gone, report
  complete — adopted.
- ORCH VERIFICATION of fix1 e6cb5e90 MYSELF: git show read (3 files +180/-6, the
  D2 create-conflict fallback re-lists the winner and updates in place — no
  kind-string branch); own run of the 3 suites from server/ -> 23/23 green; own
  server `tsc -p tsconfig.json --noEmit` -> exit 0.
- MERGED: cl/lane1-vpdf3-l1t2145 -> cl/integration-1 @ b42b2ca8 (no-ff, clean,
  branch descended from trunk 9a51c1f2; 15 files +1475/-54).
- STACK RESTART INCIDENT (lane-1 only): the cl-lane-stack.sh restart raced — the
  old tsx (3523469) kept :3092, the new one EADDRINUSE'd into
  "Waiting for file changes", and the script's start-wait loop wedged holding the
  pid-file. Orch fix: killed the restart script + lane port holder, removed the
  stale backend.pid, `cl-lane-stack.sh 1 start` (background). Backend 200,
  `.run/backend.log` prints Data dir: /home/brad/.computable-lab-lane1, zero
  EADDRINUSE after. PITFALL FOR BRIEFS: after a restart, VERIFY :3092 is served by
  the NEW pid (ps lstart vs port holder) before trusting it as post-merge.
- LIVE verified-by(4) LAP FOUND A REAL DEFECT: POST /api/protocol-builder/extract-
  stream (real deepseek profile ds-4v.1-flash-1017) on VPDF-6C821D307E98:
  chunk-done parsed:true steps:9, then
  {"type":"error","message":"Extraction succeeded but the candidate could not be persisted: Validation failed"}.
  REFUSED to mark done. ROOT-CAUSED FIRST-HAND: pulled the model's real merged
  candidate via the blocking /protocol-builder/extract endpoint, ran
  adaptAiChunkCandidateToRecordPayload + Ajv2020 against the real
  vendor-protocol-candidate.schema.yaml -> /diagnostics/0..4 "must be object": the
  model emits diagnostics as BARE STRINGS; mergeChunkResults copies them verbatim
  (ProtocolBuilderHandlers.ts ~:577); the adapter spreads them straight into the
  payload; the schema requires {severity,code,message}. So EVERY real-model
  extraction fails the persist leg — the unit suites missed it because every stub
  emitted object-shaped diagnostics. (A first lap on the 12k-char scraped PureLink
  text legitimately failed to parse at all (NO_CONTENT, honest error event) — that
  is VPDF-4's known chunk-completeness failure family, NOT this defect; the
  persist defect reproduced with a compact 9-step text.)
- FIX RUN 2 DISPATCHED ~01:05 under the fleet lock (flock -n acquired; pid-file
  holds 3600131, coder 3600132): brief briefs/coder-vpdf3fix2-l1t0105.txt —
  adapter-only diagnostics-shape normalization (string/object/malformed ->
  schema-legal objects, MODEL_DIAGNOSTIC default code, no schema loosening, no
  kind branch), RED-first against e6cb5e90, mutation proof, then coder-runs-its-own
  live re-lap incl. lane restart. Log logs/coder-VPDF3fix2-l1t0105.log, report
  vpdf3-report-l1t2145b-fix2.md. Due-check 02:00, 2x ~03:00.
- BROWSER GATE (verified-by 5) FIRED ~01:15 at tier 1, deliberately BEFORE fix2
  can heal the ghost ref: pid 3605852, brief briefs/browsegate-vpdf3-l1t0115.txt
  (criteria (5) verbatim: "Extract candidate" label; graph-lemur ghost honest on
  VPDF-6C821D307E98; no dead intake sentence without affordance; N/A-with-evidence
  escape if a candidate got persisted). Due-check ~01:45; if it dies/hangs past
  2x -> tier ladder (tier 2 = same profile on OpenRouter deepseek-v4.1-flash).
- QMS8-C (rule 7b, composer 3x+ at 3h05m, 0-byte log, no draft): orch wrote the
  PROVISIONAL decision framing .hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md
  with live recon (0 instruments; 38 equipment ALL carry status — 22 active+active,
  10 active+draft = the false-claim class, 6 active+archived; fallback live at
  lifecycleMiddleware.ts:38-39; equipment.schema.yaml:16 REQUIRES status; all 38
  already carry migrated states -> forward migration is strip-only). Structured
  human question posted: clean-break (A, recommended) vs tolerated-legacy (B) —
  watch path named in the file and the task block. Silence != approval; never
  re-ask unchanged. Composer pid 3097377 LEFT ALIVE (not killed); if its draft
  lands, reconcile against the provisional.

## ADDENDUM at 01:35 (same tick) — BROWSER GATE attempt 1: self-reported ACCEPT but INCOMPLETE EVIDENCE (not a pass)

The tier-1 gate (pid 3605852) exited ~01:26 with a 522-byte log reporting
VERDICT: accept on all four criteria — BUT the receipts dir
/home/brad/.hermes/cl/receipts/VPDF-3/gate-20261021-052600/ contains ONLY
report.md: NO trail.json and NO screenshots, despite the report citing
01-button-label.png / 02-ghost-ref.png / 03-affordance.png. A verdict without
trail+screenshots is not a gate pass (standing reviewer-reliability rule;
false-accept-on-stale-screenshots precedent). Corroboration the claims are
plausible: the report pins revision b42b2ca8 + backend 200 + the ghost ref
(graph-lemur-6c821d307e98), matching MY OWN first-hand GETs; the criteria texts
match the merged accepted code. NOT absorbed as evidence nonetheless.
NEXT TICK: re-shot at tier 2 per the ladder (cl-browser-reviewer profile with
-m deepseek/deepseek-v4.1-flash --provider openrouter), brief
briefs/browsegate-vpdf3-l1t0115.txt AMENDED to make trail.json+screenshots
hard-required outputs in the named dir; or the orch Playwright route with
orch-judged artifacts (record the judge). Attempt-1 tier: qwen35-4b-vision tier 1.
TIER 2 FIRED 01:41 same tick (budget checkpoint): pid 3631831, brief
briefs/browsegate-vpdf3-tier2-l1t0140.txt (trail+shots HARD-required with on-disk
size check), log logs/browsegate-vpdf3-tier2-l1t0140.log, receipts gate2-<ts>.
Due-check next tick ~02:15; 2x ~02:50 -> then orch Playwright route.

## QUEUE STATE at checkpoint

- VPDF-3 in-progress — merged for code, but verified-by(4) is NOT green until
  fix2 lands and the live lap reaches a persisted CAN-* end-to-end. Two live
  workers: fix2 coder (fleet lock holder) + browser gate. Task done only when:
  fix2 adv-reviewed + orch-verified + merged, live lap green, browser VERDICT:
  accept with receipts.
- VPDF-4 todo — queue-vpdf4-l1t2255.sh fires ONLY after the fix2 merge (it takes
  the fleet lock itself and builds its worktree off post-merge trunk).
- QMS8-C todo — blocked on Brad (A vs B) at the watch path.

## NEXT TICK CHECKLIST

1. RECONCILE fix2: report vpdf3-report-l1t2145b-fix2.md + log. If complete:
   adversarial review of the fix2 commit (focused: adapter normalization +
   RED/mutation evidence + the live-lap file vpdf3fix2-live-lap-l1t0105.txt —
   spot-check the CAN-* by GET yourself). ACCEPT -> orch verify (suites from
   server/, tsc, own GET of the CAN-* + ref check on :3092) -> merge into
   cl/integration-1 (NO YAML expected; restart only if YAML touched — then
   verify :3092 is the NEW pid). THEN `bash queue-vpdf4-l1t2255.sh`
   background=true.
2. RECONCILE the browser gate: latest dir under receipts/VPDF-3/ matching
   gate-*. VERDICT accept -> fold into the done record. VERDICT fix -> defect
   list with absolute screenshot paths back to the fix2 coder lane (new run,
   same worktree if fix2 already exited). Dead/hung past 2x -> tier 2
   (cl-browser-reviewer profile, -m deepseek/deepseek-v4.1-flash --provider
   openrouter) or the orch Playwright route; record the tier.
3. Only when BOTH are green: mark VPDF-3 done (status + outcome + verified
   stamps), handoff, assumptions entries (esp. AS-ORCH-L1-217 carried; add the
   new model-diagnostics-shape assumption once fix2 lands).
4. QMS8-C: check the watch path for Brad's answer; if answered, spec from it; if
   not, DO NOT re-ask; if the old composer draft finally landed, reconcile.
5. If fix2 died mid-flight: adopt-or-resume per the death rules (log motion +
   commit presence decide); its worktree is the same VPDF-3 worktree.

## CARRIED (not blocking)

- VITEST PATH PITFALL (app from app/, server from server/) — now in the fix2 brief.
- NEW PITFALL: lane restart port race (see above) — verify serving pid after restart.
- NEW BRIEF REQUIREMENT (from today's defect): persist-path unit stubs must feed
  model-shaped (not schema-shaped) diagnostics; a stub that emits pre-normalized
  input hides the adapter's whole job. VPDF-4's brief should inherit this.
- O3 observation (candidate diagnostics render gap) — the fix2 normalization keeps
  diagnostics as objects, which HELPS that future intake; still not absorbed.
- server tsconfig excludes **/.test.ts (raw tsc on changed test files = brief demand).
- Registry layout posture at narrow widths (AS-ORCH-L1-201) → future intake.
- app/tsconfig lacks exactOptionalPropertyTypes — spec-template housekeeping.
- POST /api/vendor/exa/search 502s from the term picker (console-clean caveat).
- LabSettingsHandlers 2 failures = lane-exclude symlink artifact; AuditEventService
  "signature-ref validation" 1 failure = pre-existing trunk debt — do not chase.
- POL-SANDBOX resting bundle; test data lives per A4.
- QMS8-A fix2 polish notes → future polish. Reviewer harness: orch Playwright route proven.

## assumptions

New this tick: AS-ORCH-L1-218 — the diagnostics-shape normalization seam is the
ADAPTER (not the schema, not mergeChunkResults): candidate-shape normalization is
the adapter's declared job; the schema stays document truth; default code
MODEL_DIAGNOSTIC is a shape filler, not domain vocabulary. Interpretive call by
the orch while writing the fix brief; adversarial review will confirm. Evidence
debt: none added (live lap + repro files named).
AS-ORCH-L1-219 — browser gate fired on the CURRENT VPDF-6C821D307E98 ref state is
valid evidence for criterion 3 even if fix2's later live lap heals the ghost ref
(first-hand: ref still graph-lemur at 01:10 GET; gate brief carries the
N/A-with-evidence escape).
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097;
099; 101; 119 (+post-QMS76 ext); 137 residual; 154 (interpretive only); 201
(posture-watch only); 206; 209; 210; 211; 212; 216; 217.
Evidence debt: AS-ORCH-L1-216 OPEN — W25 rows green in orch runs + fix1; closes
only when fix2 merges AND the post-fix2 live lap + browser gate pass; carried.

## decisions md5 sweep (unchanged)

L1-qms-field-defects-ruling-20261010.md = 1f41d8818f8864410281a79f5a40fb75
L1-wave3-followup-rulings-20261017.md = dcc03382b945287ce804bbab2518a810
