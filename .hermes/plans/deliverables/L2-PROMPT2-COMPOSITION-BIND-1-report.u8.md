# L2-PROMPT2-COMPOSITION-BIND-1 Unit 8 Report — u7 Close-out

## u7 Close-out

**What u7 landed:** 4 files, +71/-1, commit 06402ad1 (`L2-PROMPT2-COMPOSITION-BIND-1 u7: declaredDomains accessor + ALL-of strip confinement`). Added `declaredDomains()` accessor in `vocabulary.ts` and ALL-of confinement in `mixtureLabelRedundancy.ts:234`.

**Defect 1 — Import path:** `declaredDomains.test.ts:3` imported `'../vocabulary'` which resolves to `server/src/compiler/vocabulary` — a path that does not exist. vitest failed to load the file. Fix: `'../vocabulary'` → `'./vocabulary'` (one-line fix).

**Defect 2 — Vacuous pin:** The `describe('declaredDomains — confinement RED pin')` block's first test called `(domain as any).toLowerCase()` on a local object and asserted a simulation throws. This proved nothing about the real consumer at `mixtureLabelRedundancy.ts:234`. Replaced with two tests that call the real `stripRedundantMixtureLabels()` consumer:
- Leg 1: single domain `['material']` confined in `stripDomains` → material strips
- Leg 2: multi-domain `['material','labware']` not-all-confined → material does NOT strip (ALL-of polarity)

**Defect 3 — Missing report:** The u7 report file was never committed (stale u1fix marker match). New report written at `L2-PROMPT2-COMPOSITION-BIND-1-report.u8.md`.

## u8 Changes

### Files modified (1)
- `server/src/compiler/scientistIntent/declaredDomains.test.ts`: import fix + pin replacement

### Commands and results
- **BASE typecheck:** 0 errors (exit code 1 = grep no match, not typecheck failure)
- **STEP 0 vitest run:** FAILED — "Failed to load url ../vocabulary" (import defect evidence)
- **After import fix vitest run:** PASSED — 5 tests passed
- **After pin replacement vitest run:** PASSED — 5 tests passed
- **Final vitest run (both files):** `2 passed (2), 15 passed (15)`
- **HEAD typecheck:** 0 errors (matches BASE)

### Mutation checks
1. `every(` → `some(` at `mixtureLabelRedundancy.ts:235`: **RED** — the `['material','labware']` leg failed (expected [], got [material]). Reverted.
2. `'./vocabulary'` → `'../vocabulary'`: **RED** — file failed to load again. Reverted.

### Commit
94e7609d — `L2-PROMPT2-COMPOSITION-BIND-1 u8: fix import path + replace vacuous confinement pin with real consumer tests` (1 file changed, +63/-27)

L2-PROMPT2-COMPOSITION-BIND-1-u8 UNIT 8 DONE 94e7609da90bd2de99824ee20bb99f0d5e610ffc
