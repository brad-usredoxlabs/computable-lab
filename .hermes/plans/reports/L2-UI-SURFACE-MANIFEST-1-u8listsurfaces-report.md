# L2-UI-SURFACE-MANIFEST-1 / unit u8listsurfaces — report

Status: DONE (data committed). Unit scope was data-only: `config/ui/surfaces.yaml`.
Item-level residual risk below (lint vocabulary pin) is outside this unit's owned files.

## Dispatch base

- Worktree: `/home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker`
- Branch: `cl/lane2-ui-surface-manifest-1-u6checker`
- `git rev-parse HEAD` at dispatch: `25a9301bc651b97c3611fcab2665af8f28396d70`
  - That tip is u7dotall's commit `ec907bb2` plus the launcher's `WIP AT EXIT`
    `25a9301b` (only an old report file). u7dotall had already committed, so
    `25a9301b` is the real base and the data commit below sits directly on it.
- Base sha named in the brief (`425de214`) was NOT the tip; it is the item's
  original base. All nine routes were re-read at the real base and match.

## RED (before)

Mirror tree `/tmp/u8red` = committed `HEAD:config/ui/surfaces.yaml` + the
checker + a real `app/src` copy (the script derives REPO_ROOT from its path),
so `UNRESOLVED-IMPORTS=3` is an artifact of the copy, not of the repo.

```
UNRESOLVED-IMPORTS=3
ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
```

## GREEN (after)

```
$ cd /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker && python3 scripts/check-ui-surfaces.py
UNRESOLVED-IMPORTS=0
ROUTES=41 DECLARED=16 MISSING=25 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
exit 0
```

Side by side (/tmp probe, same script, edited manifest copied in):

```
BEFORE  UNRESOLVED-IMPORTS=3
        ROUTES=41 DECLARED=7  MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
AFTER   UNRESOLVED-IMPORTS=3
        ROUTES=41 DECLARED=16 MISSING=25 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
```

Drop is exactly 9 routes (34 → 25); no PHANTOM appeared; `DECLARED=16` matches
the composer-measured expectation.

## The change

1. `paneVocabulary`: added exactly one id, `collection-list` (4 → 5).
   Justification: the nine routes below all render a page component inside
   `<DeferredRoute>` (App.tsx:151-155,172,193,217,218,226), mount none of
   `ai-chat` / `event-editor` / `deck` / `project-tabs`, and have no route
   parameter. `panes` is required with `minItems: 1`
   (`schema/ui/surface-manifest.schema.yaml:39,53`), so a param-free list page
   is undeclarable without a vocabulary entry. Schema and lint YAML untouched.
2. Nine surface entries appended, sorted by id, verbatim route strings:

| id | route | component (App.tsx anchor) | description source |
|---|---|---|---|
| claims-collection | `/claims` | ClaimCollectionView (:153) | 217-line module header: claims grouped into Active/Retracted views, status filter, pagination |
| graph-search | `/find` | GraphSearchPage (:217) | module header: natural-language master graph search, plate/table results |
| lab-collection | `/lab` | LabCollectionView (:155) | module header: category nav over protocols/materials/labware/equipment/people/documents (+sequences, vendor-pdfs) |
| literature-list | `/literature` | LiteraturePage (:193) | 24-line wrapper: `LiteratureBody` inside AppShell + `Slot name="chat.panel.literature"` |
| projects-collection | `/projects` | ProjectCollectionView (:151) | module header: `listRecordsByKind('study')`, single-column chip list, search + sort |
| runs-collection | `/runs` | RunCollectionView (:152) | module header: `listRuns()`, two-column grid, status tabs, filter/sort |
| sequences-list | `/sequences` | SequencesPage (:218) | 152-line module: tabs Editor/Assay/Analysis/Setup/Import/Knowledge |
| settings | `/settings` | SettingsRoute (:226) | 35-line module: `AppShell` around `SettingsPage`, off-nav |
| splash | `/splash` | SplashRoute (:172) | 14-line module: `AppShell` + `SplashPage` in leftPane |

