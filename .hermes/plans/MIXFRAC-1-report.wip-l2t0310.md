BASE_SHA fcc24539

# MIXFRAC-1 — composition-fraction convention: coder report (LANE 2)

Resume note: this is the **l2t0715 resume run 3** on
`/mnt/vast/home/brad/git/wt/MIXFRAC-1-lane2-l2t0310`, branch
`cl/lane2-mixfrac1-l2t0310`. Run 2 (l2t0640) was SIGKILLed at 06:48:41 in a
machine-wide teardown sweep (not a fleet-lock event). Run 2's mandate steps 1-2
were verified, NOT redone: WIP commit `3c558b9a` and trunk merge `32a9d103`
(trunk tip 0dd4c513) were already on the branch at resume.

Commit chain on this branch:
- `fcc24539` base
- `3c558b9a` run-2 preserved WIP (verified, not redone)
- `32a9d103` run-2 merge of trunk 0dd4c513 (verified, not redone)
- `5e6c1257` resume-3 merge of docs-only trunk tip `14d26cf6`
- `be5b5e27` resume-3 merge of docs-only trunk tip `24997f1b`
- `7f928846` **the implementation commit** (bar + goldens + bless + pin updates, all in ONE commit)
- report commit (this file)

`66cb7915` (AgentOrchestrator/shorthandChat/AiTabPanel) is disjoint from the §3
IN set; it entered only via the mandated trunk merges.

## 1a. Resume verification (DONE BY RUN 2 — verified only)

`git -c core.fileMode=false log --oneline -3` at resume showed HEAD `32a9d103`
(merge of trunk 0dd4c513) over `3c558b9a` (WIP: convention YAML +
compositionFractions.ts + compositionFractions.test.ts + normalizeScientistIntent.ts).

**compositionFractions.test.ts at resume read RED.** Run 2's
`applyCompositionFractionConvention` was defined but NEVER CALLED in the
normalize loop — the bar could not fire. Fresh RED proof captured at resume
HEAD (WIP stashed, suite run, WIP restored):
`.hermes/evidence/MIXFRAC1-l2t0310/red2-resume3-bar-not-wired.txt` —
`Test Files 1 failed (1) / Tests 7 failed | 6 passed (13)`, core leg:
"a 110% declared sum must clarify (the trunk defect): expected [] to have a
length of 1 but got +0". (Run 2's own `red1-compositionFractions.txt` captured
an earlier vocabulary-path crash, not a clean RED; red2 is the clean RED.)

After the wiring fix the same file reads **GREEN: 15/15** (see §6).

## 2a. Trunk fold (DONE BY RUN 2 — verified; docs-only tips folded)

Trunk moved twice since 0dd4c513, both docs/handoff-only; each was folded with
one `git -c core.fileMode=false merge cl/integration-2` (mandated "once anyway"
per tip): `14d26cf6` -> HEAD `5e6c1257`; `24997f1b` -> HEAD `be5b5e27`.
Implementation HEAD after §3 work: `7f928846`.

## 3. Implementation (spec §3-§10, §0 rulings, §14 amendment)

### 3.1 Convention DATA — `config/drafting/composition-fraction-convention.yaml`
All thresholds/patterns/phrases/labels are DATA: `basis/total/tolerance`,
`displayRoundingFactor`, `excludeRoles: [cells]`, `fractionPatterns`,
`malformedFractionBehavior: exclude-and-name`, `attachmentEvidence`
(supplementConnectors / finalVolumePhrases / onTopPhrases / adjacencyWindowChars
/ ratioPatterns — firesOn idiom per mixture-material-cues precedent),
`convention` (readings order, `defaultParse: preceding-noun`,
`defaultParseCondition: recipeShapedReadingExists`, `onGenuineAmbiguity: clarify`,
`readingArithmetic` [rebase-to-total / attach-to-preceding / keep-declared],
`silentResolution` [finalVolumePhrases arm only], `readingLabels`),
`messages` (clarification / sumNote / malformedNote / attachmentNote /
fractionFormat), `recipeShapedReadingEvidence` (storeKinds [material-spec],
formulationKinds [defined_composition], phraseMatch whole-word-containment,
ratioPatterns, `documentSideReading: precedingEntryDeclaresOwnComposition`).
Zero reagent nouns in the YAML (grep count 0). Loaded PER call (never
process-cached); absent file => feature OFF LOUD (one `console.warn` naming the
path, `[composition-fraction-check-off] ... Convention data home: <path>`);
present-but-malformed => throws naming the path.

