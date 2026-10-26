# Lane-2 handoff — tick l2t1610 (2026-10-26 ~16:25 EDT) — 134th

## HEADLINE
FREEFORM resume-2 died to a NEW engine class ('inference request expired while waiting for
admission' x3, rc=0 16:01) — but it COMMITTED H1/H2/H3 (f13f2fc0/dbc633a7/63d942ea) before dying,
tree clean, report current. RESUME-3 dispatched scoped to ONLY legs H4+H5 (short prompt,
leg-scoped). Fleet slot 1 went to LANE 1's GC4 first (16:18) — our launch is a flock waiter queued
behind it (cross-lane FIFO, do not stop it). CHAT-1 regatefix2 healthy ~55 min in, no commits yet
(report legs all open), within expectation.

## LIVE WORKERS (do not duplicate)
- L2-CHAT-1 REGATEFIX2 (fleet SLOT 0 since 15:29): unit cl-l2-chat1-regatefix2-l2t1415, wrapper
  pid 2916344 (slot-0 pid file, alive-verified 16:21), hermes child 2916348. Worktree
  wt/L2-CHAT1-regatefix2-lane2-l2t1415, branch cl/lane2-chat1-regatefix2-l2t1415, base f30ff09d.
  Report deliverables/L2-CHAT1-regatefix2-report.l2t1415.md (mtime 16:04, STATUS in-progress,
  D1/D2/D3 RED legs all open, zero commits — consistent with RED-first plan; 2x-watch ~17:30).
  Log logs/coder-L2CHAT1-regatefix2-l2t1415.log, marker 'CHAT1 REGATEFIX2 DONE <sha>'.
  app/-scope ONLY. On exit: advc scoped f30ff09d...HEAD (unique report
  reviews/L2-CHAT1-regatefix2-advc1-l2t<next>.md) -> ACCEPT -> self-verify (app tsc set-equality
  vs 71-line baseline, touched vitest) -> merge -> restart -> browser re-shot NEW receipts dir.
  Prior-gate defect receipts /home/brad/.hermes/cl/receipts/L2-CHAT-1/2026-10-26_1353-regate-tier2/.
- L2-FREEFORM-1 RESUME-3 (queued for fleet SLOT 1 since 16:15): unit cl-l2-freeform1-resume3-
  l2t1615 (systemd-run --user --collect), flock waiter pid 3049920 alive; will start when LANE 1's
  GC4 (pid 3048747, hermes since 16:18) exits. Prompt prompts/coder-L2FREEFORM1-resume3-l2t1615.txt
  (short: H4+H5 ONLY — H1-H3 already committed; report-first, commit-per-leg, no tree re-explore),
  log logs/coder-L2FREEFORM1-resume3-l2t1615.log, report SAME append path
  deliverables/L2-FREEFORM-1-report.l2tl2t1110.md, marker 'FREEFORM1 DONE <sha>'.
  SAME worktree wt/L2-FREEFORM-1-lane2-l2t1110 branch cl/lane2-l2freeform1-l2t1110 HEAD 63d942ea.
  Expect start within ~1-2h of GC4 exit; 2x-watch from ITS 'CODER STARTED' line (read the log,
  don't assume dispatch time). On exit: advc 701f80c0...HEAD -> self-verify vs baselines (server
  sweep failing-file set /tmp/ff1-server-failing-files-baseline2.txt, app tsc 71-line set
  /tmp/ff1-tsc-app.txt) -> merge -> SUITE-A claim+dispatch (spec canonical
  .hermes/plans/2026-10-26_L2-SUITE-A-prompt-plate-leg.md) + stack restart.
- DEAD (do not revive): resume-2 wrapper 2937008/child 2937011 exited 16:01; slot-1 pid file was
  stale-GC'd by lane-1's GC4 at grab (3048747) — normal.

## RECONCILE/RECOVERY THIS TICK
1. Resume-2 death diagnosed FIRST-HAND from its log (new class: admission-expiry, engine 2-stream
   load; distinct from resume-1's context-400). Its work ADOPTED as-is: 3 commits + clean tree +
   report current. No loss. Resume-3 = smallest useful action, scoped strictly to remaining legs
   (less surface per dispatch = lower context/admission risk). Third same-class engine death on
   this item would make engine LOAD the question — do not blind-resume a 3rd time; check
   appliance-2 load/admission config first.
2. Slot-1 race: LANE 1 GC4 grabbed the freed slot ~3 min before our waiter registered. FIFO
   order: GC4 -> ours. OUR LAUNCHER IS A BLOCKING `flock` (no -n) — correct by design; verify
   waiter pid 3049920 alive before concluding 'nothing queued'.
3. Brad sweep (>15:50): no new decisions/ files touched, no worksheet-answers card — MATRES-REPLAY
   verdict leg + MOUNT-NONEVENT-1 stay AWAITING-BRAD (not re-asked).

## READY SET after this tick
- L2-CHAT-1: in-progress on regatefix2 (obligations above). Done only on browser-gate ACCEPT with
  new receipts.
- L2-FREEFORM-1: resume-3 queued slot 1 (H4+H5 only).
- L2-SUITE-A: SPEC CANONICAL, dispatch gate = FREEFORM-1 merged + restart ONLY.
- SUITE-B: gated on SUITE-A. MATRES-REPLAY / MOUNT-NONEVENT-1: AWAITING-BRAD.
- No spare coder slot this tick (fleet 1 live + 1 queued) — no spec-composer/other dispatch needed;
  next-ready item SUITE-A spec is already canonical and OQ4-ruled.

## HEALTH
:3093 /api/health 200, :5193 200. Trunk 7294e33e (docs tip above f30ff09d). Standing
w211-mach1 receipts snapshot-dirt note carries. mafft provisioned (SUITE-B early).
Stale-index.lock trap watch: rm /home/brad/.computable-lab-lane2/worktrees/main/.git/index.lock
+ touch server/src/server.ts if the backend dies again.

## ASSUMPTIONS (assumptions.md l2t1610 block)
- NEW: AS-L2T1610-FREEFORM-DEATH-ADMISSION-CLASS (resume-2's admission-expiry is transient
  engine-load, not a prompt defect; closes when resume-3 completes H4+H5 past the first tool call;
  if a 3rd dispatch dies the same way the class assumption is FALSE -> escalate engine-load
  investigation, no blind 3rd resume).
- NEW: AS-L2T1610-FREEFORM-H1H3-COMMITS-SHAPE (H1/H2/H3 commits from a dead-worker window are
  WIP-as-shape, not gate-passed: advc cycle-1 scope 701f80c0...HEAD must cover all five legs;
  closes at advc ACCEPT).
- CARRIED OPEN: AS-L2T1415-REGATEFIX2-SCOPE (D4-belongs-to-FREEFORM; closes at next browser-gate
  accept re-exercising canonical flow), AS-L2T0511-CHAT1-RUN5-REASONING-LOW,
  AS-L2T0430-CODER-COMPRESSION-FIX, AS-L2T0950-FIX3-DIED-DIRTY, AS-L2T1110-FREEFORM-BASE-POSTMERGE,
  AS-L2T0715-REPLAY-GATE-MISREAD, AS-L2T0715-SYNTH-QUESTION-H-A (owner Brad),
  AS-L2T0210-TERM1-SCOPE-AMEND-MATERIALPICKER, AS-L2T0135-CHAT1-RUN1-ENGINE-400,
  AS-L2T0135-FREEFORM-SPEC-RATIFIED, AS-L2T0035-UC-SPECS-ORCH-AUTHORED,
  AS-L2T0035-TERMCHAT-ZONE-SPLIT, AS-L2T0315-SUITEA-OQ123,
  AS-LANE2-TRUNK-REPOINTED-TO-MAIN-MERGE. (AS-L2T1415-FREEFORM-CONTEXT-DEATH-RESUME2 CLOSED:
  resume-2 made commits; death class was different — superseded by AS-L2T1610-FREEFORM-DEATH-
  ADMISSION-CLASS.)
- Open evidence debt: AS-L2T0755-MAFFT-USERPROVISION (closes when the SUITE-B harness records the
  version line itself).

## NEXT TICK (priority)
1. Reconcile: regatefix2 (log/report/commits; ~2h expected -> if alive past ~17:30 apply the
   2x/3x liveness ladder). FREEFORM resume-3: confirm it STARTED after GC4 exited (read
   'CODER STARTED slot1' line in its log; if GC4 is long-gone and our waiter is gone with no
   STARTED line, RELAUNCH the same prompt — the unit is --collect, a lost unit is not a lost run).
2. Any exit: advc -> self-verify -> merge per the obligations above. NEVER merge one while the
   other's diff touches the same files without three-dot inspection (CHAT-1 fixer = app
   deck/chat; FREEFORM = server ai + AiTabPanel).
3. Both merged: stack restart, ONE browser gate re-shot covering the FULL canonical flow
   (tier-1 first; harness trap notes in the regate prompt survive) vs the new tip. Accept -> close
   CHAT-1 AND FREEFORM-1 + open SUITE-A dispatch.
4. Brad sweep (cheap): worksheet-answers + MOUNT card.
5. Health + stale index.lock watch.

## LIVE AT EXIT
regatefix2 slot 0 (~55 min, live), FREEFORM resume-3 queued slot 1 behind lane-1 GC4 (waiter
alive). Fleet 2/2 accounted (1 live, 1 FIFO-queued; GC4 is lane 1's live). Brad's stack untouched.
Budget spent (~15 min used, no further launches justified) — checkpoint.
