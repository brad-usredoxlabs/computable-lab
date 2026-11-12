# L2-JOURNEY-CAPABILITY-CATALOGUE-1 / u1schema — report

Worktree: /home/brad/cl-wt/L2-JCC-u1schema-lane2
Branch: cl/lane2-journey-cat-u1schema-0925
Base: 4b145639e4ca187284765c02d79c7cd5d965049e
Owned paths changed: schema/workflow/capability-descriptor.schema.yaml (new),
server/src/compiler/journey/capabilityDescriptor.test.ts (new). Nothing else edited.

## Environment note
The worktree had no `server/node_modules`. Created the launcher-standard symlink
`server/node_modules -> /mnt/vast/home/brad/git/computable-lab/server/node_modules`
(gitignored; not an install/scaffold). Baseline before changes:
`npx vitest run src/compiler/journey/ports.test.ts` => 1 passed (1), Tests 12 passed (12).

## Decisions
- Declaration document, not a FAIR record: no `common.schema.yaml#/$defs/FAIRCommon`
  allOf (follows journey-port.schema.yaml, not equipment-capability.schema.yaml).
- Ports typed only by `$ref`: `ports.input[]`/`ports.output[]` are `oneOf` over the six
  `./journey-port.schema.yaml#/$defs/<Name>` members via local `$defs.PortDeclaration`.
  No port field is restated, and the relative ref forces Ajv to resolve the added
  vocabulary schema at compile time (no try/catch around `compile`).
- `implementation.handler_ref` is a pointer string; no handler argument schema embedded.
- `effects` closed over the six required kinds; `permissions`/`surfaces` are patterned
  strings; `availability` is a closed object of named prerequisite keys.
- `idempotency`/`retry`/`reconciliation` are closed enums; `evidence` is an enum array.
- `status` is a closed object requiring the four booleans (declared, implemented,
  available_now, browser_certified); a single string is rejected at `/status`.
- `domain_mutation` => `handler_kind: governed_write` enforced by the schema's own
  root `allOf` if/then (strict mode required `type: object` on the `then` subschema).
- Line budget: schema 124 lines + test 115 lines = 239 (<=240).
- No `capability_id` literal in `server/src/**` or `app/src/**` outside the test
  (grep returned no hits).

## Step 1 — RED (commit ef265dbf)
`cd server && npx vitest run src/compiler/journey/capabilityDescriptor.test.ts` (schema absent):
```
FAIL  src/compiler/journey/capabilityDescriptor.test.ts
Error: ENOENT: no such file or directory, open '.../schema/workflow/capability-descriptor.schema.yaml'
 Test Files  1 failed (1)
      Tests  no tests
```

## Step 2 — GREEN (commit f9fd897d)
Same command, after authoring the schema:
```
 ✓ src/compiler/journey/capabilityDescriptor.test.ts  (7 tests) 5ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```
First GREEN attempt exposed a real strict-mode defect: Ajv refused
`then.properties.implementation` with `strict mode: missing type "object" for keyword
"properties" ... (strictTypes)`; fixed by declaring `type: object` in the `then`
subschema (not by relaxing strict).

## Step 3 — MUTATION PROBE
Flattened `status` to `{ type: string }`, same target test:
```
 FAIL  ... > cannot collapse the four status fields into one string
AssertionError: expected true to be false   (validate accepted status: 'available')
 FAIL  ... > requires all four status keys and rejects a fifth
 Test Files  1 failed (1)
      Tests  5 failed | 2 passed (7)
```
Restored with `git checkout -- schema/workflow/capability-descriptor.schema.yaml`:
`git diff --stat` for that path empty; `git status --short` empty;
sha256 4cf81592b79e9c1240c7272d5de7bb7f68086bfe497233e752069f00538361f2;
re-run green: 7 passed (7).

## VERIFY
- Target test: 1 passed (1), Tests 7 passed (7).
- Regression `ports.test.ts`: 1 passed (1), Tests 12 passed (12) — matches the
  orchestrator's baseline at 4b145639 (unmodified file).
- `tsc --noEmit`: rc=2 with `error TS2688: Cannot find type definition file for 'semver'`.
  This is a PRE-EXISTING environment defect in the shared node_modules
  (`@types/semver/` is an empty root-owned directory, uid 3000) and reproduces verbatim
  in the untouched sibling worktree L2-COMPBIND-u14d4conc-lane2 (same TS2688, same rc).
  Zero diagnostics reference either changed file.
- `git -c core.fileMode=false status --short`: clean at exit.

## Next actions (later units, not this one)
- Catalogue loader/validator + GET route.
- Hygiene lint rules once a catalogue collection exists (no lint YAML added here).
- Fix the shared `@types/semver` install so `tsc --noEmit` can return to rc=0.

L2-JOURNEY-CAPABILITY-CATALOGUE-1-u1schema UNIT unit DONE f9fd897d13ebf4a969c15967c4eafffa4307827c
