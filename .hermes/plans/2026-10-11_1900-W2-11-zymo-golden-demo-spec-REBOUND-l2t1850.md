# W2-11-ZYMO-GOLDEN-DEMO — spec REBOUND (cl-spec-composer, 2026-10-11 ~19:00 EDT, run token l2t1850)

REBOUND SPEC — every CAMT bind from draft l2t0450 resolved against the MERGED trunk (§0 below).
DRAFT lineage: composed pre-deps at fcce2212 (l2t0450); rebound at trunk 4c899cfc (dispatch
l2t1235). All five deps MERGED: W2-6 @ 9a68f26c, W2-7 @ 496eabbf, W2-8, W2-9 (ReviewAiPanel at
app/src/ingestion/protocol-review/ReviewAiPanel.tsx; reviewWriteWall landed), W2-10 (report
promoted @ 6a00b4d7). Binding rulings carried: W211-OQ1=(a) no MANIFEST touch; W211-OQ2=(a)
ZymoGoldenE2E byte-untouched AND candidateToProtocolPayload byte-untouched; W211-OQ3 OPERATIVE
= fallback (b) hand-authored frozen fixture (§0.1 below — both W2-10 combos verdict FAIL);
W211-OQ4=(a) orchestrator schedules the browser gate. Orchestrator reviews + promotes; nothing
here is canonical until promoted. git ALWAYS `-c core.fileMode=false` (NFS tree).

## 0 CLAIM REBIND (l2t1235 dispatch / composer run l2t1850)

0.1 W211-OQ3 OPERATIVE PICK — VERIFIED FIRST-HAND AGAINST THE PROMOTED REPORT.
`.hermes/plans/W2-10-model-evidence-report.md` (315 ln, sha256 starts `ed1d2edd92f487a9`), §1/§2:
FINAL SCORED LAUNCHES (:108-122) — **thunder-q38: verdict FAIL**, failing_metrics
[schema_pass_rate, lint_errors, downstream_compile] (:110); **computable-q4b: verdict FAIL**,
same failing_metrics (:114); "NO winner is declared" (:121-122). Root cause documented as
**F-LANE2-W210-D** (:145, :210-215): PRODUCT CONTRACT GAP at the W2-6 -> W2-3 seam — landed
semantic-family kind-tagged steps "fall between the literal-step and IntentStep branches" of the
merged protocol.schema.yaml oneOf, so "schema_pass_rate can never reach 1.00 for ANY model"
until the seam is fixed. Therefore the ruling structure's primary leg (a) — freeze a real W2-6
model output from a combo that PASSED — has NO source artifact. **The declared fallback (b) is
OPERATIVE**: the golden's frozen fixture is the hand-authored semantic-family artifact in the
merged W2-7 fixture shape (realizationGolden.test.ts inline fixtures — per the W2-10 spec N6d
doctrine, reuse those bytes by import/byte-copy, never re-author). The golden's PROVENANCE.md
block MUST name the W2-10 FAIL verdicts and F-LANE2-W210-D verbatim as the why: the freeze is
honest (declared hand-authored family proving the SPINE), NOT a faked green "reviewed extraction
output". The "reviewed extraction output" flavor is carried ONLY by the live-smoke artifact
(live-smoke.ts :17-18 "evidence, not a gate").

0.2 CLAIM BASE RE-PIN (measured this rebind, all first-hand):
- Trunk tip at rebind: **4c899cfc** `fix(shorthand): the run chat sees the scientist's DECK`
  (git -c core.fileMode=false log --oneline -1, run 2026-10-11 ~19:45 EDT). NOTE: the trunk
  MOVED MID-REBIND (ea573a76 -> 4c899cfc, +75 commits since compose base fcce2212); the coder
  branches off the tip AT DISPATCH and re-checks only the pins below.
- MANIFEST: `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` sha256
  `873e13432ef6dc3e32e22ba47e69a7a66c0737e39e67fccb8ba63851fbca39a3` — UNCHANGED from draft;
  git blob 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (`git hash-object`, matches the lane pin).
  treeState scientist-intent-compile.yaml pin b47eee0c3bd0f… at MANIFEST.yaml:11; measured file
  sha `b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8` — MATCHES. Goldens
  expect-count 15: VERIFIED as 15 it()/test() across goldens/*.test.ts (5+3+7).
- server tsc --noEmit: **19 error-TS lines** at 4c899cfc, capture `/tmp/l2t1850-tsc-server-final.txt`
  == the current lane pin "19/34". (An intermediate read at ea573a76 worktree gave 20 — the
  then-UNCOMPLETED shorthand deck fix's `shorthandSearchLabwareByHint` TS6133 — explained and
  resolved by merge 4c899cfc; NOT absorbed silently.) The draft's 26-line /tmp/l2t0415 pin is
  SUPERSEDED (drift across 75 merged commits; the lane re-pinned at 19 via the W289/SHORTHAND
  batteries).
- app tsc --noEmit: **34 error-TS lines**, capture `/tmp/l2t1850-tsc-app.txt` — matches pin.
- schemas 192: `git ls-files 'schema/**/*.schema.yaml' | wc -l` == 192 — UNCHANGED. lintRules 81
  is a /api/health number (stack op — FORBIDDEN this pass); carry as claim-time re-measure per §7.
- PDF sha re-measured: `257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b` —
  starts 257f57196f6c, MATCHES the draft pin.
