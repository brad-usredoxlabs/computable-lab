# L2-P1-R16D2-VIEWLABEL-1 u1 — View changes modal names the committed labware honestly (gate r16 D2)

Lane 2 | worktree /home/brad/cl-wt/L2-P1-R16D2-VIEWLABEL-1-lane2 | branch cl/lane2-p1-r16d2-viewlabel-l2t2675
Base 628002926f154cfe9c4fbd01d75ff19a354664c6 | 2026-11-16 ~06:15-06:45 EST | unit u1 of 1

## Decision path (quoted, not re-derived)
- `.hermes/plans/architect-context-l2.md` §0 (line 23): "**Low friction never licenses invented
  precision or lost specificity.**" — the static "96-Well Plate (200 µL)" label is precision the
  record does not have (the bound definition is 350 uL).
- Gate r16 VERDICT.md D2 (measured): "View changes renders the generic plate as '96-Well Plate
  (200 µL)' and names no definition … while the entry it will commit is bound to the 350 uL generic
  definition. Site: app/src/event-editor/deck/ProposedGraphModal.tsx:386 using
  app/src/types/labware.ts:176 (plate_96 -> '96-Well Plate (200 µL)')."
- not_done_if 2 ("type re-shaped / vendor identity invented") fires at this view surface.

## Geometry truth verified against the receipt (not assumed)
- /home/brad/.hermes/cl/lanes/2/receipts/PROMPT1-GATE-r16-20261116T104553Z/supp-viewchanges-content.json:
  dialogs[0] = "…NEW LABWARE\nplate4\n96-Well Plate (200 µL) · lawn · landscape…", bodyHas200: true.
- Same dir, api-evg-new-labware-entry.json: the committed entry carries labwareType plate_96,
  addressing 8x12 (rowLabels A-H, columnLabels 1-12), geometry { maxVolume_uL: 350, minVolume_uL: 10 },
  definitionId "generic/96_well_plate@v1", definitionSource "registry", sourceRecordId
  "lbw-def-generic-96-well-plate", physicalFootprintMm 127x85. The preview ghost (definition arm)
  carries ALL of these as `name`/`addressing`/`geometry` on the previewLabwares record — so the
  modal could name the bound definition without any new data source.
- proposal-draft-payload.json: resolvedLabwares = [{ hint "96-well plate", recordId
  "lbw-def-generic-96-well-plate", title "Generic 96-Well Plate" }] — the ghost's `name` is the
  record's own title (draftPreview.ts:352).

## Fix
1. app/src/types/labware.ts (+19): new capacity-free helper `labwareGeometrySummary(lw)` —
   instance name + grid rows×columns (when carrying them) + "N µL max" (only when the labware's own
   geometry.maxVolume_uL > 0). A value the record does not carry is left out, never invented.
   LABWARE_TYPE_LABELS values UNCHANGED.
2. app/src/event-editor/deck/ProposedGraphModal.tsx (±15): the New labware row's name span now
   renders `labwareGeometrySummary(lw)` (was `lw?.name`); the muted line now says "labware" instead
   of the static `LABWARE_TYPE_LABELS[lw.labwareType]` (was the fabricated-capacity source; the
   'unknown type' no-labware fallback is kept). `where`/`orientation` unchanged.

## LABWARE_TYPE_LABELS call sites (grep -rn, all coherent after change)
- app/src/types/labware.ts:175 — the map itself; UNCHANGED.
- app/src/types/labware.ts:1310, 1335 — createLabware fallback NAME when no name given
  (`name: name || LABWARE_TYPE_LABELS[labwareType]`): coherent — a fresh instance of that legacy
  type really does have the table's config, and it is a name, not a display claim about a bound
  record.
- app/src/event-editor/deck/AddToDeckDialog.tsx:275 — the add-deck PALETTE enumerates the static
  type catalogue (choosing a legacy type from the palette); coherent — that is a static-type list.
  Its suite AddToDeckDialog.test.tsx: 19/19 passed post-change.
- app/src/event-editor/labwareHandles.ts:26 — normalizes the type label into a visible handle
  (plate3/plate4…) for a labware of that type; coherent — handles are derived names.
