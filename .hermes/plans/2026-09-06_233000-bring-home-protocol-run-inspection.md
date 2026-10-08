# Bring home: made the run editor actually INSPECT a protocol's steps

## Goal
In the run editor's Protocol tab, when a protocol is attached to a run, the user sees each protocol step, its realization (event sub-graph) overlayed/ghosted on the deck, and can click a step to isolate/highlight that step's events on the deck and play its sub-graph — the inspection half of the concept→realization model.

## Why this plan exists (the honest diagnosis, verified on live code + browser today)
We built the full concept→realization machinery (commits d9c4bf1 → 0cd328d) but the **inspection side never fires**: attach a protocol → the 4 step chips render, but the deck shows **zero events**, and clicking a chip highlights nothing. Root cause (two independent bugs, both verified):

1. **`stepGraphs` is never populated.** The deck's ghosting (`ProtocolPreviewBridge.tsx:42-44`) sources events from `ProtocolSelectionContext.stepGraphs`. That map is filled ONLY by `fetchStepGraph`, which is called only on **manual visibility-toggle** (`ProtocolTabPanel.tsx:1416`) and **save-realization** (`ProtocolTabPanel.tsx:1813`). It is NOT called on attach (the `fetchSteps` effect, `ProtocolTabPanel.tsx:1224`) and NOT called on step-chip select (`ProtocolTabPanel.tsx:1757`). So `visibleSteps` is set to all steps, the bridge has `focusStepId`, but `stepGraphs={}` → it ghosts nothing. Browser-confirmed: after attach AND after a chip click, deck `[data-protocol-step-id]/[data-current-step]` markers = 0.

2. **`fetchStepGraph` uses the WRONG protocol id.** `fetchStepGraph` (`ProtocolTabPanel.tsx:1372`) fetches `/api/protocols/${runId}/steps/${stepId}/graph`. The server route (`protocol-steps.ts:506`) 400s unless the id is a `kind:'protocol'` universal protocol. For a run attached to an LPR that inherits a universal protocol, the real protocol id is `stepsProtocolId` (resolved at `ProtocolTabPanel.tsx:1143`), so passing `runId` (or an LPR id) 404s/400s. Also inconsistent with `saveRealization` line 1807 which correctly uses `stepsProtocolId`.

The display pipeline is otherwise COMPLETE and verified present: `ProtocolPreviewBridge` → `previewProjection.buildPreviewWellIndex` (reads `_protocolStepStatus`) → `WellGrid` per-well `data-protocol-step-status` → CSS `.tile[data-current-step]` outline + `[data-past-step]` dim (`styles/eventEditor.css:699-715`). The deck only needs to receive the events.

## Current context / assumptions (verified today)
- Attach flow (`fetchSteps`, `ProtocolTabPanel.tsx:1062-1226`) resolves `stepsProtocolId` = the universal protocol id, sets `steps`, then `useEffect:1253` sets `visibleSteps` = all steps. That's where the graph-fetch must be added.
- `setStepGraph(stepId, graph)` writes into context (`ProtocolSelectionContext.tsx:104`); the bridge re-ghosts when `stepGraphs` changes (its effect dep list `ProtocolPreviewBridge.tsx:89` already includes `stepGraphs`). So NO bridge change is needed — fill `stepGraphs` and the deck updates.
- `fetchStepGraph` already writes to context via `setContextStepGraph` (`ProtocolTabPanel.tsx:1380`) and returns null on failure gracefully.
- The chip `onSelect` (`ProtocolTabPanel.tsx:1757-1769`) sets `activeStepId/expandedStepId/currentStepId/focusedStep` but never fetches the graph. Add the fetch there.
- All attached protocols currently compile to 0 events (`StepGraphCompiler` produces no concrete events for the seed / CAN / PRO protocols). So after wiring the fetch, the deck may still be empty UNLESS the step has a committed realization OR the compiler emits events. **Phase 3 seeds one committed realization** so the click-to-highlight path is demonstrably visible, independent of the compiler shortfall.
- Steps come from the universal protocol (`stepsProtocolId`), but the `graph` route requires a `kind:'protocol'` id — must pass `stepsProtocolId`.

