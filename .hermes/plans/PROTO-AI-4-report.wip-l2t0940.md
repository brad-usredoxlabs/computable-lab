# PROTO-AI-4 report — Role-integrity lint (step→role closure, identity-bearing roles, cross-category uniqueness)

Worker: cl-senior · Lane 2 · Campaign `ai-protocol-edit-and-router`
Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-4-lane2-l2t0940` · branch `wt/PROTO-AI-4-lane2-l2t0940` (off `cl/integration-2` @ `51419ada`)
Spec: `.hermes/plans/2026-10-04_0940-PROTO-AI-4-role-integrity-lint.md`

## What changed (product files, all within the authorised set)

| Path | Change |
|---|---|
| `schema/workflow/protocol.lint.yaml` | Activated R1 `step-role-closure` (error), R2 `labware-role-identity-bearing` (warning), R3 `role-id-category-unique` (warning). All eight "intended, not yet expressible" comments preserved verbatim below the rules; the closing paragraph re-pointed to the DSL (no rule other than the three was activated). |
| `schema/lint/lint-v1.schema.yaml` | Two new generic predicate branches in `definitions.predicate.oneOf`: `everyItem` and `noneIn` (documented with defined behaviours, PROTO-AI-3 `allIn` style). One minimal pattern widening: `nonEmpty.path` now accepts `[*]` segments — the interpreter already resolved wildcard paths for nonEmpty (PathResolver is shared); the pattern simply aligns the meta-schema with interpreter reality so `nonEmpty` is usable on a projection inside a `when`/`any` vacuity guard. No new op semantics in the evaluator for this. |
| `server/src/lint/types.ts` | `PredicateOp` += `everyItem`, `noneIn`; new documented `EveryItemPredicate` / `NoneInPredicate` interfaces; added to the `Predicate` union. |
| `server/src/lint/PredicateEvaluator.ts` | `evalEveryItem` (per-item quantification, assert evaluated with each item as root data), `evalNoneIn` (disjointness). `allIn`'s A/B selection + loud-failure core was factored into `resolveMembershipOperands('allIn'\|'noneIn', …)` — noneIn is a thin symmetric variation, NOT a copy-paste fork. Zero protocol/domain field names in TypeScript (grep-verified: no `labwareRole`/`roleId`/`protocol` strings in the new code paths). |
| `server/src/lint/ProtocolLintRules.test.ts` | NEW. 42 tests. Harness per `studyRunRules.test.ts`: parse the REAL `protocol.lint.yaml` from disk into a `LintEngine`, lint inline fixture payloads; plus direct `evaluatePredicate` tests for both new ops and a lint-v1 meta-schema contract block (Ajv authority) including "the REAL protocol.lint.yaml rules validate against the meta-schema". |

## The three rules, verbatim (schema/workflow/protocol.lint.yaml)

```yaml
rules:
  - id: step-role-closure
    title: "Every step role reference resolves to a declared role"
    severity: error
    scope: record
    assert:
      op: all
      predicates:
        - op: any
          predicates:
            - op: not
              not: { op: nonEmpty, path: steps[*].target.labwareRole }
            - op: allIn
              path: steps[*].target.labwareRole
              collectionPath: roles.labwareRoles
              itemField: roleId
        - op: any
          predicates:
            - op: not
              not: { op: nonEmpty, path: steps[*].source.labwareRole }
            - op: allIn
              path: steps[*].source.labwareRole
              collectionPath: roles.labwareRoles
              itemField: roleId
        - op: any
          predicates:
            - op: not
              not: { op: nonEmpty, path: steps[*].instrumentRole }
            - op: allIn
              path: steps[*].instrumentRole
              collectionPath: roles.instrumentRoles
              itemField: roleId
    message:
      template: "Protocol '{{recordId}}': step role references must resolve to declared roles. step ids: {{steps[*].stepId}}; refs checked at steps[*].target.labwareRole={{steps[*].target.labwareRole}} and steps[*].source.labwareRole={{steps[*].source.labwareRole}} (must be declared in roles.labwareRoles[*].roleId={{roles.labwareRoles[*].roleId}}) and steps[*].instrumentRole={{steps[*].instrumentRole}} (must be declared in roles.instrumentRoles[*].roleId={{roles.instrumentRoles[*].roleId}})."

  - id: labware-role-identity-bearing
    title: "Declared labware roles should be identity-bearing"
    severity: warning
    scope: record
    when:
      op: nonEmpty
      path: roles.labwareRoles
    assert:
      op: everyItem
      collectionPath: roles.labwareRoles
      assert:
        op: all
        predicates:
          - op: nonEmpty
            path: description
          - op: nonEmpty
            path: expectedLabwareKinds
    message:
      template: "Protocol '{{recordId}}': labware role(s) at roles.labwareRoles are not identity-bearing (need description + expectedLabwareKinds); roleIds: {{roles.labwareRoles[*].roleId}}."

  - id: role-id-category-unique
    title: "A roleId must be unique across role categories"
    severity: warning
    scope: record
    when:
      op: all
      predicates:
        - op: nonEmpty
          path: roles.labwareRoles
        - op: nonEmpty
          path: roles.instrumentRoles
    assert:
      op: noneIn
      path: roles.labwareRoles[*].roleId
      collectionPath: roles.instrumentRoles
      itemField: roleId
    message:
      template: "Protocol '{{recordId}}': a roleId appears in BOTH categories — roles.labwareRoles roleIds {{roles.labwareRoles[*].roleId}} overlap roles.instrumentRoles roleIds {{roles.instrumentRoles[*].roleId}}."
