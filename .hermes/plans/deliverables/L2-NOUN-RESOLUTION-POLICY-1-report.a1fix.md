# L2-NOUN-RESOLUTION-POLICY-1 Unit a1fix Report

Branch: cl/lane2-nounpolicy-a1-0656
Base: b34fac554a9a14ed781654b5555669101d8ef863
Date: 2026-11-11

## Baseline
- git rev-parse HEAD: b34fac554a9a14ed781654b5555669101d8ef863
- `AgentOrchestrator.foldanswerbind.test.ts`: 2 passed (2), Duration 1.96s

## Defects identified
- D1: `composeSpineWithReuseBindings` is asymmetric — binding refs stored as CURIE (`local:xxx`) but compared against bare record id from `recordIdFromCurie(c.curie)` → never matches
- D2: Negative leg test asserts against `'events'` which is not a valid `CompileOutcome` — vacuous pin

## Steps to execute
1. RED first: fix negative leg assertion
2. RED second: add narrowing pin for composeSpineWithReuseBindings
3. FIX: symmetric unwrap at shorthandChat.ts:523
4. Mutation probe: revert fix, show RED, restore, show GREEN
