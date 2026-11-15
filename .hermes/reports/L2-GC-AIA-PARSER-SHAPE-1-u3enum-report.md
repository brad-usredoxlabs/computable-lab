# L2-GC-AIA-PARSER-SHAPE-1 / u3enum — measurement assayType enum carries gc_fid

Item: L2-GC-AIA-PARSER-SHAPE-1-u3enum (1 of 1) · lane 2 · branch cl/lane2-parsershape-u3enum-l2t2643
Base: 159dd242b10bc737c5e784d1c47b3d90d0eb2f1f · Decision: .hermes/plans/2026-10-26_GC-2-gc-method-records.md §C
Code commit: 5363a181891ff30449fda5c2cbf40ed55f372bb0

## Governing line (architect-context-l2.md §2.14, quoted)

"**Controlled vocabulary over free text.** Use ontology terms or CURIE-style local terms
(`cf:ROS`); a new concept is authored as a term, not smuggled in as prose."

This unit does NOT create a term: `gc_fid` already exists in this checkout as the GC-2 §C readout
vocabulary — `schema/lab/readout-definition.schema.yaml:34`
`enum: [ plate_reader, qpcr, gc_ms, gc_fid, lc_ms, microscopy, other ]`,
`server/src/registry/ReadoutDefinitionRegistry.ts:22`, `schema/registry/readout-definitions/gcfid-peak-area.yaml:4`.
The measurement enum was the one mirror that missed it. No duplicate term was authored.

## Changes (4 files, 8 changed lines of intent)

- `schema/lab/measurement.schema.yaml:92` — `enum: [ qpcr, plate_reader, microscopy, gc_fid, gc_ms, flow, other ]`
  (the single authority for the payload slot; Ajv validates against it).
- `server/src/measurement/MeasurementService.ts:20` — MeasurementPayload `assayType` union widened
  the same one-word way (trunk's TS side was still narrow, as the brief predicted).
- `server/src/api/handlers/RunSheetHandlers.ts:87` — request-body union widened;
  `:193` — the ASSAY_TYPE_REQUIRED refusal text now enumerates gc_fid (message and union agree).
- `server/src/measurement/measurementMaterialRef.schema.test.ts` (AC2's 3rd-file allowance; makes 4
  touched files, over the 3-file output budget BY the AC2 clause that authorises it) — new describe
  "(d)": a minimal measurement payload with `assayType: 'gc_fid'` validates against the REAL
  measurement schema (test boots `initializeApp(process.cwd(), { schemaDir: '../schema' })`, so the
  shipped YAML is what Ajv reads), plus a negative control proving the slot is still an ENUM.

## RED / GREEN (same test, same tree)

RED with the YAML line reverted (source untouched otherwise):

```
❯ ... "(d) assayType gc_fid validates against the REAL measurement schema"
  → assayType gc_fid must validate: [{"path":"/assayType",...,"keyword":"enum",
     "params":{"allowedValues":["qpcr","plate_reader","microscopy","gc_ms","flow","other"]},
     "suggestion":"You wrote \"gc_fid\" — did you mean \"gc_ms\"?"}]
  Tests  1 failed | 3 passed (4)
```

GREEN with the change: `Tests 4 passed (4)`.

## Verification on the FINAL commit 5363a1818 (real output)

Typecheck (repo root): `npm run typecheck -w server` → `6` lines matching `error TS`, all the
pre-existing Fastify `parts`/`file` errors (AIHandlers x3, AiIngestionHandlers, ExtractProtocolHandler,
sequenceRoutes). Baseline at 159dd242b was the same 6 → delta 0.

Suite (worktree `server/`): `timeout 300 npx vitest run src/measurement/ --hookTimeout=120000`

```
FAIL src/measurement/MeasurementActiveControlService.test.ts > runs active read sidecar and ingests resulting measurement
FAIL src/measurement/MeasurementActiveControlService.test.ts > uses Gemini HTTP bridge when configured
FAIL src/measurement/MeasurementParserValidationService.test.ts > parses and summarizes raw data without writing measurement records
FAIL src/measurement/MeasurementService.test.ts > ingests gemini csv into a measurement record
Test Files  3 failed | 9 passed (12)
Tests  4 failed | 45 passed (49)
```

BASELINE at base 159dd242b, before any edit: the SAME 4 tests failed for the SAME reason —
`MeasurementServiceError NOT_FOUND: raw data file not found: records/inbox/gemini.csv` (no
`gemini.csv` exists anywhere in the worktree: `find . -name gemini.csv -not -path '*/node_modules/*'`
→ empty). Tests at base: 44 passed / 48; final: 45 passed / 49 (the +1 is the new (d)). Delta 0 new
failures.

`timeout 300 npx vitest run src/api/handlers/RunSheetHandlers.test.ts --hookTimeout=120000` →
`Tests 21 passed (21)` (the ASSAY_TYPE_REQUIRED test at :362 asserts the code, not the message, so the
refusal-text widening breaks nothing).

## ENV notes (untracked, not in any commit)

Two harness symlinks the sibling lane worktrees already carry were missing here; both are ignored by
git and reproduced the u1 lane's setup:
- `server/schema -> ../schema` — without it the `scientist-intent` vocabulary loader
  (`vocabulary.ts:39 defaultVocabularyDataPath` = `cwd/schema/scientist-intent/...`) fails at import
  and 8 suites fail to collect. With it, collection is clean.
- The `--hookTimeout=120000` flag: at the default 10s hook budget the store-boot `beforeAll` hooks
  time out under the concurrent lane load (`Hook timed out in 10000ms`), flaky-not-deterministic;
  with 120s the same suites pass. This affects collection timing only, not assertions.

## Not touched / follow-ups (out of scope, named so nobody assumes it is covered)

- `app/src/shared/api/client.ts:621` — the client mirror union still lacks `gc_fid`. `app/**` is
  prohibited for this unit; it is a display-side mirror only (measurement payloads are validated by
  Ajv against the YAML, which now carries gc_fid). Owner/orchestrator to schedule.
- Parser files (`aiaCdfParser.ts:237`, `agilent6890Parser.ts:331`, `parsers/types.ts:11`) still say
  `gc_ms` in TRUNK at this base — the parser branch's widening is u1's leg, explicitly not my seam.
- Test-local inline schema fixtures that spell their own enum (MeasurementService.test.ts:20,
  MeasurementActiveControlService.test.ts:21, MeasurementHandlers.applianceJob.test.ts:22) are
  throwaway temp schemas, not mirrors; left alone deliberately.

## Next action / resume condition

Ready for adversarial review; acceptance still owned by the reviewer (and by the orchestrator's
reload of the lane stack if a live AIA ingest is re-run against the schema — YAML changed, so the
lane stack must be reloaded before live verification).

L2-GC-AIA-PARSER-SHAPE-1 UNIT L2-GC-AIA-PARSER-SHAPE-1-u3enum DONE 230b366a88fd15e3ee0e3a1cfdb33cee0f76ea10
