# L1-RECORD-LOCK-GUARD-1 UNIT 2d Report

**Lane:** 1 | **Worktree:** /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-leg2-lane1-l1t1645
**Branch:** cl/lane1-recordlockguard-1-leg2-l1t1645
**Base SHA:** 36b7c59a (after unit 2c landed)

## Defects Fixed
- **D2:** Wire terminal half of lock — panel primes only content-locked set; `isRecordWriteLocked` had zero production consumers. Now fetches `getLifecycleTerminalStates` in parallel and derives `contentLocked` from `isRecordWriteLocked(formData, contentLockedStates, terminalStates)`.
- **D4:** Draft-revision success path dispatches `cl:records-changed` (mirroring the registry sibling), replacing the `setSavedAt(Date.now())` call.
- **D5:** Pin `disabled` prop — taptab mock records last props for assertion; locked test asserts `disabled === true`, unlocked asserts `disabled === false`.

## RED Phase (Commit A: 8a4a339c)
- Added `getLifecycleTerminalStates` mock to locked test
- Added disabled-pin assertions to locked/unlocked tests
- Added D2 test: terminal-but-not-content-locked state must hide Save and show draft-revision button
- Result: 1 test RED (D2 terminal-lock test — Save button present when it shouldn't be)

## GREEN Phase (Commit B: 51fdd9d3)
### Changes
**RecordEditPanel.tsx:**
- Imported `isRecordWriteLocked` from `../../shared/records/lifecycleLock`
- Added `contentLockedStates` and `terminalStates` state
- Derived `contentLocked` from `isRecordWriteLocked(formData, contentLockedStates, terminalStates)` instead of `isContentLocked`
- Fetch `apiClient.getLifecycleTerminalStates(lifecycleId)` in parallel with content-locked prime
- Draft revision handler dispatches `cl:records-changed` instead of `setSavedAt(Date.now())`

**RecordEditPanel.locked.test.tsx:**
- Added `getLifecycleTerminalStates` mock
- Added disabled-pin assertions in locked/unlocked tests
- Added D2 terminal-lock test
- Updated draft-button test to assert `cl:records-changed` dispatch (spy on `window.dispatchEvent`)

**RecordEditPanel.qms6e.test.tsx:**
- Added `getLifecycleTerminalStates` mock + empty-array resolution in beforeEach (required for compatibility)

## Verification Results
1. `vitest run RecordEditPanel.locked.test.tsx RecordEditPanel.qms6e.test.tsx`: 7 passed (3 qms6e + 4 locked)
2. `vitest run src/event-editor/create`: 23 passed across 4 test files
3. `npx tsc --noEmit -p .`: 12 errors, none in our files (matches baseline)
4. `grep "cl:records-changed"`: 2 sites (lines 138, 174)
5. `grep "isRecordWriteLocked|getLifecycleTerminalStates"`: both wired (lines 14, 50, 84)

## Changed Files
- `app/src/event-editor/create/RecordEditPanel.tsx`
- `app/src/event-editor/create/RecordEditPanel.locked.test.tsx`
- `app/src/event-editor/create/RecordEditPanel.qms6e.test.tsx`

## Commits
- A: `8a4a339c` — L1-RECORD-LOCK-GUARD-1 2d RED: terminal-lock + disabled pins
- B: `51fdd9d3` — L1-RECORD-LOCK-GUARD-1 2d: panel wires terminal lock, dispatches records-changed, pins disabled

L1-RECORD-LOCK-GUARD-1-LEG2D UNIT 2d DONE 51fdd9d33d0b8f952948ba91b7061aa5559cc2de
