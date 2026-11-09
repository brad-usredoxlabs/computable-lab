# Lane-2 handoff — tick l2t0510 (2026-10-27 ~06:20 EDT) — 150th — SUITE-A P3 WALL ROOT-CAUSED TO THE HARNESS; 3 TRUNK HARNESS FIXES; DRIVE NOW P1-P6 GREEN; FIRST REAL PRODUCT WALL AT P7 (mix drops volume+wells)

## HEADLINE
The P3 'honest RED' from l2t0415 was a HARNESS bug, not the product. Root cause read
first-hand from raw SSE replays against :3093 with the harness's own wire shapes: the
PRODUCT path delivers P3 = 2 events, add_material details.wells = the EXACT 42-well B1:H6
expansion bound to the plate record. The drive's state dict never carried events/cards
keys, so check_expectation's `got` was ALWAYS [] — every well-set check was a FAIL by
construction. Three harness fixes committed to trunk (selfcheck PASS after each):
  6ded9e3d  state carries events+cards (raw events now ride receipts -> diagnosable)
  a09ae9c1  answerable_cards mirrors the PRODUCT answer form (ClarificationPicker:
            menuProvider /m|/l|/e or unresolvedFact.candidates; options[] alone was wrong —
            ambiguous-noun cards answer via slash-menu search/mint)
  eac88150  8-channel semantics constrain a DELIVERED op only (cards leg asserted by the
            wells check; P5's honest composition card must not re-invert the spec's OR)
DRIVE (evidence lanes/2/evidence/suite-a-live-2026-10-27T060721/drive.log; receipts
/home/brad/.hermes/cl/receipts/L2-SUITE-A/20261027T100801Z/):
  P1 action-delivered (1F flip reconfirmed) | P2 events-bound | P3 events-bound 42-well
  | P4 cards | P5 cards | P6 cards (all answerable honest cards)
  | P7 FAIL = FIRST REAL PRODUCT WALL: mix event carries details {cycles:3} ONLY — the
    75uL volume is DROPPED and wells are absent; no labware binding on the P7 turn
    (done_resolved_labwares=0, no labwareId on the event). P8 blocked-by-P7. write-free
    digest held (5d5cf0f86f8f ==).

## NEXT TICK (in order)
1. P7 ROUTE: read the P7 receipt + reproduce; determine whether the mix-verb compile drops
   volume/wells in the compiler (simpleVerbs mix expander / normalizeScientistIntent —
   the prompt's '(75ul, 3 cycles)' reaches the server; cycles survived, volume did not) vs
   the held-context path losing the plate ref on a later turn (the P7 turn gets ZERO
   resolvedLabwares + no labwareId even though P3 bound lbw-seed-plate-96-flat the tick
   before — P2's create_container plate never re-surfaces as deck context). Likely TWO
   product defects: (a) mix params drop, (b) deck-state not carried to a follow-up turn.
   Dispatch a coder fix run off trunk tip a09ae9c1/eac88150+ (worktree wt/L2-SUITE-A-P7-lane2-l2t<tick>),
   fleet slot per FIFO. NO harness edits to make P7 pass — the expectation is the spec's.
2. SUITE-B resume-2 LIVE: unit cl-l2-suiteb-resume2-l2t0510, slot-1 (fired 05:53:33),
   log lanes/2/logs/coder-SUITEB-resume2-l2t0510.log, prompt prompts/coder-SUITEB-resume2-
   l2t0510.txt (resume-2 briefing: 4 commits safe, continue from HEAD 2769b729; report
   deliverables/L2-SUITE-B-report.l2t0230.md '## Resume run 2 (l2t0510)', marker 'SUITEB
   DONE <sha>'). If it dies on the ADMISSION class a THIRD time: do NOT fire resume-3 —
   escalate the appliance-2 admission queue as an infrastructure defect. On exit: advc
   (scope 9c99202e...HEAD) -> orch self-verify -> merge -> orch sequence replay -> browser
   gate. NOTE the coder ran its own concurrent P9/P10 probes against :3093 during my drive
   (write-free digest still held both sides — no interference evidence).
3. SUITE-A browser gate stays owed AFTER a clean-or-honest-final drive (post-P7), receipts
   convention /home/brad/.hermes/cl/receipts/L2-SUITE-A/<ts>/.
4. Drive variance note: P1 flipped to honest-failure ONCE (drive 054732, model variance —
   deck_layout intent without variantId wall) and was action-delivered in 3 of 4 drives.
   If P1 flips again on the same trunk, that's model variance on the deck-layout intent
   call — record it; do NOT tune the harness around it.

## QUEUE / HEALTH
Trunk a09ae9c1+eac88150 (harness-only commits; NO YAML -> no stack restart needed).
:3093/:5193 200. appliance-2: NInfer healthy (verified 200ms completion); lane-1 GC-7
coder on slot-0 (NOT mine), SUITE-B resume-2 slot-1. computable vision slot FREE.
L2-FREEFORM-1F marked DONE this tick per handoff l2t0415's explicit close-out instruction
(acceptance = P1 flip, evidenced twice).

## ASSUMPTIONS
NEW: AS-L2T0510-SUITEA-HARNESS-CARDS-ARM-SHAPE, AS-L2T0510-SUITEB-DEATH2-REQUEUE (full
entries in lanes/2/assumptions.md). CARRIED OPEN: AS-L2T2255-GATE-CLOSED-VIA-KEYBOARD-PATH
(Brad O2), AS-L2T0511-CHAT1-RUN5-REASONING-LOW, AS-L2T0430-CODER-COMPRESSION-FIX,
AS-L2T0715-REPLAY-GATE-MISREAD, AS-L2T0210-TERM1-SCOPE-AMEND-MATERIALPICKER,
AS-L2T0135-CHAT1-RUN1-ENGINE-400, AS-L2T0135-FREEFORM-SPEC-RATIFIED,
AS-L2T0035-UC-SPECS-ORCH-AUTHORED, AS-L2T0035-TERMCHAT-ZONE-SPLIT, AS-L2T0315-SUITEA-OQ123,
AS-LANE2-TRUNK-REPOINTED-TO-MAIN-MERGE. EVIDENCE DEBT: none open.

## BUDGET
~55 min used (replay-based diagnosis + 3 fix-drive cycles). Checkpoint: SUITE-B resume-2
LIVE (untouched), no drive in flight. Exit.
