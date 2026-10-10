# W2-6-SEMANTIC-PASS — report l2t0430 (branch W2-6-lane2-l2t0430, base fcce2212)

Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-09_1920-W2-6-semantic-pass-spec.md
(md5 6b34186ac6aa3e75c58f5c70cc1837c5 — verified at dispatch; PROMOTION RECORD P1-P7 honored throughout).

## 0. FRESH BASELINE CAPTURE (re-measured once, first-hand, in this worktree)

0.1 Worktree bootstrap finding (fixed before any code work): the dispatched
worktree was MISSING 67 of trunk's 114 untracked/ignored lane-synced entries
(comm -3 of `git status --porcelain -uall --ignored=matching` trunk vs lane).
That shifted the tsc baseline to 44 lines (TS2307 module-not-found for
lane-synced files: materialRefFields, AuthoringGuard, BypassAudit,
labwareDefinitionSearch, TubeSizeRegistry, RunStartGateService,
materializeBranchCandidate, ...). Replicated 1:1 from the TRUNK worktree
(symlinks as symlinks, per the lane-bootstrap protocol). Post-fix parity:
comm -3 shows only the 11 entries whose ignore-classification differs
(node_modules/app/node_modules/model.pkl/receipts/e2e scratch — all excluded
by lane-exclude-W2-6-l2t0430) and empty dirs (server/tmp/). core.excludesFile
= /home/brad/.hermes/cl/lanes/2/lane-exclude-W2-6-l2t0430 (124 lines) — never
staged any excluded path.

0.2 Scoped fail-file SET (fresh, at base, before any edit):
`npx vitest run src/schema src/lint src/integration src/api/handlers src/store
src/revisions src/governance`
-> Test Files 11 failed | 99 passed | 5 skipped (115); Tests 16 failed | 1051
passed | 53 skipped (1125). The 11 files == the W2-5 report §0 pin exactly:
EventEditorFixHandlers, ExtractHandlers, MeasurementHandlers.applianceJob,
SignatureHandlers, WorkspaceHandlers, AuditEventService, extractionE2E,
RevisionStorage, EventGraphEquipmentSchema, LabwarePhysicalGeometryData,
LifecycleBypassAudit. Two known environmental (recorded, NOT fixed):
(a) extractionE2E PDF-cwd ENOENT (server/resources/vendor_pdfs/Bulletin_6816.pdf
— test resolves process.cwd()/resources, file lives at repo root);
(b) ExtractHandlers upload-spy shape drift (envelope.objectContaining({kind})
vs RecordEnvelope having no kind field).

0.3 Server tsc primary-error multiset vs pin /tmp/l2t0415-tsc-server.txt:
26 lines; coords stripped (`sed -E 's/\([0-9]+,[0-9]+\)//'`), sorted ->
diff EMPTY (TSC_MULTISET_MATCH). Re-verified after all edits: still 26 == pin.

0.4 /api/health lintRules after boot: 81 (recorded from the booted E2E app:
`W26_HEALTH_LINTRULES 81`). Delta vs the 77 pre-W2-5 baseline: +4 (W2-5's
3 xdr + 1 xpr). W2-6 added ZERO lint rules.

0.5 src/compiler pre-existing failures (NOT in the dispatch scoped SET but in
the spec §6 verification command): base-vs-head proof via
`git stash push -u -m w26-base-check -- <my 11 changed paths>`:
base: 37 failed | 1277 passed (1314), 17 fail-files; head: 37 failed | 1277
passed, fail-file SET diff EMPTY (COMPILER_FAILSET_IDENTICAL_TO_BASE). Zero
new failures from W2-6.

## 1. FIRST TARGETED CHECK (spec §5, verbatim tail)

`npx vitest run src/integration/extractionE2E.test.ts
src/ingestion/vendor-protocol/deriveBranchAxes.test.ts
src/ingestion/vendor-protocol/deriveBranchAxes.grouping.test.ts
src/ingestion/vendor-protocol/deriveStepVariantAxes.test.ts
src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts`

  FAIL  src/integration/extractionE2E.test.ts > ... full pipeline: upload PDF → extract → draft → promote → canonical + audit
  Error: ENOENT: ... server/resources/vendor_pdfs/Bulletin_6816.pdf
  Test Files  1 failed | 4 passed (5)
        Tests  1 failed | 24 passed (25)

The single failure is the §0.2(a) pre-existing environmental hole (in the base
fail-file SET — recorded, not fixed). All machinery W2-6 rides (deriveBranchAxes,
grouping, deriveStepVariantAxes, ZymoGoldenE2E) GREEN at base.

## 2. WHAT LANDED (spec §3 files)

