# L2-GC-TRACE-PERSIST-1 / u1persist — DONE report

- lane 2 · branch cl/lane2-gctrace-1-1116 · base aa6438839 · item L2-GC-AIA-CDF-PARSER-1
- gate: GC-BUNDLE r3 defect D3 (receipts /home/brad/.hermes/cl/lanes/2/receipts/GC-BUNDLE-r3-20261116T132601Z)
- date 2026-11-16 (EST)

## Problem (D3)
The AIA-CDF parser produces the ordinate series (`result.trace`), but
`MeasurementParserValidationService.validate` dropped trace from its return,
`MeasurementService.ingest` persisted only parserInfo.units/metadata, and
`schema/lab/measurement.schema.yaml` parserInfo had `additionalProperties: false`
with no trace field. Consequence: a persisted trace without a schema field would
fail Ajv at store.create (default validate=true), so no chromatogram trace could
ever persist for the GC render path.

## Decisions
- Trace truth = the parser-declared series, persisted VERBATIM under
  `parserInfo.trace = { values: number[], samplingIntervalSeconds: number }` —
  the record IS the single trace authority. No re-parse at render, no second copy
  of the sampling interval (validate echoes a SUMMARY: channelId, points,
  samplingIntervalSeconds — exactly one interval field in that output).
- Same conditional-omission style as u0parserinfo's units/metadata: parser
  declares no trace → key absent entirely (never undefined, never `[]`).
- App reader `traceFromMeasurement(record, run)` appended to
  app/src/analysis/traceModel.ts (smallest consumer extension, no new service,
  no runner branch): values verbatim; axis = the record's declared uniform grid
  (point i at i·interval — an axis, not new data); units from the record's
  declared parserInfo.units (omitted when the record declares none — module
  still carries ZERO unit literals; the existing grep pin passes). Malformed or
  absent trace → NAMED `NO_TRACE` refusal (never an invented blank grid).
- Schema addition kept `additionalProperties: false` (closed object) so a
  malformed trace cannot slip through.

## Changed files (6 code + this report)
- server/src/measurement/MeasurementService.ts — persist parserInfo.trace
  (+ payload type), conditional on `parsed.trace !== undefined`.
- server/src/measurement/MeasurementParserValidationService.ts — validate
  echoes the trace summary (same single source as ingest).
- schema/lab/measurement.schema.yaml — parserInfo.trace: values (array of
  number, minItems 1) + samplingIntervalSeconds (number > 0); optional.
- server/src/measurement/MeasurementService.tracePersist.test.ts — new:
  RED→GREEN ingest cases on the REAL schema tree (AC1 persisted trace +
  in-test Ajv validation via store round-trip; AC2 units/metadata verbatim;
  AC4 no-trace parser → field absent; D3e validate echo, interval
  byte-identical to the parser's own float32 value).
- app/src/analysis/traceModel.ts — traceFromMeasurement +
  MeasurementRecordShape (record envelope).
- app/src/analysis/measurementTrace.test.ts — new: maps the record shape
  (values verbatim, axis length == values length; units verbatim/omitted);
  no-trace → NO_TRACE; malformed (missing interval, empty values) → NO_TRACE.

Commits (newest last): d0ea61122 RED tests · 914069072 schema+server ·
b857aa0f8 app reader+test · 5c5fe340a test type fix (intentionally-malformed
input cast) · + this report.

## Verification (exact commands, real output)
Run from the worktree root unless noted. (The worktree had no node_modules at
start; `pnpm install --frozen-lockfile` first. Vitest workspace quirk: the
root-level `--root .` invocation is polluted by path-filter artifacts
(server project matching app files + cwd-relative pin fails); the faithful
per-project runs below are the ones that measure real results.)

RED baselines (tests written first, watched fail):
- server/src cwd: `npx vitest run src/measurement/MeasurementService.tracePersist.test.ts --root . --hookTimeout=120000`
  → 2 failed (AC1 `parserInfo.trace must be persisted … expected undefined`,
  D3e `validate output must echo the trace summary … undefined`), 2 passed.
- app/src cwd: `npx vitest run src/analysis/measurementTrace.test.ts --root .`
  → 3 failed: `traceFromMeasurement is not a function`.

Final (all on final commit):
- app/src cwd: `npx vitest run src/analysis/ --root .`
  → Test Files 27 passed (27) · Tests 394 passed (394) (baseline was
  26 files / 391 tests green — stays green + 3 new green).
- server/src cwd: `npx vitest run src/measurement/ --root . --hookTimeout=120000`
  → Test Files 11 passed | 3 failed (14) · Tests 59 passed | 4 failed (63).
  NEW file: MeasurementService.tracePersist.test.ts 4/4 PASSED (RED→GREEN).
  The 4 failures (MeasurementService.test.ts, MeasurementParserValidationService.test.ts,
  MeasurementActiveControlService.test.ts) boot on the SHARED default
  ~/.computable-lab store (~54 measurements accumulated across lanes) and fail
  on MSR-id / zero-state assertions. PROVEN PRE-EXISTING: identical 4 failures
  with my test files moved out (run 2026-11-16, unmodified base code); my new
  test uses an isolated /tmp dataDir + CONFIG_PATH and does not touch the
  shared store.
- typecheck (worktree root, timeout 240): `npm run typecheck` → server tsc
  fails with 6 errors, ALL in files this diff never touches
  (AIHandlers.ts ×3, AiIngestionHandlers.ts, ExtractProtocolHandler.ts,
  sequenceRoutes.ts — pre-existing noise proven at base by u4fixture);
  0 new server errors. App tsc (app/ `npx tsc --noEmit`): 4 errors, ALL in
  untouched files (SchemaRecordForm.tsx ×3, RefCombobox.ontologyref.test.tsx);
  0 errors in my files after the 5c5fe340a test fix.
- eslint: no eslint config exists in this worktree (pre-existing state);
  documented verify commands are vitest + typecheck only.

## Acceptance mapping
1. ingest record carries parserInfo.trace = {values, samplingIntervalSeconds}
   and Ajv-validates against measurement.schema.yaml → AC1 test (in-test
   validation is the store round-trip on the real schema tree; the store
   validates by default, so a schema-missing field would reject the record).
2. units/metadata ride verbatim (u0parserinfo no-regression) → AC2 test on the
   same record.
3. app test maps record trace → traceModel shape; axis length == values
   length (interval-derived); no unit values invented (grep pin green).
4. parser declares no trace → parserInfo.trace absent entirely → AC4 test
   (`'trace' in parserInfo === false`; generic_csv parser declares none).

## Next actions / blockers
- None for D3. Residual pre-existing issues (NOT this unit's scope): shared
  ~/.computable-lab store contamination of the 3 legacy measurement suites;
  pre-existing server/app tsc noise in untouched files.
- Browser acceptance of the actual GC render (the journey's render proof)
  remains with the independent browser reviewer; this unit proved the record
  shape + consumer mapping.

L2-GC-AIA-CDF-PARSER-1-u1trace UNIT u1persist DONE __REPORT_SHA__
