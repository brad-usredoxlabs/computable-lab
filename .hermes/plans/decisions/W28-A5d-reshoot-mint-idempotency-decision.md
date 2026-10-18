# W28-A5d tier-2 re-shoot FAIL — mint idempotency + non-shrinking unknown set — ARCHITECT DECISION (2026-10-17)

Trunk at decision time: b6eddd7d (contains 7ed172e2; `git -c core.fileMode=false log` tip
28546825 docs-only). Evidence: reviewer receipts
/home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-17_2020-a5d-tier2-reshoot/
(REPORT.md, trail.json .cycles/.steps/.network/pageErrors, 15 distinct-md5 shots), the
orchestrator addendum (lanes/2/decisions/W28-A5d-evidence-addendum-materialroles-l2t1935.md,
weighed — one of its hypotheses is FALSE first-hand, see Q3), rides on
W28-A5g-postmerge-caution-fired-decision.md (ruling (a), Q2 cycle) and
W2-11-d4-unknown-noun-resolution-decision.md (fact 8, HONEST MINT REPLAY precedent).
No stack touched beyond read-only GETs on :3093 (live, pid 315717). No product code changed.
Only this file written. All git via `git -c core.fileMode=false`.

## First-hand verification (every load-bearing claim, re-derived at b6eddd7d)

V1. THE MINT ID IS DETERMINISTIC, NOT RANDOM-SUFFIXED. `server/src/materials/termId.ts:41-43`
    `localMaterialIdForLabel = MAT-<slug>-<djb2(label) 4 base-36 chars>`; `labelHash` :21-26 is
    a stable case-insensitive djb2. I re-implemented the exact algorithm in python and
    reproduced BYTE-IDENTICAL ids for every label in this incident:
    `orch-idem-probe-l2t1935 -> MAT-orch-idem-probe-l2t1935-132u`,
    `lysis-reagent -> MAT-lysis-reagent-1dkp`,
    `microcentrifuge tube -> MAT-microcentrifuge-tube-sgzg`,
    `sample tube -> MAT-sample-tube-1fh8`.
    The orchestrator packet's parenthetical "the recordId is random-suffixed per mint" is
    WRONG; the suffix is a hash of the label and never varies for a given label. All four
    records exist in the live :3093 store today (GET /api/records?kind=material — each
    `status: proposed`).

