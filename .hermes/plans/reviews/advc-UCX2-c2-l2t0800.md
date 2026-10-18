# ADVERSARIAL REVIEW CYCLE 2 — LANE 2 / UCX-2 (post-fix re-review)

Reviewer: cl-adversarial-reviewer. Token l2t0800. 2026-10-18 (EDT).
Candidate: /mnt/vast/home/brad/git/wt/UCX-2-lane2-l2t0400 (branch wt/UCX-2-lane2-l2t0400, HEAD e1a5e178).
Fix commits on top of a7356ad1: e70db989 (fix), e72b076c (docs/evidence), e1a5e178 (pin-count correction).
Base of the item diff: 3f0f54b7. Cycle-1 report: advc-UCX2-l2t0655.md (fix, D1-D4).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-18_UCX-2-deep-linkable-surfaces-spec.md (OQ1-OQ4 binding).
All git run with `-c core.fileMode=false`. Decorrelation: deepseek-v4.1-flash vs coder qwen3.8-flash-next-iq3_xxs.

---

VERDICT: FIX

Two MINOR defects remain (D1-D4 from cycle 1 are all CLOSED; the defects below are
new, both introduced/left by the fix delta, neither blocks the core deliverable).

## DEFECTS

### NEW-1 — MINOR — the fix's own documented "same bad link re-arms" behaviour is FALSE; a dismissed malformed ws is silently rewritten forever with no banner
Path: app/src/shared/shell/TabUrlSync.tsx:104 (the ONLY `dismissedFragmentRef.current = null`)
vs app/src/shared/shell/TabUrlSync.tsx:98 (early return that shadows it) and :109-120 (dismissed branch).
Rule violated: the fix report §DEFECT 1 point 4 ("When the URL becomes valid (fragment === desired),
dismissedFragmentRef is cleared too, so a later re-appearance of the same bad link re-arms the
banner") and assumption AS-L2T0705-UCX2-007 ("a valid URL clears the dismissal latch so the same
bad link re-arms if it returns") — both contradicted by measurement. Mandate item 6
(report claim contradicted by measurement = defect).

Mechanism: `dismissedFragmentRef` is cleared only inside the `fragment === desired` branch (:101-107),
but the URL becomes valid in the dismiss flow through the STATE→URL write (:157), which sets
`lastWrittenRef` = the corrected search; the next URL→STATE run therefore returns at :98
(`lastWrittenRef.current === normalized`) BEFORE reaching :104. The latch is never cleared, so any
re-appearance of the exact dismissed fragment takes the :109-120 branch (diagnosticRef=null,
lastWrittenRef=normalized, return) and is then silently overwritten by the STATE→URL effect —
no banner, no diagnostic.

Verified by throwaway probe (created at app/src/shared/shell/__probe_rearm.test.tsx, run, then
DELETED; `git status --porcelain` afterwards is empty):
    PROBE: URL after dismiss+change = ?ws=record%3ADOC-9%2Crun%3ARUN-A&wsa=run%3ARUN-A
    PROBE: banner after re-appearance of SAME link = NULL (no re-arm)
    PROBE: search after re-appearance = ?ws=record%3ADOC-9%2Crun%3ARUN-A&wsa=run%3ARUN-A
    AssertionError: report claims the same bad link re-arms the banner: expected null not to be null

Impact: minor/cosmetic — a within-session re-navigation (back/forward or a link) onto a previously
dismissed malformed ws is silently swallowed instead of surfacing MALFORMED_WS_PARAM. A full page
reload re-mounts the component and DOES re-arm. No crash, no loop, no data loss.
Smallest repair: clear `dismissedFragmentRef.current` when the STATE→URL write lands (or in the :98
no-op branch when `normalized` no longer decodes to the dismissed diagnostic); alternatively drop the
re-arm claim from the report and AS-007 and document dismissal as fragment-lifetime. Add one pin:
dismiss → strip change → re-navigate to the SAME malformed fragment → banner re-arms.

### NEW-2 — MINOR — the fix report's G4 full-run evidence is not reproducible (lossy name extraction + wrong count)
Path: .hermes/plans/UCX-2-report.fix1-l2t0705.md:200-214 (§G4) and the evidence files
.hermes/plans/ucx2-evidence/ucx2-fix1-{base,head}-fullfiles.txt.
Rule violated: mandate item 6 (evidence lines contradicted by my measurement); the cycle-1/cycle-2
review contract that counts and name-lists must be reproducible.

Evidence: the report says "Test Files 60 failed | 325 passed (385)" base and head, and
"comm -3 of the sorted FAIL-file-name lists (56 vs 56 entries) → EMPTY". My own runs of the SAME
command in the SAME worktree (`cd app && npx vitest run`, twice) both report
"Test Files 61 failed | 324 passed (385)", and my name-set extraction yields 61 names. The coder's
56-entry lists deterministically omit 5 failing files (present in BOTH base and head lists, so not a
flap): e2e/gate-pbch6.spec.mjs, e2e/w2-11-campaign-demo.spec.mjs, e2e/w28-said-meant-surface.spec.mjs,
e2e/w29-review-ai-panel.spec.mjs, src/components/registry/SlideOverEditor.test.tsx. The comm-empty
conclusion therefore rests on an incomplete list. (The conclusion nonetheless HOLDS on my independent
measurement: head-exclusive vs trunk = EMPTY — see EVIDENCE F3/F4.)
Smallest repair: re-extract the failed-file name set with a pattern that captures every `FAIL` line
(including `.mjs` spec paths), correct the 60→61 count and the 56→61 list sizes in §G4, and re-run the
base-vs-head comm on the corrected lists.

Everything else checked clean (see CLOSEOUT / NOTES). No blocker/major defects found.

## CLOSEOUT (cycle-1 D1-D4)

D1 — CLOSED. TabUrlSync.tsx:178-193 — the Dismiss onClick now sets
`dismissedFragmentRef.current = wsFragment(location.search)` (:187), `diagnosticRef.current = null`
(:188) and `setDiagnostic(null)` (:189). The STATE→URL guard `if (diagnosticRef.current !== null) return`
(:137) therefore stops early-returning, and the next strip change writes the corrected search with
`{replace:true}` (:157-158) — my trace and the pin agree. The exact cycle-1 re-arm bug is closed:
the URL→STATE effect (:109-120) intercepts a re-run whose fragment equals the dismissed one and does
NOT re-set diagnosticRef/setDiagnostic. REAL pin (not "banner hides"): TabUrlSync.test.tsx:182-206
asserts ws becomes 'record:DOC-9,run:RUN-A', 'nonsense' gone from the URL, banner null, all navigations
replace-only; :227-246 is the per-entry adoption half (strip not re-stomped). RED at pre-fix product:
ucx2-evidence/ucx2-fix1-red-product-revert.raw → "Tests 2 failed | 10 passed (12)" with
"- record:DOC-9,run:RUN-B / + record:DOC-9,notakind!" and "- record:DOC-9,run:RUN-A / + %%nonsense%%".
(Side finding NEW-1 above: the fix's extra claim about the SAME link re-arming is false—not the
cycle-1 bug, which is genuinely fixed.)

D2 — CLOSED. `git -c core.fileMode=false diff 94ad9b8f..HEAD -- app/src/shared/session/urlSession.test.ts`
shows the RED-commit assertion restored verbatim: `startsWith(`${want.tab.kind}:`)`
(current urlSession.test.ts:266) and `startsWith('splash:')` (:308), i.e. the stronger colon form from
94ad9b8f — NOT the loosened `startsWith(want.tab.kind)` of 0676ed63. The fix ADDED exact slot-shape
regexes (:275, :310) `^<kind>:[0-9a-z]+:[0-9a-z]*$`. The only other delta removals in that file are the
`['execution:EVG-1','execution',…]` case row (now covered by the dedicated defect-4 pins) and the
LOSSY_FIELDS masking (D4). No silent loosening elsewhere: the full delta diff is additive plus these
restorations.

D3 — CLOSED. Wip report corrected and ANNOTATED (not silently rewritten):
.hermes/plans/UCX-2-report.wip-l2t0400.md:8-11 now reads "6 NEW test files only" with a
"[CORRECTED per advc-UCX2-l2t0655 defect 3 …]" note; fix report §DEFECT 3 (:97-108) documents the same
and DISCLOSES `useSessionSync.boot.test.ts` as the 6th file legitimately outside the spec SCOPE IN list
(the spec forbids editing useSessionSync.test.ts). `git diff --name-status 94ad9b8f^..94ad9b8f` → 6 added
files. Commit messages are not rewritten (no reset/rebase per task rules); the residual "7 new pins" in
the fix commit e70db989 message was itself corrected by e1a5e178 ("8 new pins, not 7"), and I counted
`grep -cE '^\+.*it\('` over the fix delta = 8. Consistent.

D4 — CLOSED. execution is now UNENCODABLE: urlSession.ts:58-60 `isUnencodableKind`, :73-74 filters it out
of `encodable` (never an empty `ws`; :74), :79 picks `wsa` only from an encodable tab, :112-116
`case 'execution': return null`. LOSSY_FIELDS masking REMOVED: urlSession.test.ts:240-245 now lists only
run/deck/lab-entity/record-edit (no `execution: ['runId']`). Round-trip proves it by DROPPING:
:255-256 `wantTabs = state.tabs.filter(kind !== 'execution')` + `expect(round.tabs.length).toBe(wantTabs.length)`.
Dedicated pins: :110-115 (execution ids null + state null + diagnostic), :117-121 (per-entry drop, siblings
survive), :123-136 (never encoded; no wsa), :138-147 (no decoded tab yields '/runs/' or '' via the real
tabPath), :176-182 (execution-only strip → ''). RED at pre-fix HEAD: ucx2-evidence/ucx2-fix1-red-pins-at-head.raw
→ "Test Files 2 failed (2); Tests 6 failed | 22 passed (28)".

## REGRESSION SWEEP (fix delta)

- New loop from the D1 fix: NONE found. Traced dismiss → strip change: URL→STATE runs first (declaration
  order), takes the dismissed branch (:117-119), then STATE→URL writes the correction (:157), then both
  effects early-return (lastWrittenRef === normalizeSearch at :98; mergedStr === normalizeSearch at :156).
  Converges in one write. TabUrlSync.test.tsx:182-206 completes and asserts a single converged ws.
- Malformed-degradation never-crash: HOLD. No throw path added; App.url.test.tsx:95-100 pins the banner
  + page render; urlSession.test.ts:217-222 pins state:null+diagnostic. Full suite shows 5 baseline
  "Errors" (unchanged trunk count).
- Spec "Malformed → do NOT touch state": HOLD. Dismissal clears only diagnosticRef (URL OWNERSHIP) and
  sets dismissedFragmentRef; the :126 `replaceState(decoded.state)` is untouched by dismissal. Per-entry
  dismissal still leaves the adopted strip intact (TabUrlSync.test.tsx:227-246 asserts
  ['record:DOC-9','run:RUN-B'] — no re-stomp).

## EVIDENCE (commands + real output)

E1. Scope — `git -c core.fileMode=false diff --name-only 3f0f54b7..HEAD | grep -E '^(server|schema)/|\.ya?ml$|App\.test\.tsx'`
    → empty (exit 1). Non-.hermes files touched: App.tsx, App.url.test.tsx, sequences/SequencesPage.tsx,
    SequencesPage.urltab.test.tsx, session/{urlSession.ts,urlSession.test.ts,useSessionSync.ts,useSessionSync.boot.test.ts},
    shell/{OpenTabsContext.tsx,OpenTabsContext.url.test.ts,TabUrlSync.tsx,TabUrlSync.test.tsx}. App-only, in scope.

E2. Targeted UCX-2 suites — `cd app && npx vitest run src/shared/session/urlSession.test.ts src/shared/session/useSessionSync.boot.test.ts src/shared/shell/OpenTabsContext.url.test.ts src/shared/shell/TabUrlSync.test.tsx src/App.url.test.tsx src/sequences/SequencesPage.urltab.test.tsx`
    → "Test Files  6 passed (6)" / "Tests  47 passed (47)". Matches the report's G1.

E3. Typecheck — `cd app && npm run typecheck` → 23 "error TS" lines, 16 unique error files, NONE
    UCX-2-owned. Trunk (/mnt/vast/home/brad/git/cl-integration-2/app, 534f7e5f) → also 23 lines / 16 files.
    `comm -3` of the sorted unique-file lists = EMPTY; `comm -3` of the sorted full error-line lists = EMPTY.
    (Mandate's "21-file error set" is not what I measure; 16 files / 23 lines is the observed set, identical
    base-to-head.)

E4. FULL app run, head (twice) — `cd app && npx vitest run`:
      run1: "Test Files  61 failed | 324 passed (385)"   run2: "Test Files  61 failed | 324 passed (385)"
    FULL app run, trunk — `cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run`:
      "Test Files  62 failed | 319 passed (381)"
    Failed-file name sets extracted from each raw. Head-exclusive (NEW) vs trunk for run2 = EMPTY
    (comm -13 → no output). Run1's sole head-exclusive name was src/components/registry/SlideOverEditor.test.tsx,
    a load flap: it PASSES in isolation ("Test Files 1 passed (1) / Tests 12 passed (12)") and is absent
    from run2; it imports only ./SlideOverEditor (no tab/URL code). Run1 vs run2 symmetric diff:
    -SlideOverEditor.test.tsx / +AddMaterialForm.biological.test.tsx — both known flaps.
    => command: `comm -13 /tmp/ucx2-c2-trunk-failfiles.txt /tmp/ucx2-c2-head2-failfiles.txt` → empty.
    My trunk count is 62, not the mandate's 61 (a flap/revision difference); the head-exclusive set is empty
    either way.

E5. D2 diff — `git -c core.fileMode=false diff 94ad9b8f..HEAD -- app/src/shared/session/urlSession.test.ts`
    → only additive hunks + the execution case-row removal; the `${kind}:` and `splash:` assertions are present
    at HEAD (:266, :308).

E6. D1 probe (throwaway, deleted) — see NEW-1 output block above. `git -c core.fileMode=false status --porcelain`
    after deletion → empty.

## NOTES (checked, not defects)

- Hardcode boundary: TabUrlSync's eligibility derives from `tabPath` over the open strip + the two specced
  resume routes '/' and '/splash' — no route table. urlSession's `COLLECTIONS` list and the `tabFromStableId`
  switch mirror the WorkspaceTab union (types.ts) exactly as tabId.ts already does; `isUnencodableKind` is a
  kind filter, not a route whitelist. SequencesPage validates `?tab=` against its EXISTING declared `tabs` const
  (lockstep with surfaces.yaml via the existing server compat test). No lint-YAML domain rule is bypassed.
- Ajv/validation: no validation authority is touched (client-only codec). No parallel schema logic.
- exactOptionalPropertyTypes: app tsconfig does not enable it; the new code follows the repo convention
  (`...(hasExplicitWorkspaceLink ? { skipBootPull: true } : {})` App.tsx:104; urlSession returns
  `...(diagnostic ? { diagnostic } : {})` :250). No `: undefined` optional assignment found.
- Ontology/knowledge-layer/materials hierarchy: untouched by this item.
- YAML: zero *.yaml hunks → the tsx-watch/restart trap does not apply.
- Tests assert real behaviour: 47 targeted assertions, 2 module-absent RED suites at the RED commit,
  and the fix pins genuinely RED-failed at pre-fix HEAD (E4/D1/D4 raws). No assert-nothing tests found.
- Scope/ownership: App.test.tsx and useSessionSync.test.ts remain byte-identical to trunk (not in the diff).
- Report G2's SurfaceIndicator flap and G4's flap bookkeeping are honest (flaps real; I reproduced two).

Note for the orchestrator: NEW-1 and NEW-2 are both MINOR and repairable by a docs/pin-only follow-up
(NEW-1 needs a one-line latch clear + one pin; NEW-2 is a report/evidence recount). Neither affects the
item's share/refresh/sync deliverable, the protected routes, or the app-only scope.

ADVERSARIAL DONE FIX
