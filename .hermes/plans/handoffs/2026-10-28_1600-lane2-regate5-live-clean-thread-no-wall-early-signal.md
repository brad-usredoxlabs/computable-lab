# HANDOFF lane-2 2026-10-28T16:00 EDT (orch l2t1520) — RE-GATE 5 PREP EXECUTED + TIER-2 GATE LIVE on clean environment

## Since the 10:05 handoff (l2t0930) — plan A executed end-to-end

1. THREAD HYGIENE (A.1a): the residue-carrying shared chat thread
   /home/brad/.computable-lab-lane2/worktrees/main/var/ai-threads/default/event-editor.json
   (261 msgs: tier-1 death + plan-validation turns) MOVED ASIDE ->
   event-editor.json.bak-l2t1520-regate5. Gate's thread now opens EMPTY.
   NOTE: the lane backend's DATA ROOT is CL_DATA_DIR=/home/brad/.computable-lab-lane2
   (worktrees/main under THAT), not /home/brad/.computable-lab (the latter is the
   main-tree's; do not confuse).
2. DECK RE-SEED (A.2): no seeder existed; orch-authored
   lanes/2/scripts/reseed-gate-decks-l2t1520.mjs (lane API PUT + verify):
   - main deck e0bedf9b -> EMPTY (0 events, 0 labwares) — new sha
     832e0bf187e11e40ca97edb2c404c9cc07a0f9f5 (VERIFIED by re-GET).
   - legs deck e5bb716f -> 1 labware lbw-seed-plate-96-flat, 0 events — new sha
     aeb91f7493f9fd1f0f0f94a92fc6a148d2e115ee (VERIFIED by re-GET).
3. PROXY CAPTURE ON (A.3 / AS-L2T0930-PROXY-ROUTE-OPAQUE cleanup): transient unit
   cl-l2-orproxy-l2t2130 could not take Environment via set-property;
   relaunched via lanes/2/scripts/relaunch-orproxy-capture-l2t1520.sh as unit
   cl-l2-orproxy-l2t1520 with CL2_ORPROXY_CAPTURE=1, Restart=always, listening
   :18099. Capture files continue in lanes/2/evidence/orproxy-l2t2130/
   (req-*.json/sse-*.log; next after sse-005). Old unit stopped.
4. RE-GATE 5 TIER-2 DISPATCHED directly (A.3, ladder record: tier-1 died twice on
   this plan): profile cl-browser-reviewer, -m deepseek/deepseek-v4.1-flash
   --provider openrouter, absolute venv path (skill pitfall honored), unit
   cl-l2-regate5-tier2-l2t1520, log lanes/2/logs/browserrev-SUITEA-regate5-l2t1520-tier2.log,
   prompt lanes/2/prompts/browserrev-SUITEA-regate5-l2t1520-tier2.txt (states the
   clean-thread + re-seeded pre-states + shas verbatim, tells the reviewer to read
   the newest sse-*.log if it hits the 'no usable draft arguments' wall — env vs
   product adjudication by upstream provenance).
   RECEIPTS: /home/brad/.hermes/cl/receipts/L2-SUITE-A/gate-l2t1520-regate5-tier2/
5. QUEUE LAUNCHERS RE-ARMED (both timeouts had fired ~15:13 with SUITE-A still
   open): queue-WELLSET-l2t0215.sh re-armed via unit cl-l2-queue-wellset-re1-l2t1520
   (armed 15:48), queue-THREADSCOPED1-l2t0310.sh via cl-l2-queue-threadsc-re1-l2t1520
   (armed 15:49). Both self-fire the WELLSET/THREAD-SCOPED coder dispatches the
   moment SUITE-A flips done (WELLSET launcher prefers slot-1, 60-min stagger is
   NOT enforced by the launcher — orch must check stagger before any manual launch;
   the queue path bypasses stagger, accepted as pre-authorized dispatch).

## EARLY POSITIVE SIGNAL (not a verdict — reviewer still analyzing)

run-main/trail.json (102 steps, full 16-shot P1-P8 coverage) shows NO occurrence of
'no usable draft arguments' anywhere in the main run, and p8_accept accepted=true
with a real preview bar ('1 event ... Accept'); p8_after_accept record shows a
placement landed (new sha be1c6bd1...). The regate-4 D1-D5 wall cluster did NOT
reproduce on the clean thread + re-seeded decks — strongly supports the
environment hypothesis (AS-L2T0930-REGATE4-D1-ENVIRONMENTAL trending CLEARED;
the tier-2 VERDICT line closes it).

## NEXT TICK STARTS HERE

1. READ the gate verdict: receipts dir report.md last line 'VERDICT: accept|fix'
   + trail + spot-check screenshots MYSELF (cite-check per
   browser-gate-receipt-audit skill). Unit cl-l2-regate5-tier2-l2t1520 (check
   `systemctl --user is-active`; expected duration ~60-90 min from 15:33).
2a. ON ACCEPT: SUITE-A -> done under task-list.lock (browser gate + advc3 + unit
   gates all closed; ledger: fix3 #1, fix4 #2, advc c1-c3 accept). The re-armed
   queue launchers self-fire WELLSET-RESOLVER-1 within ~60s (slot-0 currently
   FREE; lane-1 GC-12 coder died at 14:24 per its lane — verify slot pid files at
   fire time; the fleet may briefly run only WELLSET, fine). THEN write the done
   handoff, clear AS-L2T0930-REGATE4-D1-ENVIRONMENTAL + DECK-FIXTURE-DRIFT +
   PROXY-ROUTE-OPAQUE debts (capture served its purpose).
2b. ON FIX: read the defect list; if the wall reappears on this clean env, the
   prompt's sse-capture protocol gives upstream provenance — env -> re-gate 6 with
   different hygiene lever; product -> fix-run (cycle ledger: 2 fix-runs used,
   two more review cycles allowed before architect routing).
3. Small-item candidates unchanged (handoff l2t0930 §B): D6 per-well pixel paint,
   mint-row absence organic arm, proxy ERR_HTTP_HEADERS_SENT one-file fix.
4. MOUNT-NONEVENT-1 / (old) MATRES-REPLAY remain AWAITING-BRAD — not re-asked.

## LIVE AT CHECKPOINT (do not duplicate)
- cl-l2-regate5-tier2-l2t1520 ACTIVE (started ~15:33, reviewer analyzing run-main).
- Queue launchers re-armed WELLSET (15:48) + THREAD-SCOPED (15:49), 8h caps.
- Fleet slots both FREE at checkpoint; lane-1 GC-12 resume exited (its own lane's
  bookkeeping; its slot-0 flock released).
- Trunk f2cb526a. :5193/:3093 200. Proxy cl-l2-orproxy-l2t1520 live :18099 capture ON.
- Data mutations (TEST data, per Brad): thread file moved aside (backup path above);
  both gate decks re-seeded (shas above).

## assumptions
- Carried and standing: AS-L2T0350-FIX2-DEG-ARMS, AS-L2T0310-TSC-BASELINE-20,
  AS-L2T0310-CLOFIBRATE-MINT-FOLLOWUP, AS-L2T0455-SLOT1-PIDFILE-STALE,
  AS-L2T0520-CHATUI-TOPOLOGY, AS-L2T0520-CHATUI-LEGD-GATE,
  AS-L2T0540-FIX2-TOKENCAP-DEATH, AS-L2T0540-TSC-COUNT-DYNAMICS,
  AS-L2T0630-ADVC-TSC-20-20, AS-L2T0735-FIX3-REPORT-20-20-CONFIRMED,
  AS-L2T0825-PIDFILE-DOLLAR.
- AS-L2T0930-REGATE4-D1-ENVIRONMENTAL (EVIDENCE DEBT OPEN, trending cleared):
  clean-thread re-gate 5 reproduced NO wall in run-main; closed by the VERDICT line.
- AS-L2T0930-DECK-FIXTURE-DRIFT (debt, closing at gate): decks re-seeded to
  DECLARED pre-states with post-PUT verified shas, stated verbatim in the gate prompt.
- AS-L2T0930-PROXY-ROUTE-OPAQUE (debt): capture ON from 15:30; provenance readable
  for every gate-window call. Retire once the gate's wall-vs-no-wall adjudication
  cites an sse file (or the wall never reappears).
- AS-L2T1520-QUEUE-PATH-BYPASSES-STAGGER: the re-armed queue launchers grab any
  free fleet slot without the 60-min stagger check; accepted for pre-authorized,
  spec-complete items — record if a stagger collision ever degrades a coder run.
- NEW: lane backend data root is /home/brad/.computable-lab-lane2/worktrees/main
  (CL_DATA_DIR), NOT /home/brad/.computable-lab/worktrees/main (main tree's).

## HEALTH / BUDGET
Entered ~15:20, budget crossed ~15:55. Actions this tick: reconciled (no live
lane-2 workers; both queue pollers TIMEOUT-dead; slots free; trunk healthy),
executed re-gate 5 prep (thread hygiene, deck re-seed via new orch seeder,
proxy capture relaunch), authored+dispatched tier-2 re-gate 5 (verified live,
plans consumed, 102-step run-main captured, no-wall early signal), re-armed both
queue launchers, this handoff. No task marked done.
