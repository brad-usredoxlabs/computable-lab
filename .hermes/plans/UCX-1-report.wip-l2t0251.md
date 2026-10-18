# UCX-1 CODER REPORT — Sequences surface: multi-select toolbar over the result list
Lane 2 · coder l2t0251 · worktree /mnt/vast/home/brad/git/wt/UCX-1-lane2-l2t0251
Branch wt/UCX-1-lane2-l2t0251 · base 8546827d5c245c01f7360d4e41f052590ab549a5
Spec: /mnt/vast/home/brad/git/wt/UCX-1-lane2-l2t0251/.hermes/plans/2026-10-18_UCX-1-sequences-multiselect-toolbar-spec.md (read fully; ORCHESTRATOR ADJUDICATION OQ1-OQ4 followed)

## COMMITS
- RED:   eda42f6c test(UCX-1 RED): SequencesPage multi-select toolbar pins 1-8
- FEAT:  10cc7335 feat(UCX-1): Sequences Library multi-select toolbar over the result list
(marker sha = FEAT commit)

## BOOTSTRAP / WORKTREE VERIFICATION
- `git -c core.fileMode=false status --porcelain | grep -c '^D'` → 0 on first poll (no WAIT-TIMEOUT).
- Symlink resolution verified: server/node_modules, app/node_modules, node_modules, server/schema all resolve (`ls -d` exit 0).
- All git commands run with `-c core.fileMode=false`.

## BASELINE (measured in the worktree BEFORE implementing, at 8546827d)
- `npx vitest run --root app src/sequences` →
  `Test Files  5 passed (5)` / `Tests  40 passed (40)` — GREEN baseline, matches spec's 5 files / 40 tests.
- `npm run typecheck -w app 2>&1 | grep "error TS"` → 23 lines. File set (count per file):
  6 useAiChat.surfaceContext.test.ts; 2 editorHistory.test.ts; 2 useChatThread.deckLayout.test.tsx;
  1 each: LawnSurface.moveAcross.test.tsx, PreviewActionBar.test.tsx, EventEditorContext.tsx,
  LabwareFocus.instrument.test.tsx, systemPromptForViewer.ts, ProtocolLocalizationThread.tsx,
  DeckModeSwitcher.tsx, DeckToolbar.tsx, ViewerToolbar.tsx, Viewer.tsx, IngestionUploadModal.tsx,
  ExtractionProgressPanel.test.tsx, useSurfaceContext.ts. Zero under src/sequences.
  (Raw saved: /tmp/ucx1-typecheck-base.txt)

## RED EVIDENCE (new pins failing pre-fix, at commit eda42f6c)
`npx vitest run --root app src/sequences` →
`Test Files  1 failed | 5 passed (6)` / `Tests  8 failed | 40 passed (48)`
All 8 failures are in SequencesPage.multiSelect.test.tsx (first failure mode:
`Unable to find an element by: [data-testid="sequence-selection-toolbar"]` —
the toolbar/testids did not exist pre-fix). No pre-existing file regressed.

## GREEN (final gate, at commit 10cc7335)
`npx vitest run --root app src/sequences` →
`Test Files  6 passed (6)` / `Tests  48 passed (48)` (40 baseline + 8 new pins).
Run with `--root app` per the spec's documented measurement trap (repo-root sweep
pulls server-side sequence tests through lane-exclude symlinks → ENOENT noise).

## TYPECHECK BASE-vs-HEAD
- HEAD: `npm run typecheck -w app 2>&1 | grep -c "error TS"` → **23** (raw: /tmp/ucx1-typecheck-head.txt).
- File-set comm/diff of base vs head per-file counts: **FILE SETS IDENTICAL** (diff empty).
- `grep -c "src/sequences"` on head errors → **0**.
- The 23 are pre-existing debt; not chased, not grown.

## DIFF SCOPE (app-only — VERIFIED)
`git -c core.fileMode=false diff --stat 8546827d HEAD` →
  app/src/sequences/SequencesPage.tsx            (3 lines changed + libraryRows derivation)
  app/src/sequences/SequencesPage.css            (+8 chrome rules)
  app/src/sequences/SequencesPage.multiSelect.test.tsx (new, 264 lines)
  app/e2e/sequences-multiselect.spec.ts          (new)
4 files changed, 128 insertions(+), 5 deletions(-).
ZERO hunks under server/ or schema/. **YAML: none touched** — no surfaces.yaml,
no agent-action.schema.yaml, no sequence-action.schema.yaml, no ui/lint YAML.
No :3093 reload concern applies.

## IMPLEMENTATION MAP (spec EXACT EDITS → code)
1. SequencesPage.tsx :29 — untouched; `collectionName`/`members` reused as-is (OQ3).
2. :61 aiContext — added `collectionSelection:members` after the untouched
   `selection:inputs`; `members` appended to the useMemo dep array. `members` is
   a plain required array, never undefined; no conditional-spread sites changed.
