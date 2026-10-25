# Handoff — lane 1 tick 2026-10-22 16:20 → COLLAPSE-1 fix-run HARD motion (RED commit d642e8c4 15:22); gemini-id evidence-debt CLEARED first-hand (EQP-PLATE-READER derivable); AS-258 second witness — 58th

Author: orchestrator cron tick l1t1620 — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 untouched this tick.

## Reconcile (first-hand)

- CODER ALIVE WITH HARD MOTION: hermes 691973 under queue-unit bash 302236 (fleet-lock
  holder; pid-file INSTR-COLLAPSE-1-FIX1(l1t1130) acquired 13:55:14). At 15:23: runner
  3h52m / hermes 1h26m, CPU 08:49 accruing, state.db mtime 15:15:32. FIRST FIX COMMIT
  LANDED: d642e8c4 15:22:03 "FIX-1 defect 1 RED" — new
  server/src/compiler/artifacts/InstrumentApplianceJobContract.test.ts (+196) asserting
  instrumentRef {type: equipment, id: EQP-PLATE-READER}, real sidecar-contract +
  measurement-schema + store.create end-to-end, and capability-gate ACCEPT via
  ECP-PLATE-READER VERB-READ. Worktree otherwise clean; report
  instr-collapse-1-fix1-report-l1t1130.md still ABSENT (RED-first, ~1.5h in; cycle-1
  trajectory ~4h). NOT dead, NOT due for escalation. DO NOT re-dispatch, DO NOT adopt.
- WAITER HEALTHY: 440019 (2h56m), watching runner 302236; fires cycle-2 adv review
  (logs/advreview-instrcollapse1-cycle2-l1t1330.log, log shows only WAITER START —
  not yet fired). Survives tick exit.
- GEMINI-ID CROSS-CHECK COMPLETED (handoff-57 checklist item 1, pre-cleared): the coder's
  chosen id EQP-PLATE-READER IS derivable from declared seed data —
  records/seed/equipment/eqp-plate-reader.yaml (kind: equipment; keywords plate reader /
  fluorescence reader / multi-mode reader), records/seed/equipment-capability/
  ecp-plate-reader.yaml binds verbRef VERB-READ, and grep -ri gemini records/seed = 0
  hits (no gemini-named equipment record exists; eqp-quantstudio5 is the qPCR machine,
  wrong device for a plate reader). The test additionally gates acceptance on the DECLARED
  ECP capability binding, not free text. Recorded AS-ORCH-L1-259; residual evidence-debt:
  at self-verify confirm the capability-gate ACCEPT test actually exercises the
  ECP-PLATE-READER declared binding (not a stubbed gate).
- AS-258 SECOND WITNESS (trunk-served :5192, this tick): /event-editor bare redirect to
  the STU-scratch project workspace CONFIRMED again in a live browser load; /labware/...
  is 404; main.tsx gates the LabwareEventEditor mount behind
  ?screen=labware-editor&fixture= (App.tsx routes /event-editor/:id to EventEditorPage,
  not the graph panel). Dead-mount posture stands: post-merge gate re-probe on the merged
  build FIRST (handoff-55 shape), never a fake selector pass.
- Trunk 61385f7a (docs-only tip = 1705 handoff). Worktree clean except M pnpm-lock.yaml
  (AS-ORCH-L1-248) + pre-existing untracked spec drafts.
- Pins unchanged: fail-FILE baseline 89 @ 2d1f3ff7; tsc pins handoff-54 (server 0,
  app delta-0/24 both sides).
- Lane stack :3092 200 / :5192 200. Decision watch 2026-10-21_qms8c-cleanbreak-decision.md
  md5 8b67f579a7029913ba9151cd4f099e51 UNCHANGED — not re-asked. No open Brad asks.
- Fleet: lock OURS (this fix-run). No lane-1 coder dispatch possible or needed. Scout
  slot free; gemini-id question answered by first-hand inspection (cheaper than a scout).
  No spec-composer commissioned (COLLAPSE-2 is the next item and is already promoted +
  re-pinned; nothing after it in this wave — not invented).

## Queue state

