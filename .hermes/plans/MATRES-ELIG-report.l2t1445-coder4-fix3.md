# MATRES-ELIG — CODER REPORT, FIX-RUN 3 (lane 2, l2t1445, coder4)

Item: MATRES-ELIG (three-way material eligibility as data over the predicate DSL)
Worktree: /mnt/vast/home/brad/git/wt/matres-elig-lane2-l2t1445 (branch cl/lane2-matres-elig-l2t1445)
Base HEAD (cycle-3 candidate): 48d9c023
Spec (acceptance authority): /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-20_0230-MATRES-ELIG-acceptability-policy.md (§7.3 P4, §9, §11.9)
Cycle-3 review read first: /home/brad/.hermes/cl/lanes/2/reviews/MATRES-ELIG-advc3-l2t2335.md (VERDICT: fix)
All git run with `git -c core.fileMode=false`. The two untracked app/src/event-editor/right-pane/ai/draftChanges.{ts,test.ts} are NOT mine and were left untouched.

## 0. What this fix-run lands

Defect 1 (MAJOR, residual): the E12 guard-shape pin was data-fakeable via the DECLARED
`itemField` projection key — a custodyGuard that is the pinned three keys PLUS
`itemField: <field the scalar tier collection lacks>` projects an EMPTY member set
(PredicateEvaluator.ts resolveMembershipOperands: an itemField that resolves on no item
adds nothing to the allowed set), so the pinned `noneIn` PASSES VACUOUSLY and a bind
PASS on a tier-4 custody-never candidate was still data-only fakeable (reviewer probes
N1/N2/N3 + loader ACCEPT).

FIX (data layer only, per the orchestrator-grounded guidance): E12
(`material-eligibility-bind-custody-guard-shape-pinned`, id KEPT) gains a fourth leg
`not(exists custodyGuard.itemField)` so the pinned guard is EXACTLY
{op: noneIn, path: candidate.tier, collectionPath: demanded.custodyNeverTiers} and no
declared projection key can neuter it. `additionalProperties:false` was NOT used:
`itemField` is a DECLARED property of the noneIn/allIn branches in
schema/lint/lint-v1.schema.yaml, so it would not have closed the hole, and tightening
the meta-schema is out of this item's file ownership (protocol.lint.yaml legitimately
uses itemField — untouched).

Defect 2 (MINOR): the false coverage claims are corrected in the E12 header comment
(material-eligibility.lint.yaml:166-190, re-synced byte-identical into the fixture lint
copy): the header now states THERE IS NO STRUCTURAL HALF — the meta-schema types
custodyGuard as the generic #/definitions/predicate $ref (no op/path/collectionPath
constraint; the noneIn/allIn branches declare itemField without additionalProperties:false),
so Ajv accepts every guard shape the probes mutate; E12 is the ONLY half that pins the
guard shape. The prior report's "no assert at any depth can produce a bind PASS" claim
(coder3-fix2 §1a) is superseded by this report: it holds only once the FULL shape
(three keys + no itemField) is pinned, which is now the case and is probed below.
(The coder3-fix2 report file itself is committed history and outside this run's scope
list; the correction lives here and in the lint.yaml comment.)

Files changed (this run):
- schema/scientist-intent/material-eligibility/material-eligibility.lint.yaml (E12 fourth leg + corrected header + message template)
- server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility.lint.yaml (byte-synced copy: `diff -q` -> FIXTURE_lint_SYNCED)
- server/src/schema/MaterialEligibilitySchemas.test.ts (3 new legs: N1 mutation, N3 mutation, non-custody itemField no-over-rejection control; E12 comment updated)
- .hermes/plans/MATRES-ELIG-report.l2t1445-coder4-fix3.md (this report)

NOT touched: the evaluator (evaluate.ts), policy.ts, any other TS outside the contract
test, schema/lint/lint-v1.schema.yaml, the eligibility data/schema yaml, protocol.lint.yaml.

## 1. RED-FIRST — reviewer probes replayed at HEAD 48d9c023 (before the fix)

