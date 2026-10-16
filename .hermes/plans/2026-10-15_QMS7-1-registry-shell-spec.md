# SPEC DRAFT — QMS7-1: Host /registry inside the unified workspace shell (D1)

CONTRACT HEADER
- campaign: QMS registry unification + CRUDa + seed coherence — wave 3, lane 1
- item: QMS7-1 (status in-progress, claimed 20261015T1935 tick l1t1920, deps: [])
- composer: cl-spec-composer (draft; orchestrator reviews + promotes before dispatch)
- drafted: 2026-10-16T00:55 EDT against trunk cl/integration-1 @ 71412415 (all file:line cites below re-verified at this tip by the composer with read_file/grep, not inherited from orchestrator recon)
- binding ruling: Brad C (2026-10-15, intake packet ~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/intake-packet.md:88): /registry becomes a workspace-hosted surface like /record/:id — AppShell + WorkspaceTabStrip tab registration + WorkspaceProvider with SCRATCH_STUDY_ID fallback + the universal RightPane. The registry's list+editor two-pane interaction stays as MAIN-PANE (leftPane) content; its hand-rolled viewport-height layout is dropped. Record rows opening extra /record/:id tabs is OUT of scope.
- worker contract: branch `wt/QMS7-1-lane1-<yyyymmddTHHMM>` cut from cl/integration-1 tip AT CODER START (71412415 at draft time; re-resolve tip at dispatch); worktree `/mnt/vast/home/brad/git/wt/QMS7-1-lane1-<ts>`; ALL git via `git -c core.fileMode=false`; deliverable report `~/.hermes/cl/lanes/1/qms7-1-report-<ts>.md` + handoff `<worktree>/.hermes/plans/handoffs/<date>_qms7-1-registry-shell-complete.md`; no `pnpm install` (lockfile drift — use existing node_modules); NEVER restart/restart-pattern-kill the :3092/:5192 lane stacks or touch :3001/:5174; browser gate is the cl-browser-reviewer's job LATER, not the coder's.

GOAL (one line)
Make /registry a first-class workspace surface: GlobalNavbar + workspace tab strip + universal RightPane around the existing registry list+editor, with idempotent tab registration and live selection context for the AI panel — zero new shell/panel/navigation models.

=====================================================================
GROUND-TRUTH FINDINGS (verified at 71412415)
=====================================================================

ROUTE + PAGE TODAY
- app/src/App.tsx:215 mounts `<Route path="/registry" element={<DeferredRoute><RecordRegistryPage /></DeferredRoute>} />`; lazy import at App.tsx:73 (default export). GlobalNavbar ALREADY has the registry destination (GlobalNavbar.tsx:21,30 — `{ id: 'registry', label: 'Registry', path: '/registry' }`, testid `global-nav-registry`) — nav needs NO change.
- app/src/pages/RecordRegistryPage.tsx (476 lines): REGISTRY_TABS const :15-25; `activeTab` plain useState :36 (no URL state — stays that way); hand-rolled `flex h-[calc(100vh-4rem)]` root div :300; combobox + ProjectionTapTabEditor + DocumentControlBar + RelatedRecordsCard + CsvImportModal (mounted at :464-473 with `schemaId=""` `fields={[]}` dead chrome — QMS7-5 owns its deletion; leave byte-identical inside the reparented pane).
- app/src/App.test.tsx:43 mocks RecordRegistryPage with `data-testid="record-registry-page"`; :134-137 asserts it renders at /registry. That test must keep passing (update the mock target if the route now imports the host wrapper).

