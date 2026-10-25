# Handoff — lane 1 tick 2026-10-22 05:01 → QMS8-C fix queue STILL lock-waiting (lane-2 MIXFRAC1 took the fleet lock at 05:05); waiter v3 defect found+replaced by v4 (7h window); all gates armed — 45th

Author: orchestrator cron tick l1t0501 — lane 1 only. :3001/:5174 never touched.
All git via -c core.fileMode=false. Budget ~05:01→~05:20. ZERO coder dispatches
(fleet lock legitimately held — first by lane-2 REVISE-GHOST-1 until 05:05:14, then
immediately re-acquired by lane-2 MIXFRAC1 queue, pid file names MIXFRAC1(l2t0310)
pid:3210419). Fleet rule honored: exactly ONE live coder (lane-2's), both times.

## Reconcile (first-hand)

1. FLEET LOCK TIMELINE (observed live this tick): lane-2 REVISE-GHOST-1 hermes
   3180038 EXITED code=0 at 05:05:14 (log shows the coder's own completion prose:
   unresolved-none, baseline-comm-empty claims — lane-2's orchestrator verifies that,
   not me). Lock passed to lane-2's MIXFRAC1 queue (bash 3210419 + flock 3210423,
   pid-file MINE-stamped 05:05:14). My fix queue runner cl-l1-qms8c-fix1-0345
   (pid 3231648) is STILL flock-waiting (log shows QUEUE-WAIT only; flock 3231655
   is its child). It self-fires the QMS8-C fix on release. Do NOT duplicate.
2. WAITER V3 DEFECT FOUND + FIXED (the tick's substantive action): v3
   (wait-advreview-qms8c-v3) resolves the fix-runner pid by watching the pid FILE
   for the QMS8C-FIX1(l1t0330) marker with a 2h window that STARTED at ~03:45. With
   MIXFRAC1 holding the lock from 05:05 for a ~2-4h coder, the marker cannot appear
   before ~07:05-09:05 — v3's window was guaranteed to expire (AS-ORCH-L1-241 lesson
   applied one level up: the window must cover the QUEUE WAIT, not just the run).
   Killed v3 (3231650), armed v4 (systemd-run cl-l1-wait-advreview-qms8c-v4,
   7h marker window, same report/marker contract, log
   logs/wait-advreview-qms8c-v4-l1t0510.log, START line verified). Cycle-2 prompt
   unchanged (advreview-qms8c-cycle2-l1t0345.txt, deliverable
   advreview-qms8c-cycle2-l1t0345.md — unique, no collision).
