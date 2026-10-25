# MATRES-ELIG — CODER FIX-RUN 2 REPORT (lane 2, l2t1445, coder3)

Item: MATRES-ELIG (three-way material eligibility as data over the predicate DSL)
Worktree: /mnt/vast/home/brad/git/wt/matres-elig-lane2-l2t1445 (EXISTING lane worktree — not new)
Branch: cl/lane2-matres-elig-l2t1445   Incoming HEAD: 172f556a   Base: 6f8fb519
Spec (acceptance authority): /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-20_0230-MATRES-ELIG-acceptability-policy.md (§7.3 P4, §9, §11.9)
Cycle-2 review read first: /home/brad/.hermes/cl/lanes/2/reviews/MATRES-ELIG-advc2-l2t2215.md
Prior fix report: .hermes/plans/MATRES-ELIG-report.l2t1445-coder2-fix1.md
All git run with `git -c core.fileMode=false`. The untracked
app/src/event-editor/right-pane/ai/draftChanges.{ts,test.ts} were NOT touched.
The lane stack :3093/:5193 was NOT restarted. No trunk/computable-lab checkout touched.

## VERDICT TARGET: reviewer Defect 1 (MAJOR) + Defect 2 (MINOR)

Cycle-1 D1(a)(b)(c), D2, D3, D4 confirmed CLOSED by the reviewer's own probes; this run
closes the two residuals and keeps every green leg green.

---

## 1. DEFECT 1 — the P4 custody guardrail was data-fakeable: FIXED at the data layer

The reviewer's finding: E7 pinned the guard's PRESENCE only (lint.yaml:143-164), the
meta-schema typed `custodyGuard` as the generic predicate $ref
(material-eligibility.schema.yaml:331-333), and E8 matched only `allIn` on the two named
collections at assert depth <= 2 — so probe K (trivially-true guard + depth-3 allIn-custody
assert) and probe L (trivially-true guard + depth-1 `equals candidate.tier 4`) passed Ajv
AND lint with zero violations and evaluated PASS on a tier-4 custody-never candidate.

### 1a. NEW lint rule E12 — pins the guard SHAPE (the load-bearing fix)

`schema/scientist-intent/material-eligibility/material-eligibility.lint.yaml` (new rule,
id `material-eligibility-bind-custody-guard-shape-pinned`): every `authorized-to-bind`
policy's `custodyGuard` must be EXACTLY

    {op: noneIn, path: candidate.tier, collectionPath: demanded.custodyNeverTiers}

checked item-relatively (the shipped P2/P5/E7 everyItem idiom) with three `equals` legs on
`custodyGuard.op` / `custodyGuard.path` / `custodyGuard.collectionPath`. A bind policy whose
guard is ANY other predicate — a trivially-true `exists`/`nonEmpty`, an op swap, a path swap,
or a collectionPath swap — is now a lint violation, and the loader refuses the document
(§4 R below). The evaluator half's guarantee is therefore no longer contingent on a
free-form guard: with the SHAPE pinned, `evaluateEligibilityPolicy` (UNCHANGED — see §5)
evaluates the real candidate-tier/custodyNeverTiers disjointness BEFORE the assert, so no
assert at any depth can produce a bind PASS over a custody-never tier.

### 1b. E8 WIDENED — any-op / any-depth custody-collection reference in a bind assert

E8's id is KEPT (`material-eligibility-bind-asserts-never-membership-on-custody-collections`)
so cycle-1's green mutation legs stay green; its predicate tree is replaced by a recursive
everyItem walk over the assert's `predicates` chains, 6 levels below the assert root, that
rejects a custody collection named as POSITIVE EVIDENCE under any op:

  (a) as the membership TARGET (`collectionPath`) under any op EXCEPT the pinned disjointness
      — `noneIn` IS the guard form and is never positive evidence, so the shipped bind
      asserts' `noneIn` legs stay legal;
  (b) as the SELECTED values (`path`) of a positive membership op (`allIn`/`in` with reversed
      operands — `allIn demanded.custodyNeverTiers X` asserts the same forbidden claim);
  (c) as an `in` `valuesPath`.

