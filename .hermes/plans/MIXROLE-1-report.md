# MIXROLE-1 CODER REPORT — RESUME l2t1020resume (2026-10-23, lane 2)

Lane: 2 | Worktree: /mnt/vast/home/brad/git/wt/MIXROLE-1-lane2-l2t0905
Branch: cl/lane2-mixrole-1-l2t0905 | Dispatch base (PINNED_TIP): a1ed2bef (MIXFRAC-1 merge)
Spec (BINDING): .hermes/plans/2026-10-22_2125-MIXROLE-1-composition-role-semantics-spec.md
This report is the resume artifact for the compression-killed run l2t0905 (dead at ~10:08 EDT).
It completes the remaining legs (§3 item 4 handler leg, §7 golden re-pin, §8 battery) and
reports the full verified state of the item.

## RULING (quoted verbatim, per spec §0 / §9 worker contract)

Brad (c) ruling, decisions/MIXROLE1-role-axes-brad-ruling-20261022.md (lane-2 decisions dir;
the cl-integration-2 copy cited by the spec is absent — the lane-2 file is the record):

> Answers card decisions/MIXROLE1-c-enum-ruling-request-l2t0530.md: **(A), as a temporary
> compatibility measure — not a permanent semantic solution.** `dissociation_reagent` is NOT
> added to any enum (ledger, wire, or vendor-product mirror).

Binding principle, quoted verbatim:

> **Principle (binding, quote for specs/tasks): "materials have identities and properties;
> their roles are contextual, and their purposes are experimental."**

Implemented exactly as ruled: Branch A as bridge (guidance as DATA + honest `other`), zero
enum change anywhere, goldens re-pinned `role: other` with identity + nested recipe preserved,
OQ-B affordance in the annotation shape (captures the scientist's stated intended use, never
force-fits the enum, never infers purpose), OQ-C answered NO (nothing joined vendor-product
or recipe schemas).

## OUTCOME

Complete. All §5a/§5b legs, the §3 item-4 answer-threading leg, the §7 golden re-pin with
MANIFEST re-bless exactly once per moved pin (NO treeState re-hash), and the §8 battery are
done and verified. Three commits on the branch; working tree clean.

## COMMITS (a1ed2bef..HEAD)

1. 8eff148a (dead run, adopted as-is — orch-audited): material-system-rules.md :149
   fit-guidance + :141 trypsin example re-pin; RED-first promptCompositionRoleGuidance.test.ts
   (3/3 RED at dispatch tip per the commit message + orch audit); prompt budget measured
   BEFORE prose: 47179/47180 (headroom 1).
2. 6b3c293e (this resume, first action after test verification): composition role-gap
   affordance as DATA + generic evaluator — config/drafting/composition-role-guidance.yaml,
   compositionRoles.ts, compositionRoles.test.ts (14/14), normalizeScientistIntent.ts wiring
   (COMPOSITION_ROLE_GAP_REASON joins UnrealizedProducerReason as-const registration;
   applyCompositionRoleGuidance beside the cue/fraction bars; NormalizeOptions.
   compositionRoleGuidancePath + answeredClarificationLabels). One test-fixture repair in
   the dead run's uncommitted test (see Assumptions A3).
3. e1d953d4 (this resume): §3 item-4 suppression plumbing + §7 golden re-pin + MANIFEST
   re-bless (same commit).

## §2 CITE RE-VERIFICATION AT MY TIP (a1ed2bef + 3 commits)

Spec line numbers were at 14d26cf6; every cited file was re-read at the current worktree text:

