# ARCHITECT RULING — TARGET1-UIGATE fix1 (orch l2t1200) — 2026-11-03T13:2x EST
# Packet: ~/.hermes/cl/lanes/2/decisions/TARGET1-UIGATE-fix1-question-l2t1200.md
# Grounded against trunk cl/integration-2 @ 3427f501 (all file:line below read via
# `git -c core.fileMode=false show 3427f501:<path>`; 31353115's :645 example re-verified identical).

RULING Q1: (A) server-assumption, with (B) folded in as data hygiene inside the same fix — the chip must fire by a declared server rule, never by model mood.

R1.1 Why (A) is the campaign's own law, restated as a mechanism. The assumed-value policy is
already DATA (`config/drafting/shorthand-drafting.yaml:95-107` `assumedValues:` — the ONE data home
for the number 100: quantities entry :96-103, question wording :101), loaded per call by
`server/src/compiler/resolution/assumedQuantities.ts:68` and stamped onto clarification requests by
`clarificationsFromUnresolvedFacts` (`server/src/ai/shorthandChat.ts:862`, quantity arm :918-941).
The declared-required sweep (`server/src/compiler/resolution/resolveNounsPass.ts:281`
`requiredArgumentClarifications`, stable reason `missing-required-argument` :65) ALREADY raises the
fact when the slot is absent — `add_material.volumeUl` is `required: true` in the vocabulary
(`schema/scientist-intent/scientist-intent-vocabulary.yaml:295-302`, with the declared
`satisfiedBy: [volume]` alias). The ONLY reason the chip missed 6/10 is that the model smuggled
`volumeUl: 100` INTO the parsed document (copied from the frozen few-shot at
`server/src/ai/submitSuggestionTool.ts:645`, confirmed at the same line on both tips), and the sweep's
presence test (`declaredOptionalHedgeFold.ts:48` `argumentPresent`: a finite number = present) then
correctly saw "present" and stayed silent. So the defect is smuggling, and the fix is: a present
declared-quantity slot that the scientist's OWN turn did not state must be DEMOTED to absence so the
existing declared machinery raises it. That is a new request-EMISSION rule only.

R1.2 The ONE seam (AI path, compiler untouched). In the `event_shorthand` handler of
`server/src/ai/AgentOrchestrator.ts`, between `parseShorthandForChat` (:2965) and
`shorthandResultFromCompile` (:3083): a new small module (suggested
`server/src/ai/demoteUnstatedQuantities.ts`) walks every parsed action × every argument whose
DECLARED `kind` is `quantity` in the vocabulary `argContracts` (data-driven — zero TS field-name
tables; check BOTH the slot and its declared `satisfiedBy` aliases generically, same shape the sweep's
present-check reads). A slot is STATED only when the request's own words carry an amount-with-unit
associated with that action's material label — decided by the ONE existing quantity extractor,
`extractQuantity` (`server/src/ai/reconcileDraftQuantities.ts:82`, label-adjacency window :106-108);
do NOT write a second quantity grammar (ONE-grammar law). Any unstated slot is stripped from the
parsed doc and the strip is disclosed through the existing reconcile-notes channel (pattern:
AgentOrchestrator.ts:4126-4131). Demote-then-strip makes the existing §5.2 sweep raise the fact
deterministically; `clarificationsFromUnresolvedFacts` stamps the declared chip; behaviour no longer
depends on the model omitting anything. Never strip a volume the scientist actually stated — the
prompt rule "never ask the user to confirm a volume … they already stated"
(AgentOrchestrator.ts:572) stays honoured by the extractor adjudicating, not the model.

R1.3 The ONE data home stays where it is. No new YAML home is needed: the assumption class
(value/unit/label/source/question) is `assumedValues:` in `config/drafting/shorthand-drafting.yaml`
(itself the declared-config home already carrying `surfaces:` and `nounShape:`). If (B) is done
(remove/neutralise `volumeUl: 100` from the few-shot at `submitSuggestionTool.ts:645`, and the two
prompt examples at `shorthandChat.ts:1483`/`:1516` which repeat it), then the chip's `source:`
provenance string (:102, currently naming the drafting example) MUST be updated in the same commit to
name the real home (the declared assumed-values policy), or the chip's visible `(assumed)` provenance
line becomes a lie. Quote the user-visible wording that must remain after the fix (unchanged, from
:101): "How much volume? The prompt states none — 100 uL is assumed; approve it or enter the amount."

R1.4 The answer wire does NOT change. The accepted number continues to ride
`clarificationAnswers` + `foldAnswersIntoShorthand`'s declared-kind quantity splice
(`shorthandChat.ts:1049`, quantity arm ~:1105-1135: answer's own `ref {kind:'quantity', value, unit}`,
unit checked against the declaration, deterministic recompile). The gate PROVED this live at
attempt10 (150 uL -> body -> recompile -> accept -> read-back 150). Q1 fix = emission rule only.

