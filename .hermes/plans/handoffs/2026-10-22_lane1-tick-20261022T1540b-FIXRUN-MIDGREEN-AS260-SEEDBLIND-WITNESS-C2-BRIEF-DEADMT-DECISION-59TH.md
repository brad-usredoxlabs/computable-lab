# Handoff — lane 1 tick 2026-10-22 15:40b → COLLAPSE-1 fix-run mid-GREEN (producer edit + defect-2 test on disk); AS-259 evidence-debt LIVE with first-hand failing-test witness (seed-blind tmp store); COLLAPSE-2 brief staged; dead-mount gate decision request raised — 59th

Author: orchestrator cron tick l1t1540b — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 untouched this tick.

## Reconcile (first-hand)

- CODER ALIVE WITH HARD MOTION: hermes 691973 under queue-unit bash 302236 (fleet-lock
  holder; pid-file INSTR-COLLAPSE-1-FIX1(l1t1130)). At 15:41: runner 4h12m / hermes 1h46m,
  CPU 11:10 accruing (was 08:49 at 15:23 — ~2.5 CPU-min/min), state.db mtime 15:40:03.
  Worktree beyond RED commit d642e8c4: M InstrumentApplianceJob.ts (producer retarget
  landed: equipmentRecordId(), GEMINI_EM_EQUIPMENT_RECORD_ID='EQP-PLATE-READER',
  comment cites seed derivation), M 2 test files, NEW untracked
  server/src/measurement/MeasurementService.capabilityGate.test.ts (211 lines — defect-2
  write-path tests driving real MeasurementService.ingest, asserting ERROR CODES
  capability_gate_unsupported / capability_gate_verb_unresolvable, tmp CONFIG_PATH
  isolation per the binding ruling — no gemini.csv fixture, no durable-counter drift).
  Report instr-collapse-1-fix1-report-l1t1130.md still ABSENT (cycle-1 was ~4h; on
  trajectory). NOT dead, NOT due for escalation. DO NOT re-dispatch, DO NOT adopt.
- WAITER HEALTHY: 440019 watching runner 302236; its log shows WAITER START only —
  fires cycle-2 adv review (logs/advreview-instrcollapse1-cycle2-l1t1330.log) when the
  runner exits AND the report says STATUS: complete; stands down on blocked/rescope.
  Survives tick exit.
- ORCH SELF-VERIFY PRE-PARTIAL (NEW): ran the defect-1 contract suite read-only
  (`npx vitest run InstrumentApplianceJobContract.test.ts`, cwd server/, no worktree
  writes): 4/5 green — sidecar-contract validate, measurement-schema validate,
  store.create wall, fail-closed verb_unresolvable ALL PASS. The capability-gate
  ACCEPT test FAILS ON DISK: capability_gate_unsupported. ROOT CAUSE verified
  first-hand: the test's tmp store is createRecordStore WITHOUT seedDir
  (RecordStoreImpl.ts:56 default '', :524 seed merge only when seedDir set), so
  store.list({kind:'equipment-capability'}) never sees records/seed → the DECLARED
  ECP-PLATE-READER binding is invisible to the test harness. The binding itself is
  REAL: records/seed/equipment-capability/ecp-plate-reader.yaml binds
  verbRef VERB-READ; schema/registry/wave2-verb-adjudication.yaml:48 declares
  VERB-READ; ECP is class-bound via equipmentClassRef CL:plate_reader (EquipmentCapabilityService
  joins class capabilities by class-ref id — inventoryEquipmentCapabilities). AS-259
  resolved halfway: NOT a stub — but the ACCEPT assertion cannot pass until the coder
  wires seedDir or seeds the capability records into the test store. SELF-VERIFY
  OBLIGATION STANDING: ACCEPT green driven by the declared binding; assertion
  deletion/inversion = pin-weakening -> FIX. Recorded AS-ORCH-L1-260.
  CAUTION: the coder may still be iterating on exactly this (edit is in flight); do
  not preempt — the waiter fires the gate on completion regardless.
