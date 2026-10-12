# W2-10-MODEL-EVIDENCE — RUN REPORT (lane 2, run item wip-l2t1035)

STATUS: COMPLETE — both required combos exercised, 3 completed reps each, weak
results preserved, no winner hardcoded. The final matrix verdicts are FAILs on
the criteria gates for BOTH combos (real findings, preserved verbatim below).
Scoring is deterministic (`pure(rows, criteria)` in the harness); no LLM judges.

## 0. PREAMBLE — pins, probes, liveness

Matrix-wide pins (IDENTICAL on every counted row — the no-relaxation / identical-
input proof; verified: exactly ONE unique (criteria, prompt, candidate, answers,
git-HEAD) tuple across every one of the 16 recorded rows, invalidated rows
included) [ORCH amendment l2t0115, adv-D2]:

| pin | value |
|---|---|
| git HEAD (worktree W2-10-lane2-l2t1035) | a9d326452cc3e91a58e92d90156000d164d43ae3 |
| criteria sha256 | 851e2a2d5c9bc40062db5a4f8b47a2308564b23ece4c71c850e872e1acafe23d (.hermes/plans/semantic-pass-matrix.criteria.yaml — ORCH AMENDMENT l2t0115 (adv-D1, corrected c2-F4): pre-registration is CONTENT-PINNED, not commit-pinned. The file is UNTRACKED (never committed in either repo — the earlier 'committed BEFORE the first live run' wording was FALSE) and its mtime postdates the first artifact dir. The operative proof, verified row-by-row by the orchestrator at 01:50 EDT: every rows.jsonl record across all 6 launches embeds field `criteriaSha` = this exact value (grep -L sweep: zero files missing it), so the threshold content never moved between the first live call and scoring.) |
| prompt md sha256 (semantic-family-draft.md, N4) | 26b2427898add58d1b3cca9314c86819f31bc8ebf7ebbc60acacbf01020d926a |
| candidate sha256 (frozen JSON, 53,987 B) | c34f3d414872f6457ff89ede108932d0a673c76b8d49c073aec9ae0c45c2ad80 |
| realization-answers sha256 (frozen W2-7 inline fixture rows, N6d) | 9de3bbcbb71a07e0cad5306e1d3d11268cfb51b77e525a52d29eb96fb3d6165d |
| contract rev: wave2-verb-adjudication.yaml | ba816f369cb2bc03d2e1365e87ce02c749c5749ff6cc9cb9afcb9f58d35b1c32 |
| contract rev: scientist-intent.schema.yaml | bb5cc4d00fe4c55ddc0f21598e1dbe12db5cdc5e8fa6dba8d562464227814178 |
| contract rev: scientist-intent-compile.yaml | b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8 |
| contract rev: goldens/MANIFEST.yaml (merged path server/src/compiler/scientistIntent/goldens/) | 873e13432ef6dc3e32e22ba47e69a7a66c0737e39e67fccb8ba63851fbca39a3 |
| harness sha256 | 92c3d30d080ee4927e2248fffd37920b98fff21d39e9351aa5747a37dc0312db (.hermes/plans/w210-run.mts) |

Endpoint liveness + ctx probes (OQ3(a): first live computable action was the
tiny ~10-token probe, no candidate payload):
- thunderbeast host: GET /models 200; 10-token probe 200 in ~4-9s (probe bodies
  archived, e.g. artifacts .../2026-10-11T00-27-57-976Z-thunder-q38/ctx-probe.json).
  /props 404 (vLLM). max_model_len 262144 (from /v1/models) >> the 16,636-token prompt — ctx is NOT the constraint here.
- computable host (SINGLE shared llama.cpp slot): GET /models 200; /props 200
  (n_ctx not exposed by that build); 10-token probe 200 in ~4-8s
  (artifacts .../2026-10-11T00-57-08-927Z-computable-q4b/ctx-probe.json). The
  13.6K-prompt prefill ran at 547 tok/s — ctx sufficient for the input; OQ3 skip
  was NOT needed on the successful runs.