- VPDF record fixture: `/home/brad/.computable-lab/worktrees/main/records/vendor-pdf/
  VPDF-257F57196F6C__zymobiomics-96-magbead-dna-kit.yaml` EXISTS (located first-hand this rebind
  — closes the draft's CAMT re-locate obligation; W2-10 §0.5 confirmed; TEST DATA).

0.3 CAMT BIND RESOLUTION TABLE (27 binds; every citation opened first-hand at 4c899cfc;
report §1 cites this table — "CAMT" no longer appears anywhere in this spec):

| # | Draft bind (where) | Verdict | Verified cite / landed shape |
|---|---|---|---|
| C1 | W2-6 endpoint path + family site (§0.5, §11) | VERIFIED | `POST /extraction/vendor-candidates/:recordId/semantic-draft` at `server/src/api/routes.ts:636`, in the extractHandlers family directly beside the promote/reject pair :632-633 (P3/OQ1(ii) as written) |
| C2 | W2-6 SEMANTIC_PASS_* codes (§0.5) | VERIFIED | `server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts`: NO_CANDIDATE :52, TRUNCATED :53, PARSE_FAILED :54, UNKNOWN_THINKING_LEVEL :55, STEP_COVERAGE (refuse-on-missing-coverage) :48/:270, DRAFT_WRITE_FAILED :330; guards in `semanticPassGuards.ts` (:17 ANCHOR_UNRESOLVED drop-not-rewrite) |
| C3 | ai.semanticPass optional block + fallback read (P2) | VERIFIED | `server/src/config/types.ts:189` `semanticPass?: SemanticPassConfig`; ONE resolution seam `resolveSemanticPassInference` consumed at `server/src/server.ts:880-883` (read-per-call, Settings-saved block honored without restart) |
| C4 | W2-6 draft emitted shape + P1 ref.id=recordId | VERIFIED (shape; artifact per OQ3) | anchor drops enforce ref.id === candidate recordId (`semanticPassGuards.ts`, W2-6 commit 9a68f26c); model axes discarded + deterministic deriveBranchAxes binding. The frozen ARTIFACT is hand-authored per §0.1 — the W2-10 FAIL verdicts mean no model draft of sufficient quality exists to freeze |
| C5 | W2-6 prompt file path + sha | VERIFIED | `server/src/extract/prompts/semantic-family-draft.md`, sha256 `26b2427898add58d1b3cca9314c86819f31bc8ebf7ebbc60acacbf01020d926a` (read-per-call via `loader.ts:97 loadExtractionPrompt`) |
| C6 | W2-7 export names `lowerRealization`/`realizeAndCompile` | VERIFIED (LANDED AS DRAFTED) | `server/src/compiler/scientistIntent/realizeScientistIntent.ts` — `lowerRealization` :310, `realizeAndCompile` :697 (inputs :281/:689, results :288/:693); `loadRealizationPolicy` :167, `defaultPolicyPath` :161 |
| C7 | REALIZATION_* code strings LITERALLY as merged | VERIFIED | Landed set (all in realizeScientistIntent.ts): ANSWER_INVALID, ANSWER_MISSING, BRANCH_ID_MASQUERADE, BRANCH_UNRESOLVED, CAPABILITY_MISSING, EMISSION_INVALID, INHERITS_MISMATCH, SUBSTITUTION_DISALLOWED, VERB_UNADJUDICATED (see C25/C26 for N1/N3 specifics) |
| C8 | policy file required-answer set | VERIFIED | `schema/registry/robot`… exact path `schema/registry/realization/robot-realization.policy.yaml` EXISTS (only file in that dir); `requiredAnswers` EXACTLY THREE: `sample_count` (answerLocation branch_resolution.choices, answerKey sample_count, boundDimension count), `sample_plate` (setup_rows/labwares, roleFromProfile sampleLayout.labwareRole), `reagent_source` (setup_rows/labwares, roleFromProfile reagentSource.sourceLabwareRole). scaleBindings: answerValue `robot` -> scaleProfileId `robot-assist-plus-96`. The robot-answers fixture must match THIS set exactly |
| C9 | merged W2-4 LOCAL_REALIZATION carrier shape (copy verbatim) | VERIFIED | carrier = `branch_resolution[].{axisId, matched, branchIds, choices}` with `choices?: Record<string, unknown>` shape (a) `{ [axisId]: chosenValue }` — realizeScientistIntent.ts:93-95, policy :50-54 (empty `{}` counts ABSENT :297); the minting UI writes exactly this shape at `server/src/api/handlers/IntentAcceptHandlers.ts:75-82` |
| C10 | deck-pass depth per W2-7 OQ3 ruling | VERIFIED | promoted W2-7 spec `2026-10-09_2100-W2-7-realization-spine-spec.md:584`: OQ3 = (a) gate+labels depth is the proof bar — the golden demands NO MORE |
| C11 | W2-8 seeding fixture leg — "reuse theirs verbatim" (§4) | MOVED -> | `app/e2e/w28-said-meant-surface.spec.mjs` exists and is SELF-CONTAINED (:9-27) but its seeding legs `seedVpdf` :102 / `seedXdr` :144 are module-local inside a playwright spec — NOT importable. The W2-11 spec COPIES the pattern (POST /api/vendors/graph-lemur/pdfs/upload for the VPDF leg — idempotent, content-addressed; POST /api/records for the XDR leg), swapping `app/e2e/fixtures/w28-said-meant/said.pdf` for the pinned Zymo PDF (sha 257f5719…) + the campaign frozen XDR. Declared in the report; no fork of a second seeder beyond the required content swap |
| C12 | SemanticDraftPanel / SaidFactsPane paths + testids | VERIFIED | `app/src/ingestion/protocol-review/SemanticDraftPanel.tsx` (testids semantic-draft-panel :102, -taptab :110, -branch-axes :129, -evidence :145, -save :192, -note :198, -error :200) and `SaidFactsPane.tsx` (said-facts :108, said-facts-gap :95); mounted in `app/src/ingestion/VendorPdfReviewPage.tsx:43/:880` |
| C13 | retirement testids absent (vpdf-save / -save-as / -use-extracted) | VERIFIED | grep across app/src: the strings occur ONLY in `VendorPdfReviewPage.wave2.test.tsx:238-242` as negative queryByTestId assertions — no product render site |
| C14 | realization-entry mount point ("ProtocolTabPanel line drifts") | VERIFIED / DRIFT FIXED | `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` imported by `ProtocolTabPanel.tsx:32`, rendered :1788 (inside `protocol-localization-details` :1783); ProtocolTabPanel rendered by `app/src/run/RunWorkspacePage.tsx:98` on the protocol tab; thread calls `apiClient.intentAccept` :451 -> `POST /intent/accept` (`IntentAcceptHandlers.ts:121 registerIntentAcceptRoutes`) |
| C15 | ReviewAiPanel testids (D3 drives them) | VERIFIED | `app/src/ingestion/protocol-review/ReviewAiPanel.tsx`: review-ai-panel :271, review-ai-no-draft :284, review-ai-no-steps :288, review-ai-refusal :294, review-ai-apply-note :314; hosted as the rightPane of `app/src/ingestion/ProtocolReviewHostPage.tsx:84` (left pane = VendorPdfReviewPage :83) on surface `protocol-review` |
| C16 | applyDraftProtocolEdit export | VERIFIED | `app/src/event-editor/right-pane/protocol/applyDraftProtocolEdit.ts:102 export async function applyDraftProtocolEdit` (CHAT_ACCEPT_COMMIT_MESSAGE :34) |
| C17 | SemanticPassModelSection shape per W2-9 OQ3 disposition | VERIFIED | `app/src/shell/settings/SemanticPassModelSection.tsx`, mounted at `app/src/shell/SettingsPage.tsx:165` (settings route `/settings`, App.tsx:209) |
| C18 | W2-9 gate spec file name (receipts convention) | VERIFIED | `app/e2e/w29-review-ai-panel.spec.mjs` — BASE_URL ?? :5193 / API_URL ?? :3093 (:32-33), receipts under `receipts/` per run (convention inherited by W2-11: receipts dir per §4) |
| C19 | W2-10 criteria file `schema/registry/model-evaluation/semantic-pass-matrix.criteria.yaml` | MOVED -> then ABSENT; content-pinned in report; OQ-OPEN (see 0.4 OQ-1) | The path NEVER existed in trunk (draft's §0.5 cite was the draft's own proposal). ORCH AMENDMENT l2t0115 (adv-D1) recorded in the promoted report :18: the criteria file is UNTRACKED (.hermes/plans/semantic-pass-matrix.criteria.yaml), pre-registration proven via CONTENT — every rows.jsonl embeds `criteriaSha` = `851e2a2d5c9bc40062db5a4f8b47a2308564b23ece4c71c850e872e1acafe23d`. At THIS tip the file itself is ABSENT (searched: `.hermes/plans/`, `schema/registry/model-evaluation/` — dir does not exist; find repo-wide). The verdicts it scored are promoted and re-verified (§0.1) |
| C20 | W2-10 report verdicts decide W211-OQ3 | VERIFIED | report :110/:114 FAIL/FAIL; :52-58 lane :3093 has NO ai.semanticPass block (SEMANTIC_PASS_UNAVAILABLE at boot is the honest no-config behavior, not a defect); F-LANE2-W210-D :145/:210 -> fallback (b) operative (§0.1) |
| C21 | W2-10 runner profile-add pattern for the lane config | MOVED/ABSENT -> report-documented | `.hermes/plans/w210-run.mts` ABSENT at tip (was untracked; searched .hermes/plans/, server/tmp/w210 — gone). Pattern lives in the report §: per-combo gitignored config COPIES under `server/tmp/w210/` with sha recorded in-row (:70-71, :283-285), harness boots in-process with its own config copy, never :3093. The W2-11 live runner follows the same shape: reads whatever profile the lane config names, adds NOTHING itself |
| C22 | VPDF-257F57196F6C fixture re-locate (§0.1 CAMT) | VERIFIED | present first-hand this rebind (§0.2 above) — do not invent, located |
| C23 | W2-8/W2-9 gate spec paths (§0.4 "paths CAMT — reuse their seeding legs") | VERIFIED | merged as w28-said-meant-surface.spec.mjs + w29-review-ai-panel.spec.mjs under app/e2e/; seeding reality per C11 |
| C24 | D4 "exact mount path" CAMT (§4 row) | VERIFIED | same evidence as C14 — route `/runs/:runId` (App.tsx:190) -> protocol tab -> `protocol-localization-details` disclosure (ProtocolTabPanel.tsx:1783-1788) -> ProtocolLocalizationThread |
| C25 | N1 codes: BRANCH_RESOLUTION_MISSING + W2-7 L2 REALIZATION_BRANCH_UNRESOLVED "CAMT" + bait #8 masquerading branch ids | VERIFIED (both names LANDED) | `ResolveBranchAxesPass.ts:74` BRANCH_RESOLUTION_MISSING (spine gate, unchanged); realizeScientistIntent.ts `REALIZATION_BRANCH_UNRESOLVED` :338 — fires when an axis has NO matched resolution with chosen branchIds. N1's exact injection (branchId NOT in family `branch_axes[].conditions[].id`) lands under the LANDED, MORE SPECIFIC name **`REALIZATION_BRANCH_ID_MASQUERADE` :351** ("never from vendor candidate step ids" message verbatim at :343/:353-357). The N2 table cell uses the LANDED name: masquerading ids -> MASQUERADE; unanswered axis -> UNRESOLVED; both refused before compile, zero emitted YAML |
| C26 | N3 code REALIZATION_ANSWER_MISSING "CAMT W2-7 L3" | VERIFIED (LANDED AS DRAFTED) | realizeScientistIntent.ts :414 (branch_resolution.choices arm), :466, :632, :645 — refusal BEFORE compile with the policy question text (:417 names question + answer location); belt arm confirmed: chatbot 8-sample guessed default still at `ChatbotCompilePasses.ts:3093-3096` (within the cited :3087-3101), campaign route makes it unreachable (gate fires first) |
| C27 | D5 "route/entry CAMT — if merged W2-7/W2-8 expose an entry, drive it" | VERIFIED-ABSENT -> pre-declared headless branch | NO server route exposes realizeAndCompile/lowerRealization: consumers are ONLY `realizeScientistIntent.test.ts` + `realizationGolden.test.ts` (repo grep). routes.ts's only realize-ish route is the legacy intake `/protocol-ide/intake/trees/:treeId/realize` :936 (NOT the campaign spine). `RealizationCompileGate.ts` exists at `server/src/api/routes/RealizationCompileGate.ts` but gates step-realization PROPOSALS ({events,labwares}) pre-accept — a different contract, do NOT drive it for D5. Therefore the draft's honest alternative is the operative branch: D5 proven headlessly (realizeAndCompile on the frozen fixture -> LPR payload + emitted document GET paste), receipt honestly named |

0.4 OQ-OPEN ITEMS THIS REBIND (max 3 per contract; both carry what was searched):
- W211-OQ5 (new, from C19): should the orchestrator RESTORE the W2-10 criteria YAML for the
  PROVENANCE.md citation? Search: whole-repo + .hermes/plans + schema/registry (ABSENT);
  content is recoverable ONLY via the report's content-pin sha 851e2a2d… (:18). Impact: the
  frozen artifact's PROVENANCE.md names the W2-10 FAIL verdict + criteriaSha — the cite is to the
  PROMOTED REPORT (exists, verified), so the golden is NOT blocked; the OQ is whether a criteria
  file copy should be committed beside campaign-fixtures/ for auditability. Recommendation: cite
  the report path + criteriaSha, no file restore (smallest diff; the report is the promoted
  artifact).
- W211-OQ6 (new, from C24/D4): D4 is the lane's FIRST AUTOMATED run-workspace realization leg
  (W2-8's A5 was explicitly "the reviewer's manual leg", spec :26-28/:353-355 — only the XDR
  branch_axes data precondition was automated). The seed leg must therefore create the RUN and
  surface the promoted family there. Search: RunWorkspacePage.tsx:98 renders ProtocolTabPanel
  with runId; runs are records (POST /records); protocol-steps routes exist
  (server/src/api/routes/protocol-steps.ts). The mechanics of attaching the promoted family to a
  seeded run for the gate (vs manual attach) are not resolvable read-only without driving the
  stack. Recommendation: seed leg attempts POST-created run + protocol selection per
  ProtocolSelectionContext; if the merged product cannot serve it from seed data only, the leg
  reports honestly (no faked gate) — §4 VERDICT clause already covers it.

0.5 NEW REVIEWER BAIT THIS REBIND (additions to the draft's §6 hard-stops; the coder pre-empts):
- `OutcomeVerdict` has FOUR members at tip, not three: `'SUCCESS' | 'NOT_SUCCESS_CLARIFICATION' |
  'EXTRACTION_FAILURE' | 'INFRA_FAULT'` (replayKernel.ts:443-447; INFRA_FAULT landed after the
  draft was composed). The live runner classifies through the shared function — do NOT hand-roll
  a 3-way union.
- `server/live-zymo.mts` (cited as chaining precedent, still exists) contains LIVE LITERALS
  (baseUrl :8899, model lfm2.5-2.6b :6-7). It is precedent for the CHAIN SHAPE only; copying any
  literal into a new file violates the §6.4 grep wall.
- The w28 seeding functions are NOT importable (C11) — a "reuse theirs verbatim" import attempt
  is a design error; the copy-the-pattern route is the sanctioned one.
- MANIFEST identity has two forms: content sha256 873e1343… vs git blob 58c447eb… — the report
  must not confuse them (both verified equal-to-pin this rebind).
- D5: RealizationCompileGate.ts is a LOOKALIKE (step-realization proposal gate, not the W2-7
  spine). C27 rules the headless branch; driving the gate would be a wrong-surface defect.
- Route names: RunWorkspacePage resolves to `app/src/run/RunWorkspacePage.tsx` (App.tsx:44 lazy),
  NOT app/src/graph/RunWorkspacePage.tsx — cite the run/ file. The fabricated
  `/project/<study>/record/<id>` route remains banned (§0.4 of the draft stands verbatim).

0.6 MERGED-FIRST-HAND CITE DRIFTS FIXED IN BODY (draft §0.3 said "NOT CAMT"; trunk moved four of
them; repaired in place below): appendOnlyKinds default moved types.ts:483 -> **:520** (option
field :378); surfaces.yaml protocol-review id/path moved :82/:83 -> **:83/:85**; deriveBranchAxes
"Real case: ZymoBIOMICS 96 kit steps 1 and 4" moved :16-19 -> **:21**; rung-vocabulary rungs
:13-32 -> VENDOR :32 / LOCAL_REALIZATION :82. Every other §0.3 cite re-verified UNCHANGED at
4c899cfc: RecordHandlers.ts:790/:1282, CandidatePromoter.ts:121/:122/:171,
ResolveBranchAxesPass.ts:74, IntentCompileHandlers.ts:119, routes.ts:632-633, IntentAccept
Handlers.ts:75-82 choices shape, all App.tsx route lines (150/173/189/190/196/200/209), the lint
rule ids + line numbers (protocol.lint.yaml 138/173/206/235/269/318; local-protocol 38/67/93;
extraction-draft 24/61/95), live-smoke.ts header contract (:17-18 verbatim, file 148 ln),
replayKernel classifyCompileResponse :449, ZymoGoldenE2E.test.ts 47 ln (:14-16, :25),
zymo-magbead-minimal footprint (ProtocolRegistry.test.ts + Prompt02Green.test.ts + their own
fixture prompt-02-zymo-magbead.yaml — legacy D2 input only), rung-vocabulary file set,
gate-pbch6.spec.mjs (:8 :5193, :13 :3093/api/health).

GOAL (one sentence): Prove the campaign end-to-end on the Zymo input — PDF -> immutable
candidate -> draft/promoted semantic family -> robot realization (LOCAL_REALIZATION) ->
scientist-intent YAML -> run graph — as a byte-deterministic headless golden over FROZEN reviewed
artifacts, with the live extraction kept honestly separate (live-smoke script, honest outcome
classes, NOT_SUCCESS allowed), all five named negative goldens refusing with stable codes, and a
browser demo of the full reviewed journey on the merged W2-8/W2-9 surfaces reproducible from seed
data only.

## 0B. ORIENTATION CITES (every file:line OPENED FIRST-HAND — at fcce2212 by l2t0450, RE-VERIFIED
or repaired at 4c899cfc by l2t1850 per §0.6; NO cl-scout used — every question answered by direct
read, W2-10 §0.9 precedent)

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
  sha256 `257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b` (re-measured this
  rebind) — the record fixture
  `VPDF-257F57196F6C__zymobiomics-96-magbead-dna-kit.yaml` CONFIRMED at
  `/home/brad/.computable-lab/worktrees/main/records/vendor-pdf/` (§0.2 — CAMT CLOSED; all
  records there are TEST DATA).
- Branch machinery feeding the family: `server/src/ingestion/vendor-protocol/deriveBranchAxes.ts`
  header :7-27 — the extractor captures lettered `step.branches: string[]`; same-option-key steps
  become ONE axis ("Real case: ZymoBIOMICS 96 kit steps 1 and 4" :21 — MOVED from :16-19);
  predicates target `$.branchSelection` (:25-26, predicate construction :223).
  `stepVariantMarkers.ts` = registry-driven variant fill
  (`schema/registry/intake-patterns/step-variant-markers.yaml` — exists, verified).

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
  `'SUCCESS' | 'NOT_SUCCESS_CLARIFICATION' | 'EXTRACTION_FAILURE' | 'INFRA_FAULT'` (:443-447;
  RE-VERIFIED — the fourth member INFRA_FAULT landed post-draft, §0.5 bait); "replay and live
  cannot disagree" (live-smoke.ts :18-19). The clarification bar MUST classify
  NOT_SUCCESS_CLARIFICATION (:461-462).
- Harness siblings for the live legs exist and are precedents for in-process chaining:
  `server/live-zymo.mts` (decode -> complete -> parseScientistIntent -> compileScientistIntent;
  exists — SHAPE precedent only, it carries live literals, §0.5 bait).

0.3 MERGED-SHAPE FACTS THIS ITEM RIDES (verified first-hand — line drifts repaired per §0.6):
- Candidate IMMUTABILITY is server-backed: `server/src/config/types.ts:520` — DEFAULT
  `appendOnlyKinds: ['audit-event','signature','vendor-protocol-candidate']` (option field :378);
  the wall throws `APPEND_ONLY` at `server/src/api/handlers/RecordHandlers.ts:790` (update) and
  :1282 (delete). Campaign tests MINT candidates via POST /records ONLY; never PUT/DELETE.
- Promotion is born-draft and spoof-closed: `server/src/extract/CandidatePromoter.ts` —
  `PROMOTION_CONTROLLED_ESCALATION` at :171; `xdr-promote-blocked-by-unresolved` at :122 (lint
  twin named at :121). Promote/reject routes `POST /extraction/drafts/:id/candidates/:i/promote`
  /reject at `server/src/api/routes.ts:632-633`; the W2-6 semantic-draft route sits at :636 (§0.3
  C1).
- Lint rule ids that the negative goldens cite (re-read from the merged YAMLs at tip — all line
  numbers UNCHANGED):
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
  `instance.post('/intent/compile', …)` — production spine composition (:59-62 per W2-7 §0.6);
  accept route `POST /intent/accept` at `IntentAcceptHandlers.ts:121` (choices shape :75-82).
- Goldens MANIFEST: `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` sha256
  `873e13432ef6dc3e32e22ba47e69a7a66c0737e39e67fccb8ba63851fbca39a3` re-measured at tip (== W2-6
  promotion record P6 pin; blob 58c447eb §0.2). Suite `spine6-scientist-intent-goldens`; treeState
  pins scientist-intent-compile.yaml (:11); fixtures/ + __records__/ replay with loud drift.
- Rung vocabulary is DATA at `schema/registry/provenance-ladder/` — `rung-vocabulary.yaml`
  (kind: provenance-vocabulary; rungs VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION —
  VENDOR :32, LOCAL_REALIZATION :82, MOVED from :13-32; mints_on lists :165-168), plus
  `rung-vocabulary.lint.yaml` and `rung-vocabulary.ui.yaml` (NOT under schema/workflow/).
- StepProvenanceRef merged shape (W2-6 PROMOTION RECORD P1, binding campaign-wide): required
  `[kind, type, id, pageStart]`, `id` = the SAID candidate record's OWN recordId (NOT
  documentId), type enum closed `[vendor-protocol-candidate, evidence]` at BOTH $defs sites.
