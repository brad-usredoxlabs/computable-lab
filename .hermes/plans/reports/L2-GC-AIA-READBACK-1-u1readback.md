# L2-GC-AIA-READBACK-1 u1readback — device-stored raw file readback

Item: L2-GC-AIA-READBACK-1 (unit u1readback). Lane 2 worktree
/home/brad/cl-wt/L2-GC-AIA-READBACK-1-lane2, branch cl/lane2-gcaia-readback-l2t2664, base c8c332aa0.
Gate GC-BUNDLE r2 finding F4 (HIGH): an uploaded binary AIA/CDF .cdf stored via the DEVICE blob store
dead-ended at both parser consumers, which resolved the returned `measurements/<artifact>/<file>`
storedPath with the GIT repo adapter only.

## What changed (3 files, one seam)

1. `server/src/measurement/rawFileResolver.ts` (new, 83 lines) — ONE resolver, order fixed:
   1. `ctx.repoAdapter.getFile(path)` hit -> `file.content` unchanged (byte-identical git arm);
   2. miss + `ctx.storageService` present + path is upload-shaped -> read the bytes back with
      `new ArtifactBlobStore(storage, 'measurements', noopRecorder).loadBase64(path)`, base64-decode,
      hand the parser `Buffer#toString('latin1')` — the same decode `aiaCdfParser.parse` applies
      internally, so both arms reach the parser through the single `parser.parse(content)` surface.
   A device read that throws/returns nothing returns `null`, so the caller's existing NOT_FOUND text
   is unchanged. No `parseBytes` second code path. The device arm is guarded by
   `isMeasurementDevicePath()`: device-relative, first segment exactly `measurements`, >= 2 segments,
   no empty/`.`/`..` segment, no leading `/`, no backslash — an arbitrary path can never be pulled
   out of the device store. No `legacy` store is passed: uploads write without one, and inventing a
   legacy root here would be a second authority for where bytes live.
2. `server/src/measurement/MeasurementParserValidationService.ts` — `getFile` -> `resolveRawFile`;
   NOT_FOUND message/status untouched.
3. `server/src/measurement/MeasurementService.ts` — `getFile` -> `resolveRawFile` in `ingest`;
   NOT_FOUND message/status untouched.

