# MIXFRAC-1 EXECUTION SPEC — Composition fractions: declared convention + sum-to-100 clarification + attachment ambiguity

## 0. PROMOTION RULINGS (orchestrator l2t1510, 2026-10-21 15:25 EDT — binding for the worker)
- OQ-2 RATIFIED as stanced: sum check lives in server/src/compiler/scientistIntent/compositionFractions.ts
  (NEW generic evaluator, zero domain knowledge) called from normalizeScientistIntent.ts beside the cue bar;
  ALL thresholds/totals/exclusions/patterns/phrases in config/drafting/composition-fraction-convention.yaml.
  NO lint DSL extension in this item (MATRES-CHAIN OQ-2(b) precedent). Composer lint-expressibility verdict
  re-verified by orch: compare/everyItem cannot accumulate; fraction is a string; clarification != lint channel.
- OQ-3 RATIFIED as stanced: readings ride ProducerClarification via optional `readings` built by conditional
  spread (exactOptionalPropertyTypes); NOT candidateFact, NOT resolutionGatedClarifications. Worker writes the
  real 422 capture test proving readings travel verbatim BEFORE proposing any wire-schema change (§3 B).
- OQ-4 RULED (default stance): the on-top sum note rides the clarification/reading data + golden expected
  output, NOT the ledger (the "<fraction> of the mixture" source form is consumed verbatim by the app —
  eventGraph.ts:315 shape parser, wellStateProjection.test.ts:24-27; composition-entry.schema.yaml is
  additionalProperties:false). No composition-entry schema change.
- OQ-1 RULED BY BRAD 2026-10-21T20:00 EDT (interactive, supersedes the three stanced options):
  > NEITHER 45/45/10 NOR 50/50/10 NOR a fraction-convention rebase. The reading is ATTACHMENT TO
  > PRECEDING NOUN: "DMEM + 10% FBS" is a UNIT — DMEM-with-10%-FBS is an in-house RECIPE (complete
  > medium the lab makes), NOT a supplement sprinkled on the whole mixture. The utterance is a
  > 50/50 combination of TWO things: (1) Trypsin-EDTA (purchased, Thermo) and (2) that in-house
  > medium. Final mix: Trypsin-EDTA 50%, and the medium 50% of final which itself splits 90:10 ->
  > flat fractions DMEM 45% / FBS 5% / Trypsin-EDTA 50% (sum 100). GOLDEN-A pins exactly this.
  > DEEPER IMPLICATION for (a)/(c), coder+spec must honor: the correct modeling is a NESTED/
  > RECIPE component — the composition entry for the medium may carry its OWN composition
  > (DMEM 90% + FBS 10%) and/or point at the in-house recipe as a material; flattening to 45/5 is
  > a DERIVED view, not the declared truth (materials provenance hierarchy: a formulation is not
  > a concept). The clarification for the ambiguous utterance should ask WHICH PARSE (FBS attaches
  > to the whole mix vs to DMEM), with the in-house-recipe reading presentable; a lab that makes
  > DMEM+10%FBS in-house has a record-shaped answer to that question. If schema expressibility of
  > nested composition is missing, that is in-scope small-schema-extension per the block's own
  > audit-first mandate — STOP AND REPORT only if it exceeds it.
  Harvest note: ruling ACCEPTED as the dispatch-gate ruling 2026-10-21 16:05 EDT (recorded
  interactively in the task block). GOLDEN-A pins Trypsin-EDTA 50 / DMEM 45 / FBS 5 flat; the
  medium's declared truth is NESTED 90:10 DMEM:FBS; flat = derived view. GOLDEN-B/C keep their
  whole-mixture / on-top phrasings as the OTHER candidate readings.
- DISPATCH SHAPE (AMENDED l2t1635, supersedes the blocked-on-Brad shape): **GOLDEN-A is LIFTED and
  BLESSED** per the ruling above — the worker dispatches with all four goldens; nothing is blocked.
  Ambiguity handling: the ambiguous canonical utterance STILL CLARIFIES (the ruling keeps the
  clarification — it asks WHICH PARSE), and the readings list is now THREE candidates:
  (1) whole-mixture supplement re-base (45/45/10), (2) PRECEDING-NOUN / in-house-recipe
  (Trypsin-EDTA 50 + medium 50 nested 90:10, flat-derived 50/45/5), (3) explicit on-top
  (50/50/10-of-mixture + sum note). Readings (1) and (3) are what ratified OQ-3 already carries;
  the ruling ADDS reading (2) — a change to the readings enumeration only; the ratified OQ-3 ride
  (optional `readings`, conditional spread) is unchanged.
  DEFAULT-PARSE RULE: when a RECIPE-SHAPED COMPONENT READING EXISTS (store evidence, §14.2),
  preceding-noun is the DEFAULT candidate — presented FIRST and named as matching the lab's
  in-house record — but a genuinely ambiguous utterance still emits the clarification. Genuine
  ambiguity is NEVER resolved by confidence (ratified OQ-3 stands). [ORCH DECISION l2t1635: keep
  still-clarify — composer default held; do NOT silent-resolve even on exact record match.]
- Dispatch collision: fleet lock held by MATRES-ELIG coder. MIXFRAC-1 dispatches the moment the
  lock frees with a clean advc/merge chain — do not preempt. Fleet order: ELIG-merge -> MIXFRAC-1
  -> FULFIL -> PANEL -> CHAIN gate.


