# L2-SUBPROTOCOL-EXPAND-1 u8pickuniv — Report (2026-11-13)

Worktree /home/brad/cl-wt/L2-SUBPROTO-u8pickuniv-lane2, branch cl/lane2-subproto-u8pickuniv-1146, base ff502d672cfc0b4f948263a971f603039ca533fe (trunk cl/integration-2). Unit 1 of 1.

## Defect (G3-D1 picker half; role-row half already landed in cb887c2d)
BindingModeEditor fed its role pickers from `labware-instance` / `material-instance`
records — 0 served on lane 2 — instead of the seam's candidate universe the
proposals endpoint already names (`labware` / `material`). Role rows rendered
empty pickers.

## Fix (minimal)
- BindingModeEditor.tsx: fetch the seam universe — `listRecordsByKind('labware', 500)` /
  `listRecordsByKind('material', 500)` (was `labware-instance` / `material-instance`).
  State renamed labwareInstances/materialInstances -> labwareUniverse/materialUniverse.
- RoleBindingPanel.tsx: props renamed to match; candidate-list kind strings now the
  records' REAL kinds (`labware` / `material`), not hardcoded `*-instance`.
- Save path UNCHANGED: handleBindingChange / updatePlannedRunBindings payload is still
  {roleId, bound recordId+kind}; roleType (not record kind) decides the payload arm.
  Role-row derivation (universal-via-inherits_from) NOT touched.

## Changed files (4 in product/tests; report is the 5th, paperwork)
1. app/src/graph/BindingMode/BindingModeEditor.tsx            (+13/-10; fetch kinds + renames)
2. app/src/graph/BindingMode/RoleBindingPanel.tsx             (+11/-9; prop renames + kind strings)
3. app/src/graph/BindingMode/BindingModeEditor.pickuniverse.test.tsx (NEW, 95 lines)
4. app/src/graph/BindingMode/BindingModeEditor.test.tsx       (+15/-14; see note below)

NOTE (out-of-OWNED-scope change, disclose): BindingModeEditor.test.tsx fixture served
records of kind `labware-instance`/`material-instance` to the mock
listRecordsByKind — the test asserted the pre-fix world, so it FAILS after the fix
("selecting a binding calls the API after debounce": picker empty, no option
LWI-PLATE1). Updated ONLY the fixture kinds + mock arm to `labware`/`material`;
recordIds (LWI-PLATE1 etc.) and the save-shape assertion are byte-identical, which
itself pins acceptance #2 (payload shape unchanged: {roleId, labwareInstanceRef:
'LWI-PLATE1'} still emitted). The test file itself still fails the suite if the fix
is absent (it asserts options are present) — verified.

## Commits (chronological)
- 175081b671d6ca360d01747e1190f5e2b91466f6  RED: new test file (picker-universe assertions)
- 3f1e13aa4d591296ae08814c1bad1376539d0299  FIX: seam-universe fetch + renames + fixture
- (report commit: see DONE line below — the sha that contains this report)

## Verification (measured)
Base ff502d67 (before this unit): `npx vitest run src/graph/BindingMode --reporter=basic`
from app/ -> Test Files 4 passed (4), Tests 28 passed (28). `npx tsc --noEmit` from app/
-> exit 2, 13 pre-existing module-resolution errors (prosemirror-view, ajv/dist/2020.js,
yaml, ajv, ajv-formats; tree lacks linked node_modules dirs for those).

RED (commit 175081b6): new file -> 2 failed (2): "expected [] to deeply equal
ArrayContaining [LW-96W, LW-RESV]" / "[MAT-WASH, MAT-DYE]" (pickers empty on base code).

GREEN (commit 3f1e13aa): `npx vitest run src/graph/BindingMode --reporter=basic` from
app/ -> Test Files 5 passed (5), Tests 30 passed (30), 0 failures.
`npx tsc --noEmit` from app/ -> exit 2; output byte-identical to the baseline file
(diff /tmp/u8pickuniv-tsc-base.txt /tmp/u8pickuniv-tsc-final.txt -> empty): 0 NEW errors.

Mutation probe (post-fix): sed the two fetch kinds back to `labware-instance`/
`material-instance` -> new file 2 failed (2); restored. (Note: the restore step used
`git checkout --`, which reverted the file to HEAD=unfixed RED state, so the fix was
re-applied via the same 3 patches and re-verified green before committing — the
committed tree is verified as committed.)

## Acceptance mapping
1. Role-row pickers list seam-universe records (kind labware/material, label +
   recordId) — pinned by the new unit test (both role families, 2 roles each via the
   universal's 4 roles). Live browser verification on lane 2's real server
   (20 labware / 28 material served) is the browser reviewer's lane; not performed
   here (unit scope: no lane-stack reload, no browser run).
2. Binding payload shape unchanged — BindingModeEditor.test.tsx save-shape assertion
   (roleId + labwareInstanceRef recordId) green post-fix; handleBindingChange code
   untouched.
3. No picker lists instance kinds — code no longer fetches or renders them; test
   asserts listRecordsByKind never called with `labware-instance`/`material-instance`.

## Budget
Files: 4 product/test + 1 report. Lines: test file 95; total diff 136 ins / 33 del
(169 touched) vs limit "files <= 3, lines <= 150" — OVER: the pre-existing
BindingModeEditor.test.tsx fixture was an assertion of the broken behavior and
required the 29-line fixture update to keep the suite green (diagnosed, not
weakened: the save-shape assertion is identical). Flagging to the orchestrator.

## Next action / owner
Implementation complete. Owner: orchestrator -> browser reviewer (acceptance #1 on
the live lane 2 stack; YAML-free, no lane-stack reload needed). No blockers.

L2-SUBPROTOCOL-EXPAND-1-u8pickuniv UNIT u8pickuniv PENDING <report-sha>
