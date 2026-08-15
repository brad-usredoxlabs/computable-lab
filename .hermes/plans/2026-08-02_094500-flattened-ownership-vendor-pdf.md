# Flattened Ownership — Vendor PDF as First-Class Lab Object
Summary report / decision basis (not an implementation plan).

## Goal
Move vendor-PDF search → ingest → extract out of the run's right-pane "search" tab and into
a first-class surface in Lab, under a flattened ownership model where first-class objects are
linked via the graph rather than nested/owned.

## What already agrees with the flattening (verified first-hand + subagents)
- **run.schema.yaml** already first-class & multi-parent: `projectIds[]` ("A run MAY link to
  multiple projects"), `studyId` = singular convenience auto-derived from `projectIds[0]`,
  `experimentId` already optional ("Experiments are now optional grouping (saved views)").
- Runs are STORED FLAT today: `records/run/` — no study nesting on disk.
- **study.schema.yaml**: "It is NOT a container that enumerates child records."
- **protocol.schema.yaml**: first-class; `source.type: [vendor, literature, internal, derived]`
  ("vendor = vendor kit PDF"); optional `links: {studyId, experimentId, runId}` — "protocols are
  not embedded in study records."
- **relationship.schema.yaml** exists and states exactly Brad's philosophy: "Projects, runs, and
  claims do not own each other — they are linked by relationship records." Typed directed edge
  (sourceType/sourceId → verb → targetType/targetId) + provenance. Index + `GET /relationships`
  read API + frontend `listRelationships()` all exist.

## What still embodies the nesting Brad wants removed
1. **Vendor PDFs have NO first-class record kind.** Only two homes:
   - `artifact` (kind=pdf) — **REQUIRES `studyId`** (artifact.schema.yaml), stored under
     `records/studies/<studyId>/artifacts/` (PathConvention.ts:137). VendorSearchHandlers skips
     the durable record entirely when studyId absent.
   - `vendor-protocol-candidate` — a transient **workspace JSON file**
     (`artifacts/foundry/protocol-candidates/`), outside the record system, invisible to index/CRUD.
2. **The tree enforces strict hierarchy.** `getStudyTree()` (IndexManager.ts:569-700) nests runs
   under exactly one study→experiment; a run with 0 or 2+ parents is **invisible**. This is the
   code-level embodiment of the nesting being removed. (Contrast: `getRunsForProject()` already
   checks `projectIds[]`.)
3. **Relationship records are dead infrastructure.** No `POST /relationships` create endpoint, zero
   `kind: relationship` records, `listRelationships()` never called, relationship dropped from
   search. The mechanism is spec-aligned but unbuilt.
4. **PathConvention** carries only singular `studyId` and nests artifacts/event-graphs under a study.

## The UI decision (resolves prior "Lab vs universal bar" question)
- Vendor PDF is an **acquisition + extraction workflow**, not a lookup. The universal search bar
  (`GlobalSearchBar`/`SplashSearch`) is purely record-discovery via `/tree/search` — it cannot
  represent an ingestion flow. → **Option A wins**: a `/lab/vendor-pdfs` workflow surface in Lab,
  running search → ingest → extract, whose durable output is a first-class lab `protocol` with
  `source.type=vendor`.
- Universal search remains a discovery surface and should eventually surface the new first-class
  kinds (document/vendor-pdf/protocol) + relationship edges.
- Run's right-pane "search" tab loses the vendor-PDF section; the AI tab's "+ Add source"
  (`AddSourceModal`) is a *contextually different* in-study flow and may stay.

## Key gaps to close (future planning session)
- Author a first-class `vendor-pdf` (or first-class `document`) schema: no required studyId,
  embeds file ref + extractedText + vendor-protocol-candidate output; path `records/vendor-pdfs/`
  (lab-level).
- Add relationship create path + surface relationships in UI; extend relationship
  sourceType/targetType enum with the new kind if needed.
- Fix the tree: keep `getStudyTree()` as a saved view, route resolution through multi-parent-aware
  index queries.
- Refactor `LabCollectionView` from monolithic CATEGORIES→kind to support an embedded workflow
  category (`vendor-pdfs`), rendering search/ingest/extract + recent ingests.
- Unify 4 fragmented extraction paths toward `/lab/vendor-pdfs` + `/protocol-builder`.

## Open questions
- Should ingested vendor PDF become `kind: document` or a new `kind: vendor-pdf`? (relationship
  enum already has `document`.)
- Does the universal search bar surface live vendor-PDF web results, or only already-ingested
  first-class objects (recommended)?
- Should the run right-pane "search" tab's local artifact *lookup* remain, or also move to Lab?
