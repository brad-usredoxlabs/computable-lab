# L2-ANALYSIS-ENGINE-DECLARATIONS-1 / unit u1enginerecords — report

Item: L2-ANALYSIS-ENGINE-DECLARATIONS-1-u1enginerecords (unit 1 of 2)
Worktree: /home/brad/cl-wt/L2-ANALYSIS-ENGINE-DECLARATIONS-1-u1enginerecords-lane2
Branch: cl/lane2-analysis-engine-declarations-1-u1enginerecords-1141
Base: 69702c8e3b8d475c9b5096d1eb73d0ef98419a73 (unchanged; clean tree at start)
Retry: 1 (prior run STALLED with 0 commits; this run opened ~11 files total, first commit inside the 8-minute target)

STATUS: COMPLETE (unit scope done; e2e leg deliberately cut — see NOT DONE)

## STEP 0 — measured before writing (raw)

`cd server && npx vitest run src/analysis/analysisRunner.engine.test.ts`:

```
 ✓ src/analysis/analysisRunner.engine.test.ts  (14 tests) 47811ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  12:45:36
   Duration  73.50s (transform 13.74s, setup 0ms, collect 24.91s, tests 47.81s, environment 0ms, prepare 257ms)
```

`grep -rn "kind: analysis-engine" records/` → NO output (exit 1, 0 records), as expected at base.

## STEP 1 — evidence per capability (read first-hand from the modules)

Modules are stdlib-only: `peak_integration.py:67-72` imports hashlib, json, math, os,
tempfile, typing; `calibration_fit.py:31-37` and `quantification.py:41-46` likewise
(+ `pathlib`, `re`, relative `.` imports). No host package exists anywhere ⇒
`packages: []` is the only honest value.

ENG-PEAKINTEG-1 (peak_integration.py, GC-7) — all `supported`, markers verified in source:
- baseline_control: `_build_baseline` docstring — `'none': y = 0 line` (raw),
  `'vertical_drop'` / `'tangent_skim'` (declared OQ4 interpretations).
- width_slope_sensitivity: detection floor = "slope_sensitivity × the segment's robust range"
  (docstring :38-39; `_segment_floor` implements `eff["slope_sensitivity"] * (segmax − basemin)`);
  widths via `min_width_factor`/`max_width_factor` REQUIRED_PARAMS.
- area_height_reject: OPTIONAL_PARAMS `"area_reject_pa_min"` / `"height_reject_pa"`.
- timed_integration_windows: REQUIRED-style OPTIONAL `"timed_events"` +
  `FLAG_TIMED_OFF_WINDOW = "TIMED_OFF_WINDOW"` + `_validate_timed_events`.
- peak_detection: `_peak_windows` (prominence-floor-bounded window per maximum).
- deconvolution: NO code path in the module ⇒ declared `unsupported` (not omitted, not
  invented). The §A3 pipeline list (:18-19) names no deconvolution step.

ENG-CALIBFIT-1 (calibration_fit.py, GC-8):
- curve_fitting: docstring :7 "The fit is weighted least squares via the normal equations on";
  `_fit_linear` / `_fit_quadratic` implement it.
- weighted_regression: `WEIGHTING_ENUM = ("none", "1/x", "1/x^2", "1/y^2")` + per-level `weight`.
- No peak/detection terms: the module CONSUMES GC-7 peak tables (PEAK_TABLE_REQUIRED_COLUMNS
  subset check); it does not detect or integrate peaks.

ENG-QUANT-1 (quantification.py, GC-8):
- `declared: []` — no term in the closed capability enum names cross-run model consumption /
  ISTD application (docstring :1-3: "the cross-run consumer of a PROMOTED calibration model";
  the ISTD division is applied exactly once, bidirectional ISTD_DOUBLE_APPLICATION guard).
  Stated verbatim in the record's `description`; `curve_fitting` NOT borrowed from CALIBFIT.

