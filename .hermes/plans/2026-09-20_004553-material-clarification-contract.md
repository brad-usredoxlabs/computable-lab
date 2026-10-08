# Plan — Material clarifications: one authoritative ref, layer-scoped menus, bound answers

Date: 2026-09-20 00:45 EDT
Repo: `/mnt/vast/home/brad/git/computable-lab`
Status: IMPLEMENTED 2026-09-20 (see §0 status below). Not a kanban spec — do NOT drop this in `~/.hermes/specs/inbox/`.

---

## 0. Implementation status (2026-09-20)

Landed and verified:

| Phase | What | Evidence |
|-------|------|----------|
| 1.1/1.2 | The gate honours a ref's `type`: a material-spec/aliquot/instance/vendor ref is trusted wherever it is carried | `forceMaterialClarifications.test.ts` 32 tests (2 were RED on the reported shapes) |
| 1.3 | A pick is BOUND, not transmitted (`materialBinding.ts`), keyed by the gate's own `material-<eventIndex+1>` request id; never guesses (unbound is reported) | `materialBinding.test.ts` 8 tests, incl. bind → gate asks nothing |
| 1.4 | A minted ref (`{mint:{label}}`, no id) is bound by label to the resolved mention | `normalizeDraftMaterialRefs.test.ts` 8 tests |
| 1.5 | Unknown draft fields are NAMED, not dropped (`draftArgDiagnostics.ts`) | 4 tests; **seen live**: `I ignored \`intent\`` in `.run/backend.log` |
| 1.6 | An identical re-ask is an honest `clarification_loop` failure (`clarificationLoop.ts`) | 9 tests |
| 2.1 | The request carries `materialLayer` (server + app types) | 4 tests |
| 2.2/2.3 | The menu offers that layer ONLY (concepts / formulations / instances / aliquots / vendor) with biologist wording | `resolvers.test.ts` 15 tests (5 new), picker 9 |
| 2.4 | A mention-only answer still resolves | covered by 1.4 + `refFromAnswer` |
| 3.1 | The layer policy is DATA in `material-profile.registry.yaml`; loader exposes it and refuses a malformed policy | `MaterialProfileClarification.test.ts` 5 tests, incl. a drift guard against the code table |
| 3.3 | The follow-up is DERIVED from the table (formulation owes a volume, aliquot nothing) | `materialFollowUp.test.ts` 8 tests |
| 4.1 | The prompt states layer→field once + the binding promise | `event-graph-agent.md` +11 net lines (disclosed: it may only replace, not grow) |

**Live end-to-end proof** (event editor, `lfm-local` active, the reported scenario): one turn, `resolvedMentions=1`, `events=1`, **no clarification card, no repeat** — the loop Brad hit is gone.

