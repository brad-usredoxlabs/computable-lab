# L2-GC-AIA-CDF-PARSER-1 u2bind — unit report (lane 2)

- item: L2-GC-AIA-CDF-PARSER-1-u2bind (k=2 of n=2; u1 parser merged at a7ed3622e)
- worktree: /home/brad/cl-wt/L2-GC-AIA-CDF-PARSER-1-u2bind-lane2
- branch: cl/lane2-gc-aia-cdf-u2bind-2030
- base: 2ebd6b8370cae08fa7823069ec926d7b2372ac8c
- commits (this unit):
  - b5e8082e7 `u2bind RED: aia ingest end-to-end test`
  - 2bcef899c `u2bind fix: git arm of rawFileResolver keeps binary raw files byte-exact`
  - report commit: 4fa1f2d626c93cb11efc9f728aa65802b5b8876c
  - marker commit: appends the DONE line below; its message carries `L2-GC-AIA-CDF-PARSER-1 u2bind DONE <report-sha>`

## What this unit does

Wires the merged AIA/ANDI .cdf parser into the measurement ingest seam.
`POST /api/measurements/ingest` (service `ingest`) with `parserId: 'aia_andi_cdf'`
and `rawData.path` at the committed binary fixture
(`records/inbox/aia-andi-sample.cdf`, seeded byte-exact from
`src/measurement/parsers/fixtures/aia_andi_sample.cdf` into the records git worktree —
the GIT arm of the seam) now produces a stored record carrying:
- `assayType: 'gc_fid'` (derived by the parser from the file's own `detector_name`),
- `parserInfo.parserId 'aia_andi_cdf'`, `parserInfo.parserVersion '1.0.0'`,
- the instrument's OWN 56-peak table in `payload.data` — 1008 rows (56 peaks × 18
  metric fields), well = 1-based peak index, `channelId 'chromatogram'`, metric keys
  preserved (`peak_retention_time`, `peak_area`, `peak_height`, `peak_area_percent`, ...),
- the sampled trace: full 72801-point ordinate series on `parserInfo.trace`
  (`samplingIntervalSeconds ≈ 0.05`),
