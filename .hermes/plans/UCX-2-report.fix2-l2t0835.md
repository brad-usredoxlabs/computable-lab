# UCX-2 — CODER FIX2 REPORT (lane 2, token l2t0835)

Cycle: fix run 2, closing ONLY the two MINOR residuals from adversarial cycle 2
(advc-UCX2-c2-l2t0800.md; D1-D4 already CLOSED there).
Worktree: /mnt/vast/home/brad/git/wt/UCX-2-lane2-l2t0400 (branch wt/UCX-2-lane2-l2t0400).
Start HEAD: e1a5e178. Fix commit: 1ded18db (TabUrlSync.tsx + TabUrlSync.test.tsx only).
All git run with `-c core.fileMode=false`. Vitest run FROM <worktree>/app.

## DEFECT NEW-1 (MINOR) — dismissed latch never re-armed: FIXED via option (a) (latch clear + pin)

Chosen repair: option (a) from the review's smallest-repair menu — clear
`dismissedFragmentRef.current` at the STATE->URL write landing — plus ONE pin.
Option (b) (drop the re-arm claim) was rejected: the claim is the better
contract (a dismissed bad link that comes back should surface again, not be
silently rewritten forever), and the reviewer's own probe proved the old
mechanism dead, not the behaviour unachievable.