W1 server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts (NEW):
buildSemanticFamilyPrompt — user content is literally JSON.stringify(whole
candidate) + the ID INDEX (the only allowed shaping); system content = the §2.1
prompt body via loadExtractionPrompt (loader.ts readFileSync :102 = read-per-call,
prompt-md edits need no restart). runSemanticFamilyPass: store.get candidate
(kind-checked, READ-ONLY) -> ONE client.complete -> extractJsonObject (imported
from OpenAICompatibleExtractor.ts :42) -> guards -> buildExtractionDraft ->
store.create XDR. Codes: SEMANTIC_PASS_NO_CANDIDATE, SEMANTIC_PASS_TRUNCATED
(finish_reason 'length' -> message names the maxTokens knob), SEMANTIC_PASS_PARSE_FAILED,
SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL (refusal, thinkingLevels convention),
+ the §2.2 codes from guards. THE ONE resolution seam: resolveSemanticPassInference
(P2 ruling (b)): optional ai.semanticPass block merged OVER
resolveAiProfile(ai).inference; absent block => the profile verbatim.

W2 server/src/ingestion/vendor-protocol/semanticPassGuards.ts (NEW, pure):
resolveAnchorRefs (drop-not-rewrite), assertStepCoverage, bindFamilyAxes
(imports deriveBranchAxes/deriveStepVariantAxes ONLY).

W3 server/src/extract/prompts/semantic-family-draft.md (NEW data; frontmatter
target_kind/version/description per loader convention; no model name, no
endpoint, no thresholds).

W4 server/src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts (NEW,
15 arms) + semanticPassFixtures.ts (shared harness: real-PDF-decoded Zymo
candidate + fake InferenceClient spy + the 17-intent-step canned answer).

W5 server/src/integration/Wave2SemanticPassE2E.test.ts (NEW, 7 arms): real
initializeApp/createServer + throwaway tmp git store + CONFIG_PATH pin (W2-5
harness pattern) + a node:http mock endpoint so the REAL createInferenceClient +
server.ts wiring run against it — the captured body is the real normalized request.

W6 wiring (OQ1 (ii) + P3): semanticDraft added to the ExtractHandlers family
(server/src/api/handlers/ExtractHandlers.ts — wiring-only: param parse ->
service -> code->status map); ONE route line in routes.ts BESIDE :632-633
(POST /extraction/vendor-candidates/:recordId/semantic-draft), NOT the legacy
:872-875 protocolHandlers block; construction in server.ts beside the existing
createExtractHandlers line (resolveSemanticPassInference -> createInferenceClient
-> pre-bound SemanticPassRunner). Config seam: SemanticPassConfig interface +
AIConfig.semanticPass in config/types.ts (shadowRouter optional-block precedent,
:178 pattern) + loader validation block in config/loader.ts (mirrors the
shadowRouter validation shape).

ZERO edits to every other file. No schema/lint/pipeline edits. No new record
kinds. No rung strings. No model/host literals.

## 3. P1 CORRECTION (documentId -> ref.id) where code diverges from stale draft text

The draft §2.1/§2.2 wording says refs carry `documentId`. Per the BINDING
promotion record P1, the merged StepProvenanceRef (protocol.schema.yaml:1013,
required [kind, type, id, pageStart], additionalProperties:false) uses `id` =
the SAID candidate's OWN recordId. Implemented accordingly:
- prompt text: `"id": "<the candidate record id from the ID INDEX>"` (the ID
  INDEX names the candidate record id explicitly).
