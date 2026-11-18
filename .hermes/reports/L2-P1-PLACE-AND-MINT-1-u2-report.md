# L2-P1-PLACE-AND-MINT-1 — unit u2 report

- worktree: /home/brad/cl-wt/L2-P1-PLACE-AND-MINT-1-u1journey-lane2
- branch: cl/lane2-p1-place-mint-u2-1116
- base: a2de24ee3890dffec6900a9b534a4300fcfbd9cd
- code-fix commit: 7c05efc4cefcafdfc789805a8f39a1d7dcefee1f
- RED-test commit: 45a8db2f9 (committed RED before the fix, per anti-thrash contract)

## WHAT THE DEFECT WAS (r15, quote-verified)

`buildPreviewFromDraft`'s resolved arm (draftPreview.ts) hydrated a resolved offer through
`labwareRecordToEditorLabware`, which keys the editor labware BY THE RECORD ID (labware.ts:1761/1768:
`labwareId`/`sourceRecordId` = recordId). The shared loop's placement dedupe (draftPreview.ts:343)
compares `p.labwareId === labware.labwareId`. So when the offer's record was the DEFINITION record
(`lbw-def-generic-96-well-plate`) and a leftover placement for it was already on the deck (r15 graph:
vessel entry keyed `lbw-def-generic-96-well-plate` "plate2" + placement `pl-preview-mwhd0rct-1`), the
new "Place a 96-well plate" read as "already there": zero placements, zero mints (r15: Apply wrote one
event and nothing else; instances 6->6).

## WHAT DISTINGUISHES PLACEMENTS NOW

Three identities, three truths (no second authority):
- `definitionId` — names the GEOMETRY (a definition may back many vessels).
- `sourceRecordId` — names the chosen STORE RECORD (where the mint reads record identity:
  labwareInstanceMint.ts resolution, `sourceRecordId` arm first).
- `labwareId` — identifies the PLACEMENT (the deck key; what the placement dedupe compares).

The DISCRIMINATOR for whether a resolved offer places a NEW vessel or reuses a placement is
RECORD-LEVEL, in draftPreview.ts:
- `isDefinitionRecordPayload(record)` — true when the record hydrates through the definition mapper
  (`labwareDefinitionRecordToEditorLabware(record, record.recordId) != null`, i.e. the record carries
  topology+capacity — a labware-DEFINITION record). A definition offer mints a fresh placement identity
  `lbw-placed-*` (`nextPlacementIdentity`), so the :343 dedupe compares PLACEMENT identity and a second
  same-definition request places a second vessel (acceptance 2).
- A VESSEL offer (record without topology+capacity, e.g. `lbw-seed-plate-96-flat`) keeps the record-id
  key and reuses its one placement (L2-SUITE-A-uifix1 D5 dedupe — pin green, unmodified test body).

DELIBERATELY NOT used as the discriminator: the ghost's `definitionSource`. A legacy VESSEL ghost also
reads `'registry'` once its legacy type resolves through the registry (proven: with the
definitionSource-keyed fix, the D5 vessel pin failed — its ghost came out `definitionSource: 'registry'`
and got wrongly re-keyed). The record-level gate is the only safe split.

Downstream (all verified, all unchanged):
- Mint (labwareInstanceMint.ts:160-164): resolves the definition via `sourceRecordId`/`definitionId`,
  never via the deck key — the new `lbw-placed-*` key enters `previewLabwares`, so it mints;
  `instanceBindings` is keyed by the deck key (the placement identity).
- Adoption (deckAdoption.ts:198-199): writes `instanceRecordId` onto `preview.previewLabwares[key]`
  (key = placement identity); :213-218 persists the whole graph with `labwares: {...state.labwares,
  ...preview.previewLabwares}` and `placements: [...state.placements, ...preview.previewPlacements]` —
  the durable graph entry is keyed by the PLACEMENT identity and carries `instanceRecordId`.
  Acceptances 1-3 (instance chain, two placements/two instances same-definition, cold reload) are
  mechanically guaranteed by this keying; the journey test pins the preview+instance half.

## CHANGED FILES (vs base a2de24ee3)

| file | change |
|---|---|
| app/src/event-editor/right-pane/ai/draftPreview.ts | production seam: `nextPlacementIdentity` + `isDefinitionRecordPayload` + resolved-arm keying (definition offer -> `lbw-placed-*`; vessel offer -> record-id key) |
| app/src/event-editor/deck/placeAndMint.journey.test.ts | NEW: RED->GREEN journey test, production resolved-offer shape (`resolvedLabwares: [{recordId, title}]` + `labwareRecords` as useAiChat.genericPlacement.test.tsx shows), cases (a) empty deck -> new placement keyed by placement identity + mint binds instance; (b) leftover same-definition placement -> SECOND placement with its own labwareId |
| app/src/shared/hooks/useAiChat.genericPlacement.test.tsx | pin re-keyed to the placement identity (was `previewLabwares[definition.recordId]` — the exact keying the unit rules out); still asserts `sourceRecordId === definition.recordId`, `definitionId` preserved |
| app/src/event-editor/right-pane/ai/draftPreview.dedupe.uifix1.test.ts | header comment carve-out only (documents the vessel-offer scope of the D5 pin); test body untouched, green |
| .hermes/reports/L2-P1-PLACE-AND-MINT-1-u2-report.md | this report |

