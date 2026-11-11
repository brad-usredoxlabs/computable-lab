L2-ONTOLOGY-ANCHOR-SOURCES-1 — Unit o3bcl (paperwork closeout)
================================================================

Item: L2-ONTOLOGY-ANCHOR-SOURCES-1, lane 2
Branch: cl/lane2-ontologysrc-o3b-0040
Base sha: 63f50e46ce0bdac8a22b245c99ce64bc2fa568f8
Scope: Report only. Zero product code changes.

WHAT LANDED
-----------
The optional `ontology_ref` object on the labware-definition schema
(`schema/workflow/labware-definition.schema.yaml`) and a 4-test anchor
file (`server/src/schema/LabwareDefinitionAnchor.test.ts`).

Schema changes at 63f50e46:
  - Line 34: `ontology_ref:` — new optional property (type: object)
  - Line 36: `additionalProperties: false` — no extra keys permitted
  - Line 37: `required: [ kind, id ]` — both fields mandatory when present
  - Line 43-49: `kind` must be `ontology`; `id` is a CURIE string matching
    `^[A-Z][A-Za-z0-9]*:[0-9A-Za-z_.-]+$` (uppercase prefix, colon separator,
    alphanumeric/local-part characters).

The field is absent-by-default so every existing seed record still validates
regardless of whether it carries an `ontology_ref`.

Test file: `server/src/schema/LabwareDefinitionAnchor.test.ts` (138 lines)
  - Test 1 (line 55): accepts a valid ontology anchor
  - Test 2 (line 74): seed labware-definition records validate (optional ontology_ref)
  - Test 3 (line 101): rejects a malformed CURIE
  - Test 4 (line 120): rejects a wrong kind value

EVIDENCE
--------
Command:
  cd server && node node_modules/vitest/vitest.mjs run src/schema/LabwareDefinitionAnchor.test.ts

Raw output (executed 2026-11-11 01:28:14 EST):

  RUN  v1.6.1
  stdout | ... > seed labware-definition records validate (optional ontology_ref)
  Validated 13 of 39 seed labware-definition records

   ✓ src/schema/LabwareDefinitionAnchor.test.ts  (4 tests) 116ms

   Test Files  1 passed (1)
        Tests  4 passed (4)
     Start at  01:28:14
     Duration  597ms (transform 51ms, setup 0ms, collect 87ms,
                   tests 116ms, environment 0ms, prepare 91ms)

N = 13, M = 39. Verbatim: "Validated 13 of 39 seed labware-definition records".

WHAT THE PIN ACTUALLY ASSERTS
-----------------------------
The seed test's only assertion is `expect(validated).toBeGreaterThan(0)` at
`LabwareDefinitionAnchor.test.ts:98`. It does NOT assert that every seed
definition validates.

Classification: (b) — the 26 non-validating records fail on pre-existing
payload violations UNRELATED to `ontology_ref`. A diagnostic run showed the
failure keywords are `additionalProperties` (38 occurrences) and `type` (24
occurrences). None of the errors reference `ontology_ref`.

Representative error from `labware-definition/2_well_reservoir.yaml`:
  - keyword: "additionalProperties", message: "Unknown property: specificity"
  - keyword: "additionalProperties", message: "Unknown property: tags"
  - keyword: "type", message: "Expected type: object"

These are pre-existing schema mismatches in seed data (e.g. extra properties
like `specificity`, `tags` not declared in the schema; wrong types). They
are out of this unit's scope.

OBLIGATION FILED
-----------------
Cross-reference: L2-L2-VACUOUS-PINS-DEBT (task-list.md:18069) is the owner
of strengthening the pin to a meaningful assertion (e.g., validating all
matching records). This unit does NOT strengthen the assertion — it is a
known, separately-owned debt item.

INVARIANTS
----------
- `ontology_ref` stays OPTIONAL in the schema. Presence is required by the
  create flow, not by schema validation.
- No vendor/lot/catalogue fields are introduced by this change.
- No record data was edited.
- The CURIE namespace stays `lwo:`/`leq:` style (no lab-local namespace
  punning here).

Changed files in this unit:
- `.hermes/plans/reports/L2-ONTOLOGY-ANCHOR-SOURCES-1-o3b-report.md` (this file)

No product code was modified. The schema and test were committed at 63f50e46
by the o3b code leg; this commit carries only the report.

L2-ONTOLOGY-ANCHOR-SOURCES-1-o3bcl UNIT 1 DONE 1a9135e6e9dccdd41ac442e10e611faef794399d
