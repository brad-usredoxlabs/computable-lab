# L2-SUBPROTOCOL-EXPAND-1 — u6buildui report

Worktree: /home/brad/cl-wt/L2-SUBPROTO-u6buildui2-lane2
Branch: cl/lane2-subproto-u6buildui2-1410
Base: b73ec3968370a073e00cd77027e93dd4b31c718b

## What changed (2 files, frontend-only seam)

1. `app/src/graph/run-workspace/RunPlanTab.tsx`
   - New `build` handler mirroring `promote`: guards on `plannedRunId`, sets
     `busyId('build')`, clears error/message, calls
     `apiClient.buildPlanGraph(plannedRunId)`, sets
     `Run graph <graphId>[ (reused)]`, `await onRefresh?.()`, catches into
     `setActionError` ("Failed to build run graph" fallback), clears `busyId`.
   - New button in the Run Method card, immediately before the promote button:
     `data-testid="run-plan-build-graph"`, label "Build run graph",
     `disabled={!plannedRunId || busyId === 'build'}`,
     `onClick={() => void build()}`. Existing status/error lines are reused; no
     new props, no navigation, no routing change.

2. `app/src/graph/run-workspace/RunPlanTab.test.tsx` (new, 3 tests)
   - enabled + `buildPlanGraph('PLRUN-7')` called + `Run graph GRAPH-42` shown;
   - disabled and no call when `plannedRunRef` absent ('None' rows rendered);
   - `reused: true` surfaces `Run graph GRAPH-42 (reused)`.

No server, client, schema, routing, or lifecycle files touched.
`grep -c buildPlanGraph app/src/graph/run-workspace/RunPlanTab.tsx` was 0 (RED); now 1.

## VERIFY results (measured in this worktree)

1. `cd app && npx vitest run src/graph/run-workspace/RunPlanTab.test.tsx`
   → Test Files 1 passed (1), Tests 3 passed (3).
2. `cd app && npx vitest run src/graph/run-workspace/ src/graph/BindingMode/`
   → Test Files 7 passed (7), Tests 47 passed (47). No regressions.
3. `cd app && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`
   → 14 pre-existing errors, all in untouched files and all
   dependency-resolution/witness noise (missing `yaml`, `ajv/dist/2020.js`,
   `prosemirror-view`; unrelated taptab/RecordCreatePanel test typings).
   ZERO errors in `app/src/graph/run-workspace/**` — grep for `run-workspace`
   and `RunPlanTab` in the tsc output = no matches. Note: the brief's
   "baseline 0" does not hold in this fresh worktree because the lane-2
   node_modules symlink quirk leaves some deps unresolved; the failures are
   present at base and unrelated to this unit. `npx tsc` from the repo root
   resolves nothing (typescript not installed at root) — app-local binary used.

## Deviations

- Test fixture builds `RunWorkspaceResponse` via a minimal
  `{ run: { schemaId, recordId, payload } }` cast instead of a full envelope;
  keeps the test within the 120-line budget and pins only the seam.
- `screen.getAllByText('None')` used because Event graph / Local protocol rows
  also render 'None'.

Commits:
- 4fa477ca component change
- 4b714d32 test file
- (this report committed last)