### 3.2 Evaluator — `server/src/compiler/scientistIntent/compositionFractions.ts` (NEW)
Generic, zero domain knowledge. `COMPOSITION_FRACTION_SUM_REASON =
'composition-fraction-sum' as const` (registration, not policy — §6 bait 4
exception). ONE clarification per composition (bait 7), carrying THREE candidate
readings each with COMPUTED finalFractions (never hardcoded strings, never
ranked/picked — bait 8; grep for `confidence` in the new path returns only the
two comment lines stating it is absent). Cells excluded via DATA `excludeRoles`
(bait 6). Malformed fractions excluded-and-named. One-sided final-volume
evidence resolves silently via re-base (GOLDEN-B); on-top evidence does NOT
resolve silently (OQ-4): the bar stands and the sum note rides the on-top
reading. Preceding-noun-recipe presented FIRST when recipe-shaped evidence
exists (store arm per §14.3, or document-side arm: the preceding entry declares
its own composition per §14.1). attach-to-preceding EXPANDS a declared nested
composition into the flat derived view (parentShare x childShare / total) and
carries `nestedFractions` (the declared inner split) on the reading (§14.2).

### 3.3 Wiring — `normalizeScientistIntent.ts`
`applyCompositionFractionConvention` is now CALLED in the normalize loop beside
the cue bar (the run-2 defect fixed). `COMPOSITION_FRACTION_SUM_REASON` joins
the `UnrealizedProducerReason` union; `ProducerClarification.readings?:
readonly CompositionReading[]` is optional, built by CONDITIONAL SPREAD only
(exactOptionalPropertyTypes — never `field: undefined`). Silent re-base rewrites
composition fractions index-aligned (never label-keyed).

### 3.4 Snapshot emission — `server/src/compiler/biology/verbs/simpleVerbs.ts` (§3.2)
Convention applied INSIDE `compositionSnapshotFromParams`, which BOTH call
sites consume (`:99` and `:557` — bait 9 covered; verified by grep). A declared
entry carrying its own `composition` flattens to the derived view (parentShare x
childShare / total, ratified source strings); the parent line is not emitted on
the snapshot (§14.2: nested never rides a snapshot entry). The ratified
`<fraction> of the mixture` form stays byte-stable through the single
`mixtureSourceString` site (the existing :385 emission, now one helper so both
arms share the identical form — app pins at eventGraph.ts:315 /
wellStateProjection.test.ts:24-27 untouched). Unparseable declared fractions
pass through VERBATIM, never guessed.

### 3.5 Schema — `schema/core/datatypes/composition-entry.schema.yaml`
EXACTLY ONE additive optional property per §14.1, appended under `properties:`
sibling of `source`: `composition: {type: array, minItems: 1, items: {$ref: "#"}}`
— root self-ref, NOT `./composition-entry.schema.yaml`, no `recipe_ref`.
Registry dependency pin UNCHANGED (`SchemaRegistry.test.ts` pin
`toEqual([ref.schema, concentration.schema])` green — the `#` ref is skipped).
Targeted check green: `SchemaRegistry.test.ts` + `BiologicalTypesSchema.test.ts`
31/31. (`ProcurementSchemaContracts.test.ts` fails on the pre-existing
`revision-ref` missingRef — it is line 85 of the preserved baseline fail-file
list; unrelated to this diff.)

### 3.6 Goldens — blessed EXACTLY ONCE, same commit `7f928846`
Bless mechanism: `server/scripts/mixfrac-bless.mts` (loads each fixture through
the SAME replayKernel the vitest suite uses; prints before/after hashes). The
committed records are the single final bless against the final fixture content;
the manifest pins match and the in-suite manifest hash check is green.

Before/after hashes (bless output, `.hermes` evidence in commit):

