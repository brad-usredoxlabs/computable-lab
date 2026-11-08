# L2-PROMPT2-RESOLVE-OR-AUTHOR-1 — u4compident Report

## Task
In upsertProposedMaterialSpecFromComposition (MIXTURE/composition arm), look up an existing material-spec whose material_ref id and formulation composition set equal the incoming composition snapshot BEFORE calling implicitMaterialSpecId, and bind it (zero writes) when found.

## Changes
- server/src/materials/AddMaterialSupport.ts: Added entriesMatch() and compositionsEqual() helpers. Inserted FIND block after the composition length guard that lists existing material-specs, normalizes stored compositions via canonicalCompositionSnapshot, and compares via order-insensitive multiset equality. Binds matched record (lexicographically lowest if duplicates) or falls through to mint path.
- server/src/materials/addMaterialCompositionIdentity.test.ts: New test file. Drives normalizeEventGraphMaterialUsage twice with the same composition snapshot against different eventIds. Asserts zero new records on second call and identical returned spec id.

## Verification
- Tests: cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts src/materials/AddMaterialSupport.test.ts => 2 files, 11 tests passed, exit 0
- Typecheck: npx tsc --noEmit => pre-existing S3 error only, no new errors in AddMaterialSupport.ts
- Git: clean tree at exit

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u4compident DONE 5b7b66433055f2acfdfdb8563fdff8dd2653927c
