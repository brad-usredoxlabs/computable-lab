# CHECKPOINT l2t0830 - lane 2 - 2026-10-16T09:15 EDT (orch tick ~08:30)
Trunk tip 625e085e (docs promote) over merge 74590f53 (HARNESS-SEQ-2-fix3). Stack UP (:3093/
:5193 200) after RESTART at 08:40 (server-side guard module landed; restart cheap + removes
stale-module doubt). Fleet lock HELD by LANE-1 (QMS74 coder pid 3558099 since 08:26) — zero
lane-2 coder slots; SH-QC-1 not dispatchable this tick regardless.

## Events this tick
1. SEQ2FIX3 ADVC C1 ACCEPTED (reviews/advc-SEQ2FIX3-c1-l2t0635.md, exited ~08:11): 9 mandates
   first-hand (RED realness at base, registry-swap pins, model-call accounting complete, scope
   exactly 4 files zero YAML zero app, re-pin 3->2 strengthens). ORCH SELF-VERIFY: opened BOTH
   source diffs (guard reads surfaces.get().selectableKinds DATA only; retry bounded <1 with
   honest agent_intent line); targeted 18/18 PASS in worktree AND on merged trunk; server tsc
   set-diff EMPTY vs base (1 known pre-existing TS2339). MERGED --no-ff -> 74590f53. Report
   promoted HARNESSSEQ2-fix3-report.md (625e085e; trunk wip copy was byte-identical).
2. TIER-2 BROWSER RE-GATE at 74590f53 RENDERED VERDICT: accept — receipts
   receipts/HARNESS-SEQ-2/2026-10-16_0840-regate-tier2-fix3/ (bash 3612588 exited 0; 9 shots ALL
   distinct md5; trail.json raw backend.log per leg). ORCH INDEPENDENTLY verified: C2neg leg
   shows the guard firing PRE-MODEL (wallMs 2069, startPresent:false, refusal line verbatim in
   trail) + refusal VISIBLE in the screenshot (orch read shot 03: 'Record "ANR-000001" (kind
   analysis-run) is not a kind Sequences can select (it declares sequence, sequence_interval,
   oligo-spec). Nothing was changed.' — no red alert, editor unchanged); C1/C2pos done-lines
   compiled ok; C3 zero pre-accept writes (nonGetApiWrites = session-sync + stateless draft
   compile only); sha-pair identical. HARNESS-SEQ-2 -> DONE (59 done). Two non-blocking
   observations recorded (generic C1 action line; envelope flake on model side — variance).
3. AI-13 RECOUNT: n=288/500 (last ts 2026-10-16T12:00Z) — +10 since base 278, accrual RESUMED.
   Still <500 -> INSUFFICIENT-side, no action.
4. SH-QA-4 gate (open obligation from l2t0630, pinned at rev 509ca293, in trunk verified via
   ancestor check) NOT YET RUN this tick — next tick priority #1. Orch route prepped: the gate
   is a narrow DOM measurement on the deck tooltip. Fastest correct answer = ORCH-AUTHORED
   deterministic Playwright (rule 6c) OR tier-2 reviewer with this harness brief: seed the
   F1 mixture via PUT /api/records/EVG-SPK-VERIFY (deck-ghost-shorthand.spec.ts pattern:
   plate_96 labware + lawn placement + one add_material event with details.composition_snapshot
   4 entries incl. cells row w/ counter_density — schema-declared in
   schema/workflow/events/plate-event.add-material.schema.yaml:114, fixture shape in
   app/src/event-editor/focus/WellTooltip.test.tsx:14-27), goto /deck/EVG-SPK-VERIFY, Manual
   Bench freeform variant, drill the tile, hover A1: ASSERT exactly ONE
   .well-tooltip__volume == '100.0 µL' (header), NO .well-tooltip__material-vol cell repeats
   it (composition rows show '50%'/'10%' fractions), cells row shows '50,000 count' + density.
   Single-material control: a snapshot-less add event keeps its per-row volume (T3 pin shape).
   Screenshots + trail + md5s as always; reviewer profile tier-2 if not orch-run.

## QUEUE / NEXT TICK (priority)
(1) SH-QA-4 browser gate at 509ca293 (harness brief above; pin THIS rev; tier ladder 6c;
    on accept -> mark SH-QA-4 done + handoff; clear AS-LANE2 open entries for it).