- W2-6 landed family (first-hand at tip): `SemanticFamilyPass.ts` + `semanticPassGuards.ts` +
  prompt data `server/src/extract/prompts/semantic-family-draft.md` + route routes.ts:636 + the
  P2 seam server.ts:880-883 (§0.3 C1-C5). The lane :3093 config has NO ai.semanticPass block —
  SEMANTIC_PASS_UNAVAILABLE at boot is honest no-config behavior (W2-10 report :52-58).

0.4 UI SURFACES FOR THE BROWSER DEMO (exact routes, file:line backed — the reviewer HAS TWICE
fabricated `/project/<study>/record/<id>`; that route DOES NOT EXIST and any gate step naming it
is a fabricated-route defect, AS-LANE2-BROWSER-REVIEWER-FABRICATED-ROUTE):
- `/ingestion/vendor-pdf/:recordId` -> ProtocolReviewHostPage: `app/src/App.tsx:150`; registered
  surface id `protocol-review` with that exact path at
  `schema/registry/surfaces/surfaces.yaml` (id line :83, path :85 — MOVED from :82/:83, opened).
  Host = left pane VendorPdfReviewPage (immutable SAID) + right pane ReviewAiPanel (mounted AI)
  at `app/src/ingestion/ProtocolReviewHostPage.tsx:83-84`.
