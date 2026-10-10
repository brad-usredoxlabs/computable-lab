# W2-11-ZYMO-GOLDEN-DEMO — spec DRAFT (cl-spec-composer, 2026-10-10 ~05:00 EDT, token l2t0450)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews +
promotes. COMPOSED PRE-DEPS: W2-6 coder LIVE (wt/W2-6-lane2-l2t0430), W2-7/W2-8/W2-9/W2-10
draft-specs only (unmerged; W2-7 OQ1-4 ruled l2t2355, W2-8 OQ1-4 ruled l2t0030, W2-9/W2-10 ruled
l2t0258). EVERY bind to a W2-6/W2-7/W2-8/W2-9/W2-10 shape reads CONFIRM-AGAINST-MERGED-TRUNK
(CAMT); the merged trunk wins over anything assumed here — W2-11 is the CONVERGENCE item, its
goldens ride whatever those five land as. Compose base: docs tip over merge **fcce2212** (W2-5
merged). git ALWAYS `-c core.fileMode=false` (NFS tree).

GOAL (one sentence): Prove the campaign end-to-end on the Zymo input — PDF -> immutable
candidate -> draft/promoted semantic family -> robot realization (LOCAL_REALIZATION) ->
scientist-intent YAML -> run graph — as a byte-deterministic headless golden over FROZEN reviewed
artifacts, with the live extraction kept honestly separate (live-smoke script, honest outcome
classes, NOT_SUCCESS allowed), all five named negative goldens refusing with stable codes, and a
browser demo of the full reviewed journey on the merged W2-8/W2-9 surfaces reproducible from seed
data only.

## 0. ORIENTATION CITES (every file:line OPENED FIRST-HAND by the composer this session at
fcce2212; NO cl-scout used — every question answered by direct read, W2-10 §0.9 precedent)

0.1 THE EXISTING ZYMO CHAIN (all four files read in full):
- `server/src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts` (47 lines): the wave-1 golden —
  `decodeVendorProtocolPdfFile(zymoPdfPath, {documentId:'vendor-protocol-zymo-magbead'})` (:14-16)
  -> `extractVendorProtocolCandidate` (:17) -> `normalizeZymoProtocolCandidate` (:18) ->
  `createZymoDeepwellAdaptationPlan` (:19-21) -> `compileZymoAdaptationToEventGraphProposal` (:22);
  asserts 17 steps (:25), proposal eventGraph >20 events (:34), `evt-zymo-` ids (:39),
  sourceProtocolRef version '1.4.1' (:40-44). This is the DEEPWELL/wave-1 outcome — the campaign
  route is a DIFFERENT outcome (family + robot), which is why this file stays byte-untouched (§2.1).
- `server/src/ingestion/vendor-protocol/ZymoPdfDecode.test.ts` (:19-25): title 'ZymoBIOMICS 96
  MagBead DNA Kit', vendor 'Zymo Research', version '1.4.1', >=29 pages, steps 1 and 17 present in
  text. Siblings: `ZymoNormalization.ts` (520 lines, pure), `ZymoAdaptationPlan.test.ts`,
  `ZymoEventGraphProposal.ts` (proposal-never-write — it emits a PROPOSAL, never a record),
  `server/src/protocol-intake/ZymoDecisionTree.test.ts`.
- PDF input: `resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf` —
  sha256 measured this session starts `257f57196f6c…` — the record fixture
  `VPDF-257F57196F6C__zymobiomics-96-magbead-dna-kit.yaml` EXISTS at
  `/home/brad/.computable-lab/worktrees/main/records/vendor-pdf/` (located first-hand, W2-10
  §0.5 confirmed; all records there are TEST DATA). CAMT: re-locate at claim; do not invent.
- Branch machinery feeding the family: `server/src/ingestion/vendor-protocol/deriveBranchAxes.ts`
  header :7-27 — the extractor captures lettered `step.branches: string[]`; same-option-key steps
  become ONE axis ("Real case: ZymoBIOMICS 96 kit steps 1 and 4" :16-19); predicates target
  `$.branchSelection` (:24-27). `stepVariantMarkers.ts` = registry-driven variant fill
  (`schema/registry/intake-patterns/step-variant-markers.yaml`).

0.2 GOLDEN/LIVE-SMOKE SEPARATION PRECEDENT (the pattern this item reuses verbatim):
- `server/scripts/live-smoke.ts` header :1-27 (read): manual/orch-only, NEVER CI, never
  vitest-collected (lives under server/scripts/, outside src/), never curls the running stack;
  drives the REAL handler in-process via `resolveAiProfile` + `createInferenceClient` (:31-34);
  model named AT RUN TIME from config — no model/profile literal in the file (:11-13); exit 0
  whenever a call COMPLETED — the artifact's classification line carries the verdict; "This
  script is evidence, not a gate" (:17-18); artifacts untracked under
  `server/.artifacts/live-smoke/<UTC-timestamp>/` carrying profile+model+baseUrl HOST, NO key
  material (:21-24).
- Honest outcome classes are SHARED, not per-script: `server/src/compiler/scientistIntent/
  goldens/replayKernel.ts` `classifyCompileResponse` (:449) -> `OutcomeVerdict` enum
  `'SUCCESS' | 'NOT_SUCCESS_CLARIFICATION' | 'EXTRACTION_FAILURE'` (:444-447); "replay and live
  cannot disagree" (live-smoke.ts :18-19). The clarification bar MUST classify
  NOT_SUCCESS_CLARIFICATION (:461-462).
- Harness siblings for the live legs exist and are precedents for in-process chaining:
  `server/live-zymo.mts` (decode -> complete -> parseScientistIntent -> compileScientistIntent,
  W2-10 §0.3 cites).

