# SPINE-6 report — RE-DISPATCH 2 (l2t0215): goldens shipped on the amended wording

Worker: cl-coder, lane 2, dispatch token l2t0215 (re-dispatch 2 after the architect
amendment `~/.hermes/cl/lanes/2/decisions/SPINE-6-ruling-amendment-l2t0140.md`,
VERDICT AMEND). Worktree: /mnt/vast/home/brad/git/wt/SPINE-6-lane2-l2t2230
(branch spine-6-lane2-l2t2230, base c74c5214 = SPINE-5 merge tip; predecessor tips
c24aa581, 2b6de2bb). Status: **DONE** — six goldens + manifest + repro script +
live smoke, all RED-first, manifest blessed ONCE after both amended legs landed,
mutation leg proved, live smoke run ONCE last. ZERO product edits.

Sequencing followed exactly as the amendment's "Sequencing" section directed:
(1) re-ran the three retained probes + a settled-wording probe FIRST, (2) goldens
RED-first, (3) manifest blessed ONCE after both amended legs landed, (4) mutation
leg, (5) live smoke last.

---

## §probe — mandated re-probe against the SETTLED amended wording (FIRST check)

Retained scripts re-run verbatim at this base (all exit 0):
- `server/tmp/l2t0040-reach-probe.mts`  -> /tmp/l2t0215-probe1-out.txt
- `server/tmp/l2t0040-reach-probe2.mts` -> /tmp/l2t0215-probe2-out.txt
- `server/tmp/l2t0040-reach-probe3.mts` -> /tmp/l2t0215-probe3-out.txt
Plus a NEW settled-wording probe asserting the amendment's exact replacement
clauses against the FINAL fixture shapes: `server/tmp/l2t0215-settled-probe.mts`
-> /tmp/l2t0215-settled-out.txt (run twice; eventId-normalized diff IDENTICAL —
the replay is deterministic apart from the Math.random eventIds).

### Settled F1 (amended fixture 1) — REACHABLE, every clause

```
===== F1 setup invariant: createLabwareLookup(label) => [] for BOTH seeded labels =====
lookup('source plate') => []  (empty: true)
lookup('destination plate') => []  (empty: true)

===== F1 amended fixture 1 (transfer+read, spine-bound labels) =====
status: 200
F1 CHECKS:
  status==200: true
  outcome=='complete': true
  no error key: true
  localMacro present: true
  ta keys: ["events","directives","gaps","labStateDelta","deckLayoutPlan","resourceManifest","validationReport","instrumentRunFiles","protocolIntent"]
  labwareAdditions absent: true
  resolvedRefs/resolvedLabwareRefs absent: true
  store recordIds (LAB-*) in body: []
  spy arithmetic: labwareListCalls(7) - materialListCalls(4) - N(3) = 0
```
Full 200 body dumped in /tmp/l2t0215-settled-out.txt (the golden pins it
deep-equal). Clause 6 honored: NO body-level recordId assertion — and the probe
confirms zero store recordIds reach the body anyway.

### Settled F5 (amended fixture 5, renamed labware-hint-lookup-failure) — REACHABLE, every clause

```
===== F5 amended fixture 5 (labware-hint-lookup-failure + material contrast arm) =====
status: 422
F5 CHECKS:
  status==422: true
  error==NEEDS_CLARIFICATION: true
  outcome==needs-clarification: true
  clarification label="source plate" reason="resolution-lookup-failed" actionLocation={"actionIndex":0,"action":"transfer","argument":"source"} candidatesKey=false
  clarification label="destination plate" reason="resolution-lookup-failed" actionLocation={"actionIndex":0,"action":"transfer","argument":"target"} candidatesKey=false
  clarification label="mystery reagent" reason="unknown-noun" actionLocation={"actionIndex":1,"action":"add_material","argument":"material"} candidatesKey=true
  ta keys: ["events","directives","gaps","protocolIntent"]
  events==[]: []  gaps==[]: []
  labwareAdditions absent: true
  deckLayoutPlan absent: true
  resourceManifest absent: true
  instrumentRunFiles absent: true
  labStateDelta absent: true
```
The contrast arm fires in ONE response exactly as the amendment rules: failing
hintEligible labware args => VERBATIM `resolution-lookup-failed` with NO mint
offer; the store-unresolvable MATERIAL noun => VERBATIM `unknown-noun` WITH the
`Create local term "mystery reagent"` candidates at confidence 0.05. Fixture 6
(P6) and controls P11-P13 re-confirmed reachable from the retained probe v1/v3
transcripts. NO amended assertion proved unreachable — no STOP condition.

