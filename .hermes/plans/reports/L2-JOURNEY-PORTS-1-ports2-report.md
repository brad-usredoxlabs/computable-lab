# L2-JOURNEY-PORTS-1 — unit ports2 (binding-time port validator)

Worktree: /home/brad/cl-wt/L2-JOURNEY-PORTS-ports2-lane2
Base HEAD at start: cd07889eaf12a63bce4d9701061c844f8a41679b (verified via git rev-parse HEAD)

## Decisions

- Implement the four item rejections (a)-(d) as ONE pure function `validatePortBinding(producer, consumer)`
  in new `server/src/compiler/journey/ports.ts`, per ARCHITECT RULING 2026-11-12T06:19
  (JOURNEY-PORT-LINT-HOST-l2-20261112). No schema edit, no lint host, no record kind, no route.
- Named codes win over the generic `port_type_mismatch` fallback; evaluation order pinned in the unit brief
  and asserted by cases (b), (c), (d-negative) plus the mismatch guard case.
- Authority: `PORT_TYPES` and `MATERIAL_PROVENANCE_LAYERS` are pinned by test against
  `schema/workflow/journey-port.schema.yaml` ($defs keys and MaterialReference.provenance_layer.enum), so the
  module holds no second copy of the vocabulary. Only hardcoded domain literal allowed:
  `LABWARE_INSTANCE_RECORD_TYPE = 'labware-instance'` (authority: schema/lab/labware-instance.schema.yaml).
- Environment note: this tree's `server/node_modules` was absent (no install allowed by the brief). It was
  pointed at the sibling u1vocab clone's `server/node_modules` with a symlink (gitignored, untracked) so the
  measured baseline test runner could execute. No dependency install was performed.

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

(pending)

## Mutation probes

(pending)

## Consumer note

`L2-JOURNEY-COMPILER-1` will call `validatePortBinding` for every step binding rather than restate the rules.
The test and the production path are therefore one code path.
