# PROTO-AI-3 — Lint DSL extension: generic cross-collection membership predicate

Lane 2 · campaign ai-protocol-edit-and-router · trunk `cl/integration-2`.
Worker: `cl-senior` in worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-3-lane2-l2t0700`
(branch `wt/PROTO-AI-3-lane2-l2t0700`, off trunk tip). Author: orchestrator, tick 2026-10-04T06:50.

## Goal
Add ONE generic relational predicate to the lint DSL — "every value selected by path A must
be a member of the collection selected by path B" (with optional field-of-item selection on
B). This is a CAPABILITY, not a protocol exception: it is what `protocol.lint.yaml` needs
(its header lists seven rules the DSL cannot express) and what role-closure (PROTO-AI-4)
builds on. No protocol field names, no domain branches anywhere in the interpreter.

## Orientation (I read these — do NOT re-explore)
- Meta-schema: `schema/lint/lint-v1.schema.yaml`. `definitions.predicate` is a `oneOf` of
  per-op objects (`exists` :142, `nonEmpty` :154, `regex` :166, `equals` :180, `in` :200,
  `all` :221, `any` :234, `not` :248). Add your predicate as ONE new `oneOf` branch here.
  Path-string pattern used throughout: `'^(\$\.|[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)$'`.
- Interpreter: `server/src/lint/PredicateEvaluator.ts` — one `evalX(pred, data)` fn per op,
  a `isXPredicate` type guard, and a dispatch switch/fn at the bottom (`evaluatePredicate`).
  `AllPredicate`/`AnyPredicate` (`evalAll` :284 / `evalAny` :309) show how to recurse.
- Types: `server/src/lint/types.ts` — add an interface `extends BasePredicate { op: '<new>'; … }`
  and add it to the `Predicate` union (`:198-212`) and to `PredicateOp` (`~:19-40`).
- Path resolution: `server/src/lint/PathResolver.ts`. `getPath` already supports the `[*]`
  wildcard (`resolvePath` :132-154 collects all values) and `parsePath` (:40). Use it.
- PRECEDENT you must build on, not duplicate: the `in` predicate already resolves a dynamic
  `valuesPath` with `[*]` into an allowed set (`PredicateEvaluator.ts:249-259`). Your new
  predicate is the "check EVERY selected A against the B set" generalisation.
- Engine: `server/src/lint/LintEngine.ts` needs NO change — it is op-agnostic (calls
  `evaluatePredicate`). If you find you must edit it, STOP and flag it in the report; that
  would be a design smell.
- Spec loader: `server/src/lint/LintSpecLoader.ts` normalises legacy predicate forms; it
  passes unknown ops through, so a new canonical op needs no loader change (verify).
- Existing tests: `server/src/lint/LintEngine.test.ts`, `PredicateEvaluator.mentionKind.test.ts`.
  Read one for the harness/assertion style before writing.

## The predicate (name it yourself; recommend `allIn` or `membership`)
Semantics: resolve path A → a value or a collection (via `[*]`). Resolve path B → a
collection of allowed values; if an item-field selector is given, the allowed set is
`B[*].<field>`. The predicate PASSES iff every value selected by A is a member of the B set.
Define and document, in the meta-schema `description`, the behaviour for: A resolves to a
single scalar; A resolves to an empty collection (recommend: vacuously pass); A or B
unresolved (recommend: fail with a loud reason); B not a collection (fail, loud).

## Deliverables (unique output paths — yours alone)
- `schema/lint/lint-v1.schema.yaml` — the new `oneOf` branch + description.
- `server/src/lint/types.ts` — interface + union + op.
- `server/src/lint/PredicateEvaluator.ts` — guard + `evalX` + dispatch. Generic only.
- `server/src/lint/LintEngine.test.ts` (extend) and/or a sibling
  `server/src/lint/CrossCollectionPredicate.test.ts` (new) — RED-first tests.
- Worker report `.hermes/plans/PROTO-AI-3-report-wip-l2t0700.md` (chosen op name, semantics
  table, error/`:reason` strings, open questions).

## Acceptance (exact, RED-first)
Tests must prove: membership PASS and FAIL; item-field selection (`B[*].roleId`); A as a
single scalar; A empty (defined behaviour); A unresolved path and B unresolved path each
FAIL loudly (reason names the offending instance path + the missing value); B not a
collection → loud error, not a silent pass; a malformed predicate in a lint spec surfaces a
loud error with a location (check `loadAllLintSpecs` / meta-schema validation). Then run the
FULL lint suite: `npm run test:run -w server` — everything existing stays green (the
exists/nonEmpty/regex/equals/in/all/any/not behaviours unchanged). Paste the real tail of
that run into the worker report.

## Boundaries
Touch ONLY the files above under `server/src/lint/` and `schema/lint/`. Do NOT touch
`protocol.lint.yaml` (that is PROTO-AI-4's job), `LintEngine.ts`, or any app code. No git
commits. No dev-stack restart needed (unit-suite verification).

## Open questions
- Whether the allowed set should also support a static `values` list (like `in`) — if trivial,
  add it; document it. Do not over-build.