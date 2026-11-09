# LEG 2b-i Completion Report — RECORD-LOCK-GUARD-1

## Context
LEG 2b-i continuation after appliance-2 model-swap 404. Architect WIP preserved at 814529d7:
cache module complete, protocol-test priming committed, 4 pin tests written but 2 RED
due to stub-lifecycle bug (beforeAll + afterEach unstub).

## What Was Fixed

### 1. Cache pin stub-lifecycle bug
- **File**: app/src/shared/records/contentLockedStatesCache.test.ts
- **Change**: `beforeAll` -> `beforeEach`, import `beforeEach` instead of `beforeAll`
- **Reason**: afterEach unstubGlobal removed fetch mock after test 1, so tests 3-4
  ran against real fetch. Moving stub install to beforeEach ensures every test
  gets a fresh stub.
- **Result**: 4/4 pins GREEN

### 2. Protocol gate swap (2 gates)
- **File**: app/src/event-editor/right-pane/protocol/protocolStepEditing.ts
- **Change**: Lines 45 and 102 swapped from hardcoded
  `['approved','effective','superseded','archived'].includes(String(payload.state))`
  to `isContentLocked(payload, getContentLockedStatesSync(String(payload.lifecycleId)))`
- **Added imports**: isContentLocked and getContentLockedStatesSync
- **Type fix**: Wrapped payload.lifecycleId in String() for TS compatibility
- **Result**: Zero 'approved' references in protocolStepEditing.ts

### 3. Cache seeding in affected tests
- **Files**: protocolEditOps.test.ts, ProtocolStepEditModal.test.tsx
- **Change**: Added import + seedContentLockedStates('document-controlled-signing', ['effective'])
- **Reason**: Gate swap caused 2 test failures because cache was unseeded,
  making isContentLocked return false for 'effective' state
- **Result**: All 219 protocol tests GREEN

## RAW Verify

```
$ cd app && npx vitest run src/shared/records
✓ 9 tests GREEN (4 pins + 5 lifecycleLock)

$ cd app && npx vitest run src/event-editor/right-pane/protocol
✓ 219 tests GREEN (28 files)

$ cd app && npx tsc --noEmit | grep -c 'error TS'
12 (pre-existing; zero in touched files)

$ grep -c approved app/src/event-editor/right-pane/protocol/protocolStepEditing.ts
0 (baseline was 2)

$ git -c core.fileMode=false status --porcelain --untracked-files=no
(empty — clean exit)

$ git -c core.fileMode=false diff 814529d7..HEAD --name-only
app/src/event-editor/right-pane/protocol/ProtocolStepEditModal.test.tsx
app/src/event-editor/right-pane/protocol/protocolEditOps.test.ts
app/src/event-editor/right-pane/protocol/protocolStepEditing.ts
app/src/shared/records/contentLockedStatesCache.test.ts
```

## Commits
5e4b1a2a LEG2b-i GREEN: cache pins stub-lifecycle fix
05229b15 LEG2b-i: protocol gates read the declared set

RECORD-LOCK-GUARD-1-LEG2b-i DONE 05229b15
