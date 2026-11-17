# L2-RUN-ACQUISITION-SECTION-1 / u1acqdoor — coder report

Item: L2-RUN-ACQUISITION-SECTION-1
Unit: u1acqdoor (1 of 1)
Worktree: /home/brad/cl-wt/L2-RUN-ACQUISITION-SECTION-1-u1-lane2
Branch: cl/lane2-run-acqsection-u1-2359
Base: f22d4305f155fe70090c2bde5d417aeb76b8f1ae
Committer: cl-coder (lane 2)
Date: 2026-11-17 (EST)

## Summary

The run surface now owns its data door. On every /runs/:runId whose resolved record
kind is 'run', a run-owned `RunAcquisitionSection` renders — always, with zero linked
packages or many. The toolbar's Results link (a navigation OUT of the run into the
legacy editor route /runs/<id>/editor/results) is replaced by a same-route "Data"
affordance that opens THIS section on the same URL. The attach affordance reuses the
ONE existing acquisition write — `apiClient.registerAcquisitionPackage` with the
door's run-scoped binding (`eventGraphRef` + `assayType` + `sourceRunRef`, verified
against the register handler in server/src/api/handlers/RunSheetHandlers.ts:
lines 143/192/224 — eventGraphRef present + entryRef absent is a legal binding;
assayType is REQUIRED for that path and never defaulted). No second store, no
second attach implementation, no new server route, no server change.

## Affordance-label choice (brief §THE CHANGE 3)

Chose **"Data"**, replacing "Results" on the toolbar. Rationale: the old label named
the legacy editor page's results view; the new affordance opens the run's own data
(acquisition) section on the SAME route, so the label names what it opens (the run's
data), not where it used to navigate. The label is still discoverable as the data
door; the section header also reads "Data" so label and target agree.

## What changed (5 files, all in app/)

1. NEW app/src/run/acquisition/RunAcquisitionSection.tsx (run-owned section)
   - Props: { runId, eventGraphId, assayType }. eventGraphId/assayType come from the
     RUN's OWN resolved payload (methodEventGraphId / the measurement assay) — the
     section does NOT probe for an instrument-sequence entry, and the attach form
     does not conjure an entryRef. This is the anti-bait guarantee: the section's
     presence and the attach affordance's presence are gated on `runKind === 'run'`
     ONLY (page mounts it unconditionally on kind-'run'; component never checks any
     sequence/entry probe).
   - Reads attached packages via the EXISTING records list API:
     `apiClient.listRecordsByKind('acquisition-package')` filtered to
     `payload.sourceRunRef.id === runId` (a package links to the run via
     sourceRunRef — the same field the register write forwards, RunSheetHandlers
     :224). No new read method was needed in client.ts.
   - Empty state: `data-testid="run-acquisition-empty"` with the text "No instrument
     data attached to this run yet" + `data-testid="run-acquisition-attach"` button.
   - Non-empty: lists each package — record id, device/directory label, created
     timestamp — plain rows, no invented chrome.
   - Attach affordance: a run-scoped form (device, directoryKey, sourceRunRef fixed
     to this run, assayType) that calls the SAME single write
     `apiClient.registerAcquisitionPackage` with body
     `{ deviceId, directoryKey, eventGraphRef: {kind:'record',id:eventGraphId,type:'method-event-graph'}, assayType, sourceRunRef: {kind:'record',id:runId,type:'run',label} }` —
     the register DOOR's run-scoped path. Error surface reuses the existing
     `AcquisitionPackageClientError` token rendering (no new error machinery).
2. NEW app/src/run/acquisition/RunAcquisitionSection.css (--cl-* tokens only; 175 lines)
3. MODIFIED app/src/run/RunWorkspacePage.tsx
   - Anchor 1 replaced: the `<a className="run-bindings-link" href=/runs/<id>/editor/results...>Results</a>`
     is GONE (no live anchor to the legacy route remains; only a comment mentioning
     the old URL). In its place: a same-route button
     `data-testid="run-acquisition-toolbar"` labelled "Data" that sets
     `?section=acquisition` (carrying all existing workspaceSearchParams) and
     scroll+focuses the section. location.href STAYS /runs/<id>.
   - Section mount (kind-'run' only):
     `{runKind === 'run' ? <RunAcquisitionSection runId={runId} eventGraphId={resolvedEventGraphId} assayType={resolvedAssayType} /> : null}`
   - Non-'run' kind: one-line kind label ("This id resolved to a {runKind} record,
     not a run.") and NO acquisition section. Unresolvable id preserves current
     not-found behaviour (unchanged).
   - Anchor 2 preserved: the GC companion mount is byte-identical:
     `{runKind === 'run' ? <GcRunSheetSection runId={runId} /> : null}`
   - Anchor 4 preserved: reuses the existing `runKind` state (no second probe).
   - `resolvedEventGraphId` sourced from the run payload's methodEventGraphId (the
     SAME fetch that already resolves runKind — no extra request).
