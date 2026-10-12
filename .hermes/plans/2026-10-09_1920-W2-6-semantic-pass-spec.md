# W2-6-SEMANTIC-PASS — spec DRAFT (l2t1915, 2026-10-09 ~19:20 EDT)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews +
promotes. **NOT promotable until W2-5 merges** (hard dep); every bind to W2-3/W2-4/W2-5 shapes
reads CONFIRM-AGAINST-MERGED-TRUNK and merged trunk wins over every shape assumed here.

GOAL (one sentence): a server-side pass takes the FULL vendor-protocol-candidate record (all
steps, branches, tables, specifications — NO activeStepIds filter, D4) through exactly ONE LLM
call whose model/host/thinking come purely from config (D7, per the InferenceClient +
extractor/drafting-adapter conventions), and lands the result as a W2-5 extraction-draft whose
protocol payload carries intent steps (CONFIRM-AGAINST-MERGED-TRUNK(W2-3 intent step arm)) with
server-bound family branch_axes from the proven deriveBranchAxes/deriveStepVariantAxes machinery,
where every intent/constraint either carries a resolvable evidence anchor into the SAID or stands
explicitly unanchored with an ambiguity span — never a fabricated vendor quotation.

Base examined by composer: lane trunk /mnt/vast/home/brad/git/cl-integration-2 @ docs tip
b6f7095c / code tip 7f4e751b (W2-1+W2-2 merged; W2-3 coder LIVE at l2t1650 off 7f4e751b — its
protocol triplet does NOT exist on trunk; W2-4 drafted-unmerged; W2-5 drafted, pre-reviewed,
OQ1/OQ2 ruled, unmerged). git ALWAYS `-c core.fileMode=false`. Headless item: NEVER
:3001/:5174/:3093/:5193, no browser. exactOptionalPropertyTypes on backend: optional means
ABSENT OR VALUE, never `undefined`.
Screening inputs (corroborating, NOT authority): cl-scout logs /tmp/l2t1915-scout-{drafter,
aiconfig}.log (the xdr scout died silently — that question answered first-hand below); every
file:line cite in §0 was opened by the composer this session.

## 0. TRUNK REALITY (every file:line opened this session at b6f7095c/7f4e751b)

0.1 THE LEGACY FILTERED ROUTE — DO NOT EXTEND, DO NOT REUSE:
- server/src/ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.ts — input field
  `activeStepIds?: readonly string[]` :14; `buildVendorProtocolCompilePrompt(candidate,
  input.activeStepIds)` :78; the filter itself :143-149 (steps filtered by activeStepIds, then
  materials/labware/equipment filtered to active labels/sections :161-163, steps reduced to
  `stepNumber. sourceText` lines :164-167 — it DROPS tables, sections, specifications wholesale).
  Output is an event-graph draft :110-135 persisted under
  artifacts/foundry/protocol-event-graph-drafts :227. This whole file is the legacy literal
  route (eventually retires); W2-6 imports NOTHING from it.
- Its live callers (stays untouched, verified): server/src/protocol-intake/ProtocolIntakeService.ts:937,
  server/src/mcp/tools/vendorProtocolEventGraphDraftTools.ts:36, plus
  ProtocolBuilderHandlers.ts / VendorProtocolEventGraphPromotionService.ts (grep -l list).

0.2 THE PROVEN AXIS MACHINERY — REUSE VERBATIM (pure functions, zero edits expected):
- server/src/ingestion/vendor-protocol/deriveBranchAxes.ts — `deriveBranchAxes(steps):
  BranchAxisLike[]` :167; the cross-step grouping the acceptance clause names ("same-option-key
  steps = ONE axis definition") is its documented Phase-3 behavior :17-25 and :193-229 (group by
  identical option-key sets; shared axisId from option keys :139-143; collision guard :175-178).
  Tests exist: deriveBranchAxes.test.ts, deriveBranchAxes.grouping.test.ts (grouping suite
  header :2, "names the grouped question after the shared options, not a step id" :93).
- server/src/ingestion/vendor-protocol/deriveStepVariantAxes.ts — `deriveStepVariantAxes(steps,
  protocolSections): StepVariantAxis[]` :85; refuses an axis when any dispatch target is
  unresolvable :133-140 or a sibling variant would be hidden :163-175 — "asks nothing, deletes
  nothing" is ALREADY this module's philosophy; W2-6 inherits it.
- Existing rebinding precedent (screening + verified): server/src/protocol-intake/
  deriveDecisionTree.ts:133,179 consumes both; ProtocolExtractionService.ts:1002 consumes
  deriveBranchAxes. Family-side landing: schema/workflow/protocol.schema.yaml `branch_axes`
  :294-298 -> `./datatypes/condition.schema.yaml#/$defs/BranchAxis`. W2-6 may add NOTHING to
  these files (W2-3 owns protocol.schema.yaml; axes land as data in the pass output).

0.3 CONFIG-DRIVEN INFERENCE (the D7 landing surface; zero-hardcode):
- server/src/ai/InferenceClient.ts:50 — `createInferenceClient(config: InferenceConfig)`;
  baseUrl :63, model comes in per-request, apiKey :69-71, enableThinking forwarded as
  `chat_template_kwargs.enable_thinking` :78-92; timeoutMs default 120_000 :53,
  streamIdleTimeoutMs default 300_000 :59; retries x3 transient-only :136-161.
- server/src/config/types.ts — InferenceConfig :244-287: baseUrl :248, model :250, apiKey :252,
  timeoutMs :254, maxTokens :256 (doc default 4096), temperature :258, enableThinking :264,
  thinkingLevels :273, defaultThinkingLevel :275, streamIdleTimeoutMs :282, streamMaxMs :286.
  Profile resolution: `resolveAiProfile(ai)` :235-239 (activeProfile wins; else top-level
  inference) — wired at server.ts:789, server.ts:1001, AnalysisHandlers.ts:114,
  AiRecordDraftHandlers.ts:33, IntentCompileFromPromptHandlers.ts:81.
