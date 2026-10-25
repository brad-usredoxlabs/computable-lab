# MINT-FLOOR-UI-1 — coder report (wip l2t0015)

Item: term-mint polish — exactly ONE "Create local term" row per noun.
Worktree: /mnt/vast/home/brad/git/wt/MINT-FLOOR-UI-1-lane2-l2t0015
Branch: wt/MINT-FLOOR-UI-1-lane2-l2t0015 @ base e68a6271
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-17_MINT-FLOOR-UI-1-mint-row-dedup-spec.md
Adjudication honored: OQ1 STRICT (one mint affordance total on the held card),
OQ2 re-bless granted ONCE for exactly the 4 named records + MANIFEST hashes in the
SAME commit as the fix, OQ3 canned 2x-mint e2e shapes STAY (spec file byte-unchanged).

## Commits (RED -> GREEN ordering visible)

1. 2b6e0ef3 test(mint-floor-ui-1): RED pins — AC1 (nounResolution mint-floor-dedup),
   golden mint COUNT assertions x4, held-card AC3 (clarificationCards test 9). +131.
2. 9d527cef fix(resolution): Edit 1 engine dedup + golden re-bless ONCE (4 __records__
   + MANIFEST sha256 entries, SAME commit per OQ2). 6 files, +42/-10.
3. 6893c04e fix(protocol-thread): Edit 2 held-card keyed mint-row suppression. +30.
4. 9bce8697 test(shorthand-honesty): honesty gate mirrors the shipped keyed mint
   collapse; disclosed delta = plate card 2->1 (collision repair, see §Collisions).

Code commits (product+test): 2b6e0ef3 (RED pins), 9d527cef1db550e5a2fc289840d494985149cbaf
(server fix + single golden re-bless), 6893c04ee0ca910d11c36aa000bb9f1e69aa351e (app fix),
9bce869706d0d1db0969989b23a786bb25208090 (honesty-gate collision repair — final code commit).
Report commit: c5437658.

## Baseline measurements (pre-fix, taken first-hand in this worktree)

First targeted check (spec §First targeted check; expect 2 at baseline):
  unknown-local-term: 2, material-level-mismatch: 2, labware-hint-lookup-failure: 2,
  unresolvable-mixture-component: 2   (grep -o 'Create local term' | wc -l)

Wire duplication proven programmatically (JSON parse of each blessed record): each
unknown-noun clarification carries the identical candidate TWICE, e.g.
  [{"confidence":0.05,"label":"Create local term “mystery flask”"},
   {"confidence":0.05,"label":"Create local term “mystery flask”"}]
(mystery flask / ethanol / mystery reagent / Equine Serum). The labware-hint-lookup-
failure record's two resolution-lookup-failed facts carry NO candidates key (unchanged).

Targeted suites (base):
- server: 4 files / 54 tests pass (nounResolution 15, goldenIntentToClarification 6,
  resolveNounsPass 24, shorthandChat.nounShape 9).
- app: 3 files / 23 tests pass (ClarificationPicker 12, clarificationCards 8,
  heldBundle 3) + the documented pre-existing 1 unhandled-error noise line
  (ClarificationPicker labware-browse test) — untouched.
Typecheck (base): server tsc 0 errors; app tsc 23 "error TS" lines.
Full suites (base, raws in /home/brad/.hermes/cl/lanes/2/tmp-l2t0015/):
- server: 90 failed | 666 passed | 9 skipped files; 100 failed | 6264 passed |
  70 skipped tests; Errors 2. Normalized FAIL-file list: 90 files
  (base-server-full.raw -> base-server-fails.txt). NONE of the scoped files fail at base.