Deferred, with reasons:
- **P2.5 child-narrowing** (concept pick → that concept's formulations): layer *scoping* landed; walking the hierarchy child-by-child needs a formulation-by-material filter the summary endpoint does not expose yet.
- **P3.2 lint invariants**: Ajv against `schema/**` is the single validation authority (rule 3), so a redundant lint rule would be noise. Note recorded: `material-spec.schema.yaml` requires `[kind, id, name, material_ref]` and does NOT require a concentration — the gate trusts the layer, and record completeness stays the schema's business.

Uncommitted on purpose: `AgentOrchestrator.ts`, `types.ts`, `app/src/types/ai.ts`, `server/src/server.ts` carry ANOTHER session's in-flight work (tube/deck-slot/record-creation). Committing them would publish a peer's half-done refactor; committing around them would not compile alone. The working tree has everything and is what runs.

### Round 2 (same day) — four live-reported defects

1. **A range asked one question per well** → the gate now groups gaps by MATERIAL IDENTITY (`materialIdentity.ts`) and names the range in the question. Root cause of the eight cards: `{mint:{label}}` (no kind, no id) was not recognised as a mint, so the gap label was empty and nothing could be grouped.
2. **Inconsistent options per well** (one offering to mint, others finding saved formulations) — the same empty label, from the per-event ref shapes.
3. **The Questions tab did not scroll** → `.ai-tab__section--questions` had no rule and inherited `flex-shrink: 0`, and `.questions-panel` had no styles at all. Now styled with a pinned header/actions and a scrolling list (verified live: list 396/125px, `overflow-y: auto`, buttons in view).
4. **The picker showed the PREVIOUS material's options** ("add 1 million HepG2 cells" answered with clofibrate) → the picker seeded query/items once and its search effect did not depend on the request while the questions panel reused the instance. Fixed with a per-request reset + `key={request.id}`.

Brad's correction, now an invariant with guard tests: **a selected range does NOT imply a common addition.** "Do a serial dilution down this column" is one material with a different amount per well, so (a) a quantity question is never grouped across wells, and (b) an answer fans out only across events that NAME the same material themselves — a note- or labware-derived identity may group a question but never extend an answer's reach.


Trigger: Brad, testing `lfm-local` (lfm2.5-2.6B) in the event-editor AI dock, hit an unbreakable clarification loop and asked (a) whether the options offered to the biologist should be simplified, and (b) whether there is a better way to feed the selection back than prose plus a CURIE.

Brad's rulings folded in:
- **R1** — model choice is a `/settings` concern (`lfm-local`, `qwen3.6-appliance-2`, `qwen3.8-thunderbeast`), never a pulldown in a chat surface; the ingestion workflow carries no thinking selector. (Done, separate thread — recorded here only so implementers do not reintroduce per-surface model controls to "fix" a small model.)
- **R2** — do not add "hints" for a weak model; if the contract is unclear, make the *contract* clear (data/schema), not the prompt longer.
- **R3** — never collapse the material hierarchy to make a menu simpler.

Does not touch: the intake/decision-tree pipeline (`.hermes/plans/2026-09-19_121028-protocol-pipeline-consolidation.md`), labware placement (`2026-09-18_230000-definition-driven-labware-placement`), or the settings AI-model section (already landed).

---

## 1. The reported failure

With `lfm-local` active, Brad wrote:

    Use [[material-spec:MSP-API-mu50x5z7|1 mM Clofibrate in DMSO]] for material.

and got the same card back, forever:

    AI    ... Let me draft an event_graph intent with verb add_material, labwareId …, wells …
          materials: [{"ref": "MSP-API-mu50x5z7"}]
    1 clarification needed — see Questions panel above.
    ⚙ Tool: agent_intent · event_graph · 1 event · 1 field: events

The model's *reasoning* is not confused — it restates the correct plan, twice, then ends with the question card. The loop is a **shape** deadlock: the answer is prose, and only the model's emitted ref shape can unblock the harness.

Mechanism, per pass (all verified in code, not inferred):

1. `normalizeDraftMaterialRefs` (server/src/ai/AgentOrchestrator.ts:320-356) is the only component that binds a resolved mention to the event, and it repairs `material_ref` **only when the ref carries a string `id`** (:326-328, `if (!id) return null`). The model emitted `material_ref: { mint: { label, domain } }` — no `id` — so repair returns null and the answer never lands.
2. The gate classifies that ref (`forceMaterialClarifications.ts:171-251`): unknown/mint kind, no id → last branch → `no-ref` → *"Which material should be added to A1? Pick an ontology term or create a local record."* (`:304-312`) — the same card, verbatim.
3. Because any material gap exists, the **entire draft is discarded** (`parsed.events = []`, AgentOrchestrator.ts:1812-1816) and only the question survives. That is the "1 field: events" and the "1 clarification needed" line (rendered at app/src/event-editor/right-pane/ai/MessageLog.tsx:154).
4. Nothing counts "we already asked this exact question" — no repeat guard exists in the orchestrator or in app/src/event-editor/right-pane/ai/QuestionsPanel.tsx. The loop is unbounded by construction.

### 1.1 Four things genuinely not given clearly

**E1 — Two fields claim to carry the material, and the app writes the one the gate does not trust.**
The prompt (server/prompts/event-graph-agent.md:364-371) says prefer `material_spec_ref` and shows copyable JSON for both. But the repair path writes `material_ref` (AgentOrchestrator.ts:354) while the gate's trusted check (`hasTrustedSpecOrAliquot`, forceMaterialClarifications.ts:135-146) accepts **only** `aliquot_ref`, `material_spec_ref`, `material_instance_ref`, `vendor_product_ref`. A perfectly repaired material-spec therefore lands in the field the gate ignores.

**E2 — And when it falls through, the question is unanswerable.**
A record ref of type `material-spec` reaches the quantity gate → *"I need a volume and a concentration for '1 mM Clofibrate in DMSO'."* That label **is** a concentration; it is a formulation. The gate's own doc comment (:26-33) says a material-spec needs no concentration prompt because "a spec already fixes a concentration" — the code honours that only when the spec arrives in `material_spec_ref`. The `type` is right there in the ref (`:219-238` reads `kind`, `id`, `label` and never checks `type`).

**E3 — The invented field is dropped silently.**
`materials: [...]` is not in `DRAFT_ARG_KEYS` (AgentOrchestrator.ts:616) and no consumer reads it (AddMaterialSupport, GraphProjector, MaterialCompiler all read `material_spec_ref`/`material_ref`). The model's (arguably correct) intent to bind `MSP-…` is discarded with no diagnostic — neither the model nor the log is told "you emitted a field I don't know", so the next pass repeats it.

**E4 — A model-shape failure is rendered as a question to the human.**
"Which material should be added?" reads as *the biologist* not having said enough, when the blocker is a ref the harness cannot bind. The two situations are indistinguishable in the UI, which is why a stuck loop looks like a persistent question rather than a failure.

Prompt-weight context: `event-graph-agent.md` is 506 lines (942 across `server/prompts/`), precedence list at `:56-60` in prose, JSON examples at `:363+`. A 2.6B model gets one pass. A larger model lands on `material_spec_ref` by prompt-adherence alone — which is why this only showed up on LFM; E1/E2 will bite any model that emits `material_ref`.

### 1.2 The two design questions, answered (this plan implements these)

**Q1 — should the options offered be simplified? Yes, but not by hiding layers: make the menu a function of the question.**

The server already computes the layer. `forceMaterialClarifications` classifies each gap as `no-ref` / `unverified-curie` (name the concept), `instance-gap` (which preparation or lot), `needs-quantity` (how much), `dirty`-free, and each branch already picks a different `menuProvider`/`kind` (`:314-387`).
The picker throws that away: `app/src/shared/taptab/slashMenu/resolvers.ts:39-40` merges `searchMaterials` (concepts, `MAT-…`) **and** `getFormulationsSummary` (formulations, `MSP-…`) into ONE list, then appends ontology-resolve, mint and vendor-Exa tiers. Nothing in that list knows which layer was asked about — hence "material" sitting beside "formulation" with equal weight (Brad: "the biologist is going to have NO GODLY IDEA which one to pick").

**Q2 — is there a better way to feed the selection back than prose + CURIE? Yes: bind the pick, do not transmit it.**

The click already produces structure — `ClarificationPicker.tsx:84` builds `ref {kind:'record', id, type, label}` alongside the `[[material-spec:MSP-…|…]]` token; both fields exist on `AiClarificationAnswer` (app/src/types/ai.ts:169-176, server/src/ai/types.ts:516-523). The server even trusts it: AgentOrchestrator.ts:220-247 ("Trust its ref and inject it") reads `answer.ref` and derives a proper `ResolvedMention` kind (`material-spec`, `aliquot`, `labware`, `equipment`).
The knowledge is present and correct; what it is *used for* is repairing a ref the model must first emit. Meanwhile the answer is also rendered into the prompt as a prose line (`AgentOrchestrator.ts:208-211`) — the lossy hop Brad observed.
The join key for binding already exists end to end: every gap carries `eventIndex` (`forceMaterialClarifications.ts:186-193`), every generated request is `material-<eventIndex+1>` (`:320`), and every answer carries `requestId`.

---

## 2. LOCKED decisions

**D1 — One authoritative field per layer, and the gate honours `type`.**
`details.material_spec_ref` is the canonical field for a formulation; `aliquot_ref` for an aliquot; `material_instance_ref` for an instance; `vendor_product_ref` for a catalog item. A ref carried in `material_ref` whose `type` names a well-ready layer (`material-spec` / `material-instance` / `aliquot` / `vendor-product`) is **trusted by the gate exactly as if it were in the layer's own field** (E1/E2 closed at the gate, not by rewriting the model's output). `material_ref` stays the field for a bare *concept*.

