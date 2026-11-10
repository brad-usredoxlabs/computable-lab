# L2-SUBPROTOCOL-EXPAND-1 — unit u2doc report (refresh r2)

Worktree: /home/brad/cl-wt/L2-SUBPROTO-u2doc-r2-lane2
Branch: cl/lane2-subprotocol-expand-1-u2doc-r2-0327 (base 5635fc8e = cl/integration-2 tip)
Owned files (only these changed; `git diff --stat 5635fc8e..HEAD`):
- server/src/protocol/localPlanEventGraph.ts (new, 60 lines)
- server/src/protocol/localPlanEventGraph.test.ts (new, 101 lines)
No edits to localPlanGraph.ts, ProtocolContextService.ts, schema/** or app/src/**.

## Environment deviation (recording, not inventing)
The launcher's start record names worktree /home/brad/cl-wt/L2-SUBPROTO-u2doc-r2-lane2, and the
brief names /tmp/wt-L2-SUBPROTOCOL-EXPAND-1-u2doc-r2. The assigned path existed only AFTER the
run began (created 03:50, first access 03:50:4x failed); I did not create or reset any worktree.
The tree arrived at 5635fc8e on the briefed branch, but with only app/node_modules linked and no
server/node_modules, so the first targeted check was unrunnable. I added the launcher-standard
symlink `server/node_modules -> /mnt/vast/home/brad/git/cl-integration-2/node_modules` (same form
as sibling lanes) and listed both symlinks in .git/info/exclude (local metadata, not tracked) so
`git status` is clean. No npm install was run.

## Seam check (FIRST TARGETED CHECK, before any product file)
$ cd server && timeout 180 npx vitest run src/protocol/localPlanGraph.test.ts
 ✓ src/protocol/localPlanGraph.test.ts  (8 tests) 5ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  739ms

## What changed
`toLocalPlanEventGraphDocument({ id, name?, events, allowedEventTypes })` in
server/src/protocol/localPlanEventGraph.ts — a PURE projection:
- `events` typed via `import type { LocalPlanEvent } from './localPlanGraph.js'` (type-only: no
  runtime cycle with u3's in-flight edit of that module).
- enum check per event BEFORE any output element is built; failure returns
  `{ ok: false, code: 'UNSUPPORTED_EVENT_TYPE', eventType, stepId }` with NO document key.
- allowed set is INJECTED; the product file contains no verb list and no quoted event_type.
- document is exactly `{ kind: 'event-graph', id, ...(name ? { name } : {}), events, labwares: [] }`;
  no status/links/methodContext/createdAt (the attach path, ProtocolContextService.ts:301-320, owns them).
- per event it COPIES eventId/stepId/event_type/details; details object identity is preserved.
The test loads the WHOLE schema tree through SchemaRegistry/loadAllSchemas and reads
`$defs.PlateEvent.properties.event_type.enum` from the registered event-graph schema (27 members,
schema/workflow/event-graph.schema.yaml:313-339), so the allowed set is the schema's own data.
Ajv document validation was attempted and dropped: event-graph.schema.yaml:17 refs
`./datatypes/revision-ref.schema.yaml`, a file that does not exist anywhere under schema/ at this
base (pre-existing dangling ref, not this unit's scope); shape is asserted directly instead.

## RED #1 — module absent
$ cd server && npx vitest run src/protocol/localPlanEventGraph.test.ts
 ❯ src/protocol/localPlanEventGraph.test.ts  (0 test)
Error: Failed to load url ./localPlanEventGraph.js (resolved id: ./localPlanEventGraph.js) in .../localPlanEventGraph.test.ts. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests

## RED #2 — enum guard removed (`if (!allowed.has(...))` -> `if (false)`)
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
    +         "eventId": "1-spin-plate",
    +         "event_type": "centrifuge",
    +         "stepId": "spin-plate",
    +   "ok": true,
    + }
 ❯ ...localPlanEventGraph.test.ts:106:20
    106|     expect(result).toEqual({ ok: false, code: 'UNSUPPORTED_EVENT_TYPE'…
         |                    ^
The centrifuge step was emitted into a document the event-graph schema forbids: the exact defect.

## MUTATION probes
1. enum check -> `if (false)`: raw output above (RED #2), restored; product file clean in git.
2. drop `stepId` from the copied event:
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
 -     "read-plate",
 +     undefined,
 ❯ ...localPlanEventGraph.test.ts:78 (identity assertion), restored.

## VERIFY (raw)
$ cd server && npx vitest run src/protocol/localPlanEventGraph.test.ts
 ✓ src/protocol/localPlanEventGraph.test.ts  (3 tests) 253ms
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ cd server && npx vitest run src/protocol/localPlanGraph.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)          (u1 untouched)

$ cd server && npx tsc --noEmit   -> no output, TSC_EXIT=0

$ git -c core.fileMode=false status --short   -> (empty; clean tree)
$ git diff --stat 5635fc8e..HEAD
 server/src/protocol/localPlanEventGraph.test.ts | 101 ++++++++++++++++++++++++
 server/src/protocol/localPlanEventGraph.ts      |  60 +++++++++++++++++++++

Commits: 56abf34a (RED test), 48a4ae172ba365794db9a67f5763b557452f13b8 (GREEN product). This report is
committed after that sha; both markers below name the commit holding the product, not the report.

L2-SUBPROTOCOL-EXPAND-1 UNIT u2doc DONE 48a4ae172ba365794db9a67f5763b557452f13b8
L2-SUBPROTOCOL-EXPAND-1-u2doc UNIT unit DONE 48a4ae172ba365794db9a67f5763b557452f13b8
