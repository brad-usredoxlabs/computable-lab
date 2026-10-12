# SPINE-6 — End-to-end goldens + one live current-model smoke, honestly separated
Spec DRAFT (lane 2, composer l2t1755) — 2026-10-08 17:55 EDT. Draft only; orchestrator reviews and
promotes. Worker: cl-coder. Server-only, headless — NO UI, NO browser gate. Every file:line below
was re-read FIRST-HAND by the composer in the lane trunk checkout
/mnt/vast/home/brad/git/cl-integration-2 at branch cl/integration-2, code tip 0873c47b / docs tip
ec865219 (verified via `git -c core.fileMode=false log --oneline -6`: tip = ec865219 docs; code
tip 0873c47b = SPINE-3 merge, message records orch-verified tsc SET identity 26/6 + src/ai
fail-set 10/21 + scope server/src/compiler/resolution/ only). No scout output is cited anywhere;
Appendix A is the composer's own cite-verified log. Task block read verbatim at
/home/brad/.hermes/cl/lanes/2/task-list.md:3466-3491 (id/title/deps SPINE-1..SPINE-5/verified-by).

## 0. Goal (one sentence)
Pin the whole scientist-intent spine — the REAL POST /intent/compile-from-prompt route running
parse + normalize + the SPINE-4-registered pipeline + compiler against the REAL shipped
vocabulary — with six checked-in replay goldens driven by a pinned model adapter (only the model
endpoint and the labware lookup are seams), a checked-in manifest that pins fixture/spec/rule
versions + reproduction commands and is verified by the golden suite itself, and — honestly
separated, never CI-wired — ONE live smoke script that runs the lane's ACTIVE-profile model once,
retains raw output + outcome, counts malformed output as extraction failure and clarification as
NOT success, and claims nothing about tiers.

## 1. Claim gate + contested-state honesty (READ FIRST — binding)
Claim gate = **SPINE-5 MERGED** (deps are SPINE-1..SPINE-5; SPINE-1 b36f914a and SPINE-2 39a5311b
are DONE; SPINE-3 merged at 0873c47b; SPINE-4 was mid-coding at handoff l2t1735 and SPINE-5 was
spec-ruled-not-promised — handoff lines 4-5, 28-29). Base >= SPINE-5's merge commit.

**Contested-state rule (binding on this spec):** as of composition time SPINE-4 and SPINE-5 are
NOT merged. The composer verified this FIRST-HAND at 0873c47b: `grep -n "needs-clarification"
server/src/compiler/pipeline/CompileContracts.ts` => EMPTY (:78 reads `export type CompileOutcome =
'complete' | 'gap' | 'error';`, re-read) and `git -c core.fileMode=false cat-file -e
HEAD:server/src/compiler/resolution/resolveNounsPass.ts` => "does not exist". Every mention of
SPINE-4/SPINE-5 internals below is SPEC-SHAPE (what their specs SAY will exist), never frozen
fact. The goldens are pin-by-replay, so they absorb the merged contract rather than hardcode it —
but the claim-time name-and-read below is MANDATORY before writing any golden.

