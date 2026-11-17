# L2-NOUN-CREATION-JOURNEY-1 · u1journey · cycle-3 (c3) — implementation report

Lane 2 · worktree /home/brad/cl-wt/L2-NOUN-CREATION-JOURNEY-1-u1journey-lane2
Branch cl/lane2-nounjourney-u1-1655 · base c84c59753cdd66eb07885745d9b2c0e81d866a16
Tier: consequential. Fixing advc c2 §4 D1-D3
(/home/brad/.hermes/cl/lanes/2/reviews/L2-NOUN-CREATION-JOURNEY-1-u1journey-advc-c2-l2t2704.md).

## What changed (3 seams, 5 commits)

1. D2 — the declared record type becomes the authority (commit 019e723ac)
   `server/src/compiler/journey/journeyDeclarationDoors.ts`
   - `JourneyDeclarationRef.createdType?: string`, projected by a new
     `createdTypeFromDocument(doc)` that reads
     `steps[].human_task.output_port.record_type` and returns '' when the
     declaration names none. `journeyRefFromDocument` spreads it ONLY when
     non-empty (optional field absent, never `undefined`).
   - `server/src/compiler/resolution/types.ts` — `ClarificationJourneyFact.createdType?`
     so the wire type does not drop the projected field.
   - `app/src/types/ai.ts` — client mirror `journey.createdType?`.
   - new `server/src/compiler/journey/journeyDeclarationCreatedType.test.ts`
     (4 tests): the shipped declaration projects `material` (expected value read
     from the YAML, not a literal); a mutated copy `labware` is what projects;
     a removed `record_type` leaves the key ABSENT; `nounCreateJourneyForCandidate`
     carries it and the door count is the declared 3.

2. D3 — one route authority, one builder (commit 27c6f40ce)
   - DELETE `const JOURNEY_NODE_TYPE = 'material'` and `function surfaceRouteFor(...)`
     from `app/src/agent/journeyDoorHref.ts` (plus its hardcoded
     `DECLARED_SURFACE_ROUTE` map). `journeyDoorHref(door, journey, registry?)`
     now returns `string | null`:
       - registry undefined (not yet answered) → null
       - `shared/surfaces/surfaceRoute.ts` → new `declaredSurfaceRoute(target, registry)`
         resolves the route from the SAME declarative registry (`SurfaceSpec[]`)
         and the SAME gating rules as the existing `surfaceRoute`:
           token surface → requires the registry to declare `params[token]` AND the
           journey to declare a created type, otherwise null (fail closed);
           a path with no token is its own route (nothing to fill);
           more than one token → null (one completion creates one record).
         An object route fills `active.objectId` and type-checks; a create route
         fills the DECLARED created type — documented at the helper.
       - query string unchanged: prefillName, surface, door, journey, checkpoint.
     `ChatLog.tsx` and `ChatClarificationCard.tsx` render a DEAD door for null
     (no href, `aria-disabled`, title says no declared route exists) instead of
     pointing somewhere guessed.
   - `surfaceRoute.test.ts`: existing `describe('surfaceRoute')` untouched; new
     `describe('declaredSurfaceRoute')` (8 tests) covers declared type fill,
     following a changed type, no-type → null, no `params` slot → null, unknown
     surface → null, tokenless path, two tokens → null, url-encoding.
   - `ChatLog.journeyDoors.test.tsx`: the c2 `slice(0, 2)` is GONE — the arm now
     asserts `declared.doors.length === 3` (the declared count), every door's
     href against its declared surface + the DECLARED created type, and a second
     test proves fail-closed at component level (no createdType → record-create
     door has no href / aria-disabled=true, while the tokenless ingestion door
     still routes).

3. D1 — the ingestion landing consumes the candidate (commit 5fcba3117)
   `app/src/ingestion/IngestionPage.tsx` now reads `?prefillName=` via
   `useSearchParams` and shows the candidate
   (`data-testid=ingestion-candidate` / `ingestion-candidate-name`). It is read
   from the URL, so a reload of the door URL still shows it (AC1).
   `IngestionPage.css` styles it on `--cl-*` tokens.
   `IngestionPage.test.tsx` (3 new tests) renders `/ingestion?prefillName=...`,
   re-renders (reload) and checks the candidate again, and asserts a plain
   `/ingestion` visit shows no candidate.

