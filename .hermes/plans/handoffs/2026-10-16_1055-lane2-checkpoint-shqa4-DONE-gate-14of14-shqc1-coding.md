# CHECKPOINT l2t0955 - lane 2 - 2026-10-16T10:55 EDT (orch tick ~09:50)
Trunk tip 157d388f (docs promote SH-QA-4 report) over 75dc10a6 -> d668920f -> ... Stack UP
(:3093 /api/health 200, :5193 200). Fleet coder slot BUSY with LANE 2's own SH-QC-1 (see below).

## Events this tick
1. SH-QA-4 BROWSER GATE RENDERED — VERDICT ACCEPT. Route: ORCH-AUTHORED deterministic Playwright
   + orch artifact judging (rule 6c tier route, pre-authorized by AS-LANE2-SHA4-GATE-ORCH-ROUTE;
   the SH-QC-1-fold shortcut stayed VOID — gate pinned THIS rev 509ca293). Receipts
   /home/brad/.hermes/cl/lanes/2/receipts/SH-QA-4/2026-10-16_0955-orchgate/ (trail.json, 7 shots
   5-distinct-md5 [2 identical = same drilled-plate pre-tooltip view, expected], 0 console errors,
   per-legend tooltip text dumps). Served-checks first: git diff 509ca293 HEAD -- app/ EMPTY (the
   pinned rev's app/ IS what :5193 serves) + served-bundle probes (eventGraph fractionOfMixture x7,
   volumeIsCarrier x5; both tooltip components carry the carrier branch). Fixture = seeded TEST
   DATA via honest record-PUT of EVG-SPK-VERIFY (mixture event = TALLY F1 shape, 4-entry
   composition_snapshot + count + counter_density; labels are fixtures, not policy).
   MEASUREMENTS: mixture tooltip -> volume tokens in whole tooltip = 1 ("100.0 µL", the header
   well-total); all 4 components render with fractions (50%/50%/10%/50%) and NO per-row volume;
   cells row "50,000 count · 500 cells/uL". Control (no-snapshot single add, T3 pin) -> row keeps
   own 100.0 µL + 1 mM, 2 tokens total. 14/14 PASS. Orch read mix-3-tooltip.png first-hand:
   visually clean, no red styling, no duplicated volumes. Script
   tmp-orch/shqa4-gate-l2t0955.mjs rerunnable (note: one harness retry-wrap for tile-visibility
   was added after a first-run flake at selectOption; second+third runs clean).
   SH-QA-4 -> DONE (60 done). Report promoted .hermes/plans/SH-QA-4-report.md (157d388f).
   SIDE EFFECT: EVG-SPK-VERIFY left seeded with the control single-material event A1 100 µL
   clofibrate (test data, harmless; any later deck spec resets it idempotently).
2. SH-QC-1 CODER LIVE (fleet lock holder): wrapper bash 3755211 / flock child 3755272, hermes
   3755276, log logs/coder-SHQC1-l2t0830.log, worktree wt/SH-QC-1-lane2-l2t0830 off d668920f.
   ~68 min in at check: real progress — deck-ghost spec, EventEditorContext.test, ChangesPanel
   MODIFIED + wip report + receipts dir exist (RED phase). Healthy; expected ~2-3h. 2x ~12:45,
   3x ~14:45 (rule 7b). DO NOT re-dispatch while 3755211 alive. On EXITED: advc c1 ->
   reviews/advc-SHQC1-c1-l2t<tick>.md (spec + report + worktree in the prompt); marker
   SHQC1-BLOCKED-P2 -> architect packet with the two request bodies from the report.
3. AI-13 RECOUNT: n=290/500 (last ts 2026-10-16T13:54Z), +2 from 288 — accruing. INSUFFICIENT-
   side, no action. Scoring wave starts at >=500.
4. TASK-LIST SED HAZARD RE-COURSED: a file-wide `sed 0,/in-progress/` flipped W2-8's status line
   (the first in-progress in the file), not SH-QA-4's — caught by the status recount, reverted
   in-tick, verified final in-progress set = {W2-8, W2-11, SHORTHAND-CORPUS, SH-QC-1} exactly.
   AS-LANE2-TASKLIST-SED-HAZARD re-confirmed: use python anchored replacement only (done for the
   SH-QA-4 flip itself).

## QUEUE / NEXT TICK (priority)
(1) SH-QC-1 observation on exit -> advc c1 (unique report path reviews/advc-SHQC1-c1-l2t<tick>.md)
    -> self-verify -> merge --no-ff -> browser gate (its T-C run-page leg per spec OQ3 ruling;
    the WellTooltip spot-check that rode this tick's SH-QA-4 gate is DONE and reusable as
    evidence for the tooltip surface at a LATER rev only if re-measured there).
(2) AI-13 recount each tick (base 290, +~2-10/tick; at >=500 the scoring wave starts).
(3) After SH-QC-1 lands: lane-2 wave is DONE -> next composition = S5 DECK-FOLD-1 finding fold
    (draft, not retrofitted) or Brad's next test round. PROTO-AI-13 stays corpus-gated.
(4) BRAD-PENDING (recorded, never re-asked unattended): D1 run-page-Accept-422 / D2 clarification
    loop / D3 path-fork routing; W2-11 naming-stability; THREAD mint-floor OQ; OQ1 held-intent
    leak task line; PROTO-AI-11/12 S2 + BACKLOG unchanged.

## workers live at checkpoint
- SH-QC-1 cl-coder (fleet lock holder 3755272; wrapper 3755211). ZERO other lane-2 workers.
- No browser/scout/advc slot in use.

assumptions (delta; carried open entries stay open — AS-LANE2-SHQC1-CAMT-CITES (clears when the
SH-QC-1 coder's cite re-pin table lands in its report), AS-LANE2-MODE2-REPLAY-EMULATION,
AS-LANE2-SEQ2-FLAKE-VARIANCE, AS-LANE2-TASKLIST-SED-HAZARD):
- CLEARED AS-LANE2-SHA4-GATE-ORCH-ROUTE: the orch-route gate rendered a real 14/14-PASS verdict
  with receipts at 509ca293 and the orchestrator read the screenshot first-hand.
- ADDED AS-LANE2-SHA4-GATE-FIXTURE-EVIDENCE: the gate fixture is seeded test data via the honest
  record-PUT path (standing 'all records are TEST DATA' ruling); its composition_snapshot shape
  mirrors the unit-test fixture (WellTooltip.test.tsx mixtureEvent), i.e. the browser leg proves
  the SERVED rendering of the projection the unit tests pin — not an independent compiler-emission
  proof (that honesty lives in the server-side stub-honesty test lineage).

next checks: (1) logs/coder-SHQC1-l2t0830.log for 'EXITED code=' or SHQC1-BLOCKED-P2; (2) trunk
tip 157d388f+; (3) AI-13 recount (base 290); (4) stack :3093 /api/health + :5193 200; (5) fleet
lock pid file before any coder dispatch.