- The lane stack :3093 has NO ai.semanticPass block — its SEMANTIC_PASS_UNAVAILABLE
  probe is recorded in the promotion record (config precondition, not a model
  finding; harness boots in-process with its own config copy per combo, never :3093).

TEST DATA declared (data repo /home/brad/.computable-lab/worktrees/main, additive
minting only, store-owned git commits; NO existing record modified):
- CAN-w210-zymo__zymobiomics-96-magbead-dna-kit.yaml (frozen candidate; data
  commit 90e4164 "W2-10 run-item: TEST DATA — frozen Zymo full-candidate matrix input").
- USR-W210-RUNNER (identity seed; commit ad9d7dd).
- 9 landed XDR-semantic-* drafts from the passes (commit messages
  "W2-6 semantic family draft from candidate CAN-w210-zymo").
Mint adapter note: the real decoded candidate minus extractor-only
`concentration` fields (the E2E-recorded closed-schema mint adapter,
Wave2SemanticPassE2E.test.ts mintableCandidatePayload) — applied IDENTICALLY for
both combos; the candidate is then serialized ONCE and hashed (sha above rides
every row).

Method (merged shapes, per the promotion record):
- Combos are pure config DATA: each boot's config copy sets
  ai.semanticPass.{baseUrl,model} (server/src/config/types.ts:189), consumed by
  the ONE seam resolveSemanticPassInference (SemanticFamilyPass.ts:65). Zero code
  edits between runs; zero model/host literals in the harness (endpoint urls live
  in the untracked .hermes/plans/w210-endpoints.local.yaml, sha256
  d0b7d070824a97517afaef1ddb0619432d0cc98762ed649aef64908a5330d20d; grep wall:
  `grep -cE "thunderbeast:8080|100\.111\.141" w210-run.mts` = 0).
- Pass invocation: POST /api/extraction/vendor-candidates/CAN-w210-zymo/semantic-draft
  via app.inject on an in-process boot (extractionE2E / Wave2SemanticPassE2E
  pattern), run FROM the server package dir (policy cwd-anchor, N6b).
- Downstream W2-7 leg per landed family: realizeAndCompile
  (realizeScientistIntent.ts:697) with the FROZEN answers (see assumption
  AS-LANE2-W210-2); REALIZATION_* names reported verbatim (merged 10-code set, N6c).
- Rep commands (reproducibility):
    cd <wt>/server && npx tsx ../.hermes/plans/w210-run.mts --combo=thunder-q38 --reps=3
    cd <wt>/server && npx tsx ../.hermes/plans/w210-run.mts --combo=computable-q4b --reps=3 --skip-on-transport-failure
  (the skip flag is a slot-courtesy control flag, not a scoring gate).

## 1. MATRIX TABLE — every rep of every combo, newest-last, nothing deleted

Stage taxonomy per criteria; `n-a (upstream)` where extraction failed — never a
fake failure, never a skip. Rows 1-6 are INVALIDATED harness rows (harness bugs,
not model findings — kept visible per §4.5): A = missing __dirname shim
(F-LANE2-W210-A), B = node built-in fetch 300s headers cap (F-LANE2-W210-B).

