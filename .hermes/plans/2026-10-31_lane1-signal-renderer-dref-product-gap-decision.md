# LANE 1 DECISION — L1-SIGNAL-DREF-1: GC-7 chromatogram renders blank
# DECISION: OPT-A (generic content route for the `signal` renderer)

Date: 2026-10-31 (architect, lane 1)
In response to: `2026-10-31_lane1-signal-renderer-dref-product-gap-decision-request.md`
Status: binding decision for lane-1 orchestrator. This request re-asked no prior
question; this file answers only the gap fix + the timing sub-question.

## Decision: OPT-A — give SignalView the OQ-1(a) DREF content route, GENERICALLY

Fix the renderer side, app/ only. Engine and runner untouched; the never-inline
doctrine (analysisGcIntegration.test.ts:390-399) is honored, not worked around.

### Grounding (architect spot-checks on pristine trunk @ 8f9f6259, product files
### identical to the harness branch 73092951 — all request cites hold, plus:)

1. Confirmed the chain: `ctx.publish_file` sets `blob` unconditionally
   (ctx.py:299-312, `value=p.name` = filename); GC-7 publishes
   `signal_plus_baseline` only via publish_file (peak_integration.py ~:1106-1108)
   and emits exactly `peak_table_view` + `signal_view` (renderer `signal`,
   ~:1127-1128); `analysisRunner.ts:409-419` routes every blob artifact to
   storage; `SignalView` (ViewRenderer.tsx:94-119) reads `inlineValue` only and
   silently draws an empty polyline — the silent blank IS the defect shape.
2. **Plumbing already exists end-to-end.** `AnalysisPage.tsx` toRenderable
   (:795-809) already stamps each RenderableArtifact with `id` (the AOUT record
   id) and `dataReferenceRef.id` on BOTH doors (client-synthesis and
   persisted-record). `ChromatogramView` (:94-115) fetches via
   `apiClient.getAnalysisArtifactContent(aoutId)` — the ratified OQ-1(a) route.
   So SignalView needs no page change and no new channel: same artifact prop,
   same fetch, same parse.
3. **The parser is already shared.** `traceModel.parseTraceValue`
   (traceModel.ts:145-161) is explicitly "shared by inline and the OQ-1(a)
   content-route bytes"; it reads `axis`/`values` (exactly the GC-7 payload
   keys, peak_integration.py:1094-1102) and pulls unit strings from the data
   (`axis_units`/`value_units`). SignalView currently re-derives axis/values
   ad-hoc (:96-97); routing through parseTraceValue removes a second parser.
4. **Decisive extra fact the request did not carry:** `analysisAuthoring.ts:78`
   — the shipped authoring prompt tells python-analysis authors that the valid
   renderers are `table, signal, metric, static-figure`. `signal` is the ONLY
   trace renderer available to every authored engine, and any authored
   blob-backed signal artifact is blank today exactly like GC-7. OPT-B fixes
   GC-7 alone and leaves this whole class broken. This is the strongest
   argument against OPT-B and for OPT-A-generic.
5. view-spec.schema.yaml:41 already allows `signal` — no schema edit needed.
   No new vocabulary: `signal` and `chromatogram` are established ids; the fix
   adds neither a third renderer nor a GC-specific branch.

### Why not OPT-B (engine emits `chromatogram`)
- Fixes only GC-7; every other engine and every authored analysis publishing
  `signal` stays blank (see 4 above).
- Touches the python engine + the engine's published view contract — larger
  blast radius for strictly less coverage.
- GC-10 ruled OQ-3 explicitly: the static `signal` polyline is *preserved*,
  `chromatogram` was added as a NEW id, not a replacement (schema comment
  :31-33; ChromatogramView header "Replaces ... for `chromatogram` view-specs").
  OPT-B quietly reverses that ratified ruling; that would need Brad, not me.

