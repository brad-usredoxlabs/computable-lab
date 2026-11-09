# HANDOFF lane-2 2026-10-28T02:10 EDT (orch l2t0150; supersedes §NEXT of the 0215 handoff)

## Since 0215 handoff
1. ADVC-1 LANDED (pid 300752 exited rc=0 01:48): reviews/L2-SUITE-A-uifix2-advc1-l2t0115.md
   VERDICT: FIX — 2 MAJOR + 3 MINOR on 5bba9c27:
   - D1 MAJOR leg A: single global turnOfferLabwares re-routes turn-1's wells onto turn-2's
     plate (reviewer probe {lbw-plate-B: [A1,B1]}) / erases them on a no-offer commit —
     violates the diff's own stated invariant (eventWellIndex.ts:64-67).
   - D2 MAJOR leg D RESCOPE REFUTED: the minted-record citation is FALSE. INDEPENDENTLY
     confirmed by orch same tick: grep over /home/brad/.computable-lab/worktrees/main/
     records/ — zero files contain 'clofibrate1'; no MAT-1-mm-clofibrate1-mm-clof-l84l.
     Doubling re-enters CLIENT remit.
   - D3 MINOR raw-NUL bytes -> leg-D test stored as binary git blob (unreviewable).
   - D4 MINOR dedupe call-site (resolvers.ts:808) mutation-unpinned (return rows -> 3/3 green).
   - D5 MINOR ClarificationPicker.test.tsx:351 unhandled-rejection leak (vitest
     'Unhandled Errors' block, false-positive warning).
   Honest-claim checks: tsc 12 CONFIRMED, suites CONFIRMED, fetch-mock repair CONFIRMED;
   two report claims REFUTED (leg-A batch invariant, leg-D record citation).
2. FIX RUN 1 DISPATCHED 01:58 (cycle 1 of max 2): slot-0 acquired; systemd unit
   cl-l2-uifix2-fix1-l2t0150, main pid 360643, coder child 360649 (alive at checkpoint),
   log logs/coder-SUITEA-uifix2-fix1-l2t0150.log, prompt
   prompts/coder-SUITEA-uifix2-fix1-l2t0150.txt (defect list verbatim + D1 two-turn RED-proof
   + D4 mutation-must-fail acceptance + no-unhandled-error acceptance + fabricated-citation
   removal), SAME worktree/branch wt/L2-SUITE-A-uifix1-lane2-l2t1755 @ 5bba9c27, report
   deliverables/L2-SUITEA-uifix2-fix1-report.l2t0150.md (marker 'L2SUITEA-UIFIX2-FIX1 DONE
   <sha>'). Expected exit ~03:30-04:30 (5 defects, small diffs).
3. Evidence debt AS-L2T0115-CLOFIBRATE-MINT-CLAIM-UNCONFIRMED CLEARED (refuted) —
   assumptions.md updated.

## NEXT TICK STARTS HERE
A. POLL logs/coder-SUITEA-uifix2-fix1-l2t0150.log for the DONE marker + report
   'STATUS: complete'. Do NOT re-dispatch while 360649 (or its flock parent 360643) lives.
   On exit -> ADVC CYCLE-2: cloud OpenRouter reviewer, diff scope = fix commits only
   (5bba9c27...HEAD), mandates: D1 two-turn test has teeth (mutation: global field restored ->
   RED), D2 fix lands at the real doubling producer (no new invented citation; RESCOPE only
   with a real grep-hit path), D3 blob is now a text diff, D4 call-site mutation now fails,
   D5 suite run shows NO unhandled-error block, tsc==12, app/-only. Report
   reviews/L2-SUITE-A-uifix2-advc2-l2t<tick>.md.
B. On ACCEPT: self-verify (open diff 64d266af...HEAD, run the 9+2 suites cwd=app yourself,
   tsc==12, spot the fix commits) -> merge --no-ff into cl/integration-2 (trunk 8c6d8297 docs
   tip; app-diff must not conflict) -> stack restart background=true (no YAML expected) ->
   RE-GATE 3 per 0215 handoff step A (criteria verbatim legs A/B/C/D/E, P7-footprint AMENDED
   = mix arm post-WELLSET only, restored-turns discount, leg E may cite unit pins, receipts
   /home/brad/.hermes/cl/receipts/L2-SUITE-A/<ts>/). Clofibrate doubling MUST now be verified
   fixed in-gate (it is client remit). Second 'fix' verdict = cycle cap -> architect with
   both defect lists.
C. SUITE-A CLOSE on re-gate-3 accept -> flip task-list under lock -> fire
   launchers/launch-WELLSET-l2t17xx.sh (self-waits for a free slot, gate-enforced).
D. THEN L2-THREAD-SCOPED-1 claim (spec promoted, OQs ruled §14; §9 hot-file rule: branch tip
   MUST contain merged uifix2 — verify before branching). Then L2-CHAT-UI-1 composition.

## LIVE AT CHECKPOINT (do not duplicate)
- cl-coder fix-run-1 LIVE slot-0 (flock pid 360643, coder 360649, unit
  cl-l2-uifix2-fix1-l2t0150). Fleet 2/2 (slot-1 = lane-1 GC-11 fix1 pid 170248, not ours).
- computable vision slot FREE (nothing to gate — candidate not merged).
- Trunk 8c6d8297 (docs tip; product tip e706359e). :5193 200; :3093 alive (:3093/health 404
  = no such route, backend serves other paths — alive as of prior ticks).

## assumptions
- Carried: all entries from the 0155/0215 handoffs unchanged EXCEPT
  AS-L2T0115-CLOFIBRATE-MINT-CLAIM-UNCONFIRMED, now CLEARED-REFUTED (see assumptions.md).
- NEW AS-L2T0150-FIXRUN1-D2-CLIENT-REMIT (ruling, this tick): with the mint-claim refuted,
  the label doubling is client remit; fix-run-1 prompt D2 demands the fix land at the real
  producer or a RESCOPE backed by a real grep-hit. Evidence-debt: none open.

## HEALTH / BUDGET
Entered ~01:50, checkpoint ~02:10 (actions: reconcile advc-1, verdict triage, orch
independent record-search, fix-run-1 dispatch on slot-0, task-list + assumptions update,
this handoff). No coder spec-composition dispatched: WELLSET prompt+launcher already exist
(gated); THREAD-SCOPED spec promoted; CHAT-UI-1 composition deliberately waits for
re-gate-3 receipts per its task block.
