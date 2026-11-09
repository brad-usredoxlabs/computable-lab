# L2-PROMPT2-GATE-ON-MAIN-1 u2typed — leg4 typed-answer arm (harness only)

WORKTREE /home/brad/cl-wt/L2-P2GATE-LEG4TYPED-u1-lane2
BRANCH   cl/lane2-p2gate-leg4typed-0911 @ base dcd81ad6
UNIT     L2-PROMPT2-GATE-ON-MAIN-1-u2typed (1 of 1)
DRIVER   .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers/leg4.cjs
md5 before 4d445eb42f9f168563a874109630a06c -> after 06178160842079b17175e798c804eeed
RECEIPTS /home/brad/.hermes/cl/receipts/L2-PROMPT2-GATE-20261109/20261109T172452Z-leg4-retry-u2typed

## CHANGE (one file, harness only; no app/ server/ schema/ config/ edit)
Inside `if (out.answer.slotCount === 0)`, after the numbered-option try/catch:
when no numbered option was picked, probe `[data-testid="parameter-answer-input"]`;
if present, fill 'Clofibrate', wait 300 ms, click `[data-testid="parameter-answer-submit"]`,
record `out.answer.typed = {present, typed, via, submitted}` and
`step('answer-typed', ...)`; if absent record `{present:false, via:'parameter-answer-input'}`.
Status accounting adds `typed.submitted` to the `answered` predicate and reports
`answerMode='typed-answer'`. arm remains non-vacuous: it logs which surface it drove
(or that none was present).

## VERIFY
1. `node --check .../leg4.cjs` -> rc 0
2. `grep -c "parameter-answer-input" leg4.cjs` -> 2
3. retry loop, 4 attempts `timeout 900 node leg4.cjs` vs :3093/:5193 (stack untouched).
   VERBATIM per-attempt summary (from each leg4.json):
   attempt 1: arm=None slotCount=None numberedOption=None typed={none} submitted=None previewWells=16 status=NA failed=[]
   attempt 2: arm=single slotCount=0 numberedOption=None typed={present:False,typed:-,via:parameter-answer-input} submitted=True previewWells=0 status=FAIL failed=['no-preview-after-submit']
   attempt 3: arm=None slotCount=None numberedOption=None typed={none} submitted=None previewWells=16 status=NA failed=[]
   attempt 4: arm=None slotCount=None numberedOption=None typed={none} submitted=None previewWells=16 status=NA failed=[]
   Attempt 2 final driver lines verbatim:
   {"t":41.27,"action":"answer-typed","target":"NO typed input","present":false,"via":"parameter-answer-input"}
   {"t":270.7,"action":"settle","target":"NO preview bar"}
4. `git -c core.fileMode=false status --short` -> only leg4.cjs + this report.

## FINDING (product, read-only; no product edit made)
The card-visible attempt rendered ZERO slots and ZERO numbered options and NO
`parameter-answer-input`. Screenshot attempt-2/shots/103-leg4-card.png shows the
legacy menu-backed picker question: "The draft names 'lbw-c2p1-baseline-plate' and the
lab spine could not bind it (unknown noun). Choose what it is, or create a local term."
That is ChatLog.tsx renderClarificationBlock -> ClarificationPicker
(`clarification-identity-search` / `clarification-top3-row` / `clarification-mint-create`),
not renderTypedClarification -> ParameterAnswerInput. The orchestrator brief's residual
diagnosis assumed the typed arm; measurement at 451fbeb0 (descendant of graded 3d94c838,
no clarification-file diff between them) shows the picker arm instead. Driving the
picker blind would either mint a labware record (product mutation) or answer the wrong
fact, so the harness correctly left it un-driven and recorded present:false.
Gate outcome remains FAIL/NA: instrument now reports the typed surface honestly; the
un-answerable picker card (and the 1-in-4 card nondeterminism) is a product/follow-up
finding, not a driver defect. Recommended next: a separate unit to drive the picker's
one-click top-3 surface (or a product finding that the drafter should bind the plate
name rather than ask).

## SCOPE / STATE
No product file touched; chrome.cjs, leg3.cjs, legAB.cjs and the frozen/alllegs scripts
untouched; stack not restarted; no trunk merge; task list not edited.
Implementation: complete. Gate acceptance: not claimed (attempt 2 FAIL is recorded).

P2GATE-LEG4TYPED DONE e3334ead9ab3f421c29a32c390a8eab02c55ea0b
L2-PROMPT2-GATE-ON-MAIN-1-u2typed UNIT unit DONE e3334ead9ab3f421c29a32c390a8eab02c55ea0b
