# L2-GC-AIA-PARSER-SHAPE-1 u1shape — AIA/ANDI CDF parser data shapes (D1/D2/D3)

Worktree /home/brad/cl-wt/L2-GC-AIA-PARSER-SHAPE-1-u1-lane2, branch cl/lane2-parsershape-u1-l2t2638,
base 72c48ff82. Item: L2-GC-AIA-PARSER-SHAPE-1-u1shape (k=1 of 1). Lane 2.

## Decisions

- D1: `well` = 1-based peak index as a string ("1".."56"); every row carries `channelId: 'chromatogram'`;
  `timeMin` untouched. No new vocabulary, no schema change.
- D2: assayType derived from the file's own detector declaration, read from `gattrs` (the parser already
  reads all global attributes there — note: in this writer's file `detector_name` arrives via the global
  attribute loop, value "FID1 A, "). Rule: uppercased value starting with 'FID' -> 'gc_fid'; containing
  'MSD' or 'MS ' -> 'gc_ms'; otherwise keep today's 'gc_ms' fallback, made explicit in a comment and
  noted in `metadata['assay_type_source']` ('detector_name' when the attribute is present, an explicit
  'fallback (...)' string when absent).
- D3: `result.trace` carries the f32 `ordinate_values` in file order (the same `trace` var already
  located at the old line 165). `samplingIntervalSeconds` = the already-extracted
  `metadata['sampling_interval_seconds']` (0.05 on this file). Time of point i = i *
  samplingIntervalSeconds; the uniform-grid comment in code cites the file's own evidence:
  72801 points x 0.05 s = 3640.05 s == `actual_run_time_length`. (The file declares no
  `uniform_sampling_flag` variable — verified by independent decode — so the comment cites the span
  equality instead of naming a nonexistent flag.)
- trace.timeUnit = declared retentionUnit ('seconds'), trace.intensityUnit = declared detector_unit
  ('pA') — file-declared, never defaulted, consistent with the parser's existing unit policy.
- exactOptionalPropertyTypes: `trace` is optional on the contract; the parser always emits it because the
  format requires `ordinate_values` (the existing refusal covers its absence). Rows never carry
  `undefined` fields.
- The pre-existing it#2 asserted `assayType === 'gc_ms'` (line 51) — it encoded the D2 bug, so updating
  it to 'gc_fid' is part of the RED edits; its failure is one of the 3 RED failures.
- Fixture ground truth verified by an independent python NetCDF decode before writing assertions
  (never invented): elems=72801, v0=9.713541984558105, v[7872]=252264.203125, v[last]=17.054819107055664,
  min=9.053906440734863, max=252898.8125; detector_name="FID1 A, ", detector_unit="pA",
  actual_sampling_interval=0.05, actual_run_time_length=3640.05.

## RED (commit 0573d482e)

Command (from worktree server/): `timeout 300 npx vitest run src/measurement/parsers/aiaCdfParser.test.ts`

```
 ❯ src/measurement/parsers/aiaCdfParser.test.ts:52:30
     52|     expect(result.assayType).toBe('gc_fid');
- Expected
+ Received
- gc_fid
+ gc_ms

 ❯ src/measurement/parsers/aiaCdfParser.test.ts:79:30
     79|     expect(result.assayType).toBe('gc_fid');
- Expected
+ Received
- gc_fid
+ gc_ms

 ❯ src/measurement/parsers/aiaCdfParser.test.ts:107:29
    107|       expect(row.channelId).toBe('chromatogram');
AssertionError: expected undefined to be 'chromatogram' // Object.is equality

 Test Files  1 failed (1)
      Tests  3 failed | 3 passed (6)
   Start at 09:13:13
   Duration 2.59s (transform 114ms, setup 0ms, collect 1.15s, tests 12ms, environment 0ms, prepare 610ms)
```

Failures map 1:1 to the three defects (D2 at it#2 line 52 and the new it line 79; D1 at line 107;
D3 masked because the D2 assertion in the new it fires first).

## GREEN (commit b82ec765a)

Same command:

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-GC-AIA-PARSER-SHAPE-1-u1-lane2/server

 ✓ src/measurement/parsers/aiaCdfParser.test.ts  (6 tests) 21ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at 09:15:13
   Duration 2.77s (transform 128ms, setup 0ms, collect 1.15s, tests 12ms, environment 0ms, prepare 611ms)
