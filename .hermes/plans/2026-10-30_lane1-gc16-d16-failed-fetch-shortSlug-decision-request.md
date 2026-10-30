# GC-16 D16 — FAILED schema-doc fetch strips schema-required shortSlug (spine creates)
## DECISION REQUEST — lane 1, 2026-10-30T07:50 EDT (tick 185)

REQUESTED DECISION PATH (write the ruling AT this exact path; do not create a differently-named file):
`/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision.md`

## Context (one paragraph)

GC-16 (knowledge authoring door, worktree
`/mnt/vast/home/brad/git/wt/gc16-knowledge-door-lane1-l1t2100`, branch
`cl/gc16-knowledge-door-l1t2100`, HEAD `82044fa4`) passed adversarial cycles 1 and 2 with
`fix`, and cycle 3 (final gate, report
`/home/brad/.hermes/cl/reviews/GC16-adv3-l1t0620-20261030T065402.md`, VERDICT: fix) closed
D10/D13/D14/D15, accepted D11's data leg (seeded-const sub-leg properly requires-rescoped to
R1/WIDGET-R1), but returned MAJOR D16: the D12 in-flight race gate is closed while the fetch is
IN FLIGHT, yet a FAILED `GET /schemas/:id` still counts as "settled". This is the exact
anti-pattern the D12 remedy named ("do not treat unknown as not-declared"), and the reviewer
reproduced it independently. The review's fix direction states it needs a product decision, and
the lane's prior handoff (tick 183/184) pre-ruled that a cycle-3 `fix` routes to the architect
rather than a blind 4th fix run. This packet is that escalation.

## The defect, verified first-hand by the orchestrator (not only the reviewer's word)

`app/src/event-editor/create/RecordCreatePanel.tsx`:

- `:296-300` — the fetch `.catch` does `setSchemaDoc(null); setSchemaDocFor(schemaId)` — i.e.
  FAILED == SETTLED for the gate at `:456` (`if (schemaDocFor !== schemaId) refuse`).
- `:308-310` — `schemaDeclaresShortSlug = Boolean(schemaDoc?.properties && 'shortSlug' in ...)`
  — after a failure `schemaDoc` is null, so this is `false`.
- `:495-508` — gate passes; `else { delete payload.shortSlug }` — the client mints the spine
  `recordId` itself but DELETES the schema-REQUIRED `shortSlug` (a client-owned identity field).
- `schema/studies/experiment.schema.yaml:10-16` — `required: [kind, recordId, title, shortSlug,
  studyId]` AND `unevaluatedProperties: false`, so the server Ajv 422s the payload.
- In-code comment justification (":275", ":454-455": "failure settles as unavailable — the
  server's required-check speaks") is FALSE for the spine: the server cannot supply a value the
  client owns; the author sees no client error and has NO remedy — even a hand-typed
  `shortSlug` in the form is stripped before POST (reviewer probe PROBE3B).

Reviewer's independent reproduction (its probe, raw in the review §D16): failed fetch ->
`createCalls` payload missing `shortSlug`, no client error text; author-typed slug also absent.

## Constraint space (already ruled elsewhere — do not re-litigate)

- Architect ruling `2026-10-30_lane1-taptab-array-ref-widget-decision.md` (R1) stands; kind
  tables in production code are barred beyond the existing `SPINE_SCHEMA_IDS` fallback
  (already accepted as the registry-failure fallback in D5).
- The knowledge triplet schemas have `unevaluatedProperties: false` — a spine-style
  unconditional stamp would BREAK knowledge creates; whatever is chosen must keep knowledge
  payloads clean.
- D12's accepted in-flight remedy (refuse while `schemaDocFor !== schemaId`) must not regress.
- Spec acceptance: dead forms are a defect; a silent invalid POST with no client remedy is the
  same class.

## Options (reviewer's two, plus cost notes)

- **Option A — tri-state, refuse on failed**: `schemaDocState: unresolved|resolved|failed`; on
  `failed` for a kind in `SPINE_SCHEMA_IDS`, refuse submit with a named "schema document
  unavailable — cannot mint identity fields" error (retry affordance = re-select/reload). No
  data guessing; honest failure. Cost: spine create is blocked while the schemas endpoint is
  down (the endpoint is local; the registry-error fallback D5 already tolerates registry
  failure but NOT schema-doc failure).
- **Option B — spine fallback stamp**: on `failed`, keep stamping `shortSlug` for
  `SPINE_SCHEMA_IDS` kinds (pre-GC-16 behavior via the SAME existing constant), still omitting
  it for knowledge kinds (schemaDoc null + not-spine -> delete). Cost: "unknown treated as
  declared" for spine — the symmetric version of the same guess, but the guess is toward the
  server's own schema requirement, and the existing D5 precedent (`SPINE_SCHEMA_IDS` fallback on
  registry failure) already chose this shape once.
- A+B hybrid is expressible: B's stamp plus a visible non-blocking notice that the schema
  document could not be read.

## Evidence pointers

- Review (full raw excerpts): `/home/brad/.hermes/cl/reviews/GC16-adv3-l1t0620-20261030T065402.md`
  §DEFECT LIST D16 (D17/D18 minor honesty defects are being fixed by a coder run NOW, separate
  from this decision).
- Fix-run-3 report: `/home/brad/.hermes/cl/lanes/1/gc16-report-l1t0620-fix3.md` (D12 block).
- Prior spec: `.hermes/plans/2026-10-30_GC-16-knowledge-door-spec.md`; cycle-2 defect list
  `.hermes/plans/reviews/GC16-adv2-l1t0430-20261030T0433.md` (D12 verbatim remedy text).
- Orch first-hand code read at HEAD 82044fa4 (`:275-310`, `:450-465`, `:492-512`) confirms
  every line cited above.

## Time-box / resume

Provisional fallback if this file is absent at the fix run's D16 leg: **Option A** (refuse;
honest failure; no guessed data), recorded as provisional assumption AS-L1T185-*. The ruling
supersedes the provisional if it lands before the run completes; a post-hoc divergent ruling
routes a corrective fix request, not a silent rework. Ruling file must state VERDICT (A / B /
hybrid / other) and, for A/B, the exact refusal/stamp surface the coder must implement.