| # | combo | rep | stage | code | wall | draft steps | axes | lint err | anchors res/emit | schema pass (XDR/proto) | downstream | tokens in/out | artifacts dir (under .hermes/plans/artifacts/semantic-matrix/) |
|---|-------|-----|-------|------|------|-------------|------|----------|------------------|--------------------------|------------|---------------|----------------|
| 1 | thunder-q38 | 1 | harness (A) | route 500 __dirname | 0.2s | n-a | n-a | n-a | n-a | n-a | n-a (upstream) | none | 2026-10-10T19-58-36-070Z-thunder-q38 |
| 2 | thunder-q38 | 2 | harness (A) | route 500 __dirname | 0.0s | n-a | n-a | n-a | n-a | n-a | n-a | none | same |
| 3 | thunder-q38 | 3 | harness (A) | route 500 __dirname | 0.0s | n-a | n-a | n-a | n-a | n-a | n-a | none | same |
| 4 | thunder-q38 | 1 | extraction.transport (B) | INFERENCE_TRANSPORT | 900s wall | n-a | n-a | n-a | n-a | n-a | n-a | none (fetch cap ~300s) | 2026-10-10T20-15-17-479Z-thunder-q38 |
| 5 | thunder-q38 | 2 | extraction.transport (B) | INFERENCE_TRANSPORT | 900s wall | n-a | n-a | n-a | n-a | n-a | n-a | none | same |
| 6 | thunder-q38 | 3 | extraction.transport (B) | INFERENCE_TRANSPORT | 900s wall | n-a | n-a | n-a | n-a | n-a | n-a | none | same |
| 7 | computable-q4b | 1 | extraction.transport (B) | INFERENCE_TRANSPORT | 900s wall | n-a | n-a | n-a | n-a | n-a | n-a | none (fetch cap ~300s) | 2026-10-10T21-27-33-046Z-computable-q4b |
| — | (computable reps 2-3 of THIS launch skipped per slot discipline + OQ3-analogous no-hammering; INSUFFICIENT for that launch — superseded by rows 11-13) | | | | | | | | | | | | |
| 8 | thunder-q38 | 1 | lowering | REALIZATION_VERB_UNADJUDICATED x7 [ORCH amendment l2t0115, c2-F2: raw failures.length=7] | 771s | 17 | 1 | 2 | not measured (pre-measurement-fix; F-LANE2-W210-C) [ORCH amendment l2t0115, adv-D4] | true / false | REALIZATION_VERB_UNADJUDICATED | 16636 / 4997 (reason 2278) | 2026-10-10T23-34-30-570Z-thunder-q38 |
| 9 | thunder-q38 | 2 | lowering | REALIZATION_VERB_UNADJUDICATED x11 | 855s | 17 | 1 | 2 | not measured (pre-measurement-fix; C) [ORCH amendment l2t0115, adv-D4] | true / false | REALIZATION_VERB_UNADJUDICATED | 16636 / 6615 (reason 4063) | same |
| 10 | thunder-q38 | 3 | lowering | REALIZATION_VERB_UNADJUDICATED x7 [ORCH amendment l2t0115, c2-F2: raw failures.length=7] | 224s | 17 | 1 | 2 | not measured (pre-measurement-fix; C) [ORCH amendment l2t0115, adv-D4] | true / false | REALIZATION_VERB_UNADJUDICATED | 16636 / 4570 (reason 1712) | same |
| 11 | thunder-q38 | 1 | lowering | REALIZATION_VERB_UNADJUDICATED x10 | 263s | 17 | 1 | 2 | 17/17 ratio 1.0 | true / false | REALIZATION_VERB_UNADJUDICATED | 16636 / 4937 (reason 2524) | 2026-10-11T00-27-57-976Z-thunder-q38 |
| 12 | thunder-q38 | 2 | lowering | REALIZATION_VERB_UNADJUDICATED x11 | 309s | 17 | 1 | 2 | 17/17 ratio 1.0 | true / false | REALIZATION_VERB_UNADJUDICATED | 16636 / 5668 (reason 2402) | same |
| 13 | thunder-q38 | 3 | lowering | REALIZATION_VERB_UNADJUDICATED x10 | 472s | 17 | 1 | 2 | 17/17 ratio 1.0 | true / false | REALIZATION_VERB_UNADJUDICATED | 16636 / 5718 (reason 3356) | same |
| 14 | computable-q4b | 1 | compiler | COMPILE_THROW | 349s | 17 | 1 | 2 | 17/17 ratio 1.0 | true / false | throw: "object is not iterable" (attribution below) | 16636 / 12536; llama timings: prefill 547 tok/s, decode 39.4 tok/s | 2026-10-11T00-57-08-927Z-computable-q4b |
| 15 | computable-q4b | 2 | compiler | COMPILE_THROW | 309s | 17 | 1 | 2 | 17/17 ratio 1.0 | true / false | same throw | 16636 / 12536 (prompt cache 16632) | same |
| 16 | computable-q4b | 3 | compiler | COMPILE_THROW | 338s | 17 | 1 | 2 | 17/17 ratio 1.0 | true / false | same throw | 16636 / 12536 (prompt cache 16632) | same |