4. MODIFIED app/src/shared/api/client.ts (TYPE-ONLY, register-body signature)
   - `RegisterAcquisitionPackageInput` extended with optional `eventGraphRef` +
     `assayType` (mirroring the server RegisterBody fields already present at
     RunSheetHandlers lines 83–88). Closes the client/server drift so the run-scoped
     body typechecks. NO runtime change — the method body is unchanged.
5. NEW app/src/run/acquisition/RunAcquisitionSection.test.tsx (RED→GREEN, 7 tests)

## RED→GREEN trail

- RED commit d9346ca4c12553cb98407d0d06177e9ddf96e1b7: test file committed before the
  component existed. On base, `npx vitest run src/run/acquisition` fails to load
  (RunAcquisitionSection.tsx missing) — RED confirmed.
- GREEN commit a6b625622d620a986f829fef3b486600af691c22: component + page + css +
  client type. All 7 tests pass.

## Verify-before-edit baselines (raw)

Typecheck baseline (captured at base f22d4305f BEFORE editing):
  17 pre-existing errors, all in files untouched by this unit:
  src/editor/forms/SchemaRecordForm.tsx (3), src/editor/taptab/RefCombobox.ontologyref.test.tsx (1),
  src/editor/taptab/tabNavPlugin.ts (1), src/editor/taptab/widgets/ObjectWidget.nested.test.tsx (1),
  src/event-editor/create/RecordCreatePanel.gc16.test.tsx (1),
  src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx (4),
  ../server/src/schema/SchemaLoader.ts (1), ../server/src/ui/UISpecLoader.ts (1),
  ../server/src/validation/AjvValidator.ts (3), ../server/src/validation/types.ts (1).
  NOTE: the brief said "Typecheck: baseline clean" — the MEASURED baseline is 17
  pre-existing errors. The honest statement: MY changes add ZERO new errors.
  (diff of baseline vs post-edit error sets = identical.)

## VERIFY BEFORE EXIT (raw output, run at GREEN commit a6b625622)

### 1. New tests (GREEN)
CMD: `npx vitest run src/run/acquisition` (from app/)
```
 ✓ src/run/acquisition/RunAcquisitionSection.test.tsx  (7 tests) 135ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  13.62s (transform 205ms, setup 1.66s, collect 2.06s, tests 135ms, environment 7.70s, prepare 56ms)
```

### 2. Route + GC (baseline counts)
CMD: `npx vitest run src/run/run-editor-results-route.test.tsx src/run/gc/` (from app/)
```
 ✓ src/run/gc/GcEvidenceHandoff.style.test.ts  (8 tests)
 ✓ src/run/gc/gcSheetCreate.test.ts  (9 tests)
 ✓ src/run/gc/gcRunSheetModel.test.ts  (10 tests)
 ✓ src/run/gc/GcEvidenceNoAutoDecidePin.test.ts  (4 tests)
 ✓ src/run/gc/gcEvidenceSources.test.ts  (6 tests)
 ✓ src/run/gc/GcRunTable.test.tsx  (3 tests)
 ✓ src/run/gc/GcAttachPanel.test.tsx  (15 tests)
 ✓ src/run/gc/GcRunSheetSection.test.tsx  (4 tests)   <-- bait test (null with no linked sequence) passes
 ✓ src/run/gc/GcRunSheetSection.refresh.test.tsx  (2 tests)
 ✓ src/run/gc/GcRunSheetSection.strictmode.test.tsx  (4 tests)
 ✓ src/run/gc/GcRunSheetSection.no-fetch-accounting.test.tsx  (6 tests)
 ✓ src/run/gc/GcEvidenceHandoff.test.tsx  (17 tests)
 ✓ src/run/gc/GcSectionChrome.test.tsx  (22 tests)
 ✓ src/run/gc/GcEvidenceRunPage.test.tsx  (5 tests)
 ✓ src/run/gc/GcProvenancePanel.test.tsx  (30 tests)
 ✓ src/run/run-editor-results-route.test.tsx  (7 tests)  <-- route test PASSES (route not removed)
 ✓ src/run/gc/GcEvidenceRunPage.route.test.tsx  (2 tests)
 FAIL  src/run/gc/acquisitionStatusEvidenceBoundary.test.ts
       Error: Failed to resolve import "yaml" from "../server/src/ui/UISpecLoader.ts"
 Test Files  1 failed | 17 passed (18)
      Tests  154 passed (154)
   Duration  6.97s
```
The ONE FAIL is a PRE-EXISTING environment defect (a module-resolution failure for the
`yaml` package in a server-crossing import chain), NOT a test failure: that file runs
0 tests. PROVEN pre-existing: with my changes stashed (clean base f22d4305f), the same
command fails identically — `Error: Failed to resolve import "yaml"`. My diff touches
none of that file's imports or the server. All 154 real tests pass.