| golden | fixture sha256 | record before -> after | status |
|---|---|---|---|
| unresolvable-mixture-component (REBLESS) | 245603b1... (UNCHANGED) | 75ef78d867f7682b1aa0119b8735aab0fb5a1bec99899b83c7a94fa6ccaf757e -> fe927e73e7b3884cc4a437647cad4a48f806e819100e96802474bed27cd56ab3 | 422 |
| mixfrac-canonical-ambiguous (GOLDEN-A bar leg) | fe449f2fe7b9000bd0c5c52f77905802dc0c003461c385e0cc6fb630e463916d | absent -> 598a4e23de741e4468247fe94c4868ddf3527433f5ff075201d3130b1c5c8e1c | 422 |
| mixfrac-canonical-flat (GOLDEN-A record leg) | dbabb88f5c265ec657946ec3d1840e8ccf6d76d3ac9f40371c495d37c23cb394 | absent -> e99f916f0e9997f98dcc5d1d9f2921ea1d2050e862fb8c4df1b25a8ce4e1fa08 | 200 |
| mixfrac-final-volume (GOLDEN-B) | c7dae608d5f4a7668be6b04aa807386f18289c75b2ba61bf8228d64c58882e5c | absent -> 370e3f57a95af02fef60d99c2bcbf539f67b3e2c1149c6fe278358141e53fa9a | 200 |
| mixfrac-on-top (GOLDEN-C) | c8f279c4b3d0f0458c057bfce139e641ed9ba948577be28831e664b4f1c7d912 | absent -> 30b8ae98a38b7dce189c37fb9c4fb8be6239b33e3e732e77622fb8e958d892ae | 422 |

Re-bless diff audit (programmatic): the unresolvable-mixture-component record's
ONLY divergence is the APPENDED composition-fraction-sum fact (label
"trypsin-EDTA, DMEM, Equine Serum"); the original unknown-noun fact is
byte-identical and all non-clarification body keys are byte-identical.

