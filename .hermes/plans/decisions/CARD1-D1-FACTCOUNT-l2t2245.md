# ARCHITECT DECISION REQUEST — L2-CLARIFY-CARD-1 browser re-gate defect 1: whose fact-count is right?
# lane 2 · tick l2t2245 (2026-11-02 ~22:50 EST) · requester: orchestrator
# Status: OPEN. Answer lands HERE under "## RULING".

## Context
CARD-1's code track merged (`8b61971b`); the mandatory browser re-gate on the live lane-2 stack
(`:5193`, served HEAD verified = the candidate) returned VERDICT: fix with five defects. Four are
straightforward product defects I have routed to a fix run. ONE is a criterion-vs-product question
that changes user-visible behaviour depending on the answer, so it is not mine.

Receipts (read these yourself, they are real):
`/home/brad/.hermes/cl/receipts/L2-CLARIFY-CARD-1/2026-11-02_2225-tier1/`
  - `report.md` §3/§4 defect 1, §5 observation 3
  - `bodies/answer-06-POST-ai_draft_events_stream.json` (the send turn)
  - `dom/answer-stream-7.txt` (the server's clarification payload: ONE request)
  - `screenshots/01-answer-card-before-answer.png` (one card, one slot, no Submit)
  - `screenshots/01-ans3-card-before-answer.png` (the grouped 2-slot card + one Submit, PASSING live)
  - `bodies/ans3-08-POST-ai_draft_events_stream.json` (2-element clarificationAnswers batch)

## The question
The task's acceptance criterion reads: "Live :5193: clofibrate-in-DMSO prompt -> ONE card, TWO SLOTS,
one Submit, turn settles with one Answered row (screenshots)".

On the mandated prompt `Add 1 uL of 1mM clofibrate in DMSO to wells E2-F3.` the server emits exactly ONE
unresolved fact (`query: "1 mM clofibrate in DMSO"`, `kind: material`) — the volume (1 uL) and the wells
(E2-F3) are both STATED, so nothing else is unresolved. The card therefore renders one slot and the
single-request arm renders no Submit button (by design).

Two readings, different product behaviour:
(a) The CRITERION is over-specified for this prompt: "two slots" was written for a two-unresolved-fact
    sentence; CARD-1's intent (one card per sentence, grouped slots, single Submit) is met — the grouped
    arm is proven live. Close defect 1 as "criterion shape", amend the criterion to its intent form
    ("a card, grouped when >1 fact, exactly one Submit whenever >1 slot"), and CARD-1's remaining work
    is the four product defects.
(b) The PRODUCT is wrong: the server should decompose this prompt into TWO unresolved facts (e.g. the
    material noun + the formulation-vs-concept choice, or material + a declared volume/wells slot), so a
    scientist sees both decisions on one card. That is a fact-decomposition change in the resolution
    pass — a different item's scope (and, if the second slot is the assumed volume/wells chip, it is
    literally TARGET-1's Change 2/4 work in flight right now).

Note for (b): TARGET-1 is currently landing exactly the "assumed facts on the card" machinery
(volumeUl/targetWells chips). If the answer is (b) via that machinery, the fix belongs to TARGET-1 and
CARD-1 takes only the four other defects. If (b) means a genuinely different decomposition (a second
fact for a STATED value), that is new scope and needs your explicit framing.

## Constraints
- No criterion may be softened to fit a broken product; equally, a criterion must not demand behaviour
  the ratified campaign intent never asked for. Say which of the two it is.
- Answer must name the OWNING item for the follow-up work (CARD-1 / TARGET-1 / a new item), because I
  will not invent campaign tasks outside approved scope.
- Do not re-open the CARD-1 code track (cycle 5 accepted it); this is about the acceptance criterion's
  fact-count assumption.

## Evidence of what the grouped arm already does (so (a) is not a surrender)
The `ans3` leg drove a two-unresolved-noun prompt live: one card container, two slots, a single
`Submit answers` disabled until both picks, one batch turn carrying a 2-element `clarificationAnswers`
array, exactly one Answered row, 8 events staged after the human answered.

## RULING:
