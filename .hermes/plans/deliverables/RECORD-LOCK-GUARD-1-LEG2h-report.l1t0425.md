# L1-RECORD-LOCK-GUARD-1-LEG2H — Unit 2h Report

## Task
advc c2 DEFECT 4 (MAJOR, test strength): the two production priming wires have ZERO coverage. Each suite seeds the cache at module scope so the prime is a cache hit and the fetch is unreachable. Add ONE pin per consumer, test files only.

## Changed Files (2 test files, 0 production)
1. `app/src/event-editor/right-pane/protocol/ProtocolStepEditModal.test.tsx` (+14 lines)
   - Added import `__resetContentLockedStatesCache`
   - Added `getLifecycleContentLockedStates: vi.fn()` to vi.mock factory
   - Added test case: `primes content-lock cache via getLifecycleContentLockedStates when the record carries lifecycleId`

2. `app/src/event-editor/right-pane/protocol/applyDraftProtocolEdit.test.ts` (+21 lines)
   - Added `getLifecycleContentLockedStatesMock` hoisted mock
   - Added `getLifecycleContentLockedStates` to vi.mock factory
   - Added import `__resetContentLockedStatesCache`
   - Added test case: `primes the content-lock cache via getLifecycleContentLockedStates when the draft body carries lifecycleId`

## Baselines
- ProtocolStepEditModal.test.tsx: 7 passed
- applyDraftProtocolEdit.test.ts: 9 passed
- TSC errors: 12 (pre-existing, none in changed files)

## After Test Edits
- ProtocolStepEditModal.test.tsx: 8 passed (7 + 1 new)
- applyDraftProtocolEdit.test.ts: 10 passed (9 + 1 new)
- TSC errors: 12 (unchanged)

## Mutation Pair — RAW Outputs

### Mutation 1: Commented ProtocolStepEditModal.tsx:59 (`if (lid) await primeContentLockedStates(lid)`)
```
 ❯ src/event-editor/right-pane/protocol/ProtocolStepEditModal.test.tsx  (8 tests | 1 failed) 1215ms
            ×
            ×
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
EXIT CODE: 1
```
Result: FAIL — the new pin test fails when the wire is removed. ✓

### Mutation 2: Commented applyDraftProtocolEdit.ts:134 (`if (lockLid) await primeContentLockedStates(lockLid)`)
```
 ❯ src/event-editor/right-pane/protocol/applyDraftProtocolEdit.test.ts  (10 tests | 1 failed) 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
EXIT CODE: 1
```
Result: FAIL — the new pin test fails when the wire is removed. ✓

### After Restoring Both Wires
- ProtocolStepEditModal.test.tsx: 8 passed
- applyDraftProtocolEdit.test.ts: 10 passed
- Both suites GREEN

## Verification Commands
1. `cd /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-leg2-lane1-l1t1645/app && npx vitest run src/event-editor/right-pane/protocol/ProtocolStepEditModal.test.tsx 2>&1 | tail -4` — 8 passed ✓
2. `npx vitest run src/event-editor/right-pane/protocol/applyDraftProtocolEdit.test.ts 2>&1 | tail -4` — 10 passed ✓
3. `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` — 12 (pre-existing) ✓
4. Mutation pair: both suites FAIL when respective wire commented, GREEN when restored ✓

## Test Case Design
Both cases follow the reference shape from `protocolEditOps.test.ts` (commit f9054f6f):
- Call `__resetContentLockedStatesCache()` to clear any module-scope seed
- Stub `getLifecycleContentLockedStates` to resolve the declared set
- Assert `toHaveBeenCalledWith(lifecycleId)`
- Assert the consumer's happy path still completes

The Modal case is placed LAST in its describe block to avoid starving earlier seeded cases (the reset clears the module-scope seed, but `beforeEach` resets mocks; since it's last, no subsequent test is affected). The applyDraft case is also LAST in its describe block for the same reason.

## Commit
a9470fb8 L1-RECORD-LOCK-GUARD-1-LEG2H unit 2h: consumer priming pins (a) Modal + (b) applyDraftProtocolEdit

L1-RECORD-LOCK-GUARD-1-LEG2H UNIT 2h DONE b4a37c892605727ce000438db869499387738413
