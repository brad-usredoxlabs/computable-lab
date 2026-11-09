# RULING — Corpus2 Prompt-2 recon: task filing + the blob-bar contract
Architect ruling, lane 2, 2026-11-02T07:47 EDT packet (l2t0747), Q2.
Recon: ~/.hermes/cl/receipts/PROMPT2-SCOUT-20261102/20261102T053516/report.md
(4 drives, 0 interception, request bodies + shots preserved; 9 WORKS / 2 MISSING /
2 BLOCKED-WRONG). Prompt-1 = WORKS; prompt-2 recon accepted as delivered.

## The F4 contract decision first — because it shapes the task set

The scout framed F4 as "corpus expectation vs product contract NEEDS an
architect ruling: either the corpus line or the bar has to move." RULING:
**NEITHER moves. The collision is not real — it is a BIND DEFECT.**

The shipped contract, in data-declared terms, already IS the rule the scout
proposed ("the blob bar applies only when the noun resolves to no testable
formulation"):

1. The bar fires in normalize from a pure-DATA cue list
   (`config/drafting/mixture-material-cues.yaml`; zero cue literals in code)
   against a mixture-shaped `material` label that declares NO components —
   `server/src/compiler/scientistIntent/normalizeScientistIntent.ts:843-891`.
2. The raised fact rides the GATED channel, not the hard bar
   (`normalizeScientistIntent.ts:877-883`, SH-QA-1 OQ1 ruling).
3. The SH-QA-1 resolution-aware firing gate drops that fact **iff the engine
   binds the slot**: "a gated fact is dropped iff its identityKey is a bound
   SLOT key ... Zero verb/arg/domain/reason NAME literals — this switches on
   engine output + identity keys only"
   (`server/src/compiler/resolution/resolveNounsPass.ts:514-537`).
4. The material arg contract declares the bindable levels as DATA:
   `levels: [concept, formulation, vendor-product, instance]` — formulation is
   in the domain (`schema/scientist-intent/scientist-intent-vocabulary.yaml`,
   add_material material contract, levels at :275-276 region; `preferred:
   concept` is a PANEL pre-selection hint, "NEVER a filter" per the comment at
   :270-273).

So: a named stock formulation with concentration + solvent that the engine
BINDS already BYPASSES the bar by construction — the gate drops the blob fact
and events ship with the ghost, exactly as the corpus line expects. The card
on 3/3 drives means the auto-resolution FAILED TO BIND
`MSP-PR9-TEST-CLO-1MM` ("1 mM Clofibrate in DMSO", 1 mM + solvent DMSO,
recon:59-62) even though the picker's search surfaces it as the FIRST row
(recon:92-94, `shots/34-leg2-clarify-search-formulation.png`). The defect is
in the unattended bind path (no user-typed search), not in the bar.
`declaredArgumentReachability.test.ts:341-367` stays green untouched: its
canonical prompt names a blob with NO exact formulation in the spine — that
case must still bar, and it will, because the fix moves binding, not gating.

Contract stated once, for the task blocks: **a mixture-shaped material noun
bars iff it declares no components AND the spine binds no testable
formulation for it; an exact-name bind to a formulation carrying
concentration + solvent is a bind, not a blob.** This is already the shipped
architecture — the tasks make the engine honor it, they do not amend it.

## The task set: FOUR tasks (3 product + 1 fixture/harness), plus one named NON-filing

File with the lane-2 block shape. Suggested ids/titles; the orch composer
re-pins every cite at its own base tip (CARD-1 partial merge will move lines).

### T-1 `L2-PROMPT2-GHOSTPAINT-1` — owns F1
Ghost paints 0 wells in 3/4 drives: the committed-state single-placed-vessel
rule (L2-PROMPT1-GHOST-1, `app/src/graph/lib/eventGraph.ts:948-960` via the
ONE shared helper `placedVesselAttribution.ts`) was never applied to the
preview projection — `previewProjection.collectEventLabwareIds()`
(`app/src/event-editor/lib/previewProjection.ts:120-134`) reads only explicit
`details.*labwareId*` fields, so a `details = {material, volumeUl, volume,
wells}` preview event indexes to nothing and `data-preview` is never set
(recon:121-143). Tooltip/grid disagreement is the user-visible harm
(recon:129-130: tooltip previews 303 µL while the grid shows nothing).
- Owns: route the preview projection through the SAME single helper (one
  rule, one vocabulary — scout streamline 3, recon:221-224), AND the
  compiler-side root: carry `details.labwareId` on the deterministic
  re-compile after a clarification answer when `context.deckPlacements`
  carries the binding (recon:141-143; drive 2's committed event
  `evt-add_material-klh1bpqc` has NO labwareId, recon:116/183, vs drive 1's
  concept answer which DOES, recon:182 — proof the answer-fold path drops it).
- Boundaries: `app/src/event-editor/lib/previewProjection.ts` (+ tests),
  the server answer-fold/re-compile site that builds add_material details
  (coder locates the exact fold→compile seam; NEVER the placed-vessel helper
  itself — GHOST-1's rule is reused, not forked). Card chrome and
  `shorthandChat.ts` fold logic OUT (TARGET-1 territory if it lands first).
- Acceptance: the recon's drive-2 shape re-driven — formulation answer, settle
  — shows 16 preview wells painted WITH explicit labwareId on the preview
  event, grid and tooltip agree, cold reload persists.

### T-2 `L2-PROMPT2-COMPOSITION-BIND-1` — owns F4
Make the engine honor the shipped contract (above). Phase 1 is root-cause
(why does the unattended resolve not bind an exact-name formulation the spine
search finds? — level order, exact-name match, or spine-search shape in the
auto path), phase 2 the smallest data-respecting fix. NO change to the cue
DATA, the gated channel, or the SH-QA-1 gate itself.
- Owns: bind of "1 mM clofibrate in DMSO" → `MSP-PR9-TEST-CLO-1MM` on the
  turn, gated blob fact dropped by the existing gate, events + ghost ship on
  turn 1.
- Acceptance (live): turn 1 of the verbatim prompt
  `Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.` on a spine containing
  the formulation yields events/ghost (corpus Leg-A expectation, recon:166-167),
  zero clarification card. Negative control: the same prompt with the
  formulation REMOVED from the spine still yields the
  `unrealized-mixture-blob-material` card + zero events
  (`declaredArgumentReachability.test.ts:341-367` expectation stays green —
  it is the bar's own pin). Bind must be exact-name; no fuzzy/nearest-name
  guessing (never-guess).
- Highest blast radius of the set (touches the resolve spine) — goes LAST
  among the three product tasks.

### T-3 `L2-PROMPT2-SCIENCE-CHAIN-1` — owns F2 + F3
The scout's own highest-value call (recon:21, streamline 4, recon:226-229):
the single-ref bind never expands the formulation's composition, so no
concentration is statable anywhere — `enrichAddMaterialRefs` builds
`composition_snapshot` only `if (refs.length > 1 && existingSnapshot.length === 0)`
(`server/src/ai/materialRefLabels.ts:683-691`); a bound formulation's
`formulation.composition` (solute 1 mM + solvent DMSO, on the record) never
reaches the event (recon:150-157); every `conc` cell `—` on every surface,
warm and cold (recon:145-149, :203). Client dilution math already exists
(`eventGraph.deriveMaterialEntry` dilutes a snapshot concentration by well
volume; `WellTooltip` prints it) — the data simply never arrives.
- Owns: (a) server-side expansion — when ONE bound ref resolves to a
  formulation whose record declares `formulation.composition`, build the
  `composition_snapshot` from the formulation's OWN data (expansion at bind
  time, no client-side formulation lookup); (b) F3 share-of-mixture: fill the
  `fractionOfMixture` column (`eventGraph.ts:529` `parseMixtureFraction`
  today only reads an explicit snapshot `source` fraction) with a
  volume-derived share WHEN a denominator is honest, and state the
  denominator alongside the percent per scout streamline 5 (recon:230-232) —
  `1.0 µL / 302.0 µL (0.33 %)` shape; a percent with an unstated denominator
  is two meanings for one number. Shares ride the snapshot the same change
  creates; no separate parallel fraction channel.
- Boundaries: `server/src/ai/materialRefLabels.ts` (+ tests), the snapshot
  consumption/derivation in `app/src/graph/lib/eventGraph.ts` + tooltip
  rendering (+ tests). `add_material` vocabulary contract unchanged.
- Acceptance: re-drive drive-2's committed state; the E2 tooltip reads the
  clofibrate concentration diluted from the 1 mM stock and a DMSO row with a
  denominator-stated share; unit RED-first pins for single-ref formulation
  expansion; existing multi-ref snapshot behavior byte-identical (regression
  pin).

### T-4 `L2-PROMPT2-FIXTURE-BOARD-1` — the data caveat, YES it needs its own task
The scout's caveat is decisive: the A2:H5 legacy 200 µL composite (pre-dates
the prompt-1 re-gate, recon:52-57) plus the scout's own drive-1 concept commit
(recon:189-194, no event-delete affordance) make E-B3 ("100ul DMEM only") and
E-B4 ("~99 % / ~0.9 %") LITERALLY UNJUDGEABLE on the current graph. This is
DATA, not product (recon:240-243), but the prompt-2 gate cannot be judged on a
polluted board, and "judge the derivation, not the arithmetic" is a recon
concession, not a gate standard.
- Owns: a fresh event-graph fixture/board for the prompt-2 journey carrying
  ONLY prompt-1's 100 µL DMEM state (no 200 µL composite, no clofibrate
  commits), seeded via the existing fixture/seed harness — NOT a delete, NOT
  a records hand-edit. Harness/seed-side files only; zero product code.