Queue caveat (standing, every shared-slot row): the computable llama.cpp slot is
shared fleet-wide (cl-scout / cl-browser-reviewer); every computable latency cell
carries cross-tenant-interference noise; thunderbeast vLLM likewise showed
2 running + 3 waiting requests during the window. Latency is evidence, not a gate.

## 2. VERDICTS (module output quoted verbatim — the ONLY pass/fail computation)

FINAL SCORED LAUNCHES (3 completed reps each — criteria verdict_rule applied):

    thunder-q38:    verdict FAIL — failing_metrics [schema_pass_rate, lint_errors, downstream_compile]
                    metrics: schema_pass_rate 0.0, lint_errors_max 2, branch_retention_min 17 (PASS),
                             anchor_supported_ratio_min 1.0 (PASS), downstream_compile_all_complete false,
                             latency p50 309230ms p95 471551ms (n=3 — statistically thin, stated verbatim)
    computable-q4b: verdict FAIL — failing_metrics [schema_pass_rate, lint_errors, downstream_compile]
                    metrics: schema_pass_rate 0.0, lint_errors_max 2, branch_retention_min 17 (PASS),
                             anchor_supported_ratio_min 1.0 (PASS), downstream_compile_all_complete false,
                             latency p50 337903ms p95 349379ms (n=3 — thin)

Earlier launches scored INSUFFICIENT (harness-invalidated rows / skip) and stay
visible above; nothing was re-run to "improve" a result. The identical-input
launches (rows 11-16) are the evidence rows. NO winner is declared: both combos
failed the same gates for a SHARED schema reason plus combo-specific downstream
reasons; the choice stays a human setting.

## 3. FAILURE TAXONOMY (extraction vs lowering vs compiler — the acceptance clause)

EXTRACTION (merged W2-6 pass): 0 failures in the evidence rows. Every attempt
landed an XDR (schema pass true at mint AND harness-side Ajv on the XDR payload),
17/17 step coverage, axes bound 1, ZERO anchor drops (both models copied every
anchor correctly; ratio 1.0 with 0 guard spans on rows 11-16). The transport
failures in rows 4-7 were HARNESS bugs (F-LANE2-W210-B below), attributed
extraction.transport at capture time per the data mapping and then honestly
INVALIDATED as harness rows.

SCHEMA WALL (extraction.schema-equivalent, wall-time vs mint-time distinction,
per the promotion-record N5 note): the XDR passes the schema at store write;
the EMBEDDED protocol draft payload FAILS the merged protocol schema at
wall-time (proto pass false, 6/6 evidence rows). Root cause: schema/workflow/
protocol.schema.yaml ProtocolStep allOf/oneOf branches — the kind-tagged
literal-step branches (StepAddMaterial/Transfer/Mix/Wash/...) demand concrete
execution fields (volume_uL, target, wells, material, cycles, duration_min...),
while the IntentStep branch carries `required: [intent]` and `kind` const None —
a semantic-family draft step that declares a `kind` (the prompt's own rule 1:
kind is one of add_material/transfer/...) can satisfy NO oneOf branch. This is a
PRODUCT CONTRACT GAP at the W2-6 -> W2-3 seam, IDENTICAL for both combos — the
strongest shared finding of this matrix.

