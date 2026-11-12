# L2-JOURNEY-PORTS-1 — unit ports2 (binding-time port validator)

Worktree: /home/brad/cl-wt/L2-JOURNEY-PORTS-ports2-lane2
Base HEAD at start: cd07889eaf12a63bce4d9701061c844f8a41679b (verified `git rev-parse HEAD`)

## Decisions

- The four item rejections (a)-(d) are implemented as ONE pure function `validatePortBinding(producer, consumer)`
  in new `server/src/compiler/journey/ports.ts`, per ARCHITECT RULING 2026-11-12T06:19
  (JOURNEY-PORT-LINT-HOST-l2-20261112). No schema edit, no lint host, no record kind, no route, no export plumbing.
- Evaluation order as pinned: named codes win over the generic `port_type_mismatch`, asserted by (b), (c),
  (d-negative) and the mismatch guard. No `throw`; every violation returns one diagnostic.
- One hardcoded domain literal only: `LABWARE_INSTANCE_RECORD_TYPE = 'labware-instance'` (authority
  `schema/lab/labware-instance.schema.yaml`). Port names come from `PORT_TYPES`, layers from
  `MATERIAL_PROVENANCE_LAYERS`, codes from `PortBindingErrorCode`; no layer/record-kind ladders in branches.
- Authority pins: `PORT_TYPES` deep-equals the schema `$defs` keys and `MATERIAL_PROVENANCE_LAYERS` deep-equals
  `$defs.MaterialReference.properties.provenance_layer.enum`, both read from
  `schema/workflow/journey-port.schema.yaml` with the `JourneyPortSchema.test.ts` read idiom.
- Scope: exactly the two owned NEW files. `git diff --stat cd07889e` = 2 files, 230 insertions, nothing else
  (schema, lint, `JourneyPortSchema.test.ts`, `compiler/index.ts`, routes untouched).
- Output budget: 129 (implementation) + 101 (test) = 230 lines, at the cap.
- Added beyond the six briefed cases: one `(a-positive)` control asserting a MATCHING material layer is accepted.
  Reason: the literal M3 mutation (comparison forced always-true) cannot redden case (a) because that fixture's
  layers genuinely differ; the positive control is what makes M3 observable (it goes RED).
- Environment note: this tree had no `server/node_modules` and the brief forbids installing. `server/node_modules`
  was symlinked to the sibling u1vocab clone's `server/node_modules` (gitignored, untracked, not a repo change)
  so the measured baseline runner could execute. No dependency install was performed.

## RED (test file only, implementation absent)

```
RUN  v1.6.1 /home/brad/cl-wt/L2-JOURNEY-PORTS-ports2-lane2/server

 ❯ src/compiler/journey/ports.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/ports.test.ts [ src/compiler/journey/ports.test.ts ]
Error: Failed to load url ./ports.js (resolved id: ./ports.js) in /home/brad/cl-wt/L2-JOURNEY-PORTS-ports2-lane2/server/src/compiler/journey/ports.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

## GREEN

```
 ✓ src/compiler/journey/ports.test.ts  (9 tests) 15ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  3.14s
```

Sibling vocabulary pin still green (file untouched): `npx vitest run src/schema/JourneyPortSchema.test.ts`
→ `Test Files 1 passed (1) / Tests 9 passed (9)`.

## Mutation probes (product file mutated, run, restored from a /tmp copy each time)

M1 — delete the `receipt_id` guard from step 1:

```
→ expected true to be false // Object.is equality
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

(c) RED as required (the binding is accepted without a receipt).

M2 — hoist the generic mismatch (step 5) above the staged rule (step 2):

```
→ expected 'port_type_mismatch' to be 'staged_bound_to_committed' // Object.is equality
→ expected 'port_type_mismatch' to be 'labware_instance_for_definition_requi…' // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
```

(b) RED with `port_type_mismatch` instead of `staged_bound_to_committed`, exactly as required; (d-negative) also
reddens because the same hoist buries step 3 — the ordering deliverable is real, not incidental.

M3 — step 4's layer comparison forced always-true:

```
→ expected false to be true // Object.is equality
AssertionError: expected false to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

Honest result: the failing test is `(a-positive)` (a matching layer is wrongly collapsed). Case (a) itself stays
green under this literal mutation because its two layers genuinely differ, so an always-true comparison still
collapses them — the brief's expectation that (a) reddens cannot hold for this mutation shape.

M3b — extra control, step 4's collapse rule deleted entirely:

```
→ expected true to be false // Object.is equality
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

(a) RED: the rule is genuinely load-bearing.

Revert proof: `git -c core.fileMode=false status --short` after restore printed nothing (clean), and the probe
edits never entered a commit.

## Typecheck

`cd server && npx tsc --noEmit` → exit 0, 0 output lines (baseline at cd07889e was zero).

## Exit status

Tree clean: `git -c core.fileMode=false status --short` → (empty).

## Consumer note

`L2-JOURNEY-COMPILER-1` will call `validatePortBinding` for every step binding rather than restate these rules.
The test and the production path are therefore one code path.
