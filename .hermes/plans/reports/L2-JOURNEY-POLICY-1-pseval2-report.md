# L2-JOURNEY-POLICY-1 — UNIT 2 (pseval2) REPORT

- Item: L2-JOURNEY-POLICY-1, unit 2 of 3 (re-cut brief pseval2-0052)
- Worktree: /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2
- Branch: cl/lane2-journey-policy-psschema-2350
- Base: 92ee16fa11a3d30a9a85097712792681ad9c852f
- Product commits: d9b4e70a (RED arms), a3b83e4d (evaluator + schema relaxation)

## What changed
1. server/src/policy/policySetEvaluator.ts (NEW) — pure evaluator, ONE entry
   point `evaluatePolicySet({sets, attributes, now}) -> PolicyDecisionRecord`.
   No fs, no clock, no env. Deny-precedence fold over ALL matching rules across
   sets; obligations unioned (dedup, stable order); regulated allow + matching
   execution:allow => needs-confirmation with declared approval.roles (never
   upgraded to allowed); no match => defaults.unclassified mapped
   allow->allowed / confirm->needs-confirmation / deny->blocked with
   `matched_rule_ids: []` (no synthesised id); `stale_inputs` (declared in the
   evaluator's PolicyAttributes, NOT in policy-set.schema.yaml) forces blocked
   with the stale names in remaining_obligations. Rule matching is generic
   equality over the rule's declared `match` keys (absent = wildcard). No
   record-kind / capability-id / lab / project literals in the TS. Dispositions
   reuse the shipped `PolicyDisposition` / `PolicyDecisionDisposition` from
   ./types.js — no parallel enum. Record built with concrete values only
   (exactOptionalPropertyTypes-safe).
2. server/src/policy/policySetEvaluator.test.ts (NEW) — 6 red-first arms
   (a) deny wins across two sets, both ids named; (b) obligations accumulate;
   (c) regulated sign-off; (d) unclassified restrictive default, empty ids;
   (e) stale inputs force blocked; (f) shipped-schema arm: the (d) record
   validates AND a duplicated rule id still FAILS uniqueItems. Documents are
   plain objects; the SAME single Ajv2020({strict:true,allErrors:true}) +
   addFormats idiom as policySetSchema.test.ts:19-30 — no second Ajv.
3. schema/governance/policy-decision-record.schema.yaml — `matched_rule_ids`
   relaxed to `minItems: 0` with an extended description (a DEFAULT names NO
   rule, because a default is not a rule). All other bytes, order, and $id
   unchanged. policy-set.schema.yaml untouched.

## Real verification (RAW)
- STEP 0: both unit-1 schemas present at 92ee16fa — confirmed, STEP0_OK.
- RED first: module absent -> "Test Files 1 failed (1) / Tests no tests".
- `npx vitest run src/policy/policySetEvaluator.test.ts`
  -> `Test Files  1 passed (1)` / `Tests  6 passed (6)`
- `npx vitest run src/policy/policySetSchema.test.ts`
  -> `Test Files  1 passed (1)` / `Tests  7 passed (7)` (baseline held)
- `npx tsc --noEmit` -> 0 lines of output (trunk baseline 0).

## Mutation probes
- A: deny-precedence `matched.some(...deny)` replaced by first-match-wins
  (`matched[0].rule.execution === 'deny'`) ->
  `Tests  1 failed | 5 passed (6)`; the failing arm named:
  "(a) deny wins: a matching deny beats a matching allow from another set".
  Reverted via git checkout.
- B: default path `matched_rule_ids: ['default']` ->
  `Tests  1 failed | 5 passed (6)`; failing arm "(d) unclassified default".
  Reverted via git checkout.
- `git -c core.fileMode=false status --short` after each revert and at exit:
  empty (no product path).

## Notes
- Arm (f) initially FAILED before the relaxation — the exact landmine the brief
  predicted (minItems: 1 vs. a legitimate empty-match default record); resolved
  in the open per step 4, not by inventing a rule id.
- journeyEnvelope.ts untouched; PolicyBundleService / PolicyProfileService /
  types.ts / policySetSchema.test.ts untouched; no edits outside owned files.

## Remaining issues
- Unit 3 (psdispatch) can now call evaluatePolicySet; the evaluator is no
  longer the blocker.

L2-JOURNEY-POLICY-1 UNIT 2 DONE a3b83e4d9b0bc483698d407993ffbd984858033e