- COLLAPSE-2 PREP COMPLETE (pre-claim, item stays todo, dep = COLLAPSE-1 merge):
  dispatch brief with BOTH spec-cite corrections + all extra surfaces + gemini-id
  convention at ~/.hermes/cl/lanes/1/briefs/collapse-2-dispatch-brief-l1t1550.md.
  First-hand confirmations this tick: wave2-verb-adjudication.yaml:48 VERB-READ;
  verb-definition.schema.yaml:36 enum includes analytical_readout;
  ECP-PLATE-READER seed file contents read; registry-kinds file path corrected
  (schema/registry-kinds.yaml does NOT exist — find it at claim).
- AS-258 DEAD MOUNT: third posture unchanged (not re-probed; two witnesses stand).
  DECISION REQUEST RAISED (first time, structured):
  .hermes/plans/2026-10-22_instr-collapse-deadmount-gate-decision-request.md →
  answer at .hermes/plans/2026-10-22_instr-collapse-deadmount-gate-decision.md.
  Fallback stated: no answer by COLLAPSE-2's gate tick -> option A alone (boot-clean
  importing routes + live-surface criteria + dead-mount stays escalated), B unscoped.
- Trunk 12d2e422 (docs-only tip = 1620 handoff). Worktree clean except M pnpm-lock.yaml
  (AS-ORCH-L1-248) + pre-existing untracked spec drafts. Pins unchanged: fail-FILE
  baseline 89 @ 2d1f3ff7; tsc pins handoff-54.
- Lane stack :3092 200 / :5192 200. Decision watch 2026-10-21_qms8c-cleanbreak-decision.md
  md5 8b67f579a7029913ba9151cd4f099e51 UNCHANGED — not re-asked. No open Brad asks.
- Fleet: lock OURS (this fix-run, pid-file unchanged). No lane-1 coder dispatch
  possible or needed. Scout slot free; the two bounded questions COLLAPSE-2 needed
  were cheaper answered by direct inspection (schema greps) than a scout slot — done.
  No spec-composer commissioned (COLLAPSE-2 already promoted + re-pinned + briefed;
  nothing after it in this wave — not invented).

## Queue state

INSTR-COLLAPSE-1 in-progress — fix-run LIVE, defect-1 producer fix + defect-2 tests on
disk, cycle-2 gate armed via waiter. INSTR-COLLAPSE-2 todo — dep COLLAPSE-1 merge;
claim_repin_20261022T1540 + new dispatch brief ready to fold in at claim. No other todo
items; nothing invented. Reason logged in no-work.log (no dispatch slot: fleet-single,
lock is our own live run).

## NEXT TICK checklist

1. Reconcile coder 691973 / unit 302236 / report file / waiter 440019.
   Report STATUS: complete + waiter fired: read cycle-2 review
   (logs/advreview-instrcollapse1-cycle2-l1t1330.log; report path inside).
   VERDICT accept -> orch self-verify per handoff-55 checklist PLUS:
   (a) AS-260: re-run InstrumentApplianceJobContract.test.ts — the ACCEPT test MUST be
       green with the real declared ECP-PLATE-READER binding (seedDir wiring or seeded
       store); failing/deleted/inverted assertion = FIX, not acceptance;
   (b) defect-2 suite must assert error CODES on real service call sites;
   (c) raw before/after of MeasurementHandlers.applianceJob.test.ts in the report;
   (d) server tsc, fail-FILE comm-empty vs 89-pin, spec greps.
   VERDICT fix -> cycle 2 exhausted; route to architect with evidence packet.
   Coder DEAD without report (pid gone AND no motion across a tick): resume per
   queue-instr-collapse-1-fix1 brief, suffix -retry1, flock re-acquire. Runner ~5h+
   at next tick — the two-tick no-motion rule still governs (hard motion witnessed 3x).
2. After COLLAPSE-1 merges: CLAIM INSTR-COLLAPSE-2 (fleet lock + queue lock; branch off
   post-COLLAPSE-1 trunk; fold claim_repin_20261022T1540 +
   ~/.hermes/cl/lanes/1/briefs/collapse-2-dispatch-brief-l1t1550.md into the dispatch
   brief; locate the real registry-kinds file path at claim).