## §10 first targeted check — claim gate holds

`grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts`:
```
81: * SPINE-4 (OQ1 ruling (a)): 'needs-clarification' is machine-distinguishable
87:export type CompileOutcome = 'complete' | 'gap' | 'error' | 'needs-clarification';
90: * Outcomes the CHATBOT pipeline can produce. 'needs-clarification' is the
97:export type ChatbotCompileOutcome = Exclude<CompileOutcome, 'needs-clarification'>;
```
Targeted suites at base (before any golden file existed):
`npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts
src/api/handlers/IntentCompileHandlers.test.ts src/api/handlers/IntentAcceptHandlers.test.ts
src/compiler/scientistIntent src/compiler/resolution src/compiler/protocolIntent`
=> **20 files / 188 tests passed, 0 failed** (matches the dispatch pin exactly).

## §1 name-and-read (ACTUAL merged shapes at c74c5214, re-read first-hand)

| # | File | ACTUAL (vs spec SPEC-SHAPE) |
|---|------|------|
| 1 | CompileContracts.ts :87 | `CompileOutcome = 'complete' \| 'gap' \| 'error' \| 'needs-clarification'` — spelling as SPEC-SHAPE |
| 2 | compileScientistIntent.ts :240-300 | bar result: `{terminalArtifacts:{events:[],directives:[],gaps:[]} (+protocolIntent), normalized, outcome:'needs-clarification', diagnostics, clarifications}`; success assembly reads resolve_roles/apply_directives/lab_state/plan_deck_layout/resolve_labware(labwareAdditions only)/compute_resources/validate/emit_instrument_run_files; **resolvedRefs/resolvedLabwareRefs NEVER assembled** (amendment-confirmed); `clarifications: nounsOutput?.clarifications ?? []` |
| 3 | resolveNounsPass.ts + scientist-intent-compile.yaml | pass id `resolve_nouns`, slot `resolve_nouns` {bindings, resolvedByLabel, clarifications, failures, blocked}; bar = one `unresolved_arguments` diagnostic + cascade barrier; `reconcileModelUnresolved` at :262 real |
| 4 | IntentCompileFromPromptHandlers.ts :111-141, :274-313 | 200 {outcome,terminalArtifacts,localMacro,axes} (+clarifications only on 'gap' with non-empty set); 422 {error:'NEEDS_CLARIFICATION',outcome,clarifications,localMacro,terminalArtifacts}; 502 {error:'MALFORMED_MODEL_OUTPUT',message}; 500 {error:'INTENT_COMPILE_FAILED',message}; ask arm 200 {needsAnswers,axes}. Matches SPINE-5 as merged — no golden-shape delta |
| 5 | IntentCompileFromPromptHandlers.test.ts (606 ln, 13 tests) | stubLlm tool-routing :122-166, mockStore/zeroWrites/send idioms — COPIED into replayKernel, file untouched |
| 6 | vocabulary.yaml (808 ln) / scientist-intent.schema.yaml (217 ln, unresolved :165) / scientist-intent-compile.yaml (17 passes incl. resolve_nouns) | sha256s pinned in MANIFEST (below) |

## Goldens shipped (names VERBATIM)

Home `server/src/compiler/scientistIntent/goldens/` (OQ2). Harness: REAL
`createIntentCompileFromPromptHandlers` in-process; ONLY the model client
(canned `emit_scientist_intent` tool-call replay) and the store are
harness-controlled; parse/vocabulary/pipeline/engine/store-backed spine run
REAL; zero module mocking anywhere (grep below).

