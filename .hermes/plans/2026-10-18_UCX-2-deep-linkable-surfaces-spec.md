# UCX-2 SPEC DRAFT — Deep-linkable surfaces (URL ⇄ workspace-tab state)

Composer: cl-spec-composer, lane 2. Composed 2026-10-18 at trunk
`cl/integration-2 @ ad49df32` (all citations verified FIRST-HAND with
read_file/search_files against /mnt/vast/home/brad/git/cl-integration-2; no
scout claims are relied on — every file:line below was opened personally;
`git -c core.fileMode=false` used for git).

## GOAL

Encode the open workspace-tab strip + active tab in the URL (one query-param
scheme for all surfaces), hydrate OpenTabsContext from the URL synchronously on
load, and keep URL ⇄ tab state bidirectionally in sync (replace-only writes) so
an open-surface agent action's resulting workstate survives refresh and is
shareable — without touching any server code and without changing the behavior
of /registry, /record/:id, or /literature?view=build.

## WHY (short)

Prompt-to-workstate is worthless if the workstate evaporates on refresh or
can't be handed to a colleague. The server-side emission path already works
(AgentOrchestrator.sequencesAgentAction.test.ts per the task block); the gap is
purely client hydration. Today localStorage restores tabs on reload within one
browser (OpenTabsContext.hydration.test.ts), but the URL carries no tab state
at all — verified: no searchParams/hash reader touches the tab store at this
tip.

## SCOPE

IN (product code, all under app/):
- `app/src/shared/session/urlSession.ts` — NEW pure codec: encode/decode the
  strip into URLSearchParams (`ws`/`wsa`) + `tabFromStableId` decoder.
- `app/src/shared/session/urlSession.test.ts` — NEW (RED-first).
- `app/src/shared/shell/TabUrlSync.tsx` — NEW router-side sync component
  (inside BrowserRouter; also renders the malformed-param diagnostic).
- `app/src/shared/shell/TabUrlSync.test.tsx` — NEW (RED-first).
- `app/src/shared/shell/OpenTabsContext.tsx` — initial-resolver merge:
  URL (window.location.search) wins over localStorage, synchronously.
- `app/src/shared/shell/OpenTabsContext.url.test.ts` — NEW.
- `app/src/App.tsx` — mount `<TabUrlSync />` beside `<SessionSync />`
  (:137-139 region); pass the boot-pull suppression into SessionSync.
- `app/src/shared/session/useSessionSync.ts` — ONE new option
  (`skipBootPull?: boolean`) so an explicit ?ws= deep link outranks the
  server-session BOOT adopt (:88-112). ATTACH-on-focus unchanged.
- `app/src/sequences/SequencesPage.tsx` (+ a new `SequencesPage.urltab.test.tsx`)
  — internal tab deep-link consumer/writer (`?tab=`), mirroring the
  ISEQ-2 §4b `?record=` precedent (:32-36) and the `?source=`→Import rule (:20).
- `app/src/App.url.test.tsx` — NEW router-level pins (do NOT edit
  App.test.tsx — see baseline note).

EXPLICITLY OUT OF SCOPE:
- NO server change (server/src, schema/, prompts/) — the task states
  open-surface needs none; server emits are already proven.
- NO new surface kinds, NO new WorkspaceTab kinds, NO changes to
  `schema/registry/surfaces/surfaces.yaml` or agent-action schema.
- NO change to the tab reducer semantics (openTabsReducer untouched), to
  `openContent.ts`, `workstateExecutor.ts`, `sessionYaml.ts`, `tabId.ts`
  (tabId.ts MAY be imported from, not edited), or the AI panel handlers.