- server/prompts/material-system-rules.md: example line now :141
  `- { material: "Thermo trypsin-EDTA", role: other, fraction: "50%" }` (re-pinned, commit
  8eff148a); role-menu bullet now :149 with the fit-guidance tail
  `— closest declared role; if none fits, `other``. :151-153 (count = density x volume)
  UNTOUCHED (CELLRATE-1's hunk — verified absent from my diff).
- systemPrompt.ts: buildSystemPrompt at :480; `loadPromptTemplate('prompts/material-system-rules.md')`
  at :485; prepended at :491 (spec cites :485/:491 — verified). buildSurfaceAwarePrompt at
  :418, delegates to buildSystemPrompt at :427-429 for 'event-editor'/'workspace.deck'.
- IntentCompileFromPromptHandlers.ts: composeAnsweredPrompt at :148 (spec :149, moved by 1);
  answeredSlots build at :435, conditional spread at :443 (spec :429/:440 — moved);
  scientistAnswers at :450; NEW answeredClarificationLabels at :459.
- compileScientistIntent.ts: ScientistIntentCompileDeps.answeredClarificationLabels at :128;
  normalize call region :270-290 (spec :263 — moved); conditional-spread pass at :287-289.
- normalizeScientistIntent.ts: reason-code union region now :449-455 (spec :405-408 at the
  older tip — moved); NormalizeOptions new options at :507-519; answeredLabels set at :1032;
  applyCompositionRoleGuidance at :952, called at :1093 beside the fraction bar.
- goldens/MANIFEST.yaml: treeState pins at :25/:33/:34 (verified unchanged); fixture pins
  :57/:72-75; record pins :130/:145-148 (moved from spec's :51/:106 by the MIXFRAC bless chain).
- compositionDecomposition.test.ts: MIXTURE constant :35, COMPONENTS :49-54, :142 substring
  pin `MIXTURE.replace('role: other, fraction: "50%"', 'role: 42')` — the re-pin flows
  THROUGH the constant as spec §2.6 requires.
- promptShapeParity.test.ts: PROMPT1_DOC composition at :135 (role field only).
- unresolvable-mixture-component.yaml: trypsin entry at :45.
- vocabulary meta-schema dead end (§2.4c), simpleVerbs passthrough (§2.4d), event-level role
  vocabulary (§2.3): all re-confirmed untouched.

## §5b ANNOTATION-RIDING DECISION (stated plainly)

The annotation is captured as ANSWER TEXT in the clarification record — the answers-map entry
(label -> the scientist's stated intended use) on the 422/answered exchange — with NO new
field anywhere. Both composition-entry shapes are additionalProperties:false (ledger + wire),
so no annotation field was added; persisting purpose as a declared per-use field is
ROLE-AXES-1's `intended_purpose` work and was NOT done here. The scientist's words ride the
answered recompile prompt verbatim as SCIENTIST-RESOLVED CHOICES (composeAnsweredPrompt,
handler :148) and are echoed back on the settled compile's `axes` (proven end-to-end by the
re-blessed mixfrac-canonical-flat record: axes now carry
`"Trypsin-EDTA": "detaches the cells from the culture surface so they can be counted and
reseeded"`). The only code this forced is the suppression leg (§5b step 4): normalize skips a
gap whose entry label is among the answered clarification labels — generic set membership over
`Object.keys(answers)`, never a value read — threaded as an optional through
ScientistIntentCompileDeps -> NormalizeOptions with conditional-spread absence (byte-identically
absent for every other caller).

## §5b LINT VERDICT (own section, in the spec's words)

Task-proposed check: "role=solvent on an entry that also has a cells sibling". Plainly stated:
that predicate is STRUCTURALLY expressible only awkwardly (per-item predicates can't see
siblings) but it is SEMANTICALLY WRONG: "a solvent entry beside a cells entry" is the
CONFIGURATION OF VIRTUALLY EVERY CORRECT CELL-CULTURE MEDIUM (DMEM is legitimately the
solvent; cells legitimately ride in it). A lint that fires there calls every correct recipe a
violation — lint checks structure; semantics go through clarifications/humans (repo rule; the
task itself sets this trap). The real defect — "trypsin is a protease, proteases are not
solvents" — requires biological knowledge no structural predicate can consult. VERDICT: no
honest machine-check exists for role fit; the task's conditional lands on its second branch:
(a) + a clarification affordance. No lint DSL work was done (server/src/lint/**,
schema/lint/** untouched, per §3 OUT). The shipped affordance fires on the STRUCTURAL
FINGERPRINT of an honest gap (entry role == config gapRole + declared firesOn sibling), never
on biology, and the CLEAN_MEDIUM test proves a fitting-role medium stays silent.

## §7 PIN TABLE — before/after sha256 (all at a1ed2bef vs HEAD)

| artifact | before (a1ed2bef) | after (HEAD) |
|---|---|---|
| server/prompts/material-system-rules.md | 1fcd724393d4ab7e8ad2f62fe74ea3b0b6748f1f3b05914be75c90a52f02d1ab | 4b24cb90622067ff10faa3daa22a9f5378bfa305e8d4cb317f85f5f5ec28a316 |
| goldens/fixtures/unresolvable-mixture-component.yaml | 245603b100f927466cb7290656aa0056d489dbd180a1c0c67b8105c1136a3714 | 7086d6465105fdab7780eb28b12609d320a51e0425f79ef70321411b053742fa |
| goldens/fixtures/mixfrac-canonical-ambiguous.yaml | fe449f2fe7b9000bd0c5c52f77905802dc0c003461c385e0cc6fb630e463916d | 39b1f2a48c0ea3d7cb8c97b1f1ff3164b6a3612ae3f506095ced4841be3b04af |
| goldens/fixtures/mixfrac-canonical-flat.yaml | 509da519437b4e9e90718665d5f7d0d68b5098f7d9b08432a8eff92b584f103a | 5654856588d75f1d9e984902190934ed16912b152685c439fe88345c01c68f35 |
| goldens/fixtures/mixfrac-final-volume.yaml | c7dae608d5f4a7668be6b04aa807386f18289c75b2ba61bf8228d64c58882e5c | 5c5712c726a35da2e007bed7306f57e41983ce143e042e74fb5d3c9280601be2 |
| goldens/fixtures/mixfrac-on-top.yaml | c8f279c4b3d0f0458c057bfce139e641ed9ba948577be28831e664b4f1c7d912 | 42e2043fa9ee49b78f6e7b87fe6701da0286c184dfba973d931cd0108be4a61b |
| __records__/unresolvable-mixture-component.golden.json | fe927e73e7b3884cc4a437647cad4a48f806e819100e96802474bed27cd56ab3 | 9968461799cbe97666ec607d721f97a27e78d2057a916d6647aa7e5c11cd8241 |
| __records__/mixfrac-canonical-ambiguous.golden.json | 598a4e23de741e4468247fe94c4868ddf3527433f5ff075201d3130b1c5c8e1c | 68208b4f15b303a53543d859ea9317cdb5a21a8d103829f454983d23acdf71ca |
| __records__/mixfrac-canonical-flat.golden.json | a2d1ef365cddcc821f98938686c0053d2a7bbc06ae86c52313a8122752d4831d | f68e68a79d159df10238d7a1a333ee3189f816459c3e985660d08da2ba4e45b3 |
| __records__/mixfrac-final-volume.golden.json | 370e3f57a95af02fef60d99c2bcbf539f67b3e2c1149c6fe278358141e53fa9a | 1b5f35ff7bc39d3bb1bb481601a9d08bb9d907c9671ab8d4c9338f8ec2b153e5 |
| __records__/mixfrac-on-top.golden.json | 30b8ae98a38b7dce189c37fb9c4fb8be6239b33e3e732e77622fb8e958d892ae | c1b6214f044d8792bc456c4c14bfcfa152435b25b649058b460bbca1f4bffa91 |
| goldens/MANIFEST.yaml (10 pins re-blessed once, same commit e1d953d4) | a9ac7f9d532448d565b76f2906eee0daac16c7060fb2c0ca7e6a7872a68ae831 | a20be25b095c28414ae71862e8a2d0264899db265b41c78de4197a8f22a266f1 |
| MANIFEST treeState pins (vocabulary / wire schema / pipeline) | 32c5b5b17fc8… / 5327495e9c70… / b47eee0c3bd0… | UNCHANGED — zero treeState re-bless (live file hashes re-verified equal to the pins) |
| all four schema enum homes | 7-member ledger + wire mirrors; recipe divergent | UNCHANGED — zero pins move (guard diff below) |

Bless mechanics: records re-blessed via the existing scripts/mixfrac-bless.mts --write (the
SAME replayKernel the vitest suite uses; dry run reviewed before writing). Bless exactly once
per moved pin, fixture + record + MANIFEST pins in the same commit (e1d953d4).

Deliberate record-content changes (bait 7, with diffs — not rubber stamps):
- unresolvable-mixture-component record: clarifications 2 -> 3 (role-gap fact appended after
  the fraction fact; unknown-noun + fraction legs keep their verbatim shape at indices 0/1);
  localMacro trypsin role solvent -> other.
- mixfrac-canonical-ambiguous record: clarifications 1 -> 2 (gap fact appended); macro role
  moves.
- mixfrac-canonical-flat record (200 leg): fixture request.answers GAINS the answered
  role-gap annotation entry `"Trypsin-EDTA": "detaches the cells from the culture surface so
  they can be counted and reseeded"` — the bait-11 suppression leg proven end-to-end (with
  role: other and no answered gap, the bar would loop and this 200 record leg could never
  compile); axes echo the annotation as settled data; snapshot Trypsin-EDTA role now `other`
  with the ratified flat 50/45/5 source strings byte-stable; DECLARED nested 90:10 DMEM:FBS
  PRESERVED in the held localMacro (verified programmatically).
- mixfrac-final-volume record: snapshot + macro role solvent -> other (no clarification —
  no cells sibling, bait 8 silence).
- mixfrac-on-top record: role field only; clarifications stay 1 (no cells sibling — the gap
  does NOT fire; bait 8 proven on a canonical golden).
- goldenIntentToClarification.test.ts: the two bar-leg count pins updated 2->3 and 1->2 with
  explicit MIXROLE-1 DELIBERATE PIN UPDATE comments + gap-fact shape assertions (reason,
  label = component's own name, actionLocation, message names the component).

## §8 VERIFICATION BATTERY (targeted planes run INDIVIDUALLY, verbatim outputs)

Plane 1 — guidance + budget:
  npx vitest run src/ai/promptCompositionRoleGuidance.test.ts src/ai/promptBudget.test.ts
  ✓ promptCompositionRoleGuidance.test.ts (3 tests)  ✓ promptBudget.test.ts (6 tests)
  Test Files 2 passed (2) / Tests 9 passed (9)
  budget line: "draft prompt budget: 47179 chars (agent 24543 + material-rules 5545 +
  instruction 3101 + schema 13990) — ceiling 47180 (headroom 1)"

Plane 2 — affordance + fractions:
  npx vitest run src/compiler/scientistIntent/compositionRoles.test.ts src/compiler/scientistIntent/compositionFractions.test.ts
  Test Files 2 passed (2) / Tests 38 passed (38)

Plane 3 — normalize suite (scientistIntent dir):
  npx vitest run src/compiler/scientistIntent/
  Test Files 27 passed (27) / Tests 328 passed (328)
  (after the environment repair in Assumptions A1; realizationGolden.test.ts was the only
  failure and it is an Ajv schema-loading environment issue, not code)

Plane 4 — characterization:
  npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts src/compiler/scientistIntent/promptShapeParity.test.ts
  Test Files 2 passed (2) / Tests 21 passed (21)

Plane 5 — goldens:
  npx vitest run src/compiler/scientistIntent/goldens/
  Test Files 4 passed (4) / Tests 23 passed (23)

Plane 6 — biology:
  npx vitest run src/compiler/biology/  -> Test Files 5 passed (5) / Tests 65 passed (65)

Plane 7 — handlers (in because of the §3 item-4 plumbing):
  npx vitest run src/api/handlers/ -> 4 failed | 60 passed (64 files)
  Failing files: EventEditorFixHandlers, ExtractHandlers, LabSettingsHandlers,
  MeasurementHandlers.applianceJob, WorkspaceHandlers — ALL FIVE appear in the dispatch-tip
  baseline list .hermes/evidence/MIXFRAC1-l2t0310/base-server-failfiles.txt. Zero new.

Plane 8 — schema (no-schema-change proof):
  npx vitest run src/schema/ -> 3 failed | 43 passed | 5 skipped
  Failing files: EventGraphEquipmentSchema, EventGraphSemanticKeySchema,
  ProcurementSchemaContracts — all three in the baseline list. Zero new.

Plane 9 — stub-honesty reason-set pin family:
  npx vitest run src/ai/shorthandChat.e2eStubHonesty.test.ts -> 1 passed (1) / 7 passed (7)
  (CANONICAL_DOC there is the blob-label doc with NO params.composition — the role-gap
  evaluator never sees it; the reason-set pin family did not need updating.)

Full suite vs dispatch-tip baseline (failing-FILE SET comparison, not counts):
  lane HEAD: 97 failed files / 690 passed / 9 skipped (796); 133 failed tests
  baseline cl-integration-2 @ 0cec0bf0 (docs-only since a1ed2bef): 95 failed / 690 passed / 9 skipped (794); 109 failed tests
  comm of sorted FAIL-file sets:
    lane-only:   src/drafts/FormDraftService.test.ts, src/integration/W25CandidateImmutability.test.ts, src/revisions/DraftCopyDerivedRefValidation.test.ts
    baseline-only: src/api/InventoryShelfApi.test.ts, src/schema/MaterialReceivingSchemas.test.ts, src/sequences/sequenceIntent.test.ts
  All six divergent files PASS individually at HEAD (targeted run: 6 passed / 53 tests).
  The six-file divergence is full-suite run-order/resource flake (the repo's known flake
  class), NOT a lane effect: none of the six imports anything my diff touches, and the
  persistent failing-file set is identical to the baseline. Zero new persistent failures.

Typecheck:
  npm run typecheck -w server -> tsc --noEmit, exit 0, zero errors (exactOptionalPropertyTypes
  on; conditional spreads only — no key:undefined anywhere in the diff).

GREP-CLEAN (no new TS role-literal branch), verbatim:
  $ git -c core.fileMode=false diff a1ed2bef..HEAD -- '*.ts' | grep -nE "^\+.*((===|!==|\bcase\b)\s*['\"](solute|solvent|buffer_component|additive|activity_source|cells|other)['\"])"
  (no output; grep exit 1 = EMPTY)
  Pre-existing role sites (formulationMath.ts:216-226/:336-343, formulationCopilot.ts:71,173,
  vendorComposition.ts:18, simpleVerbs.ts, materialRefLabels.ts) are UNCHANGED context —
  cited, not edited (ROLE-AXES-1's mandate).

ENUM-HOME GUARD (all four homes, working tree included), verbatim:
  $ git -c core.fileMode=false diff a1ed2bef -- schema/core/datatypes/composition-entry.schema.yaml schema/workflow/scientist-intent.schema.yaml schema/lab/vendor-product.schema.yaml schema/lab/recipe.schema.yaml
  (no output — ZERO diff in all four enum homes)
  Full changed-file list (git diff a1ed2bef --name-status) contains NO schema/ path at all:
  22 files — config/drafting/composition-role-guidance.yaml (A), server/prompts/material-system-rules.md,
  promptCompositionRoleGuidance.test.ts (A), IntentCompileFromPromptHandlers.ts,
  compileScientistIntent.ts, compositionDecomposition.test.ts, compositionRoles.ts (A),
  compositionRoles.test.ts (A), goldens MANIFEST + 5 fixtures + 5 records +
  goldenIntentToClarification.test.ts, normalizeScientistIntent.ts, promptShapeParity.test.ts.

PURPOSE-INFERENCE GUARD, verbatim + honest scoping:
  Literal §8 command:
  $ git -c core.fileMode=false diff a1ed2bef..HEAD -- '*.ts' 'config/drafting/composition-role-guidance.yaml' | grep -inE "purpose|dissociat|trypsin"
  Returns 21 lines — EVERY one is either (a) a §7-MANDATED golden/fixture role re-pin line on
  the trypsin entry in compositionDecomposition/promptShapeParity/goldenIntentToClarification
  (fixture strings that ALREADY carried trypsin at the dispatch tip — visible as `-` lines in
  the same hunks), or (b) test names/comments quoting the ruling or naming the bait-8 scoping
  leg ("trypsin-less / cells-less scoping"). Zero hits in any policy file. The §8 command's
  "EMPTY" expectation is unsatisfiable alongside §7's own mandate to re-pin the trypsin role
  field in those exact test files; bait 4 states the real rule: "no reagent nouns outside
  fixtures/goldens/prompt example lines that ALREADY carry them" and "a reviewer WILL grep the
  NEW path — all three must come back empty in TS". The scoped check, verbatim:
  $ for f in <non-test changed files>; do git diff a1ed2bef..HEAD -- "$f" | grep -inE "purpose|dissociat|trypsin"; done
  config/drafting/composition-role-guidance.yaml -> exit 1 (EMPTY)
  server/src/api/handlers/IntentCompileFromPromptHandlers.ts -> exit 1 (EMPTY)
  server/src/compiler/scientistIntent/compileScientistIntent.ts -> exit 1 (EMPTY)
  server/src/compiler/scientistIntent/compositionRoles.ts -> exit 1 (EMPTY)
  server/src/compiler/scientistIntent/normalizeScientistIntent.ts -> exit 1 (EMPTY)
  No mapping of component names/synonyms/word-patterns to purpose values exists anywhere in
  the diff. 'purpose' appears in TS only inside a test-file comment quoting Brad's binding
  principle. 'dissociat' appears nowhere in TS or the config.

Bait compliance summary: 1 (conditional spreads everywhere; key absence asserted via
Object.keys in tests) | 2 (tests read files directly; no stack touched) | 3 (budget measured
before prose; 47179/47180; no re-ratchet) | 4 (zero role literals in new TS policy; gap role/
firesOn/question are config; reason code is as-const registration) | 5 (pre-existing role
sites unchanged) | 6 (bless exactly once per moved pin, same commit; NO treeState re-hash —
live hashes re-verified equal to pins) | 7 (deliberate clarification-list growth with diffs;
affordance NOT scoped off to dodge the fixture) | 8 (no-cells silence proven in unit,
normalize-integration, AND the on-top golden) | 9 (one clarification per entry; tests assert
no readings/candidates/confidence keys on the fact) | 10 (plate-event role vocabulary
untouched) | 11 (suppression leg present + proven three ways: unit fire-once/answered-passes/
nonsense-value-unchanged, normalize-chain integration, and the mixfrac-canonical-flat 200
golden end-to-end) | 12 (shipped question text test asserts no enum member; message is the
config question, never a pick-list; the answer is never validated against the enum).

## ASSUMPTIONS

A1. WORKTREE ENVIRONMENT REPAIR (not product code): the dead run's worktree checkout was
    missing the lane-2 lane-exclude symlink sync (58 synced-from-main paths; every other lane-2
    worktree, e.g. ANSWER-BIND-1-lane2-l2t0830, has them). Without them the goldens suite
    could not even load (resolutionEngine.ts imports server/src/ai/materialRefFields.ts, a
    lane-excluded file). I restored all 57 available paths as symlinks into Brad's tree
    (the established pattern; gitignored via the repo's core.excludesFile =
    lanes/2/lane-exclude-a6fix-l2t0430 — git status stays clean) and converted the 3 schema/
    symlinks to plain copies, because the Ajv SchemaLoader's readdir walk skips symlinked
    entries (entry.isFile() is false for symlinks) — that was the sole cause of
    realizationGolden.test.ts's missingRef on revision-ref.schema.yaml. Brad's live tree was
    READ ONLY (never modified). No product-code invention.
A2. mixfrac-canonical-flat fixture's request.answers gained the answered role-gap annotation
    entry (see pin table). This is the minimal way to keep the 200 record leg compiling under
    the ruled role (bait 11: the honest role stays `other` after any answer, so the answered
    recompile MUST carry the answered label or the bar loops). The value is the scientist's
    own words — opaque text, never interpreted.
A3. One repair to the dead run's uncommitted test: its "malformed config" fixture omitted the
    `question:` section, which per the cues-file discipline is the LOUD-off (warn) state, not
    malformed — the loader correctly warned instead of throwing. The test now uses a
    PRESENT-but-broken section (`firesOn: not-a-list`), which the loader throws on naming the
    path. Loader behavior itself was NOT changed (it matches the spec's absent-section =>
    OFF-LOUD rule).
A4. The dead run's guidance sentence was tightened to "closest declared role; if none fits,
    `other`" to fit the 46-char headroom measured before prose (bait 3); the fuller §5a
    wording's substance (never stretch a contradicting role) is carried by the re-pinned
    exemplar, which the guidance test pins in both directions (must contain role: other,
    must NOT contain role: solvent).
A5. The ruling file cited by the spec at cl-integration-2/.hermes/plans/decisions/ does not
    exist there; the record lives at /home/brad/.hermes/cl/lanes/2/decisions/
    MIXROLE1-role-axes-brad-ruling-20261022.md (quoted from it).

## UNRESOLVED / FOR THE ORCHESTRATOR

- Merge-time note: CELLRATE-1 (queued on the merge marker config/drafting/
  composition-role-guidance.yaml — now present) must rebase its material-system-rules.md
  :151-153 hunk and bless chain on this merged state; its treeState wire-pin re-bless stays
  CELLRATE's (this item added none).
- The stack (:3093/:5193) was NOT restarted by me (compiler/prompt task, no browser gate);
  material-system-rules.md is prompt-cached per §2.4a — the orch's post-merge restart picks
  the new prompt up.
- Full-suite six-file flake divergence (lane-only 3 / baseline-only 3) is documented above
  with individual-run proof of green; if the adversarial reviewer wants a second full-suite
  comm, the individual-file evidence is already in this report.

STATUS: complete
