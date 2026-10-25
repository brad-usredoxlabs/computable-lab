# Handoff — lane 1 tick 2026-10-22 16:00 → COLLAPSE-1 fix-run alive w/ motion (46 min in); COLLAPSE-2 EARLY RE-PIN done, 3 surfaces the spec missed found first-hand — 56th

Author: orchestrator cron tick l1t1540 — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 untouched this tick.

## Reconcile (first-hand)

- CODER ALIVE: hermes pid 691973 under queue unit bash 302236 (fleet lock holder;
  pid-file INSTR-COLLAPSE-1-FIX1(l1t1130) acquired 13:55:14). At 15:30 check: 46 min
  elapsed, state.db mtime 14:27, CPU 4:46 accruing. Branch top still 0430bd71 (the
  trunk-fold prep commit) — no fix commits yet, report
  instr-collapse-1-fix1-report-l1t1130.md absent. Normal trajectory (cycle-1 ~4h incl.
  queue). DO NOT re-dispatch; idle-past-deadline = no state.db motion across two ticks.
- WAITER healthy: cl-l1-wait-adv-instrcollapse1-c2-l1t1330 pid 440019 (2h17m), fires
  cycle-2 adv review (prompt already staged: prompts/advreview-instrcollapse1-cycle2-
  l1t1330.txt, output path advreview-instrcollapse1-cycle2-l1t1330.log/unique report)
  on "STATUS: complete"; stands down on blocked/requires-rescope. Survives tick exit.
- Trunk 73a8bad3 (this tick's task-list reconcile is in the lane state file, not trunk;
  trunk is docs-only since 2d1f3ff7). Clean except M pnpm-lock.yaml (AS-ORCH-L1-248).
- Fail-FILE baseline pin @ 2d1f3ff7 (89 fail-files) + tsc pins from handoff-54 stand
  (server 0, app delta-0/24 both sides).
- Lane stack :3092 :5192 both 200. Decision watch 2026-10-21_qms8c-cleanbreak-decision.md
  md5 8b67f579 UNCHANGED — not re-asked. No open Brad asks.
- Fleet: lock is OURS; no lane-2 coder contention observed this tick. No lane-1 dispatch
  possible or needed (fleet-single, our own fix-run holds the slot). Scout slot not
  consumed — the re-pin questions below were answered by first-hand grep (cheap, exact).

## COLLAPSE-2 EARLY RE-PIN (read-only; item NOT claimed — dep COLLAPSE-1 fix-run live)

All promoted-spec cites HOLD at trunk 73a8bad3 (full detail in the task block
claim_repin_20261022T1540): registry-kinds :21, OWN-LAB seed :86, record.schema oneOf
:17, RecordEditController :312, InstrumentApplianceJob :126 (the ONLY non-test
type:'instrument' emitter, re-count=1), ReadPlateModal :56 positional emitter,
KindLifecycleRegistry.test :42, registryOpsLifecycle :53 + :662/:681 probes, triplet
exists, RecordRegistryPage :27 tab, LabCollectionView label already 'Equipment'
(QMS8-C landed — C5 label end-state settled as the spec predicted).

THREE SURFACES THE SPEC DID NOT PIN (hand to the COLLAPSE-2 coder at dispatch):
1. server/src/governance/domainStatusFlip.test.ts:378 — loops over
   ['equipment','instrument'] reading lab/instrument.ui.yaml FROM DISK. Deleting the
   triplet BREAKS this test; C3 must drop the instrument leg there.
2. server/src/governance/domainStatusRetirement.test.ts:250 — comment-only mention of
   instrument refusal; no code change needed, comment stays accurate-as-history or is
   trimmed by the coder.
3. LocalAuthorization.test.ts:~489 constructs an instrument-kind envelope with the
   instrument schemaId purely as an AuthorizationService fixture (no schema loading) —
   survives deletion, but flag so the coder decides consciously, not by suite-red surprise.

