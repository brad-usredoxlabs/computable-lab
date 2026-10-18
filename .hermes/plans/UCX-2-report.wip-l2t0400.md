# UCX-2 CODER REPORT — Deep-linkable surfaces (URL ⇄ workspace-tab state)

Item: UCX-2, lane 2. Coder: cl-coder (l2t0400).
Worktree: /mnt/vast/home/brad/git/wt/UCX-2-lane2-l2t0400
Branch: wt/UCX-2-lane2-l2t0400 (base 3f0f54b7, contains spec-verified base d91cdd32)
Commits:
- RED:   94ad9b8f1d0aed67b6e36af58d002c373cec9c11 — 6 NEW test files only (no existing test file edited)
  [CORRECTED per advc-UCX2-l2t0655 defect 3: the commit message and this report originally said
  "7 NEW test files"; `git diff --name-status 94ad9b8f^..94ad9b8f` adds EXACTLY 6, and the RED raw
  reports "Test Files 6 failed (6)". See UCX-2-report.fix1-l2t0705.md §DEFECT 3.]
- CODE:  0676ed6387b9fbda338e672032b639b110fbcd87 — app-only product code
Spec: .hermes/plans/2026-10-18_UCX-2-deep-linkable-surfaces-spec.md (read fully; all four
ORCHESTRATOR ADJUDICATION rulings OQ1-OQ4 honored; MEASUREMENT CORRECTION honored — every
vitest command below was run FROM <worktree>/app, never `--root app` from the trunk root).

Bootstrap verified before any work: `git -c core.fileMode=false status --porcelain | grep -c '^D'`
→ 0 on first poll (no WAIT needed); server/node_modules, app/node_modules, node_modules and
server/schema symlinks all resolve.

## SCOPE PROOF (app-only)

`git -c core.fileMode=false diff --name-only 3f0f54b7 HEAD` (my two commits):
  app/src/App.tsx
  app/src/App.url.test.tsx
  app/src/sequences/SequencesPage.tsx
  app/src/sequences/SequencesPage.urltab.test.tsx
  app/src/shared/session/urlSession.test.ts
  app/src/shared/session/urlSession.ts
  app/src/shared/session/useSessionSync.boot.test.ts
  app/src/shared/session/useSessionSync.ts
  app/src/shared/shell/OpenTabsContext.tsx
  app/src/shared/shell/OpenTabsContext.url.test.ts
  app/src/shared/shell/TabUrlSync.test.tsx
  app/src/shared/shell/TabUrlSync.tsx

