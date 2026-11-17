# L2-GC-UPLOAD-UI-1 / unit r1recon — VERDICT (verification leg, not a build)

Item: L2-GC-UPLOAD-UI-1 (GC data path). Queue re-scope 2026-11-16T22:56: this item is the SAME
operation as L2-RUN-ACQUISITION-FILE-UPLOAD-1, and RUN-ATTACH-CAPABILITY-1 units landed
(926703ba0 / 52c73852d / 4b5c79e7d per `git log --grep=RUN-ATTACH`), so this unit is a
VERIFICATION leg: check (a)-(d) against the run surface, report satisfied/gaps, name seams only.
Base: cfc6d8347519da9c6299d1a9b8f9bcd2fe13c5bb. Branch: cl/lane2-gc-upload-ui-r1-0540.

## Where the operation lives on the run surface
- /runs/:runId = RunWorkspacePage (app/src/App.tsx:219). The GC attach panel
  (app/src/run/gc/GcAttachPanel.tsx) is the landed RUN-ATTACH capability: its only input is the
  .D directory-key text field (app/src/run/gc/GcAttachPanel.tsx:218-219, id gc-attach-key) and
  register is click-only (app/src/run/gc/GcAttachPanel.test.tsx:13). The panel owns NO file upload.
- The same operation's upload/parse/publish path is reached from the run-page toolbar via ONE
  "Results" link into the editor's results mode: app/src/run/RunWorkspacePage.tsx:241
  `href={\`/runs/${runId}/editor/results...\`}` (toolbar comment: "the ONE toolbar entry that
  makes the editor's `results` mode reachable from the run surface"); route registered at
  app/src/App.tsx:257 (`/runs/:runId/editor/:mode`); reachability tested at
  app/src/run/run-editor-results-route.test.tsx:73. This is ONE upload UI for the operation,
  not a second one.
- The upload/parse/publish UI itself is the results drawer in app/src/graph/LabwareEventEditor.tsx
  (file input :3949 `type="file"`, parser select :3913, summary :4003-4022) driven by the hook
  app/src/graph/hooks/useResultsMode.ts (uploadFile :614, parseSummary :530, error path :695-704).

## Baseline vitest (raw, from the first run at base; re-run identical)
$ cd app && npx vitest run src/run/gc/GcAttachPanel.test.tsx
  Test Files  1 passed (1)
       Tests  15 passed (15)
Second live probe on this item's path:
$ cd app && npx vitest run src/graph/hooks/useResultsMode.gc.test.tsx
  Test Files  1 passed (1) / Tests  3 passed (3)
(server vitest does not run in this worktree — ERR_MODULE_NOT_FOUND on node_modules; criterion
(d) therefore rests on the source chain cited below, not on a server probe.)

## Verdict per criterion

(a) binary-safe upload with the sha shown — SATISFIED.
    File input app/src/graph/LabwareEventEditor.tsx:3949 `type="file"` → uploadFile reads raw
    bytes, app/src/graph/hooks/useResultsMode.ts:618 `const buffer = await file.arrayBuffer()`
    → base64 → POST /measurements/upload-raw. Server stores non-UTF-8 (binary) instrument files
    UNCHANGED through the device blob store and returns the sha256 of the stored bytes
    (server/src/api/handlers/MeasurementHandlers.ts:216 `sha256: result.sha256, ... mode: 'binary'`;
    named refusals at :197 `error: 'EMPTY_FILE'` and :201 `error: 'FILE_TOO_LARGE'`). The hook
    shows EXACTLY the server's sha: useResultsMode.ts:634 `// anchor (sha256 of the stored bytes)
    — never computed client-side.` and :637 `setUploadedContentHash(response.sha256 ?? null)`;
    the UI renders it beside the upload (app/src/graph/LabwareEventEditor.tsx:3968
    `sha256: {resultsMode.uploadedContentHash.slice(0, 12)}…`, full value in the title attr).
    The runId the run page passes is threaded into the request (useResultsMode.ts:627-629).

(b) the GC parser offered with its units — GAP (partial).
    The GC parsers ARE offered: app/src/graph/hooks/useResultsMode.ts:19
    `{ value: 'agilent6890', label: 'Agilent 6890 GC-FID' },` and :21 `aia_andi_cdf`
    ("AIA/ANDI CDF (NetCDF)"), rendered by the select at app/src/graph/LabwareEventEditor.tsx:3913
    (asserted at app/src/graph/hooks/useResultsMode.gc.test.tsx:111-116). BUT the option objects
    carry value/label ONLY (useResultsMode.ts:15-22); units exist only AFTER a successful parse,
    derived from the parsed payload at useResultsMode.ts:185
    `const units = unitsParts.length > 0 ? unitsParts.join(' · ') : 'unstated'` — so a user
    choosing the GC parser is not told its units up front.
    Minimal seam: add an expected-units string to each PARSER_OPTIONS entry and render it in the
    option label or the select hint (LabwareEventEditor.tsx:3909-3918) so agilent6890 states
    "time: min · intensity: pA" before upload. (Not built this unit.)

(c) what the parser actually read shown beside the measurement id — SATISFIED.
    parseSummary is read back off the created measurement record and never synthesized:
    useResultsMode.ts:530-535 (`Read the created measurement back off the refreshed workspace ...
    summarize what the parser actually put in the record. Not (yet) readable -> null ...; nothing
    is synthesized.`). It is rendered in the same block as the record id:
    app/src/graph/LabwareEventEditor.tsx:4007 (parserId/version/units/rowCount), :4010
    (first/last points), :4013 `measurement <code title={...}>{resultsMode.parseSummary.recordId}</code>`.
    Test: useResultsMode.gc.test.tsx (c) asserts units 'time: min · intensity: pA', first/last
    points, and that the summary's recordId equals the ingested measurement id.

(d) a typed parser refusal surfaced verbatim — SATISFIED.
    Server raises typed refusals that quote the offending line verbatim:
    server/src/measurement/parsers/agilent6890Parser.ts:238-240
    (`new MeasurementServiceError('BAD_REQUEST', \`agilent6890 malformed data row at line
    ${entry.lineNo}: ${entry.line} — ...\``; :284-288 non-minute time axis; :327 no data rows);
    the handler serializes code + message (server/src/api/handlers/MeasurementHandlers.ts:281-283
    `return { error: err.code, message: err.message };` — same shape at :390 for ingest). The
    client composes the verbatim message: app/src/shared/api/errors.ts:60
    `message = \`\${errorCode}: \${errorText}\`` via ApiError.fromResponse
    (app/src/shared/api/client.ts:1662). The hook preserves it verbatim: useResultsMode.ts:695
    `// Preserve a typed server refusal verbatim (e.g. a parser's own` and :698
    `if (ApiError.isApiError(err)) {` → :699 `setError(err.message)`. The UI renders it untouched
    (app/src/graph/LabwareEventEditor.tsx:3998-4000, `data-testid="attach-error"`).

## Bottom line
3 SATISFIED (a, c, d) / 1 GAP (b, partial — GC parsers offered, but their units are not offered
with the parser choice; units only appear post-parse). No second upload UI exists: the run
surface carries exactly one Results entry (RunWorkspacePage.tsx:241) into the editor results
mode, which is where the landed L2-GC-RAW-BINARY-1 wire (merge 2bd733d11) is used.
Recommended next unit (seam, not built here): one-line PARSER_OPTIONS change closing (b).
Verdict: VERIFIED-WITH-ONE-GAP — the verification leg is closed; gap filed with its seam.
Nothing was built; no source files edited.

L2-GC-UPLOAD-UI-1 UNIT L2-GC-UPLOAD-UI-1-r1recon DONE 19fcc9d76d6c6532b8179a7ba9595cec022ae668

## u2units — closes criterion (b): parser options state expected units before upload

Commit: 917ddc2a28605ad6788469d8d12294df6fdc3a54 (code+test, one commit). Changed files (3,
19 insertions / 8 deletions, report excluded from the 80-line budget):

1. app/src/graph/hooks/useResultsMode.ts:15-22 — each PARSER_OPTIONS entry now carries an
   `expectedUnits` string; useResultsMode.ts:68 — `parserOptions` type widened to
   `Array<{ value: string; label: string; expectedUnits: string }>` (the `as const` + spread
   map at :937 propagates the field unchanged).
2. app/src/graph/LabwareEventEditor.tsx:3915 — the Parser <select> option now renders
   `{parser.label} — {parser.expectedUnits}` (label suffix, one of the two allowed renderings;
   quiet, no new DOM/classes/CSS).
3. app/src/graph/hooks/useResultsMode.gc.test.tsx:119-128 — new test (a2) asserts BEFORE any
   upload: agilent6890 option's expectedUnits mentions "min", aia_andi_cdf matches "from file",
   generic_csv is exactly "as stated in file".

Unit strings, grounded verbatim in parser source (BEDROCK, no invented units):
- agilent6890 -> "time: min (required); intensity: from file header"
    agilent6890Parser.ts:283-286 — non-minute time unit is refused: "this parser requires minutes
    for its timeMin field"; :279 `const intensityUnit = extractUnit(intensityCell) ?? UNSTATED`
    (read from the column header); :337 `units: { time: timeUnit, intensity: intensityUnit }`.
- aia_andi_cdf -> "time & intensity: from file"
    aiaCdfParser.ts:284 `units: { time: retentionUnit, intensity: intensityUnit }` (both read
    from the file).
- generic_csv / gemini_csv / abi7500_csv / metrohm761_csv_stub -> "as stated in file"
    `grep -n "units:" server/src/measurement/parsers/*.ts` shows ONLY the two GC parsers
    (agilent6890Parser.ts:337, aiaCdfParser.ts:284) declaring a units object; no non-GC parser
    source line was re-derived — the brief's sanctioned fallback applies.

Verification (real output, at base c62f60d33 then at final commit 917ddc2a2):
- RED first: with only the new test (a2) present, `npx vitest run
  src/graph/hooks/useResultsMode.gc.test.tsx` -> "1 failed | 3 passed (4)", failing at
  `expect(agilent?.expectedUnits).toBeDefined()` (AssertionError: expected undefined not to be
  undefined, useResultsMode.gc.test.tsx:124). Pre-existing (a)/(b)/(c) stayed green in the same run.
- GREEN: after the code change, same command -> "Test Files  1 passed (1) / Tests  4 passed (4)".
- Typecheck `npx tsc --noEmit -p .` in app/: 26 pre-existing errors at base
  (SchemaRecordForm.tsx, RefCombobox.ontologyref.test.tsx, tabNavPlugin.ts, ajv/yaml module
  resolution, etc.) — `diff` of base vs final tsc output: identical, ZERO new errors.

Acceptance: (1) agilent6890 option states expected units before any upload — test-asserted
(a2), RED-first; (2) every units string grounded in a cited parser source line above; (3)
criterion (b) closes — the GC parser is now offered with its units at the choice point.
No server code, run-surface components, records/, schema/ or other panel touched.

L2-GC-UPLOAD-UI-1-u2units UNIT L2-GC-UPLOAD-UI-1-u2units DONE 917ddc2a28605ad6788469d8d12294df6fdc3a54
