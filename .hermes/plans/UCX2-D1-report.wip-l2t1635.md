# UCX2-D1 coder report (lane 2, l2t1635) — MALFORMED_WS_PARAM banner occlusion fix

Worktree: /mnt/vast/home/brad/git/wt/UCX2-D1-lane2-l2t1635
Branch: feat/UCX2-D1-lane2-l2t1635 off cl/integration-2 tip d56f38b5
Commits: afb4a2ee (RED test) / 97e4b5ec (feat fix) — DONE sha 97e4b5ec
Not pushed, not merged, trunk untouched.

## Defect (orch adjudication l2t1330, first-hand)
Encoded ws=%25%25nonsense%25%25 renders the role=status banner into the DOM at
rect [16,8,635,21]; elementFromPoint at banner center returns
.global-navbar__brand-text. Cause: App.tsx:144 mounts <TabUrlSync/> as a bare
sibling BEFORE <Routes>, so the banner lands in the body flow, while the shell
(.cl-app, AppShell.css:17) is position:fixed inset:0 and the workspace header
(GlobalNavbar + tab strip) paints over that strip. The user sees no banner.

## Fix (presentation placement ONLY)
app/src/shared/shell/TabUrlSync.tsx — banner JSX style object only:
- position: fixed (out of the body flow)
- top: calc(var(--cl-globalnav-height, var(--cl-topbar-height, 40px)) +
  var(--cl-tabstrip-height, 30px)) — the workspace header's own row tokens
  (navbar 40px + tab strip 30px = 70px). Literal fallbacks are REQUIRED and
  load-bearing: the layout tokens are scoped to `.cl-app` (tokens.css:13) and
  the banner element sits OUTSIDE the shell (sibling of the shell div), so the
  custom properties do not cascade to it.
- left: 0; right: 0 (full-width notice)
- zIndex: 30 — above the content layer (topbar__surface chip z-index 5,
  AppShell.css:132), numerically below the navbar menu (GlobalNavbar.css:109
  z-index 40). Geometrically it never overlaps the navbar: top=70px lands it
  directly below the 40px navbar + 30px strip header.
- On legacy non-workspace routes (AppShellTopBar, 48px) the banner sits at
  70px — a 22px gap below the topbar, still no overlap.
- On mobile (.cl-app overrides --cl-topbar-height: 40px inside the shell) the
  banner resolves via the literal fallbacks to the same 70px offset; the
  workspace header rows are 40+30 there too.

FROZEN and untouched (verified by diff): the sync effects (TabUrlSync.tsx
:54-171 region), the ownership latch (dismissal / dismissedFragmentRef /
diagnosticRef semantics incl. advc-UCX2-c2 NEW-1), the banner copy
('MALFORMED_WS_PARAM: <message>'), the Dismiss button. The feat diff is the
style object + an explanatory comment only (1 file, +20 lines, 0 deletions of
behavior).

## RED (commit afb4a2ee)
New test in app/src/App.url.test.tsx:
  'UCX2-D1: the malformed-ws banner is placed below the fixed navbar, not under it'
Deterministic jsdom assertion (single post-condition, no layout engine): the
banner element carries the fixed-position placement — style.position ===
'fixed', style.top composes the header-row tokens (contains
'var(--cl-globalnav-height' and 'var(--cl-tabstrip-height'), left/right 0px
full-width, explicit z-index > 5 (content chip) and < 40 (navbar menu). Copy
+ dismissal presence also pinned (frozen-semantics guard).

Raw RED failure (targeted run, pre-fix):
  FAIL  src/App.url.test.tsx > App deep-link hydration (UCX-2) > UCX2-D1: the malformed-ws banner is placed below the fixed navbar, not under it
  AssertionError: banner must be position:fixed (shell is a fixed overlay grid — body-flow placement lands under the navbar): expected '' to be 'fixed' // Object.is equality
  Test Files 1 failed (1); Tests 1 failed | 5 passed (6)

