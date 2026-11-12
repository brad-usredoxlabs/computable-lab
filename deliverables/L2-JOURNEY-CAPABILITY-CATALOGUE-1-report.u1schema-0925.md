# L2-JOURNEY-CAPABILITY-CATALOGUE-1 / u1schema — report

Worktree: /home/brad/cl-wt/L2-JCC-u1schema-lane2
Branch: cl/lane2-journey-cat-u1schema-0925
Base: 4b145639e4ca187284765c02d79c7cd5d965049e
Owned: schema/workflow/capability-descriptor.schema.yaml, server/src/compiler/journey/capabilityDescriptor.test.ts

## Environment note
Worktree was missing `server/node_modules`; created the launcher-standard symlink to
/mnt/vast/home/brad/git/computable-lab/server/node_modules (gitignored, not a scaffold/install).
Baseline harness check before changes: ports.test.ts = 1 passed (1), Tests 12 passed (12).

## Decisions
- Descriptor is a DECLARATION document, not a FAIR record: no common.schema.yaml#/$defs/FAIRCommon allOf.
- Ports are typed by $ref only: `ports.input[]` / `ports.output[]` are `oneOf` of the five
  `./journey-port.schema.yaml#/$defs/<Name>` members via local `$defs.PortDeclaration`. No port
  field is restated. The relative ref means Ajv must resolve the added journey-port schema at
  compile time (no try/catch around compile).
- `implementation.handler_ref` is a pointer string; no handler argument schema is embedded.
- Effects/inventory vocabularies closed with enums; `status` object is closed with
  additionalProperties:false + required of the four booleans.
- domain_mutation => governed_write enforced by root `allOf` if/then on `effects`.

## Steps / evidence
(pending)
