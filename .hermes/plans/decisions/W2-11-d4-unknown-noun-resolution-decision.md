# W2-11 D4 unknown-noun resolution — ARCHITECT DECISION (l2t0330 packet, 2026-10-13)

Trunk at decision time: 79ffa518. Packet: W2-11-d4-unknown-noun-surface-evidence-l2t0330.md.
Rides on W2-11-d4-deckreview-empty-decision.md (VERDICT (c)) — that ruling stands; this
ruling extends it to the dominant failure shape (every answered draw bars, not completes).

## VERDICT: (c) — staged, per the precedent of the prior ruling.
## (i) NOW, harness-side: D4 rides HONEST MINT REPLAY — the leg answers each
##     unknown-noun clarification by invoking the mint affordance the clarification
##     itself offers (POST /vocab/mint, the same endpoint ClarificationPicker's
##     resolveMention calls), in a bounded cycle, until a draw completes on the
##     zero-match labwareAdditions arm. Assertions stay pinned.
## (ii) THREAD-ASK-1 as its own spec'd product task: the thread renders held
##     clarifications with the answer surface (picker + mint) and the server gains
##     a data-side answer->slot binding on compile-from-prompt. Fact 4 is a real
##     product gap; D4 does NOT wait for it.
## (a) is REJECTED as non-deterministic by measurement, not opinion. Details below.

## First-hand verification (every load-bearing claim re-checked at 79ffa518 + live :3093)

1. CONFIRMED with path correction — the mint affordance is offered ONLY on the
   unknown-noun arm. File is server/src/compiler/resolution/resolutionEngine.ts
   (packet omitted the /resolution/ directory). :203-218: `mints =
   mintAffordances(allCandidates)` then `clarificationFor(req, 'unknown-noun',
   mints)`; lookup-failure (:207) and unknown-address (:209) arms get `[]`.
   mintAffordances (:52-54) = tier-5 / no-curie candidates.

2. CONFIRMED — ClarificationPicker (app/src/event-editor/right-pane/ai/
   ClarificationPicker.tsx) is consumed ONLY by ProtocolIdeShell.tsx:521 and
   QuestionsPanel.tsx:112. ProtocolLocalizationThread does NOT render it:
   foldHeldBundle (app/src/event-editor/right-pane/protocol/
   ProtocolLocalizationThread.tsx:294-308) folds the held 422 into localMacro +
   infoMsg string `label (reason)` only. The thread bars without a means to
   answer. FACT 4 CONFIRMED — real product surface gap, independent of the fixture.

3. CONFIRMED — handleSendCorrection (ProtocolLocalizationThread.tsx:420-450)
   folds `protocolText + "\n\nCorrection (agreed): <text>"` and re-sends the SAME
   answers; composeAnsweredPrompt
   (server/src/api/handlers/IntentCompileFromPromptHandlers.ts:127-136) iterates
   answers only. The correction rides the prompt as text; resolve_nouns is
   structural. My live replication (3+ draws on :3093, family
   CAN-protocol-1791839280914): correction-style text does not clear the bar, and
   NEITHER does scrubbing the vendor name out of the protocol text — see 6.

4. CONFIRMED — spec.mjs D4 leg (app/e2e/w2-11-campaign-demo.spec.mjs:806-914):
   deck-review wait :878-880, bounded MAX_REDRAW=5 neutral re-draw loop :882-905,
   the pinned assertion `boxCount > 0` at :906, accept gate :910-913. The
   neutral-nudge re-draw text explicitly never resolves the noun on the
   scientist's behalf (:893-895). The leg is honest as written; it just cannot
   pass while every draw bars, because a 422 fold has no labware fields (prior
   decision fact 5).

5. NEW MEASURED FACT — the MEANT steps DO NOT LITERALLY CONTAIN the full vendor
   label. Family step text carries `BashingBead™ Lysis Mod` (truncated) and
   `ZymoBIOMICS™ BashingBead™`; the small model RECONSTRUCTS
   `BashingBead Lysis Module` per draw from the brand context. Confirmed by GET
   /records/CAN-protocol-1791839280914 and by the held macro (18 actions; the
   noun sits in add_material.target, shake.source, spin.source, transfer.source).
   The vendor-name bar is therefore a property of the PROTOCOL'S BRAND CONTEXT,
   not of any one token that an edit can remove.

