# L2-SUBPROTOCOL-EXPAND-1 / unit d3authclose — coder report

- worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-d3loadpath-lane2
- branch: cl/lane2-subproto-d3loadpath-1456
- base: 5ef7264155829b724a6edc5363e96d9006b0ca1e (before step-0 merge)
- Defect addressed: d3loadpath's advc cycle-1 verdict `FIX-FUNCTIONAL` (D1, MAJOR):
  the `loadEventGraph` 404 fallback merged at 482b6cbc (trunk 0d02e31f) re-reads a record
  through `GET /ui/record/:id` — a route that performs NO access check — while
  `/records/:id` emits an ACCESS DENIAL as 404 `{"error":"NOT_FOUND"}`, byte-identical to a
  genuinely missing record. This unit NARROWS that merged change: the fallback branch is
  deleted so a 404 surfaces honestly (fail closed). No read access is granted to the run's
  principal (that is D-3, an architect decision — see status section).
- DELIBERATE regression of d3loadpath AC1: the deck will again show the existing
  dangling-plan notice for a denied plan graph. Passing a gate by reading around an
  authorization decision is not a fix.

## Step 0 — merge
`git merge --ff-only cl/integration-2` was REFUSED (exit 128): cl/integration-2 (1c7f615f) is
not a descendant of HEAD (5ef72641) — measured. Diff since merge-base f4987dc7 is
`.hermes/plans/handoffs/2026-11-13T1500-L2-tick-l2t1445.md` (+30 lines) only — zero owned
files, so the merge cannot conflict with this unit. Per brief, `--no-ff` was used instead:
merge commit 40016fa9, tree clean immediately after.

## Changed files (owned set only, 2 files + this report)
1. `app/src/shared/api/client.ts` — ONLY the `loadEventGraph` catch block: removed the
   `if (ApiError.isApiError(error) && error.status === 404)` branch and its `/ui/record`
   request (17 lines deleted: 5-line false comment + 12-line branch); kept `throw error`;
   replaced the comment with a truthful one-line note (404 may be absence OR an access
   denial — the record route denies as NOT_FOUND — so the client must surface it rather than
   re-fetch through an unchecked route). Net: 1 insertion / 17 deletions. All other
   `ApiError…status === 404` sites (2308/4380/4413/4831/4854/4873/5219) left byte-identical
   (verified by grep before and after).
2. `app/src/shared/api/client.loadEventGraph.test.ts` — leg A REPLACED (not added): a 404
   from `/records/:id` must reject with `{ name: 'ApiError', status: 404 }` AND `fetchMock`
   called exactly ONCE with no URL containing `/ui/record/`. Leg B (500) and leg C (happy
   path, single request) byte-identical. Shape shipped: 3 tests (leg A replaced).

NOT touched: `EventEditorContext.danglingPlan.test.ts`, `server/**`, `schema/**`, `config/**`,
`app/src/graph/**`, `app/src/event-editor/**` (product), `app/src/run/**`, the d3loadpath
report (prohibited).

## RED (run at base 40016fa9 — fails because the fallback makes the second request)
`cd app && npx vitest run src/shared/api/client.loadEventGraph.test.ts` (raw tail)
```
 ❯ src/shared/api/client.loadEventGraph.test.ts  (3 tests | 1 failed) 10ms
   ❯ ... > a 404 from /records/:id rejects and NEVER re-reads via /ui/record (deny-404)
     → expected NetworkError: Failed to connect to server… to match object { name: 'ApiError', status: 404 }
 FAIL  src/shared/api/client.loadEventGraph.test.ts > ... > a 404 from /records/:id rejects and NEVER re-reads via /ui/record (deny-404)
AssertionError: expected NetworkError: Failed to connect to server… to match object { name: 'ApiError', status: 404 }
- Expected / + Received
-   "name": "ApiError",
-   "status": 404,
+   "name": "NetworkError",
 ❯ src/shared/api/client.loadEventGraph.test.ts:27:5
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
Mechanism: the fallback fired on the 404 and issued the second request to
`/api/ui/record/EVG-1`; the stub returned nothing for it, so `fetch` threw a TypeError, which
`request()` wraps as `NetworkError` — direct proof of the second request to the unchecked
route.

## GREEN (after deleting the fallback branch)
```
 ✓ src/shared/api/client.loadEventGraph.test.ts  (3 tests) 4ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Mutation probes (product file reverted before commit; both via `git checkout --`)
