# L2-DOC-INTAKE-1 u2fix1b Report

## Unit: Make IngestionApi declare its own storage device in temp config fixture

### Baseline (RED)
- `npx vitest run src/api/IngestionApi.test.ts` -> `Tests 3 failed | 3 passed (6)`
  - Sigma leg: 400 at :331 (MISSING_CONFIG, no storage devices)
  - Cayman PDF leg: ENOENT at :190 (pre-existing Cluster 5)
  - Cayman xlsx leg: ENOENT at :404 (pre-existing Cluster 5)

### Change Made
- **File:** `server/src/api/IngestionApi.test.ts`
- Added `writeFile` import from `node:fs/promises`
- Replaced `beforeAll` fixture: instead of pointing `CONFIG_PATH` at a missing config file, now writes a real YAML config with one local-mount storage device into the test's temp dir (`tmp/ingestion-api-test/config.yaml`)
- Device: `id: test-device`, `kind: local-mount`, `default: true`, `mountPath: <testRoot>/store`
- Created `store` directory under testRoot before writing config
- Config file is written AFTER `rm`+`mkdir` (avoids fixture-order trap)

### Post-Fix Test Results
- `npx vitest run src/api/IngestionApi.test.ts` -> `Tests 3 failed | 3 passed (6)`
  - Sigma leg: PASSES :331 (200 OK) but FAILS at :362 — `variants_detected` is undefined
  - Cayman PDF leg: ENOENT (unchanged, pre-existing)
  - Cayman xlsx leg: ENOENT (unchanged, pre-existing)

### BLOCKED Reason
The Sigma leg now creates successfully (200 at :331) — the device declaration works. But the `run` step returns empty metrics because `IngestionWorker.ts` has no extraction branch for `vendor_formulation_html`. It falls through to the else branch at line 451 which returns early with no metrics. This is a product code gap in `IngestionWorker.ts`, which is a PROHIBITED file.

Per brief instructions: "If the Sigma leg still fails, STOP with BLOCKED naming the response payload — do not chase it into product code."

### Files Changed
- `server/src/api/IngestionApi.test.ts` (1 file, +14 lines, -2 lines)

### Commit
- `0d4664fb` — "L2-DOC-INTAKE-1 u2fix1b: declared storage device in IngestionApi test fixture"

### Git Status
- Clean tree at exit

L2-DOC-INTAKE-1-u2fix1b UNIT unit BLOCKED IngestionWorker.ts has no extraction branch for vendor_formulation_html — falls to else fallback at line 451 returning empty metrics, a product code gap in a PROHIBITED file