LINT (wall-time): identical 2 error findings in all 6 evidence rows, both caused
by the same shape deviation: intent.provenance emitted as a single ref OBJECT
while the merged IntentStepPayload schema and the lint rules
(prov-derived-conclusions-anchored, prov-derived-never-vendor-carrier) read it as
an ARRAY — a present-but-unreadable array is treated as unanchored/non-CAN
carrier.

LOWERING (W2-7, REALIZATION_* verbatim): thunder-q38 —
REALIZATION_VERB_UNADJUDICATED x10-11 per rep, 3/3 reps. The model names what
the steps MEAN (lyse, bind, separate, seal, dry, centrifuge...) — per the prompt's
own rule 2 (verbs like lyse/bind/elute are explicitly suggested by the prompt);
the merged wave2-verb-adjudication.yaml same_operation table carries only 3
mappings and the scientist-intent vocabulary has no verb for those canonicals,
so the spine refuses silent folding (correct, loud, by-design). This is the
semantic-pass x realization-spine COVERAGE GAP: the prompt invites a vocabulary
the adjudication table does not cover.

COMPILER: computable-q4b — the landed draft made it FURTHER than thunder's on
lowering (see below) and threw before compile completed:
`TypeError: object is not iterable` thrown at realizeScientistIntent.ts:503
(`for (const need of step.intent?.materialNeeds ?? [])`). Root cause isolated
(read-only repro, .hermes/plans/w210-repro-downstream.mts against landed
XDR-semantic-e86a75b9595b87a2): the model emitted `materialNeeds` as a single
OBJECT {role: lysis_reagent} instead of the ARRAY the schema declares — the
lowerer's L4 assumes iterability and CRASHES (uncaught, not a REALIZATION_* code).
Attribution discipline: model deviation (wrong shape) + product robustness gap
(the lowerer fails loud only for declared codes; a non-array payload is an
uncaught throw, and the schema wall that should have caught the shape never sees
it because — same contract gap — the draft bypasses protocol-schema validation).
3/3 reps identical. NOT counted as a model-only failure: recorded at the
compiler stage with the exact throw name, per §4.4.

WHAT THE 4B DID DIFFERENTLY (findings prose, preserved): the 4B answered with
far longer output (12,536 completion tokens vs 4.6-6.6K; the model pads with
reasoning and repeats — byte-identical usage counts across its 3 reps suggest
deterministic decoding, temp unset), reached lowering farther (only ONE step
carried the materialNeeds object shape; the rest lowered cleanly until the
throw), and produced ZERO schema-valid protocol steps for the same shared
contract gap as its bigger sibling. Neither model's draft is promotable at this
base — the wall is the PRODUCT, not (only) the models.

## 4. DECLARED FINDINGS

- F-LANE2-W210-A (product bug, run-blocking-under-tsx): merged
  server/src/extract/prompts/loader.ts (:98, :127) uses a BARE `__dirname` in a
  "type": "module" package. Works under vitest (vite injects it), throws
  ReferenceError under plain `npx tsx` -> the semantic-draft route 500s. Harness
  shimmed globalThis.__dirname (no product edit). Affects ANY tsx consumer of
  loadExtractionPrompt. (3 other bare-__dirname sites exist —
  seedModels.ts, extractorLibrary.ts, runChatbotCompile.ts — NOT on the harness path.)
- F-LANE2-W210-B (harness/environment): node's BUILT-IN fetch caps response
  headers at 300s (undici HeadersTimeoutError -> TypeError 'fetch failed'),
  proven in isolation by .hermes/plans/w210-undici-probe.mts (fails at
  300,769 ms vs a local server that merely delays headers; zero LLM) and FIXED
  by .hermes/plans/w210-undici-fix-check.mts (same delay passes at 330s when
  routing through node_modules undici's fetch + a dispatcher at the
  PRE-REGISTERED 900,000 ms ceiling — identical for both combos, not a
  post-result knob edit). Every non-streaming semantic pass needing >300s dies
  under plain fetch on ANY host — relevant to the whole fleet's tsx tooling, not
  just this matrix.
