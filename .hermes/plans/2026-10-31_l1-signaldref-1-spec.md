# L1-SIGNALDREF-1 — SignalView gets the generic OQ-1(a) DREF content route
Spec authored by the orchestrator from the BINDING architect decision
`.hermes/plans/2026-10-31_lane1-signal-renderer-dref-product-gap-decision.md`
(OPT-A generic; sub-question answered: lane-1 product task NOW — the decision text IS
the approval artifact). Branch off `cl/integration-1`, worktree
`/mnt/vast/home/brad/git/wt/l1-signaldref-1-lane1`, branch
`wt/l1-signaldref-1-lane1`.

## Defect (verified first-hand by the orchestrator, 2026-10-31)
GC-7 publishes its `signal_plus_baseline` artifact ONLY via `ctx.publish_file`
(blob-backed; `analysisGcIntegration.test.ts:390-399` asserts never-inline BY DOCTRINE).
`analysisRunner.ts:409-419` routes blob artifacts to storage, so the AOUT record has
`dataReferenceRef` and NO `inlineValue`. `SignalView` (app/src/analysis/ViewRenderer.tsx:94-119)
reads `artifact.inlineValue` ONLY and silently draws an EMPTY polyline -> every successful
GC-7 run renders a blank chromatogram. Any authored engine using the `signal` renderer
(the only trace renderer in the authoring prompt vocabulary, analysisAuthoring.ts:78) is
broken the same way.

## Fix (app/ ONLY — no server/, schema/, engine, or AnalysisPage edits)
Rule, stated declaratively (decision's ruling): *a view renders its artifact's payload
from wherever the artifact data says the payload is.* In `SignalView`:
1. `inlineValue` present -> render inline (current behavior, zero regression).
2. Else `artifact.dataReferenceRef?.id` present (and `artifact.id` present) -> fetch via
   `apiClient.getAnalysisArtifactContent(artifact.id)` — the AOUT record id, NEVER the
   dref id (the handler 400s NOT_ARTIFACT on a dref id; same as ChromatogramView.tsx:90-113,
   which is the pattern to follow, including the unmount-cancel `on` flag).
   Show a NAMED loading arm meanwhile (text the user can see, e.g. `Signal loading…`,
   inside the same view container; give it a stable data-testid).
3. Fetch failure -> NAMED error arm (visible text with the message; NEVER the silent
   empty polyline — the silent blank is the defect itself).
4. Neither route yields a payload -> NAMED empty arm (visible "no signal data" text),
   not a blank SVG pretending a trace is there.
5. Parse BOTH routes through `parseTraceValue` (app/src/analysis/traceModel.ts:145-161) —
   remove SignalView's ad-hoc axis/values derivation (ViewRenderer.tsx:96-97). Unit strings
   come from the data (`axis_units`/`value_units`) via ParsedTraceValue.
6. Keep the compact 320x120 geometry and `data-testid="view-spec-signal"` on the SVG
   (the journeys harness + the browser gate select on it). If parsed x/y units exist,
   surfacing them in the title/aria-label is welcome; adding axes/interactivity is NOT.
Zero knowledge of GC-7, point counts, sizes, or engines — no new vocabulary, no GC-specific
branch.

## Tests (RED FIRST — write failing tests before the implementation)
Target: app/src/analysis/ViewRenderer.test.tsx (or a focused new
ViewRenderer.signal.test.tsx if the existing file resists extension — say so in the report).
Mock `../shared/api/client` exactly like ChromatogramView.test.tsx:16 and await the fetch.
- dref-backed signal artifact (no inlineValue, dataReferenceRef + id set) with mocked
  content fetch resolving `{axis:[...], values:[...], axis_units, value_units}` renders a
  MULTI-POINT polyline (points.length > 1) inside `[data-testid=view-spec-signal]`.
- while pending: the named loading arm is visible; the mocked call is
  `getAnalysisArtifactContent` with the AOUT id (NOT the dref id).
- fetch rejects -> named error arm visible (message present), no polyline-as-blank.
- neither inline nor dref -> named empty arm, no polyline.
- inline-backed artifact still renders WITHOUT any fetch call
  (`expect(apiClient.getAnalysisArtifactContent).not.toHaveBeenCalled()` — mirror
  ChromatogramView.test.tsx:98).
- inline parse failure / empty axis -> named empty arm (parseTraceValue {ok:false} route).
Existing doctrine: `ViewRenderer.compat.test.tsx` and every existing suite must pass
UNCHANGED; do not touch analysisGcIntegration.test.ts, view-spec.schema.yaml, or any
server file.

## Verification commands (run in the worktree; report real output)
- `npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/ChromatogramView.test.tsx src/analysis/CompareTraces.test.tsx src/analysis/traceModel.test.ts` (adjust paths to the app workspace layout) — ALL green.
- Whole app typecheck equivalent used on this trunk (pnpm workspace typecheck for the app
  package); NO new type errors (exactOptionalPropertyTypes stays on).
- Use existing node_modules; do NOT run `pnpm install --frozen-lockfile` (known lockfile
  drift on this trunk).
- NEVER restart or touch :3092/:5174/:3001/:5174 — the browser gate happens post-merge on
  the orchestrator's stack.

## Ownership / stop-boundary
Files: `app/src/analysis/ViewRenderer.tsx` + its test file(s) ONLY (+ `.hunks` entries).
If the page does NOT already pass `id`+`dataReferenceRef` to the signal artifact
(orch verified it does via `toRenderable`, AnalysisPage.tsx:791-809, but if you find a
door that doesn't), STOP with marker `L1-SIGNALDREF-1 BLOCKED page-plumbing` and report —
do not absorb page changes.

## Report / marker contract
Report (build it by APPENDING small sections; never re-emit the whole file; keep turns
small — one command/read/edit per turn; cite file:line instead of pasting >80 lines):
`/home/brad/.hermes/cl/lanes/1/l1-signaldref-1-report-l1t1730.md`
Commit everything on the branch. FINAL turn = the marker line ONLY, exactly one of:
`L1-SIGNALDREF-1 DONE <full 40-char sha>` or `L1-SIGNALDREF-1 BLOCKED <reason>`.