GOLDEN-A bar leg (Brad's phrasing "50/50 Trypsin-EDTA/DMEM + 10% FBS with 200
HepG2 cells/uL"): ONE clarification, reason `composition-fraction-sum`,
actionLocation {actionIndex 0, add_material, composition}, THREE readings:
1. preceding-noun-recipe FIRST (document-side recipe evidence: the medium entry
   carries the ONE inline nested composition DMEM 90% / FBS 10% — the §14.2
   encoding chosen): finalFractions Trypsin-EDTA 50 / DMEM 45 / FBS 5,
   nestedFractions DMEM 90 / FBS 10.
2. whole-mixture-supplement: 45 / 45 / 10.
3. explicit-on-top: 50 / 50 / 10 + sum note.
The held localMacro keeps the NESTED declared composition (declared truth is
nested; flat is derived).

GOLDEN-A record leg (mixfrac-canonical-flat): compiles 200; composition_snapshot
FLAT entries with ratified source strings: Trypsin-EDTA `50% of the mixture`,
DMEM `45% of the mixture`, FBS `5% of the mixture`; cells entry unchanged (no
source, role cells). ASSUMPTION recorded: the record leg encodes the
post-answer document (the selected preceding-noun reading applied as the flat
declared composition) because the pipeline's `answeredSlots` idiom is noun-
binding only — there is no fraction-reading answer channel to fold.

GOLDEN-B ("bring to 10% FBS v/v final"): 200, NO clarification (one-sided
finalVolumePhrases arm), snapshot re-based 45 / 45 / 10 ratified strings.
GOLDEN-C ("add 10% FBS v/v on top"): 422, THREE readings (on-top evidence does
not resolve silently per OQ-4), explicit-on-top reading 50 / 50 / 10 carrying
the sum note.

### 3.7 Deliberate pin updates (updated, not pinned around — §3.4/§6 bait 5)
1. `goldens/__records__/unresolvable-mixture-component.golden.json` — re-blessed
   ONCE (hashes above; the bar fires on its 50/50/10 = 110% fixture, per bait 5
   "that is the feature").
2. `compositionDecomposition.test.ts` prompt-1 leg — BEFORE: 4 component
   materials + 1 complex_composition spec compiled clean; AFTER: the 50/50/10
   MIXTURE fixture bars with composition-fraction-sum (assertions updated to
   expect the bar + readings).
3. `mixtureRedundancy.test.ts` — PASTE5_DOC / paste3 inline compositions moved
   from 50/50/10 to the ruling's blessed flat derived view 50/45/5 (sum 100);
   T1/T2/T3 green.
4. `goldens/goldenProseBlobStrip.test.ts` COMPONENTS — 50/50/10 -> 50/45/5 flat
   derived view.
5. `compositionArgResolution.test.ts` (NOT enumerated in §3.4 but structurally
   forced — its fixtures carry the same 50/50/10 = 110% shape bait 5 names;
   flagged for orchestrator review): T1 composition-argument clarifications 1 ->
   2 (unknown-noun pin UNCHANGED + new composition-fraction-sum leg asserting
   readings ride); T2b zero-composition-clarifications + outcome-not-bar ->
   zero unknown-noun + ONE sum bar + outcome needs-clarification (noun-resolution
   behavior the test exists to pin is unchanged).
6. `shorthandChat.e2eStubHonesty.test.ts` reason-set pin (:306-315) — UNCHANGED:
   its CANONICAL_DOC carries a blob material with NO declared composition
   fractions, so the bar does not fire there; the pin stays green as-is.

### 3.8 §5 — readings ride the 422 wire, verified BEFORE any schema change
New test leg in `compositionFractions.test.ts` drives the REAL
`createIntentCompileFromPromptHandlers` route (only model client + store stubbed;
vocabulary, Ajv parse, lift, normalize, resolve_nouns, compile all REAL — the
SPINE-5 harness idiom). Captured: status 422, `error: NEEDS_CLARIFICATION`, ONE
composition-fraction-sum clarification with `readings` (3, each with computed
finalFractions) riding the clarification object VERBATIM; held
`localMacro.unresolved` stays `[]` — the wire `unresolved` slot
(additionalProperties:false) carries NOTHING new. **No schema amendment needed**
(§3 B smallest honest path confirmed).

## 4. exactOptionalPropertyTypes compliance
`readings` and `message` on ProducerClarification: conditional spread only
(`...(outcome.clarification.readings.length > 0 ? { readings: ... } : {})`).
Golden assertions use key presence/absence on parsed JSON (Object.keys idiom via
`fact['readings']`), never toEqual-with-undefined. Typecheck EXIT 0 (below).

## 5. Bait 4 grep-clean proof (authored TS, added lines only)
`git show 7f928846 -- compositionFractions.ts simpleVerbs.ts normalizeScientistIntent.ts | grep '^+' | grep -iE "dmem|fbs|trypsin|hepg2|serum|bovine|\"50\"|'50'|\"45\"|...|of the mixture"` returns ONLY:
- 3 comment lines referencing the ratified `of the mixture` form (allowed
  documentation of the existing :385 site), and
- the single code site `return \`${fractionText} of the mixture\`;` in
  `mixtureSourceString` — the ONE ratified-form site (the §3 OUT pin caution
  form itself).
ZERO reagent nouns, ZERO fraction literals (50/45/10/100/110/90/5), ZERO
connector-phrase literals ('on top', 'bring to', 'final') in added TS lines.
The pre-existing `DMEM` comment at simpleVerbs.ts:522 is a base line (verified
via `git show fcc24539:...` — present at base, not added). Bait 11 scan
(spawn|line-dsl|shorthand in scientistIntent/ non-test TS): clean.

## 6. Verification (§10, exact outputs)

Targeted (`npx vitest run src/compiler/scientistIntent/ src/compiler/biology/ src/ai/shorthandChat.e2eStubHonesty.test.ts`, from server/):
```
 Test Files  32 passed (32)
      Tests  377 passed (377)
```
EXIT 0. Zero failures. (compositionFractions.test.ts 15/15 GREEN; goldens suite
4 files / 23 tests GREEN including the manifest hash check;
compositionArgResolution.test.ts run separately: 14/14.)

Schema extension targeted (§14.1 first check):
```
src/schema/SchemaRegistry.test.ts + src/schema/BiologicalTypesSchema.test.ts
 Test Files  2 passed (2)
      Tests  31 passed (31)
```
Dependency pin `toEqual([ref.schema, concentration.schema])` unchanged/green.
ProcurementSchemaContracts.test.ts fails ONLY on the pre-existing revision-ref
missingRef (preserved baseline line 85; untouched by this diff).

Full suite (`npm run test:run -w server` from repo root):
```
 Test Files  89 failed | 696 passed | 9 skipped (794)
      Tests  106 failed | 6526 passed | 70 skipped (6875)
     Errors  2 errors
```
Failing-FILE set vs the preserved dispatch-time baseline
(`.hermes/evidence/MIXFRAC1-l2t0310/base-server-failfiles.txt`, 93 files):
**comm: ZERO new failing files** (89 vs 93). Four baseline-failing files now
pass (Wave2SemanticPassE2E, DraftCopyDerivedRefValidation, Qms6bSchemaDrift,
sequenceRoutes — trunk drift, verified green standalone). Test-level accounting
inside already-baseline-failing files: EventEditorFixHandlers.test.ts (baseline
failing file) shows 7 failing tests vs 1 at baseline capture — timing-dependent
fix-it-job-manager legs (30s job rounds), no compiler import, unrelated to this
diff; 4 baseline-failing tests elsewhere now pass. `Errors 2` matches the
baseline's `Errors 2` (pre-existing unhandled-exception debt).

Typecheck (`npm run typecheck -w server`): `tsc --noEmit` **EXIT 0**.

Manifest hash check: green inside the goldens suite (manifestHashMismatches
empty legs in goldenProseBlobStrip / goldenIntentToGraph / goldenIntentToClarification).

Environment: no MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND observed in any run of
this report (grep count 0 in the full-suite raw). Brad's node_modules reinstall
completed per handoff 14d26cf6; no env flake chased.

## 7. Reload need (noted per §6 bait 2 / §14.4(iv))
`schema/core/datatypes/composition-entry.schema.yaml` changed, so the LANE
STACK (:3093/:5193) needs a restart to serve the extended composition-entry
schema. The lane stack is NOT mine to restart (dispatch constraint); all unit/
contract tests here load schema/vocabulary/convention data directly per call and
are green without any reload. The convention YAML itself is loaded PER call —
no restart needed for it.

## 8. Ownership audit
`git -c core.fileMode=false diff fcc24539..HEAD --name-only` = §3 IN files +
§3.4 pin updates + goldens fixtures/records/MANIFEST + bless script + evidence +
report, PLUS the mandated trunk merges' docs/handoff files (REVISE-GHOST-1 docs,
`.hermes/plans/handoffs/*`, AgentOrchestrator/shorthandChat/AiTabPanel from
66cb7915) which entered ONLY via the mandated `merge cl/integration-2` commits
and are NOT touched by the authored commit. Authored commit `7f928846` touches
only: convention YAML, composition-entry schema, simpleVerbs.ts,
normalizeScientistIntent.ts, compositionFractions.ts/.test.ts, goldens
(fixtures x4, records x5, MANIFEST, 3 golden test files),
compositionDecomposition.test.ts, mixtureRedundancy.test.ts,
compositionArgResolution.test.ts, server/scripts/mixfrac-bless.mts, evidence.

