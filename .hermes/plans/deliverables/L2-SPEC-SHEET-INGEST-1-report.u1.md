# L2-SPEC-SHEET-INGEST-1 Report

## RUN u1fix1

Fix the `resolvePath` helper in `server/src/ingestion/SpecSheetFieldMaps.test.ts` so it descends
into each object node's `properties` map while walking a dotted `targetField`.

**Root cause:** labware field map targets are two-segment paths
(e.g. `capacity.max_well_volume_uL`) but `resolvePath` walked raw schema nodes — after `capacity`
it looked for `max_well_volume_uL` directly on the capacity node, whereas the real schema nests it
under a `properties:` map.

**Fix:** at each step of the walk, if the current node has a `properties` map, descend into it
before taking `current[part]`. Otherwise take `current[part]` directly.

**Before fix:** 1 failed | 6 passed (7)
**After fix:** 7 passed (7)

**Changed files:**
- `server/src/ingestion/SpecSheetFieldMaps.test.ts` — `resolvePath` now descends into `properties` maps

**Typecheck:** no new errors from this change (pre-existing lane debt only).

L2-SPEC-SHEET-INGEST-1-u1fix1 UNIT unit DONE 33efa89b

## RUN u1fix2

**Typecheck fix (TS18048):** `SpecSheetFieldMaps.ts` line 48-54 dereferenced `doc.targets[0]`
without a guard against `undefined` under `noUncheckedIndexedAccess`. Added an early `continue`
when `target` is falsy — matching the file's existing style for absent data.

**Before:** 4x `TS18048: 'target' is possibly 'undefined'` at lines 49, 51, 52, 53.
**After:** 0 errors (tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes).

**Reload test pin strengthened:** The old `reload()` test asserted
`after.fieldMappings.length === before.fieldMappings.length` — a no-op reload passes.
New test: writes an extra mapping to the fixture YAML, calls `reload()`, and asserts the
new mapping count exceeds the pre-mutation baseline. A stale-cache reload would fail because
it would return the old (smaller) count. Cleanup restores the original YAML in a `finally` block.

**Test results:** 7 passed (7) — suite green.

**Changed files:**
- `server/src/ingestion/SpecSheetFieldMaps.ts` — added `if (!target) continue;` guard at line 49
- `server/src/ingestion/SpecSheetFieldMaps.test.ts` — strengthened reload() assertion

**tsc delta:** -4 TS18048 (4 -> 0 for this file; whole-server TS18048 count = 0).
**Ajv/createSchemaRegistry:** validated against schema/core/extraction-spec.schema.yaml with ajv 8.18 — both `kind: extraction-spec` documents `valid: true`, 5 negative controls red. (Environmental note: ajv resolved from the umbrella store because the tree's ajv pnpm symlink is broken.)

L2-SPEC-SHEET-INGEST-1 UNIT u1fix2pw DONE ceab5158188bf9a76acebf0a4dcb6a7337590ed6