(2) SH-QC-1 CLAIM + coder dispatch when fleet lock frees (spec promoted+ruled:
    .hermes/plans/2026-10-16_0558-SH-QC-1-ghost-cancel-resend-spec.md S7+S12; coder re-pins
    CAMT cites at branch point per AS-LANE2-SHQC1-CAMT-CITES). Also dispatch
    cl-spec-composer for the NEXT ready item alongside (wave notes: SH-QB-1 chain exists,
    check task-list for next claimable).
(3) AI-13 recount each tick (base 288, accruing +~10/tick — approaching 500; at >=500 the
    scoring wave starts).
(4) BRAD-PENDING (recorded, never re-asked unattended): D1 run-page-Accept-422 / D2
    clarification loop / D3 path-fork routing; W2-11 naming-stability; THREAD mint-floor OQ;
    OQ1 held-intent leak task line; PROTO-AI-11/12 S2 + BACKLOG unchanged.

## workers live at checkpoint
- LANE-1 cl-coder QMS74 (fleet lock holder, pid 3558099). ZERO lane-2 workers live.
- No browser/scout/advc slot in use. advc SEQ2FIX3 c1 exited (accept) — closed.

assumptions (delta; all carried open entries stay open, incl.
AS-LANE2-SEQ2-MERGED-GATE-PENDING -> NOW CLEARED (tier-2 gate rendered real accept at the
fix3 rev, receipts verified first-hand); AS-LANE2-SHQC1-CAMT-CITES still open until SH-QC-1
coder pins cites; AS-LANE2-MODE2-REPLAY-EMULATION and AS-LANE2-TASKLIST-SED-HAZARD stay):
- ADDED AS-LANE2-SHA4-GATE-ORCH-ROUTE: the SH-QA-4 gate at 509ca293 may be satisfied by an
  orch-authored deterministic Playwright measurement + orch artifact judging (rule 6c tier
  route) with receipts at the standard path; the fixture is SEEDED test data via the honest
  record-PUT path (standing 'all records are TEST DATA' ruling). Clears when the gate renders
  a real verdict there.
- ADDED AS-LANE2-SEQ2-FLAKE-VARIANCE: C2pos/C3 first-attempt model envelope flakes at the
  accepted gate are model emission variance (schema branch legal per agent-action.schema.yaml
  :49, second send clean); recorded, not a SEQ-2 regression, no spine item at 1st occurrence.

next checks: (1) fleet lock holder (fuser /home/brad/.hermes/cl/appliance2-coder.lock + pid
file) before SH-QC-1 dispatch; (2) SH-QA-4 gate run; (3) trunk tip 625e085e+; (4) AI-13
recount (base 288); (5) stack :3093/:5193 200.

## ADDENDUM (same tick, ~09:50 — checkpoint)
5. FLEET LOCK FREET at ~09:05 (lane-1 QMS74 coder exited, marker QMS7-4 DONE bad13b16).
   SH-QC-1 CLAIMED under task-list.lock + CODER DISPATCHED 09:45 (bash 3755211 wrapper,
   flock holder 3755272, log logs/coder-SHQC1-l2t0830.log, worktree
   wt/SH-QC-1-lane2-l2t0830 off trunk d668920f — SH-QA-3/QA-4/SEQ2fix3 all ancestors; 61
   lane-exclude symlinks repaired; app tsc re-measured 23 at branch point; report wip path
   .hermes/plans/SH-QC-1-report.wip-l2t0830.md; marker 'SH-QC-1 DONE <sha>'; P2-server =
   structured stop SHQC1-BLOCKED-P2). Expected duration ~2-3h (diagnosis-heavy; prior
   coders 90-150 min lean). 2x ~12:45, 3x ~14:45 (rule 7b). DO NOT re-dispatch while
   3755211 alive. Next tick: on EXITED -> advc c1 (unique report path
   reviews/advc-SHQC1-c1-l2t<tick>.md) with spec+report+worktree; on marker BLOCKED-P2 ->
   architect packet with the two request bodies from the report.
6. QUEUE after this addendum: (a) SH-QA-4 gate at 509ca293 (harness brief above; runs in
   parallel with the coder — vision slot free); (b) SH-QC-1 advc on exit; (c) AI-13 recount
   (base 288); (d) spec-composer for next ready item: the ONLY todo line left in the wave is
   PROTO-AI-13 (corpus-gated, n=288<500 — NOT composable yet). If SH-QA-4 gate accepts and
   SH-QC-1 lands, the lane-2 wave is DONE -> next composition = S5 DECK-FOLD-1 finding fold
   per wave notes (draft, not retrofitted) or Brad's next test round.
LIVE AT CHECKPOINT: SH-QC-1 coder (fleet lock holder 3755272). No other lane-2 workers.
