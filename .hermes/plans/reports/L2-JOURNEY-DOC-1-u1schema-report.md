# L2-JOURNEY-DOC-1 / unit u1schema — report

Item: L2-JOURNEY-DOC-1 (lane 2), unit u1schema (SCHEMA leg only).
Worktree: /home/brad/cl-wt/L2-JOURNEY-DOC-u1schema-lane2
Branch: cl/lane2-journeydoc-u1schema-1334
Base actually got: 29f153cdbbcc17252fa266ced34b73bf757a74d1 (matches brief).
Acceptance: waived (data-only unit); graded by the validator verdict under the real
loader/registry/Ajv pipeline.

## Changed files (only these; prohibited paths untouched)

- schema/workflow/journey-document.schema.yaml (NEW, 109 lines)
- server/src/schema/JourneyDocumentSchema.test.ts (NEW, 151 lines)

Total 260 lines, 2 files — inside the stated output budget.
`git diff --name-only 29f153cd..HEAD` = exactly those two paths.

## Decisions

- Document is NOT a FAIR record: no common.schema.yaml allOf, mirroring
  journey-port.schema.yaml:13 discipline.
- Step ports are not restated: $defs.PortBinding is a oneOf of six relative
  $refs `./journey-port.schema.yaml#/$defs/<Port>` (same spelling form as
  capability-descriptor.schema.yaml:37). Ajv resolves them against this $id, so
  an unshipped $defs name is a compile error, not an open slot.
- capability_ref reuses the catalogue pattern verbatim
  `^[a-z][a-z0-9_.-]*$` and the test pins equality with
  capability-descriptor.properties.capability_id.pattern — one authority.
- Root and every declared object are closed with additionalProperties:false
  (no if/then/unevaluatedProperties, so root closure is direct).
- Fields: identity/lineage (journey_id, revision, authoring_actor,
  parent_journey, thread_ref), request_anchor (message_id + verbatim_text,
  immutable by contract), objective, completion_contract (observable array),
  parameters[{name,value,provenance,status}] with provenance enum
  [user-supplied, resolved, ai-proposed] and explicit status
  [resolved, unresolved], steps[{id, capability_ref, input_ports, output_ports,
  interaction_mode, presentation_surface?}], alternatives{options<=8,
  selection_authority enum [user, declared_policy]}, return_contract
  {checkpoint_ref, permitted_result_types, require_explicit_resume},
  assumptions[] and unresolved_questions[] as separate arrays.
- Deliberately NOT here: policy-tier enforcement, capability existence,
  port-chain feasibility, UI draft handling (separate lint/validator/UI units).
  admitCapabilityCatalogue is not called anywhere in the test.
- Test fixtures are DERIVED from the loaded document (required lists, declared
  key sets, enums, $refs); no port kind, port field or enum member is a TS
  literal. Literals: schema $ids and fixture-locating field names.

## Contract test coverage (8 tests, all derived)

1. resolves under $id; every declared object node additionalProperties:false.
2. fully-populated plan built from the document validates.
3. self-granted policy tier (`policy_tier`) refused: additionalProperties /
   params.additionalProperty=policy_tier at '/'.
4. step missing stable `id` refused: required/missingProperty=id at /steps/0.
5. port $refs = exactly the six shipped $defs (derived set equality, unique);
   a probe document with a bogus $defs member throws on compile.
6. capability_ref pattern === catalogue capability_id pattern; a value outside
   it refused with keyword pattern at /steps/0/capability_ref.
7. provenance outside the declared enum refused with keyword enum at
   /parameters/0/provenance; allowedValues exclude it and match the document.
8. assumptions/unresolved_questions are two distinct arrays; a merged
   `open_items` plan is refused (additionalProperties + two required missings).

## Mutation probes (each applied exactly as stated, then reverted)

Mutation A — schema/workflow/journey-document.schema.yaml, one line deleted:
removed the root-level `additionalProperties: false` (the line between
`type: object` and `required: [journey_id, ...]` at column 0; the only
column-0 occurrence). `git diff --stat`: 1 file changed, 1 deletion.
Result (raw): `Tests  3 failed | 5 passed (8)`; failing tests were
- resolves under its declared $id, closed at every object node
- refuses a plan that grants itself a policy tier
- keeps assumptions and unresolved_questions as two distinct arrays
=> the closedness pin is not vacuous. Reverted via git checkout; status clean.

Mutation B — demonstrating the FIXTURE-DERIVATION direction (as briefed):
B1: replaced the test's single enum line
`if (Array.isArray(n.enum)) return n.enum[0];` with a hardcoded lookup
(a 3-value provenance list keyed by `'user-supplied,resolved,ai-proposed'`,
plus `'resolved,unresolved'`), AND added a 4th member to the document:
`enum: [user-supplied, resolved, ai-proposed, model-inferred]`.
Result (raw): `Tests  8 passed (8)` — nothing catches a document-side 4th
value when the fixture list is hardcoded; the hardcoded key simply misses and
the fallback keeps the fixture valid.
B2: reverted only the test hardcode, kept the document's 4th member.
Result (raw): `Tests  8 passed (8)` — membership is (correctly) YAML-owned; the
contract test pins the SHAPE/refusal behaviour, not a second copy of the
vocabulary. This is why the derivation is kept: the fixture follows the
document, so vocabulary edits can never leave a stale literal behind.
(An earlier, mis-scoped B attempt hardcoded the enum by value membership and
wrongly hit the status enum; it also produced 1 failed | 7 passed. Discarded as
an invalid probe; files were restored before the valid B1/B2 runs above.)
All probe edits reverted; `git -c core.fileMode=false status --short` empty.

## Verification (raw)

Targeted:
  cd server && npx vitest run src/schema/JourneyDocumentSchema.test.ts src/schema/JourneyPortSchema.test.ts
  ✓ src/schema/JourneyPortSchema.test.ts  (9 tests) 612ms
  ✓ src/schema/JourneyDocumentSchema.test.ts  (8 tests) 668ms
  Test Files  2 passed (2)
       Tests  17 passed (17)
  Duration  1.48s
JourneyPortSchema.test.ts stays 9/9 GREEN.

RED (before the schema existed), raw tail:
  Test Files  1 failed (1) / Tests  8 failed (8) — TypeError: Cannot read
  properties of undefined (reading 'schema') at doc() (schema not registered).

Typecheck: `cd server && npx tsc --noEmit` → exit 0, zero output lines.

Final: `git -c core.fileMode=false status --short` → empty.

## Next actions / ownership

- Lint/validator unit: self-granted policy tier enforcement beyond structural
  closure, capability existence via admitCapabilityCatalogue, output→next-input
  port feasibility. Needs the catalogue loader; not in scope here.
- UI unvalidated-draft leg: separate unit.
- Orchestrator owns reloading the lane stack only if YAML changes are exercised
  live (this unit adds a schema file; no lane reload was performed here).
