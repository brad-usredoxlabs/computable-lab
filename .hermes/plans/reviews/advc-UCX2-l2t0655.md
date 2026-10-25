# ADVERSARIAL REVIEW — LANE 2 / UCX-2 (deep-linkable surfaces)

Reviewer: cl-adversarial-reviewer. Token l2t0655. 2026-10-18 06:52 EDT.
Candidate: /mnt/vast/home/brad/git/wt/UCX-2-lane2-l2t0400 (branch wt/UCX-2-lane2-l2t0400).
Commits under review: 94ad9b8f (RED pins), 0676ed63 (feat), a7356ad1 (docs report).
True base of the diff: 3f0f54b7 (merge-base with trunk code tip c0c4bed9 is 3f0f54b7 itself).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-18_UCX-2-deep-linkable-surfaces-spec.md
(adjudicated 2026-10-18T03:50 EDT, OQ1-OQ4 binding).
Note: all git in this worktree was run with `-c core.fileMode=false` (NFS mode-bit noise).
Deliberate decorrelation: model deepseek-v4.1-flash vs coder qwen3.8-flash-next-iq3_xxs.

---

## 1. WHAT THE DIFF ACTUALLY IS

`git -c core.fileMode=false diff --stat 3f0f54b7..a7356ad1` → 25 files, +31850/-9.
Non-evidence content (the only product/test files):

    M app/src/App.tsx
    M app/src/sequences/SequencesPage.tsx
    M app/src/shared/session/useSessionSync.ts
    M app/src/shared/shell/OpenTabsContext.tsx
    A app/src/shared/session/urlSession.ts
    A app/src/shared/shell/TabUrlSync.tsx
    A app/src/App.url.test.tsx
    A app/src/sequences/SequencesPage.urltab.test.tsx
    A app/src/shared/session/urlSession.test.ts
    A app/src/shared/session/useSessionSync.boot.test.ts
    A app/src/shared/shell/OpenTabsContext.url.test.ts
    A app/src/shared/shell/TabUrlSync.test.tsx

Everything else in the diff is `.hermes/plans/UCX-2-report.wip-l2t0400.md` plus
`.hermes/plans/ucx2-evidence/*.raw` (coder evidence raws) — no product content.

All file hunks were read: App.tsx, SequencesPage.tsx, useSessionSync.ts,
OpenTabsContext.tsx, urlSession.ts, TabUrlSync.tsx, and all 6 new test files in full.

## 2. ACCEPTANCE CRITERIA (spec, verbatim)

- GOAL: encode open tab strip + active tab in the URL (one param scheme), hydrate
  OpenTabsContext from the URL **synchronously** on load, keep URL ⇄ tab state in sync
  with **replace-only** writes; **no server change**; no behavior change of /registry,
  /record/:id, /literature?view=build.
- SCOPE IN: app/ only — urlSession.ts(+test), TabUrlSync.tsx(+test), OpenTabsContext.tsx
  (+url test), App.tsx (mount + boot-pull suppression), useSessionSync.ts (ONE new
  `skipBootPull?: boolean`), SequencesPage.tsx (+urltab test), App.url.test.tsx. NO edit
  of App.test.tsx.
- SCOPE OUT: NO server/src, schema/, prompts/; NO new kinds; NO change to reducer
  semantics, openContent.ts, workstateExecutor.ts, sessionYaml.ts, tabId.ts; NO fix of
  the 8 stale App.test.tsx pins; NO hash-routing/path redesign.
- DESIGN: `ws` = comma-separated stable ids in strip order; `wsa` = active stable id;
  `tab` = page-local on /sequences. Never a `ws` with an empty strip; no tabs ⇒ no params.
- Codec: `encodeWorkspaceParams` '' when unencodable; `decodeWorkspaceParams` per-entry
  keep-valid/drop-bad, wsa-missing → first surviving + `MALFORMED_WS_PARAM`, zero
  decodable → null + diagnostic, absent → null no diagnostic, NEVER throws. Round-trip
  pin `decode(encode(state)).tabs ≈ state.tabs` is the mirror-drift gate.
