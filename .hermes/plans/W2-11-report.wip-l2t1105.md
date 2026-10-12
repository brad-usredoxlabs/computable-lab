# W2-11-ZYMO-GOLDEN-DEMO — CODER REPORT (lane 2, dispatch token l2t1105)

Status: COMPLETE (all §9 inventory files committed; browser gate NOT run — orchestrator's act per §6.7/OQ4).

## 0. Claim base

- Worktree: `/mnt/vast/home/brad/git/wt/W2-11-lane2-l2t1105`, branch `cl/W2-11-lane2-l2t1105`.
- Dispatch base (trunk tip at worktree creation): `6869726c` ("fix(merge): signature $ref resolves in $id space…").
- Spec pin base: `4c899cfc`. Cross-lane merges `4c899cfc..6869726c` moved the baselines — deltas measured and EXPLAINED below (§8), never absorbed.
- My commits (audit-trail order per §9: fixtures frozen BEFORE the golden goes green):
  - `ebc5b073` W2-11(C) campaign fixtures + PROVENANCE.md
  - `b1b54044` W2-11(A,B) golden G1-G7 + negatives N1-N5
  - `70478716` W2-11(D) live-smoke runner
  - `edada3b9` W2-11(E) browser gate spec
  - (this report follows as the final commit)

### 0.1 Re-measured pins at MY base (6869726c), capture paths

| Pin | Spec value @4c899cfc | Measured at my base | Verdict |
|---|---|---|---|
| server `npx tsc -p . --noEmit` | 19 error lines (`/tmp/l2t1850-tsc-server-final.txt`) | **0** (`/tmp/w211-tsc-server-base.txt`) | DRIFT: all 19 pin errors were FIXED by cross-lane merges (§8.1 line-set proof). Zero new. |
| app `npm run typecheck` | 34 error lines (`/tmp/l2t1850-tsc-app.txt`) | **23** (`/tmp/w211-tsc-app-base.txt`) | DRIFT: 13 pin errors fixed by merges, 2 new errors appeared via merges (IngestionUploadModal TS2554, ExtractionProgressPanel.test TS6133) — both outside my owned files, NOT fixed by me (§8.1). |
| `goldens/MANIFEST.yaml` sha256 | 873e13432ef6dc3e32e22ba47e69a7a66c0737e39e67fccb8ba63851fbca39a3 | same | MATCH; diff EMPTY (OQ1(a) honored) |
| `scientist-intent-compile.yaml` sha256 | b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8 (treeState pin, MANIFEST.yaml:11) | same (file + `git show 4c899cfc:` + `git show HEAD:` all equal) | MATCH |
| Zymo PDF `resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf` | 257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b | same | MATCH |
| prompt `server/src/extract/prompts/semantic-family-draft.md` | 26b2427898add58d1b3cca9314c86819f31bc8ebf7ebbc60acacbf01020d926a (C5) | same | MATCH |
| `schema/registry/realization/robot-realization.policy.yaml` | 6e99e29b93ac050634a1afc77d65a692337e27d13c615459796d2e4f1b9ee415 | same | MATCH |
| `server/src/api/routes.ts` | 7609995317b2c16ed16625f7c8bd36bcf9eca88df173dff3ec411eda8ea2db6b | same | MATCH (routes diff EMPTY — N5 arm asserts it) |
| `protocol.lint.yaml` / `local-protocol.lint.yaml` | 656b507e… / a1cc0cfd… | same | MATCH |
| tracked `schema/**/*.schema.yaml` count | 192 @4c899cfc | 194 | DRIFT +2 from cross-lane merges (not mine; `git diff --name-only 4c899cfc..6869726c -- schema` shows the added files) |

Lane bootstrap note (not a diff): fresh worktrees lack the lane-excluded schema files (`revision-ref.schema.yaml`, `80x2ml-tube-rack.yaml`, `tube-size-presets.v1.yaml` — lane-exclude lines 16/18/19). I recreated them as real copies from the trunk targets so suites run honestly; they stay lane-excluded (`git check-ignore` verified) and appear in NO commit.

## 1. CAMT/claim verdicts — §0.3 bind table re-confirmed at MY claim tip

Row-for-row against spec §0.3 (C1-C27), each re-opened first-hand in this worktree where my code edits against it:

- C1 VERIFIED — `POST /extraction/vendor-candidates/:recordId/semantic-draft` in the extractHandlers family beside promote/reject (`server/src/api/routes.ts:636-637` at my tip).
- C2 VERIFIED — codes NO_CANDIDIDATE… re-read: `SemanticFamilyPass.ts` NO_CANDIDATE/TRUNCATED/PARSE_FAILED/UNKNOWN_THINKING_LEVEL/STEP_COVERAGE/DRAFT_WRITE_FAILED; `semanticPassGuards.ts` ANCHOR_UNRESOLVED drop-not-rewrite (`resolveAnchorRefs` enforces ref.id === candidate recordId).
- C3 VERIFIED — `semanticPass?: SemanticPassConfig` + single seam `resolveSemanticPassInference` consumed in `server.ts` (read-per-call).
- C4 VERIFIED (shape) — model axes discarded, deterministic `deriveBranchAxes` binding; the ARTIFACT is hand-authored per §0.1/OQ3 (see §8.4 provenance).
- C5 VERIFIED — prompt path + sha match (0.1 table).
- C6 VERIFIED — `lowerRealization` :310, `realizeAndCompile` :697 in `realizeScientistIntent.ts`; `loadRealizationPolicy` :167.
- C7 VERIFIED — landed code set re-read at tip: ANSWER_INVALID, ANSWER_MISSING, BRANCH_ID_MASQUERADE, BRANCH_UNRESOLVED, CAPABILITY_MISSING, EMISSION_INVALID, INHERITS_MISMATCH, SUBSTITUTION_DISALLOWED, VERB_UNADJUDICATED.
- C8 VERIFIED — policy `requiredAnswers` EXACTLY three (`sample_count` on branch_resolution.choices; `sample_plate` roleFromProfile sampleLayout.labwareRole; `reagent_source` roleFromProfile reagentSource.sourceLabwareRole); scaleBindings answerValue `robot` -> `robot-assist-plus-96`. My answers fixture matches this set exactly.
- C9 VERIFIED — carrier `branch_resolution[].{axisId, matched, branchIds, choices:{[axisId]: chosenValue}}`; empty `{}` counts ABSENT; minting UI writes the same shape (`IntentAcceptHandlers.ts:75-82`).
- C10 VERIFIED — gate+labels depth is the proof bar; my golden demands no more.
- C11 MOVED->copy-the-pattern (as spec'd) — w28 seeding legs are module-local; my gate spec copies the pattern (POST /api/vendors/graph-lemur/pdfs/upload + POST /api/records) with the pinned Zymo PDF + campaign frozen XDR. No second seeder fork.
- C12 VERIFIED — SemanticDraftPanel testids semantic-draft-panel/-taptab/-branch-axes/-evidence/-save/-note/-error re-grepped at tip.
- C13 VERIFIED — vpdf-save/-save-as/-use-extracted occur only as negative assertions in `VendorPdfReviewPage.wave2.test.tsx`.
- C14/C24 VERIFIED — `protocol-localization-details` disclosure (ProtocolTabPanel.tsx:1783) -> ProtocolLocalizationThread (:1788), rendered by `RunWorkspacePage.tsx` protocol tab; thread -> `apiClient.intentAccept` -> `POST /intent/accept`.
- C15 VERIFIED — ReviewAiPanel testids review-ai-panel/-no-draft/-no-steps/-refusal/-apply-note re-grepped.
- C16 VERIFIED — `applyDraftProtocolEdit.ts:102` export stands.
- C17 VERIFIED — SemanticPassModelSection mounted in SettingsPage.
- C18 VERIFIED — w29 gate spec exists; BASE_URL ?? :5193 / API_URL ?? :3093 convention inherited by my spec.
- C19 ABSENT (as ruled OQ5) — criteria file not restored; PROVENANCE cites promoted report path + criteriaSha `851e2a2d5c9bc40062db5a4f8b47a2308564b23ece4c71c850e872e1acafe23d` (re-verified: `sha256sum` of the promoted report content rows embeds it; report :18 amendment re-read).
- C20 VERIFIED — report :110/:114 FAIL/FAIL, :145/:210 F-LANE2-W210-D re-read first-hand at trunk `.hermes/plans/W2-10-model-evidence-report.md`; fallback (b) operative.
- C21 MOVED/report-documented — my live runner reads whatever profile the lane config names, adds nothing (config-copy pattern).
- C22 VERIFIED — VPDF-257F57196F6C located (data repo) and the pinned PDF bytes match.
- C23 VERIFIED — w28 + w29 specs merged under app/e2e/.
- C25 VERIFIED (LANDED names) — masquerading branchId -> `REALIZATION_BRANCH_ID_MASQUERADE` (realizeScientistIntent.ts :351, "never from vendor candidate step ids" message verbatim); unanswered axis -> `REALIZATION_BRANCH_UNRESOLVED` :338; spine gate `BRANCH_RESOLUTION_MISSING` at `ResolveBranchAxesPass.ts:74`.
- C26 VERIFIED — `REALIZATION_ANSWER_MISSING` :414/:466/:632/:645 refusal BEFORE compile carrying the policy question text; belt arm chatbot guessed default still present in `ChatbotCompilePasses.ts` (campaign route makes it unreachable — asserted in N3 belt arm).
- C27 VERIFIED-ABSENT -> headless branch operative — repo grep: `realizeAndCompile`/`lowerRealization` consumers are ONLY the two realization test files; routes.ts's only realize-ish route is the legacy intake one; `RealizationCompileGate.ts` gates a different contract. My D5 leg runs the merged functions headlessly (tsx subprocess) and is honestly named.

## 2. Golden transcript (file A) — RED-at-base then GREEN

RED-at-base evidence (genuine, captured): with the fixture self-pin deliberately wrong (`RED-AT-BASE-PLACEHOLDER`), the suite fails loud on the first campaign assertion:

```
❯ ZymoCampaignGoldenE2E.test.ts > W2-11 G3 … > the frozen fixtures self-pin at open (drift fails loud)
  → campaign fixture drift: zymo-semantic-draft.frozen.yaml sha256 d878727a… != pinned RED-AT-BASE-PLACEHOLDER — the frozen reviewed artifact changed; re-review before trusting the golden
Test Files  1 failed (1)
Tests  12 failed | 4 passed (16)
```
(raw: /tmp/w211-red-capture.txt; the pin was restored immediately — `git status` clean after.)

GREEN final (machine-measured):
```
cd <wt>/server && npx vitest run src/ingestion/vendor-protocol src/compiler/scientistIntent
Test Files  35 passed (35)      Tests  261 passed (261)     EXIT=0
```
35 = 33 pre-existing riding files + 2 new (A: 16 tests, B: 16 tests). Raw: /tmp/w211-riding-final2.txt (also /tmp/w211-riding-final.txt, /tmp/w211-both-green.txt).

Golden legs (G1-G7): G1 pinned PDF bytes -> decode -> candidate 17 steps (branchy steps step-1/step-4 a/b); G2 deterministic `deriveBranchAxes` axes byte-equal the frozen draft's branch_axes (Zymo stepVariantAxes = [] — no dispatch pages, honest); G3 frozen draft -> REAL `promoteCandidate` route handler -> kind-protocol family BORN DRAFT (state draft, 17 steps, 1 axis; zero PUT/DELETE); G4 every candidate branch maps to a family condition id, constraints typed; G5 robot answers (policy-exact three) -> `lowerRealization` -> intent YAML; G6 spine6 compile via REAL `parseScientistIntent` + REAL `classifyCompileResponse` + recordingStore (zero writes) -> outcome complete, 24 events; G7 determinism digests (see §5).

Diff numstat vs dispatch base (`git diff --numstat 6869726c..HEAD`), ZERO lines outside §9 paths:
```
770  0  app/e2e/w2-11-campaign-demo.spec.mjs
198  0  server/scripts/zymo-campaign-live-smoke.ts
644  0  server/src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts
603  0  server/src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts
 66  0  server/src/ingestion/vendor-protocol/campaign-fixtures/PROVENANCE.md
 78  0  …/campaign-fixtures/zymo-robot-answers.frozen.yaml
343  0  …/campaign-fixtures/zymo-semantic-draft.frozen.yaml
7 files changed, 2702 insertions(+), 0 deletions
```

## 3. The five negatives (file B) — refusal codes VERBATIM from the merged trunk

Suite tail: `Test Files 1 passed (1) / Tests 16 passed (16)` (/tmp/w211-neg-run2.txt). Arms per §3 T-table, codes exactly as merged:

- N1 branch-axis integrity: candidate step id masquerading as a branchId -> **`REALIZATION_BRANCH_ID_MASQUERADE`** (realizeScientistIntent.ts:351), zero emitted YAML; unanswered axis -> **`REALIZATION_BRANCH_UNRESOLVED`** (:338) naming the axis; malformed axisId also refused at store mint by merged lint `prov-local-axis-declared-shape`. Control arm proves non-vacuity (clean realization lowers).
- N2 literal-only protocol: newly authored literal-only protocol refused by merged lint **`legacy-literal-bounded`** (severity ERROR; store mint refused) — note the Ajv schema wall fires first on a schema-invalid literal (declared finding §8.3); my arm uses a schema-valid literal action so the LINT rule is what refuses. Control: the intent-bearing campaign family passes the same lint. N2(b): `candidateToProtocolPayload(` has ZERO app call sites outside its own module + test (grep arm).
- N3 silent defaulting: sampleCount OMITTED -> **`REALIZATION_ANSWER_MISSING`** carrying the policy question text, refusal BEFORE compile, zero emitted YAML; belt arm asserts the chatbot guessed default exists downstream but the campaign route makes it unreachable.
- N4 state spoof: (a) PUT/DELETE on the minted candidate -> **405 APPEND_ONLY**, sha unchanged; (b) promoted candidate declaring lifecycleId + non-draft state -> **422 `PROMOTION_CONTROLLED_ESCALATION`**, zero writes; (b-belt) POST create path never yields an approved protocol (refused or BORN DRAFT — probe: `POST_STATE_SPOOF 422 … lifecycleId enum`, record ABSENT); (c) unresolved ambiguity_spans -> **`xdr-promote-blocked-by-unresolved`**, zero writes.
- N5 spine bypass (structural, no code): `\.intent` grep across `server/src/compiler/protocol/` EMPTY; `compileScientistIntent` import-set closure == known set + W2-7 realization files + my new files ONLY (probe found the merged set includes `RealizationCompileGate.ts` + `IntentCompileHandlers.ts` — both added to the known set honestly); `scientist-intent-compile.yaml` sha unchanged (b47eee0c…); routes.ts sha unchanged (zero new routes).

Zero-write proof: every store arm snapshots the data dir (file list + shas) before/after the refused call — byte-identical; realization arms assert `recorder.writeCalls() === 0`.

## 4. Live-smoke run (file D)

Command (key sourced from an authorized location, never printed):
```
cd <wt>/server && set -a && . /home/brad/.hermes/.env && set +a && \
  CONFIG_PATH=$PWD/tmp/w211-probe/live-config-fallback.yaml npx tsx scripts/zymo-campaign-live-smoke.ts
```
Three runs, all honest:
1. + 2. With the LANE config as-is (`ai.semanticPass.model: w29-gate-reviewer-model-v2`): transport 400 — `"w29-gate-reviewer-model-v2 is not a valid model ID"` -> classification line verbatim: `CLASSIFICATION INFRA_FAULT` (/tmp/w211-live-run3.txt). Not adjusted to dodge it.
3. Per C21 pattern (gitignored config COPY under `server/tmp/w211-probe/` with the semanticPass override removed -> activeProfile `DS-v4.1-OR`): classification line verbatim: `CLASSIFICATION SUCCESS`; artifact dir `server/.artifacts/zymo-campaign-live/2026-10-12T17-14-18-208Z/` (untracked via lane-exclude). artifact.json keys: baseUrlHost, candidatePdfSha256, candidateRecordId, classification, error, httpStatus, model, modelInteractionChain, note, outcome, policySha256, profile, promptSha256, responseBodyKeys, runAt, semanticPassBlockPresent, transportMessage. Values: outcome `complete`, httpStatus 200, profile `DS-v4.1-OR`, model `~deepseek/deepseek-flash-latest` (config DATA, no literal in TS), promptSha a07ca9c6…, policySha 6e99e29b…, pdfSha 257f5719…

## 5. Determinism evidence

Three consecutive golden runs, identical G7 digests:
```
W211_G7_DIGESTS {"yaml":"b6740fc13d4c0b0ad153ad81cb0c767299fb859fcb70ca0126936c75b192037e",
                 "artifacts":"a7f43a6d820abfae5ecafa9e23c1811e687bc138fe90eb59768fef8b34e1db25",
                 "events":24}   x3 (Tests 16 passed each)
```

## 6. Gate legs D1-D6 (file E) — SPEC AUTHORED; gate NOT run by the coder

`app/e2e/w2-11-campaign-demo.spec.mjs` (772 lines post-fix, 770 at authoring; measured `wc -l` advc-W211-c2 / orch l2t1530) authored per §4: BASE_URL ?? :5193 / API_URL ?? :3093 (orchestrator-only), receipts under `receipts/w2-11-campaign-demo/<stamp>/` written ONLY from real GETs (no fixture reload). Legs: D1 upload->immutable candidate (sha before/after, no mutating controls, retired testids absent); D2 frozen draft -> SemanticDraftPanel (branch-axes/evidence testids); D3 ReviewAiPanel refusal legs (no-draft/no-steps/refusal/apply-note); D4 seeded run -> protocol tab -> `protocol-localization-details` -> localization thread (family axis answered with the rack branch — honest naming note §8.3 — deck load via `pl-load-deck`, accept via `pl-accept`); D5/D6 server legs (C27 headless branch): merged `lowerRealization`/`realizeAndCompile` run through a tsx subprocess against the same stack, generated script under gitignored `server/tmp/`.

Runnable-form evidence (without touching :5193/:3093):
- `node --check` clean. NOTE (advc-W211-c1 D2 correction): `node --check` validates syntax only, not lexical scope, and the scratch harness below exercises `runServerLeg` mechanics ONLY — it never calls `seededFamilyPayload()` and therefore never covered the D5/D6 test bodies. The original wording overstated its reach; the D5/D6 blocker it missed was fixed in Cycle 1 (see 'Cycle 1 (fix run l2t1430)').
- Vitest collection posture IDENTICAL to the merged w29 precedent (`Test Files 1 failed / Tests no tests` — Playwright spec under vitest, same as w28/w29).
- Server-leg mechanics proven headlessly via a scratch harness extracted VERBATIM from the spec's helper: `LEG_COMPILE {"ok":true,"outcome":"complete","events":24,"closure":{"sample_plate":true,"reagent_reservoir":true}}` and `LEG_LOWER {"ok":true,"stage":"lower"}` — this stands as evidence for the generated tsx leg itself, nothing more. Scratch harness removed; `git status` clean.
- D5/D6-specific runnable-form evidence (post-Cycle-1 fix): `npx playwright test w2-11-campaign-demo.spec.mjs --project=chromium --list` collects all 7 tests including D5 and D6, and a node scope probe shows `seededFamilyPayload()` resolves `familyId` at module scope (pre-fix control throws `ReferenceError: familyId is not defined`). Full outputs in 'Cycle 1 (fix run l2t1430)'. [orch l2t1530: refs repointed per advc-W211-c2 D1 — the section was never numbered §12; text unchanged.]
- Receipt dir listing + reviewer VERDICT line: orchestrator/cl-browser-reviewer act — pending, not mine.

## 7. Prompt/model budget

- The GOLDEN and NEGATIVES make ZERO model calls (vitest include pattern; no InferenceClient in either file).
- The live runner names the config-resolved profile only (`profile` read from config DATA); no model/host/profile literal in any new TS.
- One live semantic-pass call per run (the route's own retries are the route's).

## 8. Declared findings

8.1 tsc drift (measured, not absorbed): server pin 19 -> base 0: `comm -23` of sorted error line-sets shows all 19 pin-only (fixed by cross-lane merges), `comm -13` empty (zero new). App pin 34 -> base 23: 13 pin-only fixed by merges; 2 merge-introduced errors (IngestionUploadModal.tsx TS2554, ExtractionProgressPanel.test.tsx TS6133) left UNFIXED (not my files). After my work: server 0 -> 0, app 23 -> 23 with byte-identical sorted line-sets (`diff` empty; /tmp/w211-tsc-app-base.txt vs /tmp/w211-tsc-app-after2.txt).

8.2 §7 scoped-dir fail-set identity: `npx vitest run src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance` -> 11 failed files / 18 failed tests (/tmp/w211-scoped.txt). The SAME 11-file set run at trunk `cl/integration-2` fails identically (11 failed / 18 failed tests, /tmp/w211-trunk-failset.txt) — identity proven, zero new from me. Three of them (EventGraphSemanticKeySchema, EventGraphEquipmentSchema, ProcurementSchemaContracts) fail on `Missing $ref: '#/$defs/RevisionRef'` — trunk-side drift (the lane-excluded revision-ref schema file); I did NOT "fix" them.

8.3 Adaptations forced by spec-vs-trunk drift:
- N2(a): the Ajv schema wall fires BEFORE lint on a schema-invalid literal step; my arm uses a schema-valid literal action so the merged lint rule `legacy-literal-bounded` is the refusing authority (asserted by name).
- D4 axis naming: the merged UI renders the FAMILY's declared condition ids (rack/tubes) — the "robot" value is the realization ANSWER (policy scaleBindings), not a family axis choice; the gate spec answers the family axis with the rack branch and drives the robot via the realization answers, honestly commented in the spec.
- Live leg: the merged prompt loader (`src/extract/prompts/loader.ts`) uses bare `__dirname` in an ESM package — vitest-shimmed, tsx NOT (probe-verified: `typeof __dirname === undefined`). The runner reads the merged prompt FILE's bytes from the repo instead of importing the loader (same bytes, sha recorded in the artifact). Declared in the runner header.
- Live leg model id: the lane config's `ai.semanticPass.model: w29-gate-reviewer-model-v2` is rejected by the provider (400). Per C21 I ran a gitignored config COPY without the override (activeProfile DS-v4.1-OR). Both outcomes reported (§4). ASSUMPTION: this config-copy fallback is the C21 pattern, not a config edit — the lane config itself is byte-untouched.
- Gate D5/D6 mechanics: no merged precedent imports server TS from app/e2e; the spec generates a tsx subprocess script (gitignored `server/tmp/`) — mechanics proven headlessly (§6).

8.4 Frozen artifact provenance (MANDATORY §0.1 statement, in PROVENANCE.md): the frozen semantic-family draft + robot answers are HAND-AUTHORED reviewed fixtures. The W2-10 merged report records FINAL verdict FAIL for BOTH combos (schema_pass_rate 0.0, lint_errors, downstream_compile failing; F-LANE2-W210-D at report :145/:210) — the primary leg has no source artifact; fallback (b) is OPERATIVE. Presenting them as reviewed model output would be a faked green. The axes/anchors BYTES are verbatim derived data: re-emitted from the real decode chain (decode -> extract -> deriveBranchAxes) with `lineWidth: 0` (probe-freeze), then self-pinned: draft `d878727ae69305d73623b6e6fd99ddf7a1bc999efd7b8d84c9c9944afdc98058`, answers `ac383fe4c71d164b52decaa332aeea1c87617a7efab29d294b3cb3a49fd7492e` (full values in PROVENANCE.md).

8.5 OQ6 resolution — WORKED (not blocked). Probe (`server/tmp/w211-probe/probe-oq6.ts`, isolated dataDir, seed records only): `POST /records` mints protocol 201, planned-run 201, run 201 (run carries `plannedRunRef`); `GET /runs/:id/workspace` -> 200 with the run envelope; `GET /runs` surfaces the seeded run (true). The merged product CAN serve a run from seed data only -> D4 is seedable as speced. Bonus walls proven in the same probe: PUT state-spoof 422 (record stays `draft`), POST lifecycleId-spoof 422 (enum), spoofed record ABSENT.

## 9. Hard-stop self-audit (§6, each with command output)

1. `grep -ril dneasy` across all changed files -> 0 hits. ZymoGoldenE2E.test.ts byte-untouched (not in diff).
2. No faked green: vitest suites make zero model calls; live classification honest both ways (INFRA_FAULT reported, not hidden); no mocked classify/parse in the golden (real `parseScientistIntent` + real `classifyCompileResponse` via recordingStore spine); gate receipts written only from real GETs; PROVENANCE states the hand-authored fact.
3. Five negatives named per §3 (N1-N5), each with the merged code verbatim; none renamed/merged/softened (16 arms incl. controls/belts).
4. Wall grep `qwen|thunderbeast|computable:8080|100\.111|flash|4b-vision|lfm2|8899` across ALL new files -> 0 hits. scientist-intent-compile.yaml sha unchanged (b47eee0c…); MANIFEST + goldens/** + schema/scientist-intent diff -> 0 files (OQ1(a)).
5. `git status --porcelain app` -> only `app/e2e/w2-11-campaign-demo.spec.mjs` (+ lane node_modules symlinks, excluded). app/src byte-untouched; no product tweak needed or made.
6. No PUT/DELETE of a minted candidate (405 asserted); `git status --porcelain records` -> 0; records minted via POST /records only; promoted family BORN DRAFT (golden asserts state draft; N4 arms catch spoofing).
7. Serving hosts never touched; :3001/:5174 never; :3093/:5193 never touched by me (gate NOT run). tsconfig flags `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` confirmed at server/tsconfig.json:13-14; new code uses `...(x ? {k:v} : {})` shapes.

## 10. §9 inventory — every file with status

| # | Path | Kind | Status |
|---|---|---|---|
| A | server/src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts | NEW TEST | committed b1b54044 — 16/16 green, self-pins, spine6 composition, zero model calls |
| B | server/src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts | NEW TEST | committed b1b54044 — 16/16 green, five refusals + zero-write snapshots + N5 structural arms |
| C | server/src/ingestion/vendor-protocol/campaign-fixtures/ (zymo-semantic-draft.frozen.yaml, zymo-robot-answers.frozen.yaml, PROVENANCE.md) | NEW DATA | committed ebc5b073 FIRST (freeze before green), self-pinned, FAIL-verdict provenance stated |
| D | server/scripts/zymo-campaign-live-smoke.ts | NEW RUNNER | committed 70478716 — header contract verbatim, never vitest-collected (scripts/ outside vitest include), no model literals, artifacts untracked; ran 3x honestly |
| E | app/e2e/w2-11-campaign-demo.spec.mjs | NEW GATE SPEC | committed edada3b9 — authored only, NEVER run by coder; runnable form + server-leg mechanics proven headlessly |

Everything else: EMPTY diff (records/, goldens/, schema/, app/src/, server/src/{compiler,api,extract,config}/ all zero). Scratch probes live under `server/tmp/w211-probe/` (gitignored via `tmp/`) and are uncommitted; the gate's generated leg script lands in gitignored `server/tmp/` at gate time.

## 11. Assumptions recorded

- The C21 config-copy fallback for the live leg (lane config untouched) is the sanctioned pattern; the lane config's semanticPass model id is provider-invalid at tip (F-LANE2-W210-adjacent config debt — flagged for the orchestrator, NOT fixed by me).
- The 2 merge-introduced app tsc errors and the 11-file scoped fail-set are trunk-side debt outside my owned files; left untouched per the pin-drift rule.
- All records in the data repos are TEST DATA (Brad ruling) — my probes mint only clearly-labeled w211 test records in isolated probe dataDirs.

## Cycle 1 (fix run l2t1430)

Adversarial review c1 (`/home/brad/.hermes/cl/lanes/2/reviews/advc-W211-c1-l2t1415.md`): VERDICT fix, 2 defects. Both fixed on this branch; diff restricted to `app/e2e/w2-11-campaign-demo.spec.mjs` + this report. No golden/negatives/fixtures/live-smoke edits.

### DEFECT 1 [BLOCKER] — familyId scope (spec.mjs)

Fix (reviewer's option 1, hoist): `let familyId = null` moved from inside the `test.describe` callback (old :492) to MODULE scope (new :72, after the const block); the `beforeAll` assignment (`familyId = await promoteFamily()`, new :504) and every describe-scoped use site (PRECHECK, D4) now read the same module binding; `seededFamilyPayload()` (module scope, new :488-491) sees it. No other logic changed.

Diff shape: `git diff --name-status HEAD` -> exactly `app/e2e/w2-11-campaign-demo.spec.mjs` + `.hermes/plans/W2-11-report.wip-l2t1105.md`.

### DEFECT 1 verification — real outputs

1. Syntax check (necessary, NOT sufficient — kept for completeness):
```
$ cd app && node --input-type=module --check < e2e/w2-11-campaign-demo.spec.mjs
exit 0
```

2. Playwright collection gate (the non-vacuous check the reviewer mandated — parses + collects every test body, incl. D5/D6, without running legs):
```
$ cd app && npx playwright test w2-11-campaign-demo.spec.mjs --project=chromium --list
Listing tests:
  [chromium] › w2-11-campaign-demo.spec.mjs:508:3 › W2-11 zymo campaign demo gate › PRECHECK: seeded SAID + MEANT + family + run present
  [chromium] › w2-11-campaign-demo.spec.mjs:523:3 › W2-11 zymo campaign demo gate › D1: immutable SAID — sha equal, zero mutating controls
  [chromium] › w2-11-campaign-demo.spec.mjs:548:3 › W2-11 zymo campaign demo gate › D2: editable MEANT — label edit saves, survives reload, provenance byte-equal
  [chromium] › w2-11-campaign-demo.spec.mjs:589:3 › W2-11 zymo campaign demo gate › D3: mounted AI — proposal + accept revision, refusals visible, walls hold
  [chromium] › w2-11-campaign-demo.spec.mjs:646:3 › W2-11 zymo campaign demo gate › D4: downstream questions — run workspace localization answers + accept -> LPR
  [chromium] › w2-11-campaign-demo.spec.mjs:718:3 › W2-11 zymo campaign demo gate › D5: robot realization — merged lowerRealization/realizeAndCompile headless leg (honestly named)
  [chromium] › w2-11-campaign-demo.spec.mjs:742:3 › W2-11 zymo campaign demo gate › D6: run graph shown — POST /intent/compile artifacts viewable
Total: 7 tests in 1 file
exit 0
```
No collection error; D5 and D6 are collected.

3. Helper-scope proof (reviewer-reproducible, throwaway copies under /tmp/w211-scope-fix with a stub `@playwright/test`; the spec itself untouched by the probe; only difference between the two copies is the fix, plus a scratch-only `export` added to the helper so node can call it):
```
$ node -e "import('./spec-fixed.mjs').then(m=>m.seededFamilyPayload()).then(...).catch(e=>console.log('THROWS:', e.constructor.name+':', e.message))"   # POST-FIX copy
THROWS: Error: GET /records/null -> 404: {"error":"NOT_FOUND","message":"Record not found: null"}
```
The helper now executes its body and reaches `getRecordEnvelope(familyId)` with the module binding (null pre-seed in the probe) — a network 404, NOT a ReferenceError.
```
$ node -e "...same call..."   # PRE-FIX control copy from git show e4643a4b:...spec.mjs
THROWS: ReferenceError: familyId is not defined
```
Control reproduces the reviewer's §0.7 finding exactly; the fixed copy does not. Binding resolution proven.

### DEFECT 2 [MAJOR] — §6 evidence honesty

§6 "Runnable-form evidence" amended in place: `node --check` explicitly scoped to syntax-only; the scratch harness claim scoped to `runServerLeg` mechanics only with an explicit note that it never calls `seededFamilyPayload()` and never covered the D5/D6 test bodies; new bullet states the D5/D6-specific evidence (the `--list` collection output + the scope probe above). No other section's claims touched.

### Re-runs

Per dispatch rule, nothing expensive re-run: golden/negatives battery (32/32) and server tsc (0) are untouched by this diff (no server file changed); the app gate itself remains the orchestrator's act (OQ4).
