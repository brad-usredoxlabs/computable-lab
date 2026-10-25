# MINT-FLOOR-UI-1 — Mint-floor de-duplication: exactly ONE "Create local term" row per noun
# STATUS: CANONICAL — composed by cl-spec-composer (l2t2100), orchestrator-reviewed and
# promoted 2026-10-17T23:30 EDT (l2t2315). Orchestrator first-hand spot-verification at trunk
# 5b995de5 CONFIRMED the load-bearing claims: 4 golden records each carry 'Create local term'
# x2; dedupeByCurie skips no-curie (:44-46); allCandidates accumulates per strategy (:171);
# symbolic_label AND ontology_resolution both gather via the spine adapter (strategies.ts:101-116);
# mintAffordance uses curly quotes (ResolveSpine.ts:271) vs straight in resolvers.ts:70;
# golden tests pin candidates[0] only (:96/:150/:193/:255) — count assertions must be ADDED.
# See ORCHESTRATOR ADJUDICATION at the bottom for the three OQ rulings.

Composed: 2026-10-17, lane-2 worktree /mnt/vast/home/brad/git/cl-integration-2
Tree read at: 70c76243 (current tip of cl/integration-2). NOTE: the dispatch prompt named tip
b6eddd7d; the trunk has since advanced 9 commits (b6eddd7d..70c76243 = docs/handoff commits plus
server/src/ai/submitSuggestionTool.ts + its hygiene test — NONE of the files in this item's scope
differ between b6eddd7d and 70c76243, so every citation and baseline below holds at both).

## GOAL (one sentence)

