# Fix-it: MeasurementService emits invalid fileRef shape, blocks every measurement record

## TL;DR

The `instrument-appliance-job` execution path returns HTTP 400 ("Validation
failed") for every real read, after the reader fires and the CSV is written.
Root cause is a snake_case/camelCase mismatch between
`server/src/measurement/MeasurementService.ts:152-160` (camelCase
`uri`/`mimeType`/`label`) and `schema/core/datatypes/file-ref.schema.yaml`
(snake_case `file_name`/`media_type`, with `additionalProperties: false`).

No measurement record can be created by any caller of `MeasurementService.ingest`.

## Severity / blast radius

Blocks **every** active read on the appliance from completing successfully.
The reader actually runs (lamp fires, CSV is written into
`records/inbox/`), the cla-lab git adapter commits the
`instrument-appliance-execution-record` with status=`failed`, and the
operator sees "Validation failed" in the UI. No `MSR-*` records have ever
been created in the appliance's records repo — first surfaced as soon as
the first user attempted a real read.

## Reproduction

On `appliance-01` (`192.168.68.56`) running cla-lab @ `d15503b`:

1. Open the AI chat panel.
2. Ask for a fluorescence read on a populated plate (e.g. CellROX Deep Red
   at 644/665 nm).
3. Approve the suggested `InstrumentApplianceJob`.
4. The reader fires (lamp on, plate scans). After ~45 s the UI reports
   "Validation failed" and the run is marked failed.

Concrete artifacts from the failed run:

- CSV: `/var/lib/computable-lab/workspaces/main/records/inbox/gemini-em-mctx-pl-mpluvfou-1-cellrox-deep-red-1.csv`
  (1023 bytes, 45 wells with valid RFU values, header
  `Well,RFU,Wavelength,Read`).
- Execution record: `records/instrument-appliance-jobs/gemini-em-mctx-pl-mpluvfou-1-cellrox-deep-red-1-2026-05-25T23-47-17-559Z.json`
  committed as `b519308` with the error block:

  ```json
  "error": {
    "code": "CREATE_FAILED",
    "message": "Validation failed",
    "statusCode": 400
  }
  ```

- HTTP 400 returned by `POST /api/measurements/appliance-jobs/execute` in
  45.1 s wall clock (45 s is dominated by the actual physical read; the
  validation fail is the last sub-step).

## Diagnosis trail

1. `plr-instrument-service` journal shows `POST /labos/gemini/read` returned
   200 — the bridge handed cla-lab a valid `labos-bridge/v1` envelope with
   `result.rawDataPath` pointing at the CSV.
2. cla-lab backend journal shows the POST landed, ran for 45 s, returned
   400. No error-level log line because the Ajv validator message is empty;
   only a "request completed" line at status=400 is emitted.
3. The execution record committed by the handler captures the propagated
   error code and message above.
4. Following the code path in
   `server/src/api/handlers/MeasurementHandlers.ts:278`:
   ```ts
   const result = await activeControl.performActiveRead(...)
   ```
   → `MeasurementActiveControlService.performActiveRead` calls
   `this.measurements.ingest({...})` at line 237.
   → `MeasurementService.ingest()` succeeds at parser dispatch (the
   `gemini_csv` parser tolerates skipped/NaN wells) and reaches
   `this.ctx.store.create({...})` at line 173.
   → Store rejects the record; `MeasurementService.ts:182` throws
   `MeasurementServiceError('CREATE_FAILED', result.error ?? 'failed to
   persist measurement', 400)`. `result.error` is the Ajv-supplied string
   "Validation failed" (`AjvValidator.ts:41`).
5. Cross-checking the payload `MeasurementService.ingest` constructs
   (lines 135-172) against `measurement.schema.yaml` and its `$ref`s
   surfaces one obvious mismatch — `artifacts[].fileRef`.

## Root cause

`MeasurementService.ts:152-160` builds the artifact:

```ts
artifacts: [
  {
    role: 'raw_data',
    fileRef: {
      uri: rawPath,
      mimeType: parsed.mimeType,
      label: 'Raw measurement CSV',
    },
  },
],
```

But `schema/core/datatypes/file-ref.schema.yaml` is:

```yaml
type: object
additionalProperties: false
required: [ file_name, media_type ]
properties:
  file_name:    { type: string }
  media_type:   { type: string }
  source_url:   { type: string, format: uri }
  size_bytes:   { type: integer, minimum: 0 }
  sha256:       { type: string }
  stored_path:  { type: string }
  page_count:   { type: integer, minimum: 1 }
```

Three failures at once:

| Producer key | Schema verdict |
|---|---|
| `uri` | unknown key → rejected by `additionalProperties: false` |
| `mimeType` | unknown key → rejected by `additionalProperties: false` |
| `label` | unknown key → rejected by `additionalProperties: false` |
| (`file_name` missing) | required key absent |

The validator stops at one of these; the message bubbles up as a bare
"Validation failed". The caller never gets enough detail to triage from
the response alone — see the follow-up note below.

## Proposed fix (option 1: fix the producer)

Patch `server/src/measurement/MeasurementService.ts`, lines 152-160 (in
`MeasurementService.ingest`):

```ts
artifacts: [
  {
    role: 'raw_data',
    fileRef: {
      file_name: rawPath.split('/').pop() ?? rawPath,
      media_type: parsed.mimeType,
      stored_path: rawPath,
    },
  },
],
```

This satisfies the schema's required fields, uses the existing
`stored_path` field to retain the in-repo path (operator/UI can still link
to it), and drops `label` (which has no home in the current schema).

Tests to add or extend:

- `server/src/measurement/MeasurementService.test.ts` — assert the
  resulting payload validates against `measurement.schema.yaml` via the
  Ajv validator (catch this class of bug at unit-test time, not at first
  customer read).
- Consider a generator test that round-trips every schema producer
  against `additionalProperties: false` ref'd types.

## Considered alternatives

**Option 2: change the schema** to accept camelCase keys (rename or alias
`uri`→`file_name`, `mimeType`→`media_type`, allow `label`). Rejected
because (a) every other producer that already follows snake_case would
need to be migrated or aliased, and (b) the existing schema shape
(`file_name`/`media_type`/`size_bytes`/`sha256`/`stored_path`) is the more
useful one — `uri` is ambiguous about whether it's a local path, repo
path, or external URL.

**Option 3: surface the Ajv errors** in
`server/src/validation/AjvValidator.ts:41`. Not a fix for this bug per
se, but the reason the bug took ~an hour to diagnose is that the
validator's error stringification collapses to "Validation failed" when
`error.message` is absent. Recommended as a follow-up regardless of which
fix lands here — include the failing instance path + the schema rule
(`additionalProperties`, `required`, etc.) in the message. Would have made
this ticket a one-line bug report.

## Verification

After fix:

1. Re-deploy cla-lab to `appliance-01`
   (`ansible-playbook -i inventory/appliance-01.ini playbooks/site.yml --tags cla-lab`
   from the [[cl-appliance]] repo, bumping `cla_lab_git_ref` in
   `appliance.lock.yaml`).
2. From the AI chat panel, run the same Gemini EM job that just failed.
3. Confirm:
   - HTTP 201 from `POST /api/measurements/appliance-jobs/execute`.
   - A new `MSR-000001` record appears under `records/measurements/`
     (this will be the appliance's first one).
   - The execution record commits with `status: completed`.
   - The `gemini-em-...csv` reference in the measurement payload's
     `artifacts[0].fileRef` validates against `file-ref.schema.yaml` and
     resolves to the on-disk CSV.

## Context

- cl-appliance repo: <https://github.com/brad-usredoxlabs/cl-appliance>
- The bridge endpoint that supplies the CSV is documented in
  `docs/cl-appliance-plr-bridge.md`.
- cla-lab SHA in production at time of report: `d15503b`.
- Diagnostic done collaboratively with Claude on 2026-05-25.
