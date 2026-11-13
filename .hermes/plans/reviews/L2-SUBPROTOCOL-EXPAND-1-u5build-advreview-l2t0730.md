# ADVERSARIAL REVIEW — L2-SUBPROTOCOL-EXPAND-1 / u5build (lane 2, cycle 1, orchestrator l2t0730)

- Candidate: /home/brad/cl-wt/L2-SUBPROTO-u5build-lane2
- Branch: cl/lane2-subproto-u5build-1110
- HEAD: af8b8cf5 (“u5build: add POST /runs/:id/plan-graph handler, route, and tests”)
- Base: a4904d81 (ancestor of trunk cl/integration-2 @ 3256493b)
- Diff: 1 commit, 3 files, +302/-0
  - M server/src/api/handlers/PlannedRunHandlers.ts (+140)
  - A server/src/api/handlers/planGraphBuild.test.ts (+161)
  - M server/src/api/routes.ts (+1)
- Working tree: only `?? app/node_modules  ?? node_modules  ?? server/node_modules` (harness materialization, ignored per task). HEAD unchanged. I made no edits to the candidate.

## VERDICT: FIX

The wiring is conceptually correct (route → handler → the three merged modules, no duplicated persistence logic, enum read from the schema), but the branch **does not typecheck** (5 new TS errors; trunk base has 0) and the **committed suite is red** (1 failed | 3 passed). Both are gates the brief explicitly required to be green.

---

## 1. Acceptance criteria (brief, verbatim where quoted)

SCOPE / THE CHANGE (file: /home/brad/.hermes/cl/lanes/2/prompts/brief-L2-SUBPROTOCOL-EXPAND-1-u5build-0712.txt):

1. Owned files exactly: `PlannedRunHandlers.ts` (ONE new method), `routes.ts` (ONE new route line), NEW `planGraphBuild.test.ts`, NEW `.hermes/plans/deliverables/L2-SUBPROTOCOL-EXPAND-1-report.u5build.md`.
2. “`POST /runs/:id/plan-graph` reads the run, its attached local protocol and its written bindings, builds the local plan, projects it into ONE event-graph document and persists + links it — or returns the named error and writes nothing.”
3. (a) 404 `PLANNED_RUN_NOT_FOUND`; 400 `NOT_A_PLANNED_RUN`. (b) first id from `protocolIdsOf`; absent = 400 `NO_PROTOCOL_ATTACHED`; missing = 404 `LOCAL_PROTOCOL_NOT_FOUND`. (c) 409 `{error, roleId, stepId}` named, never generic 500, never partial write. (d) `allowedEventTypes` resolved from `ctx.schemaRegistry` — “do not fall back to a hand-written verb list — that is the hardcode boundary this item forbids”. (e) project. (f) idempotency: already set + exists → 200 `{success:true, graphId, reused:true}` writes NOTHING. (g) persist; STORE_ERROR→500, UNSUPPORTED_EVENT_TYPE→409. (h) 200 `{success:true, graphId}`.
4. Must NOT change the four prohibited modules, existing route/method behaviour, `methodEventGraphId` naming, any item/task-list/status file.
5. Verify before exit: named vitest legs pass (min: happy + UNBOUND_ROLE 409 + NO_PROTOCOL_ATTACHED 400 + reused:true writes nothing); regression `localPlanGraph.test.ts` + `localPlanEventGraphStore.test.ts` = 2 files / 10 tests; `npx tsc --noEmit -p .` exit 0 zero output; clean tree.
6. Exit: report with `L2-SUBPROTOCOL-EXPAND-1 UNIT u5build DONE <40-hex>`.
7. Mutation probe: comment out `persistLocalPlanEventGraph` → suite must go RED.
8. Reviewer bait pins: exactOptionalPropertyTypes (optional absent, never `undefined`); no verb list in TS; named errors carry roleId+stepId with nothing written; second call writes nothing; one route line, no neighbouring route touched; do not “fix” `labwares: []` or the store's non-atomic ordering.

## 2. Commands I ran (real output)

Scratch harness (candidate `server/schema` symlink is absent and its `node_modules` are lane symlinks, so suites cannot collect in place — skill-documented approach):