Make a held clarification offer the tier-5 mint affordance exactly once per noun — at the wire
(the 422 clarification's candidates array) and at the held-card UI — by keyed de-duplication of
identical mint candidates, with zero change to what minting does, where it is offered, or what
labels are mintable.

## WHY

The W2-8 A5d tier-2 browser gate reproduced the defect: the lysis-reagent held card renders the
mint floor TWICE — two identical `Create local term "lysis-reagent"` rows
(receipts/W2-8-SAID-MEANT-SURFACE/2026-10-17_2020-a5d-tier2-reshoot/REPORT.md DEFECT 4,
shots/06-draw2-mintpicker.png). It is NOT browser-only: the API-side repro packet
(/home/brad/.hermes/cl/lanes/2/tmp-orch/repro-a-A5g-postmerge-l2t1835.txt, lines 21-29) shows the
422 clarification itself carries the candidate
`{"label": "Create local term “lysis-reagent”", "confidence": 0.05}` TWICE. The blessed SPINE-6
golden records bake the duplication in (2 identical mint candidates each in
`unknown-local-term`, `material-level-mismatch`, `labware-hint-lookup-failure`,
`unresolvable-mixture-component` under
server/src/compiler/scientistIntent/goldens/__records__/). "One term, one affordance" is the
stated expectation (task-list why); the wire contract feeding EVERY consumer (held cards,
QuestionsPanel, e2e stubs) currently violates it.

## SCOPE

In scope (exact paths):
- server/src/compiler/resolution/resolutionEngine.ts — keyed dedup of mint affordances at the
  accumulation site (§Root cause / §Exact edits).
- server goldens DELIBERATELY RE-BLESSED: the 4 `__records__/*.golden.json` files above + their
  sha256 entries in server/src/compiler/scientistIntent/goldens/MANIFEST.yaml (records: section).
  Blessed ONCE, diff goes in the coder report (SPINE-6 precedent).
- app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts —
  the held card must not render a candidate option button that duplicates the picker's own mint
  floor row for the SAME fact label (keyed rule, §Exact edits 2).
- Test files: server/src/compiler/resolution/nounResolution.test.ts (new pin), the 4 golden test
  assertions in server/src/compiler/scientistIntent/goldens/goldenIntentToClarification.test.ts
  where they pin the mint candidate COUNT, and
  app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationCards.test.tsx
  (new RED-first pin).

Explicitly OUT of scope:
- server/src/resolve/ResolveSpine.ts — the spine's per-call "always append exactly one mint"
  contract (ResolveSpine.ts:183, :218, :268-279) is correct and pinned by other consumers
  (RefPicker, resolveDraftMaterials, slash /m menu). DO NOT touch it.
- app/src/shared/taptab/slashMenu/resolvers.ts — the slash mint row is already single (key
  `mint:<q>` at :69, merged by key in ClarificationPicker.merge,
  ClarificationPicker.tsx:68-79). DO NOT touch it.
- app/src/shared/ref/RefPicker.tsx — already renders exactly one pinned mint row
  (.find, RefPicker.tsx:119, rendered :389). DO NOT touch it.
- POST /vocab/mint idempotency (gate DEFECT 3) — separate architect-confirmed item; do not absorb.
- The clarification ANSWER flow, the deck gate, foldHeldBundle semantics — byte-unchanged.

## NON-GOALS

1. MINT-FLOOR DOMAIN POLICY IS RULED, NOT RE-LITIGATED. The
   material-only-floor-vs-broader question (options A/B in the THREAD-ASK-1 spec §OPEN QUESTION,
   restated in clarificationAdapter.ts:29-36) is BRAD's call. DEFAULT RULING APPLIED HERE = keep
   the material-only floor EXACTLY as shipped (status quo). No labware/instrument minting, no
   /vocab/mint changes, no canMint changes. THIS IS A PURE DE-DUPLICATION ITEM.
2. No change to WHICH nouns get a mint offer: the nounShape DATA filter
   (config/drafting/shorthand-drafting.yaml `mintRefusePatterns:`, applied at
   resolutionEngine.ts:213-216 via isMintableLabel) is untouched and still runs BEFORE the dedup.
3. No change to the near-miss suggestions leg (resolutionEngine.ts:223-228) or to any
   non-mint candidate.
4. No confidence/ranking changes (0.05 stays 0.05).
5. No event_graph work (see §Out-of-scope map).

## ROOT CAUSE (verified first-hand at 70c76243; the mechanics lead is REFINED, see §Correction)

The duplication is SERVER-SIDE, at the resolution engine's candidate accumulation, and it reaches
the browser as two identical wire candidates rendered as two option buttons on the held card.
Chain:

1. Composition/merge site — server/src/compiler/resolution/resolutionEngine.ts:148-171: the
   engine loops `policies.strategyOrder` (shipped data: schema/scientist-intent/scientist-intent-vocabulary.yaml:836-841 =
   explicit_wells, hint_search, symbolic_label, ontology_resolution, mint_local) and pushes EVERY
   strategy's candidates into one `allCandidates` array (:171). Per-strategy `dedupeByCurie`
   (:173, :43-51) EXPLICITLY SKIPS mint candidates — comment at :46: "the mint affordance is
   handled separately" — but the "separate" handling NEVER DEDUPES:
   `mintAffordances()` (:53-55, filter `tier === 5 || !curie`) feeds ALL mint copies straight
   into the unknown-noun clarification at :214-222 via `clarificationFor` ->
   `candidateFact` (:57-74). N mint copies in, N identical candidates out.

2. Duplicate contributor #1 — symbolic_label
   (server/src/compiler/resolution/strategies.ts:101-106): gathers through the `spine` adapter
   (adapters.ts:69-95 `createSpineAdapter`), which calls `spine.resolve(label, ...)`. The spine
   appends exactly one mint affordance PER CALL (server/src/resolve/ResolveSpine.ts:183 builds
   it, :218 `ranked.push(mint)` — its own curie-dedupe at :208-215 skips empty-curie mints).
   => mint copy #1 in allCandidates.

3. Duplicate contributor #2 — ontology_resolution
   (strategies.ts:111-116): gathers through the SAME `spine` adapter with the SAME label. Second
   spine call, second mint append. => mint copy #2 in allCandidates. (mint_local at :122-127
   gathers nothing; it only gates the offer arm's reachability — it is NOT a contributor.)

4. Wire evidence (blessed, first-hand): each of the four unknown-noun golden records contains the
   identical candidate exactly TWICE — e.g.
   server/src/compiler/scientistIntent/goldens/__records__/unknown-local-term.golden.json:1
   `"candidates":[{"confidence":0.05,"label":"Create local term “mystery flask”"},{"confidence":0.05,...}]`
   — and repro-A shows the same 2x for lysis-reagent through the real
   POST /intent/compile-from-prompt.

5. Render site (cosmetic echo of the wire bug) — the held card maps fact.candidates -> options
   verbatim (app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts:60-65)
   and renders one option BUTTON per candidate
   (app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx:749-768). Two wire
   duplicates => two identical `Create local term "lysis-reagent"` buttons. IN ADDITION, the
   card's ClarificationPicker renders the /m slash mint floor row (resolvers.ts:67-92) — so
   pre-fix the card shows up to THREE mint affordances for one noun (2 option buttons + 1 picker
   floor row); the gate screenshot captured the two identical option rows.

### Correction to the mechanics lead (screening vs. verified)

The lead hypothesized a pinned-mint-row + tier-5-resolver double-render CLIENT-side. Verified
reality: RefPicker is single by construction (RefPicker.tsx:119 `.find` keeps ONE
mintCandidate, rendered :389), and the slash `/m` mint row is single by construction (keyed
`mint:${q}`, resolvers.ts:69; merged by key, ClarificationPicker.tsx:68-79). The duplicate
CONTRIBUTORS are the two spine-gathering strategies in the SERVER engine
(strategies.ts:101-106 and :111-116), merged WITHOUT a mint key at resolutionEngine.ts:171 +
:214. The client's contribution is only that it faithfully renders the duplicated wire data.

## EXACT EDITS (declarative-first considered and rejected; minimal keyed dedup chosen)

Declarative-first check: could this be a data-surface change? The only candidate lever is
`policies.strategyOrder` in the vocabulary YAML — but REMOVING `ontology_resolution` (the second
spine gather) changes fallback semantics (which strategies run when a band misses), not dedup;
it is a policy change dressed as a fix. There is NO existing declarative surface that governs
cross-strategy candidate accumulation. Therefore: the smallest keyed dedup at the accumulation
site, making no policy decision (it does not decide WHETHER a mint is offered, only that
identical offers collapse).

Edit 1 (server, primary) — server/src/compiler/resolution/resolutionEngine.ts.
In the unknown-noun arm, collapse mint affordances by key before they enter `clarificationFor`.
The key is the mint identity the code ALREADY carries: `candidate.mint?.label`
(fallback `candidate.label`), same-shape pattern as the existing `dedupeByCurie` (:43-51) this
bug escaped. Concretely: wrap the result of `mintAffordances(allCandidates)` — after the
`isMintableLabel` filter (:214-216, keep it running FIRST so the noun-shape bar still gates
what enters, and collapse only what passed) — in a Map keyed on that mint label, keep the
first/highest-scoring instance. Identical scores today; keying on label is sufficient and
deterministic. The engine law holds: this switches on candidate STRUCTURE (tier/curie/mint.label),
never on a verb, class, domain, or noun NAME.

Edit 2 (app, held-card render) — ProtocolLocalizationThread.clarificationAdapter.ts, inside
`heldFactToClarificationRequest`. After the existing options mapping (:60-65), drop an option
whose trimmed label equals the mint-floor label the SAME card's picker will render for THIS
fact's own label, i.e. matches `Create local term "<label>"` with quote NORMALIZATION: the
server emits curly quotes (ResolveSpine.ts:271 uses “ ”) while the client resolver row uses
straight quotes (resolvers.ts:70 uses " "). The rule keys on the fact's OWN label (already in
hand at :54) — no noun table, no new literals beyond the affordance label shape the module
already documents (:12 "label -> query/prompt, candidates -> options"). Net held-card result:
near-miss/real candidates still render as buttons; the mint affordance appears exactly once,
as the picker's mint floor row. Note: post-fix the wire carries one mint candidate; this edit is
what makes the CARD show one row total (wire candidate button + picker floor row would
otherwise both show). The two quote forms in the repo are reviewer bait #4 below.

