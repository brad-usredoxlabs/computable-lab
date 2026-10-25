# W28-AXISSLUG-1 — normalize answer-key axisIds on the accept assembly path (gate r4 DEFECT-1 fix)

Lane 2. Claimed 2026-10-19T12:5x EDT (orch l2t1230) as the NECESSARY IN-SCOPE REPAIR of
W28-A5D-R3's accept leg (gate ticket — no new campaign scope; the A5 criterion "accept ->
GET the LPR record: branch_resolution[].choices match" is the existing accepted intent).

## Defect (verbatim from gate r4, receipts/W28-A5D-R3/2026-10-19_1208-r4/REPORT.md)

> DEFECT-1 — LPR creation rejected: model-emitted axis id breaks the LPR schema (BLOCKS A5)
> - What: the accept leg assembles the LPR with `branch_resolution[1].axisId = "lyse_variant"`
>   (the axis id the SERVER's own auto-ask emitted). The local-protocol schema constrains
>   `axisId` to `^[a-z][a-z0-9-]*$`, which forbids the underscore, so the write 409s and no
>   local protocol is minted. The family axis (`lysis-method`, hyphenated) validates; only
>   the model-derived axis is malformed.
> - Request/response (trail.json after_accept.caps, POST /api/intent/accept -> 409):
>   req answers `{"lysis-method":"bead-beater","lyse_variant":"variant_a"}`;
>   resp `{"error":"ACCEPT_CREATE_FAILED","validation":{"errors":[{"path":"/branch_resolution/1/axisId",
>   "message":"Must match pattern: ^[a-z][a-z0-9-]*$"}]}}`
> - Fix locus: normalize/slug the model-derived axisId (and/or the answers keys) before it is
>   written into branch_resolution[] — server-side in the accept/assembly path. Do NOT
>   fabricate an id.

## Orch-verified anchors (first-hand this tick, trunk 3f804c17)

- server/src/api/handlers/IntentAcceptHandlers.ts:77-82 —
  `branch_resolution: Object.entries(body.answers).map(([axisId, chosenValue]) => ({ axisId, matched: true, branchIds: [chosenValue], choices: { [axisId]: chosenValue } }))`
  — the answer KEY passes through verbatim. This is the ONLY place the malformed id enters
  the payload (lines 71-84 build the whole record; rest of the handler is validation/create).
- The malformed axis originates from the model's own emitted axis in
  server/src/compiler/scientistIntent/intentCompile.ts (:441 literally describes
  `axisId: 'short stable id, e.g. sample_type'` — the model emits underscore ids ON PURPOSE
  because the tool schema says so; the compiler must not be expected to comply with an
  implicit hyphen rule). The fix therefore belongs on the WERITE side (data-joining the
  answer keys into the schema-constrained field), NOT by re-tuning the model prompt.
- Data rule (unchanged, it is correct): schema/workflow/local-protocol.schema.yaml:96-98
  `axisId: pattern "^[a-z][a-z0-9-]*$"`; mirrored by lint rule R2 in
  schema/workflow/local-protocol.lint.yaml:65-71. Do NOT touch schema or lint YAML.
- Generic slug helper already exists: `slugifyRecordLabel` exported from
  server/src/compiler/material/MaterialCompiler.ts:109-116 (lowercase, non-alnum -> '-',
  trim/dedupe dashes, cap 128, fallback 'unknown'). ALREADY imported across server
  (SemanticKeyBuilder, ProtocolContextService, PlannedRunFromLocalProtocolService). No new
  slug utility; no domain literals.
- Test harness exists: server/src/api/handlers/IntentAcceptHandlers.test.ts (vitest, mock
  store capturing created envelopes; existing case `answers: { sample_type: 'bacterial',
  module_type: 'rack' }` at :49 ALREADY exercises underscore keys and PASSES because the
  mock store never validates against the schema — that is precisely the pin gap).

## Required change (smallest, one module)

In IntentAcceptHandlers.ts, when assembling `branch_resolution` from `body.answers`, pass
each answer KEY through `slugifyRecordLabel` once and use the result for BOTH
`axisId` and the `choices` key (branchIds/`matched` untouched; chosenValue verbatim —
values are branch ids, not schema-patterned ids... verify: branchIds items are plain
strings with no pattern in the schema — keep verbatim).

Collision discipline: if two distinct answer keys slugify to the same axisId, the LAST
entry wins is NOT acceptable silently — pin the behaviour with a test. Chosen behaviour:
merge is out of scope; entries are per-axis from one answers map (the UI derives keys from
disjoint axis questions), so the deterministic rule to pin is: entries stay in
Object.entries order and each gets its own branch_resolution row even if axisIds collide
after slug (the schema does not require unique axisIds in the array; provenance is
per-row). NO de-dup, NO id invention, NO suffixing.

Edge cases to pin (RED-first):
1. RED: answers `{ 'lyse_variant': 'variant_a', 'lysis-method': 'bead-beater' }` ->
   the envelope handed to store.create has branch_resolution[1].axisId === 'lyse-variant'
   and choices key 'lyse-variant'; 'lysis-method' row byte-stable. (Today the test passes
   only because nothing validates; assert the SLUGGED value directly.)
2. A key already conforming passes through unchanged (idempotence:
   slugifyRecordLabel on 'lysis-method' === 'lysis-method' — assert).
3. A pathological key (e.g. 'Variant B!!') slugs to 'variant-b'; a key that slugifies to
   '' (e.g. '!!!') -> helper's 'unknown' fallback — pin that too, with a test showing it
   still satisfies the schema pattern (never emits an invalid id, never throws).
4. No answers -> no branch_resolution key (existing behaviour, regression-pin).
5. The existing VALID fixture case: assert its envelope now carries 'sample-type' /
   'module-type' (deliberate golden change — call it out in the report; the mock-store
   create previously recorded raw underscore keys).

HARD CONSTRAINTS: server-only, IntentAcceptHandlers.ts + its test ONLY. No schema/lint/UI
YAML. No app files. No changes to intentCompile tool descriptions, the 422 envelope,
resolveNounsPass, the fold leaf, or any prompt. No fixture/record writes. No new reason
codes. Chosen values (branchIds, choices VALUES) are NEVER rewritten — only the axisId
provenance key.

## Verify (paste real output in the report)

- `npm run test:run -w server -- src/api/handlers/IntentAcceptHandlers.test.ts` green.
- `npm run test:run -w server -- src/api/handlers/` green (sibling handlers unchanged).
- `npm run typecheck -w server` 0 new errors (baseline 33 error lines trunk-wide is the
  pre-existing tsc baseline — the lane pins green-set, not zero).
- Post-merge (orch): restart NOT needed (TS-only, tsx --watch reloads); orch re-runs a
  headless accept against :3093 replicating the gate request shape and asserts 200 +
  recordId + GET /api/records/<LPR> branch_resolution[].choices
  == {"lysis-method":"bead-beater","lyse-variant":"variant_a"} (then orch DELETES nothing —
  the created LPR is test data per Brad's standing ruling; record the minted id in the
  handoff).

## Done-gate

advc ACCEPT + orch self-verify + merge --no-ff into cl/integration-2 + orch headless
accept 200 proof. The A5 UI criterion itself is closed by the NEXT gate re-shoot (r5),
which carries DEFECT-1 closure proof (accept -> LPR id -> GET choices). Report at
.hermes/plans/W28-AXISSLUG-1-report.wip-l2t1230.md (unique; orch promotes).

## Carried, NOT in scope (recorded for adjudication, see handoff)

- DEFECT-2 (answered /l ambiguous-noun card re-held in PARTIAL-answer draws; clears on the
  completing path). Engine-card binding ruled "byte-unchanged" by W28-A5m Q2 — new named
  observation, non-blocking, architect adjudication scheduled after the r5 sequence.
- OBSERVATION-3 (sample fact renders /m): the sample card's actionLocation.argument is
  'source', and SAMPLE-CARD-1's approved data table maps not-stated -> /l ONLY for
  argument 'labware', /m by default — the row is following its declared data. Whether
  'source' should also map /l is a data-table amendment question (architect/Brad class),
  not a code defect; rides the same adjudication packet.
