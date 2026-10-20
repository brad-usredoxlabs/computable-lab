# MATRES-PANEL — Typed clarification panel: one grouped panel per turn (referent-level × tier), per-selection semantics visible (DRAFT, l2t0255 spec-composer)

Status: DRAFT — NOT dispatchable until the orchestrator promotes it.
Item: MATRES-PANEL, lane 2 task list lines 10634-10665. Campaign 2; P4/P8 bind; memo Q6 governs alias behavior.
Trunk: cl/integration-2 @ 38e1e5a5 (docs tip; code tip 46c3e4e9 = ATTEST merge). NFS repo: every git command runs with `-c core.fileMode=false`.
Contracts memo r1 sha256 re-verified THIS dispatch: e8d8165882fd17af697c662539738b30f86bbca793dfffbc1c6d499fe7099393 — UNCHANGED. Ratification window open until 2026-10-21 18:00 EDT; every memo-dependent decision carries [DEFAULT-PENDING-RATIFICATION: Qn].

## §1 Goal

Collapse the per-fact "did you mean <record>?" held cards into ONE typed clarification panel per drafting turn — slots per argument/component (the canonical four-term utterance = 4 slots in ONE panel, never one global choice), candidates grouped referent-level × tier using ELIG's disclosed payload fields, mint affordance only at NON-PHYSICAL layers with vendor mint-on-select DISCLOSED at the point of choice, instance/aliquot selection = REFERENCE attach only, alias confirmation a separate explicit action a selection never implies — riding the existing clarification facts + ANSWER-BIND-1/OPTIONBIND-1 machinery, with per-selection semantics text as DATA.

## §2 Description (verbatim from task list — binding)

> Collapse the per-argument "did you mean <local record>?" clarifications into
> ONE typed panel per drafting turn: candidates grouped by referent level x tier,
> mint affordance at NON-PHYSICAL layers only (no instance/aliquot mint —
> receiving/derivation are different actions, never panel options), vendor
> search on demand. Per-selection semantics SHOWN at the point of choice:
> concept/formulation selection may ground a proposed record; vendor-product
> selection goes through existing mint-on-select and the panel discloses that
> selection-time durable write; instance/aliquot selection = REFERENCE attach,
> never a custody/use assertion. One panel must retain DISTINCT per-component/
> argument bindings (the 4-component mixture is 4 slots in one panel, not one
> global choice). Alias confirmation is a SEPARATE explicit action (P/Q6), never
> implied by a selection. Panel shape follows the replay study's validated mock.
> AI-panel placement per SOP (never in deterministic surfaces).

## §3 Why (verbatim from task list)

> The founder's four flat yes/no questions about stale local records is the
> defect this campaign opened with. Reuses: existing clarification facts +
> option-binding machinery (ANSWER-BIND/OPTIONBIND precedents), spine tiers,
> mint-on-select, MaterialGrounding proposed-status paths.

## §4 Verified-by (verbatim from task list — binding acceptance criteria)

> RED-first server+app tests per spec; replay-study acceptance scenarios pass as
> unit fixtures; cl-browser-reviewer VERDICT: accept against :5193 on the
> canonical 4-term utterance — one panel, four slots, level-grouped candidates,
> mint absent below formulation layer, mint-on-select disclosure visible.

Task-block files line (verbatim): `app clarification/gapcard surface (ProtocolLocalizationThread.tsx area); server clarification fact shape; vocabulary policy data as needed`.

## §5 Dependency posture (orchestrator ruling — do not re-litigate)

- **MATRES-REPLAY: DISCHARGED.** Per ruling AS-ELIG-DEP-DISCHARGED (ELIG spec §16 OQ-3, handoff 2026-10-20_0250): the harvest-merged state discharges the dep for downstream consumers; PANEL consumes exactly `.hermes/plans/MATRES-REPLAY-harvest-report.md` (merged). The MATRES-0-deferred worksheet legs feed PANEL's *inputs* (Q1/Q2 evidence), never PANEL's substrate.
- **MATRES-ELIG: THE REAL DEPENDENCY — PANEL IMPLEMENTS AFTER ELIG'S MERGE.** ELIG is CODER-READY, not yet merged. This spec is written against the payload SHAPE ELIG §7.4 declares: `candidateFact` gains, via conditional spread, `tier` (0-5), `referentLevel` (canonical five | unknown), and `eligibility: {display, suppress, bind}` verdict enums (`pass|fail|incomplete`) + reason refs. **Where ELIG's merged code deviates from §7.4, MERGED CODE IS AUTHORITY** — the coder reads the merged `candidateFact` and the merged wire schema before writing the first test and reports any deviation instead of coding to this draft.
- The harvest's validated mock is H4: `.hermes/plans/replay-harvest/panels/<turn-id>__<noun-slug>.txt` — 25 grids grouped referent-level × tier with score shown and the tier-5 MINT row filtered OUT of the capture (capture-format suppression, not product suppression). The panel mirrors the grouping; §7.2-§7.3 settle where mint legitimately appears.

