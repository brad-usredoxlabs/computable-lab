# L2-UI-SURFACE-MANIFEST-1 — UNIT u11pinsync

Base: b240951da9988c02aceb68e2823b56a8ff41c1b4
Code commit: ab2c4a4ece3c25da49467a26d8b43d1a13cb9249
Lane 2 / worktree wt-L2-UI-SURFACE-MANIFEST-1-u6checker

## What changed
server/src/schema/SurfaceManifestSchema.test.ts — only the two frozen literals in
`validates the committed manifest and pins surface + pane sets`:
- surface id pin: 7 pre-u8 ids -> 19 ids in manifest order, tail added after
  'registry-host': claims-collection, graph-search, lab-collection, literature-list,
  projects-collection, runs-collection, sequences-list, settings, splash, deck-host,
  project-event-graph, record-create.
- paneVocabulary pin: 4 ids -> 5 ids (added 'collection-list').
Assertion stays a strict ordered `toEqual` on the full list. Ajv validity,
uniqueItems and additionalProperties tests untouched. No data, schema, app or
script file touched.

## Verification (raw)
1. RED at base b240951d:
   `cd server && npx vitest run src/schema/SurfaceManifestSchema.test.ts src/schema/SurfaceManifestLint.test.ts`
   -> Test Files 1 failed | 1 passed (2) / Tests 1 failed | 8 passed (9),
      SurfaceManifestSchema.test.ts:35 toEqual mismatch (19 actual vs 7 pinned).
2. GREEN after edit, same command:
   -> Test Files 2 passed (2) / Tests 9 passed (9).
3. `python3 scripts/check-ui-surfaces.py`:
   -> ROUTES=41 DECLARED=19 MISSING=22 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
      (census unchanged; trailing REDIRECT/SLOT-HOST fields are part of the same
      printed line, prefix as briefed).

## Notes / deferred
- FIX-2 (duplicate host identity: deck-host / project-event-graph / record-create vs
  project-deck-tab / record-host prose) is a vocabulary ruling deferred to the
  architect via handoff — entries neither deleted nor renamed here.
- Out of scope and untouched: config/ui/surfaces.yaml, schema/**, scripts/**, app/**.

L2-UI-SURFACE-MANIFEST-1 UNIT u11pinsync DONE ab2c4a4ece3c25da49467a26d8b43d1a13cb9249