- NO fix of the 8 stale App.test.tsx pins (pre-existing debt, see BASELINE;
  minting a hygiene item is the orchestrator's call).
- NO hash-routing, NO path-scheme redesign (e.g. /workspace/...). Pathnames
  stay exactly what tabPath() already produces.

## CURRENT STATE (verified findings, file:line @ ad49df32)

Routes (app/src/App.tsx, all enumerated):
- :142 `/` → HomeRedirect (resume-my-session; depends on SYNC hydration —
  HomeRedirect.tsx:8-11 comment forbids useEffect-based loads).
- :145-151 /projects /runs /claims /claims/:claimId /lab /lab/:category
  /lab/:category/:entityId (collection views; the 4 collection pages + the
  workspace pages mount WorkspaceTabStrip via AppShell — grep list confirms).
- :152-156 /ingestion, /ingestion/:tab, /ingestion/vendor-pdf/:recordId
  (ProtocolReviewHostPage). :159-160 /intake. :164-165 /extraction. :166
  /splash. :171 /create/study. :172-173 /project/:studyId(+event-graph) →
  ProjectWorkspacePage (workspace host). :177-180 /event-editor routes.
  :185-186 /browser /protocols → LegacyModeRedirect. :187 /literature →
  LiteraturePage (STANDALONE — LiteratureBody/LiteraturePage do NOT mount
  WorkspaceTabStrip; verified absent from the WorkspaceTabStrip grep).
  :191 /protocol-builder → Navigate /ingestion. :195-196 /project/:s/run/:r
  redirect, /runs/:runId → RunWorkspacePage (workspace host). :199
  /artifact/:kind/:artifactId → ArtifactHostPage. :202-203 /record/:recordId
  + /record/new/:nodeType/:parentId? → RecordHostPage (workspace host: it
  renders AppShell layout="workspace" topbarTabs=<WorkspaceTabStrip/> —
  RecordHostPage.tsx:127-136). :206 /deck/:eventGraphId/:runId? →
  DeckHostPage. :211 /find. :212-213 /sequences + /lab/sequences →
  SequencesPage (STANDALONE page in shell chrome — SequencesPage.tsx:127
  passes NO topbarTabs). :214 /analysis. :216 /chat. :219 /registry →
  RegistryHostPage (workspace host — RegistryHostPage.tsx:46-54). :220
  /settings. :222 `*` → NotFoundRoute.

OpenTabsContext (app/src/shared/shell/OpenTabsContext.tsx, 630 lines):
- State: OpenTabsState {tabs: OpenTabState[], activeTabId, history,
  historyCursor} (:40-50); OpenTabState wraps a WorkspaceTab with
  activeRightPaneMode/breadcrumb/contentHistory/contentCursor (:27-38).
- Reducer actions: open / navigate / navigate-active / close / activate /
  rename / set-right-pane-mode / replace / back / forward / within-back /
  within-forward (:52-71). Reducer ALREADY defends reload re-registration
  against history pollution (:152-158, :196-205 no-op guard).
- API (OpenTabsContextValue :497-522): openTab, navigateActiveTab,
  navigateTab, closeTab, activateTab, renameTab, setRightPaneMode,
  canGoBack/canGoForward/back/forward, canGoBackWithin/canGoForwardWithin/
  withinBack/withinForward, replaceState. `useOptionalOpenTabs` (:628) for
  shared components.
- Persistence: localStorage `cl-open-tabs[:user]`, SYNCHRONOUS hydration in
  useReducer's third arg (:532-539; hydration test pins first-render
  visibility and the StrictMode wipe trap at :544-556).
- Provider sits ABOVE BrowserRouter (App.tsx:134-135) — it therefore CANNOT
  use react-router hooks; only plain `window.location.search` is available to
  it at hydration time. This dictates the split in DESIGN below.
- NO searchParams/hash reader touches the tab store at this tip — CONFIRMED:
  rg for searchParams/URLSearchParams/location.hash across
  app/src/event-editor/workspace + app/src/shared/shell yields only
  UserSwitcher's window.location.assign; every searchParams consumer is a
  page-local reader (list below). The task-list claim holds at ad49df32.

Tab mutators (every call site that changes tab state):
- WorkspaceTabStrip.tsx :124/:131 activateTab (tab click), :149 closeTab
  (x button), handleAddTab openTab+navigate(:splash), handleBack/Forward
  already navigate(path) (:38-78).
- openContent.ts openContent/openInNewTab (:22-44) — navigateActiveTab /
  openTab + navigate(route).
- Host pages register their own tab on mount via navigateActiveTab:
  RecordHostPage.tsx:84-105 (THE Wave-3/OWN /record/:id precedent — comment
  says "deep-link restore, Phase 4.3"), RegistryHostPage.tsx:35-42,
  ArtifactHostPage, DeckHostPage, ProtocolReviewHostPage, RunWorkspacePage,
  ProjectWorkspacePage (deps discipline: stable callbacks only, never the
  context object — App.tsx/ProjectWorkspacePage.tsx:126 comments).
