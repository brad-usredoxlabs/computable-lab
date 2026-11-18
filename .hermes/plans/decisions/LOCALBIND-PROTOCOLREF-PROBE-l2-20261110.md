# Probe result — why the role-binding proposals route returns nothing (L2-PROTOCOL-LOCAL-BIND-1)

Run 2026-11-10 at Brad's request, after the LOCALBIND browser gate (receipts
`LOCALBIND1-browser-g1-20261110T200820Z`, `api-proposals-response.json` = `{"protocols":[]}`) reported
"no protocolRoles in served data" and asked whether to seed a fixture or file a Brad card.

**Answer: neither. It is a product defect with a one-function cause, proven by execution.**

## Evidence, in the order it was gathered

1. Both planned-runs in the served store carry `protocolRef` and `sourceRef`, and **neither carries
   `localProtocolRef` or `localProtocolRefs`**:
   - `PLR-w2-8-a5-fixture-semantic-family-59df1c7e` — keys: bindings, kind, links, methodEventGraphId,
     protocolLayer, protocolRef, sourceRef, sourceType, state, …
   - `PLR-…-realized-in-run-7e079cde` — same shape.
2. `GET /api/runs/<either id>/role-binding-proposals` returns `{"protocols":[]}` for both.
3. `server/src/protocol/roleBindingProposal.ts:154` iterates `protocolIdsOf(runPayload)`;
   `protocolIdsOf` = `protocolRefsOf(...).map(id)` (`runProtocolList.ts:73`);
   `protocolRefsOf` (`runProtocolList.ts:37-70`) reads **only** `localProtocolRefs` then
   `localProtocolRef`. `protocolRef` / `sourceRef` are never consulted.
4. Executed probe (`npx tsx`, temporary file, removed afterwards) against the real function:
   - lab-layer payload (protocolRef + sourceRef) -> `[]`
   - local-layer payload (localProtocolRefs)     -> `["prt-seed-biological-transfer"]`
   - both present                                -> `["local-proto-1"]` (list wins)
   So a lab-layer run is invisible to every consumer of this function.
5. Separately: `GET /api/records/CAN-protocol-1791692042751` (the id both runs point at) returns
   `NOT_FOUND`. That protocol is not in the served store; the only protocol in the store is
   `prt-seed-biological-transfer`, which **does** declare `roles.labwareRoles` (`source`, `plate`).
   So even after a fallback is added, these two fixture runs can only report a dangling reference —
   which is correct and must be reported, not swallowed.
6. `server/src/protocol/runProtocolList.test.ts` covers local-singular, local-list, both, and neither.
   There is no `protocolRef` case, which is why the gap shipped green.

## Why the earlier advc finding did not catch it

advc c1 (l2t2335) reported "D1 roles read from local-protocol instead of universal via
inherits_from.id -> every real run returns roles:[]". That was a different link in the same chain
(role declaration lookup). The transport step above it — which protocol ids the run even has — was
assumed correct and never exercised with a lab-layer run.

## Required fix (one leg, four assertions)

1. `protocolRefsOf` gains `protocolRef` (and `sourceRef` when `sourceType === 'protocol'`) as a
   FALLBACK after the local list and local singular, preserving order and dedupe by id. Lab-layer
   runs must stop being invisible. Precedence stays: local list > local singular > protocolRef >
   sourceRef.
2. A run whose resolved protocol id does not exist in the store must produce an explicit, visible
   outcome (`protocolNotFound` with the id, or a role-level reason) — **never** `{"protocols":[]}`
   with a 200, because an empty list is indistinguishable from "this run has no protocols", which is
   exactly how the gate read it. Empty must not look like success.
3. Tests: lab-layer payload returns its id; both-forms payload does not duplicate; dangling id
   produces the explicit not-found shape; existing local cases unchanged.
4. Attach/detach and the ordered run-protocol list render must be re-checked after the change, since
   they share this function — a lab-layer run should show its protocol in the list too.

## Consequence for the gate

No fixture and no Brad card. After this leg, the gate's precondition is producible through product
paths (attach a protocol that exists in the store and declares roles), consistent with
`GATE-PRECONDITION-SEEDING-l2-20261110.md`.

## Cost note

`{"protocols":[]}` returning 200 is the same failure class twice in one day: the spec-sheet gate's
"empty proposal list looked like success" and this. A route that can be empty for two different
reasons must say which.
