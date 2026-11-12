# L2-JOURNEY-CAPABILITY-CATALOGUE-1 — unit u2loader-fix1 report

Worktree: /home/brad/cl-wt/L2-JCC-u2loader-lane2 (lane 2)
Branch: cl/lane2-journey-cat-u2loader-1112
Base: 444f4818 (advc c1 VERDICT FIX 2: D1 paperwork marker, D2 determinism test gap). No production change.

## Decisions
- D1: deleted only the malformed `L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2loader UNIT unit DONE d756600e...`
  line (spurious item suffix, `unit` token). The compliant `L2-JOURNEY-CAPABILITY-CATALOGUE-1 UNIT 2 DONE
  d756600e...` line is byte-identical and names d756600e, the commit carrying the report body.
- D2: new leg (f) in `capabilityCatalogue.test.ts`. Leg (d) was filename-order aligned (`alpha.yaml` →
  `journey.alpha`), so readdir order alone reproduced its expected array and a removed sort stayed GREEN.
  (f) crosses names (`zzz.yaml` → `journey.aaa`, `aaa.yaml` → `journey.zzz`), so only the `capability_id`
  sort at `capabilityCatalogue.ts:65` can produce `['journey.aaa','journey.zzz']`.
- `capabilityCatalogue.ts` untouched: `git diff -- .../capabilityCatalogue.ts | wc -c` → 0.

## Baseline (before the leg) — 24 passed
$ cd server && npx vitest run src/compiler/journey
```
 ✓ src/compiler/journey/ports.test.ts  (12 tests)
 ✓ src/compiler/journey/capabilityDescriptor.test.ts  (7 tests)
 ✓ src/compiler/journey/capabilityCatalogue.test.ts  (5 tests)
      Tests  24 passed (24)
```

## GREEN (after the leg) — 25 passed
```
 ✓ src/compiler/journey/ports.test.ts  (12 tests) 25ms
 ✓ src/compiler/journey/capabilityDescriptor.test.ts  (7 tests) 11ms
 ✓ src/compiler/journey/capabilityCatalogue.test.ts  (6 tests) 303ms
 Test Files  3 passed (3)
      Tests  25 passed (25)
```

## Mutation probe (D2 witness): :65 `capabilities.sort(...)` deleted
```
 ❯ src/compiler/journey/capabilityCatalogue.test.ts > capability catalogue admission > (f) orders by capability_id even when filenames invert that order
   → expected [ 'journey.zzz', 'journey.aaa' ] to deeply equal [ 'journey.aaa', 'journey.zzz' ]
 Tests  1 failed | 5 passed (6)
```
Restored :65 byte-identical from a pre-mutation copy; re-run 25 passed; `git diff` on the module → 0 bytes.

## Verify
$ grep -cE 'L2-JOURNEY-CAPABILITY-CATALOGUE-1 UNIT 2 DONE [0-9a-f]{40}' .hermes/plans/reports/L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2loader-report.md → 1
$ grep -c 'UNIT unit' .hermes/plans/reports/L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2loader-report.md → 0
$ cd server && npx tsc --noEmit -p . → TSC_EXIT=0

## Files
- .hermes/plans/reports/L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2loader-report.md (marker line deleted)
- server/src/compiler/journey/capabilityCatalogue.test.ts (leg (f) added)
- .hermes/plans/reports/L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2loader-fix1-report.md (this file)