### Why not OPT-C now
The `signal`→`chromatogram` graduation question (should GC-7's richer payload —
baseline, integration_windows — ride the interactive view with markersFrom
bindings?) is a real product-shape question, but it is independent of the
defect fix and must not gate J1. Recorded as a carried intake observation
below, not as a task — no invented tasks per the request's own rule.

## Ruling: the content route is GENERIC, not GC-specific

SignalView's rule, stated declaratively, is: *a view renders its artifact's
payload from wherever the artifact data says the payload is.* If
`inlineValue` is present, read it; else if `dataReferenceRef` is present,
resolve the bytes via the OQ-1(a) route (fetch by the AOUT record id, exactly
the ChromatogramView pattern). Zero knowledge of GC-7, of point counts, of
sizes, or of any engine. This is the same data-follows-the-reference principle
ChromatogramView/CompareTraces/extractTrace already obey — this makes
SignalView *conform to existing machinery*, not add parallel machinery.

## Spec shape the orchestrator should author (lane-1 product task)

- Ownership: `app/` (+ `.hunks`) only. ViewRenderer.tsx SignalView; test file
  for the signal renderer. No schema/, server/, engine, or AnalysisPage edits
  (page already passes id + dref ref).
- Behavior:
  - inline present → render inline (current behavior preserved, no regression
    for inline-backed signal views).
  - dref-backed → fetch via `apiClient.getAnalysisArtifactContent(artifact.id)`;
    show a named loading arm meanwhile.
  - fetch failure → NAMED error arm (never a silent blank — the silent empty
    polyline is the very defect).
  - no payload by either route → NAMED empty arm, not a blank SVG pretending a
    trace is there.
  - parse via `parseTraceValue` (units from the data; render the data-carried
    axis/values; keep the compact 320x120 geometry — graduation to the
    interactive chromatogram is NOT part of this task).
- Tests (harness-independent acceptance):
  - unit: dref-backed signal artifact with mocked content fetch renders a
    multi-point polyline; fetch error renders the named error arm; no-data
    renders the named empty arm; inline-backed still renders.
  - existing doctrine untouched: analysisGcIntegration.test.ts never-inline
    assertions must pass unchanged; view-spec schema untouched.
- Browser gate: required (UI change). Receipt must show a real GC-7 run page
  with a visible trace inside `[data-testid=view-spec-signal]`.

## Sub-question — timing: AGREE with the orchestrator: lane-1 product task NOW

Not next-intake scope. Reasons:
1. L1-TRUNK-JOURNEYS-1's J1 acceptance ("chromatogram visible on a GC-7 run")
   is exactly what this fix delivers; the item is otherwise fully proven
   (harness healthy, canary seam-proven, check-green decline demonstrated,
   typecheck parity, harness-only diff). Deferring strands an earned item.
2. The fix is app-side, small, and rides machinery that already ships
   (OQ-1(a) route, parseTraceValue, page plumbing) — a clean single spec.
3. Meanwhile every user on every stack gets a blank trace on a *successful*
   GC-7 run; this is a live product defect, not a nice-to-have.
Sequencing per the request: orchestrator authors the spec; L1-TRUNK-JOURNEYS-1
stays in-progress with the branch preserved at 73092951; the fix lands as its
own task with `.hunks` + browser gate; then the journeys harness re-runs for
the green J1+J2 lap and the canary green arm on top of the fix.

## Carried intake observations (record only, no tasks invented)
- GC-7 `signal` → `chromatogram` graduation question (rich payload + peak
  markers via markersFrom bindings on the interactive view; OQ-3 revisit) —
  needs Brad's product-shape call at next intake if anyone wants it.
- `app/src/shared/api/client.ts` `advanceRecordState` (:3996) targets an
  unregistered route — dead code (recorded).
- GC-17 carriers unchanged (recorded).

— architect, lane 1. No code written by this decision; product files read
read-only from pristine trunk with `-c core.fileMode=false`.
