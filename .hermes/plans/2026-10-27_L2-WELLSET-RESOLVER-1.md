# WELLSET-RESOLVER-1 — spec-of-record (CANONICAL, orch-promoted l2t2355)

Status: PROMOTED by orchestrator 2026-10-27 ~23:55 EDT with the RATIFICATION FOLD below
(binding). Composer grounded every cite first-hand at trunk tip `ed73daab`
(Q1VOL + SUITE-B FIX-8 already merged — tip moved past the brief's b0ca8691; the volume
fix is IN, see §Grounded cites, item 9). Re-verify line numbers against the claim-time tip.

## ORCHESTRATOR RATIFICATION FOLD (l2t2355) — binding amendments to the draft

1. OQ-1 RULED + ALREADY LANDED (decisions/WELLSET-RESOLVER-1-oq-rulings-l2t1705.md):
   route (b) harness-accumulation fidelity fix is MERGED at e196597b (lib/context_state.py
   _accumulate_wells now rides the turn's UNIQUE resolvedLabwares offer; expectations/
   untouched; RED-proof test-offer-bind-selfcheck.py 4/4 PASS re-verified by orch on trunk
   2026-10-27 ~23:55). The vacuous-green trap in the drive is CLOSED from the harness side.
   The coder's job is unchanged: the PRODUCT must deliver the NON-EMPTY resolved union on
   the mix event; vacuous-green remains an acceptance failure.
2. OQ-2 CONFIRMED (decisions/WELLSET-OQ2-screening-l2t1915.md, re-verified by orch at
   trunk 64d266af/3f56f45f: AgentOrchestrator.ts has ZERO `conversationId` occurrences):
   the LabStateCache is DEAD on the orchestrator path today. Threading priorLabState
   through ShorthandCompileDeps is NOT sufficient — the coder MUST ALSO pass
   `conversationId: conversationKey` at the orchestrator runChatbotCompile call site(s)
   (:1696, :4099 neighborhoods) so the cache read/write fires across turns. Identity is
   then true by construction (conversationKey = deriveContextCacheKey, one derivation —
   AgentOrchestrator.ts:1290). Stop boundary (a) only fires if the keys DIFFER in
   derivation, which the screening rules out.
3. OQ-3 RULED (rulings doc §OQ-3): new reason-code constant on the EXISTING
   ScientistIntentUnresolvedFact envelope, kind:'labware' candidate-card shape, following
   the UNREALIZED_WELL_LABEL_REASON precedent. No second channel, no new emission type.