## Architecture / proposed approach
A 3-phase, pure-wiring fix: (1) populate `stepGraphs` on attach (bulk fetch all steps' graphs) and on single chip-select (fetch just that step), using the CORRECT `stepsProtocolId` in the URL — this alone makes the bridge ghost the events; (2) make the focused step's ghost actually carry `_protocolStepStatus: 'current'` (already handled by the bridge via `currentStepId`), and verify the highlight CSS renders; (3) seed a committed realization on one protocol step so there's concrete data to see, then write a browser-verifiable spec. No schema or backend changes; the bug is entirely in the client wiring.

## Step-by-step tasks

### Phase A — Populate `stepGraphs` so the deck ghosts step events

#### Task A.1 (RED) — test: attach loads every step's graph into context
Add to `app/src/event-editor/protocol/ProtocolSelectionContext.test.tsx`:
```tsx
it('bulk-fetches every step graph once steps load (deck ghosting)', async () => {
  const steps = [{ stepId: 'S1' }, { stepId: 'S2' }]
  render(<ProtocolSelectionProvider><TestHarness steps={steps} /></ProtocolSelectionProvider>)
  await waitFor(() => expect(TestHarness.ctx.stepGraphs.S1).toBeDefined())
  await waitFor(() => expect(TestHarness.ctx.stepGraphs.S2).toBeDefined())
})
```
Run → fail (stepGraphs is empty; the harness has no mechanism to trigger bulk fetch yet).
`npx vitest run src/event-editor/protocol/ProtocolSelectionContext.test.tsx` — expect 1 failed.

Decision note: rather than add a new context method, the cleanest is to bulk-fetch in `ProtocolTabPanel` (which already owns `fetchStepGraph`, `steps`, `stepsProtocolId`). The provider test above validates via a harness that drives that behavior — if the harness can't reach ProtocolTabPanel, instead write the assertion test at the `ProtocolTabPanel` level. Implement the wiring in A.2 so the provider test (if harnessable) or a ProtocolTabPanel test passes.

#### Task A.2 (GREEN) — bulk-fetch graphs on steps load, correct protocol id
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`.

(1) Fix `fetchStepGraph` to use the resolved protocol id — replace the URL builder at line 1372:
```ts
  const fetchStepGraph = useCallback(async (stepId: string): Promise<EventGraph | null> => {
    if (contextStepGraphs[stepId]) {
      return contextStepGraphs[stepId] as unknown as EventGraph;
    }
    // The graph route requires the UNIVERSAL protocol id (kind:'protocol').
    // stepsProtocolId is resolved in fetchSteps (an inherited universal id for
    // LPR-attached runs). Fall back to runId if no protocol id resolved yet.
    const protoId = stepsProtocolId ?? runId;
    try {
      const res = await fetch(`/api/protocols/${protoId}/steps/${stepId}/graph`);
      if (!res.ok) { console.warn(...); return null; }
      ...
    }
  }, [stepsProtocolId, runId, contextStepGraphs, setContextStepGraph]);
```
Add `stepsProtocolId` to the dep array (remove if `runId` becomes redundant only when a run IS an LPR-less universal attach — keep both).

(2) Add a bulk-fetch effect, right after the `visibleSteps` init effect (line 1257):
```ts
  // Populate stepGraphs for every visible step so the deck ghosts their
  // realization events (bridge reads ProtocolSelectionContext.stepGraphs).
  useEffect(() => {
    if (!stepsProtocolId || steps.length === 0) return
    let cancelled = false
    const ids = steps.map((s) => s.stepId)
    Promise.all(ids.map(fetchStepGraph)).catch(() => { /* one graph failing isn't fatal */ })
    return () => { cancelled = true }
  }, [stepsProtocolId, steps, fetchStepGraph])
```
(Use `cancelled` guard if material; the Promise.all already absorbs failures. If `contextStepGraphs` dedupes, this is idempotent on re-render.)

(3) Add a per-step fetch inside the chip `onSelect` so clicking one step predicts/isolates it. In `ProtocolTabPanel.tsx:1757`, just before `protocolSelection?.setFocusedStep(...)`:
```ts
                // Load THIS step's realization so focus ghosts it on the deck.
                void fetchStepGraph(step.stepId)
```
Run Task A.1 (or the ProtocolTabPanel test) → pass.
Verify: `npx tsc --noEmit` (app) clean.
Commit: `feat(protocol-run): bulk-fetch step sub-graphs on attach so the deck ghosts the protocol's realization`.

#### Task A.3 (RED) — test: chip select isolates the focused step's realized events
In `app/src/event-editor/protocol/ProtocolSelectionContext.test.tsx`, one focused-step assertion (existing test may already cover `setFocusedStep → bridge ghosts ONLY S1`; verify it exists; if it does, this task is already RED-passing and is a no-op — mark the commit). If absent, add:
```tsx
it('focus isolates a single step even when many are visible', () => {
  // seed stepGraphs {S1: {...}, S2: {...}}, setFocusedStep({stepId:'S1'}), setCurrentStepId('S1')
  // expect bridge preview.events to contain ONLY S1's events, all tagged _protocolStepId='S1', _protocolStepStatus='current'
})
```
Run → fail (bridge ok, but focusStepId isolation already implemented — if the existing `setFocusedStep` isolation test already passes, skip). In most cases this is already covered; verify and only add if missing. Commit only if new.

### Phase B — Verify the highlight + isolation actually renders on the deck

#### Task B.1 — browser-verify current-step highlight renders
No code change expected. After A.2 is live and a step has events (its committed realization, from Phase C), drive in-browser and confirm:
- Command: reopen the seeded run at `http://127.0.0.1:5174/runs/<seeded run id>`.
- Activate Protocol tab, click the seeded step chip.
- Assert (browser console / DOM): `document.querySelectorAll('.tile[data-current-step="true"]').length >= 1` AND the `StepIndicator` bar reads `EDITING STEP N: ...`.
Expected output: ≥1 `data-current-step` tile and the indicator text. This validates the CSS + projection wiring end-to-end with real data.

#### Task B.2 (only if B.1 shows nothing) — confirm the projection carries the tag
If B.1 shows 0 highlighted tiles despite events present, verify `previewProjection.buildPreviewWellIndex` maps `_protocolStepStatus` onto well status and that `WellGrid` emits `data-protocol-step-status`. Read `app/src/event-editor/focus/WellGrid.tsx` and `app/src/event-editor/lib/previewProjection.ts` for the tag-on-event → well-attr path; patch the bridge's event tagging if the status isn't flowing (it currently is, line 55-60). Only act if B.1 fails.

### Phase C — Provide concrete data so inspection is visible (seed a committed realization)

The compiler currently yields 0 events for every attached protocol (verified). To make the feature demonstrably work and the browser spec meaningful, commit ONE realization on the seed protocol's step-1 via the existing POST route.

#### Task C.1 — POST a committed realization for seed step-1
Command:
```bash
curl -s -X POST -H "x-user-id: USR-LOCAL-ADMIN" -H "content-type: application/json" \
  "http://127.0.0.1:3001/api/protocols/prt-seed-biological-transfer/steps/step-1/subgraph" \
  -d '{"events":[{"id":"seeded-wash","verb":"pipette","sourceRef":{"labware":"S","well":"A1"},"targetRef":{"labware":"T","well":"A1"},"volume":200,"unit":"uL"}],"labwares":[{"labwareId":"S","type":"reservoir","label":"PBS reservoir"},{"labwareId":"T","type":"96-well","label":"culture plate"}]}'
```
Expected: `{ "subGraphRef": { "type": "event-graph", "id": "EVG-STEP-..." } }` (a new event-graph record is minted, step's `subGraphRef` set).
Verify it persisted: `GET /api/records?kind=event-graph` lists the new `EVG-STEP-step-1-*` id.

This is data, not code — no commit. It makes Phase B and the E2E spec verifiable. (Use an id/labware ids that match the deck's actual platform if it's a real run platform; if the seed run has no platform slots, choose ids that correspond — note in Risks.)

### Phase D — Re-run the full verification gate + browser spec

#### Task D.1 — unit + typecheck gate
```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/event-editor/protocol src/event-editor/right-pane/protocol
cd /mnt/vast/home/brad/git/computable-lab && npx tsc --noEmit -p server/tsconfig.json && cd app && npx tsc --noEmit
```
Expected: all touched suites pass (ProtocolSelectionContext, StepInvestigationPanel, StepIndicator, ProtocolTabPanel helpers), both typechecks clean.

#### Task D.2 — write the browser spec `app/e2e/protocol-step-inspection.spec.ts`
Port/replace the planned `protocol-step-feedback-loop.spec.ts`. It should: open the seeded run → Protocol tab → assert 4 step chips → click the seeded step (step-1) → assert `StepIndicator` = `EDITING STEP 1: ...` → assert `document.querySelectorAll('.tile[data-current-step="true"]').length >= 1` (the committed wash event ghosted + highlighted) → click a different step (step-2) → assert its indicator updates and the step-1 tiles dim (`[data-past-step]` present). Fill in the real selectors from the live app (verify each selector exists in the browser before baking it into the spec). Command: `cd app && npx playwright test e2e/protocol-step-inspection.spec.ts` — expected all pass once the browsers are installed (note: install `chromium-headless-shell` first if still missing: `npx playwright install chromium-headless-shell`).

## Tests / validation summary
- A.1 RED → A.2 GREEN: `ProtocolSelectionContext.test.tsx` (or ProtocolTabPanel test) bulk-fetch + correct-id assertions.
- A.3: chip-select isolation test (verify/create).
- B.1: live browser DOM assertion (≥1 `[data-current-step]` tile + indicator text).
- D.1: full touched-suite + typecheck gate.
- D.2: Playwright spec proves the whole loop in CI form.

## Risks, tradeoffs, open questions
- **The compiler emits 0 events.** Independently of this wiring fix, an unattached/seed protocol with no committed realization will show nothing on the deck. That is correct-by-design (nothing realized yet), but the UX doesn't explain it — the deck may "look broken." Recommend (out of scope here, flag for follow-up): a deck empty-state that says "This step has no realized events yet — Draft with AI or build on deck." The indicator + panel already guide toward that.
- **`fetchStepGraph` url protocol id:** passing `stepsProtocolId` (universal id) is correct for LPR runs and universal-direct runs. For a run whose attached method IS the run itself (legacy `runId` path), `stepsProtocolId ?? runId` preserves the old behavior. Verify at least one real run in-browser.
- **Concurrency / N+1:** bulk-fetching N step graphs on attach is N sequential-dependent requests (Promise.all — parallel, fine for a handful of steps). For huge protocols, consider a single `GET /protocols/:id/steps` that returns all graphs, but YAGNI — keep the per-step fetch; the cache dedupes re-renders.
- **Seed realizes on a specific platform:** the seeded event's labware ids must correspond to slots on the run's deck platform if it's a live run. If the seed run has no slots, the ghost still highlights the event tile conceptually but no physical well. Choose the run/step where this is non-empty, or accept conceptual ghosting. If the seed run can't hold labware, use the browser spec on a run with a platform that has the labware.
- **`_protocolStepStatus` only set when `currentStepId !== null`:** the bridge sets status tags only in the per-step layering branch (line 51). If a run shows all steps flat (no current step), events ghost but never dim/highlight per step. The chip select sets `currentStepId` (line 1764), so selecting a chip activates the layering — this is expected, but note the flat (pre-select) case has no per-step visual. Design intent: the "very visible indicator" appears on selection, which is the investigation moment.
- **Open question:** should a fresh attach ghost ALL steps' committed realizations at once (current default: yes, via visibleSteps=all), or only a user-selected step? The user's words ("click a step to highlight its events") imply flat-then-isolate — keep current behavior (ghost all, then focus isolates). Confirm the deck isn't visually noisy when 4 steps each have 5 events.

## The upfront question (answered by inspection, restated for the implementer)
The diagnosis is definitive; the fix is wiring-only. No backend change, no schema change. The two bugs (`stepGraphs` never populated; wrong protocol id in the graph URL) are each 2-5 minute fixes with a clear RED→GREEN shape. The only environment dependency is having a protocol step with a committed/non-empty realization to make the highlight visibly testable — Phase C seeds that.

---

## Execution status (2026-09-06/07, executed directly)

### What landed (commits on main)
- **feat(protocol-run): bulk-fetch step sub-graphs on attach + per-click so the
  deck ghosts the protocol's realization** (`3c91b24`)
  - `ProtocolTabPanel.fetchStepGraph` uses `stepsProtocolId ?? runId` (universal
    protocol id) instead of `runId` — the `/graph` route 400s on an LPR/run id.
  - New effect bulk-fetches every step's graph once the protocol resolves + steps
    load (the deck ghosting source).
  - Step chip `onSelect` now also fetches that step's graph so focus ghosts it.
  - Verified live: backend log shows the browser fires 4 graph requests on
    attach (previously ZERO); `data-graphs` probe showed all 4 stepGraphs
    populated in the live app.
- **test(protocol): ProtocolPreviewBridge ghosts a focused step realization with
  `_protocolStepStatus`** (`d5d7a4d`) — new `ProtocolPreviewBridge.test.tsx`
  proves the fetch → ghost → highlight STATE the deck consumes, independent of
  the pixel render. Locks the path against silent regression.

### Verification
- App touched suites: 66/66 (9 files). App + server typecheck clean.
- Live: bulk-fetch fires on attach (server log); all 4 `stepGraphs` populated in
  the running app.

### Not finished / honestly open
- **The deck PIXEL render of the per-well highlight was NOT demonstrably reached
  in-browser on the hand-built seed run.** The mechanism is unit-proven (the
  bridge pushes preview with `_protocolStepStatus` once `stepGraphs` is
  populated, which it now is), but a placed-labware run with a step realization
  didn't surface well highlights in `LabwareFocus` during this session. Tracking
  the exact resolution of `state.preview` → `LabwareGlyph`/`DeckStage` in a
  run that has a genuinely placed deck is the remaining gap.
- The run I hand-seeded (`RUN-review-seed-*`) was restored to its original
  method graph after I briefly corrupted it testing placement; it holds a valid
  committed realization on the seed step-1. Not a real user run — safe to ignore.
- `StepExecutionModal` (play a step) and the protocol-document/TapTab editor
  remain separate surfaces; see plan `...205040`.