## GREEN (commit 97e4b5ec)
Targeted: npx vitest run src/App.url.test.tsx src/shared/shell/TabUrlSync.test.tsx
  ✓ src/shared/shell/TabUrlSync.test.tsx (13 tests)
  ✓ src/App.url.test.tsx (6 tests)
  Test Files 2 passed (2); Tests 19 passed (19)
All 13 pre-existing TabUrlSync latch/dismissal/re-arm pins (incl. FIX1 and
FIX2/NEW-1 pins) pass unchanged — latch semantics byte-behaving.

## Full-suite failing-file NAME SET comm (zero-new proof)
Run A (baseline run, captured with the RED test already in the tree — vitest
collected App.url.test.tsx after the RED patch, so its 96-file set = trunk
debt + the intentional RED failure):
  Test Files 96 failed | 282 passed (378); Tests 67 failed | 2222 passed (2289)
  raw: /tmp/ucx2d1-baseline-full.raw
Run B (after feat commit):
  Test Files 95 failed | 283 passed (378); Tests 66 failed | 2223 passed (2289)
  raw: /tmp/ucx2d1-after-full.raw
FAIL-file sets (sorted unique from ' FAIL ' lines):
  comm -3 /tmp/base-files.txt /tmp/after-files.txt
  → src/App.url.test.tsx   (the ONLY exclusive entry — baseline-only, i.e. the
    RED test flipping to GREEN)
The 95-file intersection is byte-identical between the two runs — that IS the
trunk baseline debt set, and Run B's set equals it exactly. Zero new failing
files. Tests delta: exactly one test flipped (67→66 failed, 2222→2223 passed).
'Errors' line drifts 6→7 across the two runs with an identical fail-file set —
pre-existing unhandled-exception debt (known trunk flapping), not introduced
here.

## Typecheck comm (zero-new)
npx tsc --noEmit at base d56f38b5: 27 'error TS' lines (exit 2) — raw
/tmp/ucx2d1-tsc-base.raw. At head 97e4b5ec: 27 lines (exit 2) — raw
/tmp/ucx2d1-tsc-head.raw. diff of sorted outputs: EMPTY. No error mentions
TabUrlSync or App.url. (All 27 are pre-existing trunk debt: runDeckLock /
surfaces/registry TS2307 / implicit-any cluster.)

## Sibling full-width notice scan (SCOPE: report only, nothing changed)
- App.tsx bare siblings before <Routes>: MentionNavigator, RecordHistoryListener,
  SessionSync all render null; TabUrlSync was the ONLY sibling rendering visible
  output — no other trapped body-flow notice exists at that mount point.
- ErrorBoundary fallback (.error-boundary, index.css:647): replaces the whole
  app tree on crash (shell never renders) — no navbar to occlude it. Not trapped.
- Other role=status/alert notices (CompileStatusBanner in BindingModeEditor,
  ProtocolIdeShell/IntakePane/SourcePane status+alert rows, SequenceImport,
  VendorPdfReviewPage, etc.) render INSIDE page components within the shell
  grid flow (row 2+), below the header — not occluded. Left untouched.
- Intentional fixed overlays (taptab.css z 99/100, modal backdrops z 50-100)
  are deliberate overlays above content, not notices. Left untouched.

## Assumptions
- The pinned placement contract is the inline-style declaration (jsdom-observable);
  real-pixel visibility on workspace routes is the orchestrator-owned browser
  re-verification of C3-visible after merge (not run here per task block).
- z-index 30 chosen from the measured shell landscape (content chip 5, navbar
  menu 40, modals 50+): above content, below menus/modals, geometrically clear
  of the navbar band (0-70px).

## Unresolved / next
- Orch: merge 97e4b5ec, then browser re-verification of C3-visible banner on
  :5193 (orch-owned; lane stack never touched by this session).