```

## Typecheck

Command: `timeout 300 npm run typecheck -w server` (from worktree root).

On the final code: 6 errors — ALL PRE-EXISTING, in files never touched by this unit:
src/api/handlers/AIHandlers.ts (3x, `.parts` on FastifyRequest), src/api/handlers/AiIngestionHandlers.ts,
src/api/handlers/ExtractProtocolHandler.ts, src/sequences/sequenceRoutes.ts (`.file` on FastifyRequest) —
multipart-typing artifacts of the shared /mnt/vast/home/brad/git/cl-integration-2/server/node_modules
that this worktree symlinks. PROOF OF ZERO DELTA: the identical command run at base 72c48ff82 in a
throwaway worktree (same symlink) produced the SAME 6 errors; line/column-stripped diff of the two error
sets = identical. Zero errors in any changed file (measurement/, parsers/, RunSheetHandlers.ts).
The lane brief's "server baseline is 0" does not hold for this checkout's shared node_modules; the
measured delta introduced by this unit is 0.

## AC map

- D1 rows carry channel + peak index (no RT in `well`): aiaCdfParser.ts:238 (`well = String(p + 1)`),
  :259-260 (`channelId: 'chromatogram'` on both row shapes); asserted in it "emits the 56-peak table
  keyed by peak index on the chromatogram channel (one metric per peak field)" (aiaCdfParser.test.ts:97):
  every one of the 1008 rows has channelId 'chromatogram'; the well set == {"1".."56"} (56 distinct).
- D2 assayType gc_fid: aiaCdfParser.ts:209-221 (derivation + metadata['assay_type_source']);
  types.ts:11, MeasurementService.ts:20, RunSheetHandlers.ts:87 (unions widened); asserted in it "echoes
  the file-declared units (seconds/pA) and the run metadata verbatim" (test line 52:
  `result.assayType` toBe 'gc_fid') and it "derives assayType gc_fid from the file detector and carries
  the full ordinate trace (D2, D3)" (test line 79: assayType + metadata['assay_type_source'] ===
  'detector_name').
- D3 ordinate series of 72,801 values @ 0.05 s, units pA, baseline ~9.8, 6.56-min peak ~252,899:
  types.ts:23-31 (trace contract), aiaCdfParser.ts:195-204 (traceValues collected in file order),
  :277-284 (result.trace emission); asserted in the same it (lines 84-94): trace.values.length === 72801,
  samplingIntervalSeconds ~= 0.05 (toBeCloseTo 4), intensityUnit 'pA', timeUnit 'seconds',
  channelId 'chromatogram', |values[0] - 9.8| < 1 (measured 9.713542), values[7872] > 200000
  (measured 252264.203125 — the 6.56 min = index 7872 sample; series max 252898.8125 is the peak apex,
  matching the acceptance figure ~252,899 pA), last value 17.0548 (near baseline).

## Commit checkpoints

- 0573d482e — RED: aiaCdfParser assertions for u1shape (D1 peak-index rows, D2 gc_fid, D3 trace); 3 failed | 3 passed (6)
- b82ec765a — GREEN: parser + contract fix (D1 well=peak index + channelId, D2 gc_fid + assay_type_source,
  D3 trace carried; types + both payload unions widened); 6 passed (6)
- (this report commit) — report
- (next commit) — DONE marker appended to this report + marker/L2-GC-AIA-PARSER-SHAPE-1-u1shape.done

## Changed files

- server/src/measurement/parsers/aiaCdfParser.ts (D1 rows, D2 derivation, D3 trace emission + interval refusal)
- server/src/measurement/parsers/types.ts (assayType union + optional trace on MeasurementParseResult)
- server/src/measurement/MeasurementService.ts (line 20 union only)
- server/src/api/handlers/RunSheetHandlers.ts (line 87 union only)
- server/src/measurement/parsers/aiaCdfParser.test.ts (RED/GREEN assertions)
- .hermes/reports/L2-GC-AIA-PARSER-SHAPE-1-u1shape-report.md (this report)

## Remaining / owner notes

- 6 pre-existing typecheck errors (shared cl-integration-2 node_modules multipart typing) — environmental,
  delta 0 by proof above; owner: lane infra/orchestrator if a clean baseline is required.
- Row count invariant holds: 1008 rows = 56 peaks x 18 fields (asserted, unchanged).

Re-verified on final tree (report commit ecd2f5615277da3146b19635f162d1063158870f):
`timeout 300 npx vitest run src/measurement/parsers/aiaCdfParser.test.ts` -> Tests 6 passed (6)
(09:17:21, Duration 3.69s).

L2-GC-AIA-PARSER-SHAPE-1-u1shape UNIT unit DONE ecd2f5615277da3146b19635f162d1063158870f