| Test (it name) | File | Status | Key pins |
|---|---|---|---|
| `golden.intent-to-graph.transfer-read` | goldenIntentToGraph.test.ts | 200 'complete' | amended clauses 1-6: title+synonyms-only seeds with in-test `createLabwareLookup(label) => []` invariant for BOTH labels; FULL 200 body deep-equal (events with symbolic labwareIds, labStateDelta, deckLayoutPlan, resourceManifest, validationReport, instrumentRunFiles, protocolIntent); volumes byte-exact ({value:50,unit:"uL"}); spy arithmetic 7-4-3=0; NO body-level recordId assertion |
| `golden.intent-to-graph.labware-hint-regression` | goldenIntentToGraph.test.ts | 200 'complete' | deep-equal; unbound shared hint => exactly ONE searchLabwareByHint lookup (searchLabwareByHintCalls=1) |
| `golden.intent-to-clarification.ambiguous-material` | goldenIntentToClarification.test.ts | 422 | `ambiguous-noun` VERBATIM + both candidates {confidence:1} + actionLocation |
| `golden.intent-to-clarification.unknown-local-term` | goldenIntentToClarification.test.ts | 422 | `unknown-noun` + `Create local term "mystery flask"` 0.05 |
| `golden.intent-to-clarification.labware-hint-lookup-failure` | goldenIntentToClarification.test.ts | 422 | amended clauses 1-5 incl. the CONTRAST arm (see §probe); whole-422-body deep-equal |
| `golden.intent-to-clarification.model-unresolved-passthrough` | goldenIntentToClarification.test.ts | 422 | model `unresolved:` entry VERBATIM (no actionLocation, no candidates invented) |
| `golden.manifest.versions-current` | goldenIntentToGraph.test.ts | green | re-hashes every manifest-pinned file; drift fails LOUD |

§5 assertions per clarification case: 422 + NEEDS_CLARIFICATION + outcome
needs-clarification; clarifications deep-equal VERBATIM engine output; atomic
zero-artifact via Object.keys (`["directives","events","gaps","protocolIntent"]`,
events [] gaps [], labwareAdditions/deckLayoutPlan/resourceManifest/
instrumentRunFiles/labStateDelta ABSENT — never toEqual-with-undefined); write
spies THROW and `writeCalls == 0` in every test; outcome provably NOT success
via the shared `classifyCompileResponse`/`assertClarificationIsNotSuccess`
exported from replayKernel (the live smoke uses the SAME function).

## RED-first evidence

1. RED (no manifest blessed): both suites fail at load —
   `Error: ENOENT ... goldens/MANIFEST.yaml` (2 failed suites, 0 tests).
2. RED (kernel import-path fix mid-stream): first manifest-less run failed on
   `Failed to load url ../../api/handlers/...` — fixed the relative import,
   re-RED confirmed, then blessed.
3. GREEN after bless: `Test Files 2 passed (2) / Tests 7 passed (7)`.
4. One genuine harness bug caught by RED: `runGolden` omitted `writeCalls`
   (6 tests failed `expected undefined to be 0`), fixed, GREEN.

## §4.4 mutation leg (transcript)

Copy-protected: fixture + manifest shas saved before mutation.
- MUTATION 1 — fixture volumeUl 50 -> 55:
  `golden.intent-to-graph.transfer-read` RED: "fixture ... drifted from its
  blessed manifest hash (1d8b4b4f... !== a8556ba4...)"; `golden.manifest.versions-current`
  RED: "expected [ Array(1) ] to deeply equal []".
- MUTATION 2 (silent-rebless simulation) — manifest fixture-hash updated to the
  mutated file's hash so only the deep-equal could catch it:
  `golden.intent-to-graph.transfer-read` RED: "blessed vs replay diverge at char 147:
  blessed: ...\"volumeUl\":50... / replay: ...\"volumeUl\":55..." — the harness is
  NOT vacuous; the volume pin bites through the blessed record.
- RESTORE byte-clean: fixture back to a8556ba4..., manifest back to aff920c4...,
  suite GREEN 7/7.
- RECORD-tamper leg (bonus): edited the blessed record's volume 50->51 =>
  "golden record __records__/transfer-read.golden.json tampered (f301bf0a... !==
  f3253369...)" RED (2 failed), restored to f3253369... GREEN 7/7.

## MANIFEST (blessed ONCE, after both amended legs landed — CR-3 honored)

