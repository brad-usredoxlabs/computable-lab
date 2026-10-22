# MATRES-ELIG — CODER FIX REPORT (fix-run 1, l2t1445-coder2)

Item: MATRES-ELIG (three-way material eligibility as data over the predicate DSL)
Worktree: /mnt/vast/home/brad/git/wt/matres-elig-lane2-l2t1445
Branch: cl/lane2-matres-elig-l2t1445
Prior HEAD: a71c021c (coder1) — base 6f8fb519
Fix commit: c50499db (17 files, +735/-48)
Review addressed: /home/brad/.hermes/cl/lanes/2/reviews/MATRES-ELIG-advc1-l2t2050.md (verdict: fix; D1 medium, D2/D3/D4 low)
Spec authority: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-20_0230-MATRES-ELIG-acceptability-policy.md (§7.3, §7.4.4, §11.9, §16)
All git run with `git -c core.fileMode=false` (NFS). Trunk and Brad's live tree untouched.

## VERDICT: all four defects fixed, RED-first, no scope creep. No blockers.

---

## 0. RED-first evidence

New tests written FIRST and run at HEAD a71c021c (before any fix):

```
$ npm run test:run -w server -- src/compiler/resolution/eligibility/elig-fix1-custody-guard.test.ts src/compiler/resolution/eligibility/elig-fix1-payload-role.test.ts
 Test Files  2 failed (2)
      Tests  4 failed | 1 passed (5)
```

The 4 RED legs: the reviewer's mutated bind shape evaluated PASS (D1 evaluator),
the tier-3 bind reason lacked the custody-guard name (D1), displayRole absent
from the payload (`expected undefined to be 'catalog-identity'`, D3), and the
shipped tier-4 bind FAIL reason lacked the guard name. The 1 pass was the
no-regression control (a legitimate tier-1 accepted reference binds). The lint
half of D1 and the D2 legs were added to MaterialEligibilitySchemas.test.ts and
are pinned by the new rule ids (buildWorld asserts every listed rule id is
registered — a missing rule fails the suite).

## 1. D1 (medium) — P4 custody guardrail made LIVE + the shape forbidden by lint

Three coordinated changes; the reviewer's exact mutation probe now fails at
BOTH gates:

1. EVALUATOR (server/src/compiler/resolution/eligibility/evaluate.ts):
   evaluateEligibilityPolicy now evaluates the declared `custodyGuard` after
   `requires` (completeness still gates FIRST — AC-2's unknown-level remote hit
   stays INCOMPLETE, byte-unchanged) and before `assert`. A guard FAIL makes
   the policy verdict FAIL even when the assert itself would PASS (exactly the
   reviewer's mutated shape); a guard INCOMPLETE (its evidence path does not
   resolve) propagates the third state. The three-state law applies to the
   guard via the same evaluateTriState helper. Reason strings ride
   `custody guard unmet (...)` / `custody guard unresolved (...)`.
2. LINT (schema/.../material-eligibility.lint.yaml): NEW rule E8
   `material-eligibility-bind-asserts-never-membership-on-custody-collections`
   — an authorized-to-bind policy's `assert` may NEVER use
   `demanded.custodyNeverTiers` or `demanded.identityOnlyTiers` as a membership
   (allIn) evidence target. Shape: item-relative everyItem over `policies` +
   nested everyItem over the assert tree (probe-verified: the nested
   collectionPath resolves item-relatively; the root-level multi-wildcard
   projection does NOT reach the shipped nesting, so the quantified form is the
   load-bearing one). Covers the assert ROOT, its direct predicate list
   (depth 1), and one level deeper (depth 2). E7 (guard presence) is KEPT —
   E7 and E8 are the two halves of §7.3's "the lint forbids the shape".
   DECLARED BOUNDARY: lint inspects assert nesting to depth 2; deeper nesting
   is covered by the evaluator half (the guard decides regardless of what the
   assert says), so a shape hidden at depth 3 cannot produce a PASS bind.
3. DATA comment corrected (material-eligibility.yaml:23-27 and :63-66): the
   false "the evaluator reads" claim is now the accurate statement (evaluator
   reads it; E7 pins the declaration; E8 forbids the leaked shape). The
   meta-schema custodyGuard description was corrected too (it also carried the
   stale E-number — see D2).

Tests: elig-fix1-custody-guard.test.ts (4 legs: mutated shape FAILs with the
guard reason; guard-INCOMPLETE propagates; shipped tier-3 bind FAIL names the
guard; tier-1 accepted reference still binds PASS) + 2 new legs in
MaterialEligibilitySchemas.test.ts (mutation at root/depth1/depth2 all name
E8; control: the display-identity-only-role policy legitimately allIns
identityOnlyTiers and the shipped data still lints CLEAN).

