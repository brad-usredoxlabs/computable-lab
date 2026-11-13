# L2-JOURNEY-EVIDENCE-1 — unit 4 of 4 (evroute) — implementation report

- worktree: /home/brad/cl-wt/L2-JOURNEY-EVIDENCE-1-evroute-lane2
- branch: cl/lane2-journey-evidence1-evroute-0432
- base: e92c8e3a71ff75b006e2478fe7d8cedbe0cc1ade (trunk does not contain the evidence modules; this is the evstore tip)
- commit: f53bbd238ec994bafcac2ccd83069da5ecb4b118
- tier: consequential — API-only surface, independent review still owns acceptance
- ACCEPTANCE NOTE: API-only by design. No evidence-bundle UI exists on this revision; the
  journey-milestone browser gate (handoff l2t1871 line 24) covers this with the other EVIDENCE UI legs.
  No browser certification claimed here.

## What changed (2 files, 189 added lines)

1. `server/src/api/routes.ts` (+52)
   - `journeyEvidenceRootDir?: string` on `RouteOptions` (beside `journeyCatalogueDir`/`journeyPolicySetDir`),
     absent => the route REFUSES (restrictive default, no `process.cwd()`-derived root).
   - ONE handler `GET /journey/evidence` + four module constants (`JOURNEY_EVIDENCE_NOTICE` and the three
     rule names). Querystring params `journey_id`, `revision`. `new JourneyEvidenceStore({ rootDir })` per
     request (no module cache). Calls only the store's committed `verify` then `load`. No re-hash, no
     repair, no schema/Ajv authority, no literal ids/paths, no change to the three existing journey routes.
2. `server/src/api/journeyEvidence.routes.test.ts` (NEW, 137 lines)
   - REAL `registerRoutes` under `{ prefix: '/api' }` via `fastify.inject`; `stubRouteOptions` copied
     verbatim from `journeyCompile.routes.test.ts` (which copied it from `journeyCapabilities.routes.test.ts`).
   - Fixtures built through `buildJourneyEvidenceBundle`; stored through the store's own `save`; tamper arm
     edits one preserved document's text on disk. Scratch: `/home/brad/.journey-evroute-scratch`.

## Response contract implemented

- served: `200 { ok: true, bundle, verify, notice }`; `verify` is the store's verdict verbatim.
- tampered document (digest mismatch): `200 { ok: true, bundle: null, verify: { ok: false, mismatches: [...] } }`
  — the store's `load` refuses a digest-mismatched read by design, so the bundle is returned as a REFUSED
  read (null) and never silently re-hashed. The mismatch names `ref_id`, `expected`, `actual`.
- absent / unreadable / schema-invalid on disk: `404 { ok: false, diagnostics: [{ rule: 'journey_evidence_not_found' }] }`.
- no evidence root configured: `403 { ok: false, diagnostics: [{ rule: 'journey_evidence_root_unavailable' }] }`.
- malformed request (missing journey_id, missing/`0`/`3.5`/`abc` revision): `400 { ok: false, diagnostics: [{ rule: 'journey_evidence_request_invalid' }] }`.
- id containing `/` (schema-legal string): the store's own `invalid_segment` refusal is relayed as `400`,
  message carries the id intact — the querystring is not split, no path traversal, no 500.

## Evidence (raw)

RED first (route absent), before implementation:

```
 ❯ src/api/journeyEvidence.routes.test.ts  (6 tests | 6 failed)
 Test Files  1 failed (1)
      Tests  6 failed (6)
```
(every arm returned Fastify's default 404 for the missing route)

Targeted, after implementation:

```
 ✓ src/api/journeyEvidence.routes.test.ts  (6 tests) 337ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Regression (composer baseline 13 passed):

```
 ✓ src/compiler/journey/journeyEvidenceStore.test.ts  (8 tests)
 ✓ src/api/journeyCompile.routes.test.ts  (5 tests)
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

Typecheck: `cd server && npx tsc --noEmit -p .` -> no output, `tsc_status=0` (0 errors; one new optional field).

Mutation probe — applied alone, verbatim:

```
-      const verify = await store.verify(journeyId, revision);
+      const verify = { ok: true as const, mismatches: [] as [] };
```

Result (must go red on the tamper arm; it did):

```
 FAIL  ... > (b) a document edited on disk: 200, verify.ok false naming the ref_id with expected ≠ actual, bundle never re-hashed
AssertionError: expected 404 to be 200
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```
Reverted before commit; `git -c core.fileMode=false status --short` at exit: empty (clean tree).

## Decisions worth recording

- `bundle: null` on a tampered read (not a made-up bundle, not a 404): the store's `load` contract says a
  digest-mismatched revision is a failed read. Serving the parsed-but-tampered document would require a
  second read path in the route, which the brief forbids. The mismatch list is the audit signal.
- Verification order is `verify` then `load`; two store reads per request, both from the same per-request
  store instance, so a bundle saved after boot is visible immediately (no restart, no module cache).
- Unexpected non-store errors propagate (Fastify 500); every specified failure path is named. Store
  refusals (`JourneyEvidenceStoreError`, e.g. `invalid_segment`) are relayed as 400 by rule.

## Blocker / follow-up (owner: orchestrator) — live AC1/AC2 not verifiable in this scope

`journeyEvidenceRootDir` is a `RouteOptions` field; nothing in `server/src/server.ts` passes it (nor does it
pass `journeyPolicySetDir`). `server.ts` is NOT in this unit's owned files, so the live lane stack at
:3093 answers:

```
$ curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3093/api/journey/evidence?journey_id=x&revision=1'
404
{"message":"Route GET:/api/journey/evidence?journey_id=x&revision=1 not found","error":"Not Found","statusCode":404}
```
(the running stack is a different branch and does not carry the route).

Resume condition for live AC1/AC2: orchestrator deploys this branch to the lane stack AND approves a
one-line `server.ts` wiring of `journeyEvidenceRootDir` to a real configured root (that file is outside this
unit's scope, so it was not touched). Until then AC1/AC2 are evidenced only through the REAL `registerRoutes`
+ `fastify.inject` harness above, which is the same code path the server mounts.

## Notes

- Environment: this worktree had no `server/node_modules`, `server/schema`, `server/records`; all three are
  gitignored and were symlinked to the shared install (`cl-integration-2/server/node_modules`, matching the
  evbundle/evcite sibling worktrees). No dependency install was run.
- Output budget: brief allowed <=180 lines; measured 189 (route 52 + test 137). The overage is the arms'
  assertions and the mandated verbatim `stubRouteOptions`; no arm, assertion or owned change was dropped.
- Scratch dir `/home/brad/.journey-evroute-scratch` created and removed by the test's `afterAll`.

L2-JOURNEY-EVIDENCE-1 UNIT 4 DONE f53bbd238ec994bafcac2ccd83069da5ecb4b118
L2-JOURNEY-EVIDENCE-1 UNIT unit DONE f53bbd238ec994bafcac2ccd83069da5ecb4b118