Draft: l2t1315 composer (cl-spec-composer), 2026-10-21 13:30 EDT. DRAFT — orchestrator reviews, rules OQs, promotes.
Trunk at composition: cl/integration-2 @ 6f8fb519 (MATRES-RECV merged this tick). ALL file:line cites below were
re-read by the composer in the trunk working tree (/mnt/vast/home/brad/git/cl-integration-2); scout output was
screening only and every load-bearing scout claim was re-verified directly.

## 1. Goal
Make the compiler refuse to silently accept a composition whose declared fractions do not sum to the declared
convention total (today: "50/50 X/Y + 10% Z" = 110% compiles clean), by (a) declaring the fraction convention as
drafting-config DATA, (b) emitting ONE clarification with reason code composition-fraction-sum and both candidate
readings when the sum breaks, (c) riding the PP-attachment ambiguity to the clarification channel whenever the
utterance-shape evidence shows two legal parses, and (d) pinning three goldens for the canonical, "final", and
"on top" phrasings.

## 2. Verified root facts (composer-verified, trunk working tree)
- `compositionSnapshotFromParams` — server/src/compiler/biology/verbs/simpleVerbs.ts:357-408 (task said
  ~:362-405; the function signature is :357, closing brace :408; doc block starts :334 — cite reconciliation).
  Call sites :70 and :484 (both add_material emit branches).
- THE DEFECT, verified verbatim at simpleVerbs.ts:385:
  `...(typeof entry.fraction === 'string' ? { source: \`${entry.fraction} of the mixture\` } : {})`
  — each entry's fraction STRING is copied into the snapshot `source` with NO parsing, NO sum, NO convention.
  Nothing in the repo parses the fraction string (repo-wide grep for fraction arithmetic: zero hits).
- Cells handling today: role 'cells' carries count/counterDensity (:388-394); no fraction is expected on it.
- Wire slot: schema/workflow/scientist-intent.schema.yaml:182-215 — composition item declares
  `fraction: { type: string }` (:198-199), unconstrained string. Ledger datatype
  schema/core/datatypes/composition-entry.schema.yaml has NO fraction field at all; `source: string` (:39-40);
  `additionalProperties: false` (:8).
- Clarification channel today (producer arm): normalizeScientistIntent.ts — reason codes are TS `as const`
  (:376, :390, :403, e.g. MIXTURE_BLOB_MATERIAL_REASON='unrealized-mixture-blob-material'), narrowed by the
  `UnrealizedProducerReason` union (:405-408); `ProducerClarification {label, reason, actionLocation, message?}`
  (:412-417, exactOptionalPropertyTypes: conditional spread only); carried on
  `ScientistIntentNormalized.clarifications` (:436-439) — "the compile runner bars atomically on them (422 arm,
  never 500)". `resolutionGatedClarifications` (:440-446) is the resolve-vs-mint gated arm — DO NOT touch.
  The 422 ride: api/handlers/IntentCompileFromPromptHandlers.ts:468-481 — clarifications travel VERBATIM, the
  route mints nothing.
- Sibling declaration discipline (mirror this exactly): config/drafting/mixture-material-cues.yaml —
  `firesOn` per cue (:33-42), `mixtureShape.ratioPatterns` + flanking thresholds as DATA (:44-62), loaded PER
  call (normalizeScientistIntent.ts:810, loader :264), absent-file/section => feature OFF **LOUD** via
  `warnCueBarOff` (:97; fired :267, :277, :283), malformed file THROWS naming the path (:271-275, :280-282);
  zero cue literals in TS. Config-home injection precedent: `NormalizeOptions.mixtureCuesPath` (:419-430).
