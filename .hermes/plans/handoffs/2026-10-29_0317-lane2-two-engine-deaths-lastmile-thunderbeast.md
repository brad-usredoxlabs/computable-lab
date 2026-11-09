# Lane-2 handoff — orch l2t0310 (03:17 EDT 2026-10-29)

Follows 2026-10-29_0214 handoff. NO merges, no trunk moves (trunk dcba6619 docs tip).
Two same-class appliance-2 engine deaths consumed this tick's dispatch decisions; both
items routed to the thunderbeast last-mile route per the standing handoff-0120/0214 rule
(NO blind attempt 3/4 on :18080).

## WHAT HAPPENED

- 02:23:33 stagger opened; THREAD-SCOPED resume queue self-launched slot-0 (coder 2828863).
  02:41:03 it died rc=0: "inference request expired while waiting for admission" — same
  class as its l2t0055 death. 17 min, zero report growth, zero commits. Leg C diff
  preserved uncommitted (HarnessChatPane .tsx/.css + useAiChat.ts, +131/-1).
- 03:09:47 WELLSET attempt-3 (2743775, ~2h12m) died with the hermes OUTPUT-TOKEN-CAP
  warning ("reasoning consumed the entire budget each time") — rc=0, RED legs unchecked,
  ZERO coder commits, but 619 lines of REAL product work sat in the worktree.
  ORCH ACTION: preserved it as explicit WIP-CHECKPOINT commit b924b3ad on
  cl/lane2-wellset-resolver-1 (probe files NOT committed). This is evidence, not input —
  the last-mile run re-verifies it with tests.

## LIVE WORKERS (last-mile route, cl-worker on thunderbeast, NO fleet slot held)

1. THREAD-SCOPED-1 Leg C last-mile — unit cl-l2-threadscop-lastmile-l2t0255, launcher
   MainPID 2865859 / hermes 2865863 (socket ESTAB to thunderbeast:8080 verified 03:17),
   started 02:55:53 (~22 min at checkpoint). Log
   logs/worker-THREADSCOPED1-lastmile-l2t0255.log, prompt
   prompts/worker-THREADSCOPED1-lastmile-l2t0255.txt. SAME worktree
   wt/L2-THREAD-SCOPED-1-lane2-l2t0310 / branch cl/lane2-thread-scoped-1-l2t0310.
   Expected 45-90 min -> 2x ~04:25, 3x ~05:40. Report APPENDS "## LEG C — last-mile run
   (l2t0255)" to L2-THREAD-SCOPED-1-report.l2t0310.md; markers 'STATUS: complete' +
   'L2THREADSCOPED1 DONE <sha>'.
2. WELLSET-RESOLVER-1 last-mile — unit cl-l2-wellset-lastmile-l2t0310, launcher MainPID
   2888973 / hermes 2888977 (socket ESTAB verified), started 03:15:59. Log
   logs/worker-WELLSET-lastmile-l2t0310.log, prompt
   prompts/worker-WELLSET-lastmile-l2t0310.txt. SAME worktree
   wt/L2-WELLSET-RESOLVER-1-lane2-l2t2230 / branch cl/lane2-wellset-resolver-1 (tip
   b924b3ad WIP checkpoint). Scope given to it: threading 4d ONLY product code left +
   RED->GREEN legs 1-6 + sweeps + squash-ready commit. 2x ~04:55, 3x ~06:25. Markers
   'STATUS: complete' + 'WELLSET-RESOLVER-1 DONE <sha>' appended to the SAME report.
   DO NOT re-dispatch either while its unit is active
   (`systemctl --user show <unit> -p ActiveState`).

## FLEET / ENGINE STATE

- :18080 now has ZERO live sockets; both slot pid files are STALE bookkeeping (slot-0
  THREADSCOP1R-2756167 died 02:41; slot-1 WELLSET inner 2617985 exited 03:09 — flock
  holders released at process exit). A fresh appliance-2 launch is permissible per
  stagger-vs-pid-file timestamps (last: 02:23:33) — but BOTH lane-2 items are covered by
  the thunderbeast last-mile route; do not double-cover.
- Thunderbeast: orch + 2 cl-worker sessions = 3 of the 4-session cap. Reserve headroom.
- Engine-death class is now 3-in-a-row on :18080 (2x THREADSCOP, 1x WELLSET attempt-3
  output-cap variant). If the two last-mile runs ALSO fail, this is a lane-2 escalation:
  the remaining scope is small and orch should hand it to architect as "last-mile
  completion cannot land on current serving" with the preserved commits as evidence,
  NOT queue attempt N+1.

## GATES OWED (next tick)

- Both last-mile exits: completeness evidence FIRST (report markers + commit + tree
  clean). Then ADVERSARIAL GATE: THREAD-SCOPED advc c1 prompt stays ARMED
  (prompts/advc-THREADSCOPED1-c1-armed-l2t0015.txt, diff base 1d5b5e39). WELLSET advc c1
  prompt ARMED at prompts/advc-WELLSET-c1-armed-l2t0235.txt (diff base 48a9ee00 — covers
  b924b3ad + lastmile; replace l2tPLACEHOLDER in the report path with the tick id before
  dispatch). On ACCEPT: self-verify (run the named suites yourself, cwd=worktree/server),
  then MERGE --no-ff, then THREAD-SCOPED additionally owes: stack restart +
  cl-browser-reviewer vs :5193 + live two-threadId curl re-proof on :3093
  (clears AS-L2T2350-CURLPROOF-LOCALPORT). WELLSET: server-side + YAML -> stack restart
  + no browser gate (spec); SUITE-A P7 re-drive may ride post-merge.
- L2-CHAT-UI-1 claim gate stays CLOSED until THREAD-SCOPED merges through all gates.

## assumptions

- NEW AS-L2T0310-WELLSET-WIP-COMMIT: b924b3ad is an ORCH-authored preservation commit of
  a dead worker's uncommitted work — treated by the last-mile run and advc as
  unverified-input-to-be-tested, never as accepted code. Evidence debt: cleared when the
  last-mile run's RED->GREEN legs pass on top of it and advc accepts the combined diff.
- NEW AS-L2T0310-LASTMILE-ROUTE: thunderbeast cl-worker substituted for appliance-2
  after 3 same-class engine deaths (authorized by handoff-0214's explicit "route
  last-mile to cl-worker" fallback). Evidence debt: cleared at first last-mile ACCEPT.
- OPEN (carried): AS-L2T2230-WELLSET-ATTEMPT2 (engine-death class),
  AS-L2T0055-THREADSCOP-RESUME-ADOPT, AS-L2T2350-CURLPROOF-LOCALPORT,
  AS-PROTO-AI-12-W1 (router QAD-Q4_0), AS-L2T2053-* family, AS-L2T2015-LIVE-THREAD-ROOT,
  AS-L2T0015-WORKTREE-TAG-L2T0310.
- No credentials recorded anywhere.

## HEALTH / BUDGET

Entered ~02:31, checkpointed ~03:17 (~46 min). Trunk dcba6619 clean. Stack :3093/:5193
200/200. Cheap gate 0 due blockers; no human question re-asked. Next tick starts at
"## GATES OWED" + worker watch.