- F-LANE2-W210-C (measurement note): intent.provenance array-vs-object —
  counted either way (uniform, both combos); see taxonomy.
- F-LANE2-W210-D (contract gap, both combos): landed semantic-family draft
  steps cannot validate under the merged protocol.schema.yaml oneOf (kind-
  tagged steps fall between the literal-step and IntentStep branches). The
  semantic pass lands UNVALIDATED (N5) and the wall rejects at review time.
  This is the single highest-leverage fix for the wave: until it lands,
  schema_pass_rate can never reach 1.00 for ANY model.
- F-LANE2-W210-E (lint/schema robustness): provenance-as-object and
  materialNeeds-as-object pass the pass (guard only array-validates; store wall
  never validates the embedded draft) and then surface as 2 lint ERRORs / an
  uncaught lowerer TypeError. Suggests: the guard should normalize-or-flag
  non-array provenance, and realizeScientistIntent.ts:503 should fail with a
  declared REALIZATION_* code on a non-iterable materialNeeds.
- F-LANE2-W210-F (verb coverage): the prompt's suggested canonicals
  (lyse/bind/separate/seal/dry/...) vs the 3-entry same_operation table =
  REALIZATION_VERB_UNADJUDICATED for thunder 3/3. Either the adjudication DATA
  gains the mappings or the prompt DATA names the supported set — a re-
  registration decision for the architect, NOT a threshold edit.

## 5. VARIANTS WORTH TESTING NEXT (added as DATA to criteria `variants: []`, zero code)

1. qwen3.8-flash-OR as combo id flash-or (OpenRouter endpoint as a third host
   DATA entry; criteria OQ1(b) — cheaper tenancy, no shared slot).
2. thunder thinking-level variants ONCE W2-9's /settings exposes thinkingLevels
   on the semantic pass (criteria OQ1(c)): {id: thunder-q38-think,
   profile: <name>, thinkingLevel: high} — the seam already merges
   thinkingLevels/defaultThinkingLevel through ai.semanticPass.
3. Re-run THIS matrix unchanged after F-LANE2-W210-D/E/F are fixed — the rows
   above are the pre-fix baseline (criteria sha stays 851e2a2d... only if the
   thresholds are untouched; that is the re-registration discipline).

## 6. ASSUMPTIONS BLOCK (evidence-debt rule — values no source provided)

- AS-LANE2-W210-1: shared_request_data.max_tokens = 16384 and timeout_ms =
  900000 in the criteria file are values I declared (pre-registration, identical
  for both combos, before any live call). No source specified a max_tokens for
  the semantic pass; the profile default 65536 was rejected as needlessly large,
  4096 as below the 4B's observed 12.5K answer. NO truncation was ever applied;
  zero SEMANTIC_PASS_TRUNCATED fired.
- AS-LANE2-W210-2: the "frozen answers" (N6d) are the inline fixture bytes of
  realizationGolden.test.ts (@ a9d32645) with branch_resolution MECHANICALLY
  keyed to the landed family's deterministic axis ids (axes are model-independent
  — bound server-side by bindFamilyAxes from the candidate's own branch
  sentences; the golden's hand-typed axis ids 'branch-axis-step-1'/'axis-step-2-
  variant' belong to its own 4-step toy candidate, not the Zymo family, so
  copying them verbatim would REALIZATION_BRANCH_UNRESOLVED every row by
  construction). The answer VALUES (branch choice 'robot' for the scale-binding
  carrier + sample_count 96-wells Quantity + the 4 setup-row store rows) are the
  golden's verbatim; only the axis-id KEYS are derived from each family. Held
  constant across both combos (answers sha identical); only the model varies.
  The first surviving branchId choice is likewise mechanical (the golden answers
  its own chosen branch; the matrix's point is compile completion, not a branch
  preference).
