# W2-11 D4 deck-review-empty — ARCHITECT DECISION (l2t0015 packet, 2026-10-13)

Trunk at decision time: a28d9789. Packet: W2-11-d4-deckreview-empty-evidence-l2t0015.md.
Packet source cited: W2-11-d4-deckreview-empty-evidence-l2t0015.md. Decision source: this file.

## VERDICT: (c) — staged both. (a) fixture-side now to unblock W2-11 D4 + A5e;
## (b) product fold of resolvedLabwares as its own spec'd task. Neither is optional.

## Verification performed (every load-bearing claim re-checked by hand at a28d9789)

All packet claims CONFIRMED, with three refinements:

1. CONFIRMED — deriveDeckLabware folds ONLY labwareAdditions + labwareRequirements;
   resolvedLabwares invisible.
   app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx:108-135
   (note: file lives under the `protocol/` subdirectory, not right-pane/ directly).

2. CONFIRMED with refinement — resolve_labware's match arms
   (server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts): zero-match ->
   labwareAdditions (:1652-1658); one-match -> resolvedLabwares (:1661);
   multi-match -> top pick into resolvedLabwares + info diagnostic (:1673-1691).
   REFINEMENT: the one-match/multi-match/authoritative arms DO emit an addition when
   `cand.deckSlot` is set (:1640-1646, :1664-1670, :1674-1680). BUT on the
   scientist-intent shorthand path candidates NEVER carry a deckSlot:
   normalizeScientistIntent builds labwareInstances from symbolic labels only
   (server/src/compiler/scientistIntent/normalizeScientistIntent.ts:324-333 —
   id/labwareHint/role/resolutionStatus, no deckSlot), and
   ProtocolIntentLowering maps candidate deckSlot from labware.deckSlot
   (server/src/compiler/protocolIntent/ProtocolIntentLowering.ts:195-223) which is
   absent for those instances. Net effect = the packet's stronger claim holds on
   this path: ADDITION EMITS ARE ZERO-MATCH-ONLY.

3. CONFIRMED — compileScientistIntent puts labwareAdditions on terminalArtifacts
   only when non-empty (server/src/compiler/scientistIntent/compileScientistIntent.ts:292-294);
   resolvedLabwares is READ from the pass output (:276-279) and then NEVER
   propagated — the field is not on TerminalArtifacts at all
   (server/src/compiler/pipeline/CompileContracts.ts:341-354 declares only
   labwareAdditions + labwareRequirements). labwareRequirements has no writer on
   the scientist-intent pipeline (grep: writers are submitSuggestionTool /
   AgentOrchestrator raw event_graph paths only).

4. CONFIRMED — the D4 assertion is exactly `boxCount > 0` on
   pl-deck-review checkboxes (app/e2e/w2-11-campaign-demo.spec.mjs:861-867), and
   the accept-side gate `canAccept = localMacro && hasPreview(>=1 placement or
   event)` (ProtocolLocalizationThread.tsx:534-540, :475-480). Both stand pinned;
   neither is touched by this ruling.

5. ADDITIONAL MEASURED FACT (not in the packet) — the needs-clarification branch's
   terminalArtifacts is `{events:[], directives:[], gaps, protocolIntent?}`
   (compileScientistIntent.ts:255-259): NO labware fields at all. So a 422
   held-bundle fold (foldHeldBundle, ProtocolLocalizationThread.tsx:294-308) ALSO
   yields an empty deck review by construction. The run-5 422 non-determinism and
   the run-4 empty-complete-branch are therefore distinct failure shapes; (a) must
   account for both (see resume condition).

## Rationale

Why (a) is correct as the immediate unblock and does not paper over the gap:
- The producer is proven alive on the one-shot path (packet evidence 1: headless
  POST /api/intent/compile with 'probe plate' -> zero-match -> labwareAdditions).
  A macro naming >=1 labware the lab does NOT have makes the deck review render
  honestly TODAY, via the existing zero-match arm, with zero product change and
  zero assertion change. The checkbox then flows to ghostEvents ->
  buildPreviewFromDraft (app/src/event-editor/right-pane/ai/draftPreview.ts:281-339),
  which materializes unmatched additions via labwarePayloadForAddition's generic
  fallback (:62-65) and lawn placement (:311-313) — the >=1-placement gate opens
  on real, validated placements.

