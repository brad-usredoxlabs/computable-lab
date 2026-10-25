# W28-OPTIONBIND-1 + W28-SOURCEROW-1 — pre-r6 coder spec (lane 2, 2026-10-19T15:15 EDT, orch l2t1452)

Base: trunk cl/integration-2 @ b5af2697. One branch/worktree; TWO cleanly separated commit
groups (SOURCEROW first — it is one data row + pins; OPTIONBIND second — wire-contract-adjacent).
Architect authority: decisions/W28-A5n-defect2-partial-draw-and-obs3-source-surface-decision.md
(W28-A5n DECIDED). Orch independently re-read the anchors: resolutionEngine.ts:77-79
(candidateFact returns {label, confidence} only), ProtocolLocalizationThread.tsx:409-412
(value = mentionToken ?? label ?? value), CLARIFICATION_MENU_BY_REASON_ARGUMENT at
clarificationAdapter.ts:107-119 ('not-stated': { labware: '/l' }), vocabulary grep: 23 declared
`source` args all `domain: labware`, ZERO material-domain sources. r5 receipts
(/home/brad/.hermes/cl/receipts-lane2/W28-A5D-R3/2026-10-19_1445-r5/) confirm the wire answer is a
plain label `"microcentrifuge tube":"1.5 mL Microcentrifuge Tube (seed)"` — no `[[labware:...|...]]`
idiom — i.e. the OPTION-PICK NON-BINDING class exactly as A5n Q1 describes.

## Group 1 — W28-SOURCEROW-1 (DATA-AMENDMENT per A5n Q2; app-only, no restart beyond tsx --watch)

File: app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts
Table CLARIFICATION_MENU_BY_REASON_ARGUMENT (:107-119), the 'not-stated' entry becomes:

    'not-stated': { labware: '/l', source: '/l' },

RED-first: one new test asserting {reason:'not-stated', actionLocation:{action:'bead_beat',
argument:'source'}} -> menuProvider '/l'; then the row. Deliberate pin flip IN THE SAME commit
(sanctioned GAPCARD-1 pin-update pattern): clarificationAdapter.gapcard.test.ts test 5 area
(:157-161) pins (reason,'source') -> '/m' for four reasons — ONLY the 'not-stated' line flips to
'/l'; the other three stay '/m'. The (reason,'*') fallback `'not-stated': '/m'` (:107 map
CLARIFICATION_MENU_BY_REASON) STAYS — a source-less not-stated hedge keeps /m. sampleCard1 tests
1/2/3 unaffected (verify by running, not by reasoning).

## Group 2 — W28-OPTIONBIND-1 (NEW-CLASS fix per A5n Q1; option-button pick must bind)

Class: an option button on an ENGINE ambiguous-noun card emits a plain label that the ANSWER-BIND
contract treats as prompt-echo-only (IntentCompileFromPromptHandlers.ts:212-224 mention-pattern +
:350-354 store validation) -> inert answer -> identical card re-emitted forever. Fix = let the
option carry the record identity the engine ALREADY holds, and emit the existing idiom.
Byte-unchanged surfaces (A5m hard constraints): the :313 value-join in resolveNounsPass.ts, the
STAGNANT-HEDGE consume rule, all drop arms. Anti-fabrication: the handle is the engine's existing
store-backed evidence only; tier >1 / mint-affordance candidates get NO handle.

1. server/src/compiler/resolution/resolutionEngine.ts :77-79 `candidateFact` — return an OPTIONAL
   record handle when (and only when) the candidate has a store-backed record id/curie of kind
   labware (tier ≤1). Shape: `ref` string `[[labware:<recordId>|<label>]]`-compatible id — follow
   whatever canonical id form the ClarificationPicker answerFromMention path already emits
   (ClarificationPicker.tsx:118-131) so the server validator accepts it unchanged.
2. SPINE-1 frozen unresolved shape: schema/workflow/scientist-intent.schema.yaml candidate entry
   gains the OPTIONAL field (additive-only; additionalProperties posture respected) + the wire TS
   type; golden-fixture integrity pins updated TOGETHER in the same commit (sanctioned pin+row
   pattern; diff must be deliberate, not a rubber-stamp).
3. app ProtocolLocalizationThread.clarificationAdapter.ts :180-194 — ride the candidate ref onto
   AiClarificationOption (the existing `ref?` field at types/ai.ts ~:200; no new field).
4. app ProtocolLocalizationThread.tsx :410 / option onClick :791-797 — when the option carries a
   ref, the answer value IS the idiom (`[[labware:<id>|label]]`, exact answerFromMention shape);
   otherwise today's label fallback byte-unchanged.

RED-first tests (server): candidateFact populates ref ONLY from store-backed tier-≤1 candidates;
mint/tier-5 candidates lack it; unresolved-shape validation passes with/without the field.
(app): option built from a ref-bearing candidate carries ref; pick with ref -> idiom value in the
answers map; pick without ref -> today's label (pin).

## Verification (worker)

- app: `npm run test:unit -w app` targeted files (clarificationAdapter gapcard+sampleCard1 tests,
  ProtocolLocalizationThread pins) green; app tsc: zero NEW errors vs current trunk baseline
  (record the count).
- server: targeted suites (resolutionEngine, IntentCompileFromPromptHandlers, schema golden pins)
  green; zero NEW failing files vs trunk baseline (record the failing-file SET, sorted); server
  typecheck baseline (33 error lines) unchanged.
- NO product YAML semantics change beyond the one additive optional field; NO stack restart needed
  by the worker (orch handles verification restarts; YAML schema change DOES need one — orch does it).

## Forbidden

- No changes to resolveNounsPass.ts join/consume arms, lint YAML, prompt templates, or the accept
  path. No fixture edits. No new endpoints. No hardcoded domain literals (the ref is data riding an
  existing wire field).

## Report

Write the coder report to .hermes/plans/W28-OPTIONBIND1-report.wip-<token>.md ending with marker
`W28-OPTIONBIND1 DONE <head-sha>`. Orch afterwards: advc gate, self-verify, merge, stack restart
(schema YAML), headless re-probe that the r5 stall is gone (answer with seed option -> card
clears), then gate r6 (adds: sample fact card renders `/l` at first fold — A5n Q2).
