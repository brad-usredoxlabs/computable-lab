# L2-SUBPROTOCOL-EXPAND-1 — unit u6planmount (7 of 8)

Worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-u6planmount-lane2
Branch:   cl/lane2-subproto-u6planmount-1441
Base:     8869e8f2c98168c9fcc4e9a8dced0cf8263f3766
Tier:     normal

## Decision

The brief's premise held first-hand at base 8869e8f2: the plan-graph build door
ALREADY exists on the ROUTED surface.

- `app/src/run/RunWorkspacePage.tsx:233` — `<RunPlanGraphBuild runId={runId} />`
  inside `viewerToolbar`, which renders in Plan (default) as well as Execute.
- `app/src/run/RunPlanGraphBuild.tsx:84` — `data-testid="run-build-plan-graph"`;
  `:59` calls `apiClient.buildPlanGraph(plannedRunId)`; `:75` renders nothing
  when no planned-run id resolves.

Therefore NO product change was made. The page file was touched ONLY as the
mutation probe (line 233 deleted, test went RED, then `git checkout --` to
restore). Step 3's conditional mount change was not needed: step 1 went GREEN
on reachability at base, and the mutation proves the pin is non-vacuous.

`b128ddf8` (branch `cl/lane2-subproto-u6buildui2-1410`) is SUPERSEDED — do not
merge; its two shipped files duplicate RunPlanGraphBuild (be8e6a4b, 2026-11-10).
The dead page `app/src/graph/RunWorkspacePage.tsx:127` (zero importers) was not
touched or resurrected.

## Changed files (1)

- `app/src/run/RunWorkspacePage.planbuild.test.tsx` (NEW, 148 lines) — route-level
  lock. Mounts the ROUTED page (`/runs/RUN-1` → `RunWorkspacePage`) with the
  surface-test provider stack (MemoryRouter > OpenTabsProvider > ThemeProvider >
  AiPanelProvider). Real `ModeToggle` + real `RunPlanGraphBuild`; deck/chat/nav
  children stubbed inert.
  - leg (1): record with `plannedRunRef.id = 'PLRUN-7'` → `run-build-plan-graph`
    present while the Plan pane (`DeckViewer`) is mounted and the Design toggle
    is `aria-pressed=true` / Execute `false`; one click → `buildPlanGraph` called
    exactly once with `'PLRUN-7'`, returned `EG-BUILT-9` rendered.
  - leg (2): `kind: 'run'` with NO `plannedRunRef` → after all three mount reads
    settle, `queryByTestId('run-build-plan-graph')` is null (no dead control).

## Verification (raw)

Targeted: `cd app && npx vitest run src/run/RunWorkspacePage.planbuild.test.tsx`
```
 ✓ src/run/RunWorkspacePage.planbuild.test.tsx  (2 tests) 154ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Existing pins: `cd app && npx vitest run src/run/RunWorkspacePage.surface.test.tsx src/run/RunPlanGraphBuild.test.tsx`
```
 ✓ src/run/RunWorkspacePage.surface.test.tsx  (1 test) 502ms
 Test Files  2 passed (2)
      Tests  9 passed (9)
```
(matches the measured base baseline: 2 files / 9 tests)

MUTATION PROBE (line 233 `<RunPlanGraphBuild runId={runId} />` deleted):
```
 → Unable to find an element by: [data-testid="run-build-plan-graph"]
 FAIL  src/run/RunWorkspacePage.planbuild.test.tsx > ... > (1) Plan/Design is the default surface and the control builds the planned run graph
TestingLibraryElementError: Unable to find an element by: [data-testid="run-build-plan-graph"]
 FAIL  src/run/RunWorkspacePage.planbuild.test.tsx > ... > (2) a run with NO plannedRunRef renders NO control (no dead control)
      Tests  2 failed (2)
```
Reverted with `git checkout -- app/src/run/RunWorkspacePage.tsx`; `git status`
showed ONLY the new untracked test file before commit.

Typecheck (optional; no signature changed, run once anyway):
`cd app && npx tsc --noEmit` → 14 pre-existing error lines in THIS worktree
(`ajv`/`yaml`/`prosemirror-view` module-resolution + RefCombobox family; the
brief's 6-line baseline was measured with a different node_modules layout).
Proven zero delta by moving the new test file aside and re-running: the sorted
error list is byte-identical → `ZERO ERROR DELTA` (14 vs 14, no line from the
new file).

Tree at exit: clean (single commit), scratch dir deleted.

## Acceptance state

AC1/AC2/AC3 are route-level properties now pinned in code; the independent
browser gate still owns acceptance on :5193 (no lane-stack reload is required —
no YAML and no product change). AC3 (exactly one door) is also guaranteed by the
prohibited-file list: the duplicate branch `b128ddf8` is not merged and
`app/src/graph/**` is untouched, so only one `run-build-plan-graph` element can
exist on the page.

## Next actions

- Browser reviewer: grade AC1/AC2/AC3 on the routed `/runs/<run with plannedRunRef>`
  surface of lane 2 (:5193).

Commit (the change under review, test file): 49c690e7608efa9306b382b30891f7dbb17e8239
(`git rev-parse HEAD` output at the time this report was written; `git cat-file -t`
→ `commit`). This report is committed in the immediately following report-only
commit "u6planmount: deliverable report" (no product or test content in it).

L2-SUBPROTOCOL-EXPAND-1 UNIT 7 DONE 49c690e7608efa9306b382b30891f7dbb17e8239
L2-SUBPROTOCOL-EXPAND-1-u6planmount UNIT unit DONE 49c690e7608efa9306b382b30891f7dbb17e8239