3. :134 navPane — rows restructured to `div.sequence-library__row` containing the
   checkbox (sequence-kind rows ONLY, OQ1; `checked={members.includes(r.recordId)}`;
   `data-testid="sequence-check-<recordId>"`; `aria-label="Select <label>"`) and the
   EXISTING open button as SIBLINGS — no input-in-button nesting, no
   stopPropagation. Toolbar (always rendered, OQ4) between search input and rows:
   `sequence-select-all` (union of current members with visible
   libraryRows.filter(kind==='sequence') ids via Set — idempotent),
   `sequence-clear-selection` (`setMembers([])`),
   `sequence-selection-count` `<span role="status">{members.length} selected</span>`,
   name input bound to the existing `collectionName`,
   `sequence-toolbar-save-collection` disabled `busy||!collectionName||!members.length`,
   onClick = `void act({operation:'save_collection',label:collectionName,members:members.map(id=>recordRef(id))}).then(()=>setMembers([])).catch(()=>{})`
   — the :103 payload expression VERBATIM through the same act()/recordRef/requestId()
   path (wire key order identical: operation, requestId, label, members). Success
   clears selection; rejection keeps it and act() surfaces role="alert".
4. `libraryRows` extraction = the :134 filter chain verbatim (`['sequence','oligo-spec']`
   kind filter + query filter), feeding both rendering and select-all visibility.
5. Byte-identical freeze verified via diff: deep-link effect (:32-36), agent handler
   (:42-54), proposal path (:55-60), Analysis fieldset (:103 — 0 diff hits on the
   `fieldset><legend>Reference` line), requestId()/recordRef() in api.ts unchanged.
6. CSS: `.sequence-selection-toolbar` (flex wrap), `.sequence-library__row` (flex row;
   checkbox sibling of the button), count dimmed; theme-var based, dark-safe.
7. applyAgentAction.ts, agent-action.schema.yaml, compiler: NOT touched (OQ2).

## REVIEWER-BAIT PRE-EMPTIONS (pinned)
- Row-button split: pin 8 asserts checkbox click leaves Editor tab unselected
  (Save region stays disabled) AND `checkbox.closest('button') === null`.
- aiContext key discipline: pin 7 asserts `surfaceContext.collectionSelection === ['SEQ-A']`
  while `surfaceContext.selection` still equals the analysis-inputs map `{}` (clobber fence).
- Payload equivalence: pin 4 deep-equals toolbar body vs fieldset body AND
  `JSON.stringify` byte-compare (requestId deterministic 'req-test' via mock).
  Fieldset leg scoped with `within(fieldset)` because the toolbar Save shares the
  accessible name 'Save collection'.
- Eligibility: pins 1/3 assert oligo-spec row has NO checkbox and never enters the count.
- Hardcode boundary: single Save-collection button = one verified batch operation
  (spec CURRENT STATE item 5: no declarative button source exists — recorded honestly,
  no fake capability filter, no selectionActions data invented).
- Ontology: no new nouns; toolbar language says "collection" (sequence-collection/SEQSET pre-existing).
- requestId: hex-24 from api.ts requestId() unchanged; schema pattern untouched.

## TEST HARNESS NOTES
- Mocks: ./api (requestId→'req-test', faithful recordRef re-export), ../shared/hooks/useAiChat
  (captures aiContext per render, returns no-op chat), ../shared/context/AiPanelContext,
  ../agent/HarnessChatPane, ../shared/surfaces/registry (resolve []), and AppShell's
  workspace-chrome LEAF modules (GlobalNavbar, WorkspaceTabStrip, SurfaceIndicator, useTheme) —
  AppShell.tsx imports them directly so a barrel mock would not intercept them, and
  WorkspaceTabStrip hard-requires OpenTabsProvider.
- Fixture: SEQ-A "Alpha" + SEQ-B "Beta" (sequence) + OLIG-1 (oligo-spec), null-ish contract.

## E2E SPEC (written, NOT run here)
app/e2e/sequences-multiselect.spec.ts covers browser-gate criteria 1-6 with stable
testids, screenshots to test-results/ucx1-*.png, and a POST /sequences/actions route
capture asserting the wire body shape. NOT executed by me: the :5193 browser gate is
the orchestrator's post-merge step (merge + cl-lane-stack.sh 2 restart, then
cl-browser-reviewer). My spec stubs the actions POST (returns SEQSET-gate) so a
reviewer run of MY spec writes nothing to the shared store; the reviewer's live-stack
criteria-4 store trail ("a sequence-collection named gate-collection exists") is
covered by the reviewer's own unstubbed run per the spec's VERDICT line.

## ASSUMPTIONS (values/choices I supplied that no source dictated)
- AS-L2T0251-UCX1-001: stubbing AppShell chrome leaves in the unit harness (spec's
  mock list omitted them; WorkspaceTabStrip throws without OpenTabsProvider). No
  product behaviour under test lives in the chrome.
- AS-L2T0251-UCX1-002: toolbar name input gets a visible <label> text "New collection
  name" in addition to the spec-mandated aria-label (Playwright getByLabel + a11y).
  Fieldset's "Collection name" label untouched.
- AS-L2T0251-UCX1-003: Clear button disabled when `busy||!members.length` (spec gave
  no disabled rule for Clear; testid stays stably rendered per OQ4).
- AS-L2T0251-UCX1-004: e2e spec stubs the actions POST instead of hitting the real
  store (avoids writing SEQSET records into the shared stack from a coder-run spec);
  wire-body assertions replace the store-trail leg, which the browser reviewer's
  unstubbed gate run owns.
- AS-L2T0251-UCX1-005: Select-all disabled only while busy (spec: "adds to current
  selection; idempotent" — no empty-state disabling stated).

## UNRESOLVED / HANDOFF
- :5193 browser gate pending (orchestrator: merge, stack restart, cl-browser-reviewer).
- No server/schema/scope violations. No pre-existing test or typecheck drift introduced.

UCX-1 DONE 10cc7335