`goldens/MANIFEST.yaml` (sha256 aff920c48c9286457d1a4e739b1ff4eac3f5221428462502fc9ef3d999d8f94f):
baseCommit c74c5214; outcomeUnionMember `needs-clarification`; routeContract as
merged. treeState (repo-root relative):
```
schema/scientist-intent/scientist-intent-vocabulary.yaml 6c5e397c27ee247fc1a1532c0131f4f13f4213907e547a5e1a7d2ac6634bab36
schema/workflow/scientist-intent.schema.yaml            787eff7f9621bea850d1aab965a9aa28a989a9deae4f3b7e47b182f25360566e
schema/registry/compile-pipelines/scientist-intent-compile.yaml b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8
```
fixtures: transfer-read a8556ba4..., labware-hint-regression 17774b3a...,
ambiguous-material ddf5bcb0..., unknown-local-term 23bbac22...,
labware-hint-lookup-failure 107d25ab..., model-unresolved-passthrough 8c50399e...
records: transfer-read f3253369..., labware-hint-regression 11430dc4...,
ambiguous-material 47a15d73..., unknown-local-term 085526ac...,
labware-hint-lookup-failure 9b115f66..., model-unresolved-passthrough e300b984...
(full shas in the file). Manifest self-check transcript: the `sha256sum` of the
live tree matches every pinned hash (vocabulary triplet also measured:
schema e6bd314b..., lint e8d1f76e... — triplet files are NOT manifest-pinned;
the manifest pins the three spec-named rule files; the triplet's data file IS
pinned and matches).

## §8 commands (final transcripts)

- `npx vitest run src/compiler/scientistIntent/goldens` => **7 passed (7), 0 files failed** (PRIMARY suite).
- `npx tsx scripts/golden-replay.ts` => **32/32 checks passed, EXIT=0**, offline (no network; canned adapter + fixture store only).
- Combined targeted suites (route x3 + scientistIntent + resolution + protocolIntent) AFTER goldens: **22 files / 195 tests passed** (20/188 baseline + 2 new golden files / 7 new tests; ZERO new failing files).
- Server tsc: 26 error-lines / 6 files; `/tmp/l2t0215-tsc-server-after.txt` comm-3 vs `/tmp/l2t2230-tsc-server.txt` (sha 924c18bd...) **EMPTY — SET identity holds**. (My new files introduced zero tsc errors: an intermediate 29-line capture showed 3 errors in replayKernel.ts — all three fixed before final capture.)
- `npx vitest run src/ai` => 10 failed files / 21 failed tests; normalized comm-3 vs `/tmp/l2t2230-aifail-files.txt` **EMPTY** (carried 10/21, never demanded green).
- Compiler-scope `npx vitest run src/compiler` => 17 failing files; normalized comm-3 vs `/tmp/l2t2230-compiler-failfiles.txt` **EMPTY** (17-file SET identity).
- App: `npm run typecheck -w app` => 34 error-lines; comm-3 vs `/tmp/l2t2230-tsc-app.txt` **EMPTY** (47-out/24-file carried pin never exercised); `git diff --name-only c74c5214..HEAD -- app/` **EMPTY**.
- Ownership gate: `git diff --name-only c74c5214..HEAD | grep -v -E '^server/src/compiler/scientistIntent/goldens/|^server/scripts/(golden-replay|live-smoke)\.ts$|^\.hermes/plans/'` => **EMPTY** (additions-only; zero edits to any existing file; `git status --porcelain -uall | grep -v '^??'` was 0 before this commit).

Live-isolation / tier / mocking greps (verbatim results):
```
grep -rn 'live-smoke\|liveSmoke' server/src --include='*.test.ts'   => EMPTY (exit 1)
grep -rniE '(qwen|lfm|thunderbeast|2\.6b|3B|350M|small.?model)' server/src/compiler/scientistIntent/goldens server/scripts/golden-replay.ts
  => ONLY 3 hex-collision matches inside MANIFEST.yaml sha256 pins ("3b" substrings at :10/:11/:15/:16/:21) — no model/profile name anywhere; the same grep over goldens *.ts/*.yaml/*.json excluding MANIFEST => EMPTY
grep -rniE '(qwen|lfm|thunderbeast|2\.6b|3B|350M|small.?model)' server/scripts/live-smoke.ts => EMPTY (exit 1; profile resolution is config-driven only)
grep -rn 'vi\.mock' server/src/compiler/scientistIntent/goldens => EMPTY (exit 1)
```

