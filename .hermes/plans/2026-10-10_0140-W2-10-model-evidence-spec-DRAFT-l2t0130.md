# W2-10-MODEL-EVIDENCE — spec DRAFT (cl-spec-composer, 2026-10-10 ~01:40 EDT, token l2t0130)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews +
promotes. COMPOSED PRE-DEPS: W2-6 draft-only (unmerged, OQ1=endpoint/OQ2=refuse/OQ3=(a) active
profile ruled at l2t1955), W2-7 draft-only (unmerged, OQ1-4 ruled at l2t2355). EVERY bind to a
W2-6/W2-7 shape reads CONFIRM-AGAINST-MERGED-TRUNK (CAMT); the merged trunk wins over anything
assumed here. Promotion gate for THIS spec: W2-6 AND W2-7 merged (task-list deps line).

GOAL (one sentence): Run the byte-identical Zymo full vendor-protocol-candidate through BOTH configured model/host
combos (qwen3.8-flash-next @ thunderbeast and qwen35-4b-vision @ computable) plus any
data-declared config variants, through W2-6's semantic-draft endpoint and W2-7's realization
spine, with evaluation criteria declared as DATA before any result exists, and land a committed,
reproducible report whose per-run rows name model/config/contract-revision, attribute every
failure to a STAGE (extraction vs lowering vs compiler), and preserve weak results — no winner
hardcoded anywhere, model choice staying a setting and thresholds staying data.

## 0. TRUNK REALITY (every file:line opened FIRST-HAND this session at trunk tip 987bd34c; git
always `-c core.fileMode=false`)

0.1 ENDPOINT SURFACES (liveness ORCHESTRATOR-MEASURED at ~01:35 EDT this tick — composer fired
    NO probes, per brief; treat as fresh-at-compose, re-probe at claim):
- computable llama.cpp `http://100.111.141.22:8080/v1` serves model id `qwen35-4b-vision` —
  SINGLE slot, shared fleet-wide with cl-scout and cl-browser-reviewer. Queueing is real; the
  serving process is NEVER killed/restarted/displaced by this item.
- thunderbeast vLLM `http://thunderbeast:8080/v1` serves `qwen3.8-flash-next`.
- NEITHER URL may appear in product code (src/). They live in config DATA (0.2) and in the
  lane's UNTRACKED config.yaml only.
- `server/src/config/types.ts` — `AIConfig` :162-185: `activeProfile?` :164,
  `profiles?: Record<string, AIProfile>` :166, `inference`/`agent` :167-168, optional blocks
  `extractor?` :170, `warmup?` :172, **`shadowRouter?: ShadowRouterConfig` :178** — the
  MISSING-block-=-OFF / endpoints-are-DATA precedent (doc comment :173-177, interface
  :218-229). `resolveAiProfile(ai)` :235-239 (activeProfile wins, else legacy inference+agent).
  `InferenceConfig` :244-287: baseUrl :248, model :250, apiKey :252, `timeoutMs` default
  120_000 :254, `maxTokens` :256, temperature :258, enableThinking :264, thinkingLevels :273,
  defaultThinkingLevel :275, `streamIdleTimeoutMs` default 300_000 :282, streamMaxMs :286.
- `server/src/config/loader.ts` — optional-block validation convention at :331-356 (warmup),
  shadowRouter block validated right after (PROTO-AI-12 report §3); `records.directory` plumbing
  :838/:857.

0.2 THE LIVE LANE CONFIG (UNTRACKED — excluded; `git ls-files config.yaml` = 0, status clean):
- `config.yaml` :53 `activeProfile: qwen3.8-thunderbeast`; profiles block :54-110:
  `lfm-local`, `qwen3.6-appliance-2`, **`qwen3.8-thunderbeast` :79-91** (baseUrl
  `http://thunderbeast:8080/v1`, model `qwen3.8-flash-next`, maxTokens 65536,
  streamIdleTimeoutMs 600000), `spark-x2.5-4b`, `qwen3.8-flash-OR`; top-level
  `inference: *a1` / `agent: *a2` :108-109; `shadowRouter` block :114-119 (DATA example);
  `warmup.enabled: true` :120-123.
- **NO computable profile exists yet** — `grep -rn "100.111.141.22|qwen35-4b" config.yaml
  config.example.yaml server/src` = ZERO matches first-hand. The worker ADDS a profile entry to
  their worktree's untracked config.yaml (pure DATA, never committed as product code; the report
  snapshots it). Note for that entry: a NON-streaming `complete()` on computable can legitimately
  run minutes — the DEFAULT `timeoutMs` 120_000 (types.ts :254) will abort it. The profile DATA
  must raise `timeoutMs` explicitly (e.g. 900000); that is a config value, never a code edit.
- Activation route precedent (ModelSwitcher): `POST /api/config/ai/profiles/:name/activate` —
  routes.ts :853 (`fastify.post('/config/ai/profiles/:name/activate', …)`, siblings GET/PUT/DEL
  :851-854); handler `activateAiProfile` configHandlers.ts :603-641 — copies profile.inference/
  agent to top-level + sets activeProfile + writes config.yaml (:629-632). The lane stack
  (:3093/:5193) is NEVER touched by this item — the harness does NOT activate against the live
  stack (see §4.2: per-combo boot with its own config object; W2-9/W2-6 own the activation
  product story; this item consumes whichever model-knob shape MERGED, never code-edits between
  runs).

