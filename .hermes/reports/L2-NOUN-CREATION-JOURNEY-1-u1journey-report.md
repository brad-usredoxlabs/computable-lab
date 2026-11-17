# L2-NOUN-CREATION-JOURNEY-1 u1journey — lane 2

Branch: cl/lane2-nounjourney-u1-1655
Cycle-1 base: 2fe105a7981984656d2aa60bd888798e6b032fb4 (cycle-1 tip; 4 commits 264453b7e..2fe105a79)
Adversarial cycle-1 verdict: FIX-FUNCTIONAL, 3 findings (report
/home/brad/.hermes/cl/lanes/2/reports/L2-NOUN-CREATION-JOURNEY-1-u1journey-advc-c1-l2t2702.md)

## What the journey is

A single unbound-material fact turn ("I used DMEM") carries a server-projected
`journey` (config/journey/declarations/noun-create.yaml): declared doors
(`add-from-vendor-or-ontology` -> surface `ingestion`, `record-create-existing`
and `record-create-new` -> surface `record-create`), a `prefillName` candidate,
a `journeyId` and a return `checkpointRef`. Doors NAVIGATE (anchors, no writes);
the committed creation resumes the origin turn by identity on the return leg.

## Cycle-1 result (unchanged in this cycle, re-verified)

- Grouped card (ChatClarificationCard) renders one anchor per declared door,
  `chat-clarification-journey-doors` list + `chat-clarification-door-<id>`.
- Return leg parks and resumes the origin turn by identity.
- Cycle-1 shipped a hardcoded `DECLARED_SURFACE_ROUTE` for every surface and a
  single-fact arm that ignored `request.journey`; the server read `declared.domain`
  raw. All three are corrected below.

## Cycle 2 — three fixes

### FIX 1 (BLOCKER, server) — domain slot through the single accessor
`server/src/compiler/journey/journeyDeclarationDoors.ts` — `isMaterialNounContract`
now imports `declaredDomains` from `../scientistIntent/vocabulary.js` and returns
`declaredDomains(declared.domain).includes(MATERIAL_ARG_DOMAIN_TAG)`. No raw slot
read, no local `toLowerCase()`, per ruling c94bd866 §1.2 and the committed sibling
suite `src/compiler/resolution/domainAccessorDiscipline.test.ts` (prohibited file,
not edited). Commit 993089704.

### FIX 2 (BLOCKER, app) — single-fact arm renders declared doors
`app/src/agent/ChatLog.tsx` — the single-request absence arm now branches on
`request.journey !== undefined && request.journey.doors.length > 0` and renders the
same journey-doors markup (same classNames, `chat-clarification-journey-doors` /
`chat-clarification-door-<id>` testids, href via `journeyDoorHref`). With no journey
key the arm is byte-identical to before (labware anchor preserved; ChatLog.test.tsx
shape pin stays green). New ChatLog-level test `ChatLog.journeyDoors.test.tsx`
renders ChatLog with ONE request (2 doors + absence): 2 door anchors, and NO
`chat-clarification-absent-create` labware href. Commit f53e13003.

### FIX 3 (MAJOR, app) — door routes come from the surfaces registry
`app/src/agent/journeyDoorHref.ts` — `journeyDoorHref(door, journey, registry?)`
finds the door's surface in `SurfaceSpec[]` and uses `spec.path` with every
`:token` filled (`:nodeType` -> `material`, and `nodeType=material` also carried in
the query). `ingestion` -> `/ingestion?...`, `record-create` ->
`/record/new/material?...`. `DECLARED_SURFACE_ROUTE = '/lab/materials/new'` remains
ONLY as the documented fallback when the registry lacks the surface / has not
loaded. Registry loaded through `useJourneyDoorSurfaces(enabled)` in the same
module (gated on a door actually rendering, so non-journey hosts never fetch);
wired in both `ChatClarificationCard` and the `ChatLog` single arm. Tests stub
`loadSurfaceRegistry`. Commit 98c56803f.

## Verification (raw)

server, targeted (FIX 1 RED->GREEN):
  Test Files  50 passed (50)
       Tests  406 passed (406)

server `src/compiler` sweep, tip 98c56803f:
  Test Files  22 failed | 204 passed (226)
       Tests  47 failed | 1972 passed (2019)
same sweep at base 2fe105a79 (checked out detached, then restored):
  Test Files  23 failed | 203 passed (226)
       Tests  48 failed | 1971 passed (2019)
=> exactly the one fixed discipline test flips; no new failures. The 47 residual
failures are pre-existing at base (fixture/golden/unit-parse environment set).

app `src/agent`:
  Test Files  39 passed (39)
       Tests  212 passed (212)
      Errors  1 error
The single unhandled rejection is PRE-EXISTING and unrelated: reproduced at base
2fe105a79 on `src/agent/HarnessChatPane.clarificationEnds.regatefix2.test.tsx`
(`Failed to parse URL from /api/search/jsonld`, ClarificationPicker -> resolveLabware).

app `npx tsc --noEmit -p .` -> 4 errors, all pre-existing, none in diff files
(SchemaRecordForm.tsx x3, RefCombobox.ontologyref.test.tsx x1).

root `npm run typecheck` -> rc 2 from the known pre-existing server
`request.parts` / `request.file` six-error condition (AIHandlers x3,
AiIngestionHandlers, ExtractProtocolHandler, sequenceRoutes); server workspace fails
before the app workspace runs, so app coverage is the tsc run above. Zero new
errors attributable to this diff.

## Files changed (cycle 2)

- server/src/compiler/journey/journeyDeclarationDoors.ts
- app/src/agent/ChatLog.tsx
- app/src/agent/ChatClarificationCard.tsx
- app/src/agent/journeyDoorHref.ts
- app/src/agent/ChatLog.journeyDoors.test.tsx
- app/src/agent/ChatClarificationCard.journeyDoors.test.tsx
- app/src/agent/journeyDoorHref.test.ts
- this report

## Next actions / notes

- Independent adversarial + browser review still owns acceptance (AC2 live card,
  AC3 navigation). Not claimed here.
- Grouped-card AC1/AC6 unregressed by test; no production behaviour changed for
  requests without a `journey`.

## Cycle-2 marker

Report commit: 897c2ee3208a4dc8d077a7a993e19def61603b99
L2-NOUN-CREATION-JOURNEY-1-u1journey-v2 UNIT unit DONE 897c2ee3208a4dc8d077a7a993e19def61603b99
