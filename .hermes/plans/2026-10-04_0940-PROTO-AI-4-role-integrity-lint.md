# Spec — PROTO-AI-4 · Role-integrity lint (step→role closure, identity-bearing roles, cross-category uniqueness)

Lane 2 · Campaign `ai-protocol-edit-and-router` (list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` @ `51419ada` (PROTO-AI-2 + PROTO-AI-3 merged).
Item id: **PROTO-AI-4** · deps PROTO-AI-2 (✓ done), PROTO-AI-3 (✓ done) · owner: `cl-senior`.

## Goal
Declare three protocol lint rules in DATA (YAML), wired to the lint predicate DSL:

- R1 (error) — **step→role closure**: every labwareRole reference carried by a step resolves to a
  declared `roles.labwareRoles[*].roleId`; likewise every instrumentRole reference resolves to
  `roles.instrumentRoles[*].roleId`.
- R2 (warning) — **identity-bearing role**: a `LabwareRole` with no `description` OR no
  `expectedLabwareKinds` is not yet identity-bearing. Warning severity so legacy records stay writable.
- R3 (warning) — **cross-category duplicate**: the same `roleId` appears in BOTH
  `roles.labwareRoles` and `roles.instrumentRoles` (the PRT-wlj0qm defect class).

Do NOT activate any of the other commented rules in `protocol.lint.yaml`.

## Deliverable (UNIQUE output path)
- **Canonical product files** (the deliverable):
  - `schema/workflow/protocol.lint.yaml` — the three rules (replace the status comment only as the task allows; keep the remaining "intended, not yet expressible" comments that still are not being activated).
  - DSL additions if required (see below): `schema/lint/lint-v1.schema.yaml`, `server/src/lint/types.ts`, `server/src/lint/PredicateEvaluator.ts`.
  - New test file: `server/src/lint/ProtocolLintRules.test.ts`.
- **Report** (UNIQUE path, write exactly this; the orchestrator promotes it):
  `.hermes/plans/PROTO-AI-4-report.wip-l2t0940.md`
  with: the final rule YAML verbatim, the gate table, RED→GREEN evidence, the DSL-gap analysis, and
  the curl E2E proof. Do NOT write `.hermes/plans/PROTO-AI-4-report.md` yourself.

## Environment
- Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-4-lane2-l2t0940`, branch `wt/PROTO-AI-4-lane2-l2t0940`, off `cl/integration-2`.
- Lane stack: backend `:3093`, frontend `:5193`. After ANY `schema/**/*.yaml` edit you MUST run
  `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 2 restart` before the curl proof
  (tsx --watch does NOT reload YAML). NEVER touch `:3001`/`:5174` or `/mnt/vast/home/brad/git/computable-lab`.
- `exactOptionalPropertyTypes` is ON for the backend (optional = absent OR value, never `undefined`).
- Tests: `npm run test:run -w server` (targeted files) and `npm run typecheck -w server`.
- BASELINE FACT (carried from the PROTO-AI-2/3 handoff, confirmed by the orchestrator): the FULL
  `npm run test:run -w server` is **RED at trunk baseline** (~91 failed files). "Full suite green" is
  unachievable here; the correct signal is your TARGETED suite green PLUS a per-file failing-set diff
  vs baseline (baseline-only failures = 0 new).

## Orchestrator orientation (VERIFIED reads — cite still required, but do not re-derive)

### Lint rule shape (VERIFIED)
`schema/lint/lint-v1.schema.yaml` `definitions.rule` requires: `id` (pattern `^[a-zA-Z][a-zA-Z0-9-]*$`),
`title`, `severity` (`error|warning|info`, default error), `scope` (`record|collection|repo`),
`assert` (a predicate), `message` (`{template, paths?}`). Optional: `description`, `schemaId`, `when`,
`dependsOn`. A real example: `schema/knowledge/claim.lint.yaml:5-15`.

`protocol.lint.yaml` today: `lintVersion: 1`, `schemaId:` pinned to `protocol.schema.yaml`, `rules: []`
plus a comment block of un-activated intended rules. Loaded at startup by `loadAllLintSpecs`
(`server/src/lint/LintSpecLoader.ts`, discovers `*.lint.yaml` under the schema dir) — cite the
`server/src/server.ts` load site yourself.

### Test harness convention (VERIFIED)
`server/src/lint/studyRunRules.test.ts:1-34` is the model: parse the REAL `*.lint.yaml` from disk into a
`LintEngine`, then `engine.lint(payload, schemaId)` on inline fixture payloads — no HTTP. Follow it.

### Step role-reference locations (VERIFIED from `schema/workflow/protocol.schema.yaml`)
Every step-kind that carries a labwareRole reference (JSON path from protocol root → schema line):
- `steps[*].target.labwareRole` — `StepAddMaterial` :870-872, `StepMix` :939-941, `StepWash` :955-957,
  `StepIncubate` :971-973, `StepRead` :989-991.
- `steps[*].source.labwareRole` — `StepTransfer` :906-908 (its `target.labwareRole` :913-915 is a
  second `target.labwareRole` occurrence), `StepHarvest` :1018-1020.
- Instrument role: `steps[*].instrumentRole` — `StepRead` :1001-1003.
  (NOTE: `MethodRequirement.instrumentRole` :695-696 is a `$defs` NOT referenced from `steps`; do not
  treat it as a step path unless you find a step-level reference to it. State your finding.)
ENUMERATE these yourself before authoring and prove each is covered — the task explicitly requires
ALL locations, not just transfer. If you find any additional location, cover it or report the gap.

### Role $defs (VERIFIED)
`LabwareRole` :424-438 — required `roleId`; optional `description`, `expectedLabwareKinds[]`.
`MaterialRole` :440-454 — `roleId`, `description?`, `allowedMaterialIds[]?`.
`InstrumentRole` :456-469 — `roleId`, `description?`, `allowedInstrumentIds[]?`.
`roleId` has NO pattern in the schema — real ids carry underscores and leading digits
(`instrument_centrifuge`, `labware_96_well_plate`, `topping_medium`, `10-sds`). Do not add a roleId
pattern to the lint.

### AllIn predicate (VERIFIED, PROTO-AI-3 deliverable)
`server/src/lint/PredicateEvaluator.ts:321-422` — `{op: 'allIn', path, collectionPath, itemField?}`:
every value selected by `path` (scalar, plain array, or `[*]` projection) must be a member of
`collectionPath` (or `collectionPath[*].itemField`). Semantics: empty selection at `path` → PASS
vacuously; `path` unresolvable → loud FAIL; `collectionPath` unresolvable / non-array → loud FAIL.
PathResolver wildcard (`PathResolver.ts:131-154`) collects only EXISTING values, returns `found:true`
with an empty array when no element has the field — so `steps[*].target.labwareRole` DOES resolve
(found) even for a protocol whose steps are all transfers.

## THE EXPRESSIVENESS FINDING (orchestrator, verified — act on this)
R1 is expressible with `allIn`. **R2 and R3 are NOT expressible with the predicates that exist today
(`exists/nonEmpty/regex/equals/in/all/any/not/allIn` + the domain ops):**

- R2 needs a "every item of a collection satisfies X" quantification. `nonEmpty` on a `[*]` projection
  resolves to the ARRAY of present values (`PathResolver.ts:255-261` → `!isEmpty(array)`), i.e. true if
  ANY item is non-empty — it cannot express "EVERY role has a description".
- R3 needs "NO value of A is a member of B". `allIn` is "ALL of A ∈ B"; its `not` is "SOME of A ∉ B".
  Neither is the overlap predicate.

**Authorised (this is method, not new scope): add the MINIMAL generic predicates** to the DSL, exactly
in the PROTO-AI-3 style — generic evaluator, zero protocol/domain names in TypeScript, documented in
`schema/lint/lint-v1.schema.yaml`, RED-first tests:

- `everyItem` — `{op:'everyItem', collectionPath, itemField?, assert:<predicate>}`: true iff the
  collection at `collectionPath` is an array AND every item satisfies `assert` evaluated with that item
  as root data. Vacuous true on an empty array; loud FAIL if `collectionPath` does not resolve or is not
  an array. (`itemField` optional: when set, evaluate `assert` against each item's `itemField` value —
  include it only if you use it; otherwise omit the field entirely rather than shipping dead config.)
- `noneIn` — `{op:'noneIn', path, collectionPath, itemField?}`: same selection as `allIn`, but true iff
  NO value selected by `path` is a member of B. Loud FAIL on unresolvable `path`/`collectionPath`
  exactly as `allIn`. (Symmetric to `allIn`; keep the code a thin variation, not a copy-paste fork.)

Then:
- R2 = `everyItem(collectionPath: 'roles.labwareRoles', assert: all[ nonEmpty 'description', nonEmpty 'expectedLabwareKinds' ])`,
  severity warning. Consider whether `transform`/`when` is needed so a protocol with NO `roles` block
  does not emit noise — decide and document (a protocol with no roles and no step role refs should be
  clean).
- R3 = `noneIn(path: 'roles.labwareRoles[*].roleId', collectionPath: 'roles.instrumentRoles', itemField: 'roleId')`,
  severity warning.

If, after honest attempt, either rule still cannot be declared without a TypeScript domain branch, STOP
and report a structured blocker (do not weaken the rule, do not hardcode a domain check).

## Scout status (recorded this tick)
`cl-scout` was unavailable for these orientation questions: with `compression.enabled: false` (the
current profile config) a session that grows past the model's real 32K window hard-errors on context
overflow, and a second attempt hit the output-token limit. Short questions succeed; longer ones fail.
The orientation above is therefore the ORCHESTRATOR'S OWN verified reads, not scout screening.

## Acceptance criteria (task `verified by`, verbatim)
- Lint fixture tests: dangling step labwareRole → error naming the step id and offending ref; one
  fixture per schema labwareRole location; cross-category duplicate → warning; clean protocol → zero
  findings.
- End-to-end proof: after stack restart, the lint/validate endpoint on a fixture protocol record returns
  the expected findings (curl output in handoff).
- `npm run test:run -w server` targeted suite green + no new baseline failures.

## Method
- RED first: write failing tests (fixture payloads + the rule YAML) before/with the implementation.
- `message.template` must name the offending instance path + the missing value, using the DSL's
  `{{path}}` interpolation (see `PathResolver.interpolateTemplate`) — the finding must let a reader
  locate the step id and the dangling ref. Verify the interpolated text in a test.
- Reuse existing predicate plumbing; do not fork the evaluator. Keep every added op generic.
- Do not touch the task list. Do not merge; the orchestrator merges.
- Report each consequential assumption (a value you supplied that no source gave) in your report.

## Out of scope
- The other five commented protocol lint rules. Material-role CRUD. Wiring the lint meta-schema into
  `loadAllLintSpecs` validation (a separate known flag — leave as is; just note it if it affects you).
- Any change outside `schema/lint/`, `schema/workflow/protocol.lint.yaml`, and `server/src/lint/`.