MUT1 — deleted fallback branch restored verbatim (spliced from
`git show 8fd3880d^:app/src/shared/api/client.ts`, i.e. the pre-RED file):
```
 FAIL  src/shared/api/client.loadEventGraph.test.ts > ... > a 404 from /records/:id rejects and NEVER re-reads via /ui/record (deny-404)
AssertionError: expected NetworkError: Failed to connect to server… to match object { name: 'ApiError', status: 404 }
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
Leg A RED, legs B+C GREEN — the pin catches the restored fallback.
MUT2 — surviving `throw` widened to swallow the 404 and return a placeholder graph:
```
 FAIL  src/shared/api/client.loadEventGraph.test.ts > ... > a 404 from /records/:id rejects and NEVER re-reads via /ui/record (deny-404)
- Expected: [Error: rejected promise]
+ Received: Object { "events": Array [], "id": "EVG-1", "labwares": Array [] }
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
Leg A RED — a 404 is never converted into an invented successful read; fail-closed is not
cosmetic.

## VERIFY BEFORE EXIT (raw)
Targeted: `cd app && npx vitest run src/shared/api/client.loadEventGraph.test.ts`
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  911ms
```
1 file / 3 tests — same shape as the composer's measured baseline at 0d02e31f (leg A
replaced, not added; the 4-test shape was NOT shipped).
Sibling pin (unmodified): `cd app && npx vitest run src/event-editor/EventEditorContext.danglingPlan.test.ts`
```
 Test Files  1 passed (1)
      Tests  2 passed (2)
```
Typecheck (ONE run): `cd app && npx tsc --noEmit` → `grep -c 'error TS'` = **14** (baseline
14; all 14 are the pre-existing missing-module declarations for ajv/ajv-formats/yaml/
prosemirror against the symlinked node_modules, plus one untouched test file). `grep
'client.ts'` over the full tsc output → NO MATCHES.
`git -c core.fileMode=false status --short` → empty (clean tree at exit; re-verified after
both mutation reverts and after the final commit).

## AC mapping (browser gate will grade on :5193)
- AC1: denied plan graph → exactly ONE `/api/records/EVG-…` request returning 404 → ApiError
  404 propagates; NO `/api/ui/record/…` request; the deck shows the existing dangling-plan
  notice. This unit's new leg A pins exactly this at the client layer.
- AC2: non-404 faults (500/network) still reject; never converted into a successful read,
  never trigger a second route (leg B unchanged and green).
- AC3: ordinary graph loads through `/api/records/:id` with exactly one request (leg C
  unchanged and green); `EventEditorContext.danglingPlan.test.ts` passes untouched (2/2).

## D-3 status
D-3 remains OPEN. This unit does not make a run's plan graph readable; it removes an
unchecked read path. The remedy (grant the run's principal read access via the ownership/ACL
layer, or add an ACL-checked run-scoped read route) is an architect decision, not
implemented here.

## Commits (all name d3authclose; base 5ef72641)
1. 40016fa9 — merge cl/integration-2 (--no-ff; step 0 ff refused, see above)
2. 8fd3880d — RED pin (deny-404 leg replaces the two-request fallback assertion)
3. 59bc1754 — GREEN (delete the /ui/record 404 fallback in loadEventGraph)
4. first commit adding this report — sha in the marker below
5. marker-append commit (contains this report; marker below names the report commit)

## Environment notes
- TS-only unit; no YAML touched, no stack restart, no installs. `app/node_modules` is the
  launcher-provided symlink. Scratch: `/home/brad/.d3authclose-scratch/` (raw logs),
  deleted at exit.

L2-SUBPROTOCOL-EXPAND-1-d3authclose UNIT unit DONE ece3f1899556f5b67c84bd1efd5661e5fc54a517
