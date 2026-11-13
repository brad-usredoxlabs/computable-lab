# L2-LAB-INVENTORY-CREATE-1 — unit g3d6scroll (gate g3 defect D6)

Item: L2-LABINV-CREATE-1 · Lane 2 · worktree /home/brad/cl-wt/L2-LABINV-g3d6scroll-lane2
Branch: cl/lane2-labinv-g3d6scroll-2145 · base 25fb973b5628b3c00b59cb45ec45f8dfa869d0b2 (verified at start)

## Defect (D6, medium, LEG B tall state)
At 1440x900 the receiving door's modal measured height 1056px, top -78px, close top -65px
`inViewport false`; `.lab-modal`, `.lab-modal__body` and `.lab-modal__backdrop` all reported
`overflow-y: visible, max-height: none`. Title/✕ cut off above the fold, footer below it, and
Playwright's click on `.lab-modal__close` failed "element is outside of the viewport". Same at
1280x633 (top -63, height 759). The stylesheet already builds the flex column
(labModalStyles.ts:17-22) but never caps the height or names a scroll region. Both importers
(MaterialReceivingDoor form, LabwareInstanceCreateModal div) read this one authority, so the fix
belongs here and not in either consumer.

## Changed files (vs base 25fb973b — measured per-file numstat: labModalStyles.ts 7 insertions / 1
deletion; labModalStyles.test.ts 73 insertions / 0 deletions, new file vs base — DEFECT 2: the old
"9 insertions, 2 deletions" claim is replaced by the figures recomputed with
`git diff --numstat 25fb973b...HEAD`)
1. app/src/collections/labModalStyles.ts — `.lab-modal` gains
   `max-height: calc(100vh - 48px);` (48px = the backdrop's own 24px top + 24px bottom gutter at
   :15) with the D6 comment; `.lab-modal__body` reflows from one line to three and gains
   `overflow-y: auto; min-height: 0;`. No other rule changed: backdrop still
   `position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
   padding: 24px;`, panel still `display: flex; flex-direction: column; width: min(480px, 96vw);`,
   no `overflow` on `.lab-modal` and none on the backdrop (body is the only scroll container).
   No JS, no import change, no consumer-side `style={{}}`.
2. app/src/collections/labModalStyles.test.ts — NEW pure-logic file (`// @vitest-environment node`)
   that strips CSS comments, splits the template into `selector -> declarations` and asserts:
   panel `max-height` matches `calc(...100vh)` and is not a fixed px/rem/em height; body declares
   `overflow-y: auto` and `min-height: 0`; the set of `overflow-y` declarers is exactly
   `['.lab-modal__body']`; backdrop keeps fixed/inset 0/24px padding and declares no `overflow-y`;
   panel keeps flex column + `min(480px, 96vw)` and declares no `overflow-y`.
   (No `getComputedStyle`/`getBoundingClientRect` — jsdom has no layout engine.)

## Commits (base → HEAD)
- b9f503f2 — test(lab-modal): g3 D6 RED — tall modal must be viewport-capped and scroll in its body
- 13f6e7d922b620d995e3482480992bb700603e87 — fix(lab-modal): cap the dialog at the viewport and scroll the body, not the panel

## VERIFY — raw output

### 1. RED (committed as b9f503f2, before the fix)
Command: `cd app && npx vitest run src/collections/labModalStyles.test.ts`
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-LABINV-g3d6scroll-lane2/app

 ❯ src/collections/labModalStyles.test.ts  (3 tests | 2 failed) 6ms
   ❯ src/collections/labModalStyles.test.ts > labModalStyles g3 D6 tall modal > caps .lab-modal against the viewport, not a fixed pixel height
     → expected undefined not to be undefined
   ❯ src/collections/labModalStyles.test.ts > labModalStyles g3 D6 tall modal > scrolls inside .lab-modal__body only, with the flex shrink allowance
     → expected undefined to be 'auto' // Object.is equality

 FAIL  src/collections/labModalStyles.test.ts > labModalStyles g3 D6 tall modal > caps .lab-modal against the viewport, not a fixed pixel height
