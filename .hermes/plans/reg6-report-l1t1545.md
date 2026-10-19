# REG-6 coder report — lane 1 (l1t1545)

Worktree: /mnt/vast/home/brad/git/wt/REG-6-lane1-l1t1545
Branch: cl/lane1-reg6-l1t1545 (base 5c77d023, trunk cl/integration-1 tip)
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-19_reg-6-retire-registry-rail-spec.md (read; untouched)

## Commits (RED and impl separate)

1. RED: 56871ba8 — test(reg6): RED — registry provenance docks at bottom, no side rail (failing layout pins)
   New file app/src/pages/RecordRegistryPage.rail.test.tsx (4 tests, all failing against the rail implementation).
2. IMPL: 49889f6c — feat(reg6): retire registry side-rail; provenance docks full-width at bottom
   8 files changed, 42 insertions(+), 499 deletions(-).

## What changed (impl commit)

- app/src/pages/RecordRegistryPage.tsx
  - Removed `railResizable` (was :729) and the entire `rail={...}` prop (was :774-792).
  - Added `<div className="registry-provenance-footer">` INSIDE DocumentShell children, immediately AFTER the `.registry-editor-body` div closes: RecordProvenanceCard + RelatedRecordsCard moved VERBATIM (same props, same `selectedRecord.recordId && editorMode !== 'create'` guard).
- app/src/pages/RecordRegistryPage.css — retired `.registry-rail` block; added `.registry-provenance-footer` (flex column, gap 16px, token-only, NO border/background/padding chrome — empty wrapper collapses to zero height).
- app/src/pages/RecordRegistryPage.styling.test.tsx — REQUIRED array (:20): `.registry-rail` -> `.registry-provenance-footer` (same commit).
- app/src/components/registry/RecordProvenanceCard.css — visual separation moved onto the card: `.provenance` gains `border-top: 1px solid var(--cl-border); padding-top: 12px;`. Card TSX untouched (REG-4 pins intact; `<details>` already opens downward).
- app/src/editor/taptab/DocumentShell.tsx — removed `railResizable` prop, localStorage('cl-registry-rail-width') restore effect, ResizeObserver re-clamp effect, clampRailWidth/applyRailWidth/persistRailWidth/startDrag/nudgeRail/onSplitterKeyDown, the role=separator splitter render, bodyRef, and the now-unused useEffect/useRef/useState imports. `rail`, `railBelow`, `width`, `className` and the plain `<aside className="document-shell__rail">` render KEPT.
- app/src/editor/taptab/DocumentShell.test.tsx — deleted the `DocumentShell resizable rail` describe (12 tests) and the `DocumentShell settle-aware rail restore` describe (2 tests, machinery-only pins) plus the afterEach `localStorage.removeItem('cl-registry-rail-width')` line and now-unused beforeEach/fireEvent imports. Plain-rail tests (:115-212 region: diagnostics rail renders, no-rail, narrow viewport, railBelow) UNCHANGED and green. 28 tests -> 14 tests (28 − 12 − 2 = 14, exact).
- app/src/editor/taptab/taptab.css — deleted ONLY `.document-shell__rail-resizer` (+ :hover/--dragging/:focus-visible) and `body.cl-rail-dragging`. KEPT `body { user-select: auto; }` (pre-existing general rule, not resizer-specific), `.document-shell__rail` and the 768px media block untouched.

## RED evidence (before impl commit)

`npx vitest run src/pages/RecordRegistryPage.rail.test.tsx` at 56871ba8 (full output saved: .hermes/plans/reg6-red-evidence.txt):

    Test Files  1 failed (1)
          Tests  4 failed (4)
    FAIL ... > provenance docks at the BOTTOM ...
    TestingLibraryElementError: Unable to find an element by: [data-testid="record-provenance"]
      (card was inside the .document-shell__rail aside, not a bottom sibling)
    FAIL ... > renders NO rail and NO role=separator resizer
      → expected <aside …(3)>…(1)</aside> to be null
    FAIL ... > create draft: no provenance element ...
      → expected null not to be null (no .registry-provenance-footer existed)
    FAIL ... > CSS pins ...
      → expected '...' not to contain '.registry-rail'