**D2 — The gate never asks for a quantity that the ref already carries.**
A ref whose `type` is `material-spec` (a formulation, hence a concentration), `aliquot` or `material-instance` (a measured quantity) satisfies the quantity requirement. Only a bare concept with no quantity asks "I need a volume and a concentration for …". This is what the file's own doc comment (:26-33) already claims.

**D3 — A pick is BOUND, not transmitted.**
`requestId → (eventIndex, field)` → the harness writes the picked ref onto the event after the model re-drafts, before validation/compile. The model re-drafts the graph *around* a fixed reference and never has to echo a CURIE. The prose mention stays in the prompt for context, but correctness no longer depends on the model re-emitting it.

**D4 — Menus are a function of the question's layer, declared as data.**
Layer ∈ `{concept, formulation, instance, aliquot, vendor, labware, equipment}`. The clarification request carries the expected layer; the picker resolves *that layer's* sources only (no union), shows the layer in the biologist's words, and skips the question entirely when the biologist's own words already name a layer.

**D5 — The chosen layer determines what is still required.**
A formulation fixes a concentration → ask only volume. An aliquot fixes volume and concentration → ask nothing. A bare concept → ask both, then materialize a formulation at accept. That table is **data** (extend `schema/lab/material-profile.registry.yaml`; rules that must hold for records stay in `schema/lab/material.lint.yaml`), read by code — never a hardcoded branch in TS.