0.3 MERGED-SHAPE FACTS THIS ITEM RIDES (verified first-hand at fcce2212 — these are NOT CAMT):
- Candidate IMMUTABILITY is server-backed: `server/src/config/types.ts:483` — DEFAULT
  `appendOnlyKinds: ['audit-event','signature','vendor-protocol-candidate']` (option field :341);
  the wall throws `APPEND_ONLY` at `server/src/api/handlers/RecordHandlers.ts:790` (update) and
  :1282 (delete). Campaign tests MINT candidates via POST /records ONLY; never PUT/DELETE.
- Promotion is born-draft and spoof-closed: `server/src/extract/CandidatePromoter.ts` —
  `PROMOTION_CONTROLLED_ESCALATION` at :171; `xdr-promote-blocked-by-unresolved` at :122 (lint
  twin named at :121). Promote/reject routes `POST /extraction/drafts/:id/candidates/:i/promote`
  /reject at `server/src/api/routes.ts:632-633`.
- Lint rule ids that the negative goldens cite (read from the merged YAMLs):
  `schema/workflow/protocol.lint.yaml` — `legacy-literal-bounded` (:138),
  `legacy-inventory-no-intent-drift` (:173), `intent-step-provenance-visible` (:206),
  `intent-verb-ref-declared` (:235), `prov-derived-conclusions-anchored` (:269),
  `prov-derived-never-vendor-carrier` (:318);
  `schema/workflow/local-protocol.lint.yaml` — `prov-local-choices-recorded` (:38),
  `prov-local-axis-declared-shape` (:67), `prov-local-substitution-rationale` (:93);
  `schema/workflow/extraction-draft.lint.yaml` — `xdr-promoted-candidate-anchored` (:24),
  `xdr-promote-blocked-by-unresolved` (:61), `xdr-promote-requires-resolvable-target` (:95).
- Branch gate shipped: `server/src/compiler/pipeline/passes/ResolveBranchAxesPass.ts` —
  `BRANCH_RESOLUTION_MISSING` at :74 (block :68-81, message names condition-first localization).
- Spine compile route: `server/src/api/handlers/IntentCompileHandlers.ts:119`
  `instance.post('/intent/compile', …)` — production spine composition (:59-62 per W2-7 §0.6).
- Goldens MANIFEST: `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` sha256 measured
  this session `873e13432ef6dc3e32e22ba47e69a7a66c0737e39e67fccb8ba63851fbca39a3` (== W2-6
  promotion record P6 pin). Suite `spine6-scientist-intent-goldens`; treeState pins
  scientist-intent-compile.yaml; fixtures/ + __records__/ replay with loud drift.
- Rung vocabulary is DATA at `schema/registry/provenance-ladder/` — `rung-vocabulary.yaml`
  (kind: provenance-vocabulary; rungs VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION with
  carrier/lineage/mints_on arms, :13-32 read), plus `rung-vocabulary.lint.yaml` and
  `rung-vocabulary.ui.yaml` (NOT under schema/workflow/ — brief correction confirmed).
- StepProvenanceRef merged shape (W2-6 PROMOTION RECORD P1, binding campaign-wide): required
  `[kind, type, id, pageStart]`, `id` = the SAID candidate record's OWN recordId (NOT
  documentId), type enum closed `[vendor-protocol-candidate, evidence]` at BOTH $defs sites.

0.4 UI SURFACES FOR THE BROWSER DEMO (exact routes, file:line backed — the reviewer HAS TWICE
fabricated `/project/<study>/record/<id>`; that route DOES NOT EXIST and any gate step naming it
is a fabricated-route defect, AS-LANE2-BROWSER-REVIEWER-FABRICATED-ROUTE):
- `/ingestion/vendor-pdf/:recordId` -> ProtocolReviewHostPage: `app/src/App.tsx:150`; registered
  surface id `protocol-review` with that exact path at
  `schema/registry/surfaces/surfaces.yaml:83` (id line :82, path :83, opened).
- `/record/:recordId` -> RecordHostPage: `app/src/App.tsx:196`.
- `/runs/:runId` -> RunWorkspacePage: `app/src/App.tsx:190` (and redirect
  `/project/:studyId/run/:runId` :189); `/event-editor/:eventGraphId` :173; `/deck/…` :200;
  `/settings` :209. There is NO `/project/:studyId/record/…` route (full Route grep at fcce2212).
- Gate harness precedents: `app/e2e/gate-pbch6.spec.mjs` (baseUrl http://localhost:5193,
  /api/health precheck at :3093, screenshots to a receipts dir) + the W2-8/W2-9 gate specs which
  MERGE BEFORE W2-11 (paths CAMT — reuse their seeding legs, §4). Run form
  `cd app && npx playwright test <file> --project=chromium`. Receipts dirs under
  `/home/brad/.hermes/cl/receipts/W2-11-ZYMO-GOLDEN-DEMO/<ts>/`. Stack :3093/:5193 belongs to the
  orchestrator; the coder NEVER touches them.
- Realization entry (downstream questions): `app/src/event-editor/right-pane/protocol/
  ProtocolLocalizationThread.tsx` hosted by ProtocolTabPanel (W2-8 §0.7 first-hand) + POST
  /intent/accept (`server/src/api/handlers/IntentAcceptHandlers.ts:77`, choices shape :77-82).

0.5 UPSTREAM DRAFT SHAPES THE GOLDEN RIDES (ALL CAMT — listed so the coder re-verifies each at
claim, never assumes): W2-6 endpoint `POST /extraction/vendor-candidates/:recordId/semantic-draft`
+ refuse-on-missing-coverage + optional `ai.semanticPass` block with profile fallback (promotion
record P2/P3) + service codes SEMANTIC_PASS_*; W2-7 `lowerRealization`/`realizeAndCompile` at
`server/src/compiler/scientistIntent/realizeScientistIntent.ts` + policy
`schema/registry/realization/robot-realization.policy.yaml` + REALIZATION_* codes (§2.1/§3 of its
draft); W2-8 SemanticDraftPanel/SaidFactsPane + seeding fixture leg + retired-literal buttons
(testids `vpdf-save` etc. ABSENT); W2-9 ReviewAiPanel + applyDraftProtocolEdit +
SemanticPassModelSection; W2-10 criteria file
`schema/registry/model-evaluation/semantic-pass-matrix.criteria.yaml` + report verdicts (which
combo PASSED decides W211-OQ3).

