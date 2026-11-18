# L2-SEED-LABLOCAL-1 / unit d5defsrc — report

- worktree: /tmp/wt-L2-SEEDLAB-d5defsrc (local disk, per assignment)
- branch: cl/lane2-seedlab-d5defsrc-1825
- base: aa15b90a70b2bdc0e761be1625ad896a3706cb25
- gate: reviews/L2-LABINV-SEEDLAB-browser-g1-l2t2210.md, major defect D5

## Task
Point the labware-instance create dialog's definition picker at `labware-definition`
records instead of `labware` records, so the seeded single-trough reservoir definition
(`lbw-def-generic-single-trough-25ml-reservoir`) is selectable.

## Decisions
1. One kind, one call: the effect's single `listRecordsByKind` call had its kind argument
   changed `labware` → `labware-definition`. No merged/union fetch (bait #2), no server or
   schema change (bait #1), no modal/prop change (bait #6).
2. Comment at :263 left UNCHANGED — after the fix it is true ("Load labware definitions
   when the instance create modal opens"), so no edit was required.
3. Pin asserts the ARGUMENT `('labware-definition', 200)`, not call count (bait #3): the
   grid fetch under the `labware-instances` category legitimately calls `listRecordsByKind('labware-instance', 200)`
   (fetchRecords at :250, effect at :259-261), and the modal component itself makes no
   `listRecordsByKind` call (it consumes the `definitions` prop), so the argument assertion
   uniquely targets the picker fetch.
4. The "+ New instance" button (data-testid `lab-category-new-labware-instance`, handler
   `setShowInstanceModal(true)` at :420) renders only under the `labware-instances`
   category, so the pin renders `/lab/labware-instances` and clicks that testid — no new
   harness, reuses the existing `listRecordsSpy` and the file's `renderCategory` helper.

## Changed files (exactly 2, within owned set)
- `app/src/collections/LabCollectionView.tsx` — 1 line: :266 `'labware'` → `'labware-definition'`.
  200 limit, `.then((r) => setLabwareDefinitions(r.records))`, `[showInstanceModal]` deps,
  and the state name are unchanged. Total diff: 14 insertions, 1 deletion across both files
  (13 = test pin block, 1 = the kind argument).
- `app/src/collections/LabCollectionView.test.tsx` — +13 lines: one RED-first pin
  (12 baseline tests per `grep -c 'it('` → 13 after).

Diff of the source change:
```
-      void apiClient.listRecordsByKind('labware', 200).then((r) => setLabwareDefinitions(r.records))
+      void apiClient.listRecordsByKind('labware-definition', 200).then((r) => setLabwareDefinitions(r.records))
```

## Commits (step order)
1. `42ad0b800683b7553b1fbe752f05d48f884a1c15` — `test(seedlab): pin instance picker requests labware-definition kind` (RED first)
2. `6122de6fedc501202ae2ed6e3368a82a03088176` — `fix(seedlab): load labware-definition records into the instance picker`
3. report commit (this file) — marker below names the final CODE commit per brief exit contract
   and reviewer bait #7 (marker sha must not be a docs commit).

## RED run (raw, before the fix — commit 42ad0b80, test present, fix absent)
Command: `cd /tmp/wt-L2-SEEDLAB-d5defsrc/app && TMPDIR=/home/brad/.tmp-d5defsrc ./node_modules/.bin/vitest run src/collections/LabCollectionView.test.tsx`
```
 FAIL  src/collections/LabCollectionView.test.tsx > LabCollectionView > opens the instance modal and requests labware-definition records for the Definition picker
AssertionError: expected "spy" to be called with arguments: [ 'labware-definition', 200 ]

Received:

  1st spy call:

  Array [
-   "labware-definition",
+   "labware-instance",
    200,
  ]

  2nd spy call:

  Array [
-   "labware-definition",
+   "labware",
    200,
  ]


Number of calls: 2

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```
1st call is the legitimate grid fetch (`labware-instance`); 2nd is the buggy picker fetch
(`labware`) the pin targets.

## GREEN run (raw, after the fix — commit 6122de6f, single run)
Same command:
```
 ✓ src/collections/LabCollectionView.test.tsx  (13 tests) 184ms

 Test Files  1 passed (1)
      Tests  13 passed (13)
```
Baseline 12 → 13, as the brief predicted (measured, not assumed). Pre-existing
"not wrapped in act(...)" console warnings appear in both baseline and GREEN runs
(they are in the baseline at aa15b90a too) — not introduced by this change.

## Typecheck (single run, after the fix)
Command: `cd /tmp/wt-L2-SEEDLAB-d5defsrc && TMPDIR=/home/brad/.tmp-d5defsrc npm run typecheck -w app`
RESULT: exit 2, 13 errors. This is NOT a regression and NOT clean, contrary to the brief's
"baseline at aa15b90a: clean" expectation — verified by A/B:
- Every error is in files this unit did not touch: `src/editor/taptab/tabNavPlugin.ts`,
  `src/editor/taptab/widgets/ObjectWidget.nested.test.tsx`,
  `src/event-editor/create/RecordCreatePanel.gc16*.test.tsx` (5×), and 7× in
  `../server/src/**` (SchemaLoader.ts, UISpecLoader.ts, AjvValidator.ts, types.ts).
- Every error is `Cannot find module` for third-party deps (`prosemirror-view`,
  `ajv/dist/2020.js`, `ajv`, `ajv-formats`, `yaml`) plus 4 pre-existing
  TS7006 implicit-`any` params in the gc16 test files.
- Zero errors mention `LabCollectionView` (grep over the full output: no match).
- Root cause is environmental: `app/node_modules` is a symlink to
  `/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`, which does not contain
  `ajv` or `prosemirror-view` (checked on disk); `yaml` resolves only for the app's own
  imports, not for the server files included in the app tsconfig.
- Proof: a scratch worktree at the pristine base aa15b90a (same node_modules symlink,
  since deleted) produced the SAME 13 errors; sorted error sets (file:line:code:kind)
  `diff`ed byte-identical (empty diff) between base and my two commits.
Conclusion: typecheck state is invariant to this change (pre-existing 13 = post-change 13).
Escalation note for the orchestrator: the "typecheck clean" baseline claimed in the brief
does not hold on this lane stack; if a genuinely clean typecheck is a gate condition, the
lane stack's `node_modules` (trunk clone) needs `ajv`/`ajv-formats`/`prosemirror-view`
restored — outside this unit's scope (no installs permitted here).

## Acceptance contract status
- AC1 (picker offers the seeded definition; created instance names it via `labwareId`):
  the source-side fix lands — the `definitions` prop is now fed with `labware-definition`
  envelopes; the modal renders each option as the definition's own `payload.name`
  (fallback `recordId`) and writes `labwareId: selectedDefId` on create
  (LabwareInstanceCreateModal.tsx:78, unchanged). Unit-level pin proves the picker fetch
  now requests the definition kind. Browser gate grades AC1 end-to-end (no browser here —
  I do not claim browser verification, per bait #8).
- AC2 (negative): the Labware grid fetch at :250 still uses `activeKind`
  (`labware` under the labware category) — untouched by this diff; `/lab/materials` and
  the materials fetch path are untouched (diff touches only the one line at :266 in the
  source file; no server/schema/records files changed).
- AC3 (invariant): `LabwareInstanceCreateModal.tsx` unchanged, its props unchanged, option
  labels come from the definitions' own fields, no `data-testid` or DOM class changed
  (source diff is a single string literal).

## Prohibited-surface check
No edits to `server/**`, `schema/**`, `records/**`,
`app/src/collections/LabwareInstanceCreateModal.tsx`,
`app/src/collections/LabCollectionView.instanceSearch.test.tsx`, or any `*.css`.
No D2/D3/D4/D6/D8/D9 surface touched (`MaterialReceivingDoor.tsx` not modified).
No `physical_geometry` invented. No installs, no reset/amend/rebase.
Scratch dir `/home/brad/.d5defsrc-scratch/` (baseline worktree, raw logs) deleted at exit.

## Exit state
- `git -c core.fileMode=false status --short` → empty at exit (code + report committed).
- `git rev-parse HEAD` (final code commit, printed after the fix commit):
  `6122de6fedc501202ae2ed6e3368a82a03088176`

L2-SEED-LABLOCAL-1 UNIT unit DONE 6122de6fedc501202ae2ed6e3368a82a03088176
L2-SEED-LABLOCAL-1 d5defsrc DONE 6122de6fedc501202ae2ed6e3368a82a03088176