- resolveAnchorRefs: `ref.id !== candidateRecordId` -> drop (message: "ref.id
  must be the candidate record's own id (<recordId>)"). pageStart in
  [1, source.pageCount]; sectionId must name an existing candidate section id.
- type enum closed [vendor-protocol-candidate, evidence] respected: guards
  accept only type === 'vendor-protocol-candidate' for candidate anchors.
- T5 arm (b) tests "ref.id names another document" (the draft's "documentId of
  another document" arm, re-expressed against the merged shape).

## 4. T1..Tn -> §10 ACCEPTANCE WALKTHROUGH (Wave2SemanticFamilyPass.test.ts 15/15, Wave2SemanticPassE2E.test.ts 7/7)

A1 (captured request proves one added call receives full candidate incl.
specifications/tables/all branches) = T1: exactly ONE complete() call; user
message contains literally all 17 step ids, both branchy steps' (step-1/step-4)
branch sentences, all 3 section ids incl. specifications content, both table
ids + headers, all 20/10/10 material/equipment/labware ids, source.pageCount
(31); NO 'activeStep' concept anywhere in the built prompt (grep arm).
buildSemanticFamilyPrompt arm: user.startsWith(JSON.stringify(candidate)) ===
true. NO activeStepIds concept exists in any new file (grep: 0 hits).

A2 (Zymo fixture output validates schema+lint with intents, typed constraints
slot, all axes retained) = T3: canned 17-intent-step answer (two DERIVED
intents WITH copied anchors, one invariant conclusion WITHOUT an anchor) ->
XDR persisted; protocol payload validates against the MERGED protocol schema
via the whole-tree Ajv harness (Wave2ProtocolIntentSchema pattern) with ZERO
errors; LintEngine at protocol scope (real protocol.lint.yaml from disk): ZERO
error-severity findings; the anchor-less invariant step rides the
intent-step-provenance-visible WARNING (absence as DATA, never a vendor
quotation). Promotion leg (T4 suite): promote candidates[0] through
routes.ts:632 -> 200, output kind 'protocol', state 'draft' (born draft, P4),
17 steps, 1 branch_axes.

A3 (same-option-key steps = one axis definition; asks nothing, deletes nothing)
= T3 axis deep-equal: draft.branch_axes == deriveBranchAxes(steps) +
deriveStepVariantAxes(steps, sections) verbatim; Zymo's step-1/step-4 shared
option set is ONE axis (axisId names the shared options, not a step id; both
conditions' then_stepIds == [step-1, step-4]); all axes retained. T6 coverage
arm: canned answer omitting step-8 -> SEMANTIC_PASS_STEP_COVERAGE with
details.missingStepIds == ['step-8'] and ZERO writes (OQ2 ruling (a)); the
refusal happens AFTER the one call, never a re-ask. T6 axes-discarded arm:
model-minted branch_axes/questions/activeStepIds -> stripped generically
(answer contract is {steps} only), family axes == deterministic axes, each
strip recorded as a SEMANTIC_PASS_AXES_DISCARDED span.

A4 (swapping the configured model changes the request with zero code edits) =
T4 config-swap: boot A config carries ai.semanticPass {model: swap-model-a,
baseUrl: mock, maxTokens: 8192, thinkingLevels.deep/defaultThinkingLevel: deep};
boot B config has NO block and profile model profile-model-b. The test edits
the CONFIG OBJECT only — zero code deltas between boots. Captured outbound
bodies (real createInferenceClient -> mock): A: model 'swap-model-a',
max_completion_tokens 8192, chat_template_kwargs {enable_thinking: true};
B: model 'profile-model-b', NO max_completion_tokens, NO chat_template_kwargs.
Unit seam arms: partial block overrides only the named field (model swap keeps
profile baseUrl); absent block => profile verbatim. Unknown defaultThinkingLevel
=> SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL refusal, zero writes, zero calls
(bait 4). Loader validation: valid block passes validateConfig; malformed
(maxTokens: 'many') throws ConfigValidationError.

A5 (no wave-2 route ends at literal-protocol payload or event-graph draft) =
route arm: POST /extraction/vendor-candidates/:recordId/semantic-draft returns
keys exactly {recordId, diagnostics}; body contains no 'eventGraph', no
'"steps"'. Kinds enumeration: the only NEW records after a pass are
{extraction-draft}. Empty diff on VendorProtocolEventGraphDraftService.ts and
every legacy caller. Hard-stop greps (§6) on the W2-6 diff's added lines:
buildVendorProtocolCompilePrompt / VendorProtocolEventGraphDraftService /
activeStepIds / event-graph -> 0; 'qwen / baseUrl: "http / :8000 / :8900 /
thunderbeast / computable / appliance -> 0 (the only 'computable' hits in
touched files are pre-existing schema $id URLs and the pre-existing
event-graph-agent prompt default, both outside my added lines);
VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION in new non-test TS -> 0;
semantic-protocol-family/semantic-extraction-ir/realization-plan/'said'/'meant'
-> 0 (forbidden_kinds wall in schema/registry/wave2-naming-crosswalk.yaml read;
Wave2NamingCrosswalk.test.ts UNTOUCHED-green 6/6).

T5 anchor discipline (4 arms + sha): (a) pageStart beyond pageCount, (b) ref.id
of another document, (c) sectionId naming a nonexistent section -> ref DROPPED,
SEMANTIC_PASS_ANCHOR_UNRESOLVED span recorded, draft survives with the intent
unanchored; (d) correct copied anchor kept VERBATIM. In every arm the VPC
payload is byte-identical before/after. Store-level: candidate contentSha
unchanged across pass+promote; PUT on the candidate -> 405 APPEND_ONLY (W2-5's
wall).

Truncation/parse (bait 9): finish_reason 'length' -> SEMANTIC_PASS_TRUNCATED
naming maxTokens, zero writes; prose-only -> SEMANTIC_PASS_PARSE_FAILED, zero
writes.

## 5. CAPTURED-REQUEST EXCERPTS (proof of FULL candidate + one call)

Probe (scratch/probe-capture.cts, real Zymo chain):
  SYSTEM head: "You are given the COMPLETE vendor-protocol-candidate record as JSON, followed by\nan ID INDEX naming the candidate's own "
  USER head: "{\"kind\":\"vendor-protocol-candidate\",\"source\":{\"documentId\":\"vendor-protocol-zymo-magbead\",\"filename\":\"_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf\",\"title\":\"ZymoBIOMICS 96 MagBead DNA Kit\",\"pageCount\":31,...
  USER tail: "Candidate record id: CAN-w26-zymo\nStep ids: step-1, ..., step-17\nSection ids: section-product-contents, section-specifications, section-protocol\nTable ids: table-product-contents, table-sample-input"
  user bytes: 54660; startsWith(JSON.stringify(candidate)) == true; contains
  'specifications', 'table-sample-input', the step-4 branch sentence 'centrifuge
  at ≥ 10,000 x g for 1 minute', '"pageCount":31', 'step-17' — all true.
E2E mock captures (boot A): exactly 1 POST /v1/chat/completions per pass;
body.model 'swap-model-a', max_completion_tokens 8192, chat_template_kwargs
{enable_thinking:true}, messages length 2.

## 6. VERIFICATION COMMAND TAILS (verbatim)

- scoped suite AFTER changes: Test Files 11 failed | 100 passed | 5 skipped
  (116); Tests 16 failed | 1058 passed | 53 skipped (1132). Fail-file SET diff
  vs base SET: EMPTY (SCOPED_FAILSET_IDENTICAL). My suites ADD 2 passing files
  (+7 tests), zero new failures.
- `npx vitest run src/ingestion/vendor-protocol src/extract src/integration
  src/api/handlers src/schema src/lint src/compiler`: 25 failed files — every
  one is in the base fail SET (11 scoped) or the §0.5 compiler base SET (17,
  proven identical base-vs-head by stash).
- `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts`: 6 passed (UNTOUCHED).
- `npm run typecheck -w server`: 26 error lines, multiset == pin (TSC_MULTISET_MATCH).
- W4 suite: 15 passed; W5 suite: 7 passed.
- `git -c core.fileMode=false diff HEAD --stat -- <hard-stop paths>` EMPTY for:
  VendorProtocolEventGraphDraftService.ts, protocol.schema.yaml,
  protocol.lint.yaml, extraction-*.yaml, schema/registry/provenance-ladder/,
  OpenAICompatibleExtractor.ts, RecordHandlers.ts, server/src/compiler/pipeline/
  (SchemaValidateDraftPass / PromotionCompileRunner / PromotionExtractionPasses
  untouched — F-dispositions inherited from W2-5 respected), app/,
  schema/scientist-intent/, records/, wave2-naming-crosswalk.yaml.
  MANIFEST sha1 3b8d90509bc694a1d2ae2638757c93b0459581c3 byte-untouched.

## 7. RECORDED FINDINGS (recorded, NOT fixed — none widened my diff)

F1 (inherited, environmental): extractionE2E PDF-cwd ENOENT; ExtractHandlers
upload-spy shape drift. Both in the base SET.
F2 (inherited, re-verified first-hand): POST /records CANNOT mint
vendor-protocol-candidate — the handler's FAIR stamping (createdAt/updatedAt/
createdBy) collides with the candidate's additionalProperties:false (422 arm
in W5 suite). Sanctioned mint path: store.create (the extraction mint path),
as W2-5 §(e) recorded. P7's "mintable" holds at the store level.
F3 (new, recorded): the boot's ensureLocalAdminUser bootstrap FAILS validation
at this base (merged user.schema.yaml requires `email`; the bootstrap payload
has none) -> record-API routes answer 401 UNAUTHENTICATED. W5 seeds a
schema-valid test user to reach the append-only wall. Not fixed (out of scope).
F4 (new, recorded merge-drift): ExtractionDraftBuilder emits snake_case
`created_at`, but the MERGED extraction-draft.schema.yaml is
unevaluatedProperties:false over FAIRCommon (createdAt camelCase) — the store
wall rejects created_at (probe-verified). W2-5's own seedDraft omitted it for
the same reason. My service maps created_at -> createdAt at the landing
(merge-adapter, per §7 "the fixture adapts, the spec does not"). The builder
itself is NOT edited (not mine).
F5 (new, recorded): the real Zymo extractor candidate carries `concentration`
on step actions that the closed candidate schema does not admit; the E2E mint
strips it (T1 completeness ran against the UNstripped real candidate).

## 8. diff --name-only (ONE final commit)

server/src/api/handlers/ExtractHandlers.ts
server/src/api/routes.ts
server/src/config/loader.ts
server/src/config/types.ts
server/src/extract/prompts/semantic-family-draft.md
server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts
server/src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts
server/src/ingestion/vendor-protocol/semanticPassFixtures.ts
server/src/ingestion/vendor-protocol/semanticPassGuards.ts
server/src/integration/Wave2SemanticPassE2E.test.ts
server/src/server.ts
(+ this report). Scratch probes live in server/scratch/ and are NOT committed.