3. QMS8-C artifacts unchanged: no qms8c-fix1-report-l1t0330.md, no cycle-2 report
   (correct — fix hasn't started). Branch cl/lane1-qms8c-l1t2205 tip d044fafd;
   worktree /mnt/vast/home/brad/git/wt/QMS8-C-lane1-l1t2205 clean.
4. Decision watch (cleanbreak) md5 8b67f579a7029913ba9151cd4f099e51 UNCHANGED —
   not re-asked. OQ-1 decision file was already STATUS: decided (l1t0130); no new
   decision files under .hermes/plans/.
5. Stack :3092/:5192 both 200. Trunk HEAD 7712d817; diff c53d2a69..HEAD verified
   docs-only (instr-collapse-2 spec + prior handoff) — the 23-error app-tsc pin
   (tsc-trunk-f8f49dc1-app-l1t0400.txt) remains valid for QMS8-C verification.
   Merge-tree preview cl/integration-1 x cl/lane1-qms8c-l1t2205: 0 conflicted
   files. No YAML shipped; NO restart needed.

## NEXT TICK checklist (inherits l1t0445 items 1-8; deltas marked)

1. Fix run: reconcile logs/coder-QMS8C-fix1-l1t0330.log (expect LOCK-ACQUIRED) +
   qms8c-fix1-report-l1t0330.md. If EXITED without STATUS: complete -> re-dispatch
   the SAME brief once (unique report suffix l1<tick>); do NOT redo the rollout.
   NOTE: the queue may wait until ~07:05-09:05 behind MIXFRAC1; v4 covers 7h.
2. [RE-ARMED] Cycle-2 adv report advreview-qms8c-cycle2-l1t0345.md -> VERDICT
   (v4 fires it; if v4 itself dies, re-shoot per ladder, window lesson above).
   Max 2 cycles; on a second FIX verdict route to architect with evidence.
3. ORCH VERIFY on ACCEPT: blocker-matrix probes; vitest delta vs md5
   7393960e9c93a49a36dd4dddb1ff9897 (AS-ORCH-L1-237); server tsc delta; app tsc
   delta vs the 23-error trunk pin; grep proofs re-run.
4. MERGE --no-ff cl/lane1-qms8c-l1t2205 -> cl/integration-1 (merge-tree 0 hunks
   verified THIS tick; re-inspect trunk). YAML ships => cl-lane-stack.sh 1 restart
   (background=true) first.
5. RUNTIME apply-lap (orch-only): CONFIG_PATH=.../lane1-config.yaml npx tsx
   src/scripts/migrateRecordLifecycles.ts dry -> --apply -> re-dry 0 planned.
   EXPECT 6 BLOCKED CONTROLLED_RECORD_LOCKED archived records; acceptable under
   Brad's all-records-are-test-data ruling; record it. Closes AS-ORCH-L1-232.
6. Browser gate LAST (registry EQP-NEW-7LS1 Draft, status field absent;
   LabCollectionView 'Equipment'), tier-1 cl-browser-reviewer vs :5192, receipts
   ~/.hermes/cl/receipts/QMS8-C/<ts>/, ladder per SOUL 6c.
7. Mark QMS8-C done + handoff + promote artifacts. THEN claim INSTR-COLLAPSE-1
   (fleet lock; wt/INSTR-COLLAPSE-1-lane1-<ts>; re-pin the emitter greps at claim;
   the recon_repin_20261022T0305 block says pin held at c53d2a69).
   INSTR-COLLAPSE-2 spec is canonical — no composer wait behind it.
8. Follow-up future items when convenient: engine-initial-state fallback
   (AS-ORCH-L1-243), ProtocolCompileMonolithPass engine-absent posture (OBS-B).

## assumptions:

New: AS-ORCH-L1-245 — waiter windows must cover the QUEUE WAIT, not just the run:
a marker-watch timeout sized at the expected coder duration silently guarantees a
miss when the lock queue is longer than the run; v4 uses 7h and v4 replaces v3.
Carried open (unchanged unless noted): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089;
096; 097; 099; 101; 119 (+post-QMS76 ext); 137 residual; 154; 201 (posture-watch);
206; 209; 210; 211; 212; 217; 218; 219; 221; 227 (VPDF-4 fail-branch unit-only
posture); 228 (historical, keep); 229; 230; 236 (evidence debt — clears on a
no-draft button click in any later gate); 237 (QMS8-C adopted REPAIRED baseline —
operative); 238; 239; 240, 241 (waiter-v1 defect lesson — v4 applies it one level
up, see 245), 242 (state-erasure contract — binding on fix run + cycle-2), 243
(defect-3 deferral), 244 (pid-file liveness via lsof — operative).
AS-ORCH-L1-232 STILL OPEN (closes with the QMS8-C merge apply-lap receipts, item 5).

## live-worker checkpoint (budget expiry state)

- Lane-2 coder MIXFRAC1 queue bash 3210419 (flock 3210423): HOLDS the fleet lock
  since 05:05:14; releases on its coder exit -> my queue self-fires. NOT mine.
- FIX-RUN-1 queue runner cl-l1-qms8c-fix1-0345 pid 3231648: ALIVE, flock-waiting,
  self-fires. Do not duplicate.
- cl-l1-wait-advreview-qms8c-v4 (systemd unit, marker 7h window): ARMED (v3 killed
  as defective — see above).
- No composer live on thunderbeast; no scout live; no browser gate pending.
- Lane stack :3092/:5192 both 200. Trunk HEAD 7712d817 (docs-only since l1t0400).
