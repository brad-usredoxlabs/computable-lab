# L1-CELLRENDER-1 — object-valued table cells render honest JSON / a declared field, never `[object Object]`

Spec authored 2026-11-03T00:57-05:00 by the lane-1 orchestrator tick (264TH) from the architect
ruling `.hermes/plans/2026-11-03_l1-object-cell-render-decision.md` (request:
`…-decision-request.md`). Trunk `cl/integration-1` @ `e8ce5621` when authored; **re-verified at
`1360894d` by the 265TH tick and again at `3363a3fa` by the 266TH** (the `app/src/analysis/` diff from
`e8ce5621` is EMPTY at both, so every line reference below still holds; every cited anchor was
re-grepped at `3363a3fa`: `cellContent` :84-95, `String(e)` :89, `String(value ?? '')` :93,
`TableView` :104, `ArtifactTable` :170). Status: dispatch-ready behind `L1-PIN-HARDEN-1` (no coder slot
this tick either: the fleet stagger window reverted to 60 min after a lane-2 `request_queue_timeout`
death at 01:11:52, and corpus priority Brad 2026-11-02T17:05 still governs — see the 266TH handoff).

## Root cause (verified by the orch AND the architect, independently, at e8ce5621)

`app/src/analysis/ViewRenderer.tsx`
- `:84-95 cellContent()` — the ONE cell formatter, shared by `TableView` (`:104-140`) and
  `ArtifactTable` (`:170`+). `:93 return String(value ?? '')` stringifies objects →
  `"[object Object]"`; `:89` does the same to object ELEMENTS of an array column.
- The observed surface is the PLAIN `table` renderer, not `artifact-table`: `ANR-000056` and
  `ANR-000071` manifests declare
  `{name: "effective_parameters_view", renderer: "table", artifact: "effective_parameters", bindings: {}}`,
  and `rows[0].params` is a **dict** (re-probed live on `:3092` this tick).
- `TableView` (`:104`) currently receives `{artifact}` only — no `bindings` — so a binding-only fix in
  `ArtifactTable` would leave the observed surface broken. Wiring `TableView` to accept and apply
  `bindings` is IN SCOPE (ruling §Ruling 4).
- Payload mismatch (OUT of scope; now ATTRIBUTED and banked): the artifact's column declaration says
  `params` is `type: string` "canonical JSON" while the stored value is a dict. The EMITTER is
  `scripts/fame-gatefix/assignment-contested-entry.py:702/:709` (declares `string`, stores the raw
  `ctx.parameters` dict); `peak_integration.py` publishes `effective_parameters` as a FLAT dict with a
  different key set and is NOT the source of these records (265TH tick, architect-confirmed). Owned by
  rider task `L1-PARAMS-EMITTER-RIDER` (todo, rider-triggered — never its own gate cycle).

## Contract (architect ruling — do not re-litigate)

1. **Binding key** `columnFields` on the view-spec `bindings` object (NOT on the artifact's
   `columns[]`; artifacts are engine data and frozen ones are immutable).
   Shape: `columnFields: { "<column name>": "<path>" }`, e.g.
   `columnFields: { params: "assignments[*].compound_ref.label" }`.
2. **Path grammar**: dot-separated object segments, `[*]` = map over the array (one resolved value
   per line, reusing the existing `view-spec__cell-item` one-per-line arm), `[<n>]` = index.
   Hand-written segment walker — NO `eval`/`Function`/dynamic execution.
3. **Resolution rules**: resolved SCALAR → rendered verbatim. Path missing/unresolvable mid-way, or
   the resolved value is non-scalar → fall through to the fallback arm. NEVER blank.
4. **Fallback arm (shape-generic rendering-safety law, legal in code)**: non-scalar cell →
   compact `JSON.stringify(value)` as cell text with the full string on a `title` attribute.
   Applies to both the cell value and array ELEMENTS.
5. Scalars, the empty-array arm, and the `'No rows'` arm stay byte-identical to today.

## Files (ownership)

- `app/src/analysis/ViewRenderer.tsx` — `cellContent` (+ the two call sites, + `TableView` binding
  wiring). Fix the SHARED formatter once.
- `app/src/analysis/ViewRenderer*.test.tsx` — RED-first pins (extend the existing suites; do not
  weaken the FAME-8 cell-render pins in `ViewRenderer.cellrender.test.tsx`).
- `schema/knowledge/view-spec.schema.yaml` — COMMENT ONLY: add the canonical `columnFields` shape to
  the `artifact-table`/`table` binding docs (the `bindings` object is `additionalProperties: true`,
  so no `properties`/enum change is allowed or needed).
- Report: `deliverables/l1-cellrender-1-report-<tok>.md` (report-first: root cause → diff → runs).

## Acceptance criteria (orchestrator-verifiable — copied from the ruling)

1. RED-first unit pins, each proven failing before the change: (a) object cell with no binding →
   compact valid JSON in the cell (parseable, contains e.g. `assignments`), never `[object Object]`,
   `title` carries the full text; (b) `columnFields.params = "assignments[*].compound_ref.label"` →
   the declared labels, one per line; (c) unresolvable path → JSON fallback, not blank;
   (d) scalar cells byte-identical; (e) empty-array and `'No rows'` arms unchanged; (f) object
   element inside an array column → JSON per element, never `[object Object]`.