- the file's DECLARED units echoed, not defaulted: `parserInfo.units { time: 'seconds',
  intensity: 'pA' }`, `metadata.retention_unit 'seconds'`, `metadata.detector_unit 'pA'`,
  `metadata.sample_name 'RESTEK 35077'`, and `metadata.time_axis` stating the
  seconds → minutes transcription (`timeMin = value/60` on every row, unit 'seconds'
  left on the row — never silently relabelled).

## Root cause found and fixed (the seam repair this unit was scoped for)

The brief's NOTE was right: the GIT arm mangled binary bytes. `resolveRawFile`'s git
arm returned `ctx.repoAdapter.getFile(path).content`, and ALL THREE adapters
(LocalRepoAdapter, GitRepoAdapter, EmbeddedGitRepoAdapter) read files with
`readFile(path, 'utf-8')`. Binary .cdf bytes with invalid UTF-8 sequences became
`U+FFFD` replacement chars — lossy and unrecoverable. The parser then refused the
mangled structure with the byte-arithmetic proof (RED baseline below:
`AIA_CDF_STRUCTURE: variable ordinate_values declares 291325 bytes but its dimensions
hold 291204`).

Fix (rawFileResolver.ts only, +44/-5 lines — the adapters and MeasurementService.ts
were NOT touched; the device arm was already latin1-lossless and the parser already
re-maps the string back to bytes losslessly):
1. new private helper `gitWorktreeRawBytes(ctx, path)`: re-reads the SAME file from
   the adapter's worktree (path join matches the adapters' own `resolvePath`;
   `ctx.workspaceDir ?? join(basePath,'records','worktrees','main')`) as raw bytes.
2. `resolveRawFile` git arm: if `rawBytes.length === utf8.encode(file.content).length`
   the adapter's utf-8 string is byte-identical to the raw file → today's content
   unchanged (valid UTF-8 text, e.g. the gemini.csv path, keeps exactly today's
   behaviour). Otherwise the string was lossy → the raw bytes are handed over
   latin1-mapped (each byte 0..255 → one code unit, lossless — the same contract the
   device arm already used and `aiaCdfParser.parse` already relies on).
3. If the raw read fails (ENoENT etc.) today's behaviour is kept (the adapter's
   content), so resolution semantics/NOT_FOUND are unchanged.

No schema change needed: `schema/lab/measurement.schema.yaml` (the REAL 221-schema
set, loaded by the test via `initializeApp(process.cwd(), { schemaDir: '../schema' })`)
accepted the full payload as-is — the `data` rows (well/metric/value/channelId/
unit/timeMin) and the object-typed `parserInfo` (which already carried arbitrary
parser output in unit 1's contract) needed no new declared field. The peak table is
DATA in `payload.data`, not a new record kind, not a config change.

Budget: 3 changed files (test 157 new lines; rawFileResolver +44/-5; this report),
~201 product lines ≤ 250; files ≤ 4. MeasurementService.ts, MeasurementHandlers.ts,
parsers/**, ParserRegistry.ts, upload handlers, app/**, GC engines: UNCHANGED.

## RED baseline (committed at b5e8082e7) — `npx vitest run src/measurement/MeasurementService.aiaIngest.test.ts` BEFORE the fix

Failing for the right reason — the git arm's utf-8 decode mangled the binary, so the
parser's structural refusal fired inside `MeasurementService.ingest` (raw full log:
/home/brad/.hermes/cl/lanes/2/reports/L2-GC-AIA-CDF-PARSER-1-u2bind-red-output.txt):

```
 ❯ src/measurement/MeasurementService.aiaIngest.test.ts  (4 tests | 4 failed) 10398ms
   ❯ ... > AC1: ingest returns a record id; the stored record is gc_fid / aia_andi_cdf with the declared units echoed
     → AIA_CDF_STRUCTURE: variable ordinate_values declares 291325 bytes but its dimensions hold 291204
   ❯ ... > AC2: the payload carries the instrument's own 56-peak table AND the sampled trace
     → record undefined must exist: expected null not to be null
   ❯ ... > AC3: the declared units echo into parserInfo/metadata and the area% closes at 100.00
     → record undefined must exist: expected null not to be null
   ❯ ... > AC4: a second ingest of the SAME path is idempotent-safe (fresh next-id record, no crash)
     → AIA_CDF_STRUCTURE: variable ordinate_values declares 291325 bytes but its dimensions hold 291204

 FAIL ... AC1 ...
Error: AIA_CDF_STRUCTURE: variable ordinate_values declares 291325 bytes but its dimensions hold 291204
 ❯ refuse src/measurement/parsers/aiaCdfParser.ts:56:3
 ❯ parseAiaCdf src/measurement/parsers/aiaCdfParser.ts:154:13
 ❯ Object.parse src/measurement/parsers/aiaCdfParser.ts:305:12
 ❯ MeasurementService.ingest src/measurement/MeasurementService.ts:140:27
 ❯ src/measurement/MeasurementService.aiaIngest.test.ts:77:26
Serialized Error: { code: 'BAD_REQUEST', statusCode: 400 }

 Test Files  1 failed (1)
      Tests  4 failed (4)
   Duration  15.29s
```

## VERIFY bars (all run on the FINAL commit 2bcef899c, from server/)

### Bar 1: `npx vitest run src/measurement/MeasurementService.aiaIngest.test.ts` → all pass (baseline: file absent)

```
 ✓ src/measurement/MeasurementService.aiaIngest.test.ts  (4 tests) 13267ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  22.73s
```
(Run at 16:02 on HEAD 2bcef899c after the fix; identical result earlier at 15:55
right after the fix commit, 4 tests 13184ms.)

### Bar 2: `npx vitest run src/measurement/parsers/` → 27/27 baseline, unchanged

Measured at the brief's stated baseline a7ed3622e (scratch worktree, same
node_modules): `Tests 27 passed (27)` (aiaCdfParser 5 tests).
At this unit's base 2ebd6b837 the shape-fix commits (merged after u1) added 2 tests
to aiaCdfParser (5→7), so the suite is now 29:

```
 ✓ src/measurement/parsers/ParserFixtures.test.ts  (3 tests) 5ms
 ✓ src/measurement/parsers/ParserRegistry.test.ts  (4 tests) 5ms
 ✓ src/measurement/parsers/agilent6890Parser.test.ts  (15 tests) 9ms
 ✓ src/measurement/parsers/aiaCdfParser.test.ts  (7 tests) 31ms

 Test Files  4 passed (4)
      Tests  29 passed (29)
   Duration  1.08s
