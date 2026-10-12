# PROTO-AI-3 worker report — Lint DSL: generic cross-collection membership predicate

Worker: cl-senior · Lane 2 · worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-3-lane2-l2t0700` · branch `wt/PROTO-AI-3-lane2-l2t0700` (HEAD 46539270, not committed — orchestrator owns git).
Spec: `.hermes/plans/2026-10-04_0700-PROTO-AI-3-lint-membership-predicate.md`. Status: COMPLETE.

## Chosen op name

`allIn` — the "check EVERY selected A against the B set" generalisation of the existing `in` predicate (recommended name #1 in the spec).

## Files touched (exactly the spec's deliverables; nothing else)

| File | Change |
|---|---|
| `schema/lint/lint-v1.schema.yaml` | +40 lines: one new `definitions.predicate.oneOf` branch (`allIn`) with full semantics `description`; no existing branch modified |
| `server/src/lint/types.ts` | +32: `AllInPredicate` interface, `'allIn'` added to `PredicateOp`, added to `Predicate` union |
| `server/src/lint/PredicateEvaluator.ts` | +147: `isAllInPredicate` guard, `evalAllIn`, dispatch arm (placed right after `evalIn`), `membershipKey` helper; imports `resolvePath` |
| `server/src/lint/CrossCollectionPredicate.test.ts` | NEW, 19 tests |

`git diff --stat` (worktree, unstaged): `3 files changed, 217 insertions(+), 2 deletions(-)` + the new untracked test file. `LintEngine.ts` NOT touched — confirmed op-agnostic; no design smell. `LintSpecLoader.ts` NOT touched — passthrough verified by test.

## Semantics table (documented in the meta-schema branch and types.ts)

| Case | Behaviour | Reason string (real format) |
|---|---|---|
| every A value ∈ B set | PASS | `allIn: all N value(s) selected by '<path>' are members of '<collectionPath>[*].<itemField>'` |
| some A value ∉ B set | FAIL, names offending value + instance path | `allIn: value "ghost" selected by 'steps[*].roleId' is not a member of 'roles[*].roleId'` |
| A = single scalar | treated as one-item selection | (pass/fail as above) |
| A = empty array, or wildcard selects nothing (items lack the field) | PASS vacuously | `allIn: '<path>' selected no values — membership of '<collectionPath>' holds vacuously` |
| A = scalar `""` | real selected value, must be a member (no accidental vacuity) | fail reason contains `""` |
| A path does not resolve | FAIL loud, names path | `allIn: path '<path>' does not resolve (not found)` |
| B collectionPath does not resolve | FAIL loud, names path (checked even when A empty — no silent pass) | `allIn: collectionPath '<p>' does not resolve (not found) — cannot check N value(s) from '<path>'` |
| B not an array (scalar / object) | FAIL loud, names path | `allIn: collectionPath '<p>' does not resolve to an array/collection (got string) — cannot check membership of '<path>'` |
| malformed predicate (missing/non-string `collectionPath`, non-string `itemField`) reaching the interpreter | FAIL loud | `allIn predicate requires a 'collectionPath' string` |
| itemField given | membership set = `collectionPath[*].<itemField>`; items lacking the field are simply not members | — |
| comparison | generic: scalars by string form (mirrors `in`'s existing string-set comparison), objects by JSON-serialised shape. No domain knowledge anywhere | — |

Malformed predicate in a lint spec: primary gate is the lint meta-schema via Ajv (structural authority). `loadAllLintSpecs` passes unknown/new canonical ops through untouched (verified — the loader's `normalizePredicate` `{...obj}` path preserves `allIn` fields verbatim; proven by the new loader test).

## Static `values` list (spec open question)

Deliberately NOT added. The `in` predicate already covers static allow-lists; adding `values` to `allIn` would create two overlapping spellings and the spec says "do not over-build". A static set can also be expressed at the rule level via `all: [ {op: allIn …}, … ]` composition if ever needed.

## Intentional deviation (flag)

The spec suggested reusing the path pattern `'^(\\$\\.|[a-zA-Z_]…(?:\\.[a-zA-Z_]…)*)$'`, but that pattern REJECTS `[*]`, and the canonical use-case (and existing shipped lint specs like `protocol-ide-session.lint.yaml:47`) selects A via `foo[*].bar`. The two path patterns in the new `allIn` branch therefore extend the shared pattern with an optional `(\[\*\])?` after any segment (verified against the real pattern strings shipped in the new tests). Existing branches' patterns were left byte-identical.

## RED-first trail

1. Wrote `CrossCollectionPredicate.test.ts` against the absent op → RED: `Test Files 1 failed (1) / Tests 16 failed | 3 passed (19)`.
2. Implemented types + evaluator + schema branch → one intermediate run `3 failed | 16 passed` (all 3 were test-fixture bugs on my side: default fixture missing `itemField`, quote-style assertion) → fixed tests only.
3. GREEN: `✓ src/lint/CrossCollectionPredicate.test.ts (19 tests)` / `Tests 19 passed (19)`.

## Verification — real output tails

Targeted lint suite (final state):
```
 ✓ src/lint/LintEngine.test.ts  (27 tests) 8ms
 ✓ src/lint/PredicateEvaluator.mentionKind.test.ts  (9 tests) 5ms
 ✓ src/lint/studyRunRules.test.ts  (8 tests) 64ms
 ✓ src/lint/CrossCollectionPredicate.test.ts  (19 tests) 138ms
 Test Files  4 passed (4)
      Tests  63 passed (63)