```
tar cf - --exclude node_modules --exclude .git . | (cd /home/brad/rev-u5build && tar xf -)
ln -s <candidate>/node_modules node_modules ; same for server/ and app/
ln -sfn ../schema server/schema
```

(1) Named suite, exact HEAD content (test file verified byte-identical to `git show af8b8cf5:...`, sha256 96fda70c…):

```
$ cd /home/brad/rev-u5build/server && npx vitest run src/api/handlers/planGraphBuild.test.ts
❯ src/api/handlers/planGraphBuild.test.ts  (4 tests | 1 failed) 11ms
 ❯ buildPlanGraph > idempotency: second call returns reused:true with no writes
   → expected { success: true, …(1) } to match object { success: true, reused: false }
- Expected
+ Received
  Object {
-   "reused": false,
    "success": true,
  }
 ❯ src/api/handlers/planGraphBuild.test.ts:151:19
Test Files  1 failed (1)
     Tests  1 failed | 3 passed (4)
```

(2) Typecheck at HEAD:

```
$ cd /home/brad/rev-u5build/server && npx tsc --noEmit -p .
src/api/handlers/PlannedRunHandlers.ts(548,50): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/api/handlers/PlannedRunHandlers.ts(557,9): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/api/handlers/PlannedRunHandlers.ts(566,42): error TS2353: ... 'roleId' does not exist in type 'ApiError | { success: true; graphId: string; reused?: boolean; }'.
src/api/handlers/PlannedRunHandlers.ts(607,34): error TS2353: ... 'eventType' does not exist in type ...
src/api/handlers/PlannedRunHandlers.ts(632,47): error TS2353: ... 'eventType' does not exist in type ...
```

(3) Baseline at the trunk clone (contains base a4904d81):

```
$ cd /mnt/vast/home/brad/git/cl-integration-2/server && npx tsc --noEmit -p .
RC=0   (0 lines of output, 0 "error TS")
```

(4) Regression suites named by the brief:

```
$ npx vitest run src/protocol/localPlanGraph.test.ts src/protocol/localPlanEventGraphStore.test.ts
✓ localPlanEventGraphStore.test.ts (2 tests)  ✓ localPlanGraph.test.ts (8 tests)
Test Files  2 passed (2)      Tests  10 passed (10)
```

(5) Neighbouring planned-run suites (not in the brief; checked for collateral): `PlannedRunHandlers.test.ts` 9, `PlannedRunHandlers.protocols.test.ts` 7, `PlannedRunSampleMap.test.ts` 8 → `Test Files 3 passed (3) / Tests 24 passed (24)`.

(6) Mutation probe A (brief §MUTATION PROBE) — `persistLocalPlanEventGraph` call stubbed out:

```
2 failed | 2 passed (4)   → happy path + idempotency both RED
```
The test does touch the live persist path. Probe satisfies the brief's intent.

(7) Mutation probe B — idempotency block disabled (`if (false && payload.methodEventGraphId)`), with the expectation corrected:

```
1 failed | 3 passed (4)  → fails at planGraphBuild.test.ts:158 reused:true
```
So the reused leg has teeth *once the expectation bug is fixed*.

