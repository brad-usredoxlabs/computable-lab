# HANDOFF lane-2 2026-10-28T08:30 EDT (orch l2t0725 close; supersedes the 0810 handoff §NEXT)

## Since 0810 handoff (same tick, extended)
1. ADVC CYCLE-2 delivered 08:19 (reviews/L2-SUITE-A-uifix2-fix3-advc2-l2t0725.md):
   VERDICT: fix — 2 MAJOR, both inside ADVC3: (D1) product half unpinned — reverting
   EventEditorContext.tsx to e19c23fc keeps the whole pin set green while the cycle-1
   multi-offer-absorption bug returns (mandate-0 violation); (D2) tri-state not enforced at
   the binding boundary — explicit {e1:null} + single placed vessel STILL attributes at HEAD
   (reviewer probe [[PLATE-1],[A1,B1]]), binding-map vs ambiguity-map = two sources of truth.
   Everything else cycle-2 PASS: ADVC1/2/4/5, cross-suite app 59/59 + server 20/20, zero-new
   regressions.
2. FIX RUN 4 DISPATCHED 08:24 fleet slot-0: systemd-run --user --collect bare-path bash -c,
   unit run-p1361733-i60050480, flock holder 1361736, hermes 1361737, prompt
   prompts/coder-SUITEA-fix4-l2t0825.txt (ADVC3-only, scope-locked to eventWellIndex.ts +
   EventEditorContext.tsx + their tests; ADVC1/2/4/5 untouched), log
   logs/coder-SUITEA-fix4-l2t0825.log, SAME worktree/branch
   (wt/L2-SUITE-A-uifix1-lane2-l2t1755, cl/lane2-suite-a-uifix1-lane2-l2t1755), report =
   deliverables/L2-SUITE-A-uifix2-fix2b-report.l2t0530.md appends '## ADVC FIX RUN 4',
   markers 'STATUS: complete' + 'L2SUITEA-UIFIX2-FIX4 DONE <sha>'. Expected ~45-75 min;
   2x ~09:45, 3x ~11:00.
   PITFALL REPLAY: \$$ inside flock -c through two bash -c layers wrote literal '$' into the
   slot pid file; orch wrote the true PID (1361737) manually — AS-L2T0825-PIDFILE-DOLLAR.
   Working dispatch form stays: systemd-run --user --collect bash -c '...' (bare-path -t form
   still broken — matches the memory entry).

## NEXT TICK STARTS HERE
A. POLL fix-run 4 (git -C wt/... -c core.fileMode=false log; expect [L2SUITEA-fix4][ADVC2-D1]
   then [ADVC2-D2]; report '## ADVC FIX RUN 4' section + both end-markers). On exit (rc0 +
   marker): ORCH SELF-VERIFY — (a) FALSIFICATION: temp copy revert app/src/event-editor/
   EventEditorContext.tsx to e19c23fc in a scratch file, run the NEW producer pin — it must
   FAIL (do the revert in a scratch tree or via git show into /tmp + vitest only if safe;
   the reviewer's repro shape suffices if the pin tests the exported producer directly);
   (b) mandate probe {e1:null} + placements ['PLATE-1'] => NOTHING (read the RED leg);
   (c) full re-run cwd=app: eventWellIndex (3 files) + DeckStage.twoplate + Clarification-
   Picker + new producer test; (d) app tsc zero-new vs 20. Then ADVC CYCLE-3 CLOUD, scope
   502ec0f9..HEAD, unique report path reviews/L2-SUITE-A-uifix2-fix4-advc3-l2t<tick>.md.
   THIRD fix verdict on this gate = CYCLE CAP -> architect with all THREE defect lists
   (advc1, advc2, advc3). NO fix run 5. On ACCEPT: merge (see 0810 §A ACCEPT branch — still
   applies, trunk-check first, AS-L2T0735-MERGE-BASE-DRIFT), RESTART background=true (D3
   YAML), RE-GATE 4 browser :5193 unique receipts dir.
B. WELLSET + THREAD-SCOPED queues: still gated on SUITE-A done-flip; pollers
   run-p1159102/run-p1159104 armed 07:13, caps ~15:13. If fix4 drags past ~15:00, re-arm.
C. L2-CHAT-UI-1: not claimable (post-THREAD-SCOPED-1). MOUNT-NONEVENT-1/MATRES-REPLAY:
   AWAITING-BRAD, unchanged, never re-asked.

## LIVE AT CHECKPOINT (do not duplicate)
- cl-coder FIX RUN 4 LIVE slot-0 (hermes 1361737, flock 1361736, unit run-p1361733-
  i60050480, started 08:24; log may flush late — commits are the progress signal).
- Slot-1 FREE — intentionally: WELLSET/THREAD-SCOPED launchers self-claim on the SUITE-A
  done-flip; do NOT dispatch manually.
- Trunk UNCHANGED 71c09e65. :5193 200, :3093 200. No YAML merges yet.

## assumptions
- Carried: all prior entries stand except AS-L2T0630-TSC-BASE-21-RECONCILED superseded by
  AS-L2T0735-FIX3-REPORT-20-20-CONFIRMED. Open evidence-debt: AS-L2T0340-GATE3-TRAIL-
  COLLISION (clears on regate-4 accept) + AS-L2T0735-MERGE-BASE-DRIFT (until merge).
- NEW AS-L2T0825-PIDFILE-DOLLAR: in the systemd bare-path bash -c dispatch form, use a
  single-level flock command file or write the PID manually; nested \$$ corrupts it (not a
  blocker — lock itself was acquired correctly, verified by holder 1361736).

## HEALTH / BUDGET
Entered ~07:31; soft budget crossed ~08:16; fix4 dispatched 08:24 as the continuation of the
already-approved fix-cycle work (not fresh scope), then checkpointed at ~08:30 — no other new
work launched after budget. Actions this tick beyond the 0810 handoff: poll-to-completion of
advc2 via bounded delegate, read its full section 7 first-hand, dispatched fix4 ADVC3-only
scope-locked, task-list updated under queue lock twice, this handoff. SUITE-A in-progress
(advc cycle-3 + merge + browser regate-4 owed). Fix-run ledger on advc verdicts: fix3 (#1),
fix4 (#2) — third fix verdict = architect.