Edit 3 (goldens, blessed ONCE) — after Edit 1, the 4 `__records__` golden files replay with ONE
mint candidate. Update the 4 JSON records and their `records:` sha256 entries in MANIFEST.yaml
in ONE deliberate commit; the assertion updates in
goldenIntentToClarification.test.ts (the `candidates[0]` deep-equals stay valid; add/count-pin
`candidates.filter(c => c.label.startsWith('Create local term')).toHaveLength(1)` per the
existing mint tests at :96/:150/:193/:255 style). The `server/scripts/shqa3-mixture-replay.mts`
mintCandidateCount probe (:195) then reports 1 — a nice cross-check, no edit.

## ACCEPTANCE CRITERIA (RED-first)

AC1 (server unit pin, RED at baseline): a new case in
server/src/compiler/resolution/nounResolution.test.ts — REAL spine + fake providers, an unknown
noun that PASSES the nounShape bar — asserts the unknown-noun clarification's mint-shaped
candidates number EXACTLY 1 and `curie`/`confidence`/`label` of the survivor are unchanged
(`Create local term “<noun>”` @ 0.05). Also assert near-miss suggestions (if any) are untouched
(the dedup must only collapse tier-5 mint copies).
AC2 (goldens, deliberate): the 4 amended records + MANIFEST hashes;
`npx tsx scripts/golden-replay.ts` exits 0 (manifest self-check + all six replays).
AC3 (app unit pin, RED at baseline): a new case in
ProtocolLocalizationThread.clarificationCards.test.tsx with the real wire shape (HELD_RES
candidate array containing the mint label TWICE, curly quotes) asserts the held card shows
EXACTLY ONE option button labeled `Create local term “<label>”` (query all
`.pl-held-clarification-option` texts) AND exactly one picker mint row after the search fires
(findAllByText for the straight-quote `Create local term "<label>"` -> length 1).
AC4 (no-regression pins, already green, must STAY green): shorthandChat.nounShape.test.ts
(mint-present/mint-refused arms use `.some()` — survive dedup), goldenIntentToClarification.test.ts
full suite, clarificationCards tests 1-8 (the pick re-send idiom), RefPicker.test.tsx.
AC5 (browser-gate-visible outcome): at :5193, the held card for an unknown noun shows exactly
ONE "Create local term" row per noun (screenshot replaces the DEFECT-4 double row); clicking it
mints once (one POST /vocab/mint) and the answer rides the answers map as before. Dedup is
per-noun: a card whose candidates legitimately contain TWO DIFFERENT mint labels (near-miss
mint for a different term — reachable only if such a wire shape ever exists; keep the keyed
rule, never a blanket "drop all mint options") keeps both.
AC6: typecheck baseline-clean (§Verification).

