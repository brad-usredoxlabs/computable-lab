# L2-PROMPT2-GHOSTPAINT-1 — spec OF RECORD (promoted by orch l2t1200 from the composer draft l2t1855)

Status: PROMOTED / READY (claimable only when no coder owns `ChatLog.tsx` / `ChatClarificationCard.tsx`;
see the dispatch gate at the end of this header).

Base tip for this promotion: `e716d6db` (lane trunk `cl/integration-2`, 2026-11-03T12:1x EST). Product content
= TARGET-1 merge `31353115`; `e716d6db`/`a951c945` are docs/handoff commits only.

ORCH FIRST-HAND CHECKS AT THE PROMOTION TIP (not inherited from the draft):
- `python3 ~/.hermes/cl/lanes/2/scripts/pin-check-GHOSTPAINT-1.py --root /mnt/vast/home/brad/git/cl-integration-2`
  -> `31/31 pins located; missing=none` (raw output in the l2t1200 tick log). The one historical drift
  P23 `AgentOrchestrator.ts:1428 -> :1426` is resolved at this tip. So TARGET-1's merge did not invalidate
  this spec's pin table.
- The OQ rulings in §6 were verified by the orchestrator at `fd0381dc` (l2t0035) and are BINDING here; the
  coder must not re-open them.

DISPATCH GATE (binding, measured in `~/.hermes/cl/lanes/2/2026-11-03-L2-prompt2-file-overlap-map.md`):
GHOSTPAINT-1 shares `app/src/agent/ChatLog.tsx` and `app/src/agent/ChatClarificationCard.tsx` with
`L2-CLARIFY-CARD-1`. It may NOT dispatch while that item's fix run is live or unmerged. Dispatch order:
CARD-1 merge -> this item. Also never concurrently with FIXTURE-BOARD-1 / COMPOSITION-BIND-1 /
SCIENCE-CHAIN-1 (all four share `app/src/graph/lib/eventGraph.ts`).

CODER RE-PIN DUTY (unchanged from the draft, and still binding): re-read every §3 pin with `grep -n` at YOUR
base tip before editing; if a pin has moved, re-anchor it in the report rather than silently following the
line number printed here.

---

## §1 Goal

Make a labware-less `add_material` preview event paint its wells on the deck grid by routing the
preview projection through the SAME single placed-vessel rule the committed projection already uses,
AND stop the deterministic answer-fold re-compile from committing an event whose `details` lack
`labwareId` when the request's `context.deckPlacements` already carries the binding.

Corpus2 prompt it unblocks: **Prompt 2, Leg-A (ghost/preview driving)** —
`/mnt/vast/home/brad/git/computable-lab/test-prompts/AI-Chat-Corpus2.md:25-33`, expectation at
`:30` verbatim: "The events will come back from the LLM turn with the 1mM clofibrate ghosted into
the wells. Mouseover of a well will show the final concentration of clofibrate as well as the
components." The paint half of that sentence is unjudgeable while the grid renders nothing: recon F1
measured `previewWells = 0` in drives 2/3/4 while the SAME preview tooltip read `E2 303.0 µL … 6
events applied` (recon `:121-143`, `:182-183`). Prompt-2's E-B1 (grid-vs-tooltip agreement) has no
honest reading until the preview index is populated.

User-visible harm (one sentence): mid-journey, the scientist is deciding whether to Accept, the
tooltip says the plate changes and the grid says nothing changed — two surfaces of one fact
disagreeing.

---

## §2 The two legs, scoped separately

### 2A — Preview projection routes through the ONE shared placed-vessel helper

Current state (VERIFIED): `buildPreviewWellIndex(preview)` takes ONLY the preview and buckets each
preview event by `collectEventLabwareIds(event)` — an explicit-reference walk over
`details.labwareId / source_labwareId / dest_labwareId / source.labwareId / target.labwareId`
(`app/src/event-editor/lib/previewProjection.ts:120-134`). A compiled `add_material` whose details
carry `wells` but no labware identity produces an EMPTY bucket list, so `data-preview` is never set
on any well (`app/src/event-editor/focus/WellGrid.tsx:270`) and the grid paints nothing.

The same event class is ALREADY solved twice on the committed side through one shared helper:

- `app/src/graph/lib/eventGraph.ts:951-965` — `computeLabwareStates` attributes a well-bearing,
  reference-less event to the SOLE placed labware (`const effectiveLabwareId = labwareId ??
  resolvePlacedVesselAttribution([details.labwareId], [...labwares.keys()])`, `:963-965`);
- `app/src/event-editor/lib/eventWellIndex.ts:224-274` — the deck-tile footprint index does the
  same via `resolvePlacedVesselAttribution(...)` at `:263-266`.

Required change (leg 2A):

1. `buildPreviewWellIndex` gains a SECOND, REQUIRED parameter `placedLabwareIds: readonly string[]`
   (deliberately required, not optional — see reviewer bait R5).
