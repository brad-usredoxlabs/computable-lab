# L2-SUBPROTOCOL-EXPAND-1 — unit u6binddoor FIX-1 Report

## Summary
Fixed one failing test by adding `kind: 'planned-run'` to the mock PLR payload so the router's draft branch matches.

## Changed Files
1. `app/src/graph/RunEditorRouter.test.tsx` — line 25: added `kind: 'planned-run'` to `mockPlrResp` payload.

## Code Commits
- ecfe0cc8 — u6binddoor: RED test pins route missing and resolution broken
- a6b1809f — u6binddoor: RunEditorRouter resolves run → PLR via getRecordWithUI
- d441682c — u6binddoor: register /runs/:runId/bindings route with lazy RunEditorRouter
- 01e4d871 — test: fix mock PLR payload to include kind for u6binddoor fix1

## Verification
- `npx vitest run src/graph/RunEditorRouter.test.tsx` → 2 passed (2) — GREEN
- `npx tsc -p tsconfig.json --noEmit` → 13 pre-existing TS errors, 0 new errors

L2-SUBPROTOCOL-EXPAND-1-u6binddoor-fix1 UNIT u6binddoor DONE 01e4d871f03360f55f6c276b2e95e4a75178573d
L2-SUBPROTOCOL-EXPAND-1-u6binddoor-fix1 UNIT u6binddoor DONE 6b9acfbb674e6d61102ea618202d1e77231fcadc

## fix2

### Summary
Thread the resolved PLR id through the router to BindingModeEditor (D3) and add the
run-toolbar link to role bindings (D1).

### Changed Files (3)
1. `app/src/graph/RunEditorRouter.tsx` — added `plannedRunId` state, thread to BindingModeEditor
2. `app/src/run/RunWorkspacePage.tsx` — added `hasPlannedRunRef` state + toolbar link
3. `app/src/graph/RunEditorRouter.test.tsx` — added PLR-77 threading pin test

### Code Commits
- d9907b05 — fix(lane2): RunEditorRouter passes the resolved PLR id to BindingModeEditor (u6binddoor-fix2 D3)
- afa58f3c — feat(lane2): run toolbar links to role bindings when the run has a planned-run (u6binddoor-fix2 D1)
- eb677a035505122dac39b62721a0c02c740440d0 — test(lane2): PLR-id threading pin GREEN (u6binddoor-fix2)

### Verification
- `npx vitest run src/graph/RunEditorRouter.test.tsx` → 3 passed — GREEN
- `npx tsc --noEmit` → 0 new errors (pre-existing only)
- `git diff --stat 12c8fc55..HEAD` → 3 files changed, 71 insertions(+), 4 deletions(-)

L2-SUBPROTO-u6binddoor-fix2 UNIT unit DONE eb677a035505122dac39b62721a0c02c740440d0

## fix3 (advc c2 D-1 + D-2)

### Summary
advc c2 demanded the bindings door read run/PLR records through `getRecordWithUI` instead of `/api/records/:id`. Five commits replaced direct API calls with the UI-aware resolver across BindingModeEditor and RunWorkspacePage.

### Commits (5)
- 17438e32 — fix(lane2): BindingModeEditor loads the PLR through getRecordWithUI (u6binddoor-fix3 D-2)
- 015bc868 — fix(lane2): BindingModeEditor loads its local protocol through getRecordWithUI (u6binddoor-fix3 D-2)
- 3cb217e8 — fix(lane2): run toolbar gate reads the run envelope via getRecordWithUI (u6binddoor-fix3 D-1)
- 3e5b217f — test(lane2): pin the bindings door to getRecordWithUI (u6binddoor-fix3)
- b4857538 — test(lane2): fix mock types for getRecordWithUI (u6binddoor-fix3)

### Changed Files (3)
1. `app/src/graph/BindingMode/BindingModeEditor.tsx` — commits 17438e32 + 015bc868: replaced `/api/records/:id` with `getRecordWithUI` for PLR and protocol reads (D-2)
2. `app/src/run/RunWorkspacePage.tsx` — commit 3cb217e8: toolbar gate reads run envelope via `getRecordWithUI` (D-1)
3. `app/src/graph/BindingMode/BindingModeEditor.test.tsx` — commits 3e5b217f + b4857538: pins the bindings door to `getRecordWithUI`; these pins were mutation-proven in the unit that wrote them (3e5b217f), not here

