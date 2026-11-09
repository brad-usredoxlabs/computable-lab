# L2-CANONICAL-LABEL-STAGE-A-FALLBACK u1-fix2 Report

## Summary
Pinned the bare .toLowerCase() needle with a test that goes RED if .trim() is reintroduced.
Fixed two spec lines that incorrectly instructed .trim().toLowerCase() on the label side.

## Evidence
- Baseline: 9/9 GREEN before fix
- Pin test GREEN: 10/10 (added AC-8 test: padded label misses map key)
- Pin test RED under .trim(): FAIL 'expected 1 to be +0' when .trim() re-added at :1222
- Restored: 10/10 GREEN after git checkout

## Spec corrections
- Line 141: .trim().toLowerCase() -> .toLowerCase() citing MaterialGrounding.ts:213
- Line 509: .trim().toLowerCase() (VocabHandlers.ts:125) -> bare .toLowerCase() (MaterialGrounding.ts:213)

## Changed files
1. server/src/ai/shorthandChat.canonicalLabelFallback.test.ts (+18 lines, +1 test)
2. .hermes/plans/2026-11-04_1248-L2-CANONICAL-LABEL-STAGE-A-FALLBACK-spec.md (2 lines corrected)

## Next actions
NONE - unit complete.

L2-CANONICAL-LABEL-STAGE-A-FALLBACK-u1fix2 UNIT 1 DONE 7684f2a2d1f9f9c224d52790ee552e976c0c1e49
