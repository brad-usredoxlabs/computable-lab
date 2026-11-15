# L2-P1-LABWARE-INSTANCE-RECORD-1 — unit u5seedguard

Worktree: /home/brad/cl-wt/L2-P1-LABWARE-INSTANCE-RECORD-1-u2ghostgate-lane2
Branch: cl/lane2-instrec-u2ghostgate-0232 (base 1b67acd89, top before this unit 1b67acd89)
Scope: ONE seam — the u4seedref `sourceRecordId` arm of `resolveLabwareDefinitionId`
(app/src/event-editor/deck/labwareInstanceMint.ts) + RED/GREEN legs + this report.

## Defect (advc c3 defect 1, source-verified by orchestrator)

A REQUIREMENT vessel (createLabwareFromRequirement shape: `labwareId: 'req:CL:96_well_plate:*'`,
`sourceRecordId: 'CL:96_well_plate'` — a CLASS CURIE, `requirementClassCurie: 'CL:96_well_plate'`)
reached the accept, and the unguarded u4 arm resolved the definition id to the class CURIE.
At RED (commit c45c15232) the real accept returned `adopted: true` and minted a
`labware-instance` whose `labwareId` is `CL:96_well_plate` — a drawing with no record behind
it (LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113 §1; prompt-1 not_done_if #2).

## Fix (commit 789e8235b)

The arm now skips requirement vessels:

```ts
if (
  labware.requirementClassCurie === undefined &&
  typeof labware.sourceRecordId === 'string' &&
  labware.sourceRecordId.length > 0
) { return labware.sourceRecordId }
```

`requirementClassCurie?` (app/src/types/labware.ts:435) is set by createLabwareFromRequirement
and by NO record-backed producer (verified: the only two other `sourceRecordId` writers are
labware.ts:1450 and labware.ts:1765, neither sets the field). The field is ABSENT on every
seeded/record vessel, so the exclusion is exact — record ids like `lbw-seed-*` keep resolving;
no CURIE pattern matching. Docstring (~:57-65) corrected to state the requirement-vessel
exclusion instead of "a seeded vessel always carries sourceRecordId ... and only that".
Root-cause fix (stop writing the CURIE into sourceRecordId) is a separate unit — untouched here.

## Commits

  c45c15232  u5seedguard: RED — requirement-shaped pins (3 legs, fail at HEAD)
  789e8235b  u5seedguard: GREEN — guard + docstring

## New pins (RED-first)

1. labwareInstanceMint.test.ts "u5seedguard h)": resolver returns undefined for the Anchor-2
   vessel; mint: ZERO createRecord calls, skipped:['P1'], one warning.
2. ghostgate "findUnplaceableLabware names the key": the pre-check names the req key.
3. ghostgate "the real accept REFUSES": real adoptStagedPreview path returns
   {adopted:false, blocked:1, reason:'unplaceable-labware', unplaceable:[key]},
   callOrder [] (zero createRecord calls), persistAcceptedEventGraph not called.

## Verification (real output)

RED at commit c45c15232 (only the 3 new legs fail; 37/37 pre-existing green):

  FAIL deckAdoption.ghostgate.test.ts > u5seedguard ... findUnplaceableLabware names the key
    AssertionError: expected [] to deeply equal [ 'req:CL:96_well_plate:mwxyz123' ]
  FAIL deckAdoption.ghostgate.test.ts > u5seedguard ... the real accept REFUSES
    AssertionError: expected { adopted: true, eventCount: 1, …(4) } to deeply equal
      { adopted: false, blocked: 1, …(2) }
    (received carried instanceIds ['LAB-INST-69AFB46F'] and a persisted commit)
  FAIL labwareInstanceMint.test.ts > u5seedguard h) ... resolver returns undefined
    AssertionError: expected 'CL:96_well_plate' to be undefined
  Test Files  2 failed | 2 passed (4)
       Tests  3 failed | 37 passed (40)

GREEN at commit 789e8235b:

  ✓ src/event-editor/deck/deckAdoption.ghostgate.test.ts  (14 tests) 9ms
  ✓ src/event-editor/deck/labwareInstanceMint.test.ts  (11 tests) 12ms
  ✓ src/event-editor/deck/deckAdoption.test.ts  (4 tests) 3ms
  ✓ src/event-editor/deck/PreviewActionBar.test.tsx  (11 tests) 258ms
  Test Files  4 passed (4)
       Tests  40 passed (40)

  npx tsc --noEmit -> 4 errors, all pre-existing branch baseline
  (SchemaRecordForm.tsx x3, RefCombobox.ontologyref.test.tsx x1). Delta 0.

Mutation check: deleting the `labware.requirementClassCurie === undefined &&` clause and
re-running the two suites -> exactly the 3 new u5seedguard legs FAIL (3 failed | 22 passed);
restored, back to 40/40.

u4seedref regression: its 4 legs (f, g in mint; both ghostgate seeded legs) still green —
the seeded record path (lbw-seed-*, sourceRecordId === recordId, no requirementClassCurie)
adopts with exactly one labware-instance naming the seeded record id.

Full outputs: /tmp/u5seedguard/{red,green,tsc}-output.txt (outside git by policy).