6. (a) REJECTED — fixture-honest wording edit measured non-deterministic. Live
   trials on :3093 (answered draws, rack branch):
   - replace "BashingBead Lysis Module" -> generic: STILL 422 unknown-noun; the
     model re-derives `BashingBead Lysis Tubes`, `Lysis Module Tube`,
     `Bashing Bead Lysis Rack` from the surviving brand context.
   - FULL brand scrub (0 bashingbead/zymo/™ tokens in protocolText): STILL 422;
     the model emits `bead beater tube`, and separately —
   - STRUCTURAL FACT: composeAnsweredPrompt (:130-135) appends the answers block
     VERBATIM, and the family axisId itself carries the vendor tokens
     (`branch-axis-zymobiomics-bashingbead-lysis-rack-zr-...`), so the vendor
     name RE-ENTERS the compile prompt on every answered draw no matter what the
     step text says. A text-level scrub cannot deterministically de-brand the
     prompt without editing the family RECORD's axis ids — fixture surgery under
     the assertion, not a scientist-plausible edit.
   Conclusion: (a) converts a bounded redraw budget into unbounded label drift.
   The unknown-noun bar is the SPINE doing its job (SPINE-4: text cannot
   un-ask a structural unknown). D4 must answer the bar, not dodge it.

7. (b) REJECTED for D4 to ride — bigger than rendering the picker. The thread's
   `answers` are branch-axis answers (axisId->value) consumed ONLY by
   composeAnsweredPrompt (fact 6); there is NO server path that binds a
   clarification answer (recordId/mention) to a macro slot before resolve_nouns.
   Verification: 422 contract CompileFromPromptNeedsClarificationResponse
   (IntentCompileFromPromptHandlers.ts:155-163) + the answered-request body
   `answers?: Record<string,string>` (:110-114). Wiring the picker alone would
   show a bar the thread can render but the endpoint cannot honor. That is a
   server response-contract change (SPINE-level) + UI task + browser gate —
   exactly why D4 must not wait for it. Same shape as the prior ruling's
   reasoning for deferring (b)/DECK-FOLD-1.

8. CONFIRMED — the mint affordance is real and lands on the trap-correct side.
   Live: the 422 candidates carry `Create local term "BashingBead Lysis Module"`
   (confidence 0.05). POST /vocab/mint {refKind:'material', label} (routes.ts:497,
   VocabHandlers.ts:76-135) creates a DRAFT material with status 'proposed'
   (:60) and an idempotent label-derived recordId (:97-100). This is exactly what
   ClarificationPicker's mint floor does (resolvers.ts:67-92 —
   `apiClient.mintLocalTerm` via resolveMention). MEASURED OUTCOME: after minting
   the 4 unknown-noun labels, the spine's tier-1 local tier BINDS them — the
   unknown-noun set shrank per cycle (3 labels -> 1 -> 0 of the known set) across
   live draws. Mint records are MAT- materials, NOT labware records, so
   resolve_labware stays zero-match -> labwareAdditions -> the checkbox arm that
   renders TODAY. The prior TRAP WARNING (no seeded resolvable deck labware
   before DECK-FOLD-1) is not tripped: minting materials does not flip hints into
   resolvedLabwares.

9. DISCLOSED SIDE EFFECT of this consultation — my live probe minted 4 proposed
   materials into the live :3093 store: MAT-bashingbead-lysis-module-sy3b,
   MAT-96-well-deep-block-ndop, MAT-magnetic-separator-63q2,
   MAT-eluate-plate-1ad3. Minting is idempotent by label (fact 8), so the D4
   leg's mint cycle converges on these same ids; they are 'proposed' draft
   records, the same state the product's own mint floor produces. No DB rows were
   otherwise touched; no stack was restarted; no file written except this one.

## Why (i) mint-replay is the honest unblock

- It replays the scientist's ACTUAL resolution act for an unknown noun: the
  clarification explicitly offers the mint, the funnel floor
  (specifications/creation-entry-points.md §6, VocabHandlers.ts:2-16 —
  "minting is the LAST resort by design"), the same POST the picker fires. The
  leg is not faking anything the product does not do; it is doing, at the API
  seam, the act the scientist would take the moment the thread can offer it
  (which is THREAD-ASK-1).
- It is deterministic where (a) was not: measured per-cycle SHRINK of the
  unknown-noun set (fact 8) — each mint permanently removes that label (idempotent
  record, tier-1 next search). Label drift across draws is real (a fresh draw can
  surface a new generic noun, measured: 'heater-shaker block', 'Eluate Plate'),
  so the cycle is bounded and each cycle must be logged with the before/after
  unknown set.
