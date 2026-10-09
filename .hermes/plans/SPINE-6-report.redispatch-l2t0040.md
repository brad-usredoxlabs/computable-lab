# SPINE-6 report — RE-DISPATCH l2t0040: STOPPED (2 of 3 replacement legs not route-reachable as worded)

Worker: cl-coder, lane 2, dispatch token l2t0040 (re-dispatch after architect ruling
`~/.hermes/cl/lanes/2/decisions/SPINE-6-wells-seam-reachability-decision.md`, VERDICT combo/R4-now).
Worktree: /mnt/vast/home/brad/git/wt/SPINE-6-lane2-l2t2230 (branch spine-6-lane2-l2t2230, base c74c5214 = SPINE-5 merge tip; tip before this report = c24aa581 predecessor stop report).
Status: **STOPPED per the dispatch's own instruction ("If a replacement leg turns out NOT route-reachable, STOP-AND-REPORT with evidence — do not force it") and spec §12/§3.** ZERO goldens written, manifest NOT blessed, ZERO tracked-file edits, ZERO product edits.

The mandated FIRST TARGETED CHECK was executed (three probe scripts, retained, git-ignored tmp/):
- `server/tmp/l2t0040-reach-probe.mts` sha256 54f32becb425f1126ca4920178be88aca96d7df0e08970e099860cc9d9c51144
- `server/tmp/l2t0040-reach-probe2.mts` sha256 ad36900f5d0e769440d015fb8061774a1a8520fad67df75d93bd63da024e602a
- `server/tmp/l2t0040-reach-probe3.mts` sha256 36855e37c687c4d08d54368adbbf8de5e8a960763ec7d220576c801f10595b34
All legs drive the REAL handler (`createIntentCompileFromPromptHandlers`) in-process: real Ajv parse, real shipped vocabulary singleton, real pipeline YAML, real SPINE-3 engine, real store-backed spine via the handler's own `createResolveSpineFromContext` (IntentCompileFromPromptHandlers.ts:154). Only the model client (stubLlm copy-idiom) and the store are harness-controlled. No vi.mock anywhere.

## §10 first targeted check — PASSED (claim gate holds on this base)

`grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts`:
```
81: * SPINE-4 (OQ1 ruling (a)): 'needs-clarification' is machine-distinguishable
87:export type CompileOutcome = 'complete' | 'gap' | 'error' | 'needs-clarification';
90: * Outcomes the CHATBOT pipeline can produce. 'needs-clarification' is the
97:export type ChatbotCompileOutcome = Exclude<CompileOutcome, 'needs-clarification'>;
```
`npx vitest run src/compiler/scientistIntent src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/resolution` => **12 files / 151 tests passed, 0 failed** (identical to the predecessor's §10 capture).

## §probe — replacement-leg reachability transcripts

### Leg P6 — fixture 6 `golden.intent-to-clarification.model-unresolved-passthrough`: **REACHABLE exactly as ruled**

```
===== P6 model-unresolved passthrough (nouns resolve; model declares unresolved) =====
status: 422  outcome: "needs-clarification"  error: "NEEDS_CLARIFICATION"
clarifications: [{"label":"incubation duration","reason":"the scientist did not state how long to incubate"}]
terminalArtifacts keys: ["events","directives","gaps","protocolIntent"]
  events: []  gaps: []
SPY labwareListCalls=5 materialListCalls=3
store recordIds (LAB-*) found in body: []
```
Schema-valid `unresolved:` entry (scientist-intent.schema.yaml:165) survives `reconcileModelUnresolved` (resolveNounsPass.ts:262) VERBATIM (no actionLocation invented, no candidates minted); 422; zero-artifact (labwareAdditions/deckLayoutPlan/resourceManifest/instrumentRunFiles/labStateDelta ABSENT via Object.keys); zero writes (write spies throw; never called). All fixture-6 acceptance clauses hold.

### Leg P5 — fixture 5 `golden.intent-to-clarification.material-lookup-failure`: **PARTIALLY reachable — the ruling's literal wording is NOT**

The ruling says: "canned model output whose intent names a **material** whose **spine lookup FAILS** (harness-controlled store-backed spine, D-EXTRA-2); asserts ... reason VERBATIM `resolution-lookup-failed` (never `unknown-noun`)".

Probe P5a (add_material with a material arg; harness store THROWS on kind='labware' — the only store-controllable failure the route's composition can surface):
```
===== P5a material-arg lookup failure (add_material.material, labware index throwing) =====
status: 422  outcome: "needs-clarification"  error: "NEEDS_CLARIFICATION"
clarifications: [{"label":"source plate","reason":"resolution-lookup-failed","actionLocation":{...,"argument":"source"}},
                 {"label":"source plate","reason":"resolution-lookup-failed","actionLocation":{...,"argument":"target"}},
                 {"label":"mystery reagent","reason":"unknown-noun","candidates":[{"label":"Create local term “mystery reagent”","confidence":0.05},...],"actionLocation":{...,"argument":"material"}}]
```
The LABWARE args (hintEligible) get VERBATIM `resolution-lookup-failed`; the MATERIAL arg gets `unknown-noun` + mint offer — the exact opposite of the ruling's "never unknown-noun" for the material. Probe P5c (store throws on kind='material' instead) confirms the material arg STILL yields `unknown-noun`:
```
===== P5c material list throwing (spine-adapter failure arm reachable?) =====
clarifications: [{"label":"mystery reagent","reason":"unknown-noun","candidates":[{"label":"Create local term “mystery reagent”","confidence":0.05},...],"actionLocation":{...,"argument":"material"}}]
```

Why (code chain, all first-hand at c74c5214):
1. The engine's failure arm (resolutionEngine.ts:206-207, `sawFailure` ⇒ `clarificationFor(req,'resolution-lookup-failed',[])`) fires only when an ADAPTER records `failed:true`.
2. The spine adapter's `failed` bit is set ONLY by providers wrapped in `createFailureTrackingProvider` (adapters.ts:34-47). `grep -rn createFailureTrackingProvider server/src` => ONLY adapters.ts + nounResolution.test.ts. **`createResolveSpineFromContext` (ResolveSpine.ts:253-265) does NOT wrap its providers.**
3. Even if wrapped, the swallowing is triple-layered: `ResolveSpine.runProvider` `catch { return [] }` (:146-149), `createRecordProvider` per-kind `catch { continue }` (providers/records.ts:66-67), `createTermProvider` `catch { return hits }` (providers/terms.ts:65-66). A throwing store.list can NEVER reach the tracker through the route's spine. **The spine adapter's failure arm is route-UNREACHABLE at c74c5214** — D-EXTRA-2's "throwing-adapter failure arms are constructible" holds ONLY for the labware-hint adapter.
4. The labware-hint adapter DOES propagate throws (adapters.ts:133-140) because `createLabwareLookup` calls `store.list({kind:'labware'})` with NO try/catch (labwareLookup.ts:77). So `resolution-lookup-failed` IS reachable — but only for **hintEligible** args (hint_search strategy, strategies.ts `applies: contract.hintEligible === true`). Material args (seed/add_material/stain/... `.material`, `hintEligible` absent — verified across all 88 resolvable args of the shipped vocabulary) never run the labware-hint adapter ⇒ their failure arm is unreachable.

Probe P5b proves the reachable shape (transfer whose labware lookups fail):
```
===== P5b labware-arg lookup failure (transfer.source, labware index throwing) =====
status: 422  outcome: "needs-clarification"  error: "NEEDS_CLARIFICATION"
clarifications: [{"label":"source plate","reason":"resolution-lookup-failed","actionLocation":{"actionIndex":0,"action":"transfer","argument":"source"}},
                 {"label":"destination plate","reason":"resolution-lookup-failed","actionLocation":{"actionIndex":0,"action":"transfer","argument":"target"}}]
terminalArtifacts keys: ["events","directives","gaps","protocolIntent"]  events: []  gaps: []
```
422 + VERBATIM `resolution-lookup-failed` + atomic zero-artifact + zero writes: all hold — for a LABWARE noun via the labware-hint adapter, not for a material via the spine.

### Leg P1 — fixture 1 `golden.intent-to-graph.transfer-read` reachable-identity addendum: **arc reachable; the recordId clause is NOT**

Probe P1 (transfer+read; labels bound by the REAL store-backed spine; store records deliberately title+synonyms-only so `createLabwareLookup` — which reads payload.name/aliases only — MISSES them, proving the binding came from the spine arm):
```
===== P1 fixture-1 reachable-identity (transfer+read, spine-bound labels) =====
status: 200  outcome: "complete"  error: undefined
terminalArtifacts keys: ["events","directives","gaps","labStateDelta","deckLayoutPlan","resourceManifest","validationReport","instrumentRunFiles","protocolIntent"]
  events(2): [{"eventId":"evt-transfer-...","event_type":"transfer","details":{"source_labware":"source plate","destination_labware":"destination plate","volumeUl":50,"volume":{"value":50,"unit":"uL"}},"labwareId":"destination plate"},
              {"eventId":"evt-read-...","event_type":"read","details":{"mode":"absorbance"},"labwareId":"source plate"}]
SPY labwareListCalls=7 materialListCalls=4
pinned recordIds present in body: []
```
Probe P1b: `createLabwareLookup('source plate') => []` against that store (lookup reads payload.name/aliases only; the spine's record provider reads name/title/label/synonyms) — so the engine binding demonstrably came from the spine arm.

What IS reachable for fixture 1: 200 + outcome 'complete' + localMacro + full terminalArtifacts deep-equal; volumes byte-exact; the **:1631 spy assertion** is provable at the store level: the handler builds ONE shared `searchLabwareByHint = createLabwareLookup(store)` (handler :145, no deps seam — D-EXTRA-1), each lookup = exactly 1 `store.list({kind:'labware'})`, each spine.resolve = exactly 1 material-kind + 1 labware-kind list among its 7 DEFAULT_KINDS, loadLabInventory = 1+1. So `resolve_labware calls = labwareListCalls − materialListCalls − N(hintEligible labeled args)`. P1c (lookup-matchable labels, hint_search binds): 4−1−3 = **0** resolve_labware lookups; P1 (spine binds): 7−4−3 = **0**. The authoritative arm (ChatbotCompilePasses.ts:1631-1647, pre-decided identity pushed WITHOUT a second searchLabwareByHint) is taken in both variants — the ruling's spy clause is satisfiable.

What is NOT reachable — the clause "the golden record asserts the FIXED pinned recordId inside `localMacro`/`terminalArtifacts` (**resolvedRefs / resolvedLabwareRefs**)":
1. `compileScientistIntent`'s terminalArtifacts assembly (:275-298) emits events/directives/gaps + optional labwareAdditions/labStateDelta/deckLayoutPlan/resourceManifest/validationReport/instrumentRunFiles/protocolIntent. **`resolvedRefs`/`resolvedLabwareRefs` are NEVER assembled** (grep: the only mentions in the file are the header comment :8 and `gatherGaps`' `normalized.unresolvedRefs` :186). Those keys ARE emitted by the CHATBOT route (runChatbotCompile.ts:511-514) — the ruling's key names match the chatbot assembly, not this route's.
2. `resolve_references` IS registered (:166) and runs, but its output slot is never read into the bundle; `resolve_labware.resolvedLabwares` — the :1631 arm's output that DOES carry the pinned recordId — is read only for `labwareAdditions` (:263-266, :279-281); `resolvedLabwares` is discarded from the response.
3. Empirical: EVERY 200 leg (P1, P1c, P9 bound-instrument read → instrumentRunFiles `[{instrument,wells:[]}]`, P10) shows **zero store recordIds in the body**. The only recordId-valued fields the route can emit are `labwareAdditions[].recordId` and `deckLayoutPlan` labwareHint — and for a zero-match hint those carry the **HINT STRING**, not a store identity (P8: `labwareAdditions: [{"recordId":"ghost plate",...}]`). For BOUND labels labwareAdditions is empty.
4. No escape hatch: `deckSlot` appears 0 times in schema/workflow/scientist-intent.schema.yaml (grep exit 1) ⇒ `pinned[]` never populated; `normalizeScientistIntent` never sets `resolvedRecordId`/`deckSlot` (grep exit 1) — the `resolvedRecordId ?? labwareHint` widening (ProtocolIntentLowering.ts:196) has no producer on this chain.

Making a store recordId appear in the 200 body requires a PRODUCT edit (fold `resolve_labware.resolvedLabwares` — or `resolve_references.resolvedRefs` — into compileScientistIntent's terminalArtifacts). Per spec §3/§12 that is STOP-AND-REPORT, not scope.

### Controls — untouched fixtures 2/3/4: **REACHABLE** (probe v3)

```
P11 fixture-2 labware-hint-regression shape: 200 'complete'; SPY searchLabwareByHintCalls=1 (unbound hint DOES search)
P12 fixture-3 ambiguous-material shape: 422; clarifications [{"label":"standard plate","reason":"ambiguous-noun","candidates":[{"label":"standard plate alpha","confidence":1},{"label":"standard plate beta","confidence":1}],"actionLocation":{...}}
P13 fixture-4 unknown-local-term shape: 422; clarifications [{"label":"mystery flask","reason":"unknown-noun","candidates":[{"label":"Create local term “mystery flask”","confidence":0.05},...],"actionLocation":{...}}
```
Full transcripts: /tmp/l2t0040-probe-out.txt, /tmp/l2t0040-probe2-out.txt, /tmp/l2t0040-probe3-out.txt.

## Leg-by-leg verdict

| Leg | Ruling wording | Verdict at c74c5214 |
|---|---|---|
| Fixture 1 (reachable-identity addendum) | 200 arc + :1631 no-second-lookup spy + "pinned recordId inside localMacro/terminalArtifacts (resolvedRefs/resolvedLabwareRefs)" + wells byte-exact | Arc + spy + byte-exact pinning **REACHABLE**; the **recordId-in-body clause NOT reachable** (keys never emitted by this route; no store recordId reaches any 200 body) — needs a product edit |
| Fixture 2 labware-hint-regression | untouched by ruling | **REACHABLE** (P11) |
| Fixture 3 ambiguous-material | untouched | **REACHABLE** (P12, `ambiguous-noun` verbatim) |
| Fixture 4 unknown-local-term | untouched | **REACHABLE** (P13, `unknown-noun` + mint affordance verbatim) |
| Fixture 5 material-lookup-failure | "material whose SPINE lookup FAILS ⇒ VERBATIM resolution-lookup-failed, never unknown-noun" | **Literal wording NOT reachable**: spine-adapter failure arm is route-unreachable (providers swallow; createFailureTrackingProvider unwired in createResolveSpineFromContext); material args are not hintEligible so the only route-reachable failing adapter (labware-hint) never runs for them ⇒ material failure surfaces as `unknown-noun` (P5a/P5c). The `resolution-lookup-failed` arm IS reachable for **hintEligible labware args** (P5b) |
| Fixture 6 model-unresolved-passthrough | as ruled | **REACHABLE exactly as ruled** (P6) |

## Precise change requests (for orchestrator/architect)

**CR-1 (fixture 1, pick one):**
- (1a) SPEC re-word (zero product edit): drop the "(resolvedRefs / resolvedLabwareRefs)" parenthetical; fixture 1 pins the full 200 response deep-equal (events with symbolic labwareIds, deckLayoutPlan, protocolIntent labwareInstances, volumes byte-exact) + the store-spy assertion `labwareListCalls − materialListCalls − N == 0` proving the :1631 authoritative arm (the engine binding's recordId is then proven CONSUMED, though it is not observable in the body). The pinned recordId itself is observable only at the pipeline-slot level, which spine4Registration.test.ts already pins with two distinct spies (:280-322) — adjacent evidence, same as the ruling's own framing.
- (1b) PRODUCT item (small, named): `compileScientistIntent` folds `resolve_labware.resolvedLabwares` (and/or `resolve_references.resolvedRefs`) into terminalArtifacts (e.g. as `resolvedLabwareRefs`), making the ruling's wording verbatim-satisfiable. Touches compileScientistIntent.ts (SPINE-4/5-owned) — its own spec item, not SPINE-6 scope.

**CR-2 (fixture 5, pick one):**
- (2a) SPEC re-word (zero product edit): "an intent naming a LABWARE noun whose lookup FAILS (harness store throws on kind='labware' ⇒ createLabwareLookup throws ⇒ labware-hint adapter records the failure ⇒ engine failure arm)": asserts 422, VERBATIM `resolution-lookup-failed` (never `unknown-noun`), atomic zero-artifact, zero writes, golden deep-equal — all proven reachable (P5b). Test-name change is the orchestrator's (verified-by names are theirs); if the name must stay `material-lookup-failure`, "material" reads as "the named thing", which the probe evidence supports for labware args only.
- (2b) PRODUCT item for the literal wording: give the spine a failure channel the route wires — wrap `createResolveSpineFromContext`'s providers in the EXISTING `createFailureTrackingProvider` AND stop the providers' internal swallowing (records.ts:66, terms.ts:65, ResolveSpine.ts:148 — the adapters.ts:29-31 comment says UI/agent consumers depend on the swallow, so this is a real design decision, SPINE-8-adjacent). Only then can a material arg surface `resolution-lookup-failed`.

**CR-3 (manifest bless sequencing):** the manifest stays UNBLESSED until the fixtures 1/5 wording is settled — blessing once over a suite whose two legs are pending re-ruling is the §11.9 silent-re-bless trap (same discipline the predecessor applied and the ruling endorsed).

## §9 baselines — re-verified on this base (c74c5214), SET identity vs the predecessor's captures (reusable as-is per the dispatch)

1. **Server tsc**: 26 error-lines / 6 files (RecordStoreImpl 11, AgentOrchestrator 8, AuthoringGuard 3, ProtocolIntakeHandlers 2, bootstrapAdmin 1, RecordHandlers 1). `/tmp/l2t0040-tsc-server.txt` sha256 **924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41 — byte-identical** to /tmp/l2t2230-tsc-server.txt and to the spec §8 pin. `comm -3` EMPTY.
2. **Combined targeted suites** (route×3 + scientistIntent + resolution + protocolIntent): **20 files / 188 tests, ALL green** — matches the dispatch pin exactly.
3. **Compiler-scope fail-file SET**: 17 failing files (17 failed | 127 passed files; 37 failed | 1236 passed tests). Normalized `comm -3` vs /tmp/l2t2230-compiler-failfiles.txt: **EMPTY (SET identity)**. (The dispatch's "17/29" pairs the current 17-file SET with the retired 29-test count; the gate is the file SET, which holds; measured test-fail count is 37.)
4. **src/ai failing-FILE SET**: 10 files / 21 failed tests (74 files passed). Normalized `comm -3` vs /tmp/l2t2230-aifail-files.txt: **EMPTY**. Carried pin holds, never demanded green.
5. **App**: `git -c core.fileMode=false diff --name-only c74c5214..HEAD -- app/` => EMPTY (carried 47-out/34-err pin never exercised).
6. **§10 grep + targeted suites**: re-run above, green.

## What was completed (no work lost)

- §10 first check re-run (claim gate met). §1 name-and-read table and §9 baselines re-verified identical to the predecessor's (reused as-is per the dispatch).
- The mandated re-probe discipline executed with THREE retained scripts (shas above, git-ignored `server/tmp/`, run via `npx tsx` from <wt>/server) covering all three replacement legs plus controls for the untouched fixtures 2/3/4 and the fixture-1 spy arithmetic.
- Two NEW first-hand findings for the ruling record (same class as its D-EXTRA-1/2): (i) the route's spine composition makes the spine adapter's `resolution-lookup-failed` arm unreachable (triple provider swallow + unwired failure tracker); (ii) `resolvedRefs`/`resolvedLabwareRefs` exist in the TerminalArtifacts TYPE and in the CHATBOT route's assembly but are never emitted by the scientist-intent route — the ruling's fixture-1 key names match the chatbot assembly.
- Ownership state: `git status --porcelain -uall | grep -v '^??'` => EMPTY; zero commits before this report; no golden/manifest/script under src/ or scripts/ written; no vi.mock anywhere; no tier/model-name literals introduced.

## Resume condition

Orchestrator/architect ruling on CR-1 (1a or 1b) and CR-2 (2a or 2b). On ruling, re-dispatch on this worktree/base; the probe scripts are retained and the leg verdicts above are directly reusable. Next check after ruling: re-run `server/tmp/l2t0040-reach-probe*.mts` against the settled wording (all three legs' harnesses already exist), then write goldens RED-first per spec §4.2/§5 with the VERBATIM test names, bless the manifest once, run the mutation leg, then the live smoke last.

SPINE-6 STOPPED FIXTURE1-RECORDID-CLAUSE-AND-FIXTURE5-MATERIAL-SPINE-FAILURE-ARM-NOT-ROUTE-REACHABLE (probe evidence above; fixtures 2/3/4/6 + spy arc confirmed reachable)
