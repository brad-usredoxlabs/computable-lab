# RECORD-LOCK-GUARD-1 LEG2fb - Unit 2f-b Report

## Task
Fix DEFECT 2 and DEFECT 5 in RecordEditPanel.tsx to make the two committed RED tests pass.

## Changes
File: app/src/event-editor/create/RecordEditPanel.tsx

### DEFECT 2: Terminal fetch rejects but content-locked resolves -> locked UI still locks
- Split the single Promise.all into two independent promise chains
- Each chain has .catch so a failure in one half degrades only that half (empty array)
- Both setState arms still land for their respective halves

### DEFECT 5: Save button disabled while lock facts load (transient fail-open guard)
- Added state: const [lockPending, setLockPending] = useState(false)
- setLockPending(true) fires before the independent chains start
- Counter-based lockDone decrements; when both chains settle (resolve or reject),
  setLockPending(false) fires
- Added || lockPending to Save button disabled expression

## Verification Results

### 1. RED baseline (before fix): 2 failed | 4 passed (confirmed)

### 2. GREEN (after fix):
Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  03:50:12
   Duration  1.49s (transform 112ms, setup 79ms, collect 174ms, tests 60ms, environment 350ms, prepare 150ms)

### 3. Regression:
Start at  03:50:15
   Duration  10.84s (transform 697ms, setup 254ms, collect 4.65s, tests 7.07s, environment 3.76s, prepare 885ms)

### 4. TypeScript:
src/ingestion/components/IngestionUploadModal.tsx(232,23): error TS2554: Expected 2 arguments, but got 1.
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19): error TS6133: 'fireEvent' is declared but its value is never read.
Note: errors are pre-existing in unrelated files

## Commit
sha: 386260411b67bc28ff5a52893b968baf55519ac4
Message: "unit 2f-b: fix DEFECT 2 and DEFECT 5 in RecordEditPanel"

L1-RECORD-LOCK-GUARD-1-LEG2FB UNIT 2f-b DONE a1d4856828adf1182c6df2cc3fc0bc57d5456fef
