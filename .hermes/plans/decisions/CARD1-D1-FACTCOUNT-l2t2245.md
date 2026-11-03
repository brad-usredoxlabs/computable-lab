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

**(a) — the criterion is over-specified for this prompt. This is criterion shape, not a broken
product. The owning item for the follow-up is L2-CLARIFY-CARD-1 itself, as a spec-text amendment
(paperwork, orchestrator's hand), NOT a product change; no new item is needed.**

Why. CARD-1's ratified intent is the card mechanism: one card per sentence, one slot per
UNRESOLVED fact, slots grouped, exactly one Submit whenever more than one slot renders. A slot is
a question the system could not answer. On `Add 1 uL of 1mM clofibrate in DMSO to wells E2-F3.`
the volume and the wells are STATED (the agent_intent receipt in `dom/answer-stream-7.txt` shows
`volumeUl: 1`, `targetWells: [E2:F3]` consumed from the sentence), and exactly one fact is
unresolved — the mixture-blob material. One fact, one slot, one immediate pick, no Submit is the
CORRECT rendering of that sentence; manufacturing a second fact for a stated value would mean
either (i) asking the scientist a question already answered — inventing an unresolved fact to fit
a criterion, precisely the "soften/strain reality to match the ticket" failure in reverse — or
(ii) splitting one entity into two facts, which brushes the two-local-terms-for-one-entity hard
line. The "two slots" phrase was written assuming a two-unresolved-fact sentence and the criterion
baked in a fact-count the campaign intent never mandated. The mechanism itself is proven live and
is NOT being graded on faith: the ans3 leg, which I re-verified in the receipts rather than
trusting the report — `dom/ans3-stream-6.txt` carries TWO clarification requests
(ids `unresolved-c-88c1ad16eb`, `unresolved-c-bf0475064d`),
`bodies/ans3-08-POST-ai_draft_events_stream.json` carries a TWO-element
`clarificationAnswers` batch (requestIds `unresolved-c-88c1ad16eb`,
`unresolved-c-bf0475064d`) — one card, one Submit, one Answered row (report §5 observation 3).
That is CARD-1's behaviour, demonstrated. Meanwhile (b) is not even unowned scope: assumed volume
and target are already TARGET-1's ratified work (W11/P6, the assumed-value chips, in flight at
l2t2245) — routing this defect there would double-file what TARGET-1's acceptance already covers
("'Add DMEM to A1' no-volume -> chip on card"), and TARGET-1's leg is about ABSENT stated values,
not this prompt where both are present.

Ruling specifics:
1. Amend CARD-1's acceptance text from the fact-count form to its intent form, e.g.: "Live :5193:
   clofibrate-in-DMSO prompt -> exactly ONE card; slots = unresolved facts (one slot when one
   fact); whenever >1 slot, slots are grouped on that one card with exactly ONE Submit disabled
   until all picked, and the answer turn carries one batch `clarificationAnswers`; turn settles
   with one Answered row (screenshots)." The two-slot/grouped/Submit arm keeps a live gate via the
   ans3-style prompt already exercised at this candidate.
2. Do NOT route D1 to TARGET-1 and do NOT file a new item. TARGET-1 stays exactly as ratified.
   If a future re-gate runs after TARGET-1 merges and the clofibrate prompt then yields a second
   (assumed/declared) slot, the amended criterion above already covers it — "grouped when >1
   fact" holds at any fact count.
3. Fix run 4 proceeds on D2-D5 unchanged; D1 closes as "criterion shape" with this ruling cited.
   This softens no product obligation: every behaviour the campaign asked for (one card, grouped
   slots, single Submit, settled turn) is still graded — only the assumed fact-count of one
   specific prompt is removed.

What would close it: (i) the amended criterion text committed on trunk next to the spec (orch
paperwork, citing this file); (ii) at fix-run-4's re-gate, on the mandated prompt — one card,
one slot, pick answers immediately, turn SETTLES with one Answered row surviving cold reload
(D2's leg), one card hash 10/10 (D3's leg); and (iii) the grouped arm re-passing live on a
two-unresolved-fact prompt with one Submit and a 2-element batch, receipts as at
2026-11-02_2225-tier1. If any of those fail, that is a product failure again, not a criterion
question.

— architect, lane 2, 2026-11-02 (~23:05 EST tick). Verified first-hand against:
`dom/answer-stream-7.txt`, `dom/ans3-stream-6.txt`, `bodies/answer-06-*.json`,
`bodies/ans3-08-*.json`, `report.md` §3-§5, lane-2 task-list CARD-1/TARGET-1 blocks, trunk
cl/integration-2 @ a31a0e4c (candidate 8b61971b in ancestry).
END-RULING
