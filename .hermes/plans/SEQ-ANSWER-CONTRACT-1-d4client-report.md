# SEQ-ANSWER-CONTRACT-1 d4client — Report

## Decision
Added ONE `answerDelivered` predicate derived from per-turn `accumulated` text_delta deltas
(trimmed, non-empty) and gated BOTH the honestWall guard and the bubble guard on it.

## Changed Files
- app/src/shared/hooks/useAiChat.ts (+11 lines, -2 lines)
- app/src/shared/hooks/useAiChat.answerSurface.test.tsx (new, 151 lines)

## RED-first pin output (commit 78b239da, before fix)
```
FAIL src/shared/hooks/useAiChat.answerSurface.test.tsx > D4: answer-delivered suppression > P1 — text_delta + empty done
AssertionError: expected true to be false // Object.is equality
- Expected: false
+ Received: true
at :63:8 (expect bubble absent → false, got true)
```

## GREEN after fix (commit fde752a6)
```
✓ src/shared/hooks/useAiChat.answerSurface.test.tsx (5 tests)
P1-P5 all pass
```

## Mutation verification (delete !answerDelivered from :1936 bubble guard)
P1 goes RED again:
```
× P1 — text_delta + empty done: no false bubble, no honestWall, answer preserved
AssertionError: expected true to be false
```
Restored → P1 GREEN. The guard is necessary.

## Verification commands and results

### Targeted run (3 files)
```
cd app && npx vitest run src/shared/hooks/useAiChat.answerSurface.test.tsx src/shared/hooks/useAiChat.d3uifix1.test.tsx src/shared/hooks/useAiChat.navuifix2.test.tsx
→ 3 files, 11 tests, 0 failed
```

### Regression sweep (2 files)
```
cd app && npx vitest run src/shared/hooks/useAiChat.wall.test.tsx src/shared/hooks/useAiChat.channelEnvelopes.test.tsx
→ 2 files, 10 tests, 0 failed
```

### Tree status
```
git status --short → clean
git diff --stat 120deaeb..HEAD → 2 files, 162 insertions, 2 deletions
```

SEQ-ANSWER-CONTRACT-1-d4client UNIT unit DONE 5d1a3c2bd4322010aa1e400feeed81cb1e79dc0c
SEQ-ANSWER-CONTRACT-1-d4fix1 UNIT unit DONE 5d1a3c2bd4322010aa1e400feeed81cb1e79dc0c