- Hydration: `mergeUrlOverStorage(loadFromStorage, window.location.search)`; a decoded URL
  state REPLACES storage entirely; still synchronous first render.
- TabUrlSync: eligibility DERIVED from tabPath over the open strip (+ '/' and '/splash'),
  NO hardcoded route list; STATE→URL merged via URLSearchParams, `{replace:true}` only,
  no-op guard; URL→STATE ref-tracked lastWritten; malformed → do not touch state, render a
  **visible dismissable banner** `data-testid="ws-param-diagnostic"`; never throw.
- Boot precedence: App computes `has('ws')` and passes `skipBootPull`; BOOT pull skipped,
  ATTACH-on-focus unchanged. `skipBootPull` absent via conditional spread (never explicit
  undefined).
- SequencesPage: valid `?tab=` > `?source=`→Import > 'Editor'; malformed degrades, no
  literals added; the single setter is used by human clicks AND the agent setTab path;
  write merges `tab=` with `{replace:true}`.
- TEST PLAN (a)-(g) incl. (f) round-trip for EVERY kind, (g) protected routes green
  without editing them; gate = ZERO NEW failing App.test.tsx NAMES; typecheck = baseline
  count with zero new (comm -3 of error-line lists).
- MEASUREMENT CORRECTION: run vitest FROM `<worktree>/app`, never `--root app` at trunk root.

## 3. COMMANDS I RAN (real output, quoted)

