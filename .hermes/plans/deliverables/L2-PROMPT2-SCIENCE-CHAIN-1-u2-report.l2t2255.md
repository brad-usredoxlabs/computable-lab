# L2-PROMPT2-SCIENCE-CHAIN-1-u2 Report

## Task
Derive a denominator-stated share of mixture in `syncDerivedMaterials` from ledger facts the well already holds (carrier volume / well total), formatted once by a new data-reading `mixtureShareFormat.ts`, so the tooltip's volume column stops reading `—`.

## Decisions
- Created `mixtureShareFormat.ts` as a pure-logic module: reads `displayRoundingFactor` from `composition-fraction-convention.yaml`, parses PER call (never cached), computes decimals via `Math.round(Math.log10(factor))`.
- `formatVolume` is injected into `formatMixtureShare` — no volume grammar duplicated, no cycle with `eventGraph.ts`.
- `isFormulationCarrierRow` predicate checks all five structural conditions: `volumeIsCarrier`, `materialSpecRef` present, `fractionOfMixture` absent, role === `carrierSnapshotRole` from DATA, `concentrationUnit` undefined.
- `deriveMaterialEntry` accepts optional `derivedFractionOfMixture` parameter; explicit source wins via `component.fractionOfMixture ?? derivedFractionOfMixture`.
- When neither explicit nor derived fraction exists, `fractionOfMixture` key is ABSENT (not undefined).

## Changed Files
1. `app/src/graph/lib/mixtureShareFormat.ts` (NEW) — `loadMixtureShareConvention()`, `formatMixtureShare()`
2. `app/src/graph/lib/eventGraph.ts` — imports, `isFormulationCarrierRow()`, modified `deriveMaterialEntry()` and `syncDerivedMaterials()`
3. `app/src/graph/lib/eventGraph.mixtureShare.test.ts` (NEW) — 12 tests (6 format + 6 derivation pins C-1..C-6)

## Verification
- `cd app && npx vitest run src/graph/lib/eventGraph.mixtureShare.test.ts` → 12 passed, 0 failed
- `cd app && npx vitest run src/graph/lib/eventGraph` → 4 files / 29 tests passed, 0 failed (17 baseline + 12 new)
- `cd app && npx tsc --noEmit -p tsconfig.json` → 10 errors (same 10 pre-existing, no new ones)
- Hardcode boundary: `grep -nEi 'clofibrate|dmso|dmem|trypsin|fbs|hepg2'` on new files → no output
- `git -c core.fileMode=false status --short` → clean tree

## Exit
L2-PROMPT2-SCIENCE-CHAIN-1-u2 UNIT 2 DONE 9760d535b0e6f292c9f6f2e1a45c8bbd972449f1