- AI open-surface path: useWorkstateExecutor.executeTier1 →
  workstateExecutor.applyTier1Action (planTier1Action :114-172 builds
  {tab, route} from the SURFACE REGISTRY via surfaceRoute/tabForSurface —
  no TS route table) → openContent (navigate + navigateActiveTab). The
  sequences internal-tab variant goes through
  SequencesPage onAgentAction → applyAgentAction setTab instead.
- Session writers: useSessionSync adopt → replaceState (:78-90, ONE writer).

Existing URL-reader precedents:
- SequencesPage.tsx :20 `search.has('source') → 'Import'`; :32-36 ISEQ-2 §4b
  `?record=` consumer (fires once via deepLinkRef after first catalog load).
- /literature?view=build: LiteratureBody.tsx:54 `resolveLiteratureView(
  searchParams.get('view'))` with a KNOWN_VIEWS fallback (:39-42);
  SearchResultCard.tsx:26 builds `?view=build&pdfUrl=`.
- react-router-dom ^6.28.0 (app/package.json:41). Other page-local readers:
  GraphSearchPage ?q, PdfProtocolBuilder ?pdfUrl, ProtocolIdePage
  ?sessionId/?protocolId/?variant, ComponentLibraryPage ?runId,
  RawRecordEditor ?schemaId, mode-toggle ?mode (all unrelated to tabs).

tabPath (WorkspaceTabStrip.tsx:177-213) is the existing tab→route authority:
project→/project/:id, run|execution→/runs/:id, deck→/deck/:id[/:runId],
pdf|document→/artifact/..., protocol-review→/ingestion/vendor-pdf/:id,
record-create→/record/new/..., record-edit→/record/:id, collection→/:name,
registry→/registry, splash→/splash, project-details→null.
stableTabId (session/tabId.ts:27-64) is the existing tab→id authority
(kind:id value-derived ids; project-details/splash get random slot suffixes).
sessionYaml.ts deliberately EXCLUDES ids and re-derives via stableTabId —
the URL codec inverts that choice (ids ARE the encoding, fields re-derived)
because the URL budget is far smaller than a session document.

Sequences page internals: local tab state `tabs=['Editor','Assay','Analysis',
'Setup','Import','Knowledge']` (SequencesPage.tsx:15,:20); declared registry
tabs mirror it (schema/registry/surfaces/surfaces.yaml:92-98, compat-tested
server/src/surfaces/surfacesTabsCompat.test.ts). The Analysis tab is NOT an
OpenTabsContext tab — ws/wsa CANNOT express it; only a page-local `?tab=`
can (this is what the verified-by browser clause requires).

## DESIGN

Param scheme (one scheme for all surfaces):
- `ws` — comma-separated STRIP of open tabs in strip order, each entry the
  STABLE id (stableTabId(tab), slot suffix stripped), URL-encoded (record ids
  contain ':' which is search-legal but encode consistently via
  URLSearchParams.toString()). Example:
  `/record/DOC-1?ws=project:STU-1,record:DOC-1&wsa=record:DOC-1`
- `wsa` — the ACTIVE tab's stable id.
- `tab` — page-internal tab name, ONLY on /sequences (+/lab/sequences),
  value validated against the page's declared const tab list (registry
  data via surfaces.yaml tabs: kept in lockstep by the existing compat test).
- Never write `ws` with an empty strip; no tabs ⇒ no params at all.
- If a new noun is needed for docs/comments, prefer a CURIE-style term,
  e.g. `cl:workspace-strip-binding` for the ws/wsa pair; the diagnostic code
  follows the ExecutorDiagnostic SCREAMING convention: `MALFORMED_WS_PARAM`.

Codec (urlSession.ts, pure, no router, no DOM beyond URLSearchParams):
- `encodeWorkspaceParams(state: OpenTabsState): string` — '' when
  unencodable/inert; else `ws=...&wsa=...` search-string fragment.
  project-details and splash tabs (no stable id — tabId.ts slot-suffix
  kinds) and slot-suffixed ids encode to the BASE id (suffix stripped).
- `decodeWorkspaceParams(search: string): { state: OpenTabsState | null;
  diagnostic?: { code: 'MALFORMED_WS_PARAM'; message: string } }` —
  per-entry decode via `tabFromStableId(id)` (the mirror switch of
  stableTabId, exhaustive never-check like tabPath/defaultRightPaneMode).
  Per-entry errors drop THAT entry and keep the rest; wsa missing from the
  surviving strip → activate the first surviving tab + diagnostic; zero
  decodable entries or a malformed ws shape → state null + diagnostic.
  Decoded tabs get contentHistory=[tab], cursor 0, breadcrumb [],
  activeRightPaneMode = defaultRightPaneMode(tab), history=[wsa], cursor 0.
  Title is re-derived from the id (host-page mount re-registration enriches
  it, exactly as a localStorage reload does today).
