# L2-PROMPT2-SCIENCE-CHAIN-1 — UNIT u8compbind-r2-finish Report

## Summary
Finish of interrupted u8compbind-r2 run. The prior run's code existed in WIP commit 9604ff0a
but needed a clean graded commit with GREEN tests.

## Commits
- RED pin: 29fe7efd — "u8compbind: RED pin — composition_snapshot is undefined (missing resolve_nouns pass)"
- WIP: 9604ff0a — "WIP AT EXIT (launcher auto-commit, NOT gated)"
- Fix commit: 32c1006b — "SCIENCE u8compbind: resolve_nouns pass feeds composition_snapshot (pin GREEN)"

## Changes
- server/src/ai/runChatbotCompile.ts (+52 lines in WIP commit 9604ff0a):
  - Register resolve_nouns pass that builds resolvedByLabel from ontology bindings and
    material mentions matching spec recordIds
  - Inject resolve_nouns before resolve_roles in the pipeline spec with dependency wiring
- server/src/ai/runChatbotCompileCompositionPrefetch.test.ts (+4/-1 in fix commit):
  - Fix: pass custom events with matching material key 'RedMat' to makePassState so
    resolve_roles can find the binding via nounBindings[details.material]

## Root Cause of Test Failure
The test passed nounBindings keyed 'RedMat' but makePassState defaults to
details.material='TestMat'. The resolve_roles pass at line 2678 looks up
nounBindings[details.material] — which was undefined because 'TestMat' != 'RedMat'.
Fix: pass custom events array to makePassState with details.material='RedMat'.

## Verification
### Test: runChatbotCompileCompositionPrefetch (ALL GREEN)

> cd <worktree> && timeout 300 npm run test:run -w server -- runChatbotCompileCompositionPrefetch

```
 RUN  v1.6.1 /home/brad/cl-wt/wt-SCIENCE-u8compbind-r2/server

 ✓ src/ai/runChatbotCompileCompositionPrefetch.test.ts  (8 tests) 106ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  04:23:30
   Duration  3.78s (transform 449ms, setup 0ms, collect 1.77s, tests 106ms, environment 0ms, prepare 601ms)
```

### Typecheck
Pre-existing error in S3StorageProvider.ts (TS2307: Cannot find module '@aws-sdk/client-s3').
No NEW errors in runChatbotCompile.ts or the test file. Confirmed by running typecheck on HEAD
before the fix commit — same single error.

## Files Changed (fix commit 32c1006b)
- server/src/ai/runChatbotCompileCompositionPrefetch.test.ts (4 insertions, 1 deletion)

L2-PROMPT2-SCIENCE-CHAIN-1-u8r2-finish UNIT u8compbind-r2-finish DONE 32c1006b6dbb1ee514db863977a38d265904a426
