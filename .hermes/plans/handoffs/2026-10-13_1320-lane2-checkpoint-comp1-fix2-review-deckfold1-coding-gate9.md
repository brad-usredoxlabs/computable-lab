# HANDOFF l2t1150/1230/1315 (CHECKPOINT) — lane 2 — 2026-10-13T13:20 EDT
# Trunk cl/integration-2 tip: 48b9686a (W2-11 D4 mint-replay harness fixes; orch-owned file).
# Stack :3093/:5193 both 200. No product YAML changed -> no restart.

COMPLETED THIS TICK:
1. RECONCILED: COMP-1 fix2 coder (pid 1627997) EXITED clean ~12:24 (tip b00e0497,
   final line 'SHORTHAND-COMP-1 FIX2 DONE b00e0497'). Fleet lock released; architect/
   composer pids gone. Deck-review cites re-verified first-hand (zero product commits
   between spec anchor 79ffa518 and trunk; only docs/harness commits).
2. DECK-FOLD-1 SPEC PROMOTED: .hermes/plans/2026-10-13_1150-deck-fold-1-resolved-labwares-spec.md.
   OQ adjudications: OQ1 server-side cap ACCEPTED; OQ2 kind-union ACCEPTED; OQ3 re-bless
   only what the drift probe enumerates. Task block updated under lock.
3. DECK-FOLD-1 CODER DISPATCHED (fleet lock held for launch): worktree
   wt/DECK-FOLD-1-lane2-l2t1240 (off fe324015), branch DECK-FOLD-1-lane2-l2t1240,
   prompt prompts/coder-DECKFOLD1-l2t1240.txt, log logs/coder-DECKFOLD1-l2t1240.log
   (0 B until exit; buffered), report .hermes/plans/DECK-FOLD-1-report.wip-l2t1240.md
   (unique), pidfile records dispatch-pid 1902444. Expected 60-120 min: 2x ~15:10,
   3x ~17:10 (rule 7b). ONE live coder fleet-wide, ours.
   PITFALL THIS TICK: FIRST dispatch attempt ran with an EMPTY prompt (I referenced
   prompts/coder-DECKFOLD1-l2t1240.txt BEFORE writing it). Wrapper killed before harm,
   worktree reused. LESSON (added to skills): write the prompt file, verify its size,
   THEN dispatch.
4. COMP-1 ADVC RE-RUN LIVE (cloud, no fleet lock): bash pid 1873413/hermes 1873473,
   log logs/advc-COMP1-fix2-l2t1230.log, REPORT PATH
   reviews/SHORTHAND-COMP-1-fix2-l2t1230.md. Focus: N1 stub-honesty closure incl. the
   fixer's flagged question (esbuild-extract honesty test vacuous or real), both
   campaign legs still proven, bundled canonical minor, §2 provenance correction,
   MANIFEST 58c447eb byte-identical, baselines zero-new.
5. W2-11 GATE RUNS 7+8 -> TWO HONEST HARNESS DEFECTS FOUND AND FIXED (orch-owned file,
   committed fe324015 + 48b9686a):
   - run 7: vacuous 0->1 stall — a 422 with ZERO unknown-noun labels (gap/ambiguity bar,
     mint cannot help) counted as a stall. Now breaks honestly to the deck re-draw loop.
   - run 8: raw-count stall lied — model draws surface a DIFFERENT noun set per cycle
     (5 old labels ALL minted, 5 fresh labels appeared => genuine progress counted as
     stall). Shrink metric is now fresh-unknown labels (labels not yet answered);
     'Record already exists' 422 counts as minted (idempotent-by-label); honest spine
     stall = two consecutive draws barred on ALREADY-MINTED labels.
   First-hand product check while diagnosing: /api/resolve 'MagWash 2' returns BOTH
   tier-1 records (MAT-magwash-2-adqw minted + MAT-w211-magwash2 seeded) -> run 7's
   0->1 flip was ambiguous-noun noise, not a spine mint failure. I ALSO deleted the 8
   prior-run minted MAT-* proposals from the lane data repo (test data per Brad) to
   reset the ambiguity noise for run 9.