Cycle-1's structural walk covered only `allIn` at depth <= 2; the widened walk reaches depth 6
(probe N: a depth-5 leak with a VALID guard is now rejected; §5 probes depth 6/7/8).

DSL note (why not a serialized-projection check): the reviewer's suggested
"serialized-projection" form is not expressible in the shipped DSL — `regex` requires a
STRING value and `assert[*]` resolves to an ARRAY of predicate objects (PathResolver.ts:131
-154 collects values; PredicateEvaluator.ts:193-224 returns "Path ... is not a string"), so a
wildcard projection cannot be stringified for a regex match. The recursive everyItem walk is
the DSL-expressible equivalent and is what shipped. The rule block was generated from a
single generator (/tmp/gen_e8.py) so the recursion is uniform at every level.

### 1c. Structural half (meta-schema)

`material-eligibility.schema.yaml` custodyGuard description now states the dependency and the
pin (E7 slot + E12 exact shape + E8 leaked-assert shape). The slot stays the shipped lint-v1
`predicate` $ref — Ajv remains the structural authority and NO new predicate op or TS branch
was added (spec §9: one rule, enforced by lint; zero interpreter changes).

---

## 2. DEFECT 2 — overstatement corrected

- `.hermes/plans/MATRES-ELIG-report.l2t1445-coder2-fix1.md:60-62` / §7 claimed the evaluator
  half "closes any deeper hole ... regardless of assert depth". That was FALSE while the guard
  shape was free-form (refuted by probe K). This run closes the hole (E12 pins the shape) AND
  states the dependency explicitly wherever the claim appears:
  - `material-eligibility.yaml:23-31` — "lint pins it three times: E7 (declared), E12 (EXACTLY
    the noneIn candidate.tier/demanded.custodyNeverTiers disjointness ... a presence-only pin
    left the evaluator's guarantee contingent on a substitutable free-form guard), and E8".
  - `material-eligibility.yaml:67-70` — "lint E7 pins the declaration, lint E12 pins its SHAPE,
    lint E8 forbids the leaked assert shape".
  - `material-eligibility.schema.yaml` custodyGuard description — "the evaluator's guarantee is
    only as strong as the declared guard, so its SHAPE is pinned at the data layer too".
  - lint.yaml E8 header — DECLARED BOUNDARY now names what the walk does NOT reach (deeper than
    6 levels, or wrapped in `not`) and what closes it (the pinned E12 guard + the evaluator's
    guard-before-assert order), instead of asserting blanket depth closure.
- The three fixture copies' mirror comments were updated to the same three-pin wording
  (custody0 / nodisplay / noshape), and the fixture schema/lint copies were re-synced
  byte-identical to the shipped files (§6 diff output).

---

## 3. RED-FIRST — the reviewer's probe K/L shapes against the PRE-FIX lint (HEAD 172f556a)

Raw: /tmp/elig-fix2-REDPROBE.txt (reviewer's own /tmp/elig-probe3.mts replayed verbatim,
`cd server && npx tsx /tmp/elig-probe3.mts`, captured BEFORE any edit in this run):

```
=== K. data-only bind policy: trivially-true custodyGuard + depth-3 allIn-custody assert ===
structural errors: []
lint violations: []
verdict for tier-4 custody-never candidate: pass | all: all: all: allIn: all 1 value(s) selected by 'candidate.tier' are members of 'demanded.custodyNeverTiers'
PASS on a custody-never tier?  true

=== L. same but depth-1, non-allIn expression (equals tier 4) + substituted guard ===
structural errors: []
lint violations: [] (E8 catches equals-value-4? false )
verdict for tier-4: pass | all: Path 'candidate.tier' equals '4'
```

Both lint-REJECTED? NO — `lint violations: []` on both, and probe K evaluated
`pass` on a tier-4 custody-never candidate. RED confirmed.