## FIRST TARGETED CHECK (proves the mechanism early, before any edit)

From the lane worktree, this single command shows the blessed duplication (expect output `2`,
NOT `1`, at baseline; `1` after Edit 1 + re-bless):

  grep -o 'Create local term' server/src/compiler/scientistIntent/goldens/__records__/unknown-local-term.golden.json | wc -l

## VERIFICATION COMMANDS (complete; lane worktree, `git -c core.fileMode=false` for git)

Server (targeted, RED first then GREEN):
  cd <wt>/server && npx vitest run \
    src/compiler/resolution/nounResolution.test.ts \
    src/compiler/scientistIntent/goldens/goldenIntentToClarification.test.ts \
    src/compiler/resolution/resolveNounsPass.test.ts \
    src/ai/shorthandChat.nounShape.test.ts
  # baseline: 3 files / 30 tests pass (nounResolution 15, goldenIntentToClarification 6,
  # nounShape 9) + resolveNounsPass on top; post-fix: baseline counts + new AC1 case, zero fails.

Golden replay (manifest self-check; expected exit 0 AFTER the single re-bless):
  cd <wt>/server && npx tsx scripts/golden-replay.ts

Server full-suite + typecheck:
  npm run test:run -w server        # from <wt> root; full suite green
  npm run typecheck -w server       # BASELINE AT TIP: 0 errors ("error TS" count 0) — must stay 0.

App (targeted + typecheck):
  cd <wt>/app && npx vitest run \
    src/event-editor/right-pane/ai/ClarificationPicker.test.tsx \
    src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationCards.test.tsx \
    src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx
  # baseline: 3 files / 23 tests pass (ClarificationPicker 12, clarificationCards 8,
  # heldBundle 3). KNOWN BASELINE NOISE: vitest prints "Errors 1 error" (unhandled async tick
  # in the labware-browse test) while all 23 tests pass — pre-existing, do not "fix" it here.
  npm run test:unit -w app          # from <wt> root; full app unit suite green
  npx tsc --noEmit                  # in app/: BASELINE = 23 pre-existing "error TS" lines
                                    # (mostly src/shared/hooks/useAiChat.surfaceContext.test.ts x6
                                    # + viewer/context fixtures). RULE: baseline-delta-0 —
                                    # your diff must ADD ZERO tsc errors; count must remain 23.

