# L2-LAB-MATERIAL-CREATE-1 — u1fix1 report

Scope: fix advc-c1 D1 (BLOCKER, missing required `brand`), D2 (false check claim),
D4 (no pin). No YAML, route, shell props, or schema touched.

## Changes
1. `app/src/collections/LabMaterialNewPage.tsx` — `<AppShell>` → `<AppShell brand="Add a material">`.
   One attribute; `AppShellProps.brand` is required (`brand: ReactNode`, AppShell.tsx:55) and was
   not relaxed, not cast, not `undefined`. File is 21 lines (corrects u1's D3 "18 lines").
2. `app/src/collections/LabCollectionView.test.tsx` — new `it` pinning
   `lab-category-new-material`: renders `/lab/materials` under MemoryRouter+Routes+ThemeProvider+
   OpenTabsProvider, asserts the button exists, clicks it, asserts the router lands on
   `/lab/materials/new` (stub `data-testid="material-new-target"`). Mirrors the vendor-pdf pin.
   Unchanged: testid string, `activeCategory === 'materials'` gate, `/lab/materials/new` route,
   `<h2>Add a material</h2>`, vendor-pdf pin (still green, 5/5).
3. This report.

## D2 retraction
The u1 report (docs/unit1-report.md:18) claimed "`tsc --noEmit` → no errors in changed files".
I retract that claim: in this worktree `tsc` aborted at TS2688 (missing `vitest` types) because the
shared `app/node_modules` symlink has 14 dangling package links; the check never ran. Every check
below was actually executed, with raw output. Separately, u1's "vitest not installable" was true at
u1 time but is not a substitute for a typecheck.

## Environment note (disclosed, reverted)
Pre-existing `app/node_modules` is a symlink to a shared install whose `vitest`, `vite`, `jsdom`,
`ajv`, `zod`, ... links point at pnpm hash dirs that no longer exist (`TS2688` baseline). To run the
checks honestly I temporarily created `/home/brad/cl-wt/L2-LABMATCREATE-u1-lane2/node_modules` as a
symlink to the sibling lane-2 worktree's complete pnpm install (same lock versions:
vitest 1.6.1 / @types+node 20.19.41 / jsdom 29.1.1), then deleted it before exit. No dependency was
installed, no package.json/lockfile touched, no other worktree modified. With that symlink removed
the tree is back to its pre-unit state.

## RED (before the fix)
Baseline typecheck at 0eba6d89 (1 error, matches advc D1):
```
$ cd app && ./node_modules/.bin/tsc --noEmit   # bin dangles before env repair; after repair:
src/collections/LabMaterialNewPage.tsx(14,6): error TS2741: Property 'brand' is missing in type '{ children: Element; }' but required in type 'AppShellProps'.
EXIT=2
```
The affordance/routing itself already worked at u1; the only RED available for this seam is the
compile break above, so the new test is a regression pin, proven live by the probes below.
Baseline pin run before the fix: `Tests 4 passed (4)` (no material pin existed).

## Mutation probes (all reverted)
A. brand removed again:
```
src/collections/LabMaterialNewPage.tsx(14,6): error TS2741: Property 'brand' is missing in type '{ children: Element; }' but required in type 'AppShellProps'.
EXIT=2
```
B. pin's gate broken (initialEntries `/lab/materials` → `/lab/protocols`):
```
→ Unable to find an element by: [data-testid="lab-category-new-material"]
 FAIL  src/collections/LabCollectionView.test.tsx > LabCollectionView > shows "+ New material" on the materials category only, routing to the material creation page
      Tests  1 failed | 4 passed (5)
```
C. whole new `it` block removed: summary line `Tests  4 passed (4)` — the pin's absence is visible.
Product files reverted after probes (verified by `git status --short` below).

## VERIFY (final, after restore)
```
$ cd app && ./node_modules/.bin/tsc --noEmit; echo TSC_EXIT=$?
TSC_EXIT=0
```
(0 output lines; TypeScript 5.9.3, `app/node_modules/.bin/tsc`. `npx tsc` picks the same binary.)
```
$ cd app && node_modules/.bin/vitest run src/collections/LabCollectionView.test.tsx
 ✓ src/collections/LabCollectionView.test.tsx  (5 tests) 112ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
(vitest invoked via the sibling install's bin, same version; see environment note.)
```
$ grep -c "lab-category-new-material" app/src/collections/LabCollectionView.tsx
1
$ git -c core.fileMode=false status --short
?? app/node_modules
?? server/node_modules
```
(`?? node_modules` appeared only while the temporary verification symlink existed; deleted before
the final status, which is the two pre-existing lines.)

## Commit
Commit 1: e1849fa517e4d8ce8a09356e035b272064a031d4 — `fix(lab-material-create): u1fix1 AppShell
brand prop + material-create route pin` (2 files, +27/−1).

L2-LAB-MATERIAL-CREATE-1 UNIT u1fix1 DONE e1849fa517e4d8ce8a09356e035b272064a031d4