---

## 4. GREEN — the same shapes against the fixed lint

Raw: /tmp/elig-fix2-GREENPROBE.txt (`cd server && npx tsx /tmp/elig-fix2-green.mts`, run
after the lint/schema edits; K and L are the reviewer's shapes reproduced inline):

```
=== A. shipped data: structural + lint ===
structural: [] lint: []

=== K. reviewer probe K: substituted guard + depth-3 allIn-custody assert ===
structural: []
lint violations: [
  'material-eligibility-bind-custody-guard-shape-pinned',
  'material-eligibility-bind-asserts-never-membership-on-custody-collections'
]
E12 fired? true | E8 fired? true

=== L. reviewer probe L: substituted guard + depth-1 equals-tier-4 assert ===
structural: []
lint violations: [ 'material-eligibility-bind-custody-guard-shape-pinned' ]
E12 fired? true

=== M. guard-only substitution (E7 presence kept, shape free-form) ===
lint violations: [ 'material-eligibility-bind-custody-guard-shape-pinned' ] | E12 fired? true

=== N. depth-5 allIn-custody leak (valid guard) ===
lint violations: [
  'material-eligibility-bind-asserts-never-membership-on-custody-collections'
] | E8 fired? true

=== O. non-allIn leak: in + valuesPath custody at depth 1 ===
structural: 0 errors
lint violations: [
  'material-eligibility-bind-asserts-never-membership-on-custody-collections'
] | E8 fired? true

=== P. CONTROL: legitimate DISPLAY-policy use of the collections stays legal ===
display allIn identityOnlyTiers at depth2 — lint: []
display allIn custodyNeverTiers (O1 shape, non-bind class) — lint: []

=== Q. CONTROL: shipped bind asserts keep their legitimate noneIn disjointness ===
shipped (unchanged) lint: [] | structural: []

=== R. LOADER-LEVEL: a mutated triplet throws at load naming the rule ===
loader threw: material-eligibility failed lint policy (/tmp/elig-mutated/material-eligibility.lint.yaml): 2 violation(s): material-eligibility-bind-custody-guard-shape-pinned: an authorized-to-bind policy's custodyGuard must be exactly {op: noneIn, path: candidate.tier, collectionPath: demanded.custodyNeverTiers}
loader threw: material-eligibility failed lint policy (/tmp/elig-mutated/material-eligibility.lint.yaml): 1 violation(s): material-eligibility-bind-custody-guard-shape-pinned: an authorized-to-bind policy's custodyGuard must be exactly {op: noneIn, path: candidate.tier, collectionPath: demanded.custodyNeverTiers}

=== S. evaluator half UNCHANGED: pinned guard still decides at depth 3 ===
depth-3 leak + pinned guard, tier-4: fail | custody guard unmet (noneIn: value 4 selected by 'candidate.tier' is a member of 'demanded.custodyNeverTiers' (expected disjoint))
```

Reading:
- K: lint-REJECTED with BOTH rule ids named (E12 guard-shape pin + widened E8 depth-3 leak).
- L: lint-REJECTED with E12 named (the equals-tier-4 leaf names no collection, so the guard
  SHAPE pin is what closes it — exactly the reviewer's fix direction).
- M: guard-shape drift alone (E7 presence intact) is rejected.
- N: a depth-5 allIn-custody leak with a VALID guard is rejected by the widened E8.
- O: the non-allIn membership form (`in` + `valuesPath` on the custody collection) is rejected.
- P: NO OVER-REJECTION — legitimate DISPLAY-policy membership on the custody collections stays
  legal (display-identity-only-role allIn identityOnlyTiers at depth 2, and the reviewer's O1
  display-tier allIn custodyNeverTiers shape: both lint clean).
- Q: the shipped data lints CLEAN with zero structural errors (its bind asserts keep their
  legitimate `noneIn` disjointness).
- R: the LOADER refuses a mutated triplet, naming the rule id — the fake is not loadable.
- S: the evaluator half is UNCHANGED and still decides at depth 3 (guard unmet => fail).

---

## 5. DECLARED BOUNDARY (honest disclosure, probed)

Raw: /tmp/elig-fix2-BOUNDARY.txt (`cd server && npx tsx /tmp/elig-boundary.mts`):

```
depth-6 allIn leak (guard PINNED): E8 fired? true
depth-7 allIn leak (guard PINNED): E8 fired? false
depth-8 allIn leak (guard PINNED): E8 fired? false
not-wrapped leak: E8 fired? false
evaluator w/ pinned guard, depth-8, tier-4: fail | custody guard unmet (noneIn: value 4 selected by 'candidate.tier' is a member of 'demanded
evaluator w/ pinned guard, not-wrapped, tier-4: fail | custody guard unmet (noneIn: value 4 selected by 'candidate.tier' is a member of 'demanded
evaluator w/ pinned guard, equals tier4, tier-4: fail | custody guard unmet (noneIn: value 4 selected by 'candidate.tier' is a member of 'demanded
```

The E8 walk reaches depth 6; a depth-7/8 leak or a `not`-wrapped leak is NOT lint-rejected —
and with the guard SHAPE pinned (E12) the evaluator's guard-before-assert order FAILs the
tier-4 bind in every one of those cases (probe output above). The guardrail is thus closed at
the data layer on BOTH halves: E12 makes the evaluator's guarantee unconditional, and E8
rejects the leaked-assert shape at every depth the DSL walk reaches.

---

## 6. Regression legs (CODER-CAPTURED, serialized one suite at a time)

1) eligibility + MaterialEligibilitySchemas suites
   `npm run test:run -w server -- src/compiler/resolution/eligibility src/schema/MaterialEligibilitySchemas.test.ts`
   raw /tmp/ev-targeted.txt:
```

 Test Files  8 passed (8)
      Tests  41 passed (41)
   Start at  23:30:01
   Duration  4.91s (transform 529ms, setup 0ms, collect 1.61s, tests 4.85s, environment 2ms, prepare 2.47s)```
   (8 files / 41 tests: 36 at HEAD + 5 new cycle-2 legs in MaterialEligibilitySchemas.test.ts.)

2) `npm run typecheck -w server`
   raw /tmp/ev-typecheck.txt:
```
> @computable/server@1.0.0 typecheck
> tsc --noEmit

TYPECHECK_EXIT=0```

3) `(cd server && npx tsx scripts/golden-replay.ts)` -> `37/37 checks passed`
   (raw /tmp/ev-replay.txt; goldens unchanged this run — no golden or manifest edit.)

4) resolution + scientistIntent + schema scoped run
   `npm run test:run -w server -- src/compiler/resolution src/compiler/scientistIntent src/schema/MaterialEligibilitySchemas.test.ts`
   raw /tmp/ev-scoped.txt:
```

 Test Files  43 passed (43)
      Tests  453 passed (453)
   Start at  23:30:07
   Duration  8.09s (transform 3.27s, setup 6ms, collect 29.46s, tests 58.02s, environment 27ms, prepare 10.05s)```
   43 files / 453 tests — the reviewer's pin was 43/448 at HEAD; the +5 is exactly the five new
   cycle-2 mutation/control legs (probe K leg, probe L leg, guard-shape-drift leg, deep/non-allIn
   E8 leg, no-over-rejection control leg).

5) Fixture integrity: shipped lint/schema == fixture copies
```
LINT_SYNCED
SCHEMA_SYNCED
```
   (`diff` of `__fixtures__/material-eligibility.lint.yaml` and
   `__fixtures__/material-eligibility.schema.yaml` against the shipped files — identical. The
   three mutated fixture copies (custody0/nodisplay/noshape) all LOAD through
   `loadMaterialEligibility`, which runs the shipped lint spec against them: the AC-3/AC-4/AC-5
   legs that load them are green in leg 1, which is the proof they still lint clean under the
   widened E8 + new E12.)