C1. `git -c core.fileMode=false diff --name-status 3f0f54b7..a7356ad1`
    → only app/ + .hermes/plans/* (see section 1). ZERO server/, schema/, prompts/, *.yaml.

C2. `git -c core.fileMode=false diff --name-status 94ad9b8f^..94ad9b8f` (RED commit)
    → 6 files added: App.url.test.tsx, SequencesPage.urltab.test.tsx, urlSession.test.ts,
      useSessionSync.boot.test.ts, OpenTabsContext.url.test.ts, TabUrlSync.test.tsx.

C3. RED evidence raws `.hermes/plans/ucx2-evidence/ucx2-red-clean.raw`:
    "Test Files 6 failed (6)", "Tests 10 failed | 7 passed (17)" — genuine RED; urlSession
    and TabUrlSync fail to LOAD (module absent) at base, so the pins are not tautological.

C4. `cd app && npx vitest run src/shared/session/urlSession.test.ts
    src/shared/session/useSessionSync.boot.test.ts src/shared/shell/OpenTabsContext.url.test.ts
    src/shared/shell/TabUrlSync.test.tsx src/App.url.test.tsx
    src/sequences/SequencesPage.urltab.test.tsx`
    → "Test Files 6 passed (6)", "Tests 39 passed (39)". MY OWN RUN — matches the claim.

C5. `cd app && npx vitest run src/shared/session src/shared/shell src/sequences`
    → "Test Files 31 passed (31)", "Tests 216 passed (216)" — matches the GREEN claim.

C6. `cd app && npx vitest run <the 12-file spec verification list>`
    → "Test Files 2 failed | 10 passed (12)", "Tests 8 failed | 97 passed (105)",
      "Errors 1 error". The 2 red files are App.test.tsx (8 baseline) and
      LiteraturePage.test.tsx (pre-existing suite-load). Matches the report.

C7. `cd app && npx vitest run src/shared/shell/OpenTabsContext.test.ts
    src/shared/shell/OpenTabsContext.hydration.test.ts
    src/shared/shell/openTabsReducer.history.test.ts
    src/shared/shell/openTabsReducer.idempotent.test.ts
    src/shared/shell/RegistryHostPage.test.tsx src/App.test.tsx`
    → "Test Files 1 failed | 5 passed (6)", "Tests 8 failed | 64 passed (72)". The 8 names
      are EXACTLY the spec BASELINE list (WelcomePage at /, /browser, /protocols,
      /literature redirects, 404 /runs/RUN-1, /ingestion, /extraction,
      /extraction/review/DRA-1). Zero new names.

C8. `cd app && npm run typecheck` then `| grep -c "error TS"` → 23 (== baseline 23).
    Unique error files listed: none is a UCX-2-owned file (no App.tsx / urlSession.ts /
    TabUrlSync.tsx / OpenTabsContext.tsx / useSessionSync.ts / SequencesPage.tsx).

C9. `cd app && npx vitest run src/literature/LiteraturePage.test.tsx`
    → "Failed to resolve import \"virtual:cla-ai-overlay\" from src/extensions/loadOverlay.ts"
      — pre-existing config artifact (vitest.config.ts does not register the vite overlay
      plugin); nothing UCX-2 touches. Confirmed NOT a regression.

C10. `git -c core.fileMode=false status --short` in the candidate → empty (no stray edits).

## 4. CRITERION-BY-CRITERION VERDICT

(1) Codec round-trip / malformed degradation — CHECKED. encode/decode symmetry holds for
    every union kind (C4/C5; urlSession.test.ts:188-236). Malformed degrades without
    throwing: `decodeWorkspaceParams` returns `{state:null}` + diagnostic; `ws=%%nonsense%%`
    never throws (pinned). Per-entry keep-valid/drop-bad is real (registry survives a bad
    sibling). PASS on the codec itself, BUT see defect 2 (test weakening) and defect 3.

(2) URL-wins hydration wins over boot pull; skipBootPull no first-load regression — PASS.
    OpenTabsContext.tsx:544-549 `initialTabsState` = `decode(window.location.search).state
    ?? loadFromStorage` (URL REPLACES storage, synchronous in useReducer init; the added
    `hydratedForUserRef` guard at :564-572 stops the mount-time re-dispatch from stomping
    it — necessary and correct). App.tsx:100-104 passes `skipBootPull` only when `has('ws')`
    (conditional spread, never `undefined`). useSessionSync.ts:106 `if (boot && skipBootPull)
    return` skips only the BOOT GET; ATTACH-on-focus unchanged (useSessionSync.boot.test.ts
    test 2). The unmodified useSessionSync.test.ts:44 boot-adopt pin still passes (C5), so
    the no-ws first-load fetch is intact. The pre-existing hydration test passes byte-
    unchanged (C7).

(3) TabUrlSync replace-only / no loops — PARTIAL. TabUrlSync.tsx:132 is the ONLY navigate,
    always `{replace:true}`; the no-op guard compares URLSearchParams-normalized search
    (:130) and `lastWrittenRef`/`pendingAdoptionRef` break the state→URL→state cycle. No
    push, no history spam, no re-render loop found (C4/C5 pins). BUT the malformed-banner
    lifecycle is broken — defect 1.

(4) Declarative policy, no hardcoded surface list — PASS. Eligibility derives from
    `tabPath(t.tab) === location.pathname` over the OPEN strip (:76-79); the only literals
    are the two resume routes '/' and '/splash' (specced verbatim) and the two param
    constants. `COLLECTIONS`/`isSlotSuffixedKind`/`create` nodeType literals mirror the
    WorkspaceTab union in types.ts (the same mirror tabId.ts already carries) — no YAML/
    registry surface list is duplicated, and the codec is pure/synchronous so it cannot
    consult the registry anyway. SequencesPage validates `?tab=` against its DECLARED
    `tabs` const (kept in lockstep with surfaces.yaml by the EXISTING server compat test);
    applyAgentAction.ts untouched. Not a hardcode REJECT.

(5) Real assertions / RED matches GREEN — PASS on substance (C3/C4/C5 reveal 39 real
    assertions, not tautologies; the two module-absent RED suites prove non-tautology).
    MINOR inaccuracies: the "7 NEW test files" claim is wrong (6) — defect 3; and one pin
    was weakened in the implementation commit — defect 2.

(6) Scope — PASS. `git diff --name-only 3f0f54b7..a7356ad1 | grep -E '^(server|schema)/|\.ya?ml$'`
    → empty (exit 1). app-only, as claimed.

## 5. DEFECTS

### Defect 1 — MAJOR — dismissing the malformed-`ws` banner never actually releases the URL; the banner reappears and URL ⇄ tab sync stays dead for the session
Path: app/src/shared/shell/TabUrlSync.tsx:111 (guard) and :152-154 (dismiss handler).
Rule violated: spec DESIGN — "render a visible dismissable banner … Malformed → do NOT
touch state"; the in-code comment at :109-110 states "the banner owns that URL until it is
fixed or dismissed". Dismissal must release ownership; it does not.

Mechanism: `diagnosticRef` is a mutable ref that only ever gets cleared inside the
`fragment === desired` branch (:90-94), which is unreachable while the URL stays malformed.
The Dismiss button (:152) calls `setDiagnostic(null)` — component state only — and never
`diagnosticRef.current = null`. So after dismissal `diagnosticRef.current` stays non-null,
and the STATE→URL effect keeps early-returning at :111, suppressing every subsequent
URL write. Worse, the URL→STATE effect (:82-104) re-runs whenever the strip changes
(`desired` is a dep) and unconditionally re-sets `diagnosticRef` + `setDiagnostic(decoded
.diagnostic)` (:97-98), re-showing the banner.

Concrete failing scenario:
1. Load `/record/DOC-9?ws=%%nonsense%%&wsa=zzz` (storage holds a valid session).
2. Banner `ws-param-diagnostic` shows; click "Dismiss" → banner hides (the only thing
   TabUrlSync.test.tsx:159-164 asserts).
3. Now open or activate any tab (`context.openTab(...)`) → provider `state` changes →
   `desired = encodeWorkspaceParams(state)` changes → the URL→STATE effect re-runs, decodes
   the still-malformed `location.search`, sets `diagnosticRef.current` again and calls
   `setDiagnostic(diagnostic)`.
Result: the banner pops back, and the STATE→URL effect still returns at :111, so the strip
is never written to the URL again (URL frozen on the malformed value, and a refresh re-shows
the banner). Bidirectional sync — the item's core deliverable — is dead for the rest of the
session, and the banner is not in fact dismissable. The existing pin gives false confidence
because it stops at step 2 and never asserts that sync resumes after dismissal.
Suggested fix direction: clear `diagnosticRef.current` in the dismiss handler (and/or treat
a dismissed-malformed state as a distinct latch that permits the strip write to overwrite
the bad param); add a pin that dismisses, then opens a tab, and asserts the URL is rewritten
and the banner does NOT return.

### Defect 2 — MINOR — the round-trip "mirror-drift gate" was weakened for the slot-suffixed kinds
Path: app/src/shared/session/urlSession.test.ts:202 and :235 (weakened between the RED
commit 94ad9b8f and the feat commit 0676ed63).
Rule violated: spec TEST PLAN (f) — the round-trip pin is "the drift gate against tabId.ts/
types.ts changes".

Evidence: in 94ad9b8f the assertion was `expect(got.tab.id.startsWith(`${want.tab.kind}:`))`;
0676ed63 changed it to `expect(got.tab.id.startsWith(want.tab.kind))` (:202) and
`startsWith('splash')` (:235). `tabFromStableId` still returns `project-details:${slotSuffix()}`
/ `splash:${slotSuffix()}` (urlSession.ts:85, :147), so the stronger colon assertion would
still pass — the loosening was gratuitous.
Concrete failing scenario: if tabId.ts's slot format (or tabFromStableId's slot branch) drifted
so a decoded slot id no longer carries the `kind:` separator (e.g. returns `project-detailsX…`),
the loosened pin still passes, while the stable-id contract with tabId.ts is broken. Related:
`slotSuffix()` is copied verbatim from tabId.ts:24-26 into urlSession.ts:155-157 (two sources
of truth for the same suffix format) — the weakened pin is exactly what would fail to catch a
divergence in that copy.
Suggested fix direction: restore the `${kind}:` prefix assertion and pin the exact rebuilt
id shape; consider reusing tabId.ts's slot helper rather than duplicating it.

### Defect 3 — MINOR — the RED/GREEN audit trail miscounts the new test files
Path: commit 94ad9b8f message ("7 NEW test files only") and
.hermes/plans/UCX-2-report.wip-l2t0400.md lines 7, 64, 168 ("7 NEW test files", "6 failed (6)").
Rule violated: the review contract requires "the 7 RED files match the claimed GREEN run";
an off-by-one makes that audit ambiguous.
Evidence: `git diff --name-status 94ad9b8f^..94ad9b8f` → EXACTLY 6 added files (listed in C2);
the RED raw itself reports "Test Files 6 failed (6)"; the report enumerates 6 names.
Concrete failing scenario: an orchestrator auditing "7 RED files" against the commit finds 6,
cannot tell whether a RED pin was deleted/renamed, and must re-derive the list by hand.
Suggested fix direction: correct the count to 6 in the commit-message convention going forward
and in the report (a follow-up report supersede is enough; no code change).

### Defect 4 — MINOR — a decoded `execution` tab carries `runId: ''`, so its `tabPath` is `/runs/` and the tab mis-navigates
Path: app/src/shared/session/urlSession.ts:94 (`runId: ''`) consumed by
app/src/shared/shell/WorkspaceTabStrip.tsx tabPath (`execution` → `/runs/${tab.runId}`).
Rule violated: GOAL — a deep link must restore the reported workstate; round-trip pin (f)
excludes the field via LOSSY_FIELDS so the loss is untested.
Concrete failing scenario: open/share `?ws=execution:EVG-1&wsa=execution:EVG-1`; the strip
restores an execution tab whose `runId` is `''`; clicking it navigates to `/runs/`, which
matches the `/runs` collection route (App.tsx:152) instead of the run workspace
(`/runs/:runId`, App.tsx:202). Honest caveat: no in-app producer currently creates an
`execution` kind tab (grep: only the decode branch and ExecutionTabShell's prop type), so
this is reachable only via a hand-edited/pasted URL today — hence MINOR, not a blocker.
Suggested fix direction: either drop `execution` from the decodable set (unencodable/
droppable like `project-details`), or re-derive `runId` at decode/host-mount before the tab
is made navigable; pin it in the round-trip test instead of masking it in LOSSY_FIELDS.

## 6. OBSERVATIONS (not defects)

- LOSSY_FIELDS (urlSession.test.ts:181-187) deliberately deletes run.eventGraphId,
  execution.runId, deck.runId, lab-entity.schemaId/entityType, record-edit.recordKind from
  BOTH sides before comparison. Each is genuinely not carried by the ONE id policy
  (tabId.ts / types.ts id helpers), so the exclusion is honest — but note the pin therefore
  cannot detect a codec that drops any of those fields, and a copied URL for a deck opened
  for a run loses the `/:runId` suffix (tabPath `deck`). Documented as AS-L2T0400-UCX2-002.
- The STATE→URL effect may perform one extra replace-write to re-order `ws`/`wsa` to the
  end of the query string (it deletes then re-appends). Converges on the next render — a
  one-time normalization, not a loop.
- The SequencesPage agent pin (SequencesPage.urltab.test.tsx:130-141) drives the REAL
  createSequencesAgentActionHandler but goes through the mocked useAiChat capture; it does
  assert `replace:true` on the agent write, so it is not a tautology.
- `useSessionSync.boot.test.ts` is a 6th new test file not enumerated in the spec's SCOPE IN
  list; it is the only way to pin `skipBootPull` without editing the existing
  useSessionSync.test.ts, which the spec forbids. Acceptable, flagged for the record.
- No YAML in the diff, so the "tsx --watch does not reload YAML" restart trap does not apply
  to this item.

VERDICT: fix