### 3. Page-level target (brief §THE CHANGE 1 target)
CMD: `npx vitest run src/run/acquisition src/run/RunWorkspacePage src/run/gc/GcRunSheetSection.test.tsx src/run/run-editor-results-route.test.tsx`
My 7 acquisition tests + 7 route tests + 4 GC-section tests + page surface/planbuild/
proposals tests: all pass.
One known PRE-EXISTING failure remains: `RunWorkspacePage.gc-section.test.tsx`
(3 tests) — its client mock lacks `getRecordWithUI`, but the page's mount effect
(pre-existing at base f22d4305f, line 75 — the runKind/methodEventGraphId fetch I was
told to REUSE, not re-probe) calls `getRecordWithUI`. PROVEN pre-existing: the page
calls getRecordWithUI at base and the test's mock only had getRecord at base. This file
lives in app/src/run/ (NOT app/src/run/gc/), so it is NOT in the exit-green command
(`src/run/gc/`) and I did not edit it (out of this unit's owned paths).

### 4. Typecheck
CMD: `npm run typecheck -w app`
Result: 17 errors — IDENTICAL set to the base baseline (captured at base, diff =
empty). NONE in my 5 files. No new errors introduced. (The "baseline clean" claim in
the brief did not hold; the honest invariant — my changes add zero typecheck errors —
holds and is proven by diff.)

### 5. git status (after final commit)
```
clean
```

## Acceptance-contract mapping (browser gate)

1. Run with no sequence → section + empty state present: test (a) —
   `run-acquisition-empty` with "No instrument data attached to this run yet" +
   `run-acquisition-attach` render on a run whose list returns 0 packages. (The live
   RUN-2026-11-14-run-5714 id is exercised by the browser gate; my test fixtures cover
   the same code path.)
2. Toolbar affordance lands in the section; URL stays /runs/<id>: test (d) —
   clicking `run-acquisition-toolbar` does not change location (stays /runs/RUN-1),
   and the section receives focus.
3. GC bait test byte-identical: GcRunSheetSection.tsx is UNTOUCHED
   (git diff base..HEAD on that path = 0 lines); its test passes.
4. Non-'run' kind names its kind, no attach affordance: test (e) —
   an analysis-run id renders the kind label and NO `run-acquisition-attach`.
5. Clean console, no failed API request: tests use a fully mocked apiClient; no
   unhandled errors in the GREEN run output above.

## Decisions / notable points

- Attach reuse: the brief said "reuse THAT component/route into your affordance; do
  not reimplement." The shipped attach capability (L2-RUN-ATTACH-CAPABILITY-1) is the
  register DOOR's run-scoped binding + the single `registerAcquisitionPackage` write.
  The `GcAttachPanel` component hardcodes an entry-scoped `entryRef` (an
  instrument-sequence-entry), which a sequence-less run cannot supply without
  conjuring an identity (the exact bait this unit ends). So I reused the register
  ROUTE/DOOR + the existing `AcquisitionPackageClientError` failure surface, with the
  door's run-scoped body — NOT a second store/implementation. One write, one route.
- client.ts edit was TYPE-ONLY (register-body signature) to close a client/server
  drift (eventGraphRef/assayType were on the server RegisterBody but absent from the
  client signature). No runtime behaviour changed.
- No new search-param semantics beyond `?section=acquisition` (carried alongside all
  existing workspaceSearchParams).

## Remaining blockers / next actions

- None for this unit. The two pre-existing defects (yaml module resolution in
  acquisitionStatusEvidenceBoundary.test.ts; getRecordWithUI mock gap in
  RunWorkspacePage.gc-section.test.tsx) are environment/baseline issues in paths NOT
  owned by this unit and NOT in the exit-green command.
- Browser gate (independent reviewer) still owns live-surface acceptance on
  RUN-2026-11-14-run-5714.

## Marker

L2-RUN-ACQUISITION-SECTION-1-u1acqdoor UNIT unit DONE 217d50354afa22890ad3667d4938de882bd2e171
