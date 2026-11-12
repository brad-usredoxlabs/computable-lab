# L2-JOURNEY-CAPABILITY-CATALOGUE-1 — unit u2loader report

Worktree: /home/brad/cl-wt/L2-JCC-u2loader-lane2 (lane 2)
Branch: cl/lane2-journey-cat-u2loader-1112
Base: 93fd0f8b (merge u1schema; STEP 0 gate passed — capability-descriptor.schema.yaml present)

## Decisions
- STEP 0: `schema/workflow/capability-descriptor.schema.yaml` present → proceed.
- Ajv authority: mirror unit 1's `capabilityDescriptor.test.ts` idiom — Ajv2020 `{ strict: true, allErrors: true }`,
  `addSchema(journey-port)` then `addSchema(capability-descriptor)`, so the descriptor's relative
  `./journey-port.schema.yaml#/$defs/<Name>` refs resolve at compile time. Compiled ONCE per admission call.
- Result type keeps the brief's union but carries admitted siblings on failure, because case (e) requires one bad
  file not to blank the catalogue:
  `{ ok: true; capabilities } | { ok: false; capabilities; diagnostics }`.
- Diagnostics format: `<file>: <instancePath or synthesized property path>: <Ajv message>`.
- Deterministic order: sort admitted capabilities by `capability_id` (never directory listing order).
- No handler-id list in the module; known ids are a `ReadonlySet<string>` parameter.

## Files
- server/src/compiler/journey/capabilityCatalogue.test.ts (new)
- server/src/compiler/journey/capabilityCatalogue.ts (new, GREEN step)

## Step 1 — RED (raw)
$ cd server && npx vitest run src/compiler/journey/capabilityCatalogue.test.ts
```
RUN  v1.6.1 /home/brad/cl-wt/L2-JCC-u2loader-lane2/server

 ❯ src/compiler/journey/capabilityCatalogue.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/capabilityCatalogue.test.ts [ src/compiler/journey/capabilityCatalogue.test.ts ]
Error: Failed to load url ./capabilityCatalogue.js (resolved id: ./capabilityCatalogue.js) in /home/brad/cl-wt/L2-JCC-u2loader-lane2/server/src/compiler/journey/capabilityCatalogue.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```
