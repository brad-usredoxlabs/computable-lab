# QMS-5 Lane-1 worker report — route /registry + one nav entry (routing only)

- Token: qms-5-lane1-20261003T122630
- Branch: `wt/qms-5-lane1` @ base `b60d1a56` (off `cl/integration-1`)
- Worktree: `/mnt/vast/home/brad/git/wt/qms-5-lane1`
- Worker: cl-senior
- Date: 2026-10-03

## Files changed (4 files, +19 / -2)

| File | +/- | What |
|---|---|---|
| `app/src/App.tsx` | +4 / -0 | lazy const `RecordRegistryPage` (default export via `.then((m) => ({ default: m.default }))`) after the other lazy consts; `<Route path="/registry" element={<DeferredRoute><RecordRegistryPage /></DeferredRoute>} />` added inside `<Routes>`, kept lazy, no `*`-catch handling added |
| `app/src/shared/shell/GlobalNavbar.tsx` | +2 / -1 | `PrimaryDestination` union extended with `'registry'`; `{ id: 'registry', label: 'Registry', path: '/registry' }` appended as LAST entry of `DESTINATIONS` |
| `app/src/shared/shell/GlobalNavbar.test.tsx` | +2 / -0 | `expect(screen.getByTestId('global-nav-registry')).toBeDefined()` added in BOTH enumeration sites (desktop "renders all primary destinations" + mobile hamburger test) |
| `app/src/App.test.tsx` | +11 / -1 | `vi.mock('./pages/RecordRegistryPage', …)` (default export mock), new `renders RecordRegistryPage at /registry` case, and removal of `'/registry'` from the "renders 404 for retired legacy URL" list — REQUIRED: `/registry` is now a live route, so leaving it there would assert the opposite of the deliverable and fail |

## Raw git diff

