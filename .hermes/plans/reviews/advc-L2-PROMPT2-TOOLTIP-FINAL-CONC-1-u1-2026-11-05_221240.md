# Adversarial review — L2-PROMPT2-TOOLTIP-FINAL-CONC-1 (units 1+2, accumulated)

Reviewer: cl-adversarial-reviewer (deepseek/deepseek-v4.1-flash). READ-ONLY: no candidate file edited/committed.
Date: 2026-11-05 22:12 EST

- Candidate worktree: /home/brad/cl-wt/wt-L2-PROMPT2-TOOLTIP-FINAL-CONC-1-u1
- Branch: cl/lane2-tooltip-final-conc-1-u1
- Graded HEAD: accbc584454da4325c1946b3c4b6a1622a299e94 (== dispatch candidate)
- Base for diff: 542390e3 (trunk tip at dispatch; `git cat-file -t 542390e3` => commit)
- Diff command: `git -c core.fileMode=false diff 542390e3...HEAD -- app config`

## Spec
NO approved spec file exists on disk for this item. `grep -rln 'TOOLTIP-FINAL-CONC|minDisplayMagnitude|3.268'` over both the lane
worktree `.hermes/` and the umbrella `/mnt/vast/home/brad/git/cl-integration-2/.hermes/` finds only the coder report, the diff
artifacts, and tick handoffs — no `-spec.md`. The item was dispatched from an orchestrator brief ("architect D-1, was todo",
handoff 2026-11-05_2120-lane2-tick-l2t2115.md); the brief itself is not on disk here.
Therefore the acceptance criteria used below are the five criteria enumerated verbatim in the task, plus the item CLAIM.
Flagged so the orchestrator knows the review is graded against the task checklist, not a spec I could not read.

## Files in the diff (all read)
```
app/src/event-editor/focus/WellTooltip.tsx         |   6 +-
app/src/graph/lib/mixtureShareFormat.test.ts       | 158 ++++
app/src/graph/lib/mixtureShareFormat.ts            | 178 ++++
config/drafting/composition-fraction-convention.yaml | 22 +++
(.hermes/plans/L2-PROMPT2-TOOLTIP-FINAL-CONC-1-u1-report.md — the coder report, also in the diff range)
```
No file outside the enumerated scope. `git status --porcelain` => only `?? app/node_modules` (pre-existing untracked symlink).

## Commands run (real output quoted)

### Targeted tests
`cd app && npx vitest run src/graph/lib/mixtureShareFormat.test.ts`
```
 ✓ src/graph/lib/mixtureShareFormat.test.ts  (17 tests) 9ms
 Test Files  1 passed (1)
      Tests  17 passed (17)
```
stderr captured (proves the warn actually fires):
```
[concentration-display-off] section 'concentrationDisplay' absent in config/drafting/composition-fraction-convention.yaml — concentration display ladder unavailable.
[concentration-display-off] convention data home (config/drafting/composition-fraction-convention.yaml) is empty — concentration display ladder unavailable.
```

### Regression surfaces
`cd app && npx vitest run src/event-editor/focus/WellTooltip.test.tsx src/graph/labware/WellTooltip.test.tsx src/graph/lib/eventGraph.mixtureShare.test.ts`
```
 ✓ src/graph/lib/eventGraph.mixtureShare.test.ts  (14 tests) 48ms
 ✓ src/event-editor/focus/WellTooltip.test.tsx  (3 tests) 79ms
 ✓ src/graph/labware/WellTooltip.test.tsx  (3 tests) 85ms
 Test Files  3 passed (3)   Tests  20 passed (20)
```

### Typecheck (app; `npm run typecheck -w app` == `tsc --noEmit`)
`cd app && npx tsc --noEmit` → EXIT=2, 13 errors, ALL in unrelated pre-existing modules:
Viewer.tsx:65, ViewerToolbar.tsx:55, IngestionUploadModal.tsx:232, ExtractionProgressPanel.test.tsx:9,
EventEditorContext.tsx:1525 (`equipments`), LawnSurface.moveAcross.test.tsx:47, PreviewActionBar.test.tsx:115,
editorHistory.test.ts:176/199, LabwareFocus.instrument.test.tsx:47.
`grep -nE 'mixtureShareFormat|WellTooltip' /tmp/tsc-app-head.txt` → exit 1 (no match).
=> ZERO typecheck errors in any diff-touched file. (server typecheck not runnable in this worktree: no `server/node_modules`;
diff is app-only.)

## Criterion-by-criterion

### 1. Hard-boundary (no unit/magnitude/digit literals in production TS) — PASS
`grep -nE "'(uM|mM|nM|pM|fM|M|g/L|mg/mL|ug/mL|ng/mL)'|..." app/src/graph/lib/mixtureShareFormat.ts` → exit 1 (no match).
Dump of every string literal and number in the production file: the only numbers are `<= 0` / `=== 0` guards and the
PRE-EXISTING `*100` / `log10(10)` in `formatMixtureShare` (lines 243-244, not part of this item). Every ladder factor comes
from YAML via `rung.perBase / declaredRung.perBase`. No schema-name branching, no inline business rule. Hard boundary holds.
(The test file necessarily carries the expected strings '3.268 uM' etc.; those are assertions, not production logic.)

