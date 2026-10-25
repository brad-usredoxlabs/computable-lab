# MIXROLE-1 — Adversarial review (LANE 2, resume run) — advc l2t1110

ITEM: MIXROLE-1 (Composition role semantics: tryptic/enzymatic dissociation reagents are not
"solvent" — role assignment as data, enum gaps ruled not improvised).
WORKTREE: /mnt/vast/home/brad/git/wt/MIXROLE-1-lane2-l2t0905 (branch cl/lane2-mixrole-1-l2t0905)
BASE (PINNED_TIP): a1ed2bef; HEAD: e1d953d4; working tree CLEAN (git status --porcelain empty).
SPEC (BINDING): .hermes/plans/2026-10-22_2125-MIXROLE-1-composition-role-semantics-spec.md
CODER REPORT: /home/brad/.hermes/cl/lanes/2/MIXROLE-1-report.l2t1020resume.md
All git run with -c core.fileMode=false.

Scope of the diff a1ed2bef..HEAD + worktree: 22 files (name-status below), no schema/ path,
no app/ path. Commits: 8eff148a (guidance plane), 6b3c293e (affordance as DATA + evaluator),
e1d953d4 (suppression plumbing + golden re-pin).

  A config/drafting/composition-role-guidance.yaml
  M server/prompts/material-system-rules.md
  A server/src/ai/promptCompositionRoleGuidance.test.ts
  M server/src/api/handlers/IntentCompileFromPromptHandlers.ts
  M server/src/compiler/scientistIntent/compileScientistIntent.ts
  M server/src/compiler/scientistIntent/compositionDecomposition.test.ts
  A server/src/compiler/scientistIntent/compositionRoles.test.ts
  A server/src/compiler/scientistIntent/compositionRoles.ts
  M server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
  M server/src/compiler/scientistIntent/goldens/__records__/{unresolvable-mixture-component,
    mixfrac-canonical-ambiguous,mixfrac-canonical-flat,mixfrac-final-volume,mixfrac-on-top}.golden.json
  M server/src/compiler/scientistIntent/goldens/fixtures/{unresolvable-mixture-component,
    mixfrac-canonical-ambiguous,mixfrac-canonical-flat,mixfrac-final-volume,mixfrac-on-top}.yaml
  M server/src/compiler/scientistIntent/goldens/goldenIntentToClarification.test.ts
  M server/src/compiler/scientistIntent/normalizeScientistIntent.ts
  M server/src/compiler/scientistIntent/promptShapeParity.test.ts

## BINDING PRINCIPLE (verified present verbatim in the coder report header, spec §0)
> "materials have identities and properties; their roles are contextual, and their purposes are
> experimental."
Report quotes it at report:19-22 and quotes the ruling's ANSWER line at report:15-17. Matches
/home/brad/.hermes/cl/lanes/2/decisions/MIXROLE1-role-axes-brad-ruling-20261022.md:44-45.

================================================================================
# MANDATE ITEM VERIFICATION
================================================================================

## 1. ENUM-HOME GUARD — PASS
Command (tracked + working tree):
  git -c core.fileMode=false diff a1ed2bef -- \
    schema/core/datatypes/composition-entry.schema.yaml \
    schema/workflow/scientist-intent.schema.yaml \
    schema/lab/vendor-product.schema.yaml \
    schema/lab/recipe.schema.yaml
Result: NO OUTPUT (exit 0). Independently corroborated: the full a1ed2bef..HEAD name-status list
contains no `schema/` path at all, and `git diff --name-only | grep -E "^(app/|schema/)"` -> none.
=> ZERO changes in all four enum homes. PASS.

## 2. PURPOSE-INFERENCE GUARD — PASS (with an honest scoping note)
Literal §8 command over '*.ts' + the config yaml returns 21 lines; every line is one of
(a) a §7-MANDATED golden/fixture role re-pin on the trypsin entry
(promptCompositionRoleGuidance.test.ts, compositionDecomposition.test.ts, promptShapeParity.test.ts,
goldenIntentToClarification.test.ts, material-system-rules.md) or (b) a test name/comment quoting
the ruling or the bait-8 scoping leg. There is NO production code in those hits.
Scoped re-run, per changed NON-test production file (real output):
  --- config/drafting/composition-role-guidance.yaml   exit=1 (EMPTY)
  --- server/src/api/handlers/IntentCompileFromPromptHandlers.ts exit=1 (EMPTY)
  --- server/src/compiler/scientistIntent/compileScientistIntent.ts exit=1 (EMPTY)
  --- server/src/compiler/scientistIntent/compositionRoles.ts exit=1 (EMPTY)
  --- server/src/compiler/scientistIntent/normalizeScientistIntent.ts exit=1 (EMPTY)
  --- server/prompts/material-system-rules.md
        9:- { "Thermo trypsin-EDTA", role: solvent, ... }
        10:+ { "Thermo trypsin-EDTA", role: other, ... }     <- the MANDATED example re-pin only