- `/record/:recordId` -> RecordHostPage: `app/src/App.tsx:196`.
- `/runs/:runId` -> RunWorkspacePage (`app/src/run/RunWorkspacePage.tsx` via App.tsx:44):
  `app/src/App.tsx:190` (and redirect `/project/:studyId/run/:runId` :189);
  `/event-editor/:eventGraphId` :173; `/deck/…` :200; `/settings` :209. There is NO
  `/project/:studyId/record/…` route (full Route grep re-run at tip).
- Gate harness precedents: `app/e2e/gate-pbch6.spec.mjs` (baseUrl http://localhost:5193 :8,
  /api/health precheck at :3093 :13, screenshots to a receipts dir) + the MERGED W2-8/W2-9 gate
  specs `app/e2e/w28-said-meant-surface.spec.mjs` + `w29-review-ai-panel.spec.mjs` (both
  BASE_URL ?? :5193 / API_URL ?? :3093; seeding pattern per §0.3 C11). Run form
  `cd app && npx playwright test <file> --project=chromium`. Receipts dirs under
  `/home/brad/.hermes/cl/receipts/W2-11-ZYMO-GOLDEN-DEMO/<ts>/`. Stack :3093/:5193 belongs to the
  orchestrator; the coder NEVER touches them.
- Realization entry (downstream questions): `app/src/event-editor/right-pane/protocol/
  ProtocolLocalizationThread.tsx` hosted by ProtocolTabPanel (import :32, render :1788; §0.3 C14
  first-hand at tip) + POST /intent/accept (`server/src/api/handlers/IntentAcceptHandlers.ts:121`
  route; choices shape :75-82).