0.6 BASELINE FACTS (carry-forward handoffs l2t0258 §Baseline + l2t0415 §2 + measured here):
trunk lintRules 81 post-W2-5 (measured by orch at fcce2212 boot; 77 -> 81 == +3 xdr +1 xpr);
schemas 192; server tsc 26-line primary-error multiset (/tmp/l2t0415-tsc-server.txt == merged
server/ content at fcce2212); app tsc 34 primary lines; W2-5 broad scoped fail-file SET = 11
files / 16 failed tests (W2-5 report §0 list) — RE-MEASURE fresh in the claim worktree;
goldens expect 15; zymo-magbead-minimal appears ONLY in `server/src/compiler/pipeline/fixtures/
ProtocolRegistry.test.ts` + `Prompt02Green.test.ts` (grep, first-hand) — D2 legacy INPUT only.

## 1. SCOPE vs DEPS BOUNDARY

IN scope (the ONLY new files, §9 inventory):
- ONE convergence golden suite + ONE negative-golden suite under
  `server/src/ingestion/vendor-protocol/` (the campaign's own goldens — inline/committed fixture
  data, NOT the SPINE-6 goldens tree).
- ONE committed fixture dir `campaign-fixtures/` beside those tests holding the FROZEN reviewed
  artifacts (§2.2) with self-pin hashes in-test.
- ONE live-smoke runner `server/scripts/zymo-campaign-live-smoke.ts` (live-smoke.ts header
  contract verbatim; never vitest-collected).