## STEP 2 — records written (3 new files, the only `records/` change)

- records/seed/analysis-engine/ENG-PEAKINTEG-1.yaml (37 lines)
- records/seed/analysis-engine/ENG-CALIBFIT-1.yaml (33 lines)
- records/seed/analysis-engine/ENG-QUANT-1.yaml (32 lines)

Shape = analysisRunner.engine.test.ts:111-119 worked record. Every record:
`kind: analysis-engine`, `id` matching `^ENG-[A-Za-z0-9_-]+$`, human title (no STUB),
`implementation: { adapter: python-entry-script, entry: 'run(ctx)', module: computable_lab_analysis }`
(stub-echo is a declared probe and carries no science), `version_constraints:
{ python: '>=3.13', packages: [] }`, `availability.available: true` ONLY after the STEP 3 probe,
`runtime_requirements: { interpreter: system }` (reason: stdlib-only; the resolved
interpreter imports the module — probed below), `lifecycleId: registry-ops`, `state: draft`
(schema-declared registry-ops lifecycle, default state).

Seed directory name is `analysis-engine` (singular) — byte-for-byte the record kind, because
RecordStoreImpl's seed loader walks `join(seedDir, filter.kind)`; a plural dir would be invisible.

## STEP 3 — probe (resolution order: config `analysis.python` → `CLA_ANALYSIS_PYTHON` → last resort)

No `analysis.python` in the test config; `CLA_ANALYSIS_PYTHON` unset in this shell ⇒ the
resolved interpreter is the DECLARED LAST-RESORT, exactly what the runner (and the existing
GC-5/GC-7 suites) uses: `/usr/bin/python3`.

Raw:

```
$ /usr/bin/python3 --version
Python 3.14.7
$ /usr/bin/python3 -c "import sys; sys.path.insert(0,'server/python-executor-service/src'); import computable_lab_analysis as m; print(m.__file__)"
/home/brad/cl-wt/L2-ANALYSIS-ENGINE-DECLARATIONS-1-u1enginerecords-lane2/server/python-executor-service/src/computable_lab_analysis/__init__.py
```

Probed interpreter: `/usr/bin/python3`, **Python 3.14.7**. It satisfies `>=3.13`, imports the
package, and the package is stdlib-only ⇒ `availability.available: true` is proven, not
optimistic (each record's `availability.note` states the probe).

## STEP 4 — test file (1 new file)

server/src/analysis/analysisEngineDeclarations.test.ts (237 lines, `// @vitest-environment node`)
Pins:
1. DRIFT (required): parses each record YAML from `records/seed/analysis-engine/`; the app is
   initialized through the same store+schema wiring as analysisRunner.engine.test.ts:85-89
   (`initializeApp(wsDir, { recordsDir: 'records', schemaDir: resolve(cwd,'..','schema') })`).
   The store-visibility test fetches each id through `ctx.store.get/list` — PARSE-ONLY:
   the seed read path (parseRecord) never validates (the index rebuild, raw log line
   "Index rebuilt: 155 records" = 152 base + 3 engines, is parse-only too; the sole Ajv
   call site createUnlocked is never reached for seed records). The schema gate on these
   records is the SCHEMA pin (item 4, added by FIX LEG u1fix1).
   For every `capabilities.declared` entry with `support === 'supported'` the test asserts a
   NAMED marker from the DRIFT table exists in the module source (capability → {module, marker};
   markers are the first-hand lines quoted in STEP 1). A `supported` capability with no pin or
   no live marker FAILS.
2. STORE-VISIBILITY (required): `ctx.store.list({ kind: 'analysis-engine' })` returns exactly
   [ENG-PEAKINTEG-1, ENG-CALIBFIT-1, ENG-QUANT-1]; each fetched record asserts adapter, state,
   availability.
3. HONESTY (required): no record declares `deconvolution` supported; every adapter is
   `python-entry-script`; the string `stub-echo` appears in no record; `packages` must equal
   `[]` (allow-list `PACKAGE_ALLOWLIST = []` — an empty list passes; any named host package
   fails); ENG-QUANT-1 `declared: []` and its description states the "no term in the closed
   capability enum" rationale; PEAKINTEG declares deconvolution as `unsupported` (declared,
   not invented); every `available: true` carries a probe-stating note.