`cd server && npx tsx /tmp/elig-advc3.mts` (the reviewer's own probe file), saved to
/tmp/elig-fix3-REDPROBE.txt:

```
=== A. shipped data ===
structural: []
lint: []

=== K. substituted guard + depth-3 allIn-custody assert ===
structural: []
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned","material-eligibility-bind-asserts-never-membership-on-custody-collections"]
REJECTED? true | E12? true | E8? true

=== L. substituted guard + depth-1 equals-tier-4 assert ===
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned"]
REJECTED? true | E12? true

=== N1. NEW: pinned-shape guard + itemField + depth-1 equals-tier-4 assert ===
structural: []
lint violations: []
LINT-REJECTED? false
verdict for tier-4: pass | all: Path 'candidate.tier' equals '4'
BIND PASS on a custody-never tier? true

=== N2. NEW: pinned-shape+itemField guard + depth-7 allIn-custody leak assert ===
lint violations: ["material-eligibility-bind-asserts-never-membership-on-custody-collections"] | LINT-REJECTED? true
verdict for tier-4: pass | BIND PASS? true

=== N3. pinned-shape guard + itemField x (shipped assert) ===
lint violations: []

=== P. CONTROL: legitimate DISPLAY-policy use of the custody collection ===
lint: []

=== Q. CONTROL: shipped bind asserts (legit noneIn) ===
lint: []
```

RED confirmed: N1 lint violations [] + tier-4 bind PASS; N3 lint []. N2 was already
E8-rejected (its leak assert names the collection) but its guard was still neutered —
the N2 guard shape is what E12 now rejects. Loader-level RED (reviewer's
/tmp/elig-advc3-load.mts against /tmp/elig-advc3-mut/, from the cycle-3 review §4):
"[loader] ACCEPTED the mutated triplet (no throw). [bind verdict] pass ... P4 VIOLATION
... true".

## 2. GREEN — same shapes after the fix

`cd server && npx tsx /tmp/elig-advc3.mts` + `/tmp/elig-advc3-load.mts` (the mutant dir's
lint copy re-synced from the fixed shipped lint — /tmp is not the worktree), saved to
/tmp/elig-fix3-GREENPROBE.txt:

```
=== A. shipped data ===
structural: []
lint: []

=== K. substituted guard + depth-3 allIn-custody assert ===
structural: []
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned","material-eligibility-bind-asserts-never-membership-on-custody-collections"]
REJECTED? true | E12? true | E8? true

=== L. substituted guard + depth-1 equals-tier-4 assert ===
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned"]
REJECTED? true | E12? true

=== N1. NEW: pinned-shape guard + itemField + depth-1 equals-tier-4 assert ===
structural: []
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned"]
LINT-REJECTED? true
verdict for tier-4: pass | all: Path 'candidate.tier' equals '4'
BIND PASS on a custody-never tier? true

=== N2. NEW: pinned-shape+itemField guard + depth-7 allIn-custody leak assert ===
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned","material-eligibility-bind-asserts-never-membership-on-custody-collections"] | LINT-REJECTED? true
verdict for tier-4: pass | BIND PASS? true

=== N3. pinned-shape guard + itemField x (shipped assert) ===
lint violations: ["material-eligibility-bind-custody-guard-shape-pinned"]

=== P. CONTROL: legitimate DISPLAY-policy use of the custody collection ===
lint: []

=== Q. CONTROL: shipped bind asserts (legit noneIn) ===
lint: []

=== GREEN loader replay (/tmp/elig-advc3-load.mts, mutant dir lint re-synced to fixed lint) ===
[loader] REFUSED: material-eligibility failed lint policy (/tmp/elig-advc3-mut/material-eligibility.lint.yaml): 1 violation(s): material-eligibility-bind-custody-guard-shape-pinned: an authorized-to-bind policy's custodyGuard must be exactly {op: noneIn, path: candidate.tier, collectionPath: demanded.custodyNeverTiers} with no other key (itemField included — a projection key on a scalar tier collection neuters the disjointness) (P4: the evaluator's custody guarantee is only as strong as the declared guard — its full shape is pinned, never free-form)
```

GREEN confirmed: N1 lint-REJECTED naming E12; N3 lint-REJECTED naming E12; N2 now
rejected by BOTH E12 and E8; the loader REFUSES the mutated triplet naming the rule.
Note on the N1/N2 evaluator lines still printing `pass`: the reviewer's probes bypass
the loader and hand-build the policy in memory; the evaluator is deliberately UNTOUCHED
(this item's boundary). The gate is the data layer: the shipped loader validates + lints
before any policy reaches the evaluator, and it now refuses the neutered guard — the
fakeable shape can no longer be loaded, which is what §7.3 P4 ("the lint forbids the
shape") + §9 require.

## 3. No over-rejection

- Shipped data: structural [] lint [] (probe A above; contract suite leg 1 green).
- Reviewer controls P (display-policy custody-collection membership) and Q (shipped bind
  noneIn asserts): lint [] (above).
- Legitimate non-custody itemField use stays clean (/tmp/elig-fix3-noover.mts, appended
  to /tmp/elig-fix3-GREENPROBE.txt): a DISPLAY policy asserting
  `allIn candidate.referentLevel tierLegality itemField: demandedLevel` AND a bind
  policy using `itemField` in its REQUIRES arm (`allIn candidate.verdictClass policies
  itemField: verdict`) — the pin covers the custodyGuard slot only:
```
=== legit non-custody itemField (display assert + bind requires) ===
structural: []
lint: []
```
- Mutated fixture triplets (`npx tsx /tmp/elig-advc3-fixtures.mts`):
  material-eligibility-custody0.yaml: LOADS CLEAN; material-eligibility-nodisplay.yaml:
  LOADS CLEAN; material-eligibility-noshape.yaml: LOADS CLEAN.
- The E12 spec itself (with the new itemField leg) validates against the lint-v1
  meta-schema (Wave2ConstraintVocabularyRules/W25LintActivation projection precedent —
  the meta describes {lintVersion, rules}; schemaId is engine-side binding):
  `eligibility lint spec (incl. E12 itemField leg) vs lint-v1 meta: VALID []`.

## 4. Regression legs (exact counts, run myself)

1. `npm run test:run -w server -- src/compiler/resolution/eligibility src/schema/MaterialEligibilitySchemas.test.ts`
   -> `Test Files 8 passed (8) / Tests 44 passed (44)` (41 at HEAD + 3 new fix-3 legs;
   all 5 AC suites + fix1 legs + the 21-leg contract test green).
2. `npm run typecheck -w server` -> `tsc --noEmit`, TYPECHECK_EXIT=0.
3. `(cd server && npx tsx scripts/golden-replay.ts)` -> `37/37 checks passed`.
4. `npm run test:run -w server -- src/compiler/resolution src/compiler/scientistIntent src/schema/MaterialEligibilitySchemas.test.ts`
   -> `Test Files 43 passed (43) / Tests 456 passed (456)` — 43 files (same file count
   as the 43-file/453-test HEAD pin) + 3 new tests (453 -> 456), zero failures.
5. c1/c2 regression shapes stay rejected: probes K (E12+E8) and L (E12) lint-rejected
   with rule ids named in the same §2 script run; the c1 E8 depth legs and the c2
   guard-drift legs are inside the green suites (1)/(4).

## 5. Scope

ONE commit on-branch (this report's commit). `git -c core.fileMode=false diff 48d9c023..HEAD --name-only`:
```
.hermes/plans/MATRES-ELIG-report.l2t1445-coder4-fix3.md
schema/scientist-intent/material-eligibility/material-eligibility.lint.yaml
server/src/compiler/resolution/eligibility/__fixtures__/material-eligibility.lint.yaml
server/src/schema/MaterialEligibilitySchemas.test.ts
```
Exactly the eligibility lint yaml + fixture lint copy re-sync + the contract test + this
report. No evaluator, no policy.ts, no lint-v1.schema.yaml, no other TS. The untracked
draftChanges.{ts,test.ts} remain untouched and uncommitted.

## 6. Defect 2 disposition

Corrected where the review located it in shipped data: the E12 header in
material-eligibility.lint.yaml (and its byte-synced fixture copy) no longer claims a
"structural half" — it states the meta-schema types custodyGuard as the generic predicate
$ref and that E12 is the ONLY half pinning the guard shape. The "no assert at any depth
can produce a bind PASS" claim is restated truthfully: it holds only with the FULL shape
pinned (three keys + no itemField), which is now enforced and probed (§2). The prior
cycle-2 report file is committed history outside this run's scope list; this report
supersedes its §1a/§1c wording.

STATUS: complete
