# UCX-2 CODER FIX REPORT (cycle 1) — adversarial-gate fixes

Item: UCX-2, lane 2. Coder: cl-coder (l2t0705).
Worktree: /mnt/vast/home/brad/git/wt/UCX-2-lane2-l2t0400
Branch: wt/UCX-2-lane2-l2t0400 (NOT reset/rebased; fix commit added on top)
Review addressed: .hermes/plans/reviews/advc-UCX2-l2t0655.md (VERDICT: fix) — read fully first.
Spec: .hermes/plans/2026-10-18_UCX-2-deep-linkable-surfaces-spec.md (OQ1-OQ4 binding; scope app-only UNCHANGED).

Commits:
- RED:   94ad9b8f (6 NEW test files — corrected count, see DEFECT 3)
- CODE:  0676ed63
- DOCS:  a7356ad1
- FIX1:  e70db9893c096cde2bb4d0dc4f67c0095211446c — defects 1+2+4 (product + pins, RED-first)
All git run with `-c core.fileMode=false`.

## WHAT CHANGED (fix commit e70db989, 4 files, +240/-23)

  M app/src/shared/shell/TabUrlSync.tsx          (defect 1)
  M app/src/shared/shell/TabUrlSync.test.tsx     (defect 1 pins + harness)
  M app/src/shared/session/urlSession.ts         (defect 4)
  M app/src/shared/session/urlSession.test.ts    (defect 2 pins restored + defect 4 pins)

ZERO server/, schema/, *.yaml hunks (git diff --name-status 0676ed63..e70db989 → the 4 files
above only). App.test.tsx untouched. No stack (:5193/:3093/:3001/:5174) touched.

## DEFECT 1 (MAJOR) — dismiss now RELEASES the URL; sync resumes; banner stays gone

Mechanism fixed in TabUrlSync.tsx:
1. NEW `dismissedFragmentRef` — the exact normalized ws/wsa fragment the user dismissed.
2. Dismiss handler (was `setDiagnostic(null)` only) now ALSO sets
   `dismissedFragmentRef.current = wsFragment(location.search)` and
   `diagnosticRef.current = null` — the STATE→URL guard at the
   `if (diagnosticRef.current !== null) return` line stops early-returning, so the
   STATE→URL effect RESUMES and the next strip change writes the corrected search with
   {replace:true}.
3. URL→STATE effect: when the current search decodes to a diagnostic AND its fragment equals
   the dismissed fragment, the effect releases ownership: diagnosticRef cleared, the search is
   marked lastWritten, and it RETURNS without re-adopting — the banner does not re-arm and the
   dismissed link can never re-stomp the live strip. STATE→URL owns the search from then on.
4. A DIFFERENT malformed fragment (new pasted link, back/forward onto another malformed entry)
   does NOT match dismissedFragmentRef → the banner RE-ARMS. Dismissal is scoped to the link
   the user dismissed, not a session-wide mute. When the URL becomes valid (fragment ===
   desired), dismissedFragmentRef is cleared too, so a later re-appearance of the same bad
   link re-arms the banner.
Spec reading honored: "Malformed -> do NOT touch state" — the banner owns the URL until fixed
OR dismissed; dismissal releases ownership. State is still never touched by a malformed link.

New pins (TabUrlSync.test.tsx; harness Probe gained an `external-navigate-malformed` button):
- 'dismiss releases the URL: sync RESUMES and the banner does NOT return' — the review's exact
  failing scenario: mount /record/DOC-9?ws=%%nonsense%%&wsa=zzz with a valid storage session,
  dismiss, openTab(run:RUN-A) → ws becomes 'record:DOC-9,run:RUN-A', wsa 'run:RUN-A', 'nonsense'
  GONE from the URL, banner stays null, every navigate still replace:true.
- 'dismiss is scoped to the dismissed link: a NEW malformed link re-arms the banner' — after a
  dismiss, an external navigate to a DIFFERENT malformed link re-shows MALFORMED_WS_PARAM and
  state is still untouched (storage strip intact).