**D6 — Nothing is dropped silently, and no loop is unbounded.**
An unknown draft field (e.g. `materials`) is reported to the model *and* to the log with an actionable sentence. An identical re-ask (same prompt + query) is a hard failure surfaced in the panel after N=2, with the last raw model turn attached — an honest error instead of an eternal question.

---

## 3. Phase 1 — Break the loop (server only; no UI change)

Independently shippable and independently valuable: it kills the loop for **any** model without touching the picker.

### Task 1.1 — The gate honours `type` on a record ref
**Objective:** in `forceMaterialClarifications.ts`, a record ref whose `type` names a well-ready layer is trusted (`:135-146` `hasTrustedSpecOrAliquot` and the `kind === 'record'` branch at `:235-238`). Keep `material_ref` + type `material` as a bare concept.
**RED first:** `forceMaterialClarifications.test.ts` — `[{details:{material_ref:{kind:'record',id:'MSP-1',type:'material-spec',label:'1 mM Clofibrate in DMSO'}}}]` yields **zero** clarification requests; and a `type:'material'` ref with no quantity still yields `needs-quantity`. Today the first asks `needs-quantity`.
**Files:** `server/src/ai/forceMaterialClarifications.ts` (+ its test).
**Verify:** `npm run test:run -w server -- forceMaterialClarifications`.

### Task 1.2 — Quantity gate reads the layer, not just the field
**Objective:** `hasQuantitySignal`/`conceptGap` treat a formulation/instance/aliquot ref as carrying quantity (D2), including `concentration` on the *ref's own record* when the draft only names the spec.
**RED first:** the `1 mM Clofibrate in DMSO` case above produces no `needs-quantity` prompt; the message strings in `promptForGap` (:284-298) are asserted unchanged for the genuine cases.
**Files:** as 1.1.
**Verify:** as 1.1.

### Task 1.3 — Identity binding: write the pick onto the event
**Objective:** when a clarification answer's `ref` matches a pending gap, the orchestrator writes `details.<field> = ref` onto the event at that gap's `eventIndex` — reusing the same field/ref construction the trust path understands (`material_spec_ref` for a spec, `aliquot_ref` for an aliquot, `material_instance_ref` for an instance, `vendor_product_ref` for a vendor product, `material_ref` for a concept). Resolved from `resolvedMentions` (built at `AgentOrchestrator.ts:220-247`) plus the request's `eventIndex`; applied where the draft is assembled (`~:1780-1830`, beside `normalizeDraftMaterialRefs`).
**RED first:** a draft whose `material_ref` is `{mint:{label:'clofibrate'}}` + an answer carrying `ref {id:'MSP-API-mu50x5z7', type:'material-spec'}` for `requestId:'material-1'` produces an event carrying `material_spec_ref` — with **no** dependency on the model's re-emission. Today: the ref never binds, and the gate re-asks. Second case: `requestId` for index 2 binds to event 2, not event 1.
**Files:** `server/src/ai/AgentOrchestrator.ts` (+ new `AgentOrchestrator.materialBinding.test.ts`).
**Verify:** `npm run test:run -w server -- AgentOrchestrator materialBinding`.

