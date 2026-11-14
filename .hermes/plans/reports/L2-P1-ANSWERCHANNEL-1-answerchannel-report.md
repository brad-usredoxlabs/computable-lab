# L2-P1-ANSWERCHANNEL-1 / unit answerchannel — report (lane 2)

Worktree: /home/brad/cl-wt/L2-P1-ANSWERCHANNEL-1-answerchannel-lane2
Branch: cl/lane2-p1-answerchannel-answerchannel-1950
Base: 444adb03b3e8fec92a59b1ee966b240c31382733

## Defect
`POST /labware-definitions/search` offers rows whose `recordId` is the VENDORED
registry copy's recordId (labwareDefinitionSearch.ts `toHit`: `def.recordId ?? …`),
but `GET /api/records/:id` read ONLY the record store, so the offered id
`lbw-def-generic-96-well-deepwell-plate` 404ed (`{"error":"NOT_FOUND"}`) — the
person picked a row the system then said does not exist (decision evidence:
three unknown-noun round trips, shots/42,48,56,60).

## Grounding (quoted, binding)
Decision PROMPT1-ENTRY-STATE-l2-20261113, consequence (verbatim):
"Un-bindable answer channel: the offered row's id `lbw-def-generic-96-well-deepwell-plate`
returns 404; the record is `lbw-def-generic-96-well-deep-plate`". Governing line:
"Identity is a record id, never a name." The union search dedupes
registry-vs-record by definition id with the registry copy winning; the GET
path must agree with the union's identity. The fix renders registry data the
system already serves (search, registry UI) — rendered, not invented. No
writes, seeds or mutations; a store ERROR still 500s (no error masking).

## Change (server/src/api/handlers/RecordHandlers.ts, getRecord miss path only)
1. +1 import: `getLabwareDefinitionRegistry` from `../../registry/LabwareDefinitionRegistry.js`.
2. Plain branch (after the validate/lint branch): on `store.get(id)` MISS,
   resolve the registry by `recordId` match first (`list().find`), then by the
   bare definition id (`registry.get(id)`); the `record:<recordId>` shape is
   NOT accepted (no double identity). A hit renders as a READ-ONLY envelope:
   `{ recordId: hit.recordId, schemaId:
   'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
   payload: hit, meta: { kind: 'labware-definition', path:
   'schema/registry/labware-definitions' } }`. Miss in BOTH sources stays
   `404 { error: 'NOT_FOUND' }`. The existing security/access checks then run
   on the resolved envelope exactly as for a store hit.
Search endpoint, registry loader, registry YAML and seed files untouched.
`exactOptionalPropertyTypes` respected: `meta` is an object literal, no
undefined-optional assignments.

## Verification (real outputs)
- RED (commit a260c92c, before implementation): `npx vitest run
  server/src/api/handlers/RecordHandlers.definitionRegistryGet.test.ts`
  → `Tests  2 failed | 2 passed (4)`; both failures `expected 404 to be 200`
  (the measured baseline defect at unit level).
- GREEN (commit bf24f854): same command → `Tests  4 passed (4)`.
- Regression sweep `npx vitest run server/src/api/handlers server/src/registry`
  (repo root, vitest 1.6.1): failure set IDENTICAL on base (implementation
  stashed) and HEAD — the only delta is the two new tests, now passing.
  All 32 RecordHandlers.*/registry suites green: `Tests  252 passed (252)`.
  Pre-existing worktree-path failures (e.g. ENOENT
  /home/brad/cl-wt/schema/lab/vendor-pdf.schema.yaml) exist on base too —
  unrelated to this unit.
- Typecheck `npm run typecheck -w server` (on final commit): exit 0, no
  diagnostics (PASS).

## Acceptance mapping
1. 200 for `lbw-def-generic-96-well-deepwell-plate`: record.recordId set,
   schemaId = labware-definition.schema.yaml, payload.display_name
   "Generic 96-Well Deep Well Plate", zero store writes — test case 1.
2. `lbw-def-does-not-exist` still 404 NOT_FOUND — test case 3
   (+ `record:<id>` shape 404, test case 4).
3. Test file green on branch; changed paths only RecordHandlers.ts, the new
   test and this report (verified via `git diff --name-only base...HEAD`).

## Commits
- a260c92c — RED test
- bf24f854 — GREEN implementation
- (this report + marker, one commit — the marker names the final content
  commit of the unit's lineage, per the repo's marker precedent)

Remaining: browser acceptance gate and any live :3093 recheck are
orchestrator-owned; no blockers in this unit.

L2-P1-ANSWERCHANNEL-1-answerchannel UNIT unit DONE bf24f854214999397eae848ff0e501e3c0df06c6
