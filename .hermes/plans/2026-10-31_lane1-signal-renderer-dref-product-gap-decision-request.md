# LANE 1 DECISION REQUEST — L1-SIGNAL-DREF-1: GC-7 chromatogram renders blank (product gap found by L1-TRUNK-JOURNEYS-1)

Requested by: lane-1 orchestrator tick, 2026-10-31T15:50 EDT (214th).
Decision path (watch): `/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-31_lane1-signal-renderer-dref-product-gap-decision.md`
Answer format: OPT-A / OPT-B / OPT-C(+shape) with rationale; dated. Silence keeps L1-TRUNK-JOURNEYS-1 in-progress; this request does NOT re-ask any prior question.

## The gap (one line)
A GC-7 analysis run genuinely succeeds end-to-end (peak table inline, real peaks),
but the chromatogram trace renders BLANK: the engine publishes its signal artifact
via `ctx.publish_file` (always blob-backed), the runner always storage-persists
blob artifacts, and the app's `signal` renderer reads `inlineValue` only — so
`view-spec-signal` draws an empty polyline at every point count.

## Evidence (all orchestrator-verified first-hand on branch wt/l1-trunk-journeys-1-lane1 @ 73092951, harness-only diff — product files read from the pristine branch state)
1. `server/python-executor-service/src/computable_lab_analysis/ctx.py:295-312` —
   `publish_file()` sets `blob={path,...}` UNCONDITIONALLY, `value=p.name` (filename).
2. `.../peak_integration.py:1127-1128` — GC-7 publishes exactly two views:
   `peak_table_view` (table) and `signal_view` (renderer `signal`). No
   `chromatogram` view is ever emitted by any python engine
   (grep of all `ctx.view` call sites: calibration/quantification publish tables only).
3. `server/src/analysis/analysisRunner.ts:409-419` — `if (page.blob || isLarge)` ->
   storage; `isLarge` measures the FILENAME length for publish_file pages, so the
   50k threshold is never the operative branch — blob => storage, always.
4. `app/src/analysis/ViewRenderer.tsx:94-119` — `SignalView` consumes
   `artifact.inlineValue` only; with no inline value it renders an SVG with empty
   `points`. The `chromatogram` case (:180-186) routes to `ChromatogramView`, which
   DOES resolve DREF content via the OQ-1(a) content route
   (CompareTraces.tsx:67-73 uses the same channel).
5. Stored-record ground truth (harness receipts
   `/home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS/2026-10-31T1931/data/...`):
   the DEFINITIVE 300-point probe — DREF content 17.5 KB (under every threshold
   interpretation) — artifact `AOUT-000002__signal_plus_baseline.yaml` has
   `dataReferenceRef` + `format: json`, NO `inlineValue`; step.log
   `diagChromatogram {"views":["view-spec-signal"],"signalPoints":0,...}`.
   Same at 900 pts (1926 set). Screenshot: `.../2026-10-31T1939/screenshots/J1-j1-chromatogram.png`.
6. Product test doctrine AGREES the artifact is intentionally never-inline:
   `server/src/analysis/analysisGcIntegration.test.ts:390-399` asserts
   DREF-backed + `inlineValue` undefined. So the fix is NOT "make it inline" —
   the renderer side is the missing half.
7. Prior triage closed: run #1's "5000-pt crosses the isLarge threshold" theory is
   FALSIFIED by (5) — 300 pts, 17 KB, still blob-backed, still blank. This is not a
   fixture/harness issue.

## Why this is a real product defect, not just a harness problem
Any user running GC-7 on any stack gets a successful analysis with an empty trace
chart. The OQ-1(a) content route already exists and is used by `ChromatogramView`
and `CompareTraces`; `SignalView` was simply never wired to it. L1-TRUNK-JOURNEYS-1
earned its keep on its first full lap.

## Options for the decision
- OPT-A (app-side, smallest): give `SignalView` the OQ-1(a) DREF content route —
  same `contentFetch`/`extractTrace`-style channel `ChromatogramView`/`CompareTraces`
  already use (fetch-by-DREF-id; the analysis page already passes artifact refs).
  Engine + runner untouched; doctrine (never-inline) preserved. Ownership: app/.
- OPT-B (engine-side): GC-7 emits a `chromatogram` view for `signal_plus_baseline`
  instead of/in addition to `signal`, reusing `ChromatogramView` wholesale. Touches
  the python engine + possibly view-spec schema; other engines that publish `signal`
  artifacts stay blank unless also migrated.
- OPT-C: both, as a follow-up campaign, if the architect wants `signal` to be a
  general blob-capable renderer AND GC-7 to graduate to the richer chromatogram view.

Sub-question (only if OPT-A): does the fix belong as a lane-1 product task NOW
(spec authorable this lane; browser gate required) or as next-intake scope, with
L1-TRUNK-JOURNEYS-1 staying in-progress (branch preserved at 73092951) until it lands?
The orchestrator recommends: lane-1 product task now — J1's green run is the item's
acceptance and the fix is small, but the scope call is yours.

## Carried intake observations from the same run (record only, no invented tasks)
- `app/src/shared/api/client.ts` `advanceRecordState` (:3996) targets
  `PUT /records/:id/lifecycle/advance` — not a registered route; dead code.
- GC-17 carriers unchanged.
