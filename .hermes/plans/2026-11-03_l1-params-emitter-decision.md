# ARCHITECT RULING — lane 1 — `effective_parameters` declared-type vs stored-value mismatch

Requested by: 2026-11-03_l1-params-emitter-decision-request.md (265TH tick, 01:12 EST)
Ruled by: architect, 2026-11-03. Documentation and decision only — no product code, no mint-script
edit, no git action, no dispatch performed by this ruling.

## Verification performed by this ruling (before ruling, not inherited)

- `scripts/fame-gatefix/assignment-contested-entry.py:698-718` read verbatim: `ctx.publish("effective_parameters", ...)`
  declares all four columns `type: "string"` via the `_col` helper (`:280-282`, sets
  `{"name", "type", "units", "definition"}`); `rows[0].params` is the raw `params` dict
  (`params = ctx.parameters`, `:286`). The `params` column's own definition text says
  "the frozen run parameters (canonical JSON)" — the emitter violates its own declaration by one line.
  CONFIRMED.
- `app/src/analysis/ViewRenderer.tsx:85-93` read verbatim: array elements `String(e)`, scalar path
  `String(value ?? '')`. A dict cell renders `[object Object]`. CONFIRMED.
- No server path validates artifact-table `columns[].type` against `rows[].<column>` values. Sweep of
  `server/src` and `server/python-executor-service` for column-type checks returns only
  `UISpecLoader.ts:318-325` (UI **list** columns, a different surface), unrelated labware/ingestion
  matches, and ViewRenderer's column-**name** extraction (`:111`, `:227` — reads `name`, never `type`).
  CONFIRMED — the declaration is documentary today.
- `ctx.py:264-276` (`publish`) constructs `Artifact(value=data)` verbatim — no dict→table coercion,
  no type validation. `peak_integration.py:1109-1125` publishes the SAME artifact name as a flat dict
  (`parameters`/`params_digest`), no `columns` at all. The name is overloaded across two producers.
  CONFIRMED.

## RULING

**Option C now, with A banked as a named follow-up item (see ITEM).** The orchestrator's read is
adopted.

Rationale:
1. The scientist-visible defect is already ruled and banked renderer-side (`L1-CELLRENDER-1`'s
   compact-JSON/`title` fallback is the general honesty rule for any non-scalar cell, any emitter).
   A's user-visible gain over C is zero once that ships.
2. A's real cost is not the one-line `json.dumps` — it is the re-mint: `ANR-000056` is frozen from
   `ANREV-000016`, and the FAME-8 evidence chain references `ANREV-000021`/`AOUT-*`. Spending a
   gate cycle and churning a frozen gate fixture's evidence chain to prettify one cell is
   disproportionate now. When that fixture is re-minted for any *other* reason, the emitter must be
   fixed in the same pass — hence A as a rider item, not C's silence. "Evidence-debt entry only" was
   rejected: debt entries rot; a filed item with the emitter line pinned cannot be lost, and the
   declaration is actively lying in a script that keeps reproducing the shape.
3. B is rejected. Widening the column-type contract while the type field is unenforced everywhere
   (verified above) creates a new contract value with no teeth and an obligation on every consumer,
   to solve a problem the renderer rule already closes visually. If the type contract is ever made
   real (see CONTRACT), B's `object`/`json` column type can be revisited *as data-first schema work*
   — it is not justified by this defect alone.

## ITEM

Yes — bank ONE lane-1 follow-up item, non-blocking, rider-triggered:

- Title: `L1-PARAMS-EMITTER-RIDER` — make the contested-entry mint script's `effective_parameters`
  emitter honour its own `type: "string"` declaration.
- Scope: `scripts/fame-gatefix/assignment-contested-entry.py:709` — replace the raw `"params": params`
  with `json.dumps(params, sort_keys=True, separators=(',', ':'))` (canonical JSON, matching the
  column's own definition text and the `params_digest` formula's canonicalization), then re-mint the
  artifact revision so the stored row's `params` cell is a readable JSON string. No other column,
  no schema change, no `peak_integration.py` touch (its flat-dict shape is a different, valid
  producer and stays untouched).
- Files: `scripts/fame-gatefix/assignment-contested-entry.py` (one line + re-mint), the successor
  artifact revision it produces, and the FAME-8 evidence-chain handoff note naming the
  `ANREV-000021` successor.
- Acceptance checks:
  1. The re-minted `effective_parameters` row's `params` value is a `str` parseable as JSON equal to
     the canonicalized params dict; `params_digest` is unchanged and still witnesses it.
  2. The `params` cell renders as readable JSON through the *existing* string arm of
     `ViewRenderer.cellContent` — no renderer change required or allowed.
  3. Evidence chain: the new revision id is recorded with an explicit supersedes note against
     `ANREV-000021`/`AOUT-*`; nothing in the FAME-8 chain silently repoints.
- Dependency: NONE that blocks anything. Trigger: rides the NEXT re-mint of anything under
  `scripts/fame-gatefix/`, or any cycle the FAME-8 evidence-chain owner opens for another reason.
  It must never justify a gate cycle on its own. If it is still unclaimed at the next such re-mint,
  the fix is mandatory in that pass.
- Additionally record in the lane's evidence debt (ledger line, not an item): the current stored
  records `ANR-000056`/`ANR-000071` carry a dict behind a declared-`string` column; emitter pinned at
  `scripts/fame-gatefix/assignment-contested-entry.py:709`; closed by the rider above.

## CONTRACT

Question 3, answered explicitly: **`ctx.publish()` should NOT validate table column types in this
campaign. This is a FUTURE-campaign item — stated so no tick re-derives it.**

Reasons, grounded:
1. Enforcement at one point is not enforcement. The type field is read by nobody between publish and
   render (verified above); a `ctx.publish()` check would make the emitter honest while every
   consumer still ignores the declaration — validation without a consumer-visible contract.
2. The name is overloaded today: `peak_integration.py:1124` publishes `effective_parameters` as a
   flat dict with no `columns` at all, `kind="table"`. Any publish-time validator that checks
   `columns[].type` vs `rows[]` either has no shape to check there or breaks a valid producer. The
   overload must be resolved (per-artifact-name shape declaration as data) before validation is
   meaningful.
3. The CL way: make the artifact-table shape a data-declared contract first (schema/ declarations
   that lint can enforce and `ctx.publish` can then follow — code interpreting data, not inventing
   policy), then validation falls out of existing machinery. Building the validator before the data
   contract is imperative-code making policy — backwards.

So: future campaign, and the prerequisite ordering is: shape-as-data declarations for artifact
tables → lint enforcement → publish-time validation rides free. No tick should file the validator
alone.

## CONSTRAINTS

Confirmed, both halves:
- `L1-CELLRENDER-1` stays EXACTLY as banked — wide scope over the shared `cellContent` formatter,
  `columnFields` on view-spec bindings plus compact-JSON/`title` fallback, lane 1, todo,
  spec'd, dispatch-ready. This ruling does not narrow, re-scope, or re-verify it.
- Nothing in the ITEM or CONTRACT above is a precondition for `L1-CELLRENDER-1`'s dispatch. The
  renderer rule is emitter-independent — it must hold for ANY non-scalar cell from ANY producer,
  including future ones the emitter fix cannot foresee. Note for the record: if the rider ever
  ships, real-data object cells may stop existing; the object arm's coverage then rests on unit
  pins, which is the correct and intended place for it. The renderer rule's value is the general
  guarantee, not the current fixture's embarrassment.
