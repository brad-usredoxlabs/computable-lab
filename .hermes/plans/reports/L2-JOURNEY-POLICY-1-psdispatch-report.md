# L2-JOURNEY-POLICY-1 — unit psdispatch (3 of 3)

Worktree `/home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2`, branch
`cl/lane2-journey-policy-psschema-2350`, base `46029f8b096feb6ebde2026f99e9473b627fd67a`,
continuation after unit 1 (ps-schema) and unit 2 (pseval) in THIS worktree.

## STATUS: BLOCKED — unit-2-evaluator-absent

STEP 0 of the brief (verify units 1 and 2 landed before writing anything) FAILS. No code was
written, no file changed, no commit made. The tree is clean at exit (verified below).

## STEP 0 evidence (run first-hand at this run's start)

```
$ test -f schema/governance/policy-set.schema.yaml && test -f schema/governance/policy-decision-record.schema.yaml && test -f server/src/policy/policySetEvaluator.ts
-> FAILS:
  policy-set.schema.yaml             PRESENT  (unit 1, commit 4eb11f4a)
  policy-decision-record.schema.yaml PRESENT  (unit 1, commit 990076b9)
  server/src/policy/policySetEvaluator.ts  ABSENT

$ grep -n "export function evaluatePolicySet" server/src/policy/policySetEvaluator.ts
-> grep: server/src/policy/policySetEvaluator.ts: No such file or directory (no export anywhere)
```

Corroboration (each first-hand this run):

1. `grep -rn "evaluatePolicySet" server/src --include='*.ts'` → **0 hits** anywhere in the
   server tree (only unit 1's schema-test pins the schemas; nothing implements the combiner).
2. `find` for any `*olicySet*` file outside node_modules/.git → only
   `server/src/policy/policySetSchema.test.ts` (unit 1's test) and the two schemas.
   No `policySetEvaluator.ts`, no test for it, no commit in this branch's history that could
   contain it (`git log 46029f8b..HEAD` = exactly unit 1's four commits).
3. **No unit 2 (pseval) report exists** in this worktree
   (`.hermes/plans/reports/L2-JOURNEY-POLICY-1-pseval-report.md` — no such file).
4. Searched **all branches** (`git ls-tree -r --name-only` per ref): no branch carries
   `server/src/policy/policySetEvaluator.ts`.
5. Scanned **all sibling worktrees** under `/home/brad/cl-wt/`: none contains the evaluator.

Conclusion: unit 2 (brief 23:46, `policySetEvaluator.ts` + its restrictive-combiner tests) did
not land — either it never ran in this worktree, or its commit was lost. Per the brief this is a
BLOCKED, not an edit: "if they are absent or disagree, that is a BLOCKED, not an edit." I cannot
build `authorizeJourneyDispatch` against a non-existent `evaluatePolicySet(set, attributes)`
export, and `server/src/policy/**` is prohibited to me.

## Secondary STEP-0 check (recorded for the orchestrator; would be a second independent block)

The shipped `schema/governance/policy-decision-record.schema.yaml` (unit 1, read first-hand)
requires:

- `required: [..., matched_rule_ids, ...]` (line 7)
- `matched_rule_ids: { type: array, minItems: 1, uniqueItems: true, items: { type: string,
  minLength: 1 } }` (line 31)

So the schema REQUIRES `matched_rule_ids` with `minItems: 1`. The brief's arm (b) — an envelope
against a set with NO matching rule, refused "via the set's restrictive default … no rule id
invented" — produces a default path with zero matched rules, which **cannot** validate against
this schema. This is exactly the disagreement the brief's STEP 0 anticipates
(`schema-evaluator-disagree-on-defaults`). It can only be resolved once unit 2 exists: either
unit 2's evaluator emits a real, non-synthetic marker id for the default path (in which case the
schema is satisfied and I proceed), or unit 1's schema must change `minItems` (unit 1's
ownership — not mine to edit). Not resolved here; flagged for the orchestrator.

## Worktree health at the resume point (no code changed by this run)

- `git -c core.fileMode=false status --short` → empty (clean tree).
- `cd server && npx tsc --noEmit` → exit 0, **0 lines** (matches measured baseline at 46029f8b).
- `cd server && npx vitest run src/compiler/journey/journeyEnvelopeAuthorization.test.ts` →
  `Tests  6 passed (6)` (matches baseline; unchanged).
- `cd server && npx vitest run src/compiler/journey/journeyDocumentLint.test.ts` →
  `Tests  5 passed (5)` (matches baseline; unchanged).
- HEAD at exit: `fcc58c9689012a980c57bbb4054c41047022e97f` (unit 1's report+marker commit;
  no unit-3 commit exists, as expected for a BLOCKED).

## Prohibited files: untouched
No file opened for edit. `server/src/policy/**`, `schema/governance/**`,
`schema/core/**`, `server/src/compiler/journey/**`, `server/src/api/routes.ts`, `app/**`,
`config/**`, `dist/**` all unmodified.

## Changed files
None (BLOCKED at STEP 0, before any write).

## Next actions (owner: orchestrator)
1. **Re-run unit 2 (pseval, brief 23:46) in this worktree** — or locate and replay its commit if
   it landed elsewhere. Resume condition for unit 3: `test -f server/src/policy/policySetEvaluator.ts
   && grep -q "export function evaluatePolicySet" server/src/policy/policySetEvaluator.ts`.
2. **Resolve the defaults disagreement before unit 3 proceeds** (named field paths:
   `schema/governance/policy-decision-record.schema.yaml` `properties.matched_rule_ids.minItems`
   (=1, required) vs. the no-match default path which carries 0 rule ids). Decide whether unit 2's
   evaluator emits a real marker id for the default path or unit 1's schema is amended — then
   re-verify arm (b) of this unit's brief against that decision.
3. Re-launch unit 3 (this brief) once both are true; the unit is otherwise unblocked and the
   worktree is clean at the correct resume point.

## Acceptance
Not reached — the unit was BLOCKED at STEP 0; no dispatch endpoint exists; AC1–AC4 unverified.
There is no journey dispatch UI at this rev (gate would grade over HTTP via `app.inject`).

L2-JOURNEY-POLICY-1 UNIT 3 BLOCKED unit-2-evaluator-absent (server/src/policy/policySetEvaluator.ts + evaluatePolicySet export missing from worktree/branches/siblings; secondary: policy-decision-record schema matched_rule_ids minItems:1 vs no-match default path)
