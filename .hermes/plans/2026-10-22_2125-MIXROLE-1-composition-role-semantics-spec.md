# MIXROLE-1 EXECUTION SPEC (REVISED per BRAD ruling 2026-10-22T09:05) — Composition role semantics: tryptic/enzymatic dissociation reagents are not 'solvent' — role assignment as data; Branch A ships as the temporary bridge, zero enum change anywhere

## 0. RULING RECORD + PROMOTION PLACEHOLDERS

**BRAD (c) RULING — RECORDED, BINDING, DISPATCH-GATE SATISFIED**
(decisions/MIXROLE1-role-axes-brad-ruling-20261022.md; card ANSWER line filled at
decisions/MIXROLE1-c-enum-ruling-request-l2t0530.md:44 — "(A), as a temporary compatibility
measure — not a permanent semantic solution"):

- **NO new enum member ANYWHERE.** `dissociation_reagent` is NOT added to the ledger enum
  (schema/core/datatypes/composition-entry.schema.yaml), the wire mirror
  (schema/workflow/scientist-intent.schema.yaml:197), the vendor-product mirror
  (schema/lab/vendor-product.schema.yaml), or recipe.schema.yaml. Branch A (guidance as data +
  honest `other`) ships as the temporary compatibility bridge.
- **The old draft's §5c Branch-B design sections are DEAD** — deleted from this revision; a
  worker must never see dead-branch work. The draft's EC 3.4.21.4 anchor placement was ruled
  WRONG: EC 3.4.21.4 identifies trypsin (the enzyme CONSTITUENT inside the Trypsin-EDTA
  formulation), not a use-word; constituent anchors are ROLE-AXES-1's home.
- **Goldens re-pin Trypsin-EDTA `role: other`**, identity + NESTED RECIPE preserved per the
  MIXFRAC-1 OQ-1 ruling (the medium stays a nested recipe component, 90:10 DMEM:FBS; flat
  45/45/5 is a derived view — the ruling quotes this at decisions/
  MIXROLE1-role-axes-brad-ruling-20261022.md:51-53).
- **OQ-B affordance SHAPE CHANGE (binding):** the role-gap affordance must NOT force-fit the
  enum. It captures the scientist's stated intended use as an ANNOTATION (feeding the future
  purpose axis), never infers purpose itself — adding Trypsin-EDTA to a cell suspension does not
  prove dissociation intent. Where the annotation rides is decided in §5b against the audited
  clarification/answer machinery.
- **OQ-C answered NO by construction:** nothing joins vendor-product.schema.yaml; nothing joins
  recipe.schema.yaml either.
- Binding principle for the report header, quoted verbatim: **"materials have identities and
  properties; their roles are contextual, and their purposes are experimental."**