```

(The file additionally carries the spec-mandated descriptive comments and the eight preserved not-activated rule sketches.)

## Step role-reference location enumeration (my own read of protocol.schema.yaml, as required)

| JSON path | Step kinds | Test fixture |
|---|---|---|
| `steps[*].target.labwareRole` | StepAddMaterial (:870-872), StepMix (:939-941), StepWash (:955-957), StepIncubate (:971-973), StepRead (:989-991), StepTransfer.target (:913-915) | 6 fixtures (add_material / mix / wash / incubate / read / transfer.target) |
| `steps[*].source.labwareRole` | StepTransfer.source (:906-908), StepHarvest (:1018-1020) | 2 fixtures |
| `steps[*].instrumentRole` | StepRead (:1001-1003) | 1 fixture |

**Finding on `MethodRequirement.instrumentRole` (:695-696):** `ProtocolStep.methodRequirement` (:776-777) DOES reference the `$defs` (the spec asked me to state this). However it is an optional *method-level constraint* bag (`methodId`, `instrumentRole`, `requiredOperatorQualification`, `notes`), not a step role *reference* in the sense of R1, and `steps[*].methodRequirement.instrumentRole` would be a 3-segment wildcard path. R1 as specified covers the three reference paths above; I deliberately do not sweep `methodRequirement.instrumentRole` into R1 (out of the spec's enumerated closure). Flagged for orchestrator awareness — adding it later is one more `any[not(nonEmpty), allIn]` branch, no DSL work needed. No other step-carried role reference exists (grep of the schema: StepAddMaterial.material.materialRole targets `roles.materialRoles`, which is explicitly out of scope — "Material-role CRUD" is listed in out-of-scope; no materialRole closure rule was requested).

## DSL-gap analysis (R2/R3)

- **R2 needs per-item quantification.** `nonEmpty` on `roles.labwareRoles[*].description` resolves to the array of PRESENT values → ANY-semantics (PathResolver.ts:255-261), exactly as the expressiveness finding says. → `everyItem` added: `{op:'everyItem', collectionPath, itemField?, assert}`; vacuous true on `[]`, loud FAIL naming the path when `collectionPath` is unresolvable/non-array, failure reason names the item index. `itemField` included (documented + tested semantics) because the meta-schema mirrors allIn's shape; the rules themselves do not use it.
- **R3 needs disjointness.** `allIn`'s `not` is "SOME ∉ B", not "NONE ∈ B". → `noneIn` added as the thin symmetric variation sharing `allIn`'s selection/failure core (single factored function, per the spec's "not a copy-paste fork").
- **Zero domain names in TypeScript** — the evaluators read only `collectionPath`/`path`/`itemField`/`assert`; every protocol shape lives in the YAML.

## Design decisions the spec asked me to make and document

1. **R2 `when`-guard:** `when: nonEmpty roles.labwareRoles`. `everyItem` fails LOUDLY on an unresolvable `collectionPath` (by design), so without the guard a protocol with no `roles` block (or empty labwareRoles) would emit a spurious warning. With the guard such protocols stay clean (test: "a protocol with no labwareRoles block emits no R2 noise").
2. **R3 `when`-guard:** both categories non-empty — same loud-fail reasoning; single-category protocols emit no noise (test covers it).
3. **R1 vacuity structure:** each category branch is `any[ not(nonEmpty refs), allIn(refs, declared) ]`. Without this, a protocol with no steps of a category (or no `roles` block at all but no role refs — e.g. only `kind: other` steps) would loud-fail on the unresolvable collectionPath. With it: no refs → vacuous pass; refs present → allIn runs and a missing declared collection FAILS LOUDLY (test: "a step role reference with NO declared roles block at all is an error" → error). This required the `nonEmpty.path` meta-schema pattern to accept `[*]` (the interpreter already supported it; documented in the branch description).
4. **Message templates name the offender via `{{path}}` interpolation** (PathResolver.interpolateTemplate): R1's rendered message contains the offending step id AND the dangling value (proven per-location in tests and by the E2E curl below). Wildcard placeholders render as the full checked lists, so the reader can diff "refs checked" against "declared" to locate the dangling ref. Unresolvable placeholders render as `<path>` (existing interpolater behaviour), which is honest ("absent").

## RED → GREEN evidence

- **RED** (test file written first, rules/DSL absent): `npx vitest run server/src/lint/ProtocolLintRules.test.ts` → `Tests 34 failed | 9 passed (43)` (op-unknown failures, `rules: []` spec, meta-schema rejecting the new ops).
- **GREEN** (after YAML + evaluator implementation): same command → `Test Files 1 passed (1) · Tests 42 passed (42)`.
- **Whole lint directory:** `npx vitest run server/src/lint/` → `5 files passed (5) · 105 tests passed (105)` (LintEngine 27, studyRunRules 8, CrossCollectionPredicate 19 — the PROTO-AI-3 suite still green after the allIn refactor — mentionKind 9, ProtocolLintRules 42).
- **Meta-schema neighbours:** `ServiceDomainSchemas.test.ts` (10) + `ControlledDocumentSchemas.test.ts` (21) → 31 passed.
- **Typecheck:** `npm run typecheck -w server` fails at TRUNK BASELINE (`Cannot find module './materialBinding.js'` etc. — the committed tree lacks the lane-exclude files). Measured: `npx tsc --noEmit` = **50 errors baseline (changes stashed) and 50 errors with my changes; 0 in `src/lint/`**. Zero new typecheck errors; the RED-at-baseline typecheck is an environment fact, not my regression.
- **Full-suite baseline diff:** pre-change run captured at `51419ada` BEFORE any edit: `Test Files 134 failed | 434 passed | 9 skipped (577) · Tests 221 failed | 3904 passed | 68 skipped (4239)` (saved `/tmp/proto-ai-4-baseline-full.txt`). Post-change run: `Test Files 125 failed | 472 passed | 9 skipped (606) · Tests 278 failed | 4286 passed | 68 skipped (4848)` (saved `/tmp/proto-ai-4-after-full.txt`). Per-file failing-set diff (file-level `❯` lines, sorted sets): **ZERO new failures among TRACKED files.** Details:
  - The post run's 606 files vs baseline's 577: the delta is the 29 lane-exclude untracked test copies (module-provisioning AS-W4), 14 of which fail standalone-on-trunk by their own pre-existing nature (all 14 verified present in `/home/brad/.hermes/cl/lanes/2/lane-exclude` and untracked; none shipped by me).
  - 23 tracked files that failed at baseline now PASS — baseline they died as collection errors (`(0 test)`, missing lane-exclude modules); with the provisioned modules they collect and pass.
  - Two tracked candidates initially looked new: `AuditEventService.test.ts` (baseline: failed as `(0 test)` collection; after: 2 test failures) and `RevisionStorage.test.ts` (same). VERIFIED pre-existing: run on the UNTOUCHED trunk worktree `/mnt/vast/home/brad/git/cl-integration-2` (zero of my changes): identical 2+2 failures. `ServiceDomainSchemas.test.ts` failed at BOTH runs with byte-identical failing line refs (289:19, 331:21) — environment-sensitive (lifecycle dir count), unchanged by me; passes standalone in my worktree (10/10, twice).
  - My five lint suites green INSIDE the full run: ProtocolLintRules 42, LintEngine 27, CrossCollectionPredicate 19, studyRunRules 8, mentionKind 9.

## Gate table

| Gate | Status |
|---|---|
| R1 dangling step labwareRole → error naming step id + offending ref | PASS (9 fixtures, rendered message asserted) |
| One fixture per schema labwareRole location | PASS (target×6 incl. transfer.target, source×2, instrumentRole×1) |
| Cross-category duplicate → warning | PASS (unit + E2E) |
| Clean protocol → zero findings | PASS (unit + E2E: `valid:true, violations:[], summary.errors:0, warnings:0`) |
| `message.template` names instance path + dangling value via `{{path}}` | PASS (asserted in test and in curl output) |
| RED-first | PASS (34 failed captured) |
| Zero domain checks in TypeScript | PASS (generic ops only) |
| No other rule activated | PASS (`rules.map(id)` asserted to be exactly the three) |
| Targeted suite green + zero NEW failures | PASS (see full-suite diff) |
| Typecheck: zero new errors | PASS (50→50, 0 in src/lint) |
| E2E after stack restart | PASS (curl below) |
| Commits on lane branch, no merge | PASS |

## E2E curl proof

Environment note (recorded as an assumption): `cl-lane-stack.sh 2 restart` starts the stack from the TRUNK worktree (`/mnt/vast/home/brad/git/cl-integration-2`), which cannot see my unmerged YAML — restarting it would prove nothing about my rules and would churn the trunk stack a second lane-6 worker shares. Per the spec's actual requirement ("the lint endpoint serves my YAML after a fresh process start"), I ran THIS worktree's server (`npx tsx src/server.ts`, fresh process, my YAML) on a separate port 3095, never touching :3001/:5174/:3093. Server boot log: `Loaded 21 lint specs, 47 rules`.

Dangling fixture (dangling `ghost-plate-7` at add-dye.target, non-identity-bearing `washer`, cross-category `washer` duplicate):

```
$ curl -s -X POST http://127.0.0.1:3095/api/lint -H 'Content-Type: application/json' -d '<payload: protocol PRT-lint-e2e, roles {labwareRoles:[plate*,washer], instrumentRoles:[washer,ghost-instrument-9*]}, steps add-dye(target=ghost-plate-7)/wash(plate)/read(plate, instrumentRole=washer)>'
{"valid":false,"violations":[
 {"ruleId":"step-role-closure","severity":"error","message":"Protocol 'PRT-lint-e2e': step role references must resolve to declared roles. step ids: add-dye,wash-plate,read-od; refs checked at steps[*].target.labwareRole=ghost-plate-7,plate,plate and steps[*].source.labwareRole= (must be declared in roles.labwareRoles[*].roleId=plate,washer) and steps[*].instrumentRole=washer (must be declared in roles.instrumentRoles[*].roleId=washer,ghost-instrument-9)."},
 {"ruleId":"labware-role-identity-bearing","severity":"warning","message":"Protocol 'PRT-lint-e2e': labware role(s) at roles.labwareRoles are not identity-bearing (need description + expectedLabwareKinds); roleIds: plate,washer.","path":"roles.labwareRoles"},
 {"ruleId":"role-id-category-unique","severity":"warning","message":"Protocol 'PRT-lint-e2e': a roleId appears in BOTH categories — roles.labwareRoles roleIds plate,washer overlap roles.instrumentRoles roleIds washer,ghost-instrument-9.","path":"roles.labwareRoles[*].roleId"}],
 "summary":{"total":3,"passed":0,"failed":3,"skipped":0,"errors":1,"warnings":2,"info":0},
 "schemaId":"https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"}