## BASELINE MEASUREMENTS (taken first-hand by the composer at 70c76243 == b6eddd7d for scoped files)

- server tsc (`npx tsc --noEmit` in server/): 0 errors.
- app tsc (`npx tsc --noEmit` in app/): 23 errors (pre-existing, none in this item's scoped files;
  ProtocolLocalizationThread.tsx's single pre-existing error is the surfaceId/`equipments` context
  type, unrelated).
- server targeted vitest: goldenIntentToClarification 6 pass, shorthandChat.nounShape 9 pass,
  nounResolution 15 pass = 30/30.
- app targeted vitest: ClarificationPicker 12 pass, clarificationCards 8 pass, heldBundle
  3 pass = 23/23 (with the 1 documented unhandled-error noise line).
- Wire duplication at baseline: 4 golden records each carry the mint candidate x2 (counted
  first-hand: 2 occurrences of 'Create local term' per file).

## WORKER CONTRACT

- Worktree branch: `cl/lane2-MINT-FLOOR-UI-1` cut from `cl/integration-2` (lane-2 trunk);
  all git via `git -c core.fileMode=false` (NFS mode-bit noise). Never write the trunk worktree
  directly.
- Deliverable path pattern: coder report at `<wt>/.hermes/plans/reports/<date>-MINT-FLOOR-UI-1-report.md`
  (unique filename; include the golden re-bless diff verbatim and the before/after outputs of
  the first targeted check + every verification command).
- Commit discipline: one commit for the RED test pins, one for the server fix + single golden
  re-bless (records + MANIFEST hashes TOGETHER, SPINE-6 "blessed ONCE"), one for the app
  adapter fix + pin. Reviewer must be able to see RED->GREEN ordering.
- Do NOT merge; the orchestrator owns the task list and merges.

## REVIEWER BAIT (likely shortcuts for this item — each is a spec violation)

1. Removing mint from the wire entirely (dropping the unknown-noun mint candidates, or pulling
   `mint_local` out of strategyOrder, or filtering `source==='mint'` out of
   clarificationFor). Tempting because the card's picker already offers the floor — but it
   DELETES the affordance for every non-picker consumer, contradicts the unknown-noun offer
   design (resolutionEngine.ts:204-222), and fails shorthandChat.nounShape 'mint survives' +
   the golden mint-offer assertions. The deliverable is ONE mint row, not ZERO.
2. Client-only fix (hide/blur the duplicate option buttons, leave the wire duplicating). The
   repro-A packet is API-side; the blessed goldens are API-side. A fix that does not collapse
   the engine accumulation leaves every other consumer (QuestionsPanel, shorthand replay
   probes, e2e) holding two candidates. Server fix is MANDATORY.
3. Changing mint-floor POLICY or the mint floor itself: touching /vocab/mint, canMint, the
   material-only ruling, nounShape patterns, or DEFECT 3 idempotency "while in there". All
   ruled out of scope above.
4. Quote-mismatch dedup: comparing only straight-quote `Create local term "x"` against the
   server's curly-quote “x” labels → the held card silently keeps the duplicate (the exact
   failure mode AC3's curly-quote fixture is designed to catch). Conversely, hardcoding a noun
   ("lysis-reagent") or an exact full-string list instead of the keyed mint-identity rule —
   the engine law (resolutionEngine.ts header) forbids NAME switches; the key must be
   mint.label / fact-label structure.
