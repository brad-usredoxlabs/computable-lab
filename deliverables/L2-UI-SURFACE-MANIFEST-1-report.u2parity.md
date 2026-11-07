L2-UI-SURFACE-MANIFEST-1 unit u2parity — Route-parity checker report
========================================================================

STEP 0 PRECONDITION: PASS
  HEAD: 80917d60 (cl/integration-2 tip after u1lintrules merge)
  config/ui/surfaces.yaml: present
  schema/ui/surface-manifest.schema.yaml: present
  schema/ui/surface-manifest.lint.yaml: present
  schema/ui/surface-manifest.ui.yaml: absent (expected; sibling unit)
  PyYAML 6.0.3: imports OK

CENSUS LINE:
  ROUTES=41 DECLARED=3 MISSING=38 PHANTOM=0 CATCHALL=1

Independent grep cross-check:
  grep -c '<Route ' app/src/App.tsx = 41 (space after Route excludes <Routes>)
  grep -c '^  - id:' config/ui/surfaces.yaml = 3

Matching algorithm:
  Each declared route pattern is split into segments. Segments starting with :
  or ending with ? are wildcards. A pattern matches a route path if the
  segments have equal length and all non-wildcard segments are identical.
  The matcher is generic — no .fullmatch shortcuts for the three known patterns.

Matched routes:
  /runs/:runId — matched by run-workspace (/runs/:runId)
  /runs/:runId/event-editor — matched by event-editor (/runs/:runId/event-editor)
  /analysis — matched by analysis (/analysis)

Premise note:
  Criterion 1's literal MISSING=0 is NOT reachable with 3 declared surfaces
  against 41 routes. The honest census reports MISSING=38. The number 38 is
  reproducible: 41 total routes - 3 matched = 38 unmatched. This is the true
  state of the repo at 80917d60.

Missing route classification:
  Rule: resolve each route element to its page module, check for
  'SurfaceChatBridge' in that module's source.
  Routes with chat-surface mount: 7
    /project/:studyId -> ProjectWorkspacePage
    /project/:studyId/event-graph/:eventGraphId -> ProjectWorkspacePage
    /artifact/:kind/:artifactId -> ArtifactHostPage
    /record/:recordId -> RecordHostPage
    /record/new/:nodeType/:parentId? -> RecordHostPage
    /deck/:eventGraphId/:runId? -> DeckHostPage
    /registry -> RegistryHostPage
  Routes without chat-surface mount: 31

ORPHAN ARTIFACT:
  File: deliverables/ui-surface-manifest-1/orphans.txt
  Total lines: 85 (5 header + 80 orphan entries)
  Scanned: 446 .tsx modules (excluding .test.tsx)
  Total orphans: 80
  Rule: a capitalised component module is orphaned if no other scanned
  module imports it.
  All 80 orphan paths verified with test -f (0 invalid).
  Note: The item's pre-check heuristic was 36; the actual count is 80.
  The lazy-load resolution reveals more orphans than a simple heuristic.

NON-VACUITY PROOFS:
  (a) Deleting /literature from App.tsx: ROUTES drops 41->40, MISSING drops 38->37
      (literature was in the missing set, confirmed by pattern matcher)
  (b) Changing analysis route to /no-such-page: PHANTOM=1 (analysis, /no-such-page)
      This would trigger exit 1.
  (c) L-SM-2 pane vocabulary rule: the merged lint rule (schema/ui/surface-manifest.lint.yaml)
      validates that every surface pane member is in the declared pane vocabulary
      [ai-chat, event-editor, deck, project-tabs]. A renamed pane (deck->dec) would
      fail this rule. Sub-proof: UNREACHABLE — no :3093/lint endpoint confirmed running,
      and the lint engine is a different unit's scope.
  (d) All 80 orphan paths in orphans.txt pass test -f.

CHANGED FILES:
  scripts/check-ui-surfaces.py (new, 409 lines)
  deliverables/ui-surface-manifest-1/orphans.txt (new, 85 lines)

PROHIBITED FILES: unchanged
  config/ui/surfaces.yaml — byte-identical
  schema/ui/surface-manifest.*.yaml — byte-identical
  app/src/** — zero edits
  server/src/** — zero edits

EXIT CODE SEMANTICS:
  Exit 1 only when PHANTOM > 0 or a lazy specifier fails to resolve.
  Exit 0 with MISSING > 0 is expected and does not block the lane.
  PHANTOM=0, all 29 lazy specifiers resolved, so exit 0.