(8) Mutation probe C — hardcode boundary. Replaced the schema-enum resolution with a literal array `['add_material','transfer','mix','other']` (exactly the fixture's own list):

```
Test Files 1 failed (1)   Tests 1 failed | 3 passed (4)   ← unchanged from HEAD
```
The hard-coded-verb-list defect the item exists to prevent is **not detectable** by this suite.

(9) Mutation probe D — removed `reply.status(409)` from the `!planResult.ok` branch:

```
Test Files 1 failed (1)   Tests 1 failed | 3 passed (4)   ← unchanged from HEAD
```
HTTP status codes are unpinned.

(10) Deliverable presence:

```
$ ls .hermes/plans/deliverables/ | grep -i u5build   → nothing
$ find .hermes -iname '*u5build*'                    → nothing
```

All probes were run in /home/brad/rev-u5build (a scratch copy), never in the candidate. Candidate `git status --short` after every probe shows only the three harness `node_modules` symlinks; `git rev-parse HEAD` = af8b8cf5.

## 3. Defects

**D1 — BLOCKER — server/src/api/handlers/PlannedRunHandlers.ts:548, 557, 566, 607, 632 — typecheck fails (5 errors; base = 0).**
Rule: brief VERIFY “`npx tsc --noEmit -p .` -> exit 0, zero output lines”; repo tsconfig has `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true`.
- :548/:557 — `protocolIdsOf()` returns `string[]`; `protoIds[0]` is `string | undefined` under `noUncheckedIndexedAccess`, used at face value in `ctx.store.get(protocolId)` and in `buildLocalPlanGraph({protocolId, …})`.
- :566/:607/:632 — returning `{error, roleId, stepId}` / `{error, eventType, stepId}` against the declared return union, but `ApiError` (server/src/api/types.ts:19) is `{error, message, details?}` only — no `roleId`/`stepId`/`eventType`.
Fix direction: narrow/guard the first protocol id instead of indexing unchecked; fold the named payload into `ApiError`'s `details` (keeping `error`+`message` as the contract) or widen the response type with a discriminated detail member — do not cast to `any`.

**D2 — BLOCKER — server/src/api/handlers/planGraphBuild.test.ts:151 — committed suite is red (1 failed | 3 passed).**
`expect(first).toMatchObject({ success: true, reused: false })` demands a `reused:false` key that the handler (correctly, per brief step h) never emits; vitest `toMatchObject` fails on `undefined !== false`. Consequence beyond the red gate: the test aborts at :151, so the assertions that actually carry the mandated property — `second` → `reused:true` and `store.writeLog === []` (:158-159) — **never execute at HEAD**. The brief's required leg “reused:true writes nothing” is therefore unshipped.
Fix direction: assert the first response as `{success:true}` plus `expect(first).not.toHaveProperty('reused')`, and keep the second-call/write-log assertions. Do not “fix” the handler to emit `reused:false` (optional-property discipline: absent-or-value).

**D3 — MAJOR — server/src/api/handlers/PlannedRunHandlers.ts:600 (`const graphId = \`EG-${randomUUID()}\``) — new id vocabulary for an existing entity.**
Every event-graph id in the tree is `EVG-`-prefixed: ProtocolContextService.ts:259 mints the same “method event graph” as `makeId('EVG-', \`${protocolTitle} Method\`)`; PlannedRunEventsEmitPass.ts:37 `DEFAULT_RECORD_ID_PREFIX = 'EVG-PLR-'` is the existing planned-run-graph convention; CorpusClient.ts:79/97 anonymises only `(MSP|EVG|MAT|ALQ|PRT|PLR)-…`. `EG-<uuid>` (a) breaks the prefix class the corpus de-identifier recognises, (b) makes the planned-run graph indistinguishable from nothing else in the record corpus, (c) invents a second naming scheme for the entity the sibling producer already names.
Fix direction: mint through the existing convention (`EVG-…`, ideally the `EVG-PLR-` shape used for planned-run-emitted graphs, or the human-readable `makeId('EVG-', …)` precedent at ProtocolContextService.ts:259 — hoist/share rather than copy a private helper).

**D4 — MAJOR — server/src/api/handlers/planGraphBuild.test.ts (whole file) — the item's core prohibition is unpinned (mutation C).**
Replacing the schema-registry enum resolution with the fixture's own literal `['add_material','transfer','mix','other']` leaves the suite at exactly the HEAD pass/fail set. The item's stated reason for existing (“a literal array is the exact defect the item exists to prevent”) is therefore not witnessed by any leg, and the `SCHEMA_ENUM_MISSING` paths (missing schema / missing `$defs.PlateEvent` / non-array enum) have no test at all.
Fix direction: add a leg whose fake `schemaRegistry` returns an enum that deliberately **excludes** the protocol's event_type (expect 409 `UNSUPPORTED_EVENT_TYPE` from the projection, nothing written), and a leg where `getById(EVENT_GRAPH_SCHEMA_ID)` returns `undefined` (expect 500 `SCHEMA_ENUM_MISSING`, nothing written). The first one is the pin that a hard-coded list cannot survive.

**D5 — MINOR — server/src/api/handlers/planGraphBuild.test.ts:104-118, 134 — HTTP status codes asserted nowhere (mutation D).**
The tests pass a stub `{ status: (c) => ({code:c}) }` and never read it, so 409/400/404/500 mappings — an explicit item of the brief — are unpinned.
Fix direction: capture the status the handler writes and assert `409` on the UNBOUND_ROLE leg, `400` on NO_PROTOCOL_ATTACHED, and add the `NOT_A_PLANNED_RUN` (400), `LOCAL_PROTOCOL_NOT_FOUND` (404) and `PLANNED_RUN_NOT_FOUND` (404) legs while you are there.

**D6 — MINOR (paperwork, but a listed deliverable) — .hermes/plans/deliverables/L2-SUBPROTOCOL-EXPAND-1-report.u5build.md does not exist.**
SCOPE owns it, the OUTPUT BUDGET counts it, and EXIT CONTRACT requires the `L2-SUBPROTOCOL-EXPAND-1 UNIT u5build DONE <40-hex>` marker. Its absence is also why the “tests pass / tsc clean” claims in D1/D2 were not self-checked.
Fix direction: write the report with the raw captures (they will differ from what was claimed) and the DONE marker naming the containing commit.

## 4. Checks that came back clean

- Scope: exactly the 3 product files; nothing outside the owned list; the four prohibited modules untouched (`git show --stat`). `labwares: []` and the store's create/update ordering untouched, as required.
- No duplicate persistence: the handler delegates to `persistLocalPlanEventGraph`; `create` is called once inside it, and only after both the plan build and the projection succeeded. Exactly one graph per accepted call on the happy path (asserted `store.list({kind:'event-graph'}).length === 1`).
- Route: one `fastify.post('/runs/:id/plan-graph', …)` line inside the existing `if (plannedRunHandlers)` block, adjacent to `/runs/:id/compile`; no other registration for that path anywhere in server/app (`grep -rn "plan-graph" server/src app/src` = handler comment + this line). No shadowing; no neighbouring line modified.
- Handler semantics vs brief: 404/400/409/500 mapping matches (a)-(h); `MALFORMED_PROTOCOL` also 409; UNSUPPORTED_EVENT_TYPE passes `eventType`+`stepId`; STORE_ERROR → 500 `{error, message}`. The schema-enum read is `$defs.PlateEvent.properties.event_type.enum` rather than the brief's prescribed “walk the oneOf `$ref`s and read each detail schema's `const`” — the **brief's description is stale**: the real schema (schema/workflow/event-graph.schema.yaml:296-333) has an inline `enum` on `PlateEvent.properties.event_type`, so the coder's shorter path is schema-derived and correct. No hand-written verb list in production code.
- `kind !== 'planned-run'` guard matches the six existing guards in the same file (:190, :263, :329, :373, :444, :486) and the schema's `kind: const: "planned-run"`.
- exactOptionalPropertyTypes: no `: undefined` assignment introduced; `name` is simply omitted from the projection input (schema makes `name` optional; `id`/`events`/`labwares` are the only required keys, all present). `reused?: boolean` is only conditionally returned.
- Regression: the two named protocol suites 10/10 green; the three neighbouring planned-run suites 24/24 green.

## 5. Observations (not defects; do not require action in this unit)

- O1 `payload.methodEventGraphId` check sits after the plan build + projection, matching the brief's prescribed order, but it means a second call after a binding is removed returns 409 UNBOUND_ROLE rather than `reused:true` even though the graph exists. Matches the brief; worth documenting in the route's doc comment.
- O2 No mutual exclusion: two concurrent calls both read `methodEventGraphId` as absent and both persist (two graphs, one overwriting the run link). The brief knowingly leaves the store's non-atomic create/update ordering out of scope; recording it here rather than as a defect.
- O3 `PLANNED_RUN_SCHEMA_ID` is declared *inside* the method (:527) while sibling modules (ExecutionOrchestrator.ts:18, ProtocolContextService.ts:9) declare the same literal at module scope. Style only.
- O4 `makeCtx()` silently discards the caller's store when `RUN-1` is absent (`new TestStore(...)`), so a future leg could assert against an empty store. Latent footgun in the harness, harmless today.
- O5 The fake registry's `$defs` shape does mirror the real schema (verified against schema/workflow/event-graph.schema.yaml), so D4 is about coverage, not a fabricated fixture.

VERDICT: FIX