Not touched: routes.ts, MeasurementHandlers.ts, aiaCdfParser.ts, ParserRegistry.ts, app/**, schema/**,
records/**. Feature flag / config: none; no new YAML.

## Commits

- RED  d2d57781f771fbd052f8b7335cba72c97328af26  test(measurement): device-stored AIA/CDF upload path
  dead-ends in both parser consumers.
- GREEN 914dece036dd11627ec92f0881f6e2cef93b7a66  fix(measurement): one resolveRawFile seam reads
  device-stored raw files back for validate-parser and ingest.
- report commit (this file) — sha in the DONE marker.

## RED (the failing test, run at the RED commit d2d5778)

`server/src/measurement/deviceReadback.test.ts` saves real fixture bytes
(`parsers/fixtures/aia_andi_sample.cdf`, 297212 B) through `ArtifactBlobStore` with prefix
`measurements` into an in-memory `StorageService` device, then drives both consumers with the returned
`storedPath`. The git adapter genuinely misses that path (asserted).

```
❯ src/measurement/deviceReadback.test.ts  (6 tests | 2 failed) 12122ms
   ❯ ... > validate-parser parses the device-stored path instead of NOT_FOUND
     → Raw data file not found: measurements/20261116-SIGNAL01.cdf/SIGNAL01.cdf
   ❯ ... > ingest reads the same device-stored path and writes the measurement
     → raw data file not found: measurements/20261116-SIGNAL01.cdf/SIGNAL01.cdf
 FAIL ... validate-parser parses the device-stored path instead of NOT_FOUND
Error: Raw data file not found: measurements/20261116-SIGNAL01.cdf/SIGNAL01.cdf
 FAIL ... ingest reads the same device-stored path and writes the measurement
Error: raw data file not found: measurements/20261116-SIGNAL01.cdf/SIGNAL01.cdf
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

That is exactly the brief's expected RED text at `MeasurementParserValidationService.ts:18`
(`:16` before the seam) and `MeasurementService.ts:128` (`:126` before).

## GREEN (final commit 914dece)

```
cd server && npx vitest run --hookTimeout=60000 \
  src/measurement/deviceReadback.test.ts src/measurement/parsers src/ingestion/ArtifactBlobStore.test.ts

 ✓ src/ingestion/ArtifactBlobStore.test.ts  (20 tests) 21ms
 ✓ src/measurement/parsers/ParserFixtures.test.ts  (3 tests) 6ms
 ✓ src/measurement/parsers/ParserRegistry.test.ts  (4 tests) 7ms
 ✓ src/measurement/parsers/agilent6890Parser.test.ts  (15 tests) 10ms
 ✓ src/measurement/parsers/aiaCdfParser.test.ts  (7 tests) 47ms
 ✓ src/measurement/deviceReadback.test.ts  (8 tests) 1040ms
 Test Files  6 passed (6)
      Tests  57 passed (57)
```

8 device-readback tests cover: (a) upload lands on the device under `measurements/` and the git
adapter misses it; (b) validate-parser on the storedPath returns `rows > 0`, `parserId
aia_andi_cdf`, `assayType gc_fid`, path echoed; (c) ingest on the same path writes a measurement with
`assayType gc_fid` and non-empty data; (d) git worktree path still parses (CSV-in-git, rows 2,
byte-identical arm); (e) git wins when both stores hold the same path; (f) device arm path guard
accepts upload shapes and rejects `secrets/...`, absolute, `..`, empty-segment and
`records/...` paths; (g) NOT_FOUND preserved when the context has no `storageService`.

## Typecheck

```
cd server && npx tsc --noEmit
6 error lines, all pre-existing and in untouched files:
  src/api/handlers/AIHandlers.ts (x3 'parts'), src/api/handlers/AiIngestionHandlers.ts,
  src/api/handlers/ExtractProtocolHandler.ts, src/sequences/sequenceRoutes.ts ('file')
grep for rawFileResolver|deviceReadback|MeasurementService|MeasurementParserValidationService -> no matches
```

Identical set of 6 errors reproduced on the trunk checkout
/mnt/vast/home/brad/git/cl-integration-2/server, so they are environment/base TS-augmentation
artifacts (`@fastify/multipart` types via the symlinked pnpm node_modules), not this change. No type
error in any file I touched.

## Regression suites — NOT green at base; identical before and after (environment-coupled)

`src/measurement/MeasurementParserValidationService.test.ts` and `src/measurement/MeasurementService.test.ts`
are red at base c8c332aa in this estate, and stay red in exactly the same way after the change. They
are not touched by me. Measured, twice:

1. Base commit in its own worktree (no changes of mine), default HOME, shared durable store:
   `Tests 2 failed | 6 passed` — `Raw data file not found: records/inbox/gemini.csv` from
   `repoAdapter.getFile`, i.e. the embedded-git durable worktree did not hold the test fixture.
   My worktree, before implementing: identical output.
2. Base c8c332aa vs HEAD 914dece, each with a fresh empty HOME (`/tmp/cl-home-cmp-*`), same instant:
   base `Tests 1 failed | 6 passed`, HEAD `Tests 1 failed | 6 passed`, same failing test and same
   message `raw data file not found: records/inbox/gemini.csv` at
   `MeasurementService.test.ts:87:20`. Byte-identical outcome; the only difference on the stack trace
   is the new line number of the unchanged NOT_FOUND throw in
   `MeasurementParserValidationService.ts:20` (was `:18`).
3. With the default HOME (shared `~/.computable-lab` durable store), the same two suites now fail on
   *shared-store state* instead (`expected 10 to be +0` — 10 measurements accumulated by other lanes;
   `expected 'MSR-000047' to be 'MSR-000001'`). The parser parse itself succeeds there, confirming the
   git arm still resolves when the file is present.

Root cause of that base-state redness (outside this unit's scope, reported, not worked around): those
two suites do not pin `server.dataDir`, so they run against the shared `~/.computable-lab` embedded-git
worktree and depend on both a pre-existing `records/inbox/gemini.csv` there and an empty measurement
set. `src/analysis/analysisService.test.ts` shows the in-repo remedy: write a `config.yaml` pinning
`server.dataDir` under the test dir and a 30s hook timeout. I applied that remedy only inside my own
test file. Also note a live-concurrency hazard observed while verifying: the shared worktree gained
commits (`MSR-000043..47`) during this session from other lanes' runs; any suite booting the app
without pinning `dataDir` is not reproducible.

One side effect to record honestly: my first test-file draft pinned `dataDir` in a `config.yaml` that
also set `server.logLevel: 'silent'`, which `validateServerConfig` rejects (allowed: debug|info|warn|
error). `loadConfig` therefore threw and the app silently fell back to the shared store, and one run of
my test committed `MSR-000045` into `~/.computable-lab/worktrees/main` before I caught it. Fixed by
using `logLevel: 'error'`; the final test file is hermetic (verified: the shared worktree's HEAD sha is
unchanged across a full run of `deviceReadback.test.ts`; runtime 6.4s instead of 12s). I did not rewrite
the shared store's history — it is live state other lanes use.

## Environment workaround (as the brief allowed)

The lane worktree had no `server/node_modules` and no `server/schema`. Symlinked both from the trunk,
no `npm install`:

```
ln -s /mnt/vast/home/brad/git/cl-integration-2/server/node_modules server/node_modules
ln -s /mnt/vast/home/brad/git/cl-integration-2/server/schema       server/schema
```

Both symlinks are gitignored; `git status` is clean at exit (default HOME hook needed
`--hookTimeout=60000` only for the shared-store suites, not for any file I touched).

## Acceptance

1. validate-parser on a storedPath from a binary upload returns rows > 0 instead of NOT_FOUND — GREEN,
   test-proved (8/8 in `deviceReadback.test.ts`).
2. Ingest reads the same device-stored path and parses it — GREEN, test-proved.
3. Git-repo paths byte-identical — the git arm is unchanged code (`getFile` -> `file.content`), the
   CSV-in-git test in the new file passes, parser/ArtifactBlobStore suites 57/57 green, and the two
   legacy suites fail identically at base and HEAD (evidence above; their redness is a pre-existing
   environment coupling, not a regression). tsc: no new errors.

## Reviewer pointers

- `parseBytes` on `aiaCdfParser` is deliberately not called; `latin1` is the one decode both arms use,
  so a future parser without a latin1-safe text surface would need a byte-typed seam — that would be a
  new decision, not a bug in this unit.
- `resolveRawFile` returns `source: 'git' | 'device'` for logging/tests only; no consumer branches on it.
- The device arm constructs an `ArtifactBlobStore` per resolution with a no-op recorder. `save()` is
  never called on it, so no data-reference record can be minted from a read path.

status: DONE

RED commit:  d2d57781f771fbd052f8b7335cba72c97328af26
GREEN commit: 914dece036dd11627ec92f0881f6e2cef93b7a66
report commit: 58d28ce8509bc655cbe887ab4ff9d24cea75079c
L2-GC-AIA-PARSER-SHAPE-1 UNIT u1readback DONE 58d28ce8509bc655cbe887ab4ff9d24cea75079c