## §6 live smoke (run ONCE, last, after goldens green)

`cd <wt>/server && npx tsx scripts/live-smoke.ts` => **exit 0** (OQ4(a): exit 0 on
any completed call; verdict lives in the artifact classification).
Artifact: `server/.artifacts/live-smoke/2026-10-09T06-54-21-453Z/`
(artifact.json + raw-output.json; raw-output.json sha256
a3062a4fb4d21bffe180dab289cb6e812491ed318d8c69446ed8191b41381d72). Untracked
(deliberately NOT gitignored — .gitignore edits are out of ownership; the
directory is simply never added).

Artifact classification lines:
```
profile: qwen3.8-thunderbeast   (resolved AT RUN TIME from the lane config's activeProfile — no name literal in the script)
model:   qwen3.8-flash-next     baseUrlHost: thunderbeast:8080
httpStatus: 422  outcome: needs-clarification  error: NEEDS_CLARIFICATION
classification: NOT_SUCCESS_CLARIFICATION
```
Prompt (verbatim, free text per OQ5(a), independent of the golden fixture body):
"A scientist protocol in plain words: Take 50 microliters out of the source
plate and move it into the destination plate. After the transfer, read the
source plate on the plate reader at 450 nm absorbance."

RAW scientist-intent emission (verbatim, fence-free tool-call args):
```
{"intentId": "transfer-and-read-source", "actions": [{"transfer": {"source": "source plate", "target": "destination plate", "volumeUl": 50}}, {"read": {"source": "source plate", "mode": "absorbance", "wavelength": "450 nm"}}], "unresolved": [{"label": "source plate", "reason": "Specific labware or record ID for the source plate was not provided."}, {"label": "destination plate", "reason": "Specific labware or record ID for the destination plate was not provided."}]}
```
Honest reading: the emission PARSED (verb-keyed map shape is the lifter's
plain-text emission arm — extraction succeeded, no 502), but the real lane
store (776 records) binds neither 'source plate' nor 'destination plate', so
the bar fired: 422 => NOT_SUCCESS_CLARIFICATION. Clarification is NOT success;
malformed output would have been EXTRACTION_FAILURE via the SAME shared
classifier. One handler call, one model interaction chain; the real store's
inventory fed the prompt grounding (that is the live leg's point). No
tier/family/size claim anywhere in script, artifact, or this report.

## Baselines & drift

All §9 SETs re-verified SET-identical on this base both sides of the commit
(tsc 26/6 sha 924c18bd; targeted 20/188 -> 22/195 with only the two new golden
files added; compiler 17-file SET; src/ai 10/21; app diff EMPTY). No pinned
rule file moved mid-item (manifest hashes match the live tree at bless and at
final capture).

## Notes / deliberate behavior observations

- Normalizer scope (spec §4.4 "only incidental ids/timestamps"): drops
  top-level durationMs, ISO strings under *At/*Timestamp keys, and eventId
  values matching the shipped random shape `evt-<verb>-<8 base36>`
  (BiologyVerbExpander.ts:74 Math.random). Everything load-bearing — volumes,
  wells/addresses, deck slots, symbolic labware identities, pinned-lookup
  recordIds, protocolIntent, provenance tags — is asserted; the mutation leg
  (volume 50->55 RED through BOTH the manifest pin and the deep-equal) is the
  vacuity guard.
- Fixture 2 spy pin records the MERGED post-SPINE-4 behavior (spec §4.2's
  SPEC-SHAPE "bound labels bypass the search" applies to engine-BOUND labels —
  fixture 1's spine-bound labels, arithmetic 0; *Hint companions are evidence
  only, so fixture 2's unbound hint DOES search, exactly once).
- Amendment's R-1/R-2 rehomed items untouched (annotate-only; no product edit).
- server/.artifacts/ left untracked, never added; no vitest test reads it.

SPINE-6 DONE
