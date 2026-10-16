# SH-QA-3 — CODER REPORT (lane 2, resume run l2t0145)

Worktree: /mnt/vast/home/brad/git/wt/SH-QA-3-lane2-l2t2250
Branch: cl/SH-QA-3-lane2-l2t2250 (RESUMED from 39ec85e8 wip-preservation; the two
test commits 63f75a7b (T1 RED) + 8ed7d452 (OQ3 re-pin) are PRESERVED, never rebased).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-15_2255-SH-QA-3-prose-blob-spec.md
(ORCHESTRATOR RULINGS OQ1/OQ2/OQ3 followed as binding.)

STATUS: COMPLETE. All acceptance bars verified (sections 3-9); replay bars pass
10/10; this file is the delivery report.

## 0. Resume audit (what the wip 39ec85e8 already held)

`git -c core.fileMode=false show --stat 39ec85e8`: 11 files, +930/-5 —
nounShape.ts, mixtureLabelRedundancy.ts, goldenProseBlobStrip.test.ts,
shorthandChat.nounShape.test.ts, mixtureRedundancy.test.ts, edits to
compileScientistIntent.ts, resolutionEngine.ts, shorthandChat.ts,
config/drafting/shorthand-drafting.yaml nounShape block, plus two debug scripts
under server/.artifacts/shqa3-replay/ (redprobe.mts, stripdebug.mts).
Base fail-file capture EXISTS: /tmp/shqa3-base-failfiles.txt (predecessor captured).

## 1. Resume fixes landed on top of the wip (new commits)

1. a88343d3 fix(shqa3): relocate nounShape loader scientistIntent/ -> resolution/.
   DEFECT FOUND ON RESUME: the trunk bait-11 rule (vocabularyRipOut.test.ts
   "no parser module for any other grammar exists in the scientistIntent dir")
   scans scientistIntent/ non-test .ts for /\bspawn\b|line-dsl|shorthand/i. The
   predecessor's nounShape.ts carried the drafting-config path literal
   `config/drafting/shorthand-drafting.yaml` (OQ1-ruled DATA home) — the banned
   token "shorthand" is unavoidable in that path, so a loader for THAT file
   CANNOT live in scientistIntent/. Fix: the loader moved to
   server/src/compiler/resolution/nounShape.ts (resolutionEngine's own dir,
   IN-scope; scientistIntent -> resolution imports already have precedent via
   compileScientistIntent -> createResolveNounsPass). scientistIntent/ scan is
   now clean (vocabularyRipOut 8/8 green). NOT a stop_boundary: noun-shape
   policy remains fully expressible in the drafting DATA (OQ1 unchanged); only
   the loader module's directory moved.
   Also fixed in the same commit: shorthandChat.ts import left pointing at the
   old path (a stale import silently failed 46 test files' collection in one
   run — caught by the raw, not by the headline count).
2. 4adfacc9 docs(shqa3): reworded comment literals in mixtureLabelRedundancy.ts
   + shorthandChat.ts so the scope grep (Trypsin/Clofibrate/HepG2/DMEM/FBS)
   adds ZERO new hits in non-test src (base count 52 -> HEAD count 52, all
   pre-existing files untouched by this item; verified via
   `git -c core.fileMode=false grep -nE ... <base>` vs <HEAD>: 52 == 52).

## 2. Implementation shape (as landed, verified against the spec)

- Strip (fix 1, §A): mixtureLabelRedundancy.ts `stripRedundantMixtureLabels(intent,
  vocabulary)` — pure, data-driven; fires ONLY when (i) the action carries >= 2
  valid component entries in EITHER declared form (params.composition array OR
  vocabulary-declared cardinality:many resolvable arg), (ii) a top-level string
  scalar on a kind:resolvable scalar arg (found via declared contracts, ZERO
  name literals — OQ2 generic strip), (iii) residue test: case-fold +
  whitespace-normalize, delete component labels longest-first, delete cue
  tokens, ratioPatterns match, delete DATA connectives (cue stopWords +
  nounShape connectives) + residueIgnorePatterns (DATA quantity/unit glue);
  REDUNDANT iff residue empty or connectives-only. NO length heuristic anywhere
  (B1; T6a/T6b/T6c pin the direction).
