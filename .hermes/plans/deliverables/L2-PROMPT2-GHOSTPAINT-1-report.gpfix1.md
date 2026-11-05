# L2-PROMPT2-GHOSTPAINT-1 Report — gp-fix1

## Defect
Test file `server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts` had 2 RED legs (B1, B2) out of 6.
- B1 (:117): `expect(events.length).toBeGreaterThanOrEqual(1)` — got 0
- B2 (:162): `events[0].details` — undefined (Cannot read properties of undefined)

## Root Cause
The compile pipeline treats `LBW-96-1` (a deck labwareId) as an unknown noun because
`deckLabwareExactMatches` only matched by labware NAME, not by labwareId. The test's
`composeLabwareHintLookupWithDeck(DECK, undefined)` creates a lookup that searches by hint
against deck names — but when the doc has `labware: LBW-96-1` (the injected ID), the
resolution engine calls `searchLabwareByHint("LBW-96-1")` which only checks deck plate names.
Since no plate is named "LBW-96-1", the hint resolves to nothing, causing the compile to
return `needs-clarification` with zero events.

## Fix
Extended `deckLabwareExactMatches` in `server/src/ai/shorthandChat.ts` to also match by
`labwareId` when no name match is found. This makes the resolution engine recognize deck
IDs as known labware, so the compile produces events with proper `details.labwareId`.

### Changed file
- `server/src/ai/shorthandChat.ts` — 9 lines added to `deckLabwareExactMatches` (lines 178-187)
  Added a fallback loop that matches the hint against each deck entry's `labwareId` when
  no name match exists.

## Verification

### Baseline at HEAD (before fix)
```
cd server && timeout 300 npx vitest run src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts
FAIL  ... > B1: sole placement injects labware into well-bearing action with no identity
  AssertionError: expected 0 to be greater than or equal to 1
FAIL  ... > B2: concept-vs-formulation parity — both produce the same details.labwareId
  TypeError: Cannot read properties of undefined (reading 'details')
Test Files  1 failed (1)
     Tests  2 failed | 4 passed (6)
```

### After fix
```
cd server && timeout 300 npx vitest run src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts
PASS  src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts  (6 tests) 206ms
Test Files  1 passed (1)
     Tests  6 passed (6)
```

### TypeScript check
- Before fix: `npx tsc --noEmit 2>&1 | grep -c "error TS"` = 17
- After fix: `npx tsc --noEmit 2>&1 | grep -c "error TS"` = 17 (no increase)

### Regression guard (sole-placement tests)
```
cd server && timeout 300 npx vitest run -t 'sole'
Test Files  150 failed (pre-existing import errors) | 6 passed | 684 skipped (840)
     Tests  6 passed | 6304 skipped (6310)
```
All 6 sole-placement tests passed. The 150 failed test files are pre-existing import
resolution errors (missing `.js` modules), not related to this change.

### Commit
```
765c12c6 L2-PROMPT2-GHOSTPAINT-1 gp-fix1: sole-placement injection on the deterministic compile seam
```

## Decision on AgentOrchestrator.ts
The `applySoleDeckPlacement` call in `AgentOrchestrator.ts:1464` remains as-is. The fix
does NOT move it into `compileShorthandDeterministically` because the real issue was
that the resolution engine didn't recognize deck IDs as known labware. The orchestrator's
call is still correct — it injects `labware: LBW-96-1` into the doc before compile, and
now the compile path correctly resolves that ID through the extended `deckLabwareExactMatches`.
Double-apply is harmless because `applySoleDeckPlacement` is pure (returns structuredClone)
and skips actions that already have a `labware` field.

L2-PROMPT2-GHOSTPAINT-1 UNIT gp-fix1 DONE 765c12c62fba98916f596c90da810fae2600b400