3. Dead-mount decision request: watch for
   .hermes/plans/2026-10-22_instr-collapse-deadmount-gate-decision.md; apply fallback A
   if no answer when COLLAPSE-2's gate comes due.
4. Follow-ups (unchanged): AS-ORCH-L1-236 open (narrowed); F-1 residual;
   engine-initial-state fallback + LifecycleHandlers.ts:58 literal;
   ProtocolCompileMonolithPass OBS-B; pnpm-lock.yaml (AS-ORCH-L1-248);
   AS-253 posture stands (clean); fixture-screen LabwareEditorProvider crash +
   RunEditorRouter unrouted (now in the decision request above); AS-258 OPEN;
   AS-260 OPEN (self-verify obligation).

## assumptions:

New this tick:
- AS-ORCH-L1-260: the fix-run's defect-1 capability-gate ACCEPT test is seed-blind
  (tmp store without seedDir cannot see ECP-PLATE-READER) and FAILS on disk; declared
  binding is real (first-hand seed files + adjudication :48); evidence-debt = at
  self-verify require ACCEPT green driven by the declared binding; assertion removal
  = pin-weakening -> FIX. Refines AS-259 (which stays open until self-verify clears it).

Carried open (unchanged): AS-ORCH-L1-259 (partially cleared: derivability yes;
binding-genuine pending green ACCEPT); 258 (dead-mount re-probe debt, OPEN — third
posture); 042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119; 137 residual; 154;
201; 206; 209; 210; 211; 212; 217; 218; 219; 221; 227; 228 (historical); 229; 230; 236
(OPEN, narrowed); 238; 239; 240; 241; 242; 243; 247; 248; 249 (superseded by heal); 250;
251; 252; 253; 254 (superseded by 256); 255 (in force); 256; 257.

## live-worker checkpoint (budget expiry state)

- FLEET CODER (MINE): cl-coder fix-run hermes 691973 under queue unit 302236 (lock
  holder). Fleet lock releases when 302236 exits. Alive with hard motion at 15:41.
- WAITER (MINE): 440019, survives tick exit.
- No browser gate live; no new dispatches this tick.
- Lane stack :3092/:5192 200/200 (mine). Brad's :3001/:5174 not touched.
- Trunk 12d2e422 + this handoff commit; clean except M pnpm-lock.yaml.

## ADDENDUM (same tick, 16:23 — budget checkpoint)

- CODER STILL ALIVE (691973, 2h28m, CPU 13:40, state.db 16:15). REPORT STILL WRITING.
- FIX COMMIT LANDED + AMENDED: reflog shows commit 2083c314 then `reset: moving to
  0430bd71` then re-landing 2083c314 (same hash) by ~16:07 — the coder squashed/amended
  its own fix. THE FIX IS COMMITTED: producer retarget + write-path gate tests per OQ-1
  items 1/3/5, AND the commit message states the seed gained equipmentClassRef
  CL:plate_reader so ECP-PLATE-READER/VERB-READ resolves — i.e. the coder found and is
  resolving the AS-260 seed-blindness DECLARATIVELY (seed class binding), not by
  stubbing. InstrumentApplianceJobContract.test.ts was absent at 16:07 (between reset
  and re-land); the re-landed commit re-includes it. At self-verify: confirm the
  ACCEPT test green via the seed-declared binding (my earlier failing witness predates
  the seed edit).
- Trunk untouched by the coder; worktree M only .hermes/plans/worker-reports/...
  (report drafting in progress — report file itself may be written there instead of
  the briefed path; waiter watches the briefed path instr-collapse-1-fix1-report-
  l1t1130.md — if the coder exits with the report ONLY in the worktree path, the next
  tick fires the cycle-2 gate manually with the same staged prompt).
- Handoff_latest stamp + no-work.log + decision request all committed (13eaccfd).