6) The lint spec itself validates against the shipped lint-v1 meta-schema
   (`cd server && npx tsx /tmp/elig-lintmeta.mts`, Ajv = structural authority):
```
valid: true
errors: []
```

---

## 7. Full server suite — zero new failures (fail-SET comm, same extraction rule on both raws)

`npm run test:run -w server` (raw /tmp/elig-fix2-full.log):
```
 Test Files  90 failed | 693 passed | 9 skipped (792)
      Tests  100 failed | 6494 passed | 70 skipped (6837)
     Errors  2 errors
   Start at  23:23:38
   Duration  291.26s (transform 100.16s, setup 370ms, collect 1588.46s, tests 2458.05s, environment 1.41s, prepare 557.12s)```

Failing-file sets extracted with the identical rule
`grep -oE '❯[[:space:]]+(src|test)/[^[:space:]]+\.test\.tsx?'` from each raw
(/tmp/elig-fix2-failfiles.sorted = 90, reviewer's cycle-2 raw /tmp/elig-c2-failfiles.sorted = 89,
cycle-1 baseline /tmp/elig-baseline.sorted = 88):

- NEW vs the reviewer's own cycle-2 set (89): `src/foundry/FoundryCoderPatch.test.ts`,
  `src/integration/W25DraftLifecyclePromotion.test.ts`
- GONE vs the reviewer's cycle-2 set: `src/integration/W25CandidateImmutability.test.ts`
- NEW vs the cycle-1 baseline (88): `src/foundry/FoundryCoderPatch.test.ts`,
  `src/integration/W25DraftLifecyclePromotion.test.ts`; GONE: empty
- `comm -12 <head failing set> <my diff file list>` = EMPTY — no failing file is in my diff.

The three delta files are the known NFS/order environmental flaps the reviewer already
documented (the reviewer's own delta was `W25CandidateImmutability`, "both are
environmental (NFS/order), neither in the diff"). Re-run SERIALIZED standalone in this
worktree, all three pass:
```
 Test Files  3 passed (3)
      Tests  26 passed (26)
```
(`npm run test:run -w server -- src/foundry/FoundryCoderPatch.test.ts src/integration/W25DraftLifecyclePromotion.test.ts src/integration/W25CandidateImmutability.test.ts`; none of the three is in my diff.)

`Errors 2 errors` is the pre-existing unhandled-rejection debt, byte-identical to the
reviewer's cycle-2 raw (`Errors  2 errors` at /tmp/elig-c2-full.log:9250 and
/tmp/elig-fix2-full.log:9348): the same two rejections in both runs —
`Error: Should not be called` at `src/ai/AgentOrchestrator.goldenWithSeeds.test.ts:107:49` and
`src/ai/AgentOrchestrator.golden.test.ts:21:49` — neither in my diff.

---

## 8. Scope — ONE commit on-branch

Files changed (git -c core.fileMode=false diff --name-only 172f556a..HEAD):
```
schema/scientist-intent/material-eligibility/material-eligibility.lint.yaml
schema/scientist-intent/material-eligibility/material-eligibility.schema.yaml
schema/scientist-intent/material-eligibility/material-eligibility.yaml
server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility-custody0.yaml
server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility-nodisplay.yaml
server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility-noshape.yaml
server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility.lint.yaml
server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility.schema.yaml
server/src/schema/MaterialEligibilitySchemas.test.ts
```

Lint/schema yaml (+ fixture copies) + the contract test + this report doc. No TS product code
changed: `evaluate.ts`, `policy.ts`, `facts.ts`, `resolutionEngine.ts`, `types.ts`,
`PredicateEvaluator.ts`, `PathResolver.ts`, `LintEngine.ts`, `LintSpecLoader.ts` are all
untouched — the evaluator's custodyGuard evaluation stays exactly as it is (§4 S proves it
still decides), and no new predicate op or TS domain branch was added (spec §9).

STATUS: complete