- It makes D4 the ONLY end-to-end coverage of the unknown-noun->mint flow, which
  today lives only in unit/goldens (resolveNounsPass.test.ts,
  nounResolution.test.ts:503, goldenIntentToClarification.test.ts:117-146 — all
  confirmed present, so NO additional regression leg is owed for the bar itself).
  (a) would have DELETED the only e2e exposure of the flow; (i) adds it.

## Exact harness discipline for the D4 leg (orchestrator, harness-side only)

1. Before/at the deck gate, run a bounded MINT CYCLE (recommend cap 8 cycles,
   each cycle = one answered compile + one mint per unknown-noun label):
   POST /intent/compile-from-prompt {protocolText, answers} on the unscrubbed MEANT
   text (do NOT edit wording — fact 6); on 422, extract
   clarifications[].reason === 'unknown-noun' labels; for each, POST /vocab/mint
   {refKind:'material', label}; re-send. Log per-cycle: `{draw, http,
   unknown_labels_before, minted_labels}`.
2. The existing browser-side deck gate stays UNTOUCHED: after a completing draw
   the zero-match arm fills pl-deck-review; the MAX_REDRAW=5 refine loop stays as
   a second safety net; the pinned assertion `boxCount > 0` (:906), the check ->
   pl-load-deck -> pl-accept flow (:907-913), and the LPR assertions are NOT
   modified. A draw that completes with an empty review still fails, honestly.
3. Retry-on-fault must also cover the newly measured INTENT_COMPILE_FAILED 500
   (observed once, post-mint, on a live draw): treat it like a flaky draw within
   the budget; it is MALFORMED/failed model output, not an assertion outcome
   (500 contract :171-175).
4. The mint cycle is data-side ONLY: no TS policy branch anywhere, no seed of
   LAB/labware records, no assertion change. If a cycle does not strictly shrink
   the unknown set two cycles running, fail the leg honestly and hand back the
   per-cycle log — that is a spine defect, not a fixture defect.

## Product task to author: THREAD-ASK-1 (lane 2)

Scope: make the bar answerable WHERE IT IS SHOWN.
- Server: extend the compile-from-prompt answered-request with a DATA-side
  clarification-answer binding (e.g. answers entries carrying the clarification
  label + chosen recordId/mint id), consumed BEFORE resolve_nouns via the same
  spine tier-1 that already binds minted records (fact 8 proves the store side
  needs nothing). No imperative policy: the binding is pass-through of the
  scientist's stated answer; the spine remains the only binder.
- Client: ProtocolLocalizationThread's foldHeldBundle renders held clarifications
  as answerable cards with ClarificationPicker + the mint affordance; answering
  re-sends via the existing compile round-trip. File boundary:
  ProtocolLocalizationThread.tsx (fold :294-308 + render region) and
  IntentCompileFromPromptHandlers.ts.
- OPEN QUESTION for Brad inside the spec (do not silently decide): mint is
  MATERIAL-ONLY today (VocabHandlers MINTABLE :44-48 'material' only;
  ClarificationPicker canMint excludes labware/equipment layers,
  ClarificationPicker.tsx :255-262). The D4 nouns are labware-semantic objects
  and minting them as materials works but is a LAYER SHORTCUT — whether
  /vocab/mint gains a labware draft floor is a domain-policy call (materials
  provenance hierarchy), not an implementation detail.
- Sequencing vs DECK-FOLD-1: independent surfaces of the SAME file
  (ProtocolLocalizationThread.tsx) — DECK-FOLD-1 touches
  deriveDeckLabware/ghostEvents/deck-render; THREAD-ASK-1 touches fold + a new
  clarification region + the server handler. Neither blocks the other; order by
  lane throughput. Whichever lands second must rebase on the first's merge.
  THREAD-ASK-1 additionally owns the sole overlap risk: it must not move
  foldHeldBundle's holdForReview call (:307) out from under the deck gate.

## Exact resume condition

W2-11 D4 closes when gate 5 runs green end-to-end WITH the mint-cycle log
showing per-cycle unknown-set shrink, a completing draw (zero-match
labwareAdditions >= 1), pl-deck-review >= 1 checkbox checked, pl-load-deck
ghosting, pl-accept enabling on >= 1 real placement, and the pinned assertion at
spec.mjs:906 unchanged. That is the resume: gate 5 green + mint log attached.

ARCHITECT DONE W211-D4-NOUN