**Three-axis pointer (one sentence, no design work here):** the separation of material identity /
composition participation / experimental purpose — plus decoupling fraction/concentration
arithmetic from role labels — rides the SEPARATE follow-up task **ROLE-AXES-1** (task-list draft,
deps: MIXROLE-1, pending Brad's approval) and is OUT OF SCOPE for MIXROLE-1.
(De-risk fact from the ruling, cited not edited: fraction/concentration arithmetic must ride
formulation/amounts/units, never role labels — and it ALREADY branches on them today at
server/src/materials/formulationMath.ts:216-226 (`roleType === 'solvent'/'diluent'` → 'solvent',
:336-343 derives a solvent's concentration from volume ratios) and
server/src/materials/formulationCopilot.ts:71,173 (`solvent`/`diluent`/`matrix` → `qs_to_final`,
solvent picks the recipe name). That retirement is ROLE-AXES-1's work, NOT this item's.)

### ORCHESTRATOR PROMOTION PLACEHOLDERS (BINDING for the worker once filled)
- [x] OQ-A RATIFIED by orchestrator 2026-10-22T21:25 EDT: guidance home = material-system-rules.md
      :147-157 rules block, default stance adopted (example :141 re-pin + :149 fit-guidance
      sentence). Orchestrator re-verified the defect first-hand at tip 126cbfea: the example line
      literally teaches `role: solvent` on trypsin-EDTA.
- [x] Fleet-slot ruled 2026-10-22T21:25: MIXROLE-1 takes the coder slot IMMEDIATELY AFTER the
      MIXFRAC-1 merge, BEFORE CELLRATE-1 (l2t1855 restated order, newer binding — supersedes the
      draft's AFTER-CELLRATE recommendation). Order: MIXFRAC-1 -> MIXROLE-1 -> CELLRATE-1 ->
      FULFIL -> PANEL -> CHAIN.
- [x] Dispatch base tip = the MIXFRAC-1 MERGE COMMIT (stamped in the task block at dispatch;
      NEVER any pre-MIXFRAC-1 tip). §9's "dispatch base = CELLRATE-1 merge commit" line is
      SUPERSEDED by this ruling (see §9 as amended).

Draft revision: l2t1155 composer (cl-spec-composer), 2026-10-22 11:55 EDT — full rewrite of
2026-10-22_0405-MIXROLE-1-composition-role-semantics-spec-DRAFT.l2t0355.md per the ruling (the
old draft stays untouched as the pre-ruling record). Trunk at revision: cl/integration-2 @
14d26cf6 (docs tip; code tip = 66cb7915 REVISE-GHOST-1 merge). ALL file:line cites below were
re-read by the composer FIRST-HAND in the trunk working tree
(/mnt/vast/home/brad/git/cl-integration-2) at that tip; no scout output is cited as authority.
Live defect intake: Brad dogfood, same canonical HepG2/DMEM/Trypsin-EDTA draft as MIXFRAC-1 and
CELLRATE-1.

## 1. Goal
Make composition-entry role assignment honest at the emission channel — declaration-guided
("closest declared enum role, else `other`, never a role whose biology contradicts the component")
with zero TS role-literal branches — state the honest lint verdict (there is NO structural check;
§5b), ship the role-gap clarification as an ANNOTATION affordance that captures the scientist's
intended use without force-fitting the enum and without ever inferring purpose, and re-pin the
canonical goldens' Trypsin-EDTA role to `other` per Brad's ruling. Zero schema change.

## 2. Verified root facts (composer-verified first-hand at 14d26cf6 / code tip 66cb7915)
1. THE LEDGER ENUM — NOT TOUCHED, STAYS 7-MEMBER.
   `schema/core/datatypes/composition-entry.schema.yaml` (40 lines): `additionalProperties:
   false` (:8), `required: [component_ref, role]` (:9), role enum :15-22 = solute, solvent,
   buffer_component, additive, activity_source, cells, other — NO descriptions constraining role
   choice; `source: string` (:39-40). No enzymatic/dissociation member; per the ruling none is
   added. sha256 782a57e806f99eb2… (verified this revision). This file is NOT in the goldens
   MANIFEST treeState pin (§2.6).
2. THE WIRE MIRROR — NOT TOUCHED. `schema/workflow/scientist-intent.schema.yaml` composition item
   (:183-215, `additionalProperties: false` :188 + `unevaluatedProperties: false` :189): `role`
   enum :197 byte-mirrors the ledger enum (7 members, re-read this revision). The wire item's
   strict posture means a free-text purpose has NO home inside a composition entry — decisive for
   the §5b annotation-riding decision. This file IS MANIFEST-pinned (treeState sha256
   5327495e9c70… — MANIFEST.yaml:33).
3. THE ROLE SEMANTICS CONSUMERS (the task's why-block, re-verified):
   - Base-volume reads: `server/src/materials/formulationMath.ts:336-343` — an entry with NO
     concentration and `role === 'solvent'` gets its concentration DERIVED from volume ratios (the
     qs-to-final fill); `server/src/materials/formulationCopilot.ts:71` maps
     solvent/diluent/matrix → `qs_to_final`. Trypsin-as-solvent would literally be reasoned about
     as "what fills to volume" — the fraction-logic poison the task names. (The role-label
     arithmetic itself is ROLE-AXES-1's retirement target — cited here, NOT edited, §0 pointer.)
   - Primary-concentration reads: `server/src/materials/vendorComposition.ts:18` prefers
     ['solute','activity_source','cells','other'] — a wrong `solvent` steers which concentration
     is read as primary.
   - Fulfillment/event layer: `schema/workflow/events/plate-event.add-material.schema.yaml:104-106`
     carries a DIFFERENT, free-string event-level role vocabulary ("cells, treatment, vehicle,
     additive, or control") — the material's semantic role in the TARGET context, not the entry's
     role in the mixture; two vocabularies for two entities. Do not confuse them; do not merge
     them; "vehicle" is not a dissociation role.
   - TS mirrors of the ledger enum (parse/labeling, registration sites not policy):
     `server/src/materials/composition.ts:13-19` (CompositionRole union),
     `server/src/ai/materialRefLabels.ts:133-142` (union + Set),
     `server/src/ingestion/adapters/vendorFormulationHtml.ts:5`,
     `server/src/materials/formulationMath.ts:216-226` (roleType→role mapping ladder, falls to
     'other'). NONE of these widen under this ruling.
4. THE EMISSION/PROMPT CHANNEL — where role guidance rides TODAY (verified):
   a. `server/prompts/material-system-rules.md` :126-157 ("Mixtures: name the components, never a
      blob"). THE DEFECT IS TAUGHT HERE: :141 is literally
      `- { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }`.
      The role-menu rule is :149 (`role` is one of `solute | solvent | …`). :151-153 is the
      `count = density x volume` rule — OWNED BY CELLRATE-1 (§3). Rides the emission path via
      `server/src/ai/systemPrompt.ts:485` (`loadPromptTemplate('prompts/material-system-rules.md')`),
      prepended at :491; reached for drafting surfaces through `buildSurfaceAwarePrompt`
      (systemPrompt.ts:418, delegates to buildSystemPrompt at :428) called at
      AgentOrchestrator.ts:1177 and :1544 (line numbers MOVED with the REVISE-GHOST-1 merge —
      re-verified this revision; the draft's :1175/:1518 are stale). Loaded PER PROMPT-BUILD but
      CACHED after first read (`promptCache` Map, systemPrompt.ts:11-24) — same hot-reload trap
      class as YAML (§6 bait 2). Prompt DATA, not TS — this is the declaration home.
   b. `server/src/ai/AgentOrchestrator.ts` FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND (:604, pushed
      at the ONE site :1214 — re-verified; draft's :603/:1212 stale post-merge) already carries a
      mixture bullet as a TS string constant — guidance belongs in the prompt file, NOT here.
   c. `server/src/ai/submitSuggestionTool.ts:46` builds SHORTHAND_CONTRACT_BLOCK from
      `defaultScientistIntentVocabulary().contractBlock()` — GENERATED from the vocabulary YAML,
      but the vocabulary's `composition` arg (scientist-intent-vocabulary.yaml:40, :249) has NO
      entry-item guidance slot: the meta-schema's args items carry fixed properties only
      (scientist-intent-vocabulary.schema.yaml:66-69, `additionalProperties: false` at :69) — the
      same wall CELLRATE-1 hit. Dead end, re-confirmed; do not reopen.
      submitSuggestionTool.ts:163 carries a role description string ("Composition role, e.g.
      cells, buffer_component, …") on the LEGACY event_graph `materials[]` path — under this
      ruling it is NOT touched at all (it was a Branch-B-only edit; Branch B is dead).
   d. The compiler passthrough needs NO change: `compositionSnapshotFromParams`
      (server/src/compiler/biology/verbs/simpleVerbs.ts, fn :357, call sites :70/:484) passes the
      role string through verbatim (:377: non-string/empty falls to 'other' — its own comment:
      "the role enum lives in composition-entry.schema.yaml, not a TS table"). The task clause
      "simpleVerbs composition path ONLY if declaration channel requires a passthrough": VERIFIED
      NOT REQUIRED — passthrough already exists and is role-agnostic. Hard no-touch (§3).
5. THE CLARIFICATION CHANNEL (MIXFRAC-1's pattern — follow, do not invent a second one):
   producer reason codes are TS `as const` + the `UnrealizedProducerReason` union
   (normalizeScientistIntent.ts — MIXTURE_BLOB_MATERIAL_REASON :403, union :405-408; MIXFRAC-1
   MERGE will add `composition-fraction-sum` to this same union — rebase, do not duplicate),
   `ProducerClarification {label, reason, actionLocation, message?}` (:412-417,
   exactOptionalPropertyTypes — conditional spread), carried on ScientistIntentNormalized.clarifications
   (:439); compileScientistIntent.ts folds producer clarifications into the bar (:297,
   outcome 'needs-clarification' :313); the route bars atomically as 422
   (IntentCompileFromPromptHandlers.ts:468-481 — the route mints nothing). THE ANSWER LEG (decisive
   for §5b, audited this revision): the scientist's clarification answers come back on the SAME
   route as `answers: Record<string, string>` and ride the recompile prompt as DATA —
   `composeAnsweredPrompt` (:149) appends a "SCIENTIST-RESOLVED CHOICES" block iterating the
   answers map (key = the clarification's own label, value = the scientist's words verbatim, zero
   interpretation in the handler — THREAD-ASK-1 doc :139-147); ANSWER-BIND-1 adds beside it a
   validated-idiom DATA channel (`answeredSlots`, handler :429/:440) that only carries
   `[[material:…]]` record picks, not free text. The cues-file declaration discipline is the
   template for the affordance's DATA: config/drafting/mixture-material-cues.yaml (zero-literals
   header :28-32, `cues:` :33, firesOn per cue :34-42) loaded per call
   (loadMixtureCues :264, called :810), absent-file LOUD off (warnCueBarOff :97).
   `NormalizeOptions` (:422-431: `vocabulary`, `mixtureCuesPath` injection) is the precedent for
   threading new data into normalize without a second channel.
6. GOLDEN/PIN COORDINATION (canonical-utterance fixture space; MANIFEST lives at
   `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`):
   - MANIFEST treeState pins exactly vocabulary.yaml (:25), the wire schema (:33), the compile
     pipeline (:34); fixtures + blessed records carry per-file sha256.
     material-system-rules.md is NOT MANIFEST-pinned (it is under the prompt-budget ratchet, §2.7).
   - `goldens/fixtures/unresolvable-mixture-component.yaml:45` pins `- { material:
     "trypsin-EDTA", role: solvent, fraction: "50%" }` (:46 DMEM buffer_component, :47 additive,
     :48 cells); MANIFEST fixture pin :51, record pin :106; the blessed record
     `goldens/__records__/unresolvable-mixture-component.golden.json` embeds `"role":"solvent"`
     for trypsin (re-verified — all four role strings present).
   - `server/src/compiler/scientistIntent/compositionDecomposition.test.ts:44-47` (the
     50/50/10 fixture, MIXFRAC-1 deliberately moves it) and :51-53 the expected-entry pins —
     trypsin `role: 'solvent'` at :51; :142 a characterization pin keyed on the literal
     `role: solvent, fraction: "50%"` string inside the MIXTURE constant — the re-pin MUST flow
     through that constant, not around it.
   - `server/src/compiler/scientistIntent/promptShapeParity.test.ts:126-138` — PROMPT1_DOC is
     Brad's canonical prompt verbatim, composition canned at :135 with trypsin `role: solvent`.
   - STATUS AT THIS TIP: MIXFRAC-1 has NOT merged (compositionFractions.ts absent at 14d26cf6;
     its lane branch cl/lane2-mixfrac1-l2t0310 is on resume-3). MIXFRAC-1's blessed spec §14.2
     RULED: "cells entry unchanged (roles are MIXROLE-1's ground — pin roles as the current
     pipeline emits)" — MIXFRAC-1 creates GOLDEN-A/B/C fixtures/records WITHOUT asserting our role
     outcome, and per its OQ-1 ruling the medium rides as the nested 90:10 DMEM:FBS recipe
     component. CELLRATE-1's spec §3 item 4 adds ONE further golden + one treeState re-bless.
     Every line number in this spec is at TODAY's tip — the worker RE-READS every cited file at
     the dispatch tip before editing (trunk will have moved twice).
7. PROMPT BUDGET RATCHET: `server/src/ai/promptBudget.test.ts:39` CORE_PROMPT_CEILING_CHARS =
   47_180 (provenance :30-35, measured 2026-10-06, material-rules counted at :105). Adding
   guidance consumes slack; over the ceiling the suite fails LOUD. Coder runs the budget test
   FIRST and measures actual headroom before writing prose (§8).
8. Lint DSL (for the §5b verdict, re-read posture): severities error/warning/info; membership
   predicates evaluate per-item and cannot see siblings; findings are lint violations, NOT the
   clarification fact (MIXFRAC-1 §2 reached the same conclusion for sums — same channel argument).

## 3. Files in scope
IN (owned by this item), collision-checked against the fleet (§9):
1. `server/prompts/material-system-rules.md` — THE declaration channel. Edit the mixture RULES
   only: the :149 role-menu rule gains the fit-guidance sentence (closest declared role; if none
   fits, honest `other` + the component's own name; never stretch a role whose biology
   contradicts the component), and the :141 example's Trypsin-EDTA role re-pinned to `other`
   (ruled). EXPLICITLY NOT :151-153 (`count = density x volume` — CELLRATE-1 owns that hunk;
   different hunks of one file, sequenced: this item branches AFTER the CELLRATE-1 merge, §9).
   Prompt-budget-ratchet compliant (§2.7, §6 bait 3).
2. `config/drafting/composition-role-guidance.yaml` — NEW. The affordance's DATA (§5b): gap role,
   firesOn arms, the answer question text, on/off. Cues-file discipline verbatim (loaded per
   call, absent-file LOUD off, malformed throws naming the path, zero literals in TS).
3. `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` + NEW sibling
   `server/src/compiler/scientistIntent/compositionRoles.ts` (+ .test.ts) — the role-gap
   annotation affordance: reason code `composition-role-gap` as TS `as const` joining
   `UnrealizedProducerReason` (:405-408, registration not policy, MIXFRAC-1 precedent for the
   union touch); the CHECK is a generic evaluator called from normalize beside the cue/fraction
   bars. (MIXFRAC-1 creates compositionFractions.ts at its merge; compositionRoles.ts is a
   distinct file; both hang next to the cue bar.)
4. The ANSWER-threading plumbing for annotation suppression (§5b step 4) — the MINIMAL additive
   thread through the EXISTING deps chain, each site a conditional-spread optional that is
   byte-identically absent today: `ScientistIntentCompileDeps` + `NormalizeOptions`
   (`answeredClarificationLabels?: string[]`), threaded at compileScientistIntent.ts:263 and
   built at IntentCompileFromPromptHandlers.ts from `Object.keys(answers)` (:412-441 region). NO
   new schema field, NO new channel, NO interpretation of answer VALUES (label-set membership
   only). NOTE: IntentCompileFromPromptHandlers.ts is NOT in any in-flight owned set (§9
   collision map) — the orchestrator re-confirms at dispatch.
5. Goldens + pins the role re-pin moves (byte-pin table §7):
   `goldens/fixtures/unresolvable-mixture-component.yaml` :45, `__records__/unresolvable-
   mixture-component.golden.json`, their MANIFEST sha256 entries (:51/:106 — re-bless EXACTLY
   ONCE, same commit, before/after hashes in the report); `compositionDecomposition.test.ts`
   :44-53 (+ the :142 substring pin via the MIXTURE constant); `promptShapeParity.test.ts`
   PROMPT1_DOC :135; GOLDEN-A/B/C fixtures+records AT THE MERGED TIP — role fields only (§5d).
   Identity + nested recipe are PRESERVED, not re-derived: only the trypsin entry's role field
   moves; the medium stays the nested 90:10 DMEM:FBS recipe component as MIXFRAC-1's merged
   fixtures bless it.

OUT (explicitly, with reason):
- **ALL FOUR ENUM HOMES: `schema/core/datatypes/composition-entry.schema.yaml`,
  `schema/workflow/scientist-intent.schema.yaml`, `schema/lab/vendor-product.schema.yaml`,
  `schema/lab/recipe.schema.yaml` (:38 keeps its own divergent role_type — diluent/matrix — that
  divergence is untouched history, not a template).** The ruling forbids a new member in any of
  them; zero MANIFEST treeState re-bless comes from this item.
- `server/src/compiler/biology/verbs/simpleVerbs.ts` — passthrough exists and is role-agnostic
  (§2.4d); any "fix" here would be a TS role branch waiting to happen. Hard no.
- `server/src/ai/AgentOrchestrator.ts`, `server/src/ai/shorthandChat.ts`,
  `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — the REVISE-GHOST-1 surface (merged, but
  its browser gate is LIVE — attempt 3 tier-2 at trunk fb154093 per handoff 2026-10-22_0820; do
  not perturb the gated code while the gate re-verifies served modules). Hard no.
- `server/src/ai/submitSuggestionTool.ts` — legacy-path role description string is a Branch-B
  touch and Branch B is dead. Hard no.
- `schema/scientist-intent/scientist-intent-vocabulary.{yaml,schema.yaml,lint.yaml}` — no arg
  slot for per-entry guidance exists (§2.4c); vocabulary edits churn the MANIFEST pin for nothing.
- `material-system-rules.md` :151-153 (CELLRATE-1), GOLDEN-A/B/C fraction content (MIXFRAC-1),
  rate/count wire shapes (CELLRATE-1): role fields ONLY for MIXROLE-1 in shared files (§5d).
- `server/src/lint/**`, `schema/lint/**` — NO DSL work (MIXFRAC/CHAIN precedent; §5b verdict
  makes lint moot anyway).
- `schema/workflow/events/plate-event.add-material.schema.yaml`, `server/src/materials/**`
  (incl. formulationMath.ts / formulationCopilot.ts / vendorComposition.ts — the role-label
  arithmetic sites are the ROLE-AXES-1 de-risk fact, cited not edited), `server/src/fulfillment/**`
  — FULFIL owns the event layer; §2.3 shows the event role vocabulary is a different entity.
- `app/**` — panel rendering of the clarification rides MATRES-PANEL; no browser gate here (§4).
- Any persistence of the annotation as a declared record field (purpose/intended_use): the wire
  composition item is additionalProperties:false (§2.2) and the ledger entry too (§2.1); the
  purpose-axis home is ROLE-AXES-1. Hard out (§5b says this plainly).
- `/mnt/vast/home/brad/git/computable-lab/**` — Brad's live tree, forbidden.

## 4. Acceptance criteria — task `verified by` VERBATIM, then the dispatch-ready restatement
> Role-gap ruling recorded in spec header (Brad) BEFORE merge. RED-first tests: guidance-
> declaration present where the emission prompt is assembled (cite); golden for the same
> canonical utterance updated ONLY per the ruling (either 'other' or the new enum member —
> whichever the ruling says, byte-pinned); no TS role-literal branches introduced (grep-clean
> check in report). server tests + typecheck at baseline; no browser gate (compiler/prompt task).

Restatement for dispatch — the ruling HAS landed and says **`other`**; interpretations pinned so
no worker picks:
- "Ruling recorded in spec header": §0 records it; the worker quotes it verbatim in the report.
- "whichever the ruling says" = **`other`, always.** The new-enum branch no longer exists; any
  golden, schema, or TS edit that adds or references a dissociation/enzymatic role member is a
  review failure by construction.
- "where the emission prompt is assembled" = material-system-rules.md as composed at
  systemPrompt.ts:485-491; the RED test asserts the guidance sentence is present in the composed
  prompt for a drafting surface (cite the file + test), not a string search in TS.
- "updated ONLY per the ruling, byte-pinned" = the §7 pin table; ONLY the trypsin entry's role
  field changes in any golden (plus the DELIBERATE clarification-list growth §6 bait 7);
  DMEM/FBS/cells entries and the nested 90:10 medium recipe stay byte-identical to the
  post-MIXFRAC-1, post-CELLRATE-1 merged state.
- The ruling's shape change carried EXPLICITLY: the role-gap affordance asks for and captures the
  scientist's intended-use ANNOTATION (never a role pick-list against the enum) and the compiler
  NEVER infers purpose (§5b); a TS purpose-inference (any name/word pattern → purpose value) is a
  review failure.
- "no TS role-literal branches" = the §8 grep-clean gate; the ONLY permitted role-adjacent TS
  additions are the reason-code `as const` + union member and the §3 item-4 label-set plumbing
  (zero role literals, zero purpose values).
- "at baseline" = failing-FILE set identical to the dispatch-tip baseline (regenerate per the
  .hermes/evidence/*/base-server-failfiles.txt pattern) + `npm run typecheck -w server` zero new.
- verified-by carried EXPLICITLY: compiler/prompt task — NO browser gate; no UI receipt; no :5193
  obligation for this item.

## 5. Fix design
### 5a. (a) The declaration channel — guidance as data riding the prompt (UNCHANGED by the ruling; OQ-A ready for ratification)
One edit site: the RULES block of material-system-rules.md (:147-157). The :149 role-menu bullet
gains the fit rule, in the file's own voice, e.g.: "choose the CLOSEST declared role by its
meaning in this mixture; if no declared role fits, use `other` and keep the component's own name
— never stretch a role whose meaning contradicts the biology (an enzyme that detaches cells is
not a solvent)". The instruction's own example (:141) demonstrates the ruled outcome (`role:
other`) — guidance and exemplar must agree or the model copies the example, which is exactly how
it learned trypsin=solvent. NO vocabulary/meta-schema slot (dead end, §2.4c), NO
AgentOrchestrator bullet (gated surface + TS), NO submitSuggestionTool edit (legacy path, ruled
out). This IS the minimal data-riding declaration change: the file is loaded onto every drafting-
surface prompt (§2.4a). **OQ-A: composer recommends this home; ready for orchestrator
ratification in §0.**

### 5b. (b) Lint verdict (unchanged) + the affordance in its RULED annotation shape
Task-proposed check: "role=solvent on an entry that also has a cells sibling". Plainly stated:
that predicate is STRUCTURALLY expressible only awkwardly (per-item predicates can't see siblings)
but it is SEMANTICALLY WRONG: "a solvent entry beside a cells entry" is the CONFIGURATION OF
VIRTUALLY EVERY CORRECT CELL-CULTURE MEDIUM (DMEM is legitimately the solvent; cells legitimately
ride in it). A lint that fires there calls every correct recipe a violation — lint checks
structure; semantics go through clarifications/humans (repo rule; the task itself sets this
trap). The real defect — "trypsin is a protease, proteases are not solvents" — requires
biological knowledge no structural predicate can consult. VERDICT (put it in the report in these
words): no honest machine-check exists for role fit; the task's conditional lands on its second
branch: (a) + a clarification affordance.

The affordance, riding the EXISTING producer-clarification machinery (§2.5, MIXFRAC-1's pattern —
one channel, not two), in the RULED shape:
1. FIRES on the STRUCTURAL FINGERPRINT OF AN HONEST GAP, not a biology guess: an entry whose role
   equals the config's `gapRole` (default: other) AND the composition carries a `cells` sibling
   (`firesOn: [cellsSibling]` — where the task's why-block says role integrity matters most;
   scoping is DATA). Zero reagent nouns, zero biology in TS.
2. ASKS for the ANNOTATION, not a role. Emits ONE ProducerClarification per entry: {label: <the
   component's own name>, reason: 'composition-role-gap', actionLocation, message?} — where
   `message` is the question text loaded FROM THE DATA FILE (e.g. "What is X used for in this
   composition? State your intended use in your own words.") and must NOT enumerate enum roles —
   enumerating them re-invites the force-fit the ruling forbids. `message` built by conditional
   spread (exactOptionalPropertyTypes). Menu rendering stays MATRES-PANEL's problem, same
   division as MIXFRAC-1's readings.
3. CAPTURES the answer per §5b-DESIGN-DECISION (below).
4. SUPPRESSES re-fire for answered gaps (see the design decision — without this the bar loops
   forever, since the honest role stays `other` after any answer).
- Data file config/drafting/composition-role-guidance.yaml, cues discipline: `gapRole: other`,
  `firesOn: [cellsSibling]`, `question: <text>`, absent file/section => feature OFF LOUD (one
  console.warn naming the path; entries pass through unchanged), malformed => throws naming the
  path; loader mirrors loadMixtureCues (per-call read); NormalizeOptions injection option per the
  `mixtureCuesPath` precedent (`compositionRoleGuidancePath?`).
- NEVER infers purpose: no TS or config arm maps component names, synonyms, or word patterns to
  any purpose value. Purpose arrives ONLY as the scientist's own answer text.
- Bar behavior rides the existing arm (422 needs-clarification, holds the draft); per the ruling's
  item 4 the bar-vs-narrow mechanics stay per spec default — the config file is the LOUD-off
  switch and `firesOn` data narrows blast radius. (The draft's OQ-B bar-strength question is
  RATIFIED by the ruling's "stay per spec default" — not re-opened.)

**DESIGN DECISION — where the annotation rides (made against the audited machinery, honest
minimal landing stated plainly):** The audited answer leg is: answers ride the route's
`answers: Record<string, string>` map; `composeAnsweredPrompt` (handler :149) appends them to the
answered recompile prompt verbatim as SCIENTIST-RESOLVED CHOICES (key = the clarification's own
label — the component's name; value = the scientist's words); the ANSWER-BIND-1 `answeredSlots`
DATA channel (:429/:440) validates ONLY the `[[material:…]]` record-mention idiom and carries no
free text; and BOTH composition-entry shapes are `additionalProperties: false` (§2.1, §2.2), so
neither the ledger entry nor the wire item can carry an annotation field without a schema change
the ruling forbids and ROLE-AXES-1 owns. Therefore: **the annotation is captured as answer text
in the clarification record — the answers-map entry (label → scientist's stated intended use) on
the 422/answered exchange — with NO new field anywhere.** Say so plainly in the report. The only
code this forces is step 4's suppression plumbing (§3 item 4): normalize skips a gap whose entry
label is among the answered clarification labels (generic set membership over `Object.keys`,
never a value read), threaded as an optional through compileScientistIntent.ts:263 /
ScientistIntentCompileDeps / NormalizeOptions with conditional-spread absence, per the
answeredSlots beside-the-prompt precedent. This is declarative-first (the question, the gap role,
the firesOn are all data) and it deliberately does NOT persist the annotation into any record —
persisting purpose as a declared per-use field is exactly ROLE-AXES-1's `intended_purpose` work.
The scientist's words reach the answered compile prompt as settled data (§2.5), so the model can
stop guessing at the role and the human statement is on the record of the exchange.

### 5c. Golden coordination on the shared canonical utterance (the three-way rule)
MIXFRAC-1 owns GOLDEN-A/B/C fixtures/records + MANIFEST fixtures/records lists +
compositionFractions. CELLRATE-1 owns its rate golden + the wire-pin treeState re-bless +
material-system-rules.md :151-153. MIXROLE-1 touches, IN SHARED FILES, ONLY: the role field of
the Trypsin-EDTA entry in canonical-utterance fixtures/records/pinned docs, the :149/:141
rule/example hunk, and (with bait 7's deliberate clarification-list growth) the affected blessed
records. This item NEVER re-blesses the treeState wire pin (no schema file moves). Every
MIXROLE-1 golden edit rebases on the post-MIXFRAC-1 AND post-CELLRATE-1 merged text (re-read each
file at the dispatch tip before editing — trunks move; MIXFRAC-1's §14.2 blessed the fixtures
with roles "as the current pipeline emits", i.e. deliberately left for this item). If the merged
state still shows `solvent` on trypsin (it will), that is the RED baseline this item turns.
MIXFRAC-1/CELLRATE-1 must NOT pre-pin the trypsin role to their own guess.

## 6. Reviewer bait (anticipating the adversarial review — pre-empt each)
1. exactOptionalPropertyTypes: ProducerClarification.message absent-or-value — conditional
   spread, NEVER `message: undefined`; tests assert key ABSENCE via Object.keys
   (goldenIntentToClarification precedent), never toEqual-with-undefined. Same discipline for the
   §5b suppression option (`answeredClarificationLabels` absent-or-array).
2. YAML/prompt reload traps: tsx --watch does NOT reload YAML, AND systemPrompt.ts caches prompt
   files in a Map after first read (:11-24) — material-system-rules.md changes need a stack
   restart too; `cl-lane-stack.sh 2 restart` is BLOCKING (600s-timeout pitfall recorded on this
   lane) — restart with background=true. Tests read files directly, never through a live server.
3. Prompt-budget ratchet: adding guidance consumes the 47_180 ceiling (§2.7). Run
   promptBudget.test.ts BEFORE writing prose; if it goes RED on bloat, tighten wording in the
   same commit — do NOT lower other files or silently re-ratchet (re-ratchet = Brad's sign-off).
4. Hardcode boundary: ZERO role literals in new TS policy — no `=== 'solvent'`, no
   `=== 'other'`-style branch in compositionRoles.ts (the gap role, firesOn, and question are
   config), no reagent nouns (trypsin/DMEM/FBS/HepG2) outside fixtures/goldens/prompt example
   lines that ALREADY carry them. The reason-code string is `as const` registration per
   precedent, not policy. A reviewer WILL grep the new path for 'purpose', 'dissociat', 'trypsin'
   — all three must come back empty in TS (purpose never appears in code at all: the annotation
   is carried as opaque answer text; there is no purpose enum to name).
5. Grep-clean is demanded (§8): formulationMath.ts:216-226/:336-343, formulationCopilot.ts:71,173,
   vendorComposition.ts:18 and simpleVerbs.ts:388 are PRE-EXISTING role sites — the gate is "NO
   NEW role-literal branch in the diff", cite the pre-existing set as unchanged context. Do NOT
   "helpfully" decouple them — that is ROLE-AXES-1's mandate (§0 pointer).
6. MANIFEST re-bless exactly ONCE per changed pin, same commit, before/after sha256 in the
   report. The ONLY re-blesses here are the fixture + blessed-record sha256 lines (MANIFEST :51/
   :106 plus whatever GOLDEN-A/B/C entries the merged tip added). This item adds NO treeState
   re-bless — a wire-pin re-hash in the diff means someone touched a schema and the ruling says
   that is a stop-the-line failure, not a re-bless.
7. The blessed fixture unresolvable-mixture-component will fire the role-gap clarification at its
   trypsin `other` entry on top of MIXFRAC-1's fraction clarification — expected. The fixture's
   reason-set implications (shorthandChat.e2eStubHonesty.test.ts reason-set pin family,
   compositionDecomposition pins) are DELIBERATE updates with diffs, not rubber stamps;
   scope-creeping the affordance OFF to dodge the fixture is the mirror failure.
8. Cells-sibling scoping: a composition with an `other` entry and NO cells sibling must NOT
   clarify (firesOn data); the trypsin-LESS media recipe stays silent.
9. One clarification per entry, never per word in the label, and never a confidence ranking —
   the affordance asks, the human answers; a reviewer WILL grep the new path for 'confidence'.
10. The event-level `role` free-string on plate-event.add-material (§2.3) is a DIFFERENT
    vocabulary — "vehicle" is NOT the dissociation role and stays out of scope; touching it
    collides with FULFIL and confuses entities (rule 7).
11. The bar loop trap (this revision's NEW bait): after the scientist answers with an intended-use
    sentence, the honest role is STILL `other`, so a naive evaluator re-fires forever and the
    draft can never compile. The suppression leg (§5b step 4) is mandatory and must key on the
    answered LABEL SET only — a test must prove: gap fires once; answered recompile (same entry,
    same `other` role, answer present) passes the gap bar; the answer VALUE is never read by TS
    (assert by feeding a nonsense value — suppression is unchanged).
12. Force-fit bait (ruling-shaped): rendering the clarification message as a role pick-list, or
    validating the answer against the enum, are both the exact force-fit the ruling forbids. The
    message text is data (§5b); a test asserts the shipped question text names no enum member.

## 7. Tests (RED-first, by plane) + the ruled golden pin table
RED-first mandatory (CLAUDE.md rule 5). Planes:
1. Guidance plane (NEW test, e.g. server/src/ai/promptCompositionRoleGuidance.test.ts): compose
   the drafting-surface prompt (buildSystemPrompt path, §2.4a) and assert the fit-guidance rule +
   the ruled example role (`other`) are present with citation; at the dispatch tip this FAILS
   (guide absent, example teaches solvent) — the defect pinned before any design is final.
2. Affordance plane (compositionRoles.test.ts, harness shape of compositionFractions.test.ts):
   `other`-entry + cells-sibling -> exactly ONE clarification, reason composition-role-gap, label
   = the component's own name, message = the config question, actionLocation correct;
   cells-sibling absent -> silence; cells entry itself never clarifies; absent config -> LOUD-off
   (console.warn naming the path) + pass-through; malformed config -> throws naming the path;
   reason set joins the union without breaking the existing codes (MIXFRAC-1's included — rebase
   count); SUPPRESSION per bait 11 (fire-once / answered-passes / nonsense-value-unchanged);
   shipped question text names no enum member (bait 12).
3. Golden plane (byte-pin table — the trypsin role field ONLY; every other byte of every listed
   artifact stays at its merged-tip value; line numbers are at TODAY's tip, re-locate at dispatch):
   | artifact | today (at 14d26cf6; merged tip may differ) | ruled pin |
   | material-system-rules.md :141 | role: solvent | role: other |
   | goldens/fixtures/unresolvable-mixture-component.yaml :45 | role: solvent | role: other |
   | goldens/__records__/unresolvable-mixture-component.golden.json | "role":"solvent" | "role":"other" (+ the bait-7 clarification-list growth) |
   | MANIFEST.yaml fixture+record shas (:51/:106) | current | re-hash once (record grows by bait 7; fixture moves on the role byte) — NO treeState re-bless |
   | compositionDecomposition.test.ts :44-53 (:51 pin; :142 substring pin rides the MIXTURE constant) | role: solvent | role: 'other' |
   | promptShapeParity.test.ts PROMPT1_DOC :135 | role: solvent | role: other |
   | GOLDEN-A/B/C fixtures+records (post-MIXFRAC) | solvent (MIXFRAC pinned as-emitted) | role: other |
   | all four schema enum homes | 7-member ledger + wire mirrors; recipe divergent | UNCHANGED — zero pins move |
   Golden-suite manifest hash check re-hashes LOUD — re-bless exactly once per §6 bait 6.
4. Characterization: compositionDecomposition (post-MIXFRAC state), promptShapeParity,
   goldenIntentToClarification/goldenIntentToGraph replays, cue bar + fraction-sum clarifications
   stay green (the role clarification must not steal the fraction channel).

## 8. First targeted check, then full verification (with expected output)
First targeted check (early proof, cheap, headless):
  cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/promptCompositionRoleGuidance.test.ts src/ai/promptBudget.test.ts
Expected at base: guidance test RED (rule absent, example teaches solvent) + budget test GREEN
(measure headroom under 47_180 BEFORE writing prose). No schema-first-check exists anymore — this
item touches no schema file.
Full verification:
- Targeted: `npx vitest run src/compiler/scientistIntent/ src/compiler/biology/ src/ai/promptBudget.test.ts src/ai/shorthandChat.e2eStubHonesty.test.ts src/api/handlers/ src/schema/` —
  zero failures; every deliberate pin update listed in the report with before/after. (Handlers
  plane is in because of the §3 item-4 plumbing; src/schema/ stays green untouched as the no-
  schema-change proof.)
- Full suite: `npm run test:run -w server` (repo root) — failing-FILE set identical to the
  dispatch-tip baseline (comm-empty against a freshly regenerated base-server-failfiles list).
- Typecheck: `npm run typecheck -w server` — zero new errors vs baseline
  (exactOptionalPropertyTypes on; conditional spread only).
- GREP-CLEAN (report-mandatory, no-TS-role-literal-branches):
  `git -c core.fileMode=false diff <PINNED_TIP>..HEAD -- '*.ts' | grep -nE "^\+.*((===|!==|\bcase\b)\s*['\"](solute|solvent|buffer_component|additive|activity_source|cells|other)['\"])"`
  — EMPTY (no permitted exceptions exist under this ruling for role-literal comparisons; the
  reason-code `as const` and test fixtures are string assignments/pins, not comparisons).
- ENUM-HOME GUARD (ruling-shaped replacement for the old mirror check):
  `git -c core.fileMode=false diff <PINNED_TIP>..HEAD -- schema/core/datatypes/composition-entry.schema.yaml schema/workflow/scientist-intent.schema.yaml schema/lab/vendor-product.schema.yaml schema/lab/recipe.schema.yaml`
  — MUST BE EMPTY (zero diff in all four enum homes).
- PURPOSE-INFERENCE GUARD: `git -c core.fileMode=false diff <PINNED_TIP>..HEAD -- '*.ts' 'config/drafting/composition-role-guidance.yaml' | grep -inE "purpose|dissociat|trypsin"`
  — EMPTY (§6 bait 4).
- NO browser gate — compiler/prompt task, task verified-by verbatim; no UI receipt, no :5193 run.

## 9. Sequencing / collision / worker contract
FLEET COLLISION MAP (in-flight owners, handoff 2026-10-22_0820 first-hand, tip 14d26cf6):
- REVISE-GHOST-1 MERGED (66cb7915); its BROWSER GATE attempt 3 tier-2 is LIVE against trunk
  fb154093+ (receipts 0815-c3-tier2). It no longer holds the fleet lock, but do not touch
  shorthandChat.ts / AgentOrchestrator.ts / AiTabPanel.tsx while the gate re-verifies served
  modules. MIXROLE-1 overlap: ZERO (all three OUT of §3).
- MIXFRAC-1 on resume-3 (branch cl/lane2-mixfrac1-l2t0310, FIFO second behind lane-1): owns
  simpleVerbs.ts, normalizeScientistIntent.ts, compositionFractions.ts (new),
  config/drafting/composition-fraction-convention.yaml (new), goldens fixtures/records/MANIFEST
  (GOLDEN-A/B/C), wire-schema pin if readings ride. MIXROLE-1 shares: normalizeScientistIntent.ts
  union region (rebase — MIXFRAC merges first), MANIFEST bless chain, goldens dir, the canonical
  fixture space. deps: MIXFRAC-1 (task-list) — non-negotiable.
- CELLRATE-1 QUEUED after MIXFRAC-1 (spec path-checked ready): owns material-system-rules.md
  :151-153 (!), wire schema count arm, goldens (rate golden + treeState re-bless), app display
  files. MIXROLE-1 shares material-system-rules.md (different hunks — adjacent rule bullets, one
  file) AND the golden bless chain. Same canonical utterance, same vocabulary surface: coordinate
  by ORDERING, not by hunk diplomacy — take the slot AFTER the CELLRATE-1 merge.
- FULFIL queued: plate-event.add-material + server/src/materials/ + server/src/fulfillment/** —
  MIXROLE-1 is OUT of all three (§3); the formulationMath/formulationCopilot/vendorComposition
  role reads (§2.3, §0 de-risk fact) are cited, not edited.
- PANEL, CHAIN queued after FULFIL — no overlap (panel rendering of the new clarification rides
  MATRES-PANEL exactly as MIXFRAC's readings do).
- ROLE-AXES-1 is DRAFT, pending Brad's approval, deps: MIXROLE-1 — it slots after this item;
  nothing here pre-implements any of it.
FLEET SLOT (ORCH-RULED 2026-10-22T21:25, supersedes the draft recommendation): REVISE-GHOST-1 ->
MIXFRAC-1 -> **MIXROLE-1** -> CELLRATE-1 -> FULFIL -> PANEL -> CHAIN. **Dispatch base tip = the
MIXFRAC-1 merge commit** (PINNED_TIP stamped in the task block at dispatch; NEVER branch off
5e9c4bb1, fcc24539, or any pre-MIXFRAC-1 tip — guaranteed golden collisions). Consequence of the
order flip: CELLRATE-1 branches off the POST-MIXROLE-1 tip (its material-system-rules.md :151-153
hunk and bless-chain rebase on the merged state; the treeState wire-pin re-bless stays CELLRATE's).
The old draft's Branch-B re-slot clause (MIXROLE between MIXFRAC-1 and CELLRATE-1) is DEAD —
Branch B is dead, ordering fixed.
WORKER CONTRACT: worktree /mnt/vast/home/brad/git/wt/MIXROLE-1-lane2-<tag>, branch
cl/lane2-mixrole-1-l2t<tag> off the ruled base tip; EVERY git command with
`-c core.fileMode=false` (NFS mode-bit noise); never touch /mnt/vast/home/brad/git/computable-lab
(Brad's live tree). Unique deliverables: report `.hermes/plans/MIXROLE-1-report.wip-<tag>.md`
(promoted to `.hermes/plans/MIXROLE-1-report.md`); log `lanes/2/logs/coder-MIXROLE1-<tag>.log`;
spec path replaces `<ts>` under .hermes/plans/ at promotion. Report must contain: merge-time
re-verification of every §2 cite against the dispatch tip, the ruling quoted verbatim as
implemented (including the binding principle line), the §7 pin table with before/after hashes,
the §8 grep-clean output, the empty enum-home guard diff, the empty purpose-inference guard diff,
the §5b annotation-riding decision stated plainly ("the annotation is captured as answer text in
the clarification record with no new field"), and the lint-verdict paragraph (§5b) in its own
section — the report IS the honest-verdict artifact.

## 10. Open questions the composer could NOT resolve locally (max 3)
OQ-A (orchestrator ratification, §0 placeholder): the §5a guidance-home choice
(material-system-rules.md :147-157 rule block). CHECKED: prompt composition path
(systemPrompt.ts:485-491, buildSurfaceAwarePrompt :418/:428, orchestrator call sites :1177/:1544),
vocabulary meta-schema has no arg guidance slot (schema.yaml :66-69 additionalProperties:false),
prompt-budget headroom (§2.7). This revision marks it READY for ratification — the (c) ruling
resolved the enum question; the home choice is the only design pick left standing.
DEFAULT STANCE: RATIFY as specified.
OQ-B (orchestrator collision-confirm): the §5b suppression plumbing touches
IntentCompileFromPromptHandlers.ts :412-441 + compileScientistIntent.ts:263 + two option types.
CHECKED at this tip: none of these files appears in any in-flight owned set (handoffs
0810/0820; REVISE-GHOST merged, MIXFRAC-1 owns normalize/simpleVerbs/goldens, CELLRATE-1 owns
wire+prompt-hunk+rate-golden, FULFIL owns materials/fulfillment); AI-13 is queue-positioned and
its surface is unverified by the composer. If the dispatch-tip collision map shows a live owner,
the fallback is to thread via NormalizeOptions only and let the compile pass read the answers
from its existing deps — same data, different call site; do NOT invent a new channel.
OQ-C: CLOSED BY RULING — answered NO by construction (no vendor-product member, no recipe member;
the old question is retired, retained here only as the record).

MIXROLE1-REVISION DONE
