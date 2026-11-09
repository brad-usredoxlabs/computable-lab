# Handoff — lane 1 tick 2026-10-29 00:00-00:25 · GC-13 fix queue re-armed with a retry loop · both adv gates auto-armed · both coder slots held — 148th

## Reconciliation (first-hand)

- Slot truth: slot-0 HELD by lane-2 THREADSCOPED-1 (PID 2307239 alive, started 22:42:31).
  Slot-1 HELD by GC12dirfix (queue inner 2617137 alive; coder launched 23:42:49, flock
  wrapper 2650429 alive; report deliverables/gc12-dirfix-report-l1t2250.md shows Leg-0 DONE
  at fast-forward 8a5a0b95 + baselines, leg 1 in flight — GcSectionChrome.tsx + 2 tests
  touched per the report's note).
- GC-13 fix continuation: queue l1t2315 died 23:42:57 `GATE FAIL: both slots taken` (the
  race its own log names; NO coder ever ran — confirmed: the worktree is byte-identical to
  the 147th tick state). Re-arm l1t0001 hit the SAME race at 00:08:59.
- ROOT CAUSE of the repeat race (orch first-hand): slot-1's pid file reads
  `GC12DIR-2650427-...` but 2650427 is DEAD — the queue's `flock -c "echo ... > pidfile"`
  stamps the flock child's pid, not the queue inner's. So the stagger gate saw a dead pid,
  opened early, and both GC-13 queues then raced two physically-held locks and exit-4'd.
  The stagger itself was never violated (dirfix start 23:42:49 was only ~26 min old at
  00:08 — the mtime-fallback in the new queue keeps the wall honest).
- GC-13 worktree verified safe: wt/gc-13-lane1-l1t1910 tip c2ab53b9 (FIX1 1fc916c7 +
  FIX3 c2ab53b9 committed, transcripts in gc13-fix1-report-l1t2230.md) + FIX4
  (ClaimWorkspace.tsx/.test.tsx, +158/-62) present UNCOMMITTED — exactly what the
  continuation prompt expects. NO DONE line in the report (correct — the continuation
  hasn't run yet).
- Lane stack :3092/:5192 = 200/200. No YAML touched this tick -> no restart.

## Actions this tick

1. Re-armed the GC-13 fix continuation as queue-GC13fix1e-l1t0002.sh (SAME prompt
   prompts/coder-GC13-fix1c-l1t2315.txt, SAME worktree, inner PID 2705877, prefers
   slot-0). Fixes vs the old queue: (a) once the stagger gate opens it RETRIES the slot
   locks every 60s up to 4h — never exit-4 on a single race; (b) stagger liveness falls
   back to the pid FILE's mtime when the stamped pid is dead (the flock-writer defect);
   (c) dup-guard `hermes -p cl-coder.*CONTINUATION` pgrep intact (verified the dirfix
   prompt contains no CONTINUATION token — no false-positive dup block).
2. Re-armed the GC-13 cycle-2 adversarial waiter on the NEW inner:
   scripts/wait-GC13fix1e-cycle2-l1t0002.sh via systemd-run --user --collect
   --description= (unit run-p2706774). Fires the cloud adv gate only on
   'GC13 FIX1 DONE <sha>' == worktree tip; template advreview-GC13-cycle2-l1t2335.TEMPLATE.txt
   verified intact ({__FINAL_SHA__} x1, token l<tick>-c2 x1). Log:
   logs/wait-GC13fix1e-cycle2-l1t0002.log (WAITER START 00:15:24).
3. GC-12dirfix cycle-1 adv waiter run-p2644339 confirmed still active on inner 2617137 —
   untouched.
4. NO manual coder dispatch: both slots held, stagger wall ~00:43 (60 min from dirfix
   start 23:42:49) or earlier if dirfix exits first. GC-14 promotion stays gated on the
   GC-13 merge (deps); its draft remains cite-audited at
   /home/brad/.hermes/cl/lanes/1/drafts/2026-10-28_GC-14-acceptance-dossier.l1t1640.draft.md.
5. Task list updated under the queue lock (GC-13 tick_reconcile_20261029T0020,
   handoff_latest).

## NEXT TICK — in order

1. Poll logs/coder-GC13-fix1e-l1t0002.log for LOCK-ACQUIRED / CODER_EXITED, and
   deliverables/gc12-dirfix-report-l1t2250.md for legs + 'GC12 DIRFIX DONE <sha>'.
   On each DONE + waiter-fired adv gate, watch logs/advreview-GC13-cycle2-l1t2335.log and
   logs/advreview-GC12dirfix-l2335.log (per the waiters' own log paths) for the verdict.
   If a waiter exited WITHOUT launching (no DONE / sha mismatch), assess the delta yourself.
2. On GC-12dirfix adv ACCEPT -> orch self-verify per the 147th handoff: server vitest
   src/analysis; live probe — hand-pinning DREF-000028 on a run execute must fail with the
   NAMED INPUT_IS_DIRECTORY (not EISDIR INTERNAL_ERROR). Merge wt/gc12-dirfix-lane1-l1t2250
   -> restart ONLY if YAML touched (expected none) -> browser re-gate per the ruling's
   'Verification the re-gate must show' block. GC-12 DONE + evidence-debt AS-L1T1940-2 /
   AS-L1T2015-1 clear at that gate.
3. On GC-13 cycle-2 adv ACCEPT -> orch self-verify (server vitest src/lint src/api-probe
   src/run-workspace src/knowledge — src/api/** 16-FAIL env baseline known; app vitest
   src/claims src/run src/shared/ref; server tsc 0; app tsc 21 baseline zero-new;
   lint-invalid CREATE probe on YAML-reloaded :3092). Merge wt/gc-13-lane1-l1t1910 ->
   restart stack (leg-B YAML) -> browser gate GC-13 UI legs. THEN promote the GC-14 spec
   with the re-anchor banner + claim it if a slot is free past the stagger wall.
4. Ops notes: (a) the flock -c pid-stamp defect is now ONLY mitigated inside queue fix1e —
   the dirfix queue and lane-2 queues still stamp a possibly-dead writer pid; any future
   queue MUST use the fix1e pattern (write the pid file from the queue shell itself, then
   flock separately, like `echo ... > $PIDF` outside flock -c). (b) systemd-run bare
   '-t NAME bash ...' fails; use '--description=NAME bash <script>'. (c) worktree-add
   checkout spam floods queue logs — grep for the queue's own timestamped lines.

## assumptions:

- AS-L1T0020-1 (orch): the fix1e retry loop cannot double-launch — its dup-guard pgrep
  matches only CONTINUATION-coder runs (dirfix prompt verified free of that token), and the
  per-slot flock -n acquire is atomic. evidence_debt=false.
- AS-L1T0020-2 (orch): slot-1's dead stamped pid (2650427) does NOT make the dirfix coder
  dead — the flock wrapper 2650429 and queue inner 2617137 are alive and the report shows
  active work. The pid-file mtime (23:42:49) is the honest start time. evidence_debt=false.
- Carried open: AS-L1T1940-2 (GC-12 full re-gate acceptance — gated on the dirfix leg),
  AS-L1T2015-1 (D7 adjudication — clears at the same re-gate; text committed at 8a5a0b95).
  Resolved/standing: AS-L1T2335-1/-2, AS-L1T2230-1/-2/-3, AS-L1T2155-1/-2, AS-L1T1940-1,
  AS-L1T1815-2/-3/-4, AS-L1T1610-1, AS-L1T1520-1, AS-L1T1445-1, AS-L1T1425-1, AS-L1T1345-1,
  AS-L1T1235-1/-2.
