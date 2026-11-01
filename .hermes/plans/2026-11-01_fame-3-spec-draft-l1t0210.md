# FAME-3 SPEC DRAFT — l1t0210 (composer draft, pending orchestrator review/promotion)

Item: FAME-3 "Interactive peak->compound assignment: manual UI + AI chat, ontology-backed,
basis-aware (BRAD-DATA gate)" — lane 1, trunk cl/integration-1 (composer worked at HEAD 903c2016;
code tip 5675f5df — the delta is docs-only FAME-1/FAME-2 promotion commits). FAME-2's successor
ANREV + real-bytes peak_table artifacts + chromatogram markers are assumed MERGED FROZEN DATA —
FAME-3 never edits an ANREV/ANR/VSPEC/peak artifact.

Sections: 1 Goal / 2 Code-data boundary / 3-9 Grounding (file:line) / 10 Work items W1-W8 /
11 Out of scope / 12 Acceptance (verbatim) + standing gates / 13 First targeted check /
14 Verification commands / 15 Worker contract / 16 Reviewer bait / 17 Open questions.

## 1. Goal
Make peak->compound assignment interactive and ontology-backed WITHOUT inventing vocabulary: the
gc-method record's existing `analysis.compound_assignments` array becomes the writable home —
manual assignment via the existing record-editor picker (never free text), chat assignment via the
existing drafts compile->card->accept wall (propose-never-write, human accept only, unknown noun ->
never-guess clarification), each assignment carrying a BASIS declaration plus an assignment_state +
provenance AS DATA (schema-governed, zero TS policy), plus a source-noted PROVISIONAL seed map from
FAME-2's standard peak table that Brad verifies at the bench (BRAD-DATA — FAME-4 closes only after).

## 2. Code/data boundary (declarative-first)
CLAUDE.md:147 — code never makes policy decisions; rules live in data.
- ZERO compound names, ZERO RT values, ZERO elution-order logic, ZERO "provisional/verified"
  branching in TypeScript or in the python modules. assignment_state values, basis refs, RT/window
  numbers are RECORD PAYLOAD written via API/UI — data.
- The vocabulary of identity is the EXISTING ref datatype (schema/core/datatypes/ref.schema.yaml):
  `kind: ontology` refs (namespace+id+label required) or `kind: record` refs (id+type required).
  No new ref kind, no new CURIE namespace in code.
- assignment_state gets NO third token: "unassigned" is the ABSENCE of an entry (unknown-is-unknown,
  the gc-method.schema.yaml:46-48 doctrine), never a stored value.
- Basis has NO enum: a missing basis term is a scientist-minted local term via the EXISTING mint
  mechanism (server/src/terms/EnsureTerm.ts + POST /api/vocab/mint, routes.ts:516; lab-profile
  namespace `cf` — schema/registry/lab-profile/lab-profile.yaml:14 `ontologyNamespace: "cf"`).
- Records land in the lane data repo via the API at :3092 — never hand-written YAML, never the code
  repo. Schema/UI-YAML edits (section 10 W3) are the ONLY anticipated schema-repo diffs, and they
  are the ONLY thing that can trip the YAML-reload trap (OQ-1).

## 3. Grounding — the ontology (all first-hand verified this session)
- schema/registry/ontology-terms/fame-local.yaml (78 lines): 6 terms, `kind: ontology-term`,
  ids `FAME-LOCAL:{hexanoic,octanoic,decanoic}-acid-n{6,8,10}` +
  `FAME-LOCAL:methyl-{hexanoate,octanoate,decanoate}-n{6,8,10}`; shape = {kind, id, source: manual,
  label, definition, meta{chebi_id, cas, chain, species: ffa|methyl-ester}}. Header :4-6 states the
  law: the file's NAME is the local identity; ChEBI lives in meta.chibi_id, NEVER as the term id
  (one entity, one local term). **NO palmitate/16:0 term exists** — "15.673 min is palmitate" is an
  UNKNOWN noun today, exactly the clarification leg.
- Loader: server/src/registry/OntologyTermRegistry.ts:24-40 zod schema (source enum includes
  `manual`; meta free-form), :48 directory, :54 singleton. Sibling files: cell-ontology, chebi,
  exact, gene-ontology, manual, ncbi-taxon.
- Consumption doors (verified LIVE at :3092 this session):
  - GET /api/ontology-terms/lookup?id=FAME-LOCAL%3Amethyl-hexanoate-n6 -> 200 with the full term
    (route routes.ts:1190, handler OntologyTermHandlers.ts).
  - GET .../lookup?id=FAME-LOCAL%3Apalmitate -> 404 NOT_FOUND (the never-guess precondition).
  - POST /api/resolve {"term":"palmitate"} (routes.ts:507) -> candidates: [tier-5 mint-only
    "Create local term 'palmitate'"] — the spine ALREADY answers "unknown" with a mint affordance
    and NO invented CURIE. That response is the chat leg's clarification receipt door.
