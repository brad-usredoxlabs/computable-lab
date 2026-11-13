# L2-SUBPROTOCOL-EXPAND-1 / unit d3loadpath — coder report

- worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-d3loadpath-lane2
- branch: cl/lane2-subproto-d3loadpath-1456
- base: f4987dc77de47044a287de7ca3c2c49fcf185b50
- Defect fixed: g4 browser-gate defect **D-3** (read path only): `apiClient.loadEventGraph`
  asked `/records/:id`, which 404s for per-run plan graphs filed under
  `records/runs/<run>/event-graphs/`, so a run's own plan graph was reported as
  "does not exist yet" even though `GET /ui/record/:id` returned its envelope.
  **D-6 is a different seam and is NOT touched**: the compile path that writes an
  empty plan graph and repoints `PLR.methodEventGraphId` is unchanged by this unit.

## Changed files (owned set only, 2 files)

1. `app/src/shared/api/client.ts` — ONLY the body of `loadEventGraph` (:2801-:2843 region
   after the edit). Wrapped the existing `/records/:id` request in try/catch; on
   `ApiError.isApiError(error) && error.status === 404` it calls
   `request<RecordWithUIResponse>('/ui/record/' + encodeURIComponent(eventGraphId))`
   (route prefix matches the existing `getRecordWithUI` at :2324 — `request()` adds
   `/api`) and returns `ui.record.payload` cast to the SAME return type the method
   already declared. Every other error re-throws untouched. Happy path is still exactly
   ONE request (no speculative parallel call). Public return type and the
   `runId`/`name`/`deckLayout`/`editorLayout` optional fields are unchanged; no
   normalization/assignment that could materialize `runId: undefined` — the whole
   payload object is returned as-is (absent keys stay absent).
2. `app/src/shared/api/client.loadEventGraph.test.ts` (NEW) — 3-leg pin,
   `// @vitest-environment node`, stubs `globalThis.fetch` (the `request()` transport),
   asserts second-call URL `/api/ui/record/EVG-1`. Fixture ids EVG-1/2/3 live in the
   test file only; no record id or `records/runs/...` path literal anywhere in product
   code.

