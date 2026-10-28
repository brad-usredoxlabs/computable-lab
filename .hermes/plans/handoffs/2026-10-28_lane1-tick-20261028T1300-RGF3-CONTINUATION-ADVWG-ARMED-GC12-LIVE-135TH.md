# Handoff — lane 1 tick 2026-10-28 12:40-13:00 · RGF attempt-2 DIED (admission expiry) → attempt-3 CONTINUATION relaunched slot-0 · adv-review watchdog armed · GC-12 + GC-13-SC live — 135th

Supersedes the NEXT-TICK playbook of the 134th ONLY for the GC-11 RGF line (its coder died
mid-run; a continuation replaced it, and the adversarial dispatch is now AUTOMATED via a
watchdog). GC-12 and GC-13-composer lines from the 134th stand verbatim.

## Executed this tick

1. RECONCILE at start: RGF coder (slot-0, PID 1575242) and GC-12 coder (slot-1, PID 1584696)
   both ALIVE and progressing (RGF: 2 commits b55c7b80 D3 + 4aaa66c2 D4 in
   wt/gc-11-rungate1-lane1-l1t1150 + 54 lines uncommitted D5/D6 RED tests; GC-12: early, no
   commits yet). GC-13 re-anchor composer live (systemd unit cl-l1-sc-gc13re-l1t1235, hermes
   1590390). Stack healthy 200/200.
2. MID-TICK EVENT: RGF coder DIED at 12:50:03 — log shows 'API call failed after 3 retries:
   inference request expired while waiting for admission', rc=0. NOT a completion: only D3+D4
   landed; D1/D2 (MAJORS) and D5/D6/D7 (minors) open. Slot-0 released with the process.
3. RGF ATTEMPT 3 CONTINUATION dispatched slot-0 at 12:54 (unit cl-l1-gc11rgf3-l1t1300, launcher
   launch-GC11-rgf-l1t1300.sh, slot pid GC11RGF3-1613222, hermes child 1613225 — fleet total
   stays exactly 2). Prompt prompts/coder-GC11-rgf-l1t1300.txt resumes the SAME worktree,
   tells it D3/D4 are done, its own uncommitted RED tests are there to finish, and the
   remaining defects are D1, D2, D5, D6, D7. Report path (unique):
   gc11-rungate1-fix-report-l1t1300.md; end-marker 'GC11 RGF DONE <sha>'.
4. ADVERSARIAL-REVIEW WATCHDOG (unit cl-l1-advrgf-l1t1305): armed 12:49:53 waiting on coder PID
   1575242; it FIRED correctly at 12:51:13 when the coder died and started a review of the
   STALE partial tip 4aaa66c2 — I STOPPED the unit mid-flight, because attempt 3 is adding the
   rest of the delta to the same branch; a review of the incomplete delta is worthless.
   Verified no adversarial-reviewer process survived the stop, no partial report in reviews/.
   Going forward: MANUAL dispatch at attempt-3 exit (no more watchdog on this line). Review
   prompt is pre-staged and cite-corrected: prompts/advreview-GC11-rgf-l1t1305.txt (defect list
   of record = receipts/GC-11/RUNGATE1/20261028T152158Z/report.md; base eec1a4ca; frozen trio;
   expect >=234 tests; D3 deep re-check duty enumerates per-run state). At attempt-3 exit:
   capture tip sha, stamp the report path with the tick ts, dispatch
   `hermes -p cl-adversarial-reviewer -z "<prompt> + IMPORTANT ADDENDUM: delta tip <sha>"`
   background, log logs/advreview-GC11-rgf-l1t<ts>.log, report
   reviews/GC11-advreview-rgf-l1t<ts>.md, end-marker 'ADV-RGF DONE'.

## LIVE AT BUDGET — next tick reconciles, NEVER re-dispatch while alive

- RGF attempt-3 coder: slot-0, pid file GC11RGF3-1613222, hermes 1613225, started 12:54,
  expected 60-120 min -> due ~13:55-14:55, 2x ~15:00. Log coder-GC11-rgf-l1t1300.log, report
  gc11-rungate1-fix-report-l1t1300.md. ON EXIT: the step-4 adv dispatch above; then the 134th's
  accept-chain (orch verify vitest >=234 / tsc 12 no-growth / server 14/14 / per-defect RED ->
  MERGE --no-ff -> RUNGATE2 from prompts/browsereview-GC11-rungate2-l1t1235.TEMPLATE.txt).
  If it dies AGAIN on admission expiry: read the worktree commits, write a FRESH continuation
  prompt that names what is now committed; two consecutive infra deaths on the same delta =>
  escalate NInfer admission-expiry as infrastructure defect, do not keep re-rolling blindly.
- GC-12 coder: unchanged from the 134th (slot-1, GC12-1584696, hermes 1584699, started 12:27,
  due ~15:00, 2x ~17:00; on-exit chain: adv gate delta 6987f286..HEAD + boundary check vs
  CalibrationCurveView, then orch verify, then MERGE, then its OWN browser gate).
  No commits in its worktree as of 12:52 — normal for minute 25 on this endpoint.
- GC-13 composer: unit cl-l1-sc-gc13re-l1t1235 alive at budget (log shows SC-START 12:33;
  report gc13-reanchor-l1t1235.md not yet written). On exit: orch cite-spot-check the
  CONFIRMED/MOVED/STALE table before GC-13 claim. GC-13 deps say GC-12 — composer work is
  read-only prep, permitted.

## assumptions:

- No new assumptions this tick. AS-L1T1235-1/-2 (134th) stand, evidence_debt=false.
- No open evidence-debt entries in the lane.