R1.5 Sub-defect (the 1/10 `options: 0` parameter request): in the same fix, a clarification request
whose menu yields zero options must render its typed-answer input (fall back to the existing typed
arm); a card with no actionable control is a rendering violation of the card's own contract. Bounded,
UI-side, no server change.

R1.6 Boundary (packet item 3): THIS item's gate-fix run owns it. It is L2-CLARIFY-TARGET-1's own
acceptance criterion (spec :110-113); CARD-1's "no server/src/ai/**" constraint is a constraint of
CARD-1's prompt, not of this item, and GHOSTPAINT-1's spec of record edits the FOLD seam
(`foldAnswersIntoShorthand`) while this fix edits the PRE-COMPILE EMISSION site — disjoint regions of
AgentOrchestrator.ts (:2965-3083 vs the fold-answer handler). The fix branch must not touch
foldAnswersIntoShorthand or its tests; the orchestrator serialises this coder against GHOSTPAINT-1's
dispatch under the existing slot/serial discipline. No new list item required.

R1.7 Goldens (packet item 4): NO first-turn golden bytes change, NO re-bless — PROVIDED the demotion
lives in `server/src/ai/**` and the fix touches none of the MANIFEST treeState pins
(`schema/scientist-intent/scientist-intent-vocabulary.yaml`,
`schema/workflow/scientist-intent.schema.yaml`,
`schema/registry/compile-pipelines/scientist-intent-compile.yaml`;
`server/src/compiler/scientistIntent/goldens/MANIFEST.yaml:85/:110/:122`) or any golden fixture. The
compiler and goldens stay byte-identical BY CONSTRUCTION (AI-path demotion upstream of the compile).
The fix run adds one pin asserting those hashes are unchanged, and the orch-owned ledger records
"no re-bless required" with that evidence.

Q1 NEXT ACTION: dispatch the TARGET-1 gate-fix run (first free fleet slot, after CARD-1 fix4 /
against GHOSTPAINT-1 per R1.6) implementing R1.2 + R1.3 (+R1.5 UI leg) inside the item's existing
scope.
Q1 GATE ACCEPTANCE: at live :5193 the exact prompt "Add DMEM to A1" (no volume) shows the
assumed-volume chip on 10/10 consecutive asks; chip text = the declared :101 sentence; edit->approve
carries the chip's number through the existing answer body and read-back; the stated-volume control
"Add 200 uL of DMEM to A1" fires NO volume chip; no request anywhere renders with zero actionable
controls.

RULING Q2: CONFIRMED with one precision — the host that supplies is `HarnessChatPane` (the card's
composer), and the prop must carry PLAIN WELL-ADDRESS DATA, mapped at the host seam.

R2.1 No layering violation. `app/src/agent/**` already imports `app/src/event-editor/**` machinery
(ChatClarificationCard.tsx:30-31, ClarifyWellTargetSlot.tsx:67 imports `wellRange`), so a
host->slot DATA prop adds no new edge and inverts nothing; the slot keeps
`useOptionalWellSelection()` (`app/src/shared/context/WellSelectionContext.tsx:211`) as fallback so
no unit test or other host breaks; no provider mounted app-wide; no surface-name branch in the slot
(repo rule #1 respected).

R2.2 Exact host render site: `app/src/agent/HarnessChatPane.tsx:361` (where `<ChatLog` renders) —
not RightPane.tsx:95. The pane already consumes optional seams the same way
(`useOptionalWorkspace`, HarnessChatPane.tsx:269) and RightPane.tsx:57 proves
`useOptionalEventEditor()` is the right optional hook: the pane reads
`editor?.state.selection` (`EventEditorContext.tsx:299`, type `WellSelection`
`app/src/event-editor/types.ts:58`), maps it at the seam to a sorted plain
`readonly string[]` of well addresses (null/absent on non-deck hosts -> prop omitted), and threads
one optional prop `selectedWells?: readonly string[]` down ChatLog (`ChatLog.tsx:529) ->
ChatClarificationCard (`ChatClarificationCard.tsx:197`) -> `ClarifyWellTargetSlot`
(`ClarifyWellTargetSlot.tsx:76`, where it takes precedence over the context fallback when present).
The prop's TYPE must be the plain string array (never `WellSelection` / `WellSelectionContextValue`)
so the universal pane's public API acquires no event-editor type.

Q2 NEXT ACTION: same fix run implements R2.2.
Q2 GATE ACCEPTANCE: live :5193 on the deck, real well-selection (e.g. A2:A3) then a target-wells
clarification card shows the enabled "Use selected wells (A2:A3)" button; click FILLS the literal,
approve answers through the existing scalar path; a non-rectangular selection shows the disabled
button + ruling-l2t0937 reason line verbatim; a run-workspace (no deck) host still renders the slot
without the button and nothing crashes.

END-RULING