0.5 UPSTREAM SHAPES THE GOLDEN RIDES — ALL CAMT MARKERS RESOLVED AT TIP, see the §0.3 bind table
(C1-C27). Summary for the coder: every W2-6/W2-7/W2-8/W2-9/W2-10 shape this item rides is now
VERIFIED with file:line at 4c899cfc; the only MOVED/ABSENT verdicts are the W2-10 criteria file
+ runner (C19/C21, content-pinned in the promoted report) and the w28 seeding import route
(C11, copy-the-pattern instead). NOTHING in this spec asks the coder to assume an unmerged shape.

0.6 BASELINE FACTS (re-measured at tip per §0.2; carry-forward handoffs updated):
trunk lintRules 81 was the fcce2212 /api/health number — RE-MEASURE at claim after the
orchestrator's post-merge restart (expected increase == merged upstream rules, explained
rule-by-rule; NOT stack-able this pass); schemas 192 re-verified via git ls-files at tip;
server tsc primary-error multiset == `/tmp/l2t1850-tsc-server-final.txt` (19 lines, re-measured
at 4c899cfc — the /tmp/l2t0415 26-line pin is SUPERSEDED, drift explained §0.2); app tsc 34
primary lines (`/tmp/l2t1850-tsc-app.txt`, re-measured); W2-5 broad scoped fail-file SET = 11
files / 16 failed tests (W2-5 report §0 list) — RE-MEASURE fresh in the claim worktree;
goldens expect 15 (re-verified as 15 tests); zymo-magbead-minimal appears ONLY in
`server/src/compiler/pipeline/fixtures/ProtocolRegistry.test.ts` + `Prompt02Green.test.ts`
(+ their own fixture `prompt-02-zymo-magbead.yaml`) — D2 legacy INPUT only.

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
  `lowerRealization`/`realizeAndCompile` (VERIFIED realizeScientistIntent.ts:310/:697), the
  semantic-draft service, the criteria data). Golden-
  ONLY additions ride this item's own files.
