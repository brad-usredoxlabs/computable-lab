# L2-VACUOUS-PINS-DEBT — scopelock-1 Report

## Task
Fix the 3 RED pins in `server/src/materials/termId.scopeLock.test.ts` by:
(a) Rewording 5 comment-only `canonicalLabelKey` mentions in two app/ TEST files
(b) Adding two legitimate server-side test files to the allow-list

## RED Baseline (raw output)
```
RUN  v1.6.1 /home/brad/cl-wt/L2-SCOPELOCK-DEBT-lane2/server

 ❯ src/materials/termId.scopeLock.test.ts  (3 tests | 3 failed) 7ms
   ❯ ZERO occurrences anywhere under app/ ... unexpected: app/src/event-editor/right-pane/ai/ClarificationPicker.mintseed.card1.test.tsx, app/src/shared/hooks/useAiChat.card1fix5.reloadBoundary.test.ts
   ❯ ZERO occurrences under app/src ... expected [ …(2) ] to deeply equal []
   ❯ the closed set of mentioners is exactly the ruling allow-list ... unexpected: app/src/event-editor/right-pane/ai/ClarificationPicker.mintseed.card1.test.tsx, app/src/shared/hooks/useAiChat.card1fix5.reloadBoundary.test.ts, server/src/ai/shorthandChat.canonicalLabelFallback.test.ts, server/src/ai/shorthandChat.mintBlobLabel.test.ts

 Test Files  1 failed (1)
      Tests  3 failed (3)
```

## Changes Made

### Commit 1 — Reword 5 comment mentions in app/ files
- `app/src/event-editor/right-pane/ai/ClarificationPicker.mintseed.card1.test.tsx` — 5 comment lines replaced `canonicalLabelKey` with `the server's canonical-label fold`:
  - Line 69: `canonicalLabelKey(label)` → `the server's canonical-label fold`
  - Line 75: `canonicalLabelKey` → `the server's canonical-label fold`
  - Line 86: `canonicalLabelKey of the raw label` → `the server's canonical-label fold of the raw label`
  - Line 115: `(canonicalLabelKey)` → `(the server's canonical-label fold)`
  - Line 188: `(canonicalLabelKey trims + folds` → `(the server's canonical-label fold trims + folds`
- `app/src/shared/hooks/useAiChat.card1fix5.reloadBoundary.test.ts` — 1 comment line:
  - Line 28: `` canonicalLabelKey(fact.label) `` → `the server's canonical-label fold of the fact label`

### Commit 2 — Allow-list two server-side tests in scopeLock test
- `server/src/materials/termId.scopeLock.test.ts`:
  - Updated doc comment (lines 64-67): added `+ server-side tests added after l2t1430 that import the key`
  - Added two entries to ALLOWED set before `]);`:
    - `'server/src/ai/shorthandChat.canonicalLabelFallback.test.ts'`
    - `'server/src/ai/shorthandChat.mintBlobLabel.test.ts'`
  - Added explanatory comment above the entries

## GREEN Verification (raw output)
```
RUN  v1.6.1 /home/brad/cl-wt/L2-SCOPELOCK-DEBT-lane2/server

 ✓ src/materials/termId.scopeLock.test.ts  (3 tests) 2ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  09:51:58
   Duration  1.20s (transform 31ms, setup 0ms, collect 102ms, tests 2ms, environment 0ms, prepare 698ms)
```

## Grep-0 Confirmations
- `grep -rn canonicalLabelKey app/ | wc -l` → 0
- `grep -c canonicalLabelKey ClarificationPicker.mintseed.card1.test.tsx` → 0
- `grep -c canonicalLabelKey useAiChat.card1fix5.reloadBoundary.test.ts` → 0

## Per-File Diff Stat (HEAD~2)
```
.../right-pane/ai/ClarificationPicker.mintseed.card1.test.tsx  | 10 +++++-----
.../shared/hooks/useAiChat.card1fix5.reloadBoundary.test.ts    |  2 +-
server/src/materials/termId.scopeLock.test.ts                  |  6 +++++-
3 files changed, 11 insertions(+), 7 deletions(-)
```

## Commits
1. `456f82c1` — scopelock debt: reword comment-only canonicalLabelKey mentions in app tests (0 code change)
2. `a42c2adf` — scopelock: allow-list shorthandChat.canonicalLabelFallback/mintBlobLabel server tests

UNIT scopelock-1 DONE a42c2adf1c04c66d1525c3039fe847eddbf791bc