- 'dismiss releases a per-entry malformed link too: adopted strip is not re-stomped' — the
  adoption half: ws=record:DOC-9,notakind! adopts [record:DOC-9] + banner; dismiss; openTab →
  ws 'record:DOC-9,run:RUN-B', 'notakind' gone, banner stays gone, strip not re-stomped.
  (Eligibility note: the pin keeps the surviving entry owning the current pathname — a strip
  whose tabPath no longer matches the pathname is INERT by the spec's derived-eligibility rule;
  that is pre-existing specced behavior, not a defect-1 regression.)

RED-first evidence (C1): the 2 dismiss-resume pins were run against the PRE-FIX component only
(new test files + old TabUrlSync.tsx via `git stash push -- app/src/shared/shell/TabUrlSync.tsx`):
  cd app && npx vitest run src/shared/shell/TabUrlSync.test.tsx
  → Test Files 1 failed (1); Tests 2 failed | 10 passed (12)
  FAIL ... > dismiss releases the URL: sync RESUMES and the banner does NOT return
  FAIL ... > dismiss releases a per-entry malformed link too: adopted strip is not re-stomped
  Raw: .hermes/plans/ucx2-evidence/ucx2-fix1-red-product-revert.raw
(The third pin's mount also fails at pre-fix for the same reason once the banner re-arms; the
two above are the direct post-dismiss contract.)

## DEFECT 2 (MINOR) — weakened RED pins restored to original force