### Task 1.4 — Mint refs are bindable, or rejected loudly
**Objective:** give a minted draft ref a stable identity the repair can bind (its `mint` label is the identity the user answers about), so a mint comes back resolved rather than repaired-to-null; otherwise reject it with an explicit message. `normalizeDraftMaterialRefs:326-328` currently returns null for anything without `id`.
**RED first:** `{mint:{label:'clofibrate'}}` + an answer whose mention label matches is either bound (preferred) or reported with the "I could not bind this ref" diagnostic — never silently ignored.
**Files:** `server/src/ai/materialRefLabels.ts`, `AgentOrchestrator.ts`.
**Verify:** the corresponding suites plus 1.3's.

### Task 1.5 — Unknown draft fields are never dropped silently
**Objective:** when the recovered draft args carry a top-level key outside `DRAFT_ARG_KEYS` (`AgentOrchestrator.ts:616`) or an event `details` key no schema/consumer reads, (a) log it with the field name at the draft boundary and (b) return it to the model as a short, actionable line in the next instruction ("`materials` is not accepted by this tool; put the ref in `details.material_spec_ref`"). One shared helper, no per-field hardcoding.
**RED first:** a draft body containing `materials: [{ref:'MSP-1'}]` produces a diagnostic naming `materials` and the corrective sentence; a clean draft produces none.
**Files:** `server/src/ai/AgentOrchestrator.ts` (+ `draftArgDiagnostics.ts` + test).
**Verify:** `npm run test:run -w server -- draftArgDiagnostics AgentOrchestrator`.

### Task 1.6 — Loop breaker
**Objective:** the server counts identical clarification round-trips (normalize prompt + query) using `history` (already on the chat body — AIHandlers.ts:24/50/70) and, on the 2nd identical re-ask, fails loudly: a `clarification_loop` error carrying the repeated prompt and the last raw model turn, rendered in the panel (MessageLog) — never a third identical card.
**RED first:** two identical drafts + identical answers → 2nd response is the error, not another `clarificationRequests[]`; a genuinely different question still asks.
**Files:** `server/src/ai/AgentOrchestrator.ts`, `app/src/event-editor/right-pane/ai/assistStream.ts`, `MessageLog.tsx` (+ tests).
**Verify:** `npm run test:run -w server -- AgentOrchestrator` + `npm run test:unit -w app -- MessageLog`.

**Phase 1 acceptance:** with `lfm-local` active, the exact Brad scenario ("Use [[material-spec:MSP-…]] for material" on a 96-well plate) completes in one round trip: an `add_material` event appears carrying `material_spec_ref`, no repeat card, no quantity question.

---

## 4. Phase 2 — Layer-scoped menus (the UI)

