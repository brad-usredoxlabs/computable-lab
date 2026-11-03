# DECISION REQUEST — lane 1 — the `effective_parameters` declared-type vs stored-value mismatch, now with a NAMED emitter

Requested by: lane-1 orchestrator tick (265TH), 2026-11-03T01:12 EST
Trunk under observation: `cl/integration-1` @ `2efac9b1`
Status: NAMING + SCOPE DECISION. Not a blocking defect; nothing is gated on the answer.
Supersedes: the 264TH handoff's Addendum (01:02), which recorded this as an UNNAMED emitter and a
CANDIDATE only. The emitter is now named and read first-hand; that addendum's negative is resolved.

## 1. What was established before this request (carried, re-verified)

- `app/src/analysis/ViewRenderer.tsx:93` formats every cell as `String(value ?? '')`; `:89` does the
  same to array elements. Object-valued cells render the literal text `[object Object]`.
- Stored records `ANR-000056` (frozen from `ANREV-000016`) and `ANR-000071` (live) both carry the
  `effective_parameters` artifact as a 4-column table whose `rows[0].params` is a **dict**.
- Architect ruling `.hermes/plans/2026-11-03_l1-object-cell-render-decision.md`: option **A**
  (`columnFields` on view-spec bindings + compact-JSON/`title` fallback), scope WIDE over the shared
  `cellContent` formatter, **bank as lane 1** → task `L1-CELLRENDER-1` (todo, spec'd, dispatch-ready).
  That ruling explicitly placed the generator mismatch OUTSIDE its stop boundary as "a separate
  follow-up candidate".

## 2. NEW finding (first-hand this tick) — the emitter is `scripts/fame-gatefix/assignment-contested-entry.py`

The 264TH tick could not attribute the stored shape to `peak_integration.py` (which publishes a FLAT
dict with keys `parameters`/`params_digest`). This tick grepped for the stored records' own key set
(`consumed_input`) and found exactly one emitter in the tree:

    scripts/fame-gatefix/assignment-contested-entry.py:698-718   ctx.publish("effective_parameters", ...)

Read verbatim (lines 702-713):

    _col("params", "string", None, "the frozen run parameters (canonical JSON)"),
    _col("params_digest", "string", None, "freeze witness — sha256 of the canonicalized parameters ..."),
    _col("consumed_input", "string", None, "the input name this compute consumed the frozen peak_table from"),
    _col("consumed_artifact_ref", "string", None, "the consumed artifact's RECORD ID ..."),
    ...
    "rows": [{ "params": params, "params_digest": digest,
               "consumed_input": "peak_table", "consumed_artifact_ref": consumed_artifact_ref }]

So: **every column is declared `type: "string"`; the `params` value stored in the row is the raw
`Dict[str, Any]`** (`params` is the validated run-parameters dict). The declared type and the stored
value disagree at the emitter, by one line. `params_digest`, `consumed_input` and
`consumed_artifact_ref` are genuine strings and render correctly — the mismatch is the `params` cell
only, and it is the whole `[object Object]` defect's origin for these records.

Provenance of the file: last touched by `136a3d27` (FAME-8 GATEFIX3 D1 contested-claim fix-run); it is
a gate-fixture mint script under `scripts/`, not product code, and it re-mints artifact revisions.

## 3. Facts that constrain the choice (both verified this tick, not assumed)

- **The declared column `type` is not enforced anywhere.** No server path validates an artifact
  table's `columns[].type` against `rows[].<column>` values: grep across `server/src` for
  `column.type` / `validateArtifact` / table-column checks returns only `UISpecLoader.ts:318-325`,
  which validates UI **list** columns (`path`/`label` presence), a different surface. So today the
  declaration is documentary: a dict behind a `string` column fails nothing.
- **Two emitter shapes exist for the same artifact name.** The engine
  (`server/python-executor-service/.../peak_integration.py:1109-1124`) publishes `effective_parameters`
  as a flat dict; the gate-fixture script publishes the 4-column table. `ctx.publish()`
  (`ctx.py:264-276`) stores `value = data` verbatim — it performs no dict→table coercion. So there is
  no single "correct" shape to point at; the artifact name is overloaded across two producers.
- **`L1-CELLRENDER-1` must not be invalidated by the answer.** It is banked, spec'd, dispatch-ready and
  is the renderer-side honesty rule for ALL object/array columns regardless of emitter.

## 4. Options

**A — fix the emitter to honour its own declaration.** `json.dumps(params, sort_keys=True,
separators=(',',':'))` at `:709` (canonical JSON, matching the column's own description), re-mint the
artifact revision. Pros: declaration and payload agree; the `params` cell becomes a readable JSON
string through the EXISTING renderer; no schema surface changes; smallest diff in one script.
Cons: touches a frozen gate fixture (needs a re-mint + a successor revision, and the FAME-8 evidence
chain references `ANREV-000021`/`AOUT-*`); the renderer's object arm stops being exercised by real
data, so only unit pins would cover it.

**B — widen the declaration instead.** Declare `params` as an object/JSON type (a new column type on
the artifact-table contract) and let `L1-CELLRENDER-1`'s `columnFields`/compact-JSON arm be THE
rendering answer. Pros: honest about what a parameters table actually is (a nested structure, not a
string); keeps fixtures untouched. Cons: today the column type is unenforced, so "widen the type" is
documentation with no teeth unless someone also builds the validator; introduces a new contract value
that must then be supported by every consumer.

**C — declare it accepted and change nothing.** The renderer fallback (compact JSON) is the general
rule for any non-scalar cell; record the declared-type mismatch as a known, non-blocking
inconsistency in the lane's evidence debt with the emitter line named. Pros: zero risk, zero cost,
and the defect is already closed user-visibly by `L1-CELLRENDER-1`. Cons: leaves a lying declaration in
a mint script that will keep producing the same artifact.

**Orchestrator's read (recommendation, not a decision):** **C now, A as a tiny follow-up.** C costs
nothing and the scientist-visible defect is already fixed renderer-side; A is a one-line fix that
should ride with any future re-mint of that fixture rather than justifying its own gate cycle —
whereas B asks the pipeline to build a validator to make a declaration mean something, which is a
bigger commitment than this defect warrants.

## 5. Questions for the architect

1. Which option? If A, does the re-mint belong in its own lane-1 item, or as a rider on the next
   `scripts/fame-gatefix/` touch?
2. If C, does the declared-type mismatch get an **evidence-debt entry only** (with the emitter path
   pinned), or does it need a filed follow-up item so it cannot be lost?
3. Does the artifact contract need a rule that a table column's `type` be validated at
   `ctx.publish()` time (making A's class of bug impossible), and is that in scope for this campaign
   or a future one? If it is a future one, say so explicitly so no tick re-derives it.
4. Independent of the answer: confirm `L1-CELLRENDER-1` stays as banked (renderer-side honesty for all
   non-scalar cells) and that no part of this follow-up is a precondition for its dispatch.

## 6. What this request does NOT ask

- No change to `peak_integration.py` (its flat-dict shape is a different, valid producer).
- No change to `scripts/fame-gatefix/assignment-contested-entry.py` by this tick — evidence and a
  request only; a write needs the decision and (for a re-mint) the FAME-8 evidence-chain owner.
- No Brad card: the visible defect is ruled and banked; this is naming/scope hygiene on a mint script.