5. Golden drift fudge: editing __records__ without the paired MANIFEST.yaml sha256 re-bless
   (golden-replay's `manifestHashMismatches` fails it), or re-blessing the 4 records
   INCREMENTALLY across commits, or absorbing the near-miss-suggestion entries into the re-bless
   diff (they must be byte-identical apart from the mint collapse). Also the
   exactOptionalPropertyTypes trap: mint-candidate facts are `{label, confidence}` — do not
   "repair" golden diffs with toEqual-with-undefined (goldens test file header §5(c): key
   absence via Object.keys).
6. Global dedup across surfaces (dedupe ALL options by label, or change
   ClarificationPicker.merge/resolvers keys app-wide): the deliverable is the mint affordance
   per noun on this wire + this card; two legitimate DIFFERENT candidates must still render.

## OUT-OF-SCOPE MAP (surfaces a touch could affect — verify untouched)

- event_graph / deck / ghost-event flows: the fix changes only clarification candidate arrays;
  ProtocolLocalizationThread.heldBundle.test.tsx (3 tests) and the deck gate pins (AC4) prove
  the fold is byte-unchanged. No event_graph files in scope.
- shorthandChat flow (AI tab): consumes the same engine clarifications; nounShape tests gate
  presence-only (`.some()`), so dedup is invisible to them — they must pass unedited.
- QuestionsPanel / AiTabPanel surfaces: consume `options` from upstream
  `clarificationRequests` built server-side (the deck-ghost-shorthand e2e spec stubs the
  duplicate wire shape at app/e2e/deck-ghost-shorthand.spec.ts:85-86,105-106 — harness canned
  data, NOT product code; leave it, it exercises exactly the shape AC3 handles).
- RefPicker + /m slash menu + ResolveSpine consumers (resolveDraftMaterials, MCP, HTTP
  /resolve): untouched by design; the spine still appends one mint per call.
- vocab mint endpoint & idempotency (DEFECT 3), ontology_resolution's fallback semantics
  (strategyOrder data), the A5 accept-leg items: separate tasks; the architect decision
  (.hermes/plans/decisions/W28-A5g-postmerge-caution-fired-decision.md fact 6) explicitly
  keeps this item standalone and non-gating.

## OPEN QUESTIONS (unresolved locally, for the orchestrator)

1. Should the held card ALSO stop rendering the (now single) mint option button when the picker
   floor covers it (my Edit 2 says yes — one row total per AC5's browser wording "one mint row
   per noun"), or is "one wire candidate + one picker floor row" (two DOM affordances) the
   accepted meaning? Checked: REPORT DEFECT 4 counted the two option buttons; the gate prompt
   said "dedupe-by-label absorbs it". Spec as written takes the strict reading (one row total);
   orchestrator may relax AC3/AC5 if Brad means wire-level only.
2. Golden re-bless authority: SPINE-6 blessed the manifest ONCE at a named commit with an orch
   ruling. This spec assumes the orchestrator grants a re-bless in the promotion review; nothing
   local authorizes a coder to re-bless unilaterally.
3. Whether the 2-candidate canned shapes in app/e2e/deck-ghost-shorthand.spec.ts should be
   refreshed to post-fix wire shape in THIS item (currently scoped out as harness canned data;
   left as-is it doubles as regression coverage of the dedup).

COMPOSER DONE

## ORCHESTRATOR ADJUDICATION (l2t2315, 2026-10-17T23:30 EDT) — rulings on the 3 open questions

OQ1 — STRICT READING STANDS (one mint affordance TOTAL on the held card). Rationale beyond
the gate wording: the mint-LABEL option button is a DEAD END (handleClarificationPick answers
with the literal 'Create local term "x"' label, which the spine cannot bind -> re-bar; orch
first-hand in tmp-orch/mintfloor-dedup-recon-l2t2155.md, corroborated by the a5d-tier2 trail
where the WORKING mint was the picker row ri:8 with the 'New' badge). Keeping a visible
non-working duplicate would be dead chrome (SOP: non-interactive/duplicative affordances get
cut). AC3/AC5 as written (strict) are BINDING.
OQ2 — RE-BLESS GRANTED by the orchestrator for exactly the 4 named `__records__` files + their
MANIFEST.yaml sha256 entries, ONCE, in the SAME commit as the Edit-1 server fix (SPINE-6
doctrine). Any other record or manifest entry changing hash = spec violation.
OQ3 — CONFIRMED scope-out: app/e2e/deck-ghost-shorthand.spec.ts canned 2x-mint shapes stay
(harness canned data; they double as regression coverage of the client dedupe rule).

Also binding at promotion: the WORKER CONTRACT branch/worktree mechanics are superseded by the
orchestrator's dispatch (worktree under /mnt/vast/home/brad/git/wt/<item>-lane2-<token> cut from
cl/integration-2 tip at dispatch; report at the UNIQUE wip path named in the dispatch prompt).
Queue position: coder is fleet-single — MINT-FLOOR-UI-1 dispatches after WIRE-TEMP-1 merges.