Raw summary (final run, post-restore):

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  12:52:16
   Duration  15.68s (transform 3.24s, setup 0ms, collect 4.88s, tests 10.23s, environment 0ms, prepare 388ms)
```

## MUTATION PROBE (required)

Flipped `deconvolution` in ENG-PEAKINTEG-1.yaml from `unsupported` → `supported` (sed), ran the
suite, then restored. RAW failure (2 of 3 tests failed — the pin is NOT vacuous):

```
     → drift table has no pin for 'ENG-PEAKINTEG-1' capability 'deconvolution': expected undefined not to be undefined
 FAIL  ... > drift pin — declared `supported` requires a NAMED code path > every record file parses; every `supported` capability has a real marker in its module source
AssertionError: drift table has no pin for 'ENG-PEAKINTEG-1' capability 'deconvolution': expected undefined not to be undefined
 FAIL  ... > honesty pin — no invented completeness > no record declares deconvolution supported; every adapter is python-entry-script; no package outside the allow-list
AssertionError: ENG-PEAKINTEG-1 declares deconvolution supported: expected false to be true // Object.is equality
      Tests  2 failed | 1 passed (3)
```

Restore proven byte-identical by sha256 before and after:
`6a97c5146aba97b109e3f6d89850135a1d30036e3fe5b91644c19b61c14f8c26` (both), and
`git status --short` clean (only the committed files present; `git diff --stat` empty).

## VERIFY BEFORE EXIT (raw)

- Declarations suite: `Tests  3 passed (3)` (above).
- Untouched suite (AC3, re-run AFTER all changes):

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  12:52:38
   Duration  46.89s (transform 2.98s, setup 0ms, collect 4.38s, tests 40.87s, environment 0ms, prepare 63ms)
```

  (analysisRunner.engine.test.ts unchanged from STEP 0 — dispatch undisturbed.)
- Typecheck (ONE run, at the end): `npx tsc --noEmit` → exit 2, **6 error lines**, all in
  pre-existing trunk files (src/api/handlers/AIHandlers.ts, AiIngestionHandlers.ts,
  ExtractProtocolHandler.ts, src/sequences/sequenceRoutes.ts). **0 errors in any file this
  unit touched** (grep count for analysisEngineDeclarations in the tsc output = 0) ⇒
  == baseline (no new). Full output: /home/brad/.aedecl-scratch/tsc-final.txt.