Spec-cite corrections for claim time: "verb-read.yaml:6" — no such file; the domain enum
is schema/workflow/verb-definition.schema.yaml:36 (analytical_readout), VERB-READ binding
via schema/registry/wave2-verb-adjudication.yaml. gemini id fact for the fix-run's
cross-check: grep -ri gemini records/seed = ZERO hits — no gemini equipment record in git
seeds (EQP-QUANTSTUDIO5 exists in records/seed/equipment/eqp-quantstudio5.yaml); the
fix-run brief already tells it to derive the id from declared seed data or state the
source. OwnershipPolicySchema.test.ts has ZERO instrument refs — the spec's
RETIRE-THE-FILE-WHOLE parameterization warning actually points at
RecordHandlers.instrumentAuthoring.test.ts:453 (cases array carries BOTH instrument +
equipment legs; instrumentRef type:'' in app/src/types/knowledge.ts:183 is the
AssignRoleIntent well-role ref — KEEP per COLLAPSE-1 defect-3 ruling).

## Queue state after this tick

INSTR-COLLAPSE-1 in-progress — fix-run LIVE (fleet lock ours; cycle-2 waiter armed;
merge pins in hand; gate-reach protocol from handoff-55 unchanged: re-probe merged
build first, dead-mount escalation path if still dead — AS-ORCH-L1-258 debt OPEN).
INSTR-COLLAPSE-2 todo — early re-pin recorded; claim only after COLLAPSE-1 merges
(fleet lock + queue lock; branch off post-COLLAPSE-1 trunk; re-derive the 3 extra
surfaces above). No other todo items; no spec-composer commissioned (no next item in
this wave — not invented).

## NEXT TICK checklist

1. Reconcile coder 691973 / unit 302236 / report file. If report ends STATUS: complete
   and the waiter fired: read the cycle-2 review (log
   logs/advreview-instrcollapse1-cycle2-l1t1330.log; report path inside). VERDICT:
   accept -> orch self-verify per handoff-55 checklist (server tsc, fail-FILE comm-empty
   vs 89-pin, spec greps, defect-1 end-to-end proof re-checked by eye incl. the gemini
   equipment-ref id SOURCE the coder states, merge --no-ff, YAML shipped => stack
   restart, browser gate re-probe first). VERDICT: fix -> cycle 2 of max 2 (unique
   paths). 3rd cycle -> architect packet.
   If coder DEAD without report: resume per queue-instr-collapse-1-fix1 brief with
   suffix -retry1 (re-acquire fleet lock via flock).
   If alive: elapsed ~2h at next tick — inside normal range; only the two-tick
   no-motion rule declares deadness.
2. After COLLAPSE-1 merges: CLAIM INSTR-COLLAPSE-2 (claim_repin_20261022T1540 + the
   three extra surfaces into the dispatch brief; spec
   2026-10-22_instr-collapse-2-kind-deletion-spec.md; re-pin any remaining drift).
3. Follow-ups (unchanged): AS-ORCH-L1-236 open (narrowed); F-1 residual;
   engine-initial-state fallback + LifecycleHandlers.ts:58 literal;
   ProtocolCompileMonolithPass OBS-B; pnpm-lock.yaml reconciliation (AS-ORCH-L1-248);
   AS-253 posture stands (clean); fixture-screen LabwareEditorProvider crash +
   RunEditorRouter unrouted (in the gate-reach decision).

## assumptions:

New this tick: none (the COLLAPSE-2 re-pin facts are first-hand verified greps, not
assumptions; they live in the task block).
Carried open (unchanged): AS-ORCH-L1-258 (dead-mount re-probe debt, OPEN); 042; 082;
087 PARTIAL; 088; 089; 096; 097; 099; 101; 119; 137 residual; 154; 201; 206; 209; 210;
211; 212; 217; 218; 219; 221; 227; 228 (historical); 229; 230; 236 (OPEN, narrowed);
238; 239; 240; 241; 242; 243; 247; 248; 249 (superseded by heal); 250; 251; 252; 253;
254 (superseded by 256); 255 (in force); 256; 257.

## live-worker checkpoint (budget expiry state)

- FLEET CODER (MINE): cl-coder fix-run hermes 691973 under queue unit 302236 (lock
  holder). Fleet lock releases when 302236 exits. Alive w/ motion at 15:30.
- WAITER (MINE): 440019, survives tick exit.
- No browser gate live; no new dispatches this tick (fleet-single respected; no scout
  need — first-hand greps answered the re-pin).
- Lane stack :3092/:5192 200/200 (mine). Brad's :3001/:5174 not touched.
- Trunk 73a8bad3 + this handoff commit; clean except M pnpm-lock.yaml.
