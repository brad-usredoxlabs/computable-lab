# L2-PROMPT2-COMPOSITION-BIND-1 — u13fix Report

## Unit
u13fix — completing the RED→GREEN leg for u13. Two product files, one concept each.

## Task
Make the two committed D8 pins and the D7 fail-closed pin GREEN in
`server/src/compiler/scientistIntent/declaredDomains.test.ts`. Do NOT edit test files.

## Changes

### Fix A — D8 blank filter (vocabulary.ts)
File: `server/src/compiler/scientistIntent/vocabulary.ts`

- Old logic returned `['']` for whitespace-only strings and kept blank array elements.
- New logic: trim first, drop empties, then lowercase.
  - `undefined` → `[]`
  - whitespace-only string → `[]`
  - array with blanks → blanks filtered out
- Updated doc comment to state blank/whitespace-only values yield empty array.
- Commit: `9aaf9f66`

### Fix B — D7 fail-closed on undeclared domain (mixtureLabelRedundancy.ts)
File: `server/src/compiler/scientistIntent/mixtureLabelRedundancy.ts`

- Old logic: `contractDomains.length > 0 && !all-in-stripDomains` — when `contractDomains` is empty (no domain declared), the guard is false so the contract proceeds as a strip candidate.
- New logic: `!(contractDomains.length > 0 && all-in-stripDomains)` — requires at least one declared domain AND all declared domains must be in stripDomains. When no domain is declared, the contract is skipped (fail-closed).
- Updated comment to note undeclared domains are never candidates.
- Commit: `b5ecabdd`

## Verification

### declaredDomains.test.ts (target)
- RED baseline: 3 failed | 5 passed
- After fixes: 8 passed | 0 failed

### Full scientistIntent suite (collateral check)
- 7 failed | 407 passed (414 total)
- All 7 failures are pre-existing (vocabularyMirrorDrift, noBypass, realizationGolden,
  vocabularyContractBlock, hedgeOptionality) — unrelated to declaredDomains changes.

### Typecheck
- `npm run typecheck -w server` — clean (exit 0)

## Commits
1. `9aaf9f66` — D8 blank filter in declaredDomains (trim-then-drop)
2. `b5ecabdd` — D7 fail-closed strip candidacy in mixtureLabelRedundancy

L2-PROMPT2-COMPOSITION-BIND-1-u13fix UNIT unit DONE b5ecabdd71791cf4257cff14ed5845ef15e295b1