- Acceptance: the cold tooltip on E2 pre-drive reads exactly the prompt-1
  baseline (100 µL Thermo DMEM, 1 event); the board is reproducible from the
  fixture definition. This is the PRE-RUN task for the prompt-2 re-gate.

## Ordering vs the pending CARD-1 / TARGET-1 / CHATHOST queue

CHATHOST-SWEEP-1 is in-progress and keeps the fleet slot; do not preempt it.
Then, per the Q1 sibling ruling (`CARD1-W11-volume-boundary-l2t0747-ruling.md`):

  CARD-1 partial merge (changes 1/2/3a) → **TARGET-1** (ratified queue
  position PICKER→CARD→TARGET; owns W11 V1+V2+chip; its answer-fold and card
  work is upstream of F1's fold path and F2's answered-bind shape) →
  **T-1 (F1)** (smallest, app+fold-site, unblocks honest E-B1 paint judging)
  → **T-3 (F2+F3)** (server materialRefLabels + client derivation; benefits
  from TARGET-1's settled card-answer shape) → **T-2 (F4)** (resolve-spine
  blast radius last) → **T-4 (fixture)** any time after TARGET-1, MUST be in
  place before the prompt-2 re-gate → prompt-2 re-gate (cold browser gate,
  fresh board, truth-table row flips only on WORKS).

Rationale for putting all three product tasks behind TARGET-1 rather than
parallel: TARGET-1 changes the card chrome and the answer-fold the F1/F2
repros run through; dispatching T-1/T-3 on a trunk that is about to change
those seams manufactures re-pins for the composer. Fleet serialization makes
"parallel" illusory anyway.

## Named, NOT filed

Scout streamline 2 (rank default card rows by the full mention, not the head
noun — recon:217-220): real defect, but it is PICKER-1's registry ranking
surface, and if T-2 binds the exact-name formulation the failing scenario
mostly evaporates for this journey. PROPOSED, judged on the prompt-2 re-gate
receipts after T-2 lands; fold into the registry ranking if it still bites.
No task until then (fold, don't found).

Task-list blocks are the orchestrator's to file under its queue lock from
this ruling; this ruling files no blocks itself and touches no repo file.

END-RULING