ZERO server/ hunks, ZERO schema/ hunks. No stack or model service touched. No playwright/:5193
run (browser gate is the orchestrator's post-merge step).

## BASELINE (measured BEFORE implementing, from <worktree>/app @ 3f0f54b7)

1. Early probe (spec's "first targeted check"):
   `npx vitest run src/shared/shell/OpenTabsContext.hydration.test.ts` → 3/3 PASS.

2. Target dirs: `npx vitest run src/shared/session src/shared/shell src/sequences`
   → Test Files 26 passed (26); Tests 182 passed (182). FAILING-FILE LIST: EMPTY (all green).
   Raw: .hermes/plans/ucx2-evidence/ucx2-baseline-vitest.raw

3. App.test.tsx verbose failing-name baseline (8 names, exactly the spec's BASELINE list):
   renders WelcomePage at /; redirects /browser to / (Welcome); redirects /protocols to /
   (Welcome); redirects /literature to / (Welcome); renders 404 for retired legacy URL
   /runs/RUN-1; …/ingestion; …/extraction; …/extraction/review/DRA-1.
   Raw: .hermes/plans/ucx2-evidence/ucx2-baseline-apptest.raw; names: ucx2-evidence/ucx2-base-fails.txt

4. Typecheck: `npm run typecheck -w app 2>&1 | grep -c "error TS"` → 23 (matches orch's
   re-measurement at d91cdd32). Error-line list: ucx2-evidence/ucx2-base-tsc.txt.

5. LiteraturePage.test.tsx suite-load baseline (measured at base d91cdd32 with my changes
   reverted): FAILS at base too — `Error: Failed to resolve import "virtual:cla-ai-overlay"
   from "src/extensions/loadOverlay.ts"` (vitest.config.ts does not register the vite
   aiOverlayPlugin that vite.config.ts defines; pre-existing lane/worktree artifact, NOT a
   UCX-2 regression). Raw: ucx2-evidence/ucx2-lit-base.raw. pdfProtocolBuilder.card.test.tsx
   green at base and head.

## RED (new pins failing PRE-FIX)

At base product code (d91cdd32 app/src restored) with the 7 new test files present:
`npx vitest run <7 new files>` → Test Files 6 failed (6); Tests 10 failed | 7 passed (17);
Failed Suites 2 (urlSession.test.ts + TabUrlSync.test.tsx fail to load: `./urlSession` /
`./TabUrlSync` do not exist yet). Raw: ucx2-evidence/ucx2-red-clean.raw. Named RED failures:
- OpenTabsContext.url.test.ts > the URL strip REPLACES the stored session on the first render
- App.url.test.tsx > a malformed ws renders the diagnostic banner and the page, never a crash
- App.url.test.tsx > per-entry keep-valid/drop-bad: registry survives a bad sibling entry
- App.url.test.tsx > malformed ws degrades to the storage workspace (storage untouched)
- SequencesPage.urltab.test.tsx > ?tab=Analysis activates the Analysis tab on first paint
- SequencesPage.urltab.test.tsx > a valid ?tab= outranks ?source=
- SequencesPage.urltab.test.tsx > a human tab click writes ?tab= with replace:true
- SequencesPage.urltab.test.tsx > the agent setTab path persists through the same setter (replace)
- useSessionSync.boot.test.ts > skipBootPull suppresses the boot GET so the local (URL-hydrated) strip survives
- useSessionSync.boot.test.ts > ATTACH-on-focus still pulls when skipBootPull is set (focus-ATTACH unchanged)
(The 7 RED-run "passes" are degradation/absence pins that already hold under storage-only
behavior — e.g. "malformed ws keeps the storage state", "no params → storage state".)

## GREEN (after implementation)

1. Target dirs: `npx vitest run src/shared/session src/shared/shell src/sequences`
   → Test Files 31 passed (31); Tests 216 passed (216) — baseline 26 files + the 4 new files
   in those dirs (urlSession, OpenTabsContext.url, TabUrlSync, SequencesPage.urltab) plus
   useSessionSync.boot.test.ts; comm of the per-file ✓ lists base-vs-head shows ONLY additions,
   zero removals. Raw: ucx2-evidence/ucx2-head-dirs2.raw.

2. Spec's full 12-file verification list:
   `npx vitest run <12 files>` → Test Files 2 failed | 10 passed (12); Tests 8 failed | 97 passed (105);
   Errors 1. The 8 failures are EXACTLY the 8 baseline App.test.tsx stale pins; the 2 failed
   files are App.test.tsx (baseline-pinned per OQ1) and LiteraturePage.test.tsx (pre-existing
   suite-load artifact, identical at base — see BASELINE 5). The 1 unhandled error is the
   pre-existing DOMMatrix-via-pdfjs (usePdfDocument.ts) debt: identical `Errors 1 error` +
   DOMMatrix count (3) in the BASE App.test.tsx raw and the HEAD raw.
   Raw: ucx2-evidence/ucx2-full-head.raw.

3. App.test.tsx zero-new-failing-names proof (OQ1 gate):
   base verbose failing names (8) vs head verbose failing names (8):
   `comm -3 ucx2-base-fails.txt ucx2-head-fails2.txt` → EMPTY. Raw: ucx2-evidence/ucx2-head-apptest2.raw.

4. Unmodified ground files: OpenTabsContext.test.ts, OpenTabsContext.hydration.test.ts,
   openTabsReducer.history.test.ts, openTabsReducer.idempotent.test.ts, RegistryHostPage.test.tsx,
   pdfProtocolBuilder.card.test.tsx — all green at head WITHOUT edits (hydration pin passes
   byte-unchanged, proving storage-only boot is intact when no ws param is present).

5. Typecheck: `npm run typecheck -w app 2>&1 | grep -c "error TS"` → 23 == baseline 23;
   `comm -3` of sorted base/head error-line lists → EMPTY (zero new); grep of the head list for
   my owned files (urlSession, TabUrlSync, OpenTabsContext, App.tsx, SequencesPage,
   useSessionSync) → none. Raw: ucx2-evidence/ucx2-head-tsc2.txt.

## WHAT WAS IMPLEMENTED (per spec EXACT EDITS)

1. NEW app/src/shared/session/urlSession.ts — pure codec: WS_PARAM='ws', WSA_PARAM='wsa';
   encodeWorkspaceParams ('' when no tabs — never an empty ws; slot-suffix kinds encode to the
   bare kind, slot-suffixed entity ids strip to the base id); decodeWorkspaceParams (per-entry
   keep-valid/drop-bad, wsa-missing → first surviving tab + MALFORMED_WS_PARAM diagnostic,
   zero decodable → state null + diagnostic, absent → state null with NO diagnostic);
   tabFromStableId — exhaustive mirror switch of stableTabId (tabId.ts), returns null on
   unknown ids, never throws. Titles re-derived from the id; decoded tabs get
   contentHistory=[tab], cursor 0, breadcrumb [], defaultRightPaneMode(tab), history=[wsa],
   cursor 0.

2. app/src/shared/shell/OpenTabsContext.tsx — exported initialTabsState(userId) =
   decode(window.location.search) REPLACES loadFromStorage entirely when it decodes; storage
   (default workspace) otherwise. useReducer third-arg switched to it (still synchronous
   first-render). ONE further necessary change discovered by test: the user-switch re-read
   effect now fires ONLY on a genuine resolvedUserId CHANGE (hydratedForUserRef) — at base it
   re-dispatched loadFromStorage on MOUNT, which would stomp a URL-hydrated strip (and under
   StrictMode's double-invoked effects made the stomp certain). Storage-only behavior is
   byte-identical (hydration test green unmodified). Import direction mirrors sessionYaml.ts:24
   (session→shell); the urlSession↔OpenTabsContext ESM cycle resolves at call time (precedent:
   sessionYaml imports defaultRightPaneMode from OpenTabsContext) and is boot-pinned by the
   hydration + url tests.

3. NEW app/src/shared/shell/TabUrlSync.tsx — router-side sync (useOpenTabs/useNavigate/
   useLocation; provider-above-Router respected: the provider never touches router hooks).
   Eligibility DERIVED from tabPath over the OPEN strip (+ '/' and '/splash' resume routes) —
   no route whitelist; /literature, /sequences, /chat, /settings stay byte-inert (pinned).
   STATE→URL: URLSearchParams merge (foreign params survive), navigate(pathname+search,
   {replace:true}), NEVER push (pinned by a navigate spy asserting every call carries
   replace:true). No-op guard compares the URLSearchParams-NORMALIZED search (raw '?a:b' and
   encoded '?a%3Ab' are the same search — a raw-string compare caused an infinite navigate
   loop during development; the normalized compare is pinned by the no-op-guard test).
   URL→STATE: ref-tracked lastWritten; external valid ws → replaceState(decoded); malformed →
   state untouched + dismissable banner data-testid="ws-param-diagnostic" naming
   MALFORMED_WS_PARAM; the malformed URL is NOT silently rewritten while the banner is up
   (diagnosticRef/pendingAdoptionRef make the two effects order-safe within one commit).
   Returns null or the banner; never throws.

4. app/src/App.tsx — import TabUrlSync (non-lazy), render <TabUrlSync /> as a sibling inside
   BrowserRouter right after <SessionSync />; SessionSync computes
   hasExplicitWorkspaceLink = new URLSearchParams(window.location.search).has('ws') and passes
   skipBootPull via conditional spread (never explicit undefined).

5. app/src/shared/session/useSessionSync.ts — SessionSyncOptions gains skipBootPull?: boolean;
   the BOOT effect returns before the GET when boot && skipBootPull; ATTACH focus/visibility
   pull unchanged (pinned by useSessionSync.boot.test.ts test 2). Effect deps gain the boolean.

6. app/src/sequences/SequencesPage.tsx — initial tab: valid ?tab= (validated against the
   DECLARED tabs const — registry data, no literals added) > ?source=→Import > 'Editor';
   malformed ?tab=Nope degrades to 'Editor' with no crash. New single tab-setter selectTab()
   = setTab + setSearchParams(prev-merge, {replace:true}); ALL tab changes now ride it: human
   nav buttons, the draft "Review sequence proposal" button, selectRecord→Editor,
   onSequenceProposal→Editor, Accept-and-apply→Analysis, and the agent path
   (createSequencesAgentActionHandler mount setTab). applyAgentAction.ts untouched (decision
   data stays there). ?source=→Import behavior byte-stable (pinned).

7. Tests: 7 NEW files (urlSession.test.ts, OpenTabsContext.url.test.ts, TabUrlSync.test.tsx,
   App.url.test.tsx, SequencesPage.urltab.test.tsx, useSessionSync.boot.test.ts — plus the
   SequencesPage.urltab file counts as the spec's SequencesPage test). NO existing test file
   edited (App.test.tsx untouched per OQ1; useSessionSync.test.ts restored to base — the
   skipBootPull pin lives in the NEW useSessionSync.boot.test.ts instead).

## TEST PLAN PIN COVERAGE

(a) URL hydrates the right tab set — OpenTabsContext.url.test.ts (4 pins: replace-on-first-
    render, storage untouched until first change, malformed keeps storage, absent keeps storage). GREEN.
(b) opening a tab updates the URL — TabUrlSync.test.tsx openTab pin + replace-only spy. GREEN.
(c) closing removes it — closeTab pin. GREEN.
(d) malformed degrades with visible diagnostic, never crash — App.url.test.tsx (3 pins incl.
    per-entry) + TabUrlSync.test.tsx (3 pins incl. dismissable + valid-strip-no-banner). GREEN.
(e) sequences Analysis restore — SequencesPage.urltab.test.tsx (6 pins incl. ?source= byte-pin,
    malformed ?tab=Nope, human click replace, agent setTab persistence). GREEN.
(f) round-trip mirror-drift gate for EVERY tab kind incl. slot-suffixed ids +
    exactOptionalPropertyTypes-shaped tabs (absent keys, never undefined) — urlSession.test.ts
    TABS_BY_KIND covers all 15 union kinds; LOSSY_FIELDS documents the fields the stable id
    does not carry (run.eventGraphId, execution.runId, deck.runId, lab-entity.schemaId/
    entityType, record-edit.recordKind) — those are re-derived minimally and host-page mount
    re-registration enriches them, exactly as a localStorage reload does today. GREEN.
(g) protected-route pins green WITHOUT edits — App.test.tsx (zero new names, comm proof),
    RegistryHostPage.test.tsx, pdfProtocolBuilder.card.test.tsx, the four OpenTabsContext/
    reducer files. GREEN (LiteraturePage.test.tsx = pre-existing suite-load artifact, identical
    at base; flagged below).

## KNOWN PRE-EXISTING DEBT (NOT introduced, NOT fixed per OQ1)

- App.test.tsx: 8 stale pins (baseline-pinned; comm -3 base-vs-head EMPTY).
- LiteraturePage.test.tsx: suite-load failure `virtual:cla-ai-overlay` — app/vitest.config.ts
  does not register the aiOverlayPlugin defined in app/vite.config.ts, so any test that
  imports src/extensions (directly or via AppShell→BrandMenu) fails to LOAD under vitest in
  this lane. Verified IDENTICAL at base d91cdd32 (ucx2-evidence/ucx2-lit-base.raw). Recommend
  the orchestrator mint a hygiene item (add the plugin to vitest.config.ts or mock
  ./extensions in that suite) — out of UCX-2 scope (it is not a UCX-2 regression and fixing it
  would edit an existing test-adjacent config).
- Unhandled DOMMatrix (pdfjs usePdfDocument.ts) error in App.test.tsx runs — identical count
  base vs head (memory-documented debt).

## ASSUMPTIONS

- AS-L2T0400-UCX2-001: slot-suffixed kinds (project-details/splash) ENCODE to the bare kind
  (`project-details`, `splash`) and DECODE to a freshly-slotted id. The spec says "slot-suffix
  stripped" but a stripped `project-details:`/`splash:` id is not decodable by the mirror
  switch; encoding the bare kind keeps encode/decode total and the round-trip pin exact. No
  source value supplied this; it is the minimal consistent reading.
- AS-L2T0400-UCX2-002: decoded tabs re-derive title from the id (studyId/runId/recordId/...)
  and the id-uncarried optional fields per LOSSY_FIELDS; host-page mount re-registration
  enriches them (spec: "Title is re-derived from the id"). execution tabs decode with
  runId:'' (tabPath then yields /runs/ — the host page re-registers the true runId).
- AS-L2T0400-UCX2-003: the user-switch effect's mount-time re-dispatch had to become
  change-only for URL-wins to hold (see IMPLEMENTED 2). This is the smallest change that keeps
  the storage-only hydration pin byte-green; flagged for reviewer attention.
- AS-L2T0400-UCX2-004: skipBootPull pin placed in NEW useSessionSync.boot.test.ts because the
  spec forbids editing existing test files; the RED commit was amended (94ad9b8f) so no
  existing test file is touched anywhere in history.
- AS-L2T0400-UCX2-005: SequencesPage.urltab.test.tsx mocks ./api, ../shared/surfaces/registry,
  ../shared/hooks/useAiChat and ../agent/HarnessChatPane to mount the page hermetically; the
  agent-path pin drives the REAL createSequencesAgentActionHandler with a sequence-tab frame
  captured from the page's own onAgentAction wiring (mocked useAiChat only captures opts).
- AS-L2T0400-UCX2-006: the LiteraturePage suite-load failure was measured at base to decide it
  is pre-existing; the base measurement reverted ONLY product files (git checkout d91cdd32 --
  app/src) and was fully restored (git status clean at HEAD afterwards, re-verified GREEN).

## YAML

YAML: none — zero YAML/schema/registry files in scope (git diff --name-only above). The
SequencesPage tab list stays the declared const kept in lockstep with surfaces.yaml by the
EXISTING server compat test; no registry data was added or edited.

## UNRESOLVED / FOR THE ORCHESTRATOR

- Browser gate (spec's 3-leg :5193 walk) is the orchestrator's post-merge step — not run here
  per item instructions.
- LiteraturePage vitest-config hygiene item recommended (see KNOWN DEBT).

UCX-2 DONE 0676ed6387b9fbda338e672032b639b110fbcd87