- ONE browser gate spec `app/e2e/w2-11-campaign-demo.spec.mjs` (§4) — an app/** addition is
  permitted HERE ONLY as a gate-spec test file (W2-9 R6 precedent); ZERO app product edits.

OUT of scope (explicit; any hit = reviewer reject):
- EDITS to ZymoPdfDecode.test.ts / ZymoGoldenE2E.test.ts / ZymoAdaptationPlan.test.ts /
  ZymoNormalization.ts / ZymoEventGraphProposal.ts / ZymoDecisionTree.test.ts — byte-untouched
  (D2: the deepwell chain is legacy input, not the campaign outcome; §2.1 rationale).
- EDITS to W2-6/W2-7/W2-8/W2-9/W2-10 owned files (their merged shapes are consumed via exports:
  `lowerRealization`/`realizeAndCompile`, the semantic-draft service, the criteria data). Golden-
  ONLY additions ride this item's own files.
- `goldens/**` incl. MANIFEST.yaml (sha 873e1343… pinned byte-untouched unless W211-OQ1 rules
  otherwise — an ADD is an orchestrator act, never a coder act); `records/**` in ANY repo (tests
  mint via POST /records / in-process store only); `schema/**` zero edits (the ladder, rung UI,
  lint, and pipelines are merged data this item SATISFIES, never re-declares); `config.yaml`
  (untracked lane data — the live runner reads whatever profile the lane config names);
  `server/src/{compiler,api,extract,config}/**` zero edits; `app/src/**` zero product edits.
- No new endpoints, no new route families, no new record kinds, no new verbs, no rung re-mint,
  no new lint rules, no new CURIEs. Proposal-never-write stays: nothing in this item writes a
  run/record from a proposal path.
- Serving processes NEVER killed/restarted/niced (:8080 computable/thunderbeast); NEVER
  :3001/:5174; :3093/:5193 orchestrator-only (the gate runs against the orchestrator's stack).
- DNeasy (VPDF-6711E1FA89E9__dneasy-blood.yaml present in the data repo) is EXPLICITLY out of
  acceptance scope — touching it in a golden/gate is a defect. zymo-magbead-minimal: legacy
  input only, not asserted as campaign output.

## 2. GOLDEN-CHAIN ARCHITECTURE

2.1 WHY A NEW CONVERGENCE FILE, NOT AN EDIT TO ZymoGoldenE2E.test.ts:
ZymoGoldenE2E asserts the WAVE-1 deepwell-adaptation outcome (event-graph proposal). The campaign
route is a DIFFERENT outcome (semantic family -> robot realization -> scientist-intent -> run
graph). Splicing the campaign legs into that file would (i) couple two independent green baselines
(it is in the pinned green set), and (ii) blur exactly the D2 boundary the task names. The
"extension" of the chain is therefore a NEW file re-using the SAME pure first legs:
`decodeVendorProtocolPdfFile -> extractVendorProtocolCandidate` (frozen, deterministic — W2-10
§0.5: candidate bytes are byte-reproducible at a pinned tip; ZymoGoldenE2E asserts 17 steps).

2.2 THE GOLDEN/LIVE SPLIT (frozen reviewed artifacts for byte-determinism):
The LLM semantic pass is NOT deterministic; the golden must not call it. The chain splits:
  [GOLDEN, deterministic, in vitest]
    PDF bytes (pinned sha 257f5719…) -> decode -> candidate (assert 17 steps, branches kept)
    -> candidate minted via POST /records (appendOnly wall proven by a refusal arm, not by
       mutation) -> FROZEN reviewed semantic draft (committed fixture, §2.3) promoted through the
       REAL W2-5 promotion route (born-draft family PRT) -> robot answers -> REAL W2-7
       `realizeAndCompile` -> emitted scientist-intent YAML -> `parseScientistIntent` (real Ajv)
       -> `compileScientistIntent` with the PRODUCTION spine composition (test seam
       `createResolveSpine({})` BANNED — W2-7 §4 harness canon) -> run graph.
       Asserts (verbatim clauses): all branches kept (every candidate branchy step maps to a
       family condition id — zero deletions, W2-6 A3 semantics), constraints typed (class +
       bindingKind present; count/volume dims correct — Quantity schema is the enforcer, W2-7
       §0.13), ladder rungs + anchors (every intent step provenance[0] is StepProvenanceRef
       shape: [kind,type,id,pageStart], `ref.id === candidate recordId` (P1 binding), pageStart
       in [1, pageCount]), LOCAL_REALIZATION robot choice (branch_resolution robot entry with
       FAMILY condition ids + merged-W2-4 choice carrier, CAMT — copy the merged representation
       verbatim, W2-7 OQ2 ruling), deterministic lowering (two full runs + a third after a fresh
       YAML re-load of policy/vocabulary: emitted YAML strings BYTE-equal AND serialized
       TerminalArtifacts BYTE-equal; Map order / Date.now / randomUUID / locale sort are
       determinism fakes — W2-7 bait #3 list applies verbatim).
  [LIVE, honest, NEVER vitest-collected]
    `server/scripts/zymo-campaign-live-smoke.ts`: one real run of the SAME journey through the
    merged semantic-draft service + realization + compile, model named at run time from config
    (zero model/profile literals in the file). Artifacts untracked under
    `server/.artifacts/zymo-campaign-live/<UTC-ts>/`: artifact.json (profile+model+baseUrl HOST,
    NO key material, candidate sha, prompt/policy shas, classification line), raw-draft.json
    (the model's raw draft verbatim). Classification comes from the SHARED `classifyCompileResponse`
    (replayKernel.ts:449) so live and golden cannot disagree on vocabulary: SUCCESS /
    NOT_SUCCESS_CLARIFICATION / EXTRACTION_FAILURE — NOT_SUCCESS is an ALLOWED honest outcome and
    never a faked green; exit 0 whenever the run COMPLETED; "evidence, not a gate".
  [THE BRIDGE] The frozen fixture IS a live output once human-reviewed (W211-OQ3): its provenance
  note records which combo produced it and what review edits it received; the report snapshots
  that. The frozen artifact's sha rides every golden assertion.

2.3 FROZEN ARTIFACTS (committed DATA under `campaign-fixtures/`, NOT goldens/ — W2-7 precedent
"lives in the tests, not in records/"):
- `campaign-fixtures/zymo-semantic-draft.frozen.yaml` — the reviewed W2-6 draft payload (the MEANT
  body: protocolLayer universal, intent steps, branch_axes with family condition ids).
- `campaign-fixtures/zymo-robot-answers.frozen.yaml` — the lab answers (the "neither spin column
  nor plate — the robot" axis answer + required answers per the W2-7 policy: sampleCount, plate
  role, reagent source — READ the merged policy file for the exact required set, CAMT).
- `campaign-fixtures/PROVENANCE.md` — which combo/run produced the draft, review record, shas.
Self-pinned: the test file hashes each fixture at open and fails loud on drift (a LOCAL manifest
in the test, MANIFEST.yaml untouched — W211-OQ1). If claim-time reality shows merged W2-7/W2-6
fixtures reusable verbatim (their golden files), REUSE their bytes by import rather than
re-author (answers held constant is a W2-10 doctrine; duplication declared in the report).

2.4 WHAT THE GOLDEN DOES NOT PROVE (honesty lines the report must carry): it does not prove model
quality (W2-10's matrix does; this item pins the chosen combo as DATA/config copy — the frozen
fixture's provenance note + the live runner's config-driven model name; a model literal in TS is
a D7 violation); it does not re-prove W2-5's wall or W2-7's gate arms (it rides them); the live
smoke does not prove the golden (independent paths, shared classifier).

## 3. NEGATIVE GOLDENS — T-table (five refusals, verbatim names from the task)

Suite `ZymoCampaignNegatives.test.ts`. Each arm is RED-at-base (the refusal must FIRE, with the
named stable code, and the negative's payload must leave ZERO writes — asserted by store-snapshot
deep-equal before/after). Stable codes are CAMT where they come from W2-6/W2-7 draft text; merged
codes win; the merged trunk's actual code string is quoted verbatim in the report.

| # | Negative (verbatim task name) | Injection | Expected refusal (stable code) | Backing |
|---|---|---|---|---|
| N1 | invented source branch | local-protocol whose branch_resolution names a branchId NOT in `family.branch_axes[].conditions[].id` | the shipped gate path: `BRANCH_RESOLUTION_MISSING` / unresolved-axis gap naming the axis, ok:false, zero emitted YAML; plus merged lint `prov-local-axis-declared-shape` fires on the payload (lint id verified merged at local-protocol.lint.yaml:67) | ResolveBranchAxesPass.ts:74 (verified); W2-7 L2 `REALIZATION_BRANCH_UNRESOLVED` (CAMT); W2-7 bait #8 "masquerading branch ids" |
| N2 | literal wave-2 output | a literal-step payload (steps kind 'other', no intent) presented as wave-2 family output: (a) mint a protocol with `protocolLayer` wave-2 semantics + literal steps -> lint `legacy-literal-bounded` / `legacy-inventory-no-intent-drift` ERROR; (b) the W2-8-retired mapper stays call-site-free: grep `candidateToProtocolPayload(` = zero app call sites outside its own test (W2-8 §6 A6 grep re-run as a W2-11 arm); NO product deletion (W2-8 OQ2 ruling (a) — see W211-OQ2) | lint codes above, ERROR severity, record refused | protocol.lint.yaml:138/:173 (verified merged); W2-8 §0.3 + OQ2 ruling (task-list :4931) |
| N3 | silent defaulting | realization answers with sampleCount OMITTED -> refusal BEFORE compile with `REALIZATION_ANSWER_MISSING` (CAMT W2-7 L3); belt arm: the same payload pushed to `compileScientistIntent` directly would hit the chatbot 8-sample guessed default (ChatbotCompilePasses.ts:3087-3101, cited W2-7 §0.19) — assert the campaign route makes that unreachable (gate fires first, zero emitted YAML); ChatbotCompilePasses untouched | REALIZATION_ANSWER_MISSING (CAMT) | W2-7 §2.1 L3 / T3c; W2-7 OQ4 ruling (upstream gate) |
| N4 | unauthorized promotion | three legs: (a) PUT/DELETE the minted candidate -> 405 `APPEND_ONLY` (verified RecordHandlers.ts:790/:1282, config types.ts:483); (b) state-spoof: attempt to force a draft/protocol `state` to approved via PUT -> `PROMOTION_CONTROLLED_ESCALATION` (verified CandidatePromoter.ts:171); (c) promote an XDR candidate carrying an unresolved ambiguity span -> `xdr-promote-blocked-by-unresolved` (verified CandidatePromoter.ts:122, lint twin extraction-draft.lint.yaml:61) + zero writes | APPEND_ONLY / PROMOTION_CONTROLLED_ESCALATION / xdr-promote-blocked-by-unresolved (all VERIFIED merged) | W2-5 merged shapes (task-list DONE blocks + fcce2212 cites above) |
| N5 | spine bypass | family -> run graph WITHOUT the scientist-intent contract: import-set + route-grep + pipeline-sha closure arms — `grep -rn "\.intent" server/src/compiler/protocol/` stays EMPTY; `compileScientistIntent` import set == known set + W2-7 realization files + this item's NEW files only; scientist-intent-compile.yaml sha256 unchanged (b47eee0c… treeState pin); this item adds zero routes (`git diff` empty on routes.ts) | structural test failure (no code — a bypass IS the failure); each arm mutation-tested non-vacuously | W2-7 §6 / T7 verbatim; MANIFEST.yaml treeState (verified read) |

## 4. BROWSER DEMO GATE PLAN (cl-browser-reviewer; VERDICT: accept owed)

Gate spec: `app/e2e/w2-11-campaign-demo.spec.mjs` (checked in; BASE_URL ?? http://localhost:5193;
precheck GET http://localhost:3093/api/health == 200 AND :5193 == 200; localStorage
cl.currentUserId=USR-BRAD). Harness precedent gate-pbch6.spec.mjs; run
`cd app && npx playwright test w2-11-campaign-demo.spec.mjs --project=chromium`. The spec runs
ONLY against a stack the orchestrator started; the coder NEVER starts/touches :5193/:3093.
Receipts: `/home/brad/.hermes/cl/receipts/W2-11-ZYMO-GOLDEN-DEMO/<ts>/` (screenshots + every GET
paste). ROUTES ARE EXACT — any reviewer-authored URL not in the table below is a fabricated-route
defect (twice-burned lane-2 precedent):

Seed leg (idempotent beforeAll, committed fixture data + seeded records ONLY — "reproducible from
seed data only"): reuse the MERGED W2-8 fixture seeding leg (VPDF record + stored blob + frozen
XDR pointing at it, CAMT path — import/replay theirs, do not fork a second seeder unless merged
reality forces it, declared in report). The VPDF blob must be the pinned Zymo PDF (sha 257f5719…).

| Leg | Exact route / surface (file:line backed) | Flow | Receipt proves (acceptance clause) |
|---|---|---|---|
| D1 immutable SAID | `/ingestion/vendor-pdf/<VPDF-id>` (App.tsx:150) | open review; probe every left-pane control incl. keyboard; GET /api/records/<VPDF> sha before/after; attempt a rewrite via UI paths | sha EQUAL; zero mutating controls; no save/save-as/use-extracted testids on the wave-2 render (W2-8 A1/A6 machinery) |
| D2 editable MEANT | same route, right pane | edit a MEANT step label -> Save (PUT /records/:XDR + expectedSha) -> hard F5 -> value present; GET /api/records/<XDR>/revisions shows the revision; intent.provenance byte-equal (paste both GETs) | "editable MEANT" + provenance intact (rides W2-8 A3, re-proven on the INTEGRATED flow) |
| D3 mounted AI | same route, rightPane chat (merged W2-9 ReviewAiPanel, surface `protocol-review`, surfaces.yaml:83) | send "reword step 3's label for our bench" -> proposal card -> Accept -> revision + provenance byte-equal; refusal legs: "change the vendor text", "mark the inferred incubate as vendor-stated", "promote the draft" -> visible refusals, VPDF sha / XDR provenance / XDR status unchanged | "mounted AI" incl. fail-visible negatives (rides W2-9 B2/B3/B5/B6 on the campaign fixture) |
| D4 downstream questions | run workspace route `/runs/<runId>` (App.tsx:190) -> protocol tab -> localization thread (merged W2-8 A5 realization entry, CAMT exact mount path) | family branch_axes questions appear -> answer (incl. "neither spin column nor plate — the robot") -> accept -> GET the LPR record | "downstream questions" persisting: branch_resolution[].choices match the answers, robot entry carries the merged LOCAL_REALIZATION carrier (paste LPR JSON; receipt names the LPR id) |
| D5 robot realization | server leg via the merged W2-7 surface (route/entry CAMT — if merged W2-7/W2-8 expose an entry, drive it; else realization leg is proven headlessly and the receipt is the LPR + GET of the emitted document, honestly named) | realization present with robot profile closure (p20-multi-8 / 96-well plate / trough roles bound) | "robot realization" shown (receipt: the LPR payload + policy-derived role bindings, no invented surface) |
| D6 run graph shown | emitted scientist-intent document -> POST /intent/compile (IntentCompileHandlers.ts:119) via the UI entry IF merged exposes one, else honest API-paste leg; resulting artifacts viewable at `/record/<artifactId>` (App.tsx:196) and/or `/runs/:runId` (App.tsx:190) | run graph with non-empty events renders / artifacts GET returns the compiled graph | "run graph shown" |

VERDICT: accept criteria VERBATIM (from `verified by:`): "browser receipts VERDICT: accept on the
integrated flow (immutable SAID, editable MEANT, mounted AI, downstream questions, robot
realization, run graph shown)" — one leg per clause, each receipt carrying its paste; any leg the
merged product cannot serve is NOT faked — it is reported and the verdict honestly fails the
clause (no faked green applies to the GATE too).

## 5. ACCEPTANCE CRITERIA (VERBATIM from the task block `verified by:`) + CLAUSE->PROOF MAP

  Headless golden chain green on trunk with the assertions above; live-smoke artifact honestly
  classified either way; browser receipts VERDICT: accept on the integrated flow (immutable SAID,
  editable MEANT, mounted AI, downstream questions, robot realization, run graph shown); all five
  negative goldens reject; campaign demo reproducible from seed data only.

| Clause | Proof |
|---|---|
| "Headless golden chain green on trunk with the assertions above" ("the assertions above" = description: branches kept, constraints typed, ladder rungs + anchors, LOCAL_REALIZATION robot choice, deterministic lowering) | §2.2 golden legs G1-G7: G1 decode+17 steps+branches-kept (PDF sha pin); G2 candidate mint via POST /records + appendOnly refusal; G3 frozen-draft -> promotion -> born-draft family (state DRAFT post-promotion, P4 binding); G4 family branches all retained as family condition ids, constraints class+bindingKind+dims; G5 provenance [kind,type,id,pageStart], ref.id===candidate recordId, pageStart in range, prov-* lint green; G6 robot answers -> REALIZATION leg, LOCAL_REALIZATION carrier + family condition ids; G7 determinism triple-run BYTE-equal (YAML + TerminalArtifacts) — §9 files |
| "live-smoke artifact honestly classified either way" | §2.2 live runner + shared classifyCompileResponse; report pastes the classification line + artifact.json keys; NOT_SUCCESS allowed, exit code semantics per live-smoke.ts :15-18 |
| browser receipts … six named sub-clauses | §4 legs D1-D6, receipts dir per leg |
| "all five negative goldens reject" | §3 N1-N5, each RED-at-base with the refusal text + zero-write snapshot |
| "campaign demo reproducible from seed data only" | §4 seed leg replays from committed fixtures + seeded records; report proves a clean-clone run: gate spec + fixtures + `resources/vendor_pdfs/` + data-repo seed VPDF — nothing under server/.artifacts/ or config.yaml is load-bearing for the GOLDEN or the GATE (the live runner alone consumes config.yaml by design) |

FIRST TARGETED CHECK (single command that proves the approach early, BEFORE writing goldens):
a scratch (uncommitted, W2-3 probe discipline) tsx stitch in the claim worktree:
`cd <wt>/server && npx tsx <scratch>/campaign-stitch.ts` running
decode -> extract -> [hand-freeze a minimal family from the W2-7 merged fixture if W2-6's real
draft is not yet claimable] -> merged `realizeAndCompile` with robot answers -> parse ->
compileScientistIntent (production spine). Expected: `outcome:'complete'`, non-empty events,
byte-equal across two runs. If the merged W2-7 export surface or the frozen-draft shape cannot
stitch, STOP and report at that point — the pivot belongs here, not at review. Plus the health of
every riding suite at base: `cd <wt>/server && npx vitest run src/ingestion/vendor-protocol
src/compiler/scientistIntent` -> ALL GREEN (the legs being stitched each work today).

## 6. HARD-STOPS (reviewer reject on contact)

1. D2: zymo-magbead-minimal legacy INPUT only (its green fixture tests untouched); DNeasy absent
   from every golden/gate/fixture (grep the diff: `dneasy` case-insensitive = zero hits).
2. No faked green: live outcome classes honest, NOT_SUCCESS allowed; no golden stubs the LLM
   (vitest never calls a model; the live script is never vitest-collected); a mocked
   classifyCompileResponse or parseScientistIntent in the golden voids the criterion (SPINE-6
   §4.1 doctrine); a gate receipt that reloads from a captured fixture instead of a real GET is
   fake (W2-8 bait 10).
3. Five negative goldens named verbatim in the task are the five refusals — renaming, merging,
   or softening one (e.g. warning instead of refusal) is a defect.
4. Proposal-never-write; never two local terms for one entity; ZERO hardcodes — model/host/
   thresholds are DATA: no model/host literal, no threshold number, no profile name in any new
   TS (`grep -riE "qwen|thunderbeast|computable:8080|100\.111|flash|4b-vision" <new files>` empty
   — W2-10 §6 grep-wall shape); no rung vocabulary string literal in product TS (tests may name
   them ONLY to assert, W2-4 T4 grep arm reused); scientist-intent-compile.yaml sha unchanged;
   MANIFEST + goldens/** + schema/scientist-intent/ diff EMPTY.
5. app/** byte-untouched EXCEPT the ONE gate spec under app/e2e/ (test-only). If the demo
   seemingly requires a PRODUCT tweak, that is an OQ raised in the report, not a silent edit.
6. No PUT/DELETE of a minted candidate (405 is the point); records/** empty diff in any repo;
   records minted via POST /records only; the promoted family is BORN DRAFT (a golden that
   claims ACTIVE state is a state-spoof it is meant to catch).
7. Serving hosts (:8080 both boxes, :11434/:8900) never displaced; :3001/:5174 never; :3093/:5193
   orchestrator-only. exactOptionalPropertyTypes + noUncheckedIndexedAccess ON (server/tsconfig
   .json:13-14): every optional field `...(x ? {k: v} : {})`, never `undefined`.

## 7. BASELINES / PINS (re-measure ALL fresh in the claim worktree; W2-6..W2-10 merges will move
the lintRules/schemas counts and possibly the tsc multisets — deltas must be EXPLAINED, not
absorbed)

- Trunk tip at compose: fcce2212 + docs (27904dc6). Re-pin at claim; re-run every CAMT cite.
- server tsc: primary-error multiset == /tmp/l2t0415-tsc-server.txt (26 lines) UNLESS a merged
  upstream re-pinned it — use the LATEST handoff pin; compare by stripped-coordinate sorted
  multiset, EMPTY diff.
- app tsc: 34 primary lines (gate spec is app/e2e — confirm it is outside the tsconfig include;
  if it joins the error surface, disclose the exact delta).
- Scoped vitest fail-file SET (src/schema src/lint src/integration src/api/handlers src/store
  src/revisions src/governance) == W2-5 report §0 SET (11 files / 16 failed) EXACTLY
  (comm -13 and comm -23 both EMPTY); this item may ADD passing files only.
- /api/health: schemas 192, lintRules 81 at fcce2212 — re-measure after the orchestrator's
  post-merge restart; expected increase == the merged upstream rules' count, explained rule-by-
  rule in the report.
- MANIFEST.yaml sha 873e13432ef6…39a3 (measured this session); goldens expect 15;
  scientist-intent-compile.yaml sha b47eee0c… (treeState pin, MANIFEST.yaml:14).
- PDF sha 257f57196f6c… (this session's measurement of the resource file).
- Fleet: one worker under the coder lock; report `.hermes/plans/W2-11-report.wip-l2t<token>.md`
  at the trunk checkout (unique); final stdout line `W211 DONE <sha>`.
- Worker contract: worktree `<integration>/wt/W2-11-lane2-l2t<token>` off the trunk tip AT
  DISPATCH, branch `W2-11-lane2-l2t<token>`; lane bootstrap 1:1 untracked symlinks (node_modules,
  server/schema symlink per lane standard); per-worktree excludesFile
  `/home/brad/.hermes/cl/lanes/2/lane-exclude-W2-11-l2t<token>`; `git -c core.fileMode=false` for
  EVERY git command; zero scratch files in the commit.

## 8. REPORT CONTRACT (.hermes/plans/W2-11-report.wip-l2t<token>.md)

Sections: 0 claim base (tip sha, re-measured pins with capture paths); 1 CAMT verdicts — every
§0.5/§11 bind: CONFIRMED / MOVED-to-X / ABSENT, with file:line at the claim tip; 2 golden transcript
(RED-at-base evidence for the first campaign assertion + GREEN final, counts machine-measured via
`git diff --numstat`); 3 the five negatives, each with the refusal code VERBATIM from the merged
trunk and the zero-write proof; 4 live-smoke run (command, artifact path, artifact.json keys, the
classification line pasted verbatim, honest either-way statement; a run that could not complete is
reported as UNRUN with the transport error, never omitted); 5 determinism evidence (the three-run
sha256 digests of emitted YAML + serialized artifacts); 6 gate leg results D1-D6 with receipt dir
listing and the reviewer's VERDICT line; 7 prompt/model budget section (task-list convention: the
GOLDEN makes zero model calls; the live runner names the config-resolved profile, no literals);
8 declared findings (scout-style corrections, any spec-vs-merged-trunk drift that forced an
adaptation, the frozen artifact's review provenance); 9 hard-stop self-audit (each §6 item with
the command output). No line counts from memory.

## 9. TEST FILE INVENTORY (complete; everything else EMPTY diff)

| # | Path | Kind | Content |
|---|---|---|---|
| A | `server/src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts` | NEW TEST | G1-G7 golden legs (§2.2), fixture self-pins, production spine composition |
| B | `server/src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts` | NEW TEST | N1-N5 refusals (§3), zero-write snapshots, N5 structural arms |
| C | `server/src/ingestion/vendor-protocol/campaign-fixtures/` (frozen draft, robot answers, PROVENANCE.md) | NEW DATA | §2.3, committed BEFORE the golden goes green (the freeze is a review act, the file order is the audit trail) |
| D | `server/scripts/zymo-campaign-live-smoke.ts` | NEW RUNNER | §2.2 live leg; live-smoke.ts header contract verbatim; never CI/vitest |
| E | `app/e2e/w2-11-campaign-demo.spec.mjs` | NEW GATE SPEC | §4 D1-D6, seeding leg replay of merged W2-8's, BASE_URL ?? :5193 |

Verification commands (worker): `cd <wt>/server && npx vitest run src/ingestion/vendor-protocol
src/compiler/scientistIntent` -> new suites + every pre-existing suite green;
`npx vitest run` on the §7 scoped dirs -> fail-file SET identity; `npx tsc -p .` multiset == pin;
`cd app && npm run typecheck` set-equal baseline; `git -c core.fileMode=false diff --stat` ->
ZERO lines outside §9 paths (records/, goldens/, schema/, app/src/, server/src/{compiler,api,
extract,config}/ all EMPTY); live run per §8.4; `npx playwright test app/e2e/
w2-11-campaign-demo.spec.mjs --project=chromium` = orchestrator/reviewer act, NEVER the coder's.

## 10. OPEN QUESTIONS (numbered W211-OQn; recommendation + what would settle it)

W211-OQ1 — MANIFEST ADD RIGHTFULNESS (brief: raise, do NOT decide). May W2-11's convergence
golden ADD entries to `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` (fixtures + a
treeState entry)? (a) NO — zero MANIFEST touch (W2-7's ruling for its own goldens; this draft's
default): campaign fixtures self-pin inside the test file, replayKernel's blessed suite stays the
spine6 contract, drift still fails loud locally; (b) YES — fold the campaign fixtures into the
blessed manifest so `golden-replay.ts` scripts cover the whole campaign in one command. Checked:
MANIFEST header ("blessed ONCE… never silently re-blessed"), replayKernel manifestHashMismatches
loud-drift, W2-7 §0.20 ("this item NEVER touches goldens/"), W2-6 promotion record P6 (EMPTY diff
hard-stop). RECOMMENDATION: (a); if the orchestrator wants one-command campaign replay, the natural
home is a NEW campaign-local manifest file in campaign-fixtures/ (option (c)), not a re-bless of
spine6. SETTLES: the orchestrator's smallest ruling "(a)", "(b)", or "(c) campaign-local manifest".

W211-OQ2 — THE FATE OF candidateToProtocolPayload.ts. The W2-8 OQ2 ruling says "(a) module+test
byte-untouched (smallest diff; death belongs to W2-11 goldens)" (task-list :4931). Does "death"
authorize W2-11 to DELETE the mapper + test? (a) NO — W2-11 proves death-by-refusal only: the
negative golden N2(b) re-runs the zero-call-site grep and the wave-2 lint wall; module stays
byte-untouched (W2-8's ruling constraint outranks the metaphor); (b) YES — delete module+test in
this item's diff, completing the retirement. Checked: ruling text verbatim; W2-8 §0.3 (only
caller was the retired route); the hard-stop "app/** byte-untouched except gate spec" — deletion
touches app/src, which §6.5 forbids without a ruling. RECOMMENDATION: (a). SETTLES: orchestrator
ruling; (b) would force an explicit §6.5 amendment + app tsc set re-check.

W211-OQ3 — WHICH ARTIFACT FREEZES (the golden's input). (a) freeze a REAL W2-6 model output —
taken from the W2-10 matrix run whose combo PASSED its own declared criteria, then human-reviewed;
strongest evidence (the golden then replays real extraction); (b) fall back to a hand-authored
family fixture (W2-7's merged fixture shape) if no combo passes at W2-11 claim — the golden stays
green and honest (it proves the SPINE), but the "reviewed extraction output" flavor is carried by
the live-smoke artifact only. Checked: W2-10 criteria file declares reps/thresholds/verdict rule;
W2-6 A2 (Zymo fixture output validates) is W2-6's own bar; PROTO-AI-12 verdict rule guarantees
W2-10 will name an honest verdict per combo. RECOMMENDATION: (a) primary, (b) declared fallback —
decided AT PROMOTION from W2-10's merged report (this is a claim-time data pick, not code).
SETTLES: W2-10's report verdict table (exists before W2-11 promotion per the deps line).

W211-OQ4 — LIVE MODEL CONTENTION DURING THE GATE. D3 (mounted AI) requires a real chat turn
against the single-slot computable llama.cpp — the SAME slot the browser-reviewer itself and
cl-scout share (W2-10 §0.1). (a) schedule the gate with the fleet coder absent and the slot idle,
chat-turn timeouts from config DATA (never a code timeout); a queued-but-completed turn is fine,
a transport death is reported honestly and the leg re-run once; (b) make D3's proposal leg ride a
non-live path — IMPOSSIBLE without faking (the panel's whole point is a live proposal), so (b) is
listed only to be refused. Checked: W2-9's own gate ran the identical single-slot chat turn and
was accepted (lane-2 precedent); computable single-slot queueing is real (W2-10 §0.1).
RECOMMENDATION: (a) — orchestrator schedules the gate, coder never touches the stack. SETTLES: the
W2-9 gate acceptance record (already exists) + this tick's queue state.

## 11. CAMT BIND LIST (every one re-verified at claim; merged trunk wins; each MOVED/ABSENT
verdict is report §1 material)

- W2-6 (unmerged, coder live): endpoint path + ExtractHandlers family site (routes.ts:632
  neighbor per P3); SEMANTIC_PASS_* codes; ai.semanticPass optional block + fallback read site
  (P2); the Zymo draft's real emitted shape (branch_axes ids, intent steps, provenance
  [kind,type,id,pageStart], ref.id===candidate recordId per P1); prompt file path+sha (frozen
  across any re-freeze).
- W2-7 (unmerged): `realizeScientistIntent.ts` export names (`lowerRealization` /
  `realizeAndCompile` — if merged chose different names, ride the merged ones); REALIZATION_* code
  strings LITERALLY as merged; policy file `schema/registry/realization/robot-realization.
  policy.yaml` required-answer set (the robot answers fixture must match it exactly); the merged
  W2-4 LOCAL_REALIZATION carrier shape (W2-7 OQ2 ruling: copy verbatim, report which); deck-pass
  depth per its OQ3 ruling (gate+labels depth is the proof bar — do NOT demand more in the golden).
- W2-8 (unmerged): seeding fixture leg path + shape (D1-D3 reuse it verbatim); SemanticDraftPanel
  / SaidFactsPane file paths + testids; retirement testids confirmed absent (`vpdf-save`,
  `vpdf-save-as`, `vpdf-use-extracted`); realization-entry mount point (ProtocolTabPanel line
  drifts).
- W2-9 (unmerged): ReviewAiPanel testids (D3 drives them); applyDraftProtocolEdit export;
  SemanticPassModelSection shape per its OQ3 disposition; gate spec file name (D-leg receipts
  dir convention inherits theirs).
- W2-10 (unmerged): criteria file + report verdicts (decides W211-OQ3); its runner's profile-add
  pattern for the lane config (the live runner reads config DATA, adds nothing itself).
- Merged-first-hand (NOT CAMT, verified this session at fcce2212): §0.3 cites — appendOnly wall,
  APPEND_ONLY throw sites, PROMOTION_CONTROLLED_ESCALATION, xdr-promote-blocked-by-unresolved,
  BRANCH_RESOLUTION_MISSING, lint rule ids, routes.ts:632-633, IntentCompileHandlers:119, MANIFEST
  sha, rung-vocabulary paths, surfaces.yaml:83, App.tsx route lines, live-smoke/replayKernel
  classification contract, PDF sha, VPDF-257F57196F6C fixture location.

COMPOSED 2026-10-10 ~05:00 EDT by cl-spec-composer (l2t0450). All §0 cites opened FIRST-HAND at
fcce2212 this session (PDF sha and MANIFEST sha measured by hash, routes enumerated by grep,
lint ids read from the YAMLs, not from scout logs — no scout was needed and none was used).
Nothing here is promoted.
