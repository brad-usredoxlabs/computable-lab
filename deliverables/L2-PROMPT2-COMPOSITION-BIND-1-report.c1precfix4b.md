# L2-PROMPT2-COMPOSITION-BIND-1 — Unit c1precfix4b Report

## What changed

**Problem:** After trunk flip `1a72f5ec` placed `declaration_precedence` first in `strategyOrder`, the strategy's `gather` returned the raw spine band unchanged when it could not narrow a declared twin. A single non-declared spine hit (`local:plate-B`, level `unknown`) was contributed at position 0 and bound through the engine's `inBand.length === 1` arm, blocking `hint_search` from ever running. The shipped behavior changed beyond the ruling's intent (declared formulation takes precedence only when there is a declared twin to narrow).

**Fix:** In `declaration_precedence.gather`, when the band is NOT narrowed (single spine hit, or multiple candidates without a unique declared winner), return `{ candidates: [], failures: outcome.failures, traces: [...] }` instead of returning the full outcome. This empty-candidate contribution triggers engine fall-through to the next strategy in `strategyOrder` (per `resolutionEngine.ts:386`), matching the `mint_local` precedent at `strategies.ts:133`.

## Changed files

1. `server/src/compiler/resolution/strategies.ts` — lines 137-147 (comment block updated) and 164-165 (gather return changed from `return outcome` to empty candidates with trace)
2. `server/src/compiler/resolution/nounResolution.test.ts` — line 360 (test title restored) and line 381 (pin restored to `['LBW-A']`)

## Verification

### Baseline (pre-fix)
```
vitest run src/compiler/resolution — Test Files 23 passed (23), Tests 193 passed (193)
```

### Targeted tests (post-fix)
```
vitest run nounResolution.test.ts resolutionEngine.declarationPrecedence.test.ts — Test Files 2 passed (2), Tests 25 passed (25)
```

### Full resolution suite (post-fix)
```
vitest run src/compiler/resolution — Test Files 23 passed (23), Tests 193 passed (193)
```

### Typecheck
```
npx tsc --noEmit -p . — 0 output lines (clean)
```

### Mutation proof
Reverted only the gather change (restored `return outcome`):
- Test went RED: `expected [ 'LBW-A' ] to deeply equal [ 'local:plate-B' ]`
- Restored fix: GREEN (25/25)

### Ambiguity arm preserved
The ambiguity-strategy test (`nounResolution.test.ts:385` — two hint matches, no spine hit) still yields `ambiguous-noun` with `bindings: []`. The flipped-vocabulary pin at `:382` remains `['local:plate-B']` unchanged.

## Reviewer checks addressed

- No YAML touched — `scientist-intent-vocabulary.yaml` and `strategyOrder` DATA flip preserved
- No `resolutionEngine.ts` edits
- No app/server restarts, no browser gates
- Optional fields: `candidates: []` (not `undefined`)
- No hardcoded labels in branch conditions
- Prior unit `c1precfix3b` repinned the test to bless the regression; this unit undoes that

L2-PROMPT2-COMPOSITION-BIND-1 UNIT c1precfix4b DONE 71a126ff819eac473bae6d6eb948e7c4179974ae