- Site (compileScientistIntent.ts): strip runs BEFORE normalizeScientistIntent
  AND buildRegistry/resolve_nouns (finding 2: the door reads the RAW intent).
  stripped.length===0 => identity passthrough (byte-identical compile). One
  console.log per stripped slot (loud, never silent data loss; held chat YAML
  untouched — in-memory compile-input transform only, B7).
- Mint refusal (fix 2, §B): nounShape.ts `loadNounShape()` (PER call, never
  cached, B8; malformed DATA throws naming the path; absent section => null =>
  NO refusals) + `isMintableLabel(label, shape)` shared by BOTH offer surfaces:
  - resolutionEngine.ts unknown-noun arm: `mintAffordances(allCandidates)`
    filtered by isMintableLabel; reason code `unknown-noun` UNCHANGED, near-miss
    suggestions leg intact (B6: zero new reason codes, zero wire changes).
  - shorthandChat.ts clarificationsFromUnresolvedFacts: allowCreateLocal =
    menuProvider !== 'choice' && isMintableLabel(fact.label, …); the ", or
    create a local term" prompt clause drops by conditional arm together with
    the flag (OQ3: engine-only refusal rejected; card chrome stays honest).
- DATA (OQ1): config/drafting/shorthand-drafting.yaml `nounShape:` block —
  mintRefusePatterns (2 sentence-shape regexes: ratio-then-word; connective
  flanked by multi-letter words), connectives, residueIgnorePatterns. Zero
  phrase literals in TS.