```
$ git -c core.fileMode=false diff -- app/src/App.tsx app/src/App.test.tsx app/src/shared/shell/GlobalNavbar.tsx app/src/shared/shell/GlobalNavbar.test.tsx
diff --git i/app/src/App.test.tsx w/app/src/App.test.tsx
index 5b27937f..5ff6c302 100644
--- i/app/src/App.test.tsx
+++ w/app/src/App.test.tsx
@@ -39,6 +39,10 @@ vi.mock('./settings/SettingsRoute', () => ({
   SettingsRoute: () => <div data-testid="settings-route">settings</div>,
 }))
 
+vi.mock('./pages/RecordRegistryPage', () => ({
+  default: () => <div data-testid="record-registry-page">registry</div>,
+}))
+
 vi.mock('./shell/ErrorBoundary', () => ({
   ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
 }))
@@ -127,6 +131,13 @@ describe('App router (Phase 12)', () => {
     )
   })
 
+  it('renders RecordRegistryPage at /registry', async () => {
+    visit('/registry')
+    await waitFor(() =>
+      expect(screen.getByTestId('record-registry-page')).toBeTruthy(),
+    )
+  })
+
   // ---- Retired legacy routes render 404 ---------------------------------
 
   for (const url of [
@@ -140,7 +151,6 @@ describe('App router (Phase 12)', () => {
     '/runs/RUN-1',
     '/runs/RUN-1/editor',
     '/runs/RUN-1/editor/canvas',
-    '/registry',
     '/component-library',
     '/formulations',
     '/materials',
diff --git i/app/src/App.tsx w/app/src/App.tsx
index b198c889..7dd776cf 100755
--- i/app/src/App.tsx
+++ w/app/src/App.tsx
@@ -68,6 +68,8 @@ const ExtractionReviewPage = lazy(async () => import('./extraction/ExtractionRev
 const GraphSearchPage = lazy(async () => import('./graph-search/GraphSearchPage').then((m) => ({ default: m.GraphSearchPage })))
 const AnalysisPage = lazy(async () => import('./analysis/AnalysisPage').then((m) => ({ default: m.AnalysisPage })))
 const ChatPage = lazy(async () => import('./chat/ChatPage').then((m) => ({ default: m.ChatPage })))
+// QMS-5: record registry (multi-kind QMS browser). Default export.
+const RecordRegistryPage = lazy(async () => import('./pages/RecordRegistryPage').then((m) => ({ default: m.default })))
 
 function DeferredRoute({ children }: { children: React.ReactNode }) {
   return <Suspense fallback={<div style={{ padding: '1rem' }}>Loading...</div>}>{children}</Suspense>
@@ -206,6 +208,8 @@ export function App() {
               <Route path="/analysis" element={<DeferredRoute><AnalysisPage /></DeferredRoute>} />
               {/* Standalone ChatGPT-style chat against the local AI model. */}
               <Route path="/chat" element={<DeferredRoute><ChatPage /></DeferredRoute>} />
+              {/* QMS-5: multi-kind record registry (people/equipment/training/…). */}
+              <Route path="/registry" element={<DeferredRoute><RecordRegistryPage /></DeferredRoute>} />
               <Route path="/settings" element={<DeferredRoute><SettingsRoute /></DeferredRoute>} />
               {/* Phase 7: retired legacy URLs do not redirect. */}
               <Route path="*" element={<NotFoundRoute />} />
diff --git i/app/src/shared/shell/GlobalNavbar.test.tsx w/app/src/shared/shell/GlobalNavbar.test.tsx
index 87abf380..3fc2076b 100755
--- i/app/src/shared/shell/GlobalNavbar.test.tsx
+++ w/app/src/shared/shell/GlobalNavbar.test.tsx
@@ -43,6 +43,7 @@ describe('GlobalNavbar', () => {
     expect(screen.getByTestId('global-nav-lab')).toBeDefined()
     expect(screen.getByTestId('global-nav-ingestion')).toBeDefined()
     expect(screen.getByTestId('global-nav-chat')).toBeDefined()
+    expect(screen.getByTestId('global-nav-registry')).toBeDefined()
   })
 
   it('renders global search bar', () => {
@@ -84,6 +85,7 @@ describe('GlobalNavbar', () => {
     expect(screen.getByTestId('global-nav-lab')).toBeDefined()
     expect(screen.getByTestId('global-nav-ingestion')).toBeDefined()
     expect(screen.getByTestId('global-nav-chat')).toBeDefined()
+    expect(screen.getByTestId('global-nav-registry')).toBeDefined()
     expect(screen.getByTestId('global-search-bar')).toBeDefined()
     expect(screen.getByTestId('create-menu')).toBeDefined()
 
diff --git i/app/src/shared/shell/GlobalNavbar.tsx w/app/src/shared/shell/GlobalNavbar.tsx
index ec8723a9..741ca43e 100755
--- i/app/src/shared/shell/GlobalNavbar.tsx
+++ w/app/src/shared/shell/GlobalNavbar.tsx
@@ -18,7 +18,7 @@ import { CreateMenu } from './CreateMenu'
 import { useViewport } from './useViewport'
 import './GlobalNavbar.css'
 
-type PrimaryDestination = 'projects' | 'runs' | 'claims' | 'lab' | 'ingestion' | 'intake' | 'chat'
+type PrimaryDestination = 'projects' | 'runs' | 'claims' | 'lab' | 'ingestion' | 'intake' | 'chat' | 'registry'
 
 const DESTINATIONS: { id: PrimaryDestination; label: string; path: string }[] = [
   { id: 'projects', label: 'Projects', path: '/projects' },
@@ -28,6 +28,7 @@ const DESTINATIONS: { id: PrimaryDestination; label: string; path: string }[] =
   { id: 'ingestion', label: 'Ingestion', path: '/ingestion' },
   { id: 'intake', label: 'Intake', path: '/intake' },
   { id: 'chat', label: 'Chat', path: '/chat' },
+  { id: 'registry', label: 'Registry', path: '/registry' },
 ]
 
 export function GlobalNavbar() {
```

`git -c core.fileMode=false diff --stat` (same four paths):
```
 app/src/App.test.tsx                       | 12 +++++++++++-
 app/src/App.tsx                            |  4 ++++
 app/src/shared/shell/GlobalNavbar.test.tsx |  2 ++
 app/src/shared/shell/GlobalNavbar.tsx      |  3 ++-
 4 files changed, 19 insertions(+), 2 deletions(-)
```

## Vitest — raw output

Command: `cd /mnt/vast/home/brad/git/wt/qms-5-lane1/app && npx vitest run src/shared/shell/GlobalNavbar.test.tsx src/App.test.tsx`
(process exit code 1 — caused entirely by PRE-EXISTING failures, see attribution below; my changes were first stashed and the identical 8-failure baseline was confirmed on the untouched tree)

