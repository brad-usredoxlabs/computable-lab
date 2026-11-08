# L2-PROMPT2-RESOLVE-OR-AUTHOR-1 — u4compident Report

## Task
In `upsertProposedMaterialSpecFromComposition` (MIXTURE/composition arm), look up an existing material-spec whose material_ref id and formulation composition set equal the incoming composition snapshot BEFORE calling `implicitMaterialSpecId`, and bind it (zero writes) when found.

## Changes
- `server/src/materials/AddMaterialSupport.ts`: Added entriesMatch() and compositionsEqual() helpers. Inserted FIND block after the `< 2` composition guard that lists existing material-specs, normalizes stored compositions with canonicalCompositionSnapshot, and compares via order-insensitive multiset equality. Binds matched record (lexicographically lowest if duplicates) or falls through to mint path.
- `server/src/materials/addMaterialCompositionIdentity.test.ts`: New test — drives normalizeEventGraphMaterialUsage twice with the same composition snapshot against different eventIds. Asserts zero new records on second call and identical returned spec id.

## Decisions
- Used canonicalCompositionSnapshot on both incoming and stored sides (per brief: one-sided normalisation bait).
- Concentration equality compares value and unit as stored; missing concentration on both sides still matches on component_ref.id + role only.
- Duplicate resolution: lexicographically lowest recordId, no schema/lint added.
- Reused store.list pattern from formulationGrounding.ts.

## Verification
- Test: 2 files, 11 tests passed (1 new + 10 existing), exit 0
- Typecheck: baseline S3 error only (pre-existing), no new errors from AddMaterialSupport
- Git: clean tree

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u4compident DONE 04467e9b73ede204c46fc1d07adecc6de1d61947