### Measured Diff
```
.../graph/BindingMode/BindingModeEditor.test.tsx   | 27 ++++++++++++++++++----
 app/src/graph/BindingMode/BindingModeEditor.tsx    |  8 ++++---
 app/src/run/RunWorkspacePage.tsx                   |  4 ++--
 3 files changed, 29 insertions(+), 10 deletions(-)
```

### Test Summary
`npx vitest run src/graph/BindingMode/BindingModeEditor.test.tsx src/graph/RunEditorRouter.test.tsx`
→ Test Files 2 passed (2), Tests 7 passed (7)

### Coverage Gap
No test pin exists for the RunWorkspacePage toolbar gate; the gc-section test is RED at HEAD because this delta's own RunWorkspacePage.tsx calls apiClient.getRecordWithUI but the mock in src/run/RunWorkspacePage.gc-section.test.tsx:87 only defined getRecord, so that suite fails with "apiClient.getRecordWithUI is not a function". The surface suite is GREEN — its mock at src/run/RunWorkspacePage.surface.test.tsx:27 does define getRecordWithUI. The D-1 gate was pinned in BindingModeEditor.test.tsx (asserts getRecordWithUI called AND getRecord not called), not in u6binddoorsibfix1 (which added mock entries only).

L2-SUBPROTOCOL-EXPAND-1-u6binddoorfix3pw UNIT u6binddoorfix3pw DONE edb76724b4b783b0500c320ddbcebae184f0011f

## sibfix1

### Summary
Two sibling test suites (compile.test.tsx and surface.test.tsx) fail because production code
uses `apiClient.getRecordWithUI` but the mocks only defined `getRecord`. Added
`getRecordWithUI` mock methods returning `{ record: ..., ui: undefined }` to both suites.

### Raw GREEN output (combined suite)
```
Test Files  2 passed (2)
      Tests  7 passed (7)
```

### Baseline GREEN (no regression)
```
Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Changed Files (2)
1. `app/src/graph/BindingMode/BindingModeEditor.compile.test.tsx` — added `getRecordWithUI` to mock object + mockImplementation
2. `app/src/run/RunWorkspacePage.surface.test.tsx` — added `getRecordWithUI` to mock object

### Code Commits
- ac2a2d1d — compile suite mock fix
- efe4088a — surface suite mock fix

L2-SUBPROTOCOL-EXPAND-1 UNIT u6binddoorsibfix1 DONE e6e3b2ee003a70966422a89f280995519fdd2470

## pinfix1

### Summary
The fix3 pin mounted `plannedRunId="PLR-1"`, which the mock did not recognise, so it drove a
`record: null` fallback — a shape `RecordWithUIResponse` cannot legally carry. The pin passed
only because its `waitFor` read the first-paint loading text before the rejection settled.
Fixed the mock to `throw new ApiError(...)` for unrecognised IDs, changed the pin to use the
recognised `"PLR-000001"` with a real post-load assertion (`Labware roles`), and added a new
rejection-arm test (`PLR-404`).

### Changed Files (1)
1. `app/src/graph/BindingMode/BindingModeEditor.test.tsx` — mock throws `ApiError` instead of
   returning `{ record: null }`; pin uses `PLR-000001` with `Labware roles` assertion; added
   `shows rejection message when planned-run is not found` test.

### Mutation Probes
- Probe A (vacuity): reverted mock to `record: null` cast → test "shows rejection message when planned-run is not found" RED (Unable to find an element with the text: /record not found: PLR-404/)
- Probe B (pin): reverted `toHaveBeenCalledWith` back to `'PLR-1'` → test "loads the planned-run through getRecordWithUI" RED (expected spy to be called with ['PLR-1'])

### Raw RED output (Probe A — vacuity proof)
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-SUBPROTO-u6binddoor-lane2/app

 ❯ src/graph/BindingMode/BindingModeEditor.test.tsx  (5 tests | 1 failed) 1577ms
   ❯ src/graph/BindingMode/BindingModeEditor.test.tsx > BindingModeEditor > shows rejection message when planned-run is not found

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Duration  14.57s (transform 146ms, setup 830ms, collect 1.95s, tests 1.58s, environment 7.76s, prepare 615ms)
```

### Raw RED output (Probe B — pin specificity)
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-SUBPROTO-u6binddoor-lane2/app

 ❯ src/graph/BindingMode/BindingModeEditor.test.tsx  (5 tests | 1 failed) 586ms
   ❯ src/graph/BindingMode/BindingModeEditor.test.tsx > BindingModeEditor > loads the planned-run through getRecordWithUI, not the 404-ing records arm

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Duration  2.23s (transform 105ms, setup 67ms, collect 207ms, tests 586ms, environment 619ms, prepare 243ms)
```

### Raw GREEN output (final)
```
Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  15:06:43
   Duration  11.40s (transform 140ms, setup 955ms, collect 324ms, tests 580ms, environment 7.45s, prepare 530ms)
