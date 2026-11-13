# L2-JOURNEY-POLICY-1 — unit pseval2fix (advc c1 FIX-FUNCTIONAL) — report

- worktree: /home/brad/cl-wt/L2-JPOLICY-pseval2fix-lane2
- branch: cl/lane2-jpolicy-pseval2fix-0205
- base: 82d51fbad76d4d98c0728aabf28342df3b3c0118
- lane 2, item L2-JOURNEY-POLICY-1, tier consequential (fix cycle 1)
- owned files touched: server/src/policy/policySetEvaluator.ts,
  server/src/policy/policySetEvaluator.test.ts (only these plus this report)

## Decisions

- D1: computed `stale` once (declared stale names, stable first-occurrence dedupe) before
  classification; the `matched.length === 0` (unclassified) record now returns
  outcome blocked + the stale names as obligations when stale is non-empty, and otherwise
  the declared `defaults.unclassified` mapping unchanged. `matched_rule_ids` stays `[]`
  (no rule-id synthesis). The matched path reuses the same `stale` array.
- D2: `matchedRuleIds` deduped with `[...new Set(...)]` — first-occurrence order preserved,
  no sort, so the emitted record satisfies uniqueItems in policy-decision-record.schema.yaml.
- D3: no production change expected or made; both pins (i, j) are green and both die under
  the reviewer's mutation (`confirm: 'allowed'`), verified below.

## Commits (one per numbered step)

    9a370cc5 pseval2fix: red arms (stale pre-classification, rule-id dedupe, confirm pins)
    0a648031 pseval2fix: stale forces blocked pre-classification
    020b5a32 pseval2fix: dedupe matched rule ids

Report commit follows these (this file).

## Environment note (dependency provisioning gap)

This worktree was created WITHOUT node_modules (base worktrees have their own; this one had
none), so the brief's commands initially failed with `Cannot find package 'vitest'`.
No installs were performed (brief: no installs). To run the brief's own verification
commands the worktree root got an untracked, gitignored symlink
`node_modules -> /home/brad/cl-wt/L2-JOURNEY-HUMANTASK-1-htcschema-lane2/node_modules`
(a complete sibling install: vitest + typescript + fastify + MCP sdk). With it, the
brief's baselines reproduce exactly (tests 6/6, schema 7/7, tsc 0 lines). Symlink is
removed at exit; `git status --short` is empty either way (node_modules is gitignored).
Orchestrator note: future worktrees need deps provisioned, otherwise only this
symlink workaround makes the stated verify commands runnable.

## Step 1 — RED arms (commit 9a370cc5)

Arms added to server/src/policy/policySetEvaluator.test.ts (existing style, existing Ajv
instance `validatePdr` reused — no second validator):
- (g) stale_inputs with NO matching rule, defaults.unclassified 'allow' -> blocked, names in obligations, matched_rule_ids []
- (h) two sets both declaring rule_id R-READ -> matched_rule_ids ['R-READ'], record passes validatePdr
- (i) defaults.unclassified 'confirm' -> needs-confirmation
- (j) matching rule execution 'confirm' (non-regulated) -> needs-confirmation

Pre-edit baseline (raw):

    RUN  v1.6.1 /home/brad/cl-wt/L2-JPOLICY-pseval2fix-lane2/server
     ✓ src/policy/policySetEvaluator.test.ts  (6 tests) 15ms
     Test Files  1 passed (1)
          Tests  6 passed (6)

After arms added (raw, tail):

    FAIL  ... > (g) stale inputs force blocked on the unclassified path too, names kept as obligations
    AssertionError: expected 'allowed' to be 'blocked' // Object.is equality
    FAIL  ... > (h) duplicate rule id across two sets is emitted once and still passes the shipped validator
    AssertionError: expected [ 'R-READ', 'R-READ' ] to deeply equal [ 'R-READ' ]
     Test Files  1 failed (1)
          Tests  2 failed | 8 passed (10)

=> arms g and h RED as required; i and j green (pins), existing 6 green.

## Step 2 — GREEN D1 (commit 0a648031)

After the fix, D1 arm green, D2 arm still red (raw tail):

    ❯ src/policy/policySetEvaluator.test.ts:124:34  (h) matched_rule_ids
     Test Files  1 failed (1)
          Tests  1 failed | 9 passed (10)

## Step 3 — GREEN D2 (commit 020b5a32)

Final targeted + regression + typecheck (raw):

    RUN  v1.6.1 .../server
     ✓ src/policy/policySetEvaluator.test.ts  (10 tests) 10ms
     Test Files  1 passed (1)
          Tests  10 passed (10)

     ✓ src/policy/policySetSchema.test.ts  (7 tests) 7ms
     Test Files  1 passed (1)
          Tests  7 passed (7)

    $ npx tsc --noEmit 2>&1 | wc -l
    0

Pre-edit tsc baseline in this worktree (same symlink): 0 lines. Delta 0.

## Step 4 — D3 mutation check (pins bite, production unchanged)

Temporarily mutated OUTCOME.confirm: 'needs-confirmation' -> 'allowed' (reverted with
git checkout; tree clean, HEAD 020b5a32):

    Failed Tests 2
     FAIL  ... > (i) unclassified confirm default ⇒ needs-confirmation
     FAIL  ... > (j) a matching non-regulated confirm execution ⇒ needs-confirmation
          Tests  2 failed | 8 passed (10)

=> confirm -> needs-confirmation is pinned on BOTH reachable paths; no prod change made.

## Diff / tree

    $ git diff --stat 82d51fbad76d4d98c0728aabf28342df3b3c0118..HEAD
     server/src/policy/policySetEvaluator.test.ts | 37 ++++++++++++++++++++++++++++
     server/src/policy/policySetEvaluator.ts      | 15 ++++++-----
     2 files changed, 46 insertions(+), 6 deletions(-)

    $ git -c core.fileMode=false status --short
    (empty before this report was written; empty after the report commit)

Budget: 2 code files, 46 insertions / 6 deletions (<= 120 lines). No schema, api, app,
wiring, checkpoint or journey module touched. No new files outside the two owned paths
(plus this required report).

## Acceptance contract mapping

1. stale_inputs non-empty + zero matching rules -> blocked with names in remaining_obligations: arm (g).
2. duplicate rule_id across sets -> ['R-READ'] order-preserving and shipped validator passes: arm (h).
3. both confirm paths -> needs-confirmation: arms (i), (j), mutation-verified.
4. existing 6 arms + 7 schema tests green, tsc delta 0: shown raw above.
- Browser gate: waived for this fix unit (pure evaluator seam, no UI surface).

## Scratch

/home/brad/.pseval2fix-scratch/ created empty (no artifacts needed); deleted at exit.

L2-JOURNEY-POLICY-1 UNIT pseval2fix DONE 020b5a32e2129e9c15b8d7a724a9e17fe8d33050