## 2. D2 (low) — identity role SINGLE-SOURCED

- material-eligibility.yaml: `identityRole: catalog-identity` remains the ONE
  declaration of the value; the two inline per-policy `role: catalog-identity`
  literals (:195, :355) are DELETED. New slot
  `identityRolePolicies: [display-identity-only-role, bind-accepted-identity-reference]`
  names the role-carrying policies BY ID.
- material-eligibility.schema.yaml: `identityRolePolicies` added (required,
  unique, id-pattern items); identityRole description states the single-source
  injection; the per-policy `role` property is documented as an override the
  shipped data does not use.
- lint: NEW rule E11 `material-eligibility-identity-role-policies-declared`
  (allIn identityRolePolicies against policies[*].id — probe-verified) rejects
  a dangling role target.
- policy.ts loader: injects `identityRole` into the policies named in
  identityRolePolicies (`p.role ?? (identityRolePolicies.includes(p.id) ?
  identityRole : undefined)` — a per-policy override stays legal for fixtures;
  the shipped data uses none). identityRole() now has a consumer path and the
  value has exactly one declaration.
- Stale doc reconciled: the meta-schema custodyGuard comment's "Lint E11
  requires it" (which pointed at the presence rule) now reads "Lint E7 requires
  it ... lint E8 forbids the leaked shape"; E11 is now the role-id pin it names.
- Fixture triplet copies synced (custody0/nodisplay/noshape + their schema +
  lint copies re-synced byte-identical to the shipped schema/lint files).
- Test legs: dangling-id mutation names E11; single-source pin asserts zero
  per-policy role keys, exactly ONE `catalog-identity` occurrence in the whole
  document, and the id list.

## 3. D3 (low) — display role reaches the engine payload

- types.ts EligibilityVerdictFact gains `displayRole?: string` (conditional
  spread, exactOptionalPropertyTypes: absent-or-value).
- resolutionEngine.ts verdictFact() populates it from `e.display.role`.
- Test elig-fix1-payload-role.test.ts drives the REAL resolveNoun over the
  shipped triplet: a tier-3 identity-only candidate carries
  `eligibility.displayRole: 'catalog-identity'` (decided by
  display-identity-only-role) AND the accepted tier-1 reference carries
  `eligibility.bindRole: 'catalog-identity'` (bind-accepted-identity-reference)
  — role survives for BOTH classes; absence asserted via Object.keys on the
  class with no role-carrying deciding policy.

## 4. D4 (low) — golden re-blessed preserving prior key order

- ambiguous-material.golden.json re-serialized by merging the new payload INTO
  the prior document's key ORDER (prior keys first, additive keys in place;
  values and array order verified identical via a canonical deep compare).
  The diff vs base 6f8fb519 is now additive-only (the eligibility/tier/
  referentLevel keys inside the two candidate entries); the document-wide
  serialization churn the reviewer flagged is GONE.
- MANIFEST.yaml record pin re-hashed: 16c38893... -> c750c1effbf3434d51f740f7728931079ebb30b05b464b8ac64d32a6399caf08,
  with a MANIFEST comment disclosing the re-bless and the key-order preservation.
  (The base record ends with a trailing newline; coder1's re-bless dropped it —
  restored here so the byte diff vs base is additive-only in style too.)
- sha256 on disk verified: c750c1ef... matches the manifest pin; golden-replay
  37/37 (below).

## 5. Commands run (real output, post-fix)

1) Eligibility + triplet contract (incl. all new RED-first legs):
```
$ npm run test:run -w server -- src/compiler/resolution/eligibility src/schema/MaterialEligibilitySchemas.test.ts
 ✓ src/compiler/resolution/eligibility/elig-fix1-custody-guard.test.ts  (4 tests) 184ms
 ✓ src/compiler/resolution/eligibility/elig-ac2-tier-legality.test.ts  (3 tests) 299ms
 ✓ src/compiler/resolution/eligibility/elig-ac1-suppression.test.ts  (2 tests) 208ms
 ✓ src/compiler/resolution/eligibility/elig-ac4-incomplete.test.ts  (6 tests) 353ms
 ✓ src/compiler/resolution/eligibility/elig-ac5-offline-byte-stable.test.ts  (3 tests) 290ms
 ✓ src/compiler/resolution/eligibility/elig-fix1-payload-role.test.ts  (1 test) 307ms
 ✓ src/compiler/resolution/eligibility/elig-ac3-catalog-scope.test.ts  (4 tests) 486ms
 ✓ src/schema/MaterialEligibilitySchemas.test.ts  (13 tests) 2048ms
 Test Files  8 passed (8)
      Tests  36 passed (36)
```