- The ontology-ref write shape is test-pinned: server/src/schema/GcMethodSchemas.test.ts:88-110
  validates compound_assignments with
  `compound_ref: {kind:'ontology', namespace:'FAME-LOCAL', id:'FAME-LOCAL:methyl-hexanoate-n6', ...}`.

## 4. Grounding — compound_assignments today (schema slot; assignment_state ABSENT)
- schema/lab/gc-method.schema.yaml:171-190 — `analysis.compound_assignments` is an array of items
  with `additionalProperties: false` (:175), required [label, compound_ref]; declared props:
  label (:178), compound_ref = ref datatype (:181), **expected_rt_min (:183-185)**,
  **rt_window_min (:186-188, exclusiveMinimum 0)**, response_factor (:189). So the task's
  "expected_rt_min from observed RT + declared rt_window_min" slots EXIST.
- **assignment_state: grep `assignment_state|assignmentState` across the repo = 0 hits** — it does
  not exist in any schema, lint, or enum. Neither do `verified|provisional|unassigned` vocabularies
  for assignments (repo-wide greps: only engine-support enum [supported/approximate/unsupported/
  unverified], schema/knowledge/analysis-engine.schema.yaml:168 — a DIFFERENT entity, do not reuse).
  Because items are `additionalProperties:false`, storing assignment_state + provenance + basis on
  the assignment is a **schema change IN SCOPE for W3** (gc-method.schema.yaml item props + ui.yaml
  slot properties), not a platform gap: the record store validates via the bundled schema corpus
  (config.yaml:16-17 `schemas: source: bundled`). The reload constraint for the LIVE stack is OQ-1.
- Record-level lifecycle exists and is DISTINCT from the assignment's domain qualification:
  gc-method.schema.yaml:275-283 lifecycleId `registry-ops`, state [draft, active, archived],
  with the schema's own comment "DISTINCT from domain status/result fields" — precedent that a
  per-assignment `assignment_state` is NOT a second vocabulary for one entity (the entity is the
  assignment entry, and lifecycle governs the RECORD, not the entry).
- The one existing live example: GCM-DEMO-AOAC-FAME (lane records/gc-method/, GET-verified 200 at
  :3092) carries ONE assignment
  `{label:'C6:0 (hexanoic acid)', compound_ref:{kind:'record', id:'CMP-DEMO-HEXANOIC', type:'compound'}}`
  — see section 5: its target is a DANGLING REF (404 live).

## 5. Grounding — the CMP-* question, answered honestly
The task names "CMP-* material concepts". First-hand facts:
- NO `compound` record kind exists: schema grep `compound` in schema/core/record.schema.yaml = 0;
  no `compound/` directory in the lane records tree (ls verified); registry-kinds.registry.yaml has
  no compound entry. CMP-* appears ONLY in server/src/compiler/pipeline/passes/MintGate.test.ts:27
  (fixture) and the dangling GCM-DEMO ref.
- Live: `curl :3092/api/records/CMP-DEMO-HEXANOIC` -> **404 NOT_FOUND**. The ref datatype permits
  any `type` string (:90-93 `type` is just "required for record refs"), so the dangling ref passes
  schema validation — the store has no referential-integrity gate for record refs.
