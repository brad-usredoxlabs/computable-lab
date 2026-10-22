# Handoff — lane 1 tick 2026-10-22 14:05 → COLLAPSE-1 fix-run still queued (lane-2 holder ALIVE w/ motion); code-track merge pins captured FIRST-HAND (server tsc 0, app tsc delta-0); gate flow reachability probed — 54th

Author: orchestrator cron tick l1t1325 — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 not touched this tick.

## Reconcile (first-hand)

- NO live lane-1 coder. INSTR-COLLAPSE-1 fix-run queues correctly: unit
  cl-l1-coder-instrcol1-fix1-l1t1130 (bash 302236 + flock 302245), log
  logs/coder-INSTRCOLLAPSE1-fix1-l1t1130.log QUEUE-WAIT since 11:28, no LOCK-ACQUIRED
  (verified again 13:45: FLEET-LOCK-STILL-HELD). Do NOT duplicate.
- Fleet lock legitimately held by lane-2 MIXFRAC1-RESUME3: hermes pid 248693 (queue
  3900290) alive 2h38m; its worktree /mnt/vast/home/brad/git/wt/MIXFRAC-1-lane2-l2t0310
  shows fresh writes (compositionFractions.ts/.test.ts, goldens, MANIFEST.yaml modified
  set growing; branch merge commit 5e6c1257) = genuine forward motion, not a hang.
  Escalation window per handoff-52 (~14:30 if our queue still has no lock) NOT yet due at
  13:45 — next tick decides.
- Cycle-2 adversarial waiter healthy: cl-l1-wait-adv-instrcol1-c2-l1t1330 pid 440019
  (started 12:24, watching 302236, fires on "STATUS: complete" in
  instr-collapse-1-fix1-report-l1t1130.md, stands down on blocked/requires-rescope).
  Prompt file advreview-instrcollapse1-cycle2-l1t1330.txt verified on disk (cycle-1
  defect close-out mandate embedded).
- COLLAPSE-1 branch cl/lane1-instr-collapse-1-l1t0755 @ 940ef3bd (pre-fix; fix commits
  land on top). Branch worktree clean except node_modules symlinks.
- Lane stack :3092 / :5192 both 200. Trunk d3006495 (docs-only since 2d1f3ff7; baseline
  pin at 2d1f3ff7 still valid for fail-FILE diffing — 2d1f3ff7 itself is docs-only vs
  its parent). Clean except M pnpm-lock.yaml (AS-ORCH-L1-248). AS-253 dangling check:
  worktree-vs-HEAD diff empty — CLEAN.
- Decision watch 2026-10-21_qms8c-cleanbreak-decision.md md5 8b67f579 UNCHANGED — not
  re-asked. No open Brad asks.

## Code-track merge pins — captured FIRST-HAND this tick (new)

- SERVER tsc on branch HEAD (dad6bbdc..940ef3bd + none yet): `npm run typecheck -w
  server` EXIT 0 — raw artifacts/INSTR-COLLAPSE-1/TSC-head-server-l1t1325.txt.
- APP tsc branch vs trunk, first-hand both sides: branch 24 "error TS" lines, trunk 24;
  comm diff NEW=0 GONE=0 (identical pre-existing baseline set). Raw
  TSC-head-app-l1t1325.txt + TSC-trunk-app-l1t1325.txt. (App tsc stays red at baseline
  24 — NOT the 23 cited at f8f49dc1; both sides equal, so delta-0 is the passing test.)
- Scope-creep grep: diff touches NO instrument.{schema,lint,ui}.yaml, no registry-kinds
  entry deletion (C3+ territory untouched) — C1+C2 boundary holds at current HEAD.
- Residual type:'instrument' producer: still exactly InstrumentApplianceJob.ts:126 —
  the cycle-1 BLOCKER the queued fix-run must retype. Cycle-2 reviewer prompt already
  mandates the probe.
- Full-suite fail-FILE baseline pin from handoff-53 stands: 89 fail-files @ 2d1f3ff7
  (artifacts/INSTR-COLLAPSE-1/SUITE-base-failfiles-l1t1245.txt, 89 entries + SUITE-DONE).

## Browser-gate groundwork (orch-route prep, this tick)

- The C1+C2 diff touches 9 app files (MeasurementSetupPanel, ReadPlateModal,
  ReadoutContextPanel, MeasurementContextList, RoleAssignmentPanel, client.ts,
  useBiologyMode, useResultsMode, ReuseAuthoringPanel). MeasurementSetupPanel mounts via
  ReadoutContextPanel <- LabwareEventEditor.tsx:3740 (deep in /event-editor/:eventGraphId).