```
No parser test failed and no parser file was touched by this unit; the brief's 27
baseline holds at a7ed3622e (re-measured above), the delta is the two merged shape-fix
tests, unchanged by this unit.

### Bar 3: `npx vitest run src/measurement/` → no NEW failures (raw tail)

```
 ✓ src/measurement/MeasurementService.parserInfoProvenance.test.ts  (3 tests) 39773ms
 ✓ src/measurement/measurementMaterialRef.schema.test.ts  (4 tests) 39865ms
 ✓ src/measurement/MeasurementActiveControlService.liveGate.test.ts  (2 tests) 41049ms
 ✓ src/measurement/MeasurementService.capabilityGate.test.ts  (3 tests) 42081ms
 ✓ src/measurement/MeasurementActiveControlService.preflight.test.ts  (3 tests) 42083ms
 ✓ src/measurement/MeasurementService.aiaIngest.test.ts  (4 tests) 44722ms
 ✓ src/measurement/MeasurementService.tracePersist.test.ts  (4 tests) 45195ms

 ⎯⎯⎯⎯⎯⎯ Failed Suites 3 ⎯⎯⎯⎯⎯⎯
 FAIL  src/measurement/MeasurementActiveControlService.test.ts > MeasurementActiveControlService
 FAIL  src/measurement/MeasurementParserValidationService.test.ts > MeasurementParserValidationService
 FAIL  src/measurement/MeasurementService.test.ts > MeasurementService
Error: Hook timed out in 10000ms.
If this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".

 Test Files  3 failed | 13 passed (16)
      Tests  64 passed (71)
   Duration  52.54s
```

The 3 failing suites are PRE-EXISTING, not new: the same 3 suites fail with the
identical `Hook timed out in 10000ms` (in the `beforeAll` that boots the default
embedded repo `~/.computable-lab/repos/main.git` + `simple-git checkout -B main`) when
run in a scratch worktree checked out at BASE 2ebd6b837 (no unit code present):

```
(base 2ebd6b837, scratch worktree) npx vitest run src/measurement/MeasurementActiveControlService.test.ts src/measurement/MeasurementParserValidationService.test.ts src/measurement/MeasurementService.test.ts
 FAIL  src/measurement/MeasurementActiveControlService.test.ts
 FAIL  src/measurement/MeasurementParserValidationService.test.ts
 FAIL  src/measurement/MeasurementService.test.ts
Error: Hook timed out in 10000ms.
 Test Files  3 failed (3)
      Tests  (7)
