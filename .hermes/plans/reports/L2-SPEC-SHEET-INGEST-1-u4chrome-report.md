# L2-SPEC-SHEET-INGEST-1 / unit u4chrome — coder report (lane 2)

- Owner/run: cl-worker lane 2, unit u4chrome, branch `cl/lane2-specsheet-u4chrome-2056`
- Worktree: `/home/brad/cl-wt/wt-SPECSHEET-u4chrome`
- Base: `dd2716814ad6913fc8162f1138251ae7d0faa11a`
- Commits: `3549ce83` test RED pin; `29e16c76` feat chrome

## WHAT CHANGED
- `app/src/collections/LabLabwareNewPage.tsx` (+6/−2 lines): both inputs (`lab-labware-name-input`, `lab-labware-url-input`) gain inline `border: 1px solid var(--cl-border)`, `borderRadius: 6px`, `background: var(--cl-bg-elev)` (house style precedent `LabCollectionView.css:109`); `Propose fields` and `Save labware definition` buttons gain inline `border + borderRadius + background + cursor: pointer`. Existing `padding` kept; flex column/gap layout untouched. No testid, placeholder, copy, disabled predicate, state arm, payload-builder, or line-330 (`key={proposal.specId}`, u6key-owned) change.
- `app/src/collections/LabLabwareNewPage.test.tsx` (+27 lines): ONE new test `renders visible input and button affordance chrome (u4chrome)` asserting `element.style.border` contains `1px solid`, input `style.background` contains `--cl-bg-elev`, button backgrounds non-empty; save button reached with a proposals fixture, same pattern as existing tests.

Budget: 2 files, 31 insertions + 2 deletions = 33 lines (≤ 60).

## RED (raw, on untouched page)
```
 ❯ src/collections/LabLabwareNewPage.test.tsx  (19 tests | 1 failed) 175ms
   ❯ LabLabwareNewPage > renders visible input and button affordance chrome (u4chrome)
     → expected '' to contain '1px solid'
 FAIL  ... LabLabwareNewPage.tsx:72:36
     expect(nameInput.style.border).toContain('1px solid')
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```

## GREEN (raw, after change)
```
 ✓ src/collections/LabLabwareNewPage.test.tsx  (19 tests) 178ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```
(`cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx`)

## MUTATION PROBE (raw)
Styles reverted via `git stash push -- app/src/collections/LabLabwareNewPage.tsx`, test left in place:
```
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
AssertionError: expected '' to contain '1px solid'  (test.tsx:72)
```
Pin is non-vacuous. Styles restored (`git stash pop`) before commit; verified in GREEN run.

## TYPECHECK — DEVIATION FROM BASELINE (environmental)
`cd app && npx tsc --noEmit` → exit 2, 7 lines, ALL `TS2307 Cannot find module` in files NOT owned by this unit:
```
src/editor/taptab/tabNavPlugin.ts(7,33): Cannot find module 'prosemirror-view'
../server/src/schema/SchemaLoader.ts(16,36): Cannot find module 'yaml'
../server/src/ui/UISpecLoader.ts(9,18): Cannot find module 'yaml'
../server/src/validation/AjvValidator.ts(17,21|18,73|19,24): Cannot find module 'ajv.../'ajv-formats'
../server/src/validation/types.ts(8,32): Cannot find module 'ajv'
```
Root cause: this fresh worktree has no `server/node_modules` and app `node_modules` lacks `prosemirror-view`/`yaml`/`ajv` — the known fresh-worktree bootstrap gap (brief forbids installs; no baseline tsc was permitted a second run). Zero errors in either owned file; neither file's import graph changed. Ran exactly ONE tsc per budget; flagging for orchestrator rather than installing.

## VERIFY SUMMARY
- Targeted test: 19 passed (baseline 18 + this unit's 1) ✔
- tsc: deviation reported above (7 module-resolution errors, none in owned files)
- `git -c core.fileMode=false status --short` → clean (report commit follows below)
- `git diff --stat dd271681..HEAD` → exactly 2 files; `git diff dd271681..HEAD -- server schema config | wc -l` → 0 ✔

## BAIT AUDIT
1. No behaviour drift: testids/placeholders/copy/disabled predicates/state arms/payload untouched (diff is style props only).
2. Line 330 `key={proposal.specId}` untouched.
3. No new CSS file, no shared-stylesheet edits — inline styles with `--cl-*` variables.
4. Pin reads `element.style.border/.background`, proven live by mutation probe.
5. Theme-safe: only `var(--cl-border)` / `var(--cl-bg-elev)`, no hardcoded colors.
6. Sibling surfaces (`LabMaterialNewPage.tsx` etc.) not opened.

## REMAINING
- UI acceptance still owed to the independent browser reviewer.
- tsc module-gap flagged above is an orchestrator/lane-bootstrap item, not a code defect.

L2-SPEC-SHEET-INGEST-1 UNIT u4chrome DONE 29e16c76e25da34d85b9cb4d2139972d620cb836