```
(`LintEngine.test.ts` 27 + `mentionKind` 9 + `studyRunRules` 8 = every existing predicate behaviour unchanged, `allIn` fully covered.)

Full suite `npm run test:run -w server` — REAL tail (second full run, modified tree):
```
 Test Files  134 failed | 432 passed | 9 skipped (575)     <- baseline HEAD (pristine git-archive clone /tmp/baseline-full)
      Tests  221 failed | 3860 passed | 68 skipped (4195)
 Test Files  120 failed | 476 passed | 9 skipped (605)     <- THIS tree, run 1
      Tests  262 failed | 4245 passed | 68 skipped (4795)  (second in-tree run: 265 failed | 4246 passed)
```
The full suite is RED at baseline. Evidence my change regresses nothing:
- Baseline (HEAD-only tree in /tmp, same node_modules) fails MORE files (134/221) than the modified tree (120/262). Baseline and in-tree full runs disagree with EACH OTHER on the failing set between runs (shared-runner contention: `Hook timed out`, `ENOTEMPTY /tmp/cl-runner-ws`, flapping AI/API e2e files).
- Per-file diff of failing sets (lint+schema subset, same harness both trees): `comm -23` (failing at baseline but NOT in my tree) — empty; `comm -13` (failing in my tree but NOT at baseline) — EXACTLY 2 files, both foreign strays: `src/schema/EventGraphEquipmentSchema.test.ts` and `src/schema/LabwarePhysicalGeometryData.test.ts` — NOT in HEAD, NOT created by me (mtime 2026-10-04 07:02:30, listed in `/home/brad/.hermes/cl/lanes/2/lane-exclude:59-60`), failing for their own reasons (`ENOENT server/schema/core/common.schema.yaml`, unstamped labware seeds) that have zero contact with `server/src/lint/` or `schema/lint/`. Same story for the other 7 strays in the wider set (`surfacesAjv.test.ts` etc., lane-exclude lines 60-64).
- Zero failures in ANY lint file in either tree's full run: `grep 'FAIL  src/lint'` on both logs → empty; all 4 lint test files ✓ in the full in-tree run.

Typecheck (`npm run typecheck -w server`, i.e. `tsc --noEmit`): files with errors in the modified tree — `store/RecordStoreImpl.ts`, `ai/AgentOrchestrator.ts`, `revisions/*`, `api/handlers/*`, `scripts/bootstrapAdmin.ts`, `lint/AuthoringGuard.ts` — ALL pre-existing. Proven by stash probe (stash → identical errors → pop, working tree restored and re-verified): the `AuthoringGuard.ts TS2305 no exported member 'AuthoringPolicy'` errors occur at HEAD without my changes (they reference exports that never existed in `lint/types.ts`). No error in any file I touched (`lint/types.ts`, `lint/PredicateEvaluator.ts`, `CrossCollectionPredicate.test.ts`).

## Open questions

1. Path-pattern extension (above) — if the orchestrator prefers the untouched shared pattern, `steps[*].roleId` style A-paths would be rejected by the meta-schema while the interpreter accepts them; I judged acceptance the right call but the branch is one pattern swap away.
2. Meta-schema is currently loaded by nothing at runtime (grep: no code/test references `lint-v1.schema.yaml` $id outside my new tests) — the "malformed spec surfaces a loud error with a location" gate is proven Ajv-side in my tests but not yet WIRED into server startup or `loadAllLintSpecs`. Wiring it is out of scope here (would touch the loader) and likely a PROTO-AI-4/orchestrator decision.
3. Lane hygiene (not mine to fix, lane-exclude confirms not mine): ~9 foreign test files + ~600 foreign tests (07:01-07:02 today) sit in this worktree untracked and make the full-suite tail noisy and non-deterministic. The orchestrator's acceptance diff should use the lint-subset comparison above, not raw full-suite totals.
4. `allIn` is record-scope only today (`LintEngine` skips non-record scopes at HEAD); the predicate itself is scope-agnostic and ready if scope support lands.