- `goldens/**` incl. MANIFEST.yaml (sha 873e1343… / blob 58c447eb pinned byte-untouched —
  W211-OQ1 RULED (a): zero MANIFEST touch, an ADD is an orchestrator act, never a coder act);
  `records/**` in ANY repo (tests mint via POST /records / in-process store only); `schema/**`
  zero edits (the ladder, rung UI, lint, and pipelines are merged data this item SATISFIES,
  never re-declares); `config.yaml`
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
    PDF bytes (pinned sha 257f5719… re-verified §0.2) -> decode -> candidate (assert 17 steps,
    branches kept)
    -> candidate minted via POST /records (appendOnly wall proven by a refusal arm, not by
       mutation) -> FROZEN reviewed semantic draft (committed fixture, §2.3) promoted through the
       REAL W2-5 promotion route (born-draft family PRT) -> robot answers -> REAL W2-7
       `realizeAndCompile` (VERIFIED :697) -> emitted scientist-intent YAML ->
       `parseScientistIntent` (real Ajv)
       -> `compileScientistIntent` with the PRODUCTION spine composition (test seam
       `createResolveSpine({})` BANNED — W2-7 §4 harness canon) -> run graph.
       Asserts (verbatim clauses): all branches kept (every candidate branchy step maps to a
       family condition id — zero deletions, W2-6 A3 semantics), constraints typed (class +
       bindingKind present; count/volume dims correct — Quantity schema is the enforcer, W2-7
       §0.13), ladder rungs + anchors (every intent step provenance[0] is StepProvenanceRef
       shape: [kind,type,id,pageStart], `ref.id === candidate recordId` (P1 binding), pageStart
       in [1, pageCount]), LOCAL_REALIZATION robot choice (branch_resolution robot entry with
       FAMILY condition ids + merged-W2-4 choice carrier — VERIFIED SHAPE §0.3 C9:
       `{axisId, matched, branchIds, choices:{[axisId]: chosenValue}}`; copy the merged
       representation verbatim, W2-7 OQ2 ruling), deterministic lowering (two full runs + a third
       after a fresh YAML re-load of policy/vocabulary: emitted YAML strings BYTE-equal AND
       serialized
       TerminalArtifacts BYTE-equal; Map order / Date.now / randomUUID / locale sort are
       determinism fakes — W2-7 bait #3 list applies verbatim).
  [LIVE, honest, NEVER vitest-collected]
    `server/scripts/zymo-campaign-live-smoke.ts`: one real run of the SAME journey through the
    merged semantic-draft service + realization + compile, model named at run time from config
    (zero model/profile literals in the file). Artifacts untracked under
    `server/.artifacts/zymo-campaign-live/<UTC-ts>/`: artifact.json (profile+model+baseUrl HOST,
    NO key material, candidate sha, prompt/policy shas, classification line), raw-draft.json
    (the model's raw draft verbatim). Classification comes from the SHARED `classifyCompileResponse`
    (replayKernel.ts:449; four-member OutcomeVerdict incl. INFRA_FAULT §0.5) so live and golden
    cannot disagree on vocabulary: SUCCESS /
    NOT_SUCCESS_CLARIFICATION / EXTRACTION_FAILURE — NOT_SUCCESS is an ALLOWED honest outcome and
    never a faked green; exit 0 whenever the run COMPLETED; "evidence, not a gate". NOTE
    (W2-10 report §3): until F-LANE2-W210-D is fixed, the live leg may honestly surface the
    embedded-draft schema gap at the review wall — that is exactly what the honest classes are
    for; the live leg must NOT be adjusted to dodge it.
  [THE BRIDGE] The frozen fixture IS the declared hand-authored artifact — per the OPERATIVE
  W211-OQ3 pick (§0.1): both W2-10 combos verdict FAIL, so no reviewed model output exists to
  freeze. Its provenance note records the W2-10 FAIL verdicts + F-LANE2-W210-D as the why, the
  report content-pin criteriaSha 851e2a2d…, and what review produced its content; the report
  snapshots that. The frozen artifact's sha rides every golden assertion.

2.3 FROZEN ARTIFACTS (committed DATA under `campaign-fixtures/`, NOT goldens/ — W2-7 precedent
"lives in the tests, not in records/"):
- `campaign-fixtures/zymo-semantic-draft.frozen.yaml` — the reviewed W2-6 draft payload (the MEANT
  body: protocolLayer universal, intent steps, branch_axes with family condition ids). Per the
  OPERATIVE OQ3 pick it is hand-authored in the merged W2-7 fixture shape (realizationGolden.test.ts
  inline fixtures — reuse their bytes by import/byte-copy where the shapes fit, per the W2-10 N6d
  doctrine; duplication declared in the report).
- `campaign-fixtures/zymo-robot-answers.frozen.yaml` — the lab answers (the "neither spin column
  nor plate — the robot" axis answer + required answers per the W2-7 policy: VERIFIED MERGED SET
  §0.3 C8 — EXACTLY `sample_count` on branch_resolution.choices (positive count Quantity),
  `sample_plate` + `reagent_source` as labwares SetupRows with profile-derived role + concrete
  ref; scaleBindings answerValue `robot` -> `robot-assist-plus-96`).
- `campaign-fixtures/PROVENANCE.md` — the §0.1 honest-provenance block: W2-10 FAIL verdicts +
  F-LANE2-W210-D citation + criteriaSha 851e2a2d… + review record + shas.
Self-pinned: the test file hashes each fixture at open and fails loud on drift (a LOCAL manifest
in the test, MANIFEST.yaml untouched — W211-OQ1 RULED (a)). If claim-time reality shows merged
W2-7/W2-6 fixtures reusable verbatim (their golden files), REUSE their bytes by import rather than
re-author (answers held constant is a W2-10 doctrine; duplication declared in the report).

2.4 WHAT THE GOLDEN DOES NOT PROVE (honesty lines the report must carry): it does not prove model
quality (W2-10's matrix does; and W2-10's honest verdict is FAIL on both combos — the golden rides
the hand-authored family per §0.1, it does NOT launder the FAIL); it does not re-prove W2-5's wall
or W2-7's gate arms (it rides them); the live smoke does not prove the golden (independent paths,
shared classifier); a model literal in TS is a D7 violation.

## 3. NEGATIVE GOLDENS — T-table (five refusals, verbatim names from the task)

Suite `ZymoCampaignNegatives.test.ts`. Each arm is RED-at-base (the refusal must FIRE, with the
named stable code, and the negative's payload must leave ZERO writes — asserted by store-snapshot
deep-equal before/after). Stable codes are MERGED-VERIFIED (§0.3 C7/C25/C26); the merged trunk's
actual code string is quoted verbatim in the report.

| # | Negative (verbatim task name) | Injection | Expected refusal (stable code) | Backing |
|---|---|---|---|---|
| N1 | invented source branch | local-protocol whose branch_resolution names a branchId NOT in `family.branch_axes[].conditions[].id` | the shipped gate path: `BRANCH_RESOLUTION_MISSING` / unresolved-axis gap naming the axis, ok:false, zero emitted YAML; plus merged lint `prov-local-axis-declared-shape` fires on the payload (lint id verified merged at local-protocol.lint.yaml:67) | ResolveBranchAxesPass.ts:74 (VERIFIED at tip); LANDED W2-7 names (VERIFIED §0.3 C25): axis with no matched resolution -> `REALIZATION_BRANCH_UNRESOLVED` (realizeScientistIntent.ts:338); branchId NOT a family condition id (N1's exact injection) -> `REALIZATION_BRANCH_ID_MASQUERADE` (:351, message: "never from vendor candidate step ids"); W2-7 bait #8 "masquerading branch ids" landed under that name |
| N2 | literal wave-2 output | a literal-step payload (steps kind 'other', no intent) presented as wave-2 family output: (a) mint a protocol with `protocolLayer` wave-2 semantics + literal steps -> lint `legacy-literal-bounded` / `legacy-inventory-no-intent-drift` ERROR; (b) the W2-8-retired mapper stays call-site-free: grep `candidateToProtocolPayload(` = zero app call sites outside its own test (W2-8 §6 A6 grep re-run as a W2-11 arm — re-run at tip: module `app/src/ingestion/candidateToProtocolPayload.ts:185` export + its test ONLY, no product importer); NO product deletion (W2-8 OQ2 ruling (a); W211-OQ2 RULED (a) — module byte-untouched) | lint codes above, ERROR severity, record refused | protocol.lint.yaml:138/:173 (VERIFIED at tip); W2-8 §0.3 + OQ2 ruling (task-list :4931) |
| N3 | silent defaulting | realization answers with sampleCount OMITTED -> refusal BEFORE compile with `REALIZATION_ANSWER_MISSING` (VERIFIED LANDED §0.3 C26 — realizeScientistIntent.ts:414/:466/:632/:645, refusal carries the policy question text); belt arm: the same payload pushed to `compileScientistIntent` directly would hit the chatbot 8-sample guessed default (ChatbotCompilePasses.ts:3093-3096, re-verified at tip — within the cited :3087-3101) — assert the campaign route makes that unreachable (gate fires first, zero emitted YAML); ChatbotCompilePasses untouched | REALIZATION_ANSWER_MISSING (VERIFIED LANDED) | W2-7 §2.1 L3 / T3c; W2-7 OQ4 ruling (upstream gate) |
| N4 | unauthorized promotion | three legs: (a) PUT/DELETE the minted candidate -> 405 `APPEND_ONLY` (VERIFIED RecordHandlers.ts:790/:1282, config types.ts:520 — line repaired); (b) state-spoof: attempt to force a draft/protocol `state` to approved via PUT -> `PROMOTION_CONTROLLED_ESCALATION` (VERIFIED CandidatePromoter.ts:171); (c) promote an XDR candidate carrying an unresolved ambiguity span -> `xdr-promote-blocked-by-unresolved` (VERIFIED CandidatePromoter.ts:122, lint twin extraction-draft.lint.yaml:61) + zero writes | APPEND_ONLY / PROMOTION_CONTROLLED_ESCALATION / xdr-promote-blocked-by-unresolved (all VERIFIED at tip) | W2-5 merged shapes (task-list DONE blocks + tip cites above) |
| N5 | spine bypass | family -> run graph WITHOUT the scientist-intent contract: import-set + route-grep + pipeline-sha closure arms — `grep -rn "\.intent" server/src/compiler/protocol/` stays EMPTY (re-run at tip: 0 hits — gate holds as-is); `compileScientistIntent` import set == known set + W2-7 realization files + this item's NEW files only; scientist-intent-compile.yaml sha256 unchanged (b47eee0c… treeState pin — re-measured MATCH §0.2); this item adds zero routes (`git diff` empty on routes.ts) | structural test failure (no code — a bypass IS the failure); each arm mutation-tested non-vacuously | W2-7 §6 / T7 verbatim; MANIFEST.yaml treeState (VERIFIED read at tip) |

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
seed data only"): COPY the merged W2-8 seeding pattern (VPDF via POST
/api/vendors/graph-lemur/pdfs/upload — idempotent + content-addressed; stored blob; frozen XDR
pointing at it via POST /api/records; spec not importable — §0.3 C11 MOVED verdict) with the
campaign's own fixtures. The VPDF blob must be the pinned Zymo PDF (sha 257f5719…). The run
needed by D4 is seeded per W211-OQ6 (§0.4): POST-created run + protocol surfacing; if the merged
product cannot serve it from seed data only, the leg reports honestly — no faked gate.

| Leg | Exact route / surface (file:line backed) | Flow | Receipt proves (acceptance clause) |
|---|---|---|---|
| D1 immutable SAID | `/ingestion/vendor-pdf/<VPDF-id>` (App.tsx:150) | open review; probe every left-pane control incl. keyboard; GET /api/records/<VPDF> sha before/after; attempt a rewrite via UI paths | sha EQUAL; zero mutating controls; no save/save-as/use-extracted testids on the wave-2 render (VERIFIED absent §0.3 C13 — W2-8 A1/A6 machinery) |
| D2 editable MEANT | same route, right pane | edit a MEANT step label -> Save (PUT /records/:XDR + expectedSha) -> hard F5 -> value present; GET /api/records/<XDR>/revisions shows the revision; intent.provenance byte-equal (paste both GETs) | "editable MEANT" + provenance intact (rides W2-8 A3, re-proven on the INTEGRATED flow) |
| D3 mounted AI | same route, rightPane chat (merged W2-9 ReviewAiPanel, app/src/ingestion/protocol-review/ReviewAiPanel.tsx, testids review-ai-panel :271 / review-ai-refusal :294 / review-ai-apply-note :314 §0.3 C15; surface `protocol-review`, surfaces.yaml:83/:85) | send "reword step 3's label for our bench" -> proposal card -> Accept -> revision + provenance byte-equal; refusal legs: "change the vendor text", "mark the inferred incubate as vendor-stated", "promote the draft" -> visible refusals (reviewWriteWall is MERGED — the refusal surface is product truth now), VPDF sha / XDR provenance / XDR status unchanged | "mounted AI" incl. fail-visible negatives (rides W2-9 B2/B3/B5/B6 on the campaign fixture) |
| D4 downstream questions | run workspace route `/runs/<runId>` (App.tsx:190) -> protocol tab -> localization thread (VERIFIED §0.3 C14/C24: run/RunWorkspacePage.tsx:98 -> ProtocolTabPanel.tsx:32/:1788 `protocol-localization-details` -> ProtocolLocalizationThread) | family branch_axes questions appear -> answer (incl. "neither spin column nor plate — the robot") -> accept (POST /intent/accept, IntentAcceptHandlers.ts:121) -> GET the LPR record | "downstream questions" persisting: branch_resolution[].choices match the answers, robot entry carries the merged LOCAL_REALIZATION carrier (VERIFIED shape §0.3 C9; paste LPR JSON; receipt names the LPR id) |
| D5 robot realization | server leg via the merged W2-7 surface — ENTRY VERIFIED ABSENT (§0.3 C27: no server route exposes realizeAndCompile; RealizationCompileGate.ts is a LOOKALIKE, wrong contract). THE OPERATIVE BRANCH: realization leg proven headlessly — realizeAndCompile on the frozen fixture, receipt = the LPR payload + GET of the emitted document, honestly named | realization present with robot profile closure (p20-multi-8 / 96-well plate / trough roles bound) | "robot realization" shown (receipt: the LPR payload + policy-derived role bindings, no invented surface) |
| D6 run graph shown | emitted scientist-intent document -> POST /intent/compile (IntentCompileHandlers.ts:119) via the UI entry — ONE EXISTS and is MERGED: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:602` calls `apiClient.intentCompile` (client.ts '/intent/compile' :3978); drive it IF the seeded run surfaces AiTabPanel, else honest API-paste leg; resulting artifacts viewable at `/record/<artifactId>` (App.tsx:196) and/or `/runs/:runId` (App.tsx:190) | run graph with non-empty events renders / artifacts GET returns the compiled graph | "run graph shown" |

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
decode -> extract -> [hand-freeze a minimal family in the merged W2-7 fixture shape — the
OPERATIVE W211-OQ3 pick §0.1 makes this the route from the start, not a fallback probe] ->
merged `realizeAndCompile` (realizeScientistIntent.ts:697, VERIFIED) with robot answers -> parse ->
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
   fake (W2-8 bait 10). The frozen fixture's PROVENANCE.md must state the §0.1 hand-authored
   fact — presenting it as reviewed model output is a faked green.
3. Five negative goldens named verbatim in the task are the five refusals — renaming, merging,
   or softening one (e.g. warning instead of refusal) is a defect.
4. Proposal-never-write; never two local terms for one entity; ZERO hardcodes — model/host/
   thresholds are DATA: no model/host literal, no threshold number, no profile name in any new
   TS (`grep -riE "qwen|thunderbeast|computable:8080|100\.111|flash|4b-vision|lfm2|8899" <new files>` empty
   — W2-10 §6 grep-wall shape; `lfm2|8899` added this rebind for the live-zymo.mts literals §0.5);
   no rung vocabulary string literal in product TS (tests may name
   them ONLY to assert, W2-4 T4 grep arm reused); scientist-intent-compile.yaml sha unchanged;
   MANIFEST + goldens/** + schema/scientist-intent/ diff EMPTY (OQ1 RULED (a)).
5. app/** byte-untouched EXCEPT the ONE gate spec under app/e2e/ (test-only). If the demo
   seemingly requires a PRODUCT tweak, that is an OQ raised in the report, not a silent edit.
6. No PUT/DELETE of a minted candidate (405 is the point); records/** empty diff in any repo;
   records minted via POST /records only; the promoted family is BORN DRAFT (a golden that
   claims ACTIVE state is a state-spoof it is meant to catch).
7. Serving hosts (:8080 both boxes, :11434/:8900) never displaced; :3001/:5174 never; :3093/:5193
   orchestrator-only. exactOptionalPropertyTypes + noUncheckedIndexedAccess ON (server/tsconfig
   .json:13-14): every optional field `...(x ? {k: v} : {})`, never `undefined`.

## 7. BASELINES / PINS (re-measured at 4c899cfc this rebind — §0.2; the claim worktree re-checks
fresh off the DISPATCH tip and explains any delta — deltas must be EXPLAINED, not absorbed)

- Trunk tip at rebind: 4c899cfc (§0.2). Re-pin again at claim; the §0.3 table cites hold at this
  tip — re-open any cite the dispatch tip has moved.
- server tsc: primary-error multiset == `/tmp/l2t1850-tsc-server-final.txt` (19 lines at
  4c899cfc; == the lane "tsc 19/34" pin; the 20-line ea573a76 worktree read is explained in §0.2,
  NOT an open delta).
- app tsc: 34 primary lines (`/tmp/l2t1850-tsc-app.txt`; gate spec is app/e2e — confirm it is
  outside the tsconfig include; if it joins the error surface, disclose the exact delta).
- Scoped vitest fail-file SET (src/schema src/lint src/integration src/api/handlers src/store
  src/revisions src/governance) == W2-5 report §0 SET (11 files / 16 failed) EXACTLY
  (comm -13 and comm -23 both EMPTY); this item may ADD passing files only.
- /api/health: schemas 192 (re-verified via git ls-files at tip), lintRules 81 at fcce2212 —
  re-measure after the orchestrator's post-merge restart; expected increase == the merged
  upstream rules' count, explained rule-by-rule in the report.
- MANIFEST.yaml sha 873e13432ef6…39a3 / blob 58c447eb… (both re-measured at tip §0.2); goldens
  expect 15 (re-verified);
  scientist-intent-compile.yaml sha b47eee0c… (treeState pin, MANIFEST.yaml:11 — line moved from
  :14; file sha re-measured, MATCHES).
- PDF sha 257f57196f6c… (re-measured at tip, full sha §0.2).
- Fleet: one worker under the coder lock; report `.hermes/plans/W2-11-report.wip-l2t<token>.md`
  at the trunk checkout (unique); final stdout line `W211 DONE <sha>`.
- Worker contract: worktree `<integration>/wt/W2-11-lane2-l2t<token>` off the trunk tip AT
  DISPATCH, branch `W2-11-lane2-l2t<token>`; lane bootstrap 1:1 untracked symlinks (node_modules,
  server/schema symlink per lane standard); per-worktree excludesFile
  `/home/brad/.hermes/cl/lanes/2/lane-exclude-W2-11-l2t<token>`; `git -c core.fileMode=false` for
  EVERY git command; zero scratch files in the commit.

## 8. REPORT CONTRACT (.hermes/plans/W2-11-report.wip-l2t<token>.md)

Sections: 0 claim base (tip sha, re-measured pins with capture paths); 1 CAMT verdicts — inherit
the §0.3 bind table row-for-row and re-confirm each at the CLAIM tip: CONFIRMED / MOVED-to-X /
ABSENT, with file:line at the claim tip; 2 golden transcript
(RED-at-base evidence for the first campaign assertion + GREEN final, counts machine-measured via
`git diff --numstat`); 3 the five negatives, each with the refusal code VERBATIM from the merged
trunk and the zero-write proof; 4 live-smoke run (command, artifact path, artifact.json keys, the
classification line pasted verbatim, honest either-way statement; a run that could not complete is
reported as UNRUN with the transport error, never omitted); 5 determinism evidence (the three-run
sha256 digests of emitted YAML + serialized artifacts); 6 gate leg results D1-D6 with receipt dir
listing and the reviewer's VERDICT line; 7 prompt/model budget section (task-list convention: the
GOLDEN makes zero model calls; the live runner names the config-resolved profile, no literals);
8 declared findings (scout-style corrections, any spec-vs-merged-trunk drift that forced an
adaptation, the frozen artifact's review provenance per §0.1 — the FAIL-verdict statement is
MANDATORY here); 9 hard-stop self-audit (each §6 item with the command output). No line counts
from memory.

## 9. TEST FILE INVENTORY (complete; everything else EMPTY diff)

| # | Path | Kind | Content |
|---|---|---|---|
| A | `server/src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts` | NEW TEST | G1-G7 golden legs (§2.2), fixture self-pins, production spine composition |
| B | `server/src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts` | NEW TEST | N1-N5 refusals (§3), zero-write snapshots, N5 structural arms |
| C | `server/src/ingestion/vendor-protocol/campaign-fixtures/` (frozen draft, robot answers, PROVENANCE.md) | NEW DATA | §2.3 + §0.1 provenance, committed BEFORE the golden goes green (the freeze is a review act, the file order is the audit trail) |
| D | `server/scripts/zymo-campaign-live-smoke.ts` | NEW RUNNER | §2.2 live leg; live-smoke.ts header contract verbatim; never CI/vitest |
| E | `app/e2e/w2-11-campaign-demo.spec.mjs` | NEW GATE SPEC | §4 D1-D6, seeding leg pattern-copied from merged w28 (§0.3 C11), BASE_URL ?? :5193 |

Verification commands (worker): `cd <wt>/server && npx vitest run src/ingestion/vendor-protocol
src/compiler/scientistIntent` -> new suites + every pre-existing suite green;
`npx vitest run` on the §7 scoped dirs -> fail-file SET identity; `npx tsc -p .` multiset == pin;
`cd app && npm run typecheck` set-equal baseline; `git -c core.fileMode=false diff --stat` ->
ZERO lines outside §9 paths (records/, goldens/, schema/, app/src/, server/src/{compiler,api,
extract,config}/ all EMPTY); live run per §8.4; `npx playwright test app/e2e/
w2-11-campaign-demo.spec.mjs --project=chromium` = orchestrator/reviewer act, NEVER the coder's.

## 10. OPEN QUESTIONS — RULINGS CARRIED + REBIND-NEW (W211-OQn)

W211-OQ1 — RULED (a) BY THE ORCHESTRATOR: no MANIFEST touch. Campaign fixtures self-pin inside
the test file; replayKernel's blessed suite stays the spine6 contract; drift still fails loud
locally. (Draft recommendation was (a); adopted verbatim.)

W211-OQ2 — RULED (a) BY THE ORCHESTRATOR: ZymoGoldenE2E byte-untouched; and per the draft's own
reading + the §6.5 hard-stop, candidateToProtocolPayload.ts + its test stay byte-untouched —
N2(b) proves death-by-refusal (zero-call-site grep + wave-2 lint wall), no deletion. (The tip
re-grep confirms the module stands with product call sites = 0, §3 N2.)

W211-OQ3 — OPERATIVE PICK APPLIED (§0.1): the W2-10 merged report records FINAL verdict FAIL for
BOTH combos (schema_pass_rate 0.0, lint_errors, downstream_compile failing on both;
F-LANE2-W210-D product contract gap at the W2-6->W2-3 seam documented at report :145/:210). The
primary leg (a) has no source artifact; the declared fallback (b) is OPERATIVE: the frozen golden
fixture is the hand-authored semantic-family artifact, PROVENANCE.md naming the FAIL verdict
honestly. This is the ruling structure as designed — real reviewed combo primary, declared
hand-authored fallback — decided AT PROMOTION from W2-10's merged report (a claim-time data pick,
now made and re-verified first-hand).

W211-OQ4 — RULED (a) BY THE ORCHESTRATOR: the orchestrator schedules the browser gate with the
fleet coder absent and the slot idle; chat-turn timeouts from config DATA; the coder NEVER
touches :5193/:3093. (The merged ReviewAiPanel + reviewWriteWall make D3's refusal legs product
truth; the W2-9 gate precedent accepted the same single-slot chat turn.)

W211-OQ5 (rebind-new, §0.4): restore the W2-10 criteria YAML for PROVENANCE.md auditability?
RECOMMENDATION: no restore — cite the promoted report + criteriaSha. SETTLES: smallest
orchestrator ruling.

W211-OQ6 (rebind-new, §0.4): D4 run-seeding mechanics (first automated run-workspace realization
leg; W2-8 automated only the XDR data precondition). RECOMMENDATION: seed leg POSTs the run and
surfaces the promoted family per ProtocolSelectionContext; honest report if the product cannot
serve it from seed data only. SETTLES: the first stitch/gate run in the claim worktree.

## 11. CAMT BIND LIST — RESOLVED (was the draft's open list; every row now carries its verdict
in the §0.3 table C1-C27; "CAMT" is retired from this spec)

The draft listed: W2-6 endpoint/codes/P2-block/draft-shape/prompt-sha (-> C1-C5, VERIFIED), W2-7
export names/REALIZATION_* codes/policy required-answer set/LOCAL_REALIZATION carrier/deck-depth
(-> C6-C10 + C25-C27, VERIFIED with LANDED names), W2-8 seeding leg/panels+testids/retired
testids/realization-entry (-> C11-C14; C11 MOVED to copy-the-pattern, rest VERIFIED), W2-9
ReviewAiPanel testids/applyDraftProtocolEdit/SemanticPassModelSection/gate spec name (-> C15-C18,
VERIFIED), W2-10 criteria file + report verdicts/runner pattern (-> C19-C21: verdicts VERIFIED
and OPERATIVE §0.1; criteria file and runner ABSENT at tip, content/report-pinned, OQ5), plus the
§0.1 VPDF re-locate (-> C22 VERIFIED), §0.4 gate-spec paths (-> C23 VERIFIED), D4 mount path
(-> C24 VERIFIED), N1/N3 codes (-> C25/C26 VERIFIED), and the §7 re-pin directive (-> executed,
§0.2). The merged-first-hand block needed four line repairs only (§0.6); all other draft §0.3
cites survived 75 merged commits unchanged.

COMPOSED 2026-10-10 ~05:00 EDT (l2t0450); REBOUND 2026-10-11 ~19:00 EDT (l2t1850) at trunk
4c899cfc — every §0.3 verdict opened FIRST-HAND this rebind (tsc counts measured by
`npx tsc --noEmit`, shas by sha256sum/hash-object, codes/routes/testids by grep at the cited
lines — no scout used, no stack touched, no model called).
Nothing here is promoted.

W2-11 REBIND DONE 27/27, 2
