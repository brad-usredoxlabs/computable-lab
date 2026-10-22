# Handoff — lane 1 tick 2026-10-22 01:30 → OQ-1 DECIDED (architect landed) + INSTR-COLLAPSE-1 spec PROMOTED (C1+C2) + INSTR-COLLAPSE-2 authored + QMS8-C coder LIVE mid-C3 — 39th

Author: orchestrator cron tick l1t0130 — lane 1 only. :3001/:5174 never touched.
All git via -c core.fileMode=false. Budget 01:20→~02:05. No new paid model dispatch this
tick (the architect landed its decision before this tick began).

## Reconcile (first-hand)

1. QMS8-C resume coder pid 2741415 ALIVE (unit cl-l1-qms8c-resume-2355 active, fleet lock
   pid-file QMS8C-RESUME(l1t2355) pid:2741402 alive), 1h28m elapsed vs 2-4h expected —
   2x-action NOT due. PROGRESS VERIFIED FIRST-HAND (not the log, which is one-shot-quiet):
   branch cl/lane1-qms8c-l1t2205 commits d2bc77cb C1 RED 00:40, 5ea6c38f C1 GREEN 00:44,
   43094e4a C2 RED 01:03, 576d9c6f C2 GREEN 01:06, 27b62fb1 C3 RED 01:13; files touched
   after 01:10 (EquipmentHandlers, domainStatusFlip.test, ExecutionOrchestrator,
   ProtocolCompiler, OperationalAdmissibilityService, capabilityAuthorization). Healthy
   forward motion. Report qms8c-report-l1t2205.md not yet written = expected mid-run.
   DO NOT touch, DO NOT duplicate.
2. Architect OQ-1 run: EXITED (pid gone) having LANDED the decision —
   .hermes/plans/2026-10-22_instr-collapse-oq1-capability-gate-decision.md, 149 lines,
   STATUS: decided. DECISION: shape (a) refined — schema-side `x-capability-gate` annotation
   on the equipment ref slot + ONE generic TS validator (DeclaredCapabilityGate.ts) with
   name-registered verb resolvers (sibling-verb-ref for planned-run steps; read-event-verb
   for measurements via event-graph semanticKeyComponents.verb -> verb-definition byCanonical).
   No TS verb literal (H2 satisfied); fail-closed on unresolvable verb. Load-bearing cites
   spot-checked first-hand by the tick: planned-run CompiledProtocolStep verbRef :412-413
   beside equipmentRef :421-422 CONFIRMED; event-graph semanticKeyComponents.verb :429-431
   CONFIRMED (canonical lowercase name string); measurement readEventRef :34-36 CONFIRMED;
   ContextBuilder x-jsonld annotation precedent :154 CONFIRMED; ProtocolCompiler
   resolveVerbDefinitions byCanonical :317-334 CONFIRMED; CapabilityResolutionRequest
   {equipmentId, verbId, methodId?} :186-190 CONFIRMED.
3. ESM-DIRNAME-1 and all prior items: closed. No due blockers (cheap gate: dash).
   Honest-create watch-path md5 8b67f579 UNCHANGED — answered by supersession, not re-asked.
4. Lane stack :3092/:5192 both http=200 (status check only; coder holds it read-only per
   brief). Trunk HEAD 7622e600 (docs-only since prior tick).

## INSTR-COLLAPSE-1 — spec PROMOTED (C1+C2 scope)

- Promoted to canonical: .hermes/plans/2026-10-22_INSTR-COLLAPSE-1-contract-as-data-spec.md
  with binding PROMOTION BLOCK P1-P4: P1 scope = C1+C2 only (C3/C4/C5 become
  INSTR-COLLAPSE-2); P2 the OQ-1 decision is binding for C2 (validator, resolvers, wiring
  points, reject codes, RED-test shape incl. reject-kind-correct-no-binding + RIP-OUT proof,
  R1/R2/R3 rules); P3 OQ-2/OQ-3 KEEP blessings recorded closed; P4 the ref.schema.yaml
  path-cite correction (schema/CORE/datatypes/). Stop boundary 3 marked resolved;
  trailing STATUS changed to promoted-canonical.