- `git -c core.fileMode=false status --short` → clean at exit (verified at marker commit;
  see final check below). `git diff --stat 69702c8e3..HEAD` names only the 4 added paths:
  records/seed/analysis-engine/ENG-PEAKINTEG-1.yaml, records/seed/analysis-engine/ENG-CALIBFIT-1.yaml,
  records/seed/analysis-engine/ENG-QUANT-1.yaml, server/src/analysis/analysisEngineDeclarations.test.ts
  (plus this report file). `records/seed/` gains exactly 3 files, zero modified (the 135
  existing YAMLs are untouched; the test's own index log confirms 152 → 155 records).
- AC1: `ctx.store.list({ kind: 'analysis-engine' })` returns exactly the 3 ids, each
  `implementation.adapter: python-entry-script`, `state: draft`, store-created through the
  schema-valid seed pipeline (155-record index rebuild) — asserted by the store-visibility pin.
- AC2 (negative): no `deconvolution: supported` anywhere; `packages: []` on all three (no
  un-imported host package named); ENG-QUANT-1 `declared: []`; `stub-echo` absent from all
  three — all asserted by the honesty pin + the mutation probe.

## NOT DONE (explicit, per the brief)

- AC(3) e2e provenance leg (run peak integration via AnalysisRunner on the GC-7 fixture with
  engineRef = seed record ENG-PEAKINTEG-1, asserting engineProvenance names the seed record id
  + probed interpreter version): CUT. Reason: output budget — the three honest pins already
  sit at 236 lines against the ~150-190 test budget, and the e2e leg would add ~120+ lines of
  CH-builder/harness duplication (the GC-7 fixture is a 30k-point synthetic .CH built in TS).
  The brief's step 4 names this as the leg to cut, not to enlarge the unit for. Recorded here
  as item-AC(3) debt — I do NOT claim AC3's e2e half. The store-visibility pin covers the
  declared-data half: the store lists the 3 engines, so the /analysis engine list is
  non-empty after a stack restart (no UI change).
- Typecheck baseline was not re-run at the base commit (budget); instead: all 6 error lines
  are in files this unit does not touch and 0 are in the new test file ⇒ no new errors.

## Decisions / honest-boundary notes

- `version_constraints.python: '>=3.13'` copied from the worked record shape (the GC-5 suite
  declares the same constraint for this exact stdlib module and runs green on 3.14.7); the
  probe interpreter (3.14.7) satisfies it.
- `interpreter: system` (not `provisioned-venv`): stdlib-only module; the resolved
  last-resort interpreter imports the package (probed). The GC-5 venv-trap rule (declared
  packages on the last-resort ⇒ ENGINE_UNAVAILABLE) does not fire because `packages: []`.
- `deconvolution: unsupported` on PEAKINTEG (brief allows omitted OR unsupported; chose
  declared-unsupported so the closed-enum term is honestly present rather than silently
  absent — the record is DATA and the module has no such path).
- No schema/lint change; no engineAdapters/runner/service change; no existing test suite
  edited; no installs; no history rewrites.

## Commits (each names the unit)

1. aecf238c2 — records/seed/analysis-engine/*.yaml (3 records) + probe facts in this report's lineage
2. 92252144d — server/src/analysis/analysisEngineDeclarations.test.ts
3. d36825fa0cccca62e382939617ca2ececb9c2532 — this report (the commit the DONE marker references)

## FIX LEG u1fix1 (adversarial review c1: FIX-FUNCTIONAL — DEFECT 1 MAJOR + DEFECT 2 required; D3/D4 evidence corrections folded in; D5-D7 improvement-class skipped per the fix brief)

### DEFECT 1 — the missing schema-validation leg (added; suite is now 4 tests)

The seed read path never validates (store.list/get -> parseRecord; the index rebuild is
parse-only; the sole Ajv call site createUnlocked is never reached for seeds) — the false
"create-time validation pipeline" sentence above (STEP 4 item 1) was DELETED and replaced
with the parse-only statement. The new leg (server/src/analysis/analysisEngineDeclarations.test.ts,
file now 285 lines vs 237 at unit commit 92252144d) uses the repo's own idiom —
createSchemaRegistry + loadAllSchemas + createValidator (precedent
FulfillmentAccept.test.ts:75-85; DerivationSeedRecords.test.ts:28-52). loadAllSchemas is
REQUIRED here (not the single-file loadSchemasFromContent): analysis-engine.schema.yaml:19
`$ref`s ./common.schema.yaml#/$defs/FAIRCommon. Wiring in beforeAll:
`expect(loaded.errors).toEqual([])`, then addSchema per topological order. The pin
("schema pin — every seed record is Ajv-valid"): for each of the three files, fresh
`parseYaml` of the FILE (not the beforeAll map), strip `$schema` (RecordParser.ts:113),
`validator.validate(record, 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml')`,
assert `valid === true` per record.

NEGATIVE probe (same test — proves the leg is not vacuous): ENG-QUANT-1 declares no term
(declared: [] — honesty pin), so the probe injects `[{capability: 'invented_vendor_term',
support: 'supported'}]` into a structuredClone of the payload and asserts `valid === false`
with an `enum` error at `/capabilities/declared/0/capability`. Raw (green run, 13:47:36):

```
u1fix1 NEGATIVE PROBE: invented_vendor_term -> valid = false errors = [{"path":"/capabilities/declared/0/capability","message":"Must be one of: baseline_control, width_slope_sensitivity, area_height_reject, timed_integration_windows, peak_detection, deconvolution, curve_fitting, weighted_regression","keyword":"enum",...}]
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### RED mutation probe (file-level, reverted after)

`sed -i 's/capability: curve_fitting/capability: invented_vendor_term/' records/seed/analysis-engine/ENG-CALIBFIT-1.yaml`
(13:50:24) — the suite turned RED:

```
 FAIL  ... > schema pin ... > all three seed payloads validate ...
AssertionError: ENG-CALIBFIT-1 invalid: [{"path":"/capabilities/declared/0/capability","message":"Must be one of: baseline_control, ... weighted_regression","keyword":"enum",...}]: expected false to be true // Object.is equality
 ❯ src/analysis/analysisEngineDeclarations.test.ts:267:81
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

(2nd failure = the drift pin: no DRIFT table pin for the invented term — the invented
capability now fails TWO legs.) Restored via `git checkout -- records/seed/analysis-engine/ENG-CALIBFIT-1.yaml`;
`git diff` on records/ clean (only the committed citation edits remain); re-run: `Tests 4 passed (4)` (13:50:45).

### DEFECT 2 — stale citation (2 lines)

`spec 2026-10-27_GC-8` does not name an existing file (review §DEFECT 2: find → the GC-8
spec is .hermes/plans/2026-10-28_GC-8-calibration-revision.md; sibling ENG-PEAKINTEG-1.yaml
cites the resolvable 2026-10-28_GC-7). Both lines now cite
`2026-10-28_GC-8-calibration-revision`, sentence intact (ENG-CALIBFIT-1.yaml:7,
ENG-QUANT-1.yaml:7). Commit dde634a36.

### D4 evidence correction

ENG-CALIBFIT-1.yaml is 33 lines (STEP 2 line corrected 32 → 33; wc -l = 33, unchanged by
the one-line citation edit).

### VERIFY (u1fix1 final state, after dde634a36)

- Declarations suite: `cd server && npx vitest run src/analysis/analysisEngineDeclarations.test.ts`
  → `Test Files 1 passed (1) / Tests 4 passed (4)` (17.87s, 13:48:19 — after the citation
  commit, so the edited records still pass the new validator leg).
- Untouched AC3 suite: `npx vitest run src/analysis/analysisRunner.engine.test.ts`
  → `Tests 14 passed (14)` (48.74s, 13:48:40) — unchanged from baseline (14/14).
- `git status --short` clean; `git diff --stat aaf617ab8..HEAD` = 3 files (test +48,
  two YAMLs ±1 line each).
- Final run AFTER this report commit (post-report typecheck: 6 pre-existing error lines,
  0 in files this unit touched — same 6 as baseline): `Tests 4 passed (4)` (13:53:30).

### Commits (u1fix1)

1. 8b00252ec — validator leg + negative probe (test only)
2. dde634a36 — the two citation one-liners
3. (this section) — report corrections + FIX LEG

## Next actions

- Item unit 2 (the second unit of L2-ANALYSIS-ENGINE-DECLARATIONS-1) is out of scope here.
- AC(3) e2e leg is item-level debt: a follow-up may add the AnalysisRunner e2e provenance
  assertion against the seed record (owner: item orchestrator; resume condition: unit 2 or a
  dedicated e2e dispatch with the budget to duplicate the GC-7 harness).

L2-ANALYSIS-ENGINE-DECLARATIONS-1-u1fix1 UNIT u1fix1 DONE 36c65fc6c6dfcef5ebd999195f12c3ae4a5df464
