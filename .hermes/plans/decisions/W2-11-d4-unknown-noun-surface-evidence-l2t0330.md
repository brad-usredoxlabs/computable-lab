# W2-11 D4 — unknown-noun dominant shape + resolution-surface probe (EVIDENCE PACKET for architect re-consult, orch l2t0330, 2026-10-13)

Trunk at probe time: 79ffa518. Supersedes nothing; rides on
W2-11-d4-deckreview-empty-decision.md (VERDICT (c)) +
W2-11-d4-postdecision-measurement-l2t0230.md. Decision requested: unique path
below.

## Measured facts (all verified first-hand by the orchestrator at 79ffa518 / live :3093)

1. GATE RUN 6 consumed the bounded re-draw budget honestly: 5/5 answered draws
   returned 422 NEEDS_CLARIFICATION 'unknown-noun' on label
   'BashingBead Lysis Module' (log
   /home/brad/.hermes/cl/lanes/2/logs/w211-gate-full-l2t0230-run6.log; D1-D3
   green, D4 fail, D5/D6 did-not-run). The barred action slot VARIES per draw
   (add_material.target or create_container.labware) — model non-determinism is
   in WHICH verb carries the noun, not WHETHER the noun appears: the macro
   always contains the vendor module name because the PROTOCOL TEXT does.

2. REFINE-CORRECTION SURFACE PROBE (script
   /home/brad/.hermes/cl/lanes/2/tmp-orch/probe-d4-correction-l2t0330.py, 3
   answered draws against the live lane-2 backend, family
   CAN-protocol-1791839280914): a scientist-stated correction appended to
   protocolText ("those are labware objects the lab does not yet have records
   for — keep them as labware, do not ask what they are") did NOT clear the
   bar: 3/3 draws still 422 unknown-noun on the same label. Mechanism verified
   first-hand: handleSendCorrection folds
   `protocolText + "\n\nCorrection (agreed): <text>"` and re-sends with the
   SAME answers (ProtocolLocalizationThread.tsx:420-450); composeAnsweredPrompt
   iterates answers only (IntentCompileFromPromptHandlers.ts:127-136) — the
   correction rides the prompt, but the resolve_nouns spine still bars a
   proper-noun vendor product label. A text-level "don't ask" instruction does
   not and SHOULD not override a structural unknown-noun (SPINE-4 intent).

3. THE CLARIFICATION CARRIES A MINT AFFORDANCE — resolutionEngine.ts:203-218:
   the mint affordance is OFFERED only on the unknown-noun arm; probe output
   shows candidates
   [{"label": "Create local term \u201cBashingBead Lysis Module\u201d", ...}].

4. THE ANSWER SURFACE EXISTS BUT IS NOT WIRED INTO THE THREAD —
   ClarificationPicker.tsx is the product's search-workspace-+-mint-a-local-term
   picker (app/src/event-editor/right-pane/ai/ClarificationPicker.tsx; mint
   text :253-284). It is consumed by ProtocolIdeShell.tsx:521 and
   QuestionsPanel.tsx:112. ProtocolLocalizationThread does NOT render it:
   foldHeldBundle (:294-308) only lists `label (reason)` in an infoMsg string.
   => The thread shows the scientist unresolved facts and a bar it cannot
   answer through that thread. That is a product surface gap, discovered
   first-hand, independent of this fixture.

5. THE TRAP APPLIES TO THE OBVIOUS SEED — seeding a 'BashingBead Lysis Module'
   LAB record would clear the resolve_nouns bar, but per the decision doc trap
   warning it flips the resolve_labware hint from zero-match (additions ->
   checkbox renders TODAY) to one-match resolvedLabwares (INVISIBLE until
   DECK-FOLD-1 ships) — re-emptying the deck review by the OTHER gap. Do not
   seed it as a fixture fix.

6. CONTRAST DATA (already architect-verified, decision doc 'evidence 1'): a
   generic labware label ('probe plate') PASSES resolve_nouns and lands in the
   zero-match labwareAdditions arm — the arm that renders checkboxes today. The
   bar fires specifically on the proper-noun vendor module name the protocol
   text carries.

## The question (choose one; unique decision path below)

How should the W2-11 D4 leg resolve the 'BashingBead Lysis Module' noun
HONESTLY, and does the thread mint-surface gap become its own product task?

(a) FIXTURE-HONEST PROTOCOL EDIT: the MEANT protocol is scientist-editable
    (D2 proves the flow). Before localizing, the leg edits the step text to
    name the object the way a scientist actually would with generic labware
    vocabulary (the kind of label that provably passes resolve_nouns per fact
    6, e.g. what 'probe plate' is for 'BashingBead Lysis Module'/'96-well
    block'). Deterministic, rides the zero-match arm, assertions untouched.
    Cost: D4 stops replaying the vendor-name bar — the unknown-noun-ask flow
    keeps its own existing coverage (heldBundle unit tests + spine tests).
(b) WIRE THE ANSWER SURFACE: mint/ClarificationPicker INTO the localization
    thread as its own spec'd product task (thread renders clarifications with
    the picker; answering folds through the existing answers + recompile path),
    D4 rides it. Fixes the real gap from fact 4 but lands AFTER another
    product task + browser gate.
(c) Something else (architect-proposed).

Constraint: no assertion weakening, no seeding resolvable deck labware before
DECK-FOLD-1 (facts 5), no TS policy branches. If (a): state the EXACT edit
wording discipline (generic English labware noun, scientist-plausible, no
vendor brand) and whether the unknown-noun vendor-bar flow needs a dedicated
regression leg somewhere (which the current suite may or may not already own).
If (b): scope the thread-picker task (file boundary vs DECK-FOLD-1, which also
touches this file — sequencing matters).

## Requested output

Write the decision to EXACTLY:
/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/decisions/W2-11-d4-unknown-noun-resolution-decision.md
Include: VERDICT line, first-hand verification list with file:line, the exact
fixture wording discipline or task scope, sequencing vs DECK-FOLD-1, and end
with 'ARCHITECT DONE W211-D4-NOUN'.
