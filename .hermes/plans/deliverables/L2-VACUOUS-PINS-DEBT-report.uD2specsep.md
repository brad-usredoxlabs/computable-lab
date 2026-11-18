# L2-VACUOUS-PINS-DEBT — unit uD2specsep report

## Summary
Fixed the spec-sheet separator contract: added a real U+2022 bullet to the non-truncation
fixture so the bullet arm can fail, and corrected the block comment that listed • and ; as
separators when only ◉ and | are.

## Base
Base sha: 7911a2956eb1a3a8ea2a651123ebbb94595b5d22 (newer than specified 9e2373bf — anchors
verified with grep before editing).
Branch: cl/lane2-vacpins-uD2specsep-1110

## Changed Files (2)
1. server/src/ingestion/SpecSheetExtractor.test.ts — fixture value + assertion (2 lines)
2. server/src/ingestion/SpecSheetExtractor.ts — header comment (1 line)

## Mutation Probe Evidence

### Pre-fix mutation (GREEN — the defect)
Edit: sepRe changed from `/\s*(?:◉|\|)\s*/` to `/\s*(?:◉|\||•)\s*/`
Result: 12/12 tests PASSED — the bullet arm was invisible because no U+2022 existed in the fixture.

### Post-fix mutation (RED — the pin works)
With the fixture containing `Acme·Corp•Build 2`, the same mutation:
Result: 11 passed, 1 failed
  FAIL: expected 'Acme·Corp' to be 'Acme·Corp•Build 2'
The bullet truncation regression is now detected by the test.

### Post-revert (GREEN — clean tree)
sepRe restored to `/\s*(?:◉|\|)\s*/`
Result: 12/12 tests PASSED

## Verification
- vitest: 1 file / 12 tests passed
- grep -c $'\u2022' SpecSheetExtractor.test.ts → 2 (was 0)
- grep -n confirms comment at :124 says "(◉, |)" and :130 says "Separators: ◉ |"
- git diff --stat: 2 files changed, 3 insertions(+), 3 deletions(-)

## Commit
d4b66b47acc9f6c374f7e0554ca87c69434e0931 — "uD2specsep: Add U+2022 bullet fixture and correct separator comment"

L2-L2-VACUOUS-PINS-DEBT-uD2specsep UNIT uD2specsep DONE d4b66b47acc9f6c374f7e0554ca87c69434e0931
