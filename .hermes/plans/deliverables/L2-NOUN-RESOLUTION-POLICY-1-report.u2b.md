# L2-NOUN-RESOLUTION-POLICY-1 / unit 2b — Report

**Item:** L2-NOUN-RESOLUTION-POLICY-1 (lane 2, unit 2b)
**Branch:** cl/lane2-nounpolicy-u2b-2355
**Base:** 35f81aa80cdbbd6fd896aefa37738e341d62b8f2

## What was done

Removed the `menuProvider !== 'choice'` suppression from the `allowCreateLocal` expression in `clarificationsFromUnresolvedFacts`. A clarification card carrying MINTable readings (menuProvider `'choice'`) now emits `allowCreateLocal: true` in the wire object regardless of `menuProvider`, so the server-side gate is no longer suppressed. On the client, a reading card with `menuProvider: 'choice'` and options still renders no create/mint affordance — `canMint` is false for `menuProvider:'choice'` and `mintAvailable` additionally requires zero options — so the create exit surfaces only when those conditions are met.

## Changed files

1. `server/src/ai/shorthandChat.ts` (2 edits):
   - Line 1015: `const allowCreateLocal = menuProvider !== 'choice' && mintable;` -> `const allowCreateLocal = mintable;`
   - Lines 941-942: Updated stale comment that asserted "Mint suppression falls out of the EXISTING `menuProvider !== 'choice' && mintable` expression" to describe the shipped rule (allowCreateLocal follows the mintability gate alone)

2. `server/src/ai/shorthandChat.readingCard.test.ts` (4 edits):
   - Header comment (lines 12-13): Removed stale "mint suppression" reference
   - Test at :125: Title and assertion flipped from `toBe(false)` to `toBe(true)`, comment updated
   - Test at :186: Assertion flipped from `toBe(false)` to `toBe(true)` (discriminator test — same mintable label)
   - Control at :198: Left at `toBe(false)` (prose label proves the mintability gate still bites)

## Verification

### Baseline (before change):
`npx vitest run src/ai/shorthandChat.readingCard.test.ts` — 7 passed (7)

### Mutation probe (old expression vs flipped tests):
Exactly 2 failed (the repointed pins at :130 and :185), 5 passed. The control test at :191-198 (prose label) stayed green — proving the mintability gate still bites.

### Final (fix applied):
`npx vitest run src/ai/shorthandChat.readingCard.test.ts` — Test Files 1 passed (1) / Tests 7 passed (7)

### Regression control:
`AgentOrchestrator.freeformLegs.test.ts` — 30 passed, 3 failed (pre-existing failures unrelated to this change; confirmed by running against original code with identical results).

### No new files, no new deps, no schema changes.

## Commits

1. `51d7180d` L2-NOUNPOLICY-u2b: remove menuProvider suppression from allowCreateLocal
2. `adba54a4` L2-NOUNPOLICY-u2b: fix stale comment referencing old suppression mechanism

L2-NOUNPOLICY-u2b UNIT unit DONE 901a63578ced1e3628ef8fab6bc3248249976523
