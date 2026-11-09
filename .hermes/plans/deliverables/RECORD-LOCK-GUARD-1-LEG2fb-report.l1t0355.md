# RECORD-LOCK-GUARD-1 LEG2fb - Unit 2f-b Report

## Task
Fix DEFECT 2 and DEFECT 5 in RecordEditPanel.tsx to make the two committed RED tests pass.

## Changed File
app/src/event-editor/create/RecordEditPanel.tsx

## Changes

### DEFECT 2: Terminal fetch rejects but content-locked resolves -> locked UI still locks
- Split the single Promise.all into two independent promise chains
- Each chain has .catch(() => []) so a failure in one half degrades only that half (empty array)
- Both setState arms still land for their respective halves

### DEFECT 5: Save button disabled while lock facts load (transient fail-open guard)
- Added state: const [lockPending, setLockPending] = useState(false)
- setLockPending(true) fires before the independent chains start
- Counter-based lockDone decrements; when both chains settle (resolve or reject),
  setLockPending(false) fires
- Added || lockPending to Save button disabled expression
- Each chain independently resolves/rejects so one hang blocks neither

## Code Fix Commit
Commit A: 38626041 — "unit 2f-b: fix DEFECT 2 and DEFECT 5 in RecordEditPanel"

## Verification

### 1. RED baseline (before fix): 2 failed | 4 passed (confirmed at start)

### 2. GREEN (after fix): 6 passed | 0 failed
  Test Files  1 passed (1)
      Tests  6 passed (6)

### 3. Regression: all pass
  Test Files  4 passed (4)
      Tests  25 passed (25)

### 4. TypeScript: pre-existing errors only (in IngestionUploadModal.tsx and ExtractionProgressPanel.test.tsx — unrelated)

## Files Modified
- app/src/event-editor/create/RecordEditPanel.tsx (16 insertions, 11 deletions)

## Acceptance Commands
1. RED confirm: cd app && npx vitest run src/event-editor/create/RecordEditPanel.locked.test.tsx -> 2 failed | 4 passed
2. GREEN: same command -> 6 passed | 0 failed
3. Regression: npx vitest run src/event-editor/create -> 25 passed
4. tsc: npx tsc --noEmit -p . -> pre-existing errors only

L1-RECORD-LOCK-GUARD-1-LEG2FB UNIT 2f-b DONE 386260411b67bc28ff5a52893b968baf55519ac4