- DECISION THIS SPEC TAKES: the FAME-3 picker surfaces ONTOLOGY refs (FAME-LOCAL CURIEs, ChEBI in
  meta) — the only compound identity that EXISTS as governed data. `kind: record, type: compound`
  writes are FORBIDDEN in new FAME-3 payloads (the demo's dangling shape must not spread). Whether
  a governed compound concept kind should EXIST is OQ-2 — FAME-3 does not mint a kind.

## 6. Grounding — gc-method edit discipline
- gc-method is a MUTABLE HEAD, not append-only: config.yaml:11-13 `appendOnlyKinds: [audit-event,
  signature]` (gc-method absent; DEFAULT mirror server/src/config/types.ts:562). The write door is
  the generic `PUT /api/records/:id` (routes.ts:243 -> RecordHandlers.updateRecord), lifecycle-gated
  by registry-ops (draft -> active -> archived; registry-kinds.registry.yaml:6-8,29).
- Revision-on-edit is a CONFIG DATA knob, currently `revisionOnEditKinds: [extraction-draft]`
  (config.yaml:14-15; consumer RecordHandlers.ts:1295-1322 — captures a record-revision REV- +
  `record_revised` audit event per edit for listed kinds; immutable `ref.revisionRef` REV- pins
  exist on the ref datatype). Adding `gc-method` to that list is a CONFIG-DATA change (lane
  config.yaml is gitignored runtime config; the repo default lives at types.ts:563) — FAME-3 does
  NOT change it unilaterally; provenance-per-assignment (W3) is the audit trail the item needs
  regardless. Noted for the orchestrator (OQ-1 adjacency).
- The lane stack (:3092) is orch-owned: records via READ-and-CREATE/PUT of the item's OWN new
  records; the coder never restarts, never DELETEs existing records.

## 7. Grounding — the chat propose surface (protocol-edit precedent, verified)
- The trust boundary is the drafts pair: server/src/drafts/draftRoutes.ts:6-16 — POST
  /api/drafts/compile and POST /api/drafts/accept, both through FormDraftService; StagingStore.ts:21
  makes the authoring store prohibit update/delete during compile (staged writes only); the accept
  loop is what touches the real store (FormDraftService.ts:56-60). "No accept control exists until
  the server says canAccept:true; Reject is abandon: zero store calls" —
  app/src/shared/ai/useWorkstateProposalFlow.ts:1-15, :171-183.
- Adapter home: server/src/drafts/adapters.ts:35 `draftAdapters` registry; the recordDraft adapter
  (:94-102) resolves kind -> schema through the schema corpus, DERIVES the id from the declared
  `properties.id.pattern`, "writes nothing until accept", "NO state/status field is ever written".
  Composing NEW records is what today's adapters do; proposing an EDIT to an EXISTING gc-method
  record has NO existing adapter — W6 adds one entry to this DATA-shaped registry (OQ-4 for the
  intent-channel ruling).
- Chat frames: the server emits `record_draft_proposal` (AgentOrchestrator.ts:3259-3335 — emits the
  envelope VERBATIM, "runs NOTHING", error-text names the compile door). The client hook dispatches
  per-frame with a named system bubble when unhandled (useAiChat.recordDraftProposal.test.tsx:83 —
  "the frame is never swallowed"). The EVENT-EDITOR mounts the callback (AiTabPanel.tsx:884);
  **the ANALYSIS mount does not** — app/src/analysis/AnalysisChatPanel.tsx:33-56 wires only
  onWorkstateProposal + onAnalysisProposal, and its `aiContext.surfaceContext` is a hardcoded
  `{}` (:37) — TODAY THE ANALYSIS CHAT CANNOT SEE THE CURRENT RUN. The plumbing exists:
  useAiChat.ts:572 spreads `ctx.surfaceContext` into the outgoing payload. (Answer to "can the
  chat channel see the run context": not yet — W5 plumbs it, one memo, no new machinery.)
- Never-guess is spine doctrine: AgentOrchestrator.ts:565 — "Do NOT output any ontology CURIE you
  were not given in <resolved_context> ... never guess a CURIE"; unknown nouns ground as
  {mint:{label, domain}} mint-candidates; clarification machinery is
  server/src/ai/clarifications.ts (+ forceMaterialClarifications.ts); refusal-before-model-call is
  proven by the write wall (config/drafting/review-write-wall.yaml — walls are DATA; `surfaces:
  [protocol-review]` at :72).
- AI config facts (config.yaml, gitignored runtime — stated, never hardcoded into code):
  `ai.activeProfile: "1017"` (:61, openrouter deepseek); local profiles (lfm2.5-2.6b, qwen3.6/3.8
  appliance/thunderbeast, spark) all declare `maxTokens: 65536` — the known trap; unconfigured
  server-side refusal is a NAMED error (AnalysisHandlers.ts:113 `AI_UNCONFIGURED`; the analysis
  chat health-gates input on the same check, AnalysisChatPanel.tsx:57+).

## 8. Grounding — compute consumption (the honest gap; acceptance leg (manual))
- The shipped quantification module consumes RT/window as RUN PARAMETERS, not as a method ref:
  `quantify_peaks(ctx, params)` server/python-executor-service/src/computable_lab_analysis/
  quantification.py:384; required param `targets[]` each with
  {compound_label, rt_target_min, rt_window_min} — loud PARAM_MISSING on absence (:473-494);
  window-match + multi-match failure semantics :635-642; publishes compound_label/compound_ref
  columns echoing "declared target ref echoed verbatim; null when undeclared or unmatched" (:821,
  :842); `peaks_unassigned` metric (:882). calibration_fit.py:350-357 same window idiom.
- HOW does a gc-method `compound_assignments` entry become a run's `targets[]`? Today: manual
  transcription, and the repo says so — analysisGcIntegration.test.ts:160-165: "Parameters
  transcribed from a gc-method record analysis section 1:1 per the spec §A2 mapping". NO method ref
  exists anywhere on the analysis chain: grep `methodRef|method_ref` in schema/ = 0;
  analysis-run.schema.yaml links ONLY revisionRef (:30) + optional measurementContextRef (:148);
  the revision carries free-text `methodNotes` only (analysis-revision.schema.yaml:56). Parameters
  freeze per run from the revision's parameterSchema (FAME-2 spec §6, ratified).
- Consequence: "re-Analyze with updated method -> compute uses the assignment's RT/window" has NO
  existing automatic door. The spec's W7 implements the SMALLEST data-shaped version (a run whose
  parameters are transcribed from the freshly-PUT method assignment, executed and asserted via the
  quantification module's OWN columns/metrics) — and the exact mechanism (who transcribes) is OQ-3.
  If no door exists at execution time, W7 STOPs with requires-rescope per the standing wave-2 rule.

## 9. Grounding — basis as data (no invented enum)
- Peak = FAME species (what the FID saw): compound_ref points at the FAME-LOCAL methyl-ester term
  (e.g. FAME-LOCAL:methyl-hexanoate-n6, meta.species: methyl-ester, fame-local.yaml:31-40); the
  FFA siblings are the free-acid face (:21-30). The FID face is the ENTRY's identity; the REPORTING
  face is a declaration, not a rewrite.
- Basis declaration = ONE optional ref on the assignment (W3: `reporting_basis_ref`, ref datatype).
  An absent basis is an ABSENT basis (unknown), never a default. "Both faces visible" = the label
  face (compound_ref term + label) AND the basis note render beside the assignment; NOTHING may
  reconcile one label into the other (bait #5).
- Missing basis term (e.g. fatty-acid-equivalent for "palmitate"): scientist-minted local term via
  the EXISTING mint mechanism — EnsureTerm.ts:1-14 (idempotent TERM-<slug>-<djb2> ids, source
  'human'/'ui'), POST /api/vocab/mint (routes.ts:516), cf-namespace declared as registry DATA
  (lab-profile.yaml:14). The chat's mint-candidate floor is live (§3 resolve probe). No `basis`
  enum is invented; the only schema `basis` today is concentration basis
  (concentration.schema.yaml:9) — different entity, not reused.
- Claim/assertion layer: reviewed /mnt/vast/home/brad/git/computable-lab/docs/
  knowledge-layer-canonical-example.md (read-only; NOT in this worktree — confirmed). Claim/
  assertion/evidence is the HYPOTHESIS layer; a peak->compound assignment is an OBSERVATIONAL
  record on the method, so it lives as gc-method DATA, NOT as a claim record. No claim vocabulary
  is imported.

## 10. Work items (in order; records via API/UI at :3092; code only where named)
W1. Fresh baselines at claim (section 14 commands) + capture pristine trunk SHAs; re-run the First
    Targeted Check (section 13) and RECORD the browser verdict — it gates the W2 shape.
W2. Manual picker leg (bounded product code, RED-first vitest): make the compound-assignments
    array items first-class editable in the taptab document editor so `compound_ref` commits a
    canonical ref via the EXISTING picker machinery, never free text. The verified gap:
    app/src/editor/taptab/documentMapper.ts:321-327 flattens EVERY array-slot property to
    `{type:'string', title}` — the slot's declared `widget: "ref"`
    (schema/lab/gc-method.ui.yaml:257-267) is DROPPED, so today's array items cannot render the
    ref picker that exists one layer up (WidgetRenderer.tsx:345-363 record-ref/RefCombobox arms).
    The fix is generic and shape-only: forward each property's declared widget/refKind through the
    mapper (same conditional-spread idiom as the WIDGET-R1 itemHint/objectConfig forwarding,
    documentMapper.ts:310-345) and render typed item sub-fields via the existing widget switch.
    FORBIDDEN in the diff: a compound/FAME literal, 'gc-method'/'compound_assignments', an
    item-kind branch. Files in scope: documentMapper.ts (+ test) and the item-render path it feeds
    (only whichever the RED test proves necessary); nothing in app/src/analysis/** except W5.
W3. Vocabulary-as-data (the ONLY schema-repo diffs): gc-method.schema.yaml compound_assignments
    item gains THREE optional declared props — `assignment_state` (string enum, EXACTLY the two
    task terms [verified, provisional]; "unassigned" is forbidden as a token — absence = unknown),
    `provenance` (object, additionalProperties:false: entered_by ref, recorded_at date-time,
    source_run_ref record-ref to analysis-run, source_peak_label string — the task's
    who/when/which run+peak), `reporting_basis_ref` (ref, optional, §9). gc-method.ui.yaml
    compound-assignments-slot properties gain the matching leaf widgets (assignment_state as
    select with exactly the schema enum, the new refs as widget: ref, recorded_at as text + help),
    following the FIX-1 D1 doctrine (object-bound leaves, ui.yaml:1-13). NO lint rule is invented
    (the v1 DSL cannot express cross-entity intent; gc-method.lint.yaml:9-14 records-not-fakes
    precedent). exactOptionalPropertyTypes discipline on every new TS site. RELOAD: see OQ-1 —
    the live :3092 cannot see these fields until an orch restart; vitest proves schema correctness
    independently.
W4. Manual round trip (DATA): against a fresh copy-on-edit gc-method record (W6's naming below),
    via the EDITOR UI at :5192 (or PUT /api/records/:id body receipts if the editor path is the
    thing W2 fixed — pair both), assign ONE FAME-2 standard peak: compound_ref = the FAME-LOCAL
    methyl-ester ontology ref, expected_rt_min = the peak's OBSERVED rt_min read from FAME-2's
    frozen peak_table artifact data (no TS math — the number is transcribed from the artifact
    receipt into the form), rt_window_min DECLARED, assignment_state verified, provenance
    {entered_by: USR the session signs in as, recorded_at, source_run_ref ANR-F2's run,
    source_peak_label}. Receipts: PUT request body + re-GET payload + rendered editor pair.
W5. Chat context leg (bounded code): AnalysisChatPanel's aiContext.surfaceContext (currently `{}`,
    :37) carries the ACTIVE RUN identity (runId, revisionRef id) — the memo needs activeRunId
    threaded from AnalysisPage (one prop or existing-route read; the outgoing spread already exists,
    useAiChat.ts:572). Plus register onRecordDraftProposal on the analysis mount the way
    AiTabPanel.tsx:884 does (a frame handler that exists and is merely unwired — the unhandled
    path already surfaces a named bubble; W5's RED test pins the bubble DISAPPEARS into a card).
W6. Chat propose->accept leg (the protocol-edit precedent applied to assignments): ONE new entry in
    the server/src/drafts/adapters.ts registry — a peak-assignment proposal whose compile stage
    (a) resolves the noun through the resolve spine + ontology-term registry — an EXACT known term
    yields the resolved CURIE in the card; unknown/ambiguous yields NO card and a clarification
    envelope (the never-guess round trip; receipts = the 404/resolve-mint pair), (b) on ACCEPT
    performs exactly ONE governed edit: the assignment entry appended to the target gc-method
    record; assignment_state arrives IN the compiled envelope the human approved (default
    provisional — the accept loop applies the payload verbatim, it never injects state; adapters.ts
    "NO state/status field is ever written"). Pre-accept proof: the target record's GET is
    byte-identical before/after the chat turn + zero audit delta; reject = zero writes (StagingStore
    doctrine). This leg's exact intent-channel (extend compose_record_draft to an edit-operation vs
    a new intent term) is OQ-4 — the coder STOPS the chat leg with requires-rescope if the
    orchestrator has not ruled OQ-4 at dispatch.
W7. Provisional seed map + compute leg:
    (a) DATA: mint the PROVISIONAL map as assignment entries on the working method record —
    FAME-2 standard run's peak table x known FAME elution order (shorter chain first:
    methyl-hexanoate < methyl-octanoate < methyl-decanoate, stated in the report with its SOURCE —
    NOT code); every entry assignment_state: provisional + provenance{source_run_ref,
    source_peak_label, entered_by}. Peaks whose peak_table flags carry an overlap marker
    (peak_integration.py OVERLAP_SHARED_BASELINE flag class, :879) get NO entry — compound_ref is
    required, so an unqualified overlap peak stays ABSENT (never guessed); the report names each
    skipped overlap peak + its flags. BRAD-DATA: the coder NEVER promotes provisional -> verified;
    the report carries an explicit "awaiting Brad at the bench" section; FAME-4 closes after.
    (b) COMPUTE (OQ-3-gated): re-Analyze so compute uses the assignment's RT/window. Smallest
    honest door: run the shipped quantification module with targets transcribed 1:1 from the
    W4/W7 assignments — transcription rides as frozen RUN PARAMETERS; the proof is the module's OWN
    compound_ref column echo (:821/:842) + peaks_unassigned metric moving. If the orchestrator
    rules a different door (e.g. server-side method->params resolution at run create), THAT ruling
    replaces this leg; do NOT invent a method-ref field on analysis-run unilaterally.
W8. ROUND-TRIP-GATE-1 receipts: per changed surface — (1) editor compound-assignments section
    (request body + rendered pair, incl. the BASIS NOTE render beside one assignment WITH a basis
    ref and one WITHOUT — the honest absent arm), (2) chat proposal card naming the resolved term +
    pre-accept byte-identity proof, (3) the "palmitate" clarification round trip, (4) provisional
    states visible in the rendered record surface with overlap peaks showing NO unqualified ID.
    Zero /api/ai/** interception (record the real model turn; if AI is unconfigured, the named
    AI_UNCONFIGURED/health arm is a BLOCKED receipt, not a pass).

## 11. Explicitly out of scope
- FAME-1 (attach chrome, config/gc-acquisition-status/) and FAME-2's frozen artifacts (ANREV
  successor, ANR runs, VSPECs, peak tables) — concurrent/preceding items; do not touch. If git
  shows those files changed under you, do NOT touch them (rebase-free discipline).
- No new record KIND (no compound kind — OQ-2), no new ref kind, no new CURIE namespace in code,
  no new capability/view-renderer terms, no changes to ChromatogramView/TableView/ViewRenderer
  (the micro-table gains NO assignment column here — run-sheet assignment display depends on the
  OQ-3 door and is a FAME-4/6 concern), no analysis-run schema edits, no measurement-context edits.
- No claim/assertion/evidence records for assignments (§9). No lint DSL invention. No TS policy
  (R3/R8: no RT math, no eligibility, no compound truth in TypeScript).
- Fixing GCM-DEMO-AOAC-FAME's dangling CMP-DEMO-HEXANOIC ref (document the finding, do not mint
  the CMP record — the kind does not exist). config.yaml revisionOnEditKinds (orch knob).
- The FAME-4 close-out (Brad's verification pass is bench work, not coder work).
- Genuine platform gap discovered mid-flight -> STOP that section, requires-rescope; never invent
  product surface.

## 12. Acceptance criteria (verbatim from the task block) + standing gates
VERIFIED BY:
  Manual: assign one standard peak -> re-Analyze with updated method -> compute uses the
  assignment's RT/window. AI: chat utterance produces a proposal card naming the resolved term;
  NOTHING writes pre-accept; unknown noun -> clarification (receipts prove the round trip).
  Provisional states visible; overlapping peaks never show unqualified IDs. Basis note renders
  beside assignments.
Standing gates: tests green; FRESH tsc baseline captured at claim, zero NEW errors; adversarial
review gate; ROUND-TRIP-GATE-1 (request body + rendered pair per changed surface, zero /api/ai/**
interception, visible-DOM alone is not evidence); browser gate (cl-browser-reviewer, VERDICT
accept) on the editor + chat surfaces; NO new vocabulary beyond W3's two ratified enum tokens
(assignment_state {verified, provisional}); R3/R8 respected.

## 13. First targeted check (before anything else — early-proves the whole approach)
The manual leg lives or dies on whether the editor can round-trip a compound-assignment entry
today. At the lane stack (both 200-verified by the composer this session):
  curl -s http://localhost:3092/api/records/GCM-DEMO-AOAC-FAME | python3 -c "import sys,json;print(json.load(sys.stdin)['record']['payload']['analysis']['compound_assignments'])"
Expected: the one existing assignment printed (composer saw it verbatim this session). Then ONE
browser observation at :5192 /record/GCM-DEMO-AOAC-FAME: does the Compound-assignments section
(a) render the compound_ref object without "[object Object]" and (b) allow editing an item
sub-field? Verdict rules: rendering broken -> W2 grows the display arm too (documentMapper
arraySchema forcing type:string is the named root, :321-327); editing works TODAY -> W2 shrinks to
regression tests only; BOTH work -> report it and continue (the schema fields in W3 still gate
assignment_state). Side-check (also early): the two ontology curls in §3 (200 + 404 + resolve
mint-arm) — if the 404 arm starts returning candidates with a CURIE, STOP: never-guess broke.

## 14. Verification commands (expected outputs)
- Python SDK (consumption modules, unchanged unless W7(b) adds an ANREV DATA record):
  cd server/python-executor-service && python -m unittest tests.test_peak_integration
  -> "Ran 31 tests ... OK (skipped=1)" (composer VERIFIED at this commit);
  python -m unittest tests.test_quantification tests.test_calibration_fit -> OK (composer did NOT
  pre-run these two — capture at claim; if pre-existing failures, report against a fresh pristine
  baseline, do not "fix").
- App vitest: npm run test -w app (vitest run) -> exit 0; focused: npx vitest run
  src/editor/taptab/documentMapper.test.ts src/analysis/AnalysisPage.chat.test.tsx
  src/shared/hooks/useAiChat.recordDraftProposal.test.tsx (+ every RED file W2/W5/W6 add).
- Server vitest (touched adapters/ai/editor-projection suites): npm run test -w server -- related
  suites (drafts/, ai/, schema/GcMethodSchemas) -> exit 0.
- Typecheck: npm run typecheck -> fresh baseline at claim minus zero new errors (do NOT claim
  exit-0 unless the fresh baseline was exit-0).
- Records proof: re-GET the working method record -> the new assignment entries validate against
  the UPDATED schema (vitest-side Ajv against the corpus; live :3092 gated on OQ-1 restart),
  every compound_ref carries kind:ontology + namespace FAME-LOCAL + an id present in
  fame-local.yaml; zero entries with type: compound.
- Never-guess proof: the palmitate utterance turn -> NO record mutation (byte-compare GET bodies
  before/after), clarification envelope in the receipts.
- Lane hygiene: git -c core.fileMode=false; node_modules in worktrees is a SYMLINK — never commit
  through it; NEVER restart/kill :3092/:5192 (W3's YAML edits REQUIRE the orch restart checkpoint —
  tsx --watch does not reload YAML; if a report claims the live stack validated new fields without
  the restart, that's a red flag, not a pass); NEVER pkill; :3001/:5174 untouched; records via API
  only; no task-list edits; no merges.

## 15. Worker contract + file ownership
- Branch/worktree (pattern; orchestrator fills): wt/fame-3-lane1-l1t0210 off cl/integration-1,
  worktree /mnt/vast/home/brad/git/wt/fame-3-lane1-l1t0210 (node_modules symlinks in place).
- Deliverable report (unique path): <ORCH-FILL: /home/brad/.hermes/cl/lanes/1/fame-3-report-l1t0210.md>
  + receipts under ~/.hermes/cl/receipts/FAME-3/<ts>/.
- Code files OWNED (entire code diff): app/src/editor/taptab/documentMapper.ts + item-render path
  + tests (W2); app/src/analysis/AnalysisChatPanel.tsx (+ minimal activeRunId thread in
  AnalysisPage.tsx if required) + tests (W5); server/src/drafts/adapters.ts (or a new wired
  adapter file) + the minimal agent-intent branch files W6's OQ-4 ruling names + tests;
  schema/lab/gc-method.schema.yaml + gc-method.ui.yaml (+ tests) for W3. EVERYTHING ELSE is DATA.
- Records discipline: the working method record is a NEW draft copy of the working method (edit
  discipline = create-new / PUT own new record; do NOT mutate GCM-DEMO-AOAC-FAME in place — it is
  demo-fixture evidence); READ-and-CREATE/PUT-own against :3092; no DELETE of anything.
- Mark in-progress on claim; NEVER mark done (orch owns status).
- Final message marker: `FAME-3 DONE <full-sha>` / `FAME-3 BLOCKED <one-line reason>`.

## 16. Reviewer bait (anticipate; pre-empt in diff/report)
1. exactOptionalPropertyTypes: every W2/W3/W5/W6 site with optional ref/state fields — build
   payloads with explicit conditional spreads (the documentMapper WIDGET-R1 idiom is the house
   style); NEVER assign `undefined` into a ref/state slot (absent key only).
2. YAML-reload trap: W3 edits gc-method.schema/ui YAML; the live :3092 will REJECT new fields
   (additionalProperties:false on the OLD loaded schema) until an orch restart. Any report claiming
   a live PUT with assignment_state PASSED without naming the restart checkpoint is a fabrication
   red flag. Vitest-side schema validation is the honest pre-restart proof.
3. Ontology terms: every CURIE written MUST exist in fame-local.yaml (exactly 6; grep the final
   records against it). assignment_state enum MUST be exactly [verified, provisional] — the words
   "unassigned", "pending", "tentative", "candidate" anywhere in the diff/records = invented
   vocabulary. Do NOT reuse the engine-support enum terms (supported/approximate/unverified) for
   assignments — different entity.
4. Hardcode boundary: greps that MUST be empty on the code diff: 'palmitate', 'hexanoate',
   'octanoate', 'decanoate', 'FAME-LOCAL', 'GC-2', 'GCM-', 'compound_assignments', any RT literal
   (15.673 et al.), 'provisional'/'verified' as string branches in TS (the enum lives in YAML; TS
   renders options from data). The elution order is NOT in code anywhere — it is a source-noted
   statement in the report + the data entries it justified.
5. Basis reconciliation: no code path may overwrite/derive label from basis or vice versa; the
   both-faces render is display of two declared fields. An entry WITHOUT basis must render the
   honest absent arm (not a default 'species' string minted in TS).
6. Dangling-ref class: new payloads with compound_ref.kind:record are out (the demo's
   {kind:record,type:compound} target 404s live — §5). If the coder "fixes" GCM-DEMO or mints a
   CMP-* record, that is scope creep + a fake kind — reject.
7. Propose-never-write proof quality: reviewer should demand the BYTE-COMPARE (before/after GET
   bodies of the target record around each chat turn) + the reject-arm zero-fetch proof, not just a
   screenshot of a card. Pre-accept audit-event count delta = 0 for the target record.
8. The analysis chat today cannot see the run (§7, surfaceContext {}) — if the chat leg "somehow"
   resolved 15.673 into a peak WITHOUT the W5 context plumb, the coder hallucinated or the model
   guessed from history: reject the receipt.
9. Overlap-arm honesty: every overlap-flagged FAME-2 peak must appear in the report's
   "no entry, unqualified by design" list with its flags echoed from the frozen artifact; a seed
   map with NO overlaps on a real chromatogram is suspicious (real chromatograms cluster).
10. ViewRenderer/ChromatogramView untouched: any diff there is scope violation (FAME-2 owns those
    surfaces; C1 is merged).

## 17. Open questions (composer could not resolve locally — do not guess at dispatch)
OQ-1 (schema change vs live-stack YAML reload — LOAD-BEARING): W3's three new assignment props
  MUST land in gc-method.schema.yaml (+ui.yaml). The server loads bundled schema at boot
  (config.yaml:16-17); YAML-only edits do not hot-reload; restart is orch-only. Needed: an
  orchestrator RESTART CHECKPOINT between the schema commit and the live acceptance legs (W4's
  live PUT, W6's accept, W7b) — or ratify vitest-side validation + post-restart acceptance re-run.
  Coder-unresolvable by construction.
OQ-2 (CMP-* material concept): "compound" exists NOWHERE as a kind (schema grep 0, records tree 0,
  CMP-DEMO-HEXANOIC 404 live despite GCM-DEMO's ref). The spec routes all identity through
  FAME-LOCAL ontology refs (§5). If the architect wants a governed material/compound concept kind
  (MAT-/CMP- records the picker could also list), that is a NEW KIND decision — architect/orch
  call, not FAME-3. Checked: ref.schema.yaml shape, material.schema.yaml exists (MAT-*),
  EnsureTerm TERM-* records, registry-kinds coverage.
OQ-3 (method->compute door for the manual acceptance leg): nothing on the analysis chain refs the
  gc-method record (method_ref grep 0; run links ONLY revisionRef + measurementContextRef; the
  repo's own words: parameters are "transcribed from a gc-method record analysis section 1:1",
  analysisGcIntegration.test.ts:160-165). Options named in W7(b): (a) transcription into frozen
  run parameters (shipped quantify_peaks consumes RT/window natively — quantification.py:473-494),
  (b) a server/revision-level method-ref resolution door (schema change out of FAME-3's declared
  file set). Default = (a); ratify or replace. "Re-Analyze with updated method" is satisfied by
  (a) only if "updated method" means "run parameters re-read from the record's CURRENT assignments
  at run-creation time" — if the architect requires the run itself to CITE the method (immutable
  method-version pin), that's a schema change: requires-rescope into a separate item.
OQ-4 (chat intent channel for an EDIT proposal): existing draft adapters compose NEW records only
  (recordDraft id-derivation from id.pattern, adapters.ts:94-102); protocol_edit ops apply to
  attached protocols via the event-editor review panel, not to gc-method records. A new
  draftAdapters entry is the shaped home, but the AGENT INTENT (extend compose_record_draft with
  an operation:"edit-record" vs a new intent term in the submit_suggestion vocabulary —
  server/src/ai/submitSuggestionTool.ts:455ff) is a vocabulary-surface ruling + the write-wall
  surfaces list (review-write-wall.yaml:72 [protocol-review] — should 'analysis' gain a wall?) —
  orchestrator/architect ruling before W6 dispatches.
OQ-5 (BRAD-DATA sequencing): provisional -> verified promotion is bench work (W4's one VERIFIED
  entry is the LEGITIMATE manual path — Brad's own session signs it via the editor). Confirm the
  single verified entry (FAME-2 standard peak, observed RT, provenance complete) satisfies the
  "assign one standard peak" leg while the seed map stays all-provisional. Checked the task text
  both ways; flagged only so the ratification is explicit before dispatch.
