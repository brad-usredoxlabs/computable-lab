# L2-SUBPROTOCOL-EXPAND-1 — u6builddoorfix1pw (fix1 / advc c1 closeout)

Lane 2 · branch `cl/lane2-subproto-u6builddoor-1110` · unit base `593419f8` · trunk `cl/integration-2` @ `5fbde069`
Worktree `/home/brad/cl-wt/L2-SUBPROTO-u6builddoor-lane2`. Every figure below is a command run in
THIS tree on 2026-11-10 15:23–15:26 EST. No number is copied from a session log.

## State found at session start
- advc c1 (`reviews/L2-SUBPROTO-u6builddoor-advc-c1-l2t1345.md`) → `VERDICT: FIX (6 defects: 3 major, 3 minor)`.
- u6builddoorfix1 exited rc=0 with a log-only marker; the launcher auto-committed its dirty tree as
  `593419f8` (WIP, 4 files, +180/−38 vs `12a8b9e7`).
- HEAD was already `108d910a`, two pre-existing commits above `593419f8`: `ebe10fca` (the one-line
  client restore — the change this unit owns) and `108d910a` (a thin report at
  `.hermes/plans/reports/L2-SUBPROTOCOL-EXPAND-1-report.u6builddoor.md` whose marker names
  `ebe10fca`, a commit that does not contain that report). No reset/amend/rebase: this unit builds on
  them, re-proves the pin, and files this conformant report; the product fix is NOT re-done.

## fix1 (advc c1) — one line per c1 defect, with the path:line that closes it
- D1 stale planned-run target — `app/src/run/RunPlanGraphBuild.tsx:53` (`setPlannedRunId(null)` synchronously on `[runId]`; `result`/`failure` cleared at :54–55). Witness: `app/src/run/RunPlanGraphBuild.test.tsx:151` (leg f).
- D2 rendered code not the server's named code — `app/src/run/RunPlanGraphBuild.tsx:79` (`setFailure({ message: error.message })`) rendered at `:110`; no synthetic code prefix. Witness against the REAL `ApiError.fromResponse`: `app/src/run/RunPlanGraphBuild.test.tsx:181`, assertion `:206` (`not.toContain('HTTP_409')`).
- D3 self-PLR arm unwitnessed — `app/src/run/RunPlanGraphBuild.test.tsx:131` (leg e: payload `kind:'planned-run'`, `buildPlanGraph` called with the runId itself) exercising `app/src/run/RunPlanGraphBuild.tsx:38`.
- D4 client URL literal unpinned — `app/src/shared/api/client.ts:5640` (`/plan-graph`) pinned at `app/src/shared/api/client.planGraphRoute.test.ts:40`, which mocks `fetch` (transport), not `apiClient`.
- D5 stale failure banner after success — `app/src/run/RunPlanGraphBuild.tsx:75` (`setFailure(null)` on success) and `:77` (`setResult(null)` on failure). Witness: `app/src/run/RunPlanGraphBuild.test.tsx:209` (leg h).
- D6 output budget overrun undisclosed — disclosed here. Measured `git -c core.fileMode=false diff --stat af860ed2..593419f8` → `5 files changed, 415 insertions(+)` against the 220-line budget = +195 over. Closeout delta `593419f8..ebe10fca` → `1 file changed, 1 insertion(+), 1 deletion(-)`; this report is the only other paperwork (commit (i)).

## Verification (raw, this tree)
1. Mutation probe / RED — at `593419f8` the pin was RED. The restore was already committed, so the RED
   was reproduced by re-applying the probe `/plan-graph` → `/bindings` at `client.ts:5640`, running only
   the pin, then restoring:
```
FAIL  src/shared/api/client.planGraphRoute.test.ts > apiClient.buildPlanGraph route pin > POSTs /runs/:plannedRunId/plan-graph with no body
AssertionError: expected '/api/runs/PLR%201/bindings' to match /\/runs\/PLR%201\/plan-graph$/
- Expected: /\/runs\/PLR%201\/plan-graph$/
+ Received: "/api/runs/PLR%201/bindings"
 ❯ src/shared/api/client.planGraphRoute.test.ts:40:25
 Test Files  1 failed (1)
      Tests  1 failed (1)
```
2. GREEN after restoring `/plan-graph` (mutation not left in tree):
```
 ✓ src/shared/api/client.planGraphRoute.test.ts  (1 test) 2ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
3. `node node_modules/vitest/vitest.mjs run src/run/RunPlanGraphBuild.test.tsx`:
```
 ✓ src/run/RunPlanGraphBuild.test.tsx  (8 tests) 173ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```
4. `node node_modules/typescript/bin/tsc --noEmit -p .` → exit 2, 13 error lines, none naming an owned
   file: 10 × TS2307 unresolved modules (prosemirror/ajv/yaml) plus 3 × TS7006 in
   `src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx` (prohibited, untouched).
   `593419f8..HEAD` touches only `client.ts` + reports, so every other line pre-exists at the base.
5. `git -c core.fileMode=false status --short` → `?? app/node_modules` only (environment, not committed).
6. `grep -n '/bindings' app/src/shared/api/client.ts` → `5616`/`5628`, both the pre-existing
   `updatePlannedRunBindings` method (server route `server/src/api/routes.ts:1010`); zero in `buildPlanGraph`.
7. Probe line — the one-line restore, `git -c core.fileMode=false diff 593419f8..HEAD -- app/src/shared/api/client.ts`:
```
@@ -5637,7 +5637,7 @@ export const apiClient = {
   async buildPlanGraph(plannedRunId: string): Promise<{ success: true; graphId: string; reused?: boolean }> {
-    return request(`/runs/${encodeURIComponent(plannedRunId)}/bindings`, {
+    return request(`/runs/${encodeURIComponent(plannedRunId)}/plan-graph`, {
       method: 'POST',
     })
```
YAML-reload trap: not applicable — no schema/YAML edit, no lane-stack restart.

## Marker (two-commit PENDING_SHA scheme)
Commit (i) `b8d9dd8eca559245c80bf60459665baf2dd9ab6d` contains this report; commit (ii) replaced the placeholder with that sha.
Containment proof: `git cat-file -e b8d9dd8eca559245c80bf60459665baf2dd9ab6d:L2-SUBPROTOCOL-EXPAND-1-report.u6builddoorfix1.md` → rc=0.

L2-SUBPROTOCOL-EXPAND-1-u6builddoorfix1pw UNIT u6builddoorfix1pw DONE b8d9dd8eca559245c80bf60459665baf2dd9ab6d

CONTAINMENT (trunk-reachable): commit (ii) 3622025dc14ce12937b5df42d6dd4164391cae7e; supersedes b8d9dd8e containment line (not trunk-reachable).