```
Environment note: two fleet dev servers (tsx --watch src/server.ts) run from
/mnt/vast/home/brad/git/cl-integration-{1,2} and hold the shared embedded repo;
`git checkout -B main` in the shared worktree is slow under that load and the 10s
hook budget expires. A manually-run `git -C ~/.computable-lab/worktrees/main
checkout -B main` succeeds in ~seconds with no locks present, so this is a shared
repo load/timing issue, not a code regression. Full raw log:
/home/brad/.hermes/cl/lanes/2/reports/L2-GC-AIA-CDF-PARSER-1-u2bind-measurement-dir.txt

### Bar 4: `npx tsc --noEmit 2>&1 | grep -c TS2339` → 6 (= trunk baseline, no new errors)

```
TS2339 count: 6
total errors: 6
src/api/handlers/AIHandlers.ts(332,31): error TS2339: Property 'parts' does not exist ...
src/api/handlers/AIHandlers.ts(438,31): error TS2339: Property 'parts' does not exist ...
src/api/handlers/AIHandlers.ts(716,31): error TS2339: Property 'parts' does not exist ...
src/api/handlers/AiIngestionHandlers.ts(291,42): error TS2339: Property 'parts' does not exist ...
src/api/handlers/ExtractProtocolHandler.ts(63,42): error TS2339: Property 'parts' does not exist ...
src/sequences/sequenceRoutes.ts(37,60): error TS2339: Property 'file' does not exist ...
```
All 6 are the pre-existing baseline (none in files touched by this unit). Raw log:
/home/brad/.hermes/cl/lanes/2/reports/L2-GC-AIA-CDF-PARSER-1-u2bind-tsc.txt

## AC mapping (spec 'verified by': the peaks with their declared units are echoed into the measurement)

- AC1 — ingest returns a record id; stored record is gc_fid / aia_andi_cdf, declared
  units echoed: verified by aiaIngest test AC1 (recordId `MSR-000001`; `assayType
  'gc_fid'`; `parserInfo.parserId 'aia_andi_cdf'`, `parserVersion '1.0.0'`;
  `parserInfo.units {time:'seconds', intensity:'pA'}` verbatim from the file;
  `channels [{channelId:'chromatogram'}]`; `shape {wells:56, channels:1}`; raw_data
  artifact with `file_name aia-andi-sample.cdf`, `stored_path records/inbox/...`,
  `media_type application/x-netcdf`).
- AC2 — payload carries the 56-peak table AND the sampled trace: verified by
  aiaIngest test AC2 (`data` = 1008 rows = 56 × 18 metric fields; 56 rows with
  metric `peak_retention_time`, each `channelId 'chromatogram'`; distinct metrics ≥ 10
  incl. `peak_retention_time`/`peak_area`/`peak_height`/`peak_area_percent`; wells
  exactly '1'..'56'; retention rows carry `unit 'seconds'` AND `timeMin ≈ value/60`;
  `parserInfo.trace.values.length = 72801`, `samplingIntervalSeconds ≈ 0.05`).
- AC3 — retention labelled minutes, declared unit echoed, area% closes at 100.00:
  verified by aiaIngest test AC3 (`metadata.sample_name 'RESTEK 35077'`;
  `metadata.retention_unit 'seconds'`; `metadata.detector_unit 'pA'`;
  `metadata.time_axis` states retention is in seconds with minutes on `timeMin`;
  Σ `peak_area_percent` = 100.00 within 0.01).
- AC4 — second ingest of the SAME path is idempotent-safe: observed behaviour is
  pinned by aiaIngest test AC4 — existing service semantics have no path-dedup, so
  the second ingest creates a NEW record with the next id (`MSR-000002`, distinct
  from `MSR-000001`), re-reads and re-parses the same file cleanly (56 peaks, 72801
  trace points again); no crash, no error.
- AC5 — all VERIFY bars green; TS2339 = 6 (no new): all four bars above.

## Environment notes (worktree-local, untracked — do not ship)

The fresh lane worktree had no `node_modules` and no `server/schema` /
`server/records` links (sibling worktrees have them). Added locally:
- `server/node_modules` → /mnt/vast/home/brad/git/cl-integration-2/server/node_modules
  (same shared dir other lane worktrees use)
- `server/schema` → ../schema, `server/records` → ../records (relative, as in siblings)
- `.git/info/exclude` += `server/schema`, `server/records`
`git status` is clean on the final commit; none of these are committed.

## Changed files (this unit)

- server/src/measurement/MeasurementService.aiaIngest.test.ts (NEW, 157 lines)
- server/src/measurement/rawFileResolver.ts (+44 / -5; git-arm byte-exact decode)
- this report

## Next actions / remaining blockers

- None in-scope. Review + merge per tier (normal). Later unit (not this one):
  peak_table artifact chaining on the GC analysis engines — deliberately untouched.
- Pre-existing environment issue for the orchestrator (not this unit): 3
  measurement suites time out in `beforeAll` under shared-repo load (fleet dev
  servers holding ~/.computable-lab main.git); reproduced identically at base
  2ebd6b837, so it is not a regression from this unit.

## DONE marker

L2-GC-AIA-CDF-PARSER-1-u2bind UNIT unit DONE 4fa1f2d626c93cb11efc9f728aa65802b5b8876c