- Config-driven-model precedents (config.model in the request body, never a literal):
  server/src/extract/OpenAICompatibleExtractor.ts:117 (`model: this.config.model` inside
  requestBody :116-128, response_format json_object :124); server/src/ai/shadowRouterAdapter.ts:167.
  Config-swap-with-zero-code-edits test precedent: server/src/extract/OpenAICompatibleExtractor.config.test.ts.
- Thinking-level-as-DATA convention: server/src/ai/thinkingLevels.ts header :1-25 — the lab
  declares levels in config; an unknown requested level is REFUSED, never downgraded. Consumed
  config-side at ProtocolBuilderHandlers.ts:648 ("How hard should the model think comes from
  config, never from a...").
- The drafting-adapter convention (one call, JSON out, honest failure): exemplars are
  OpenAICompatibleExtractor.ts (request :116-148; `extractJsonObject` fence/sentence/truncation
  walker :42-79; `finish_reason === 'length'` => named 'raise the extractor max_tokens' message
  :356-383; content falls back to reasoning/reasoning_content :338) and the scout-screened
  RunDraftHandlers/AgentOrchestrator pattern (corroborating only).

0.4 THE CANDIDATE + THE DRAFT LANDING SEAM:
- schema/workflow/vendor-protocol-candidate.schema.yaml — additionalProperties:false :10;
  required [kind, source, title, sections, materials, equipment, labware, steps, tables, notes,
  outputs, diagnostics] :11; sections kinds incl. `specifications` :48; steps carry
  `branches: string[]` :119-121 + provenance :122-123; tables :131-150; Provenance requires
  [documentId, pageStart] with pageStart minimum 1 :176-194; source.pageCount :27-29. THE FULL
  CANDIDATE INCLUDES everything the filtered prompt drops: sections (specifications), tables,
  per-step provenance, confidences, uncertainty enums.
- Draft landing: server/src/extract/ExtractionDraftBuilder.ts — `buildExtractionDraft(args):
  ExtractionDraftBody` :66, recordId must start `XDR-` :68-69; kind const 'extraction-draft' :97.
  Server-created today by: POST /extract/upload -> store.create (ExtractHandlers.ts:109,
  skipLint:true), and the compile pipeline passes (ExtractionPasses.ts:229,
  ProtocolExtractPass.ts:104). schema/workflow/extraction-draft.schema.yaml — candidates[] items
  required [target_kind, draft, confidence], additionalProperties:false (:45-49 area), optional
  ambiguity_spans[{path,reason}] and per-candidate status — W2-5's spec §0.1 read this file
  first-hand; treat field-level binds as CONFIRM-AGAINST-MERGED-TRUNK(W2-5).
- W2-5's lifecycle (W2-5 spec DRAFT l2t1651, pre-reviewed, OQ1=revisionOnEditKinds knob,
  OQ2='edit' purpose ruled per handoff l2t1855 §2): promotion rides
  POST /extraction/drafts/:id/candidates/:i/promote (routes.ts:632) -> CandidatePromoter;
  lint-data activation xdr-* (incl. candidate with ambiguity_spans blocks promotion);
  vendor-protocol-candidate joins appendOnlyKinds (config/types.ts:474 default grows) so the
  SAID is 405 APPEND_ONLY on PUT/DELETE. EVERY W2-6 BIND TO THIS IS CONFIRM-AGAINST-MERGED-TRUNK(W2-5).
- W2-3's intent shape (CODER LIVE): spec .hermes/plans/2026-10-09_1305-W2-3-protocol-semantic-
  upgrade-spec.md — $defs/IntentStepPayload (:225+), $defs/StepProvenanceRef = ref constrained
  kind const record + type const vendor-protocol-candidate + optional anchor fields pageStart/
  pageEnd/sectionId/spanStart/spanEnd (:245-252); `intent` is the step discriminator (:282);
  openness caveat RATIFIED (7a85e479 removed additionalProperties:false from 9 literal defs;
  coder's not:{required:[intent]} adaptation ratified — handoff l2t1855 §2). W2-6 references
  THIS SHAPE ONLY AS CONFIRM-AGAINST-MERGED-TRUNK(W2-3 intent step arm) — never pins field names.
- W2-4's ladder (draft l2t1451): rung vocabulary data at schema/registry/provenance-ladder/
  rung-vocabulary.yaml (draft §2.1): DERIVED lineage_required = "a candidate record ref WITH
  document anchors (pageStart nonEmpty)"; a DERIVED conclusion without a visible derivation is
  a lint ERROR (prov-derived-*); transition_policy mints INFERRED_INVARIANT on [inference-pass]
  — W2-6 IS that inference-pass consumer. "ANCHOR ABSENT is representable in data": a protocol
  step simply lacking the (optional) provenance ref + carrying an ambiguity_span is the data
  form; rung names VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION belong to W2-4 and
  appear NOWHERE in W2-6 TS (see §8 bait 6).

0.5 MEASURED PROMPT BUDGET (composer-measured THIS session, tsx, real Zymo chain):
- `extractVendorProtocolCandidate` on resources/vendor_pdfs/
  _d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf (chain proven by
  ZymoGoldenE2E.test.ts:13-45, 17 steps): steps 17, sections 3, tables 2, materials 20,
  equipment 10, labware 10; steps with >=2 branches: 2 (ZymoBIOMICS 96 steps 1 and 4 — the
  shared-option set deriveBranchAxes collapses to ONE axis, grouping suite §0.2).
- Full candidate JSON: **54,329 bytes compact (~13.6K tokens at the chars/4 heuristic)** — this
  is the WHOLE-DOCUMENT payload the filtered route never sends (filtered route ships step lines
  only, §0.1). Fits the workhorse context trivially; it is a real (not hypothetical) number for
  sizing the config budgets below.
- PROTO-AI-12 evidence (cited, not re-derived): .hermes/plans/PROTO-AI-12-s4-report.md — p95
  159 ms over 60 real calls on appliance-2 :8900 CPU (:109) against the signed <=2000 ms gate
  (:2 gate; :126 of the pre-reg); that is the 350M ROUTER (classification-only, tiny prompt),
  NOT a semantic-pass proxy. The same report's honest finding (:117-123): untuned 350M ECHOES
  the token list — 42/60 parse_failure. Consequence for W2-6: the 350M is architecturally
  disqualified as a semantic-pass target by measurement; D7's matrix (qwen3.8-flash-next @
  thunderbeast workhorse vs qwen-4b @ computable datapoint) rides config alone.