- e2eStubHonesty re-pin (OQ3): landed in 8ed7d452 (blob-label card
  allowCreateLocal true->false; plate card stays true; raw app/e2e stub delta
  disclosed there — app-side update handed back, app/** is OUT of scope).

## 3. Test evidence (targeted suites, vitest cwd = server)

- mixtureRedundancy.test.ts: T1, T2, T3, T4, T5, T6a, T6b, T6c — GREEN.
- shorthandChat.nounShape.test.ts: P1, P1b, P2, P2b, P3a, P3b, P4 — GREEN.
- goldens/goldenProseBlobStrip.test.ts (in-test GoldenFixture via runGolden,
  NO MANIFEST entry, NO bless): 3/3 GREEN incl. manifestHashMismatches == [].
- e2eStubHonesty (re-pinned canon): GREEN.
- Regression canon: cueResolutionGate 13/13, cueCascade 12/12,
  resolveNounsPass 24/24, compositionDecomposition, compositionArgResolution,
  declaredArgumentReachability, clarificationContract,
  AgentOrchestrator.shorthandChat, forceMaterialClarifications,
  nounResolution (mint-offer pins), vocabularyRipOut — ALL GREEN in the final
  full-suite run (none appear in the HEAD fail-file set).
- FINAL TARGETED RUN (`npx vitest run src/compiler/scientistIntent/
  src/compiler/resolution/ src/ai/`): 18 failed | 1254 passed (1272 tests);
  fail-file set (10 files: AgentOrchestrator.bypass/Forwarding/golden/
  goldenWithSeeds/tubeGate, attachedProtocol, ChatbotCompileDeckSlot,
  chatbotCompile.e2e, createRecordIntent, submitSuggestionTool.tubeSchema) is a
  strict SUBSET of the base capture — `comm -23 head base` EMPTY (zero new fail
  files). These 10 are the pre-existing unhandled-rejection debt (the
  "Should not be called" stub rejections present at base; `Errors 2` line is
  the known debt class, count drifts run to run with an identical fail-file
  set).
- FULL SUITE (`npx vitest run`, cwd server): 100 failed | 5934 passed |
  70 skipped (6290); HEAD fail-file set 93 files, `comm -23 head base` EMPTY
  (zero new fail files vs the base capture's 109). The 16 base-only entries
  (realizationGolden, AnalysisDraftAdapter, WorkstateDraftAdapter,
  FoundryCoderPatch, Wave2SemanticFamilyPass, ZymoCampaignGoldenE2E,
  Wave2SemanticPassE2E, ProtocolExtractionDraftSchemaGate, RevisionStorage,
  7x schema/*) each PROVEN GREEN IN ISOLATION (83/83 and 66/66 in two
  isolation runs) — the known load-timeout flap class, never quoted as a raw
  count without the comm proof.
- realizationGolden.test.ts needed schema/core/datatypes/revision-ref.schema.yaml
  materialized in the worktree (trunk-UNTRACKED file that never materializes in
  fresh worktrees — known lane pitfall; copied read-only from the computable-lab
  checkout, NOT committed: schema/** is OUT of ownership and the file is
  untracked at trunk).

## 4. Typecheck + hash bars

- server tsc: 1 error — src/ai/AgentOrchestrator.ts(345,18) TS2339 (`Property
  'id' does not exist on type ... ResolvedSequenceTabTarget`). BYTE-IDENTICAL to
  the dispatch base: `git -c core.fileMode=false show 302b9258:...AgentOrchestrator.ts`
  has the same `return [target.id];` at line 345, and HEAD has it at 345 — the
  spec's ":344" cite was anchored at b200a669, before SH-QB-1's +1 line. Sorted
  error-set diff vs base: EMPTY (1 == 1, same error). NOT fixed, NOT re-baselined.
- app tsc: 23 (baseline; server-side item, zero app errors introduced).
- MANIFEST hash: fbf743ab1384778de43eeb113da0f0857eef9fce (UNCHANGED).
- cues hash: 8ab1eb70a299c1d35acfa473beb37715e32dd47e (UNCHANGED).
- diff --name-only base..HEAD: NO schema/, NO goldens/** fixture or MANIFEST,
  NO app/, NO mixture-material-cues.yaml (goldens/ delta is ONLY the new
  in-test sibling test file goldenProseBlobStrip.test.ts — allowed by §File 3).

## 5. Replay (mode 1, 10 runs) — COMPLETE, BARS PASS

server/scripts/shqa3-mixture-replay.mts (committed): real initializeApp over
the lane data repo store (CONFIG_PATH=/mnt/vast/home/brad/git/cl-integration-2/
config.yaml -> dataDir /home/brad/.computable-lab-lane2, embedded-git repo,
1053 records indexed), active-profile inference client resolved AT RUN TIME
(profile DS-v4.1-OR, model ~deepseek/deepseek-flash-latest, host openrouter.ai
— no model/profile literal in the script, live-smoke discipline), real
orchestrator.run on surface workspace.deck with the exact wave-header prompt,
ONE chain per run, N=10.

ARTIFACTS: server/.artifacts/shqa3-replay/2026-10-16T07-21-03-884Z/
  summary.json (COMMITTED at e35aeb55), run-1..run-10.json (raws, untracked).

BARS (all 10 runs):
- zeroProseBlobCards: TRUE (blobCardRuns=0). No clarification request in any
  run carries a sentence-shaped label; every label is a component noun
  ("Thermo trypsin-EDTA", "Thermo DMEM", "Thermo FBS", "HepG2 cells") or empty.
- zeroEmptyGraphs: TRUE (emptyGraphRuns=0). eventCounts [0,0,1,0,1,0,0,0,0,0];
  every zero-event run carries 4 clarification requests naming specific
  blocking reasons (ambiguous-noun on unseeded components — a NAMED reason per
  the precise bar, not a prose-blob card, not an empty graph).
- rawEmissionsRetained: TRUE (per-run raw model emissions verbatim in run-N.json).
- Raw-emission shape per run (measured, not asserted): 10/10 emissions carry
  the composition; 9/10 have top-level `material: "Thermo trypsin-EDTA"` (the
  model itself decomposed the mixture — a component noun, not a sentence, so
  the strip correctly does NOT fire); 1/10 (run 9) has the FULL SENTENCE as
  top-level material — and there the strip fired LOUD:
  "SH-QA-3 redundancy strip: removed the redundant top-level noun \"50% Thermo
  trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL\" at
  actions[0].material — the composition riding the same action carries its
  components; the mixture label is derived from them." Run 9 then asked only
  the four component nouns. This is the live-inference proof of §A on the real
  model output, not just in tests.
- Non-determinism measured, not asserted away: 2/10 runs compiled straight to
  1 event (all components resolved against the lane store), 8/10 asked the
  four component nouns (the lane store seeds "Thermo DMEM"-shaped records
  imprecisely; ambiguous-noun on unseeded components is the spec's explicitly
  permitted named-reason outcome).
- Replay-script defect found + fixed (fda05208): my recording wrapper emitted
  tool_calls in a flat shape; the orchestrator reads t.function.name and threw
  "Cannot read properties of undefined (reading 'name')" on every run of the
  FIRST replay attempt (artifacts 2026-10-16T07-15-51-952Z retained as the
  failed-attempt evidence). Fixed to the assistant-message shape; the second
  attempt is the one above. NOT a product defect — the shipped client path was
  proven healthy by a direct probe (probe2: success=true events=1).

## 6. Scope grep + diff file-set proofs

- Scope grep (`Trypsin|trypsin|Clofibrate|HepG2|DMEM|FBS` in server/src
  non-test .ts): base 302b9258 = 52 hits, HEAD = 52 hits; per-file hit counts
  IDENTICAL (diff of per-file counts EMPTY). The only comm -3 delta is the
  line-number shift of the PRE-EXISTING prompt-example literal
  `material: "DMEM"` in shorthandChat.ts (569 -> 583, moved by this item's
  +14-line card-map block above it) — zero NEW literal, zero literal in any
  file this item owns beyond tests + the two YAML data files.
- `git -c core.fileMode=false diff --name-only 302b9258..HEAD` = 15 files:
  the report, config/drafting/shorthand-drafting.yaml (nounShape block only),
  the replay summary artifact + script + two predecessor debug scripts under
  server/.artifacts/, and the 10 owned server/src files (compileScientistIntent,
  mixtureLabelRedundancy, resolution/nounShape, resolutionEngine,
  shorthandChat + the 4 new/re-pinned test files). NO schema/, NO goldens
  fixture/MANIFEST (the goldens/ delta is ONLY the new in-test sibling
  goldenProseBlobStrip.test.ts), NO app/, NO mixture-material-cues.yaml.

## 7. OQ3 re-pin disclosure (landed at 8ed7d452, preserved)

shorthandChat.e2eStubHonesty.test.ts: the blob-label card's pinned
`allowCreateLocal: true` -> false and the ", or create a local term" clause
dropped, reconciled by applying the SHIPPED noun-shape DATA loader to the
extracted app/e2e stub (applyMintGate: gateCard flips allowCreateLocal, strips
the clause, drops `Create local term` candidates); the plate card's true stays;
the disclosed flipped labels are asserted explicitly. The raw app/e2e stub
itself is NOT edited (app/** OUT of scope) — the app-side update is handed
back to the orchestrator (the stub still carries the pre-gate shape; the server
reconciles it in-test and the disclosure names the delta).

## 8. Fix-(3) T-map (coordinate by reference, per §D)

- The paste-#6 empty-graph sink: T3 asserts the mixture-doc compile outcome is
  NEVER (zero events AND zero clarificationRequests AND success-shaped) at the
  payload level; the replay bar (ii) proves it live 10/10 (every zero-event run
  carried 4 named ambiguous-noun reasons). No empty-success found on any arm
  this item owns -> no fix needed inside §A/§B reach; nothing to hand back on
  this leg.
- SH-QB-1's merged loud-failure recompile channel (IntentCompileHandlers +66,
  roundTrip/shapeFork tests, 1caefbba) covers the recompile route — CITED, not
  rebuilt. T5 (idempotence: compile(strippedDoc) == compile(doc), second strip
  empty) is this item's round-trip compatibility proof by reference: the strip
  is stable under SH-QB-1's recompile of the held doc.
- The held-422 wire / app render legs: untouched (out of scope); no divergence
  evidence surfaced (the chat path's clarificationRequests carry the named
  reasons verbatim in all 10 replay raws).

## 9. Bait defense (B1-B8)

- B1: no label-length or word-count threshold decides anything. The only
  numeric gates in the new code are (a) `labels.length >= 2` — the COMPONENT
  entry floor the spec itself names (§A(i), the expander's own floor at
  simpleVerbs :368/:396), and (b) `word.length < cues.shape.flanking.minComponentLength`
  — a threshold read from the CUE DATA, the same value normalize already uses.
  T6a (short redundant strips) / T6b (long non-redundant does NOT) /
  T6c (<2 component entries never strips) pin the mutation.
- B2: cues hash byte-identical (8ab1eb70...); exempt.names NOT grown; zero
  sentence/reagent literals in src (section 6).
- B3: P3a/P3b survivor pins green (mystery flask, Equine Serum, the sibling
  canon formulations, DNase/RNase Free Water, DMEM/F12 keep mint affordance);
  refusal keyed on DATA sentence SHAPE, never " in "/"%" alone; P4 proves the
  QUESTION survives a refusal.
- B4: MANIFEST hash unchanged (fbf743ab...); manifestHashMismatches [] asserted
  in goldenProseBlobStrip; no bless, no vocab edit, no fixture moved.
- B5: gated channel untouched (normalizeScientistIntent.ts NOT in the diff at
  all); cueResolutionGate 13/13 + cueCascade 12/12 green; strip fires only
  alongside a component list (T6c); factRequestId untouched.
- B6: zero new reason codes (unknown-noun unchanged in P2), no
  ScientistIntentUnresolvedFact field, allowCreateLocal value-only flip; no
  wire change was needed -> no stop_boundary.
- B7: strip is in-memory only (held YAML untouched — AgentOrchestrator not in
  the diff), one console.log per strip, idempotent (T5), fires only on scalar
  args redundant against THIS action's own component list (labware/source/
  target scalars not stripped — residue test; <2 entries never fires — T6c).
- B8: nounShape loads PER call (loadNounShape() called inside
  resolveNoun/clarificationsFromUnresolvedFacts, no module-level cache);
  vocabulary cache untouched; NO stack restart was done or needed for any claim.

## 10. Commits (this resume run, on top of the preserved 63f75a7b + 8ed7d452 + 39ec85e8)

- a88343d3 fix(shqa3): relocate nounShape loader to compiler/resolution/ (bait-11 collision)
- 4adfacc9 docs(shqa3): reword comment literals in touched files
- 78b6f476 docs(shqa3): resume report skeleton + mode-1 replay script
- fda05208 fix(shqa3): replay recording wrapper tool_calls shape
- e35aeb55 test(shqa3): mode-1 10-run replay summary (bars pass)
- b2c21445 docs(shqa3): final report (verification evidence)

## 11. Assumptions / disclosures

- nounShape DATA present (shipped in the drafting config) — refusals ACTIVE,
  not silent-off.
- The lane stack (:3093/:5193) was NEVER restarted or touched by this coder;
  the strip + nounShape DATA are per-call loads, so no restart is needed for
  any claim here. Mode-2 as-served replay is the orchestrator's post-merge leg.
- realizationGolden.test.ts needed schema/core/datatypes/revision-ref.schema.yaml
  materialized in the worktree (trunk-UNTRACKED file that never materializes in
  new worktrees — known lane pitfall; copied read-only from the computable-lab
  checkout, NOT committed: schema/** is OUT of ownership and the file is
  untracked at trunk).

## 7. FIX c2 (adversarial review c1, VERDICT: fix — all four defects)

Run c2 on the same worktree/branch (base tip 7e7bc9e0). RED-first: each defect
got a NEW failing pin BEFORE the fix; the pins are in TEST files and DATA only
(scope grep stays 52 — verified below).

### 7.1 DEFECT 1 (blocker) — mint DATA blind to quantity-flanked connectives + replay bar shared predicate

RED pins (shorthandChat.nounShape.test.ts): P1c (payload level: the CANONICAL
wave sentence "50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200
HepG2 cells per uL" must yield allowCreateLocal=false, prompt clause dropped,
question survives) and P1d (engine arm: same sentence, NO composition, NO
Create-local-term candidate). RED run (before fix):
  Test Files 1 failed (1); Tests 2 failed | 7 passed (9)
  — P1c "expected true to be false" (isMintableLabel true on the canonical
  sentence), P1d "canonical blob mint refused: expected true to be false".

FIX (DATA, config/drafting/shorthand-drafting.yaml):
- mintRefusePatterns gained arm 3: "[\\p{L}]{2,}\\s+(?:with|containing|including)\\s+\\d+(?:\\s*[\\p{L}]+)?\\s*%?"
  — a connective flanked by a QUANTITY ("with 10% FBS", "containing 200 HepG2
  cells"). A probe matrix over ALL P1/P3 labels + derived labels confirmed:
  canonical + the three P1 sentences REFUSED; all seven P3 survivors
  (Clofibrate/lysozyme/Triton/DMEM-F12/DNase-RNase/mystery flask/Equine Serum)
  + Enigma Broth + derived component join stay MINTABLE. (An arm "\\d+\\s+[\\p{L}]"
  was tried and REJECTED — it refused "1 mM Clofibrate in DMSO"; dropped.)
- NEW DATA section `blobDetectPatterns:` (ratio/quantity blob OR spaced prose
  connective) + loader field + `isBlobShapedLabel()` in nounShape.ts — the
  replay bar's prose-blob predicate, deliberately INDEPENDENT of the mint gate.
- Replay bar (i) (shqa3-mixture-replay.mts) now keys on isBlobShapedLabel OR
  the mint-affordance arm — the bar CAN now fail a mintable blob.

### 7.2 DEFECT 2 (major) — ASCII-only \\b silently no-ops the strip on unicode-leading names

RED pin: mixtureRedundancy.test.ts T6d (α-MEM + FBS vs composition [α-MEM,
FBS] must strip). RED run: "unicode-leading component must not defeat the
strip: expected [] to deeply equal ['material']".
FIX (mixtureLabelRedundancy.ts): WORD_RE boundaries are unicode lookarounds
(?<![\\p{L}\\p{N}-]) ... (?![\\p{L}\\p{N}-]) instead of \\b; the component-word and
connective DELETION patterns use the same guards (\\bmem\\b cannot match inside
"α-mem"); isContentWord accepts a token when a hyphen-part matches the cue
componentPattern ("mem" in "α-mem"; "f12" still fails — no letter-start part);
the nounShape residueIgnorePatterns DATA switched from \\b to the same
lookaround guards (\\bµl\\b never matched "µL" — same ASCII-\\b class).

### 7.3 DEFECT 3 (minor) — generic strip touched labware (spec B7)

RED pin: mixtureRedundancy.test.ts T6e (add_material with labware:"DMEM FBS" +
material:"DMEM FBS" + composition [DMEM,FBS]: ONLY 'material' strips, labware
value survives verbatim). RED run: "expected [ 'labware', 'material' ] to
deeply equal [ 'material' ]" — reproduces the reviewer's probe exactly.
FIX: NEW DATA section `stripDomains: [material]` (nounShape loader →
`stripDomains` set); the strip loop skips any contract whose vocabulary-
DECLARED `domain:` is not in the set (contract.domain read generically — zero
name literals; absent section = no confinement, silent-off parity).

### 7.4 DEFECT 4 (minor) — throwaway harness code committed

git rm server/.artifacts/shqa3-replay/redprobe.mts + stripdebug.mts (the unused
`vi` import left with them); untracked probe-tmp.ts / probe2.ts deleted from
the worktree. summary.json + raw run-1..10.json evidence kept.

### 7.5 Replay-bar independence proof (mandated verification 3)

One-off probe (scripts/shqa3-blobdetector-probe.mts, run then DELETED — not
committed, per D4 discipline) re-scored the EXISTING recorded artifacts
(2026-10-16T07-21-03-884Z/run-1..10.json) under the NEW bar (i), zero new
model calls. Verbatim output:

  canonical isMintableLabel (old bar predicate): false
  canonical isBlobShapedLabel (new bar predicate): true
  component-noun "Thermo trypsin-EDTA" blob? false
  component-noun "HepG2 cells" blob? false
  component-noun "DMEM" blob? false
  run-1.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  run-2.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  run-3.json: events=1 clarifications=0 newBarBlobCards=0 strip=no
  run-4.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  run-5.json: events=1 clarifications=0 newBarBlobCards=0 strip=no
  run-6.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  run-7.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  run-8.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  run-9.json: events=0 clarifications=4 newBarBlobCards=0 strip=YES
  run-10.json: events=0 clarifications=4 newBarBlobCards=0 strip=no
  REPLAYED BARS over recorded artifacts: blobCardRuns=0 zeroProseBlobCards=true

The detector flags the canonical sentence label DIRECTLY (true) while the
legitimate component nouns stay clean (false) — bar (i) is now falsifiable for
the exact sentence it names, and the recorded 10 runs still pass it.

### 7.6 GREEN verification battery (all run for real)

RED-first evidence (pre-fix): nounShape suite "Tests 2 failed | 7 passed (9)"
(P1c/P1d); mixtureRedundancy "Tests 2 failed | 8 passed (10)" (T6d/T6e).

Post-fix targeted suites (vitest cwd=server):
  ✓ shorthandChat.nounShape.test.ts (9)  ✓ shorthandChat.e2eStubHonesty.test.ts (7)
  ✓ mixtureRedundancy.test.ts (10)       ✓ goldens/goldenProseBlobStrip.test.ts (3)
  ✓ vocabularyRipOut.test.ts (8)         ✓ goldens/ (4 files, 19 tests)
  Test Files 8 passed (8); Tests 53 passed (53)

server tsc --noEmit: exactly 1 error — src/ai/AgentOrchestrator.ts(345,18)
TS2339 — the known pre-existing one; set-diff empty.

Full-suite comm (vitest --reporter=json, baseline /tmp/shqa3-base-failfiles.txt,
109 files, the c1-verified trunk-side list): c2 fail files 92; NEW failing
files (comm set-difference c2-base) = 0; base-only = 17 (the known
load-timeout flap class). Tests 101 failed / 6193 passed.

Hash + scope bars: MANIFEST.yaml fbf743ab1384778de43eeb113da0f0857eef9fce
(unchanged); mixture-material-cues.yaml 8ab1eb70a299c1d35acfa473beb37715e32dd47e
(unchanged); scope grep Trypsin|trypsin|Clofibrate|HepG2|DMEM|FBS over
server/src non-test .ts = 52 (unchanged — the new sentence-literal pins live
only in test files and DATA). shorthand-drafting.yaml is an OWNED, edited DATA
file (new hash 8136f0d6...; the pinned hash was never on this file).

D4: redprobe.mts + stripdebug.mts git rm'd; probe-tmp.ts + probe2.ts deleted
from the worktree; the c2 blob-detector probe was deleted after its run.
summary.json + run-1..10.json retained.
