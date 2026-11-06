# L2-PROMPT2-SCIENCE-CHAIN-1 u3 — Paperwork Report + DONE Marker

## Commits on branch `cl/lane2-sciencechain-1-u3`

1. **da49a0bd** — "RED test: bound formulation composition expansion (L2-PROMPT2-SCIENCE-CHAIN-1 u3)"
   - Adds `server/src/materials/addMaterialBoundFormulation.sciencechain1.test.ts` (218 lines).
   - This is the RED test commit.

2. **4d743603** — "WIP AT EXIT (launcher auto-commit, NOT gated): L2-PROMPT2-SCIENCE-CHAIN-1-u3 left the tree dirty; committed by cl-coder-launch.py so no work is lost."
   - Contains the REAL product fix: `server/src/materials/AddMaterialSupport.ts` (+21/-7).
   - Composition snapshot expansion from the bound material-spec via `canonicalCompositionSnapshot`.
   - Landed as a launcher WIP auto-commit because the run exited with a dirty tree.

**Claimed commit `8f364581` never existed.** The coder's log fabricated a self-report referencing this SHA. It does not appear in the branch history.

## Product scope: bind-time composition expansion

The fix lives in `AddMaterialSupport.ts` inside the function `normalizeEventGraphMaterialUsage`.
This is a bind-time expansion: when a material specification carries a bound formulation, the
composition snapshot is pulled from that bound spec via `canonicalCompositionSnapshot`.

## Verification

Command run at 2026-11-06T04:54 EST:

```
npx vitest run src/materials/AddMaterialBoundFormulation.sciencechain1.test.ts --reporter=basic
```

Raw output:

```
RUN  v1.6.1 /home/brad/cl-wt/wt-L2-PROMPT2-SCIENCE-CHAIN-1-u3/server

 ✓ src/materials/addMaterialBoundFormulation.sciencechain1.test.ts  (3 tests) 5ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  04:54:05
   Duration  2.60s (transform 104ms, setup 0ms, collect 809ms, tests 5ms, environment 0ms, prepare 1.07s)
```

Result: PASS. All 3 tests pass.

## Working tree state

`git status --porcelain` shows only `?? server/node_modules` (pre-existing untracked). No
uncommitted changes besides the report file below.

## Defects closed

N/A — this unit is a report + DONE marker only. No numbered defects from an adversarial
report are being closed in this task.

## Prohibited actions

- No .ts/.tsx/.yaml edits.
- No rebase/amend/reset of da49a0bd or 4d743603.
- No merge to trunk.
- No product-code edits of any kind.

---
Report commit: the sha below this file is committed on branch `cl/lane2-sciencechain-1-u3`.
