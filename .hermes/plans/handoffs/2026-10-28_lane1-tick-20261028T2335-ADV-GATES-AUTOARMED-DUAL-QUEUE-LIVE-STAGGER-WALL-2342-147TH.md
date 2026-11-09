# Handoff — lane 1 tick 2026-10-28 23:20-23:45 · both coder queues alive & self-firing · adv gates AUTO-ARMED for both legs · stagger wall ~23:42 — 147th

## Reconciliation (first-hand)

- Slot truth: slot-0 HELD by lane-2 THREADSCOPED-1 (PID 2307239 alive, started 22:42:31 per
  pid file). Slot-1 FREE since 23:06 (GC-13 fix1 death). Fleet stagger wall (60 min vs
  slot-0's live coder start) opens ~23:42. Both lane-1 queue launchers are ALIVE and gate
  correctly: GC12dirfix inner 2617137 (worktree wt/gc12-dirfix-lane1-l1t2250 created at trunk
  148280cc, waiting slot+stagger, prefers slot-0), GC13fix1c inner 2628865 (prefers slot-1,
  pgrep dup-guard inside). NO manual dispatch performed or needed — queues self-fire.
- GC-13 worktree state confirmed on disk: FIX1 (1fc916c7) + FIX3 (c2ab53b9) committed with
  RED/GREEN transcripts; FIX4 (ClaimWorkspace.tsx+.test.tsx, 158+/62-) present UNCOMMITTED —
  exactly what the continuation prompt expects.
- NInfer :18080 health checked with the coder profile's own key: http 200, qwen3.8-27b
  listed. The 23:06 admission-expiry was transient queueing, not engine-down.
- Lane stack :3092/:5192 = 200/200; no YAML touched this tick -> no restart.

## Actions this tick

1. Committed the stranded D7 adjudication docs hunk (GC-12 run sheet, 13 lines, AS-L1T2015-1
   record from tick 144) into trunk -> 8a5a0b95. Docs-only; trunk otherwise clean.
2. Wrote cycle-2 GC-13 adv-review template (per-defect D1-D10 close checks against
   reviews/GC13-advreview-l1t2215-c1.md, hard-rule re-checks, suite/tsc commands):
   prompts/advreview-GC13-cycle2-l1t2335.TEMPLATE.txt.
3. Wrote GC-12 dirfix cycle-1 adv template (ruling stop-boundaries as BLOCKER triggers,
   {signal}-only pin, INPUT_IS_DIRECTORY placement/wording, minors 2/3/5/6, deferred-scope
   absence): prompts/advreview-GC12dirfix-cycle1-l1t2335.TEMPLATE.txt.
4. AUTO-ARMED both adversarial gates via waiter scripts + systemd-run --user --collect
   --description= form (units run-p2644337 watching 2628865; run-p2644339 watching 2617137).
   Each waits its queue-inner PID, requires '<ITEM> ... DONE <sha>' == worktree tip, stamps
   the template with the real sha, then launches cl-adversarial-reviewer (cloud, no coder
   slot) to ~/.hermes/cl/reviews/GC13-advreview-l2335-c2.md and
   ~/.hermes/cl/reviews/GC12dirfix-advreview-l2335-c1.md. No DONE line / sha mismatch ->
   waiter exits quietly, orch assesses. 3h waiter timeout.
5. Task list updated under the queue lock (GC-13 + GC-12 notes, handoff_latest).

## NEXT TICK — in order

1. Check the two queue logs for LOCK-ACQUIRED (who owns which slot) and CODER_EXITED; read
   the DONE lines: gc13-fix1-report-l1t2230.md 'GC13 FIX1 DONE', deliverables/
   gc12-dirfix-report-l1t2250.md 'GC12 DIRFIX DONE'. If a waiter auto-launched its adv gate,
   watch logs/advreview-GC13-cycle2-l1t2335.log / advreview-GC12dirfix-l1t2335.log for
   ADV_EXITED. If a waiter exited WITHOUT launching (no DONE / sha mismatch), assess the
   delta yourself and decide (continue-leg vs accept-partial vs re-arm).
2. On adv ACCEPT for each leg -> orch self-verify:
   - GC-13: server vitest src/lint src/api-probe src/run-workspace src/knowledge (src/api/**
     env-bound 16-FAIL baseline is known); app vitest src/claims src/run src/shared/ref;
     server tsc 0; app tsc 21 baseline zero-new; lint-invalid CREATE probe on YAML-reloaded
     :3092 (result-arm floor). Merge wt/gc-13-lane1-l1t1910 -> restart stack (leg-B YAML) ->
     browser gate GC-13 UI legs (receipts GC-13/<ts>/, served-revision probe first).
   - GC-12 dirfix: server vitest src/analysis; live probe — hand-pinning DREF-000028 on a
     run execute must fail with NAMED INPUT_IS_DIRECTORY (not EISDIR). Merge
     wt/gc12-dirfix-lane1-l1t2250 -> restart ONLY if YAML touched (expected none) -> browser
     re-gate per the ruling's 'Verification the re-gate must show' block (f execute->results
     on ANREV-000008-class revision inputs={signal}, minors 2/3/5/6 visible, DNA control
     byte-identical, ANREV-000006 refusal unchanged). GC-12 DONE + evidence-debt
     AS-L1T1940-2/AS-L1T2015-1 clear at that gate.
3. GC-14 promote-at-claim: draft at .hermes/plans/drafts/
   2026-10-28_GC-14-acceptance-dossier.l1t1640.draft.md (orch cite-audited, 144th/145th).
   Promote to .hermes/plans/2026-10-30_GC-14-acceptance-dossier.md with a re-anchor banner at
   claim time; claim gated on GC-13 merge (deps) + a free slot past the stagger wall.
   Sequences-test remediation slice (vitest#5285 family, 5 rejects.toThrow(regex) sites) is
   in its block, coder-eligible.
4. Ops notes: (a) systemd-run '-t NAME bash ...' FAILS (reads NAME as executable) — use
   '--description=NAME bash <script>' or bare 'systemd-run --user --collect <prog> [args]'.
   (b) flock-in-python + outer flock -c = self-deadlock; the python update script takes the
   lock itself. (c) worktree-add checkout spam floods queue logs — harmless, grep for the
   queue's own timestamped lines.

## CHECKPOINT addendum (same tick, 23:46) — stagger opened; dirfix LAUNCHED slot-1; GC13 queue lost the race

- 23:42:49 both staggers opened. GC12dirfix inner 2617137 LOCK-ACQUIRED slot-1 and is
  LAUNCHING the coder NOW (log coder-GC12-dirfix-l1t2250.log; slot-1 pid file stamped
  GC12DIRFIX item at 23:42:49). Its auto-armed adv waiter (run-p2644339, watching 2617137)
  is intact and will fire the cycle-1 gate on DONE+sha match.
- 23:42:57 GC13fix1c inner exited rc=4 'GATE FAIL: both slots taken after stagger open'
  (dirfix won slot-1 8s earlier; lane-2 THREADSCOPED still held slot-0). Slot race, NOT an
  engine failure. Its waiter saw queue exit with NO DONE line and correctly did NOT launch
  the cycle-2 gate (wait log confirms).
- WORKTREE SAFE: wt/gc-13-lane1-l1t1910 untouched (FIX1+FIX3 commits + uncommitted FIX4
  intact). NO coder is running for GC-13 right now.
- NEXT TICK #1 TASK: RE-ARM the GC13fix1c queue (SAME prompt
  prompts/coder-GC13-fix1c-l1t2315.txt, SAME worktree, new launcher/queue token l1t<tick>,
  prefers slot-0) — fleet stagger now measures from the dirfix start 23:42:49 (wall ~00:43)
  OR opens early if dirfix exits first. THEN re-arm the GC-13 cycle-2 adv waiter on the NEW
  queue-inner PID (template still unused: advreview-GC13-cycle2-l1t2335.TEMPLATE.txt).
  Do NOT launch the GC-13 gate or the GC-14 claim until dirfix's slot state is known.

## assumptions:

- AS-L1T2335-1 (orch): the two waiter auto-arms are safe dup-guarded (flock -n on distinct
  review locks + sha==tip gate + pgrep guards inside the queues); a manual next-tick adv
  dispatch is only allowed if the waiter exited WITHOUT launching. evidence_debt=false.
- AS-L1T2335-2 (orch): GC13fix1c queue inner (2628865) dying == coder done or launch failed;
  the report-file DONE line, not process state, is the completion truth. evidence_debt=false.
- Carried open: AS-L1T1940-2 (GC-12 full re-gate acceptance — gated on the dirfix leg),
  AS-L1T2015-1 (D7 adjudication — clears at the same re-gate; adjudication text now committed
  at 8a5a0b95). Resolved/standing: AS-L1T2230-1/-2/-3, AS-L1T2155-1/-2, AS-L1T1940-1,
  AS-L1T1815-2/-3/-4, AS-L1T1610-1, AS-L1T1520-1, AS-L1T1445-1, AS-L1T1425-1, AS-L1T1345-1,
  AS-L1T1235-1/-2.