INSTR-COLLAPSE-1 in-progress — fix-run LIVE with RED commit for defect 1; cycle-2 gate
armed via waiter. INSTR-COLLAPSE-2 todo — dep COLLAPSE-1 merge; claim_repin_20261022T1540
stands. No other todo items; nothing invented. Reason appended to no-work.log (no
dispatch slot: fleet-single, lock is our own live run).

## NEXT TICK checklist

1. Reconcile coder 691973 / unit 302236 / report file / waiter 440019.
   Report STATUS: complete + waiter fired: read cycle-2 review
   (logs/advreview-instrcollapse1-cycle2-l1t1330.log; report path inside).
   VERDICT accept -> orch self-verify per handoff-55 checklist (server tsc, fail-FILE
   comm-empty vs 89-pin, spec greps, defect-1 end-to-end proof re-checked by eye —
   gemini-id derivability PRE-CLEARED this tick as AS-ORCH-L1-259; remaining check:
   the capability-gate ACCEPT test drives the REAL declared ECP-PLATE-READER binding,
   plus the reviewer's demanded raw before/after of
   MeasurementHandlers.applianceJob.test.ts), merge --no-ff, YAML shipped => stack
   restart, browser gate re-probe first (gate-reach protocol handoff-55 + second
   witness above; AS-258 dead-mount debt OPEN).
   VERDICT fix -> cycle 2 exhausted (fix-run IS cycle 2); route to architect with
   evidence packet (unique decision path).
   Coder DEAD without report (pid gone AND no motion across a tick): resume per
   queue-instr-collapse-1-fix1 brief, suffix -retry1, flock re-acquire. Runner ~5h at
   next tick — the two-tick no-motion rule still governs (hard motion witnessed twice).
2. After COLLAPSE-1 merges: CLAIM INSTR-COLLAPSE-2 (fleet lock + queue lock; branch off
   post-COLLAPSE-1 trunk; fold claim_repin_20261022T1540 + the 3 extra surfaces into the
   dispatch brief; correct the spec's verb-read.yaml:6 / OwnershipPolicySchema cites at
   claim per the re-pin block; note the re-pin's gemini finding is now CONFIRMED and the
   fix-run settled the target at EQP-PLATE-READER — C4 instrument-log fixture retargets
   should follow the same id convention where the flow is the gemini plate reader).
3. Follow-ups (unchanged): AS-ORCH-L1-236 open (narrowed); F-1 residual;
   engine-initial-state fallback + LifecycleHandlers.ts:58 literal;
   ProtocolCompileMonolithPass OBS-B; pnpm-lock.yaml (AS-ORCH-L1-248);
   AS-253 posture stands (clean); fixture-screen LabwareEditorProvider crash +
   RunEditorRouter unrouted (in the gate-reach decision; second witness this tick);
   AS-258 OPEN.

## assumptions:

New this tick:
- AS-ORCH-L1-259: gemini appliance equipment-ref target EQP-PLATE-READER derivable from
  declared seed data (eqp-plate-reader.yaml + ecp-plate-reader.yaml VERB-READ binding;
  no gemini-named record in seeds). Evidence-debt: at self-verify confirm the fix's
  capability-gate ACCEPT test exercises the real declared ECP binding, not a stub.

Carried open (unchanged): AS-ORCH-L1-258 (dead-mount re-probe debt, OPEN — second
witness this tick, still trunk-served); 042; 082; 087 PARTIAL; 088; 089; 096; 097; 099;
101; 119; 137 residual; 154; 201; 206; 209; 210; 211; 212; 217; 218; 219; 221; 227; 228
(historical); 229; 230; 236 (OPEN, narrowed); 238; 239; 240; 241; 242; 243; 247; 248;
249 (superseded by heal); 250; 251; 252; 253; 254 (superseded by 256); 255 (in force);
256; 257.

## live-worker checkpoint (budget expiry state)

- FLEET CODER (MINE): cl-coder fix-run hermes 691973 under queue unit 302236 (lock
  holder). Fleet lock releases when 302236 exits. Alive with hard motion at 15:23.
- WAITER (MINE): 440019, survives tick exit.
- No browser gate live; no new dispatches this tick.
- Lane stack :3092/:5192 200/200 (mine). Brad's :3001/:5174 not touched.
- Trunk 61385f7a + this handoff commit; clean except M pnpm-lock.yaml.
