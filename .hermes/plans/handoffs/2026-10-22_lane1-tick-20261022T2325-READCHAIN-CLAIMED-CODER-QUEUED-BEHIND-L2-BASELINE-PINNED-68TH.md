# Handoff — lane 1 tick 2026-10-22 23:25 → INSTR-READCHAIN-1 CLAIMED + CODER QUEUED (fleet-behind-lane-2); BASELINE PINNED — 68th

Author: orchestrator cron tick l1t2305 — lane 1 only.
All git via -c core.fileMode=false. :3001/:5174 untouched all tick.

## Reconcile

- No prior in-progress lane-1 workers. COLLAPSE-2 done last tick (done + completed line
  confirmed in the task block at :7262-7263; the 'in-progress' grep hit at :7383 is inside
  that same done-block's nested tick_reconcile fields — status line reads done).
- Trunk a9da2cef (docs) / code == 760545cb. Lane stack :3092/:5192 200/200 serving merged
  trunk. Vision slot free. No scouts/reviewers live.

## Fleet lock situation (recovery, not idle)

- Lock HELD by lane-2 queue-mixrole1-l2t2200.sh (bash 1999795, since 22:17). Its pid-file
  entry names the DEAD mixfrac fix2 pid (1792720585 gone; fix2 exited rc=0 22:16) — the
  queue holds the flock while waiting up to 3h for MIXFRAC-1 to merge on lane-2 trunk
  (compositionFractions.ts still absent => gate still waiting; could release as late as
  ~01:17 or abort with GATE-FAIL). NOT my lane to fix; do not kill lane-2's queue.
- Per fleet-single rule I dispatched NO coder directly. Instead the claim + all
  claim-time prep happened this tick, and the coder is QUEUED behind the flock via
  systemd-run --user --collect unit cl-l1-coderq-readchain-l1t2305 (bash 2210976,
  STARTED 23:22:11, survives tick exit). On acquire it verifies trunk delta vs pin
  a9da2cef (docs-only tolerated, code-delta => abort for orch re-pin), creates
  /mnt/vast/home/brad/git/wt/instr-readchain-1-lane1-l1t2305 (branch
  cl/lane1-instr-readchain-1-l1t2305), stamps the pid-file
  'l1t2305 INSTR-READCHAIN-1', launches hermes -p cl-coder with
  prompts/readchain-coder-l1t2305-prefab.txt (<tag> substituted), log
  logs/coder-READCHAIN1-l1t2305.log. NO duplicate dispatch while that unit is alive.

## Claim-time work completed (this tick)

1. READCHAIN-1 claimed in the task list under task-list.lock (status in-progress, owner
   + claim evidence block).
2. SPEC CITES RE-PINNED first-hand at current trunk: ActiveReadRequestBody
   eventGraphRef/measurementContextRef/readEventRef MeasurementHandlers.ts:38-40;
   executeInstrumentApplianceJob useAiChat.ts:788 (apiClient call :838);
   performActiveRead validateActiveReadParameters :126 / fixture write :137 / sidecar :186
   (dispatch-before-gate confirmed); EQP-${slug} fallback InstrumentApplianceJob.ts:110-115
   present (delete target), GEMINI_EM_EQUIPMENT_RECORD_ID :104 blessed; liveGate pin file
   md5 9fcd1b92f7b53aaad15a916b90f01669 (coder must end with it byte-identical).
3. FAIL-FILE BASELINE PINNED at a9da2cef: readchain1-baseline-failfiles-l1t2305.txt
   (server 102 + app 63 fail-files, counts validated against vitest summaries; raw logs
   readchain-pin-server/app-l1t2305.log). 12 server files are parallel-flakes: serial
   re-run by me = 12 files / 90 tests / 0 fail (AS-272). Closes composer open-question-3.
4. Typecheck baselines: server tsc 0 errors; app tsc 24 error lines
   (readchain-pin-app-tsc-l1t2305.txt) — criterion 8 is delta-zero vs these.
5. Coder prompt prefab written (unique report path readchain-1-report-l1t2305.md,
   §C no-minting constraint verbatim, hard stops, pin paths).

## Queue state

- INSTR-READCHAIN-1: in-progress, queued-coder. Expected coder start: when lane-2
  releases (mixfrac-merge gate; up to ~3h). Expected run ~2-4h per collapse history ->
  due check ~start+2h at next ticks; 3x escalation per SOUL 7b from coder start.
- NEXT READY ITEM: NONE in the approved list (READCHAIN-1 was the last todo; §C minting
  is architect/Brad sign-off, not claimable). No spec-composer dispatched — inventing a
  wave-6 item is prohibited; next work requires intake.
- Deadmount ruling STILL ABSENT (request file only) — AS-258 fallback A stands; NOT
  re-asked. qms8c-cleanbreak decision unchanged (md5 8b67f579a7029913ba9151cd4f099e51),
  NOT re-asked.

## assumptions:

- AS-272 (NEW): READCHAIN baseline 12-server-file parallel-flake set; serial re-run
  proof in pin header; evidence-debt none.
- AS-273 (NEW): lane-2 queue holding the fleet flock behind an unmerged lane-2 item is
  treated as legitimately live (script alive + gate logged); lane-1 coder queues on the
  flock rather than escalating. If next ticks show the lane-2 unit still holding at its
  3h GATE-FAIL timeout with no coder ever launched, flag cross-lane to the lane-2 tick
  (its handoff), not a lane-1 blocker. Evidence-debt: confirm at next tick the queue
  log shows either LOCK-ACQUIRED (lane-1 coder live) or lane-2 still waiting.
- Carried open unchanged: AS-262 (repeat honest-400 clause in every gate prompt — READ-
  CHAIN gates are server/app, no UI: browser gate rides at acceptance), AS-236, AS-258,
  AS-266, AS-268a amendment, AS-270, AS-271, plus the standing list (042, 082, 087
  PARTIAL, 088-089, 096-097, 099, 101, 119, 137 residual, 154, 201, 206, 209-212,
  217-219, 221, 227-230, 238-243, 247-248, 250-257, 259 residual-watch, 265 closed).
  pnpm-lock.yaml trunk dirt stands (pre-existing, not mine).

## live-worker checkpoint (budget expiry state)

- LIVE: cl-l1-coderq-readchain-l1t2305 (systemd transient, bash 2210976) — waiting on
  fleet flock; NO coder process yet (correct fleet-single behavior).
- Lane stack :3092/:5192 serving merged trunk. :3001/:5174 untouched.
- Vision slot free; thunderbeast free (no composer dispatched — no next item).

## NEXT TICK checklist

1. Read logs/coder-READCHAIN1-l1t2305.log: LOCK-ACQUIRED + hermes pid? -> reconcile as
   live coder (expected duration 2-4h, due check at +2h, do NOT duplicate).
   Still waiting -> check lane-2 mixfrac gate state (its log) and the 3h window; record
   elapsed in tick summary (SOUL 7b visibility).
2. If lane-2 unit hit GATE-FAIL/abort and released the lock WITHOUT launching, our queue
   acquires next (flock is not FIFO — retry flock observation) — our unit self-launches;
   verify worktree creation in its log.
3. On coder exit: adversarial gate (cl-adversarial-reviewer, unique report path
   advreview-readchain1-l1t<stamp>.md), then orch self-verify (spec acceptance criteria
   1-9 incl. liveGate diff-empty + solo-green, grep proofs, serial solo re-runs for any
   delta file), NO YAML expected => no restart; UI surfaces unchanged => browser gate
   scoped to the chatbot appliance-execution surface per 6b if any UI-visible behavior
   changed (server pre-flight + executor attach are backend; judge whether a browser
   receipt is warranted — acceptance criteria do not name a browser flow; document the
   judgement in the task block).
4. Deadmount/qms8c: unchanged, not re-asked.
