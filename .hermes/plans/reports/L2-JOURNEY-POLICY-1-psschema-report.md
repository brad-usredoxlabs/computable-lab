# L2-JOURNEY-POLICY-1 — unit ps-schema (1 of 3)

Worktree `/home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2`, branch
`cl/lane2-journey-policy-psschema-2350`, base `46029f8b096feb6ebde2026f99e9473b627fd67a`.

## What landed
- `schema/governance/policy-set.schema.yaml` (NEW, 84 lines) — closed declared policy set:
  `kind: policy-set`, `id ^PSET-[A-Z0-9][A-Z0-9_-]*$`, `label`, `version` int>=1,
  `effective_from` date-time, closed `scope {lab, project}`, `rules` minItems 1,
  required `defaults.unclassified` (allow|confirm|deny), `conflict.deny_wins: const true`.
  Rules closed over `rule_id`, `match` (closed over exactly capability, effect_kind
  (6-value enum), record_kind, regulated, actor_role, provenance_completeness,
  environment), `proposal`/`execution` (`allow|confirm|deny`), optional `approval`
  (roles/approvers/meaning/separation_of_duties, all required+closed), optional
  `obligations` (closed `$defs/obligation` enum), optional `evidence_retention`.
  `if/then`: `match.regulated == true` AND `execution == allow` ⇒ `approval` required.
- `schema/governance/policy-decision-record.schema.yaml` (NEW, 34 lines) — closed
  `kind: policy-decision-record`, `id ^PDR-…$`, `policy_set_ref {id, version}`,
  `evaluated_attributes` closed over the same 7 attribute names as `match`,
  `matched_rule_ids` (minItems 1, uniqueItems), `outcome`
  (`allowed|needs-confirmation|blocked`), `remaining_obligations`, `evaluated_at`.
- `server/src/policy/policySetSchema.test.ts` (NEW, 143 lines) — RED-first; 7 tests.

Budget: 3 files, 260 lines total (<= 260).

## Decisions / deviations
- **No `$ref` into `common.schema.yaml`** (per brief): relative-ref resolution risk
  under `strict: true` in a node test, and the common ref is unrelated to this seam.
  Both schemas are fully self-contained, following the `record-revision.schema.yaml`
  header idiom (draft 2020-12, `$id`, `title`, plain `additionalProperties: false`).
- **`addFormats(ajv)`** registered on the one pinned
  `new Ajv2020({ strict: true, allErrors: true })` instance (instance options
  unchanged). Probed first-hand: with `strict: true` and no registered formats,
  Ajv 8.20 THROWS at compile on `format: date-time` ("unknown format … ignored in
  schema"); `ajv-formats` (already a server dependency, same pipeline as
  `AjvValidator.ts:157-169`) makes the pinned format keyword enforced.
- **strict-mode shape of the regulated-approval clause** (probed first-hand):
  Ajv `strictRequired`/`strictTypes` require `type: object` on the `if`/`then`
  sub-schemas and a `properties` block in `then` covering its `required` keys.
  Implemented accordingly (relative `$ref` to `$defs/approval` inside `then`).
- **Error-path semantics** (probed first-hand against the real schemas): Ajv reports
  missing required props at the CONTAINING object path with
  `params.missingProperty` — so arm (b) asserts `/defaults` + `missingProperty:
  unclassified` and arm (c) asserts `/rules/0` + `missingProperty: approval`
  (the if/then-derived required). Each arm asserts a NAMED instancePath/keyword.
- **Vocabulary pin**: imports `PolicyDisposition` and
  `PolicyDecisionDisposition` from `../../policy/types.js` and asserts
  `Object.keys` of the typed records deep-equal the loaded schemas'
  `$defs.rule.properties.proposal.enum` and `properties.outcome.enum`.
- **Infrastructure (not in commit)**: worktree had no `server/node_modules`; created
  `server/node_modules -> /mnt/vast/home/brad/git/cl-integration-2/server/node_modules`
  (gitignored, same convention as sibling lane worktrees) so `npx vitest`/`npx tsc`
  resolve. Not committed; untracked.