- Budget consequences (DATA, not code): InferenceConfig.maxTokens default 4096 (types.ts:256)
  is likely tight for a 17-intent-step answer — the lab raises it per profile in config; the
  parse layer MUST keep the OpenAICompatibleExtractor truncation convention (finish_reason
  'length' -> named error naming the knob, §0.3) so an under-budgeted answer reads as "raise
  maxTokens", never as garbage; timeout defaults 120 s / 300 s idle (InferenceClient.ts:53-59)
  already absorb a minutes-long thinking run.

0.6 PINNED BASELINES (carry, per handoff l2t1855 Baseline facts): server tsc 26 err-lines pin
/tmp/l2t2230-tsc-server.txt (MULTISET per-file+message compare, W2-2 lesson); app tsc 34 only-if
app-touched (app IS untouched here); src/schema+src/lint fail-file SET
{EventGraphEquipmentSchema.test.ts, LabwarePhysicalGeometryData.test.ts}
(/tmp/l2t1130-failfiles-schema-lint.txt); MANIFEST vocab sha 014ca71f...d12c byte-untouched;
goldens expect 15; Wave2NamingCrosswalk.test.ts green UNTOUCHED; records/ +
schema/registry/protocols/ EMPTY of new content.

## 1. SCOPE

IN SCOPE (file-by-file §3):
(a) a pure prompt-builder over the FULL candidate record (no filter, no reduction — the captured
    request must carry sections incl. specifications, tables, all steps incl. every branch
    sentence, materials/equipment/labware/notes/outputs);
(b) ONE LLM call per pass via createInferenceClient with model/host/thinking resolved from
    config (resolveAiProfile — OQ3); parse per the extractor convention (§0.3);
(c) server-side GUARDS as pure functions: anchor resolution (a model-claimed anchor either
    resolves against the candidate or the ref is DROPPED and the intent stands unanchored +
    ambiguity_span), step-coverage ('deletes nothing' — OQ2), deterministic axis binding (the
    draft's branch_axes are the deriveBranchAxes/deriveStepVariantAxes output bound onto the
    family — model-emitted axes are DISCARDED);
(d) the landing: buildExtractionDraft -> store.create an extraction-draft whose candidates[0] =
    { target_kind:'protocol', draft: <W2-3 intent-step protocol payload>, confidence, spans };
    review + promotion are W2-5's existing endpoints — W2-6 mints NO protocol record itself;
(e) tests per §6 (RED-first), incl. captured-request, model-swap, axis-binding, anchor-discipline.

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- VendorProtocolEventGraphDraftService.ts / buildVendorProtocolCompilePrompt /
  VendorProtocolEventGraphPromotionService.ts and every legacy caller — zero diff (git diff
  proof). The legacy literal route stays what it is (eventually retires; not today).
- New record kinds (output stays extraction-draft -> promotion yields kind 'protocol' via W2-5),
  a third IR (D3), new lifecycles, new pipeline YAML/passes (W2-6 is an on-demand service, not a
  compile-pipeline pass), new route FAMILY (OQ1 is one endpoint at most, on the existing
  /extraction surface routes.ts:872-875).
- protocol.schema.yaml / protocol.lint.yaml / datatypes (W2-3 owns; W2-4 owns prov-*; consumption
  only, CONFIRM-AGAINST-MERGED-TRUNK). extraction-draft.* / extraction-promotion.* /
  config/types.ts appendOnlyKinds / RecordHandlers gates — W2-5's files, consumption only.