2) Broad lane suite:
```
$ npm run test:run -w server -- src/compiler/resolution src/compiler/scientistIntent src/resolve src/api/handlers/IntentCompileFromPromptHandlers.answeredBinding.test.ts
 Test Files  48 passed (48)
      Tests  469 passed (469)
```

3) Typecheck:
```
$ npm run typecheck -w server
 > tsc --noEmit
 TYPECHECK_EXIT=0
```

4) Golden replay:
```
$ (cd server && npx tsx scripts/golden-replay.ts)
 37/37 checks passed
```

5) D1 mutation probe re-run (the reviewer's exact shape, throwaway tsx probe
   against the shipped triplet; probe file removed after the run):
```
shipped structural valid: true 0
shipped lint violations: []
MUTATED structural valid: true 0
MUTATED lint violations: ["material-eligibility-bind-asserts-never-membership-on-custody-collections"]
P4 shape forbidden by lint now? YES
shipped-data tier-4 bind verdict: fail | custody guard unmet (noneIn: value 4 selected by 'candidate.tier' is a member of 'demanded.custodyNeverTiers'
```
i.e. the reviewer's mutation (bind assert = allIn candidate.tier
demanded.custodyNeverTiers) is now REJECTED by lint AND the evaluator returns
non-PASS for a custody-never candidate. (At HEAD it passed both gates.)

6) Full server suite (regression comm vs the advc1-pinned baseline
   /tmp/elig-baseline.sorted, 88 files):
```
 Test Files  89 failed | 694 passed | 9 skipped (792)
      Tests  100 failed | 6502 passed | 70 skipped (6845)
comm NEW:  src/extract/prompts/loader.test.ts
comm GONE: (empty)
```
The single NEW file is NOT a lane regression: its failure is
`ENOTEMPTY ... server/src/extract/prompts/temp-HD4bKN` — an NFS temp-directory
race in that test's own frontmatter fixture cleanup, unrelated to any file in
this diff (no diff file is under src/extract/). Run standalone it passes:
```
 ✓ src/extract/prompts/loader.test.ts  (10 tests) 367ms
 Test Files  1 passed (1)      Tests  10 passed (10)
```
The +1 file / +1 test vs the 88/99 baseline is this flap. No failing file in
the comm is in the diff set.

## 6. Changed paths (commit c50499db)

- server/src/compiler/resolution/eligibility/evaluate.ts (D1 evaluator)
- server/src/compiler/resolution/eligibility/policy.ts (D2 role injection + identityRolePolicies accessor)
- server/src/compiler/resolution/resolutionEngine.ts (D3 verdictFact)
- server/src/compiler/resolution/types.ts (D3 displayRole member)
- schema/scientist-intent/material-eligibility/material-eligibility.yaml (D1 comment, D2 single-source)
- schema/scientist-intent/material-eligibility/material-eligibility.schema.yaml (D2 slot + D1/D2 doc reconciliation)
- schema/scientist-intent/material-eligibility/material-eligibility.lint.yaml (D1 E8, D2 E11)
- server/src/compiler/resolution/eligibility/__fixtures__/{custody0,nodisplay,noshape}.yaml + .schema.yaml + .lint.yaml (fixture sync)
- server/src/compiler/scientistIntent/goldens/__records__/ambiguous-material.golden.json (D4 re-bless)
- server/src/compiler/scientistIntent/goldens/MANIFEST.yaml (D4 pin + disclosure comment)
- NEW server/src/compiler/resolution/eligibility/elig-fix1-custody-guard.test.ts
- NEW server/src/compiler/resolution/eligibility/elig-fix1-payload-role.test.ts
- server/src/schema/MaterialEligibilitySchemas.test.ts (D1 lint legs, D2 legs, rule-id pins)

## 7. Notes / disclosures

- E8 lint coverage boundary is depth-2 of the assert tree (declared in the
  lint file's comment); the evaluator half closes any deeper hole — a bind
  verdict can never PASS over a custody-never tier regardless of assert depth.
- The untracked app/src/event-editor/right-pane/ai/draftChanges.{ts,test.ts}
  files present in the worktree are NOT mine (not in this item's ownership,
  not committed, untouched).
- OQ-4 halt gate (app ClarificationPicker tests) not re-run: no app file
  changed in this fix; the payload change is additive (new optional key), the
  same class the prior run's halt gate already covered.
- vocabularyRipOut bait-11 scan unaffected: no new loader/literal in
  scientistIntent/.

ELIG-FIX1 DONE