Additional: `git diff ... | grep -inE "purpose\s*[:=]|dissociat|intended_use|intendedPurpose"` -> none.
=> NO mapping of component names / synonyms / word-patterns to any purpose value anywhere. PASS.

## 3. SUPPRESSION LEG (§5b step 4) — PASS
Producer builds a LABEL SET only. Handler site IntentCompileFromPromptHandlers.ts:459:
  answeredClarificationLabels: Object.keys(answers),
Read of a value? None. `scientistAnswers: answers` (values) at :450 is the PRE-EXISTING MIXFRAC-1
channel (fraction reading-id selection), not the role-gap bar; the role-gap bar receives only the
label set.
Non-empty guarantee verified FIRST-HAND: handler :388 `if (!answers || Object.keys(answers).length
=== 0) { ...return }` returns the ask branch, so at :459 answers is non-empty — the unconditional
(non-optional) key is safe.
Threading sites (conditional spread, exactOptionalPropertyTypes):
  compileScientistIntent.ts:128 `answeredClarificationLabels?: readonly string[];`
  compileScientistIntent.ts:287-289 `...(deps.answeredClarificationLabels ? {...} : {})`
  normalizeScientistIntent.ts:519 option; :1032 `new Set(options?.answeredClarificationLabels ?? [])`
  compositionRoles.ts:215 `if (answeredLabels.has(entry.label)) return;`  <- membership on LABEL only
Grep `: undefined` over the whole added diff -> only a comment line ("never key:undefined"). PASS.