0.3 HARNESS-STYLE PRECEDENTS (runner-script location + live-call discipline):
- `server/live-zymo.mts` (69 lines, READ IN FULL): `createInferenceClient({provider, baseUrl,
  model, temperature, enableThinking})` :6-12, `client.complete({model, messages, tools,
  tool_choice})` :23-31, parse via `parseScientistIntent` :44, compile via
  `compileScientistIntent(intent, {searchLabwareByHint})` :52-60, outcome+events+gaps printed
  :62-66. Siblings `live-zymo-raw.mts`, `live-zymo-permissive.mts`, `live-one-shot.mts`,
  `live-branch-demo.mts`.
- **`server/scripts/`** = the committed runner-script dir: `live-smoke.ts`,
  `golden-replay.ts`, `run-compile-fixtures.ts`. `live-smoke.ts` header :1-27 is THE contract for
  live scripts: manual/orch-only, NEVER CI, never vitest-collected (lives under scripts/, outside
  src/), never curls the running stack, drives the REAL handler in-process via
  `resolveAiProfile` + `createInferenceClient` (:27-31), **model named AT RUN TIME from config —
  no model/profile literal in the file** (header :12-14), artifacts untracked under
  `server/.artifacts/live-smoke/<UTC-timestamp>/` carrying profile+model+baseUrl HOST (NO key
  material) (:21-24), exit 0 whenever a call COMPLETED — classification line carries the verdict;
  "This script is evidence, not a gate" (:17-18). W2-10's runner mirrors this verbatim in style.
- npm-script runner precedents: server/package.json :18-24 (`compile:fixtures`,
  `foundry:*` = `npx tsx scripts|src/tools/...`).

0.4 INFERENCE CLIENT + TELEMETRY FIELDS:
- `server/src/ai/InferenceClient.ts` — `createInferenceClient(config)` :49; timeoutMs default
  120_000 :53; streamIdleTimeoutMs 300_000 :59 (idle-reset comment :51-58: long generations are
  normal, silence is failure); non-streaming POST `${baseUrl}/chat/completions` :105; streaming
  adds `stream_options: {include_usage: true}` :191; retries x3 transient-only (W2-6 spec §0.3
  cites :136-161).
- `server/src/ai/types.ts` — `CompletionResponse` :106-120: `finish_reason:
  'stop'|'tool_calls'|'length'` :111, `usage?: {prompt_tokens, completion_tokens,
  total_tokens}` :113-117, `timings?: LlamaTimings` :119 — `LlamaTimings` :96-105
  (`prompt_n, cache_n, prompt_ms, prompt_per_second, predicted_n, predicted_ms,
  predicted_per_second`; comment :92-94: present on llama.cpp servers, ABSENT elsewhere —
  the computable rows get decode-rate telemetry, thunderbeast rows get usage-only. Absent
  fields stay ABSENT in the report — exactOptionalPropertyTypes idiom, never `null` fakes).

0.5 THE IDENTICAL ZYMO INPUT (deterministic, no LLM needed to build it):
- `server/src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts` :1-45 (READ):
  `decodeVendorProtocolPdfFile(zymoPdfPath, {documentId:'vendor-protocol-zymo-magbead'})` :13-15
  + `extractVendorProtocolCandidate(document)` :16 — the pure (non-LLM) chain over
  `resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead-dna_kit.pdf` (present, first-
  hand); asserts 17 steps :23. So the candidate is BYTE-REPRODUCIBLE at a pinned tip — the
  harness serializes it ONCE, hashes it, feeds identical bytes to every combo (input-identity
  proof; the hash rides every report row).
- Record fixture `VPDF-257F57196F6C__zymobiomics-96-magbead-dna-kit.yaml` in the data repo
  `/home/brad/.computable-lab/worktrees/main/records/vendor-pdf/` (opened: kind vendor-pdf,
  pageCount 31, sha256 257f5719…; ALL records there are TEST DATA). NOTE: the data repo carries
  `vendor-pdf`/`vendor-product` dirs but **NO vendor-protocol-candidate (VPC-) records** — same
  AS-W26-CANDIDATE-PERSISTENCE posture as W2-6's spec §11: the harness mints the candidate record
  via the store/POST /records seam of its in-process boot.
- Candidate size: W2-6 spec §0.5 MEASURED 54,329 bytes compact ≈ 13.6K tokens (chars/4). The
  composer did NOT re-measure (no tsx run this session) — CAMT/inherit, harness re-measures and
  records the real byte length + hash per run.

0.6 THE PASSES UNDER TEST (both CAMT — drafts only, unmerged):
- W2-6 endpoint: `POST /extraction/vendor-candidates/:recordId/semantic-draft` (ruled OQ1(ii),
  task-list W2-6 block header l2t1955; W2-6 draft §4/§3-W6). Refuse-on-missing-coverage
  (OQ2(a)); model = resolveAiProfile ACTIVE profile (ruled OQ3(a)). Service codes from W2-6
  draft §2.2/§3: SEMANTIC_PASS_NO_CANDIDATE / _TRUNCATED / _PARSE_FAILED / _ANCHOR_UNRESOLVED /
  _STEP_COVERAGE / _AXES_DISCARDED. Prompt DATA:
  `server/src/extract/prompts/semantic-family-draft.md` (CAMT — path from the draft; prompt bytes
  are FROZEN across every combo in this matrix, hash pinned in the report).
  NOTE the live tension: W2-9's task text demands a /settings-distinct semantic model; its
  composer is live. THE MATRIX WORKS EITHER WAY: combos are driven by CONFIG VARIANTS (profile
  activation or a dedicated block — whichever merged), NEVER by code edits between runs; the
  runner resolves "the model" the same way the merged product does. That IS W2-6's verified-by
  ("swapping the configured model changes the request with zero code edits") proven at the fleet
  level.