Not touched (per SCOPE): server/**, schema/**, generic-default YAML, prompt-templates, labwareInstanceMint.ts, deckAdoption.ts, useDeckGhostMount.ts, useAiChat.ts, types/labware.ts (the seam stayed at draftPreview.ts + the pin updates).

## VERIFICATION (actual outputs)

### STEP 1 — RED (committed at 45a8db2f9, before the fix)

Command: `cd app && npx vitest run src/event-editor/deck/placeAndMint.journey.test.ts`
(log: /tmp/u2-red.log)

```
 ❯ src/event-editor/deck/placeAndMint.journey.test.ts  (2 tests | 2 failed) 13ms
   (a) on an empty deck: NEW placement keyed by placement identity (NOT the definition record id)...
   (b) the SAME definition already on the deck (r15 "plate2" leftover): a SECOND placement...
 AssertionError: expected 'lbw-def-generic-96-well-plate' not to be 'lbw-def-generic-96-well-plate' // Object.is equality
  (case a: the placement was keyed BY the definition record id)
 AssertionError: expected [] to have a length of 1 but got +0
  (case b: zero placements produced — the r15 drop)
 Test Files  1 failed (1)
      Tests  2 failed (2)
```

### STEP 2 — GREEN (final commit 7c05efc4cefcafdfc789805a8f39a1d7dcefee1f)

Command: `cd app && npx vitest run src/event-editor/deck/placeAndMint.journey.test.ts src/event-editor/right-pane/ai/draftPreview.test.ts src/event-editor/deck/deckAdoption.ghostgate.test.ts src/shared/hooks/useAiChat.genericPlacement.test.tsx src/event-editor/right-pane/ai/draftPreview.resolved.test.ts src/event-editor/right-pane/ai/draftPreview.dedupe.uifix1.test.ts`
(log: /tmp/u2-final-tests.log)

```
 ✓ src/event-editor/deck/deckAdoption.ghostgate.test.ts  (14 tests) 11ms
 ✓ src/event-editor/deck/placeAndMint.journey.test.ts  (2 tests) 8ms
 ✓ src/event-editor/right-pane/ai/draftPreview.dedupe.uifix1.test.ts  (3 tests) 6ms
 ✓ src/event-editor/right-pane/ai/draftPreview.resolved.test.ts  (5 tests) 7ms
 ✓ src/event-editor/right-pane/ai/draftPreview.test.ts  (15 tests) 12ms
 ✓ src/shared/hooks/useAiChat.genericPlacement.test.tsx  (1 test) 32ms
 Test Files  6 passed (6)
      Tests  40 passed (40)
```

All three required neighbor files green; no new failures anywhere in the set (lawn-packing pin,
D5 vessel-dedupe pin, ghostgate, resolved-arm pins all pass).

### STEP 3 — typecheck

Command: `npm run typecheck -w app` (repo root).
- baseline (captured before editing): 17 errors (/tmp/u2-typecheck-baseline.log)
- final (on 7c05efc4c): 17 errors (/tmp/u2-typecheck-final2.log)
- file:line error-set diff: IDENTICAL (zero new errors; the 17 are the pre-existing
  node_modules/server-symlink TS2307/TS2339 set).

### Server suite (VERIFY item 3)

`cd server && npx vitest run src/ai/shorthandChat.genericPlacement.test.ts` — NOT RUNNABLE in this
environment: the server workspace has no node_modules (`vitest` cannot be resolved:
"Cannot find package 'vitest' imported from .../server/vitest.config.ts"). Zero server files were
touched (diff is 100% app/), and the server side is declared already green (BEDROCK 5, commit
9850026dd). Re-run on a lane with server deps installed to confirm 6/6; not claimed here.

## NOTE — seam beyond the owned set (noted, NOT wired, per brief)

app/src/event-editor/lib/eventWellIndex.ts:232-239 (offer-attribution arm) attributes the wells of an
event that names no labware under the OFFER'S recordId (`byLabware.get(offerRecordId)`,
offerRecordId = offer.recordId at :179/:233). After u2, a definition-offer placement carries
`lbw-placed-*` while the offer's recordId is the definition record id — so a STAGED (and
offer-bound committed) event's wells attribute under the definition record id, and a deck tile that
reads `byLabware` by the placement's labwareId (eventWellIndex.ts:7-8) sees an empty well set until
the event carries an explicit labware reference. The committed arm (committedOfferByEvent,
:162-173) has the same shape. Two-line resolution (offer recordId -> placement labwareId via
previewLabwares, where `sourceRecordId === offer.recordId`) is needed in that arm; eventWellIndex.ts
is outside u2's OWNED set, so it is reported as a follow-up, not wired.

## NEXT ACTIONS (owner: lane orchestrator / next unit)

1. Wire the eventWellIndex.ts offer-attribution resolution noted above (owner: a unit that owns
   app/src/event-editor/lib/eventWellIndex.ts) so per-well deck marking attributes to the placement
   identity for definition-offer plates.
2. Re-run the server suite on a dep-installed lane to reconfirm 6/6 (mechanical only).
3. Live gate: the r16 journey (request -> proposal -> Apply -> saved graph -> instance -> definition
   -> reload) against the served stack to confirm acceptances 1-3 end-to-end.

## MARKER

Marker sha = 26519e0033b715b60ae268a0a1dd0c794563938b — the commit that CONTAINS this report
(`.hermes/reports/L2-P1-PLACE-AND-MINT-1-u2-report.md`, "report(lane2): L2-P1-PLACE-AND-MINT-1 u2 ...").
The code + tests it documents are in 7c05efc4cefcafdfc789805a8f39a1d7dcefee1f ("fix(lane2): ...") on top
of the committed-RED 45a8db2f9. `git log --oneline`: 26519e003 -> 7c05efc4c -> 45a8db2f9 -> a2de24ee3 (base).
Tree is clean; the final commit after the marker was written contains only the marker sha update.

L2-P1-PLACE-AND-MINT-1 UNIT u2 DONE 26519e0033b715b60ae268a0a1dd0c794563938b