6. GATE RUN 9 LAUNCHED (orch-run, after the metric fix): pid 1917430, log
   logs/w211-gate-full-l2t1315-run9.log. D1-D3 were green in runs 7+8 (5.3m/2.9m total).
7. PROTO-AI-13 recount: n=192/500 (last ts 2026-10-13T07:12Z — ZERO accrual in 7.5h)
   INSUFFICIENT-side, no action.

LIVE at exit (not killed):
- cl-coder DECK-FOLD-1: hermes child of dispatch pid 1902444 (flock wrapper 1902382/
  1902443), log logs/coder-DECKFOLD1-l2t1240.log. Fleet lock legitimately OURS.
- cl-adversarial-reviewer COMP-1 fix2: bash 1873413. Report path pinned above.
- W2-11 gate run 9: pid 1917430 (expected ~5-8 min).

QUEUE / NEXT TICK (priority):
(1) Gate run 9 result: D4 green -> W2-11 D4 leg closed -> continue D5/D6 (they were
    'did not run' behind D4). D4 fails AGAIN on a NEW shape -> stop, that is the third
    harness-shape class: escalate as spine investigation (the run-8 evidence shows the
    spine mint path WORKS — 20 fresh labels answered across runs 7+8 — so a real spine
    failure now would be ambiguous-noun oscillation between the two seed+mint records:
    consider making the seed record name unique from the mintable vocabulary, an
    orch-harness seed-leg change, if run 9 shows ambiguous-noun churn on MagWash).
(2) COMP-1 fix2 advc verdict: ACCEPT -> orch self-verify (4 mandated server files green,
    server tsc 0 / app tsc 23, MANIFEST 58c447eb, three-dot diff scope) -> merge --no-ff
    -> cl-lane-stack.sh 2 restart BACKGROUND (cues YAML new config surface) -> browser
    gate :5193 split live legs, receipts/SHORTHAND-COMP-1/<ts>/. FIX -> architect (two
    cycles consumed).
(3) DECK-FOLD-1 coder exit -> read report -> advc (unique reviews/DECK-FOLD-1-l2t<ts>.md
    + explicit REPORT PATH line) -> ACCEPT -> self-verify per spec verification commands
    -> merge --no-ff -> stack restart (NEW config/drafting/deck-review.yaml = product
    YAML) -> browser gate (new surface) -> THEN lift the W2-11 trap warning (un-seed /
    A5e re-seed, orch-owned harness).
(4) COMP-2 remains coder-READY (spec d9945eca) — queue behind DECK-FOLD-1 for the fleet
    lock. THREAD-ASK-1 picker/answer-binding legs are coder-able too; mint-floor leg
    waits on Brad's in-spec OQ answer (never re-asked until the spec draft exists).
(5) PROTO-AI-13 recount each tick (n=192, stalled since 07:12Z).
(6) G2e deterministic re-shoot brief (carries from l2t2010).

assumptions:
- AS-LANE2-D4-MINT-REPLAY-HARNESS-L2T1110 SUPERSEDED by:
  AS-LANE2-D4-MINT-REPLAY-FRESH-METRIC-L2T1235 (open until gate 9 green): shrink metric =
  fresh (never-minted) unknown labels; 'Record already exists' 422 = minted (idempotent
  by label); honest spine stall = two consecutive all-already-minted draws; zero-unknown
  422 hands off to the re-draw loop. Evidence: run-7/8 per-cycle logs + orch /api/resolve
  probe showing seed+mint duplicate-label ambiguity.
- AS-LANE2-W211-MAGWASH-DUP-LABEL-L2T1235 (open until D4 green): two material records
  named 'MagWash 2' (seed MAT-w211-magwash2 + prior mint) make the noun ambiguous-noun,
  not unknown-noun; 8 prior minted MAT-* proposals deleted from the lane data repo
  (test data per Brad) to reset. If run 9 churns on ambiguity again, rename/retire the
  seed row in the harness seed leg (orch-owned) rather than fight it per-run.