Every entry has `panes: [collection-list]`, `context.scope_source: none`,
`gate.leg: null` + a reason sentence stating no live probe evidence exists,
and one-sentence `description`.

## `requires` omitted — evidence

Pattern grepped (module + its direct local imports, comments stripped):

```
WorkspaceProvider|useWorkspace|useOptionalWorkspace|WorkspaceContext|ProtocolSelection|useProtocolSelection|DeckProvider|DeckContext
```

Direct imports checked per module: AppShell, WorkspaceTabStrip,
OpenTabsContext, event-editor/workspace/types, openContent, apiClient,
CollectionSearchSort (collection views); SplashPage (splash); LiteratureBody
(literature); graphSearchClient/GraphSearchTable/GraphSearchPlateView/
wellNodes/selectionToSurfaceContext/SurfaceContext (find); useAiChat,
AiPanelContext, ChatFocusContext, HarnessChatPane, surfaces/registry,
sequences/* (sequences); shell/SettingsPage (settings);
quickCreateRun/legacyRouteResolution/protocolRouting/VisibilityBadge/
useRecordVisibility where imported.

Result for all nine modules and all listed imports: `(no provider match)`.
The only textual hits anywhere in the closure are comments in
`event-editor/workspace/types.ts` ("auto-opened by the WorkspaceProvider"),
which is a docstring, not a consume. `HarnessChatPane` uses
`useOptionalWorkspace` (optional, no provider required to mount). Therefore no
`providers:` key is asserted — omission, not `providers: []`. No
`settles_within_ms` (no timing receipt).

## Invariants (raw)

```
$ git diff --stat          (data commit)
 config/ui/surfaces.yaml | 100 +++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 100 insertions(+)

$ git diff config/ui/surfaces.yaml | grep -c '^-'
1                          # the '--- a/...' header only; zero removed lines

$ python3 -c "...len(surfaces),len(paneVocabulary)"
16 5

$ grep -c '  - id:' config/ui/surfaces.yaml
16

$ (duplicate route / duplicate id check)
(empty)                    # no duplicates

$ git diff --name-only     (data commit)
config/ui/surfaces.yaml

$ git diff --stat scripts/ schema/ui/
(empty)                    # checker and schema/lint YAML untouched
```

All seven pre-existing entries are byte-identical; the diff is additions only.
No `tsc`/vitest/supertest run (data-only unit; no node_modules in the
worktree and installing is out of scope).

## RESIDUAL RISK — item-level, NOT owned here (needs orchestrator call)

`schema/ui/surface-manifest.lint.yaml` pins its `in` predicate values to a
static 4-item list (`ai-chat, event-editor, deck, project-tabs`). The brief
freezes `schema/ui/**` byte-identical, so with the new `collection-list` pane:

- `server/src/schema/SurfaceManifestLint.test.ts` case (a)
  "lints the committed manifest with zero findings" will find 9 violations.
- case (c) "drift pin: rule values exactly match the manifest paneVocabulary"
  will fail (4 rule values vs 5 manifest entries).

Static reading only — vitest was not run (no node_modules, installs
prohibited). The one-line fix is to add `collection-list` to that rule's
`values:` list, in `schema/ui/surface-manifest.lint.yaml`, which this unit is
forbidden to touch. Owner: orchestrator; needed before the item's branch tip
can pass the server suite. No manifest-side change can avoid this while
keeping `panes` required and `minItems: 1`.

## Marker

The marker below names the data commit `60b3d722645a8f8ffa560f79ab76734fd8bf464a`;
it lands in the following report-only commit (no amend).

L2-UI-SURFACE-MANIFEST-1 UNIT u8listsurfaces DONE 60b3d722645a8f8ffa560f79ab76734fd8bf464a