urlSession.test.ts round-trip gate:
- `expect(got.tab.id.startsWith(`${want.tab.kind}:`))` RESTORED verbatim (was `startsWith(want.tab.kind)`).
- `expect(...startsWith('splash:'))` RESTORED verbatim (was `startsWith('splash')`).
- ADDED (without changing intended semantics): exact rebuilt-shape regex per slot kind —
  `^project-details:[0-9a-z]+:[0-9a-z]*$` / `^splash:[0-9a-z]+:[0-9a-z]*$` — pinning the
  `kind:<slot>` contract shared with tabId.ts:24-26. The final segment is `*` (not `+`)
  because Math.random().toString(36) can terminate early (e.g. 0.5 → 'i' → slice(2,8) = '');
  the pinned contract is the two separators, not the random segment's length. A drift that
  drops the `kind:` separator (the review's `project-detailsX…` scenario) now fails BOTH the
  startsWith and the regex.
These pins pass at spec-conformant behavior (urlSession.ts still rebuilds
`project-details:${slotSuffix()}` / `splash:${slotSuffix()}`); no semantics changed.
Note for the record: slotSuffix() remains a verbatim copy in urlSession.ts (two sources of the
same format). The reviewer suggested reusing tabId.ts's helper; tabId.ts does not export it and
tabId.ts is spec SCOPE-OUT for edits, so the strengthened regex pin is the drift gate instead.

## DEFECT 3 (MINOR/DOC) — test-file count corrected

`git -c core.fileMode=false diff --name-status 94ad9b8f^..94ad9b8f` → EXACTLY 6 added files
(App.url.test.tsx, SequencesPage.urltab.test.tsx, urlSession.test.ts,
useSessionSync.boot.test.ts, OpenTabsContext.url.test.ts, TabUrlSync.test.tsx); the RED raw
says "Test Files 6 failed (6)". The "7 NEW test files" claim in the RED commit message and in
UCX-2-report.wip-l2t0400.md lines 7/64/168 was wrong. Corrected in the superseded report's
Commits section (annotated, not silently rewritten). useSessionSync.boot.test.ts is the 6th
file legitimately OUTSIDE the spec SCOPE IN list: editing the existing useSessionSync.test.ts
is forbidden by the spec, so the skipBootPull pin lives in this new file (review §6 concurs
"Acceptable, flagged for the record"). Commit messages in history are not rewritten (no reset/
rebase per task rules); the correction lives here and in the superseded report's annotation.

## DEFECT 4 (MINOR) — execution dropped from the decodable set (option A of the two offered)

Chosen fix (review's option 1): `execution` is now an UNENCODABLE kind.
urlSession.ts:
- NEW `isUnencodableKind(kind)` → 'execution', documented: executionTabId
  (`execution:<eventGraphId>`, types.ts:158) carries NO runId while
  WorkspaceTabStrip.tabPath maps execution → `/runs/${tab.runId}`; a decoded tab with
  runId:'' navigates to the bare `/runs/` = the runs COLLECTION route (App.tsx:152), not the
  run workspace (/runs/:runId, App.tsx:202). runId cannot be re-derived from the URL (no
  second id convention allowed, no server call in scope), so the kind is dropped rather than
  restored as a mis-navigating tab — same class as project-details.
- `tabFromStableId`: `case 'execution': return null` (was rebuilding runId:'' tabs).
- `encodeWorkspaceParams`: filters unencodable tabs out of `ws`; `wsa` names only an encodable
  tab (an execution-active strip writes no wsa; decode activates the first surviving tab);
  an execution-only strip encodes to '' (never an empty ws).
Consequence (honest): a strip containing an execution tab (reachable via server-session BOOT/
ATTACH adopt — server/src/workspace/types.ts parseWorkspaceState accepts execution arms; no
in-app producer exists per the review's own grep) encodes WITHOUT that tab; the tab survives in
localStorage and in the live session, only the URL omits it. This is the spec's own
"unencodable → drop" rule (project-details precedent), applied to a kind whose remaining
fields cannot make it navigable.
LOSSY_FIELDS masking REMOVED: `execution: ['runId']` deleted from urlSession.test.ts:181-187;
the round-trip gate now compares execution by its DROPPING (wantTabs excludes it; length
asserted) instead of masking the lossy field on both sides.

New pins (urlSession.test.ts):
- 'execution ids return null: a decoded tab must never carry runId:"" (defect 4)'
- 'an execution entry is dropped per-entry; valid siblings survive'
- 'encodeWorkspaceParams never encodes an execution tab (unencodable kind)'
- 'an execution-only strip encodes to NO params (unencodable kind, never an empty ws)'
- 'no decoded tab can ever produce the bare /runs/ path (navigation safety)' — decodes
  ws=run:RUN-1,deck:EVG-2,execution:EVG-1,registry and asserts tabPath outputs contain
  neither '/runs/' nor '' (imports tabPath from WorkspaceTabStrip — the consumer named in the
  defect).
- Round-trip gate: execution filtered from wantTabs + length asserted (masking removed).
- tabFromStableId 'decodes every kind' case list: the execution row REMOVED (it now pins the
  opposite behavior; the new dedicated pins cover it).
RED-first evidence (C2): all 5 defect-4/2 gate edits failed at pre-fix HEAD before the product
change (see RED run below).

## RED (fix pins failing PRE-FIX)

C1 (defect 1, new pins vs pre-fix component):
  `git -c core.fileMode=false stash push -- app/src/shared/shell/TabUrlSync.tsx`
  `cd app && npx vitest run src/shared/shell/TabUrlSync.test.tsx`
  → Test Files 1 failed (1); Tests 2 failed | 10 passed (12)
  Raw: ucx2-evidence/ucx2-fix1-red-product-revert.raw (stash popped; git status re-verified)

C2 (defect 2+4 pins vs pre-fix HEAD a7356ad1, product files untouched):
  `cd app && npx vitest run src/shared/session/urlSession.test.ts src/shared/shell/TabUrlSync.test.tsx`
  → Test Files 2 failed (2); Tests 6 failed | 22 passed (28)
  Named RED failures:
  - urlSession > tabFromStableId > execution ids return null: a decoded tab must never carry runId:"" (defect 4)
  - urlSession > tabFromStableId > an execution entry is dropped per-entry; valid siblings survive
  - urlSession > tabFromStableId > encodeWorkspaceParams never encodes an execution tab (unencodable kind)
  - urlSession > tabFromStableId > no decoded tab can ever produce the bare /runs/ path (navigation safety)
  - urlSession > round-trip mirror-drift gate > decode(encode(state)) ≈ state for every kind incl. slot-suffixed ids
  - TabUrlSync > URL → state > dismiss releases the URL: sync RESUMES and the banner does NOT return
  Raw: /tmp/ucx2-fix1-red.raw (captured during the RED phase; the 6th new pin — per-entry
  dismiss — RED-fails per C1; the execution-only-encode pin is a pure post-fix contract pin).

## GREEN (targeted)

G1 six UCX-2 suites:
  cd app && npx vitest run src/shared/session/urlSession.test.ts src/shared/session/useSessionSync.boot.test.ts src/shared/shell/OpenTabsContext.url.test.ts src/shared/shell/TabUrlSync.test.tsx src/App.url.test.tsx src/sequences/SequencesPage.urltab.test.tsx
  → Test Files 6 passed (6); Tests 47 passed (47)   [was 39 pre-fix; +8 new pins]
  Raw: ucx2-evidence/ucx2-fix1-targeted.raw

G2 target dirs:
  cd app && npx vitest run src/shared/session src/shared/shell src/sequences
  → Test Files 31 passed (31); Tests 224 passed (224)
  Raw: ucx2-evidence/ucx2-fix1-dirs.raw
  (One earlier run of this command showed a single SurfaceIndicator.test.tsx failure —
  'FindFind' vs 'Find / Search', an async registry-mock race. Proven a load/timing flap, not a
  regression: 3/3 green in isolation, 3/3 green in consecutive dirs runs, and the FINAL saved
  raw above is fully green. SurfaceIndicator is untouched by this fix; its only UCX-2 touch
  point is provider hydration, which the unmodified hydration pin covers.)

G3 spec 12-file verification list:
  cd app && npx vitest run <the 12 files>
  → Test Files 2 failed | 10 passed (12); Tests 8 failed | 105 passed (113)
  The 8 failing NAMES are EXACTLY the spec baseline (WelcomePage at /, /browser, /protocols,
  /literature redirects, 404 /runs/RUN-1, /ingestion, /extraction, /extraction/review/DRA-1);
  the 2 red FILES are App.test.tsx (baseline) + LiteraturePage.test.tsx (pre-existing
  virtual:cla-ai-overlay suite-load artifact).
  comm -3 (normalized) of ucx2-base-fails.txt vs ucx2-fix1-head-fails.txt → the 8 names pair
  identically; head-only = LiteraturePage suite-load line only (pre-existing, documented in the
  wip report + review C9). ZERO NEW failing names.
  Raw: ucx2-evidence/ucx2-fix1-12file.raw; names: ucx2-evidence/ucx2-fix1-head-fails.txt

G4 FULL app run (zero NEW failing FILE names):
  cd app && npx vitest run
  base (HEAD a7356ad1, fix stashed): Test Files 60 failed | 325 passed (385); Tests 71 failed | 2523 passed (2594)
  head (fix e70db989):              Test Files 60 failed | 325 passed (385); Tests 71 failed | 2531 passed (2602)
  comm -3 of the sorted FAIL-file-name lists (56 vs 56 entries) → EMPTY. ZERO NEW failing files.
  Raw base: /tmp/ucx2-fix1-full-base.raw (captured during the stash-base run; name list saved
  as ucx2-evidence/ucx2-fix1-base-fullfiles.txt). Raw head: ucx2-evidence/ucx2-fix1-full-head.raw;
  names: ucx2-evidence/ucx2-fix1-head-fullfiles.txt.
  Flap bookkeeping (memory-documented load-flap debt): parallel head-run #1 additionally showed
  AddMaterialForm.biological.test.tsx; parallel head-run #2 additionally showed
  AiTabPanel.runPageSurface.test.tsx; the serial head run showed NEITHER; the final head run
  shows NEITHER; both files pass 3/3 in isolation and neither imports anything this fix touches
  in a way that changes their mocked seams (AiTabPanel mocks OpenTabs hydration inputs; its
  failure mode was an event-editor context race, EVG-RUN-GRAPH vs EVG-TAB, under full-suite
  load pressure). The base-vs-head comm above is the gate; it is empty.

G5 Typecheck:
  cd app && npm run typecheck → 23 "error TS" == baseline 23.
  comm -3 of sorted base/head error-line lists (ucx2-base-tsc.txt vs ucx2-fix1-tsc.raw) → EMPTY
  (16 unique error files both sides; none is a UCX-2-owned file).
  Raw: ucx2-evidence/ucx2-fix1-tsc.raw

## SCOPE PROOF (fix commit)

  git -c core.fileMode=false diff --name-status 0676ed63..e70db989
  → app/src/shared/session/urlSession.test.ts, app/src/shared/session/urlSession.ts,
    app/src/shared/shell/TabUrlSync.test.tsx, app/src/shared/shell/TabUrlSync.tsx
  (plus this report + evidence raws under .hermes/plans/). ZERO server/, schema/, prompts/,
  *.yaml. App.test.tsx untouched. No existing test file edited (the edits to
  urlSession.test.ts / TabUrlSync.test.tsx are to files this item CREATED; App.test.tsx and
  useSessionSync.test.ts remain byte-identical to trunk).

## ASSUMPTIONS (fix cycle)

- AS-L2T0705-UCX2-007 (defect 1 design): dismissal releases ownership of the DISMISSED
  fragment only (dismissedFragmentRef), not the session. Chosen over a blanket
  "dismiss = always write" because the spec sentence "Malformed → do NOT touch state" still
  forbids silently adopting a malformed link, and a blanket release would let a stale dismissed
  link re-stomp the strip on every effect re-run. A new/different malformed link re-arms the
  banner; a valid URL clears the dismissal latch so the same bad link re-arms if it returns.
- AS-L2T0705-UCX2-008 (defect 4 option choice): option 1 (drop execution from the decodable
  set) chosen over option 2 (re-derive runId at decode/host-mount). Option 2 needs a runId the
  URL does not carry: re-derivation would require a server lookup (out of scope, no server
  change) or a second id convention (forbidden: tabId.ts/types.ts are the ONE id policy and are
  SCOPE-OUT for edits). Dropping is the spec's existing unencodable-kind rule (project-details
  precedent) and is pinned in the round-trip test instead of masked in LOSSY_FIELDS, exactly as
  the review demanded. Consequence documented above: execution tabs survive locally but never
  enter the URL.
- AS-L2T0705-UCX2-009 (defect 2 regex shape): the slot-shape regex pins the two-separator
  `kind:<ts>:<rand>` contract with the random segment allowed to be empty (Math.random()
  early-termination, e.g. 0.5); the review's drift scenario (separator loss) fails it.
- AS-L2T0705-UCX2-010: the per-entry dismiss pin keeps the surviving entry owning the current
  pathname; a strip that no longer maps to the pathname is INERT by the spec's derived
  eligibility (pre-existing, pinned by the INERT test) — not a place where post-dismiss sync
  can or should write.

## UNRESOLVED / FOR THE ORCHESTRATOR

- Browser gate (:5193 3-leg walk) remains the orchestrator's post-merge step; nothing here
  changes its criteria. Leg-2 (copy URL into a fresh tab) is unaffected by the execution drop
  (no execution tabs in the fixture legs).
- If the lab later wants execution deep-linkable, the honest path is a URL-carried runId
  (e.g. encode execution as `execution:<evg>:<runId>`), which requires changing the ONE id
  policy (types.ts executionTabId) — a domain-policy change outside this item's scope. Flagged,
  not done.
- LiteraturePage.test.tsx vitest-config hygiene recommendation stands unchanged from the wip
  report.

UCX-2 FIX1 DONE e70db9893c096cde2bb4d0dc4f67c0095211446c