### 2. Load discipline — CODE PASS, TEST PIN GAP (see Defect 2)
`loadConcentrationDisplayConvention` (mixtureShareFormat.ts:73-148): empty text → one `console.warn` naming
`config/drafting/composition-fraction-convention.yaml`, returns undefined (:77-80); parse-null → same warn (:87-90);
absent section → one warn naming the section + path (:96-99); malformed → `throw new Error(... (path) ...)` at every arm
(:85, :92, :101, :107, :112, :117, :123, :126, :131, :136, :140). Formatter receives `undefined` and delegates to
`formatComputedConcentration` (:175-177). Verified behaviourally — the captured stderr above shows the warn text with the
path. Malformed-throw is asserted (`toThrow('significantDigits')` :46, `toThrow('perBase')` :58).

### 3. Ladder semantics — PASS
Value-preserving by construction: `displayedValue = declaredValue * (selectedRung.perBase / declaredRung.perBase)` (:211);
selection walks rungs most-significant-first and stops at the first with `convertedMagnitude >= minDisplayMagnitude` (:202-208),
defaulting to the smallest rung when none qualifies (:201). For `{value:0.003268, unit:'mM'}`: M→0.000003268, mM→0.003268
(both <1), uM→3.268 (≥1) ⇒ selected uM, displayed 3.268 ⇒ "3.268 uM". Asserted with the exact expected string:
`expect(result).toBe('3.268 uM')` (mixtureShareFormat.test.ts:101). mass_per_volume case likewise exact (:156).
`toPrecision(significantDigits)` + trailing-zero strip; exponential guard falls back (:224-226). YAML rungs are ordered
most-significant-first and perBase is monotone-increasing (molar 1/1e3/1e6/1e9/1e12/1e15; g/L,. mg/mL share base 1 with
ug/mL 1e3, ng/mL 1e6 — physically correct: 1 g/L == 1 mg/mL).

### 4. No regression in WellTooltip — PASS (with Defect 1 caveat on coverage)
Diff hunk is only the `conc` derivation at WellTooltip.tsx:83; the `concentrationUnknown` short-circuit
(`formatLadderedConcentration` :167 returns 'unknown' — byte-identical to `formatComputedConcentration(unknown=true)`) and the
SH-QA-4 carrier branch (:86-114) are untouched. All three regression suites pass (20/20). `formatComputedConcentration`'s
delegation remains for null/zero/non-finite/unknown-unit/no-convention paths, so every non-ladder case is byte-identical.

### 5. Do the 17 tests assert behaviour? — MOSTLY YES, TWO GAP (Defect 2)
15/17 assert real observable behaviour (parse shapes, four exact conversion strings incl. the core pin, clamp, delegation on
null/undefined/zero/foreign-unit). 2/17 have a name that claims a `console.warn` but contain NO spy/mock:
`grep -n 'spyOn|console|warn|toHaveBeenCalled' test` returns only the test NAME at line 22.

### Item CLAIM — verified at helper level only (see Defect 1)
"0.003268 mM must render 3.268 uM" is genuinely asserted as `toBe('3.268 uM')`; zero unit/magnitude/digit literals in the
production module. But no test exercises a ladder-changing value through the WellTooltip component (see Defect 1).

## Defects

1. [MAJOR] app/src/event-editor/focus/WellTooltip.tsx:83 — the item's headline behaviour (the tooltip CELL re-expressing
   0.003268 mM → 3.268 uM) is NOT exercised by any test. The only ladder tests are unit-level on the pure function
   (mixtureShareFormat.test.ts); the sole WellTooltip fixtures use `{value:1, unit:'mM'}` (WellTooltip.test.tsx:39,
   graph/labware/WellTooltip.test.tsx:40) which renders "1 mM" under BOTH the old `formatComputedConcentration` and the new
   `formatLadderedConcentration`, and `cells/uL` which is delegated. `grep -rn '3.268|0.003268' app/src` returns hits only in
   mixtureShareFormat.test.ts. Consequence: reverting line 83 to `formatComputedConcentration(m.concentration, m.concentrationUnknown)`
   leaves the entire named suite green — the acceptance criterion "acceptance criteria the diff does not actually exercise".
   Remedy direction (not a patch): add a WellTooltip render leg whose fixture carries a ladder-crossing value (e.g. a material
   concentration of 0.003268 mM) and assert the `.well-tooltip__material-conc` textContent is "3.268 uM".

2. [MINOR] app/src/graph/lib/mixtureShareFormat.test.ts:22-32 (and :34-37) — tests named "returns undefined with a console.warn
   when the section is absent" / empty-text assert only `not.toThrow()` + `toBeUndefined()`; both warnings the load-discipline
   criterion names ("ONE console.warn naming the path") are unasserted (no `vi.spyOn(console,'warn')`, no call-count/spy check
   anywhere in the file). Remedy direction: spy on `console.warn`, assert exactly one call and that its argument contains the
   convention path, for both the empty-text and absent-section arms.

3. [OBSERVATION, not counted as a defect — scope was enumerated by the orchestrator] A second LIVE well tooltip exists:
   app/src/graph/labware/WellTooltip.tsx:112 (used by graph/labware/DualLabwarePane.tsx:678) still renders the raw computed
   concentration via `formatComputedConcentration(m.concentration, m.concentrationUnknown) || 'no concentration'`. The same
   well viewed through the dual-labware pane will NOT re-express 0.003268 mM → 3.268 uM. The task's "Files touched" listed only
   the event-editor focus tooltip, so this is out of the graded scope — but if the D-1 criterion is surface-general, the fix is
   incomplete on that surface. Flag for the orchestrator's browser gate (and decide there whether focus/WellTooltip is the
   surface the D-1 recon observed).

## Verdict

FIX — 1 major (unwitnessed component-level acceptance behaviour), 1 minor (warn claims unasserted); 1 out-of-scope observation.