## 4. GOLDEN RE-PIN — PASS
Trypsin-EDTA role solvent -> other, role field ONLY, identity + nested recipe preserved:
  fixtures/unresolvable-mixture-component.yaml:45  solvent -> other (no nested recipe in this one)
  fixtures/mixfrac-{ambiguous,flat,final-volume,on-top}.yaml  solvent -> other
  __records__/*.golden.json: role strings move; NESTED DMEM 90:10 preserved in every mixfrac record
    (verified in the diff: DMEM entry still carries composition [DMEM 90%, FBS 10%]).
  compositionDecomposition.test.ts :44-47 MIXTURE + :49-54 COMPONENTS + :142 substring pin all flow
    THROUGH the constant (`MIXTURE.replace('role: other, fraction: "50%"', 'role: 42')`).
  promptShapeParity.test.ts PROMPT1_DOC :135 role only.  promptCompositionRoleGuidance.test.ts pins
    BOTH directions (must contain role: other; must NOT contain role: solvent).
  Deliberate bait-7 clarification-list growth: unresolvable record 2->3 (gap fact appended last),
    ambiguous 1->2, flat gains the answered "Trypsin-EDTA" annotation (A2) + axes echo, on-top stays
    1 (no cells sibling -> bait-8 silence), final-volume stays 200/no-gap.
MANIFEST re-bless EXACTLY ONCE, same commit e1d953d4: 10 pins (5 fixtures + 5 records) re-hashed.
NO treeState re-hash: `git diff ... MANIFEST.yaml | grep -i treeState` -> "(no treeState lines
changed)". => PASS, zero boundary violation.

## 5. CONFIG YAML DISCIPLINE (§5b) — PASS
- Loaded PER CALL, never process-cached: normalizeScientistIntent.ts:1024 calls
  loadCompositionRoleGuidance(...) inside normalize; compositionRoles.ts has no module-level cache
  (only a de-spam Set for the warn).
- LOUD-off on absent file/section: loader returns undefined + warnRoleGapCheckOff naming the path
  (compositionRoles.ts:117-146); the normalize caller guards `if (roleGuidance)`.
- Malformed -> throws naming the path: requireString / requireFiresOn / unknown arm
  (compositionRoles.ts:90-111, 131-151).
- Zero TS domain literals in the evaluator path: grep for role-literal comparisons in the added diff
  -> EMPTY (see §8 grep-clean below). The only string constants are the reason code (as-const
  registration) and the KNOWN_ARMS interpreter arm ids ('siblingRole'), which the spec explicitly
  permits ("the arm id is an interpreter contract; the role name is DATA"). PASS.

## 6. REPORT INTEGRITY (§7 hashes + §8 battery) — PASS
§7 pin table — recomputed ALL 12 after-hashes and 10 before-hashes on disk/tip; every value matches
the report exactly, e.g.:
  material-system-rules.md  before 1fcd7243... after 4b24cb90...  (both match)
  MANIFEST.yaml             before a9ac7f9d... after a20be25b...  (both match)
  mixtfrac-canonical-flat.golden.json before a2d1ef36... after f68e68a7... (both match)
§8 outputs reproduced INDIVIDUALLY (combined runs avoided per instruction):
  npx vitest run src/compiler/scientistIntent/compositionRoles.test.ts     -> 14 passed (1 file)
  npx vitest run src/compiler/scientistIntent/compositionFractions.test.ts -> 24 passed (1 file)
      (report plane 2 "38" = 14+24, matches)
  npx vitest run src/ai/promptCompositionRoleGuidance.test.ts              -> 3 passed (1 file)
  npx vitest run src/ai/promptBudget.test.ts                                -> 6 passed; budget line
      "draft prompt budget: 47179 chars ... ceiling 47180 (headroom 1)"  (matches report verbatim)
  npx vitest run src/compiler/scientistIntent/goldens/                      -> 4 files / 23 passed
      (goldenIntentToClarification 8 tests = the golden re-pin proof leg; exercises the 2->3 and
       1->2 deliberate count updates)
  npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts -> 12 passed
  npx vitest run src/compiler/scientistIntent/promptShapeParity.test.ts         -> 9 passed
      (plane 4 "21" = 12+9, matches)
  npm run typecheck -w server -> tsc --noEmit, exit 0, zero errors.
PASS.

## 7. SCOPE / NO-NEW-ENUM / NO-NEW-FIELD / NO app — PASS
- No new enum member: all four enum homes untouched (§1).
- No new schema field: no schema/ file in the diff; both composition shapes remain
  additionalProperties:false (unchanged).
- No app/ edits: `git diff --name-only | grep '^app/'` -> none.
- Files within approved planes (§3): compositionRoles.{ts,test.ts}, config yaml,
  normalizeScientistIntent.ts, compileScientistIntent.ts, IntentCompileFromPromptHandlers.ts,
  material-system-rules.md, goldens (fixtures/records/MANIFEST), compositionDecomposition.test.ts,
  promptShapeParity.test.ts, goldenIntentToClarification.test.ts. No file outside §3. PASS.

## 8. ASSUMPTIONS A1-A5 — PASS
A2 (load-bearing): the mixfrac-canonical-flat fixture request.answers gains
  "Trypsin-EDTA": "detaches the cells from the culture surface so they can be counted and reseeded".
- Value is OPAQUE: the role-gap evaluator signature is
  `evaluateCompositionRoleGaps(composition, config, answeredLabels: ReadonlySet<string>)`
  and only uses `answeredLabels.has(entry.label)` (compositionRoles.ts:215). No value read.
- Load-bearing / loop avoided: WITHOUT the answered label the suppression cannot trigger (the role
  stays `other` after any answer), so the flat 200 leg could never compile. Proven end-to-end: the
  goldens replay through the REAL handler (replayKernel.ts:206 createIntentCompileFromPromptHandlers,
  :211 request.answers) and goldenIntentToGraph.test.ts flat leg asserts status 200 + deepEqual; the
  axes echo of the annotation is inside the deep-equal body.
- Both directions in the suppression leg's OWN test (compositionRoles.test.ts:126-142 evaluator +
  :245-263 normalize-chain): fire-once (no answers -> length 1); answered label -> length 0; a
  NONSENSE answer value -> length 0 (value never read); a different label -> length 1 (no over-suppress).
A1/A3/A4/A5 are environment/test-discipline notes; A3 (malformed config fixture uses a
present-but-broken `firesOn: not-a-list` rather than an absent section) is corroborated by the
loader behaviour I read (absent section => warn, present-but-broken => throw) and by the passing
test. A4's tightened wording is corroborated by the prompt-budget line (headroom 1) and the
two-direction guidance test. No inconsistency found. PASS.

## GREP-CLEAN (§8, no new TS role-literal branch) — EMPTY (verified)
  git -c core.fileMode=false diff a1ed2bef..HEAD -- '*.ts' | \
    grep -nE "^\+.*((===|!==|\bcase\b)\s*['\"](solute|solvent|buffer_component|additive|activity_source|cells|other)['\"])"
  -> no output (exit 1). Also, added role-literal strings in the four production TS files -> none.

================================================================================
# OBSERVATIONS (non-blocking; do NOT drive the verdict)
================================================================================
O1. Latent off-by-index in the firing-arm exclusion (server/src/compiler/scientistIntent/
    compositionRoles.ts:214). `evaluateCompositionRoleGaps` maps `composition` -> `entries` (which
    may contain `undefined` for unreadable entries) and then calls
    `firesOnSatisfied(entries.filter(e => e !== undefined), index, config)` passing `index` from the
    UNFILTERED array into a predicate that indexes the FILTERED array
    (`entries.some((e, i) => i !== gapIndex && ...)` at :185). When any unreadable entry precedes the
    gap, the filtered index of the real cells sibling can coincide with `gapIndex`, causing the
    sibling to be wrongly excluded and the gap to go SILENT (false negative). Reachable only with a
    malformed model-output entry (readEntry drops an entry whose `material`/`role` is not a non-empty
    string) and only when the shifted index lands on the sibling; under the shipped config the gap
    entry (role `other`) never matches the `cells` arm, so a correct-index run is unaffected. Not a
    spec/AC violation, no test covers it. Fix direction only: pass index positions consistent with
    the array being searched (e.g. search the unfiltered array skipping `entry === undefined` at
    `index === gapIndex`, instead of pre-filtering).
O2. compositionRoles.test.ts:136 and :139 are identical calls asserting the same suppression; the
    "nonsense value" direction is genuinely exercised only in the normalize-chain test (:256-260).
    Harmless redundancy, not a vacuous assertion.
O3. Naming: spec §5b illustrates `firesOn: [cellsSibling]`; the landed shape is a generic
    `arm: siblingRole, role: cells` pair in the config. Functionally equivalent (role name stays in
    DATA), and arguably better; noted only for spec-text parity.

================================================================================
# ACCEPTANCE CRITERIA (spec §4 verbatim) -> how each was checked
================================================================================
AC-1 "Role-gap ruling recorded in spec header (Brad) BEFORE merge" — ruling file present
  (decisions/MIXROLE1-role-axes-brad-ruling-20261022.md); spec §0 records it; report quotes it
  verbatim including the binding principle. CHECKED: read all three.
AC-2 "RED-first tests: guidance-declaration present where the emission prompt is assembled (cite)" —
  promptCompositionRoleGuidance.test.ts composes the REAL buildSystemPrompt/buildSurfaceAwarePrompt
  and asserts the fit-guidance rule + `role: other` exemplar. Commit 8eff148a message records 3/3 RED
  at a1ed2bef (coder claim); at HEAD I reproduced 3 passed. CHECKED: read test + ran it.
AC-3 "golden for the same canonical utterance updated ONLY per the ruling ('other'), byte-pinned" —
  verified role field ONLY across fixtures/records/tests, MANIFEST re-blessed once with before/after
  hashes; DMEM/FBS/cells/nested 90:10 preserved. CHECKED: read full golden diff + recomputed hashes.
AC-4 "no TS role-literal branches introduced (grep-clean check in report)" — §8 grep EMPTY;
  report includes it. CHECKED: ran grep myself.
AC-5 "server tests + typecheck at baseline; no browser gate" — targeted planes green (see §6);
  goldens/compositionDecomposition/promptShapeParity green; typecheck exit 0. Full-suite failing-FILE
  set vs baseline NOT independently regenerated here (combined-run flakes documented by the coder);
  the mandate scoped me to the targeted runs + one golden proof, which are all green and no
  diff-touched file is among the coder's three lane-only flake files. CHECKED: targeted + typecheck.
AC-6 "role-gap affordance as ANNOTATION, never infers purpose, never force-fits the enum" —
  evaluator has zero reagent nouns / purpose values; question text asserts no enum member
  (compositionRoles.test.ts:144-150); the annotation rides opaque answer text. CHECKED: read
  compositionRoles.ts in full + the test.

VERDICT: accept