- W2-7 spine: `lowerRealization` / `realizeAndCompile` at
  `server/src/compiler/scientistIntent/realizeScientistIntent.ts` (CAMT(W2-7 draft §2.1/§3-B)) +
  the frozen `compileScientistIntent` (trunk REAL:
  `server/src/compiler/scientistIntent/compileScientistIntent.ts` — production spine composition
  per W2-7 §0.6; `parseScientistIntent` on trunk). W2-7's realization fixture (family + robot
  answers) is CAMT(W2-7) — the matrix REUSES W2-7's merged test fixture bytes (its golden's
  answers), never re-authors lab answers per combo (answers are held constant so only the model
  varies).

0.7 THRESHOLDS-AS-DATA + PRE-REGISTRATION CONVENTION (the shipped precedent — no invented
convention):
- There is NO `schema/data/` or `server/eval/` dir (checked). The shipped conventions are:
  (i) registry-style DATA docs under `schema/registry/<topic>/` that are explicitly NOT
  .schema.yaml and NOT record kinds — `schema/registry/branch-axis-mapping/
  pdt-axis-to-branch-axis.yaml` header :1-14 (read in full: "registry-style DATA doc… Schema-
  Loader's *.schema.yaml discovery skips it… adds no code and no policy"), W2-4's
  `schema/registry/provenance-ladder/rung-vocabulary.yaml` (merge 7d301c1f, 16 files, zero prod
  TS), W2-7 draft's `schema/registry/realization/robot-realization.policy.yaml`;
  (ii) the PROTO-AI-12 pre-registration discipline: `.hermes/plans/2026-10-04_1715-PROTO-AI-12-
  router-spike-prereg.md` header :5-7 ("thresholds fixed BEFORE any shadow evidence… changing
  them after evidence is a re-registration"), §2 :47-60 (thresholds as declared numbers;
  denominators INCLUDE timeouts/abstentions/parse-failures — a failure is never skipped;
  minimum sample size or the verdict is **INSUFFICIENT, never PASS**; human-labelled checks,
  NEVER an LLM judge :59-60).
- Telemetry style: PROTO-AI-12 report + serving notes — every number is an observed output ("none
  are estimated", serving-notes :3-4); PROTO-AI-15 ratchet — the measured value + capture path +
  the formula are ALL recorded, prose guidance where a human gate belongs (prereg OQ1 disposition,
  ratchet spec header :3).

0.8 PINNED BASELINES (carry; re-measure at claim per handoff l2t0030 Baseline facts): trunk tip
987bd34c; server tsc 26 err-lines multiset /tmp/l2t2230-tsc-server.txt; app tsc 34 (N/A — app
untouched); src/schema+src/lint fail-file SET {EventGraphEquipmentSchema.test.ts,
LabwarePhysicalGeometryData.test.ts}; goldens expect 15; MANIFEST sha 014ca71f…; health
schemas:192 lintRules:77 (both will have MOVED by promotion time — re-pin at claim). `exactOption-
alPropertyTypes` + `noUncheckedIndexedAccess` ON (server/tsconfig.json :13-14).

0.9 NO SCOUT USED THIS SESSION: every orientation question was answered by first-hand
read_file/search_files/terminal (each cite above opened this session); no scout output is cited,
none is load-bearing.

## 1. SCOPE — files IN / OUT

IN SCOPE (§3 file-by-file): one registry-style criteria DATA doc; one runner script under
`server/scripts/`; one PURE scoring/stage-attribution module + its vitest suite under
`server/src/tools/` (precedent: src/tools/corpusIntake.ts exists); the committed report artifact
under `.hermes/plans/`; untracked raw-response artifacts under `server/.artifacts/semantic-
matrix/` (live-smoke :21-24 pattern).

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- ANY file in `server/src/{ingestion,extract,compiler,api,config}/` — the semantic pass, the
  activation route, the realization lowerer, config types/loader are CONSUMED, never edited
  (git-diff-empty proof on each). No new endpoints, no new route family (campaign rule: the
  harness is a RUNNER SCRIPT, not product surface).
- Nothing in `src/` chooses a model by name EVER — including this item's own scoring module and
  runner (grep wall §6). No branch on `qwen|thunderbeast|computable|4b|flash` in any new file.
- `schema/**` beyond the ONE new criteria doc; `goldens/**` + MANIFEST byte-untouched; `records/**`
  in any repo; `app/**`, `*.ui.yaml` (headless — §10); `config.yaml` (untracked lane data — the
  worker's worktree copy MAY gain the computable profile entry; the COMMITTED `config.example.yaml`
  is NOT touched — the report snapshots the profile bytes instead).
- Serving processes: NEVER kill/restart/nice/displace computable llama.cpp, thunderbeast vLLM, or
  :11434/:8900/:8080 anything; NEVER touch :3001/:5174/:3093/:5193.
- No constraint relaxation, no literal fallback, no per-combo prompt/answer/payload variation
  (same prompt sha, same candidate sha, same realization answers for every row — enforced by the
  snapshot hashes in §4.3).

## 2. DECLARATIVE SURFACES FIRST — evaluation criteria as DATA

`schema/registry/model-evaluation/semantic-pass-matrix.criteria.yaml` (NEW; branch-axis-mapping
header precedent verbatim: registry-style DATA doc, NOT .schema.yaml, NOT a record kind, NOT a
crosswalk forbidden_kind). Declared, versioned, hashed into every report row; committed BEFORE
the first live run (the commit order is the pre-registration; the criteria sha256 identical across
all rows is the no-relaxation proof):

```
kind: model-evaluation-criteria        # plain data field, not a record kind
version: 0.1.0
campaign: semantic-protocol-family
pre_registration: "declared <date> BEFORE any W2-10 evidence; changing thresholds after
  evidence = re-registration (PROTO-AI-12 §2 doctrine)"
combos:                              # combo id -> profile NAME in the deployment config
  - { id: thunder-q38, profile: qwen3.8-thunderbeast }   # names reference config DATA;
  - { id: computable-q4b, profile: <computable profile name the worker adds to the>      # never inline urls/models
      # untracked lane config}
variants: []                          # optional extra rows: {id, profile, thinkingLevel} —
                                      # e.g. thinking on/off IF merged W2-6 exposes levels as
                                      # config (CAMT); empty list = two combos only
reps_per_combo: 3                     # minimum sample size: fewer completed runs => INSUFFICIENT
per_run_timeout_ms: 900_000           # wall clock per live run; a timeout is an EXTRACTION_STAGE
                                      # transport failure counted in the denominator
criteria:                             # every metric: verdict per combo, PASS only if n>=reps
  schema_pass_rate:            { min: 1.00 }        # fraction of runs whose draft payload
  lint_errors:                 { max: 0 }           #   validates under merged schema+lint
  branch_retention_min:        { min: 17 }          # candidate steps accounted for (coverage
                                                    #   guard, CAMT(W2-6 SEMANTIC_PASS_STEP_
                                                    #   COVERAGE diagnostics))
  anchor_supported_ratio:      { min: 0.80 }        # refs resolved / refs emitted by the model
  unsupported_claim_spans_max: { max: null }        # null = REPORT-ONLY, no gate (visibility
                                                    #   without a pass bar — declared openly)
  downstream_compile:          { required: outcome-complete }  # W2-7 leg outcome 'complete'
  latency:                     { report: p50_p95, gate: none } # latency is evidence, not a gate
                                                                # (CPU/slot asymmetry is the point)
verdict_rule: "INSUFFICIENT if completed runs < reps_per_combo (never PASS); PASS iff every
  gated metric passes; FAIL lists the failing metrics; results NEVER trigger threshold edits —
  a failing combo is a finding the report preserves."
stage_taxonomy: [extraction.transport, extraction.parse, extraction.schema, extraction.guard,
                 lowering, compiler, harness]       # §4.4 mapping; the three acceptance
                                                     # families map: extraction = first three +
                                                     # guard, lowering, compiler
```

(The composer PROPOSES these numbers; the orchestrator may edit them at promotion — edits BEFORE
any run, since this spec ships zero results. Post-evidence edits are a re-registration.)

## 3. FILE-BY-FILE PLAN (complete; everything else zero diff)

| # | Path | Kind | Content |
|---|------|------|---------|
| A | `schema/registry/model-evaluation/semantic-pass-matrix.criteria.yaml` | NEW DATA | §2, verbatim shape above (final numbers per ruling) |
| B | `server/scripts/semantic-matrix.ts` | NEW RUNNER | tsx, manual/orch-only, NEVER vitest-collected, mirrors live-smoke.ts header contract (§0.3): model/profile named at run time FROM the criteria file's combo list + the deployment config; no literal endpoint/model anywhere |
| C | `server/src/tools/semanticMatrixScoring.ts` | NEW TS (pure) | `scoreRun(row, criteria)` + `stageOf(failureCode)` + `verdicts(rows, criteria)` — pure functions, no IO, no model names, no clock (ts comes in on the row) |
| D | `server/src/tools/semanticMatrixScoring.test.ts` | NEW TEST | §6 RED-first suite |
| E | `.hermes/plans/W2-10-report.md` | COMMITTED ARTIFACT | the matrix table + per-row snapshots + weak results preserved (§4.5) |

Untracked (never committed): `server/.artifacts/semantic-matrix/<UTC-timestamp>/` — per-run
`request-snapshot.json` (profile name + model + baseUrl HOST, NO key material — live-smoke :21-24),
`raw-response.json` (verbatim model output), `row.json` (the telemetry row). Report cites their
paths + sha256.

## 4. RUNNER FLOW

4.1 INPUT (once per matrix run, before any combo): decode Zymo PDF via the REAL chain
(`decodeVendorProtocolPdfFile` + `extractVendorProtocolCandidate`, §0.5), serialize the candidate
JSON once, sha256 it, mint it as a vendor-protocol-candidate record in the harness's OWN
in-process app boot (AS-W26-CANDIDATE-PERSISTENCE posture; never the lane stack). The same
candidate BYTES go to every combo.

4.2 COMBO LOOP (per combo from criteria `combos`+`variants`, then `reps_per_combo` times, fully
SERIALIZED — computable's llama.cpp slot is single and fleet-shared; thunderbeast rows run one-at-
a-time too, for comparable latency numbers):
- Boot the harness app IN-PROCESS with a deep-copied config whose active model resolution points
  at the combo's profile — resolved the SAME way the merged product resolves the semantic-pass
  model: if merged trunk kept W2-6 OQ3(a) `resolveAiProfile`, set `activeProfile` (+ copy
  profile→inference exactly as `activateAiProfile` does, configHandlers.ts :627-631) on the
  IN-MEMORY copy only; if merged trunk instead grew a dedicated semantic-pass block (W2-9
  tension), set THAT key on the copy. Either shape = zero code edits between runs. The
  lane's on-disk config.yaml is NEVER mutated by the runner (the worker adds the computable
  profile to their untracked worktree config ONCE, as data, before the matrix).
- Call the semantic-draft endpoint via in-process inject (extractionE2E harness pattern, CAMT(W2-6
  W5)): POST /records candidate -> POST /extraction/vendor-candidates/:recordId/semantic-draft.
- On a landed draft: run the W2-7 leg with W2-7's merged fixture answers (§0.6) —
  `lowerRealization` -> `parseScientistIntent` -> `compileScientistIntent` (production spine
  composition, NO test-seam spine — W2-7 §4 doctrine) — recording outcome.
4.3 SNAPSHOT PER RUN (report row identity — the acceptance clause "names model/config + contract
revision"): {git HEAD sha; criteria sha256; prompt md sha256 (CAMT path §0.6); candidate sha256 +
byte length; realization-answers sha256; contract revisions = sha256 of
`schema/registry/wave2-verb-adjudication.yaml`, `schema/workflow/scientist-intent.schema.yaml`,
`schema/registry/compile-pipelines/scientist-intent-compile.yaml`, `goldens/MANIFEST.yaml`};
{combo id, profile name, model, baseUrl host}; {W2-6 prompt md == same bytes for all rows};
{latency wall ms; usage prompt/completion/total (absent = absent, exactOptionalPropertyTypes);
LlamaTimings when present (computable: predicted_per_second ≈ the ~55 tok/s decode honest-
budgeted)}; {queue-wait caveat line per §7 — shared-slot rows carry an honest
cross-tenant-interference disclosure, never a silently-cleaned number}.
4.4 STAGE ATTRIBUTION (the "distinguishable" clause): EVERY non-green run maps to exactly one
`stage_taxonomy` value via `stageOf()` in module C — a pure lookup over merged machine codes
(CAMT at claim: W2-6's SEMANTIC_PASS_* set -> extraction.parse / extraction.guard; HTTP
timeout/5xx/abort -> extraction.transport; Ajv errors on the draft -> extraction.schema;
W2-7's REALIZATION_* -> lowering; compileScientistIntent gaps/needs-clarification/throw ->
compiler; harness's own store/boot errors -> harness, which INVALIDATE the row honestly instead
of poisoning a model's score). A run can fail at one stage only in the matrix's bookkeeping:
if extraction fails, lowering/compiler columns read `n-a (upstream)` — never a fake failure,
never a skip.
4.5 REPORT (module C scores rows against criteria; the ONLY pass/fail computation): matrix table
= one row per run, PROTO-AI-12 telemetry shape {combo, model, host, contract rev, schema pass,
lint findings, branch-retention count, anchor-supported ratio, unsupported-claim findings,
W2-7 compile outcome, latency p50/p95 (over reps; n<2 => no percentile claim), in/out tokens};
per-combo verdict PASS/FAIL/INSUFFICIENT per §2 rule; WEAK RESULTS STAY VISIBLE — every failing
metric, every raw-response artifact path, no re-runs deleted, no threshold edits, no "best of"
selection (all reps of all combos stay in the table, newest-last, appendix preserves chronology);
findings prose (what the 4B did differently: truncations, parse failures, anchor drops). The
report names NO recommendation — model choice stays a setting for a human decision (D7); the
report's job is evidence.

## 5. ACCEPTANCE-CLAUSE -> PROOF MAP (VERBATIM criteria, §10)

- "Reproducible report artifact names model/config + contract revision per run" -> §4.3 snapshot
  fields on every row; reproducibility = report + runner + criteria committed; re-run command
  printed in the report; per-run artifacts hash-cited.
- "BOTH combos exercised against Zymo" -> criteria `combos` names both profiles; the report's
  rows enumerate >= reps per combo; candidate sha256 identical across ALL rows (byte-identical
  input proof).
- "extraction failures vs lowering failures vs compiler failures distinguishable" -> §4.4 stage
  taxonomy + module C's `stageOf` unit-tested with one fixture row per stage (T2) + the report's
  per-row stage column.
- "weak results stay visible (no constraint relaxation, no literal fallback)" -> criteria sha256
  identical on every row (§4.3); prompt md sha identical; T3 asserts verdict flips ONLY via
  criteria edits (never code); §4.5 no-selection rule; artifact retention rule (nothing deleted).
- "no winner hardcoded anywhere" -> T4 source-grep: module C + runner contain ZERO matches for
  model/host regexes; verdicts are pure(data, data); the report is generated FROM rows (its
  prose section is written by the worker from the table, but every verdict string traces to
  module C output — report quotes the scoring module's JSON).
- Item-text bindings: D7 ("try different models") = combos via config variants only —
  the zero-code-edit swap IS W2-6's verified-by at fleet scale (§4.2); "extraction plausibility
  alone must not count" = downstream_compile is a gated criterion (§2); PROTO-AI-12/13 telemetry
  style = §4.3/§4.5 field list + prereg discipline (§0.7ii).

## 6. RED-FIRST TEST PLAN (headless; the ONLY new vitest suite is D — the runner never runs
inference under vitest)

T1 (RED at base: module absent) scoring purity: scoreRun/verdicts are pure — same inputs ->
byte-equal verdict JSON; criteria with min 1.00 vs 0.99 flips a 2/3-run combo FAIL->PASS with
ZERO code changes (thresholds-are-data); `completed < reps_per_combo` -> INSUFFICIENT even with
all-pass metrics (PROTO-AI-12 :55 rule, non-vacuously — mutation-test by flipping n).
T2 stage attribution: one fixture row per taxonomy value (transport timeout, parse-fail,
Ajv-error, SEMANTIC_PASS_STEP_COVERAGE, REALIZATION_ANSWER_MISSING, compile outcome gaps, harness
boot error) -> distinct stage strings; `n-a (upstream)` propagation for downstream legs; NO stage
collapses into another (each arm its own expect).
T4 no-winner source wall: `grep -rniE "qwen|thunderbeast|computable|appliance|:8080|8080|100\.111"
server/src/tools/semanticMatrixScoring.ts server/scripts/semantic-matrix.ts` = ZERO; plus a
behavioural arm: scoring two synthetic rows differing only in the model-name string yields
verdicts differing ONLY because metrics differ (names are opaque labels to C).
T5 criteria-file load: module C reads the REAL criteria YAML at `schema/registry/
model-evaluation/semantic-pass-matrix.criteria.yaml` (FRESH read per call — YAML-reload bait);
asserts parse -> the §2 shape; missing file -> hard error, never a silent default (MISSING
criteria = refuse, mirroring MISSING-block-=OFF).
Runner smoke (NOT a test): `npx tsx scripts/semantic-matrix.ts --dry-run` — builds candidate,
hash, snapshots, request bodies for every combo, scores a canned-rows fixture report
end-to-end, ZERO live calls. This is the §5 first-check gate before any live inference.

VERIFICATION COMMANDS (exact, at claim base and after):
- `cd <wt>/server && npx vitest run src/tools/semanticMatrixScoring.test.ts` -> all green
  (first run RED before module C exists — capture the RED text in the report).
- `npx vitest run src/schema src/lint` -> fail-file SET == pin §0.8 (SET identity, freshly
  measured on claim base — the W2-5/W2-6 merges move baselines; re-pin honestly).
- `npx vitest run src/compiler/scientistIntent src/integration` -> all green UNLESS in the
  freshly-measured claim-base fail set.
- `npm run typecheck -w server` (or `npx tsc --noEmit -p server/tsconfig.json`) -> 26-line pin,
  per-file+message MULTISET == /tmp/l2t2230-tsc-server.txt re-pinned at claim.
- `git -c core.fileMode=false diff --stat HEAD` -> ONLY §3 files; `git -c core.fileMode=false
  diff --stat HEAD -- app/ schema/registry/compile-pipelines/ goldens/ records/
  server/src/api/ server/src/config/ server/src/ingestion/ server/src/extract/
  server/src/compiler/` -> EMPTY (consumption-only proof).
- `grep -c "kind:" schema/registry/model-evaluation/*.yaml` sanity + goldens suites green
  (MANIFEST untouched).
- Live matrix (orch-adjacent, see §7): `cd <wt>/server && npx tsx scripts/semantic-matrix.ts`
  -> exit 0 whenever all scheduled runs COMPLETED (failures are findings, not crashes; only a
  harness bug exits non-zero); artifacts dir + report diff appended by the worker.

## 7. WORKER CONTRACT (wall-clock budget is part of the deliverable)

- Branch `W2-10-lane2-l2t<token>` off trunk `cl/integration-2` TIP AT DISPATCH (post W2-6/W2-7
  merges — that merge IS the promotion signal). Worktree `<integration>/wt/W2-10-lane2-l2t<token>`;
  lane bootstrap replicates untracked entries 1:1 (symlinks as symlinks — W2-7 §5 precedent);
  per-worktree excludesFile.
- Deliverable report `.hermes/plans/W2-10-report.wip-l2t<token>.md` (trunk checkout), final
  stdout `W210 DONE <sha>`. git always `-c core.fileMode=false`. ONE commit of §3 files; the
  report updates in place.
- WALL-CLOCK: thunderbeast reps ≈ seconds-to-minutes each (vLLM, warm); computable reps are the
  budget: 13.6K-tok prompt prefill + minutes of decode at ~55 tok/s on a SINGLE SHARED SLOT —
  budget 10-20 min per computable rep including queue wait, 3 reps = 30-60 min, with `per_run_
  timeout_ms` 900_000 as the honest ceiling. Total live-matrix window ≈ 1-2.5 h; total worker
  budget ≈ 4-5 h (RED-first suite + dry-run + live matrix + report). If a computable rep times
  out it is a recorded `extraction.transport` finding (denominator counts it) — NOT a retry
  outside the rep budget, NOT a timeout increase (that would be constraint relaxation; the
  profile's config timeoutMs is set ONCE, before any result exists).
- SLOT DISCIPLINE: computable llama.cpp is shared with cl-scout/cl-browser-reviewer — the runner
  serializes computable calls (it already runs one-at-a-time) and on HTTP-level overload/queue
  errors does EXACTLY ONE polite re-check after a data-declared backoff, then records the failure.
  NEVER kill/restart/nice any serving process; NEVER add a second server; liveness is assumed,
  failures are evidence. Disclose cross-tenant queue interference as a standing caveat line in
  every computable row's latency cell (honest numbers, disclosed noise).
- Headless only: NEVER :3001/:5174/:3093/:5193, no browser, no UI touch, no lane-stack restart.
- Fleet: one worker under the fleet lock; the live-matrix window may outlive a coder tick —
  the runner is resumable (artifacts dir is timestamped per run; a re-invocation SKIPS combos
  already complete and SAYS SO in the report appendix — skipping completed evidence is
  forbidden, re-running to "improve" a result is forbidden).

## 8. REVIEWER BAIT (pre-empt every one)

1. HARD-CODE HUNT (the headline): model names, hosts, ports in ANY new committed file = reject;
   T4's grep + the criteria-combo indirection (ids -> profile NAMES -> config data) is the wall.
   Criteria file itself carries names-as-data (allowed: it IS data) but NEVER urls/keys (the
   profile holds those).
2. WINNER HARDCODING: any TS branch `if (model…`/ordering that treats a combo specially; verdicts
   are `pure(rows, criteria)`; T1's threshold-flip arm proves the data seam; the report's
   verdict cells quote module C output.
3. THRESHOLD SOFTENING / LITERAL FALLBACK: criteria sha256 identical across rows + commit-order
   pre-registration (criteria committed before first live-run log line) + §4.5 no-delete rule.
   A reviewer diffing criteria sha between rows must find equality.
4. INPUT DRIFT between combos: candidate sha256 + prompt md sha256 + answers sha256 in every
   row; a reviewer verifying "identical input" compares one hash column.
5. INSUFFICIENT-as-shame: n < reps must NOT print as PASS or as an omitted row — the PREREQ is
   the point (PROTO-AI-12 §2). T1's mutation arm; report keeps INSUFFICIENT rows visible.
6. STAGE COLLAPSE: transport timeouts counted as "model failed to extract" would be a lie in the
   other direction — T2 keeps transport/guard/lowering/compiler/harness distinct; harness-stage
   failures invalidate the ROW, not the model.
7. exactOptionalPropertyTypes: `usage?`/`timings?` absent on thunderbeast rows — spread-omit
   idiom, never `timings: undefined` (server/tsconfig.json:13).
8. YAML-reload trap: criteria read FRESH per scoring call (T5); report generation never caches
   the module-level criteria; a test that mutates the criteria object in memory and calls it a
   threshold-is-data proof is lying — T1 edits the YAML on disk (temp copy) instead.
9. ONTOLOGY / CROSSWALK: `model-evaluation-criteria` is a plain `kind:` field on a registry doc,
   NOT a record kind; SchemaRegistry discovery (`*.schema.yaml`) skips it; Wave2NamingCrosswalk
   admission test UNTOUCHED-green is the wall — if the merged admission test demands an entry,
   STOP-and-report, don't self-serve. No rung strings (VENDOR/DERIVED/…) anywhere; no new verbs.
10. LATENCY Fudging: p50/p95 over n=3 is statistically thin — report says so verbatim; no
    percentile printed for n<2; usage-absent fields stay absent (ai/types.ts :113, :119 —
    llama timings llama-only, :92-94).
11. STACK TEMPTATION: the runner MUST NOT point at :3093 (live-smoke "never curls the running
    stack" header :4-5 is the contract) — in-process boots only; a reviewer greps for
    `3093|5174|localhost:3` in the runner.
12. CAMT VIOLATION: hard-coding W2-6/W2-7 field names from THIS draft into scoring code —
    stageOf reads codes; the fixture rows for T2 are regenerated against merged code names at
    claim (fixture adapts, spec doesn't).

## 9. DECLARED FINDINGS (composer, first-hand this session)

- F-W10-1: NO computable profile exists in any tracked or untracked config (§0.2 grep zero) —
  the worker's first data-edit is adding it (profile DATA, untracked, snapshot-to-report; the
  committed config.example.yaml stays untouched).
- F-W10-2: default `timeoutMs` 120_000 (types.ts :254, InferenceClient :53) is below honest
  computable latency for a 13.6K-prompt/minutes-decode run — the computable profile's data MUST
  raise it once, pre-registration-style, never after a failure.
- F-W10-3: non-streaming `complete()` uses the hard `timeoutMs` timer (:103-105); the 300s-idle
  streaming path (:191) is the alternative if merged W2-6 streams — the runner records whatever
  the merged pass does, never re-implements the call.
- F-W10-4: data repo has vendor-pdf/vendor-product dirs but NO vendor-protocol-candidate records
  — the harness mints its own candidate (AS-W26-CANDIDATE-PERSISTENCE carried forward).
- F-W10-5: the eval-criteria convention IS registry-style YAML under schema/registry (branch-axis-
  mapping header :1-14, rung-vocabulary 7d301c1f); `schema/data/eval/` does NOT exist — §2 follows
  the shipped convention, does not invent one.
- F-W10-6: config.yaml is excluded/untracked (ls-files 0) and `shadowRouter`/`warmup` optional
  blocks are LIVE in it (:114-123) — the runner's in-process boots read the file; the live stack
  shares that file; therefore boots are read-only and config mutation is copy-only (§4.2).

## 10. ACCEPTANCE CRITERIA (VERBATIM from the task block `verified by:`)

  Headless evidence item (no UI: nothing here renders — expected HEADLESS, no lane-stack
  restart, no browser gate; the only data surface is the new registry criteria doc, which is
  not a record kind and gets no ui.yaml):

  Headless: Reproducible report artifact names model/config + contract revision per run; BOTH
  combos exercised against Zymo; extraction failures vs lowering failures vs compiler failures
  distinguishable; weak results stay visible (no constraint relaxation, no literal fallback);
  no winner hardcoded anywhere.

Clause -> proof map: §5 (snapshot fields = clause 1; combos + identical candidate sha = clause 2;
stage taxonomy + T2 = clause 3; criteria-sha + no-selection + T1/T5 = clause 4; T4 + pure-verdict
= clause 5). Prompt budget: live LLM calls = (combos + variants) x reps, exactly one pass call
per run through the merged W2-6 pass (its own retry policy is the pass's), zero LLM judges ever
(PROTO-AI-12 :59-60 human-labelled posture; the criteria gates are deterministic metrics).

## 11. OPEN QUESTIONS FOR ORCHESTRATOR (each: recommendation + evidence)

OQ1 — COMBO SET, MINIMAL vs EXTENDED: the task says "plus any config variants worth testing".
Options: (a) ship exactly the two required combos (reps 3, ~1-2.5 h slot time, fastest evidence);
(b) add `qwen3.8-flash-OR` (exists in config.yaml :103-110, OpenRouter) as a third combo —
third-party endpoint, different tenancy, cheap; (c) add a thinking-level variant on thunderbeast
ONLY IF merged W2-6 exposes thinkingLevels on the semantic pass (thinkingLevels DATA precedent,
types.ts :273). CHECKED: config.yaml profile set (§0.2), W2-6 §0.3 plumbing. RECOMMENDATION: (a)
for the first matrix run; record (b)/(c) in the report's "variants worth testing next" section —
the criteria file's `variants: []` list is where they get added with zero code later. Smallest
ruling: "(a)" or "(b)" or "(a)+(c) if merged exposes it".
OQ2 — WHICH MODEL-KNOB THE HARNESS DRIVES WHEN: W2-6 ruled OQ3(a) (active profile), but W2-9 is
composing NOW demanding a /settings-distinct semantic model — the merged trunk may land EITHER,
or a revision. The runner (§4.2) is written to resolve the model exactly as the merged product
does; that needs a claim-time fact. CHECKED: W2-6 task-block ruling (task-list l2t1955 header),
W2-9 task text ("Expose the semantic-pass model selection through /settings", task-list :4937-
4938), activate route reality (§0.2). RECOMMENDATION: promotion adds one claim-time instruction:
"resolve the semantic-pass model knob as merged; drive it via config copy per combo; if a
dedicated block merged, the criteria combos name the knob's key as data". Smallest ruling: the
one sentence appended at promotion.
OQ3 — computable CONTEXT BUDGET vs 13.6K-tok prompt: the llama.cpp slot's --ctx-size on
computable is UNKNOWN (orch measured liveness, not ctx; the composer fired no probes per brief).
If ctx < prompt+output, every computable run fails at `extraction.transport` (server 400/context
error) — an HONEST, visible finding, but a 3-rep matrix of the same error is 30-60 min of slot
time for zero signal. CHECKED: no ctx telemetry in serving notes (PROTO-AI-12 box is appliance-2
:8900, different service); `GET /v1/models` or a health echo could reveal ctx but the composer
must not probe. RECOMMENDATION: worker's FIRST live action = ONE `/v1/models`-level health read
(or a 10-token probe, no candidate payload) recorded in the report preamble; if ctx is
insufficient, record the combo as `extraction.transport — serving_capacity_insufficient` with n=1,
skip remaining reps declaring INSUFFICIENT, and let the finding stand (never shrink the input —
truncating the candidate would BE constraint relaxation). Smallest ruling: "(a) ctx-probe-then-
skip-if-insufficient approved" or "(b) burn the full 3 reps regardless".

COMPOSED 2026-10-10 ~01:40 EDT by cl-spec-composer (l2t0130). Every §0 cite opened FIRST-HAND
this session at trunk 987bd34c; zero scout calls (all questions answered by direct reads); zero
endpoint probes fired from this session. CAMT register: W2-6 endpoint/service codes/prompt path,
W2-7 realization module/fixture, merged baselines (tsc/fail-SET/health counts) — merged trunk
wins over every shape assumed here; fixtures adapt at claim, the spec does not.


---

## PROMOTION NOTE (orch l2t0715, 2026-10-10 ~07:25 EDT) — W2-6-side CAMTs RESOLVED first-hand at trunk (post-W2-6 merge f19cfa95; docs chain over it; W2-7 merge pending). Merged trunk wins; this note REPLACES the §0.6 W2-6 guesses below as the binding shapes:

- N1 CONFIG KNOB (OQ2 ruling's "resolve AS MERGED"): `AIConfig.semanticPass?: SemanticPassConfig` MERGED at server/src/config/types.ts:189; SemanticPassConfig fields (all optional): baseUrl, model, apiKey, maxTokens, temperature, enableThinking, thinkingLevels, defaultThinkingLevel. Matrix combos are therefore DATA: each variant sets ai.semanticPass.{baseUrl,model} (apiKey only where required; never hardcode). No /settings UI needed for the matrix — drive it by config copy per combo, exactly as ruled.
- N2 THE ONE SEAM: resolveSemanticPassInference(ai) at server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts:65 — merges the block OVER resolveAiProfile(ai).inference; MISSING block => active profile. Do not add a second knob.
- N3 ENDPOINT (merged, W2-6): POST /extraction/vendor-candidates/:recordId/semantic-draft — param = the CAN-* candidate id; success {recordId:<XDR-semantic-*>, diagnostics}. Error codes MERGED set: SEMANTIC_PASS_NO_CANDIDATE / SEMANTIC_PASS_PARSE_FAILED / SEMANTIC_PASS_STEP_COVERAGE / SEMANTIC_PASS_TRUNCATED / SEMANTIC_PASS_DRAFT_WRITE_FAILED / SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL (map per §7: parse/guard -> extraction.*; 502 transport -> extraction.transport).
- N4 PROMPT DATA REAL: server/src/extract/prompts/semantic-family-draft.md (2834 B at f19cfa95) — sha256 it in the report preamble as the prompt-revision pin (§7 guessed path CONFIRMED).
- N5 XDR LANDING SHAPE (for anchor-support scoring): candidates[0]={target_kind:'protocol', draft:{kind:'protocol', recordId:`PRT-<CAN>-semantic`, title, steps, branch_axes?}}; source_artifact.id = candidate.source.documentId ?? candidateRecordId; ambiguity_spans_by_candidate carries the anchor spans. Drafts land UNVALIDATED at mint — the schema+lint wall fires at store write/promotion (scores must distinguish mint-time vs wall-time failures).
- N6 STILL OPEN (CAMT-at-claim, W2-7 side): realizeScientistIntent.ts module surface + realization fixture bytes + REALIZATION_* code names — W2-7 coder exited DONE at cf7d548a (adversarial gate c1 in flight at this note's time); resolve these against MERGED trunk at W2-10 claim, per the existing §11 register.