Why (b) is nonetheless a real product gap, not a test artifact — and why (a) alone
is rejected as the terminal answer:
- CompileContracts.ts:335-340 states the architecture-of-record intent: labware
  "the run's deck must materialize for the compiled events to bind... so the
  events never appear on a blank canvas." When every hint in a localized protocol
  resolves against REAL inventory (exactly what a scientist with a stocked lab
  produces), the deck review offers NOTHING and the Brad-pinned accept gate can
  never open on the chat path. The product inverts the value of inventory: the
  more records the lab owns, the more un-acceptable a legitimate compile becomes.
  That is a product defect class, not a fixture deficiency.
- The fold is genuinely non-trivial (correctly sized for its own task, not smuggled
  into W2-11): DeckLabwareSuggestion keys are classCurie-or-recordId strings with a
  boolean `requirement` discriminator (:88-94) — a third kind ("existing record to
  PLACE, not author") needs the shape extended; ghostEvents maps picks back to
  additions/requirements payloads (:242-254) and needs the resolved arm; the accept
  side needs no change (intentAccept carries localMacro/answers only, :491-498 —
  placements live in the committed editor state, acceptedGraph :489). Semantics are
  clean and already declared in data: submitSuggestionTool.ts:311 codifies
  "a record the lab already owns must be PLACED, not re-created" — folding
  resolvedLabwares into the review as placement offers IS that rule, expressed as
  the confirmation surface the thread already is.
- (b) task must also handle list-shape: cap/rank the resolved fold (a deck review
  echoing every matched record from a broad inventory is its own defect), and add
  the terminalArtifacts.resolvedLabwares field to the CompileContracts contract +
  compileScientistIntent propagation (:276-279 already has the data in hand).
  No imperative policy: the fold is a pass-through of pass output; picking stays
  the scientist's checkbox act.

Why NOT (b) now: it touches the shared localization thread used by W2-8/A5 legs
mid-flight, needs its own spec + browser-review gate, and D4 does not need it to
close honestly — (a) closes D4 on the zero-match arm while (b) is built properly.

## Sub-question: does the A5e/W2-8 accept leg need the SAME fix?

NO — DIFFERENT FIX. The (b) fold does nothing for A5e's stated shape (inventory
without labware): with no matching records, every hint is ZERO-match -> additions,
never resolvedLabwares. A5e's >=1-preview gate opens on product today IF (i) the
macro names >=1 unmatched labware hint AND (ii) the deck scope admits the placement
— placements run through scopeAllowsPreviewPlacement + validatePlacement
(draftPreview.ts:316-330); A5d's measured zero-preview is consistent with a
scope/surface skip or the 422 zero-artifact fold (fact 5), NOT with a missing
resolvedLabwares fold. Direction for the A5e leg: unmatched-hint macro + a deck
scope with a lawn (or the single-slot locked-scope arm :299-304), and measure the
scope skips BEFORE seeding — per the standing A5d next-check rule.

TRAP WARNING for the queue (affects handoff item 2c): do NOT "seed resolvable deck
labware" into A5e while (b) is unshipped. Seeding resolvable records flips hints
from zero-match (additions -> checkbox today) to one-match (resolvedLabwares ->
INVISIBLE today) and re-empties the deck review. Under current code the
deterministic fixture direction is the opposite of seeding: keep >=1 hint
UNmatched. Once (b) lands, seeded-record legs reopen.

## Exact resume condition

W2-11 D4 (lane 2 orchestrator, harness-side only — assertions untouched):
1. Make the localized macro deterministically yield >=1 ZERO-MATCH labware hint
   (a labware label with no LAB record — e.g. keep a named object out of the lane
   DB / name an object the seed does not carry). Verify headlessly first: POST
   /api/intent/compile on the macro -> terminalArtifacts.labwareAdditions
   non-empty (packet's probe script pattern).
2. Account for the small-model macro non-determinism: on a 422 zero-artifact fold,
   retry the compile-from-prompt leg up to a bounded N before failing the leg —
   retrying a flaky small-model draw is NOT weakening the assertion.
3. Run gate 5; D4 passes when pl-deck-review renders >=1 checkbox, a box checks,
   pl-load-deck ghosts, pl-accept enables (>=1 real placement), and the LPR +
   branch_resolution assertions go green. That is the resume: gate 5 green.

(b) ships as its own spec (proposed id DECK-FOLD-1): terminalArtifacts gains
resolvedLabwares (CompileContracts + compileScientistIntent propagation),
deriveDeckLabware + DeckLabwareSuggestion + ghostEvents gain the existing-record
placement kind with a bounded/ranked fold, unit + browser-review receipts. Until
it ships, any fixture leg on the one-shot path must guarantee >=1 unmatched hint
per the trap warning above.

No task-list edits were made here (architect is read-only on the queue); the
orchestrator incorporates (a) into W2-11 D4's harness note and authors DECK-FOLD-1
as a new lane-2 task.