```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/qms-5-lane1/app

 ✓ src/shared/shell/GlobalNavbar.test.tsx  (4 tests) 41ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/App.test.tsx > App router (Phase 12) > renders WelcomePage at /
 FAIL  src/App.test.tsx > App router (Phase 12) > redirects /browser to / (Welcome)
 FAIL  src/App.test.tsx > App router (Phase 12) > redirects /protocols to / (Welcome)
 FAIL  src/App.test.tsx > App router (Phase 12) > redirects /literature to / (Welcome)
 FAIL  src/App.test.tsx > App router (Phase 12) > renders 404 for retired legacy URL /runs/RUN-1
 FAIL  src/App.test.tsx > App router (Phase 12) > renders 404 for retired legacy URL /ingestion
 FAIL  src/App.test.tsx > App router (Phase 12) > renders 404 for retired legacy URL /extraction
 FAIL  src/App.test.tsx > App router (Phase 12) > renders 404 for retired legacy URL /extraction/review/DRA-1

⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
Error: Failed to resolve import "./draftChanges" from "src/event-editor/right-pane/ai/AiTabPanel.tsx". Does the file exist?

 Test Files  1 failed | 1 passed (2)
      Tests  8 failed | 28 passed (36)
     Errors  1 error
```

Targeted proof my new case passes:
`npx vitest run src/App.test.tsx -t "registry"` →
```
 ✓ src/App.test.tsx > App router (Phase 12) > renders RecordRegistryPage at /registry
 Test Files  1 passed (1)
      Tests  1 passed | 31 skipped (32)
```

GlobalNavbar suite: **4/4 green** with the new assertions (both enumeration sites).
New `/registry` route case: **green** (verified in isolation; the 8 unrelated failures do not touch it).
Bonus check (not required): `npx vitest run src/pages/RecordRegistryPage.test.tsx` → `Tests 13 passed (13)`.

### Attribution of the 8 failures + 1 error — PRE-EXISTING, not introduced by QMS-5

I stashed all four changed files and re-ran on the untouched `wt/qms-5-lane1` tree:
```
 Test Files  1 failed (1)
      Tests  8 failed | 24 passed (32)   (same 8 FAIL names, verbatim)
```
Identical failure set with my diff removed ⇒ zero regressions. Root causes (all stale Phase-12-era expectations against current trunk behavior, none related to `/registry`):
- `renders WelcomePage at /`, `redirects /browser|/protocols|/literature to / (Welcome)` — the test file mocks `./welcome/WelcomePage`, but current App.tsx routes `/` to `HomeRedirect` (→ `/splash` when no tabs) and `/browser`→`LegacyModeRedirect`, `/protocols`→`LegacyModeRedirect`, `/literature`→`LiteraturePage`. The test file was never updated after the Phase-1 collection-views rework.
- `renders 404 … /runs/RUN-1`, `/ingestion`, `/extraction`, `/extraction/review/DRA-1` — these are LIVE routes in current App.tsx (RunWorkspacePage, IngestionPage, ExtractionDraftsListPage/ExtractionReviewPage), yet still listed as "retired legacy" in the test.
- Uncaught `Failed to resolve import "./draftChanges"` — `src/event-editor/right-pane/ai/AiTabPanel.tsx:34` imports `./draftChanges`, a file that does not exist anywhere in this branch's history (`git log --all -- …/draftChanges.ts` empty). It is pulled in by the eager `/literature` → LiteraturePage → … → AiTabPanel module chain during the stale `/literature` test. Pre-existing broken import on the trunk.

## Typecheck — raw

```
$ cd /mnt/vast/home/brad/git/wt/qms-5-lane1 && npm run typecheck -w app
> @computable/app@0.1.0 typecheck
> tsc --noEmit

src/event-editor/EventEditorContext.tsx(1288,29): error TS2339: Property 'equipments' does not exist on type '{ eventGraphId: string; runId: string | null; events: PlateEvent[]; labwares: Record<string, Labware>; placements: EventEditorPlacement[]; }'.
src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/deck/PreviewActionBar.test.tsx(108,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/editorHistory.test.ts(176,34): error TS2345: Argument of type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: never[]; labwares: {}; placements: never[]; }' is not assignable to parameter of type 'EventEditorAction'.
  Property 'equipments' is missing in type '{ … }' but required in type '{ …equipments: Record<string, Equipment>; … }'.
src/event-editor/editorHistory.test.ts(199,37): error TS2345: Argument of type '{ type: "load_event_graph_success"; … }' is not assignable to parameter of type 'EventEditorAction'.
src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/right-pane/ai/AiTabPanel.tsx(34,40): error TS2307: Cannot find module './draftChanges' or its corresponding type declarations.
src/event-editor/right-pane/ai/systemPromptForViewer.ts(45,3): error TS2322: Type '"document" | "protocol-review" | "pdf" | "deck" | "project-details"' is not assignable to type 'SystemPromptKind'.
src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx(143,35): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'.
src/event-editor/topbar/DeckModeSwitcher.tsx(11,24): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'.
src/event-editor/viewer/Viewer.tsx(64,13): error TS2322: Type '{ id: string; kind: "protocol-review"; … }' is not assignable to type 'never'.
src/event-editor/viewer/ViewerToolbar.tsx(54,13): error TS2322: Type '{ id: string; kind: "protocol-review"; … }' is not assignable to type 'never'.
src/event-editor/viewer/deck/DeckToolbar.tsx(38,31): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'.
src/ingestion/VendorPdfReviewPage.tsx(920,16): error TS2739: … missing … from type 'ExtractionProgressPanelProps': options, level, onLevelChange
src/types/labware.ts(1368,41): error TS2339: Property 'physical_geometry' does not exist on type 'LabwareDefinition'.
src/types/labwareFootprint.ts(155,30): error TS2339: Property 'physical_geometry' does not exist on type 'LabwareDefinition'.
npm error Lifecycle script `typecheck` failed with error:
npm error code 2
exit=2
```