- app/src/graph/labware/DeckVisualizationPanel.tsx:689 — pending-type fallback AFTER
  `getLabwareDefinitionByLegacyType(pendingType)?.display_name` wins when present; coherent.
- app/src/event-editor/focus/InstrumentFocus.tsx:62 and focus/LabwareFocus.tsx:502 — focus panes
  label a COMMITTED labware by its type; unchanged surfaces (not this defect's site), left alone
  (not in this unit's owned scope; no change needed — they describe the legacy-type instance).
- ProposedGraphModal.tsx:386 — the D2 site; NOW FIXED (no longer imports the map).

## Verification (real outputs, on the final commit's code)
RED (committed FIRST at 5113a2c2eb6dd30606b7fd3da95a604d13c0111a, before any fix):
  `cd app && npx vitest run src/event-editor/deck/ProposedGraphModal`
  → 2 failed | 15 passed (17): "expected 'Generic 96-Well Plate96-Well Plate (2…' not to contain
  '200 µL'" (row text = "Generic 96-Well Plate96-Well Plate (200 µL) · lawn · landscape") and
  "expected 'Bare plate96-Well Plate (200 µL) · la…' not to contain 'µL'".
GREEN (final):
  `cd app && npx vitest run src/event-editor/deck/ProposedGraphModal`
  → Test Files 3 passed (3); Tests 17 passed (17) (viewlabel 2, equipment 6, main 9).
  Base targeted baseline pre-test: 15 passed (2 files).
  `cd app && npx vitest run src/event-editor/deck/AddToDeckDialog` → 19 passed (19).
tsc: baseline (base 628002926, worktree materialized with server/node_modules ->
  /mnt/vast/home/brad/git/cl-integration-2/server/node_modules per VERIFY note; gitignored) = 11
  errors (RecordCreatePanel.gc16-widget-commit.test.tsx 4, SchemaRecordForm.tsx 3,
  RecordCreatePanel.gc16.test.tsx 1, ObjectWidget.nested.test.tsx 1, tabNavPlugin.ts 1,
  RefCombobox.ontologyref.test.tsx 1). Final `npx tsc --noEmit` = 11, byte-identical error set
  (diff of sorted error lines = empty) → DELTA 0 NEW. (An interim run before the test typo fix
  showed 12; the +1 was the test's own PlateEvent cast, fixed in the fix commit.)

## Files changed (3, +34/-9 net across the two commits; under 100 added lines)
- app/src/event-editor/deck/ProposedGraphModal.viewlabel.test.tsx (new, 96 lines)
- app/src/event-editor/deck/ProposedGraphModal.tsx
- app/src/types/labware.ts

## Commits
1. 5113a2c2eb6dd30606b7fd3da95a604d13c0111a — RED test (fails against base as shown above)
2. f13a731f8aa814f25e8eafd38b0a84d0421a57be — fix + test cast cleanup (17/17, tsc delta 0)
3. this report commit (sha named in the marker below)

## Acceptance
1. MET — the generic 96-well placement row renders "Generic 96-Well Plate · 8 × 12 · 350 µL max ·
   lawn · landscape": no "200 µL", no capacity the bound definition lacks; name/geometry match
   generic/96_well_plate@v1 (8x12, 350 uL). Pinned by the committed test (generic shape) and by the
   no-geometry shape (no µL claim at all).
2. MET — every other LABWARE_TYPE_LABELS site listed above and left coherent (no values changed).
3. MET — tsc delta 0 new vs the 11-error app baseline (server-side errors absent once the
   worktree's node_modules link is materialized).

## Next actions
- Browser-reviewer: re-run the r16 repro (RUN-2026-11-14-run-571a → New thread → "Place a 96-well
  plate on the deck." → View changes) and confirm the row shows the 350 uL generic definition and
  no "200 µL". Note the row's NAME now carries the geometry summary ("Generic 96-Well Plate ·
  8 × 12 · 350 µL max") — the record's own title plus what its bound definition declares.
- No YAML/schema changes; no lane-stack reload needed.

L2-P1-R16D2-VIEWLABEL-1 UNIT L2-P1-R16D2-VIEWLABEL-1 DONE 05335c023691cd5202113f455a8ceba920072f55
