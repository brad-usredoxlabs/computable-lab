# L2-MATERIAL-SELECTION-POLICY-1 — UNIT u3 Report

## Summary

Server-side emission of `material_ref` (kind + id) on `MaterialSearchItem` rows produced by `classifyMaterialRecord` for vendor-product records. This threads the vendor product's `material_ref` onto `MaterialSearchItem` at the producer, completing the server-side half of MATSEL u2's D1 blocker.

## Changes

### server/src/api/handlers/MaterialLifecycleHandlers.ts
- Added two optional fields to `MaterialSearchItem` type:
  - `materialRefKind?: 'record' | 'ontology'` — absent when no ref
  - `materialRefId?: string` — absent when no ref
- In the `vendor-product` branch, reads `payload.material_ref` and conditionally spreads `materialRefKind` (only when kind is 'record' or 'ontology') and `materialRefId` (only when id is a non-empty string)
- Uses conditional-spread shape (`...(val ? { val } : {})`) — never emits `undefined`

### server/src/api/handlers/MaterialLifecycle.classify.test.ts
- Added `VENDOR_SCHEMA` constant and `vendorProduct()` helper
- Added `describe('classifyMaterialRecord — vendor-product material_ref')` with 3 tests:
  1. Record-kind material_ref emits correct kind/id
  2. Ontology-kind material_ref emits correct kind/id
  3. No material_ref omits both keys (proves exactOptionalPropertyTypes compliance)

## Verification Results

### Baseline (before changes)
```
cd server && npx vitest run src/api/handlers/MaterialLifecycle.classify.test.ts
  2 passed (2), Duration 497ms
```

### RED tests (before code fix, after adding tests)
```
2 failed | 3 passed (5)
- expected undefined to be 'record'
- expected undefined to be 'ontology'
```

### After fix
```
cd server && npx vitest run src/api/handlers/MaterialLifecycle.classify.test.ts
  5 passed (5)
```

### Typecheck
```
cd server && npx tsc -p tsconfig.json --noEmit
  exit 0, zero output
```

### Mutation Probe
- Temporarily removed the two vendor-product spreads
- Result: 2 tests FAILED (the record-kind and ontology-kind emission tests)
- Proves the pin is NOT vacuous — the spread lines are required
- Restored spreads before committing

### Tree status
```
git -c core.fileMode=false status --short
?? app/node_modules
?? node_modules
```
Clean — only untracked node_modules symlinks.

## Reviewer Bait Items Addressed

1. **exactOptionalPropertyTypes**: Fields are conditionally spread, never set to `undefined`. Proven via `Object.keys(item)` check on a no-ref row (test 3).
2. **YAML-reload trap**: None — no YAML touched in this unit.
3. **Ontology terms**: Kind discriminator comes from `material_ref.kind` in the payload. Never inferred from the id string. Record id stays as recordId; ontology id stays as CURIE.
4. **Hardcode boundary**: No vendor name, catalog number, concept id, or ontology CURIE literals in the new code. The ref is pure data.

## Changed Files
- `server/src/api/handlers/MaterialLifecycleHandlers.ts` (+13 lines)
- `server/src/api/handlers/MaterialLifecycle.classify.test.ts` (+49 lines)

## Next Actions
- Browser gate for end-to-end join (with client u2) stays with the item
- Client branch u2 (9b28231f) already declares the fields; merge u2+u3 to complete the MATSEL policy chain

L2-MATERIAL-SELECTION-POLICY-1 UNIT u3 DONE 9b3d9a1fb266365b5368dddf7193f4ed0fb64161