- Reach probe on trunk-served :5192: /event-editor (no id) REDIRECTS to
  /project/STU-scratch (chrome renders, 4 benign 404s). Gate script must navigate via a
  real event-graph id (lane has EVG-API-* spec-first + EVG-PDT-* adipogenesis graphs) or
  assert the C1 evidence at the surfaces the diff actually changes: measurement-context
  create form shows an EQUIPMENT selector sourced from /api/records?kind=equipment
  (verified 200, EQP-QUANTSTUDIO5 + EQP-NEW-7LS1 exist in the lane store;
  ECP-QUANTSTUDIO5 referenced from EQP-QUANTSTUDIO5 record).
- NOTE for the post-merge gate: criteria (4)/(6) verbatim reference C3/C5 surfaces
  (kind deletion, derived filter view) that belong to COLLAPSE-2 — the COLLAPSE-1 gate
  judges what C1+C2 ships (equipment-ref measurement setup renders + persists, no broken
  instrument selector); C3/C5 claims move to COLLAPSE-2's own gate. Recorded here so a
  future tick does not weaken or over-reach the criteria.

## Queue state after this tick

INSTR-COLLAPSE-1 in-progress (fix-run queued, cycle-2 waiter armed, tsc pins in hand).
INSTR-COLLAPSE-2 todo (spec promoted; deps COLLAPSE-1 merge + fleet slot). No other todo
items; no spec-composer commissioned (no next item in this wave — do not invent one).

## NEXT TICK checklist

1. If our fix-run queue acquired the lock (LOCK-ACQUIRED in
   logs/coder-INSTRCOLLAPSE1-fix1-l1t1130.log): reconcile coder motion via
   wt/instr-collapse-1-lane1-l1t0755 git log + report file. If STILL queued past ~14:30
   with the lane-2 holder alive: escalate to lane 2 per SOUL 7b (handoff note naming
   queue pid 3900290 holder + our FIFO wait since 11:28) — do not kill anything. If the
   queue-runner died while queued: re-arm (new unit, same brief
   prompts/coder-instr-collapse-1-fix1-l1t1130.txt, log suffix -retry1).
2. On cycle-2 VERDICT: accept -> orch self-verify: re-run server tsc on post-fix HEAD
   (pre-fix pin = exit 0 this tick; any NEW errors go back as defects), head fail-FILE
   set comm-empty vs the 89-file pin, spec greps + curl proofs, merge --no-ff, YAML
   shipped => stack restart, browser gate via orch-authored route using THIS tick's
   reach findings, receipts /home/brad/.hermes/cl/receipts/INSTR-COLLAPSE-1/, mark done,
   handoff. VERDICT: fix -> fix cycle 2 of max 2 (unique paths); 3rd -> architect packet.
3. After COLLAPSE-1 merges: CLAIM INSTR-COLLAPSE-2 (fleet lock + queue lock; spec
   2026-10-22_instr-collapse-2-kind-deletion-spec.md — RE-PIN every file:line at claim;
   branch off post-COLLAPSE-1 trunk; the fix-run's retypes shift line numbers).
4. Follow-ups (unchanged): AS-ORCH-L1-236 open (narrowed); F-1 residual; engine-initial-
   state fallback + LifecycleHandlers.ts:58 literal; ProtocolCompileMonolithPass OBS-B;
   pnpm-lock.yaml reconciliation (AS-ORCH-L1-248); AS-ORCH-L1-253 posture check on
   re-sync (this tick: worktree clean vs HEAD).

## assumptions:

New this tick: none.
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099;
101; 119; 137 residual; 154; 201; 206; 209; 210; 211; 212; 217; 218; 219; 221; 227; 228
(historical); 229; 230; 236 (OPEN, narrowed); 238; 239; 240; 241; 242; 243; 247; 248; 249
(superseded by heal); 250; 251; 252; 253; 254 (superseded by 256); 255 (in force); 256;
257.

## live-worker checkpoint (budget expiry state)

- FLEET CODER (lane 2's, not mine): MIXFRAC1-RESUME3 hermes pid 248693, alive w/ motion
  13:45, holds fleet lock since 11:07 behind queue 3900290. My fix-run queues behind it.
- MY QUEUE: unit cl-l1-coder-instrcol1-fix1-l1t1130 (bash 302236, flock 302245).
- WAITER (MINE): cl-l1-wait-adv-instrcol1-c2-l1t1330 pid 440019, survives tick exit.
- No browser gate live. No new dispatches this tick (fleet lock held; no coder-able
  independent item).
- Lane stack :3092/:5192 200/200 (mine). Brad's :3001/:5174 not touched.
- Trunk d3006495 + this handoff commit; clean except M pnpm-lock.yaml.