Mechanism (TabUrlSync.tsx, fix commit 1ded18db):
- The STATE->URL effect now clears `dismissedFragmentRef.current = null`
  immediately after `lastWrittenRef.current = mergedStr` at the write landing
  (new lines 161-168, just before `navigate(..., {replace:true})`). That is the
  moment the URL becomes valid in the dismiss flow; the :101-107 URL->STATE
  clear could never run for the dismissed fragment afterwards because the
  lastWritten early-return shadows it (the review's exact mechanism).
- The :101-107 clear is KEPT (it still covers the fragment===desired adoption
  path, e.g. a valid link arriving externally).
- Component header doc updated: dismissal is not permanent amnesia — a
  re-navigation onto the SAME dismissed malformed fragment re-arms the banner.

RED-first (pin added BEFORE the product change, run at HEAD e1a5e178):
  cd app && npx vitest run src/shared/shell/TabUrlSync.test.tsx
  → Test Files  1 failed (1)
         Tests  1 failed | 12 passed (13)
  FAIL src/shared/shell/TabUrlSync.test.tsx > TabUrlSync URL → state (external
  change) > dismiss then correction then re-navigation to the SAME malformed
  fragment re-arms the banner
  TestingLibraryElementError: Unable to find an element by: [data-testid="ws-param-diagnostic"]
  (the banner never re-appears — the review's silent-rewrite behaviour, reproduced)
  Raw: .hermes/plans/ucx2-evidence/ucx2-fix2-red-rearm.raw

New pin (TabUrlSync.test.tsx, +1 test; harness Probe gained an
`external-navigate-same-malformed` button that navigates to the EXACT mount
fragment `?ws=%%nonsense%%&wsa=zzz`):
  'dismiss then correction then re-navigation to the SAME malformed fragment
  re-arms the banner' — mount malformed -> dismiss -> openTab(run:RUN-A) ->
  ws becomes 'record:DOC-9,run:RUN-A' and 'nonsense' gone (the D1 contract,
  re-asserted inside the pin) -> click external-same-malformed -> banner shows
  MALFORMED_WS_PARAM again -> state untouched (['record:DOC-9','run:RUN-A']).

Loop-safety trace (no new ping-pong): after the latch clear, the dismissed
branch (:109-120) is unreachable for the SAME fragment while the corrected
search is current (lastWrittenRef === normalized short-circuits at :98 first);
the re-armed banner re-sets diagnosticRef, the STATE->URL guard (:140) stops
rewriting, so the re-navigated malformed link is owned by the banner exactly
like a first visit. The existing 'dismiss is scoped to the dismissed link' and
per-entry no-re-stomp pins still pass (GREEN below).

Fix1-report annotations (NOT silent rewrites, same convention as D3):
- UCX-2-report.fix1-l2t0705.md §DEFECT 1 point 4: bracketed [CORRECTED per
  advc-UCX2-c2-l2t0800 NEW-1] note — the claim was true in intent but false in
  mechanism at e1a5e178; fix2 restores its truth at the write landing.
- UCX-2-report.fix1-l2t0705.md AS-L2T0705-UCX2-007: same bracketed correction.

## DEFECT NEW-2 (MINOR) — G4 evidence recount: CORRECTED (annotated in fix1 report + fresh re-measurement)

Root cause of the 56-vs-56 lists: the original extraction dropped 4 FAIL lines
whose paths end in `.mjs` (present in BOTH saved raws). The reviewer's 61-vs-61
adds a 5th name, SlideOverEditor.test.tsx, which flapped in THEIR fresh runs —
it PASSES in both saved fix1 raws ("✓ src/components/registry/SlideOverEditor.test.tsx
(12 tests)") and passes in my fresh head AND fresh trunk runs this cycle.

Re-extraction from the saved fix1 raws (pattern captures every FAIL line, incl. .mjs):
  cd .hermes/plans/ucx2-evidence
  grep -oP 'FAIL\s+\S+' ucx2-fix1-full-base.raw | awk '{print $2}' | sort -u   → 60 names
  grep -oP 'FAIL\s+\S+' ucx2-fix1-full-head.raw | awk '{print $2}' | sort -u   → 60 names
  (saved as ucx2-fix2-base-fullfiles.corrected.txt / ucx2-fix2-head-fullfiles.corrected.txt)
  comm -3 ucx2-fix2-base-fullfiles.corrected.txt ucx2-fix2-head-fullfiles.corrected.txt → EMPTY (exit 0)
  Names the OLD 56-entry lists omitted (identical on both sides, so not a flap):
    e2e/gate-pbch6.spec.mjs
    e2e/w2-11-campaign-demo.spec.mjs
    e2e/w28-said-meant-surface.spec.mjs
    e2e/w29-review-ai-panel.spec.mjs
  Saved-raw summaries (unchanged): base AND head "Test Files 60 failed | 325 passed (385)".
  => corrected counts are 60-vs-60 (not 56-vs-56); the reviewer's 61-vs-61 is their
  fresh-run flap count; conclusion (ZERO NEW failing file names base-vs-head) UNCHANGED.

Fresh fix2-cycle re-measurement (the gate for this run):
  head:  cd /mnt/vast/home/brad/git/wt/UCX-2-lane2-l2t0400/app && npx vitest run
  →  Test Files  60 failed | 325 passed (385)
        Tests  71 failed | 2532 passed (2603)
       Errors  5 errors
     Raw: .hermes/plans/ucx2-evidence/ucx2-fix2-full-head.raw
     Names: ucx2-evidence/ucx2-fix2-head-failfiles.txt (60)
  trunk: cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run
  →  Test Files  61 failed | 320 passed (381)
        Tests  71 failed | 2492 passed (2563)
       Errors  5 errors
     Raw: .hermes/plans/ucx2-evidence/ucx2-fix2-full-trunk-int2.raw
     Names: ucx2-evidence/ucx2-fix2-trunk-failfiles.txt (61)
  GATE: comm -13 ucx2-fix2-trunk-failfiles.txt ucx2-fix2-head-failfiles.txt → EMPTY (exit 0).
        ZERO NEW failing FILE names.
  trunk-exclusive (fails at trunk, passes at head): e2e/sequences-multiselect.spec.ts
  (trunk debt the lane's base already carries; not a lane-introduced change).
  Trunk choice note: cl-integration-2 (045147ce) is the lane trunk — merge-base
  HEAD..cl/integration-2 = 3f0f54b7 (the item's spec-promotion commit), matching the
  reviewer's E4. A run of computable-lab main (e78736d4, 56 failed) instead shows 4
  head-exclusive names (gate-pbch6.spec.mjs, pbch4b-accept-leg.test.ts,
  LawnSurface.footprint.test.tsx, ViewerToolbar.test.tsx) — ALL FOUR are present in
  the cl-integration-2 trunk list (verified by grep), i.e. they are main-vs-integration
  drift, not lane-new. The comm above is against the correct trunk.
  Flap note: SlideOverEditor.test.tsx (the reviewer's 5th omitted name) shows "✓"
  (12 tests) in BOTH fresh runs above — consistent with the memory-documented
  load-flap debt; no action needed.

## GATES (fix commit 1ded18db)

G1 targeted 6 suites (47 + 1 new pin = 48):
  cd app && npx vitest run src/shared/session/urlSession.test.ts src/shared/session/useSessionSync.boot.test.ts src/shared/shell/OpenTabsContext.url.test.ts src/shared/shell/TabUrlSync.test.tsx src/App.url.test.tsx src/sequences/SequencesPage.urltab.test.tsx
  → Test Files  6 passed (6)
         Tests  48 passed (48)
  Raw: .hermes/plans/ucx2-evidence/ucx2-fix2-targeted.raw

G2 target dirs (regression sweep):
  cd app && npx vitest run src/shared/session src/shared/shell src/sequences
  → Test Files  31 passed (31)
         Tests  225 passed (225)   (was 224; +1 = the new pin)
  Raw: .hermes/plans/ucx2-evidence/ucx2-fix2-dirs.raw

G3 full app run: see NEW-2 block — head 60 failed | 325 passed (385), comm -13 vs
cl-integration-2 trunk (61 failed | 320 passed (381)) EMPTY. "Errors 5" unchanged
(memory-documented unhandled-exception debt).

G4 typecheck:
  head:  cd <worktree>/app && npm run typecheck → 23 "error TS" lines, 16 unique error files
  trunk: cd /mnt/vast/home/brad/git/cl-integration-2/app && npm run typecheck → 23 lines, 16 files
  comm -3 of sorted unique-file lists → EMPTY; comm -3 of sorted full error-line lists → EMPTY.
  (Matches the cycle-2 measurement: 23-line/16-file baseline.)
  Raws: ucx2-evidence/ucx2-fix2-tsc-head.raw, ucx2-evidence/ucx2-fix2-tsc-trunk.raw

## SCOPE PROOF (fix commit)

  git -c core.fileMode=false diff --name-only e1a5e178..1ded18db
  → app/src/shared/shell/TabUrlSync.test.tsx
    app/src/shared/shell/TabUrlSync.tsx
  git -c core.fileMode=false diff --name-only e1a5e178..1ded18db | grep -E '^(server|schema)/|\.ya?ml$|App\.test\.tsx'
  → empty (exit 1). ZERO server/, schema/, *.yaml, App.test.tsx. Docs/evidence under
  .hermes/plans/ in the follow-up docs commit. No reset/rebase; commits stack on e1a5e178.

## ASSUMPTIONS (fix2 cycle)

- AS-L2T0835-UCX2-011 (NEW-1 option choice): option (a) (latch clear at the
  STATE->URL write landing + pin) over option (b) (drop the claim). The claim is
  achievable and is the user-facing-correct contract; option (b) would have
  documented a silent-rewrite-forever behaviour the reviewer flagged as the defect.
- AS-L2T0835-UCX2-012 (latch-clear placement): clear AFTER the no-op guard and
  only on an actual write. A no-op STATE->URL run (mergedStr === current) does
  NOT clear the latch — clearing there would let a dismissed malformed link that
  is still the current search re-arm on the next effect re-run without any user
  navigation, contradicting the D1 contract the per-entry pin pins (banner stays
  gone after dismiss while nothing changes). Only a landing correction re-arms.
- AS-L2T0835-UCX2-013 (NEW-2 counts): 60-vs-60 is what the SAVED fix1 raws and my
  fresh runs measure; the reviewer's 61-vs-61 includes their fresh-run
  SlideOverEditor flap. Both are honest measurements of a known flap-debt suite;
  the corrected lists annotate rather than overwrite the original G4 text.

## UNRESOLVED / FOR THE ORCHESTRATOR

- None blocking. The browser gate (:5193 3-leg walk) remains the orchestrator's
  post-merge step; nothing in this cycle changes its criteria.
- Cycle-2 review's trunk-count drift note (reviewer 61/62 vs mandate 61) stands:
  counts move run-to-run with load flaps; the fail-FILE-NAME comm is the gate and
  it is empty at every measurement taken here.

UCX-2 FIX2 DONE 1ded18db1301db06b7c88eca747dec67d49de1e4
