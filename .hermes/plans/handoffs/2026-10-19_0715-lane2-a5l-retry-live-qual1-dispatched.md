# LANE 2 HANDOFF — l2t0645 (2026-10-19T07:15 EDT) — A5l retry live (first dispatch was a zero-work dud); W211-QUAL-1 CLAIMED+DISPATCHED; orphan backend generation cleared

Trunk: cl/integration-2 @ a40cfa1b (docs tip; code tip 55d6d6bb — all five containment SHAs
ancestor-verified vs a40cfa1b). Stack :3093/:5193 200 after authorized restart.

## RECONCILE / REPAIRS THIS TICK

1. ARCHITECT W28-A5l FIRST DISPATCH WAS INVALID (zero work, not a decision): pid 1642250
   exited code=0 ~10s after start. Root cause verified first-hand: the dispatch referenced
   prompts/architect-W28-A5l-l2t0625.txt which DID NOT EXIST (packet lived only under
   tmp-orch/); `hermes -z "$(cat missing)"` = empty prompt -> banner + "Input is not a
   terminal" + Goodbye!, log 4.8KB. Decision file absent. NOT counted as an attempt.
   PITFALL: dispatch scripts must verify the prompt file (test -s) before invoking hermes -z.
2. BACKEND ORPHAN GENERATION (lane repair, authorized surface): backend.log showed a crash
   loop from the 05:32 restart — `EADDRINUSE :3093` + a stale `index.lock` GitError in
   /home/brad/.computable-lab-lane2/worktrees/main/.git. Port :3093 was held by pid 1533187
   (healthy gen, cwd cl-integration-2/server, serving fine); the tsx --watch supervisor
   generation was crash-looping against it. Fixed with cl-lane-stack.sh 2 restart
   (background=true per known blocking pitfall). Post-restart: :3093/:5193 200, health ok
   (196 schemas/84 lint), LIVE ACTIVE profile re-verified = qwen3.8-thunderbeast
   (thunderbeast:8080, qwen3.8-flash-next) — config.yaml still shows DS-v4.1-OR (file lags
   live activation; the live route is authoritative).
3. W28-A5l RETRY DISPATCHED: packet copied to prompts/architect-W28-A5l-l2t0625.txt,
   launched via tmp-orch/dispatch-architect-a5l-retry-l2t0645.sh; bash wrapper 1707503,
   hermes 1707564 (verified alive with full prompt in argv). SAME decision path
   decisions/W28-A5l-ui-residual-set-fold-divergence-decision.md, SAME terminator
   'W28-A5l DECIDED'. Log lanes/2/logs/architect-W28A5l-retry-l2t0645.log. Expected 30-45
   min from ~06:56; 2x ~08:25, 3x ~09:45 (rule 7b; at 3x orch writes PROVISIONAL ruling
   from the evidence pack). Do NOT re-dispatch while 1707503/1707564 alive.
4. W211-QUAL-1 CLAIMED + DISPATCHED (was the handoff's #2 priority): preconditions all
   verified BEFORE dispatch — backend idle >=3 min post-restart, identity live re-verified
   (not from the lagging config file), containment SHAs ancestor-checked, all 8
   prompt/expectation sha256 re-verified verbatim vs eval/w211-qual-1/, fleet lock acquired.
   Dispatch prompt tmp-orch/qual1-exec-prompt-l2t0645.txt (timestamp filled + dispatch-tip
   pin a40cfa1b appended). Executor = cl-coder per spec:149/§472 (eval, not product code —
   fleet lock held FOR THE DURATION via dispatch-qual1-l2t0645.sh wrapper). Wrapper pid
   1723315, hermes 1723377 (alive, full prompt in argv). Log
   lanes/2/logs/coder-W211QUAL1-l2t0645.log. SMOKE must show 422 (200/500 = executor
   self-stops, no cohort). Cohort n=5x3 headless; NEVER interleave with a browser gate.
   Expected 30-90 min (author driver + smoke + cohort). 2x ~09:30.
5. PROTO-AI-13 RECOUNT: n=318/500 (last ts 2026-10-19T00:29:49Z) — FLAT 12th,
   INSUFFICIENT-side, no action.
6. Fleet coder state: QUAL-1 executor holds the lock; NO other coder dispatchable fleet-wide
   this or next tick while it lives.

## NEXT TICK (priority order)

1. W28-A5l: watch the decision file for 'W28-A5l DECIDED'. On a fix-surface ruling: claim,
   dispatch cl-coder ON THE FLEET LOCK (only after the QUAL-1 executor exits and releases
   it — check pgrep hermes -p cl-coder + the pid file) with the ruling verbatim + defect
   list w/ absolute screenshot paths; ADD the carried fold-hardening items (D3/D5
   channel-alive permanent pin, argumentPresent duplicate) to that dispatch per l2t0635.
   After merge + step-0 probe + containment -> A5 re-shoot r4 (tier ladder resets at tier 1,
   fresh receipts dir). New scope -> Brad.
2. QUAL-1: on EXITED, read log tail + receipts/W211-QUAL-1/. Validate before adopting:
   smoke draw-1 = 422, config-pin.json identity, REPORT.md verdict line with p_min=__
   literal, per-draw receipts + factset md5s, containment SHAs recorded. A SMOKE-STOP
   (200/500) or DEFERRED idle-window are honest outcomes — record, don't re-run blindly.
   DONE lane -> promote report path into task block, carry to Brad for p_min (his call,
   never ours). If executor died with zero receipts -> diagnose driver/auth, one bounded
   re-dispatch with a NEW unique receipts dir.
3. PROTO-AI-13 recount each tick.
4. SAMPLE-CARD-1 browser obligation (sample on /m vs /l — rides r3 finding F2) and MACH-1
   browser obligation both stay OPEN until an accepted gate covers them.

## Blockers / open obligations
- W28-A5D-R3: BLOCKED on architect W28-A5l (structured fields in task block; retry live
  with zero-work-dud note appended; on-change watch path unchanged).
- W211-QUAL-1: in-progress, executor live (fleet lock held).
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY — carried.
- Residual Brad item (unchanged): OR-profile forced-tool 400
  decisions/PROTO-AI-9-or-reasoning-amendment.md.

## assumptions:
- AS-LANE2-A5L-RETRY-SAME-ATTEMPT (orch l2t0645): the zero-work dud dispatch is not an
  architect attempt; the retry consumes the single W28-A5l ruling slot under the same
  packet/decision path. Evidence: empty-prompt banner log + absent decision file.
- AS-LANE2-QUAL1-IDENTITY-VIA-LIVE-ROUTE (orch l2t0645): sanctioned identity verified from
  the live /api/config/ai/profiles route post-restart, NOT config.yaml (file lags product
  activation). Consequence if wrong: executor's own capture-config STOPs on mismatch —
  fail-closed, no fabricated pin.
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY only (carried).

## live-worker checkpoint at exit (~07:15 EDT)
- Architect W28-A5l retry: wrapper 1707503 / hermes 1707564, started ~06:56, log
  lanes/2/logs/architect-W28A5l-retry-l2t0645.log, decision path above. NOT killed.
- QUAL-1 executor (cl-coder): wrapper 1723315 / hermes 1723377, started ~07:03, log
  lanes/2/logs/coder-W211QUAL1-l2t0645.log, fleet lock HELD by 1723315 (pid file records
  coder-W211QUAL1-l2t0645). NOT killed.
