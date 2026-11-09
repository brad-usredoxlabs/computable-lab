# Report: L2-RUN-PROTOCOL-LIST-1-u1fix4

## Unit: fix4 (D1 test fix + D2 product fix + D3 marker fix)
## Item: L2-RUN-PROTOCOL-LIST-1 / unit u1fix4 (advc c3d MINOR defects)
## Lane: 2

## What was done

### D1 — Lead-order pin on schema-realizable carrier (run.localProtocolRefs)
Rewrote the "lead protocol from localProtocolRefs list" test so the ordered list
lives on the RUN payload (run.localProtocolRefs, schema-valid per run.schema.yaml:139)
instead of the planned-run payload (forbidden by planned-run.schema.yaml:9, unevaluatedProperties: false).

The two local-protocols have DISTINCT parents: LPR-z inherits PRT-alt, LPR-a inherits PRT-qPCR.
LPR-z is first but sorts AFTER LPR-a alphabetically, so both .sort() and .slice(-1)[0] mutants
pick LPR-a -> PRT-qPCR (RED), while the assertion expects PRT-alt.

### D2 — Empty-array presence guard
Replaced the truthiness test at ProtocolContextService.ts:445 with an explicit presence
predicate: `protocolIdsOf(plannedPayload).length > 0 || asObject(plannedPayload.localProtocolRef).id !== undefined`.
This treats an empty `localProtocolRefs: []` array as ABSENT, so it falls through to the
run's refs instead of selecting the planned payload as source and returning no protocol IDs.

Added a test pin for this defensive/legacy guard: planned payload with `localProtocolRefs: []`
+ run payload with a singular `localProtocolRef` resolves the run's ref. Current
planned-run.schema.yaml does not admit `localProtocolRefs`, so this guards against legacy
shapes, not current schema-admitted payloads.

### Fallback test comment fix
Corrected the fallback-test comment to note that both LPR-A and LPR-B inherit PRT-qPCR
(they share the same parent), so the assertion resolves PRT-qPCR from the first entry.

### D3 — Marker
Moved report from root `report-u1fix3.md` to `.hermes/plans/deliverables/`.
Previous marker named `f12ce43d` (8-hex, parent commit) — replaced with full 40-hex sha.

## Mutation probes (all passed)
- M-a: `.slice().sort()[0]` -> 1 failed | 12 passed (RED, lead-order test catches it)
- M-b: `.slice(-1)[0]` -> 1 failed | 12 passed (RED: lead-order test catches it; the empty-array pin does NOT — its fixture list is single-element, so first==last. Noted honestly per advc c5 D1.)
- M-c: revert presence predicate to truthiness -> 1 failed | 12 passed (RED, empty-array test catches it)

## Changed files
- server/src/protocol/ProtocolContextService.ts (+2/-1 lines)
- server/src/protocol/ProtocolContextService.test.ts (+37/-8 lines: rewrote lead-order test, added empty-array pin, fixed comment)
- .hermes/plans/deliverables/L2-RUN-PROTOCOL-LIST-1-report.u1fix4.md (new, replaces report-u1fix3.md)

## FIX RUN pw (l2t1557)
Corrected M-b mutation report line per advc c5 D1: "2 failed | 11 passed" -> "1 failed | 12 passed"; empty-array pin does NOT catch it (fixture is single-element, first==last). Advc report: /home/brad/.hermes/cl/lanes/2/reviews/L2-RUN-PROTOCOL-LIST-1-u1fix4-advc-c5-l2t1557.md

## Verification
1. ProtocolContextService.test.ts: Tests 13 passed (13) — 12 existing + 1 new empty-array pin
2. runProtocolList.test.ts: Tests 9 passed (9) — unchanged
3. tsc --noEmit: exit 0, no diagnostics

L2-RUN-PROTOCOL-LIST-1-u1fix4pw UNIT unit DONE 77a7e9368e6f6e4b112d9151adf8be8acc054abc
