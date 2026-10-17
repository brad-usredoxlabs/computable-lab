# SH-QA-1 — SPEC DRAFT — lane 2 — composer l2t1040
Draft: 2026-10-15T11:05 EDT. Trunk base: cl/integration-2 tip 532ec676fe8c965a20ff6cd548715fd82f936ff0
(docs-only; last product merges COMP-4 876c67ac + HARNESS-SEQ-1 fix1 353800da). DRAFT — orchestrator
reviews, rules the OQs, and promotes; do NOT dispatch unreviewed.

## Contract header
- Lane 2, item SH-QA-1 ("End the clarification cascade that blocks event authoring: blob-heuristic
  false positive + no auto-satisfy dedupe (clofibrate blocker)").
- Server-side ONLY. File ownership in scope:
  `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` (raise-site split),
  `server/src/compiler/resolution/resolveNounsPass.ts` (the resolution-aware gate),
  `server/src/compiler/scientistIntent/compileScientistIntent.ts` (plumb the gated channel),
  `server/src/ai/shorthandChat.ts` (content-keyed join id + auto-satisfy ledger),
  `server/src/ai/AgentOrchestrator.ts` (fold leg ONLY — the re-hold around :1213-1240),
  new test files (§Test plan), plus the two existing chat/normalizer harnesses extended.
- OUT of scope: ALL of `app/` (SH-QA-2 owns card UX), `server/src/materials/MaterialGrounding.ts`
  (the grounding door stays exactly as is — this item keeps blobs FROM it, never edits it),
  `schema/**`, `config/drafting/mixture-material-cues.yaml` (default design leaves it byte-identical,
  see OQ1), `goldens/MANIFEST.yaml` + fixtures/records (no bless in this item — B7), the 422
  HTTP route (`IntentCompileFromPromptHandlers.ts` stays verbatim-passthrough).
- Queue: SH-QA-1 FIRST (blocker, deps: none). SH-QA-3 SERIALIZES AFTER this item (shared
  normalizeScientistIntent/resolution hot files). SH-QA-2 is app/-only and may run alongside.

## Goal (one sentence)
Make the mixture-cue blob bar fire ONLY on material labels the resolution engine does NOT bind
(resolve-vs-mint is already known at the SPINE-4 door), key the chat answer→fact join by fact
content instead of array position, and add the auto-satisfy ledger so a folded answer closes every
re-derived fact for the same action+argument — killing the clofibrate " in " cascade at the root.

## Ground-truth findings (VERIFIED in the tree at 532ec676, file:line; task-list citations re-anchored)
1. CUE DATA: `config/drafting/mixture-material-cues.yaml` — the spaced cue `- token: " in "` is at
   **:36**; per that file's own header (fix1/D1) a SPACED cue "is itself mixture shape → fires on the
   substring". Loader + firing interpreter live in `normalizeScientistIntent.ts`: path constant :44,
   `loadMixtureCues` :253 (loaded PER call, never process-cached — a cue edit needs no restart),
   `mixtureCuesFound` :341. CUE-EXEMPT-1 `exempt.names:` DATA exists (one entry, DNase/RNase Free
   Water) — DO NOT extend it with formulation names (per-record hardcode, forbidden by the task).
2. RAISE SITE: `normalizeScientistIntent.ts:716-758` — the COMP-1 Task 17 blob bar. Guard :743
   (`declaresMaterial && string material && !declaresComponents`, components honored in BOTH forms:
   `params.composition` :732 and COMP-4's declared action-level many-arg :737-742); fact push
   :750-755 with `reason: MIXTURE_BLOB_MATERIAL_REASON` (constant :392, value
   'unrealized-mixture-blob-material'), `actionLocation: {actionIndex, action, argument:'material'}`.
   WHY IT PRECEDES RESOLUTION: `normalizeScientistIntent` is called by
   `compileScientistIntent.ts:224` BEFORE `runPipeline` (:236) — the resolve_nouns pass runs INSIDE
   the pipeline (:153-160 registration), so at raise time the producer cannot know whether the label
   binds. The merge point is `compileScientistIntent.ts:253-259`: engine/bar clarifications verbatim
   FIRST, `producerClarifications` APPENDED AFTER (:256-259) — this is why the clofibrate first bar
   carried "Question 1 of 2" (engine unknown-noun) + "2 of 2" (producer blob) on the SAME slot.
3. RESOLUTION/RECONCILIATION SEAM (where resolve-vs-mint is KNOWN):
   `server/src/compiler/resolution/resolveNounsPass.ts` — `reconcileModelUnresolved` :132-189 with the
   identity join `identityKey` :100-112 (`slot:<actionIndex>:<argument>` when actionLocation present,
   `label:<label>` otherwise) and `boundKeys` :142-146 (a binding occupies BOTH its slot key and its
   label key — the exact machinery this fix needs); the bar :293 (`blocked = clarifications.length>0`)
   and the diagnostic :302-311 whose `details.clarifications` is the ONLY thing that survives the
   cascade barrier for a blocked pass (verified: PipelineRunner stores NO output slot for ok:false
   passes — the barrier-skip `continue` and the ok:true-only store, scout-cited and consistent with
   compileScientistIntent.ts:238-246's comment). THE resolve-vs-mint line: `resolvedByLabel` build
   skips `if (!binding.curie) continue; // the mint affordance is never a binding` :280 — `bindings`
   (engine output, in scope inside `run()` :266) is the authoritative "this slot RESOLVED" signal:
   `BoundNoun {verb, argument, label, curie?, actionIndex?}` (types.ts :93-103). The exact function
   where the cue fact can be raised-or-suppressed WITH resolution knowledge: `createResolveNounsPass
   (deps).run()` (resolveNounsPass.ts:242-314), post-`resolve()` — it already loops engine output by
   IDENTITY only (header law :20-24: no verb/class/domain NAME literals; reason codes and pass ids are
   the sanctioned string literals).
4. FOLD / RE-DERIVE PATH + POSITIONAL JOIN: `server/src/ai/shorthandChat.ts` —
   `unresolvedFactRequestId` :330-331 mints `unresolved-<index+1>`; `clarificationsFromUnresolvedFacts`
   :341-368 assigns it POSITIONALLY (:353) over `compiled.clarifications` in ARRAY ORDER;
   `foldAnswersIntoShorthand` :385-444 re-parses the join `^unresolved-(\d+)$` :393, looks up
   `held.clarifications[factIndex]` :399 (POSITIONAL), splices the label into the doc slot :409, and
   the recompile "re-derives the bars from scratch" (:414 comment) via the caller's
   `compileShorthandDeterministically` (AgentOrchestrator.ts:1213-1240: take held :1213, fold :1215,
   recompile :1217-1221, RE-HOLD on re-bar :1224, fallback re-hold :1247). Because fact order can
   shift between compiles (empirical iteration-2: a fact moved from `material` to `composition`), the
   positional id silently mis-folds — the THIRD HAZARD.
   JOIN-WIDTH CHECK (verified first-hand): the mint is UNIQUELY in shorthandChat.ts:330-331.
   `IntentCompileFromPromptHandlers.ts` mints NO ids — the task's ":274-287 mirror" citation is DRIFT:
   :274-287 is today the branch-questions arm; the 422 verbatim send is :343-351 (interface
   :174-176). The app NEVER parses the id: `QuestionsPanel.tsx:122` passes `request.id` through,
   `ChatLog.tsx:123` echoes it as `requestId`, `app/src/types/ai.ts:233` types it `string` — so the
   server may change the id STRING without touching app/. Note
   `normalizeScientistIntent.ts:854` mints a DIFFERENT id (`unresolved-<label>` for unresolvedRefs) —
   not the join; do not touch it.
5. REPRESENTABILITY AT THE MOVE TARGET: at the point the gate lands (finding 3) the resolution result
   is representable as `engine.bindings` — a slot bound to a REAL record carries `curie` (the
   'local:<id>' convention, recordIdFromCurie :120-123); the mint affordance is structurally excluded
   (:280). So "label binds to a real catalogued material/formulation" == `slot:<i>:<arg> ∈ boundKeys`
   — the identical join `reconcileModelUnresolved` already applies to model hedges (:152-158 DROP arm).
   No new signal, no new wire shape. Ambiguity note: an AMBIGUOUS label yields a clarification, not a
   binding — the cue bar correctly stays ON there (two subsystems may both ask until the scientist
   picks; after the pick, the label resolves and the gate suppresses).
6. GROUNDING DOOR (why the bar exists, unchanged): `server/src/materials/MaterialGrounding.ts:199`
   `ensureLocalMaterialForDraft` (verified :199) mints a `MAT-<slug>-<hash>` record per prose label
   (reuse by case-insensitive name). The bar prevents prose blobs reaching it; a RESOLVED label never
   reaches it (the ref is a record ref), so gating the bar on non-resolution loses zero protection.
7. COMP-4 INTERACTION (merged, must compose): the declared many-arg door
   (`resolutionEngine.ts:resolveScientistIntentNouns` :276+ / `requestFor` :227) emits ONE
   clarification per unresolved composition ENTRY, ALL SHARING the same `actionLocation`
   `{actionIndex, action, argument:'composition'}`, differing by `label` (the component name). A
   content-keyed join id MUST therefore include the label (see §Design join) or COMP-4 component cards
   collide. `compositionArgResolution.test.ts` :275/:291 pins the no-double-bar exemption.
8. MEASURED BASELINES (this session, at 532ec676): `cd server && npx tsc --noEmit` → **0** errors;
   `cd app && npx tsc --noEmit` → **23** errors (baseline, do not re-baseline); full server suite has
   the known load-timeout flap class (COMP-4 report: 47 failing FILES, 2 flaps proven green in
   isolation) — failing-FILE-SET equality is the discipline, not zero-failures.
9. HARNESS INVENTORY (for the RED plan): fold/round-trip harness
   `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` (stubModel + mockStore + SEED_RECORDS
   material seeds; the deterministic-fold test at :515+ proves the model-free fold arm);
   three-bar canonical payload `server/src/ai/shorthandChat.e2eStubHonesty.test.ts:168-208`
   (reasons `[unknown-noun, unknown-noun, unrealized-mixture-blob-material]`, labels
   `[plate, 50:50 Trypsin-EDTA/DMEM, 50:50 Trypsin-EDTA/DMEM]` — SAME slot, TWO facts, order-pinned);
   cue-data suite `declaredArgumentReachability.test.ts` (loadMixtureCues + mixtureCuesPath injection
   :396/:479-522); composition suites `compositionDecomposition.test.ts` (:176-180 exempt/barred
   reason legs), `compositionArgResolution.test.ts`; the closer clofibrate neighbour
   `forceMaterialClarifications.test.ts:374-397` (the E1/E2 "does NOT re-ask '1 mM Clofibrate in
   DMSO'" trust-the-record arm — SAME defect class one layer down; keep green); goldens replay
   `goldens/goldenIntentToClarification.test.ts` (pins the merged clarification order).

## Design
### A. Resolution-aware firing gate (fix 1) — generic slot-identity suppression, cue DATA untouched
The honest rule: **the cue bar fires only on material labels that do NOT resolve.** Move the firing
DECISION to where resolve-vs-mint is known; keep the cue MATCHING where the cue data is.
1. `normalizeScientistIntent.ts`: split the channel. Blob-bar facts (:750-755, reason
   MIXTURE_BLOB_MATERIAL_REASON) are pushed onto a NEW gated list instead of `unrealized`;
   `ScientistIntentNormalized` gains `resolutionGatedClarifications?: ProducerClarification[]`
   (optional, conditional spread — exactOptionalPropertyTypes). Everything else on `clarifications`
   (unrealized-well-label, unrealized-declared-argument) is byte-identical. Matching stays 100% data
   (mixtureCuesFound); the cue YAML is NOT edited (no gate flag, no exempt additions).
2. `compileScientistIntent.ts`: pass `normalized.resolutionGatedClarifications ?? []` into
   `createResolveNounsPass` as a new dep `resolutionGatedClarifications`, and stop appending them at
   :256-259 (the pass now owns their fate; when the pass does not block, suppressed facts are simply
   gone; when it blocks, surviving gated facts ride the bar diagnostic AFTER engine+required+model —
   the SAME end-of-list position today's :256-259 append produced, pinning golden order).
3. `resolveNounsPass.ts`: inside `run()`, after `resolve()` (:266), compute `boundKeys` for gated
   facts EXACTLY as `reconcileModelUnresolved` does (:142-146, `identityKey` slot key) and DROP every
   gated fact whose `identityKey` is a bound slot key. Surviving gated facts are APPENDED to
   `clarifications` (so `blocked` and the diagnostic count them). This is the file's header law
   honored: identity + engine output only — zero verb/arg/domain NAME literals, zero reason-code
   switch inside the pass (the reason stays normalize's channel-selector), zero new wire fields.
   A gated fact WITHOUT actionLocation (cannot happen for blob facts; defensively) is KEPT.
4. The result for clofibrate: cycle 1 label unbound → unknown-noun + blob both fire (today's honest
   double-bar, pinned by e2eStubHonesty — DO NOT merge them, B1). Scientist picks the catalogued
   "1 mM Clofibrate in DMSO" → fold splices → recompile: engine BINDS slot 0 material → blob gated
   out → clarifications [] → outcome complete → events proposed. Cascade dead at the root.
### B. Auto-satisfy dedupe (fix 2) — the answered-slot ledger
In `shorthandChat.ts` + the `AgentOrchestrator.ts` fold leg only:
- `HeldShorthandIntent` gains `answeredSlots?: Array<{actionIndex: number; argument: string;
  label: string}>` (the ledger travels with the held intent; MAX_HELD eviction semantics unchanged).
- `foldAnswersIntoShorthand` returns the answered slot identities it spliced (fact.actionLocation
  actionIndex+argument + the chosen label).
- Orchestrator fold leg (:1224 re-hold): after the recompile, for each answered slot, iff the
  re-derived bar contains NO fact for that slot identity, add `{actionIndex, argument, label}` to the
  ledger carried into the re-hold (a disappeared fact NEVER re-surfaces while the slot value is
  unchanged). Facts for a slot that STILL bars (the answer did not resolve) are kept — legitimate
  re-ask, the ledger must not swallow it.
- New exported helper `dropSatisfiedFacts(facts, ledger, doc)`: drops a fact iff its slot identity is
  in the ledger AND `doc.actions[actionIndex][argument]` still equals the ledger label verbatim
  (a changed slot value re-opens the question). Applied to `compiledFold.clarifications` BEFORE
  building the requests and BEFORE the re-hold, at the orchestrator fold leg. This also implements the
  task's same-slot two-facts rule: answering the first fact of a slot closes ANY re-derived second
  fact for the same action+argument, whatever reason it re-derives under.
- Scope honest-boundary: the ledger lives on the CHAT held-intent path. The 422 HTTP
  held-`localMacro` loop is NOT touched (its answer fold is client-side macro editing) — if the
  orchestrator wants the ledger on the 422 arm too, that is a wire-protocol conversation (stop_boundary).
### C. Content-keyed join (the third hazard)
- `unresolvedFactRequestId` becomes `factRequestId(fact) = 'unresolved-c-' + <10-hex sha1 of
  JSON [actionIndex, action, argument, reason, label]>` (node:crypto; label INCLUDED because COMP-4
  many-arg siblings share the slot — finding 7). Deterministic across compiles: same fact → same id;
  order-independent: a fact-order shift cannot mis-fold. The id stays a STRING on
  `AgentClarificationRequest.id` — no SSE/wire SHAPE change (the app echoes it verbatim, finding 4).
- `foldAnswersIntoShorthand` resolves answers by building the same key map over
  `held.clarifications` (exact match wins); the legacy `^unresolved-(\d+)$` positional arm is KEPT as
  an explicit back-compat fallback (a digits-only id still folds positionally — four lines, pinned by
  test) so nothing mid-flight breaks. The null contract is unchanged: any answer with no map hit ⇒
  null ⇒ the permitted extraction-only re-ask.
- The `gap-<n>` ids in `clarifications.ts:196` and `clarificationRequestsFromAssurance` are a
  different channel — untouched.
### D. Data-first accounting + the split I propose (OQ1)
Cue TOKENS, firing rules, mixture shape, thresholds, exempts: remain 100% DATA in
mixture-material-cues.yaml, byte-identical in this item (zero cue literals in TS preserved — repo
rule #1). What moves into TS is NOT cue policy but ORDER: the generic invariant "a producer fact on a
slot the resolution engine bound is moot." I could not express the ordering move in the cue YAML
because the YAML has no vocabulary for pipeline order or for the binding signal — the one honest
declarative seam I found is the CHANNEL SPLIT (normalize emits, the door decides), which is structural
but reason-keyed and label-free. This satisfies the stop_boundary's letter (nothing moved OUT of the
cue YAML) while flagging the ordering rule as TS policy — see OQ1.

## Acceptance criteria (verbatim from the task list, id SH-QA-1 "verified by")
> Red-first tests: (a) "1 mM clofibrate in DMSO"-style formulation names never yield
> unrealized-mixture-blob-material when they resolve (golden through normalizeScientistIntent;
> sibling shapes "5 mg/mL lysozyme in PBS", "0.1% Triton X-100 in water"); (b) FOLD-LOOP regression:
> bar -> answer with a still-cue-bearing label -> recompile must NOT re-emit the blob fact for the
> resolved slot (this is the exact Brad trap; assert on the fold path's recompile output); (c)
> answering Q1 auto-closes any re-derived fact for the same action+argument (no second card); (d) the
> genuine mixture-blob case still 422s — an UNRESOLVED cue-bearing label with no composition still
> bars (COMP-3/COMP-4 goldens + the cue-data suite stay green — do not regress the bar to dodge the
> bug). Then on :5193: the clofibrate sentence reaches a proposed, ghostable event set end-to-end
> (browser receipt rides SH-QA-2's gate).

## RED-first test plan (existing harness idioms; fixture strings live ONLY in tests — rip-out rule)
### File 1 (new): `server/src/compiler/scientistIntent/cueResolutionGate.test.ts`
Store-seeded real-pipeline harness (parseScientistIntent → compileScientistIntent with
createResolveSpineFromContext over a mockStore seeded with material records), the
declaredArgumentReachability / compositionArgResolution idiom:
- T1 RED-FIRST (write FIRST, paste RED): store has "1 mM Clofibrate in DMSO"; doc
  `add_material material: "1 mM Clofibrate in DMSO" volumeUl:1 targetWells:[A2]` → outcome 'complete',
  clarifications [] . Today's RED: needs-clarification carrying
  unrealized-mixture-blob-material (cue " in ", no composition).
- T1b/T1c siblings: seeded "5 mg/mL lysozyme in PBS", "0.1% Triton X-100 in water" → complete, no blob
  fact (task's verbatim sibling shapes).
- T2 GENUINE BLOB STILL BARS: same shapes with EMPTY store → needs-clarification, reasons include
  'unrealized-mixture-blob-material' AND 'unknown-noun' on the same slot (order: unknown-noun first),
  message cites mixture cues found `" in "`; store.list() [] (no partial mint).
- T3 gated-channel unit leg: normalizeScientistIntent directly — blob fact rides
  `resolutionGatedClarifications`, NOT `clarifications`; every other producer reason unchanged.
- T4 generic-door leg: inject `resolveNounsEngine` stub returning a binding for slot 0:material (with
  curie) → gated fact suppressed WITHOUT any store; stub returning none → gated fact survives in the
  bar diagnostic — proves the drop is a slot-identity join, not label matching, not a name table.
- T5 COMP-4 no-collision leg: unresolved composition entries → per-component clarifications survive
  the gate (their slot is unbound) and blob-on-material is unaffected (compositionArgResolution
  legs :275/:291 stay green).
### File 2 (new): `server/src/ai/shorthandChat.cueCascade.test.ts`
AgentOrchestrator.shorthandChat.test.ts idiom (stubModel, mockStore, SEED_RECORDS incl.
'1 mM Clofibrate in DMSO'):
- T6 FOLD-LOOP REGRESSION (the Brad trap): turn 1 doc `material: "1mM Clofibrate in DMSO"`
  (unbound first-pass label, cue-bearing) → two facts on slot 0 material (unknown-noun + blob),
  model.callCount 1; turn 2 answers the unknown-noun card with label '1 mM Clofibrate in DMSO' →
  deterministic fold, recompile must be 'complete': events > 0, NO clarificationRequests, model still
  1. Today's RED: second turn still needs-clarification with the blob fact, events [] — the shipped
  loop.
- T7 AUTO-CLOSE same action+argument: two-fact bar where turn 1 also has an unbound plate; answer the
  material card; the re-bar may re-show the plate card but NEVER a second card for slot 0:material.
- T8 LEDGER persistence: call `dropSatisfiedFacts` directly — fact re-derived for a ledgered slot with
  unchanged slot value → dropped; slot value edited by the scientist → KEPT (legitimate re-ask).
- T9 POSITIONAL-JOIN PROOF: held with facts F1(material)/F2(composition-entry); answer keyed to F2's
  content id while the re-hold array order is FLIPPED vs the mint order (fact-order shift as seen in
  the live iteration-2) → the fold splices the COMPOSITION entry slot, not material; plus two
  same-slot COMP-4 component facts get DISTINCT ids (label in the key). Legacy leg: a
  `unresolved-2` digits id still folds positionally (back-compat arm), a garbage id ⇒ null ⇒
  extraction-only re-ask (null contract pinned).
### Existing files (extended, not rewritten)
- `resolveNounsPass.test.ts`: gate legs (T4-shape at the pass level) + shipped-declaration check that
  gated survivors land AFTER engine+required+model facts (bar order).
- `AgentOrchestrator.shorthandChat.test.ts`: fold-leg ledger re-hold carries `answeredSlots`.
### Suites that MUST stay green (quoted, per verified-by (d))
cue-data suite `declaredArgumentReachability.test.ts`; COMP-3 Part I
`compositionDecomposition.test.ts`; COMP-4 `compositionArgResolution.test.ts` +
`vocabulary*.test.ts` + `promptShapeParity.test.ts`; three-bar canon
`shorthandChat.e2eStubHonesty.test.ts`; `clarificationContract.test.ts`; goldens
`goldens/goldenIntentToClarification.test.ts` + full `goldens/` (MANIFEST UNTOUCHED — no bless);
`forceMaterialClarifications.test.ts`; `server/src/compiler/resolution/` whole directory
(resolveNounsPass / nounResolution / spine4* / hintParity).

## First targeted check (prove the approach early)
After writing T1 ONLY (no implementation):
```bash
cd server && npx vitest run src/compiler/scientistIntent/cueResolutionGate.test.ts
```
Expected RED: T1 fails with outcome 'needs-clarification' / a blob fact on slot 0:material while the
store clearly holds the record. This single command reproduces the clofibrate blocker headlessly and
proves the harness before any product edit.

## Verification commands (complete; vitest cwd MUST be `server` — schema symlink resolution)
- Baseline BEFORE coding, on the dispatch base: `npm run test:run -w server` (full), capture the
  failing-FILE list → `/tmp/shqa1-base-failfiles.txt`; after the change, re-run and prove
  failing-FILE-SET equality via `comm -3 base head` — empty except flaps EACH proven green in
  isolation (COMP-4 report discipline: known load-timeout flap class, 47-file baseline set; never
  quote a raw failure count without the comm proof).
- Targeted: `cd server && npx vitest run src/compiler/resolution/ src/compiler/scientistIntent/ src/ai/`
  — ALL green including the two new files and every suite listed above.
- Goldens untouched: `cd server && npx vitest run src/compiler/scientistIntent/goldens/` green AND
  `git -c core.fileMode=false diff --name-only <base>..HEAD` shows NO goldens/ or MANIFEST.yaml paths
  (no bless in this item).
- tsc baselines (measured at 532ec676 THIS session): `cd server && npx tsc --noEmit | grep -c "error TS"`
  → `0`; `cd app && npx tsc --noEmit | grep -c "error TS"` → `23` WITH set-diff empty against the
  baseline error set (count-equality alone is not enough — set-diff, per g2dfix stash-parity idiom).
  Neither baseline is re-baselineable.
- Scope: `git -c core.fileMode=false diff --name-only <base>..HEAD` → ONLY the §Contract-header files
  + tests + report. ANY app/ path, ANY schema/ path, ANY config/drafting path (default design) =
  scope fail.
- Restart note: the cue YAML is loaded PER call (normalize :776-780, never cached) and this item does
  not edit it; the vocabulary IS cached (vocabulary.ts per-path cache) — also untouched. So NO stack
  restart is required to trust :3093/:5193 legs after merge; if the live leg is run pre-merge, the
  orchestrator owns the restart — the coder never restarts the lane stack.
- Live proof (done-gate): on :5193 the clofibrate sentence reaches proposed ghostable events; the
  browser receipt rides SH-QA-2's gate (headless proofs above stand alone for the coder report).

## Worker contract
- Worktree: `/mnt/vast/home/brad/git/cl-integration-2/wt/SH-QA-1-lane2-l2t1040` (orch creates at
  dispatch tip; RE-ANCHOR every file:line above against the branch point — trunk moves).
- Branch: `cl/SH-QA-1-lane2-l2t1040` off cl/integration-2. Fleet coder lock acquired before coding.
- Report: `<worktree>/.hermes/plans/reports/SH-QA-1-report.l2t1040.md`; end marker `SH-QA-1 DONE <sha>`.
- Commits: RED test commits first (`test(shqa1): …`), then `fix(compiler): …`; never `git add -A`;
  `git -c core.fileMode=false` for every git call.
- exactOptionalPropertyTypes ON: new optional fields ride conditional spreads only.
- Serialization: SH-QA-3 MUST NOT be dispatched against these files until this item merges.

## Reviewer bait (B1-B7 — try to break these)
- B1 THE GATE DOES NOT BLUNT THE BAR: an UNRESOLVED cue-bearing label with NO composition still bars
  (T2), the unknown-noun+blob SAME-SLOT two-fact first bar is preserved verbatim in count AND order
  (e2eStubHonesty :188-196 pins `[unknown-noun, unknown-noun, unrealized-mixture-blob-material]` —
  a "merge same-slot facts into one" shortcut is a DEFECT, not a simplification).
- B2 " in " IS NOT BLUNTED FOR REAL BLOBS + NO PER-RECORD HARDCODE: `git diff` shows
  mixture-material-cues.yaml byte-identical (no cue edits, NO new exempt.names — adding "1 mM
  Clofibrate in DMSO" to exempt is the forbidden per-record hardcode), and zero reagent/label/cue
  literals in any src/ file (genuinely seeded only in test SEED_RECORDS).
- B3 NO NEW WIRE/SSE SHAPE: 422 body byte-shape untouched; AgentClarificationRequest keeps its fields
  (only the `id` STRING value changes format — app echoes it verbatim, verified app/-wide grep: no
  app code parses `unresolved-`); ScientistIntentUnresolvedFact (SPINE-1 frozen) gains NO field; the
  pass diagnostic gains NO new key (unlike a `details.bindings` shortcut — rejected precisely because
  details flows toward the wire surface). If the coder believes a wire shape MUST change → stop and
  return to the architect (stop_boundary).
- B4 THE GATE IS IDENTITY, NOT NAMES: resolveNounsPass contains zero verb/arg/domain/reason NAME
  literals added by this item (header law :20-24); T4's engine-stub leg is the mutation-proof
  counter (suppression follows boundKeys, not label equality, not a clofibrate branch). Also: gated
  facts WITHOUT actionLocation are kept, never silently dropped.
- B5 JOIN KEY COMPLETENESS: the content key MUST include `label` — COMP-4 many-arg siblings share
  actionIndex+action+argument+reason (finding 7); a key without label COLLIDES two component cards.
  T9's order-flip leg must fail loudly if the fold is secretly still positional; the legacy digits arm
  must not shadow a content id (test both). `normalizeScientistIntent.ts:854`'s `unresolved-<label>`
  unresolvedRef ids are NOT the join — untouched.
- B6 THE LEDGER MUST NOT SWALLOW LEGITIMATE ASKS: an answer whose label still does not resolve keeps
  re-asking (slot still bars ⇒ not ledgered); a scientist-edited slot value re-opens the question;
  the fold null-contract (any non-mapped answer ⇒ null ⇒ exactly ONE extraction-only re-ask) is
  pinned unchanged (cf. the existing malformed-payload test at :400-460).
- B7 MANIFEST / BLESS: no golden fixture added, no treeState line moved, MANIFEST blob hash
  IDENTICAL to dispatch base (`git -c core.fileMode=false hash-object …/MANIFEST.yaml`, cite the
  hash). config/drafting/* is NOT treeState-pinned (verified: treeState lists only the three schema
  files, MANIFEST.yaml :14-16) — so even an OQ1-gate YAML edit would not force a bless; none is
  proposed.
- exactOptionalPropertyTypes sites: `resolutionGatedClarifications?`, `answeredSlots?`, ledger entry
  spreads, `ScientistIntentNormalized` field — `: undefined` fails tsc, conditional spreads only.
- YAML-reload trap: any "live" claim about cue/vocab behavior must state whether a restart was done;
  with the default design NO restart is needed, and tsx --watch caching must never be assumed.

## Open questions (orchestrator rules)
- OQ1 (the stop_boundary split, per the task's explicit demand): the cue tokens/shape/exempts stay in
  mixture-material-cues.yaml UNTOUCHED; the resolution-aware ORDERING rule lands as a TS structural
  invariant (channel split + identity-join drop in resolveNounsPass.run(), §A.1-A.3), because the cue
  YAML has no expressible vocabulary for pipeline order or the binding signal. Alternative the coder
  must NOT pick without a ruling: a `firingGate:` key inside the cue YAML (data flag) + flag-aware TS
  — more data theater, same TS rule, plus a loader-schema change. Default = §A; ruling requested.
- OQ2 (legacy join fallback): keep the four-line positional fallback for `unresolved-<digits>` during
  transition (spec default: KEEP, pinned by T9) or hard-cutover to content ids? Checked: no server or
  app consumer parses the digits format outside foldAnswersIntoShorthand and the test fixtures
  (scout + first-hand grep both confirm; fixtures updated to content ids either way).
- OQ3 (ledger on the 422 HTTP loop): the auto-satisfy ledger is chat-held-intent-only (§B boundary);
  extending it to the held-`localMacro` 422 arm changes how answers round-trip (client folds the
  macro) and smells like the wire-shape stop_boundary — spec assumes chat-only unless ruled. Checked:
  IntentCompileFromPromptHandlers.ts:343-351 sends clarifications verbatim and holds localMacro; no
  server-side fold exists on that route, so a ledger there needs a new server-side fold leg.

## Assumptions the coder may NOT make
- May NOT assume same-slot facts merge — the two-fact first bar is the pinned canon (B1).
- May NOT assume the blocked pass's `output` is visible anywhere (it is NOT — only the diagnostic
  details; that is why the gate lives INSIDE the pass, not at compileScientistIntent's merge point).
- May NOT assume the 422 route mints join ids (it does not — shorthandChat.ts:330-331 is the sole
  minter; the task's :274-287 mirror citation is drift; the 422 send is :343-351 at 532ec676).
- May NOT assume a content join key without `label` is safe (COMP-4 shares slots across component
  facts).
- May NOT assume app/ needs any change (grep-verified: the app echoes request.id verbatim), nor touch
  QuestionsPanel/AiTabPanel (SH-QA-2's turf, and its "dead Change" leg is a separate defect).
- May NOT assume the app tsc baseline is 0 (it is 23 at this tip; set-diff, don't re-baseline).
- May NOT assume MANIFEST needs re-blessing (it must NOT move — B7), nor that cue-YAML edits are
  treeState-pinned (they are not).
- May NOT assume tsx --watch reloads the vocabulary (it doesn't; cue data is per-call and safe) nor
  restart the lane stack themselves.
- May NOT invent ontology/level terms or new reason codes; MIXTURE_BLOB_MATERIAL_REASON's string
  value is frozen across every existing test that greps it.

SPEC-DRAFT-STATE: draft for orchestrator review; canonical promotion is the orchestrator's call.

## ORCHESTRATOR RULINGS (l2t1255, 2026-10-15T13:20 EDT — binding for the coder)
- OQ1 RULED: the CHANNEL SPLIT + identity-join drop in resolveNounsPass.run() (§A) is the
  adopted design. The cue YAML stays byte-identical; the ordering invariant is a structural
  TS fact ("a producer fact on a slot the resolution engine bound is moot"), not cue policy.
  The `firingGate:` YAML-flag alternative is REJECTED as ruled (data theater + loader-schema
  change for zero policy gain).
- OQ2 RULED: KEEP the positional `unresolved-<n>` fallback during the transition, pinned by
  test as fallback-only (content-keyed id is primary). Cheap insurance, sole minter verified.
- OQ3 RULED: the auto-satisfy ledger does NOT extend to the held-422 HTTP arm in this item
  (no server-side fold there = wire-shape stop_boundary). If the coder's RED work proves the
  422 arm re-asks the SAME disappeared fact, record the evidence and hand back — do not
  invent a payload.
- Orchestrator first-hand spot-verification at promotion: blob-bar comment block
  normalizeScientistIntent.ts:716+, reason constant :392; cue token " in "
  mixture-material-cues.yaml:36; unresolvedFactRequestId shorthandChat.ts:330-331;
  resolveNounsPass bindings/out-slot documented at :7-8/:87. Composer citations confirmed.