- Round-trip pin: for every WorkspaceTab kind,
  `decode(encode(state)).tabs ≈ state.tabs` (mirror-drift guard against
  tabId.ts/types.ts changes — this test is the drift gate).

Hydration rule (OpenTabsContext.tsx, tiny change):
- Initial resolver becomes `(uid) => mergeUrlOverStorage(loadFromStorage(uid),
  window.location.search)`; merge = if decode yields a state, it REPLACES the
  storage state ENTIRELY (the strip is the strip — no union); malformed or
  absent → the storage state (= the default workspace). Still synchronous
  first-render (hydration.test pins it; HomeRedirect.tsx:8-11 forbids any
  effect-based load). window.location.search is read directly — the provider
  is above BrowserRouter and cannot use hooks.

Bidirectional sync (TabUrlSync.tsx — lives INSIDE BrowserRouter, mounted in
App.tsx next to SessionSync at :137-139; same shape as the existing
SessionSync/MentionNavigator null-components):
- STATE → URL: effect on [state, location.pathname, location.search].
  ELIGIBILITY (no hardcoded route list — derived from existing data): sync is
  active ONLY when location.pathname equals tabPath(t) for some t in the
  strip (or pathname is '/' or '/splash' — the resume routes; there we still
  only write the search on the CURRENT pathname, never navigate a path).
  This makes /literature, /sequences, /chat, /settings INERT (their pathname
  is no tab's tabPath) — byte-identical URLs there, and it is a data
  consequence of tabPath, not a TS route whitelist.
  Write: `navigate(pathname + '?' + merged, { replace: true })` — MERGED via
  URLSearchParams(location.search) so foreign params (recordId, runId,
  view, source...) survive. REPLACE, NEVER PUSH: the strip owns its own
  Back/Forward (reducer history/cursor + WorkspaceTabStrip.tsx:38-78 which
  already navigates); push would double-book history and pollute browser
  Back with every tab switch. No-op guard: skip when the desired search ===
  current search (prevents the state→URL→state loop; context-identity loop
  trap is already commented at OpenTabsContext.tsx:586-590).
- URL → STATE: effect watches location.search for a `ws` that DIFFERS from
  the last search this component WROTE (ref-tracked); on external change
  (back/forward onto an older entry, pasted link, manual edit) it
  replaceStates the decoded strip. Malformed → do NOT touch state (degrade
  to current/default workspace) and render a visible dismissable banner
  `data-testid="ws-param-diagnostic"` naming MALFORMED_WS_PARAM — the
  component currently returns null; it may return the banner. NEVER throw
  (render-nothing convention, workstateExecutor.ts:141-143 sibling).
- Boot precedence: App.tsx computes `hasExplicitWorkspaceLink = new
  URLSearchParams(window.location.search).has('ws')` and passes
  skipBootPull to useSessionSync; the BOOT pull is skipped so a server
  session can't yank an explicit deep link (ATTACH-on-focus adopt unchanged,
  SessionSync's onAdopt only navigates on '/' landing, App.tsx:167-178).
- Interaction notes: react-router v6 preserves unknown params on
  useSearchParams writes made by pages (LiteratureBody etc.) and TabUrlSync
  never fires on their paths (inert rule); WorkspaceTabStrip path navigations
  push as today — TabUrlSync's replace-writes update the CURRENT entry only.

Sequences page-local scheme (SequencesPage.tsx, two small edits):
- Read: initial tab state at :20 becomes: explicit `?tab=` (if present AND a
  member of the declared `tabs` const) > `?source=`→Import > 'Editor'
  (precedence order pinned in tests; the existing `?source=` behavior at :20
  must not change when `?tab=` is absent — existing pins byte-stable).
- Write: on setTab (user click AND agent setTab — the write rides the page's
  single tab-setter so the agent open-surface result also persists),
  setSearchParams merge `tab=<name>` with `{ replace: true }`.
  Malformed `?tab=Nope` degrades to the default with NO crash (validated
  against the declared list — registry data, no literals added).

Protected-route invariance argument:
- /literature and /literature?view=build: TabUrlSync is INERT (no tab has
  /literature as tabPath); zero new params, zero navigations; the
  ?source/-?record= logic on other pages untouched.
- /registry and /record/:id: same component tree, same renders; the only
  delta is appended `ws`/`wsa` search params (their page-local readers read
  only known keys — grep confirms neither page reads searchParams). Route
  matching ignores search; App.test pins match by testid, not URL.
- Retired-URL 404 pins: the `*` route and NotFoundRoute untouched; TabUrlSync
  writes nothing there (no tab has a 404 pathname; empty strip → no write).

## EXACT EDITS per file

1. NEW app/src/shared/session/urlSession.ts — the codec + tabFromStableId
   described above; constants WS_PARAM='ws', WSA_PARAM='wsa'; import tab
   types from event-editor/workspace/types, defaultRightPaneMode from
   OpenTabsContext, EMPTY_TABS_STATE. exhaustive never-check in
   tabFromStableId mirroring tabId.ts:27-64.
2. app/src/shared/shell/OpenTabsContext.tsx — add exported
   `initialTabsState(userId?: string): OpenTabsState` = merge over
   loadFromStorage using urlSession's decode against
   `window.location.search` (guard typeof window); switch the useReducer
   third-arg initializer (:539) from loadFromStorage to it. NOTHING else in
   the file changes (persist effect, dedupe-at-load, StrictMode guards stay).
   (Import direction: OpenTabsContext → urlSession is already the direction
   urlSession→defaultRightPaneMode needs — to avoid a cycle, put
   defaultRightPaneMode usage behind a parameter or accept the ESM cycle as
   sessionYaml.ts already imports defaultRightPaneMode from OpenTabsContext
   at :25 — precedent exists; keep urlSession importing OpenTabsContext and
   OpenTabsContext importing urlSession ONLY inside initialTabsState via a
   type-only-safe function import, and pin boot with the hydration test.)
3. NEW app/src/shared/shell/TabUrlSync.tsx — router-side sync per DESIGN
   (props: none; uses useOpenTabs, useNavigate, useLocation, tabPath,
   encodeWorkspaceParams, decodeWorkspaceParams; ref-tracked lastWritten;
   returns null or the diagnostic banner).
4. app/src/App.tsx — import TabUrlSync (NOT lazy: it must mount with the
   router, it is ~150 lines) and render `<TabUrlSync />` as a sibling inside
   BrowserRouter right after `<SessionSync />` (:139); change SessionSync's
   useSessionSync call (:141-153 function SessionSync lives at :136-153 of
   the real file) to pass `skipBootPull: new URLSearchParams(
   window.location.search).has('ws')`.
5. app/src/shared/session/useSessionSync.ts — SessionSyncOptions gains
   `skipBootPull?: boolean`; in the BOOT effect (pull(true) call site
   :88-112) return before the GET when options.skipBootPull (ATTACH
   focus-listener path unchanged). Absent means undefined via conditional
   spread (never explicit undefined).
6. app/src/sequences/SequencesPage.tsx — the two edits under DESIGN
   (initial-tab read at :20; a `const [search, setSearch] = useSearchParams()`
   upgrade of :20's read-only tuple; a setTab wrapper `selectTab(name)` that
   does setTab + setSearch-merge-replace, used by BOTH the human tab buttons
   and the onAgentAction handler's setTab effect at :50 — keep the
   applyAgentAction module untouched (decision data stays there)).
7. Test files (all NEW, RED-first): urlSession.test.ts,
   OpenTabsContext.url.test.ts, TabUrlSync.test.tsx, App.url.test.tsx,
   SequencesPage.urltab.test.tsx. NO edits to any existing test file.

## TEST PLAN (RED-first — write failing pins FIRST, then implement)

New pins mapped to the verified-by clauses:
- (a) URL hydrates the right tab set —
  OpenTabsContext.url.test.ts: `window.history.replaceState({}, '',
  '/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9')` + storage
  holding a DIFFERENT session → renderHook(useOpenTabs,
  {wrapper: OpenTabsProvider}): first render shows the URL strip (2 tabs,
  order, active), storage untouched until first change.
- (b) opening a tab updates the URL — TabUrlSync.test.tsx (MemoryRouter
  initialEntries ['/record/DOC-9']): openTab(run:RUN-A) → after act,
  location.search contains ws=...run:RUN-A (spy on navigate: called with
  {replace:true}; assert a push is NEVER issued).
- (c) closing removes it — same harness, closeTab → the id gone from ws.
- (d) malformed degrades with visible diagnostic, never crash —
  `?ws=%%nonsense%%&wsa=zzz` renders App.url-level provider: banner
  getByTestId('ws-param-diagnostic'), tabs = the storage/default workspace,
  zero thrown errors (vitest fails on console-error throw; none expected).
  Per-entry: `ws=registry,notakind!` keeps registry + shows the banner.
- (e) sequences Analysis restore — SequencesPage.urltab.test.tsx: mount under
  MemoryRouter at /sequences?tab=Analysis → the Analysis panel is active
  (assert on the page's existing tab affordance); ?tab=Nope → default
  'Editor' + no crash; ?source=x&tab= absent → Import (existing behavior
  byte-pin); human click writes ?tab= via replace (spy).
- (f) round-trip mirror-drift pin for EVERY tab kind in urlSession.test.ts
  incl. slot-suffixed ids and exactOptionalPropertyTypes-shaped tabs
  (absent keys, never undefined).
- (g) protected-route pins stay green WITHOUT editing them: App.test.tsx
  (zero NEW failures vs the 8-failure baseline),
  RegistryHostPage.test.tsx, LiteraturePage.test.tsx,
  pdfProtocolBuilder.card.test.tsx, the four OpenTabsContext/reducer test
  files (hydration pin must pass unmodified — it proves the merge change
  didn't break storage-only boot when no ws param is present).

First targeted check (run before writing anything else — the single command
that proves the approach early):
  cd /mnt/vast/home/brad/git/cl-integration-2 && npx vitest run --root app src/shared/shell/OpenTabsContext.hydration.test.ts
Expected NOW: PASS (5+ tests). After the initialTabsState change it must
STILL pass byte-unchanged — if it breaks, the sync-hydration invariant is
broken; stop and redesign before proceeding.

Full verification (exact commands + expected output):
- `npx vitest run --root app src/shared/session/urlSession.test.ts src/shared/shell/OpenTabsContext.test.ts src/shared/shell/OpenTabsContext.hydration.test.ts src/shared/shell/OpenTabsContext.url.test.ts src/shared/shell/openTabsReducer.history.test.ts src/shared/shell/openTabsReducer.idempotent.test.ts src/shared/shell/TabUrlSync.test.tsx src/shared/shell/RegistryHostPage.test.tsx src/App.url.test.tsx src/App.test.tsx src/literature/LiteraturePage.test.tsx src/literature/pdfProtocolBuilder.card.test.tsx`
  ALWAYS `--root app` (the repo-root vitest sweeps lane-exclude symlinked
  server tests — measurement trap). Expected: every file green EXCEPT
  App.test.tsx at exactly the 8 pre-existing failures listed in BASELINE
  (zero new; diff the failing-test-name list, not the headline count).
- `npm run typecheck -w app 2>&1 | grep -c "error TS"` → must print the BASELINE
  number with ZERO new (base-vs-head `comm -3` of the error-line lists,
  same protocol as WIRE-TEMP-1/HYGIENE-2).
- Server: untouched — prove with `git diff --name-only` showing zero
  server/ schema/ paths.

Browser gate for cl-browser-reviewer on :5193 (verbatim-executable; data repo
/home/brad/.computable-lab/worktrees/main; fixture ids known-good at this
trunk: PRT-4iaey2 protocol, EXR-LANE2-AI10 run page — receipts dir
re-verify):
1. Sequences reload leg: open `http://localhost:5193/sequences`; click the
   `Analysis` tab button; screenshot; assert (in-page JS) `new
   URLSearchParams(window.location.search).get('tab')==='Analysis'`; press F5
   / page.reload(); the Analysis tab is STILL the active tab after reload;
   screenshot. Then open `http://localhost:5193/sequences?tab=Setup` in a
   fresh tab; Setup must be active on first paint; screenshot.
2. Workspace strip leg: open `http://localhost:5193/record/PRT-4iaey2`; wait
   for the record editor; assert the URL contains `ws=` and `wsa=record:PRT-4iaey2`;
   screenshot. Copy that URL into a FRESH browser tab (new context, cleared
   localStorage for :5193 first); the page loads showing the record tab
   ACTIVE in the tab strip; screenshot. Console errors page must be [] .
3. Protected-route regression walk: (i) open `/registry` → registry list +
   tab strip render as today (screenshot, console errors []); (ii) open
   `/literature?view=build` → PDF-builder view renders; assert the URL
   contains NO `ws=` param (inert rule) and page behaves as today
   (screenshot); (iii) open `/record/DOC-DEMO-SOP` (or any DOC-/PRT- id from
   /registry) → editor renders; back-button still returns to the previous
   PATH (browser Back pops the path entry, tab strip follows); screenshot.
   Any crash, blank pane, console error, or ws= param on /literature = FIX.

## OPEN QUESTIONS for the orchestrator (with recommended defaults)

1. STALE APP.TEST.PINS: App.test.tsx fails 8/32 at trunk ad49df32 TODAY
   (verified; names in BASELINE) — they pin removed behaviors (/browser,
   /protocols, /literature redirect-to-welcome, retired /runs/RUN-1,
   /ingestion, /extraction 404s, '/'-welcome) while App.tsx:142-220 routes
   them live. The task's "existing route pins stay green" cannot be met
   literally at this base. RECOMMENDED: pin the baseline, gate on ZERO NEW
   failing-test names (comm -3 protocol), and mint a separate hygiene item
   for the 8 stale pins; do not make UCX-2's coder touch them. (Checked:
   full-file verbose run + App.tsx enumeration; the composer could not rule
   on scope creep from here.)
2. SEQUENCES "ANALYSIS TAB" READ: the verified-by browser clause targets
   SequencesPage's internal tab, which is NOT an OpenTabsContext tab —
   ws/wsa cannot express it, so the spec adds the page-local `?tab=`
   consumer (ISEQ-2 §4b precedent). RECOMMENDED default: ship it (the gate
   literally cannot pass otherwise). Alternative reading (Analysis via
   workspace tab only) would require a NEW tab kind — explicitly out of
   scope per "NO new surface kinds". (Checked: SequencesPage.tsx:15-20,
   surfaces.yaml tabs, WorkspaceTab union types.ts:33-131.)
3. URL-vs-SERVER BOOT ADOPT ORDER: an explicit ?ws= deep link currently
   loses to useSessionSync's BOOT adopt when the server session is newer
   (useSessionSync.ts:88-112). RECOMMENDED default as specced: skipBootPull
   (URL wins at boot, focus-ATTACH unchanged). Alternative: adopt-wins —
   rejected: it would defeat share/refresh, the item's whole point.
4. PARAM NAMES `ws`/`wsa`: the composer's choice per the task; chosen short
   to keep shared URLs humane. RECOMMENDED default as specced. If the lab
   prefers explicit nouns, `ws`/`wsActive` is a one-constant change — but
   pin the diagnostic message and tests together.

## REVIEWER BAIT (anticipated adversarial review — pre-empt these)

- The provider/Router layering: a reviewer WILL try to catch TabUrlSync
  calling router hooks above BrowserRouter (impossible) or the provider
  reading react-router (no hooks there). The split is deliberate: pure
  window.location.search at hydrate, hooks only inside the router. Cite
  App.tsx:134-135 if challenged.
- Write-loops: the no-op guard (desired===current) and ref-tracked
  lastWritten are the two defenses; the prior incident is documented in-code
  (OpenTabsContext.tsx:196-205 "Maximum update depth" comment; the
  context-identity comment :586-590). A reviewer hunting a feedback loop
  should find BOTH guards pinned by TabUrlSync tests.
- History pollution: assert navigate is called with replace:true and that
  WorkspaceTabStrip's own Back/Forward (which PUSH paths, pre-existing) is
  byte-unchanged.
- StrictMode + hydration: any useEffect-based hydration reintroduction
  re-triggers the documented storage-wipe (OpenTabsContext.tsx:532-556).
  Hydration stays in useReducer's init.
- exactOptionalPropertyTypes: NOT enabled for app (app/tsconfig.json has
  strict:true, no exactOptionalPropertyTypes — only the BACKEND sets it,
  CLAUDE.md rule 6); follow the repo-wide convention anyway: absent keys are
  OMITTED via conditional spread, never `undefined` (SequencesPage
  applyAgentAction.ts header comment, OpenTabsContext.tsx:560).
- YAML-reload trap: NONE applies — zero YAML in scope; tsx --watch reloads
  TS; no stack restart needed post-merge beyond a routine serve check.
- Hardcode boundary: eligibility derives from tabPath over the OPEN STRIP
  (existing data), sequences tabs from the declared const kept in lockstep
  with surfaces.yaml by the EXISTING server compat test — a reviewer
  grepping for route-string literals in the new files should find only the
  two param-name constants + the exhaustive tabFromStableId switch (the
  unavoidable mirror of stableTabId, drift-gated by the round-trip pin).
- Ontology: if prose names the concept, prefer `cl:workspace-strip-binding`;
  diagnostic code reuses the SCREAMING ExecutorDiagnostic convention
  (MALFORMED_WS_PARAM), not a new noun.

## BASELINE MEASUREMENTS (trunk cl/integration-2 @ ad49df32, 2026-10-18 ~02:35 EDT)

- `npm run typecheck -w app 2>&1 | grep -c "error TS"` → **23** (recorded,
  pre-existing; gate = 23, zero new, comm -3 on the line lists).
- `npx vitest run --root app <6 ground files: OpenTabsContext.test.ts,
  OpenTabsContext.hydration.test.ts, openTabsReducer.history.test.ts,
  openTabsReducer.idempotent.test.ts, RegistryHostPage.test.tsx,
  App.test.tsx>` → **1 failed | 5 passed files; 8 failed | 64 passed (72)**.
  ALL 8 failures are App.test.tsx stale pins: "renders WelcomePage at /",
  "redirects /browser", "redirects /protocols", "redirects /literature",
  "renders 404 for retired legacy URL /runs/RUN-1", "…/ingestion",
  "…/extraction", "…/extraction/review/DRA-1". The other 5 files are fully
  green at base.
- Trunk debt standing note applies (AS-LANE2-SERVERSUITHE-89-PREEXISTING —
  server suite untouched by this item anyway).
- Stack: :3093/:5193 serving this trunk per handoff 2026-10-18_0100;
  no server change here, so no restart obligation from this item.

---

## ORCHESTRATOR ADJUDICATION (l2t0251, 2026-10-18T03:50 EDT — binding)

Draft reviewed FIRST-HAND at promoted-revision. Orch re-verified the load-bearing
citations against the CURRENT trunk (d91cdd32, one merge after the composer's
ad49df32 — the delta is MINT-IDEM-1's server-side files + report docs, DISJOINT
from every UCX-2 path): App.tsx provider/SessionSync mount at :134-139 CONFIRMED;
SequencesPage.tsx :19-20 (tabs const + `search.has('source')?'Import':'Editor'`
initial state) CONFIRMED; OpenTabsContext.tsx :539 useReducer(loadFromStorage)
CONFIRMED; useSessionSync.ts :116 `void pull(true)` BOOT CONFIRMED; stableTabId
lives at app/src/shared/session/tabId.ts:28 (draft says tabId.ts — the path is
session/, not shell/: coder must import from ../session/tabId).
`npm run typecheck -w app` = **23** re-measured by orch at d91cdd32 — baseline holds.

- OQ1 RULED: BASELINE-PIN — App.test.tsx's 8 stale pins are pre-existing debt.
  Gate = ZERO NEW failing-test NAMES (comm -3 of verbose failing-name lists,
  base vs head). UCX-2 coder does NOT edit App.test.tsx. Debt noted for a
  future hygiene item; no new campaign task minted by this ruling.
- OQ2 RULED: SHIP the page-local `?tab=` consumer — the verified-by browser
  clause (Analysis tab survives reload on /sequences) cannot pass otherwise,
  and the alternative reading needs a new tab kind (out of scope).
- OQ3 RULED: ADOPT skipBootPull (URL wins at boot; focus-ATTACH unchanged).
- OQ4 RULED: `ws`/`wsa` as specced.

MEASUREMENT-CORRECTION (orch-verified): `npx vitest run --root app <path>` from
the TRUNK root can ENOENT on src/shared/session/workstateExecutor.ts (symlink
resolution artifact; the file exists tracked). Run vitest FROM the package dir
instead: `cd app && npx vitest run src/shared/session/workstateExecutor.test.ts`
→ 35/35 green (orch measured). All TEST PLAN vitest commands: run from <worktree>/app.

Worker contract: branch wt/UCX-2-lane2-<token> off trunk tip (>= d91cdd32);
app-only diff (any server/ or schema/ hunk = stop+flag); RED commit separate;
report .hermes/plans/UCX-2-report.wip-<token>.md; marker `UCX-2 DONE <sha>`;
UI item -> :5193 browser gate MANDATORY post-merge (criteria verbatim above).
