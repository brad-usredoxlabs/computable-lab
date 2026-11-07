# L2-PROMPT2-SCIENCE-CHAIN-1 UNIT u10cardref — Report

## Task Summary
When a two-slot clarification answer binds picked record refs to an `add_material` event whose
`details.composition_snapshot` already carries >=2 draft-mint component entries, write each ref into
the matching snapshot entry's `component_ref` (by label match) instead of leaving the entries as
draft mints. This allows `eventGraph.isFormulationCarrierRow` and `formatMixtureShare` to match.

## Problem
The `writeMaterialRef` function only writes the event's top-level `material_ref`/`material_spec_ref`
field and never touches `details.composition_snapshot`. Record refs from clarification answers were
dropped from snapshot rows, leaving them as `{kind:"draft", id:"mint:..."}`. The served rowSpecRef
gate refused to mint a spec ref, and `isFormulationCarrierRow` never matched.

## Decision
Modified `writeMaterialRef` (server/src/ai/materialBinding.ts) to detect composition snapshots with
>=2 entries and a ref label. When both conditions hold, match the ref's label (case-insensitive)
against each entry's `component_ref.label`. On match, replace that entry's `component_ref` with the
resolved ref while preserving the entry's `role` and other fields. The top-level material ref stays
untouched (the mixture's own draft ref remains). Fall back to existing top-level write behavior when
snapshot has <2 entries or no label matches.

## Changed Files
1. server/src/ai/materialBinding.ts — modified writeMaterialRef (lines 124-155)
2. server/src/ai/materialBinding.test.ts — added 1 new test case (57 lines)

## Verification Results
- npx vitest run src/ai/materialBinding.test.ts: Tests 9 passed (9)
- npx vitest run src/ai/materialRangeClarification.test.ts: Tests 7 passed (7)
- npx vitest run src/ai/forceMaterialClarifications.test.ts: Tests 44 passed (44)
- tsc --noEmit: 1 pre-existing error in S3StorageProvider.ts (not in our files)

## Commit
2dbf9477d60b093d7ce5fa39a8366e3918a75323

L2-PROMPT2-SCIENCE-CHAIN-1-u10cardref UNIT unit DONE 2dbf9477d60b093d7ce5fa39a8366e3918a75323
L2-PROMPT2-SCIENCE-CHAIN-1-u10cardfix UNIT unit DONE f7ce66aa2ef344c413beb74bbdcb2bebe70cf393