- Coder dispatch of INSTR-COLLAPSE-1 remains GATED on QMS8-C merge (fleet coder single
  slot + deps [QMS8-C]). At claim time: re-pin first-targeted-check step 0 against post-
  QMS8-C trunk (the spec's rebase note + reviewer-bait 8 anticipate the drift).
- Task list: spec path linked; QMS8-C tick_reconcile_20261022T0130 appended.

## INSTR-COLLAPSE-2 authored

New task block (id INSTR-COLLAPSE-2, status todo, deps [INSTR-COLLAPSE-1]): C3 deletion +
C4 TS residue + C5 derived measurement-capable filter + browser gate. Execution
decomposition of the SAME approved ruling (AS-ORCH-L1-238 already blessed the split; this
tick merely authored the block). No new intent.

## QMS8-C — next-tick checklist (unchanged core, refined)

1. Coder exit (EXITED line in logs/coder-QMS8C-l1t2355-resume.log or pid gone) + report
   STATUS: complete -> FIRE queue-advreview-qms8c-cycle1.sh (PRE-STAGED this tick with
   guards: refuses while lock names QMS8C-RESUME(l1t2355) pid alive, refuses without
   STATUS: complete; report -> advreview-qms8c-l1t0130.md).
2. ACCEPT -> orch verify: real diff, vitest deltas vs artifacts/QMS8-C/
   baseline-targeted-l1t2205-repaired.txt (AS-ORCH-L1-237 adopted baseline), raw-tsc delta,
   grep proofs (no 'Instruments & Equipment' in app/src; no state??status fallback).
3. MERGE --no-ff -> runtime apply-lap: dry-run -> --apply via
   CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml -> re-dry 0 planned ->
   RESTART (cl-lane-stack.sh 1 restart, background=true — blocking script; C1 ships YAML)
   -> re-probe :3092 = closes AS-ORCH-L1-232.
4. Browser gate LAST (spec verified-by 5), tier-1 cl-browser-reviewer, receipts
   ~/.hermes/cl/receipts/QMS8-C/<ts>/.
5. Then claim INSTR-COLLAPSE-1 (spec above): fleet lock acquire, worktree add backgrounded,
   dispatch, + spec-composer for INSTR-COLLAPSE-2 in the same tick.
   2x-action due ~02:00 ONLY if zero log/commit motion; check state.db sessions before
   blaming freeze; systemd-run survivor proved durable last run.

## assumptions:

New: none beyond AS-ORCH-L1-239 below.
- AS-ORCH-L1-239 (this tick): the 20-line uncommitted addendum already sitting in
  .hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md (honest-create resolved by
  supersession, 19:15 ruling text) is prior-tick lane durable record, not foreign work —
  committed as-is this tick. Reversible (docs-only commit).
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101;
119 (+post-QMS76 ext); 137 residual; 154; 201 (posture-watch); 206; 209; 210; 211; 212;
217; 218; 219; 221; 227 (VPDF-4 fail-branch unit-only posture); 228 (historical, keep);
229; 230; 236 (evidence debt — clears on a no-draft button click in any later gate); 237
(QMS8-C adopted REPAIRED baseline — operative); 238 (collapse split + OQ2/OQ3 blessings —
now additionally embodied in the promoted spec's P1-P3).
Closed: 234, 235 remain closed. AS-ORCH-L1-232 STILL OPEN (closes with the QMS8-C C1-merge
apply-lap receipts).

## live-worker checkpoint (budget expiry state)

- cl-coder pid 2741415 / unit cl-l1-qms8c-resume-2355: LIVE since 23:54, owner of
  wt/QMS8-C-lane1-l1t2205 + fleet lock; mid-C3 (C1/C2 committed GREEN); do not kill, do not
  duplicate.
- No other lane-1 workers (architect exited with its deliverable landed).