CLAIM-TIME NAME-AND-READ LIST (read these merged files, in this order, on your own base; record
ACTUAL shapes in the report's §1 table):
1. `server/src/compiler/pipeline/CompileContracts.ts` — the outcome union member spelling for the
   clarification bar (SPINE-4 OQ1 ruling (a) says 'needs-clarification'). Whatever spelling the
   merge shipped IS the contract; do not rename, do not hardcode this spec's guess into fixtures.
2. `server/src/compiler/scientistIntent/compileScientistIntent.ts` — ScientistIntentCompileResult
   today :69-74 {terminalArtifacts, normalized, outcome, diagnostics} (re-read at 0873c47b);
   post-SPINE-4 the field for clarifications (name + optionality) and whether gaps are replaced
   on a bar (SPINE-4 spec §3).
3. The SPINE-4 merged `resolve_nouns` pass + pipeline YAML — pass id and output-slot id, and the
   bar's zero-artifact rule (orch ruling OQ3(a): total zero-artifact on bar).
4. The promoted+merged SPINE-5 spec + route — the RESPONSE contract as merged: status codes
   (orch rulings on the SPINE-5 draft: 422 NEEDS_CLARIFICATION incl. localMacro, no axes; 502
   MALFORMED_MODEL_OUTPUT), body shapes, and whether terminalArtifacts is present on the 422
   body. The goldens pin the AS-MERGED body, not this spec's table.
5. `server/src/api/handlers/IntentCompileFromPromptHandlers.test.ts` post-SPINE-4/5 — today
   151 ln / 4 tests with the stubLlm + mockStore + mock-request/reply harness (full file
   re-read); SPINE-5 extended it — reuse its stub-adapter idiom by COPY into the goldens, do not
   edit it (double-migration guard, §8.8).
6. `schema/scientist-intent/scientist-intent-vocabulary.yaml` + `schema/workflow/scientist-intent.
   schema.yaml` (217 ln, unresolved at :165) + `schema/registry/compile-pipelines/scientist-intent-
   compile.yaml` (89 ln at 0873c47b; 16 passes pre-SPINE-4) — current rule/spec versions; their
   sha256 goes in the manifest (§4.3).
STOP-AND-REPORT at claim (do NOT spec-stretch around any of these): (a) the needs-clarification
union member absent (SPINE-4 not actually merged); (b) the compile result exposes only
stringified gaps, no structured clarifications (SPINE-4 defect); (c) the merged route contract
materially differs from SPINE-5's promoted spec in a way that changes WHICH payload the goldens
should pin (report the delta, propose the golden shape, await ruling); (d) any acceptance below
would need a PRODUCT-code change to be expressible — that is a stop-and-report, never scope
(§3); (e) the lane config.yaml has no usable active profile when you reach §6 (report, do not
fabricate a model).

## 2. Why this is the shape (one paragraph, honest)
SPINE-4/5 gold the BARRIERS and the ROUTE; SPINE-6 is the first item that replays the FULL prompt
→ response arc end to end on the real shipped rules, deterministically (CI) and separately
evidences today's real model's extraction quality (live). That split is the task's own "why":
replay = deterministic spine correctness; live = the actual model's output, with malformed =
extraction failure and clarification ≠ success. The repo precedent for an e2e golden is
`server/src/compiler/__goldens__/ros/ros.test.ts` (header: "All tests are hermetic - no real AI
calls, no disk IO beyond fixture-local data"; StubExtractor canned-candidates pattern :26-46,
re-read). SPINE-6 mirrors that discipline at the scientist-intent route surface.

## 3. Scope — file ownership (capped as tight as possible)
IN SCOPE (the ONLY tracked files this item may create/edit — additions and new files only; zero
edits to existing product files):
- `server/src/compiler/scientistIntent/goldens/` (NEW dir):
  - `goldenIntentToGraph.test.ts`, `goldenIntentToClarification.test.ts` (§4.2, §5)
  - `fixtures/*.yaml` — the six pinned scientist-intent documents (§4.2)
  - `replayKernel.ts` — shared pure helper: the pinned model adapter, the pinned labware lookup,
    the named normalizer, deep-equal vs golden JSON. NO vitest imports (the repro script reuses
    it from tsx; §4.3/OQ1).
  - `__records__/*.golden.json` — the blessed post-normalization replays (§4.4)
  - `MANIFEST.yaml` (§4.3)
- `server/scripts/golden-replay.ts` (NEW) — the reproduction command (tsx script, precedent:
  `server/scripts/run-compile-fixtures.ts` exists at 0873c47b, re-read header/driver :1-20).
  Offline, no network, exits 0 from a clean checkout.
- `server/scripts/live-smoke.ts` (NEW) — the ONE live smoke (§6). NOT collected by vitest
  (lives under server/scripts/, outside src/), NOT run by CI, NEVER curls :3093/:5193; it drives
  the handler in-process with the REAL inference client, exactly like the tests do with a stub.
- `.hermes/plans/SPINE-6-report.wip-l2t1755.md` (report, §10).
OUT OF SCOPE (explicit, edits forbidden — imports allowed):
- ALL product code: `server/src/api/handlers/**` incl. IntentCompileFromPromptHandlers.ts and
  EVERY existing test file (route tests are SPINE-5's turf; SPINE-6 reads, copies idioms, never
  edits), `server/src/compiler/**` outside goldens/ (SPINE-1..5 turf), `server/src/ai/**`,
  `server/src/config/**`.
- `schema/**` (consumed verbatim, hashed into the manifest, NEVER edited), `app/**` (MUST be
  0-file diff), `config.yaml` / `config.example.yaml` (config.yaml is UNTRACKED — verified
  `git ls-files --error-unmatch config.yaml` => "did not match any file(s) known to git"; the
  live smoke READS it, never writes).
- If a golden cannot be expressed through the existing seams (handler deps.llmClient +
  deps.searchLabwareByHint + store read surface, all already injectable — handler :80/:136,
  compileScientistIntent deps :63-67 re-read at 0873c47b) that is STOP-AND-REPORT (a product
  change request), not scope. The composer verified at 0873c47b that BOTH seams exist: the route
  injects `searchLabwareByHint = createLabwareLookup(store)` (handler :80, threaded :167) and
  `llmClient` (deps override :136) — the same seams the route test already uses.
- NO live smoke inside the vitest suite, NO second live script, NO model-name literal anywhere
  in tracked files (§8.4).

## 4. Golden replay design
### 4.1 The harness (pinned model adapter driving the REAL route)
Per SPINE-5's harness convention: the handler is constructed directly
(`createIntentCompileFromPromptHandlers(ctx, deps)`) with (a) a **pinned model adapter** — an
`llmClient` stub implementing `ScientistIntentLlmClient` (intentCompile.ts:30, re-read) that
replays the case's canned `emit_scientist_intent` tool-call / YAML text verbatim from
`fixtures/*.yaml`, with the same tool-name routing idiom as the route test's stubLlm (:40-87,
re-read); (b) a **pinned labware lookup** — `deps.searchLabwareByHint` backed by a checked-in
fixture labware table (recordIds are FIXED literals, e.g. LAB-plate-96 — identities asserted,
never random); (c) a read-only mockStore (get/getRecord/list/create/update/delete spies — write
spies for the zero-write assertion). Everything downstream is REAL: the registered handler
method → compileFromSmallLlm → lift → parseScientistIntent (production Ajv singleton) →
normalizeScientistIntent → runPipeline on the shipped scientist-intent-compile.yaml → the shipped
vocabulary via `loadScientistIntentVocabulary()` default path (vocabulary.ts:226-236, re-read —
production's cached singleton, exactly what the route uses) → the post-SPINE-4 resolve_nouns
pass. **vi.mock FORBIDDEN on parseScientistIntent / normalizeScientistIntent / compileScientist-
Intent / vocabulary / PipelineRunner / resolution/** — the only mocked modules are what today's
route test mocks (none of those; the file has zero vi.mock today, re-read full file). The
"REAL route" criterion is void if this rule bends (SPINE-5 spec §7.10, same bar).
### 4.2 The golden case list (names VERBATIM from task verified-by, task-list.md:3487-3491)
File goldenIntentToGraph.test.ts:
1. `golden.intent-to-graph.transfer-read` — transfer+read happy path: a fixture document whose
   transfer (with volume) and read actions fully resolve through the pinned lookup + shipped
   vocabulary; asserts 200, outcome 'complete', localMacro.actions present, and the FULL
   normalized response deep-equal to `__records__/transfer-read.golden.json` — volumes,
   addresses (wells/deck positions), resolved identities (recordIds), and provenance fields
   inside the golden, byte-exact after normalization (§4.4).
   ADDENDUM (orch l2t2050, clears AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE evidence debt):
   fixture 1 MUST also exercise the resolve_roles authoritative-wells seam end-to-end.
   Verified at the SPINE-4 merge tip: resolve_roles IS registered in the shipped
   scientist-intent-compile.yaml pipeline (:67, depends_on includes resolve_nouns), and the
   seam (ChatbotCompilePasses.ts ~:2410-2414) uses `nounBindings?.[role]?.addresses` when
   non-empty, else falls back to `defaultRoleResolver(role, ctx)`. The D4 gap is that the seam
   unit test hand-builds the slot, so nothing proves the REAL engine's binding.addresses is
   what reaches it. Therefore fixture 1 must: (i) bind a role whose single-well address comes
   from the real engine (SPINE-3 emits binding.addresses only when the role's in-band candidate
   set is exactly 1 — multi-well clarifies at resolve_nouns, so single-well is the only
   reachable production path); (ii) assert the emitted event's wells EQUAL the engine binding's
   addresses AND differ from what `defaultRoleResolver(role, ctx)` would return for that role
   (either provably different defaults, or a spy/mirror pin in the test proving the
   authoritative branch was taken — not the fallback); (iii) name this golden leg in the report
   as the D4 clearance. Without (ii) the golden could pass through the fallback and falsely
   bless the debt.
2. `golden.intent-to-graph.labware-hint-regression` — a document exercising the labware-hint
   path (the shape today's route test :129-151 and hintParity pin: labwareHint-carrying emits —
   re-read hintParity.test.ts:79-118); asserts the deep-equal replay AND that the pinned search
   spy's call pattern matches (post-SPINE-4: bound labels bypass the search — SPEC-SHAPE, pin
   what the merged code does, mutation-leg §8.11).
File goldenIntentToClarification.test.ts:
3. `golden.intent-to-clarification.ambiguous-material`
4. `golden.intent-to-clarification.unknown-local-term`
5. `golden.intent-to-clarification.material-level-mismatch` (drives the engine's material-level
   leg through the FULL path, not just the unit level nounResolution.test.ts:215 describe, re-read)
6. `golden.intent-to-clarification.missing-address` (drives the declarative required-address
   constraint through the route)
Plus (not vitest): the manifest repro command §4.3, and `golden.manifest.versions-current` — a
seventh test in goldenIntentToGraph.test.ts that re-hashes every manifest-pinned file and
deep-equals it to the manifest, so rule/spec drift fails CI LOUD instead of silently re-blessing
(§8.5).
### 4.3 The MANIFEST (checked-in; pins versions + reproduction)
`goldens/MANIFEST.yaml`, fields (composer-recommended shape, OQ1/OQ3 rulings pending):
```yaml
suite: spine6-scientist-intent-goldens
baseCommit: <SPINE-5 merge sha at bless time>
treeState:
  - {path: schema/scientist-intent/scientist-intent-vocabulary.yaml, sha256: ...}
  - {path: schema/workflow/scientist-intent.schema.yaml, sha256: ...}
  - {path: schema/registry/compile-pipelines/scientist-intent-compile.yaml, sha256: ...}
fixtures: [{path: goldens/fixtures/transfer-read.yaml, sha256: ...}, ...all six...]
records: [{path: goldens/__records__/transfer-read.golden.json, sha256: ...}, ...]
outcomeUnionMember: <the ACTUAL merged spelling, from §1 name-and-read 1>
routeContract: <one-line pin: status codes + body keys as merged, from name-and-read 4>
reproduce:
  - {cmd: "cd <wt>/server && npx vitest run src/compiler/scientistIntent/goldens", expect: "6+1 tests, 0 failures"}
  - {cmd: "cd <wt>/server && npx tsx scripts/golden-replay.ts", expect: "exit 0 from a clean checkout, offline"}
liveSmoke: {cmd: "cd <wt>/server && npx tsx scripts/live-smoke.ts", gating: "NEVER CI; manual/orch only; see spec §6"}
```
sha256 (not git blob ids) so the repro works from any checkout/copy of the same tree. The
golden tests READ the manifest: fixtures/records are loaded through it, and
`golden.manifest.versions-current` fails when a pinned rule file's hash no longer matches —
drift = deliberate re-bless with a before/after diff in a report, never silent.
### 4.4 Normalization rule (narrow, named, mutation-proved)
`replayKernel.ts` exports ONE pure `normalizeReplay(obj)`: recursive key-DROP whitelist —
top-level `durationMs` (pass telemetry), any ISO-8601 string under a `*At`/`*Timestamp` key,
and per-SPINE-1 key-absence-vs-undefined cleanup only. EVERYTHING ELSE IS ASSERTED — volumes,
addresses/wells, recordIds (identities — they are deterministic from the pinned lookup, so they
ARE asserted, never normalized away), resolvedRefs, provenance-bearing fields (spec version,
vocabulary-derived tags, hint provenance). Deny-by-default: normalization adds no tolerance, it
only drops incidental ids/timestamps per the task text ("only incidental ids/timestamps
normalized"). The golden JSON files store the POST-normalization replay (snapshot convention);
the load-bearing values are additionally re-asserted with explicit expect()s inside each test
(volumes, addresses, identities, provenance) so a broken normalizer can't bless drift.
MUTATION LEG (report transcript): change one volume in a copy of a fixture, run the golden, show
it RED, restore byte-clean (SPINE-3's restore discipline). If the mutation stays green, the
harness is vacuous — fix the harness, not the golden.

## 5. The clarification-bar goldens (atomic zero-artifact assertions)
Each of the four clarification cases asserts, at the RESPONSE level through the route:
(a) the merged clarification-bar status per name-and-read 4 (SPEC-SHAPE today: 422, error
'NEEDS_CLARIFICATION', incl. localMacro, no axes — SPINE-5 orch rulings; pin what merged);
(b) `clarifications` deep-equal to the golden record — items exactly
`{label, reason, candidates?[{label, confidence?}], actionLocation?}` (types.ts:113-118, verbatim
re-read at 0873c47b; actionLocation :107-111; the verb enum is the fabrication gate —
clarificationContract.test.ts:154-156 pins it, re-read) — no route-side or test-side invention of
labels/candidates/ids;
(c) ATOMIC ZERO-ARTIFACT: `Object.keys` on the response/compile-result artifact surface contains
NO artifact-bearing key (events/directives/deckLayoutPlan/resourceManifest/instrumentRunFiles/
labStateDelta/... per SPINE-4 orch OQ3(a) total-zero; assert ABSENCE via Object.keys, NEVER
toEqual-with-undefined — exactOptionalPropertyTypes harness convention, both prior specs and
clarificationContract.test.ts:84 pin it); if the merged route 422 body deliberately carries
localMacro, that is pinned, but no EVENT/RUN artifact key may appear;
(d) store write spies (create/update/delete) ZERO — the clarification path is write-free;
(e) outcome is the clarification member, provably NOT 'complete' — and the same "clarification is
not success" assertion function is EXPORTED from replayKernel.ts and reused by the live smoke (§6).

## 6. The ONE live smoke (honestly separated)
`server/scripts/live-smoke.ts`, run manually/orch-only, never from vitest, never CI:
1. Resolves the model the SAME way the route does — `resolveAiProfile(ctx.appConfig.ai)`
   (config/types.ts :233-236 activeProfile->profiles[active] lookup, re-read) against the lane's
   config.yaml. The model is NAMED AT RUN TIME from the active profile (config.yaml:53 reads
   `activeProfile: qwen3.8-thunderbeast` at composition time — UNTRACKED lane config; the script
   must NOT hardcode it; if no active profile resolves, the script exits with a report line,
   §1(e)).
2. Calls the REAL handler in-process with the REAL InferenceClient (same construction path as
   production handler :136, no stub), ONE prompt (the composer-recommended prompt: the
   transfer+read happy-path scenario text, recorded verbatim in the artifact), exactly ONE model
   interaction chain (the route's own retries are the route's).
3. RETAINS, in the artifact: the resolved profile name + model + baseUrl host (no key material),
   the prompt, the model's RAW scientist-intent output (verbatim string OR verbatim tool-call
   args, fence included), the HTTP outcome (status + body keys), and a classification line.
   Artifact path: `server/.artifacts/live-smoke/<UTC-timestamp>/` (untracked; report cites path +
   sha256 of raw output; raw output additionally pasted verbatim into the report — one short
   emission).
4. Classification, fixed by code + test-free review: `complete` = 200/'complete' → SUCCESS;
   malformed output surfacing as the route's malformed-model-output arm (SPEC-SHAPE: 502
   MALFORMED_MODEL_OUTPUT post-SPINE-5) → **EXTRACTION FAILURE** (explicit, not "an answer");
   needs-clarification → **NOT SUCCESS** (uses replayKernel's shared assertion so replay and live
   cannot disagree); 500 → infra fault, report. The script exits 0 whenever it completed a call
   (it is evidence, not a gate — OQ4), exit non-zero only if it could not run at all.
5. Claims NOTHING about tiers/families/sizes anywhere (no comment, no filename, no artifact
   wording); PROTO-AI-13's router owns that verdict.
6. Isolation both ways: no vitest test reads .artifacts/; the live script shares ONLY the
   normalize/classify helpers, never the goldens.

## 7. Acceptance-criteria-to-test map (verified-by verbatim, task-list.md:3487-3491)
| verified-by clause | test/command (exact names) |
|---|---|
| golden.intent-to-graph.transfer-read | `golden.intent-to-graph.transfer-read` (goldenIntentToGraph.test.ts) |
| golden.intent-to-graph.labware-hint-regression | `golden.intent-to-graph.labware-hint-regression` (goldenIntentToGraph.test.ts) |
| golden.intent-to-clarification.ambiguous-material | same-name `it()` (goldenIntentToClarification.test.ts) |
| golden.intent-to-clarification.unknown-local-term | same-name `it()` |
| golden.intent-to-clarification.material-level-mismatch | same-name `it()` |
| golden.intent-to-clarification.missing-address | same-name `it()` |
| reproduction manifest command exits 0 from a clean checkout | `cd <wt>/server && npx tsx scripts/golden-replay.ts` => exit 0 + `golden.manifest.versions-current` (7th vitest test) |
| live-smoke artifact names actual model, prompt, raw output, outcome; claims nothing about tiers | `server/scripts/live-smoke.ts` artifact (manual; report transcript) — NOT a test |
Write-zero / no-real-model-in-CI: every replay test carries store write spies + the suite's
hermetic-header convention (ros.test.ts precedent). The lane greps for the six golden names —
spellings above are exact.

## 8. Verification commands (final, expected outputs — vitest ONLY from <wt>/server)
- `cd <wt>/server && npx vitest run src/compiler/scientistIntent/goldens` => 7 tests green, 0
  files failed. This is the item's PRIMARY suite; new files must be green (no legacy-fail excuse).
- `cd <wt>/server && npx tsx scripts/golden-replay.ts` => exit 0, offline (no net access needed;
  verified the tsx-script precedent exists: server/scripts/run-compile-fixtures.ts shebang
  `#!/usr/bin/env tsx`).
- `cd <wt>/server && npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/api/handlers/IntentCompileHandlers.test.ts src/api/handlers/IntentAcceptHandlers.test.ts src/compiler/scientistIntent src/compiler/resolution src/compiler/protocolIntent` => claim-time baseline (captured §9) with ZERO new failing files — this item edits none of them, so any red is mis-scope or contaminated base.
- `cd <wt>/server && npx vitest run src/ai` => failing-FILE SET identical to claim-time capture
  (carried from trunk: 10 files / 21 failed tests — handoff l2t1735 lines 79-80; SET identity, NOT green).
- Server tsc: `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
  => `comm -3` EMPTY vs the coder's OWN claim-time capture on its own base. Reference SET
  measured by the composer TODAY at 0873c47b: 26 error-lines / 6 files
  (RecordStoreImpl 11, AgentOrchestrator 8, AuthoringGuard 3, ProtocolIntakeHandlers 2,
  bootstrapAdmin 1, RecordHandlers 1), /tmp/spine6-tsc-trunk-0873c47b.txt sha256
  924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41 — byte-identical set to the
  SPINE-5 spec's fac6648e capture AND to orch's l2t1735 reconfirm (handoff lines 41-44), i.e. SET
  identity across SPINE-3-merge already holds. AS-LANE2-S2-TSC-PIN-27's "27" count stands as
  historical pin-name drift; SET identity remains the gate (handoff lines 69-70). Non-zero exit
  by design — record, never demand green. NONE of the 6 owning files may appear in this item's
  diff (it adds new files only).
- `cd <wt> && npm run typecheck -w app` => unchanged vs carried pin 47-out/34-err
  (AS-LANE2-APP-TSC-PIN-47-24, carried not re-measured — app diff must be EMPTY so the pin is
  never exercised) + `git -c core.fileMode=false diff --name-only <base>..HEAD -- app/` EMPTY.
- Ownership gate: `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E
  '^server/src/compiler/scientistIntent/goldens/|^server/scripts/(golden-replay|live-smoke)\.ts$|^\.hermes/plans/'`
  => EMPTY (additions-only; stricter than SPINE-5's: zero edits to any existing file).
- Live-isolation greps (reviewer runs these): `grep -rn 'live-smoke\|liveSmoke' <wt>/server/src --include='*.test.ts'`
  => EMPTY; `grep -rniE '(qwen|lfm|thunderbeast|2\.6b|3B|350M|small.?model)' <wt>/server/src/compiler/scientistIntent/goldens <wt>/server/scripts/golden-replay.ts`
  => EMPTY; same grep on live-smoke.ts => EMPTY (profile resolution is config-driven only);
  `grep -rn 'vi\.mock' <wt>/server/src/compiler/scientistIntent/goldens` => EMPTY.
- Manifest self-check: the 7th test's hashes vs `sha256sum schema/scientist-intent/* schema/workflow/scientist-intent.schema.yaml schema/registry/compile-pipelines/scientist-intent-compile.yaml`
  => consistent (report includes both transcripts).
NFS/harness standing facts: git ALWAYS `-c core.fileMode=false`; vitest from <wt>/server ONLY
(schema path resolution — clarificationContract.test.ts:28 joins `cwd/..` — depends on it); never
restart/probe :3093/:5193; no full-suite runs.

## 9. Baselines — re-measure as SETS at claim on the coder's own base (>= SPINE-5 merge)
- Server tsc SET: composer capture at 0873c47b 26/6 (file+sha256 §8); trunk WILL have moved by
  claim (SPINE-4+SPINE-5 merges) — the claim-time capture on the coder's base replaces it; both
  sides of every commit; drift outside the diff => STOP (this item touches none of the 6 files).
- Route+compiler+resolution suites: capture claim-time failing-file SET + pass counts
  (handoff l2t1735 carried reference: scientistIntent+protocolIntent green, combined targeted
  14 files/136 green at 0873c47b, handoff lines 79-80); zero NEW failing files final.
- src/ai failing-FILE SET 10/21 carried (handoff lines 79-80); SET identity, never green.
- App tsc carried 47-out/34-err; app diff EMPTY.
- Standing assumptions that touch this item: AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STANDARD-STRICTNESS
  (OPEN — handoff lines 72-73; the material-level-mismatch fixture may collide with it — if so
  STOP-and-report per that assumption's instruction); AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE
  (pipeline-dir fixture failures are pre-existing; this item's suites don't include them).
- Carried-vs-measured is flagged honestly: everything in §8 measured by the composer today is
  marked; 10/21 + 47/34 + 14/136 are CARRIED from the handoff, not re-run by the composer
  (composer runs exactly one command live: the tsc capture).

## 10. First targeted check (proves the approach early, BEFORE writing goldens)
On the fresh worktree at claim:
`grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts && npx vitest run src/compiler/scientistIntent src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/resolution` (from <wt>/server)
=> the grep line proves SPINE-4's union member landed with its exact spelling (record it — it
goes into the manifest's outcomeUnionMember); the suites green prove the SPINE-4/5 merges left
the seams standing, so any later red is THIS item's. If the grep is EMPTY => claim gate unmet,
STOP (§1a).

## 11. Reviewer bait (likely edge errors for THIS item — pre-empt in code + report)
1. vi.mock creep: any vi.mock of parser/normalize/compiler/vocabulary/pipeline voids the REAL-
   route criterion (the grep in §8 is the check; the route test today has ZERO vi.mock — keep it).
2. The golden blessed the harness, not the product: mutation leg (§4.4) mandatory, plus
   golden.manifest.versions-current. A green suite over a vacuous normalizer is the worst outcome
   this item can ship.
3. Over-normalization: dropping recordIds/addresses/wells/volumes "because they look
   machine-generated" makes every golden vacuous — identities come from the PINNED lookup and are
   deterministic; only durationMs/*At timestamps may drop.
4. Live bleeding into replay: a golden that shells out to live-smoke.ts, an artifact read in CI,
   a model name in any fixture/manifest field (baseCommit is a sha, not a model) — all violations
   (§8 greps).
5. Silent re-bless: editing a .golden.json without a report before/after diff + manifest hash
   update + rule-file delta explanation = rejected; clarification-reason strings must stay VERBATIM
   engine output (hintParity.test.ts:153 pins verbatim reason passthrough at the engine level —
   the golden inherits it, doesn't restate/paraphrase it).
6. The 422-vs-500-vs-'gap' fate: goldens pin the AS-MERGED contract (§1 name-and-read 4); if
   outcome 'gap' survives SPINE-4/5 for model-emitted intents, a 7th clarification case is NOT
   invented — the gap-reachability audit SPINE-5 OQ2 belongs to SPINE-5's report; re-check its
   finding at claim and cite it, don't re-decide it.
7. exactOptionalPropertyTypes: key ABSENCE via Object.keys everywhere (actionLocation/candidates/
   confidence nesting, clarification body); never toEqual-with-undefined.
8. Editing the route test file to "share a helper": copy into replayKernel.ts instead; the route
   tests are SPINE-5's just-merged turf — double migration is how contracts get silently broken.
9. Manifest churn: the manifest is blessed ONCE on the claim base; trunk moves after (docs
   commits etc. don't affect pinned hashes — product rule files only; if a pinned rule file moves
   mid-item, the 7th test goes RED: STOP-and-report, don't re-bless onto a moving trunk).
10. The live script must not become the route's second consumer (no new endpoints, no curl of
    the running stack — in-process handler construction like the tests; :3093 stays untouched).
11. clarification-as-success drift: the live classifier and §5's assertion come from ONE exported
    function in replayKernel.ts — if they diverge, the honest-separation promise dies quietly.
12. Ontology terms: this item consumes NO claim/context/assertion/evidence semantics
    (docs/knowledge-layer-canonical-example.md read per protocol — nothing here touches it);
    applicable rules: hints are evidence never identity (no minted candidates/recordIds anywhere,
    including fixture lookup tables masquerading as ontology — fixture recordIds are local-record
    identities, exactly what today's route test mocks at store level).
13. Hardcode boundary: goldens contain DATA (fixtures, hashes, names); zero verb conditionals,
    zero reason-code branching anywhere — the replay asserts output, it never computes it.

## 12. Stop-boundaries
- Zero product-code edits (incl. existing tests). Need one => STOP + report with the precise
  change request (§3). This includes "tiny" things: route logging for the live smoke, a vitest
  config tweak, an export for testability — each is its own item's decision.
- No new route/endpoint, no stack probe/restart, no schema/vocabulary/pipeline edits, no app/**.
- No tier/family/size claims anywhere (PROTO-AI-13 standing note; SPINE-5 OQ3 pattern: kept
  literals stay in their file, nothing new enters goldens/ or scripts/).
- One live script, one model call chain, no benchmarking, no multi-model comparison (live matrix
  is PROTO-AI-13's).
- No git mutations beyond commits on the item branch; never touch another worktree; report path
  fixed (§13).

## 13. Worker contract
- Worktree `wt/SPINE-6-lane2-l2t1755` off trunk `cl/integration-2` AT CLAIM TIME (base >=
  SPINE-5's merge commit), branch `spine-6-lane2-l2t1755`. One worker (cl-coder, fleet lock).
  Bootstrap per the SPINE-1/2/4/5 recipe (7 symlinks incl. server/schema, start-app.sh, trunk
  untracked entries 1:1; NFS: `-c core.fileMode=false` everywhere; untracked mirror copy in
  background).
- Deliverable report (unique): `.hermes/plans/SPINE-6-report.wip-l2t1755.md` — must contain: §1
  name-and-read table (ACTUAL merged spellings/field names/status codes vs this spec's SPEC-SHAPE,
  delta noted); §10 first-check output; §4.3 manifest as blessed; RED evidence per §4.2/§5 test
  BEFORE each GREEN; the §4.4 mutation-leg transcript (RED then byte-clean restore); golden
  re-pin diffs (if any) with rule-delta explanation; §5 zero-write + key-absence transcripts;
  the live-smoke artifact (path, sha256, verbatim raw output, outcome + classification lines) —
  run ONCE, at the end, after the goldens are green; §8 commands + §9 SET diffs both sides of
  every commit; the §8 live-isolation/tier/vi.mock greps verbatim; any deliberate behavior note
  if a shipped fixture had to move.
- Server-only -> NO browser gate. Stack never touched.
- Sequence inside the item: first-check => replayKernel + transfer-read golden (GREEN the arc
  early) => remaining graph golden => four clarification goldens => manifest + repro script =>
  live-isolation greps => live smoke (last, once) => report.

## 14. Open questions (orchestrator rules; each with a CHECKED recommendation)
OQ1 — Where does the reproduction command live, and does it duplicate the vitest assertions?
RECOMMEND (a): `server/scripts/golden-replay.ts` (tsx) reusing goldens/replayKernel.ts (pure
helpers, zero vitest imports), re-running the six replays + assertions and exiting 0/1 — one
assertion home, two runners (vitest for CI, script for the manifest's "clean checkout, exit 0"
clause; the route is constructible without a server, proven by today's route test). Alternative
(b): a vitest CLI invocation as "the" command — rejected as weaker: `vitest run goldens` needs
devDeps present and doesn't self-prove "clean checkout" any more than the script; the script at
least proves the offline/hermetic claim. Checked: server/scripts/run-compile-fixtures.ts exists
(tsx scoreboard precedent), handler is factory-constructible (test :91/:98), clarification-
Contract's cwd-dependent schema join works identically for the script (same cwd convention).
OQ2 — Golden suite home: RECOMMEND `server/src/compiler/scientistIntent/goldens/` (the surface
under test is scientist-intent; __goldens__/ros is chatbot/protocol-compile turf and the file-
ownership regex stays trivial; CI picks src/**/*.test.ts automatically). Alternative:
compiler/__goldens__/scientist-intent/ (sits beside ros but crosses suites). Checked: vitest
include covers src/**, ros.test.ts header, dir listings of both homes.
OQ3 — Golden record format: RECOMMEND checked-in POST-normalization JSON deep-equal + explicit
expect()s on load-bearing values (§4.4 hybrid) — snapshot ergonomics with typed anchors; the
manifest self-hash makes tampering loud. Alternative: assertions-only (no JSON records) — loses
the full-replay pin the task's "goldens" implies. Checked: repo has no existing vitest-snapshot
convention in compiler suites (fresh-file deep-equal is cheapest to review).
OQ4 — Live-smoke exit code: RECOMMEND (a) exit 0 on any completed call (success/clarify/
malformed all produce artifacts; the artifact classification carries the verdict), non-zero only
when the call could not be made (profile absent → §1(e) report line). Alternative (b) non-zero
on non-success reads like a gate and invites someone to wire it into CI as one — the task says
honestly separated, not pass/fail. Checked: task verified-by wording (artifact names... claims
nothing); task-list.md:3486 "demo artifact for tomorrow".
OQ5 — Which prompt for the live smoke? RECOMMEND the transfer+read happy-path scenario text
(same scenario as golden 1, free-text phrasing only — no fixture-body copy, replay and live stay
independent), so the raw output is directly comparable to a golden shape without being an
assertion. Checked: the route's prompt = protocolText + lab-inventory block (composeIntentPrompt,
scientistIntent.test.ts:217-242 re-read) — the script passes protocolText; the inventory comes
from the REAL store on the live run (that is the point of the live leg).

## Appendix A — cite-verified log (EVERY cite re-read first-hand by the composer at
/mnt/vast/home/brad/git/cl-integration-2, branch cl/integration-2, code tip 0873c47b / docs tip
ec865219; NO scout output cited; tools: read_file/search_files/terminal-git-read + ONE tsc run):
- task-list.md (lane 2 file): SPINE-6 block :3466-3491 verbatim (title, deps SPINE-1..SPINE-5,
  description, verified-by names); SPINE-4 block tail :3404-3424 + SPINE-5 block :3427-3463
  (composer dispatch notes + orch ruling comments) for chain state.
- Handoff .hermes/plans/handoffs/2026-10-08_1755-lane2-spine5-spec-ruled-pbch9-ready.md full (90
  ln): coder lock :4-5, SPINE-5 rulings :23-29, tsc 26/6 reconfirm :41-44 + :76-80, standing
  assumptions :66-73, harness facts :81-82.
- SPINE-4 promoted spec .hermes/plans/2026-10-08_1605-SPINE-4-resolution-pass-registration-spec.md
  full (626 ln): structure template, §4.3 proofs, §6 test-plan discipline, orch rulings :607-626.
- SPINE-5 draft spec .hermes/plans/2026-10-08_1620-SPINE-5-headless-compile-route-spec-DRAFT-l2t1620.md
  full (414 ln): §1 name-and-read pattern, §4 real-route harness rules (:147-179), §7 harness
  baits, orch rulings block :390-414.
- CompileContracts.ts: CompileOutcome :78 EXACT text (no needs-clarification — SPINE-4 pending),
  Gap :69-72, TerminalArtifacts :279+ field list (events/directives/gaps required; optional
  labStateDelta/deckLayoutPlan/resolvedRefs/resourceManifest... — the Object.keys absence list).
- scientistIntent/types.ts :100-127: ScientistIntentActionLocation :107-111,
  ScientistIntentUnresolvedFact :113-118, ScientistIntent.unresolved :126 (verbatim bodies).
- scientistIntent/compileScientistIntent.ts (210 ln): ScientistIntentCompileDeps :63-67
  {searchLabwareByHint?, priorLabState?, onPassEvent?}, ScientistIntentCompileResult :69-74,
  gatherGaps :118 / computeOutcome :139 / export :145 (grep-anchored reads).
- scientistIntent/intentCompile.ts (488 ln): ScientistIntentLlmClient :30, compileFromSmallLlm
  :244, PLAIN_TEXT_ATTEMPTS=3 :298, retryError throw :336, no-usable-intent throw :342.
- api/handlers/IntentCompileFromPromptHandlers.ts (189 ln): toInferenceConfig :44, smallModel :51,
  resolveAiProfile use :55, fallback literals :62/:66, searchLabwareByHint = createLabwareLookup
  :80, PROTOCOL_TEXT_REQUIRED :130, client seam :136, needsAnswers :154, compileFromSmallLlm call
  :163 (deps {searchLabwareByHint} :167), success send :171-175, catch :179, route post :189.
- api/handlers/IntentCompileFromPromptHandlers.test.ts full (151 ln): mockStore :4-8, ctx :10-15,
  request/reply harness :17-35, stubLlm tool-routing :40-87, 4 tests :90-151 (zero vi.mock today).
- scientistIntent/scientistIntent.test.ts (381 ln): THREE_ACTION :8-23, describes :25/:65/:92/:217/
  :244/:268/:342, compileScientistIntent test :245-265 (searchLabwareByHint stub shape),
  composeIntentPrompt tests :217-242, lift shapes :297-339.
- scientistIntent/clarificationContract.test.ts: header (harness convention :11-14), SCHEMA_PATH
  cwd-join :28, actionLocation accepts :52/:68, absent-vs-undefined :84, fabricated-verb reject
  :154, candidate freeze :247-265, 10 `it(`.
- scientistIntent/scientistIntentContract.test.ts it()-list (:119-362: 31-verb five-copy pin :160,
  hint-vs-source pins). resolution/ dir listing at 0873c47b: engine files + 2 tests + fixtures —
  resolveNounsPass.ts ABSENT (cat-file proof, §1).
- resolution/nounResolution.test.ts (648 ln): describes :121/:215/:262/:346/:431, ambiguity/
  lookup-fail/mint-affordance :432-531, role-address stricter-than-passthrough :533, 15 `it(`;
  resolution/hintParity.test.ts :79-118 (hint=resolvedRecordId??labwareHint fixture shape —
  regression-case source) + :153 verbatim-reason pin; resolution/types.ts ResolutionRequest
  :25-41 (declared contract slot, wantLevel, hints provenance — material-level fixture design).
- __goldens__/ros/ros.test.ts :1-50 (hermetic e2e-golden convention, StubExtractor canned pattern).
- vocabulary.ts :226-239 (loadScientistIntentVocabulary(opts.path?) + cached singleton +
  defaultScientistIntentVocabulary — shipped-rule source for the harness).
- schema/workflow/scientist-intent.schema.yaml 217 ln, unresolved :165; scientist-intent-compile.
  yaml 89 ln (16 passes pre-SPINE-4); vocab triplet live under schema/scientist-intent/ (file
  list + resolution/fixtures copies vocab-domain-flip/-policy-flip/-shipped-copy observed as the
  fixture-copy convention precedent).
- ai/compiler/labwareLookup.ts createLabwareLookup :62 (read-only lookup factory seam).
- server/scripts/run-compile-fixtures.ts :1-45 (tsx scoreboard script precedent).
- config/types.ts activeProfile semantics :159/:164/:233-236; config.yaml :53 activeProfile value
  (UNTRACKED — git ls-files error verified); config.example.yaml also carries profiles shape.
- Live measurement (composer's own run today, the ONLY command executed): server tsc 26 error-
  lines / 6 files at 0873c47b, per-file 11/8/3/2/1/1, /tmp/spine6-tsc-trunk-0873c47b.txt sha256
  924c18bd...b9e41 (identical to SPINE-5 spec's fac6648e sha — set stable across the SPINE-3
  merge). NOT executed (read-only mission): any vitest run, any git mutation, any stack probe;
  src/ai 10/21, app 47/34, combined 14/136 are CARRIED from handoff l2t1735 and flagged as
  carried in §9.

SPINE6_SPEC_DRAFT_DONE 485

---

## ORCHESTRATOR RULINGS 2026-10-08T18:12 EDT (l2t1735) — BINDING

Composer ran as an in-invocation subagent (thunderbeast) and verified its own contested-state
claims first-hand; the orchestrator INDEPENDENTLY confirms the two load-bearing absence checks
against trunk at 0873c47b (CompileContracts:78 grep for needs-clarification EMPTY — orch ran it
this tick; resolveNounsPass.ts absent — consistent with SPINE-4 mid-coding).

OQ1 = (a) server/scripts/golden-replay.ts reusing a pure replayKernel; one assertion home, two
runners; the script is what satisfies the manifest's clean-checkout exit-0 clause.
OQ2 = (a) server/src/compiler/scientistIntent/goldens/ home.
OQ3 = (a) POST-normalization JSON deep-equal + explicit typed expect()s (hybrid).
OQ4 = (a) live smoke exits 0 on any completed call; verdict lives in the artifact classification;
never CI-wired. Non-zero only when no call could be made.
OQ5 = (a) transfer+read happy-path free-text prompt, same scenario as golden 1, replay and live
independent.

NOT promoted to canonical path: claim gate = SPINE-5 merged with adversarial ACCEPT. Promote at
claim; report path re-suffixed with the dispatch token then.
