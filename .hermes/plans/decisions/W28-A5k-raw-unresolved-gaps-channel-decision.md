# W28-A5k raw-unresolved -> gaps channel — ARCHITECT DECISION (2026-10-19)

Lane 2, branch feat/PARAM-FOLD-1-lane2-l2t0135 @ b3642836 (base a4009786, trunk tip
bf889eae per dispatch; worktree verified first-hand: `git log --oneline -2` shows
9b435d91 (report) atop b3642836 (fold)). Repos read-only for me; only this file written.

Evidence read first-hand for this ruling (all in the PARAM-FOLD-1 worktree):
- `server/src/compiler/scientistIntent/compileScientistIntent.ts` — the ACTUAL call
  order: :263 `const normalized = normalizeScientistIntent(compileIntent, { vocabulary })`
  runs BEFORE `buildRegistry` (:264) and before `runPipeline` (:283). `resolve_nouns`
  (the fold's home) runs INSIDE the pipeline; `normalize` is the `ai_precompile` seed.
  So normalize CANNOT consume the pass's output — the ordering is the other way.
  `gatherGaps(normalized, diagnostics)` (:204-219, first arm iterates
  `normalized.unresolvedRefs` -> `unresolved_ref` gaps), `computeOutcome` (:221-225,
  gaps.length>0 -> 'gap'), both on the non-barred arm only (:334-335).
- `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` :845-851 (for-of
  `intent.unresolved` -> `unresolvedRefs` kind `unresolved_symbol`) and :872-878
  (`protocolIntent.unresolved`, same raw source, `blocksLowering: false`).
  normalize receives `{ vocabulary }` at the call site — the fold's full input set is
  already in its hands.
- `normalizeScientistIntent` has EXACTLY ONE caller repo-wide (non-test):
  compileScientistIntent.ts:263 (grep first-hand). Blast radius of any normalize
  change = the scientist-intent compile path only. `shorthandChat.ts` :500 has its OWN
  `doc.unresolved` filter on its own path and is not this function's consumer.
- `server/src/compiler/resolution/resolveNounsPass.ts` :350-379 —
  `foldDeclaredOptionalAbsentHedges(intent, vocabulary, modelFacts)` is a PURE filter
  over (parsed intent + vocabulary + the facts). It reads NO engine output, NO spine,
  NO bindings. It is computable at any point that holds the parsed intent + vocabulary
  — including at normalize time. Guards 1-5 verbatim as A5j ruled; every non-guard
  path returns KEEP.
- Import-direction / cycle check (first-hand): resolveNounsPass's imports are
  `adapters.js`, `resolutionEngine.js`, `strategies.js` + TYPE-only imports from
  `scientistIntent/` (vocabulary, types, termReconciliation). adapters/resolutionEngine/
  strategies value-import roles, ontology, materials, ai/materialRefFields, nounShape,
  ProtocolIntentLowering — NONE value-imports normalizeScientistIntent. A shared fold
  module reachable by both call sites is acyclic.
- `server/src/compiler/scientistIntent/hedgeOptionality.test.ts` :256-273 — the
  companion test: hedge `{label:'duration', reason:'not-stated', actionLocation:
  {actionIndex:0, action:'bead_beat', argument:'duration'}}` on an action omitting it,
  asserting `outcome !== 'complete'` AND `clarifications.length > 0` (:280).
- Receipts `.hermes/plans/receipts-paramfold1/pf1-ghost.raw` + `pf1-ghost-base.raw`
  (fake-LLM compile, base vs head): post-fold the fact is GONE from `clarifications`
  (fold fired), GHOSTS as an `unresolved_ref` gap with `details.reason: 'not-stated'`,
  rides `protocolIntentUnresolved`, and outcome = `gap`. Compliant emission =
  `complete` on both base and head. Consistent with the dispatch's V6 facts.
- Coder report `.hermes/plans/PARAM-FOLD-1-report.wip-l2t0135.md` (full): scope diff
  = the two authorized files, guards verbatim, zero domain literals, RED-first 8/8,
  zero-new typecheck, comm-delta two files (companion collision + a load-timeout flap
  that passes standalone).

## FRAMING — what the V6 fact actually is

A5j's UNCERTAINTY named the exact contingency ("if any surface ALSO renders raw
parsed unresolved entries... a second fold point is NOT pre-authorized — return it as
a new named fact") and the coder returned exactly it, then stopped. The discipline
held; this artifact is the pre-committed ruling.

The honest read of the named surfaces: the gaps channel ITSELF is legitimate. A true
unresolved reference — a slot-less prose fact, an `ambiguous` or
`contradicts-the-text` hedge, any fact the data cannot settle — SHOULD surface as a
gap and SHOULD hold the outcome out of `complete`. That channel is the compile's
"things I could not resolve" ledger and killing it would be a regression on every
kept class. What is NOT legitimate is that it consumes the RAW parsed
`intent.unresolved` set — the one set the pass-side fold was ruled to override,
leaving the system telling two contradictory truths about the SAME fact: the
clarifications channel says "the vocabulary settled this, moot" and the gaps channel
says "I could not resolve this." One fact, two verdicts, both rendered. That is a
consistency defect, not a product feature.

## Q1 — RULING: suppression, at the RAW SOURCE (normalize), not a new fold point

A folded fact is NOT a gap. The vocabulary's `required !== true` + the parsed action's
absence is, by A5j's own reasoning, the data declaring there is nothing to resolve —
`computeOutcome` landing on `gap` for that class CONTRADICTS the vocabulary, which is
exactly the "code deciding policy against the data" inversion the repo forbids. The
scientist still sees that the text omitted the optional the same way A5j decided for
the clarifications side: the compiled action visibly lacks the field in the workstate
(A5i's honesty clause, adopted verbatim there; no notice class pre-decided either way).
Arm A (>=1 `complete` draw) therefore requires the raw channel to speak the folded
set — outcome `complete` for a fact still ghosting as a gap would be dishonest, and
outcome `gap` with a data-moot fact in it is dishonest the other way. The fix is to
make both channels read the same truth.

**THE CHOKE (exact):** normalize consumes the fold — NOT the pass. The verified call
order (normalize at :263, pass inside `runPipeline` at :283) makes "normalize consumes
a folded set FROM the pass" impossible without re-plumbing the pipeline; and the fold
needs no engine output, so early application is lossless. The ruling is therefore:

1. EXTRACT `foldDeclaredOptionalAbsentHedges` + `NOT_STATED_REASON` from
   `resolveNounsPass.ts` into a new leaf module
   `server/src/compiler/resolution/declaredOptionalHedgeFold.ts` (name is the fix
   run's to adjust; it must be a leaf: type-only imports from `scientistIntent/`
   + `argumentPresent`, nothing else), and RE-EXPORT both from `resolveNounsPass.ts`
   unchanged so every existing import/test is byte-unchanged. Cycle check done above;
   the leaf is reachable by both call sites with zero import edges into normalize.
2. `normalizeScientistIntent` calls the shared function ONCE at the top of its
   unresolved handling and uses the folded array for BOTH raw consumers — the :845
   `unresolvedRefs` loop and the :872 `protocolIntent.unresolved` map. One fold call,
   both ghosts gone at the source; `gatherGaps`, `terminalArtifacts.gaps`,
   AiTabPanel :641, shorthandChat :684 -> useAiChat :685 are all downstream of the
   source and need ZERO changes (that is what "single choke" means: not a new
   suppression site, the ORIGINAL data site).
3. The pass keeps calling the same shared function — the fold is an idempotent
   filter, so the pass re-folding an already-folded set is a no-op BY CONSTRUCTION,
   and the pass keeps its own raw-intent path byte-identically for every non-compile
   caller of the pass. No pass-side diff in this follow-on.

WHY NOT the alternatives:
- gatherGaps consulting the resolution output: creates a SECOND truth-source (the raw
  refs still ride `normalized` to `protocolIntent.unresolved` and any future consumer;
  subtraction at render time is display-layer policy hiding upstream duplication).
  Every new consumer of `normalized.unresolvedRefs` would re-inherit the ghost.
- the compile outcome function: suppressing `gap`-ness in `computeOutcome` without
  touching the gap objects would paint the outcome dishonest around the ghost —
  surfaces still render it while the ledger says `complete`. Worst of both.
- re-ordering normalize after the pass: a pipeline restructure far exceeding the
  named fact, and the pass consumes normalize's output (`ai_precompile` seed) — the
  dependency arrow genuinely points the other way.
- one choke at normalize ONLY (dropping the pass-side call): the pass reads
  `deps.intent.unresolved` raw, not `normalized`; removing its fold would resurrect
  the wall for every non-compile pass caller. Keep both call sites; keep one
  implementation. The single-fold-point invariant is per-RULE, not per-process.

Module law: the fold's guards read identity (`actionLocation`), `vocabulary.argContracts`
data, the parsed action, and one stable reason code — the identical posture normalize
already holds (zero cue literals; its own policy lives in
`config/drafting/mixture-material-cues.yaml`). No domain literals anywhere in the
extract or the two call sites.

## Q2 — Anti-fabrication posture: guards 1-5 UNCHANGED, consumer does not change posture

The drop set is provably identical at both call sites — same pure function, same five
data questions. The different consumer (gap display + outcome) does not change the
posture because the ONLY observable delta is outcome `gap` -> `complete` (and a
ghost-card absent from three surfaces) for exactly the class the vocabulary declares
legal. Everything the fold must not hide still surfaces through this channel:
- slot-less / prose-shaped facts (guard 1) KEEP -> still `unresolved_symbol` gaps,
  outcome still `gap` — the channel KEEPS WORKING for real gaps (this is the load-
  bearing new test, see verified-by);
- `ambiguous` / `contradicts-the-text` on present-but-uncommitted args (guard 5)
  KEEP -> gaps;
- present-arg hedges (guard 4, SAMPLE-CARD-1 class) KEEP;
- absent REQUIRED args never reach this fold (guard 3 + engine sweep; they bar via
  the pass diagnostic, untouched).
The convergence argument from A5j Q2 carries verbatim: post-fold, emitter-compliance
and emitter-violation produce the SAME compile — `complete`, same events (the
compliant-emission legs of the ghost receipts already prove what the hedged emission
will equal).

## Q3 — hedgeOptionality.test.ts companion: the pin is NOW WRONG; flip it, do not delete

The companion's premise — "the SAME shape WITH a hedge bars; the hedge, not the
engine, manufactures the wall" (`outcome !== 'complete'`, `clarifications.length > 0`
at :279-280) — characterized the PRE-FOLD world. W28-A5j ruled that world's wall a
defect and abolished it; the test now pins the defect's existence. Adjudication for
the parallel review: the clarifications pin is wrong post-A5j, and under THIS ruling
the outcome pin is wrong too. The correct end-state is a FLIP, keeping the test:

  same fake-LLM shape -> `outcome === 'complete'`, `clarifications` [], 
  `terminalArtifacts.gaps` [] (no `unresolved_ref` ghost), `protocolIntent` 
  `.unresolved` [] (or absent), events still expand (`mix` event present).

Keep it because it is the ONLY compile-level (full-pipeline, both channels) pin of the
fold; the paramFold file pins the pass unit-side. Rename its `it` to name the fold's
convergence claim ("a not-stated hedge on an absent declared-optional converges on the
data-compliant outcome — no clarification, no gap, complete"). The edit belongs to the
PARAM-FOLD-2 fix run, explicitly authorized in that task (trunk-owned test file —
PARAM-FOLD-1 was right not to touch it). Its 14 prompt/mirror pins stay byte-untouched.

## Q4 — Merge posture: pass-side merges NOW; probe r4 runs POST-channel-fix

- The pass-side half (b3642836) is correct, in-scope, RED-first, zero-delta — merge
  it. Its interim trunk state post-merge (hedged class: `gap` outcome instead of
  needs-clarification, companion test red on that leg) is a HALF-FIX, not a
  regression class: no surface lies the other way; the companion's red IS the named
  seam, honestly surfaced.
- PARAM-FOLD-2 (this ruling's execution) authors: extract-to-leaf + re-exports, the
  normalize single-fold-choke (:845 + :872 consume the folded set), the companion
  flip. It lands as the immediate follow-on task in THE LIST. If the orchestrator's
  trunk policy cannot tolerate the companion's transient red, land FOLD-1+FOLD-2 as
  ONE merge stack and measure the zero-new-failures comm-delta at the combined tip —
  that is a sequencing choice for the orchestrator, not a re-open of this ruling.
- PROBE r4: POST-channel-fix, unconditionally. ARM A (>=1 `complete` draw) is
  UNREACHABLE pre-fix (pf1-ghost.raw proves hedged emissions land on `gap` even with
  the fold fired). r4 arms/verdict protocol from A5j stands verbatim (fixture,
  gate-exact answers map — still NO duration/temperatureC/cycles answers; WIRE-TEMP;
  ARMS A-D; MAX_REDRAW 8; two-fails -> infra suspicion). Pre-fix the orchestrator MAY
  run the cheap zero-code pass replay A5j's "ARMS IF I PROBED DIFFERENTLY" named, but
  it informs nothing r4 depends on.

## PARAM-FOLD-2 — the fix run's exact surface (files + verified-by)

FILES (no others):
- `server/src/compiler/resolution/declaredOptionalHedgeFold.ts` (new leaf:
  `foldDeclaredOptionalAbsentHedges` + `NOT_STATED_REASON` MOVED verbatim, plus a
  private `argumentPresent` copy or a shared-helper import — smallest diff; the leaf
  must not import the pass module).
- `server/src/compiler/resolution/resolveNounsPass.ts` — delete the moved bodies,
  re-export both names, keep the pass's call site working via the import. NO behavior
  change; existing paramFold tests must pass WITHOUT editing them (their imports of
  the two names from `resolveNounsPass.js` resolve via re-export — byte-unchanged
  files are the pin that the extract is a move, not a rewrite).
- `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` — ONE fold call
  over `intent.unresolved` (it already receives the vocabulary), folded array feeding
  both :845 and :872. Nothing else in the file changes.
- `server/src/compiler/scientistIntent/hedgeOptionality.test.ts` — the Q3 flip of the
  ONE companion test; the other 14 tests byte-untouched.

VERIFIED-BY (all fake-LLM/unit, deterministic, RED-first at the pre-fix head):
1. V1 compile-level RED from the ghost receipt verbatim-shape: hedged emission
   (not-stated on an absent declared-optional, slot-located) -> `outcome 'complete'`,
   `clarifications` [], `gaps` [] with NO `unresolved_ref` carrying that label,
   `protocolIntent.unresolved` carries no such entry, events expand. (This is the
   flipped companion test — one test serves as the RED pin and the flip.)
2. CHANNEL-ALIVE pin: a slot-less `not-stated` fact (no actionLocation) -> STILL an
   `unresolved_ref` gap, outcome STILL `gap`; an `ambiguous` slot-located hedge ->
   STILL a gap. The channel's legitimate job survives the choke.
3. Idempotence pin: fold applied twice over the same set == applied once (the pass +
   normalize both fire the rule on the compile path — the double application must be
   provably a no-op).
4. Re-export integrity: the paramFold test file + all existing `NOT_STATED_REASON` /
   `foldDeclaredOptionalAbsentHedges` importers untouched and green; `hedgeOptionality`
   alone 15/15 at head; the pass/golden/registration suites green (re-run
   goldenIntentToGraph / goldenIntentToClarification explicitly — a golden holding a
   folded-class fact would surface HERE, at normalize, not at the pass).
5. Scope diff: `git diff` names ONLY the four files above. Any diff in
   intentCompile.ts, the mirror yaml, gatherGaps/computeOutcome, resolutionEngine,
   shorthandChat, app/, schema/, fixture, or the answers map is itself the defect.
6. Zero domain literals in the extract and normalize touch (grep discipline as in
   PARAM-FOLD-1 §1) — normalize gains ZERO new literals; it gains a function call.

## UNCERTAINTY

- Same accepted limit as A5j: single-model, single-fixture live evidence; the
  fold's blast radius is unit-characterized. Overreach stays bounded by the
  data-equivalence argument (folded == what a compliant emitter would have produced).
- The 200-`gap` interim behavior (post-FOLD-1, pre-FOLD-2) was verified only by the
  fake-LLM harness, not by live 5-draw probe traffic. Accepted: r4 runs post-FOLD-2,
  where the question is moot.
- `protocolIntent.unresolved` deep consumers (lowering/validation) were swept by grep
  first-hand: `blocksLowering: false` and the named consumers are parser/characterizer
  round-trips, no behavior keyed on presence. If FOLD-2's golden re-run disagrees,
  that is a new named fact, returned per discipline — not silently absorbed.
- Whether the thread's `holdForReview` 2xx branch has any OTHER ghost-class channel
  (beyond gaps + protocolIntentUnresolved + the two chat surfaces named in V6) was not
  exhaustively re-proved beyond the normalize-source logic; folding at the source
  closes ALL consumers of `normalized`/`terminalArtifacts` by construction, so a
  missed consumer cannot ghost post-FOLD-2 — only a consumer that bypasses
  normalize's output entirely could, and the first-hand grep shows none for this path.

DECISION: the gaps channel is legitimate and stays; its RAW input is the defect. One
shared fold rule, extracted to a leaf module, consumed at the RAW SOURCE —
normalizeScientistIntent folds `intent.unresolved` once, :845 and :872 read the folded
set, the pass re-folds idempotently; gatherGaps/computeOutcome/every UI surface
untouched. Guards 1-5 unchanged — the consumer change does not loosen the posture;
kept classes still surface as gaps and still hold outcome out of `complete`. The
hedgeOptionality companion's pin is ruled wrong and FLIPS to the convergence claim in
PARAM-FOLD-2. Pass-side b3642836 merges now (or as the bottom of one FOLD-1+FOLD-2
stack, orchestrator's call); probe r4 runs strictly post-channel-fix.

W28-A5k DECIDED
ARCHITECT DONE W28-A5k
