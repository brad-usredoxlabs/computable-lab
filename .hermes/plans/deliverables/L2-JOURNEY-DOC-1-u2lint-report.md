# L2-JOURNEY-DOC-1 — unit u2lint (the lint leg) report

Lane 2; worktree /tmp/wt-L2-JOURNEY-DOC-1-u2lint; branch cl/lane2-journeydoc-u2lint-1458; base
02e2407f (u1schema merge). Owned files (exactly 3): journeyDocumentLint.ts, journeyDocumentLint.test.ts,
this report. Budget files<=3, lines<=300.

## The change
Export `lintJourneyDocument(document: unknown, catalogue: CapabilityDescriptor[])` + result/diagnostic
types. Rule order (documented in the module header): (i) schema gate first — one Ajv addSchemas
journey-port.schema.yaml before journey-document.schema.yaml (relative $ref idiom,
capabilityCatalogue.ts:25-29); on rejection return the Ajv errors and STOP (never run the semantic
rules on an unshaped document). (ii) capability membership — every steps[].capability_ref in the
catalogue capability_id Set (built once, no case folding). (iii) port chaining — the document's
declared order is the binding order: index i pairs with index i, consecutive steps only; the consumer
requirement is { port_type } plus provenance_layer only when the input port declares it (MaterialReference
is the sole such port); labware_reference left absent so the shipped "undefined means definition"
default applies; validatePortBinding owns the rules and its code+message are relayed VERBATIM; a
missing producer at an index the consumer needs is journey_port_missing_producer. A step port is a
CLOSED vocabulary shape with no port_type; its type is the $def it validates as, via the same one Ajv —
no second mapping table, no port/capability/step literals in the product module. RULE_* are the only
new string constants; no route/boot/app/caching wiring (the unconsumed export is the deliverable).

## RED (raw, module absent)
```
 FAIL  src/compiler/journey/journeyDocumentLint.test.ts
Error: Failed to load url ./journeyDocumentLint.js ... Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

## GREEN (raw, targeted)
```
✓ src/compiler/journey/journeyDocumentLint.test.ts  (5 tests)
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
Pins: ghost-capability → rule=journey_capability_not_in_catalogue, step_id, message names the
capability id, ok:false; staged→committed at index 0 → rule=staged_bound_to_committed, message
byte-for-byte equal to validatePortBinding's own text, with step_id/next_step_id/index; producer
absent → journey_port_missing_producer naming both steps + index; clean plan → ok:true, zero
diagnostics; negative: steps:'not-an-array' is refused by the schema gate (rule=journey_document_schema)
so no semantic rule runs on an unshaped document.

## VERIFY (raw, final state)
`cd server && npx vitest run src/compiler/journey/journeyDocumentLint.test.ts` → `Tests  5 passed (5)`
`cd server && npx vitest run src/compiler/journey/ports.test.ts` → `Tests  12 passed (12)` (baseline)
`cd server && npx tsc -p . --noEmit` → 0 errors (exit 0)
`git -c core.fileMode=false status --short` → empty at exit. (node_modules symlinked from a sibling
with a byte-identical server/package-lock.json because /tmp is inode-pressured; removed before the
final status check; it is gitignored regardless.)

## Disposition
No re-pin of policy-tier/pattern (JourneyDocumentSchema.test.ts:93/:119 own them); optional diagnostic
fields absent, never undefined; no *.lint.yaml / server/src/lint touched (vocabulary has no lint host);
mutation probe not owed. The marker below names the report-body commit R (`git rev-parse HEAD` read
after committing the body, before appending this marker); R's tree contains this report. UI/DOM leg
= separate later unit.

L2-JOURNEY-DOC-1 UNIT u2lint DONE 3ceac8fd47b2ff8ec021ffa2c43dd2d5dd7d8e44