## Commits (one per numbered step, never rewrote history)
- `be780677` journey policy psschema: RED test (both schemas absent)
- `4eb11f4a` journey policy psschema: policy-set.schema.yaml
- `990076b9` journey policy psschema: policy-decision-record.schema.yaml + GREEN test
- code HEAD = `990076b963380c58834d95432ef780224955c2f6`

## RED (raw, first arm / both schemas absent)
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2/server

 ❯ src/policy/policySetSchema.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/policy/policySetSchema.test.ts [ src/policy/policySetSchema.test.ts ]
Error: ENOENT: no such file or directory, open '/home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2/schema/governance/policy-set.schema.yaml'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  no tests
   Start at  23:53:47
   Duration  1.99s (transform 38ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 469ms)
```

## MUTATION PROBE (each applied on its own, reverted before commit)
- **A** — deleted the rule `if/then` regulated-approval clause → arm (c) RED:
  ```
  FAIL  … > (c) rejects a regulated:true + execution:allow rule with no approval — named required error
  AssertionError: expected true to be false // Object.is equality
        Tests  1 failed | 6 passed (7)
  ```
- **B** — made `defaults.unclassified` optional → arm (b) RED:
  ```
  FAIL  … > (b) rejects a set missing defaults.unclassified — named required error
  AssertionError: expected true to be false // Object.is equality
        Tests  1 failed | 6 passed (7)
  ```
- **C** — changed `proposal` enum to `[allow, deny]` → pin RED (+ arm (a) RED):
  ```
  FAIL  … > (a) accepts a valid 2-rule set (regulated confirm w/ approval; deny)
  AssertionError: [{"instancePath":"/rules/0/proposal","schemaPath":"#/properties/proposal/enum","keyword":"enum","params":{"allowedValues":["allow","deny"]},…}: expected false to be true
  FAIL  … > pins both disposition vocabularies to the shipped server policy types
  AssertionError: expected [ 'allow', 'confirm', 'deny' ] to deeply equal [ 'allow', 'deny' ]
        Tests  2 failed | 5 passed (7)
  ```
Restoration verified byte-identical to backups (`cmp` clean).

## VERIFY BEFORE EXIT (raw)
- `cd server && npx vitest run src/policy/policySetSchema.test.ts`:
  ```
  Test Files  1 passed (1)
       Tests  7 passed (7)
  ```
- `cd server && npx vitest run src/compiler/journey/journeyDocumentLint.test.ts`
  (baseline at 46029f8b = "Tests  5 passed (5)"; unchanged):
  ```
  Test Files  1 passed (1)
       Tests  5 passed (5)
  ```
- `cd server && npx tsc --noEmit` (run once): exit 0, **0 lines** (baseline 0 lines).
- `git -c core.fileMode=false status --short` → clean tree at exit (empty output).

## Prohibited files: untouched
`schema/core/policy-bundle.schema.yaml`, `schema/core/policy-bundles/*`,
`server/src/policy/types.ts`, `server/src/policy/PolicyBundleService.ts`,
`server/src/policy/PolicyProfileService.ts`, `server/src/compiler/journey/**`,
`app/**`, no `dist/**`, no other worktree. The 4 shipped level-based bundles stay the
settings authority; `resolveSettings` behaviour and all journey compiler files unchanged.

## Acceptance
Waived — data-only unit (two schemas + one test file). Observable = the validation
verdict per arm; no client surface or route at this rev. Unit 3 carries the browser
criterion.

## Next actions
- Units 2 and 3 (restrictive combiner; AT-DISPATCH refusal) are separate units; this
  unit lands only the declared shape + pins.
- Orchestrator owns reloading the lane stack if the YAML is exercised live (this unit
  adds schema files; no lane reload performed here).
- Scratch receipts: `/home/brad/.policy-psschema-scratch/` (red-output.txt,
  mutA/B/C.txt, v1/v2/v3.txt, backups/).

## Changed files
- `schema/governance/policy-set.schema.yaml` (NEW, 84)
- `schema/governance/policy-decision-record.schema.yaml` (NEW, 34)
- `server/src/policy/policySetSchema.test.ts` (NEW, 143)

L2-JOURNEY-POLICY-1 UNIT unit DONE 990076b963380c58834d95432ef780224955c2f6
