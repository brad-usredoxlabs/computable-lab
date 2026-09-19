# Plan: water-bath equipment placement via the agent + Step-1 sub-graph attribution

Date: 2026-09-12
Status: SUPERSEDED (2026-09-19) — see
`.hermes/plans/2026-09-19_130430-deck-equipment-via-agent.md`, which keeps this
doc's intent and phase order but corrects its Phase 2 seam assumptions (wrong
prompt constant; ignores that `previewEquipments` already exists and that the lawn
renderer is missing) and folds in the acceptance/seat model (D2, Phase 1.5 there).
Do not execute this doc's Phase 2 as written.

## Goal

Make the constrained agent emission able to place real lab equipment (records
first, then a generic "water bath" computable kind, then user freeform) onto the
deck — not a hallucinated 24-tube rack — and ensure the placed equipment (plus
the "set to 55/70 °C" events) lands in the currently-selected protocol Step-1
sub-graph realization.

## Current context / assumptions

- The deck already places equipment from the UI via `AddToDeckDialog`
  (`app/src/event-editor/deck/AddToDeckDialog.tsx`) → Equipment tab → a
  "kind chip" (`inferInstrumentKind`) → an `EQP-` mint → lawn placement.
  This machinery exists and is browser-verified.
- The agent's forced emission is `agent_intent`
  (`server/src/ai/submitSuggestionTool.ts`) whose `event_graph` intent carries
  `labwareRequirements[]`/`labwareAdditions[]`. There is currently NO
  equipment path in the emission — the model fabricated `CL:water_bath`.
- `app/src/types/labwareRequirement.ts:96-101`: an UNKNOWN `classCurie` hits a
  `default` that returns `'tubeset_24'` (24-tube rack). This is the silent
  WONG-labware degradation seen in the bug report.
- Computable equipment kinds live in `app/src/types/labware.ts`
  (`InstrumentKind`, `INSTRUMENT_KINDS`, `INSTRUMENT_KIND_LABELS`,
  `inferInstrumentKind`) — currently `qpcr | plate_reader | heater_shaker |
  vortex | generic`. "water bath" is NOT present.
- Instrument silhouettes are drawn in
  `app/src/event-editor/deck/InstrumentGlyphs.tsx` (a `switch` on kind reached
  from `LabwareGlyph.tsx:224`).
- The step-sub-graph machinery (per-step realization = `subGraphRef` →
  `EVG-STEP*` event-graph) exists: `app/src/event-editor/right-pane/protocol/`
  (`ProtocolLocalizationThread`, `StepInvestigationPanel`), `GET
  /api/protocols/:id/steps/:stepId/graph`, `PATCH
  /protocols/:id/steps/:stepId` (subGraphRef). The "EDITING: Step N" context box
  above the chat is driven by the FOCUSED step (shared context).

## Architecture / proposed approach

1. Equipment kinds become the vocabulary: add `water_bath` to the
   `InstrumentKind` type and its maps/glyph. The `Equipment` tab kind chips (and
   thus the AddToDeckDialog + a future agent path) then select it natively.