2. Per preview event: `const explicit = collectEventLabwareIds(event)`; bucket under `explicit`
   when non-empty; otherwise call `resolvePlacedVesselAttribution(explicit, placedLabwareIds)` and
   bucket the event's `getAffectedWells(event)` under the returned vessel when it is non-null.
   ZERO placed / MULTIPLE distinct placed / any explicit reference ⇒ unchanged (no bucket /
   explicit bucket) — the helper already encodes exactly that (`placedVesselAttribution.ts:45-59`).
3. Do NOT bucket a well-less event: guard on `getAffectedWells(event).length > 0` before the
   fallback bucket, or `previewAffectedLabwareIds` starts outlining deck tiles for events that
   touch no well (eventWellIndex guards the same way at `:232`/`:243` with `all.length > 0`).
4. The three production call sites pass the deck's placed set using the EXACT expression the deck
   already uses for the committed index — `[...new Set(state.placements.map((p) => p.labwareId))]`
   (`DeckSlot.tsx:68`, `LawnSurface.tsx:88`) — and add `state.placements` to the memo deps:
   `DeckSlot.tsx:51`, `LawnSurface.tsx:74`, `LabwareFocus.tsx:172`.
5. `collectEventLabwareIds` stays a PRIVATE explicit-reference walker. It is not the attribution
   rule and must not be merged into the helper.

Why this is the fix and not a second rule: the tooltip already agrees with itself because it reads
the eventGraph walk — `LabwareFocus.tsx:164-171` builds `computeLabwareStates(eventsWithPreviewState(
state.events, state.preview), labwareMapWithPreviewState(...))`, and the tooltip renders from that
state (`:402-403`, `<WellTooltip …/>` at `:555`). The grid reads `previewWellsForLabware(previewIndex,
…)` (`:173-176`). After 2A both read the same rule and the same vessel, which is scout streamline 3
(recon `:221-224`) executed as the ruling requires: "one rule, one vocabulary".

### 2B — The answer-fold re-compile must carry `details.labwareId`

Fact of record (recon, not re-measured by me): drive 1's accepted `add_material` carries
`details.labwareId = lbw-seed-plate-96-flat`; drive 2's (`evt-add_material-klh1bpqc`, the
formulation answer) carries NO labwareId anywhere on the event (recon `:116`, `:182-183`, table
`:183`). Both drives went through the clarification-answer path on the same deck.

Verified structure of the answer path (all at `ff53e5a8`):

- The fold is deterministic: `AgentOrchestrator.ts:1428` calls `foldAnswersIntoShorthand(held, …)`,
  then re-compiles via `compileShorthandDeterministically(folded.doc, …)` (`:1436+`) and maps the
  result through `shorthandResultFromCompile({...compiledFold, clarifications: survivingFacts}, …,
  shorthandDeckLabwares, …)` at `:1553-1559`.
- `shorthandResultFromCompile` binds through `bindShorthandEventsToDeck(compiledEventsToProposals(
  compiled.terminalArtifacts.events), deck, compiled.terminalArtifacts.resolvedLabwares)` at
  `:1508-1519`.
- The binder copies a bound id DOWN into `details.labwareId` only when a TOP-LEVEL ref exists and is
  deck-provable (`shorthandChat.ts:371-394` — `boundTop` arm at `:371-384`, "already a deck id" arm
  at `:386-394`); with no top-level ref it writes nothing.
- The `add_material` expander only ever emits a TOP-LEVEL `labwareId`, and only from
  `params.labware_id ?? params.labware` (`server/src/compiler/biology/verbs/simpleVerbs.ts:526`,
  emit arms `:631`, `:655`). It never writes `details.labwareId` itself.
- `context.deckPlacements` is declared on the AI context (`server/src/ai/types.ts:442`,
  `DeckPlacementSummary {slotId, labwareId?, moduleId?}` `:518-522`) and the same `context` object is
  already read at `AgentOrchestrator.ts:1355` for the deck labware list.

Consequence (structural, verified): an answer-fold document that names WELLS but no LABWARE compiles
an event with no top-level ref; the binder therefore has nothing provable to copy down; the committed
event carries no labware identity. The missing labwareId is reachable from `context.deckPlacements`
on that very request (recon `:141-143`).

Required change (leg 2B) — BEHAVIOUR is fixed here; the implementation location is OQ1:

- On the deterministic answer-fold re-compile, when a compiled event carries wells and NO labware
  identity (no top-level `labwareId`, no `details.labwareId`, no `details.labwareInstanceId`), and
  the request's `context.deckPlacements` holds EXACTLY ONE distinct non-empty `labwareId`, the
  emitted event must carry that id in `details.labwareId` — so the accepted record matches what the
  concept-answer path commits.
