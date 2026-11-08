# L2-PROMPT2-RESOLVE-OR-AUTHOR-1 / unit u8fix1 — report

## Unit
u8fix1 (fix cycle 1 of unit u8mspdedupe). Fixes advc c1 D1 (MAJOR).

## Defect (advc c1 D1 / PROBE-A)
`AddMaterialSupport.ts` keyed the in-pass identity memo on
`${materialRef.id}|${JSON.stringify(composition)}`, which is STRICTER than the
server's own FIND predicate (`compositionsEqual`, order-insensitive, same file
:225). Two same-identity events whose composition entry order was permuted
minted TWO proposed material-spec records
(`MSP-DRAFT-EVG_PERM_ORDER_EVT_PERM_E1` / `..._E2`), violating acceptance
criterion 2 (one MSP per identity, no second record ever). PROBE-D showed the
persisted FIND treats the same two events as one identity on pass 2.

## Change (one seam, product)
`server/src/materials/AddMaterialSupport.ts`
- Replaced the string-keyed `identityMemo: Map<string, Promise<...>>` with an
  entry list `Array<{ materialRefId, composition, promise }>`.
- Lookup now matches `entry.materialRefId === materialRef.id &&
  compositionsEqual(entry.composition, composition)` — reusing the existing
  comparison surface, no second identity grammar.
- `composition.length < 2` / no-material_ref fall-through (else-branch direct
  upsert) is untouched; `entriesMatch` / `compositionsEqual` / FIND / sort /
  create bodies untouched.

## Test
`server/src/materials/addMaterialCompositionBatchDedupe.test.ts`
- NEW: "permuted composition entry order across events still mints ONE
  material-spec" — 2 events, same material_ref, 2-entry compositions with
  permuted order; asserts 1 created spec and 2 events binding the same id.
  This test IS the PROBE equivalent (mirrors advc PROBE-A).
- D2 fixed: vacuous pins at the prior :132-141 replaced with real assertions:
  `new Set(specIds).size === 1`, `typeof firstId === 'string'`,
  `firstId` contains `EVT_WELL_A1`, and `firstId` does not match
  `/EVT_WELL_(B2|C3|D4)/` (no per-event suffix). All-equal `forEach` pin kept.

## RED (before the fix)
`cd server && npx vitest run src/materials/addMaterialCompositionBatchDedupe.test.ts src/materials/addMaterialCompositionIdentity.test.ts`
```
 ✓ addMaterialCompositionIdentity.test.ts (3 tests)
 ❯ addMaterialCompositionBatchDedupe.test.ts (3 tests | 1 failed)
   permuted composition entry order across events still mints ONE material-spec
   → expected 2 to be 1 // Object.is equality   (createdSpecs.length: 2)
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 5 passed (6)
```
(committed alone: db3c24d0 "u8fix1 RED: permuted-order dedupe pin")

## GREEN (after the fix)
same command:
```
 ✓ addMaterialCompositionIdentity.test.ts (3 tests)
 ✓ addMaterialCompositionBatchDedupe.test.ts (3 tests)
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

## Full materials batch (advc's bar)
`npx vitest run src/materials/addMaterialCompositionBatchDedupe.test.ts src/materials/addMaterialCompositionIdentity.test.ts src/materials/addMaterialCompositionDraftShape.test.ts src/materials/AddMaterialSupport.test.ts`
```
 ✓ addMaterialCompositionDraftShape.test.ts (3)
 ✓ addMaterialCompositionIdentity.test.ts (3)
 ✓ addMaterialCompositionBatchDedupe.test.ts (3)
 ✓ AddMaterialSupport.test.ts (10)
 Test Files  4 passed (4)
      Tests  19 passed (19)
```
Baseline was 4 files / 18 tests; +1 is the new permuted-order test. No
regressions.

## Typecheck
`cd server && npx tsc --noEmit -p .`
```
src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3' ...
```
Exactly the 1 pre-existing baseline error; delta 0.

## D3
Marker self-reference handled per the exit contract: report committed, then the
marker sha line updated once (precedent: prior u8mspdedupe unit).

## Commits
1. db3c24d0 — u8fix1 RED: permuted-order dedupe pin
2. fd37a06a — u8fix1: identity memo keyed via compositionsEqual (advc D1)
3. <this report commit> — u8fix1: implementation report + DONE marker

## Files changed
- server/src/materials/AddMaterialSupport.ts
- server/src/materials/addMaterialCompositionBatchDedupe.test.ts
- .hermes/plans/deliverables/L2-PROMPT2-RESOLVE-OR-AUTHOR-1-u8fix1-report.md

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u8fix1 SUPERSEDED by u8fix2 (its marker named e0843877, whose tree carried PENDING_SHA)

## u8fix2

advc c2 unit u8fix2: DEFECT 1 (marker paperwork) + DEFECT 2 (coverage gap for
the `compositionsEqual` clause in the batch identity memo). No product-code
edits: the memo clause was accepted in c1 D1 and is unchanged.

### DEFECT 2 — shipped witness
New test in `server/src/materials/addMaterialCompositionBatchDedupe.test.ts`:
"same material, equal-length compositions with DIFFERENT concentration mint
distinct specs". Two events, same `material_ref` (XCO:0000988), two-entry
compositions with the same components/roles; only the glucose concentration
differs (1 mM vs 2 mM). Expects 2 material-specs with distinct ids.

### Verification (measured)
1. Baseline before change: 4 files / 19 tests PASS.
2. After adding the test: 4 files / 20 tests PASS (batchDedupe 3 -> 4).
3. Mutant, scratch rsync copy at /tmp/u8fix2-mutant (node_modules symlinked,
   deleted after): memo clause line 772
   `compositionsEqual(entry.composition, composition)` ->
   `entry.composition.length === composition.length`. Raw:
   ```
   ❯ src/materials/addMaterialCompositionBatchDedupe.test.ts  (4 tests | 1 failed)
     ❯ ... > same material, equal-length compositions with DIFFERENT concentration mint distinct specs
       → expected 1 to be 2 // Object.is equality
     298|     expect(createdSpecs.length).toBe(2);
   Test Files  1 failed (1)
        Tests  1 failed | 3 passed (4)
   ```
   Real code is GREEN, mutant is RED: the new test witnesses the clause.
4. Marker: HEAD's last report line is `DONE <sha>` naming the commit that
   introduced this section; that commit's own report tail is a full-hex
   `DONE 6eb6f5a0...` (chain: HEAD -> report commit -> 6eb6f5a0 full hex).

### Commits
1. 1f6ed0c3 — u8fix2: witness compositionsEqual in batch identity memo
2. <report commit> — u8fix2: report + DONE marker
3. <marker finalisation> — u8fix2: marker names report commit

### Files changed
- server/src/materials/addMaterialCompositionBatchDedupe.test.ts
- .hermes/plans/deliverables/L2-PROMPT2-RESOLVE-OR-AUTHOR-1-u8fix1-report.md

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u8fix2 DONE 6eb6f5a09076c1346db1c26591650ad587b272fa