AssertionError: expected undefined not to be undefined
 ❯ src/collections/labModalStyles.test.ts:28:17
     27|     const cap = rules['.lab-modal']?.['max-height']
     28|     expect(cap).toBeDefined()
      |                 ^
     29|     expect(cap).toMatch(/calc\(.*100(?:d|s)?vh/)

 FAIL  src/collections/labModalStyles.test.ts > labModalStyles g3 D6 tall modal > scrolls inside .lab-modal__body only, with the flex shrink allowance
AssertionError: expected undefined to be 'auto' // Object.is equality

- Expected: 
"auto"

+ Received: 
undefined

 ❯ src/collections/labModalStyles.test.ts:35:34
     34|     const body = rules['.lab-modal__body']
     35|     expect(body?.['overflow-y']).toBe('auto')
      |                                  ^
     36|     expect(body?.['min-height']).toBe('0')

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```
(Full log: /home/brad/.hermes/receipts/L2-LABINV-g3d6scroll-lane2/red.log — outside git.)

### 2. GREEN (HEAD 13f6e7d9)
Command: `cd app && npx vitest run src/collections/labModalStyles.test.ts`
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-LABINV-g3d6scroll-lane2/app

 ✓ src/collections/labModalStyles.test.ts  (3 tests) 4ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### 3. Mutation probe (raw)
(a) delete `overflow-y: auto;` from `.lab-modal__body`, re-run:
```
 ❯ src/collections/labModalStyles.test.ts  (3 tests | 1 failed) 5ms
   ❯ ... > scrolls inside .lab-modal__body only, with the flex shrink allowance
     → expected undefined to be 'auto' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
(b) additional probe — delete only `min-height: 0;` (keep overflow-y), re-run:
```
 → expected undefined to be '0' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
Both restored; re-run of the file after restore: `Test Files 1 passed (1) / Tests 3 passed (3)`.

### 4. Regression
Command: `cd app && npx vitest run src/collections/MaterialReceivingDoor.test.tsx src/collections/LabwareInstanceCreateModal.test.tsx`
```
 ✓ src/collections/LabwareInstanceCreateModal.test.tsx  (7 tests) 140ms
 ✓ src/collections/MaterialReceivingDoor.test.tsx  (11 tests) 301ms

 Test Files  2 passed (2)
      Tests  18 passed (18)
```
Baseline note: the handoff records "MaterialReceivingDoor 12/12"; the file at base 25fb973b
contains 11 `it(` blocks (`grep -c` = 11) and runs 11/11 with no skips — no test was removed or
filtered by this unit (`git diff` touches neither consumer test). The 12th count predates this base.

### 5. Typecheck (run once; not required by the brief)
Command: `node app/node_modules/typescript/bin/tsc --noEmit -p app` (the `npx tsc` shim in this
environment resolves to the "not the tsc command you are looking for" stub; the installed compiler
was invoked directly). 13 error lines, all pre-existing and all external-module/implicit-any noise
in event-editor/server files (`Cannot find module 'ajv' | 'yaml' | 'ajv-formats'` etc. — those
packages live outside the shared install). **No error names `labModalStyles.ts` or
`labModalStyles.test.ts`** (`grep -E labModalStyles` on the log → no matches).
Log: /home/brad/.hermes/receipts/L2-LABINV-g3d6scroll-lane2/tsc.log

### 6. Tree
`git status --short` → empty at exit (report committed).

## Environment note (not a code change, not committed)
The pre-provisioned `app/node_modules` symlink pointed at
`/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`, which was emptied at 21:27 today
(only `.vite`/`.vite-temp` left) — `vitest` could not resolve `jsdom` or
`@testing-library/jest-dom`. Repointed the ignored symlink to the working shared install
`/home/brad/git/computable-lab/app/node_modules` (vitest 1.6.1, jsdom + testing-library present),
the same target other lane worktrees created today already use. No install, no package.json change.

## Acceptance (browser gate, not graded here)
AC1/AC2/AC3 are for the gate: the cap is viewport-relative (`calc(100vh - 48px)`), so the panel can
never exceed the 24px-gutter backdrop at 1440x900 or 1280x633; only the body scrolls, so the header
and ✕ stay pinned at the top and the footer is reached by scrolling inside the body; a short modal
is content-sized (no height is fixed) and the backdrop's fixed/inert/flex behaviour and both
importers' markup are untouched. This unit ran no browser lane (none assigned) — the independent
browser reviewer owns AC acceptance.

## FIX-1 (advc c1 DEFECT 1 + 2 + 3) — unit L2-LABINV-g3d6scroll-fix1
DEFECT 1 (MAJOR): the g3 D6 pin measured GREEN against both spec-named regressions. The scroller set
was built from the `overflow-y` longhand key ONLY, so a shorthand `overflow: auto;` on
`.lab-modal`/`.lab-modal__backdrop` slipped through. Test file strengthened (production
labModalStyles.ts UNTOUCHED — byte-identical to 3927fd04, verified with cmp): the scroller filter now
counts any of `overflow`/`overflow-x`/`overflow-y` whose value matches /auto|scroll/, still expecting
`['.lab-modal__body']`; the backdrop and panel legs require no auto/scroll overflow on any of the
three keys (an explicit `hidden`/`visible` declaration stays legal — not over-tightened to
"undefined"); a new test pins the `height` key off the panel (REVIEWER BAIT `height: 900px`;
`max-height: 1056px` is already pinned in test 1). Test file 56 → 73 lines (20 insertions, 3 deletions).
Raw outputs (command `cd app && npx vitest run src/collections/labModalStyles.test.ts`):
[1] unmutated shipped CSS: `✓ (4 tests) 2ms / Test Files 1 passed (1) / Tests 4 passed (4)`
[2] Mutation A — `overflow: auto;` added to `.lab-modal` → FAILED (2 tests):
```
 ❯ src/collections/labModalStyles.test.ts  (4 tests | 2 failed) 8ms
   ❯ ... > scrolls inside .lab-modal__body only, with the flex shrink allowance
     → expected [ '.lab-modal', '.lab-modal__body' ] to deeply equal [ '.lab-modal__body' ]
   ❯ ... > keeps the g1 D1 backdrop behaviour and the pinned panel flex shell
     → expected true to be false // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```
[3] Mutation B — `height: 900px;` added to `.lab-modal` → FAILED (1 test):
```
 ❯ src/collections/labModalStyles.test.ts  (4 tests | 1 failed) 8ms
   ❯ ... > declares no fixed pixel height on the panel
     → expected true to be false // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```
[4] Mutation C — `overflow: hidden;` on `.lab-modal__backdrop` → GREEN `Tests 4 passed (4)` — not
over-tightened (hidden is a legal non-scroller per the /auto|scroll/ rule).
Each mutation reverted with `git checkout -- app/src/collections/labModalStyles.ts`; final re-run on
the shipped CSS: GREEN 4/4; typecheck unchanged (13 pre-existing errors, none naming labModalStyles;
log fix1-tsc.log). Full raw logs: /home/brad/.hermes/receipts/L2-LABINV-g3d6scroll-lane2/
fix1-{baseline2,mutA,mutB,mutC,final}.log (outside git).
DEFECT 2: the line-16 numstat claim is replaced with the measured per-file figures (see above).
DEFECT 3: exactly one DONE marker line remains, naming the report-body commit (see below).

L2-LAB-INVENTORY-CREATE-1 UNIT DONE 13f6e7d922b620d995e3482480992bb700603e87
L2-LAB-INVENTORY-CREATE-1 UNIT unit DONE 13f6e7d922b620d995e3482480992bb700603e87