- Lint DSL AUDIT (composer-verified, not just scout):
  * Predicate ops — server/src/lint/types.ts:21-39, exactly 18: exists, nonEmpty, regex, compare, equals, in,
    all, any, not, has_material_class, state_is, context_contains, lineage_includes, time_within,
    mention_kind_matches, allIn, everyItem, noneIn.
  * `compare` (schema/lint/lint-v1.schema.yaml:141-149; interpreter server/src/lint/PredicateEvaluator.ts:898-903)
    compares ONE scalar at ONE path against a literal number. `everyItem` (:318-352) quantifies PER item with
    the item as root — it cannot see sibling items, cannot accumulate.
  * VERDICT (honest, in-spec per task): **the lint DSL CANNOT express this rule.** Three independent reasons:
    (1) no predicate computes an arithmetic SUM across array entries; (2) `fraction` is a STRING ("50%") and no
    predicate parses strings into numbers; (3) lint findings are error/warning/info violations
    (lint-v1.schema.yaml:81) — they are NOT the clarification fact the task demands (clarifications ride the
    producer channel above, a different mechanism and channel). (Also note LintEngine.lint accepts in-memory
    payloads — server/src/lint/LintEngine.ts:246 `lint(data: unknown, schemaId?)` — so "lint can't see shorthand
    params" is NOT one of the reasons; the reasons are expressive + channel.)
  * Precedent for the stance: MATRES-CHAIN OQ-2 was RULED (b) "declared-policy data + generic compile evaluator
    (sumCompare predicate = proposed follow-up capability item, NOT smuggled into CHAIN)" — handoff
    2026-10-21_1300, §QUEUE item 1. MIXFRAC-1 follows the same ruling shape; a generic DSL sum predicate stays
    a separate capability item.
- Reason-code registration audit (task file clause "vocabulary lint if reason code needs registering"):
  VERIFIED NOT NEEDED — the wire schema's `unresolved[].reason` is an open `type: string`
  (scientist-intent.schema.yaml:230-232; also :243 note), no vocabulary lint enumerates reason codes, and the
  TS-side registration point is the `UnrealizedProducerReason` union (normalizeScientistIntent.ts:405-408).
  The vocabulary YAML carries no reason vocabulary
  (schema/scientist-intent/scientist-intent-vocabulary.yaml: zero reason-code enumerations — composer grep).
- candidateFact mechanism (for OQ-3, cited both surfaces): resolutionEngine.ts:101-108
  `candidateFact(candidate: RankedCandidate) => {label, confidence, ref?}` and :110-123 `clarificationFor` —
  ranked, CONFIDENCE-bearing, store-record-backed candidates from noun-resolution tiering.

## 3. Files in scope (owned by this item)
Exactly as the task block scopes ("config/drafting/ (new fraction-convention file); simpleVerbs.ts;
scientistIntent lint/goldens; vocabulary lint if reason code needs registering"), made concrete:
1. config/drafting/composition-fraction-convention.yaml — NEW. The convention DATA (see §5).
2. server/src/compiler/biology/verbs/simpleVerbs.ts — apply the declared convention at snapshot emission
   (fraction -> final-of-mixture before the `of the mixture` copy at :385); NO domain literals (OQ-1 gate).
3. server/src/compiler/scientistIntent/goldens/fixtures/*.yaml (3 NEW), goldens/__records__/*.golden.json
   (3 NEW), goldens/MANIFEST.yaml (blessed ONCE, precedent entries COMP4-REBLESS / W2-8-A5g /
   W28-OPTIONBIND-1), goldens/goldenIntentToClarification.test.ts and/or goldenIntentToGraph.test.ts replays.
4. Deliberate pin updates the new clarification forces (verified-by: "updated, not pinned around"):
   goldens fixtures/MANIFEST record whose blessed output changes (see §6 bait 5 — the existing
   unresolvable-mixture-component fixture ALREADY carries 50/50+50/50+10/10 = 110%),
   compiler/scientistIntent/compositionDecomposition.test.ts (MIXTURE fixture :44-53 is 50/50/10),
   ai/shorthandChat.e2eStubHonesty.test.ts reason-set pin :306-315.

ADDITIONS THE TASK BLOCK DOES NOT NAME but the deliverables make structurally necessary — ORCHESTRATOR DECIDES
(the composer cannot route a clarification reason code through any other file):
A. server/src/compiler/scientistIntent/normalizeScientistIntent.ts (+NEW sibling
   server/src/compiler/scientistIntent/compositionFractions.ts + its .test.ts) — the reason-code
   `composition-fraction-sum` must enter the `UnrealizedProducerReason` union (:405-408) and
   `ProducerClarification` (possibly widened with an optional readings field, OQ-3); the CHECK itself is the
   smallest generic evaluator (compositionFractions.ts) called from normalize next to the cue bar (:810 site),
   because normalize is where clarifications are raised and the runner bars atomically. An expander-time check in
   simpleVerbs CANNOT raise a producer clarification (expanders run downstream and have no clarification arm).
B. server/src/compiler/scientistIntent/types.ts / wire schema — ONLY if readings must survive to the response
   verbatim; verify first: ProducerClarification flows to the 422 body without a schema-declared readings
   field? The `unresolved` wire slot is additionalProperties:false + unevaluatedProperties:false
   (scientist-intent.schema.yaml:224-225) — IF the readings ride through that slot a schema amendment is needed;
   if they ride `ProducerClarification.message` (string, already declared absent-or-value) no schema changes.
   Smallest honest path first: encode the two candidate readings with their computed final fractions INTO the
   clarification (typed `readings` on ProducerClarification is a producer-side fact; the panel consumption rides
   MATRES-PANEL) — worker verifies the ride with a real 422 capture test before touching any schema.

Explicitly OUT of scope:
- app/* — panel rendering of the clarification rides MATRES-PANEL (task says so; no browser gate here). Pin
  caution: app/src/graph/lib/eventGraph.ts:315 and app/src/event-editor/focus/wellStateProjection.test.ts:24-27
  CONSUME the exact "<fraction> of the mixture" source-string form — the form must stay byte-stable; put the
  on-top sum note on a DIFFERENT surface (OQ-4).
- server/src/lint/** and schema/lint/lint-v1.schema.yaml — NO DSL extension in this item (CHAIN precedent).
- config/drafting/mixture-material-cues.yaml — do not edit; the fraction convention is a NEW sibling file.
- materials/AddMaterialSupport.ts, server/src/receiving/**, drafts/** — untouched.
- schema/core/datatypes/composition-entry.schema.yaml moves INTO scope for exactly ONE additive
  change per Brad's OQ-1 ruling's small-schema-extension mandate: the optional `composition`
  property prescribed in §14.1. Everything else about the file stays out of scope. This does NOT
  reopen ratified OQ-4 (no sum-note/ledger field; the "<fraction> of the mixture" source form stays
  byte-stable); the new property carries NO sum note.

## 4. Acceptance criteria (AMENDED l2t1635 per Brad's OQ-1 ruling — this restatement SUPERSEDES the
##    original verified-by text and is pasted verbatim into the task block at dispatch)
> RED-first vitest: 110% draft -> ONE clarification, reason code composition-fraction-sum, with the
> three candidate readings per Brad's OQ-1 ruling (whole-mixture re-base, preceding-noun in-house-
> recipe presented first when a recipe-shaped store reading exists, explicit on-top), each carrying
> computed final fractions; GOLDEN-A pins Trypsin-EDTA 50 / DMEM 45 / FBS 5 flat (preceding-noun
> attachment; the medium's declared composition 90:10 DMEM:FBS lands as nested composition-entry
> data at the record layer via the composition-entry `composition` extension or its
> defined_composition material-spec; flat view byte-stable per OQ-4); the "bring to 10% final"
> golden re-bases to 45/45/10; the "on top" golden keeps 50/50/10 as fractions-of-mixture with the
> sum note; cells never counted in the sum; absent config file -> feature LOUD-off (console.warn
> naming the path), never silent; composition-entry schema extension is ONE optional `composition`
> property ($ref "#", additive — all existing payloads validate unchanged, registry dependency pin
> unchanged); no reagent nouns outside fixtures/goldens. Golden suite + realization pins updated,
> not pinned around. npm run test:run -w server + typecheck at baseline. Compiler-path task: no
> browser gate in scope (panel rendering of the clarification rides MATRES-PANEL).

> RATIFIED LIMITATION (adversarial review l2t1855 D4, orchestrator ruling; text folded from
> fix-run-2 report l2t2110): the sum check applies only to a FULLY declared composition — an
> entry with no declared fraction string is out of scope, because the goal is "a composition
> whose DECLARED fractions do not sum to the declared convention total"; a partially-declared
> composition therefore skips the check entirely (it has no declared-fraction sum to break),
> and this is not an oversight to widen.

RESOLVED (was a tension; now settled by Brad's ruling): "45/45/10 re-base golden" refers to
GOLDEN-B ("bring to 10% final" whole-mixture supplement with an explicit final-volume phrase — the
ONE-SIDED-EVIDENCE arm that re-bases to 45/45/10), NOT GOLDEN-A. GOLDEN-A pins the blessed
50/45/5 preceding-noun flat derived view.

## 5. The convention file (deliverable (a)) — shape guidance
config/drafting/composition-fraction-convention.yaml, mirroring the cues file's header discipline verbatim
(loaded per call, never process-cached; absent file/section => the check is OFF — LOUD, one console.warn naming
the path; present-but-malformed => throws naming the path; injection option on NormalizeOptions like
mixtureCuesPath :429). Sections (all thresholds/patterns/phrases DATA, zero literals in TS):
- `basis: percent-of-final-volume` + `total: 100` (+ optional `tolerance`) — the sum policy (OQ-2).
- `excludeRoles: [cells]` — count components never join the sum (the role name rides data, matching the enum
  in composition-entry.schema.yaml:15-22 — do not duplicate the enum in TS).
- `fractionPatterns` — DATA regexes to parse "50%", "50 %", "50" into numbers (declare the malformed-fraction
  behavior in-file: a fraction string that parses to no number is excluded from the sum and named, never guessed).
- `attachmentEvidence` — firesOn-idiom utterance-shape data: `supplementConnectors` (e.g. " + ", " with ",
  " plus " — cue-token style), `finalVolumePhrases` (e.g. "bring to ... final", "to a final of"),
  `onTopPhrases` (e.g. "on top", "v/v on top"), adjacency patterns reusing the cues file's ratioPatterns idiom.
- `convention` — the re-base/on-top resolution per OQ-1's ruling, as DATA (which parse is the
  default when the evidence is one-sided; the ambiguous case ALWAYS clarifies, never resolves by
  default). AMENDED l2t1635: this section gains the parse-precedence data and the
  `recipeShapedReadingEvidence` section — exact prescription in §14.3.

## 6. Reviewer bait (anticipating the adversarial review — pre-empt each)
1. exactOptionalPropertyTypes (CLAUDE.md rule 6; ProducerClarification precedent :410-417): any new optional
   field (readings, message) is built by conditional spread — NEVER `field: undefined`. Golden tests assert key
   ABSENCE via Object.keys, never toEqual-with-undefined (goldenIntentToClarification.test.ts:29-38).
2. YAML-reload trap: tsx --watch does NOT reload YAML (task-list env facts). The convention file is loaded PER
   CALL so tests never need a restart; but if any schema YAML changes (§3 B) the lane stack needs a restart —
   and `cl-lane-stack.sh 2 restart` is BLOCKING (600s-timeout pitfall recorded on this lane) — restart with
   background=true.
3. YAML-reload trap 2 / MANIFEST re-hash: goldens/MANIFEST.yaml re-hashes EVERY pinned file — touching a rule
   file without re-blessing fails LOUD, and re-blessing must happen EXACTLY ONCE, in the same commit, with the
   before/after hash diff in the report (manifest header + COMP4-REBLESS/OPTIONBIND-1 precedents).
4. Hardcode boundary (CLAUDE.md "The Hard Boundary", rule 2): zero fraction literals ("50", "10", "100"),
   reagent nouns ("FBS", "DMEM"), connector phrases ("on top", "final", "with"), or the words
   "of the mixture" beyond the existing :385 site in TypeScript. Everything above lives in the convention YAML.
   The reason code string follows the existing TS `as const` precedent (:376/:390/:403) because the channel
   union is a TS contract — that is registration, not policy.
5. The existing blessed fixture goldens/fixtures/unresolvable-mixture-component.yaml carries
   fractions "50%"/"50%"/"10%" (:45-47) — a real 110% — with its blessed record pinned in MANIFEST
   (fixture sha256 245603..., records list). The new clarification SHOULD fire there too (that is the feature);
   the blessed record + any affected reason-set pins (shorthandChat.e2eStubHonesty.test.ts:306-315,
   compositionDecomposition.test.ts) are DELIBERATE updates with the diff in the handoff — rubber-stamping the
   old pin around the new behavior is the classic failure; so is scope-creeping the check to avoid the fixture.
6. Cells exclusion: a fixture with cells carrying a stray fraction must keep cells OUT of the sum
   (excludeRoles data), and a composition whose non-cell fractions sum to 100 with a fraction-carrying cells
   entry must NOT clarify.
7. One clarification, not one per component (task (b) verbatim) — assert `toHaveLength(1)` on a 3-component
   110% case; and the clarification must name BOTH readings with their COMPUTED final fractions (no hardcoded
   reading strings in TS — they are computed from the DATA convention entries).
8. The ambiguous case is NOT resolved by confidence (task (c) verbatim): do not sort, rank, or pick a reading;
   the clarification carries both. A reviewer will grep for confidence in the new path — keep it out
   (candidateFact is the wrong vehicle, OQ-3).
9. SimpleVerbs two call sites: :70 AND :484 both consume compositionSnapshotFromParams — a convention applied
   inside the helper covers both; applying it at only one call site is the sneaky partial fix.
10. Absent-file LOUD-off: the off-state must be ONE console.warn naming the path (warnCueBarOff precedent
    :97/:267), with the check OFF (compile proceeds, fractions pass through unchanged) — tests inject the path
    via a NormalizeOptions option (mixtureCuesPath precedent :429), asserting both the warn and the pass-through.

## 7. Goldens (deliverable (d)) — three utterances, file pattern named
Pattern mirrored EXACTLY: SPINE-6 manifest goldens — fixture YAML
(server/src/compiler/scientistIntent/goldens/fixtures/, shape of
unresolvable-mixture-component.yaml: name / request.protocolText + answers / store.records / modelOutput with
the canned intent YAML), MANIFEST.yaml fixtures+records entries with sha256, replay through
replayKernel.ts runGolden inside goldenIntentToClarification.test.ts (bar legs) / goldenIntentToGraph.test.ts
(compiled legs). Utterance text drives the prompt record; the composition entries + fractions are canned
modelOutput (goldens control the model, everything downstream runs REAL — goldenIntentToClarification.test.ts:1-15).
1. GOLDEN-A canonical: utterance "50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL" (Brad's live
   defect phrasing, task description :11022-11023); canned composition fractions as the model emits today
   (50/50/10 + cells count). Expected snapshot fractions = **the OQ-1 ruling's numbers** — fixture blocked on
   Brad; do not dispatch this golden's expected record before the ruling.
2. GOLDEN-B unambiguous final-volume: "bring to 10% final" phrasing (task (d)) — e.g. 50/50 X/Y, bring to 10%
   Z final. Expected: Z at 10 percent-of-final INSIDE the 100, bases re-based (single legal parse — check
   ambiguity evidence says NO clarification on this shape... or YES re-base per data — the convention file's
   finalVolumePhrases arm decides; expected snapshot per the ruling's arithmetic).
3. GOLDEN-C explicit on-top: "add 10% v/v on top" phrasing (task (d)) — verified-by: KEEPS 50/50/10 as
   fractions-of-mixture with the sum note (note placement = OQ-4).
Companion test file (not a manifest golden): server/src/compiler/scientistIntent/compositionFractions.test.ts —
RED-first unit/lane tests for the 110% clarification shape, cells exclusion, LOUD-off, malformed fractions,
one-clarification-not-N. Realization pins: if realizeScientistIntent/realizationGolden.test.ts outputs move
(the realization path reuses the same expander), update deliberately with diff.

## 8. OQ section — stances for the orchestrator to rule (dispatch gate on OQ-1)
### OQ-1 (HUMAN RULING — MUST EXIST BEFORE DISPATCH; the task forbids a worker picking)
Brad stated the expected final mix for the canonical utterance as 50/45/5; the task names re-base (45/45/10)
and on-top (50/50/10) as the two candidate readings. The arithmetic locates 50/45/5 exactly: it is the
PRECEDING-NOUN ATTACHMENT parse — "DMEM + 10% FBS" read as a complete medium, the 50 parts of DMEM becoming
45 DMEM + 5 FBS, the trypsin half untouched at 50 (50+45+5 = 100). It matches NEITHER enumerated reading:
re-base puts FBS at 10 (not 5); on-top keeps 50/50/10-of-110 (final-volume ≈ 45.45/45.45/9.09). COMPOSER
VERDICT: 50/45/5 is not a third arithmetic option — it is evidence Brad reads the attachment as
preceding-noun by default, which means (i) the convention's DEFAULT parse may be preceding-attachment, and
(ii) the clarification may need THREE candidate readings (whole-mixture supplement / preceding-noun / explicit
on-top), not the two the verified-by sentence names. What Brad's 50/45/5 implies for the convention is HIS
call; a worker (or this composer) picking it violates the task text. RULING NEEDED before GOLDEN-A's expected
record can exist. Verified-by's "45/45/10 re-base golden" phrasing is then either kept as a second reading's
golden or restated per the ruling — orchestrator restates at promotion.
### OQ-2 Where the sum check physically lives — EXPRESSIBILITY VERDICT: lint YAML cannot.
Three independent reasons in §2 (no cross-entry arithmetic; fraction is a string needing a DATA parse pattern;
lint findings are a different channel from clarifications). Stance: smallest generic code location =
server/src/compiler/scientistIntent/compositionFractions.ts (NEW, generic interpreter, zero domain knowledge),
called from normalizeScientistIntent.ts beside the cue bar (:810 site), thresholds/totals/exclusions/patterns
ALL in config/drafting/composition-fraction-convention.yaml. Precedent: MATRES-CHAIN OQ-2 ruled (b) with the
identical shape (handoff 2026-10-21_1300); a generic lint DSL sum predicate remains a proposed follow-up
capability item. If the orchestrator instead wants a lint YAML rule, say so and the spec must ALSO build a DSL
sum+parse predicate — the composer's honest position is that is a capability item, not a MIXFRAC smuggling run.
### OQ-3 How the attachment ambiguity rides the clarification channel — stance: the cues-file firesOn idiom +
ProducerClarification, NOT candidateFact. Cite both surfaces: cues firesOn idiom
(config/drafting/mixture-material-cues.yaml:22-42, interpreter normalizeScientistIntent.ts:264+ — utterance-shape
evidence as DATA, no confidence anywhere) vs candidateFact (resolutionEngine.ts:101-123 —
{label, confidence, ref?}, ranked STORE-BACKED candidates from noun-resolution tiering, consumed by the panel as
"which record is this noun"). The two fraction readings are COMPUTED parses, not records: there is nothing to
rank, and the task verbatim says the panel asks "which parse" and it is "NOT decided by confidence" —
candidateFact's confidence field is the wrong shape and its ride (resolutionGatedClarifications, normalize:440-446)
is the resolve-vs-mint arm this must not contaminate. Smallest ride: `readings?: Array<{id, label,
finalFractions, note?}>` on ProducerClarification (conditional spread), values computed from the convention DATA;
panel rendering stays MATRES-PANEL's. Worker verifies the verbatim 422 ride (§2 IntentCompileFromPromptHandlers
:468-481) with a capture test BEFORE proposing any wire-schema change (§3 B).
### OQ-4 Sum-note placement for GOLDEN-C (smaller, defaultable): "keeps 50/50/10 as fractions-of-mixture with
the sum note" — the "<fraction> of the mixture" source-string FORM is consumed verbatim by the app
(app/src/graph/lib/eventGraph.ts:315, wellStateProjection.test.ts:24-27) and composition-entry.schema.yaml is
additionalProperties:false (:8). Default stance: the note rides the clarification/reading data + the golden's
expected output, NOT a new ledger field (no schema change, no app breakage). If Brad wants it ON the ledger
line, that is a composition-entry.schema.yaml amendment + pin updates — orchestrator rules at promotion.

## 9. First targeted check (proves the approach early)
RED probe, before any design is final: add compositionFractions.test.ts leg asserting the canonical
50/50/10 composition (compositionDecomposition.test.ts:44-53 shape) yields a clarification with reason
'composition-fraction-sum'. At trunk it must FAIL with zero clarifications — proving the defect and the test
harness in one command:
  cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/compiler/scientistIntent/compositionFractions.test.ts
Expected at base: the RED leg fails (no clarifications emitted); existing
`npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts` stays green (characterization).

## 10. Verification (complete, with expected output)
- Targeted: `npx vitest run src/compiler/scientistIntent/ src/compiler/biology/ src/ai/shorthandChat.e2eStubHonesty.test.ts`
  — zero failures; every deliberate pin update listed in the report with before/after.
- Full suite: `npm run test:run -w server` (from repo root) — failing-FILE set identical to the trunk baseline
  (RECV merge proof: "full-suite 88=88 comm-empty", handoff 2026-10-21_1300 / MATRES-RECV report; regenerate
  the baseline list from the dispatch-time trunk tip per the .hermes/evidence/*/base-server-failfiles.txt
  pattern and comm against it — zero NEW failing files).
- Typecheck: `npm run typecheck -w server` — expected EXIT 0, zero new errors (RECV merged at typecheck 0).
- Goldens: the manifest hash check runs inside the golden suite — a blessed-file change without a re-bless
  fails LOUD; re-bless exactly ONCE in the same commit.
- No browser gate (compiler task, task verbatim). No UI receipt.

## 11. Worker contract
- Worktree/branch: off trunk cl/integration-2 (tip >= 6f8fb519 — RECV is merged; do NOT branch off 46c3e4e9 or
  older). Branch pattern `cl/MIXFRAC-1-lane2-<tag>`; worktree `/mnt/vast/home/brad/git/wt/MIXFRAC-1-lane2-<tag>`.
  All git commands with `-c core.fileMode=false` (NFS mode-bit noise).
- Fleet lock: exactly one cl-coder; the RECV fix-run (pid 761964) is GONE and RECV is MERGED (6f8fb519) —
  lock is free as of the l2t1210 handoff + this composer's check; re-verify at dispatch.
- Unique deliverables: report `.hermes/plans/MIXFRAC-1-report.wip-<tag>.md` (promote
  -> `.hermes/plans/MIXFRAC-1-report.md`); spec path at dispatch replaces `<ts>` under .hermes/plans/ per the
  task block; log `lanes/2/logs/coder-MIXFRAC1-<tag>.log`.
- RED-first mandatory (CLAUDE.md rule 5); the OQ-1 ruling (GOLDEN-A expected fractions) and OQ-4 default must be
  IN the dispatched spec text — a worker that picks fractions fails review by construction.
- Report must contain: file:line merge-time re-verification of §2 cites (trunk may move), pin-update diffs,
  MANIFEST before/after hashes, the 422 capture proof, and the grep-clean proof for §6 bait 4
  (no fraction/reagent/phrase literals in the new TS).

## 12. Sequencing / collision note
- Deps: none. RECV just merged (6f8fb519); its delivered file set (composer three-dot diff of
  wt/matres-recv-lane2: 28 files — receiving/**, drafts/**, submitSuggestionTool*, AgentOrchestrator.ts,
  config/drafting/adapters.yaml, schema/lab/*) has ZERO overlap with MIXFRAC-1's owned/added set
  (simpleVerbs.ts, normalizeScientistIntent.ts, goldens/**, config/drafting/mixture-material-cues.yaml NOT
  touched — adapters.yaml is a different file in the same directory).
- Queue collisions (task-list files clauses): ELIG = compiler/resolution/**, resolve/**, vocabulary — no
  overlap with MIXFRAC-1. FULFIL = plate-event.add-material schema + "server accept/derivation paths" —
  AddMaterialSupport territory, not simpleVerbs; low risk, coordinate if both claim composition accept paths.
  PANEL = "server clarification fact shape" — REAL two-file overlap risk with MIXFRAC-1's normalize/
  ProducerClarification touch (§3 A); recommend ordering PANEL after MIXFRAC-1 (or a shape note between them);
  CHAIN = chain-draft/accept paths + review wall — no overlap; MIXROLE-1 deps ON MIXFRAC-1 and also names the
  simpleVerbs composition path — sequenced behind by dependency, fine.
- Owning simpleVerbs.ts collides with NO in-flight work: the only live coder at the l2t1210 handoff was the
  RECV fix-run, whose three-dot file set excludes simpleVerbs.ts, and it has since merged.

## 13. Open questions the composer could NOT resolve locally
(All in §8; restated for the orchestrator: OQ-1 Brad's fractions ruling [dispatch gate], OQ-3/OQ-2 stances
above need ratification at promotion, OQ-4 sum-note placement default.)

## 14. NESTED-COMPOSITION AMENDMENT (l2t1635, from the l2t1550 amendment composer; every load-bearing
##     claim below re-verified FIRST-HAND by the orchestrator at trunk ff319585 / code tip 6f8fb519)

### 14.1 THE ONE schema change (exact prescription — nothing more)
Audit facts (orch-verified): `schema/core/datatypes/composition-entry.schema.yaml` (40 lines) is
`additionalProperties: false` (:8), `required: [component_ref, role]` (:9), props `component_ref`
($ref ./ref.schema.yaml), `role` enum (:13-22), `concentration` (:23-24), `concentration_range`
(:25-38), `source: string` (:39-40) — NO sub-composition field. That is the expressibility gap
Brad's ruling names. In the file, append under `properties:` (sibling of `source`):

    composition:
      type: array
      minItems: 1
      items:
        $ref: "#"

EXACTLY this and NOTHING else: `$ref: "#"` (root self-ref — each item IS a composition-entry), NOT
`./composition-entry.schema.yaml`, and NO `recipe_ref` property — pointing at an in-house material
is already expressible via the existing `component_ref` (ref.schema.yaml record refs), so a second
ref field would be redundant vocabulary (rule 7). Recursion legality (orch-verified in source, do
not re-litigate at review): SchemaRegistry treats a ref starting `#` as local and skips it for the
graph (isLocalRef :65-66, skip :139-141) and never adds a self-ref dependency (:151-152); Ajv is
draft 2020-12 (`AjvValidator.ts:18` Ajv2020, `strict: true` :28) — a self-resource `$ref: "#"` is
core 2020-12 semantics and compiles. The dependency pin `SchemaRegistry.test.ts:233-237`
(`toEqual([ref.schema, concentration.schema])`) stays GREEN — the `#` ref is skipped. The
`SchemaRegistry.test.ts:209-237` / `BiologicalTypesSchema.test.ts:25` /
`ProcurementSchemaContracts.test.ts:28` pins, and consumers vendor-product.schema.yaml:55,
recipe.schema.yaml:71-74/:117-120, material-spec.schema.yaml:80-83, plate-event.add-material:114-118
(ALL orch-verified) validate old payloads unchanged. FIRST targeted check for the extension leg:
`npx vitest run src/schema/SchemaRegistry.test.ts src/schema/BiologicalTypesSchema.test.ts
src/schema/ProcurementSchemaContracts.test.ts` green with the dependency pin unchanged.

The in-house medium record itself = **material-spec (MSP-*), formulation_kind: defined_composition**
(enum member material-spec.schema.yaml:34, orch-verified), `formulation.composition` (:80-83)
carrying the 90:10 entries — expressible TODAY. A recipe (RCP-*) requires `input_roles`+`steps`
(recipe.schema.yaml:13, orch-verified) and is the WRONG target for a bare formulation; do not force one.

### 14.2 Where the nested form lands / does NOT land (coder must not fumble this)
- LANDS IN: the clarification `readings` data (reading 2 carries nested shape + flat view); the
  goldens' expected RECORD layer (the medium's material-spec `formulation.composition` 90:10, and
  optionally ONE inline `composition` on GOLDEN-A's medium snapshot entry — blessed numbers
  identical either way; coder chooses ONE encoding, flat view must be present and correct regardless).
- DOES NOT LAND IN: the shorthand WIRE slot scientist-intent.schema.yaml composition items
  (:182-215, additionalProperties:false — the model emits flat entries; no wire change; §3 B
  ratified ride unchanged); and NOT as an unconditional new field on event snapshot entries —
  `compositionSnapshotFromParams` (simpleVerbs.ts:357-408, orch-verified emission :381-386) keeps
  emitting exactly `{component_ref, role, concentration?, source?}`; the snapshot/app form stays
  the FLAT 50/45/5 derived view with byte-stable OQ-4 source strings. If the inline nested medium
  entry appears on the GOLDEN-A snapshot at all, the ONLY path permitted to introduce it is the
  answer-driven declared-parse path applying the ruling.
- GOLDEN-A legs: BAR leg = clarification, reason `composition-fraction-sum`, ONE clarification,
  THREE readings, preceding-noun-recipe presented FIRST, each reading carrying computed final
  fractions. RECORD leg (request.answer selects the in-house-recipe reading; fixtures support
  `answers`, §7) = expected composition_snapshot FLAT entries with ratified source strings:
  Trypsin-EDTA `source: "50% of the mixture"`, DMEM `"45% of the mixture"`, FBS
  `"5% of the mixture"`; cells entry unchanged (roles are MIXROLE-1's ground — pin roles as the
  current pipeline emits).
- GOLDEN-B / GOLDEN-C wording confirmed unchanged by the ruling (B = one-sided finalVolumePhrases
  arm re-based 45/45/10; C = explicit-on-top 50/50/10 + sum note, reading 3 of three).

### 14.3 Convention-file additions (all DATA, zero reagent literals)
- `convention:` gains: `defaultParse: preceding-noun` + `defaultParseCondition:
  recipeShapedReadingExists` + `onGenuineAmbiguity: clarify` + `readings:
  [whole-mixture-supplement, preceding-noun-recipe, explicit-on-top]` (ordered presentation;
  the condition name is a KEY the TS evaluator interprets generically against the store).
- NEW `recipeShapedReadingEvidence:` section, firesOn idiom per mixture-material-cues.yaml
  precedent (per-cue firesOn :33-42, ratioPatterns/adjacency :44-62, zero-literals header
  :30-32, exempt-name-matching idiom :64-93): `storeKinds: [material-spec]` +
  `formulationKinds: [defined_composition]` (+ recipes carrying a composition, optional), a
  `phraseMatch` rule reusing the cues whole-word-containment idiom for the component-name phrase
  on the LEFT flank of the supplement connector, `ratioPatterns` reuse. "Recipe-shaped reading
  exists" = a formulation-shaped STORE record whose name matches the preceding-noun phrase AND
  that record declares its own composition — the record IS the datum; no reagent word is ever
  written in the file. Genuine ambiguity = evidence does NOT single out one recipe-shaped record
  -> clarify with all three readings; the default label is presentational only; resolution stays
  with the scientist, never by confidence (a reviewer WILL grep for confidence in the new path).

### 14.4 Reviewer-bait additions (extend §6)
(i) Any reagent noun (DMEM/FBS/Trypsin/HepG2) in the convention YAML or TS is an instant fail —
record match must be phrase-vs-store exactly like the cues `exempt:` arm. (ii) The `readings`
enumeration is THREE; any surviving "both candidate readings" phrasing in code comments/tests is
stale. (iii) The schema touch is ONE optional property with `$ref: "#"` — a coder who writes
`$ref: "./composition-entry.schema.yaml"` or adds `recipe_ref` has exceeded the ruling. (iv) It IS
a schema YAML change: §6 bait 2's background=true stack-restart note APPLIES.

### 14.5 Collision re-check (composer-run, orch-endorsed)
`git -c core.fileMode=false log --oneline -- schema/core/datatypes/composition-entry.schema.yaml`
= exactly TWO commits ever (0b44a15b, e79406f1; orch re-ran at HEAD — confirmed). ELIG owns
compiler/resolution + resolve + vocabulary — disjoint. FULFIL CONSUMES composition-entry via
plate-event.add-material but does not own the datatype; an optional additive property cannot break
FULFIL payloads. MIXROLE-1 (`deps: MIXFRAC-1`) may later touch the same file's role ENUM —
disjoint property, sequenced behind by dependency. Collision-safe as the next coder once the
fleet lock frees.

### 14.6 Amendment composer open questions — orch rulings at promotion (l2t1635)
1. Silent-resolve vs still-clarify on exact recipe-record match: RULED still-clarify (per the
   ruling's own "should ask WHICH PARSE" + ambiguity-is-a-clarification doctrine; §0 lever closed).
2. Inline nested form on GOLDEN-A snapshot vs record-layer only: RULED flat-view-always + coder
   chooses ONE encoding of the nested form (§14.2).
3. Vendor_product_ref record for purchased Trypsin-EDTA in GOLDEN-A's fixture: RULED fixture-
   optional garnish, NOT required (task clauses never name vendor records; component_ref already
   supports it). No MANIFEST garnish required.