```

### Closeout — u6binddoorpinfix1 exit marker
The pinfix1 run ended `exit_marker: missing` with the report left dirty (launcher log
coder-u6bdpinfix1-l2t1450.log:5, returncode 0, dirty file = this report), so the launcher
auto-committed it as WIP 3b9aa17e. Code and section unchanged by this unit; marker added below.
Re-verified at 3b9aa17e: 3 suites / 12 tests PASSED.

Scanner BEFORE this unit, from the worktree root:
```
$ python3 -c "import sys;sys.path.insert(0,'/home/brad/.hermes/cl/scripts');import cl_marker_scan as s;print(s.find_marker('.','L2-SUBPROTOCOL-EXPAND-1-u6binddoorpinfix1pw'))"
('missing', '')
```

L2-SUBPROTOCOL-EXPAND-1-u6binddoorpinfix1pw UNIT u6binddoorpinfix1pw DONE 7ce108112de03539f5336cadc9d416e66e091e49

## fix3b

### Summary
fix3 moved `BindingModeEditor.tsx:108/:121` and `RunWorkspacePage.tsx:69` onto
`apiClient.getRecordWithUI`. The sibling suites' `apiClient` mock factories had no such key, so
both collapsed on `TypeError: apiClient.getRecordWithUI is not a function`. The production read
arms are correct (advc c4 D-1) and were left untouched. At this unit's start HEAD f38cb217 the
suites ran green, but ONLY because sibfix1 had added the key with a contract-wrong body
(`{ record, ui: undefined }`): that shape omits the `uiSpec`/`schema` members of
`RecordWithUIResponse` (types/uiSpec.ts:150-159) and raised
`TS2345 ... missing the following properties from type 'RecordWithUIResponse': uiSpec, schema`
at BindingModeEditor.compile.test.tsx:131. This unit replaces both mock bodies with the real
envelope shape, keeping the suites' existing fixtures (mockPlannedRun, mockLocalProtocol, and the
surface suite's RUN-1 payload) and adding only envelope metadata.

### Changed Files (2 code + this report)
1. `app/src/graph/BindingMode/BindingModeEditor.compile.test.tsx` — `getRecordWithUI`
   mockImplementation now returns `{ record: mockPlannedRun, uiSpec: null, schema: null }` /
   `{ record: mockLocalProtocol, uiSpec: null, schema: null }` (was `ui: undefined`).
2. `app/src/run/RunWorkspacePage.surface.test.tsx` — `getRecordWithUI` mock now returns
   `{ record: { recordId: 'RUN-1', schemaId: 'run', payload: <same payload getRecord already
   returns> }, uiSpec: null, schema: null }` (was `{ record: { payload }, ui: undefined }`).
No production file, shared client/type, or other test file was modified.

### Raw RED (M1 mutation — key deleted from RunWorkspacePage.surface.test.tsx)
```
TypeError: __vite_ssr_import_22__.apiClient.getRecordWithUI is not a function
     -> apiClient.getRecordWithUI is not a function
 Failed Tests 1
TypeError: apiClient.getRecordWithUI is not a function
 Test Files  1 failed (1)
      Tests  1 failed (1)
```
Restore proof: sha256 `8d34160f3dfff9609c7a69a1ea3be62f479e859a26fd6328f135fcb4d275ab93` before and
after the mutation (byte-identical restore).

### Raw GREEN (targeted; cwd app)
```
 ✓ src/run/RunWorkspacePage.surface.test.tsx  (1 test) 247ms
 ✓ src/graph/BindingMode/BindingModeEditor.compile.test.tsx  (6 tests) 8102ms
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

### tsc
`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` -> 13 error lines (environmental
baseline: prosemirror-view / ajv / yaml / @types/node), zero lines naming an owned file. The
pre-fix owned-file `TS2345` at compile.test.tsx:131 is gone.

### Commits
- 08841eeb — u6binddoor-fix3b code (both mock bodies)

L2-SUBPROTOCOL-EXPAND-1 UNIT u6binddoor-fix3b DONE 0d9cf642b483b99e4b03444b799d9a740f53df1b
L2-SUBPROTOCOL-EXPAND-1 UNIT u6binddoorpw DONE 25e0e7b41bc5e7e899f66799a38f23095310be0f
