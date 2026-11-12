# L2-JOURNEY-CAPABILITY-CATALOGUE-1 — unit u2loader report

Worktree: /home/brad/cl-wt/L2-JCC-u2loader-lane2 (lane 2)
Branch: cl/lane2-journey-cat-u2loader-1112
Base: 93fd0f8b (merge u1schema; STEP 0 gate passed — capability-descriptor.schema.yaml present)

## Decisions
- STEP 0: `schema/workflow/capability-descriptor.schema.yaml` present → proceed (not authored here).
- Ajv authority: mirror unit 1's `capabilityDescriptor.test.ts` idiom — Ajv2020 `{ strict: true, allErrors: true }`,
  `addSchema(journey-port.schema.yaml)` then `addSchema(capability-descriptor.schema.yaml)`, so the descriptor's
  relative `./journey-port.schema.yaml#/$defs/<Name>` refs resolve at compile time. Compiled ONCE per admission call.
- Result type keeps the brief's union but carries admitted siblings on failure, because case (e) requires one bad
  file not to blank the catalogue: `{ ok: true; capabilities } | { ok: false; capabilities; diagnostics }`.
- Diagnostics: `<file>: <instancePath or synthesized property path>: <Ajv message>`; dangling handler:
  `<file>: /implementation/handler_ref: unknown handler id '<id>'`.
- Shape is checked before `handler_ref` is read, so a malformed doc can never crash admission.
- Deterministic order: admitted capabilities sorted by `capability_id`; file names sorted before reading.
- No handler-id list in the module; known ids are a `ReadonlySet<string>` parameter (unit 3 route passes it).
- Budget: 2 files, 200 lines total (91 module + 109 test). No new dependency, no schema/route edits.

## Files
- server/src/compiler/journey/capabilityCatalogue.ts (new)
- server/src/compiler/journey/capabilityCatalogue.test.ts (new)

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
Commit: 6ff031fc (RED test + report skeleton).

## Step 2 — GREEN (raw)
$ cd server && npx vitest run src/compiler/journey/capabilityCatalogue.test.ts
```
 ✓ src/compiler/journey/capabilityCatalogue.test.ts  (5 tests) 136ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```
Neighbour sanity in the same run: `ports.test.ts` 12 passed; 2 files / 17 tests passed.
Commits: f645abac (module), 8117ca3 (test budget trim).

## Step 3 — MUTATION PROBE (raw)
Applied EXACTLY: `if (!knownHandlerIds.has(handlerRef)) {` → `if (false && !knownHandlerIds.has(handlerRef)) {`
in `capabilityCatalogue.ts:65`. Run:
```
 ❯ src/compiler/journey/capabilityCatalogue.test.ts  (5 tests | 1 failed) 131ms
   ❯ ... > (b) rejects a dangling handler_ref, naming the file and the id verbatim
     → expected rejection, got 1 admitted

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```
Case (b) is the only failure → the membership check is the mechanism; no second admission path.
Restored the line and re-ran: 1 file / 5 tests passed (Duration 2.17s). Tree carries no mutation.

## Verify before exit (raw)
$ cd server && npx vitest run src/compiler/journey/capabilityCatalogue.test.ts src/compiler/journey/ports.test.ts
```
 ✓ src/compiler/journey/ports.test.ts  (12 tests) 16ms
 ✓ src/compiler/journey/capabilityCatalogue.test.ts  (5 tests) 134ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
```
$ cd server && npx tsc --noEmit  → TSC_EXIT=0 (no output)
$ git -c core.fileMode=false status --short → clean at exit
$ ls /home/brad/.jcc-u2-scratch → No such file or directory (test afterAll removed it)

## Remaining for later units
- Unit 3: read-only GET route that calls `loadCapabilityCatalogueDir` with the real handler-id set (ToolBridge /
  governed handlers); do not re-implement validation. Browser-gated proof belongs there.
- Duplicate `capability_id` across files is not diagnosed in this unit (not in acceptance); candidate follow-up.


L2-JOURNEY-CAPABILITY-CATALOGUE-1 UNIT 2 DONE d756600e17b0253fd9e7fded0b352bb79b663919
