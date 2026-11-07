# SEQ-ANSWER-CONTRACT-1 — Unit 1 fix run 2 Report

**Lane**: 2
**Worktree**: /home/brad/cl-wt/wt-SEQANSWER-u1answer
**Branch**: cl/lane2-seqanswer-1-u1answer
**Adversarial review**: /home/brad/advreviews/SEQANSWER-u1fix1-advreview-c2-20261107T101811Z.md (VERDICT: fix, 3 minor)

## Defects resolved

### F1 — Dead code: unreachable `answer` arm (MINOR)

`server/src/ai/submitSuggestionTool.ts` lines 908 and 952-956 contained code that could never execute:
- The `parseAgentIntentArgs` function early-returns for `intent === 'answer'` at lines 900-907 (fail-closed path).
- The `|| intent === 'answer'` tail on the big-list branch at line 908 and the conditional `text` spread at lines 952-956 are therefore dead.
- Evidence: adversarial mutation (b) — removing both stayed 23/23 GREEN.

**Fix**: Removed `|| intent === 'answer'` from line 908 and deleted the 5-line conditional spread block (lines 952-956). Text retention for `answer` intent is handled exclusively by the early-return path at lines 900-907.

**Commit**: f2681ff3

### F2 — Unused imports (MINOR)

`server/src/ai/AgentOrchestrator.answerIntent.test.ts:3` imported `AGENT_INTENT_TOOL_DEF` and `parseAgentIntentArgs` but neither symbol was used in the file. Only `AGENT_INTENT_TOOL_NAME` is referenced (at line 28).

**Fix**: Trimmed import to `import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';`.

### F3 — D7 guard unpinned (MINOR)

The prior cycle removed a guard (`if (text && text.length > 0)`) around `text_delta` in `AgentOrchestrator.ts` (lines 4110-4114), but no test discriminated between guarded and unguarded behavior. The adversarial reviewer's mutation (c2) — restoring the guard while keeping the fixed event order — stayed GREEN.

**Root cause**: The guard is behaviorally inert under the parser contract. `parseAgentIntentArgs` fail-closes empty/whitespace text to `unknown` (lines 900-907), so no `answer` intent with empty text ever reaches the `AgentOrchestrator` branch. Restoring the guard stays GREEN because no input reaches it with empty text.

**Fix**: Added one `it(...)` test pinning the observable contract at the orchestrator seam:
- `{intent: 'answer', text: 'x'}` → exactly one `text_delta` with `delta === 'x'` (single-char proves no trim/transform)
- `{intent: 'answer', text: ''}` → zero `text_delta` events (falls to unknown path via parser fail-close)

This indirectly pins the guard's absence: the parser contract ensures empty text never reaches the answer branch, making a direct guard pin unnecessary and impossible to distinguish.

**Commit**: 75965a2d

## Verification

### Tests
```
cd /home/brad/cl-wt/wt-SEQANSWER-u1answer/server
npx vitest run src/ai/submitSuggestionTool.test.ts src/ai/AgentOrchestrator.answerIntent.test.ts

✓ src/ai/submitSuggestionTool.test.ts  (22 tests)
✓ src/ai/AgentOrchestrator.answerIntent.test.ts  (2 tests)
Test Files  2 passed (2)
     Tests  24 passed (24)
```

Baseline: 23 passed. After fix: 24 passed (+1 new test for F3).

### Typecheck
```
npx tsc --noEmit
```
Only the pre-existing S3StorageProvider TS2307 error (unrelated, present before these changes).

### Mutation proof (F1)
The removed `|| intent === 'answer'` arm and conditional spread are dead code. Restoring them would not change test behavior — confirmed by adversarial cycle 2 mutation (b). The cut is correct: text retention for `answer` runs through the early-return path.

### Changed files
1. `server/src/ai/submitSuggestionTool.ts` — F1: removed 6 lines (1 edited, 5 deleted)
2. `server/src/ai/AgentOrchestrator.answerIntent.test.ts` — F2: 1 line trimmed; F3: +48 lines (1 new test)

### D7 claim correction
The report from fix run 1 claimed D7 (guard removal) was resolved. This run corrects that claim: the guard's absence is pinned indirectly via the parser fail-closed contract, not directly. A direct guard pin is impossible because `parseAgentIntentArgs` ensures empty text never produces an `answer` intent. The reviewer's mutation (restoring the guard) stays GREEN because no input reaches the branch with empty text.

SEQ-ANSWER-CONTRACT-1-u1fix2 UNIT 1 DONE 1152fe69fe56f702a02678185237afeb7a8dfbf4