- AS-LANE2-EMPTY-PROMPT-DISPATCH-NEAR-MISS-L2T1240 (process lesson, closed): write and
  size-verify the coder prompt file BEFORE launching the flock wrapper.
- AS-LANE2-COMP1-LIVE-LEG-SPLIT-L2T0530 (open until COMP-1 browser gate closes): unchanged.
- AS-LANE2-ADVC-FILENAME-TICKET-L2T0530: honored this tick (explicit REPORT PATH line).
- Carried open (unchanged): AS-LANE2-THREAD-MINT-SURFACE-GAP-L2T0330 (now OWNED by
  THREAD-ASK-1), AS-LANE2-COMPOSER-NOHUP-DEATH-L2T0330, AS-LANE2-DECKFOLD1-CREATED-L2T0230,
  AS-LANE2-W211-GATE-RUN4-DECKREVIEW-EMPTY-L2T2230, AS-LANE2-W28-GATE1-INVALID-ACCEPT,
  AS-LANE2-W28-A5D-ACCEPT-GATE-BY-DESIGN, W211-GATE-HARNESS-ORCH-OWNED,
  W211-MAGWASH2-KIND, W211-LANESYNC-SYMLINK-LOADER-GAP, W28A5FIX-EVIDENCE-LISTS-COMMITTED,
  SEMANTICPASS-DEBT, EXA-CREDENTIAL-DEAD [BRAD-side], WS6-R3/R2,
  BROWSER-REVIEWER-FABRICATED-ROUTE, SHORTHANDCORPUS-CLI-VERBATIM,
  SHORTHANDCHAT-CRIT4/GATE1/GATE3, BASELINE-PROBE, W289-PROMPT-REBUILT,
  W211-ORCH-APPLIED-DOC-NITS, AS-LANE2-THREAD-ASK-1-CREATED-L2T1110 (Brad OQ open).

blocker: none blocking lane flow. THREAD-ASK-1 mint-floor leg waits on Brad's in-spec OQ
answer (recorded, never re-asked until the spec draft exists); no live dataset hazard
(Brad: all records test data).
next check: (1) gate run 9 log tail (GATE9 EXIT line); (2) advc report
reviews/SHORTHAND-COMP-1-fix2-l2t1230.md exists? verdict?; (3) coder DECK-FOLD-1 alive
(flock wrapper 1902443)? report wip exists?; (4) trunk tip (DECK-FOLD-1 merge may move
it only after advc); (5) AI-13 recount.

## ADDENDUM l2t1335 close (~13:33 EDT): gate run 9 RESULT + self-flag
D1-D3 GREEN. D4: the corrected mint-replay worked HONESTLY (cycle 1: fresh=0, clean
handoff to re-draw), but ALL 5 re-draws returned 422 -> 0 checkboxes. SELF-FLAG: my
pre-run deletion of the 8 prior-minted MAT-* proposals was likely the WRONG reset —
those records WERE the scientist's accumulated vocabulary; removing them re-unknowned
the nouns so every fresh model draw re-barred 422 (run 7's convergence worked BECAUSE
the minted vocab existed). Resume plan for next tick: (a) the honest loop is mint-THEN-
recompile-replay until the DRAW completes — the re-draw leg's compile body should ride
the SAME answered body and the mint loop should keep cycling WHILE fresh labels appear
across DRAW attempts (mint across draws, not within one draw); alternatively (b) seed
the answer-vocabulary deliberately in the harness seed leg (test data per Brad) so the
first draw completes and only the trap-warning UNmatched vessel labels stay unresolved —
run 6's 5-draw evidence shows the completion shape needs most nouns resolvable. Decide
by measurement: replay the answered body manually (orch precheck pattern) with the run-9
fresh noun set minted, count draws to completion.
