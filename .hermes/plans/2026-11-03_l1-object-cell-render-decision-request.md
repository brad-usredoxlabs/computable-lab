# LANE-1 DECISION REQUEST — object-valued table cells render `[object Object]` (O-3 / FAME-8 D3)

Filed: 2026-11-03T00:46-05:00 by the lane-1 orchestrator tick (264TH).
Trunk: `cl/integration-1` @ `e8ce5621`, worktree `/mnt/vast/home/brad/git/cl-integration-1`.
Status: OPEN — awaiting architect ruling. No coder has been dispatched; nothing is banked on the
lane-1 task list yet (filing a NEW product item is architect judgment, not the orch's).

## 1. The finding (reproduced first-hand this tick, not taken from a receipt)

`ANR-000056` and `ANR-000071` both emit an `effective_parameters` table artifact whose first column
`params` carries a NESTED OBJECT, and the generic artifact-table renderer stringifies it:

- Payload, lane backend `:3092`, GET `/api/records/ANR-000056` (x-user-id USR-BRAD):
  `outputManifest.artifacts[2]` = `effective_parameters`, `dataKind: table`,
  `columns: [params, params_digest, consumed_input, consumed_artifact_ref]`,
  `rows[0].params` is a `dict` (`assignments[]`, each with a nested `compound_ref` object).
  `ANR-000071` re-probed: identical column set, `rows[0].params` is also a `dict`
  (`params_digest 2910df24…`). So the defect is NOT confined to the frozen FAME-4 run.
- Renderer, `app/src/analysis/ViewRenderer.tsx:93`: `return String(value ?? '')` — the generic
  cell formatter. `String({})` is `"[object Object]"`, so the cell a scientist reads is literally
  `[object Object]`, while `params_digest`, `consumed_input` and `consumed_artifact_ref` in the
  SAME row render correctly (they are scalars).
- Corroborating gate evidence (not my evidence, cite-checked to the paths):
  `~/.hermes/cl/receipts/FAME-8/gate4-2354/report.md:131` and
  `…/gate4-2354/evidence.json:95` (`"d3_object_object"`), and
  `…/gate2-254TH/report.md:63-66` ("the generic table stringifies the object").
- Class: absurd-output honesty defect — the surface shows engine internals instead of the run's
  parameters. Deferred twice as "pre-existing, different renderer"
  (task-list:12047 O-3 informational; FAME-8 gate notes). It is now the only known lane-1 product
  defect class that is neither Brad-held nor already filed.

## 2. Why this needs a ruling rather than an orch-filed task

The hard rule is "code makes no policy decisions — it follows the rules declared in data". Every
candidate fix puts the rendering policy somewhere different:

- **Option A (declarative, recommended).** Extend the `artifact-table` `bindings` object
  (`schema/knowledge/view-spec.schema.yaml`, `additionalProperties: true`, so it needs no schema
  change to be legal) with an optional per-column reduction, e.g.
  `columnFields: { params: "label" }` / a dotted or `[]`-indexed path — the exact key name and path
  grammar are the architect's to fix. Code applies the declared field when a cell value is not a
  scalar, and falls back to **compact JSON with a `title` attribute**, NEVER `String()`.
  Precedent inside this same file: `warningTextField` already means "when warnings entries are
  records, the property whose string value renders". Fixes legacy frozen artifacts immediately,
  keeps the policy in YAML, and kills the whole `[object Object]` class (not just `params`).
- **Option B (generator-side).** The analysis service emits a scalar `params_json` (or a
  human-summary string) instead of the object. No renderer policy in code, but (i) frozen artifacts
  `ANR-000056`/`ANR-000071` still render `[object Object]` forever, and (ii) the table loses the
  structure a view spec might later want to bind.
- **Option C (renderer-only minimal).** One line: `typeof value === 'object' → JSON.stringify`.
  Cheapest and honest, but it is a code-side formatting policy with no data declaration behind it.

Recommendation: **A with C as its undeclared-cell fallback arm** — the smallest change that is both
declarative and legacy-covering, on a renderer the lane already owns (`app/src/analysis/**`).

## 3. The three questions for the architect

1. Ratify the option (A / B / C) and, for A, the exact binding key + path grammar (and whether the
   per-column declaration lives on the view-spec `bindings` or on the artifact's own `columns[]`).
2. May this be **banked as a lane-1 task** from a gate observation now that FAME-8 is closed — i.e.
   is it inside the light-qms/FAME visibility remit, or does it need a Brad scope card?
3. Scope call: fix only `params` (narrow) or the whole non-scalar cell class (renderer-wide, which
   also covers any future object/array column)? The narrow version risks a second identical item;
   the wide version touches every artifact-table surface (needs a browser gate on at least one
   unaffected table to prove no regression).

## 4. What the orch will do on a ruling (no further input needed)

On "A + bank as lane 1 + renderer-wide": the item becomes dispatch-ready behind `L1-PIN-HARDEN-1`
in the coder queue (both `:18080` slots are held by live lane-2 corpus launchers this tick, and
corpus priority forbids lane 1 claiming one). Deliverable would be: view-spec binding honored by
`ViewRenderer`, no `String()` on non-scalars anywhere in the cell path, unit pin with a RED fixture
(object cell → compact JSON, declared-field cell → declared field), plus a browser leg on
`/analysis` showing the `effective_parameters` table with a readable `params` cell and one
unaffected table unchanged.