## VERIFY outputs (after impl commit 49889f6c)

Targeted vitest (paths as vitest wants them):

    cd app && npx vitest run src/pages/RecordRegistryPage.rail.test.tsx \
      src/pages/RecordRegistryPage.test.tsx src/pages/RecordRegistryPage.styling.test.tsx \
      src/components/registry/RecordProvenanceCard.test.tsx src/editor/taptab/DocumentShell.test.tsx
    ✓ src/pages/RecordRegistryPage.styling.test.tsx  (4 tests) 5ms
    ✓ src/components/registry/RecordProvenanceCard.test.tsx  (4 tests) 48ms   <- 4/4 UNCHANGED
    ✓ src/editor/taptab/DocumentShell.test.tsx  (14 tests) 159ms              <- plain-rail regression proof
    ✓ src/pages/RecordRegistryPage.rail.test.tsx  (4 tests) 138ms             <- new layout pins
    ✓ src/pages/RecordRegistryPage.test.tsx  (17 tests) 538ms
     Test Files  5 passed (5)
          Tests  43 passed (43)   exit 0

Neighbor registry/rail-consumer suites (createTab, createSearch, createWhileOpen,
archiveBrowsing, qms6e, SlideOverEditor): all green (SlideOverEditor 12/12).
RawRecordEditor.test.tsx shows 4 failures — PROVEN PRE-EXISTING trunk debt: identical
4-fail set at base 5c77d023 with my changes stashed (cause: its `./taptab` vi.mock
lacks the ProjectionTapTabEditor export — unrelated to DocumentShell/rail).

Typecheck delta-ZERO:
    baseline (pristine worktree, before any edit): npx tsc --noEmit -> 27 'error TS' lines (/tmp/reg6-tsc-baseline.txt)
    after impl:                                        npx tsc --noEmit -> 27 'error TS' lines
    diff baseline vs after -> empty: "TSC DELTA ZERO (identical error set)"
    (all 27 are pre-existing trunk debt: missing modules draftChanges/ParameterAnswerInput/
     protocolStepText/surfaces/registry, runDeckLock/equipments EventEditorState drift, etc.)

No app-wide CSS regressions: `git -c core.fileMode=false diff --stat` lists ONLY the
8 named files (42 insertions / 499 deletions). Grep confirms zero remaining references
to railResizable / registry-rail / rail-resizer / cl-rail-dragging / cl-registry-rail-width
in app/src outside this report's history.

## Stop-boundary check

Grep-verified (pre- and post-impl): the registry was the ONLY railResizable consumer;
RawRecordEditor.tsx:469, SlideOverEditor.tsx:131, LabwareFocus.tsx:610 pass `rail`
(without railResizable) and were NOT touched; their rail renders survive (DocumentShell
plain-rail tests green). No existing registry test failed beyond the two named-to-update
pins (styling REQUIRED array + the new layout file). No stop condition triggered.

## Assumptions

- The settle-aware-restore describe in DocumentShell.test.tsx pins the ResizeObserver
  re-clamp machinery the spec orders retired; deleting it is part of retiring the
  machinery (test count arithmetic above documents exactly what was removed).
- `body { user-select: auto; }` in taptab.css is a general rule, not a
  `.document-shell__rail-resizer*`/`.cl-rail-dragging` rule — kept per "delete ONLY" rule.

## Not done (by contract)

- Browser gate (orchestrator owns it; cl-browser-reviewer must verify :5192/registry
  create-full-width, TRR-DEMO-1 provenance-below-opens-downward, no resizer, narrow
  viewport passes).
- No merge, no trunk touch, no stack restarts.

REG6 DONE 49889f6c
