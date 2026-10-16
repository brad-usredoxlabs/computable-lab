# SH-QA-3 — SPEC DRAFT — lane 2 — composer l2t1640
Draft: 2026-10-15T11:45 EDT (composed while SH-QB-1 + SEQ2FIX2 coders ran). Trunk base:
cl/integration-2 tip **27ef008f** at write time — the trunk MOVED TWICE mid-composition: SH-QA-1
merged at **1bb147c7**, SH-QA-2 at 95d1c8bc, then **SH-QB-1 merged at 1caefbba** (advc c1 ACCEPT 0
defects; recompile round-trip + loud-failure clarifications channel + shape-fork PIN-ONLY — NO
normalizer-intake change) and **SEQ2FIX2 at 27ef008f**. The dep-context's 660226f7 (SH-QA-1 fix) IS an
ancestor of the current tip; every file:line below was RE-ANCHORED at b200a669 and re-diffed against
27ef008f — the SH-QB-1/SEQ2FIX2 deltas touch IntentCompileHandlers(+shapeFork test), guidance DATA and
prompt composition, NONE of the §IN-scope files (verified: `git -c core.fileMode=false diff --stat
b200a669..HEAD` = 10 files, zero overlap with this spec's ownership list). DRAFT — orchestrator
reviews, rules the OQs, and promotes; do NOT dispatch unreviewed.

## Contract header
- Lane 2, item SH-QA-3 ("Prose-blob material names are never mintable nouns: strip the redundant
  top-level material when a composition rides with it").
- Worktree/branch: `wt/SH-QA-3-lane2-l2t<tick>` + branch `cl/SH-QA-3-lane2-l2t<tick>` off the CURRENT
  trunk tip AT CODER START (re-pin: trunk is b200a669 at compose time; SH-QB-1 and SEQ2FIX2 merges will
  move it — every line cite below must be re-verified at the branch point). `git -c core.fileMode=false`
  for EVERY git call. Fleet coder lock held; SH-QA-3 is the SH-QA serialization-cluster item — one
  live coder on normalizeScientistIntent/resolution/shorthandChat while it runs.
- SERVER-SIDE ONLY. File ownership IN scope:
  - `server/src/compiler/scientistIntent/compileScientistIntent.ts` (the ONE strip site — findings 3),
  - `server/src/compiler/scientistIntent/mixtureLabelRedundancy.ts` (NEW — the redundancy detector,
    pure + data-driven),
  - `server/src/compiler/scientistIntent/nounShape.ts` (NEW — shared noun-shape DATA loader + matcher),
  - `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` (ONLY if the strip must observe
    params-vs-declared forms it cannot see at the compile seam — prefer NOT touching it; SH-QA-1's
    gated channel :435/:794/:889 and blob bar :727-780 stay byte-stable),
  - `server/src/compiler/resolution/resolutionEngine.ts` (the unknown-noun mint-offer arm ONLY,
    :203-217 — filter the mint by noun-shape DATA; ZERO new reason codes),
  - `server/src/ai/shorthandChat.ts` (the card map ONLY — `clarificationsFromUnresolvedFacts`
    :378-408, the `allowCreateLocal` value :401 + prompt arm :392; SH-QA-1's factRequestId :359-369,
    fold, and ledger legs are import-untouchable),
  - `config/drafting/shorthand-drafting.yaml` (a `nounShape:` policy block — pending OQ1),
  - NEW tests (§RED plan) + the deliberate re-pin of `shorthandChat.e2eStubHonesty.test.ts` per OQ3.
- OUT of scope (HARD): `schema/**` (incl. `schema/scientist-intent/scientist-intent-vocabulary.yaml` —
  it is MANIFEST-treeState-pinned, see bait B4; the named-vocabulary-file exception is DEAD unless the
  orchestrator's OQ1 ruling orders a re-bless); `config/drafting/mixture-material-cues.yaml`
  (BYTE-IDENTICAL — B2); `server/src/compiler/scientistIntent/goldens/**` incl. `MANIFEST.yaml` and
  fixtures/records (MUST NOT MOVE — B4; no bless in this item); `app/**` (everything — SH-QB-1's coder
  is LIVE on AiTabPanel/client.ts right now, and the card DOM is SH-QA-2's turf); the 422 route
  `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` and `IntentCompileHandlers.ts`
  (SH-QB-1 owns the recompile route; verbatim-passthrough here); `server/src/resolve/ResolveSpine.ts`
  (mintAffordance :268-277 is shared by drafts/workstate surfaces — the refusal happens at the
  engine-offer + card-map level, NOT at the spine); `server/src/materials/MaterialGrounding.ts` +
  `AddMaterialSupport.ts` (the grounding door and the minter stay exactly as they are);
  `server/src/ai/AgentOrchestrator.ts` (no fold-leg change — SH-QA-1 owns its shape).
- Coordination by REFERENCE (do not duplicate): SH-QB-1's no-silent-empty rule MERGED at 1caefbba —
  the recompile route now forwards a loud-failure clarifications channel (IntentCompileHandlers.ts
  +66, `IntentCompileHandlers.roundTrip/shapeFork` tests) and its shape-fork leg is PIN-ONLY. This
  item implements fix (3) as a SERVER-SIDE pin on the compile/chat outcome for the prose-blob
  scenario ONLY (§Design D) and never edits anything SH-QB-1 owns; where SH-QB-1's loud-failure
  channel already covers an arm, cite it, do not rebuild it.
- Queue: SH-QA-1 MERGED (1bb147c7) → the serialization prerequisite is met; SH-QB-1 and SEQ2FIX2 both
  merged — the fleet coder lock is the only dispatch gate. SH-QA-3 is the live hot-cluster item: one
  live coder on normalizeScientistIntent/resolution/shorthandChat while it runs.

## Goal (one sentence)
When an action carries a composition (params or declared many-arg) AND a top-level material whose name
is a concatenation/description of that composition, strip the redundant top-level material before the
noun door so the spine derives the mixture label from the components (the paste-#3/#7 good shape, zero
noun question), and make the mint-local-term affordance structurally refuse any phrase that fails the
declared noun-shape DATA — so a prose sentence can never be offered as a CURIE-worthy lab term.

## Ground-truth findings (VERIFIED first-hand at b200a669; task cites re-anchored)
1. THE CUE BAR IS NOW GATED (SH-QA-1 landed — build on THIS shape, do not re-implement):
   `normalizeScientistIntent.ts` blob bar :727-780 (guard :754, `gated.push` :766, reason
   `MIXTURE_BLOB_MATERIAL_REASON` :768, constant :392). Gated facts ride
   `ScientistIntentNormalized.resolutionGatedClarifications` (field :435, list :794, conditional
   spread :889); `compileScientistIntent.ts` plumbs them into the pass (:153-166 registration spread)
   and STOPPED appending them at the merge point (comment :256-263; only ungated producer facts append
   at :264). `resolveNounsPass.ts` :76 dep field, :293-295 `boundSlotKeys`, :297-301 `gatedSurvivors`
   (identity join via `identityKey` :107), :309 append AFTER engine+required+model. IMPORTANT FOR US:
   when a composition rides, `declaresComponents` (normalize :742-752: honors BOTH `params.composition`
   :742 AND the declared action-level many-arg) is true ⇒ the blob fact is NEVER RAISED at all. The
   defect this item kills is therefore NOT the blob bar — it is the ENGINE noun question.
2. THE ENGINE NOUN DOOR READS THE RAW DOCUMENT, NOT THE NORMALIZED OUTPUT:
   `compileScientistIntent.ts:230` `const normalized = normalizeScientistIntent(intent, …)`; the
   resolve_nouns registration passes `intent` (`buildRegistry` :122 → `createResolveNounsPass({intent,
   …})` :153-154). `resolutionEngine.ts:resolveScientistIntentNouns` :276 iterates
   `intent.actions[index]` verbatim: the many-cardinality arm emits ONE request per composition entry
   (label = the component name via declared `itemNounField`), and the scalar arm :314-318 emits a
   request for the top-level `material` STRING. So on the paste-#5/#6 shape (material = the sentence
   AND composition present), the door asks the sentence as a noun even though normalize's many-arg
   passthrough (:662-674) and params passthrough (:655-660) both do the right thing on the EVENT side.
   This is the exact hole: a top-level `material` string on `add_material`
   (`schema/scientist-intent/scientist-intent-vocabulary.yaml:209+`, `composition` declared
   `cardinality: many`, `domain: material` at :241-246 and :40-46 for `seed`) is `kind: resolvable`,
   so it MUST reach the door unless something strips it BEFORE the door. Vocabulary is per-path CACHED
   (`vocabulary.ts:265-280`) — cue data is per-call (normalize :44 + `loadMixtureCues` :253); any new
   data file MUST follow the per-call drafting precedent, never the vocab cache.
3. WHERE THE SENTENCE BECOMES A CARD (mint-offer surfaces, both must refuse):
   (a) ENGINE: `resolutionEngine.ts:203-217` — nothing bound ⇒ `const mints =
   mintAffordances(allCandidates)` (:205, filter :52 `tier === 5 || !curie`) ⇒ the `unknown-noun`
   clarification (:211) carries `Create local term “<sentence>”` (candidate minted upstream at
   `ResolveSpine.ts:268-277`, label :271, out of scope) plus near-miss suggestions (:212-216,
   `adapters.ts:300`).
   (b) CHAT CARD: `shorthandChat.ts:clarificationsFromUnresolvedFacts` :378-408 — the prompt literally
   says "…Choose what it is, **or create a local term.**" (:392) and `allowCreateLocal:
   menuProvider !== 'choice'` (:401) is set from the vocabulary DOMAIN ONLY — so TODAY a card whose
   label is the full sentence "50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells" (domain material ⇒
   menuProvider '/m') offers minting the sentence. The pinned three-bar canon at
   `shorthandChat.e2eStubHonesty.test.ts:218/:223` proves it (`allowCreateLocal: true` on a
   blob-label card). That is finding F3's "CREATE A LOCAL TERM for the entire prose sentence".
4. THE GOOD PATH'S DERIVED LABEL (the strip's target shape — paste #3/#7):
   `simpleVerbs.ts:compositionSnapshotFromParams` :357-410 (called :70 and :484): mixture label =
   `declaredMixtureLabel` if a material string rides, ELSE `componentLabels.join(' + ')` :397-400, and
   `materialRef: { kind:'draft', id:'mint:'+mixtureLabel, label: mixtureLabel }` :403. So when the
   redundant top-level material is STRIPPED, the expander already derives the mixture label from the
   component list — the good path's `material_ref` shape needs NO new machinery. Conversely leaving
   the material in place makes the grounding door mint the SENTENCE as the formulation name:
   `AddMaterialSupport.ts:390/:449` `normalizeCompositionMaterialRefs` →
   `ensureLocalMaterialForDraft` (`MaterialGrounding.ts:199`) mints one record per draft ref label.
   The strip is therefore REQUIRED on the event side too, not just the noun side — one strip at the
   document level covers both.
5. MEASURED BASELINES at b200a669 (this session, this tree): `cd server && npx tsc --noEmit` → **1**
   error (`src/ai/AgentOrchestrator.ts(344,18)` TS2339 — pre-existing, same as the SH-QB-1 spec's
   baseline; do not fix, do not re-baseline; set-diff discipline). `cd app && npx tsc --noEmit` →
   **23** (baseline). `:3093 /api/health` → 200 (lane stack live). SH-QA-1's harnesses exist and are
   the regression canon: `server/src/compiler/scientistIntent/cueResolutionGate.test.ts`,
   `server/src/ai/shorthandChat.cueCascade.test.ts`.
6. HASH BASELINES at b200a669 (identical must be provable at delivery):
   `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
   = `fbf743ab1384778de43eeb113da0f0857eef9fce`; cues
   `git -c core.fileMode=false hash-object config/drafting/mixture-material-cues.yaml` =
   `8ab1eb70a299c1d35acfa473beb37715e32dd47e` (sha256 `5d7d0ce22cf968027fe033de0acd59a5abbb43646a1ff6fde8f9e4b39a332819`);
   vocabulary treeState pin (MANIFEST.yaml :14) `sha256 14d779ce…` MATCHES the working tree (golden
   suite green) — any vocab edit trips `manifestHashMismatches` (enforced at
   `goldenIntentToGraph.test.ts:142` and `server/scripts/golden-replay.ts:39`).
7. GOLDEN HARNESS WITHOUT A BLESS: `goldens/replayKernel.ts` exports `loadFixture` :190 and `runGolden`
   :198 taking an IN-TEST `GoldenFixture` object (:171-176: `{name, request, store, modelOutput}` —
   modelOutput is the canned scientist-intent, `stubLlm` :118); only MANIFEST-ENTERED fixtures go
   through hash pinning (`fixtureFromManifest` :389). So the task's "harness to extend" (
   `goldens/goldenIntentToClarification.test.ts`, 265 ln, idiom: `assertBar` → clarifications
   VERBATIM → `assertBarZeroArtifact` → `writeCalls===0` → `deepEqualGolden`) can be reused at the
   PAYLOAD level with an in-test fixture object — no MANIFEST entry, no bless, no tree drift. The
   existing COMP-4 golden pins the mint offer that MUST SURVIVE fix 2:
   `golden.intent-to-clarification.unresolvable-mixture-component` expects
   `candidates[0] == {label: 'Create local term “Equine Serum”', confidence: 0.05}`
   (`goldenIntentToClarification.test.ts:255-257`) — a noun-shape rule that disqualifies 'Equine
   Serum' or 'mystery flask' BREAKS BLESSED GOLDENS (see bait B4).

## Design
### A. Fix (1) — the redundancy strip at the ONE document seam (compileScientistIntent)
Honest rule: **a top-level scalar noun whose label is a description OF a composition riding the same
action is not a noun — strip it from the compile input; the expander already derives the label from
the components (finding 4).**
- NEW `mixtureLabelRedundancy.ts` (pure): `stripRedundantMixtureLabels(intent, vocabulary)` →
  `{ intent: strippedCopy (structuredClone; only qualifying scalars removed), stripped: [{actionIndex,
  argument}] }`. Fires iff ALL of: (i) the action carries a component list in EITHER declared form —
  `params.composition` array (normalize :655-660 geometry) or a vocabulary-declared
  `cardinality: many` resolvable arg (vocabulary.ts `argContracts`, same iteration as normalize
  :670-674) — with ≥ 2 valid entries (the expander's own floor, simpleVerbs :368/:396); (ii) the
  action carries a top-level string scalar on a `kind: resolvable` scalar arg (found via the
  declared contract, NOT a 'material' string table — but per OQ2's fallback a single data-named arg
  selection is acceptable if the generic rule over-fires) whose label is REDUNDANT against the actual
  component list; (iii) redundancy = case-fold + whitespace-normalize (the cue loader's own
  `normalizeCueLabel` idiom, normalize :214-216), delete every component label (longest-first), then
  delete every cue token, `ratioPatterns` match, and connective (cue DATA `stopWords` :62 + the new
  `nounShape` connectives, OQ1); REDUNDANT iff the residue is empty or residue-only-connectives.
  Detection is against the COMPONENT LIST — a length heuristic is forbidden as the decision (it may
  appear only as a pinned negative test proving it is NOT the rule, B1).
- `compileScientistIntent.ts`: apply the strip BEFORE :230 so normalize AND `buildRegistry`/
  resolve_nouns (:153-154) both see the stripped doc (finding 2 — the door reads the raw `intent`;
  this is why the strip cannot live in normalize alone). When `stripped.length === 0` (the overwhelming
  case) the compile is byte-identical to today (identity passthrough, pinned by the fail-file-set +
  golden bars). One `console.log` line naming the stripped slot on a strip (loud-normalize precedent,
  never silent data loss: the composition itself remains the scientist's declared truth; nothing
  else in the doc is touched).
- Idempotence: the chat path holds the ORIGINAL YAML (AgentOrchestrator hold sites :1292/:1323, out of
  scope); a recompile re-strips the same doc ⇒ same events. Pin it (§RED T5) — this is also the
  SH-QB-1 round-trip compatibility proof by reference (fix 3, §D).
### B. Fix (2) — the mint refusal is DATA-declared and shared by both offer surfaces
- The noun-shape policy lives in the drafting-config home (OQ1 proposes a `nounShape:` block in
  `config/drafting/shorthand-drafting.yaml` — the existing shorthand drafting policy file, per-call,
  never process-cached, cue-loader precedent normalize :38-44/:253). It declares: (a)
  `mintRefusePatterns:` (sentence-shape DATA patterns, seeded ONLY by what the RED plan pins), (b)
  `connectives:` used by §A's residue step. The loader throws on malformed data naming the path
  (cue-loader parity); absent section ⇒ NO refusals, silent-but-disclosed in the report. Zero phrase
  literals in TypeScript — the TS knows only "this label matches a DATA pattern / this word is a DATA
  connective".
- NEW `nounShape.ts`: `loadNounShape(path?)` + `isMintableLabel(label, shape, cues)` shared by BOTH
  offer surfaces:
  - ENGINE: `resolutionEngine.ts` unknown-noun arm — filter `mints` (:205) so a label failing the
    shape never enters `clarification.candidates`. The `unknown-noun` reason code is UNCHANGED (zero
    new reason codes; a shape-refused noun still asks "choose what it is" with the near-miss
    suggestions leg :212-216 intact). The engine's header law (policy is data, zero NAME literals,
    :15-18) is honored: the check is DATA-pattern + component-list coverage.
  - CARD: `shorthandChat.ts:378-408` — `allowCreateLocal` (:401) becomes `menuProvider !== 'choice'
    && isMintableLabel(fact.label, …)`; the prompt (:392) drops the ", or create a local term" clause
    by conditional arm when the label is mint-refused (payload-level assertion, never DOM).
- Deliberately NOT the discriminator: raw cue-hit. A cue hit must NOT refuse mint — "1 mM Clofibrate in
  DMSO" hits cue " in " (cueCascade canon) and IS legitimately mintable when unbound (SH-QA-1's whole
  trust-the-record design); "0.1% Triton X-100 in water" fires "%" ratio-adjacency AND " in " and is a
  formulation. Only (A) composition-concatenation coverage and (B) the pinned sentence-shape patterns
  refuse. Bait B3 pins the survivors.
### C. Fix (2) scope discipline
ResolveSpine.mintAffordance stays (drafts/workstate surfaces share it; the spine is NOT where the
spine-vs-sentence judgment is made — the engine already decides whether to OFFER). No wire SHAPE
change: `AgentClarificationRequest.allowCreateLocal` already exists (`server/src/ai/types.ts:570`) —
value-only; `ScientistIntentUnresolvedFact` (SPINE-1 frozen) gains NO field (SH-QA-1 B3 discipline);
clarification.candidates keeps its shape (mint candidate simply absent).
### D. Fix (3) — the empty-graph sink: coordinate by reference, pin server-side
The paste-#6 "left unresolved ⇒ event graph EMPTY" is the held-card/answer path. Per SH-QA-1's OQ3
ruling there is NO server fold on the held-422 arm, and SH-QB-1 owns the recompile no-silent-empty
rule. THIS item's share, server-side only: pin that on the mixture doc the compile/chat outcome is
NEVER (zero events AND zero clarificationRequests AND success-shaped) — T3 asserts the payload always
carries blocking reason(s) or events > 0. If the RED work proves an empty-success on any arm this
item owns, fix it inside §A/§B reach; if it lives on the held-422 wire or SH-QB-1's recompile render,
record the raw payload in the report and HAND BACK (SH-QA-1's evidence-hand-back pattern) — do not
paper it over, do not edit SH-QB-1's files.

## Acceptance criteria (verbatim from the task list, id SH-QA-3 "verified by")
> Red-first: golden intent with redundant top-level material + composition normalizes to the same
> events as the composition-only shape (the paste-#3 good path) with NO noun question; a card is NEVER
> generated whose mintable phrase is a full sentence (assert on the clarification payload, not the
> DOM); existing COMP-3/COMP-4 goldens green. 10-run replay of the exact mixture prompt on the lane
> stack (SHORTHAND-CORPUS replay exists): zero prose-blob cards, zero empty graphs.

## RED-first test plan
### First targeted check (prove the approach early — write T1 ONLY, then run)
```bash
cd server && npx vitest run src/compiler/scientistIntent/mixtureRedundancy.test.ts -t 'T1'
```
Expected RED today: outcome `needs-clarification` carrying an `unknown-noun` fact whose label is the
full sentence, actionLocation `{actionIndex:0, action:'add_material', argument:'material'}` — while
`params.composition` carries the very components the sentence enumerates. One command, headless, no
stack, no model.
### File 1 (new): `server/src/compiler/scientistIntent/mixtureRedundancy.test.ts`
cueResolutionGate idiom (parseScientistIntent → compileScientistIntent over
`createResolveSpineFromContext` + mockStore seeded with the four component labels
"Thermo trypsin-EDTA / Thermo DMEM / Thermo FBS / HepG2 cells" — fixture strings ONLY in tests):
- T1 (paste #5 doc): `add_material` + `material: "50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells"`
  + `params.composition` (the compositionDecomposition.test.ts MIXTURE block verbatim, :35-49) ⇒
  outcome 'complete', ZERO clarifications naming the sentence, `material` never asked.
- T2 EQUIVALENCE: T1's compiled `terminalArtifacts` deep-equal the SAME doc with `material` absent
  (the paste-#3 good path) — event count, `composition_snapshot` component count == 4, and the
  mixture `material_ref`/label is the DERIVED `componentLabels.join(' + ')` (simpleVerbs :400), NOT
  the sentence (this is the grounding-door-poison leg, finding 4).
- T3 declared-form twin: action-level `composition:` array (vocabulary many-arg :241-246) instead of
  params ⇒ same strip, same events (the two forms normalize to one shape — also SH-QB-1's shape-fork
  by reference, T-map it in the report).
- T4 NON-REDUNDANT KEEPS ASKING (the negative control): composition present + `material: "Enigma
  Broth"` (not a concatenation — residue after deletion) ⇒ the material noun question is UNCHANGED
  (byte-identical clarifications; strip fires on redundancy only).
- T5 IDEMPOTENCE/ROUND-TRIP: `compile(strippedDoc)` events == `compile(doc)` events (recompile of the
  stripped doc strips nothing further).
- T6 length-is-not-policy proof: a SHORT redundant label ("DMEM/FBS" + composition of exactly DMEM +
  FBS) strips; a LONG non-redundant label ("50:50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells" where
  the composition lists a FIFTH component "Equine Glutamax" the sentence does not enumerate — residue
  nonempty) does NOT strip. These two pins prove the rule is component-list coverage.
### File 2 (new): `server/src/ai/shorthandChat.nounShape.test.ts`
- P1 PAYLOAD BAR (the AC's "assert on the clarification payload"): `clarificationsFromUnresolvedFacts`
  over facts whose `unresolvedFact.label` is a sentence (the paste #5 blob; plus a no-composition
  sentence reaching unknown-noun, e.g. `transfer` material = a full clause) ⇒ EVERY returned request
  with `allowCreateLocal === true` has a label that PASSES the DATA shape; the sentence requests
  carry `allowCreateLocal: false` and no ", or create a local term" clause in `prompt`.
- P2 ENGINE ARM: `resolveNoun` (or `resolveScientistIntentNouns` via compileScientistIntent with a
  provider-less declared test spine, compileScientistIntent.ts:145-152 seam) with an unbound sentence
  label ⇒ clarification reason stays `unknown-noun`, candidates contain NO `Create local term` entry.
- P3 SURVIVOR PINS (goldens-protection, finding 7): 'mystery flask', 'Equine Serum', '1 mM Clofibrate
  in DMSO', '5 mg/mL lysozyme in PBS', '0.1% Triton X-100 in water', 'DNase/RNase Free Water',
  'DMEM/F12' remain MINTABLE (allowCreateLocal true / mint candidate offered). A rule that flips any
  of these is a DEFECT.
- P4 no-composition blob regression floor: `add_material material: "50:50 Trypsin-EDTA/DMEM"` with NO
  composition still raises the gated blob fact (SH-QA-1 T2 unchanged) — the question is still asked
  and STILL materializes an answer; only the mint offer is withheld (a refusal must never remove the
  question — the scientist can still search /m or pick a near-miss).
### File 3: golden-level replay WITHOUT a bless
Extend `goldens/goldenIntentToClarification.test.ts` (or a sibling `goldenProseBlobStrip.test.ts`
inside goldens/ if a new file keeps the existing 265-ln file cleaner — orchestrator's taste) with an
IN-TEST `GoldenFixture` object through the exported `runGolden` (replayKernel :190/:198): canned
modelOutput = the redundant-material doc ⇒ payload is outcome-complete-shaped 200 with the same
events as the composition-only canned output, `clarifications` ABSENT, `writeCalls === 0`. NO
MANIFEST entry added (fixtures stay hash-pinned; `manifestHashMismatches` :376 must return []).
### Determinism replay (the AC's 10-run bar) — mechanism SPECIFIED
- `server/scripts/shqa3-mixture-replay.mts` (scripts/, outside vitest collection; live-smoke.ts is the
  construction precedent: real `initializeApp` + real handler + active-profile inference client, ONE
  chain per run — loop it N times; scripts/ is evidence, not a gate). Prompt VERBATIM from the wave
  header (task-list :7549-7551): "Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS
  containing 200 HepG2 cells per uL to each well." Mode 1 (coder, pre-merge): in-process against the
  worktree's own real store (lane data repo per lane facts), N=10, capturing per-run the done-frame /
  clarificationRequests / compiled-events. Mode 2 (orchestrator, post-merge AS-SERVED):
  `CL_REPLAY_BASE_URL=http://localhost:3093` POSTs the exact `/api/ai/assist/stream` body shape
  (surface `workspace.deck`, run context — copy the shape the orch's clofibrate pre-check used).
  Artifacts: `server/.artifacts/shqa3-replay/<UTC-ts>/run-N.json` + `summary.json` — commit the
  summary + cite raw paths in the report; attach raws.
- BARS (per run, all 10): (i) ZERO prose-blob cards — no clarification request whose
  `unresolvedFact.label` (or `query`) fails the noun-shape DATA, and none with `allowCreateLocal:
  true` on such a label; (ii) ZERO empty graphs — every run ends with events > 0 OR ≥ 1
  clarification request naming a specific blocking reason (a legitimate unknown-noun on an UNSEEDED
  COMPONENT is a named reason, not a prose-blob card and not an empty graph — the bar is precise, not
  optimistic); (iii) raw emissions retained so non-determinism is measured, not asserted away.
### Existing files (extended, not rewritten)
- `shorthandChat.e2eStubHonesty.test.ts`: the three-bar canon (:188-223) pins `allowCreateLocal:
  true` on the `50:50 Trypsin-EDTA/DMEM` blob card — the DELIBERATE re-pin per OQ3 (true for the
  `plate` card stays; the blob-label card flips to false; diff shown in the handoff, rubber-stamp
  forbidden).
### Suites that MUST stay green
`cueResolutionGate.test.ts` (13), `shorthandChat.cueCascade.test.ts` (12),
`resolveNounsPass.test.ts` (24), `compositionDecomposition.test.ts`,
`compositionArgResolution.test.ts`, `declaredArgumentReachability.test.ts`,
`clarificationContract.test.ts`, `AgentOrchestrator.shorthandChat.test.ts`,
`forceMaterialClarifications.test.ts`, ALL of `goldens/` (16 tests, MANIFEST frozen), full
`server/src/compiler/resolution/`, `nounResolution.test.ts` (its mint-offer pins :518/:530).

## Verification commands (complete; vitest cwd MUST be `server`)
- Base fail-file capture BEFORE coding, on the dispatch base: `cd server && npx vitest run` →
  `/tmp/shqa3-base-failfiles.txt` (failing FILE list, sorted unique); after: re-run,
  `comm -3 /tmp/shqa3-base-failfiles.txt /tmp/shqa3-head-failfiles.txt` EMPTY (flaps each proven
  green in isolation — the known load-timeout flap class; never quote a raw failure count without the
  comm proof).
- Targeted: `cd server && npx vitest run src/compiler/scientistIntent/ src/compiler/resolution/ src/ai/`
  — all green incl. the new files.
- tsc: `cd server && npx tsc --noEmit | grep -c "error TS"` → **1** (base; the AgentOrchestrator:344
  line) AND the sorted error-set diff vs base EMPTY; `cd app && npx tsc --noEmit | grep -c "error TS"`
  → 23 with EMPTY set-diff (server-side item — any app error is a scope fail).
- Hash bars (cite the values in the report):
  `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
  == `fbf743ab1384778de43eeb113da0f0857eef9fce`;
  `git -c core.fileMode=false hash-object config/drafting/mixture-material-cues.yaml` ==
  `8ab1eb70a299c1d35acfa473beb37715e32dd47e`;
  `git -c core.fileMode=false diff --name-only <base>..HEAD` shows NO `schema/`, NO `goldens/`, NO
  `app/`, NO `config/drafting/mixture-material-cues.yaml` path.
- Scope: diff file-set ⊆ the §Contract-header IN list (+ report + replay script + .artifacts raws as
  untracked). `grep -rn "Trypsin\|trypsin\|Clofibrate\|HepG2\|DMEM\|FBS" server/src --include='*.ts'`
  outside test files and outside the two YAML data files ⇒ EMPTY (rip-out rule: fixture strings live
  ONLY in tests + DATA).
- Replay: `cd server && npx tsx scripts/shqa3-mixture-replay.mts` ×10 → summary bars (§RED) in the
  report with artifact paths; orch re-runs mode 2 post-merge against :3093 (the coder NEVER restarts
  the lane stack; the strip needs no restart — cue data and the new drafting file are per-call, and
  no treeState/vocabulary file moves).

## Worker contract
- Worktree `<lane>/wt/SH-QA-3-lane2-l2t<tick>` off CURRENT trunk tip at dispatch (b200a669 at compose
  — RE-PIN); branch `cl/SH-QA-3-lane2-l2t<tick>`; report
  `<worktree>/.hermes/plans/reports/SH-QA-3-report.l2t<tick>.md`; end marker `SH-QA-3 DONE <sha>`.
- Commits: RED test commits first (`test(shqa3): …`), then `feat/fix(compiler): …`; never `git add -A`;
  every git call through `git -c core.fileMode=false`.
- exactOptionalPropertyTypes ON: new optional fields (`nounShape?`, stripped-slot records, conditional
  prompt clause) ride CONDITIONAL SPREADS only, never `: undefined`.
- SH-QB-1 LANDED (1caefbba) with its shape-fork leg PIN-ONLY — no normalizer-intake normalization
  exists (§A's strip site is unaffected; verified via the b200a669..27ef008f diff: zero touched files
  in normalizeScientistIntent/compileScientistIntent/resolution). The strip still must run before BOTH
  normalize and the door regardless (finding 2); cite SH-QB-1's loud-failure channel in the report's
  fix-(3) T-map rather than duplicating it.

## Reviewer bait (B1-B8 — try to break these)
- B1 NO LENGTH HEURISTIC AS POLICY: no `label.length >` / word-count threshold decides ANYTHING. T6's
  twin pins (short-redundant strips, long-non-redundant does not) are the mutation proof. The only
  thresholds are DATA in cue/nounShape YAML, interpreted generically.
- B2 NO PER-RECORD HARDCODE + CUES YAML BYTE-IDENTICAL: no sentence, reagent, or label literal in
  any src/ file (scope grep above); `mixture-material-cues.yaml` hash-identical to
  `8ab1eb70…` — the redundancy rule is not allowed to smuggle a "50/50 Trypsin-EDTA…" exempt entry;
  `exempt.names:` must not grow (per-record hardcode — CUE-EXEMPT-1/SH-QA-1 law).
- B3 THE MINT SURVIVORS: 'mystery flask', 'Equine Serum' (BLESS-locked mint offers,
  goldenIntentToClarification.test.ts:94/:255-257), '1 mM Clofibrate in DMSO', '5 mg/mL lysozyme in
  PBS', '0.1% Triton X-100 in water' (SH-QA-1's sibling canon, cueCascade), 'DNase/RNase Free Water',
  'DMEM/F12' keep their mint affordance / card affordance. Cue-hit alone MUST NOT refuse mint; a rule
  keyed on " in " or "%" alone is a DEFECT (it re-opens the clofibrate class fix 2 never asked for).
  The refusal never removes the QUESTION — only the mint affordance (P4).
- B4 MANIFEST MUST NOT MOVE, GOLDENS MUST NOT BLINK: MANIFEST hash `fbf743ab…` identical at delivery;
  `manifestHashMismatches` [] ; the vocabulary YAML is treeState-pinned (MANIFEST.yaml :14,
  sha256 `14d779ce…`) — ANY schema/ edit fails the golden suite and is a scope fail UNLESS the
  orchestrator's OQ1 ruling explicitly orders a blessed re-pin (the task's "vocabulary YAML" files
  line collides with the pinned rule; OQ1 resolves WHERE noun-shape DATA lives).
- B5 SH-QA-1 LAUNDED SHAPE IS SACRED: gated channel untouched (normalize :435/:794/:889, pass
  :76/:293-309); blob fact still raised on no-composition cue labels (P4, cueResolutionGate 13/13);
  content-keyed `factRequestId` untouched; NO same-slot fact merging; the strip fires ONLY alongside
  a component list — a cue-bearing label WITHOUT composition still gets blob + unknown-noun exactly
  as the e2eStubHonesty canon (minus the blob card's mint affordance per OQ3).
- B6 NO NEW WIRE/REASON CODES: `unknown-noun` unchanged; no `noun-shape-refused` invention; no
  ScientistIntentUnresolvedFact field; `allowCreateLocal` is a value-only flip on an existing field
  (types.ts:570). If the coder believes the mint refusal needs a wire change → stop_boundary: return
  to the architect with the payload.
- B7 THE STRIP IS NOT SILENT DATA LOSS AND NOT A REWRITE OF THE HELD DOC: the chat's held YAML stays
  verbatim (AgentOrchestrator hold sites untouched); the strip is an in-memory compile-input
  transform, one console.log per strip, idempotent (T5), reversible by construction (the composition
  carries every stripped fact — residue==∅ means nothing was lost). A reviewer should try: does the
  strip touch labware/source/target scalars? (must NOT — only scalar nouns redundant against THIS
  action's own component list); does it fire when composition entries < 2? (must NOT).
- B8 YAML-RELOAD TRAP: the new nounShape section loads PER CALL (drafting-config precedent,
  normalize :38-44/:253 — never process-cached, so a data edit needs no restart); the vocabulary is
  CACHED (vocabulary.ts :265-280) and untouched. Any "live" claim must state whether a restart was
  done; the coder never restarts :3093/:5193.
- exactOptionalPropertyTypes sites: `nounShape` config fields, `stripped` records, conditional prompt
  arm — conditional spreads only.

## Open questions (orchestrator rules)
- OQ1 — WHERE noun-shape DATA lives. The task files line says "vocabulary YAML", but the vocabulary
  is MANIFEST-treeState-pinned (MANIFEST.yaml :14) so ANY policy addition there forces a re-bless the
  task's own "goldens green / manifest must not move" bars forbid, and the lint DSL (LintEngine +
  lint-v1) validates STORED RECORD DOCUMENTS at write time — it has no vocabulary for gating a
  RUNTIME mint offer. Recommended: `nounShape:` section in `config/drafting/shorthand-drafting.yaml`
  (the shorthand drafting policy file, per-call precedent, none of the pins). Alternative if ruled: a
  dedicated `config/drafting/noun-shape.yaml`. If the orchestrator instead insists on
  vocabulary/lint-DSL expression, the stop_boundary answer is: return the required predicate shape
  (a runtime mint-offer gate keyed to declared phrase patterns) to the architect — checked:
  scientist-intent-vocabulary.lint.yaml P1-P5 scope record well-formedness only; LintEngine is never
  invoked on clarification labels anywhere in server/src.
- OQ2 — STRIP ARG SELECTION, generic vs data-named. §A's generic reading ("any scalar resolvable arg
  redundant against a sibling many-cardinality arg on the same action") adds ZERO name literals and is
  spec-default, but it also suppresses, e.g., a top-level `labware` label that happens to enumerate
  the same words as a composition (measured: nothing shipped does — the strip's residue test makes the
  false-fire surface tiny, and T4/T6 pin the direction). Fallback if the orchestrator prefers
  precision: the strip honors a `redundantAgainst:` declaration slot on the many-arg's contract
  (add_material.composition + seed.composition), read from vocabulary — but that rides the pinned
  vocabulary file → collides with B4 unless OQ1-ruling a schema change + bless. Checked: engine scalar
  arm resolutionEngine.ts:314-318; normalize's exemption already names arg kinds via argContracts
  (:742-752), so no new name literal exists either way.
- OQ3 — THE e2eStubHonesty CANON RE-PIN. Fix 2 flips `allowCreateLocal` true→false on the blob-label
  card pinned at e2eStubHonesty.test.ts:223 (prompt text :218 also carries ", or create a local
  term"). Ruling requested: ADOPT the deliberate re-pin (spec default — it is the defect being
  corrected, diff disclosed, rest of canon intact) vs SCOPE the refusal to engine candidates only
  (leaves the card still SAYING "create a local term" for a sentence — reads as dead-affordance
  chrome, the exact SH-QA-2 defect class). Checked: first-hand at :218/:223; no other test greps
  allowCreateLocal on a blob label (workspaceAction/sequences mint pins are different surfaces,
  untouched).

## Assumptions the coder may NOT make
- May NOT assume the resolve_nouns door reads the NORMALIZED output — it reads the raw `intent` doc
  (finding 2); a normalize-only strip leaves the sentence card fully alive.
- May NOT assume cue-hit ⇒ mint-refusal (finding B3 — clofibrate/lysozyme/Triton canon says NO).
- May NOT assume a length or word-count threshold is policy (B1), nor that redundancy may be judged
  without the actual component list (T6).
- May NOT assume the blob bar is this defect (when composition rides, `declaresComponents` never
  raises it — finding 1); the defect is the ENGINE unknown-noun + the CARD affordance.
- May NOT assume MANIFEST can be re-blessed, goldens edited, vocabulary touched, or cues YAML grown
  (B2/B4), nor that a new goldens fixture is needed (in-test fixture objects are exported precisely
  for this — finding 7).
- May NOT assume SH-QB-1's merged recompile/round-trip machinery fixes the prose-blob case (its
  shape-fork leg is PIN-ONLY; the silent-empty fix lives on the recompile route, not on the chat
  hold/fold arm) — re-anchor its IntentCompileHandlers behavior at the branch point and hand back
  divergence evidence; no edits to IntentCompileHandlers, client.ts, AiTabPanel, AgentOrchestrator
  fold legs.
- May NOT assume app/ needs anything (payload assertions only), nor that the app tsc baseline is 0
  (23), nor the server tsc baseline is 0 (1 at b200a669 — set-diff, never re-baseline).
- May NOT assume the 10-run replay can be satisfied by stubs — the nondeterminism probe runs the REAL
  inference client (live-smoke discipline), 10 runs, raws retained; and may NOT assume a run failing
  to ghost means a prose-blob card (a named unknown-noun on an unseeded component passes the bar —
  §RED bars are precise).
- May NOT restart the lane stack, `git add -A`, run git without `-c core.fileMode=false`, or touch
  Brad's tree / :3001 / :5174.

SPEC-DRAFT-STATE: draft for orchestrator review; canonical promotion is the orchestrator's call.

## ORCHESTRATOR RULINGS (l2t2250, 2026-10-15T22:55 EDT) — CANONICAL
- OQ1 RULED — ADOPT: noun-shape DATA = `nounShape:` section in `config/drafting/shorthand-drafting.yaml`
  (per-call drafting-config precedent, verified first-hand: loadMixtureCues normalize :38-44/:253;
  vocabulary is MANIFEST-treeState-pinned and LintEngine only validates STORED documents — runtime
  mint gating does not belong there). NO schema/ edits, NO re-bless. Malformed ⇒ throws naming the
  path; absent section ⇒ NO refusals (disclosed in report).
- OQ2 RULED — ADOPT the GENERIC strip (scalar resolvable arg redundant against a sibling many-card
  arg on the SAME action; zero name literals). T4/T6 pin the direction; the residue test is the
  false-fire guard. The data-named `redundantAgainst:` fallback is NOT authorized in this item
  (it rides the pinned vocabulary file ⇒ B4). If measurement shows generic over-firing, HAND BACK
  with the payload — do not widen scope silently.
- OQ3 RULED — ADOPT the deliberate e2eStubHonesty re-pin: blob-label card `allowCreateLocal`
  true→false + prompt clause dropped conditionally (:218/:223 verified first-hand). Engine-only
  refusal REJECTED — a card still SAYING "create a local term" while the engine refuses is the
  dead-affordance defect class. Diff disclosed in the report; the rest of the canon stays.
- STRIP SITE CONFIRMED first-hand at trunk: buildRegistry passes the RAW `intent`
  (compileScientistIntent.ts :153-154 `createResolveNounsPass({intent, ...})`), normalize is a
  separate call (:230) — the strip MUST precede both, exactly as §A designs.
- BASE PIN AT DISPATCH: trunk 8fc7be5b (code tip 27ef008f). MANIFEST
  fbf743ab1384778de43eeb113da0f0857eef9fce, cues 8ab1eb70a299c1d35acfa473beb37715e32dd47e
  (re-verified 22:55 EDT). Server tsc baseline 1, app 23 — set-diff discipline.
- Worktree/branch: wt/SH-QA-3-lane2-l2t2250 + cl/SH-QA-3-lane2-l2t2250 off CURRENT trunk tip at
  coder start. Report .hermes/plans/reports/SH-QA-3-report.l2t2250.md; end marker
  `SH-QA-3 DONE <sha>`.
SPEC-DRAFT-SHQA3: PROMOTED by orchestrator l2t2250.
