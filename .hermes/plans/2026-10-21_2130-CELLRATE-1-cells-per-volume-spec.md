# CELLRATE-1 EXECUTION SPEC — Cells-per-volume rate vocabulary: count carries its unit; per-well totals shown derived

## 0. PROMOTION RULINGS (orchestrator l2t2050, 2026-10-21 ~21:30 EDT — BINDING for the worker)
- OQ-1 RULED: ORCHESTRATOR PRE-CLEARS the tracked-copy step (family precedent
  AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY). Orchestrator obligation: replace the
  app/src/event-editor/right-pane/ai/draftChanges.ts(+.test.ts) symlinks (-> Brad's live tree,
  currently ignored via lane-exclude-a6fix-l2t0430:58) with TRACKED COPIES of their current bytes
  (md5 at ruling time: draftChanges.ts 6efc06792371797321bab5f2a432c87c, .test.ts
  cc1e243f4ddcb544cd26dc835a830bd3 — byte-identical targets, verified first-hand) BEFORE dispatch.
  WORKER RULE: at your dispatch tip, `git ls-files` must list draftChanges.ts as tracked; if not,
  STOP the changes-row leg, report precisely, ship helper+tests only — NEVER edit through the
  symlink (that writes Brad's live tree).
- OQ-2 RULED: composer default ADOPTED — oneOf wire shape (number branch first for byte-stability,
  basis-tagged object arm reusing the concentration vocabulary). Orch verified first-hand at trunk:
  schema/core/datatypes/concentration.schema.yaml already declares basis count_per_volume and the
  unit cells/uL — no new local term is minted; cells/uL stays THE single term.
- OQ-3 RULED: default ADOPTED — `200 · absolute, unverified` via the single display helper.
  Grounded in Brad's OWN verified-by text ("says absolute-unverified, per data"); different wording,
  if Brad rules it, lands as a one-line helper change + golden pins.
- Dispatch mandate CONFIRMED: CELLRATE-1 dispatches ONLY AFTER the MIXFRAC-1 merge, off the
  post-MIXFRAC-1 trunk tip (NEVER off 6f8fb519 or older — pre-MIXFRAC base guarantees golden
  collisions). MANIFEST re-bless = exactly one re-hash on top of MIXFRAC-1's blessed state.
  Re-read every §2 cite at the dispatch tip before editing (trunk moves).
- Fleet order restated (l2t1950 ruling + this promotion): ELIG-merge -> REVISE-GHOST-1 (live coder)
  -> MIXFRAC-1 -> CELLRATE-1 -> FULFIL -> PANEL -> CHAIN gate.

Draft: l2t1730 composer (cl-spec-composer), 2026-10-21 17:35 EDT. Orchestrator reviewed, ruled OQ-1/2/3,
promoted l2t2050.
Trunk at composition: cl/integration-2 @ aaa37f6b (docs-only tip above code tip 6f8fb519; handoff
2026-10-21_1725 confirms "code tip unchanged 6f8fb519"). ALL file:line cites below were re-read by the
composer first-hand in the trunk working tree (/mnt/vast/home/brad/git/cl-integration-2). No scout output
is cited as authority. Live defect intake: Brad dogfood 2026-10-21, run RUN-2026-09-19-run-vwr8 at :5193 —
utterance "200 cells/uL" per well with 100 uL volume; revised shorthand carries bare `count: 200`.

## 1. Goal
Make the shorthand wire preserve the RATE-vs-ABSOLUTE distinction for a cells count as declared,
Ajv-validated data (never a TS regex guessing what 200 means), keep the stored event recording exactly
what the scientist declared (200/uL — never the computed 20,000), and make every display surface that has
both inputs show the per-well total LABELED derived ("20,000/well = 200/uL x 100 uL"), with honest
single-input states instead of a bare ambiguous number.

## 2. Verified root facts (composer-verified first-hand at the cited tip)
1. AUDIT CORRECTION to the task's vocabulary cite. The task says "the count arg exists ~:172" in
   `schema/scientist-intent/scientist-intent-vocabulary.yaml`. At the tip, :172 is the VERB `count`
   (the cell-counting read operation, args labware/mode/readout, :172-186) — NOT an add_material
   argument. add_material declares NO count argument; the cells count lives INSIDE the declared
   `composition` arg — add_material :241-246 (`kind: resolvable, cardinality: many,
   itemNounField: material`; seed has the same arg :40-45) — and the per-entry ITEM shape is declared
   in the WIRE schema, not the vocabulary. Precedent for where entry shape lives: MANIFEST treeState
   comment "the wire schema gained the action-level composition property declared with strict items"
   (COMP-4), and the vocabulary arg-declaration schema allows no per-item unit fields anyway
   (scientist-intent-vocabulary.schema.yaml args: fixed properties, additionalProperties:false, :71-115).
   CONSEQUENCE: the minimal declarative home for rate-vs-absolute is the wire composition item, and the
   vocabulary YAML needs NO edit (collision win — see §9). If the orchestrator still wants a vocabulary
   touch, it is a comment-only edit; nothing consumes a count declaration there.
2. THE WIRE SLOT. `schema/workflow/scientist-intent.schema.yaml` composition item (:182-215,
   `additionalProperties: false` :187, `unevaluatedProperties: false` :188, role enum incl. `cells` :197):
   `count: { type: number }` (:207-208) — a BARE, unit-less number: the 100x ambiguity lives here.
   `counterDensity` (:209-215) is ALREADY a value+unit object (`required: [value, unit]`, unit
   `type: string, minLength: 1`). So the wire today has a rate slot (counterDensity) and an absolute slot
   (count), and NOTHING prevents the model from stuffing a rate (200) into `count` while revise/fold drops
   counterDensity — exactly Brad's defect. Backward-compat idiom exists IN THIS FILE: `sourceWells`
   `oneOf` with "the array branch declared FIRST so every currently-valid document validates
   byte-identically" (:95-101) — mirror that construction exactly.
3. REPO ALREADY DECLARES count_per_volume AS DATA. `schema/core/datatypes/concentration.schema.yaml`:
   unit enum contains `cells/uL` (:30) plus cells/mL, CFU/uL, organisms/uL, worms/mL etc.; basis enum
   contains `count_per_volume` (:45). `schema/core/datatypes/composition-entry.schema.yaml` carries the
   same basis enum on concentration_range.basis (:36-38). `schema/core/datatypes/quantity.schema.yaml`
   establishes the DATA precedent: closed per-dimension unit sets enforced IN-SCHEMA via allOf if/then,
   header "Extension is a future DATA edit to this enum ... never a TypeScript list", and the
   dimension-preservation law ("counts never collapse into volumes. NO arithmetic and NO conversion live
   here").
4. LEDGER/EVENT LAYER IS ALREADY RATE-CAPABLE — NO EVENT SCHEMA CHANGE NEEDED.
   `schema/workflow/events/plate-event.add-material.schema.yaml`: `count: number` (:120-123,
   "Optional count-based addition, e.g. cells"), `counter_density: $ref concentration.schema.yaml`
   (:157-159, "count_per_volume, e.g. cells/uL"). Same datatypes feed the ledger via
   composition_snapshot -> composition-entry (:114-118). `count_estimate` (:133+) already provides the
   repo's honesty-layer idiom for numbers that are not verified facts — the display layer's precedent.
5. SERVER COMPILER today. `server/src/compiler/biology/verbs/simpleVerbs.ts`
   `compositionSnapshotFromParams` :357-408 (call sites :70 and :484 — BOTH consume it, the MIXFRAC §6
   bait-9 shape). Cells arm :388-394: takes `entry.count` ONLY if `typeof === 'number'` (an object count
   is silently dropped today) and passes `entry.counterDensity` through verbatim; returned as event
   details `count` (:405, :83, :505) and `counter_density` (:406, :84, :506, :530) by conditional spread.
   The compiler performs NO arithmetic — the wall is already honored server-side; this spec PINS it.
6. THE MODEL IS TOLD TO DO THE ARITHMETIC TODAY (intake of defect (1)).
   `server/prompts/material-system-rules.md:151-153`: "If the scientist gave a density ('200 cells per
   uL') and a volume, `count = density x volume`; carry both the `count` and the `counterDensity` so the
   arithmetic is auditable" (example :144 `count: 10000, counterDensity {200, cells/uL}`). Model-side
   multiplication is precisely how a dropped counterDensity turns into a bare ambiguous 200 on the
   revised wire. This rule is PROMPT DATA and is in scope.
7. DISPLAY SURFACES, verified where count AND volume are BOTH available at render time:
   a. `app/src/event-editor/focus/WellTooltip.tsx` (rendered by LabwareFocus.tsx:555) — rows .map :78;
      `count` :80, `density` :81 from the ledger row; the WELL volume `state.volume_uL` is the tooltip
      header (:61). Carrier rule SH-QA-4: `volumeIsCarrier` rows show fractionOfMixture, header is the
      single volume assertion (:82-92).
   b. `app/src/graph/labware/WellTooltip.tsx` — the universal-pane twin; same shape (:102-106).
   c. `app/src/graph/context-panel/ContextPanel.tsx` — same triple (:262-267).
   d. `app/src/event-editor/right-pane/ai/draftChanges.ts` `describeAmount` :32-41 — renders
      `count ${count.toLocaleString('en-US')}` (:37, the CHANGES-UI-1 number-rendering pattern;
      lane-1 CHANGES-UI-1 merges f71ef824/7eb72222 per lane-1 handoff) plus `volume` and
      `concentration` — and greps show it never touches `counter_density` at all (composer grep rc=1).
      The changes row therefore shows "count 200" bare. ⚠ SYMLINK TRAP: this file (and its .test.ts) is
      NOT tracked in the lane — it is a symlink into Brad's live tree (see §6 bait 5, §10 OQ-1).
   e. AUDIT CORRECTION: `app/src/event-editor/focus/wellStateProjection.ts` (task files clause) contains
      NO count/volume/density logic at all (65 lines; occupancy/tube projection only). The per-well math
      the task attributes to it lives in `app/src/graph/lib/eventGraph.ts` `applyAddMaterial`: count
      grant predicate :519 (`typeof details.count === 'number' && (entry.role === 'cells' ||
      snapshot.length === 1)`), fractionOfMixture :528, density attach :531
      (`count !== undefined && details.counter_density` — density is dropped on a rate-only event with
      no count; new events WILL have that shape, see §5.3). `wellStateProjection.test.ts:99-104` asserts
      the cells row (count 50000 + density 500 cells/uL via eventGraph). The review-modal surface the
      task names does not exist as a separate component in the lane tree (composer grep); the four
      surfaces above + the shared helper cover the task's named surfaces — the browser gate re-names
      them (§4).
   f. Shared formatters home: `app/src/shared/lib/formHelpers.ts` `formatComputedConcentration`
      (:131-137), `formatComputedCount` (:139-142, prints `${n} count`). App-side `ConcentrationValue`
      (`app/src/types/material.ts:17-21`) has `basis?: ConcentrationBasis` — basis is visible to the
      display layer today. `AddMaterialDetails` (app/src/types/events.ts) already declares `count?`
      (:149) and `counter_density?: ConcentrationValue` (:159).
8. SHARED DECLARATION-LOCATION CHECK (task clause): the sum/derivation invariant home MIXFRAC-1 and
   MATRES-CHAIN are building DOES NOT EXIST YET at this tip — `config/drafting/` contains
   adapters.yaml, analysis-composition.yaml, deck-review.yaml, forced-tool-compliance.yaml,
   mixture-material-cues.yaml, review-write-wall.yaml, shorthand-drafting.yaml,
   workstate-composition.yaml, workstate-tab-kinds.yaml — NO composition-fraction-convention.yaml
   (that file is MIXFRAC-1's own NEW deliverable, blessed but not yet dispatched: handoff 2026-10-21_1725
   item 2). Nothing to reuse; §5 states where CELLRATE-1's declarations go and why they are NOT a second
   home for fraction-sum policy.
9. GOLDEN PLANE. `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` treeState pins sha256 of
   BOTH `schema/scientist-intent/scientist-intent-vocabulary.yaml` and
   `schema/workflow/scientist-intent.schema.yaml` (the wire schema CELLRATE-1 edits) — any wire edit
   fails the suite LOUD without a re-bless; single-re-bless precedents on the file: COMP4-REBLESS,
   W2-8-A5g, W28-OPTIONBIND-1. Fixture `unresolvable-mixture-component.yaml` (110% composition,
   sha 245603…) is MIXFRAC-1's named collision fixture (§9).
10. CHANGES-UI-1 reference (task why-clause "already fixed number rendering — extend from data"): the
    lane-visible commit cd9cb57b is the criterion-E shorthand-height CSS fix; the NUMBER rendering the
    task means is the locale-formatted `count` at draftChanges.ts:37, shipped from lane 1
    (merges 7eb72222 / handoff f71ef824). Extend THAT, from data.

## 3. Files in scope

IN (owned by this item), collision-checked against the fleet (§9):
1. `schema/workflow/scientist-intent.schema.yaml` — the ONE declarative change (§5.1): the composition
   item's `count` gains a rate-capable declared branch. NOT owned by MATRES-ELIG (ELIG owns the
   vocabulary trio + resolution/resolve dirs, not the workflow wire schema — fleet-collision note in the
   task itself), NOT touched by MIXFRAC-1 (its §14.2 rules the nested form OUT of the wire slot and its
   §3 B ride only touches it if readings need it — check the merged result before branching, §9).
2. `server/prompts/material-system-rules.md` — replace the model-side `count = density x volume` rule
   (:151-153) with the declare-the-rate rule (§5.2). Prompt data, per-request read.
3. `server/src/compiler/biology/verbs/simpleVerbs.ts` — cells arm only: route a rate-shaped count to
   `counter_density` (§5.2), cover BOTH call sites (:70 and :484 share the helper — a one-site fix is
   bait). No arithmetic, ever.
4. `server/src/compiler/scientistIntent/goldens/` — ONE new golden fixture + record (rate round-trip,
   §7; distinct file names from MIXFRAC-1's goldens), ONE deliberate MANIFEST treeState re-bless of the
   wire-schema pin (exactly once, same commit, before/after hashes in the report).
5. Server tests: `server/src/schema/ScientistIntentCountRate.test.ts` (NEW, wire contract, pattern of
   Wave2NamingCrosswalk.test.ts reading the YAML + Ajv against real registry), `simpleVerbs` rate-arm +
   wall tests alongside the existing compiler tests.
6. `app/src/graph/lib/eventGraph.ts` — density attach predicate :531 widened to keep density on
   rate-only cells rows (§5.3); ledger gains NO arithmetic.
7. `app/src/shared/lib/formHelpers.ts` — ONE shared derivation helper (§5.3): the single home of the
   "X/well = A/unit x B unit (derived)" grammar across all display surfaces.
8. Display surfaces consuming it: `app/src/event-editor/focus/WellTooltip.tsx`,
   `app/src/graph/labware/WellTooltip.tsx`, `app/src/graph/context-panel/ContextPanel.tsx`, and
   `app/src/event-editor/right-pane/ai/draftChanges.ts` describeAmount (CONDITIONAL on OQ-1 ruling —
   symlink, §6 bait 5) + their existing tests, `app/src/event-editor/focus/wellStateProjection.test.ts`
   and eventGraph tests as characterization.

OUT (explicitly, with reason):
- `schema/scientist-intent/scientist-intent-vocabulary.{yaml,schema.yaml,lint.yaml}` — MATRES-ELIG CODER
  IS LIVE ON THESE RIGHT NOW (handoff 2026-10-21_1725: pid 1311956, writing schema/scientist-intent/
  material-eligibility/ + resolution/eligibility/), and §2.1 shows no vocabulary change is needed. Hard
  no.
- `schema/workflow/events/plate-event.add-material.schema.yaml`, `server/src/materials/**`,
  `server/src/fulfillment/**` — FULFIL owns; §2.4 shows the event layer needs NO change (count +
  counter_density already declared). A rate-only event stores counter_density and NO count.
- `server/src/compiler/scientistIntent/normalizeScientistIntent.ts`,
  `server/src/compiler/scientistIntent/compositionFractions.ts` (NEW under MIXFRAC-1),
  `config/drafting/composition-fraction-convention.yaml` (NEW under MIXFRAC-1) — MIXFRAC-1's files;
  CELLRATE-1 raises NO clarifications and adds NO sum policy.
- `server/src/ai/AgentOrchestrator.ts`, `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` —
  REVISE-GHOST-1 (in spec composition this lap, same intake). The lost-density-on-revise leg is fixed at
  the wire + prompt + display layers, NOT by touching the revise path. If, after implementing, the
  deterministic fold path provably strips counterDensity (it folds only clarification answers —
  shorthandChat.ts `foldAnswersIntoShorthand` :453), STOP AND REPORT; do not edit AgentOrchestrator.
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx`, `ParameterAnswerInput.tsx`, gapcard
  surfaces — MATRES-PANEL's.
- `app/src/graph/lib/eventGraph.ts` `parseMixtureFraction` :320 / the "<fraction> of the mixture" source
  form :315 — byte-stable per ratified MIXFRAC OQ-4; do not touch.
- `server/src/lint/**`, `schema/lint/**` — no DSL work (CHAIN/MIXFRAC precedent).
- `/mnt/vast/home/brad/git/computable-lab/**` — Brad's live tree, forbidden (but see OQ-1: the
  draftChanges.ts symlink points INTO it).

## 4. Acceptance criteria — task `verified by` VERBATIM, then the dispatch-ready restatement
> (1) RED-first: shorthand schema/vocabulary golden — canonical utterance -> rate-preserving count
> (never bare); ambiguous bare `count: 200` with a stated volume produces NO invented unit (display
> says absolute-unverified, per data). (2) Derived-total pins: tooltip + changes-row + projection
> tests render "20,000" with the 200/uL x 100 uL derivation readable when both present; single-input
> state honest. (3) Server: compiler/realization keeps rate as declared data (no 200->20000 coercion
> silently mutating the record — derivation is DISPLAY; the stored event keeps what the scientist
> declared). (4) BROWSER GATE (async): on :5193 with the canonical utterance, tooltip + Changes row
> show the derived per-well total labeled as derived; VERDICT: accept on the named surfaces.

Restatement for dispatch (interpretations pinned so no worker picks):
- (1) "rate-preserving count (never bare)" = the canonical shorthand (utterance "… 200 HepG2
  cells/uL", volume 100 uL) round-trips through the real wire schema + parse layer with the rate as
  declared data: `count: { value: 200, unit: "cells/uL", basis: count_per_volume }` per §5.1; a golden
  asserts a bare `count: 200` carrying a rate is NOT what compiles for the canonical leg. Ambiguous
  bare `count: 200` REMAINS VALID on the wire (backward compat, §5.1) and the display says
  absolute-unverified (§5.3 state table). "vocabulary golden" reads as "wire-schema/vocabulary-plane
  golden" — §2.1 audit shows there is no vocabulary arg to change.
- (2) "when both present" = a declared rate (count rate-arm or counterDensity) + a well/event volume.
  A declared ABSOLUTE count is never multiplied (§6 bait 7). Surfaces: both WellTooltips, ContextPanel,
  changes row (OQ-1 conditional), eventGraph projection test.
- (3) the WALL pin: a compile of the canonical rate leg yields event details with
  `counter_density = {value:200, unit:"cells/uL", …}` and NO `count` key at all; string "20000" appears
  NOWHERE in the emitted event or any store write. Reverse leg: declared-absolute `count: 20000` +
  density passes both through unchanged (auditability, byte-stable).
- (4) BROWSER GATE — carried verbatim from the task; async per lane ruling 6b; orchestrator territory.
  Named surfaces for the receipt: deck/focus well tooltip (`focus/WellTooltip.tsx`), Changes panel row,
  and the deck context panel (the "review modal" the task names does not exist as a component at this
  tip — §2.7e; reviewer judges the surfaces that render the per-well truth at :5193).

## 5. Fix design

### 5.1 Vocabulary/wire layer (defect 1) — the ONE schema change
In `schema/workflow/scientist-intent.schema.yaml`, replace the composition item's
`count: { type: number }` (:207-208) with a `oneOf` — NUMBER BRANCH FIRST, byte-identically accepting
every currently-valid document, the file's own sourceWells idiom (:95-101):

    count:
      oneOf:
      - type: number            # declared ABSOLUTE per-well count (existing form, byte-stable)
      - type: object            # declared-basis form: unit says what the number IS
        additionalProperties: false
        unevaluatedProperties: false
        required: [ value, unit, basis ]
        properties:
          value: { type: number, exclusiveMinimum: 0 }
          unit:
            type: string
            enum: [ cells, CFU, beads, organisms, worms, colonies,
                    cells/uL, cells/mL, CFU/uL, CFU/mL, organisms/uL, organisms/mL, worms/mL, worms/uL ]
          basis:
            type: string
            enum: [ count, count_per_volume ]

and — the quantity.schema.yaml allOf precedent (:header + per-dimension if/then sets) — IN-SCHEMA DATA
cross-enforcement, so Ajv alone is the validator: `basis: count_per_volume` requires a per-volume unit
from the list above; `basis: count` requires an absolute unit. EXACTLY this and nothing more:
- Rate-vs-absolute is DECLARED DATA (`basis` + controlled `unit` enum), never a TS regex guessing the
  number — the value 200 is never classified, the declared shape says what it is.
- `basis: count_per_volume` and the unit spellings are REUSED existing terms (concentration.schema.yaml
  :30/:45, composition-entry :38) — no second local term for one entity (rule 7). The rate has ONE
  declared meaning: count_per_volume.
- The item stays additionalProperties/unevaluatedProperties false (:187-188 posture unchanged); no new
  properties on the entry; `counterDensity` (:209-215) is UNTOUCHED (it stays the source-vial density
  term already declared for it; the count-rate arm is the per-well seeding rate — §5.2 pins precedence).
- The vocabulary YAML needs no edit (§2.1). NO event/ledger schema change (§2.4): count per-well is an
  absolute ledger fact and count_per_volume is already a ledger datatype — inventing a ledger rate field
  would be the second home the task's lint-adjacent clause warns against.
- Registry note: the wire schema gains NO $ref (inline enum, like quantity.schema.yaml's cross-sets), so
  SchemaRegistry dependency pins (Wave2NamingCrosswalk.test.ts:79, Wave2QuantitySchema.test.ts:334 read
  this file) stay structurally unchanged; the MANIFEST treeState hash pin DOES change (§6 bait 3).

### 5.2 Server layer (defect 1, and the WALL)
- `server/prompts/material-system-rules.md` :151-153, replace the multiplication instruction with the
  declaration rule (data/prompt hygiene, no new vocabulary): a cells component carries `count` in the
  scientist's OWN terms — stated rate -> `count: { value, unit, basis: count_per_volume }` (e.g.
  200 cells/uL), stated absolute -> `count` as a plain number (e.g. 20,000). NEVER multiply, never
  invent a unit, never restate a rate as an absolute. If both a rate and an absolute were stated, carry
  both. Update the :144 example to the rate form for a rate utterance (keep one absolute example so both
  shapes stay exemplified).
- `server/src/compiler/biology/verbs/simpleVerbs.ts` cells arm (:388-394): today an object count is
  silently DROPPED (`typeof entry.count === 'number'`). Route the rate arm generically — NO unit/basis
  string comparisons beyond the declared discriminator value `count_per_volume` (the schema owns the
  unit set): a count whose shape is the declared object with `basis === 'count_per_volume'` maps to the
  event's existing `counter_density` slot (same conditional-spread discipline, exactOptionalPropertyTypes
  — absent OR value, never undefined); a plain number still maps to `count`; a declared object with
  `basis === 'count'` maps its `value` to `count` (unit is a controlled term, no information lost at the
  ledger's absolute slot). Precedence pin: if the entry carries BOTH `counterDensity` and a rate-arm
  count, the existing `counterDensity` slot wins (it is the dedicated term) and the rate arm is not
  coerced into `count` — pinned by test, named in code comment. Through BOTH consumers (:70, :484 — the
  shared helper covers it; do not patch one site).
- THE WALL (task notes, binding — pin test in §7): the compiler performs NO arithmetic. A rate leg
  produces `counter_density` and NO count; the string 20000 must appear nowhere in the compiled event,
  snapshot, or store payloads; derivation is DISPLAY truth over declared data. A declared-absolute leg
  passes count through byte-unchanged (with counterDensity alongside if declared — "auditability" is
  preserved by carrying both DECLARED numbers, never by the compiler computing one from the other).
- `server/src/materials/AddMaterialSupport.ts` and the event schema: ZERO changes (§3 OUT; count remains
  an optional absolute; a rate-only event simply has no count — AddMaterialSupport's cells-instance path
  already no-ops on absent count, AddMaterialSupport.ts:330-331 — pin that as characterized behavior,
  not a regression to fix: a rate-only draft materializes the instance without a count claim until an
  answer supplies the absolute; that is honest, not broken).

### 5.3 Display layer (defect 2) — derived totals, one helper, honest states
- `app/src/shared/lib/formHelpers.ts` gains ONE exported helper (single home of the grammar), shape:
  `describeCellTotal(input: { count?: number; rate?: ConcentrationValue; density?: ConcentrationValue;
  volume_uL?: number })` returning a labeled string | null, ALL optional fields read by presence check
  (exactOptionalPropertyTypes — build results by conditional spread):
  * rate declared (basis count_per_volume, from the count rate arm once surfaced or from
    counterDensity) + volume -> `20,000/well = 200/uL x 100 uL (derived)` (locale formatting via the
    :37/:141 `toLocaleString('en-US')` pattern; unit shortened by formatting the ConcentrationValue,
    not string surgery).
  * rate declared, volume absent -> rate shown + `per-well total unknown`.
  * bare count + volume, no rate anywhere -> absolute shown + the OQ-3 wording (`absolute, unverified`
    default) — NO invented unit, NO multiplication (it is already a total if true).
  * count AND rate AND volume all present (the auditability shape, both declared) -> total with the
    derivation readable: if they agree, the derivation reads as the math; if they DISAGREE, show the
    declared count plus the mismatch flagged via the existing honesty idiom (count_estimate precedent
    §2.4) — a silent pick between two declared numbers is forbidden (stop-and-report if a reviewer
    demands a policy beyond showing both).
  * no count, no rate -> null (surface unchanged).
- `app/src/graph/lib/eventGraph.ts` :531 — density currently attaches only when a count exists
  (`count !== undefined && details.counter_density`), which ERASES the rate on a rate-only event (the
  new post-fix shape). Widen so `counter_density` attaches to the cells row whenever present
  (role === 'cells' arm or the existing count-row predicate — keep the "attach generically, never by
  name lookup" discipline of the :529-530 comment). Legacy events are unchanged (they always had a
  count with density). The ledger stores density, NOT a computed total (§2.3 quantity law: no
  arithmetic in the projection).
- Surfaces wire to the helper: focus/WellTooltip.tsx (:78-92 row cells; well volume from
  `state.volume_uL` :61 — on carrier rows it IS the mixture/well volume, consistent with the SH-QA-4
  single-volume-assertion rule: the derivation cites the header volume, never re-asserts a per-row
  volume), graph/labware/WellTooltip.tsx (:102-106), ContextPanel.tsx (:262-267),
  draftChanges.ts describeAmount (:32-41, reads `details['counter_density']` alongside count/volume —
  CONDITIONAL on OQ-1). The three tracked surfaces total roughly two lines each plus tests; the changes
  row is the OQ-1-conditional one.
- Shared declaration-location answer (task clause): the derivation ARITHMETIC has one home — this
  helper — and it is pure presentation arithmetic with no policy constants (no thresholds, no unit
  conversion, the unit set lives in the wire schema §5.1). Fraction-sum policy stays MIXFRAC-1's
  composition-fraction-convention.yaml (does not exist at this tip, §2.8); CELLRATE-1 creates no
  sibling policy file and pre-empts none. Both belong to the same invariant family by REFS: the helper
  and the convention file are different planes (display vs compile-time sum policy) — record the cross-
  reference in the helper doc-comment, do not merge them.

## 6. Reviewer bait (anticipating the adversarial review — pre-empt each)
1. exactOptionalPropertyTypes (server): every new optional (rate arm read-through, precedence spreads)
   is conditional-spread built — never `key: undefined`. SimpleVerbs :405-406 is the in-file precedent;
   tests assert key ABSENCE via Object.keys, never toEqual-with-undefined.
2. YAML-reload trap: this is a wire-schema change — tsx --watch does NOT reload YAML; the lane stack
   needs a restart to validate live, and `cl-lane-stack.sh 2 restart` is BLOCKING (600s pitfall recorded
   on this lane) — restart with background=true. material-system-rules.md is read per request, but
   restart anyway with the schema.
3. MANIFEST re-hash: the treeState pins `schema/workflow/scientist-intent.schema.yaml` sha256 (§2.9) —
   touching it without re-bless fails LOUD. Re-bless EXACTLY ONCE, same commit, before/after hashes in
   the report (COMP4-REBLESS / W2-8-A5g / W28-OPTIONBIND-1 precedents on the file header).
4. Hardcode boundary: zero unit literals ("cells/uL"), reagent nouns (HepG2/DMEM/FBS), the words
   "derived"/"unverified"/"/well", and NO "20,000"/"20000" in TypeScript — the unit sets are schema DATA
   (§5.1), the label grammar lives ONLY in the one formHelpers helper, nouns only in fixtures/goldens/
   prompt data. The `count_per_volume` discriminator value compared in TS is registration (the existing
   enum term), not policy; a reviewer will grep the diff for `'/uL'` and for `* volume` under
   server/src/compiler — both must be clean.
5. SYMLINK TRAP — lane-specific, do not walk into it: `app/src/event-editor/right-pane/ai/
   draftChanges.ts` and `draftChanges.ts.test` are UNTRACKED in the lane — symlinks into
   /mnt/vast/home/brad/git/computable-lab (verified: `ls -la` -> main tree;
   lanes/2/lane-exclude-a6fix-l2t0430 lines 57-58 ignore them; the sibling symlink
   ParameterAnswerInput.tsx is also excluded). Editing through the symlink EDITS BRAD'S LIVE TREE —
   forbidden by the worker contract. The PROTO-AI-7 precedent (lane note: "gitignored SYMLINK into
   Brad's live tree … executes against MAIN's sources") and the tracked-copy assumption
   AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY cover the family. OQ-1 routes it; until ruled, do the
   changes-row leg against the helper ONLY (helper tests), and keep describeAmount untouched.
6. THE WALL: any diff that computes count x volume (or density x volume) on the server is a by-
   construction fail; the pin test (§7 plane 2) asserts the compiled canonical-rate event has no `count`
   key and no 20000 anywhere. Conversely a reviewer will check the display does NOT hide the declared
   inputs — the derivation string shows the operands.
7. Do NOT multiply a declared-absolute count by volume — that reproduces the 100x disease in the
   display layer (20,000 x 100). The state table §5.3 is exhaustive; a bare number + volume is
   absolute-unverified, never scaled.
8. Byte-stability: existing bare-number payloads must validate unchanged (the number branch is FIRST in
   the oneOf — the sourceWells :95-101 comment is the pattern to cite in the diff); SH-QA-4 carrier
   rows keep the single-volume-assertion rule (the derivation must not turn a carrier row into a second
   volume claim — it cites the header volume); eventGraph :315/:320 source-string form untouched.
9. Two call sites / two twins: simpleVerbs :70 AND :484 (§2.5); focus/WellTooltip AND
   graph/labware/WellTooltip AND ContextPanel are THREE copies of the metaParts shape (§2.7) — fixing
   one tooltip and calling it done is the classic partial fix; the helper plus per-surface tests is the
   defense.
10. Vocabulary-file bait reversed: a coder "helpfully" adding a count arg to the vocabulary YAML collides
    with the LIVE MATRES-ELIG owner for nothing (§2.1) — the audit correction must be cited in the report.
11. `count` vs `counterDensity` on one wire entry (§5.2 precedence): a reviewer will ask which wins —
    the pinned rule (dedicated slot wins, no coercion, test-named) must be in the diff's tests, not a
    comment.

## 7. Tests (RED-first, by plane)
Plane 1 — wire contract (RED before anything else):
- `server/src/schema/ScientistIntentCountRate.test.ts` (NEW): via the real SchemaRegistry/Ajv on the real
  file — (a) RED at base: `count: {value:200, unit:"cells/uL", basis:"count_per_volume"}` inside a valid
  composition entry must FAIL today (count is type:number) and pass after; (b) every currently-valid
  document (bare number count; no count) validates byte-identically before AND after (characterization
  legs pin the same fixtures both sides); (c) basis/unit mismatch rejected with the offending path named
  (count_per_volume basis + `cells` unit; count basis + `cells/uL` unit); (d) unknown unit rejected;
  (e) entry still rejects unevaluated extras (posture unchanged).
Plane 2 — compiler + wall (RED-first):
- simpleVerbs rate-arm test: canonical composition (cells entry with the rate object, volume 100) ->
  event details has counter_density {value:200, unit:"cells/uL", basis:count_per_volume} and NO count
  key; JSON.stringify(details) contains no "20000" (THE WALL pin); declared-absolute leg byte-stable;
  both-present leg carries both; counterDensity+rate-arm precedence pin; run through BOTH action shapes
  that hit :70 and :484.
- Golden: ONE new fixture (e.g. `fixtures/cells-rate-per-volume.yaml`) + blessed record — canned
  modelOutput carrying the rate arm on the canonical utterance text (distinct file names from
  MIXFRAC-1's GOLDEN-A/B/C — do NOT edit their fixtures; §9), replay via replayKernel in the existing
  goldenIntentToGraph pattern; expected record: counter_density declared, no count. MANIFEST: fixture +
  record entries + ONE treeState wire-pin re-bless.
Plane 3 — display (RED-first):
- formHelpers.test.ts: the five-state table §5.3 (derived-with-derivation-string readable;
  rate-no-volume; absolute-unverified no-multiply; disagreement shows both declared; absent->null);
  formatting asserts the literal "20,000/well = 200/uL x 100 uL" (en-US locale) in the derived arm.
- eventGraph test: rate-only event (counter_density, no count) keeps density on the cells row
  (RED at base — :531 drops it); legacy count+density row byte-stable.
- WellTooltip tests (focus + graph/labware), ContextPanel test, wellStateProjection.test.ts
  characterization (existing :99-104 legs green). Changes-row leg rides OQ-1.
Plane 4 — browser gate: task (4) verbatim, async, orchestrator (rules 6b/6c: no coder self-accept).

## 8. First targeted check, then full verification (with expected output)
FIRST TARGETED CHECK (proves the approach and the defect in one command — run before designing
anything else): the Plane-1 RED leg —
  cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/schema/ScientistIntentCountRate.test.ts
Expected at base: FAILS at the rate-arm leg (Ajv: /count must be number) while the byte-identical
characterization legs pass — proof the wire cannot carry the rate and the harness is real.
Full verification:
- Targeted: `npx vitest run src/schema/ src/compiler/biology/ src/compiler/scientistIntent/` from
  server/ — zero failures; the ONE deliberate MANIFEST re-hash diff pasted in the report.
- Full server: `npm run test:run -w server` from root — failing-FILE set identical to the dispatch-time
  trunk baseline (comm -empty vs a freshly generated base-server-failfiles list per the
  .hermes/evidence/*/ pattern; the 88-file baseline is RECV-era — regenerate, do not reuse blindly).
- `npm run typecheck -w server` — expected EXIT 0 (RECV merged at typecheck 0; handoff l2t1635).
- App: `npm run test:unit -w app` — zero NEW failing files vs the dispatch-time app baseline;
  `npm run typecheck -w app` — sorted diff identical to dispatch-tip baseline (lane records 23-error
  base pin in cd9cb57b era; regenerate at tip).
- Live-stack proof after merge: background=true stack restart, then the wire-schema live check
  (POST an intent carrying the rate arm at :3093 -> 200/422 as expected, curl output in handoff) —
  YAML is only reloaded on restart.
- Browser gate: orchestrator-run, task (4) criteria verbatim.

## 9. Sequencing / collision / worker contract
FLEET COLLISION MAP (current in-flight owners, from task block + handoff 2026-10-21_1725):
- MATRES-ELIG (CODER LIVE, pid 1311956, fleet lock HELD): owns
  server/src/compiler/resolution/**, server/src/resolve/**,
  schema/scientist-intent/scientist-intent-vocabulary.{yaml,schema.yaml,lint.yaml}, NEW
  schema/scientist-intent/material-eligibility/**. CELLRATE-1 overlap AFTER AUDIT: ZERO (§2.1 proves
  the vocabulary needs no edit; the wire schema is NOT in ELIG's set).
- MIXFRAC-1 (queued next, BLESSED, dispatch-ready): owns simpleVerbs.ts (!), normalizeScientistIntent.ts,
  goldens/** + MANIFEST re-bless, config/drafting/composition-fraction-convention.yaml,
  composition-entry.schema.yaml, and — shared golden files NAMED EXPLICITLY — the canonical-utterance
  fixture space (fixtures/*.yaml, __records__/*.golden.json, MANIFEST.yaml fixtures/records/treeState
  lists) and `compositionDecomposition.test.ts` :44-53 (the 50/50/10 fixture that MIXFRAC-1 §6 bait 5
  deliberately moves). TWO FILE-LEVEL OVERLAPS with CELLRATE-1: simpleVerbs.ts (MIXFRAC-1 edits the
  fraction arm :385 region; CELLRATE-1 edits the cells arm :388-394 — different hunks, same file) and
  MANIFEST.yaml + the wire-schema pin (both items re-bless treeState; MIXFRAC-1 additionally re-blesses
  if its readings ride touches the wire schema, §3B optional).
- FULFIL (queued): plate-event.add-material + server/src/materials/ + fulfillment/** — CELLRATE-1 is
  OUT of all three (§3).
- MATRES-PANEL (queued): clarification/gapcard app surfaces — OUT for CELLRATE-1.
- REVISE-GHOST-1 (composer live this lap): AgentOrchestrator.ts + AiTabPanel.tsx — OUT for CELLRATE-1
  (§3; STOP-AND-REPORT clause there if the fold path proves to strip density).
RULING SHAPES: fleet order ELIG-merge -> MIXFRAC-1 -> FULFIL -> PANEL -> CHAIN gate is Brad-ratified;
CELLRATE-1 slots immediately AFTER MIXFRAC-1 MERGES (deps [], but the shared golden files + MANIFEST
re-bless + simpleVerbs make any earlier branch a guaranteed conflict — the task's own notes demand the
golden coordination). DISPATCH BASE TIP: the post-MIXFRAC-1 merge trunk commit (read it from the handoff
at dispatch; the CELLRATE-1 MANIFEST re-bless is then exactly one re-hash ON TOP of MIXFRAC-1's blessed
state, diffing only the wire-schema pin + CELLRATE's new fixture/record entries — if MIXFRAC-1's merged
result touched scientist-intent.schema.yaml for its readings ride, re-read the file at the new tip and
re-scope §5.1 against the merged text before editing). Because the fleet lock is one coder at a time,
CELLRATE-1 may take the slot between MIXFRAC-1-merge and FULFIL-dispatch (it is disjoint from FULFIL;
FULFIL can follow normally). Stack restart after merge (schema YAML).
WORKER CONTRACT: worktree/branch `cl/CELLRATE-1-lane2-<tag>` off the post-MIXFRAC-1 trunk tip (>= the
merge commit; NEVER off 6f8fb519 or older — that predates MIXFRAC-1 and guarantees golden collisions);
worktree `/mnt/vast/home/brad/git/wt/CELLRATE-1-lane2-<tag>`; every git command `-c core.fileMode=false`
(NFS mode-bit noise). Unique deliverables: report `.hermes/plans/CELLRATE-1-report.wip-<tag>.md`
(orchestrator promotes to `.hermes/plans/CELLRATE-1-report.md`); log `lanes/2/logs/coder-CELLRATE1-<tag>.log`;
spec path at promotion replaces `<ts>` under `.hermes/plans/`. RED-first mandatory (CLAUDE.md rule 5).
Report must contain: merge-time re-verification of every §2 cite against the dispatch tip (trunk moves),
the §2.1 vocabulary-audit correction restated, MANIFEST before/after hashes, the wall-pin output (§7
plane 2), grep-clean proofs for §6 bait 4, and the OQ-1 disposition as ruled (do not freelance the
symlink).

## 10. Open questions the composer could NOT resolve locally (max 3)
OQ-1 (dispatch-blocker class) — draftChanges.ts changes-row leg vs the symlink. CHECKED: `ls -la` shows
draftChanges.ts/.test.ts are symlinks into /mnt/vast/home/brad/git/computable-lab; lane-exclude-
a6fix-l2t0430:57-58 ignores them; main has them ignored too (lane-1 exclude :9) and untracked there —
so the file has NO authoritative git home in the lane at all; editing via the symlink edits Brad's live
tree. DEFAULT STANCE: orchestrator replaces the two symlinks with tracked copies of their current bytes
in the lane trunk BEFORE dispatch (the AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY family, one commit,
byte-diff zero), the worker then owns a normal tracked edit; if the orchestrator declines, the
changes-row leg ships as helper + tests only and draftChanges.ts is explicitly dropped from scope.
OQ-2 (product-shape, Brad-ratified-if-kept) — the rate rendering. CHECKED: the task itself says "spec
picks the rendering against the frozen shorthand schema (e.g. count: 200/uL vs count: 20000)"; the wire
already declares a rate-shaped concentration object with basis count_per_volume and cells/uL (concentra-
tion.schema.yaml :30/:45) but NOT the string-unit form "200/uL" (the frozen item is additionalProperti-
es:false with count: number — a bare-string unit would need a different shape and would re-invent the
basis term). DEFAULT STANCE: §5.1 as prescribed (oneOf, number branch first, basis-tagged object arm)
— rate preserved as declared, Ajv sole validator, old payloads byte-stable. Flagging because the shape
choice is a wire-contract decision Brad has historically wanted visible; silence is not approval.
OQ-3 (product wording, Brad-level) — the ambiguous-bare-count label. CHECKED: verified-by says the
display "says absolute-unverified, per data"; the repo's honesty idioms are count_estimate's
isEstimate/mechanism layer (plate-event.add-material :133-145) and the '(assumed)' suffix
(focus/WellTooltip.tsx:66); there is no established 'unverified' string in app display code (composer
grep of formatComputed* / tooltips). DEFAULT STANCE: render `200 · absolute, unverified` via the helper
(one grammar, all surfaces), no new mechanism; if Brad wants a different wording he rules the exact
string and it lands as a one-line helper change + golden pins.

CELLRATE1-SPECCOMP DONE