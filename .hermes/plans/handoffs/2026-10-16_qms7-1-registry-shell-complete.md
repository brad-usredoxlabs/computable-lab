# HANDOFF — QMS7-1 registry shell hosting COMPLETE (lane 1, l1t0140)

- item: QMS7-1 (campaign: QMS registry unification + CRUDa + seed coherence, wave 3)
- worktree: /mnt/vast/home/brad/git/wt/QMS7-1-lane1-l1t0140 · branch `wt/QMS7-1-lane1-l1t0140`
- commits: `a1d07b44` (RED tests at base) → `87c9fca5` (implementation) on base c41131ac / 71412415
- coder report: /home/brad/.hermes/cl/lanes/1/qms7-1-report-l1t0140.md
- status: implementation complete + all coder-side bars verified; ACCEPTANCE PENDING the
  cl-browser-reviewer gate (orchestrator dispatch, :5192/:3092, receipts ~/.hermes/cl/receipts/QMS7-1/<ts>/)

## What landed

/registry is now a workspace-hosted surface: new `app/src/shared/shell/RegistryHostPage.tsx`
(WorkspaceProvider STU-scratch + AppShell layout=workspace + WorkspaceTabStrip + universal
RightPane, RecordRegistryPage reparented into leftPane), routed from App.tsx. Registry list+editor
interaction, data flow, DocumentControlBar semantics, CsvImportModal mount, REGISTRY_TABS data and
the page's plain `useState` activeTab are all unchanged (reparent, not rewrite).

OQ1 as ruled: new client-side-only `registry` WorkspaceTab kind + `registryTabId()`; all six
exhaustive never-guard sites updated exhaustively (entityTabType null, defaultRightPaneMode 'ai',
tabPath '/registry', stableTabId registryTabId(), Viewer + ViewerToolbar empty arms) plus the
systemPromptKindForTab null-arm. No casts, no guard deletions, no server arm.
OQ2 as ruled: RecordRegistryPage selection effect on the existing `ws.openTab` channel
(record-edit on select, activateTab(project-details) on clear), guarded by useOptionalWorkspace;
no SURFACE_AI_REQUEST_EVENT, no payload-in-context (QMS7-7).
OQ3 as ruled: SurfaceIndicator fallback accepted; zero label-map/surfaces.yaml changes.

## Pins freshly re-run on the branch tip (87c9fca5)

1. app tsc: `npx tsc --noEmit 2>&1 | grep -cP "error TS"` → **23**
   multiset pin `... | sed -E 's/\(([0-9]+),([0-9]+)\)//' | sort | sha256sum` →
   **723a7fb86ab0ec242d9185ef683abb4f8d9130740b45f9e7e0a1dbc9cbeaeecb**
   per-file counts identical to the spec's 16-file table; base↔tip normalized error-list diff = IDENTICAL.
2. app vitest full run: **Test Files 61 failed | 285 passed (346) · Tests 65 failed | 2258 passed
   (2323) · Errors 5** — comm of FAIL-file lists vs the repaired base run (61 | 284 (345),
   65 | 2252 (2317)): NEW = [], GONE = [] (the +1 file / +6 tests is the new RegistryHostPage
   suite). Named-test-level comm also empty.
3. touched dirs fully green: `npx vitest run src/pages src/shared/shell src/shared/session
   src/event-editor/workspace` → **29 files / 219 tests passed**.
4. first targeted check: `npx vitest run src/shared/shell/RegistryHostPage.test.tsx` → **6/6 green**
   (RED at base: suite could not collect — `Failed to resolve import "./RegistryHostPage"`).
5. scope guard `git -c core.fileMode=false diff --name-only c41131ac...HEAD` → 12 files, all IN
   SCOPE (App.tsx, App.test.tsx, RecordRegistryPage.tsx, workspace/types.ts, OpenTabsContext.tsx,
   WorkspaceTabStrip.tsx, session/tabId.ts, Viewer.tsx, ViewerToolbar.tsx,
   systemPromptForViewer.ts, RegistryHostPage.tsx + its test). Zero server/, zero schema/.

## Load-flake characterization (do not mistake for regressions)

Full-suite runs on a contended box (load avg ~22, transform 195s vs 37s) intermittently add
timeout/content flakes to files unrelated to this item — observed: OwnershipPolicySection,
AddMaterialForm.biological, ReviewAiPanel, SlideOverEditor, and this item's own new test file.
Each was proven to pass in isolation at tip; the quiet-machine run is the one whose fail-file set
equals the 61-file baseline. The `Errors 5` line is pre-existing unhandled-exception debt
(identical at base and tip). Verify with comm of FAIL-file lists, not headline exit codes.

## Environment note for the merge (pre-existing, repaired in this worktree only)

The fresh worktree carried 32 stale lane-exclude symlinks shadowing paths that are TRACKED regular
files at the tip (git status: 32 `T` typechanges; symlinks resolve into /mnt/vast/home/brad/git/computable-lab,
which lags cl/integration-1 for those files). Symptom: 12 `Failed to load url` collection failures +
3 content-drift failures → baseline read WRONG (66/72 instead of 61/65). Repaired by replacing each
tracked symlink with a real copy from HEAD (`git checkout HEAD -- <path>`); the 60 genuinely
lane-excluded untracked symlinks (node_modules, server/schema, etc.) were left alone. Materialized
files are byte-identical to HEAD, so the repair contributes nothing to the diff. Any sibling lane
worktree cut from the same window likely needs the same repair before its pins can be trusted.

## Test-harness finding (flagged, not fixed — OpenTabsContext internals are HARD OUT)

A host page mounted in the SAME React commit as `OpenTabsProvider` loses its tab registration:
child effects run first, then the provider's mount-time session re-read
(`dispatch({type:'replace', state: loadFromStorage(...)})`, OpenTabsContext.tsx:543-546) discards it.
Production is immune (App.tsx lazy-imports host pages, so the provider commits in an earlier commit).
`RegistryHostPage.test.tsx` reproduces the production order with a `DeferredMount` gate and documents
why. Future host-page tests that mount statically will hit this artifact.

## Next actions for the orchestrator

1. Merge `wt/QMS7-1-lane1-l1t0140` (2 commits) into cl/integration-1; re-verify the three pins at
   the merge tip.
2. Dispatch cl-browser-reviewer on :5192/:3092 per the task's verified-by VERBATIM (shell/tab strip/
   right pane at /registry; refresh + back/forward keep exactly one Registry tab; tab switching;
   /record/:recordId and other surfaces unchanged; AI context updates on record selection with no
   stale target). Receipts ~/.hermes/cl/receipts/QMS7-1/<ts>/. Negative claims re-verified per the
   standing reviewer-reliability rule.
3. If the gate flags the SurfaceIndicator fallback, route it as its own item (OQ3 ruling), not a
   QMS7-1 fix.
4. QMS7-5 (CsvImportModal removal) and QMS7-7 (record payload into AI context) remain open items;
   their boundaries were respected here.
