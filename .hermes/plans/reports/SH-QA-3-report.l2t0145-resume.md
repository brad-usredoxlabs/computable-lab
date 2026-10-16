# SH-QA-3 — CODER REPORT (lane 2, resume run l2t0145)

Worktree: /mnt/vast/home/brad/git/wt/SH-QA-3-lane2-l2t2250
Branch: cl/SH-QA-3-lane2-l2t2250 (RESUMED from 39ec85e8 wip-preservation; the two
test commits 63f75a7b (T1 RED) + 8ed7d452 (OQ3 re-pin) are PRESERVED, never rebased).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-15_2255-SH-QA-3-prose-blob-spec.md
(ORCHESTRATOR RULINGS OQ1/OQ2/OQ3 followed as binding.)

STATUS: GREEN phase verified; replay + final verification in progress (this file is
written incrementally — a mid-run death never loses state).

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
  resolveNounsPass 24/24 — GREEN (74/74 in the 7-file run).
- Targeted cluster `npx vitest run src/compiler/scientistIntent/
  src/compiler/resolution/ src/ai/`: fail-file set is a SUBSET of the base
  capture (/tmp/shqa3-base-failfiles.txt) — `comm -23 head base` EMPTY (no new
  fail files). Fail files are the known load-timeout flap class + the
  pre-existing unhandled-rejection debt (AgentOrchestrator.golden*/bypass/
  tubeGate "Should not be called" rejections present at base). Flap proof:
  vocabularyRipOut + realizationGolden failed in the cluster run but pass in
  isolation; the 12-file fail set in run 1 vs 46-file set in run 2 with an
  IDENTICAL 10-assertion-fail core = load flapping, not behavior.
  [re-run numbers appended below when the final verification run completes]

## 4. Typecheck + hash bars

- server tsc: 1 error — src/ai/AgentOrchestrator.ts(345,18) TS2339 (the base
  baseline error; set-diff vs base EMPTY — same single error, line moved 344->345
  because this item's +11-line strip block sits above it in the file... [verify
  line-shift attribution in final run]).
- app tsc: 23 (baseline; server-side item, zero app errors introduced).
- MANIFEST hash: fbf743ab1384778de43eeb113da0f0857eef9fce (UNCHANGED).
- cues hash: 8ab1eb70a299c1d35acfa473beb37715e32dd47e (UNCHANGED).
- diff --name-only base..HEAD: NO schema/, NO goldens/** fixture or MANIFEST,
  NO app/, NO mixture-material-cues.yaml (goldens/ delta is ONLY the new
  in-test sibling test file goldenProseBlobStrip.test.ts — allowed by §File 3).

## 5. Replay (mode 1, 10 runs) — IN PROGRESS

server/scripts/shqa3-mixture-replay.mts written (real initializeApp over the
lane data repo store via CONFIG_PATH=/mnt/vast/home/brad/git/cl-integration-2/
config.yaml, active-profile inference client resolved at run time — no model
name literal, live-smoke discipline; orchestrator.run on surface
workspace.deck with the exact wave-header prompt; per-run raw emissions +
strip-log captured). Running now; bars + artifact paths appended below.

## 6. Assumptions / disclosures

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
