# L2-PROMPT2-COMPOSITION-BIND-1 — Unit 1 Fix Report

## Obligation
advc-c1 defect D1: "the unit's third hop (spine carry) is entirely unwitnessed; the required ResolveSpine.test.ts pin is missing"

## New Tests Added
File: `server/src/resolve/ResolveSpine.test.ts`

1. `carries formulationDeclared into RankedCandidate when the hit provides it` — verifies that a ProviderHit with `formulationDeclared: true` produces a RankedCandidate where `.formulationDeclared` is `true`.

2. `omits formulationDeclared from RankedCandidate when the hit does not carry it` — verifies that a ProviderHit without the field produces a RankedCandidate where the key is absent (`'formulationDeclared' in candidate` is `false`), respecting `exactOptionalPropertyTypes`.

## Mutation Proof (M1)
Temporarily deleted `ResolveSpine.ts:245` (the `formulationDeclared` spread line). Result:
- `carries formulationDeclared into RankedCandidate when the hit provides it` — FAILED
  `AssertionError: expected undefined to be true`
- 9/10 tests passed (the omission test still passes because absence is the natural behavior when the line is missing)
- Restored line with `git checkout -- server/src/resolve/ResolveSpine.ts`

## Verification Results
### Vitest (green)
```
 ✓ src/resolve/ResolveSpine.test.ts  (10 tests) 8ms
 ✓ src/resolve/providers/records.test.ts  (6 tests) 87ms
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

### Typecheck
```
npx tsc --noEmit -p . — exit 0
```

### Test Count
`grep -c "it(" server/src/resolve/ResolveSpine.test.ts` = 10 (was 8 at HEAD b586ed65)

## Changed Files
- `server/src/resolve/ResolveSpine.test.ts` (+22 lines, +2 tests)

UNIT 1 FIX DONE 6662653c

L2-PROMPT2-COMPOSITION-BIND-1-u1fix UNIT 1 DONE 6662653c