### Task 2.1 — Carry the layer on the clarification request
**Objective:** `AgentClarificationRequest` (server/src/ai/types.ts:516 area; app mirror `app/src/types/ai.ts`) gains an optional `materialLayer: 'concept'|'formulation'|'instance'|'aliquot'|'vendor'` (name it to match the registry's layer vocabulary), set from the gap reason in `requestForGap` (`forceMaterialClarifications.ts:314-387`). Note: clarification requests are TS types, not schema-validated (there is no `schema/ai/`) — if implementers want it declarative, that is a separate spec; do not invent a schema now.
**RED first:** each gap reason yields the expected layer (`no-ref`/`unverified-curie` → concept, `instance-gap` → instance, spec-bearing → formulation).
**Files:** `server/src/ai/types.ts`, `forceMaterialClarifications.ts`, `app/src/types/ai.ts`, `app/src/shared/api/client.ts` types.
**Verify:** server + app typecheck, `forceMaterialClarifications` suite.

### Task 2.2 — The picker resolves by layer (no union)
**Objective:** `ClarificationPicker.tsx:31-33` and `resolvers.ts` choose sources per layer: concept → `searchMaterials` + ontology resolve; formulation → `getFormulationsSummary` (+ that concept's specs); instance/aliquot → `searchRecordsByKind` with kind `material-instance` / `aliquot` (`GET /records?kind=…` exists — RecordHandlers.ts:111/117; client `listRecordsByKind` :1961, `searchRecordsByKind` :3594); vendor → `searchVendorProducts`; labware/equipment unchanged. A bare concept must be **impossible** to answer a "which preparation?" question.
**RED first:** given a request with `materialLayer:'instance'`, the option list contains no `MAT-…`/ontology concept rows and does contain instance/aliquot rows for that formulation; `materialLayer:'concept'` contains no spec/instance rows.
**Files:** `app/src/shared/taptab/slashMenu/resolvers.ts`, `ClarificationPicker.tsx` (+ tests).
**Verify:** `npm run test:unit -w app -- ClarificationPicker resolvers`.

### Task 2.3 — Say the layer in the biologist's words
**Objective:** the prompt/heading names the layer: "Which compound?" / "Which prepared solution?" / "Which tube (lot/aliquot)?" — sourced from data (D5), not from a switch in the component.
**RED first:** an `instance` request renders the preparation/tube wording; a `concept` request does not.
**Files:** `ClarificationPicker.tsx`, `QuestionsPanel.tsx` (+ tests).
**Verify:** `npm run test:unit -w app -- ClarificationPicker QuestionsPanel`.

### Task 2.4 — Skip the question the biologist already answered in words
**Objective:** when the user's message already names a layer (a formulation-looking label such as "1 mM X in DMSO", an `MSP-`/`ALQ-` mention), open the picker at that layer, or accept the mention directly with no question at all.
**RED first:** the mention `[[material-spec:MSP-…|1 mM Clofibrate in DMSO]]` in the user turn produces a `formulation`-layer request (or none) — never a `concept` question.
**Files:** `forceMaterialClarifications.ts`, `materialRefLabels.ts` (+ tests).
**Verify:** server suites + Phase-1 acceptance re-run.

### Task 2.5 — Narrowing, not a flat list
**Objective:** after a concept pick, that concept's formulations are offered (children), then that formulation's instances/aliquots — a walkable path. Where the chosen layer has exactly one candidate, present it as a confirmation rather than a choice.
**RED first:** after answering a concept question, the next options are that concept's formulations only (asserted by seed ids in the test), not the global formulation list.
**Files:** `resolvers.ts`, `ClarificationPicker.tsx` (+ tests).
**Verify:** `npm run test:unit -w app -- ClarificationPicker`.

---

## 5. Phase 3 — The layer→requirements table as DATA

### Task 3.1 — Registry extension
**Objective:** `schema/lab/material-profile.registry.yaml` gains a declarative block per profile — allowed layers for clarification, per-layer required fields, and the wording for each layer question (D5). Loader: `server/src/materials/MaterialProfileRegistry.ts:38` (document interface), loaded at `server/src/server.ts:430`. Schema-validate the new block; fail loudly on an unknown layer.
**RED first:** the registry loads the block; an unknown layer name is rejected; the `single_active_formulation` profile declares that a formulation needs volume only.
**Files:** `schema/lab/material-profile.registry.yaml`, `server/src/materials/MaterialProfileRegistry.ts` (+ tests).
**Verify:** `npm run test:run -w server -- MaterialProfileRegistry`.

### Task 3.2 — Lint for the invariants that must hold in records
**Objective:** `schema/lab/material.lint.yaml` states the record-level invariants (a material-spec carries a concentration; an aliquot a volume + a concentration; a concept is never persisted bare in an add). Enforcement stays with the existing lint engine — no TS rules.
**RED first:** a spec without a concentration fails the declared lint; a bare-concept add is rejected at accept.
**Files:** `schema/lab/material.lint.yaml` (+ existing lint tests).
**Verify:** `npm run test:run -w server -- lint`.

### Task 3.3 — The follow-up question comes from the table
**Objective:** after binding a ref, the "what else is required" question (volume, concentration) is produced from the registry table keyed by layer — deleting the hardcoded per-reason branching that produced E2's unanswerable prompts.
**RED first:** binding a `material-spec` asks for volume only; binding an `aliquot` asks nothing; binding a concept asks concentration + volume.
**Files:** `forceMaterialClarifications.ts` (or its successor), `MaterialProfileRegistry.ts`.
**Verify:** server suites + Phase-1 acceptance.

---

## 6. Prompt/doc clarity (small, and *not* by adding prose)

### Task 4.1 — One copyable shape per layer, plus the binding promise
**Objective:** `server/prompts/event-graph-agent.md` states, once, compactly: the layer → field table (`material_spec_ref` / `aliquot_ref` / `material_instance_ref` / `vendor_product_ref` / `material_ref` for a concept), and that **the harness binds the user's pick** — so the model must not try to re-derive a resolved reference. Keep the existing JSON examples; remove the ambiguity where `material_ref`'s example shows a `material-spec`-typed ref, which currently invites E1.
**Guardrail:** the 506-line prompt is already the problem for a 2.6B model — this task may only *replace* text, not add lines. If it grows, it has failed.
**RED first:** a golden-prompt test (if one exists) pins the table's presence; otherwise a snapshot of the add_material section.
**Files:** `server/prompts/event-graph-agent.md`.
**Verify:** prompt-assembly suite; manual read-through by Brad.

---

## 7. Acceptance (end-to-end, browser-reviewer)

1. **The loop is dead.** `/settings` → activate `lfm-local`. In the event editor, on a 96-well plate, type *"Use [[material-spec:MSP-API-mu50x5z7|1 mM Clofibrate in DMSO]] for material"* → one round trip → the event appears with `material_spec_ref` bound; no repeat card; no "I need a volume and a concentration" for a formulation.
2. **No nonsense options.** Ask for a preparation → the buttons contain no bare concepts and no ontology CURIEs; ask for a compound → no formulations/instances.
3. **Narrowing works.** Pick a concept → the next options are that concept's formulations; pick a formulation → its instances.
4. **Nothing is silent.** A model emission carrying `materials: [...]` produces a visible diagnostic and a corrective line to the model, not a silent drop.
5. **The loop breaker is honest.** Forcing the repeat (same question twice) yields the `clarification_loop` error in the panel with the last raw turn attached.
6. **Model-agnostic.** Repeat 1 with `qwen3.6-appliance-2` active — no regression for a larger model.
7. Full green: `npm run test:run -w server`, `npm run test:unit -w app`, `npm run typecheck`. Browser-verified per SOP 12 (unit tests + curl do not count).

## 8. Non-goals / guardrails for implementers

- **Do NOT collapse the hierarchy** to make the menu easier (R3). Layer filtering must never widen a question's acceptable layers.
- **Do NOT hardcode layer rules in TS** — allowed layers, required fields and wording come from the registry/lint (D4/D5). Code reads data; data decides policy.
- **Do NOT widen the gate to "anything goes."** A bare concept with no quantity must still be questioned; trust comes from a named layer, not from leniency.
- **Do NOT invent quantities or labels.** If a required value is unknown, ask — never fabricate (hard boundary).
- **Do NOT make the prompt longer** as the "clearer" fix (R2). If a 2.6B model needs structure, it gets it from binding and menus, not from more prose.
- **Do NOT reintroduce per-surface model controls** (R1) to work around a weak model's behaviour.
- **Do NOT special-case the specific example** (`MSP-API-mu50x5z7`, clofibrate, DMSO). Every rule must hold for a peptide, a cell line, a conditioned medium, an aliquot from the freezer.

## 9. Open questions for Brad

1. **Binding scope:** should the same identity binding cover labware/equipment picks (AgentOrchestrator.ts:236-241 already derives those kinds)? I would extend it — it is the same mechanism — but it touches the deck flow, so it is your call.
2. **A concept pick when a formulation exists:** if the biologist deliberately picks the *concept* and a formulation for it exists, do we (a) ask for concentration+volume and materialize a new spec, or (b) nudge to the existing formulation? I lean (a) with the existing spec offered as a pre-filled option.
3. **Loop-breaker threshold:** N=2 identical asks, then error — or N=2 then hand the biologist a single "the model couldn't bind this; here are the candidates" picker that bypasses the model entirely? The second is friendlier and arguably more honest.