Exit code: **2** (spec expected 0 — see attribution). **None of the 17 errors is in a file I touched** (my files: App.tsx, App.test.tsx, GlobalNavbar.tsx, GlobalNavbar.test.tsx — zero errors reported for them; `./pages/RecordRegistryPage` resolves cleanly, proving the lazy import and default-export shape typecheck). All 17 errors are in `event-editor/**` (`runDeckLock`/`equipments` state drift, the missing `./draftChanges` module, `protocol-review` viewer-kind narrowing), `ingestion/VendorPdfReviewPage.tsx`, and `types/labware*` — pre-existing trunk rot carried by `cl/integration-1`. The typecheck-exit-0 acceptance criterion is unreachable on this base commit without out-of-scope fixes; recommend the orchestrator treat these as an existing trunk debt item, not a QMS-5 regression. (Verified none of these names appear in my diff.)

## Out-of-scope notes (NOT fixed, per spec)

- App.test.tsx is broadly stale ("Phase 12" era): 4 welcome/redirect expectations and 4 "retired legacy URL 404" expectations contradict current trunk routing (HomeRedirect, collection views, live /ingestion & /extraction routes). Left as-is; the browser-reviewer gate and orchestrator decide whether a dedicated test-refresh lane is warranted.
- `src/event-editor/right-pane/ai/AiTabPanel.tsx:34` imports `./draftChanges`, a module that exists nowhere in this branch's history (broken on trunk; surfaces as a vitest uncaught exception and a TS2307).
- The 17 pre-existing `tsc` errors above (`runDeckLock`, `equipments`, `physical_geometry`, `protocol-review` kind narrowing, `ExtractionProgressPanelProps`).
- The `/lab` dead "Documents" category (kind `document`, 0 records) owned by QMS-6 — untouched; I did NOT add any second "Documents"/"SOPs" nav affordance (single affordance preserved: exactly one new `Registry` button).
- `DocumentControlBar.tsx` orphan, `NavLinks.tsx` orphan (zero importers), registry verbs/capabilities tab half-breakage, signing — all untouched per spec.
- I did NOT resurrect or route `/browser`.

## Deliberately NOT done

- Did not edit: `RecordRegistryPage.tsx`, `RecordRegistryPage.test.tsx`, `DocumentControlBar.tsx`, `NavLinks.tsx`, `shared/api/client.ts`, anything under `server/` or `schema/`.
- Did not commit, stage (changes left unstaged in the worktree), merge, or push.
- Did not restart or run any dev stack; no YAML changed.
- Did not fix the pre-existing App.test.tsx failures or trunk typecheck errors (out of scope; only the 4 files in the spec's file list were touched).

## Environment notes for the orchestrator

- The worktree had NO `node_modules` (fresh worktree); I ran `npm ci --no-audit --no-fund` at the worktree root (git-ignored; `git check-ignore` confirms `node_modules` and `app/node_modules` ignored; `git status` on `app/src` shows only my 4 files). npm reported `better-sqlite3`/`esbuild` install-scripts skipped by allowScripts policy — irrelevant to app vitest/tsc, both ran.
- The NFS checkout shows the known ~2550 mode-only ghost "modified" files; all git operations used `-c core.fileMode=false` + explicit paths. During baseline verification a `git stash pop` was blocked by that stat noise; I restored my 4 files from the stash object (`git checkout stash@{0} -- <paths>`), dropped the stash, and unstaged — final `git diff HEAD --stat` on the four paths matches the diff above exactly.