THE HOST PATTERN (follow wholesale): app/src/shared/shell/RecordHostPage.tsx (138 lines)
- WorkspaceProvider(studyId) wrapping AppShell layout="workspace" topbarTabs={<WorkspaceTabStrip/>} leftPane={panel} rightPane={<RightPane/>} (:127-137).
- SCRATCH_STUDY_ID = 'STU-scratch' from app/src/event-editor/legacyRouteResolution.ts:18.
- Tab registration: `const navigateActiveTab = openTabs?.navigateActiveTab` then a useEffect keyed on that STABLE callback, NOT the context object — :78-80 comment: fresh context identity per provider render causes infinite update loops. openTab/navigateActiveTab on an existing id REPLACES the tab and preserves opener breadcrumb (:75-77).
- Idempotence machinery (verified, do not re-implement): OpenTabsContext.tsx 'navigate-active' → isSameEntity branch keeps the slot id (:189-195) and NO-OP-GUARDS identical payloads returning the SAME state (:203-205, the "Maximum update depth exceeded" fix); 'open' re-registration of an already-open tab activates WITHOUT recording a history visit (:152-158).

TAB KIND LANDSCAPE (drives OQ1)
- WorkspaceTab is a discriminated union in app/src/event-editor/workspace/types.ts:33-122: deck|pdf|document|project-details|record-create|record-edit|execution|project|run|claim|lab-entity|protocol-review|collection|splash. NO registry-shaped kind exists.
- Six exhaustive `never`-guard sites switch on tab.kind (grep `_exhaustive` verified): workspace/types.ts entityTabType :198-225; shared/shell/OpenTabsContext.tsx defaultRightPaneMode :346-378; shared/shell/WorkspaceTabStrip.tsx tabPath :177-216; shared/session/tabId.ts stableTabId :27-66; event-editor/viewer/Viewer.tsx :33-66; event-editor/viewer/ViewerToolbar.tsx :28-46. A new union member makes ALL SIX fail tsc until updated — that is the canonical failure mode for this item.
- `collection` kind is DISQUALIFIED as a reuse: WorkspaceTabStrip.tsx:105-106 FILTERS collection tabs out of the strip (`tab.kind !== 'collection'`) — the registry tab must be VISIBLE; and its `collection` field is a closed union 'projects'|'runs'|'claims'|'lab' (:115). `record-edit` reuse would mint a tab per selected record — exactly the out-of-scope behaviour from ruling C.
- Precedent that tab kinds may exist client-side only: server/src/workspace/types.ts parseWorkspaceState (:174-263) handles only deck/pdf/document/project-details/record-create/execution/project/run/claim/lab-entity and silently DROPS unknown kinds (:259-262 comment). collection/splash/record-edit already have no server arm. The session store used by host pages is the client side: shared/session/sessionYaml.ts keeps `kind: string` generically (:29,:112-113) — a new kind round-trips through the persisted session with zero server change.

RIGHTPANE / AI-CONTEXT RECON (drives OQ2) — the load-bearing part
- RightPane (app/src/event-editor/right-pane/RightPane.tsx, 107 lines): chrome only; AI mode renders <ChatContextHeader/> + <AiTabPanel/>. It reads `useWorkspace()` (WorkspaceContext) — NOT OpenTabsContext. runId is derived from the WorkspaceProvider's own tab list (:47-63); every other panel (Details :97) gates on the WorkspaceProvider's active tab (DetailsTabPanel.tsx:33-35 requires kind 'deck', friendly placeholder otherwise).
- How AiTabPanel derives its target TODAY (app/src/event-editor/right-pane/ai/AiTabPanel.tsx):
  - `activeTab` = ws.state.tabs.find(id === ws.state.activeTabId) (:133-136) — the PER-STUDY WorkspaceContext state, not the OpenTabs strip store.
  - systemPrompt = systemPromptForViewer(systemPromptKindForTab(activeTab)) (:151-154); the outbound `context` memo (:224-325) carries studyId + activeTabKind + artifactId/eventGraphId for viewer kinds ONLY — verified there is NO recordId channel in the memo (grep: the only recordIds are protocol-selection ones).
  - Deck machinery (EventEditorContext, ProtocolSelectionContext / ChatContextHeader.tsx) is deck-scoped; null elsewhere — the honest state on /record/:id TODAY: the AI sees studyId + the WorkspaceProvider's default project-details tab (defaultWorkspaceState, workspace/types.ts:272-289). The RecordHostPage-registered record-edit tab lives in OpenTabsContext, which AiTabPanel NEVER reads for context (only for openContent source-chips, :1043).
  - The only selection→AI channel that exists is the EXPLICIT-dispatch `SURFACE_AI_REQUEST_EVENT` window event (shared/context/SurfaceContext.ts:66, listener AiTabPanel.tsx:1099-1109) — used by /find and /analysis when the user clicks "ask AI"; it SENDS a chat turn; it is not a live selection pointer.