- AS-LANE2-W210-3: the 300s fetch-cap diagnosis (rows 4-7 re-attribution) rests
  on the two local probes cited in F-LANE2-W210-B, not on server logs (none
  accessible; serving processes untouched).
- AS-LANE2-W210-4: 'computable' host row "prompt cache 16632/16636" implies
  llama.cpp KV-slot reuse across reps on the single slot — cross-tenant cache
  sharing with scout traffic cannot be excluded; disclosed, not cleaned.
- AS-LANE2-W210-5: criteria combos list model+host names as DATA identities;
  the criteria file itself carries no urls (endpoints live in the untracked
  local DATA file). The lane-exclude'd trunk files copied into the worktree
  (70 missing untracked sources incl. server/src/lifecycle/BypassAudit.ts + the
  server/schema -> ../schema symlink) were byte-identical from
  /mnt/vast/home/brad/git/cl-integration-2 (md5 spot-check) — checkout repair,
  not product edits (all git-ignored; zero tracked diff verified below).

## 7. CONSUMPTION-ONLY + NO-STACK PROOF

- `git -c core.fileMode=false diff --stat HEAD` — EMPTY (zero tracked changes;
  server/**, schema/**, goldens/, config.example.yaml untouched).
- Untracked additions: only .hermes/plans artifacts (+ the git-ignored checkout
  repair files listed in AS-LANE2-W210-5, node_modules/schema symlinks; plus
  run-produced scratch config copies server/tmp/w210/config-thunder-q38.yaml and
  config-computable-q4b.yaml — gitignored, per-combo, sha recorded in-row
  [ORCH amendment l2t0115, adv-D3]).
- No lane stack touched (:3093/:5193/:3001/:5174 never targeted — grep wall on
  the harness passes: no 3093|5174|localhost:3); no serving process
  killed/restarted/niced; the data repo's own store/git flow made its TEST DATA
  commits (embedded-git adapter behaviour, the sanctioned mint path).
- Dry-run gate (zero live calls) green before and after every harness change
  (rows-scored artifacts 2026-10-11T02-16-15-359Z / 02-33-59-338Z).
- Data repo pre-existing dirty state (5 M-files from other lanes' ingestion)
  untouched; my commits are store-originated only.

## 8. APPENDIX — chronology + artifacts

Artifact root: .hermes/plans/artifacts/semantic-matrix/<UTC-stamp>-<combo>/ —
per-run raw-response JSON (http status, fetch capture: url/bytes/finish_reason/
usage/timings/error), rows.jsonl (full telemetry rows), per-combo config copy
(sha in-row), ctx-probe.json, rows-scored.json, dry-run-score.json.
Landed TEST DATA XDR ids (data repo, newest-last): thunder 5f579a371052f6a4 /
7c52bbb5295db92b / 78f28259d92f32de; computable e86a75b9595b87a2 /
2da39578e4719ef9 / f80372dc1da8aac5 (plus 4a89e9f278b02311 /
8c03b9058a16008c / 6052ecefdb3a7d34 from the pre-measurement-fix launch and 9
from earlier launches — all preserved).
Harness companions (same dir): w210-run.mts (matrix), w210-probe.mts (input
freeze + axis derivation), w210-undici-probe.mts / w210-undici-fix-check.mts
(transport-cap isolation, zero LLM), w210-repro-downstream.mts (compiler-throw
attribution, read-only), w210-endpoints.local.yaml (endpoint DATA, untracked),
semantic-pass-matrix.criteria.yaml (pre-registered criteria; UNTRACKED —
pinned by identical criteriaSha across all 16 rows; see §0 amendment [ORCH
amendment l2t0115, c2-F1]).
Budget: dispatch ~10:45 EDT 2026-10-10; evidence complete ~22:15 EDT same day
(~11.5 h wall incl. two transport-bug discovery/diagnosis cycles — within the
4-5 h nominal worker budget only because the transport cap doubled every live
attempt's wall cost until diagnosed).