- app: 60 failed | 319 passed files; 71 failed | 2483 passed tests; Errors 5.
  Normalized FAIL-file list: 56 files (base-app-fails.txt; includes 28 app/e2e/*.spec.ts
  collected by the vitest glob — they need a live app, pre-existing). NONE of the
  scoped app files fail at base.

## RED evidence (new pins failing pre-fix)

Server targeted (red-server.raw): 5 failed | 50 passed (55).
- nounResolution.test.ts > noun-resolution.mint-floor-dedup (MINT-FLOOR-UI-1):
  `expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2`
- goldenIntentToClarification.test.ts x4 (unknown-local-term, labware-hint-lookup-
  failure, material-level-mismatch, unresolvable-mixture-component): same
  `expected length 1 but got 2` on the live replay payload.
App targeted (red-app.raw): 1 failed | 23 passed (24).
- clarificationCards.test.tsx > test 9: `expected [ …(2) ] to deeply equal []` — the
  held card rendered TWO `Create local term “lysis-reagent”` option buttons (the
  DEFECT-4 double row) on top of the picker floor row.

## The fix

Edit 1 — server/src/compiler/resolution/resolutionEngine.ts:
- New `dedupeMintsByLabel()` beside `dedupeByCurie` (same-shape pattern): Map keyed on
  `candidate.mint?.label ?? candidate.label`, keep highest score. Candidate STRUCTURE
  only (tier/curie/mint.label) — engine law holds, zero verb/class/domain/NAME switches.
- Applied at the unknown-noun arm: `dedupeMintsByLabel(mintAffordances(allCandidates)
  .filter(isMintableLabel(...)))` — the nounShape bar still runs FIRST (byte-identical
  filter), only what passed collapses. Different mint labels stay distinct (AC5 keyed rule).
- Byte-unchanged: near-miss leg, confidence 0.05, strategy order, mintRefusePatterns
  gate, ResolveSpine.ts, resolvers.ts, RefPicker.tsx (none appear in any commit's files).

Edit 2 — app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts:
- `isMintOfferForLabel(optionLabel, factLabel)`: quote-normalizes curly “ ” to straight
  " " (bait 4), keys on the fact's OWN label already in hand + the affordance label
  shape the module already documents. Options whose label IS the mint offer for the
  fact's label are dropped; the picker's own mint floor row (resolvers.ts `mint:<q>`)
  is the card's single affordance (OQ1 STRICT — the mint-label option button was a dead
  end: handleClarificationPick answers with a literal the spine cannot bind). A mint
  offer for a DIFFERENT term survives (keyed rule, not a blanket).

## Golden re-bless (OQ2 — blessed ONCE, same commit as Edit 1: 9d527cef)

Exactly the 4 named __records__ files + their MANIFEST.yaml records: sha256 entries.
`git show --stat 9d527cef` = exactly 6 files: resolutionEngine.ts + MANIFEST.yaml +
the 4 records. No other record or manifest entry moved.

Bless method: each golden replayed through the SAME replayKernel the vitest suite uses
after Edit 1 (script outside the worktree: tmp-l2t0015/bless-goldens.mts). Per record it
printed and enforced:
  'Create local term' occurrences: blessed 2 -> replay 1
  non-mint content byte-identical apart from the mint collapse: YES
(the script refuses to write any record whose non-mint content moved).

sha256 before -> after (MANIFEST records: section):
- unknown-local-term: 085526acdc8ab30dd3d419dd2cdbce9b2462ddbce0bf324cacf16f424e60970a
  -> 0de0df39c5d6f323347c544e78033fa2649167a623f7f983e3769ef9c6a32729
- labware-hint-lookup-failure: 9b115f66c8af9071fd5081d61b4c65841a2d832a248d16a658bf8c77547063dd
  -> 5d994a1978be8c87c88dbae577775186c035760a9a6214fdae01608a9dd86feb
- material-level-mismatch: aa9f7fe9265a9fe3b603cc758682b57b57dc002b5e0d2ea38a2062e618424a91
  -> beaeb2e495434a4faa60039a008c66921c7e091c7aeed62f35a692fc66649106
- unresolvable-mixture-component: 4c5587f32e8f80786810a4e2581e9f121093b6c696353df6dbda1fdffea95cea
  -> 75ef78d867f7682b1aa0119b8735aab0fb5a1bec99899b83c7a94fa6ccaf757e

Record content diff (candidates region only; deep-equality proof run programmatically:
old-with-duplicate-mint-collapsed == new for ALL 4 records):
- unknown-local-term: candidates [mint “mystery flask” x2] -> [mint x1]
- material-level-mismatch: [mint “ethanol” x2] -> [mint x1]
- labware-hint-lookup-failure: [mint “mystery reagent” x2] -> [mint x1]; the two
  resolution-lookup-failed facts keep NO candidates key (byte-identical)
- unresolvable-mixture-component: [mint “Equine Serum” x2] -> [mint x1]
Near-miss-suggestion entries: none of the 4 records carry any (candidate arrays contain
only the mint entries) — nothing else absorbed into the re-bless diff (bait 5).
Serialization note: bless writes stableStringify (key-sorted). Three records were
already stored key-sorted, so their on-disk diff is exactly the candidate removal.
unresolvable-mixture-component was stored in insertion order; to keep its blessed diff
minimal (mint collapse only, no key-order churn) the final file restores the original
byte layout with a surgical single-candidate removal — golden-replay deep-equal PASS
confirms equivalence to the replay.

## Collisions found and repaired (full-suite evidence)

- server/src/ai/shorthandChat.e2eStubHonesty.test.ts (commit 9bce8697): the honesty pin
  compares the CANNED app/e2e stub (deck-ghost-shorthand.spec.ts, which OQ3 rules stays
  byte-unchanged with its 2x-mint shapes) against the REAL pipeline output. Post-fix the
  real wire carries ONE mint candidate for the mintable 'plate' card while the canned
  stub carries two -> deep-equal failed. Repair: applyMintGate (the test's existing
  shipped-DATA reconciliation harness) now applies BOTH shipped rules to the extracted
  stub — the noun-shape gate AND the keyed mint collapse (same key: the mint label) —
  and a new assertion pins the disclosed re-pin delta: `collapsedMintCopies == ['plate']`
  (nothing else moved). The canned app/e2e spec itself is byte-unchanged (git diff = 0
  lines) and its 2x-mint shapes remain regression coverage of the client dedupe rule.
- app src/extraction/ExtractionReviewPage.test.tsx appeared in one head run's fail list
  then passed in isolation and in the final head run: flake noise, unrelated to this
  item (the adapter has exactly one consumer — ProtocolLocalizationThread.tsx:363).

## GREEN / verification (head, final tree)

Targeted (from package dirs):
- server: `npx vitest run nounResolution goldenIntentToClarification resolveNounsPass
  shorthandChat.nounShape` -> 4 files / 55 tests passed (baseline 54 + AC1). exit 0.
- shorthandChat.e2eStubHonesty: 7/7 passed.
- app: `npx vitest run ClarificationPicker clarificationCards heldBundle` -> 3 files /
  24 tests passed (baseline 23 + AC3 test 9). Vitest still prints `Errors 1 error`
  (the documented pre-existing unhandled async tick in the labware-browse test) so the
  process exit is 1 — IDENTICAL to the base run (base: 23 passed + the same 1 error).
  Zero test failures at head.
- AC4 no-regression: RefPicker.test.tsx 3/3 passed (file untouched).
- Golden replay: `npx tsx scripts/golden-replay.ts` -> PASS manifest.versions-current,
  37/37 checks passed, exit 0.
- First targeted check post-fix: 1 / 1 / 1 / 1 (was 2/2/2/2).

Full suites (head) + zero-new proof:
- server: 90 failed | 666 passed | 9 skipped files; 100 failed | 6265 passed | 70 skipped
  tests (base: 6264 passed -> +1 = the new AC1 test). Normalized FAIL list 90 files.
  `comm -3 base-server-fails.txt head-server-fails.txt` -> EMPTY (zero new failing files).
- app: 60 failed | 319 passed files; 71 failed | 2484 passed tests (base: 2483 -> +1 =
  the new test 9). Normalized FAIL list 56 files.
  `comm -3 base-app-fails.txt head-app-fails.txt` -> EMPTY (zero new failing files).
- Typecheck: server tsc 0 -> 0 errors; app tsc 23 -> 23 "error TS" lines (delta 0).

## Out-of-scope verification

git diff e68a6271..HEAD --stat = 11 files, all in scope:
  app clarificationAdapter.ts, clarificationCards.test.tsx,
  server resolutionEngine.ts, nounResolution.test.ts, goldenIntentToClarification.test.ts,
  shorthandChat.e2eStubHonesty.test.ts, MANIFEST.yaml, 4 __records__ golden.json.
ResolveSpine.ts, resolvers.ts, RefPicker.tsx, app/e2e/deck-ghost-shorthand.spec.ts,
/vocab/mint, canMint, nounShape DATA, strategyOrder data: byte-unchanged (0 diff lines).

## Assumptions

- AS-L2T0015-1: AC1's near-miss fixture uses preferredLabel 'mystery flask+' (edit
  distance 1 from 'mystery flask' within tolerance 2) so the near-miss leg is non-vacuous
  in the same clarification; confidence 0.9 = 1 - 1/10 per nearMissSuggestions.
- AS-L2T0015-2: the bless script lives OUTSIDE the worktree
  (/home/brad/.hermes/cl/lanes/2/tmp-l2t0015/bless-goldens.mts) — tooling, not product
  code; it imports the worktree's replayKernel directly.
- AS-L2T0015-3: the app full-suite FAIL lists include app/e2e/*.spec.ts collected by the
  vitest glob (they need a live app; identical at base AND head — not new failures).
- AS-L2T0015-4: shorthandChat.e2eStubHonesty.test.ts is a TEST file the fix legitimately
  collides with; the repair extends the test's own disclosed-re-pin harness rather than
  touching the canned app/e2e spec (OQ3) or weakening the honesty contract.

## Unresolved / for the orchestrator

- AC5 (browser-gate-visible outcome at :5193) is the cl-browser-reviewer's acceptance
  gate, not this coder's pass; unit-level AC3 pins the same DOM contract.
- No merges performed (orchestrator owns merge).

MINT-FLOOR-UI-1 DONE 9bce8697