- W2-2 constraint-vocabulary mirror, W2-1 crosswalk (beyond any mandated admission entry — see
  §8 bait 7), scientist-intent goldens + MANIFEST, records/**, the whole `app/` tree (the review
  UI is W2-8/D8), branch QUESTION-ASKING (D4: questions move downstream to W2-7 realization —
  the pass ASKS NOTHING).
- W2-4 rung vocabulary files — never edited, rung strings never minted by W2-6 code.

## 2. BUSINESS RULES — ALL AS DATA / STRUCTURE, ZERO NEW TS POLICY BRANCHES

2.1 THE PROMPT IS DATA: server/src/extract/prompts/semantic-family-draft.md (NEW), loaded by the
existing frontmatter loader (server/src/extract/prompts/loader.ts — ExtractionPromptMetadata
{target_kind, version, description}; precedent protocol.md frontmatter). It instructs: produce a
protocol payload whose steps are INTENT steps mirroring the input's full step set; emit provenance
refs ONLY as {kind:'record', type:'vendor-protocol-candidate', documentId, pageStart/sectionId/
spanStart/spanEnd copied from the input's own provenance objects} (CONFIRM-AGAINST-MERGED-TRUNK
(W2-3 StepProvenanceRef field names — the prompt text is written against the merged shape at
claim time)); ANY conclusion without such a copy MUST omit provenance (an omitted anchor is
correct behavior, a fabricated anchor is a data corruption); never emit branch_axes (the server
binds them); never drop or merge steps. The prompt carries NO model name, NO endpoint, NO
thresholds. Prompt md is DATA — editing it needs no code change and the model-swap test (§6 T4)
proves the config seam independently of it.
2.2 THE THREE HARD INVARIANTS are structural checks in ONE pure module (§3.2), each with a
machine-readable code, each tested directly:
- SEMANTIC_PASS_ANCHOR_UNRESOLVED — a provenance ref fails resolution: documentId !== the
  candidate's source.documentId, or targets a step/section/table id absent from the candidate,
  or pageStart outside [1, source.pageCount]. Effect: the ref is dropped, the intent stands
  unanchored, an ambiguity_span {path, reason:'SEMANTIC_PASS_ANCHOR_UNRESOLVED'} is recorded.
  Never rewritten onto a different anchor, never kept.
- SEMANTIC_PASS_STEP_COVERAGE — every candidate step id must be accounted for in the draft
  (present as an intent step OR named in a deterministic axis's then_stepIds). Failure
  disposition = OQ2 (recommend: refuse the pass, zero writes; a silently-partial family is
  THE anti-D4 failure).
- SEMANTIC_PASS_AXES_DISCARDED — model-emitted branch_axes/questions/activeStepIds keys in the
  answer are stripped BEFORE validation, deterministically, with the strip recorded as an
  ambiguity_span. The family axes come from deriveBranchAxes(candidate.steps) +
  deriveStepVariantAxes(candidate.steps, candidate.sections) bound verbatim (their refusal rules
  — §0.2 — are the family's rules; the pass adds none, ASKS NOTHING).
2.3 NO NEW POLICY IN HANDLERS: the handler (§3.3) does auth-free plumbing only — read candidate,
call the service, map service codes to {error, details}. Validation of the draft payload is
NOT re-implemented: the payload is validated by the schema+lint wall AT draft review/promotion
(W2-5's store path + W2-3/W2-4 rules ride store.create per W2-5 §0.5). W2-6 adds ZERO lint
rules, zero schema lines (all neighbors' surfaces), zero pipeline passes.
2.4 MODEL/HOST/THINKING = CONFIG ONLY (D7): the service takes an InferenceClient + maxTokens/
temperature as constructor-style deps injected from resolveAiProfile(appConfig.ai) at the wiring
site (server.ts, mirroring :789/:1001); thinking level = inference.defaultThinkingLevel via
thinkingLevels resolution (unknown level REFUSED, thinkingLevels.ts convention). No ai.*.model
literal anywhere in non-test source (§8 bait 4 grep). Swapping the active profile / model is a
config edit with ZERO code edits — proven by T4.

## 3. FILE-BY-FILE PLAN

- W1 server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts (NEW, the service):
  `buildSemanticFamilyPrompt(candidate)` — user content = the FULL candidate record JSON
  (JSON.stringify of the whole payload; the ONLY allowed shaping is appending the step/section/
  table ID INDEX the prompt asks the model to anchor against; NO filtering, NO field-dropping —
  the whole-document rule is D4's inversion, so the serializer is literally `JSON.stringify
  (candidate)`); system content = §2.1 prompt body. `runSemanticFamilyPass(deps, input)`:
  store.read candidate record (kind check) -> one `client.complete({model, messages,
  max_tokens?, temperature?, chat_template_kwargs from resolved thinking level})` -> parse via
  the extractJsonObject walker (import it from OpenAICompatibleExtractor.ts — exported :42) ->
  guards §2.2 -> buildExtractionDraft -> store.create the XDR -> return
  {recordId:'XDR-...', diagnostics}. Deps: {store, client, prompt, maxTokens?, temperature?,
  thinkingLevel?, fetch? — client is an InferenceClient so fetch injection lives in the client} —
  exactOptionalPropertyTypes: `...(x !== undefined ? {x} : {})` idiom.
  Codes: SEMANTIC_PASS_NO_CANDIDATE (kind/record absent), SEMANTIC_PASS_TRUNCATED
  (finish_reason 'length', message names the maxTokens knob — extractor convention §0.3),
  SEMANTIC_PASS_PARSE_FAILED (no JSON object in answer), + the §2.2 codes.
- W2 server/src/ingestion/vendor-protocol/semanticPassGuards.ts (NEW, pure, unit-tested
  directly): `resolveAnchorRefs(draft, candidate)` (§2.2 first code), `assertStepCoverage(draft,
  candidate, axes)`, `bindFamilyAxes(draft, candidate)` (calls the two derive* functions; strips
  model axes). This is the ONLY place the legacy-free guard logic lives; it imports from
  deriveBranchAxes/deriveStepVariantAxes only — NEVER from VendorProtocolEventGraphDraftService.
- W3 server/src/extract/prompts/semantic-family-draft.md (NEW data, §2.1).
- W4 server/src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts (NEW, T1-T3,T5,T6 unit
  harness, fake InferenceClient capturing requests — no HTTP at all).
- W5 server/src/integration/Wave2SemanticPassE2E.test.ts (NEW, T4 + the store-level leg — COPY
  the harness pattern of server/src/integration/extractionE2E.test.ts: initializeApp/createServer
  + in-memory store, test-seam fetch/extractor injection at :150/:206/:215 precedent).
- W6 (ONLY IF OQ1 rules 'route'): server/src/api/handlers/SemanticFamilyPassHandlers.ts (NEW,
  wiring-only: param parse -> service -> code->status map; NO logic) + ONE route line in
  server/src/api/routes.ts under the existing '/extraction/...' family (sibling of :873-875,
  e.g. POST /extraction/vendor-candidates/:recordId/semantic-draft) + the construction line in
  server/src/server.ts (resolveAiProfile -> createInferenceClient -> createHandlers; mirrors
  existing call-site patterns; wiring TS files named explicitly, policy-zero).
- ZERO edits to every other file. If claim-time trunk shows the merged W2-3/W2-5 shapes demand a
  schema/data touch, that is a STOP-and-report, not an improvise.

## 4. HAND-OFF SEAMS (what "via W2-5's lifecycle" binds)

4.1 W2-6's output IS an extraction-draft record (XDR-), target_kind 'protocol' — the ONLY minting
W2-6 does. Review edits (PUT /records/:XDR), promotion (POST routes.ts:632), output kind
'protocol' at promotion, the append-only wall on the vendor-protocol-candidate (which W2-6 READS
via store.read and NEVER mutates — the SAID immutability proof is T6) — all W2-5.
CONFIRM-AGAINST-MERGED-TRUNK(W2-5 xdr-* rule names, ambiguity_spans blocking semantics, the
'protocol'-only target-kind list for wave-2 drafts).
4.2 The draft payload shape (steps[] with `intent` discriminator, StepProvenanceRef fields,
branch_axes datatype) = CONFIRM-AGAINST-MERGED-TRUNK(W2-3 intent step arm) +
CONFIRM-AGAINST-MERGED-TRUNK(W2-3 branch_axes/condition datatype). The fixture answer in W4/W5 is
regenerated against the merged shape at claim time (the T-draft fixture is the coder's FIRST
merge-adapter edit, not a schema edit).
4.3 "unsupported inference is a visible review issue": the data form = intent step WITHOUT a
provenance ref + an ambiguity_span naming its path (W2-5 blocks promotion of span-carrying
candidates — CONFIRM-AGAINST-MERGED-TRUNK(W2-5 xdr-promote-blocked-by-unresolved twin)); if
merged W2-4 prov-* lint additionally errors on anchor-less DERIVED conclusions at protocol scope,
it fires at promotion-time lint — either way the issue is DATA + LINT, never a TS flag, never a
vendor quotation (fabricated anchors die at SEMANTIC_PASS_ANCHOR_UNRESOLVED before the draft is
ever built).

## 5. FIRST TARGETED CHECK (proves the approach early)

`cd <wt>/server && npx vitest run src/integration/extractionE2E.test.ts
src/ingestion/vendor-protocol/deriveBranchAxes.test.ts
src/ingestion/vendor-protocol/deriveBranchAxes.grouping.test.ts
src/ingestion/vendor-protocol/deriveStepVariantAxes.test.ts
src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts`
-> expect ALL GREEN at the claim base (every harness/machinery W2-6 rides works today; note
ZymoGoldenE2E reads resources/vendor_pdfs/... — if it is in the fail-file SET on the claim base,
record it, do not "fix" it). THEN write T1 RED (captured-request completeness) against the fake
client — the first red naming a missing section/table/branch in the captured prompt is the
approach proving itself.

## 6. RED-FIRST TEST PLAN (all headless; one suite per bullet)

T1 full-candidate capture (W4): fake InferenceClient records every CompletionRequest. Input: the
real Zymo candidate (decode chain per ZymoGoldenE2E.test.ts:15-18). RED arms: exactly ONE
complete() call; the user message contains — literally, by string presence — all 17 step ids,
both branchy steps' branch sentences, all 3 section ids incl. the specifications-section content,
both table ids + headers, all 20/10/10 material/equipment/labware ids, source.pageCount; NO
activeStepIds concept anywhere (grep the built prompt for 'activeStep'). This is the D4 clause
proven mechanically.
T2 config-only model swap (W5, copy OpenAICompatibleExtractor.config.test.ts pattern): boot the
service twice from two AppConfig fixtures differing ONLY in ai.inference.model / baseUrl /
thinkingLevels/defaultThinkingLevel; assert captured bodies differ in exactly model, endpoint,
and the resolved chat_template_kwargs/reasoning_effort params — zero code deltas (the test never
edits code between boots; it edits the config object).
T3 Zymo golden draft leg (W4): canned answer fixture (a full intent-step protocol payload over the
Zymo candidate, regenerated against the merged W2-3 shape, incl. two DERIVED intents WITH copied
anchors and one invariant conclusion WITHOUT an anchor) -> pass run -> XDR persisted (store.read
it), draft payload validates against the MERGED protocol schema via Ajv AND reports zero errors
from LintEngine at protocol scope (step-intent-*/legacy-* W2-3 + prov-* W2-4); branch_axes ==
deep-equal deriveBranchAxes(steps)+deriveStepVariantAxes(steps, sections) (Zymo: the step-1/step-4
shared question is ONE axis — the grouping suite's own fixture claim, reused as the acceptance
clause's "same-option-key steps = one axis definition"); all axes retained.
T4 store-level E2E (W5): boot app; POST /records mints a VPC record (schemaId
vendor-protocol-candidate.schema.yaml); run the pass (via the OQ1 endpoint if ruled, else the
service with the booted store — the store seam is identical either way); ONLY new record kinds in
the store == {extraction-draft} (enumerate payloads' .kind); if W2-5 is merged: promote
candidates[0] through routes.ts:632 -> output kind 'protocol' (the full chain, one test).
T5 anchor discipline (W4): canned answers where the model (a) anchors a pageStart beyond
source.pageCount, (b) anchors documentId of another document, (c) anchors a step id that doesn't
exist, (d) copies an anchor CORRECTLY -> (a-c) refs dropped + span recorded + draft survives with
the intent unanchored; (d) ref kept verbatim; in all arms the VPC record's stored sha is
byte-identical before/after (T5-e: the read-only proof, riding W2-5's 405 wall + a direct
store.read hash compare).
T6 nothing-asked / nothing-deleted / axes-discarded (W4): canned answer omitting a step ->
SEMANTIC_PASS_STEP_COVERAGE per OQ2 disposition (zero writes if 'fail' is ruled); canned answer
carrying model-minted branch_axes/questions/activeStepIds -> keys stripped, family axes ==
deterministic axes, strips recorded as spans; canned answer truncated (finish_reason 'length') ->
SEMANTIC_PASS_TRUNCATED naming maxTokens, zero writes; canned answer prose-only ->
SEMANTIC_PASS_PARSE_FAILED, zero writes.

VERIFICATION COMMANDS (exact, at claim base and after):
- §5 first check; then `npx vitest run src/ingestion/vendor-protocol src/extract
  src/integration src/api/handlers src/schema src/lint src/compiler` -> src/schema+src/lint
  fail-file SET == pin §0.6; every other named dir ZERO failed;
  `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts` green UNTOUCHED.
- `npm run typecheck -w server` -> 26 err-lines, per-file+message MULTISET == pin §0.6.
- `git -c core.fileMode=false diff --stat HEAD` (or vs base tip) — owned files ONLY (§3), and
  SPECIFICALLY EMPTY for: server/src/ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.ts,
  schema/workflow/protocol.schema.yaml, schema/workflow/protocol.lint.yaml,
  schema/workflow/extraction-*.yaml, schema/registry/provenance-ladder/**, server/src/extract/
  OpenAICompatibleExtractor.ts, config/types.ts, RecordHandlers.ts, protocol-steps.ts, and
  `diff --stat -- app/ schema/scientist-intent/ records/` -> EMPTY.
- Hard-stop greps (expect ZERO matches in the W2-6 diff's non-test files):
  `grep -rn "buildVendorProtocolCompilePrompt\|VendorProtocolEventGraphDraftService\|activeStepIds\|
  event-graph" <W1,W2,W3,W6 files>` (the no-legacy-reuse + no-event-graph-terminus proof);
  `grep -rn "'qwen\|\"qwen\|baseUrl: \"http\|:8000\|:8900\|thunderbeast\|computable\|appliance"
  <non-test new files>` (zero-hardcode, D7);
  `grep -rn "VENDOR\|DERIVED\|INFERRED_INVARIANT\|LOCAL_REALIZATION" <new non-test ts>` (W2-4 bait);
  `grep -rn "semantic-protocol-family\|semantic-extraction-ir\|realization-plan\|'said'\|'meant'"
  <new files> schema/extract-prompts-new` (forbidden_kinds wall);
  the "no wave-2 route ends at literal-protocol payload or event-graph draft" clause = W6 route
  (if any) returns {recordId: XDR-...} and nothing else, plus the grep wall above, plus T4's
  kinds-enumeration. YAML-reload trap: the new prompt md is read per pass invocation (loader reads
  file per call — verify loader.ts behavior at claim; if a boot cache exists, note stack-restart
  need for manual probes only; tests boot their own app).

## 7. WORKER CONTRACT

- Branch `W2-6-lane2-l2t<token>` off the lane trunk `cl/integration-2` TIP AT DISPATCH (post
  W2-3/W2-4/W2-5 merges — W2-5 is a hard dep; promotion of THIS spec is the queue signal).
- Worktree `<integration>/wt/W2-6-lane2-l2t<token>` (coder creates).
- Unique deliverable: report at TRUNK checkout `.hermes/plans/W2-6-report.wip-l2t<token>.md`
  (W2-2 lesson: report lives in trunk .hermes, not the worktree); final log line `W26 DONE <sha>`.
- Owned files ONLY (§3). Every report citation is an opened file:line. git always
  `-c core.fileMode=false`. Headless only — no :3093/:5193/:3001/:5174, no browser.
- The fixture answer in W4/W5 is authored against the MERGED protocol triplet; if the merged
  shape moved (naming, ref composition), the fixture adapts, the SPEC does not, and any real
  gap = STOP-and-report at cycle-1, not a widened diff.

## 8. REVIEWER BAIT (what the adversarial cycle hunts; pre-empt all of it)

1. LEGACY-REUSE SMUGGLING: any import of buildVendorProtocolCompilePrompt / the draft service /
   any `activeStepIds` concept in new files = reject; the grep (§6) + §5's green ZymoGoldenE2E +
   the empty-diff proof on the legacy file are the defense. The prompt serializer is literally
   JSON.stringify(whole record) — a reviewer who doubts "full candidate" gets T1's per-id list.
2. THE ONE-CALL CLAIM: fake-client spy counts complete() == 1 per pass (T1). Retries inside the
   client are the client's transient-error behavior (InferenceClient.ts:136-161), not a second
   pass; the service itself must never loop/retry/re-ask (no second LLM call for "fix your
   JSON" — that retry pattern belongs to the extractor runner, not this pass; naming it out loud
   pre-empts the F-W25-style "second call" finding).
3. ANCHOR FABRICATION is the security finding of this item: an unverified anchor would launder
   inference into a vendor quotation (the D3/SAID-MEANT sin). Defense: §2.2 resolution runs
   BEFORE buildExtractionDraft, drop-not-rewrite semantics, T5's four arms, and the
   never-mutate-the-VPC sha invariant (T5-e). The drop itself is the ONE allowed mutation of
   model output and it only ever REMOVES a claim of vendor support — it never adds one.
4. D7 HARD-CODE: no model/endpoint literal in non-test source; the §6 grep; config-only swap
   proven by T2; thinking levels resolved from config with unknown-level REFUSAL (thinkingLevels
   convention) — an unknown level silently downgrading to 'off' is exactly the bait.
5. AXIS TRUST: the draft's axes must equal the deterministic derivation even when the model
   emits its own (T6 axes-discarded arm). A model-asked question escaping into the family would
   violate D4 (questions move downstream).
6. RUNG VOCABULARY: W2-4 owns VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION; W2-6's diff
   names them NOWHERE (grep §6) — the pass produces the DATA SHAPE (ref present/absent + span)
   that W2-4's lint reads; it never declares which rung an inference "is".
7. ONTOLOGY TERMS: no new verbs (no `intentType`/`semanticVerbType`/`intentKind` — W2-3 spec's
   own ban), no new kinds, no new CURIEs; Wave2NamingCrosswalk.test.ts UNTOUCHED-green is the
   wall; if the merged crosswalk admission check demands an entry for prompt-descriptive terms,
   that edit belongs to whoever's admission test fails — STOP-and-report, don't self-serve.
8. exactOptionalPropertyTypes sites: request-body optionals (max_tokens/temperature/
   chat_template_kwargs), CompletionResponse reading, guard result spreads, handler error
   details — `...(x !== undefined ? {x} : {})` idiom only; `foo: undefined` = reject.
9. TRUNCATION vs PARSE GARBAGE: finish_reason 'length' must yield SEMANTIC_PASS_TRUNCATED
   naming the config knob (extractor convention §0.3), never a partial draft (T6).
10. W2-5 RULE NAMES / SPAN SEMANTICS are consumed, never asserted from memory: every xdr-*
    reference in code comments cites the MERGED file at claim time; T4's promotion leg (if W2-5
    merged) is the proof, else the leg is declared pending at cycle-1 — not faked with a local
    copy of the promote logic.
11. SCHEMA WALL HONESTY: W2-6 does NOT Ajv-validate the draft payload itself with a private
    validator (that would be a second policy source); the wall is store/promotion lint per
    W2-5 §0.5 + T3's in-test Ajv+LintEngine proof. If the merged W2-5 shows drafts created with
    skipLint:true (ExtractHandlers.ts:113 precedent), that is fine for drafts (unvalidated by
    design — extraction-draft.schema.yaml 'draft' description) — validation bites at promotion,
    which is W2-5's wall and T4's promotion leg.
12. PROMPT FILE = DATA: the §2.1 prompt lives in the prompts dir like every other extraction
    prompt (frontmatter loader convention); a model-behavior tweak is a prompt/config edit, never
    a TS edit — reviewer reject if a one-liner instruction lands as a TS string constant.

## 9. ACCEPTANCE CRITERIA (VERBATIM from the task block `verified by:`, numbered for the gate)

  Headless: (A1) captured request proves one added call receives full candidate incl.
  specifications/tables/all branches; (A2) Zymo fixture output validates schema+lint with
  intents, typed constraints, all axes retained; (A3) same-option-key steps = one axis
  definition, extraction asks nothing and deletes nothing; (A4) swapping the configured model
  changes the request with zero code edits; (A5) no wave-2 route ends at literal-protocol
  payload or event-graph draft.

Clause -> proof map: A1 = T1; A2 = T3 (+T4 when W2-5's promotion leg merges); A3 = T3 axis
deep-equal + T6 (coverage/asks-nothing via axes-discarded + no question surface in §3 files);
A4 = T2; A5 = §6 greps + W6 return-shape + T4 kinds-enumeration + the empty-diff proof on the
legacy service. Item-text bindings honored: D4 full-candidate/no-filter input, axes reuse,
questions downstream (OQ2 disposition per ruling); D7 config model (T2); PROTO-AI-12 sizing
evidence consumed in §0.5, 350M disqualified by its own measured echo failure; "the event-graph
draft service stays what it is" = empty diff + §1 out-of-scope.

## 10. Open questions for orchestrator (composer could not resolve locally)

OQ1 — TRIGGER SURFACE: the task says "Server pass"; headless tests need only a service, but a
server pass that nothing can invoke is a library, not a pass. Options: (i) service-only for this
item, endpoint lands with W2-8's review surface; (ii) ONE endpoint on the EXISTING /extraction
family (routes.ts:872-875 already hosts /extraction/protocols/draft etc.), wiring-only per §3-W6.
Checked: routes.ts extraction endpoints, W2-5's "extend existing routes, zero new family" ruling,
no existing route reaches a semantic draft today. RECOMMENDATION: (ii) — it makes A5 testable at
the route level and is not a new family. Smallest ruling: "(i)" or "(ii) endpoint at
/extraction/vendor-candidates/:recordId/semantic-draft".
OQ2 — MISSING-STEP DISPOSITION (SEMANTIC_PASS_STEP_COVERAGE): (a) refuse the pass with zero
writes (machine-readable code names the missing step ids); (b) land a partial draft with
ambiguity_spans naming the omissions (promotion then blocks on W2-5's span rule, so it stays
visible). Checked: W2-5 xdr-promote-blocked-by-unresolved twin (draft §2.1), deriveStepVariantAxes'
own refuse-don't-hide precedent (:133-140, :163-175). RECOMMENDATION: (a) — a half-family is the
exact inversion the memo reverses; a retry at a different thinking level is a config act. If the
model proves flaky in PROTO-AI-13 telemetry, (b) is the fallback. Smallest ruling: "(a)" or "(b)".
OQ3 — CONFIG PLUMBING: (a) reuse `resolveAiProfile(appConfig.ai).inference` (the active profile
IS the semantic-pass model; swapping = switching ai.activeProfile — zero new config surface,
matches D7's "try different models" intent, precedent server.ts:789/:1001); (b) a dedicated
`ai.semanticPass` optional block (own model/baseUrl/thinkingLevels) falling back to the profile
(mirrors shadowRouter's optional-block precedent, config/types.ts + loader.ts:331-356). Checked:
resolveAiProfile, shadowRouter block, ProfileBuilder/ProtocolBuilder handlers all read the
profile inference block. RECOMMENDATION: (a) — one model knob, one meaning; (b) duplicates the
endpoint config for a datapoint that a profile switch already serves. Smallest ruling: "(a)" or
"(b)".

## 11. Assumptions

- AS-W26-COMPOSED-PRE-DEPS: composed against 7f4e751b code tip with W2-3 live / W2-4,W2-5
  drafts; every neighbor-shape bind is CONFIRM-AGAINST-MERGED-TRUNK; merged trunk wins; the
  fixture (not the spec) adapts at claim.
- AS-W26-SCOUT-XDR-SILENT-DEATH: the extraction-draft creation trace came from first-hand reads
  (ExtractHandlers.ts:109, ExtractionDraftBuilder.ts:66-69, routes.ts:629-633/872-875) after the
  xdr scout produced an empty log; no scout claim is load-bearing in this spec beyond
  corroborating cites that were re-opened.
- AS-W26-CANDIDATE-PERSISTENCE: the pass input is a STORED vendor-protocol-candidate record; if
  no flow persists one by claim time (W2-5 §4 same finding — grep-confirmed none today), the
  acceptance tests mint it via POST /records (SchemaRegistry makes the kind mintable) and the
  forward-binding posture matches W2-5's §4 language verbatim.
- AS-W26-ZYMO-GOLDEN-HEALTH: ZymoGoldenE2E is assumed green on the claim base (it is not in the
  pinned fail-file SET /tmp/l2t1130-failfiles-schema-lint.txt per §0.6); §5 re-checks.
- AS-W26-CHARS4-TOKEN-HEURISTIC: the ~13.6K-token figure in §0.5 is a chars/4 estimate on real
  bytes (54,329 measured); no tokenizer run was done — the number is for budget sanity, not a gate.

COMPOSED 2026-10-09 ~19:20 EDT by cl-spec-composer (l2t1915). All §0 cites first-hand at trunk
b6f7095c/7f4e751b this session (Zymo numbers measured by executing the real extract chain under
tsx); cl-scout used for breadth only, both returned logs re-verified before citing, one scout
died silently and was replaced by first-hand tracing.


===============================================================================
PROMOTION RECORD — orchestrator l2t0415 (2026-10-10 ~04:40 EDT). THIS RECORD
OVERRIDES STALE DRAFT TEXT WHERE THEY CONFLICT. Verified FIRST-HAND at the
post-W2-5 merged trunk (merge fcce2212; W2-5 diff base 78bee2c8).
===============================================================================
P1. REF-SHAPE DRIFT (BINDING for prompt text, guards, and tests): merged
    StepProvenanceRef (protocol.schema.yaml:1013, W2-5 widened it) requires
    [kind, type, id, pageStart] with additionalProperties:false. THE FIELD IS
    'id' = the SAID candidate record's OWN recordId — NOT 'documentId'. Every
    draft occurrence of 'documentId' in anchor-resolution language (§2.1/§2.2,
    SEMANTIC_PASS_ANCHOR_UNRESOLVED wording, §6 fixtures) means ref.id === the
    candidate's recordId. Resolution: ref.id === candidate recordId;
    pageStart in [1, source.pageCount]; sectionId must name an existing
    candidate section id. type enum is now
    [vendor-protocol-candidate, evidence] (closed) at BOTH $defs sites.
P2. OQ3 RE-RULED (a)->(b) (BINDING, supersede §7 OQ3=(a) above): model
    resolution = OPTIONAL ai.semanticPass config block (model/baseUrl/thinking
    OPTIONAL; MISSING/absent => fallback to resolveAiProfile(appConfig.ai)
    .inference — the shadowRouter optional-block precedent, config/types.ts:178
    pattern + read-per-call loader). Server-side block + loader validation +
    the service reading it at ONE resolution seam land WITH W2-6 (seam is
    W2-6-owned); W2-9 owns only the /settings UI section + config write path.
    The model-swap test T4 must prove: editing the ai.semanticPass block
    changes the outbound request with zero code edits; REMOVING the block
    falls back to the active profile. No model/host literal in source (D7).
P3. ROUTES (verified at post-W2-5 trunk): W2-5 promote/reject routes live in
    the extractHandlers family at routes.ts:632-633; the new
    POST /extraction/vendor-candidates/:recordId/semantic-draft endpoint (OQ1
    ruling (ii)) belongs to the SAME extractHandlers family (wiring beside
    :632, handler in ExtractHandlers), NOT the legacy :872-875 protocolHandlers
    block. Route-level A5 proof per spec stands.
P4. W2-5 MERGED SHAPES you ride (first-hand at fcce2212): extraction-draft
    lint ACTIVE (xdr-promote-blocked-by-unresolved / xdr-promote-requires-
    resolvable-target / xdr-promoted-candidate-anchored in
    extraction-draft.lint.yaml); vendor-protocol-candidate is now in
    appendOnlyKinds DEFAULT_CONFIG (server/src/config/types.ts) — the candidate
    record is IMMUTABLE via update/delete (405 APPEND_ONLY): your tests mint
    candidates via POST /records and must NEVER PUT/DELETE one; promotion via
    routes.ts:632 emits audit event candidate_promoted; promoted protocols are
    BORN DRAFT (state-spoof closure PROMOTION_CONTROLLED_ESCALATION — do not
    try to promote directly to ACTIVE); revisionOnEditKinds defaults
    ['extraction-draft'] (review edits capture revision + record_revised audit).
P5. BASELINES at your claim base (post-W2-5 merge, fcce2212): server tsc
    primary-error multiset = /tmp/l2t0415-tsc-server.txt (26 lines, measured
    on the W2-5 worktree at e381e324 == merged content of server/); scoped
    fail-file SET (src/schema src/lint src/integration src/api/handlers
    src/store src/revisions src/governance) = the 11 files listed in the W2-5
    report §0 (EventEditorFixHandlers, ExtractHandlers, MeasurementHandlers.
    applianceJob, SignatureHandlers, WorkspaceHandlers, AuditEventService,
    extractionE2E, RevisionStorage, EventGraphEquipmentSchema,
    LabwarePhysicalGeometryData, LifecycleBypassAudit; 16 failed tests) —
    re-measure fresh once in the claim worktree; your tests may only ADD
    passing files, never new failures. /api/health lintRules baseline moves
    to 77+3+1+... measure after boot and record the delta vs 77 in your
    report (W2-5 added 3 xdr + 1 xpr).
P6. Goldens MANIFEST (server/src/compiler/scientistIntent/goldens/MANIFEST.
    yaml, sha 873e1343... at fcce2212) + schema/scientist-intent/ + app/
    diff EMPTY — hard-stop. records/ untouched (tests mint via API/store only).
P7. AS-W26-CANDIDATE-PERSISTENCE stands, and is EASIER now: the kind is
    mintable and lint-active; POST /records with a valid vendor-protocol-
    candidate payload (schema-conformant incl. provenance sections) is the
    only sanctioned mint path (PUT will 405 by design — that immutability is
    W2-5's accepted behavior, not a bug to fix).
