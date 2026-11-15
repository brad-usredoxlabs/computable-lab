# L2-HARNESS-MAINT-GHOSTTEST-1 / u1 — ghosttest-mock-export

Lane 2, unit u1 of 1. Worktree /home/brad/cl-wt/L2-HARNESS-MAINT-GHOSTTEST-1-u1-lane2,
branch cl/lane2-harness-maint-ghosttest-u1-1152, base 477306907d8cfefea19b6562ab481182547b8621.

## What changed (exactly 1 file, +10 lines)

app/src/event-editor/deck/DeckSurfaceChat.ghost.test.tsx

1. Added the `useOptionalEventEditor` export to the wholesale `vi.mock('../EventEditorContext')`
   factory (the brief's one-export-line fix). It mirrors the existing `useEventEditor` mock in
   the same factory (mocks.state + the four action stubs). Real semantics at
   EventEditorContext.tsx:1733: returns the context value or null; the pane reads
   `editor?.state.selection?.wells` null-safely (HarnessChatPane.tsx:312-316), so the
   non-crashing mirror is the honest minimal export. No test in this file asserts
   null/absence semantics of this seam.

2. Deviation from the brief's literal "one added export line", recorded as an assumption
   per the harness-maint decision (APPROVAL POLICY 2026-11-02): the GREEN baseline could not
   be reached with only the useOptionalEventEditor export. After the mount fix, test 1
   ("...pane Apply applies them") failed at HarnessChatPane Apply with
   `TypeError: createRecord is not a function` (surfaced by the pane's honest refusal wall:
   "Apply failed — TypeError: createRecord is not a function"). Root cause: the shared adoption
   core (app/src/event-editor/deck/deckAdoption.ts, adoptStagedPreview step 2b —
   L2-P1-LABWARE-INSTANCE-RECORD-1) mints one labware-instance record per placed labware via
   `apiClient.createRecord` (labwareInstanceMint.ts:154 falls back to the real client seam
   when no dep is injected), and this test's wholesale `vi.mock('../../shared/api/client')`
   exported only `getRecord` + `getPromptTemplate` — same defect class as the existing
   `listThreads` comment at ~:123 ("an unexported named import throws at the pane's mount"),
   here at the mint call. Fix: added `createRecord: vi.fn().mockResolvedValue(undefined)` to
   the same mock. Test data carries no `recordCreations`, so `searchRecords` is never
   invoked (materializeAcceptedRecordCreations loops over an empty list) and was not added.

   Scope preserved: the only file touched is the owned test file; no product file, no YAML.

## Verification (all run on final commit e6918a39c5c25589e97b7d16fe196d465259e009)

1. `cd app && npx vitest run src/event-editor/deck/DeckSurfaceChat.ghost.test.tsx`
   - RED at trunk 477306907 (brief-measured): Test Files 1 failed (1); Tests 2 failed (2);
     thrown at HarnessChatPane.tsx:312 (useOptionalEventEditor is not a function).
   - Intermediate (export only): 1 passed | 1 failed — `createRecord is not a function`
     (defect 2 above).
   - GREEN at branch tip (run 07:02:46 EST, tree at the final commit):
     `Test Files  1 passed (1)` / `Tests  2 passed (2)` / Duration 3.63s.
     Full run log: /tmp/ghosttest-final.log (also /tmp/ghosttest-run1.log,
     /tmp/ghosttest-run2.log for the intermediate states).
2. `cd app && npx tsc --noEmit`
   - Baseline (trunk 477306907, measured by stashing this change): 17 pre-existing errors
     (ajv/yaml module-resolution in ../server + two unrelated test files).
   - At branch tip: the same 17 errors, none naming
     DeckSurfaceChat.ghost.test.tsx (grep -i ghost: no match). 0 new errors introduced.
     Logs: /tmp/tsc-baseline.log, /tmp/tsc-run.log.
3. `git diff --stat` vs base: `app/src/event-editor/deck/DeckSurfaceChat.ghost.test.tsx | 10 ++++++++` —
   exactly 1 file.

## Decisions / assumptions

- Mirrored useEventEditor's mock shape for useOptionalEventEditor (brief's recommended
  minimal export; pane consumption is null-safe, no null-assertion exists in this file).
- The createRecord mock addition is a same-class harness repair (wholesale-mock missing
  named member), recorded here as an assumption per the harness-maint category ruling; it
  does not change any assertion in the file — all assertions are the pre-existing ones.
- Output budget: files = 1 (limit 1), added lines = 10 (limit 10).

## Commit

- e6918a39c5c25589e97b7d16fe196d465259e009 — "ghosttest-mock-export
  (L2-HARNESS-MAINT-GHOSTTEST-1 u1): export useOptionalEventEditor from the
  EventEditorContext mock and createRecord from the apiClient mock so
  HarnessChatPane mounts and the Apply adoption path mints labware instances
  under the mock; 2/2 green"
- `git rev-parse HEAD` at write time: e6918a39c5c25589e97b7d16fe196d465259e009
- Tree clean after commit (`git status --porcelain` empty).

## Next actions

- None for the unit; acceptance review re-runs VERIFY 1-2 on the branch tip.

STATUS: complete

HARNESS-MAINT-GHOSTTEST DONE e6918a39c5c25589e97b7d16fe196d465259e009
L2-HARNESS-MAINT-GHOSTTEST-1-MAINT-GHOSTTEST-u1-20261115.txt UNIT L2-HARNESS-MAINT-GHOSTTEST-1 DONE e6918a39c5c25589e97b7d16fe196d465259e009
