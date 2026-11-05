# L2-PROMPT2-GHOSTPAINT-1 Unit u9 Report

## Summary
Fixed `applySoleDeckPlacement` to write NOTHING instead of injecting an unresolvable id when the placement id has no matching deck entry. Added B7 anti-regression pin.

## Problem
D1: gp-fix4 made the fixture production-shaped (name != labwareId) but B1/B2 called the helper with no deck, so it injected the raw record id. The NAME-only compile lookup could not resolve it, dropping the entire well-bearing action (0 events).
D2: `let injectToken: string = sole;` silently injected an unresolvable raw id when no deck was passed, while `result.success` stayed true — nothing surfaced the loss.

## Changes
### shorthandChat.ts
- Replaced `let injectToken: string = sole;` with `let injectName: string | undefined`
- Removed the false "preserves today's behavior" comment
- Added `if (injectName)` guard before injection — unresolved => no injection, event stays alive
- Renamed variable: `injectToken` -> `injectName` (semantic clarity)

### shorthandChat.recompileLabwareId.ghostpaint1.test.ts
- Threaded `DECK` into direct helper calls at B1, B2, B6 (3rd argument)
- Updated expectations: `action.labware` now expects `'Plate Alpha'` (deck name) instead of `'LBW-96-1'`
- Added B7: anti-regression pin — when DECK is passed but placement id is not on it, helper writes nothing and compile still returns the well-bearing event

## Verification
- Baseline: 2 failed | 4 passed (6) — B1 `expected 0 to be >= 1`, B2 `Cannot read properties of undefined (reading 'details')`
- After fix: 7 passed (7) — all B1-B7 green
- Fold test: 3 passed (3) — unchanged
- TypeScript: 0 errors
- Mutation proof: restored `let injectToken: string = sole;` => B7 failed with `expected 'LBW-NOT-ON-DECK' to be undefined`, proving the pin has teeth

## Changed Files
- server/src/ai/shorthandChat.ts
- server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts

L2-PROMPT2-GHOSTPAINT-1-u9 UNIT DONE 71c8a76db189b3dd1afe0416f1d93506a3bcb042
