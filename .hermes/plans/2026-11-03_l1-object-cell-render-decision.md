# LANE-1 DECISION — object-valued table cells render `[object Object]` (O-3 / FAME-8 D3)

Ruled: 2026-11-03 by the lane-1 architect. Request: `2026-11-03_l1-object-cell-render-decision-request.md`.
Trunk verified: `cl/integration-1` @ `e8ce5621`.

## Verification performed (architect first-hand, not from the request)

- `app/src/analysis/ViewRenderer.tsx:93` is `return String(value ?? '')` inside `cellContent` — confirmed.
  `cellContent` is SHARED by `TableView` (:128) and `ArtifactTable` (:256), so one fix covers both tables.
- Live probe `:3092` GET `/api/records/ANR-000056` and `ANR-000071` (x-user-id USR-BRAD): both
  `effective_parameters.value.rows[0].params` are dicts; `params_digest`/`consumed_input`/
  `consumed_artifact_ref` are scalars. Reproduced.
- `schema/knowledge/view-spec.schema.yaml`: `bindings: { additionalProperties: true }` (:86-88) — a new
  binding key needs NO schema change; `warningTextField` precedent (:79-80) confirmed.
- RECEIPT-CHECK CORRECTION: the runs' manifests declare the offending view as
  `{ renderer: "table", artifact: "effective_parameters", bindings: {} }` — the plain `table` renderer,
  NOT `artifact-table`. The fix therefore MUST live in the shared `cellContent` path AND `TableView`
  must be wired to accept `view.bindings` (today it takes none). A ruling that only touched
  `ArtifactTable` would leave the observed surface broken.
- Side note (not this task): the payload's own column declaration says `params` is
  `type: string`, "canonical JSON", yet the value ships as a dict — a generator/payload mismatch in
  `peak_integration.py`. Log as a follow-up candidate; it does NOT remove the need for the renderer fix
  (frozen ANR-000056/000071 exist and are immutable).

## Ruling 1 — Option: A, with C as the undeclared-cell fallback arm

A, because cell-rendering is presentation policy and policy lives in data (view-spec `bindings`),
exactly as `warningTextField`/`columns`/`captionFrom` already do; C alone is a bare code policy, B
leaves frozen artifacts broken forever. The fallback arm (compact JSON + `title`) is itself
shape-generic — a rendering-safety rule, not a domain decision — so it may live in code without
violating "code makes no policy decisions". Fixing the shared `cellContent` kills the whole
`[object Object]` class in one place, on both `table` and `artifact-table`.

## Ruling 2 — Binding key + path grammar

- Key: `columnFields` on the view-spec `bindings` object (NOT the artifact's `columns[]` — artifacts
  are engine-produced data and frozen ones can't be amended; presentation policy is the view-spec's
  domain). Canonical shape comment added to the schema's `artifact-table`/`table` binding docs in the
  same commit (comment only; no `properties` change — `additionalProperties: true` already legalizes it).
- Shape: `columnFields: { "<column name>": "<path>" }`, one entry per object-valued column, e.g.
  `columnFields: { params: "assignments[*].compound_ref.label" }`.
- Path grammar: dot-separated object segments plus `[*]` (map over array — one resolved value per
  line, reusing the FAME-8 GATEFIX4 `view-spec__cell-item` one-per-line arm) and `[<n>]` (index into
  array at n, e.g. `assignments[0].compound_ref.label`). Resolution is a hand-written segment walker —
  NO eval/Function/dynamic execution ("No arbitrary JS/HTML in payloads" stance of the schema).
- Resolution rules: resolved scalar -> render verbatim. Path missing/unresolvable mid-way, or resolved
  value non-scalar -> fall through to the fallback arm, NEVER render blank. Fallback arm: compact
  `JSON.stringify(value)` (no indent) as cell text with the full string on a `title` attribute.
  Scalars and the existing empty-array/`'No rows'` arms are byte-identical to today.

## Ruling 3 — Banking: BANK AS LANE 1. No Brad card.

It is a gate-recorded absurd-output honesty defect (gate4-2354 item 7, gate2-254TH D3/A6, task-list
O-3) on `app/src/analysis/**` — a surface the lane already owns — inside the FAME visibility remit,
and it changes no product intent, domain policy, or acceptance criterion. Deferred twice already;
filing it now is closing the remit, not widening it.

## Ruling 4 — Scope: renderer-wide (wide)

The two narrow/wide risks are asymmetric and both live in the same shared function: leaving
`String(non-scalar)` anywhere in the cell path guarantees a second identical ticket. Wide = change
`cellContent` once (object branch + the array-element arm at :89, which today also `String()`s object
elements), apply `columnFields` per column in both `TableView` (wired to take bindings) and
`ArtifactTable`. "Wide" here means the non-scalar CELL FORMATTER only — no other renderer, no server,
no generator.

## Acceptance criteria (orchestrator-verifiable)

1. Unit pins RED-first against fixtures: (a) object cell, no binding -> compact valid JSON in the cell
   (parseable, contains e.g. `assignments`), never `[object Object]`, `title` carries full text;
   (b) `bindings.columnFields.params = "assignments[*].compound_ref.label"` -> the declared labels,
   one per line; (c) unresolvable path -> JSON fallback, not blank; (d) scalar cells byte-identical;
   (e) empty-array and `'No rows'` arms unchanged; (f) object element inside an array column -> JSON
   per element, not `[object Object]`.
2. A `table`-renderer view with bindings renders the binding (TableView wiring proven by a pin).
3. No `String(` applied to a non-scalar anywhere in the cell path of `ViewRenderer.tsx` (source pin).
4. Canonical `columnFields` shape comment lands in `schema/knowledge/view-spec.schema.yaml` same commit.
5. Browser gate on :3092 `/analysis`: ANR-000056 `effective_parameters` `params` cell shows readable
   JSON (screenshot, no `[object Object]`); ANR-000071 likewise; `analyte_summary` table on the same
   run renders unchanged (regression leg). Receipt under `~/.hermes/cl/receipts/`.

## Dispatch note

Queue behind `L1-PIN-HARDEN-1`; do NOT claim a `:18080` slot while lane-2 corpus launchers hold them
(corpus priority stands).

## Stop boundary

Stop and refer back if the work needs: any change to `server/python-executor-service/**` (including
the `peak_integration.py` type mismatch — separate follow-up candidate), any edit to frozen run
records/manifests, any `properties`/enum change to the view-spec schema, or any renderer beyond
`table`/`artifact-table` cell formatting.