```

The error message names the offending step (`add-dye`) and the dangling value (`ghost-plate-7`) inside the refs-checked list vs the declared list.

Clean fixture:

```
$ curl -s -X POST http://127.0.0.1:3095/api/lint -H 'Content-Type: application/json' -d '<protocol PRT-lint-e2e-clean: identity-bearing plate + reader, all refs resolve>'
{"valid":true,"violations":[],"summary":{"total":3,"passed":3,"failed":0,"skipped":0,"errors":0,"warnings":0,"info":0},"schemaId":"https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"}
```

(The orchestrator may re-run the same curls against :3093 after merging this branch and restarting via `cl-lane-stack.sh 2 restart`; the route is `POST /api/lint`, body `{schemaId, payload}` — ValidationHandlers.lint.)

## Known-flag note (spec: "just note it if it affects you")

`loadAllLintSpecs` does NOT validate specs against `lint-v1.schema.yaml` (the separate known flag). Consequence: my meta-schema additions are enforced by the test-level contract block (Ajv), not at server load. Also the meta-schema's root `additionalProperties: false` predates the file-level `schemaId:` convention every existing *.lint.yaml uses, so the contract test validates the `{lintVersion, rules}` projection — documented in the test comment. No change needed by me; leaving as is per out-of-scope.

## Consequential assumptions (fudge ledger)

- `assumption_id`: AS-PROTO-AI-4-W1 (worker)
  `assumption_value`: widened `nonEmpty.path` meta-schema pattern to accept `[*]` segments (beyond the letter of "add everyItem + noneIn"), because R1's per-category vacuity guard (`not(nonEmpty wildcard)` inside `any`) cannot be DECLARED otherwise, and the interpreter already resolves wildcard paths for nonEmpty — the pattern was simply stricter than the runtime. Documented in the branch description; a test of the REAL protocol.lint.yaml against the meta-schema passes.
  `assumption_where`: `schema/lint/lint-v1.schema.yaml` nonEmpty branch.
  `assumption_affects`: R1's vacuity structure (a protocol with no refs of a category, or no roles block, must stay clean — spec-mandated acceptance).
  `assumption_reversible`: true (revert the pattern + use bare allIn branches only if the orchestrator prefers loud-fail-on-no-roles-block semantics; would break the "no roles → clean" acceptance test).
  `assumption_owner`: orchestrator.
- `assumption_id`: AS-PROTO-AI-4-W2
  `assumption_value`: E2E served from my worktree on port 3095 (fresh process) instead of `cl-lane-stack.sh 2 restart`, because the script serves the TRUNK worktree which cannot see unmerged rules; restarting :3093 would restart a stack shared with the PROTO-AI-6 worker for no evidentiary gain. Spec's requirement (fresh process loading my YAML + curl on /lint) is met.
  `assumption_owner`: orchestrator (post-merge re-run on :3093 recommended; cheap).
- `assumption_id`: AS-PROTO-AI-4-W3
  `assumption_value`: R1 covers `steps[*].target/source.labwareRole` + `steps[*].instrumentRole` only; `steps[*].methodRequirement.instrumentRole` (reachable via ProtocolStep.methodRequirement — the spec's open question) is NOT swept in, per the spec's own "do not treat it as a step path unless you find a step-level reference" plus its role-as-method-constraint semantics. Finding stated above; one-branch extension if the architect wants it.
  `assumption_owner`: orchestrator → architect only if Brad wants methodRequirement closure.
- `assumption_id`: AS-PROTO-AI-4-W4
  `assumption_value`: E2E workspace boot needed the lane-exclude synced files (`/home/brad/.hermes/cl/lanes/2/lane-exclude`, 62 files incl. `server/src/lifecycle/BypassAudit.ts`, `server/src/lint/AuthoringGuard.ts`) copied from trunk into my worktree — they are lane-provisioned untracked copies (git-excluded via `~/.hermes/cl/lanes/2/lane-exclude`, `git status` shows ONLY my 5 deliverable files), matching how the trunk worktree itself runs. Not committed, not authored by me.
  `assumption_owner`: orchestrator (this is why `npx tsx src/server.ts` from the bare branch dies with ERR_MODULE_NOT_FOUND at baseline — an environment fact worth knowing before any lane tries :3093-style E2E from a fresh worktree).

## Verification commands (rerunnable)

```
cd /mnt/vast/home/brad/git/wt/PROTO-AI-4-lane2-l2t0940
npx vitest run server/src/lint/ProtocolLintRules.test.ts   # 42/42
npx vitest run server/src/lint/                            # 5 files / 105 tests
npx vitest run server/src/lint/ server/src/schema/ServiceDomainSchemas.test.ts server/src/schema/ControlledDocumentSchemas.test.ts
cd server && npx tsc --noEmit                              # 50 errors == baseline 50, 0 in src/lint
```

STATUS: done