Not touched (verified by `git status --short` clean at each stage): DeckViewer.tsx,
EventEditorShell.tsx, eventGraphPersistence.ts, EventEditorContext.danglingPlan.test.ts,
uiSpec.ts, errors.ts, graph/**, run/**, server/**, schema/**, config/**, records/**.

## TDD + mutation evidence (raw, abbreviated to summary lines)

### RED (leg A must fail before the fix — it did)
`cd app && npx vitest run src/shared/api/client.loadEventGraph.test.ts`
```
 ❯ src/shared/api/client.loadEventGraph.test.ts  (3 tests | 1 failed) 11ms
   ❯ ... > falls back to /ui/record/:id when /records/:id 404s (per-run plan graph)
     → Not found
 FAIL  ... > falls back to /ui/record/:id when /records/:id 404s (per-run plan graph)
ApiError: Not found
 ❯ request src/shared/api/client.ts:1656:13
 ❯ Object.loadEventGraph src/shared/api/client.ts:2813:22
Serialized Error: { status: 404, code: 'HTTP_404', ... }
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

### GREEN (after the fix)
`cd app && npx vitest run src/shared/api/client.loadEventGraph.test.ts`
```
 ✓ src/shared/api/client.loadEventGraph.test.ts  (3 tests) 6ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### Mutation 1: fallback branch deleted (try/catch skeleton kept)
Leg A MUST go RED; B/C stay GREEN:
```
 ❯ src/shared/api/client.loadEventGraph.test.ts  (3 tests | 1 failed) 10ms
   ❯ ... > falls back to /ui/record/:id when /records/:id 404s (per-run plan graph)
     → Not found
 FAIL  ... > falls back to /ui/record/:id when /records/:id 404s (per-run plan graph)
ApiError: Not found
 ❯ Object.loadEventGraph src/shared/api/client.ts:2814:24
Serialized Error: { status: 404, code: 'HTTP_404', ... }
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
Leg A RED, legs B+C GREEN — pin catches the removed fallback. (Reverted via `git checkout --`.)

### Mutation 2: condition widened from `status === 404` to any error (`if (true)`)
Leg B MUST go RED (500 papered over by a silent fallback):
```
 ❯ src/shared/api/client.loadEventGraph.test.ts  (3 tests | 1 failed) 10ms
   ❯ ... > does NOT fall back on non-404 faults — a 500 still rejects
 FAIL  ... > does NOT fall back on non-404 faults — a 500 still rejects
AssertionError: expected NetworkError: Failed to connect to server… to match object { name: 'ApiError', status: 500 }
- Expected / + Received
-   "name": "ApiError",
-   "status": 500,
+   "name": "NetworkError",
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
Leg B RED — the 500 is no longer rejected as an ApiError; the widened fallback fired on
the server fault (its `/ui/record` call then hit the unset mock → NetworkError, i.e. the
fault was papered over, exactly what the pin forbids). Pin is NOT vacuous in either
mutation. (Reverted via `git checkout --`.)

Post-revert state: `git -c core.fileMode=false status --short` printed nothing (clean) —
the only committed product change is the GREEN 404-only fallback itself.

## Exit verification (raw)

`cd app && npx vitest run src/shared/api/client.loadEventGraph.test.ts`
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  2.15s
```
`cd app && npx vitest run src/event-editor/EventEditorContext.danglingPlan.test.ts` (untouched file)
```
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  7.65s
```
Typecheck: ONE run, `cd app && npx tsc --noEmit` → `grep -c 'error TS'` = **14**.
BASELINE DEVIATION, disclosed: the brief's measured baseline was 1 error at 8869e8f2.
My count is 14 and my files contribute ZERO: 13 of the 14 are missing-declaration
module errors (`ajv`, `ajv/dist/2020.js`, `ajv-formats`, `prosemirror-view`, `yaml`
under `../server/src/...`) — this worktree's `app/node_modules` is a symlink into
`/mnt/vast/home/brad/git/cl-integration-2/app/node_modules` and those packages are
absent there; the 14th (RefCombobox.ontologyref.test.tsx) is the same missing-dep
class in an untouched file. The only error ever attributable to my change
(1x TS6133 unused `ApiError` import in the new test) was fixed in commit 3 and the
re-run count went 15 → 14. I did not attempt to fix or grow any pre-existing error,
and re-ran once after the import fix (second run above: 14). No product-code type
error introduced.
`git -c core.fileMode=false status --short` → empty (clean tree at exit).

## AC mapping (browser gate will grade on :5193)
- AC1 (plan-mode run loads its plan graph; 404→200 sequence): code path now matches —
  `/records/:id` 404 → `/ui/record/:id` envelope is what leg A pins at the client layer.
- AC2 (genuinely dangling id): both routes 404 → the `/ui/record` fallback call itself
  throws ApiError 404, which re-throws (only 404 *from the first* route triggers the
  fallback; a 404 from the fallback propagates), so the existing dangling-plan notice
  still renders. No notice wording changed.
- AC3 (ordinary graph, one request): leg C pins single-request happy path;
  `EventEditorContext.danglingPlan.test.ts` passes untouched (2/2).

## Environment notes
- TS-only unit; no YAML touched, no stack restart, no `cl-lane-reload.sh`.
- No dependency installs performed; `app/node_modules` launcher-provided (symlink).
- Scratch used only under /home/brad/.d3loadpath-scratch/ (tsc log), deleted at exit.

## Commits (all name d3loadpath; base f4987dc7)
1. `c4d37a24` — RED pin (leg A failing)
2. `482b6cbc` — GREEN 404-only fallback
3. `662c7565` — unused-import fix in the pin (noUnusedLocals)
4. report commit (first commit adding this file) — sha in the marker below

## Decisions
- Catch is status-keyed on `ApiError` only (errors.ts:22/:38), never message-string-keyed.
- Envelope consumed as `RecordWithUIResponse.record.payload` verbatim — same payload
  shape as `/records/:id` (uiSpec.ts:151-156); no re-mapping, no key dropping.
- Mutation probes used `git checkout --` reverts; both pins confirmed non-vacuous.