Follow-up to the same seam (commit 1b17205b0): the component-level fail-closed
test above.

## Verification (real output, final tree)

1. `cd app && npx vitest run src/agent src/ingestion src/shared/surfaces`
   → `Test Files 1 failed | 61 passed (62)`, `Tests 2 failed | 401 passed (403)`.
   The 2 failures are `src/ingestion/VendorPdfReviewPage.treeSelect.test.tsx`
   ("blood-spin (0 proposals)" vs "blood spin"; "Updating the selected branch…"
   not found) — handbooks tree UI, untouched by this unit. PROVEN pre-existing:
   `git stash push -u` then the same single file at base → `Tests 2 failed | 2 passed (4)`;
   restored with `git stash pop`. All journey/door/ingestion suites pass.
2. `cd server && npx vitest run src/compiler/journey src/compiler/resolution`
   → `Test Files 51 passed (51)`, `Tests 410 passed (410)` (journey alone is a
   subset; resolution included because the wire type lives there).
3. `cd app && npx tsc --noEmit` → exit 2, ONE error, pre-existing:
   `src/editor/taptab/RefCombobox.ontologyref.test.tsx(32,4): error TS2322`
   (searchField `string` vs `"keywords" | "tags"`). None in changed files.
   NB the brief predicted 6 pre-existing errors in 3 files; the ACTUAL baseline
   measured on this checkout (before any edit and again at base via stash) is
   that single error. Repository wins; recorded, not "fixed".
4. `grep -rn "JOURNEY_NODE_TYPE" app/src` → empty (exit 1). `grep -rn "surfaceRouteFor"`
   also empty.

## Decisions / notes for review

- Fail-closed shapes: a door whose surface needs a token but whose journey names
  no created type gets NO href (dead door); a tokenless surface (ingestion) still
  routes, because nothing there needs a type. This is a per-door decision, not a
  whole-card one.
- `declaredSurfaceRoute` deliberately does NOT apply `surfaceRoute`'s
  objectType==param-type check to the created type: `record-create` declares
  `params.nodeType: record` while the created type is `material` — create-mode
  fills a type slot, object-mode fills an object-id slot. Documented in the
  helper; the registry was NOT edited (prohibited).
- "Seed the source search/input" for D1: the ingestion tab bodies' search inputs
  live in `app/src/event-editor/**` (DO-NOT-READ / out of this cycle), so the
  landing shows the candidate as its own strip (exactly what AC1 specifies: read
  and displayed by IngestionPage). Threading the seed INTO the vendor-PDF
  literature search would need event-editor edits — flagged, not done.
- No new module-level type constant was introduced.

## Files
app/src/agent/journeyDoorHref.ts, app/src/agent/journeyDoorHref.test.ts,
app/src/agent/ChatLog.tsx, app/src/agent/ChatClarificationCard.tsx,
app/src/agent/ChatLog.journeyDoors.test.tsx,
app/src/shared/surfaces/surfaceRoute.ts, app/src/shared/surfaces/surfaceRoute.test.ts,
app/src/ingestion/IngestionPage.tsx, app/src/ingestion/IngestionPage.test.tsx,
app/src/ingestion/IngestionPage.css, app/src/types/ai.ts,
server/src/compiler/journey/journeyDeclarationDoors.ts,
server/src/compiler/journey/journeyDeclarationCreatedType.test.ts,
server/src/compiler/resolution/types.ts

## Next actions
- Orchestrator: reload the lane stack if live verification is wanted (YAML was
  read only, never edited — no reload needed for this cycle's behaviour).
- Independent browser review (AC1 reload on /ingestion?... and AC2 door 2/3
  landing on /record/new/material?prefillName=...).
L2-NOUN-CREATION-JOURNEY-1-u1journey-c3 UNIT unit DONE 65a0cfe58b1e4bf85d751e2f8898be3711dd5efc