2. Teach the agent to resolve "place two water baths" in this order, all inside
   the existing `agent_intent` emission:
   a. search the lab's equipment RECORDS (proven EQP- records first),
   b. else use the `water_bath` generic computable kind,
   c. else user freeform mint (the user's exact words as the handle).
   To keep scope contained, Phase 3 wires the agent path onto the SAME
   equipment machinery AddToDeckDialog already uses (no second mint tree).
3. Guard the resolver: an unrecognized `classCurie` must NOT silently become
   `tubeset_24`; it must fall through to equipment-style minting/clarification.
4. Step attribution: run the equipment placement through the step-focused
   draft→ghost→Accept loop so it writes the focused step's `subGraphRef`.

## Step-by-step tasks (TDD; commit after each task)

### Phase 1 — add `water_bath` as a computable equipment kind

Task 1.1 (RED): add a failing unit test asserting the new kind + inference.
File `app/src/types/labware.ts` (add code in Task 1.2); test file
`app/src/types/labware.instrumentKind.test.ts` (NEW), containing:
```ts
import { describe, expect, it } from 'vitest'
import { INSTRUMENT_KINDS, inferInstrumentKind } from './labware'

describe('instrument kinds', () => {
  it('includes a water-bath kind', () => {
    expect(INSTRUMENT_KINDS).toContain('water_bath')
  })
  it('infers water_bath from common labels', () => {
    expect(inferInstrumentKind('water bath')).toBe('water_bath')
    expect(inferInstrumentKind('Water Bath 55C')).toBe('water_bath')
    expect(inferInstrumentKind('circulating water bath')).toBe('water_bath')
  })
})
```
Run (expect FAIL): `cd app && npx vitest run src/types/labware.instrumentKind.test.ts`

Task 1.2 (GREEN): implement in `app/src/types/labware.ts`:
- extend the `InstrumentKind` union with `| 'water_bath'` (after `vortex`),
- add `'water_bath'` to `INSTRUMENT_KINDS`,
- add `water_bath: 'Water bath'` to `INSTRUMENT_KIND_LABELS`,
- add a branch line in `inferInstrumentKind` (before the `return 'generic'`):
  `if (/\b(water\s*bath|waterbath|circulating\s*bath|bath)\b/.test(t)) return 'water_bath'`
Run the same test (expect PASS), then `npm run typecheck -w app` (the
`Record<InstrumentKind, string>` gate will prove you filled every map).

Task 1.3: add the silhouette in
`app/src/event-editor/deck/InstrumentGlyphs.tsx`. Read the file first
(`grep -n "heater_shaker" .../InstrumentGlyphs.tsx` to find the switch), then add
a `water_bath` branch drawing a rectangular batch (reuse the nearest existing
silhouette + color tokens `--cl-*`). Verify by `npm run typecheck -w app`.

Task 1.4 (UI smoke): confirm the Equipment tab now offers a "Water bath" kind
chip. Existing test `app/src/event-editor/deck/AddToDeckDialog.test.tsx`
iterates `INSTRUMENT_KINDS`; add one assertion that a Water bath chip is present
and selectable (mirror the existing "a generic qPCR machine chip is addable"
test at the top of that file). Run:
`cd app && npx vitest run src/event-editor/deck/AddToDeckDialog.test.tsx`
Browse later: open `/deck/EVG-SPK-VERIFY`, freeform bench, click lawn → Equipment
tab → verify "Water bath" chip places an EQP- tile.

### Phase 2 — agent emission drives equipment resolution

Task 2.1 (prep, no code): read the current labware→deck resolve path to confirm
the hook point:
`cd app && grep -rn "labwareRequirements" src/event-editor/right-pane/ai/draftPreview.ts`
and
`cd server && grep -rn "labwareAdditions\|scopeAllowsLabwareAddition\|backfillRolesFromSteps" src/ai/runChatbotCompile.ts`
Note where a novel placement is currently minted from a requirement (that is
where equipment must branch to `inferInstrumentKind` + the AddToDeckDialog mint).

Task 2.2 (guard — RED then GREEN): make unrecognized requirements NOT fall to a
rack. In `app/src/types/labwareRequirement.ts`, `labwareTypeForRequirement`,
change the `default` branch so that when `classCurie` is not in
`BASELINE_LABWARE_CLASSES` *and* `req.tubeVolumeClass` is absent, it does NOT
return a `tubeset_*`. Return a sentinel the caller can distinguish, OR (cleanest
for now) have `normalizeClassCurie` keep the raw term and have
`createLabwareFromRequirement` reject/flag unknown terms instead of minting
`tubeset_24`. Write the failing test first
(`app/src/types/labwareRequirement.test.ts`): assert that a requirement for
`classCurie: 'CL:water_bath'` does NOT produce a `tubeset_24` labware (e.g.
expect an `unknown` flag / thrown error / `labwares: []` skip). Match your
chosen behavior to a single assertion, then implement. Verify: the test + `npm
run typecheck -w app`.

Task 2.3 (agent equipment naming): the emission's `event_graph` intent already
exposes `labwareRequirements[].classCurie`. Add an explicit, small prompt
nudge in `server/src/ai/submitSuggestionTool.ts` (`SUBMIT_SUGGESTION_INSTRUCTION`
"labware" bullet) telling the model that bench EQUIPMENT (water bath, heat
block, shaker, vortex, qPCR) is requested via a friendly kind label (e.g.
`classCurie: "equipment:water_bath"`), NOT a fabricated CL: CURIE. Add a unit
assertion that the instruction text contains `equipment:` (extend
`server/src/ai/submitSuggestionTool.test.ts`).

Task 2.4 (resolve equipment → place on the bench): in the deck resolve step
found in 2.1, when a requirement's term maps (via `inferInstrumentKind`) to a
known equipment kind, route it through `AddToDeckDialog`'s generic-equipment
mint + lawn placement (reuse `addDeckDialogModel.ts`'s `mergeAndRankDeckSources`
and the kind chip machinery) so an `EQP-` tile ghosts on the lawn. Follow TDD:
write a `draftPreview` unit test for "a water_bath requirement ghosts an
equipment tile on the lawn, not a slot/rack", then implement, then ran that
test. Run `cd app && npx vitest run src/event-editor/right-pane/ai/draftPreview.test.ts`.

Task 2.5 (records-first, generic-next, freeform-last): order for resolving a
requested instrument:
  1. search the lab equipment records (`client.searchRecords(query, ['equipment'])`,
     filter `origin==='local'`) — proven EQP- records, pull their real names;
  2. else the generic kind (e.g. `water_bath`);
  3. else user freeform handle (the user's exact words, e.g. `water bath 1`).
This ordering should live where the requirement is resolved (Task 2.4). Cover
with a unit test asserting the records-first order (mock the search). Command:
`cd app && npx vitest run src/event-editor/right-pane/ai/draftPreview.test.ts
src/event-editor/deck/addDeckDialogModel.test.ts` (add the records-first test to
`addDeckDialogModel.test.ts`).

Task 2.6 (full-chain e2e): add `app/e2e/deck-equipment-via-agent.spec.ts`
mirroring `app/e2e/deck-switch-via-agent.spec.ts` (intercept
`/api/ai/assist/stream` with a crafted SSE): the model emits
`agent_intent` → `{ intent:'event_graph', labwareRequirements:[{classCurie:'equipment:water_bath', handle:'water bath 1'}, {classCurie:'equipment:water_bath', handle:'water bath 2'}] }`,
then `done`. Assert: two `EQP-`/`water_bath` tiles appear on the LAWN (not a
24-well/rack), the draft-review sidebar does NOT open in a way that blocks the
input, and the chat input stays visible. Run:
`cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts --project=chromium`
Use `LABWARE_TYPE`/kind glyph selectors already used in the deck specs.

### Phase 3 — place these into the Step-1 sub-graph

Task 3.1 (read, no code): confirm how the "EDITING: Step N" focused step is read
by the deck/ghost and where a step realization commit writes the `subGraphRef`.
Read:
- `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx` (the
  `subGraphRef → protocol/event-graph` commit at ~line 386, `onSaveRealization`),
- the focused-step context (`app/src/graph/run-workspace/RunProtocolStepsLoader.tsx`
  publishes concepts; fine a `focusedStepId` in the shared protocol context),
- the deck→step bridge (`app/src/event-editor/right-pane/protocol/ProtocolPreviewBridge.tsx`).
`grep -rn "focusedStepId\|setFocusedStep\|_protocolStepId" app/src/event-editor`

Task 3.2 (attribution, TDD): the equipment placement from Phase 2 must target
the focused step. When a step is focused, route the ghosted equipment + the
temperature events through the SAME step-localization Accept that already calls
`patchStepSubgraph` (StepInvestigationPanel `onSaveRealization` → `POST
/protocols/:id/steps/:stepId/subgraph`). Concretely: the AI's event_graph
equipment + temp events are ghosted with `_protocolStepId = focusedStepId` (the
existing bridge pattern) so Accept commits them into the step's sub-graph. Write
a failing unit test in
`app/src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx` that
asserts a ghost carrying `_protocolStepId` commits to `subGraphRef` (extend the
existing accept test), then implement.

Task 3.3 (step graph contains the equipment + temps): add a server-side
verification that the step's compiled graph reflects the placed equipment.
After the commit, `GET /api/protocols/:id/steps/:stepId/graph` must include the
two water-bath labwares and the set-temperature events. Add/extend a test in
`server/src/api/routes/protocol-steps.test.ts` (or the nearest existing step-graph
test) asserting the returned graph's `labwares` include the water baths and
`events` include `set_temperature`/`incubate`. Command:
`cd server && npx vitest run src/api/routes/protocol-steps.test.ts`.

Task 3.4 (browser verify the whole user story): extend
`app/e2e/deck-equipment-via-agent.spec.ts` (or add a second spec) that: selects
Step 1 in the protocol context box (the "EDITING: Step 1" header), sends "place
two water baths / set to 55 and 70 °C", and after Accept verifies (a) the deck
shows the two EQP- water baths on the lawn and (b) re-selecting/protocol-steps
shows Step 1 now has a realization (compiled graph with the water baths).
Command: `cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts
--project=chromium`.

## Tests / validation (global gate — run at the end)

- `cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck` (server + app)
- `cd app && npx vitest run src/types/labware.instrumentKind.test.ts
  src/event-editor/right-pane/ai/draftPreview.test.ts
  src/event-editor/deck/addDeckDialogModel.test.ts
  src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx`
- `cd server && npx vitest run src/ai/submitSuggestionTool.test.ts
  src/api/routes/protocol-steps.test.ts`
- `cd app && npx playwright test e2e/deck-switch-via-agent.spec.ts
  e2e/deck-equipment-via-agent.spec.ts --project=chromium` (all pass)
- Because server emission code changed, restart the backend (SOUL.md rule 13)
  and re-run one real-LLM smoke: POST `switch the deck` / `place two water baths`
  to `/api/ai/assist/stream` and confirm the model emits `agent_intent`.

## Risks, tradeoffs, and open questions

- Risk: Phase 2/3 touch the shared deck-place machinery and the step
  realization commit — high blast radius. Mitigate by landing Phase 1 first
  (self-contained), and by keeping Phase 2 equipment routing as a thin branch
  into the existing AddToDeckDialog mint, never a second mint path (DRY).
- Tradeoff: the resolver guard (Task 2.2) changes behavior for genuinely-unknown
  labware requests (from "place a rack" to "ask/flag"). This is the intended
  correctness fix but may surface more clarification UI; call it out to Brad.
- Open: should equipment tiles also become real `equipment` records on the
  bench (EQP-) or stay ephemeral tiles until Accept? Default = follow
  AddToDeckDialog's existing behavior (mint on add) — confirm during Task 2.4.
- Open: temperature metadata for "set to 55/70 °C" — must the water bath tile
  expose a temperature field (instrument setting) or is a `set_temperature`
  event wrapper acceptable? Default = `set_temperature`/`incubate` event on the
  step sub-graph; confirm with Brad before Task 3.2.
- Open: equipment in a run-editor vs project-deck context — the step sub-graph
  wiring only applies when a local/universal protocol step is focused; a loose
  deck without a focused step should still place equipment (no sub-graph).