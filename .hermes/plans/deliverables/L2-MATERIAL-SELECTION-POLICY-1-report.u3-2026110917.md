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

## u3fix1 — advc c1 D1/D2 closeout

Product code unchanged; `MaterialLifecycleHandlers.ts` was mutated only as a transient probe and is
byte-identical at exit.

Tests added (`MaterialLifecycle.classify.test.ts`, +45 lines, 5 -> 7):
- T1: whitespace-only `material_ref.id` emits NO `materialRefId` key (via `Object.keys`); `'  MAT-9  '` emits `'MAT-9'`.
- T2: a material-spec row whose payload carries `material_ref` has neither `materialRefKind` nor `materialRefId`.

Raw vitest (post-change, commit 71654930):
```
 ✓ src/api/handlers/MaterialLifecycle.classify.test.ts  (7 tests) 21ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Raw M1 (`stringValue` loses trim + whitespace guard, :151):
```
 ❯ ... > omits materialRefId for a whitespace-only id and trims a padded id
AssertionError: expected [ 'recordId', 'kind', 'title', …(4) ] to not include 'materialRefId'
 ❯ src/api/handlers/MaterialLifecycle.classify.test.ts:101:38
      Tests  1 failed | 6 passed (7)
```
Reverted with `git checkout -- server/src/api/handlers/MaterialLifecycleHandlers.ts`.

Raw M2 (material-spec early return leaks ref keys):
```
 ❯ ... > does not emit materialRef keys on a material-spec row even when the payload carries one
AssertionError: expected [ 'recordId', 'kind', 'title', …(4) ] to not include 'materialRefKind'
 ❯ src/api/handlers/MaterialLifecycle.classify.test.ts:128:35
      Tests  1 failed | 6 passed (7)
```
Reverted identically; `git diff --stat -- server/src/api/handlers/MaterialLifecycleHandlers.ts` empty.

Typecheck: `cd server && npx tsc --noEmit -p .` -> exit 0, no output (0 diagnostics).
Status: `?? app/node_modules`, `?? node_modules` — environment symlinks only (gitignore's `node_modules/`
does not cover a symlink); no source path dirty.

L2-MATSEL-u3fix1 UNIT unit DONE 71654930c7a56a0deecfee0c1cce3bf1e961617e
L2-MATERIAL-SELECTION-POLICY-1 (L2-MATSEL-u3fix1) UNIT u3fix1 DONE 71654930c7a56a0deecfee0c1cce3bf1e961617e