V2. THE 422 IS A RECORD-ID EXISTENCE CHECK, NOT A LABEL CHECK.
    `server/src/api/handlers/VocabHandlers.ts:100` computes `recordId =
    localMaterialIdForLabel(label)`, :112-126 calls `store.create` and on `!result.success`
    returns 422 `Minting "<label>" failed: <error>`. The failure source is
    `server/src/store/RecordStoreImpl.ts:553-562` (`createUnlocked`): `findRecordPath(envelope
    .recordId)` -> `Record already exists: <recordId>`. So a label-repeat recomputes the SAME
    recordId, hits the store's create-collision guard, and hard-422s. Nothing anywhere catches
    that collision into a success. The in-repo idempotency claim (VocabHandlers.ts:97-100
    "re-minting ... is idempotent", termId.ts:6-17 "the id never changes ... idempotency is
    the hard guarantee") is about the ID, not the ENDPOINT: the endpoint returns an ERROR on
    repeat. The aspirational comment and the shipped behavior diverge; that is the defect.

V3. NO REGRESSION — THE FILES NEVER CHANGED. `git -c core.fileMode=false log --oneline
    99b057f8..b6eddd7d -- server/src/api/handlers/VocabHandlers.ts server/src/materials/termId
    .ts` is EMPTY; the only commits ever touching either file predate 99b057f8 (c325b3c8
    2026-08-03 deterministic-djb2 path, fbd80e94 mint endpoint, b59df596); `git diff
    99b057f8..b6eddd7d -- server/src/store/RecordStoreImpl.ts` contains zero changes to the
    already-exists guard. At 99b057f8 the endpoint behaved EXACTLY as at b6eddd7d.

V4. THE CONTRADICTION WITH W2-11-D4 FACT 8 IS A COMMENT MISREAD, NOT A REGRESSION. Fact 8's
    live measurement (unknown set shrinking 3->1->0 per cycle) is consistent with what I see
    now: FIRST mints of NEW labels succeed (draw-2/4/5 mints: 3 x POST /vocab/mint 200, trail
    .network t=66/85/99) and tier-1 binds them. "Idempotent by label" was inferred from the
    V1 comment (VocabHandlers.ts:97-100, which fact 8 cited — "an idempotent label-derived
    recordId (:97-100)") rather than from a repeat-mint probe. A repeat was NEVER 200 at any
    revision in this range. I searched for a harness-side catch (grep 'already exists' across
    /home/brad/.hermes/cl/lanes/2/tmp-orch/*.mjs and the W2-11 receipts) and could NOT locate
    one, so I cannot claim the W2-11 legs' survival mechanism first-hand — the packet's
    "harness treated it as convergence" is plausible but UNVERIFIED. What IS verified: the
    current re-shoot driver (/tmp/w28a5/drive.mjs, the mint leg ~:206-221) has NO such catch,
    so its repeat mint threw (trail .pageErrors x2, `ApiError: VALIDATION_FAILED: Minting
    "microcentrifuge tube" failed: Record already exists: MAT-microcentrifuge-tube-sgzg`) and
    the answered re-send never fired (draws 7-8 `http: null`).

V5. THE ANSWER IDIOM RODE CORRECTLY AND THE FIRST MINT DID BIND (Q2's core).
    Client: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx:368-376`
    (`compileAnswers()` = branch answers MERGED with clarification answers) sent on every
    round-trip (:396, :523, :563) — the picked answer accumulates, so every later draw carries
    `lysis-reagent = [[material:MAT-…|lysis-reagent]]`. Server: `composeAnsweredPrompt`
    (IntentCompileFromPromptHandlers.ts:147-156) appends every answers entry verbatim as a
    settled-choices line; the handler (:377-379) then appends the declared-roles block.
    trail.json .cycles proves the effect: draw 2 barred `lysis-reagent`; after the cycle-1
    mint, draw 3's held set is `['bead-beating duration','bead-beating temperature']` —
    lysis-reagent GONE, set strictly shrank 4->2, macro grew (1 action). The mint half of the
    bonded cycle works, exactly as REPORT.md "Notes" states.

V6. THE DRIFT MECHANISM, FIRST-HAND. Draw 4 (same prompt + same answers map, one redraw
    apart) re-emitted `'lysis reagent'` — SPACED, vs the minted record's name
    `'lysis-reagent'` HYPHENATED. The tier-1 record provider
    (`server/src/resolve/providers/records.ts:73-74`) matches
    `fields.some((f) => f.includes(needle))` with `needle = term.toLowerCase()`:
    `'lysis-reagent'.includes('lysis reagent')` is FALSE — the spaced variant cannot hit the
    hyphenated mint. A hedge without `actionLocation` is keyed `label:<label>` and KEPT
    verbatim by `reconcileModelUnresolved` (resolveNounsPass.ts:112-119, :190-192 "KEEP: the
    model names a slot the engine never saw — it bars exactly like an engine clarification"),
    and ANY clarification blocks (:326). So a near-variant label re-bars forever. The whole
    drift chain (lysis-reagent -> microcentrifuge tube -> sample tube -> microcentrifuge tube)
    is the model re-hedging DIFFERENT labels per draw: draws 5 and 6, one cycle apart, bar with
    disjoint sets; draws 7-8 final msg still holds `microcentrifuge tube (ambiguous-noun);
    lyse_variant; gate 2025` — 'gate 2025' is a fragment of the step label
    ("Lyse the sample (gate 2025)", live GET of CAN-protocol-1791692042751), i.e. the model is
    hedging on text it was given.

V7. THE MODEL IS NOT RUNNING AT THE DECLARED ZERO TEMPERATURE — THE DECLARATION IS SILENTLY
    DROPPED AT THE WIRE. The route declares determinism: `toInferenceConfig` returns
    `temperature: 0` (IntentCompileFromPromptHandlers.ts:82) and it is passed into
    `createInferenceClient(toInferenceConfig(deps, ctx))` (:336). But
    `server/src/ai/InferenceClient.ts` NEVER reads `config.temperature`: the factory
    destructures only `{apiKey, timeoutMs, streamIdleTimeoutMs, streamMaxMs, enableThinking}`
    (:55-65) and `normalizeRequest` (:86-110) builds the body from the REQUEST's fields only
    (`{...rest, max_completion_tokens, chat_template_kwargs}`). `grep -n temperature
    InferenceClient.ts` = EMPTY. And the one-shot call site `compileFromSmallLlm`
    (`server/src/compiler/scientistIntent/intentCompile.ts:249-269`) builds `baseRequest`
    = {model, messages, max_tokens} + tools — NO temperature either. Contrast: the chat path
    DOES forward it per request (`server/src/ai/AgentOrchestrator.ts:1857`
    `temperature: inferenceConfig.temperature ?? 0.1`). Net effect at b6eddd7d: the
    scientist-intent one-shot — the spine's determinism-critical call — runs at the thunder-
    beast llama.cpp server's DEFAULT SAMPLING on every surface that uses this client without
    an explicit per-request temperature. This is the code not following declared data, and it
    is the most economical explanation for V6: identical prompts, identical store state,
    different unresolved arrays each draw. (Consistent, not proof-of-noise-by-itself; but the
    drop is first-hand and the drift is 8/8 draws.)

V8. DECLARED ROLES ARE ALREADY INJECTED — INCLUDING materialRoles — AND NEVER CONSULTED BY
    THE ENGINE. `renderDeclaredRolesBlock`
    (IntentCompileFromPromptHandlers.ts:172-200) iterates `Object.entries(roles)` GENERICALLY
    — every group key, no filter: `labwareRoles`, `materialRoles`, `instrumentRoles` ALL ride
    the answered prompt (:179, framed at :196-199, appended at :378-379). The A5f test pins a
    materialRoles fixture (IntentCompileFromPromptHandlers.declaredRoles.test.ts:319). Live
    GET :3093 /api/records/CAN-protocol-1791692042751 confirms the addendum's fixture facts:
    `labwareRoles:[{roleId:'microcentrifuge-tube',description:'microcentrifuge tube'}]`,
    `materialRoles:[{roleId:'lysis-reagent',description:'lysis reagent'}]`. So the addendum's
    candidate "materialRoles declared-but-uninjected" is FALSE — they are injected as model
    prompt data. What is true is the addendum's second alternative: INJECTED-BUT-UNCONSULTED.
    `createResolveNounsPass` (resolveNounsPass.ts:243-257) wires exactly three adapters —
    spine (records/OAK tiers), labware-hint, role-address — and `createRoleAddressAdapter`
    (adapters.ts:190-221) resolves WELL ADDRESSES from a plate context; NOTHING in the
    resolution engine reads the source protocol's `payload.roles`. A declared roleId is not a
    record, so no tier-1 hit can ever exist for it unless a record is minted first. The A5f
    labware win worked through the MODEL following the DECLARED ROLES framing line into the
    labware-hint path — i.e. it is itself hostage to V7's sampling noise.

V9. THE LABWARE-ROLE CATEGORY ERROR IN THE RUN. The final draws bar `microcentrifuge tube`
    with reason AMBIGUOUS-NOUN (REPORT.md §What-actually-happened item 5). The cycle-5 mint
    created MAT-microcentrifuge-tube-sgzg — a MATERIAL. A material record can never bind a
    labware slot (tier-1 DEFAULT_KINDS hits labware separately, records.ts:17-25, and the
    level filter is declared vocabulary data, resolveNounsPass.ts:264-265). So minting the
    labware-role noun could not clear that bar EVEN IF the repeat-422 had not stalled it; the
    draws 7-8 stall (V4) merely made the dead end permanent. The reviewer's D1/D2 shots
    (03-draw1-after.png, 17-draw7-after.png) show the correct consequence: zero events,
    accept greyed — the A5d zero-events shape, honestly reported, nothing fabricated.

## Q1 — Why label-repeat 422s; misread or regression?

Deterministic id (V1) + store create-collision guard keyed on recordId (V2) + no catch-into-
success anywhere (V2, V4) = second mint of the same label 422s VALIDATION_FAILED
`Record already exists: <same id>`. NOT a regression: byte-identical behavior at 99b057f8 and
b6eddd7d (V3). W2-11-d4 fact 8 was a MISREAD — it read the idempotency-comment (:97-100) as
endpoint semantics and its live measurement only exercised first mints; the endpoint has never
been idempotent. The comment promises something the endpoint must now be made to actually do
(see the task below — the repo already contains the correct shape: MaterialGrounding
`ensureLocalMaterialForDraft` checks name-match then `store.get(recordId)` and RETURNS THE
EXISTING record instead of failing, MaterialGrounding.ts:211-223 — /vocab/mint simply never
reuses that path). The orchestrator packet's "random-suffixed" premise is corrected in V1.

## Q2 — Did the set shrink after the first mint? Binding or drift?

YES — draw 3 strictly shrank and lysis-reagent disappeared (V5): the answer idiom rode
correctly, tier-1 bound the minted record; there is NO binding failure at tier-1 for the
minted label. The gate died of V6 drift: the model re-emits DIFFERENT or near-variant labels
each draw ('lysis reagent' spaced cannot hit the hyphenated mint, V6), free-form hedges with
no actionLocation are KEPT and bar (resolveNounsPass.ts:190-192, :326), and the root
enabler is the dropped temperature (V7). The strict-shrink rule is NOT mis-specified in
principle — draw 3 proves a mint genuinely shrinks the set — but it silently ASSUMES a
deterministic emitter, and at b6eddd7d the emitter is nondeterministic by accident, not by
design. A model hedging different labels per draw can only pass the rule when each mint
lands; V6's near-variants guarantee it cannot. Fix the emitter, not the rule. Do NOT weaken
the rule (that would be assertion-weakening by another name, the same class as the fixture-
wording edits rejected in the prior decision Q2.5).

## Q3 — The microcentrifuge-tube collision: which fix, and where does it ride?

The addendum is right that a DATA seam beats mint-side idempotency for the BARRING fact, but
its mechanism guess is inverted (V8): materialRoles ARE injected; the gap is that
resolve_nouns never consults declared roles, and minted materials can never bind labware
slots (V9). Weighed:
- (i) label-first idempotent mint: necessary (it kills the D3 stall and honors the repo's own
  comment + the ensureLocalMaterialForDraft precedent) but NOT sufficient — as the addendum
  says, a reused MAT-lysis-reagent is still a parallel record beside a declared role, and a
  material still cannot bind the microcentrifuge-tube LABWARE slot (V9).
- (ii) harness-side mint-replay catch: legitimate ONLY as a bridging tolerance in the re-shoot
  prompt (treat 'already exists' 422 as convergence, W2-11 precedent) — never as the fix; the
  scientist's picker click must not error in the product.
- (iii) spine-side declared-role consultation: the principled long-term home (roles are
  declared data; the engine already consults declared vocabulary data; "things that can be
  data should be data" cuts toward the engine reading payload.roles, not toward minting a
  shadow record per role). It is a real SPINE task — new adapter/contract territory — and it
  must NOT be smuggled into A5d as an urgency exception.
SMALLEST HONEST FIX SET for the A5d blockage, therefore: (a) forward the declared temperature
(V7 — one seam, restores the determinism the code already claims), (b) mint reuse-by-lookup
(V2 — endpoint becomes what its comment promises, mirroring existing MaterialGrounding logic).
With a deterministic emitter, the DECLARED ROLES prompt block (V8) is what carries
microcentrifuge-tube/lysis-reagent through the model side, exactly as A5f's labware win did;
if a deterministic r2 STILL bars on a declared-role noun, that is the empirical trigger to
open the spine-side (iii) task as its own decision — I am not pre-authorizing it.
RIDEING: neither fix rides MINT-FLOOR-UI-1. That task's composer is live with scope "picker
mint-row de-dup ONLY" (app/ surface, browser-gated) and its MINT-FLOOR OQ pre-ruled the
material-only floor; bolting a server response-contract change (422->200) into a cosmetic
de-dup spec breaks the lane's spec-pinning practice. As domain authority I DO re-affirm the
material-only mint floor here: minting MATERIALS for labware-role nouns is a category error
(V9), so Option B labware-floor minting is NOT the answer and stays unpresumed — a
labware-role noun is answered by PICKING a labware record or (long-term) by (iii), never by
minting a MAT- record. The two fixes below are minted as their own tasks.

## The product tasks minted by this decision

TASK WIRE-TEMP-1 (server; no browser gate)
  title: "InferenceClient silently drops the declared temperature — forward
    config.temperature to the request body so the one-shot intent-compile actually runs at
    the declared 0 (IntentCompileFromPromptHandlers.ts:82 / intentCompile.ts:249-269 /
    InferenceClient.ts:55-110)"
  scope: when `config.temperature` is declared and the per-request body does not set it, the
    client forwards it (the AgentOrchestrator.ts:1857 chat arm is the precedent shape);
    request-level values keep winning on collision (the existing normalizeRequest merge
    doctrine, :83-85 comment). ZERO new policy values — the client only forwards what data
    already declares.
  verified by: a pin in InferenceClient.config.test.ts (declared temperature reaches the
    serialized body; absent temperature stays absent; request-level override wins); full
    server suite green; tsc baseline unchanged. Observable consequence the A5d re-shoot then
    depends on: two answered compiles with identical prompt+answers map produce identical
    clarifications on llama.cpp.

TASK MINT-IDEM-1 (server; no browser gate)
  title: "POST /vocab/mint becomes truly idempotent by label: reuse the existing record
    instead of 422 'Record already exists' (VocabHandlers.ts:112-126 /
    RecordStoreImpl.ts:553-562), mirroring MaterialGrounding.ensureLocalMaterialForDraft's
    lookup-first precedent (MaterialGrounding.ts:211-223)"
  scope: before `store.create`, reuse the existing path — lookup by deterministic recordId
    (`store.get(localMaterialIdForLabel(label))`) and, mirroring MaterialGrounding, an exact
    normalized-name match among materials; on hit return the 200 success shape with the
    EXISTING recordId/label/iri (response shape unchanged). On miss, create as today. No new
    response fields, no refKind behavior change, picker UI untouched (MINT-FLOOR-UI-1 stays
    independent). First-mint behavior byte-identical.
  verified by: server tests — mint(label) then mint(label) again -> both 200, same recordId,
    exactly one record in the store; mint of a label equal to an existing material NAME ->
    200 pointing at that record, no duplicate created; VocabHandlers mint suite green. The
    A5d re-shoot's repeat-mint leg exercises it in-browser.

## Q4 — Exact resume condition for the A5d gate

What must change: BOTH product tasks above merge to cl/integration-2 (independent of each
other; either order; HYGIENE-2 is done and unrelated; MINT-FLOOR-UI-1 may proceed on its own
lane). ONE harness-side tolerance in the re-shoot prompt: a mint that 422s 'already exists'
counts as converged, extract the recordId from the error message and re-send with it
(W2-11-d4 D4 precedent) — bridging only, to be deleted once MINT-IDEM-1 is in the trunk.
Nothing else changes: criteria, fixture, MAX_REDRAW cap 8, per-cycle log, strict-shrink rule,
honest-FAIL path all stand as written in W28-A5g Q2.
The bonded cycle of the next attempt must: (1) mint each held unknown-noun label AT MOST ONCE
via the card's /m picker mint floor (dedup absorbed by MINT-FLOOR-UI-1's standing note until
it lands); (2) on a near-variant re-bar of an already-minted label (e.g. 'lysis reagent' vs
'lysis-reagent'), answer by PICKING the existing record in the /m search or via the tolerant
replay — never mint a second time; (3) treat microcentrifuge-tube as a LABWARE question: it
is answered from labware candidates (the declared-roles block rides every answered draw, V8),
NOT from a material mint — if no labware candidate exists and it bars ambiguous-noun on a
DETERMINISTIC draw, stop honestly per Q2.2 and file that as the spine-side (iii) trigger
(spine-side declared-role consultation — new decision, do not force).
Expected shape at the completing draw (unchanged from the prior decision Q2.4): >=1
pl-deck-review checkbox via the zero-match additions arm, >=1 ghost event, pl-accept enabled,
receipt names the real LPR id. Honest-FAIL remains the correct output if a deterministic
emitter still will not converge — that outcome is data for (iii), not a reason to weaken
anything. Options (b)/(c) of the prior artifact stay CLOSED: nothing in this re-shoot's
evidence touches their rejection grounds (b has no representation in the frozen SPINE-1
shape; (c) is fixture-assertion weakening); I re-open neither, and the evidence does not
force either.

Consequences / notes:
- W2-11-d4 fact 8 is corrected by this artifact for all future readers: mint-first-mint binds
  (true), mint-repeat 422s (always has); cite V1-V4 here, not the old comment.
- The lane's task-list line "likely a product task (... or mint label-lookup idempotency
  riding MINT-FLOOR-UI-1)" is resolved as: two own tasks, WIRE-TEMP-1 FIRST (it is the
  root-cause candidate; MINT-IDEM-1 alone would leave the drift that made every mint a
  chase-the-hedge race).
- The live :3093 store now carries the probe records MAT-orch-idem-probe-l2t1935-132u,
  MAT-lysis-reagent-1dkp, MAT-microcentrifuge-tube-sgzg, MAT-sample-tube-1fh8 — all
  'proposed', the same state the product's mint floor produces; MINT-IDEM-1 will make the
  re-shoot converge on these ids rather than minting new ones. No cleanup is required; no
  fixture was touched (contentShas verified stable by the reviewer).
- No fixture, spec, or assertion change was authorized here. No stack restart, no port touched,
  no product code changed. This file is the only write.

ARCHITECT DONE
