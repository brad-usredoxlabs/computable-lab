# Handoff — lane 1 tick 2026-10-18 07:40 → 09:05 (REG-2 DONE; REG-4 gate attempt 1 VOID — platform perf blocker; CHECKPOINT)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## What happened (first-hand)

1. EARLY IN TICK: REG-2 re-gate judged from on-disk receipts
   (receipts/REG-2/2026-10-18_113107/): VERDICT: accept, 4 trails 140 steps 0-fail, 24
   PNGs (5 disclosed same-state dup groups). D1 closed with per-frame numbers; W6b/W7/
   W1A/W1B/W9/W10 all PASS; pre-flight pinned 34d7bf88, mid-gate HEAD advance docs-only.
   REG-2 MARKED DONE (task-list under lock), AS-ORCH-L1-180/182 CLOSED in assumptions.md,
   worktree wt/REG-2-lane1-l1t0400 + branch deleted, handoff 20261018T0745 committed
   (8043393c).

2. REG-4 BROWSER GATE ATTEMPT 1 (tier-1, pid 2304361, started 07:10) EXITED 08:08 with
   VERDICT: blocked and self-declared VOID: 0 PNGs, 1-entry trail.json, report claims the
   registry page stuck on "Loading..." because GET /api/records (unfiltered) times out at
   30s. Singletons (TRR-DEMO-1, DOC-DEMO-SOP) answered 200.

3. INFRA DIAGNOSIS (my own probes, wave-2 negative-claim rule satisfied):
   - Unfiltered GET :3092/api/records: 60s timeout, then a WARM 200 in 137s (1894397b),
     then another 120s timeout; backend log shows responseTime 117541ms for one request
     that did complete. Kind-filtered queries are fast (training-record 0.6s,
     controlled-document 1.5s, user 5s). Singletons fast (0.85s).
   - BRAD'S MAIN STACK :3001 unfiltered /api/records ALSO fails at 30s (000). Main stack
     NEVER touched beyond that one read-only curl.
   - No poller/starvation this time (ss: zero established conns to :3092; no rogue
     process; host 98.9% idle). Backend restarted via cl-lane-stack.sh 1 restart
     (approved tool; new pid 2526920, fresh index built "Index rebuilt: 1445 records");
     hang identical after restart.
   => STRUCTURED INFRA BLOCKER IB-L1-PERF-1 (see below): the unfiltered record-collection
   endpoint costs ~2 min of CPU per call platform-wide (lane AND main), so the registry
   initial load cannot settle within reviewer harness waits. PRE-EXISTING, NOT a REG-4
   defect (REG-4 merge is app-only; REG-1/2/3 gates passed against the same endpoint
   because their flows were pinned/narrower). Data dir verified correct (lane1, 1940
   YAML files; find+cat of all files takes <1s, so the 2-min cost is in the server's
   collection path, not raw disk).

4. CHECKPOINT at budget expiry: no gate re-dispatch launched (budget rule). REG-4 stays
   in-progress, AS-ORCH-L1-181 open, worktree wt/REG-4-lane1-l1t514 kept.

## STRUCTURED BLOCKER (REG-4 acceptance leg)

  id: IB-L1-PERF-1
  item: REG-4 browser acceptance (and any future gate needing the unfiltered list)
  symptom: GET /api/records (no kind filter) needs ~117-140s to complete (server log
    responseTime 117541ms; cold-warm cycle observed; sometimes exceeds 240s); :3001
    main stack reproduces (>30s no answer). Registry initial mount issues this call.
  owner: platform (server collection path) — NOT the REG-4 coder; new scope, needs
    architect ruling + Brad approval for a perf task (do NOT self-create).
  workaround for the gate (authorized, within existing scope): next re-gate must (a)
    pre-warm unfiltered /api/records until a 200 lands, (b) allow up to 5 min for the
    FIRST registry paint, (c) after first paint navigate with kind-scoped/selected-record
    flows only (all fast), or (d) use the orch-authored Playwright + orch-judges route
    (SOUL 6c) with long first-load waits — often the fastest correct answer here.
  attempts: 1 tier-1 attempt (07:10-08:08) -> VOID blocked (0 PNGs). Next attempt is
    attempt 2: per SOUL 6c/6b the ladder + diagnosis apply — do NOT blind-retry tier-1
    with the same 30s waits.
  resume condition: a re-gate whose trail shows the registry list actually painted and
    the P1-P6 criteria scored with receipts.

## Queue state after this tick

- done: REG-1, REG-2, REG-3.
- in-progress: REG-4 ONLY — merged 8c20b073; gate attempt 1 VOID (blocked on IB-L1-PERF-1);
  AS-ORCH-L1-181 open; AS-179/180/182 closed/historical.
- Fleet lock: lane 1 coder queue EMPTY (lane-2 held it at tick end; nothing in lane 1
  needs a coder — REG-4's code track is merged).
- Wave 4 completes when REG-4's gate accepts; NOTE list then goes to intake (no
  self-created tasks; IB-L1-PERF-1 goes to the architect as a perf-debt candidate).

## NEXT TICK CHECKLIST

1. Re-gate REG-4 (attempt 2) using the workaround above — RECOMMENDED: orch-authored
   Playwright script (extend ~/.hermes/cl/browser-receipts/harness/ precedent) with:
   pre-warm curl until 200; 300s first-paint wait; P1-P6 verbatim from
   prompts/browergate-REG4-l1t0645-tier1.txt (pin 8c20b073 — served app tree unchanged
   since; product tip now 34d7bf88+, REG-4 files untouched by REG-2 fix1); PNGs per
   criterion; then ORCH judges the artifacts and records that the orch judged them.
   Alternative: tier-2 cloud reviewer with the same long-wait addendum.
2. On accept: mark REG-4 done, close AS-181, delete wt/REG-4-lane1-l1t514, final wave
   handoff, NOTE list + IB-L1-PERF-1 to architect intake.
3. decisions/ md5 sweep (still 1f41d88/dcc0338 this tick); never re-ask.
4. If the registry first-paint wait works but a criterion fails -> defect list to fix
   run on wt/REG-4-lane1-l1t514 (fleet FIFO).

## assumptions

- AS-ORCH-L1-181 stays OPEN (REG-4 merge-before-gate at 8c20b073; closes on real accept).
- NEW NOTE (non-blocking, this tick): unfiltered-collection perf is platform-wide
  (:3001 too) — carried as IB-L1-PERF-1 above and in the evidence-debt section.
- Restart of the lane backend this tick used the authorized cl-lane-stack script only;
  no other process was killed.

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119 (+post-QMS76 ext);
137 residual; 154 (interpretive only); 181 (REG-4 gate).
CLOSED this tick: 180, 182.
INFRA BLOCKER OPEN: IB-L1-PERF-1 (unfiltered /api/records ~2min platform-wide; gate
workaround documented; perf task needs architect+Brad — NOT self-created).
NOTES (future-wave candidates, NOT tasks): NOTE-N4; N2 contrast; N3 regex breadth;
SignOffReceipt text-gray-*; Tab-blur datetime loss; REG-2 O4/O6 + rail-snap/narrow-
travel/truncation/text-selection/focus-ring (O-a..O-e in assumptions closure block);
RawRecordEditor reachability; NOTE-REG4-N1.
ENV: trunk 8043393c (docs tip; product tip 34d7bf88); lane stack restarted this tick
(backend pid 2526920, index 1445 records, Data dir /home/brad/.computable-lab-lane1 —
isolation line re-verified in log); :5192 pid 2526706. No YAML merges pending; no
restart owed. Fleet lock held by lane-2 at tick end; lane-1 queue empty.