2. A `table`-renderer view carrying `bindings` renders the binding — a pin proves `TableView` wiring.
3. Source pin: no `String(` applied to a non-scalar anywhere in the cell path of `ViewRenderer.tsx`.
4. The `columnFields` canonical-shape comment lands in `schema/knowledge/view-spec.schema.yaml` in
   the same commit.
5. Browser gate on `:3092` `/analysis` (dispatched by the orchestrator, never the coder), meeting
   **ROUND-TRIP-GATE-1** — DOM alone is NOT evidence:
   (i) the reviewer FIRST confirms the served checkout contains the merged candidate sha;
   (ii) the page is driven LIVE against the lane backend with **zero interception of `/api/**`** (no
       route stubs, no fixture substituted for a request);
   (iii) the reviewer captures the **outgoing request URL + response body** for the run's artifact
       payload as a receipt artifact, PAIRED with the rendered-cell screenshot — the
       request/response + rendered-answer pair the rule requires per changed surface;
   (iv) legs, with artifact ids PINNED by the 266TH tick at trunk `3363a3fa` (so the reviewer does not
       hunt): run `ANR-000056` → artifact `AOUT-000100` (`effective_parameters`) — its `params` cell
       shows readable JSON (parseable, never `[object Object]`); run `ANR-000071` → artifact
       `AOUT-000136` likewise; the `analyte_summary` table on the same run renders unchanged
       (regression leg); console clean. Both artifacts were re-read on the lane data at 266TH:
       `columns[0] = {name: params, type: string}`, one row, `rows[0].params` is a **dict** — the
       declared-type-vs-stored-value mismatch the renderer must absorb is still live;
   (v) this surface is a stored-artifact RENDERER with no AI stream — the reviewer must say so
       explicitly in `trail.json` and substitute the two evidence halves in (iii). If any AI
       affordance the change touches exists on `/analysis`, a full AI round trip (outgoing request
       body + rendered answer, zero interception) is REQUIRED for it as well;
   (vi) receipts under `~/.hermes/cl/receipts/<task-id>/<timestamp>/` (`trail.json`, `report.md`,
       screenshots, the request/response artifact).

## Orchestrator verification (I run these; the coder's numbers are not evidence)

```
cd app && npx vitest run src/analysis/            # all green, N new it-blocks reported
                                                  # PRE-DISPATCH BASELINE measured by the 267TH tick at
                                                  # 1a443259 in the pre-built l1-cellrender-1-lane1
                                                  # worktree: `npx vitest run src/analysis/ViewRenderer`
                                                  # -> 5 files / 54 tests PASSED
                                                  # (compat 5, signal 13, artifact-table 13,
                                                  #  cellrender 8, ViewRenderer 15). Those 54 are the
                                                  # floor: the 6 new arms come ON TOP, none may go red.
cd app && npx tsc --noEmit -p tsconfig.json       # zero NEW lines vs the CODER'S OWN start-commit
                                                  # baseline in the same worktree, and ZERO in src/analysis/
git diff --stat                                   # only the 3 permitted files (+ tests)
```

BASELINE CORRECTION (267TH tick 2026-11-03T01:55, measured first-hand at base `1a443259`): the two
tsc totals are NOT interchangeable and the earlier "must stay 21" wording was wrong for a coder
worktree. Trunk `/mnt/vast/home/brad/git/cl-integration-1/app` = exit 2 with **21** `error TS` lines
(0 in `src/analysis/`); a fresh coder worktree of the same commit and command — measured in the
pre-built `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/app`; the `l1-cellrender-1-lane1`
worktree is identical by construction — exits 2 with **12** lines (0 in `src/analysis/`). Cause: a
fresh `git worktree` has no `app/node_modules` package
graph, so tsc resolves app-level packages through the
`/mnt/vast/home/brad/git/wt/node_modules` symlink to the live tree's root, and the error SETS differ
(the 6 `src/shared/hooks/useAiChat.surfaceContext.test.ts` lines exist only in the trunk layout).
So: **the coder's bar is "no NEW lines vs its own start-commit measurement, and 0 in
`src/analysis/`"; a total of 21 in the worktree would be a REGRESSION, and 12 is neither good nor
bad.** The 21-line trunk number is what the orchestrator checks after merging.
plus: re-read `cellContent` in the final diff (the fallback arm must be unconditional), grep that
`String(` no longer takes a non-scalar in the cell path, and the browser gate verdict.

## Stop boundary

Stop and refer back to the architect if the work needs: any change under
`server/python-executor-service/**` (the declared-type vs stored-value mismatch is ATTRIBUTED and
owned by rider item `L1-PARAMS-EMITTER-RIDER` — not this item, and not `peak_integration.py`), any edit
to frozen run records/manifests, any `properties`/enum change to
`view-spec.schema.yaml`, any renderer beyond `table`/`artifact-table` cell formatting, or any new
dependency.

## Dispatch note

Queue behind `L1-PIN-HARDEN-1`. Do not claim a `:18080` slot while lane-2 corpus launchers hold
them. Worktree `/mnt/vast/home/brad/git/wt/l1-cellrender-1-lane1`, branch
`cl/lane1-cellrender-1-<tok>` off `cl/integration-1`; report-first delivery; unique report path.
