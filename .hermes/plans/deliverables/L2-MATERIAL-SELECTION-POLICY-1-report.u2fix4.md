# L2-MATERIAL-SELECTION-POLICY-1 — Unit u2fix4 Report

## Defects Fixed

### D1: Declare `preselected` on `SlashSuggestion`

The u2fix3 report claimed `preselected` was declared on `SlashSuggestion` — it was NOT.
The field was only present on `RankedCandidateRow` in `clarifyPickerRanking.ts` and spread
into `SlashSuggestion` objects via excess-property bypass in `resolvers.ts:888`:

```
...(pickerRows && row.preselected === true ? { preselected: true } : {})
```

This typechecked only because TypeScript ignores excess properties on object literals
spread into interfaces. The fix adds `preselected?: boolean` to `SlashSuggestion` in
`types.ts` (line 109), closing D7 genuinely.

**Grep proof:** Before fix, `grep -c 'preselected' types.ts` returned 0. After fix: 2
(the field declaration + doc comment).

### D2: Duplicate `only` policies fail loudly with BOTH record IDs

Before: two `only` records for the same material concept were silently absorbed by the
app loader (`fetchSelectionPolicies`). The server-side canonical guard exists in
`server/src/materials/MaterialSelectionPolicy.ts:51-60` (normalizeMaterialSelectionPolicies)
but is only imported by its own test — not used by the app load path.

After: both `fetchSelectionPolicies()` (the real load path) and
`__setMaterialSelectionPolicies()` (the test seam) call `guardDuplicateOnlyPolicies()`,
which throws naming both record IDs. Mirrors the server-side contract exactly (same concept
key `kind:id`, same error shape).

**Why the load path?** LintEngine.ts:143 states "For now, only record scope is supported" —
a cross-record lint rule cannot express this constraint today. The load-path guard is the
sanctioned carrier. Cross-record lint is a named follow-up, not silently claimed done.

## Changed Files (3, +119/−0)

1. `app/src/shared/taptab/slashMenu/types.ts` | +7 — declare `preselected?: boolean` with
   doc comment on `SlashSuggestion` (D1)
2. `app/src/shared/taptab/slashMenu/policy.ts` | +38 — `guardDuplicateOnlyPolicies()` helper
   + calls in `fetchSelectionPolicies()` and `__setMaterialSelectionPolicies()` (D2)
3. `app/src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts` | +74 — 4 tests for
   duplicate-only guard (D2)

## Verification

### RED (before fix)
```
❯ src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts > L2-MATERIAL-SELECTION-POLICY-1 — u2fix4 D2: duplicate-only guard on load path > __setMaterialSelectionPolicies throws when two only policies claim the same concept
  → expected [Function] to throw an error
 Test Files  1 failed (1)
      Tests  1 failed | 30 passed (31)
```

### GREEN (after fix)
```
✓ src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts (31 tests) 19ms
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

### Full directory test suite
```
Test Files  8 passed (8)
     Tests  107 passed (107)
```

### Typecheck
```
npx tsc --noEmit -p tsconfig.json — 0 errors (exit 0)
```

## D3-D6: Open Debt

D3-D6 remain open and are not addressed in this unit. They require separate scope,
acceptance criteria, and orchestrator approval.

## D1 Correction Note

D1 corrects the u2fix3 false closure: u2fix3 claimed D7 (`preselected` on
`SlashSuggestion`) was closed, but `preselected` was ABSENT from the interface. The
fix is real; the claim was false. D7 is now genuinely closed.

## Commits

- e2b03a86 — fix product code

L2-MATERIAL-SELECTION-POLICY-1-u2fix4 UNIT unit DONE e2b03a8685948afbc04f5b34f085ac0bd1d53689