- CONCLUSION: the existing machinery has NO legitimate live channel for a record-less selection (OQ2 with recommendation below). The legitimate live channel is the WorkspaceProvider's own tab state via `ws.openTab` — the same call ProjectWorkspacePage.tsx:144 makes — because `context` memo deps include activeTab (:325), so re-registering an active 'record-edit'-kind tab on every selection change makes the AI turn context change with it (activeTabKind + identity). ws.openTab is idempotent on id (workspace/reducer.ts open-tab case, :37-51).

SHELL COMPOSITION FACTS
- AppShell layout="workspace" renders GlobalNavbar + topbarTabs row + SurfaceIndicator + a react-resizable-panels two-pane split with the LEFT pane filling the viewport height (AppShell.tsx:122-158, WorkspaceMain :295-324) — the registry's `h-[calc(100vh-4rem)]` must become full-height-of-pane (`h-full min-h-0`), NOT be deleted structurally: the inner `flex-1 overflow-y-auto` list (:338) needs a bounded parent.
- WorkspaceProvider persists per-study workspace.yaml to the SERVER with a 500ms debounce (WorkspaceContext.tsx:146-178). On STU-scratch that file already exists for every /record/:id visit (RecordHostPage does the same) — selection-driven openTab writes are the SAME established persistence, not a new one.

