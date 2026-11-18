# L2-LAB-INVENTORY-CREATE-1 — unit savecontrast (1 of 1)

- worktree: /home/brad/cl-wt/L2-LABINV-savecontrast-lane2
- branch: cl/lane2-labinv-savecontrast-0624
- base: 42f07ee9163872f2a37e5c639b56e3f3e85f393d
- commits: 338f876e (RED test), e9ba4b6c (GREEN rule)

## Defect
`.lab-modal__save` (shared primary CTA: Stage draft / Accept in MaterialReceivingDoor and
LabwareInstanceCreateModal) declares `background: var(--cl-accent); color: var(--cl-on-accent)`
at specificity 0,1,0. `app/src/shared/shell/AppShell.css:53-56` declares
`.cl-app button { font: inherit; color: inherit }` at 0,1,1, which wins the cascade, so the CTA
label rendered `inherit` (#1f2328) on #0969da — 3.04:1, below the 4.5:1 AA threshold for normal
text. The declared token would have been 5.19:1.

## Change (2 files, +? lines; no prohibited file touched)
1. `app/src/collections/labModalStyles.test.ts` (commit 338f876e, RED)
   - Imports `readFileSync` (node:fs), `dirname`/`resolve` (node:path), `fileURLToPath`
     (node:url) — the file already runs `// @vitest-environment node`.
   - Reads `app/src/shared/shell/AppShell.css` from disk (path resolved from `import.meta.url`,
     so it does not depend on cwd), parses it with the file's existing `parseRules`.
   - Local `specificity(selector)` (ids, classes/attributes/pseudo-classes, elements/
     pseudo-elements) and `outranks(left, right)`; no dependency added.
   - New test: asserts the AppShell `.cl-app button` rule declares `color: inherit`; collects
     every selector in `labModalStyles` that targets `.lab-modal__save` and declares `color`;
     picks the highest-specificity one; asserts it strictly out-specifies `.cl-app button` and
     that its `color` is `var(--cl-on-accent)`. The failure message prints both weights.
   - The four pre-existing tests (tall-modal cap, body scroll, backdrop/panel pin, no fixed
     height) are unmodified and stay GREEN.
2. `app/src/collections/labModalStyles.ts` (commit e9ba4b6c, GREEN)
   - ONE added rule adjacent to the existing `__save` block:
     `.cl-app .lab-modal__save { color: var(--cl-on-accent); }` (0,2,0 > 0,1,1).
   - Existing `.lab-modal__save` block, `:disabled`, cancel, backdrop, panel, body unchanged;
     no token edited; no `!important`.

## Specificity arithmetic (reviewer bait)
- `.cl-app button` = 0 ids, 1 class, 1 element = (0,1,1)
- `.lab-modal__save` = (0,1,0) — loses; that was the defect.
- `.cl-app .lab-modal__save` = 2 classes = (0,2,0) — wins. Not `!important`, not a duplicated
  declaration block, and AppShell's generic reset is untouched (it is the shell contract).

## CSS-in-TS string trap
The added rule is plain text inside the existing template literal: no backtick, no `${`.
The module still compiles (`tsc --noEmit` reports no error in either owned file) and both
importers (MaterialReceivingDoor, LabwareInstanceCreateModal) continue to consume one string.

## Verification (raw)
RED (before the rule), `cd app && npx vitest run src/collections/labModalStyles.test.ts`:

    ❯ src/collections/labModalStyles.test.ts  (5 tests | 1 failed) 8ms
      → .lab-modal__save 0,1,0 must strictly out-specify .cl-app button 0,1,1: expected false to be true
    Test Files  1 failed (1)
         Tests  1 failed | 4 passed (5)

GREEN (after the rule):

    ✓ src/collections/labModalStyles.test.ts  (5 tests) 3ms
    Test Files  1 passed (1)
         Tests  5 passed (5)

Mutation probe — exact mutation applied: deleted the single line
`.cl-app .lab-modal__save { color: var(--cl-on-accent); }` from `labModalStyles.ts`
(its explanatory comment left in place; it contributes no specificity), ran the same command,
then restored the line. RAW:

    ❯ src/collections/labModalStyles.test.ts  (5 tests | 1 failed) 11ms
      → .lab-modal__save 0,1,0 must strictly out-specify .cl-app button 0,1,1: expected false to be true // Object.is equality
    AssertionError: .lab-modal__save 0,1,0 must strictly out-specify .cl-app button 0,1,1: expected false to be true
    Test Files  1 failed (1)
         Tests  1 failed | 4 passed (5)

So the pin is not vacuous: with the rule removed the winner falls back to the 0,1,0
`.lab-modal__save` block, and no second rule supplies the colour.

Typecheck: `cd app && npx tsc --noEmit` → 13 errors, all pre-existing `Cannot find module` in
`../server/**` (ajv/yaml not installed in this worktree). Verified identical at baseline with the
changes stashed (13 errors), and zero errors mention `labModalStyles`. No signature changed.

Tree: `git -c core.fileMode=false status --short` → clean after the report commit.

## Acceptance notes (browser gate)
- AC1 expects computed `color: rgb(255,255,255)` on `[data-testid=material-receiving-submit]`,
  `[data-testid=material-receiving-accept]`, `[data-testid=labware-instance-create-submit]`
  against `rgb(9,105,218)`. The new rule has higher specificity than the shell reset for any
  element carrying `.lab-modal__save`; those three CTAs use that class.
- AC2 (negative): `.lab-modal__cancel` is untouched and still resolves `--cl-text`; no
  `.cl-app button` outside a lab modal changes, and `AppShell.css` is byte-identical.
- AC3: max-height/body-scroll rules unchanged; the four original tests are GREEN and unmodified.
- Lane stack reload is required before the browser gate re-measures (styles are bundled).

## Rollback
Revert e9ba4b6c (rule) or both commits; nothing outside the two owned files depends on them.

Code commits: 338f876e8ade1acc304edcfa34a06d1358b7780a (RED test),
e9ba4b6c0afede0b81b4c850743d2a2e9a24c2ee (GREEN rule). The commit that adds this report contains
documentation only.

L2-LAB-INVENTORY-CREATE-1 UNIT savecontrast DONE e9ba4b6c0afede0b81b4c850743d2a2e9a24c2ee