Flagged for orchestrator review (structurally forced, not self-granted scope):
(a) `compositionArgResolution.test.ts` pin update — forced by the feature on
110% fixtures per bait 5's principle, though §3.4's enumeration did not name it;
(b) `server/scripts/mixfrac-bless.mts` — the bless mechanism (precedent:
78b6f476 committed a replay script under server/scripts/).

## 9. OQ compliance record
- OQ-1 (Brad, binding): GOLDEN-A pins preceding-noun 50/45/5 flat + nested
  90:10 declared; three readings, preceding-noun FIRST when recipe-shaped
  evidence exists; no worker-picked fractions; no confidence anywhere.
- OQ-2: convention as DATA, applied at snapshot emission + normalize bar.
- OQ-3: typed `readings` on ProducerClarification (producer-side fact), rides
  the 422 verbatim; panel consumption stays MATRES-PANEL's (no app/* touched).
- OQ-4: sum note rides the on-top READING data only — never the ledger, never
  the `<fraction> of the mixture` source form (byte-stable, single site).
- §14.1: exactly ONE additive property, `$ref: "#"`, dependency pin unchanged.
- §14.2: nested lands in readings + GOLDEN-A declared layer; snapshot stays flat
  derived view. Encoding chosen: ONE inline composition on GOLDEN-A's medium
  entry (bar leg localMacro); blessed flat numbers identical either way.

STATUS: complete
