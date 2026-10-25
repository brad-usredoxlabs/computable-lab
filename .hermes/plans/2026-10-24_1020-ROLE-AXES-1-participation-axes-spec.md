# ORCHESTRATOR RATIFICATION (l2t1015, 2026-10-24T10:25 EDT)

Draft reviewed first-hand. Orch re-verified the load-bearing cites at trunk tip (6d64154b):
composition-entry.schema.yaml 7-member enum (:13-22); scientist-intent wire mirror item
required [material, role] + unevaluatedProperties:false; formulationMath.ts roleType ladder
:216-228 and `?? 'solute'` :321; formulationCopilot.ts roleDefaultMeasureMode :70-72 and
sourceState :87; app/src/editor/lib/formulationMath.ts mirror (:167-178, :240, :252 role
'=== solvent' volume-fraction fallback — the app leg IS real arithmetic); no composition-entry
role widget in any schema/lab/*.ui.yaml (grep: only controlled-document help text + recipe.ui
input_roles). SimpleVerbs cells leg is compiler-wall pass-through (no arithmetic) — correctly
LEFT ALONE. activity_per_volume conversion leg at formulationMath.ts ~:108-113 exists — the
basis-distinct evidence for activity_contributor holds.

RULINGS on the composer's OQs (binding for the coder):
- OQ-1 migration: ADOPT — NO backfill script. participation optional; readers fall back to the
  config legacy-role mapping, loud-off. Backfill would be role->participation inference = the
  never-guess line.
- OQ-2 vocabulary: ADOPT the six terms as proposed, participation_undeclared included.
  activity_contributor stays (the activity_per_volume leg is structurally distinct — verified).
- OQ-3 UI: ADOPT — participation renders NOWHERE in this item; NO browser gate. The app-suite
  obligation stands (mirrored arithmetic is real code).
- OQ-4 secondary sites: ADOPT the recommendation — vendorComposition.ts preferredRole order +
  aiPlanningTools.ts:354-355 fold into LEG 2 (one config key); eventGraph.ts display-tier and
  VendorProductBuilderModal display pick -> follow-up display-tier card (orch files as backlog
  candidate in the handoff; not new campaign scope).
- LEG SPLIT: ADOPT — LEG 2 (arithmetic independence) first, LEG 1 (schema participation axis)
  second, ONE branch, commits in leg order (LEG2 red/fix, LEG1 schema, LEG2 config re-point) so
  reverting LEG 1 keeps LEG 2 green. Single merge, single adversarial cycle.
- The draft body below is BINDING as-is; this header governs on conflict.

# ROLE-AXES-1 — Participation axes + arithmetic decoupling — SPEC DRAFT (l2t0915)

Item: ROLE-AXES-1, lane 2 list (APPROVED Brad 2026-10-24T08:04). Binding ruling:
decisions/MIXROLE1-role-axes-brad-ruling-20261022.md (read in full; quoted principle is BINDING:
"materials have identities and properties; their roles are contextual, and their purposes are
experimental"). Trunk ground truth: cl/integration-2 @ fe586759 (composer verified every cite
below first-hand with read_file/search_files at this tip; scout was used for screening only).

## Goal (one sentence)

Ship the three-axis separation as DATA — a declared participation axis on composition entries
plus arithmetic that rides amounts/units/participation instead of role labels — so a wrong role
label can no longer silently drive math, and purpose stays a never-inferred per-use annotation.

## Leg split + shipping-order RECOMMENDATION: split, LEG 2 FIRST (one branch, two commits, two PRs possible)

Recommendation: SPLIT, LEG 2 (arithmetic independence) ships first. Why:
1. LEG 2 is the danger leg (the ruling itself: "today it is worse — it silently drives math")
   and it is FULLY machine-checkable at this tip (byte-pin goldens + mislabeled fixture). Its
   vocabulary is exactly the task's own verified-by, with zero dependence on the LEG 1
   vocabulary debate.
2. LEG 1's final vocab is a spec-phase audit-first question — this spec PROPOSES it (§3) but it
   is an OQ for the orchestrator/Brad; shipping vocabulary before the math is de-risked buries
   the dangerous fix under a semantics review.
3. Safe either order (role enum stays readable, participation is additive-optional), so the
   split costs no migration coupling: LEG 1 lands the vocabulary + config that RE-POINTS the
   LEG 2 mapping from old-role-keyed to participation-keyed — data change, zero TS change.
Leg 2 mechanism (decoupling NOW, without waiting for participation to exist): move every
role->arithmetic decision into config/drafting data keyed by the EXISTING role values
(loaded per call, LOUD-off, exactly the MIXFRAC composition-fraction-convention pattern); TS
interprets the mapping generically. Leg 1 then adds the participation field and the SAME config
gains participation-keyed arms that win when present. This is the only ordering in which the
hard-boundary grep-clean gate can pass at the LEG 2 merge, not only at the end.

## AUDIT-FIRST ENUMERATION — every consumer of the composition-entry role enum @ fe586759

Class key: P-read = participation-relevant read (should become a participation/config read),
A = arithmetic-relevant, D = display-only, E = emission/normalization (writes role values),
CL = config data (role names legitimately live in DATA), X = vocabulary declared elsewhere
(unchanged per MIXROLE-1 OQ-C), DL = deprecated-later (retire in this item), L = leave alone.

VOCAB DECLARATIONS (the triplet + mirrors):
- schema/core/datatypes/composition-entry.schema.yaml:13-22 — THE enum (7 members). LEG 1 adds
  `participation` here.
- schema/workflow/scientist-intent.schema.yaml:195-197 — wire mirror enum (identical 7). Items
  carry unevaluatedProperties:false (:188) — a wire participation field must be DECLARED here.
- schema/lab/vendor-product.schema.yaml:156-160 — inline duplicate enum — X (OQ-C: nothing joins
  vendor-product).
- schema/lab/recipe.schema.yaml:38 — WIDER enum (adds diluent, matrix) — X, unchanged.
- server/src/materials/composition.ts:12-19 — TS CompositionRole union (type mirror) — E/parse.
- app/src/types/material.ts:42-47 (CompositionRole), :59-65 (RecipeRoleType) — app mirrors.

ARITHMETIC-RELEVANT (the LEG 2 kill list — line numbers VERIFIED at fe586759):
- server/src/materials/formulationMath.ts:216-228 — roleType->role chain in
  inferredCompositionForIngredient (the task's "~:218-223" = :216-228 at this tip). P-read/A/DL:
  the ladder decides the emitted composition role of a snapshot entry from a free-form roleType.
- server/src/materials/formulationMath.ts:321 — `role: baseComposition[0]?.role ?? 'solute'`
  (fallback role literal). A/DL.
- server/src/materials/formulationMath.ts:190 — merge key includes role (dedup identity). P-read:
  key composition, not arithmetic class; must stay byte-stable for legacy records.
- server/src/materials/formulationCopilot.ts:70-72 — roleDefaultMeasureMode: solvent/diluent/
  matrix => qs_to_final (task's "~:71" VERIFIED :71). A/DL -> participation/config-driven.
- server/src/materials/formulationCopilot.ts:87 — sourceState default liquid iff solvent/diluent
  (task's ":87"; the task's "173" label site is actually the recipe-name line below). A/DL.
- server/src/materials/formulationCopilot.ts:173 — outputSolventRef label fallback finds the
  ingredient with roleType solvent/diluent to name the recipe. A-label/P-read (name text only,
  but label-selected).
- server/src/materials/formulationCopilot.ts:257, :266, :269 — emits roleType 'solute'/'solvent'
  + compositionSnapshot role 'solvent' from prompt parsing. E.
- server/src/materials/formulationMath.ts:14, 259-269 — count/volume arithmetic keyed on
  concentration BASIS and sourceState (NOT role) — proof the arithmetic CAN ride amounts/units;
  leave as-is (L) except where :321/:216-228 feed it.
- app/src/editor/lib/formulationMath.ts (MIRROR COPY, app-side): :167-178 role ladder, :240
  `?? 'solute'`, :252 `entry.role === 'solvent'` volume-fraction fallback. A/DL — same treatment
  as server; app is IN SCOPE because this file performs arithmetic (decide-and-cite note below).

PARTICIPATION-RELEVANT READS (P-read; config-driven now, participation-read when LEG 1 lands):
- server/src/materials/vendorComposition.ts:18-21 — preferredRole order picks primary declared
  concentration. A-adjacent (a wrong pick misreports concentration). -> config order data.
- server/src/mcp/tools/aiPlanningTools.ts:354-355 — identical preferredRole order. P-read.
  (OQ-4: retire here too vs follow-up.)
- app/src/types/material.ts:391-397 getPrimaryDeclaredConcentration — same order app-side.
- app/src/graph/lib/eventGraph.ts:481-485 materialDisplayPriority — role-tier display ordering.
  D/P-read (well context panel).
- server/src/compiler/biology/verbs/simpleVerbs.ts:469 `if (role === 'cells')` — count routing
  leg. P-read: cells IS a participation class ("count-component"); this read may legitimately
  persist if declared as participation, else config. Compiler-wall adjacent — do NOT add
  arithmetic here.
- server/src/compiler/scientistIntent/compositionFractions.ts:321,381,412,507,614,660,713,738 —
  role reads ONLY through config.excludeRoles (already DATA-clean, CL-conformant). P-read future:
  excludeRoles re-expressible as participation when LEG 1 lands. No change in LEG 2.
- config/drafting/composition-fraction-convention.yaml:36 excludeRoles [cells] — CL.
- config/drafting/composition-role-guidance.yaml:33 gapRole other + :41 siblingRole cells — CL;
  MIXROLE-1's annotation channel; unchanged this item (purpose-axis consumer is future).

DISPLAY / UI (D):
- app/src/types/material.ts:399-409 RECIPE_ROLE_OPTIONS labels (recipe vocabulary UI). D.
- app/src/types/material.ts:412-425 recipeRoleToCompositionRole (maps recipe enum incl.
  diluent/matrix -> ledger enum). E/D — X-adjacent (recipe bridge), unchanged.
- app/src/editor/material/VendorProductBuilderModal.tsx:68 (preferredRole display pick), :271
  (emits role 'solute' on add row). D/E.
- app/src/event-editor/material/builders/BuildMixtureForm.tsx:57-59 default rows solvent/
  additive/additive; :72, :84 cells/activity_source "media" detection. D/E (builder defaults).
- app/src/editor/FormulationsPage.tsx:139, :324-329, :730, :1132 — roleType 'solute' defaults,
  declared-solvent entry emission. E/D.
- app/src/graph/events/forms/AddMaterialForm.tsx:39 and app/src/graph/events/ribbon/
  EventRibbon.tsx:306 — `role === 'cells'` toggles a cells-flavored render. D.
- server/src/ai/materialRefLabels.ts:133-146 role set + :170-179 alias normalization
  (vehicle/medium/media/buffer -> buffer_component), :251-258 inferRole regexes (cells/FBS/
  medium word patterns), :474-486 roleFor/roleForSnapshot. E/normalization — P-read candidates;
  the inferRole word-regexes are the axis-conflation in emission: LEG 1 emits participation
  ALONGSIDE role (never replaces the honest closest-role), purpose NEVER inferred here.
- server/src/materials/composition.ts:95,115 parse; :145,:150-158 buildSoluteSolventComposition
  (emits solute + 'declared solvent' source). E.
- server/src/materials/AddMaterialSupport.ts:180-184 passthrough, :297 `role: 'solute'` default
  emission. E.
- server/src/ai/shorthandChat.ts:662-686 — wire composition items required [material, role];
  recompile preserves role (:686). E: the wire->ledger carry-through point where a LEG 1
  participation field must survive (or be deliberately absent).
- schema/registry/prompt-templates/chatbot-compile.precompile.system.yaml:37-38 — a DIFFERENT
  prompt vocabulary (base|solute|solvent|supplement|active|unknown). L (not the ledger enum).
- schema/registry/derivations/solvent.yaml + active_ingredients.yaml:5 — derivation prose
  mentioning solvents; separate derivations registry. L.
- Tests/fixtures that PIN roles (not consumers; update only where behavior legitimately changes):
  server/src/materials/AddMaterialSupport.test.ts:286,323,388; server/src/mcp/tools/
  AiPlanningTools.test.ts (many); server/src/fulfillment/FulfillmentAccept.test.ts:125-132;
  server/src/compiler/scientistIntent/compositionRoles.test.ts (shipped config).

Explicitly OUT of scope: recipe.schema.yaml:38 and vendor-product.schema.yaml:156-160 vocabularies
(MIXROLE-1 OQ-C ruling: nothing joins either file); material-spec.ui.yaml:47-49 / recipe.ui.yaml:45-47
solvent_ref fields (different datatype, not composition-entry role); ontology-terms/*.yaml (no
participation term may ever be minted there — see reviewer bait).

## Participation-axis vocabulary proposal (LEG 1 — curated, ontology-disciplined)

Schema surface (the "triplet"): schema/core/datatypes/composition-entry.schema.yaml (adds
optional `participation`) + the schema-side vocabulary mirror for the UI/lint path + the WIRE
mirror schema/workflow/scientist-intent.schema.yaml (declare the field inside the :186-197 item;
unevaluatedProperties:false forbids implicit carry). NO schema/lab/*.ui.yaml renders composition
role today (verified: material-spec.ui.yaml, recipe.ui.yaml, material-profile.registry.yaml have
no composition role widget) — the third triplet member is the TS type mirrors
(composition.ts:12-19 / material.ts:42-47) which must gain the union.

Proposed enum (6, each mapping to exactly one arithmetic class the audit found):
- liquid_component          — contributes volume AND dissolved content to final volume
                              (maps today's solvent-adjacent + solute entries in a liquid mix)
- qs_carrier                — the bring-to-final carrier (the qs_to_final arithmetic class at
                              formulationCopilot.ts:71)
- solute_contributor        — measured contribution by concentration (molar/mass_per_volume)
- activity_contributor      — measured contribution by activity_per_volume (separate conversion
                              leg at formulationMath.ts:108-113 — audit says distinct class)
- count_component           — count-carried entry; NEVER joins volume/fraction sums
                              (today's `cells` arithmetic behavior, composition-fraction-
                              convention excludeRoles)
- participation_undeclared  — honest gap arm (mirrors MIXROLE's `other` discipline + never-guess);
                              arithmetic NEVER reads through it silently — absence/undeclared
                              falls back to config-declared legacy-role mapping, loudly off.

Ontology grounding (binding discipline, not a term mint): participation is a RELATIONAL role a
material bears in a composition — CHEBI/CL/GO classify substances/cell types/activities, not
composition relations, and there is NO CHEBI "solvent-role" class. Correct ontology placement,
per Brad's ruling, is CONSTITUENT-level (trypsin inside the Trypsin-EDTA formulation carries EC
3.4.21.4 via gene-ontology.yaml; the recipe composition already supports this via nested
composition, composition-entry.schema.yaml:48-52). The vocabulary file header must state that
participation terms are LOCAL datatype enum values, NEVER minted into schema/registry/
ontology-terms/*, never treated as equivalent to substance classes. (No machine check can prove
"never minted later" — say so plainly; the pin test below checks the ontology dirs stay clean of
these values.)
functional_contributions and intended_purpose are NOT added to composition-entry by this item:
purpose rides MIXROLE-1's existing annotation channel (composition-role-guidance question ->
answers-map free text); contributions-from-definition is a future knowledge-layer item. The task
text names them as target architecture; shipping participation alone honors the ruling and keeps
the diff bounded.

## First targeted check (proves the approach early)

RED-first, before ANY implementation, in the coder's worktree (cwd=server):
  npx vitest run src/materials/formulationMath.decoupling.test.ts   # must FAIL for the right reason:
  a fixture where a volume-carrying entry is mislabeled role:'additive' and a non-carrier is
  labeled role:'solvent' must compute amounts from amounts/units/config — at fe586759 it instead
  gets qs_to_final + liquid sourceState from the LABEL (formulationCopilot.ts:71,87). Then run
the byte-pin leg: existing goldens over a legacy record (all roles correct) must reproduce byte-
identical output before and after the config move. One command proves both the defect and the
fix-vector.

## Acceptance criteria (task verified-by, VERBATIM)

"Spec-phase first: audit-first enumeration of EVERY consumer of the role enum (grep-clean list
in spec) and the honest split of structure-checkable vs semantics-only (MIXFRAC/MIXROLE
lint-honesty precedent — say plainly where no machine check exists). RED-first tests: golden
arithmetic unchanged for label-preserving records (byte-pin) while a deliberately mislabeled
fixture computes from amounts/units, not labels; no TS role-literal branches in the arithmetic
path (grep-clean); exactOptionalPropertyTypes-clean; server suite + typecheck at baseline.
Browser gate only if a UI surface renders participation (spec decides, cite the surface)."

Per-testfile RED-first plan (cwd=server unless noted):
- server/src/schema/CompositionParticipationSchema.test.ts (NEW, LEG 1): valid participation
  passes on composition-entry AND wire mirror; unknown participation REJECTED naming the path;
  legacy payload WITHOUT participation validates byte-identically; nested composition items
  accept participation; vocabulary EQUALITY test reading all YAML declarations (programmatic
  read, no duplicated literals) proving triplet + wire mirror agree; ontology-terms/ grep-clean
  assertion for the vocabulary values.
- server/src/materials/formulationMath.decoupling.test.ts (NEW, LEG 2): byte-pin goldens for
  label-preserving records; mislabeled fixture computes from amounts/units (RED first); legacy
  record (participation absent) rides config legacy-role mapping unchanged; config absent ->
  LOUD-off console.warn naming the path + arithmetic unchanged (never throws); config malformed
  -> THROWS naming the path.
- server/src/materials/formulationCopilot.decoupling.test.ts (NEW, LEG 2): :71/:87 defaults now
  read the config mapping; mislabeled solvent gets NO qs_to_final; recipe-name label site
  (:173) byte-stable for correct labels.
- server/src/materials/vendorComposition.convention.test.ts (NEW or extend, LEG 2): preferredRole
  pick order is config data; absent config -> existing behavior LOUD-off.
- server/src/schema/SchemaRegistry.test.ts + compositionRoles.test.ts (EXISTING): must stay
  green unchanged (registry pin unchanged — `#` self-ref untouched).
- app (mirror arithmetic): app/src/editor/lib/formulationMath decoupling test alongside the
  existing app tests (cwd=app): same byte-pin + mislabel pair.

HONEST SPLIT (structure-checkable vs semantics-only — say it plainly):
MACHINE-CHECKABLE: schema/wire validation both directions; vocabulary equality across YAML
declarations; byte-pin goldens; mislabeled-fixture arithmetic; grep-clean arithmetic path;
config loud-off/throw semantics; eOPT via tsc; ontology-dir cleanliness of vocab values.
NO MACHINE CHECK EXISTS (semantics-only, human-reviewed): (a) whether the six participation
terms genuinely describe "how it is incorporated" for every future material — the vocabulary is
curated judgment; (b) whether the LEG-1 role->participation DEFAULT MAP in config is
scientifically right per material class — config review, not tests; (c) whether purpose is
"never inferred" in spirit — tests can pin that no code READS purpose into arithmetic, not that
no future prompt hints at it; (d) whether display-tier reorderings (eventGraph.ts) picked the
right participation tiers — receipt-level. State these verbatim in the coder report.

Verification commands (exact, expected output):
- cwd=server: npx vitest run src/materials src/schema src/compiler/scientistIntent/compositionFractions.test.ts src/compiler/scientistIntent/compositionRoles.test.ts
  -> all PASS; zero new failing files vs the pre-dispatch baseline the coder records at claim.
- cwd=server: npx tsc -p . --noEmit  (or npm run typecheck -w server) -> error-line count EQUAL to
  the trunk baseline the coder captures first (sorted-diff empty; eOPT violations = 0 new).
- grep-clean gate (expected: zero hits in arithmetic files):
  grep -nE "'(solute|solvent|diluent|buffer_component|activity_source|additive|matrix|cells)'" \
    server/src/materials/formulationMath.ts server/src/materials/formulationCopilot.ts \
    app/src/editor/lib/formulationMath.ts
  -> expected: no output. (config/drafting/composition-participation-convention.yaml MAY carry
  role names — that is the DATA side; the TS must not.)
- cwd=app (IN SCOPE — decided, cited): npx vitest run src/editor (targeted formulationMath file)
  and npm run typecheck -w app sorted-diff vs baseline. APP SUITE: YES, because
  app/src/editor/lib/formulationMath.ts performs the mirrored role-labeled arithmetic (:167-178,
  :240, :252) — the task's "arithmetic must ride amounts" binds it.
- Browser gate: NO. Decided: NO UI surface renders participation in this item — no schema/lab/
  *.ui.yaml carries a composition-entry role widget (verified at fe586759) and the app role
  <select>s render the RECIPE vocabulary only (material.ts:399-409). If the orchestrator later
  rules participation must render, the surface to cite is the composition editor rows in
  app/src/event-editor/material/builders/BuildMixtureForm.tsx + FormulationsPage, and the gate is
  cl-browser-reviewer against :5193, VERDICT: accept.

## Worker contract

- Branch: cl/lane2-roleaxes-1-l2t<tick> off cl/integration-2 tip AT CLAIM (fe586759 at draft
  time; re-check — CHAIN fix-2 advc may land first). Worktree wt/ROLE-AXES-1-lane2-l2t<tick>.
- Deliverable: .hermes/plans/ROLE-AXES-1-report.l2t<tick>.md (unique per tick), ending
  STATUS: complete; commits in leg order (LEG2 red/fix, LEG1 schema, LEG2 config re-point) so a
  revert of LEG 1 keeps LEG 2 green.
- YAML edits need a lane-stack restart (:3093/:5193) — tsx --watch does NOT reload YAML;
  restart background=true, health-check separately, never blind-sleep.
- exactOptionalPropertyTypes on: participation optional means ABSENT, never `participation:
  undefined` — every emission/normalization site uses the `...(x ? {participation: x} : {})`
  spread idiom.

## File ownership (coder)

IN: schema/core/datatypes/composition-entry.schema.yaml; schema/workflow/scientist-intent.schema
.yaml; config/drafting/composition-participation-convention.yaml (NEW);
server/src/materials/formulationMath.ts, formulationCopilot.ts, vendorComposition.ts,
composition.ts (parse/type only); server/src/ai/materialRefLabels.ts (type mirror +
participation passthrough ONLY — no inferRole change); app/src/types/material.ts (type mirror);
app/src/editor/lib/formulationMath.ts; the four NEW test files above.
PROPOSED, pending OQ-4: server/src/mcp/tools/aiPlanningTools.ts:354-355,
app/src/graph/lib/eventGraph.ts:481-485 (config-data the same reads use — TS may be untouched).
OUT (do not touch): schema/lab/recipe.schema.yaml, schema/lab/vendor-product.schema.yaml,
config/drafting/composition-fraction-convention.yaml, composition-role-guidance.yaml (data may
gain comments ONLY if LEG 1's excludeRoles re-point is ruled in), server/src/compiler/**
(simpleVerbs cells leg stays as-is this item), schema/registry/ontology-terms/**, data repo
records (no migration script — OQ-2), app/src/event-editor/right-pane/** (hot-file cluster).

## Reviewer bait (pre-empt these in the diff)

1. exactOptionalPropertyTypes sites: every optional participation add/remove is a spread
   (`...(v ? {participation: v} : {})`), never a key set to undefined — composition.ts parse,
   materialRefLabels passthrough, shorthandChat:686 carry-through, app mirrors.
2. YAML-reload traps: the new convention config must be LOADED PER CALL (mirrors
   composition-fraction-convention exactly); a process-cached loader is an instant fail; tests
   for absent/malformed file must name the path (LOUD-off warn vs THROW) — the pin test must
   read the SHIPPED file, not a fixture, for the vocabulary-equality leg.
3. Ontology terms: participation values must NEVER appear in schema/registry/ontology-terms/*.
   The schema header must state the local-enum rationale (EC 3.4.21.4 lands on CONSTITUENTS via
   nested composition, never on a participation word).
4. Hardcode boundary: zero role/vocab string literals in the three arithmetic files (the grep
   gate above); a `roleType === 'solvent'` surviving ANYWHERE in formulationMath/
   formulationCopilot/editor formulationMath = reject. Config carrying role names is fine; TS
   carrying them is the defect.
5. Byte-pin drift: merge-key (:190) and recipe-name (:173) outputs must be byte-stable for
   correct-label records — "cleaner output" on a legacy record is a REGRESSION, not a fix.
6. Triplet drift: wire enum (:197) vs datatype enum vs TS unions — the equality must be proven
   by the YAML-reading pin test, not by copy-paste comments.
7. Nesting: participation on NESTED composition items (the MIXFRAC nested-recipe shape, medium =
   DMEM:FBS) — a parent-level-only implementation fails the wire mirror and the goldens.
8. MIXROLE-1 collision: gapRole stays `other` on ROLE (composition-role-guidance.yaml:33) —
   participation_undeclared does NOT replace it and the role-gap bar must not double-fire.
9. Scope creep on purpose: any code that WRITES intended_purpose/inferred purpose = reject;
   purpose is the annotation channel's, never-inferred, per the ruling.

## Open questions for the orchestrator (with recommendations + evidence)

1. Migration posture for existing records' role values. RECOMMEND: NO backfill migration script.
   participation is optional; readers fall back to the config legacy-role mapping (loud-off);
   new emissions carry it. Evidence: Brad's standing rule — all records are test data, no
   live-data hazard; a backfill would be role->participation inference, which is the exact
   never-guess line the ruling forbids the compiler from crossing. Checked: composition-entry
   required fields ([component_ref, role], schema :9) unchanged either way.
2. Final vocabulary (the six terms + participation_undeclared arm). RECOMMEND: accept as
   proposed; collapse activity_contributor only if the orchestrator rejects basis-distinct
   arithmetic (evidence: formulationMath.ts:108-113 activity conversion leg is structurally
   separate from mass/molar legs). Checked: no existing schema/config/UI depends on these names;
   the wire mirror accepts a declared additive field without breaking any current payload.
3. UI rendering of participation — now or never in this item. RECOMMEND: NOT now (no ui.yaml
   surface exists today, cited above; app suite still runs — mirrored arithmetic). Evidence:
   audit of all schema/lab/*.ui.yaml + the BuildMixtureForm/FormulationsPage cite for a future
   card.
4. Fold the secondary P-read sites (aiPlanningTools.ts:354-355, eventGraph.ts:481-485,
   VendorProductBuilderModal.tsx:68 — all the same preferredRole pick order) into this item or
   file a follow-up. RECOMMEND: fold vendorComposition + aiPlanningTools into LEG 2 (same pick,
   one config key); eventGraph/builder displays to a follow-up display-tier card. Checked: all
   three are read-only picks; none performs arithmetic.

DRAFT COMPLETE


## ORCH RATIFICATION (l2t1710, post advc cycle-1) — File-ownership deltas RATIFIED

advc cycle-1 (reviews/ROLE-AXES-1-advc-c1-l2t1530.md) VERDICT: fix — zero functional defects;
D1/D2/D3 are scope/mechanism items. Orch rulings, first-hand verified (grep-clean gate zero
hits; ontology-terms grep zero):

- D1 RATIFIED: server/src/materials/participationConvention.ts and
  app/src/shared/lib/participationConvention.ts are blessed into File ownership IN as the
  mandatory generic consumers of the spec-mandated config/drafting/composition-participation-
  convention.yaml. The spec's own architecture (interpreter reads data, zero TS policy
  literals) makes a dedicated module necessary; the fraction-convention inline-consumer
  precedent does not fit a vocabulary read by BOTH server and app. Grep-clean, no role
  literals (reviewer-verified).
- D2 RATIFIED as disclosed ripple: aiPlanningTools.ts:702 ('solvent' -> 'material') is
  behaviour-preserving (resolver branches only on kind === 'ingredient' at :747; 11/11 green).
  It must be named as a SCOPE delta in the fix-report, not just as behaviour preservation.
- D3 RULED: the l2t1355 resume mandate explicitly allowed "config/data-driven OR OTHERWISE
  role-literal-free" for the resolver-kind vocabulary; the PROMPT_RESOLVER_KINDS TS-const
  channel contract is the accepted mechanism (resolver kinds are a WIRE contract, not domain
  policy). REMAINING DEFECT the fix run must clear: reconcile the two shipped resolver
  annotations that still name the removed 'solvent' arm (server/src/mcp/tools/
  aiPlanningTools.ts:744, server/src/api/handlers/MaterialPrepHandlers.ts:505) to the shipped
  contract, and state the channel-contract ruling in the report.
- O1/O2 observations noted, NOT gates.