VERIFIED BASELINES (composer ran these at 71412415 in the integration worktree, 2026-10-16 00:40 EDT)
- app tsc: `cd app && npx tsc --noEmit` → EXACTLY 23 "error TS" lines across 16 files. All pre-existing; ZERO in RecordRegistryPage.tsx, App.tsx, shared/shell/**, workspace/types.ts, OpenTabsContext.tsx, WorkspaceTabStrip.tsx, tabId.ts, RecordHostPage.tsx. One pre-existing error sits in right-pane/ai/systemPromptForViewer.ts (:182 never-arm — 'protocol-review' not assignable to SystemPromptKind) — the EXACT error class a new tab kind provokes if the union updates are incomplete. Pinned failing-file-set (failing-FILE-SET equality style):
  src/event-editor/deck/LawnSurface.moveAcross.test.tsx(1) deck/PreviewActionBar.test.tsx(1) editorHistory.test.ts(2) EventEditorContext.tsx(1) focus/LabwareFocus.instrument.test.tsx(1) right-pane/ai/systemPromptForViewer.ts(1) right-pane/ai/useChatThread.deckLayout.test.tsx(2) right-pane/protocol/ProtocolLocalizationThread.tsx(1) topbar/DeckModeSwitcher.tsx(1) viewer/deck/DeckToolbar.tsx(1) viewer/ViewerToolbar.tsx(1) viewer/Viewer.tsx(1) ingestion/components/IngestionUploadModal.tsx(1) ingestion/protocol-review/ExtractionProgressPanel.test.tsx(1) shared/context/useSurfaceContext.ts(1) shared/hooks/useAiChat.surfaceContext.test.ts(6).
  Multiset pin (file:code only, line/col stripped): `npx tsc --noEmit 2>&1 | grep -P "error TS" | sed -E 's/\(([0-9]+),([0-9]+)\)//' | sort | sha256sum` → 723a7fb86ab0ec242d9185ef683abb4f8d9130740b45f9e7e0a1dbc9cbeaeecb. (Matches the lane handoff pin "app tsc baseline 23", e.g. handoffs/2026-10-13_* — the stale "31" figure is corrected in handoffs/2026-10-12_lane1-tick-20261012T1330 §40-41.)
- app vitest FULL run (`cd app && npx vitest run`): Test Files 61 failed | 284 passed (345); Tests 65 failed | 2252 passed (2317). 61 = 27 e2e/*.spec collection failures (playwright specs under vitest — always fail there) + 34 src unit fail-files. Matches the lane pin "app fail-files 61" (handoffs/2026-10-13_...T1620). src subset: App.test.tsx claims/ClaimWorkspace.test.tsx collections/ClaimCollectionView.test.tsx editor/RawRecordEditor.test.tsx editor/taptab/documentMapper.test.ts editor/taptab/RefCombobox.test.tsx editor/taptab/widgets/ChipComboboxWidget.test.tsx event-editor/deck/LabwareGlyph.test.tsx event-editor/deck/LawnSurface.footprint.test.tsx event-editor/execution/ExecutionContext.test.tsx event-editor/projects/ProjectTabStrip.test.tsx event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx event-editor/right-pane/ai/draftChanges.test.ts event-editor/right-pane/ai/ParameterAnswerInput.test.tsx event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx event-editor/right-pane/find/FindTabPanel.inventory.test.tsx event-editor/right-pane/find/FindTabPanel.test.tsx event-editor/viewer/document/DocumentEditorContext.test.tsx event-editor/viewer/pdf/PdfViewer.test.tsx event-editor/viewer/ViewerToolbar.test.tsx extensions/ExtensionContext.test.tsx extraction/ExtractionDraftsListPage.test.tsx ingestion/VendorPdfReviewPage.treeSelect.test.tsx knowledge/browser/RecordPreviewPanel.test.tsx lab/LabEntityWorkspace.test.tsx literature/LiteraturePage.test.tsx protocol-ide/ProtocolIdeIntakePane.test.tsx protocol-ide/ProtocolIdeShell.test.tsx protocol-ide/ProtocolIdeSourcePane.test.tsx protocols/ProtocolsPage.test.tsx shared/context/useSurfaceContext.test.ts shared/hooks/useAiChat.surfaceContext.test.ts types/createLabwareFromDefinitionPayload.test.ts welcome/WelcomePage.test.tsx. NOTE: pages/RecordRegistryPage*.test.tsx and shared/shell tests are GREEN at base and must stay green.

=====================================================================
HOST-WRAPPER COMPOSITION PLAN
=====================================================================

IN SCOPE (the complete edit surface):
- app/src/shared/shell/RegistryHostPage.tsx (NEW) — modeled on RecordHostPage.tsx, minus the study resolution (the registry is not study-scoped):
  1. `const navigateActiveTab = openTabs?.navigateActiveTab`; useEffect([navigateActiveTab]) → `navigateActiveTab({ id: registryTabId(), kind: 'registry', title: 'Registry' })` (pending OQ1; if the ruling is a different kind, same shape). Copy RecordHostPage's :75-80 comment verbatim — the stable-callback dep is the idempotence/no-loop contract.
  2. `<WorkspaceProvider studyId={SCRATCH_STUDY_ID}><AppShell brand="Registry" layout="workspace" topbarTabs={<WorkspaceTabStrip />} leftPane={<RecordRegistryPage />} rightPane={<RightPane />} /></WorkspaceProvider>`.
- app/src/App.tsx — lazy-import RegistryHostPage beside :62; :215 route element becomes `<DeferredRoute><RegistryHostPage /></DeferredRoute>`. Import of RecordRegistryPage at :73 moves to the host page (App.tsx keeps no direct reference).
- app/src/pages/RecordRegistryPage.tsx — TWO mechanical changes only: (a) root div :300 `flex h-[calc(100vh-4rem)]` → `flex h-full min-h-0 flex-col`-safe equivalent that fills the AppShell left Panel (keep the internal list/editor flex structure byte-identical); (b) the selection-context effect from the OQ2 recommendation (guarded by useOptionalWorkspace so all existing RecordRegistryPage tests, which mount the page WITHOUT a WorkspaceProvider, keep passing unchanged). NOTHING else in the file changes: fetch/refreshSeq/selection/save/draft-copy/DocumentControlBar/CsvImportModal stay exactly as they are (reparent, don't rewrite).
- app/src/event-editor/workspace/types.ts + the five other exhaustive sites (entityTabType, defaultRightPaneMode, tabPath, stableTabId, Viewer, ViewerToolbar) + systemPromptKindForTab null-list — ONLY if OQ1 rules a new 'registry' kind (recommended). Add `registryTabId(): 'registry'` next to the other id helpers in types.ts (one id policy, shared/session/tabId.ts reuses it like recordEditTabId).

EXPLICITLY OUT OF SCOPE (any diff here = stop-boundary, return requires-rescope):
- server/** and schema/** (including surfaces.yaml and server/src/workspace/types.ts — the parse silently drops unknown kinds and that is ACCEPTED, see OQ1).
- RightPane internals: RightPane.tsx, AiTabPanel.tsx, ChatContextHeader.tsx, useWorkstateProposalFlow.ts, sidebarState.ts. The ONE exception if OQ1 rules new-kind: the systemPromptForViewer.ts exhaustive-arm (return null like record-edit does at :32-44) — a union-completion, not a panel change.
- The registry list/editor/combobox interaction and data flow; DocumentControlBar semantics; CsvImportModal (deletion = QMS7-5; mount stays).
- Record rows opening /record/:id tabs (ruling C, out); GlobalNavbar edits (nav entry already exists); URL-state for the registry's internal tabs (activeTab stays useState); SurfaceIndicator/SurfaceContext changes (OQ3).

=====================================================================
AI-CONTEXT WIRING PLAN (exact existing channel named)
=====================================================================

Channel = the INNER WorkspaceContext: `useOptionalWorkspace()` inside RecordRegistryPage, `ws.openTab(...)` on selection change (workspace/reducer.ts open-tab is idempotent on id and activates; AiTabPanel's `context` memo deps [ws.state.studyId, activeTab, ...] at :325 recompute on it — this is the SAME live channel ProjectWorkspacePage.tsx:144 uses; it is NOT a second context).
- New effect in RecordRegistryPage: `const ws = useOptionalWorkspace()`; when selectedRecord?.recordId becomes non-null (edit mode): `ws?.openTab({ id: recordEditTabId(id), kind: 'record-edit', recordId: id, title: id })`. When selection clears (handleCancel / tab-switch reset / save-close): `ws?.activateTab(projectDetailsTabId(ws.state.studyId))` so the target never goes stale on a closed record. Create mode does NOT mint a tab (record-create's nodeType union is study|experiment|run only — do not widen it for the registry).
- What the AI legitimately sees: studyId=STU-scratch, activeTabKind='record-edit', fresh activeTab identity per selection (no stale target — assertable in a component test). What it does NOT see: the record payload (the context memo has no recordId/record-body channel and adding one is a RightPane-internals change = OQ2 escalation path, deferred to QMS7-6 which owns the proposal flow).
- Do NOT dispatch SURFACE_AI_REQUEST_EVENT from selection changes — it fires an actual chat turn per click (verified listener sends immediately, AiTabPanel.tsx:1103-1106).

=====================================================================
RED-FIRST TEST PLAN (write these FIRST, at base, and let them fail)
=====================================================================

1. NEW app/src/shared/shell/RegistryHostPage.test.tsx (component test, MemoryRouter + OpenTabsProvider, mirroring existing shell tests):
   - RED AT BASE: /registry renders NO [data-testid="global-navbar"], NO [data-testid="workspace-tab-strip"], NO [data-testid="right-pane"] → the test asserting all three fails at base, passes when the host wrapper lands. (Base = RecordRegistryPage bare; these testids only exist inside AppShell workspace layout / RightPane chrome.)
   - REGISTRATION: after render, exactly ONE tab whose id starts with the registry tab id exists in the strip ([data-testid^="workspace-tab-registry"] count === 1).
   - IDEMPOTENCE (pin this like RecordHostPage's openTab-replaces semantics): remount the host twice / re-render + advance timers → STILL exactly one registry tab, no duplicate.
   - AI CONTEXT: probe component under the same WorkspaceProvider captures ws state; select a record (reuse the existing RecordRegistryPage combobox-mock pattern from pages/RecordRegistryPage.test.tsx) → captured state's activeTab is {kind:'record-edit', recordId:'<id>'}; cancel → back to project-details.
2. Existing app/src/App.test.tsx:134 `/registry` test stays green (adjust the mock at :43 if the route now imports RegistryHostPage; the record-registry-page testid must remain findable).
3. Existing pages/RecordRegistryPage.test.tsx / .createSearch / .qms6e stay green with the page mounted bare (proves useOptionalWorkspace null-guard + the layout change break nothing).
4. Browser regressions (cl-browser-reviewer LATER on :5192, receipts ~/.hermes/cl/receipts/QMS7-1/<ts>/ — coder does not run the gate): per the task's verified-by VERBATIM:
   "Browser regressions FIRST show missing shell/tabs/right-pane at base. At tip: navigate http://computable:5192/registry and GlobalNavbar + workspace tab strip + right pane render; refresh and browser back/forward keep the tab correctly registered (no duplicate registry tabs); switching workspace tabs and back works; /record/:recordId and other surfaces unchanged. Selecting different records updates the AI context (no stale target). LANE STACK :5192/:3092 only (never the :5174 main stack). cl-browser-reviewer VERDICT: accept on receipts."
   Receipts pattern: registry-shell (navbar+strip+rightpane), tab-strip-after-refresh (exactly one Registry tab), back/forward, AI-target after selecting record A then B (ChatContextHeader/surface state visible), /record/DOC-DEMO-SOP unchanged, /projects unchanged. Negative claims re-verified per the standing reviewer-reliability rule.

FIRST TARGETED CHECK (the one command that proves the approach early)
  cd /mnt/vast/home/brad/git/wt/QMS7-1-lane1-<ts>/app && npx vitest run src/shared/shell/RegistryHostPage.test.tsx
Run it BEFORE touching the exhaustive-tab-kind sites: this file's shell/registration tests go green off the host wrapper alone, and the tsc sweep below then tells you within minutes whether the OQ1 union fan-out is complete.

VERIFICATION BARS (all commands from app/ in the coder worktree; git via -c core.fileMode=false)
1. First targeted check green (above), then RED→GREEN commit trail visible in the branch log.
2. Typecheck vs baseline — failing-FILE-SET equality, 23-line pin:
   `npx tsc --noEmit 2>&1 | grep -cP "error TS"` → exactly `23`, and
   `npx tsc --noEmit 2>&1 | grep -P "error TS" | sed -E 's/\(([0-9]+),([0-9]+)\)//' | sort | sha256sum` → `723a7fb86ab0ec242d9185ef683abb4f8d9130740b45f9e7e0a1dbc9cbeaeecb`, and the per-file counts match the 16-file table above. (Any drift in the pin that is NOT one of the six exhaustive-site files means the union work introduced/removed a baseline error — stop.)
3. App suite vs baseline: `npx vitest run` → fail-file set EQUALS the 61-file baseline (27 e2e collection + the 34 src files listed); zero NEW failing files; pages/RecordRegistryPage*, shared/shell/*, the new RegistryHostPage test green. Touched-file proof: `npx vitest run src/pages src/shared/shell src/shared/session src/event-editor/workspace` fully green.
4. Scope guard: `git -c core.fileMode=false diff --name-only 71412415...HEAD` contains ONLY the IN SCOPE files (plus tests); zero server/, schema/, right-pane/ai/ paths (sole exception: systemPromptForViewer.ts if OQ1 = new kind).
5. Handoff records the three pins (tsc count+sha, vitest fail-file list) freshly re-run on the branch tip.

REVIEWER BAIT (the likely edge errors for this item — pre-empt them)
- EXHAUSTIVE UNION FAN-OUT is THE defect for OQ1=new-kind: six never-guard files + systemPromptKindForTab. tsc will show it — never "fix" it with a cast or by deleting a never-guard.
- exactOptionalPropertyTypes sites: app tsconfig does NOT enable it (verified app/tsconfig.json — strict + noUnusedLocals/Params only), but WorkspaceTab conditional fields MUST still use RecordHostPage's `...(cond ? { x } : {})` spread idiom (RecordHostPage.tsx:98-99) so no `undefined`-valued keys ever appear on a tab payload (OpenTabsContext sameTabPayload compares key SETS — a stray undefined key defeats the no-op guard → re-render loop bait).
- THE LOOP TRAP: effect deps = the stable `navigateActiveTab` / `openTab` callbacks, never the context object (RecordHostPage.tsx:78-80; OpenTabsContext.tsx:199-205 documents the "Maximum update depth exceeded" incident).
- DUPLICATE TAB ON REFRESH: rely on the reducer's existing re-registration no-op guards; a test pins exactly-one registry tab after double-mount. Do not add a hand-rolled "already registered?" check.
- YAML-RELOAD TRAP: nothing in scope is YAML. If you feel the urge to add a registry surface to schema/registry/surfaces/surfaces.yaml or server workspace types — that is OUT OF SCOPE (and tsx --watch wouldn't reload it anyway).
- HARDCODE BOUNDARY: no kind→schema maps (EDITOR-9 fix-1 derives them from GET /schemas — RecordRegistryPage.tsx:56-82 comment), no new surface-label maps in resolveSurface.ts (OQ3), REGISTRY_TABS kinds data untouched.
- NO SECOND RIGHTPANE / no new shell model / no second tab store / no new context: reuse AppShell+WorkspaceTabStrip+RightPane+WorkspaceProvider exactly as RecordHostPage composes them.
- LAYOUT: dropping h-[calc(100vh-4rem)] without giving the root a pane-filling height yields an unbounded flex child → the list's overflow-y-auto silently breaks (double-scroll / zero-height). Check the rendered scroll region in the component test or DOM.
- CsvImportModal dead chrome: leave the mount byte-identical (QMS7-5 owns it); dead chrome here is a KNOWN, scheduled defect, not yours.
- No server touches; no :3092/:5192 restarts; lane stacks are the orchestrator's.

OPEN QUESTIONS (composer could not resolve locally; orchestrator rules each)
OQ1 — Registry top-level tab: new WorkspaceTab kind 'registry', or an existing kind?
  Checked: full union read (workspace/types.ts:33-122); 'collection' disqualified (strip filters it out, WorkspaceTabStrip.tsx:105-106; closed collection-field union); 'record-edit' disqualified (one tab per record = out-of-scope behaviour); 'splash' ephemeral-ids; server parseWorkspaceState drops unknown kinds SILENTLY (server/src/workspace/types.ts:259-262) and collection/splash/record-edit already have no server arm — client-only kinds are established precedent; sessionYaml.ts stores kind as a plain string so the cross-device session round-trips a new kind unchanged.
  RECOMMENDATION: add `{ id; kind: 'registry'; title }` + `registryTabId() = 'registry'`, client-side only, updating the six never-guard sites (entityTabType → null; defaultRightPaneMode → 'ai'; tabPath → '/registry'; stableTabId → registryTabId(); Viewer/ViewerToolbar → their empty/default arms) + systemPromptKindForTab null-list. Adding a tab KIND is allowed by the item; a parallel shell model is NOT.
OQ2 — Is the openTab-on-selection channel sufficient, or does the gate demand the record itself inside the chat context?
  Checked: AiTabPanel context memo (:224-325) verified to carry NO recordId for any non-protocol tab; the only selection→AI channels are SURFACE_AI_REQUEST_EVENT (explicit send per click — wrong shape for live selection) and the deck-scoped ProtocolSelectionContext; the OpenTabs strip store is never read for AI context. The recommended channel (ws.openTab of the existing 'record-edit' kind on selection change, activateTab back to project-details on clear) makes the AI turn-context change with selection via the existing memo dep — sufficient for the verified-by clause "no stale target" but NOT for the AI quoting record contents.
  RECOMMENDATION: ship the openTab channel in QMS7-1; put "selected record payload reaches the model" with QMS7-6 (it owns useWorkstateProposalFlow / record-creation proposals). If the orchestrator wants payload-in-context NOW, that's a RightPane-internals change and needs an explicit scope ruling — do not let the coder smuggle it in.
OQ3 — SurfaceIndicator on /registry will show the route-fallback label ('Home'/project): fix or accept?
  Checked: resolveSurface.ts SURFACE_BY_PATH has no /registry pattern (falls through to surface 'project', active root/home); adding a SurfaceId 'registry' is a SERVER-mirrored + surfaces.yaml change (server/src/surfaceContext + schema/registry/surfaces) = hard out; a client-only path-pattern→'knowledge' arm is possible (one line, /record/ already resolves to 'knowledge') but labels are supposed to come from the DATA registry, so growing client maps walks toward the hardcode boundary.
  RECOMMENDATION: accept the fallback in QMS7-1 (cosmetic; nothing in verified-by names the surface chip); route a proper registry surface-declaration to a later item if the browser gate flags it.

ASSUMPTIONS-YOU-MAY-NOT-MAKE
- That the registry tab may be hidden, per-record, closable-to-nothing, or duplicated on refresh.
- That the AI panel receives record payloads after this item (it does not — see OQ2), or that SURFACE_AI_REQUEST_EVENT may be fired on selection change (it sends a chat turn).
- That RecordRegistryPage's internal tab state moves to the URL, that selection gets a route, or that registry data fetching changes at all.
- That server workspace/session parsers need a registry arm (they don't — silent drop is precedent, OQ1 recon), or that surfaces.yaml/server files are in scope.
- That the 23-error tsc baseline or the 61 fail-file vitest baseline is "background noise to fix while in there" (do not fix, do not grow), or that pnpm install is safe (it isn't — lockfile drift).
- That the coder runs the browser gate, restarts the lane stack, or merges anything.
- That CsvImportModal can be removed (QMS7-5), that DocumentControlBar semantics can change, or that the viewport-height div can be dropped without a pane-filling replacement.


---

## ORCHESTRATOR RULINGS (l1t0140, 2026-10-16) — this section PROMOTES the draft; supersedes the OQ section

Spot-checks re-verified first-hand at >=71412415: App.tsx:73 lazy import + :215 route;
RecordRegistryPage.tsx:300 h-[calc(100vh-4rem)]; WorkspaceTabStrip.tsx:105 collection filter;
RecordHostPage.tsx:78-80 stable-callback comment; app tsc = exactly 23 error lines (orchestrator's
own run). The draft's cites hold.

- OQ1 RULED: new client-side-only 'registry' WorkspaceTab kind per the recommendation, ALL six
  never-guard sites updated exhaustively + systemPromptKindForTab null-arm + registryTabId() helper.
  No cast, no never-guard deletion. Server parseWorkspaceState silent-drop stays (no server arm).
- OQ2 RULED: ship the ws.openTab record-edit-on-selection channel; activateTab(project-details) on
  clear. Payload-in-context is NOT this item: it rides QMS7-7 (which owns useWorkstateProposalFlow —
  the draft's "QMS6" reference is corrected to QMS7-7). No RightPane-internals smuggling.
- OQ3 RULED: accept the cosmetic SurfaceIndicator fallback; no client label map, no surfaces.yaml
  touch. If the browser gate calls it a defect, it routes as its own item, not a QMS7-1 fix.

Coder dispatch is FLEET-QUEUED (queue-qms7-1.sh, blocking flock): starts only when QMS7-2 releases
the appliance-2 slot. Deliverables: report /home/brad/.hermes/cl/lanes/1/qms7-1-report-l1t0140.md;
worktree /mnt/vast/home/brad/git/wt/QMS7-1-lane1-l1t0140 off trunk tip AT LOCK TIME.