## §6 What exists today — first-hand verification (every line read by the composer in the trunk @ 38e1e5a5)

### Server: the clarification fact shape today

1. `server/src/compiler/resolution/resolutionEngine.ts:101-108` — `candidateFact(candidate)` emits `{label, confidence, ref?}` ONLY; `ref` rides via conditional spread from `candidateRecordRef` (:91-99, tier ≤ 1 record handles only; tier > 1 and the mint affordance carry none — anti-fabrication, W28-OPTIONBIND-1 / ARCHITECT DECISION W28-A5n Q1). **This is the exact function ELIG §7.4 extends; today it carries no tier, no referentLevel, no verdicts** — the harvest's "343/347 candidate facts carry confidence 1.0; tier and level are INVISIBLE" is byte-true of this shape.
2. `resolutionEngine.ts:110-123` — `clarificationFor` builds `{label, reason, candidates?, actionLocation?}`; the engine's Clarification IS SPINE-1's frozen `ScientistIntentUnresolvedFact` (`server/src/compiler/resolution/types.ts:107`).
3. Wire contract: `schema/workflow/scientist-intent.schema.yaml:225-292` — `unresolved[]` items: `additionalProperties:false`/`unevaluatedProperties:false`, required `{label, reason}`, `actionLocation {actionIndex?, action?, argument?}` (action gated by the 31-verb enum), `candidates[].{label, confidence?, ref?}` — `ref` is the W28-OPTIONBIND-1 additive optional string (:262-292 comment block). **ELIG's §7.4 additions (`tier`/`referentLevel`/`eligibility`) REQUIRE this schema to widen at ELIG's merge; PANEL must read the merged schema, not this draft.**
4. `resolutionEngine.ts:225` — the in-band gate `tier !== 5 && confidenceOf in band` (pre-existing; untouched by PANEL); `:144-161` `levelFilter` (well-ready drop, DATA table `WELL_READY_LAYERS`); `:57-75` `dedupeMintsByLabel` (MINT-FLOOR-UI-1).
5. Answer round-trip: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` — 422 `NEEDS_CLARIFICATION` holds `{clarifications, localMacro, terminalArtifacts}` (:241-249, `held` per OQ4(a)); typed answers are the `[[<kind>:<id>|<label>]]` idiom, `parseMentionAnswer` (:206-215), consumed at :354. Server-side binding: `server/src/compiler/resolution/resolveNounsPass.ts:73-78` (`AnsweredNounAnswer`), `:280-306` — ANSWER-BIND-1: an EXACT-label join against the answers-map key (`answers[fact.label]`), "never a fuzzy match"; settled slots are stripped deterministically (:447). **Slot identity today = the fact's label (+ actionLocation carried on the wire); distinct slots with distinct labels already bind distinctly.**
6. Spine mint: `server/src/resolve/ResolveSpine.ts:183` (mint affordance per call), `:218` (`ranked.push(mint)`), `:268-277` (`mintAffordance`, tier-5, source 'mint').
7. Alias machinery today: `server/src/materials/termReconciliation.ts:102` `aliasToAppend` exists; NO caller appends from any clarification path — the only doctrine cite is `server/src/compiler/resolution/adapters.ts:297` ("never merged, never auto-linked — termReconciliation doctrine"). **Memo Q6 is therefore a NON-REGRESSION constraint on PANEL, not new work** (§7.5).

### App: the rendering surface today

8. `app/src/types/ai.ts` — `AiClarificationOption {id,label,snippet?,source?,score?,ref?}` (:194-200); `AiClarificationMenuProvider = '/m'|'/l'|'/e'|'choice'` (:215); `AiClarificationRequest` (:230-248) incl. `materialLayer?: 'material'|'material-spec'|'material-instance'|'aliquot'|'vendor-product'` (:247); `AiClarificationAnswer` (:250-256). No slot/referent-level fields exist.
9. `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` — the realization entry inside `ProtocolTabPanel.tsx:1788` (the chat-first one-shot details block, ProtocolTabPanel.tsx:1777-1793). Held state `heldCards` (:194); `foldHeldBundle` folds every 422-held fold through `foldCards` (:368-389); the answers map keys on the fact's own LABEL (:196-198, :420 `answers[label] = value`); `handleClarificationPick` records + RE-SENDS through the same `intentCompileFromPrompt` round-trip (:402-442); the held-card surface renders ONE `<section data-testid="pl-clarification-card">` PER FACT (:764-779), option buttons carrying the W28-OPTIONBIND-1 conditional-spread ref (`...(option.ref ? { ref: option.ref } : {})`, :793) and the `[[kind:id|label]]` idiom via the same builder ClarificationPicker uses (:794-799); `<ClarificationPicker request onPick>` per card (:819); picker-less 'choice' free-text fallback (:824). **Today's per-argument card-per-fact structure is exactly what PANEL collapses.**
10. `ProtocolLocalizationThread.clarificationAdapter.ts` — THE ONE fact→request adapter: `CLARIFICATION_MENU_BY_REASON` (:69-94) + `CLARIFICATION_MENU_BY_REASON_ARGUMENT` (:107-127) as DATA tables; `menuForFact` single lookup, "no if-ladders" (:133-138); mint-offer dedupe `isMintOfferForLabel` (:152-164, MINT-FLOOR-UI-1 — the tier-5 dead-end button is dropped, the picker's floor row is the card's ONE mint affordance); `heldFactToClarificationRequest` (:172-219); `clarificationRequestForFact` gap-shape fallback (:242-275); `foldCards` the ONE call-site (bait 6, :284-290). **PANEL REUSES this adapter; the fold stays the single call-site.**
11. `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — reuses slash-menu resolvers (`resolveMaterial`/`resolveLabware`/`resolveEquipment`, :18, `resolverFor` :30-35); `requestHasPicker` (:43-45); `LAYER_PLACEHOLDER` per-layer wording AS DATA (:52-61); `groundedAnswerFromMention` grounds ontology CURIE picks to a local proposed record via `groundMaterialRef` (:92-115 — the MaterialGrounding proposed-status path the task block names); `answerFromMention` emits `[[entityKind:id|label]]` (:118-156, :124 the idiom); query-reset on `request.id` change (:179-182 — the clofibrate cross-question defect fix); material search with no words shows nothing (:195-199); **mint affordance gate `canMint = resolver === resolveMaterial && (!materialLayer || materialLayer === 'material')` (:268-269) with the mint-creates-a-concept rationale in the comment (:252-254) — the existing embodiment of "mint only at NON-PHYSICAL layers".**
12. `app/src/shared/taptab/slashMenu/resolvers.ts` — mint floor row `mint:<q>` "Create local term \"q\"" emitted by `resolveMaterial` ONLY (:63-92; `resolveMention` calls `apiClient.mintLocalTerm` :83 — a selection-time durable write, today disclosed only in the row's `detail` text :73-78); vendor layer routes to `resolveVendorLayer` (:42); `vendorExaSuggestions` MINT-ON-SELECT: `resolveMention` → `apiClient.createFromVendorExa(hit)` lands a durable local vendor-product record at selection time (:213-247, "selecting one lands a durable local record" :210-211) — badge 'Web', NO point-of-choice disclosure sentence today; the vendor tier is a DECLARED capability (:250-252, SHORTHAND-CORPUS WS6 D1) — **that is the "vendor search on demand" reuse**.
13. Placement (SOP rule 12): the entire surface above lives in the AI drafting thread (chat pane / run-workspace AI tab). Deterministic surfaces — deck canvas, `protocolStepEditing` rails, record pages, ChangesPanel — render none of it. Record-page UI hints ride `schema/ui/ui-v1.schema.yaml` + `UISpecLoader` (*.ui.yaml, server/src/ui/UISpecLoader.ts:792) — a different mechanism, out of scope.

### Replay-harvest facts PANEL must cite (harvest report, merged)

14. The validated mock: H4 grids grouped referent-level × tier, score shown, mint filtered from CAPTURE only (§5 above). T4 canonical utterance "Trypsin-EDTA + DMEM + FBS + HepG2 cells" survives as provenance sourceLabel, not a live transcript; the four-term sessions died pre-compile (drafts are ephemeral until compile completes — `FormDraftService.compile` evidence in harvest §0), so the panel's evidence is REPLAYED clarification payloads, not old screens. Clarification Q/A exist ONLY as thread text today (`heldIntents` memory-only, harvest §0) — per-slot panel state must therefore survive via the EXISTING answers-map round-trip, not new server memory. H2: `ambiguous-noun` fired in 32/42 noun-arm outcomes with duplicate-label floods whose only difference is a recordId suffix the user cannot see; level-filtered candidates vanished to unknown-noun + mint (M3). These are the acceptance fixtures §9 replays.

## §7 The design (settles, no hedges)

### §7.1 One panel per turn, keyed by turn identity

- The panel's turn key is the client fold identity: `panelKey = held-fold of ONE intentCompileFromPrompt round-trip`, derived as `localMacro.intentId` + a monotonic fold counter (the fold already replaces `heldCards` wholesale on every re-send, ProtocolLocalizationThread.tsx:388 — one fold IS one turn). **No server contract change** (OQ-1 carries the alternative). A new fold REPLACES the panel; answered facts disappearing deterministically (ANSWER-BIND-1 strip, resolveNounsPass.ts:447) shrinks the slot list — the panel never accumulates stale slots.
- The held/gap fold renders ONE container (`pl-clarification-panel`, replacing the flat `pl-clarification-cards` list as the fold surface) whose header states turn scope; inside, one slot section PER FACT via the existing adapter, keyed `fact.actionLocation.argument + ':' + actionIndex ?? label` — but the ANSWER still rides the existing `answers[fact.label]` map byte-unchanged (server join is exact-label; PANEL never invents a second key channel).
- DISTINCT per-component bindings are structural: the four-term utterance yields four `unresolved` facts with distinct labels/argument positions; each slot answers independently through `handleClarificationPick` and the existing re-send. The 4-slot acceptance scenario (§9) is the proof.

### §7.2 Slots, grouping, and the candidate payload

- Each slot section renders the fact's candidates GROUPED by `referentLevel` × `tier`, using ONLY ELIG's disclosed fields (merged-code authority, §5). Group headers are the canonical five level names + tier number; labels come from a client DATA table (§7.4), never from re-reading the store or re-deriving level from tier (tier-as-truth is the defect class ELIG OQ-1 ruled against).
- Eligibility verdicts render as per-candidate markers: `incomplete` candidates stay VISIBLE as incomplete possibilities (harvest M3's vanished-candidate fix is display-side here), `fail` on display excludes a candidate from its group; `suppress`/`bind` verdicts are never silently re-interpreted by the UI — markers show the verdict enum + reason ref the payload carries.
- When a candidate carries NO ELIG fields (pre-ELIG fixtures, model-side facts, tier > 1 hits): honest degradation — rendered in an `unspecified-level` group with no verdict markers. This is a defensive branch for malformed/partial payloads, gated on field PRESENCE; it is not a shipped dual-surface (PANEL lands after ELIG's merge, so production payloads carry the fields).
- Duplicate labels of distinct records (harvest M2 flood: identical MSP-DRAFT labels differing only by recordId suffix) are disambiguated by the LEVEL×TIER GROUPING plus the record `ref` shown as subtitle when present — no label rewriting, no de-duplication of real records (that was never anyone's job; grouping makes the difference VISIBLE, which is what the harvest asked for).
- Free-text / search stays per-slot: each slot keeps the existing ClarificationPicker scoped search (the `materialLayer` scoping law, ClarificationPicker.tsx:208-211) and its own instance-keyed state (see bait 8).

### §7.3 Mint affordance and per-selection semantics — at the point of choice

- **Mint ONLY at NON-PHYSICAL layers:** the grouped mint row appears ONLY in the concept/formulation (and `unspecified-level`) slot contexts; NEVER in a slot whose question is instance/aliquot-scoped. This EXTENDS the shipped rule (ClarificationPicker.tsx:268-269 mint = material-concept scope only; `LAYER_PLACEHOLDER` wording per layer) from a search-scope gate to an explicit per-group affordance rule; receiving/derivation actions are never panel options at all (they are different actions; P7). The gate keys on the request's declared layer / the group's canonical level name from the DATA table — never a TS tier switchboard.
- **Vendor-product = existing mint-on-select, now DISCLOSED:** vendor rows (Exa 'Web' hits, resolvers.ts:213-247) keep their `resolveMention` → `createFromVendorExa` durable write UNCHANGED; the panel adds a point-of-choice disclosure LINE (visible on the row itself, not hidden in hover/detail): selecting creates a local vendor-product record NOW. The sentence is the disclosure; the write path, the declared-capability gate (resolvers.ts:250-252), and `/vendor/exa/from` are untouched. "Vendor search on demand" = the existing Exa tier streamed after local hits — no new endpoint, no always-on remote query.
- **Instance/aliquot selection = REFERENCE attach:** picking an instance/aliquot candidate emits the ordinary `[[kind:id|label]]` answer for the slot; the semantics line states it attaches a reference for this slot and asserts NOTHING about custody or use (P4: catalog identity is never custody/use evidence; harvest T9's "ATCC HB-8065 LOOKS like lot evidence" confusion is what the label must defuse).
- **Concept/formulation selection may ground a proposed record** — the existing `groundedAnswerFromMention`/`groundMaterialRef` proposed-status path (ClarificationPicker.tsx:92-115), stated as such in the semantics line.
- **Semantics text is DATA:** a module-level presentation table in the clarification adapter area (`PLANE_SEMANTICS_BY_LEVEL: Record<canonicalLevel|'unspecified', {groupLabel, selectionSemantics, mintAllowed, mintDisclosure?}>`) — the same class of client DATA table `CLARIFICATION_MENU_BY_REASON` established as law (clarificationAdapter.ts:50-53: "presentation mapping belongs in the client adapter as a table, not scattered branches"). Keys are the canonical five level names only (vocab lint checks the names wherever they're declared server-side); NO new level nouns. OQ-2 rules client-table vs server-side-payload alternative.

### §7.4 Alias confirmation — separate explicit action (memo Q6) [DEFAULT-PENDING-RATIFICATION: Q6]

A panel selection NEVER appends an alias: `aliasToAppend` (termReconciliation.ts:102) gets NO import in the PANEL diff — non-regression is the constraint (no caller exists today, §6.1.7; PANEL must not become one). The explicit "these are the same words for it" confirm action lives elsewhere (review-surface term reconciliation, a separate item); the panel MAY PROPOSE nothing alias-related beyond what today's surfaces already show. A reviewer grep for `aliasToAppend` under app/ in the diff is a hard reject (§11).

### §7.5 Placement + reuse ledger (SOP rule 12)

Everything renders inside the AI drafting thread surface (§6.8-§6.12) — the held-fold surface of `ProtocolLocalizationThread` and, unchanged, the event-editor `AiTabPanel`/`QuestionsPanel` picker path. ZERO changes to deterministic surfaces (deck, step editor, record pages, ChangesPanel, run wall). REUSED unchanged: the fact→request adapter tables, `foldCards` (ONE call-site law), ClarificationPicker resolvers + grounding path, the `[[kind:id|label]]` answer idiom + `parseMentionAnswer`, ANSWER-BIND-1 exact-label server join, OPTIONBIND-1 conditional-spread `ref` rides, the mint floor + `dedupeMintsByLabel` + `isMintOfferForLabel` dedupe, Exa vendor tier. CHANGES: the fold renders one grouped panel component (new, in the same directory) instead of a flat card list; candidate options gain level/tier/verdict presentation fields on the request/option types (additive, conditional spread); the semantics/mint disclosure lines from the DATA table.

## §8 Files

IN SCOPE:
- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (+ its panel test; fold surface)
- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts` (option payload widening + the level/tier presentation DATA table — or a sibling `…panelSemantics.ts` module; sibling preferred so the frozen golden integrity test stays untouched)
- NEW `app/src/event-editor/right-pane/protocol/ClarificationPanel.tsx` (+ tests) — the grouped panel; ClarificationPicker stays the per-slot picker
- `app/src/types/ai.ts` — additive optional fields on `AiClarificationOption` / `AiClarificationRequest` ONLY (conditional-spread discipline)
- Tests replaying harvest fixtures: `app/e2e/fixtures/w211-golden/`-style scenario fixtures built from `replay-harvest/panels/` + `fates/` payloads (four-term 4-slot scenario, duplicate-label flood, level-filtered-to-zero replay)
- Server: NONE expected (ELIG owns the fact shape + wire schema). If the browser gate proves a missing field, the fix rides ELIG's data/schema home as a declared amendment — routed back, not bolted on (OQ-3).

OUT OF SCOPE (reviewer should reject any of these in the diff):
- Server resolution engine, spine, ResolveSpine, TIER_BASE/band/limit, `resolveDraftMaterials` — ELIG/compiler territory.
- Any mint WRITE-path change (mintLocalTerm, createFromVendorExa, /vocab/mint, MaterialGrounding) — disclosure is display-only.
- `aliasToAppend` imports, term reconciliation writes (memo Q6).
- Any second forced tool/intent/verb, any new agent path, any new endpoint (the locked one-intent rule; lane-2 header LOCKED decisions).
- Deterministic surfaces: deck, `protocolStepEditing.ts`, record pages, ChangesPanel, run wall.
- `ProtocolLocalizationThread.clarificationAdapter.ts` frozen golden bytes (`w211-golden/` fixture + sha pins flip only via their named follow-up).
- `server/src/ai/materialRefFields.ts` (lane symlink into Brad's tree — trunk-hygiene, owned by orchestrator/Brad; import as existing code does, never re-point/copy/fix).
- Label de-duplication/rewriting of real records; any `label` mutation.

## §9 Verification

FIRST TARGETED CHECK (proves the approach early; smallest RED — run BEFORE building the picker plumbing):

```
cd /mnt/vast/home/brad/git/wt/matres-panel-lane2/app
npm run test:unit -- ClarificationPanel
```
Expected RED at base (suite doesn't exist / one-panel-four-slots assertion fails); after the panel component + fold swap: PASS on a fixture whose four facts carry `tier`/`referentLevel`/`eligibility` per ELIG §7.4 — asserts exactly ONE `pl-clarification-panel` container, FOUR slot sections keyed by distinct argument positions, candidates bucketed by level×tier group headers, zero mint rows in instance/aliquot groups.

FULL VERIFICATION:

```
npm run test:unit -w app                # incl. existing gapcard/optionbind/clarificationCards/
                                        # clarificationAdapter golden-integrity suites GREEN (byte-stable)
npm run test:run -w server -- src/compiler/resolution   # engine + wire unchanged-green
npm run typecheck -w server             # exit 0 (baseline 0, AS-LANE2-OPTIONBIND-TSC-BASELINE-0)
npx tsc -p app                          # line-diff IDENTICAL to pre-merge trunk baseline (report both)
```

AC → test/flow mapping:

| AC (verbatim §4) | Proof | Where |
|---|---|---|
| RED-first server+app tests per spec | RED commit before green; app suites above | app |
| replay-study acceptance scenarios as unit fixtures | four-term 4-slot fixture (from `replay-harvest/panels/T4__*` + fates JSON), duplicate-label-flood fixture (4 identical MSP-DRAFT labels → grouped, refs shown), level-filtered replay (candidates visible as incomplete, M3) | ClarificationPanel tests |
| cl-browser-reviewer VERDICT: accept on :5193 | flows below | :5193 |

BROWSER FLOWS for cl-browser-reviewer (lane stack :5193, backend :3093, restart after any YAML — tsx --watch does NOT reload YAML; data repo /home/brad/.computable-lab/worktrees/main):
1. Canonical four-term: run page → AI drafting thread (`[data-testid="pl-protocol-text"]`, `[data-testid="pl-localize-btn"]`) → submit `Trypsin-EDTA + DMEM + FBS + HepG2 cells` → MEASURE: exactly ONE panel container on `[data-testid="pl-clarification-cards"]`'s replacement; FOUR distinct slot sections (screenshot + innerText); answering ONE slot and re-sending leaves the other slots' pending state and bindings distinct (two different slots carry two different `[[…]]` tokens in the next request — trail capture of the POST body suffices).
2. Mint absent below formulation: any panel slot/group whose level is instance/aliquot shows NO mint affordance row (DOM count of "Create local term" = 0 inside those groups; screenshot).
3. Disclosure visible: expand a vendor ('Web') row — the point-of-choice disclosure sentence is visible WITHOUT clicking (screenshot); clicking mints and the panel accepts the grounded answer (existing flow).
4. No alias append: the store shows NO alias written by selections alone (GET the material record before/after; diff empty on `aliases`).

## §10 Worker contract

- Profile/lock: cl-coder, FLEET LOCK; orchestrator sequences after ELIG's merge — the coder never starts before the merged `candidateFact` + widened wire schema exist on trunk.
- Worktree: `/mnt/vast/home/brad/git/wt/matres-panel-lane2`, branch `cl/lane2-matres-panel-l2t<tick>` off the POST-ELIG-MERGE trunk tip (cite the base sha in the report; ELIG spec §10's "1997e7e3" is stale — current tip moves with RECV/ELIG merges). All git with `-c core.fileMode=false` (NFS).
- node_modules symlink to /mnt/vast/home/brad/git/computable-lab/node_modules (lane-standard, REPLAY A6).
- Deliverable (unique): `.hermes/plans/MATRES-PANEL-report.l2t<tick>-coder1.md`.
- RED-first (failing tests committed before green, separate commits); UI work is NOT done until cl-browser-reviewer VERDICT: accept against :5193 (lane header + SOP rule 12); coder tests are not the gate.
- Silent-ratify: before ANY commit re-check `sha256sum /home/brad/.hermes/specs/intake/2026-10-19_material-resolution-attestation/contracts-memo-r1.md` == e8d8165882fd17af697c662539738b30f86bbca793dfffbc1c6d499fe7099393; changed ⇒ STOP, re-read annotations, halt with a question. Sites: §7.3 semantics wording [Q1 preferred-hint], §7.4 [Q6], instance-attach-never-custody copy [Q2/Q4 adjacency].
- First report step: diff the merged ELIG `candidateFact`/wire schema against this spec §5/§7.2 and state conformance or deviation. Do not touch the task list.

## §11 Reviewer bait (pre-empted — the coder pre-empts, the reviewer wields)

1. **exactOptionalPropertyTypes / conditional spread:** every new optional (level, tier, verdicts, disclosure) rides `...(x !== undefined ? {x} : {})` — the trunk idiom is verbatim at ProtocolLocalizationThread.tsx:793 and resolutionEngine.ts:106. `field: undefined` is a typecheck failure, not a style nit.
2. **Second call-site drift:** the fold must keep `foldCards` as the ONE fact→request call-site (clarificationAdapter.ts:278-290 names the drift class); a panel-specific second mapper is an instant reject.
3. **TS tier/level switchboards:** zero new `switch (tier)` / `tier === n` / level-name branches. Grouping reads payload fields; labels/disclosure come from the DATA table; mint legality is a table column. Reviewer grep: tier numeric literals in app/src must not appear in the diff outside tests.
4. **Vocabulary never hardcodes tiers:** PANEL adds no vocabulary tier data at all; if a vocabulary edit appears in the diff, reject — tiers are ELIG/spine policy data.
5. **YAML-reload trap:** if any schema/vocabulary YAML is touched (expected: none by PANEL), the lane stack must be RESTARTED before browser evidence (tsx --watch does NOT reload YAML — lane header fact); evidence taken against a stale server is invalid.
6. **Frozen goldens:** the w211-golden integrity fixture pins adapter bytes + sha; the panel must land WITHOUT flipping those pins (they have a named follow-up). A diff that "updates" the fixture is a reject.
7. **Clofibrate class (state leak):** grouped panels reuse ClarificationPicker across slots — each slot's picker instance must be keyed per slot (the request.id reset law, ClarificationPicker.tsx:179-182; the :186-191 comment names the observed defect). A slot showing another slot's search rows = high defect.
8. **Mint duplication regression:** the tier-5 dead-end option button stays deduped by `isMintOfferForLabel` (clarificationAdapter.ts:152-164); the panel's mint row is the slot's ONE affordance. Two mint rows per slot, or a mint row that answers with the literal "Create local term" label, are the pre-PANEL defect — reintroducing it is a reject.
9. **Second forced tool/verb / new endpoint:** selections ride the EXISTING answers-map re-send; any new intent, verb, or endpoint in the diff violates the lane's LOCKED decisions — reject on sight.
10. **Custody leakage (P4) / label semantics:** the instance/aliquot and vendor semantics lines come from the DATA table; ad-hoc TS string branches building semantics per tier = reject; any copy implying a selection attests custody/use = HIGH reject.
11. **Alias non-regression (Q6):** grep `aliasToAppend` under app/ in the diff — one hit is one reject.
12. **Label-key collision honesty:** two facts with the SAME label in one fold share the answers-map key (server join is exact-label — resolveNounsPass.ts:283). The panel must NOT invent per-slot keys server-side; if a four-term utterance ever yields duplicate labels, the shared binding is existing server semantics and must be surfaced, not papered over.
13. **No tier-as-truth / re-derivation:** the panel never derives level from tier or re-reads the store to fill missing fields; absent fields → `unspecified-level` (§7.2), never inference.

## §12 Decisions (D-numbered, for the coder prompt)

- **D1 — Collapse = fold-surface swap, not adapter rewrite.** The panel consumes `foldCards` output; each request already carries slot identity (prompt=label, menuProvider via the DATA tables). Rejected: new fact→panel wire shape (second home for the clarification shape).
- **D2 — Answers ride `answers[fact.label]` byte-unchanged.** Distinctness comes from distinct fact labels/positions; the ANSWER-BIND-1 join and its goldens stay. Rejected: slot-keyed answers channel (server contract change + join fuzzing risk).
- **D3 — Grouping fields are consumed, never computed.** tier/referentLevel/eligibility arrive on the candidate per ELIG §7.4 (merged code = authority); absent ⇒ unspecified-level. Rejected: re-resolving at render time.
- **D4 — Presentation data in the client adapter table class** (`CLARIFICATION_MENU_BY_REASON` precedent is adjudicated law in-file). Rejected: *.ui.yaml (record-display mechanism, UISpecLoader, different consumer) and server-sent prose (payload bloat; OQ-2 alternative).
- **D5 — Mint legality stays resolver/scope-driven and extends:** concept/formulation groups may carry the floor row; instance/aliquot-scoped slots/groups never do — the shipped `canMint` gate generalized to group level via the data table. Rejected: per-tier mint logic in the panel component.
- **D6 — Disclosure is additive copy on the existing Exa row + mint row,** pointing at the ALREADY-existing selection-time write (resolvers.ts:83, :239-245). Zero write-path change. Rejected: deferring the mint to accept-time (changes MaterialGrounding/mint-on-select doctrine — out of scope).

## §13 OPEN QUESTIONS (orchestrator rules at promotion; the coder never improvises)

- **OQ-1 — Turn identity.** No turn id exists on the wire (verified: `turnId` grep across server/src = 0; the 422 body is `{error, outcome, clarifications, localMacro, terminalArtifacts}`, IntentCompileFromPromptHandlers.ts:241-249). My stance: client-side panel key (`localMacro.intentId` + fold epoch, §7.1); the fold already replaces cards wholesale so staleness is impossible by construction. Checked: handler response types, thread fold code, apiClient held-flag round-trip. Alternative: server-issued turnId additive on the held body — cleaner long-term, but it is a wire change ELIG did not declare and PANEL shouldn't smuggle.
- **OQ-2 — Where per-selection semantics text lives.** My stance: client DATA table (§7.3, D4). Alternative: server-side data file (e.g. alongside ELIG's material-eligibility triplet) shipped in the payload — keeps copy i18n/server-owned but adds payload surface beyond ELIG's declared fields. Checked: adapter-table precedent, UISpecLoader scope (record display only), ELIG §7.4 field list (no prose fields).
- **OQ-3 — Server-side gap during the browser gate.** PANEL's declared file list includes "server clarification fact shape", but my read is ELIG's merge already carries everything the panel renders. If the :5193 gate exposes a genuinely missing field, who amends? My stance: route back as a data-only amendment in ELIG's schema home (single shape home law), orchestrator sequences the mini-fix; PANEL's coder never edits resolutionEngine. Checked: ELIG §7.4, wire schema :225-292, harvest payload inventory.
- **OQ-4 — `wash.material`-style well-ready slots in the panel.** Under an aliquot-demanded argument, today's levelFilter can zero the candidates to unknown-noun + mint offer (harvest M3); post-ELIG they arrive as display-visible INCOMPLETE candidates. My stance: the panel renders them grouped with incomplete markers and NO mint row (aliquot = physical); whether the ELIG-declared vocabulary eventually widens `wash.material levels` is Q1 data territory, not PANEL's. Checked: resolutionEngine.ts:144-161, harvest §2 level-filtered table, memo Q1. [DEFAULT-PENDING-RATIFICATION: Q1]

## §14 First-hand verification record (scout-free run)

No scout dispatches were used this composition (the bounded questions were answered faster first-hand than recon round-trips cost). Everything cited above was read directly in the trunk @ 38e1e5a5 this session: resolutionEngine.ts (:57-75, :91-108, :110-123, :144-161, :225), types.ts (:107), resolveNounsPass.ts (:73-78, :280-306, :447), IntentCompileFromPromptHandlers.ts (:206-215, :231-249, :354), scientist-intent.schema.yaml (:225-292), ResolveSpine.ts (:183, :218, :268-277), resolve/types.ts (:12, :14), termReconciliation.ts (:102), adapters.ts (:297), materialRefFields.ts (symlink re-confirmed via `ls -la`; :58, :66, :86 tables), ai.ts (:194-256), ProtocolLocalizationThread.tsx (:194-198, :368-442, :764-824, :953 lines), clarificationAdapter.ts (whole file), ClarificationPicker.tsx (whole file), resolvers.ts (:42, :63-92, :205-252), ProtocolTabPanel.tsx (:1777-1793), UISpecLoader.ts (:792), ui-v1.schema.yaml (header), task-list.md (:10634-10665 block, :1228 SOP cite, :33-39 env facts), ELIG spec (full), harvest report (full), memo r1 (full; sha256 re-verified UNCHANGED at dispatch), handoff 2026-10-20_0250 (full).

EXIT SUMMARY
- Path: /home/brad/.hermes/cl/lanes/2/specs-draft/2026-10-20_0320-MATRES-PANEL-typed-clarification-spec-DRAFT.l2t0255.md
- Sections: 14 (+ exit summary)
- Open questions: OQ-1 turn identity (client fold key, no wire change); OQ-2 semantics-text home (client data table vs server payload — stanced client); OQ-3 server-gap routing during browser gate (route amendments to ELIG's schema home); OQ-4 well-ready/aliquot slots render incomplete, no mint, Q1 data not PANEL's [Q1].

## §15 Orchestrator promotion rulings (2026-10-20T04:20 EDT, orch l2t0355)

Draft reviewed first-hand in trunk @ 444d1183 (code tip 46c3e4e9). Load-bearing cites
re-verified by the orchestrator this tick: candidateFact :101-108 w/ conditional-spread
ref :106; clarificationFor :110-123; levelFilter :144-161; termReconciliation aliasToAppend
:102 with ZERO callers under server/src+app/src (grep empty — Q6 non-regression posture
byte-true); held-card surface :764-799 + conditional-spread ref :793; fold wholesale
replace setHeldCards(foldCards(...)) :388; canMint gate ClarificationPicker.tsx:268-269;
request.id query-reset :179-182; wire unresolved-item additionalProperties/
unevaluatedProperties:false + required {label,reason} (scientist-intent.schema.yaml:225+);
ref additivity comment block :262+; ProtocolLocalizationThread mount site
ProtocolTabPanel.tsx:1777-1793; resolvers.ts mint floor :63-92 + vendorExaSuggestions
mint-on-select :205-247; `turnId` grep server/src = 0 hits.

- OQ-1 RULED AS STANCED: client-side panel key (localMacro.intentId + fold epoch). No
  server turnId — a wire change ELIG did not declare must not ride PANEL.
- OQ-2 RULED AS STANCED: per-selection semantics text = client DATA table in the
  clarification-adapter table class (CLARIFICATION_MENU_BY_REASON precedent is in-file
  law). Server payload prose rejected.
- OQ-3 RULED: any genuine server fact-shape gap surfaced by the :5193 gate routes back to
  ELIG's schema home as an orchestrator-sequenced data-only amendment; PANEL's coder
  never edits resolutionEngine.
- OQ-4 RULED AS STANCED: well-ready/aliquot slots render ELIG's display-visible
  INCOMPLETE candidates, NO mint row (physical layer); vocabulary widening is Q1 data,
  not PANEL's. [DEFAULT-PENDING-RATIFICATION: Q1]
DISPATCH GATE (unchanged): PANEL starts ONLY after MATRES-ELIG merges; base = post-ELIG
trunk tip. Spec is PROMOTED; §13 alternatives are closed.