- ZERO or MULTIPLE distinct placement labwareIds ⇒ write NOTHING (never guess; multi-vessel deck is
  the never-guess case, per GHOST-1's D2 invariant and `placedVesselAttribution.ts:5-13`).
- NEVER overwrite an existing top-level `labwareId`, `details.labwareId`, or
  `details.labwareInstanceId` (the instance carrier is identity — see the binder's own guard at
  `shorthandChat.ts:371-384`).
- The write must be visible to BOTH the preview bucket (2A) and the persisted record. The record
  path persists client-supplied accepted events (`app/src/event-editor/deck/deckAdoption.ts:133-137`
  → `persistAcceptedEventGraph({… events: [...state.events, ...acceptedEvents] …})`) and the editor
  commit appends the same events verbatim (`app/src/event-editor/EventEditorContext.tsx:1022-1053`),
  so an id written on the SERVER's bound event survives to the record through the unchanged client
  commit. No client-side re-derivation is introduced.

---

## §3 PIN TABLE (every cite read by me at `ff53e5a8`; line content quoted)

| # | file:line | what it is | status |
|---|---|---|---|
| P1 | `app/src/event-editor/lib/previewProjection.ts:28` | `export function buildPreviewWellIndex(preview: EventEditorPreview \| null): PreviewWellIndex {` — the ONE parameter (no placed set) | VERIFIED |
| P2 | `app/src/event-editor/lib/previewProjection.ts:34-40` | `for (const event of preview.previewEvents) { const labwareIds = collectEventLabwareIds(event); const wells = getAffectedWells(event) … for (const labwareId of labwareIds) {` — bucket loop, no fallback | VERIFIED |
| P3 | `app/src/event-editor/lib/previewProjection.ts:120-134` | `function collectEventLabwareIds(event: PlateEvent): string[]` — pushes `details.labwareId`, `source_labwareId`, `dest_labwareId`, `source?.labwareId`, `target?.labwareId` only | VERIFIED |
| P4 | `app/src/graph/lib/placedVesselAttribution.ts:45-59` | `export function resolvePlacedVesselAttribution(explicitRefs, placedLabwares): string \| null` — `if (refs.size > 0) return null; … if (placed.size !== 1) return null; const [sole] = placed; return sole ?? null` | VERIFIED |
| P5 | `app/src/event-editor/lib/eventWellIndex.ts:26` | `import { resolvePlacedVesselAttribution } from '../../graph/lib/placedVesselAttribution'` — the existing client import precedent | VERIFIED |
| P6 | `app/src/event-editor/lib/eventWellIndex.ts:263-266` | `const vessel = resolvePlacedVesselAttribution([details.labwareId, details.source_labwareId, details.dest_labwareId, source?.labwareId, target?.labwareId], placedLabwareIds ?? [],)` | VERIFIED |
| P7 | `app/src/event-editor/lib/eventWellIndex.ts:232-243` | the `all.length > 0` guards on both fallback arms (well-less events are never attributed) | VERIFIED |
| P8 | `app/src/graph/lib/eventGraph.ts:951-965` | GHOST-1's committed-state rule comment + `const effectiveLabwareId = labwareId ?? resolvePlacedVesselAttribution([details.labwareId], [...labwares.keys()])` at `:963-964`, `if (!effectiveLabwareId) continue` `:965` | VERIFIED |
| P9 | `app/src/event-editor/focus/LabwareFocus.tsx:164-171` | `computeLabwareStates(eventsWithPreviewState(state.events, state.preview), labwareMapWithPreviewState(state.labwares, state.preview))` — the tooltip's data path | VERIFIED |
| P10 | `app/src/event-editor/focus/LabwareFocus.tsx:172` | `const previewIndex = useMemo(() => buildPreviewWellIndex(state.preview), [state.preview])` | VERIFIED |
| P11 | `app/src/event-editor/focus/LabwareFocus.tsx:173-176` | `previewWells = … previewWellsForLabware(previewIndex, labware.labwareId)` — the grid's paint input | VERIFIED |
| P12 | `app/src/event-editor/focus/LabwareFocus.tsx:402-403, 555` | `wellState = getWellState(labwareStates, labware.labwareId, hover.wellId)` → `<WellTooltip … state={wellState} …/>` | VERIFIED |
| P13 | `app/src/event-editor/focus/WellGrid.tsx:248-252, 270` | `const previewed = previewWellIds.has(well.wellId)` → `'data-preview': previewed ? 'true' : 'false'` | VERIFIED |
| P14 | `app/src/event-editor/deck/DeckSlot.tsx:51` and `:68` | `buildPreviewWellIndex(state.preview)` ; `[...new Set(state.placements.map((p) => p.labwareId))]` | VERIFIED |
| P15 | `app/src/event-editor/deck/LawnSurface.tsx:74` and `:88` | same two lines on the lawn surface | VERIFIED |
| P16 | `app/src/types/events.ts:457-482` | `getAffectedWells` — reads `details.wells / source_wells / dest_wells / source.wells / target.wells / mapping` | VERIFIED |
| P17 | `server/src/compiler/biology/verbs/simpleVerbs.ts:526` | `const labwareId = (params.labware_id ?? params.labware) as string \| undefined` in `verb: 'add_material'` (`:523`) | VERIFIED |
| P18 | `server/src/compiler/biology/verbs/simpleVerbs.ts:631, 655` | `...(labwareId ? { labwareId } : {})` — TOP-LEVEL only, in both add_material emit arms | VERIFIED |
| P19 | `server/src/ai/shorthandChat.ts:371-394` | binder copy-down: `else if (boundTop && typeof d.labwareId !== 'string' && typeof d.labwareInstanceId !== 'string') { nextDetails.labwareId = boundTop … }` and the `knownIds.has(ev.labwareId)` arm | VERIFIED |
| P20 | `server/src/ai/shorthandChat.ts:1429-1434` | `export function shorthandResultFromCompile(compiled, shorthandYaml, note, deck?: readonly DeckLabwareSummary[], options?: …)` | VERIFIED |
| P21 | `server/src/ai/shorthandChat.ts:1508-1519` | `bindShorthandEventsToDeck(compiledEventsToProposals(compiled.terminalArtifacts.events), deck, compiled.terminalArtifacts.resolvedLabwares)` | VERIFIED |
| P22 | `server/src/ai/shorthandChat.ts:1395-1415` | `compiledEventsToProposals` — carries `labwareId` only `...(prim.labwareId !== undefined ? { labwareId: prim.labwareId } : {})` (`:1405`) | VERIFIED |
| P23 | `server/src/ai/AgentOrchestrator.ts:1428` | `const folded = spliceFoldConsulted ? foldAnswersIntoShorthand(held, foldAnswers) : …` | VERIFIED |
| P24 | `server/src/ai/AgentOrchestrator.ts:1436-1466` | `compileShorthandDeterministically(folded.doc, { store, searchLabwareByHint, reuseBindings, priorLabState, scientistAnswers, answeredClarificationLabels })` — no deck/placement input | VERIFIED |
| P25 | `server/src/ai/AgentOrchestrator.ts:1553-1559` | `shorthandResultFromCompile({ ...compiledFold, clarifications: survivingFacts }, folded.yaml, '…re-compiled deterministically…', shorthandDeckLabwares, {…priorLoopAskCounts})` | VERIFIED |
| P26 | `server/src/ai/AgentOrchestrator.ts:1355` | `const shorthandDeckLabwares = Array.isArray(context?.labwares) ? context.labwares : undefined` — `context` is the AiContext in scope | VERIFIED |
| P27 | `server/src/ai/types.ts:442` | `deckPlacements?: DeckPlacementSummary[];` on `AiContext` | VERIFIED |
| P28 | `server/src/ai/types.ts:518-522` | `export interface DeckPlacementSummary { slotId: string; labwareId?: string; moduleId?: string }` | VERIFIED |
| P29 | `app/src/event-editor/deck/deckAdoption.ts:133-137` | `const persisted = await persistAcceptedEventGraph({ … events: [...state.events, ...acceptedEvents] … })` — the client's events ARE the record | VERIFIED |
| P30 | `app/src/event-editor/EventEditorContext.tsx:1022-1053` | `const committedEvents = action.previewEvents ?? preview.previewEvents` → `events: [...state.events, ...committedEvents]` — commit is verbatim, no id stamp | VERIFIED |
| P31 | `/home/brad/.hermes/cl/lanes/2/task-list.md:16305-16335` | the item block (id `:16305`, description `:16311-16324`, "verified by" `:16329-16334`) | VERIFIED |
| P32 | `/mnt/vast/home/brad/git/computable-lab/test-prompts/AI-Chat-Corpus2.md:25-33` | Prompt 2 verbatim; ghost expectation `:30` | VERIFIED |
| P33 | recon `…/PROMPT2-SCOUT-20261102/20261102T053516/report.md:121-143` | F1 (drive-by-drive previewWells) — reported, NOT re-measured by me | REPORTED (recon) |
| P34 | recon report `:182-183` | committed-data table: drive 1 has `lbw-seed-plate-96-flat`, drive 2 `absent` | REPORTED (recon) |
| P35 | `.hermes/plans/decisions/PROMPT2-recon-task-filing-l2t0747-ruling.md` §T-1 | the filing ruling (legs + boundaries + "NEVER the placed-vessel helper itself") | VERIFIED |

Not verified / CORRECTED (orchestrator errata, 2026-11-03, re-verified first-hand at trunk `fd0381dc`):
the earlier draft claim "no `context.deckPlacements` consumer anywhere in `server/src/ai/**`" is FALSE.
`server/src/ai/systemPrompt.ts:147-148` reads it (`const placements = (context.deckPlacements ?? []).length > 0 ? context.deckPlacements! : …`),
the field is declared at `server/src/ai/types.ts:442` (`deckPlacements?: DeckPlacementSummary[];`) and is
populated client-side (`app/src/graph/LabwareEventEditor.tsx:325` → `useLabwareAiContext.ts:49`). What IS
true and load-bearing: the FOLD seam's compile deps do NOT carry the placements — the
`compileShorthandDeterministically` call in the fold arm passes only `store`, `searchLabwareByHint`,
`reuseBindings`, `priorLabState` (plus the reading-answer key) at `AgentOrchestrator.ts:1441-1455`, and
`ShorthandCompileDeps.deckLabwares` (`server/src/ai/shorthandChat.ts:140`) feeds ONLY the hint lookup
(`composeLabwareHintLookupWithDeck` at `AgentOrchestrator.ts:~1371-1374`). So leg 2B must read the
REQUEST's `context.deckPlacements` — in scope in the same handler, the same `context` object already read
at `AgentOrchestrator.ts:1355` for the deck labware list — and MUST NOT try to route it through
`deckLabwares`. The prompt-visible placements block and the compile-time deck-labware summary are two
different carriers; do not conflate them.

---

## §4 RED-first tests (write failing, then make them pass)

### Leg 2A — `app/src/event-editor/lib/previewProjection.ghostpaint1.test.ts` (NEW)

Fixture: `details = { material: '1 mM Clofibrate in DMSO', volumeUl: 1, volume: {value:1,unit:'uL'},
wells: ['E2','E3',…,'H5'] }`, `event_type: 'add_material'`, no labware key anywhere.

- `A1 (RED)` "a labware-less add_material preview paints the sole placed vessel":
  `buildPreviewWellIndex(preview([labwareLess]), ['lbw-seed-plate-96-flat'])` ⇒
  `[...index.byLabware.keys()]` === `['lbw-seed-plate-96-flat']` AND
  `previewWellsForLabware(index, 'lbw-seed-plate-96-flat').size` === 16 AND
  `previewAffectedLabwareIds(index)` has that id. Today this returns `[]` (the bug, byte-for-byte
  the shape pinned as a regression at `shorthandPreviewGhosting.test.ts:43-51`).
- `A2` multi-vessel deck never guesses: two distinct placed ids ⇒ `byLabware` empty
  (GHOST-1 D2 invariant).
- `A3` zero placed vessels ⇒ `byLabware` empty.
- `A4` explicit reference is never re-routed: event with `details.labwareId = 'plate-B'` and placed
  `['plate-A']` ⇒ bucketed under `plate-B` only, and `plate-A` absent.
- `A5` well-less event is never attributed: `details = { material, volumeUl }` ⇒ no bucket even with
  one placed vessel (`previewAffectedLabwareIds` must not gain the tile).
- `A6` (regression, existing behaviour) step-status layering is unchanged for a reference-less
  event that now buckets — `previewStepStatusForLabware` still returns `current`/`past` per well.

Mechanical call-site updates (same PR, no new assertions): `previewProjection.test.ts:35/46/57/65`,
`shorthandPreviewGhosting.test.ts:48/64/122`, `EventEditorContext.test.ts:175` — pass `[]` (or the
fixture's placed set) so the pin keeps its original meaning.

### Leg 2B — `server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts` (NEW)

Fixture: held intent whose add_material names wells and NO labware; `deck` = one summary; the
clarification answer that folds 1:1; `context.deckPlacements = [{slotId:'lawn',
labwareId:'lbw-seed-plate-96-flat'}]`.

- `B1 (RED)` "the re-compiled event carries the sole placement's labwareId":
  run the fold → `compileShorthandDeterministically` → `shorthandResultFromCompile(...)` with the
  placement set; `result.events[0].details.labwareId` === `'lbw-seed-plate-96-flat'`. Today absent.
- `B2` concept-vs-formulation parity: the SAME fold/compile with (i) a concept-ref answer and (ii) a
  formulation-ref answer produce `details.labwareId` EQUAL in both results (this is the acceptance
  sentence "the re-compiled event carries the same labwareId as the concept-answer path").
- `B3` never-guess: `deckPlacements` with two distinct labwareIds ⇒ no `details.labwareId` written.
- `B4` zero placements ⇒ no `details.labwareId` written.
- `B5` no overwrite: an event that already carries `details.labwareId` (or
  `details.labwareInstanceId`, or a top-level `labwareId`) is byte-unchanged.
- `B6` (if OQ1 lands on R1/R2) parity pin vs the client authority:
  `import { resolvePlacedVesselAttribution } from '../../../app/src/graph/lib/placedVesselAttribution'`
  (precedent: `server/src/seeds/labwareDefinition.parity.test.ts:12` — server tests may import
  `app/src`) and assert the server's decision matches the helper for the same vectors: 0 / 1 / 2
  placed, explicit-ref-present, non-string entries.

---

## §5 Boundaries

IN SCOPE (the coder may touch exactly these):

- `app/src/event-editor/lib/previewProjection.ts` — the second parameter + the fallback bucket.
- `app/src/event-editor/deck/DeckSlot.tsx`, `app/src/event-editor/deck/LawnSurface.tsx`,
  `app/src/event-editor/focus/LabwareFocus.tsx` — one memo each (pass the placed set; add
  `state.placements` to deps).
- `app/src/event-editor/lib/previewProjection.ghostpaint1.test.ts` (NEW), and the three mechanical
  call-site edits listed in §4.
- `server/src/ai/shorthandChat.ts` — ONE seam for leg 2B (the fold-arm result mapper, or the binder
  call it already owns). Conditional spreads only.
- `server/src/ai/AgentOrchestrator.ts` — thread the placement set from `context.deckPlacements` into
  the fold re-compile result (2–3 line hunk next to `:1355` / `:1553-1559`).
- `server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts` (NEW).

OUT OF SCOPE (do not edit, do not "improve"):

- `app/src/graph/lib/placedVesselAttribution.ts` — the rule's ONE home. No signature change, no
  copy, no "small server variant" inside it.
- `app/src/graph/lib/eventGraph.ts`, `app/src/event-editor/lib/eventWellIndex.ts` — already correct;
  changing them re-opens GHOST-1.
- Card chrome / fold splice logic: `app/src/agent/ChatClarificationCard.tsx`,
  `app/src/agent/ChatLog.tsx`, `app/src/agent/ChatPreviewCard.tsx`, `foldAnswersIntoShorthand`
  semantics — TARGET-1 territory (item `deps: L2-CLARIFY-TARGET-1`).
- `server/src/ai/materialRefLabels.ts`, `eventGraph.ts` snapshot/fraction derivation — T-3
  (`L2-PROMPT2-SCIENCE-CHAIN-1`).
- Any `schema/**` or `config/**` YAML, `mixture-material-cues.yaml`, `resolveNounsPass.ts` — no data
  or vocabulary change is needed for either leg.
- `server/src/ai/types.ts` — only if OQ1 demands a new optional field; default is NO.

5.5 REVIEWER BAIT — pre-empt these or the adversarial review will find them:

- **R1 `exactOptionalPropertyTypes` (server)**: any new `details` spread must be
  `...(id ? { labwareId: id } : {})`, never `{ labwareId: maybeUndefined }`. Same for a new optional
  parameter: `...(placements ? { deckPlacements: placements } : {})` at the call site.
- **R2 double-attribution**: do not let 2A ALSO write `details.labwareId` onto preview events; the
  preview projection is a read-side index. Writing there would create a second producer of identity
  (two representations of one fact) and would make Accept persist an id the server never agreed to.
- **R3 explicit-ref re-route**: the classic defect is bucketing a `plate-B` event under `plate-A`
  because the deck holds one vessel. The helper already forbids it — call it with the event's OWN
  explicit refs, never with `[]`.
- **R4 zero-well bucket**: attributing a well-less preview event marks the whole tile "affected"
  (`previewAffectedLabwareIds` → `DeckSlot` outline) and paints nothing. Guard on
  `getAffectedWells(event).length > 0`.
- **R5 optional parameter trap**: if `placedLabwareIds` is optional with a `[]` default, a caller
  that forgets it silently reproduces this exact bug. Required parameter + compiler-forced call
  sites; the three production call sites must be listed in the PR body.
- **R6 memo staleness**: `buildPreviewWellIndex(state.preview)` memos that do not depend on
  `state.placements` will not recompute when a plate is placed mid-preview — the ghost then paints on
  the old placed set. Add the dep in all three call sites.
- **R7 hardcode boundary**: no labware id, slot id, surface name, or `'lawn'` literal in the new
  code. The placed set arrives as data from `state.placements` / `context.deckPlacements`.
- **R8 free-text sniffing**: never branch on `details.material` string content ("1 mM … in DMSO") to
  decide attribution. The rule keys off well-presence and labware-reference count only.
- **R9 fold-path regression**: `shorthandResultFromCompile` is shared by the FIRST-turn compile
  (`AgentOrchestrator.ts:3083-3092`) and the fold (`:1553-1559`). A change that fires only because
  "we are in the fold" must not alter first-turn bytes; if the id is written on both paths, the
  first-turn golden tests must be re-run and their diffs explained (a labware-less first-turn event on
  a one-vessel deck would newly gain `details.labwareId` — that is desirable but is a BYTE change;
  flag it, do not hide it).
- **R10 two-terms-for-one-entity**: do not introduce `resolvedLabwareId`, `targetLabwareId` or a
  second details key for the same fact. The vocabulary is `details.labwareId`.
- **R11 YAML-reload trap**: none expected (no YAML touched) — if the coder ends up touching any
  config/schema file, the lane stack must restart with `LABSTATE_ARM_LOG=1`.

---

## §6 Open questions for the orchestrator (RULED — see the rulings inline; the coder must not re-open them)

> ORCH RULINGS (2026-11-02 l2t1855, amended 2026-11-03 l2t0035 after first-hand verification at
> `fd0381dc`). These are BINDING for the coder run.
> **OQ1 = R1, AS AMENDED**: inject at the FOLD seam before `compileShorthandDeterministically`, reading
> the REQUEST's `context.deckPlacements` (NOT `deckLabwares` — that carrier reaches only the hint
> lookup). B6 parity pin (cardinality test vs the client helper's semantics) is REQUIRED. R3 is a
> candidate rider for AS-GHOST1-ACCEPT-NO-LABWAREID-STAMP, not this item. Basis for keeping R1 over R3:
> the filing ruling's leg (b) says "the compiler-side root", and the server cannot import the client
> helper (`server/tsconfig.json` `"rootDir": "./src"`).
> **OQ2 = FOLD-ONLY**: first-turn compile bytes must NOT change. If the shared seam would also fire on
> turn 1, gate the injection AT THE FOLD CALL SITE — no new flag in the expander, goldens byte-stable.
> **OQ3 = acknowledged, no ruling**: all pins are base-tip specific and MUST be re-read/re-pinned after
> TARGET-1 merges.
> **OQ4 = YES**: `previewAffectedLabwareIds` / `DeckSlot` outline lights for a labware-less preview event
> too — same fact, ONE rule, no index split.

**OQ1 (RULED R1-as-amended) — where the server-side write lives, given the build boundary.**
The invariant "ONE rule, ONE vocabulary, no second attribution implementation" is easy on the client
(2A imports `placedVesselAttribution.ts`) but the SERVER cannot import it: `server/tsconfig.json`
declares `"rootDir": "./src"`, so importing `app/src/graph/lib/placedVesselAttribution.ts` from
production server code fails the build (only server TEST files do it today —
`server/src/seeds/labwareDefinition.parity.test.ts:12`), and the workspace has no shared package
(`pnpm-workspace.yaml`: `server`, `app` only). Options:
  - **R1 (RULED, as amended below)**: at the fold seam, when the folded document's `add_material` action
    names no labware and the REQUEST's `context.deckPlacements` yields exactly ONE distinct `labwareId`,
    inject that id as the action's `labware` argument before `compileShorthandDeterministically`. The
    EXISTING expander emits the top-level id (`simpleVerbs.ts:631/655`) and the EXISTING binder copies it
    into `details.labwareId` (`shorthandChat.ts:371-384`) — no new details-writing code, no new
    vocabulary, and the fact is data from context (never a guess). Residual: the cardinality test
    itself is a small server-side expression; pin it against the client helper with test B6.
    AMENDMENT: the placements input is `context.deckPlacements` read in the same handler (in scope at
    `AgentOrchestrator.ts:~1355`), NOT `ShorthandCompileDeps.deckLabwares` — the latter is wired only
    into `composeLabwareHintLookupWithDeck` (`:1371-1374`) and never reaches the binder as a placement
    set.
  - **R2**: post-binder stamp inside `shorthandResultFromCompile` (same cardinality test, same B6
    parity pin).
  - **R3**: move the write to the client accept path (`deckAdoption.ts:133-137`) where the helper can
    be imported directly (truly one implementation), accepting that the item's "compiler-side root"
    phrasing is not honoured literally. This also closes the standing assumption
    AS-GHOST1-ACCEPT-NO-LABWAREID-STAMP.
  Default if no ruling arrives: **R1**, with B6 included.

**OQ2 (RULED: FOLD-ONLY) — should the first-turn compile also gain `details.labwareId`?**
R1/R2 as written apply wherever the seam runs (first turn and fold), because the seam is shared. That
changes first-turn bytes for a labware-less event on a one-vessel deck. Is that in scope (it makes
drive-1-style commits explicit too) or must the write be fold-only? I found no ruling either way; the
item says "the answer-fold path drops it", which suggests fold-scoped, but a fold-only branch adds a
fourth gate/flag for one seam. Recommend: apply on both paths (symmetry), document the byte change,
re-run the first-turn goldens; orchestrator to confirm.

**OQ3 — who owns the `deckPlacements` → compile wiring if TARGET-1 touched the same lines?**
`AgentOrchestrator.ts:1553-1559` and the fold arm at `:1428-1466` are re-pinned here at `ff53e5a8`;
TARGET-1 may shift them. Not a product question — flagging that this draft's pins are base-tip
specific and must be re-read after TARGET-1 merges (the item's own `spec path: none yet` note says
the same).

**OQ4 (RULED: YES) — does leg 2A need a deck-tile outline too?**
`previewAffectedLabwareIds` is consumed by `DeckSlot.tsx`/`LawnSurface.tsx` for the "affected"
outline. With 2A the outline now lights for a labware-less preview event — desired, but it is a
second visible change on the deck tiles. Confirm we take it (I recommend yes: same fact, one rule)
rather than splitting the index.

---

## §7 Acceptance evidence

Unit (coder's own gate — NOT the acceptance gate):

```
cd app    && npx vitest run src/event-editor/lib/previewProjection.ghostpaint1.test.ts \
                            src/event-editor/lib/previewProjection.test.ts \
                            src/event-editor/lib/shorthandPreviewGhosting.test.ts \
                            src/event-editor/lib/eventWellIndex.test.ts \
                            src/event-editor/lib/eventWellIndex.uifix2.fix2.test.ts \
                            src/event-editor/EventEditorContext.test.ts
cd server && npx vitest run src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts src/ai/
cd app    && npx tsc --noEmit -p tsconfig.json      # baseline RE-MEASURE first; last recorded 10 errors (repin @ 4a65d4c1), must not grow
cd server && npx tsc --noEmit -p tsconfig.json      # baseline RE-MEASURE first; last recorded 0 errors
```

Expected: all listed files PASS; no new tsc error lines beyond the recorded baseline (diff the lists,
do not eyeball counts).

Orchestrator live verification on :5193 (ROUND-TRIP-GATE-1: real stream, ZERO interception of
`/api/ai/**`, request body captured):

1. Re-drive the recon's drive-2 shape: prompt-1 DMEM state → `Add 1uL of 1mM clofibrate in DMSO to
   wells E2-H5.` → answer the card with the FORMULATION row → let it settle, do NOT accept.
2. Shot A: `[data-preview="true"]` count on the E2:H5 block === 16 (grid paints), i.e. the F1
   measurement (`previewWells = 0`) flips to 16.
3. Shot B: hover E2 at the same moment — tooltip lists the previewed material/volume. Grid and
   tooltip must describe the SAME state (the F1 "303 µL vs nothing" disagreement is gone).
4. Accept → `GET /api/records/<EVG>`: the new `evt-add_material-*` carries `details.labwareId ===
   <the sole deck labwareId>` (the drive-1 / drive-2 divergence is closed). Request body artifact +
   record JSON kept as receipts.
5. Cold reload (fresh browser context): the accepted event paints the same wells, tooltip unchanged.
6. Negative control on the same live deck: with TWO plates placed, the same turn paints NO ghost and
   the committed event carries NO labwareId (never guess) — screenshot of both.

Regression suite (must stay green, listed because 2A touches a shared index consumed by tiles):

- `app/src/event-editor/lib/eventWellIndex*.test.ts` (three files)
- `app/src/event-editor/lib/previewProjection.test.ts`
- `app/src/event-editor/protocol/ProtocolPreviewBridge.test.tsx`
- `app/src/graph/lib/eventGraph.addMaterialAttribution.test.ts`
- `server/src/ai/AgentOrchestrator.golden.test.ts` (+ `goldenWithSeeds`)
- `server/src/ai/shorthandChat*.test.ts` (whole set — the binder is shared)
- CARD-1 / TARGET-1 card chrome must not regress: `app/src/agent/ChatClarificationCard*.test.tsx`,
  `app/src/agent/ChatLog*.test.tsx`.

---

## Appendix — acceptance criteria VERBATIM from the lane task list (`task-list.md:16311-16334`)

Description:

> Ghost paints 0 wells in 3/4 prompt-2 drives: the committed-state single-placed-vessel
> rule (L2-PROMPT1-GHOST-1, placedVesselAttribution.ts ONE shared helper) was never
> applied to the preview projection — previewProjection.collectEventLabwareIds()
> (app/src/event-editor/lib/previewProjection.ts) reads only explicit details.*labwareId*
> fields, so a details={material,volumeUl,volume,wells} preview event indexes to nothing
> and data-preview is never set (tooltip previews 303 uL while the grid shows nothing).
> Owns BOTH legs: (a) route the preview projection through the SAME single helper (one
> rule, one vocabulary); (b) the compiler-side root — carry details.labwareId on the
> deterministic re-compile after a clarification answer when context.deckPlacements
> carries the binding (drive-2's committed evt-add_material-klh1bpqc has NO labwareId
> vs drive-1's concept answer which DOES — the answer-fold path drops it). NEVER fork
> the placed-vessel helper; card chrome / shorthandChat fold logic OUT (TARGET-1
> territory).

Why:

> Prompt-2 F1: the user-visible harm is grid-vs-tooltip disagreement mid-journey; and
> honest E-B1 paint judging for the prompt-2 re-gate is unreachable until previews
> index. Reuses GHOST-1's rule, builds no parallel machinery.

Verified by:

> The recon's drive-2 shape re-driven: formulation answer, settle -> 16 preview wells
> painted WITH explicit labwareId on the preview event, grid and tooltip agree, cold
> reload persists (cl-browser-reviewer ROUND-TRIP receipts on :5193). Unit: preview
> projection on a labware-less add_material preview; multi-offer deck does not guess
> (GHOST-1 D2 invariant carried).

## Appendix B — worker contract

- Branch: `cl/lane2-ghostpaint1-1-<tick>` off lane trunk `cl/integration-2` (never commit to the
  trunk; never work in `/mnt/vast/home/brad/git/cl-integration-2`).
- Worktree: `/mnt/vast/home/brad/git/wt/L2-PROMPT2-GHOSTPAINT-1-lane2-<tick>`.
- Deliverables are the code + tests inside the branch; the ONLY spec artifact is this draft's
  promoted copy (composer owns drafts, orchestrator promotes).
- Done marker for the launcher: `GHOSTPAINT1 DONE <sha>`.
- Run every git command with `git -c core.fileMode=false`.
- Re-verify each §3 pin at your base tip first; if a pin moved, report it in the DONE message rather
  than editing around it silently.