4. ACCEPTANCE RIDER (P8-flip, rulings doc 'Gate state'): the post-WELLSET --all drive must
   show P8 events-bound TOO (the deck-binding fold-in re-drives P8's history-sensitivity),
   in addition to the P7 flip.
5. STANDING ROUTING (AS-L2T2255-MIXWELLS-RIDES-WELLSET, lane 2 handoff l2t2255): once this
   item ships, the computed union ON the mix event is what uifix2's leg-A client attribution
   and the deck tile consume; do NOT let a client-side fabrication of mix wells reappear.

## GATE — DO NOT CLAIM YET

Claim ONLY after L2-SUITE-A closes (task-list deps line: "claim after SUITE-A closes — P7
flips from ruled-wall to events-bound IS this item's acceptance"). SUITE-A is open at
composition time (P8 outstanding, browser gate owed). Per-item discipline: this spec may be
promoted now; the queue unit must not fire before the SUITE-A close lands.

## Intent

Give the scientist-intent vocabulary a declared, contents-derived wellset token
(`kind: wellset`, symbolic — e.g. the value `all-wells-containing-materials`) plus a
vocabulary-driven resolver pass in the compile pipeline that computes the concrete well set
SERVER-SIDE from the run's conversation ledger and returns the set PLUS the deck-labware
binding — so "pipette mix on all wells that contain materials" self-expresses instead of
relying on a client display projection or a model-guessed well list.

## Brad quote + worked example (the acceptance story)

Brad approved 2026-10-27 ~10:20 EDT (card
`/home/brad/.hermes/cl/lanes/2/decisions/WELLSET-RESOLVER-1-brad-approval-card.md`,
verbatim):

> "we need to add to our vocabulary a term that means contents-defined-set. yes!! this is
> precisely how the system needs to evolve, declaratively by increasing our vocabulary."

Worked example (from the approval conversation, binding semantics): accept "add material A
to A1-H1", accept "add material B to A2-H2", then "pipette mix all wells that have
material" MUST resolve to A1:H2 from the accepted event history on the server. The facts are
already transferred by the accepts; the vocabulary word + the server-side read-path are what
is missing. The task-list description adds: the resolution covers "committed history +
pending-draft layer, matching the page's preview semantics".

The architect ruling (`decisions/SUITEA-P7-mix-wellset-scope-l2t0635.md`) fixes the shape:
Q2 ruling (iii)+(i) — declarative token class + ledger resolver, NO verb-branch TS; Q1 fold —
the 8-channel column-aligned expansion over a contents-derived set rides this item (a channel
arg was ruled an undesignated ornament in the Q1 fix-run); Q3 fold — labware binding is
inherent to the resolution ("a contents-derived wellset resolver must know WHICH labware it
inspects … Fold it in"), and any coder "fix" widening acceptedBindings across turns
CONTRADICTS a Brad ruling — refuse it.

## Grounded cites (composer-verified at ed73daab; scout output used only as screening)

Vocabulary DATA surface — `schema/scientist-intent/scientist-intent-vocabulary.yaml`:
1. `mix` verb :69-102 — declared args source/target/labware (kind: resolvable,
   domain: labware, hintEligible) :73/:78/:83, duration :88, **volume :91 (post-Q1VOL)**,
   cycles :94, rpm :97, temperatureC :100. **No kind: wells / kind: wellset arg exists on
   mix today** — the P7 claim has no carrier arg yet.
2. `transfer` :267 is the pattern-carrier for well addresses: `sourceWells` kind: wells :292-293,
   `targetWells` kind: wells :295-296; aliquot `targetWells` kind: wells :509 (required:true,
   SPINE-7 comment :505-508). All kind: wells sites in the file: :293, :296, :503, :509,
   :722, :725, :756, :759, :787, :790, :815, :818.
3. `referentLevels:` :852 and `policies.strategyOrder` :855-859
   (explicit_wells, hint_search, symbolic_label, ontology_resolution, mint_local) — the
   resolver binding's design neighborhood; lint P7 allIn pins level nouns against :852.

Kind enumeration sites a `wellset` kind must pass (all three, same commit):
4. `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml:81` —
   `enum: [resolvable, scalar, wells, quantity]` (Ajv gate on the YAML).
5. `server/src/compiler/scientistIntent/vocabulary.ts:44` —
   `export type ScientistIntentArgKind = 'resolvable' | 'scalar' | 'wells' | 'quantity';`
   (TS union; RawArg mirror :190). Sweep every `contract.kind ===` consumer at claim time
   (e.g. normalizeScientistIntent.ts:568 `filter((contract) => contract.kind === 'wells')`).
6. `schema/registry/prompt-templates/intent.compile.system.yaml:36` — the mix mirror line,
   synced by ca2ee7fb after Q1VOL went RED on vocabularyMirrorDrift. ANY new declared arg or
   rendered kind lands here in the SAME commit (Q1VOL advc cycle-1 D1 precedent — this suite
   pairs `server/src/compiler/scientistIntent/promptShapeParity.test.ts` and
   `server/src/ai/shorthandContractDisclosure.test.ts`).

Declared-pass pattern the resolver mirrors — `schema/registry/compile-pipelines/scientist-intent-compile.yaml`:
7. Pass list :12; `resolve_roles` :67-70 ("family: expand, depends_on:
   [expand_protocol_intent_patterns, expand_biology_verbs, lower_protocol_intent,
   resolve_nouns] — Map role coordinates to concrete well addresses under current
   orientation") — the resolve-spine precedent: address materialization runs POST-expansion
   on the event list. `lab_state` :87-90 ("Fold events over prior lab state and emit
   labStateDelta") depends_on resolve_roles. The new `resolve_wellsets` pass is declared here
   (family expand, ordered like resolve_roles). Registry consumption:
   `server/src/compiler/scientistIntent/compileScientistIntent.ts` builds the PassRegistry
   (:25, registry build :150-260; resolve_roles output read :348). Passes are registered per
   declaration — a wellset pass is pipeline DATA + one registered module, NO verb-name branch.
   Consumers of resolve_roles' output slot (precedent for writing concrete wells onto
   post-expansion events): ChatbotCompilePasses.ts :1737, :2501, :3052, :3415.

Declared-args-only carry — `server/src/compiler/scientistIntent/normalizeScientistIntent.ts`:
8. Params passthrough + declared-arg ride: comment :764-765 ("onto the candidate event under
   its declared name"), the `cardinality: many` argContracts loop :771-777, COMP-1 Task 16
   declared-quantity reachability bar :786+ (a declared quantity that is neither number nor
   {value, unit} bars loudly — e.g. `volume: "75 ul"` string). An UNdeclared arg is silently
   dropped (the P7 volume natural experiment). `declaredWellsArgs()` :564-570 is THE one
   data-driven wells-kind detector — extend/reuse it (or its wellset sibling), never a
   verb/field table.

Expander — `server/src/compiler/biology/verbs/simpleVerbs.ts`:
9. `mixExpander` :157-175 — reads `params.volume` (:161) and `params.cycles`, emits
   details.{volume, cycles} + `labwareId: params.labware_id`. Registered :766. It does NOT
   read wells; concrete well addresses land on the event post-expansion (the resolve_roles
   precedent), NOT via an expander change.

Server-side ledger read path (THE gap to name and fill):
10. The page's preview semantics are CLIENT-side: `app/src/event-editor/focus/
    wellStateProjection.ts` — `eventsWithPreviewState` :6-11 (committed events +
    previewEvents), `occupiedWellsForLabware` :29-41, `wellHasVisibleState` :25-27
    (volume>0 || materials.length>0 || harvested). DISPLAY projection only; the server has no
    equivalent today (architect grep + composer re-grep agree).
11. SERVER-side equivalents that DO exist and are the resolution sources:
    - Per-conversation contents ledger: `LabStateSnapshot.labware[instanceId].wells` is
      `Record<wellId, MaterialRecord[]>` (`server/src/compiler/state/LabState.ts:28-34, 55-62`)
      — a committed-contents map per well. Cached across turns by
      `server/src/compiler/state/LabStateCache.ts` (get/put :14-19,
      `getDefaultLabStateCache()` singleton :65); written by the compile itself:
      `server/src/ai/runChatbotCompile.ts:596-599` (`cache.put(convId,
      labStateDelta.snapshotAfter)`), read back :242-248 (explicit priorLabState > cache >
      emptyLabState). `lab_state` pass output snapshotAfter (:503-506).
    - `priorLabState` is ALREADY a declared dep of the compile
      (`compileScientistIntent.ts:86 ScientistIntentCompileDeps.priorLabState?:
      LabStateSnapshot`) and feeds the lab_state fold — but the SHORTHAND chat seam does NOT
      thread it: `compileShorthandDeterministically`
      (`server/src/ai/shorthandChat.ts:478-495`) spreads only spine /
      searchLabwareByHint / scientistAnswers / answeredClarificationLabels
      (`ShorthandCompileDeps` :93-…). Call sites build deps inside the orchestrator turn that
      HAS the conversation key (`AgentOrchestrator.ts:1406` fold-compile;
      `labStateCache: getDefaultLabStateCache()` at :1706 and :4108).
    - Persistent run ledger: `RunContextAssembler.assembleEventGraphContext(runId)`
      (`server/src/ai/RunContextAssembler.ts:222-245`) returns the event-graph record's
      committed `payload.events`; `EditorContext.runId/eventGraphId` exist
      (`server/src/ai/types.ts:454-457`), `wellStateSnapshot` (client-derived) at :407.
    DECLARED GAP + minimal addition: the shorthand path resolves over
    `priorLabState` (conversation ledger = the committed-contents layer the accepts feed)
    PLUS the current document's own events (pending-draft layer, matching preview semantics).
    Threading `priorLabState` into `ShorthandCompileDeps` + the resolver pass is the minimal
    server read-path addition. Reading the store event-graph record for cold-start
    conversations is declared OUT (rides the cache lifecycle; SUITE-A drives one held
    conversation end-to-end, harness README OQ2).
12. Deck-binding machinery already at the seam (Q3 fold, do NOT rebuild):
    `bindShorthandEventsToDeck` shorthandChat.ts:233 (deck map wins collisions, resolved-offer
    map :270-289, refusal classifier :295+), `deckLabwares` context :138,
    `composeLabwareHintLookupWithDeck` :171 (EXACT-name deck match, deck-first),
    `composeSpineWithReuseBindings` :433. acceptedBindings lifecycle :576-613 (map :583,
    remember :585, read only on revise :594-612) — BY DESIGN per the Q3 ruling; do not widen.
    The resolver returns the labware binding as part of its output; the existing binder turns
    it into the event's labwareId.
13. Answerable-card channel (never-guess arm): unresolved facts become cards via
    `clarificationsFromUnresolvedFacts` (`shorthandChat.ts:841`, card shape ~:876-900:
    {id: factRequestId, kind, prompt, origin:'harness', entityType, menuProvider, query,
    options:[{id,label,snippet}], allowCreateLocal, unresolvedFact}); bar-loop guard
    precedent `applyCompositionRoleGuidance` (normalizeScientistIntent.ts:1088-1097) —
    same-envelope, one-clarification-per-gap, answered-labels-do-not-refire. An ambiguous
    contents set (two labware with materials) MUST ride this channel (see OQ-3 for envelope
    fit).

8-channel semantics (Q1 fold): the merged delivered-op semantics — harness fix eac88150;
legacy scaling precedent `ChatbotCompilePasses.ts:3141-3144` (requestedChannels/shouldUseMulti);
harness B8 contradiction check `run-suite-a.py:640-654` (an op over the 8-well set carrying a
channel count other than 8 FAILS). The resolved contents set must be expressible as
column-aligned groups (A..H per column) in the SAME resolve_wellsets pass.

Harness pin (DO NOT TOUCH) — `.hermes/plans/harness/l2-suite-a/expectations/P7.json`:
current shape verified: `{"wellset": "computed:union-of-prior-material-wells",
"require_mix_params": true, "verdict_in": ["events-bound","cards"], "deterministic":
false, "expectation_source": "...B3: NEVER a well-list literal in the harness..."}`.
Comparison leg `run-suite-a.py:657-680`: expected = `state["computed_wells"]` captured at
:882 from `session.accum.material_wells()`; driver accumulation
`lib/context_state.py:_accumulate_wells` :170-197 gates on material-bearing verbs
(add_material/multi_dispense/dispense) AND **reads `details.labwareId` :180-181 — early-
return when absent**.

## Grounded state-of-P7 at composition time (correction the reviewer must see)

The ruling/card predate the Q1VOL merge (f8046c5a + mirror ca2ee7fb, both ancestors of HEAD).
Latest drive `/home/brad/.hermes/cl/receipts/L2-SUITE-A/20261027T192830Z/` (post-merge,
P1-P7 table green, P8 cards):
- prompt-7: verdict events-bound, violations [], `done_resolved_labwares: 1`, event details
  `{"cycles":3,"labwareId":"lbw-seed-plate-96-flat","volume":75}` — volume AND plate binding
  ALREADY land.
- The wall is narrower than the card states: the mix event carries **no wells**, and the
  wellset check passes VACUOUSLY — `computed_wells: []` because P2/P3 add_material events
  deliver 42 wells on `details.wells` but NO `details.labwareId` (binding rides the
  resolvedLabwares offer channel), so `_accumulate_wells` never fires and the expected union
  is [] == got []. P7 is green-washed, not satisfied. WELLSET-RESOLVER-1's real acceptance is
  the mix event carrying the NON-EMPTY resolved union + binding (see OQ-1 — this is the
  single biggest trap in the item).

## Deliverables (files in scope)

Data (declarative, the headline):
- `schema/scientist-intent/scientist-intent-vocabulary.yaml` — declare the `wellset` symbolic
  token class: a `wellsetValueTokens`-style DATA section (or the file's idiomatic equivalent —
  coder follows the referentLevels/argContracts precedent of top-level DATA lists) naming
  `all-wells-containing-materials`; add a wells-carrying arg to `mix` (e.g. `wells`
  kind: wellset, required:false — mirroring transfer's kind: wells declaration style at
  :292-296) so the token has a carrier; any verb's kind: wells/kind: wellset arg may carry the
  token (vocabulary-driven membership, resolved by the pass).
- `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml:81` — enum gains `wellset`.
- `schema/registry/compile-pipelines/scientist-intent-compile.yaml` — declare
  `resolve_wellsets` pass (family expand, depends_on mirroring resolve_roles :67-70 +
  lab_state/consumer ordering so downstream sees concrete wells).
- `schema/registry/prompt-templates/intent.compile.system.yaml` — mix mirror line :36 updated
  in the SAME commit as the vocabulary change (vocabularyMirrorDrift discipline).

Server (vocabulary-driven; NO verb-name branches, NO well literals):
- `server/src/compiler/scientistIntent/vocabulary.ts:44` (+ RawArg mirror :190, loader,
  every exhaustive kind consumer) — union gains `'wellset'`.
- New module under `server/src/compiler/` (coder's placement, resolve_roles-style): the
  wellset resolver pass — reads the token membership FROM the vocabulary (which args are
  kind: wellset / which values are declared tokens), reads contents from `priorLabState`
  (+ same-document pending events as the draft layer), returns {wells, labwareId binding};
  ambiguous -> unresolved-fact/clarification (never-guess); column-aligned 8-channel expansion
  in the same pass. Registration at the pipeline seam (compileScientistIntent.ts registry +
  ChatbotCompilePasses.ts if the chatbot pipeline needs the twin registration — decide at
  claim time; SUITE-A rides the legacy draft-events/stream path per harness README).
- `server/src/ai/shorthandChat.ts` — thread `priorLabState` (exactOptionalPropertyTypes-safe:
  key ABSENT, never undefined — server/tsconfig.json:13) through `ShorthandCompileDeps` :93
  into compileScientistIntent at :485; caller supplies it from getDefaultLabStateCache() at
  the orchestrator turn (AgentOrchestrator.ts:1406 neighborhood) — conversation-key identity
  MUST be verified by the coder (OQ-2).
- Server tests (new): resolver unit suite over a fixture ledger — see RED-first plan.

Explicitly OUT of scope:
- `expectations/P7.json` and all harness expectation/`lib/` files (OQ-1 route only, orch-owned).
- `acceptedBindings` lifecycle (shorthandChat.ts:576-613) — Brad-ruled; refuse.
- `app/src/event-editor/focus/wellStateProjection.ts` (display projection stays).
- mixExpander and any verb expander (wells arrive post-expansion, resolve_roles precedent).
- Any new `kind: resolvable` pipette/channel arg (Q1 ruling: undesignated ornament).
- The store event-graph cold-start read (declared gap §11 above).
- `volumeUl` twin on mix (Q1 ruling: don't extend the historical duplication).

## RED-first test plan

0. Baseline capture at claim (skill discipline): fresh SERIAL full-server baseline
   (`cd <worktree>/server && npx vitest run --reporter=json` serial), re-run solo the known
   parallel-flake files (realizationGolden 10s timeouts are a pre-existing load flake).
1. RED (schema door): fixture vocabulary with a `kind: wellset` arg → loader/Ajv REJECTS today
   (schema enum :81) — pin the RED, then extend the three enum sites (deliverables) and pin
   GREEN. This is the first targeted check.
2. RED (no carrier): a shorthand doc `mix: {wells: all-wells-containing-materials}` against
   today's vocabulary drops the undeclared arg silently (normalize carry rule :764-777) — pin
   RED (event has no wells), GREEN after the data + union change (event carries the token
   string pre-resolution at the normalize seam).
3. RED (the resolver): unit suite `wellsetResolver.test.ts` over an injected fixture ledger
   (priorLabState with materials on A1:H1 + current-doc event adding A2:H2 = pending layer):
   token resolves to the A1:H2 union WITH labwareId — pins Brad's worked example verbatim;
   GREEN after the pass.
4. RED (never-guess): fixture ledger with TWO labware carrying materials -> zero wells
   materialized, one clarification on the unresolved-fact channel, answered-leg does not
   re-fire (roleGuidance guard precedent). GREEN with the pass.
5. RED (single-plate binding): one plate with materials -> set PLUS the labware binding
   returned (Q3 fold); assert the event reaches the binder and labwareId lands.
6. RED (8-channel): column-aligned expansion over a contents set spanning rows; assert column
   groups A..H; a single-channel flattening FAILS (B8 mirror).
7. GREEN sweep: promptShapeParity + vocabularyMirrorDrift + shorthandContractDisclosure green
   with the mirror line updated; scientistIntent.test.ts suite green; server tsc 0.

## Acceptance criteria (verbatim from task list, binding)

verified by: >-
  SUITE-A P7 flips from ruled-wall to events-bound (computed wellset + volume + plate
  binding) WITHOUT any harness expectation change; server tests pin the resolver over a
  fixture ledger (incl. pending-draft layer + ambiguous-two-plates asks-card legs); browser
  receipt of the P7 ghost coverage on :5193.

Operationalized:
1. Suite-A P7.json byte-identical before/after the whole run (`git diff` on the harness dir is
   EMPTY; the volume leg already lands — do not "fix" it again).
2. Orchestrator re-drive `--all` after merge: P7 delivers a mix event whose details carry the
   NON-EMPTY resolved union (not the vacuous []==[] pass), volume 75, cycles 3, and the plate
   binding (done_resolved_labwares >= 1, event labwareId bound). Vacuous-green (computed_wells
   empty again) is an ACCEPTANCE FAILURE, not a pass — see OQ-1; the coder delivers the
   server-side truth, the drive proves it.
3. Server test legs (3)-(7) above GREEN, committed in the same commit as the data changes.
4. `cd <worktree>/server && npx vitest run` vs the serial baseline: no new failures;
   `npx tsc --noEmit` (server) 0 errors.
5. Hardcode sweep on the diff: no well-address literal (A1/B1/H2/…) anywhere in server TS or
   YAML additions except test fixtures; no `verb === 'mix'`-style branch in the pass (token
   membership is vocabulary DATA).
6. Browser receipt of P7 ghost coverage on :5193 — ORCH-OWNED, post-merge (SUITE-A tier-1
   pattern), not the coder's deliverable.

## Reviewer bait (expect these challenges; pre-empt them)

- Vacuous-green P7 (the #1 trap): a diff that "passes" the drive while computed_wells stays
  [] is NOT an acceptance. The driver's accumulation reads details.labwareId
  (context_state.py:180-181); the product's add_material events bind via resolvedLabwares.
  Route = OQ-1 (orch ruling BEFORE the drive); the coder must NOT silently edit harness lib
  files to force numbers into the comparison.
- exactOptionalPropertyTypes sites (server/tsconfig.json:13): every optional added to
  ShorthandCompileDeps / pass outputs is `...(x ? {x} : {})` — key absent, never undefined
  (types.ts:383-384 states the house rule).
- YAML-reload trap: the shipped vocabulary singleton is cached; fixture-injection tests use
  the loader's opts.path discipline (vocabulary.ts), NOT process-cached globals — prove the
  token set is read per-load (deckReviewPolicyPath precedent, compileScientistIntent.ts:103-106).
- Mirror-sync RED: promptShapeParity/vocabularyMirrorDrift/shorthandContractDisclosure go RED
  if the registry template line for mix lags the generated ARGUMENTS block (Q1VOL D1 — the
  whole fix-run-1 exists because of this). Same-commit mirror DATA edit, generator position.
- Ontology/term traps: do not introduce a knowledge-layer term or referentLevel for wellset
  (referentLevels lint allIn :852); wellset is an ARG kind, not a referent level. No new
  strategyOrder noun.
- Hardcode boundary: the token value `all-wells-containing-materials` may appear in vocabulary
  YAML + test fixtures ONLY — the pass reads declared token membership from the vocabulary
  object; a string-literal compare in the pass is a B3 violation.
- Verb-branch ban: resolve_wellsets must not special-case mix vs transfer; the pass iterates
  declared kind: wellset args (declaredWellsArgs :564-570 pattern extended to wellset).
- acceptedBindings temptation: a reviewer will offer to "carry the plate across turns" via
  acceptedBindings — REFUSE (Brad ruling, decisions/SUITEA-P7-mix-wellset-scope-l2t0635.md Q3);
  deck binding comes from the resolver's own labware resolution, not acceptedBindings.
- COMP-1 Task 16 bar: if the token ever rides a kind: quantity path the bar fires — it must
  not; wellset is its own kind.

## Worker contract

- Worktree: `wt/L2-WELLSET-RESOLVER-1-lane2-<tick>` off `cl/integration-2` at the claim-time
  tip (fresh `git log -1` at dispatch; do not assume ed73daab). Branch:
  `cl/lane2-wellset-resolver-1`.
- ONE commit carrying data + pass + threading + tests + mirror line; commit body names the
  architect ruling. Deliverable report:
  `/home/brad/.hermes/cl/lanes/2/reports/L2-WELLSET-RESOLVER-1-<runner>.md` with the
  baseline-vs-after vitest comm, the RED/GREEN transcripts for legs 1-6, the hardcode sweep
  output, and the conversation-key identity evidence for OQ-2. Done marker:
  `WELLSET-RESOLVER-1 DONE <sha>`.
- All git commands via `git -c core.fileMode=false`. cwd for vitest/tsc: `<worktree>/server`.
- Stop boundaries: STOP + report (do not improvise) if — (a) the conversation-key identity
  between runChatbotCompile's cache key and the shorthand conversationKey does not hold
  (OQ-2); (b) the ambiguous-card envelope cannot carry a wellset fact without inventing a new
  channel (OQ-3); (c) any change to expectations/ or harness lib/ looks necessary (route to
  orch, OQ-1); (d) resolve_wellsets ordering against lab_state/compute_volumes forces a
  pipeline-registry edit beyond declaring the pass; (e) SUITE-A has not closed at dispatch
  (gate above — stop immediately).

## Open questions — ALL RESOLVED (see RATIFICATION FOLD)

1. Vacuous-green route: RESOLVED — route (b) shipped at e196597b (fold 1). The coder must
   NOT touch harness lib/ (stop boundary (c) stands).
2. Conversation-key identity: RESOLVED by screening + orch re-verification (fold 2) — coder
   adds `conversationId: conversationKey` at the call sites; boundary (a) only on a
   derivation mismatch.
3. Ambiguous-set card envelope: RESOLVED — new reason code on the existing envelope
   (fold 3); boundary (b) only if the envelope genuinely cannot carry it.

COMPOSER DONE /home/brad/.hermes/cl/lanes/2/drafts/2026-10-27_L2-WELLSET-RESOLVER-1-DRAFT.l2t1450.md
