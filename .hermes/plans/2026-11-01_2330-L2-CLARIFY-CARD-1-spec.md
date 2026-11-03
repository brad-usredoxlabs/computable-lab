# L2-CLARIFY-CARD-1 — implementation spec (DRAFT, l2t2110; orchestrator review pending)

Goal: make one scientist sentence cost one answer action and make a clarification impossible to
skip — the chat host renders ONE grouped card per sentence (one slot per fact, one Submit, one
answered row), the mint row states the durable write it performs and previews the EXACT label it
will create (never the live filter box), and the unresolved-noun decision moves from the model to a
deterministic server-side gate at the compiler-consumption point, so the same prompt can never be
twice a different product.

Evidence base: `~/.hermes/cl/receipts/CLARIFY-WEIRD-20261101/20261101_174042/report.md`
(W6, W7, W9, W11, W12, W14, §5 committed-data log; P4, P5) with the raw captures `tour3.json`
(`scenarios[1]` = T2 silent stage, `scenarios[6]` = T7 invented volume, `scenarios[0]` = T1 card),
`tour3.log` (per-turn `ai-req` → `artifacts/T{1,2,7}-req-*.json`) and `wrongcommit.json`
(`modalText` showing `{"material":"DMEM","volumeUl":100}`). Binding rulings:
`decisions/CLARIFY-WEIRD-routing-l2t1915-ruling.md` Q2-item-2 (amendments (5) W7 and (6) W11-volume),
Q3 never-guess / no-two-local-terms, Q4 sequencing + probe-record rider.
Sibling boundary: `.hermes/plans/2026-11-01_1945-L2-CLARIFY-PICKER-1-spec.md` (ratified; read its
"Explicitly OUT of scope" and worker contract — this item lands ON TOP of that shape).

**Line cites below were verified first-hand at lane trunk tip `a544a2a5b1deb3dca6aa522bd9317a511e8d876a`**
(branch `cl/integration-2`; `git -c core.fileMode=false rev-parse HEAD`). PICKER-1 is NOT yet merged
at that tip (its composer is live, tip message "PICKER-1 composer live"): every PICKER-1-owned line
number below is the CURRENT shape and may move under the merge — re-verify, do not trust the number.

## Ground truth (verified pin table @ a544a2a5)

| Fact | Pin |
|---|---|
| Chat host renders ONE CARD PER REQUEST (the W6 two-card bug) | `app/src/agent/ChatLog.tsx:311` — `{message.clarificationRequests?.map((request) => renderTypedClarification(...))}`; each child is its own `<div className="chat-log-clarification">` with its own picker (`:222-246`) |
| Each pick fires its OWN turn | `ChatLog.tsx:243` `onPick={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}` → `app/src/agent/HarnessChatPane.tsx:373-375` `chat.sendPrompt(answerText, undefined, { clarificationAnswers: [answer] })` (a ONE-element array — the wire shape is already a batch) |
| Answered row (one per clarification message, keyed on "a following user message") | `ChatLog.tsx:74-76` `isClarificationAnswered`, rendered `:304-307` `Answered: {answerMessage?.content} — {clarificationQuestion(message)}`; question = `:79-81` (FIRST request's prompt) |
| Grouped-panel semantics to adopt (deck pane) | `app/src/event-editor/right-pane/protocol/ClarificationPanel.tsx:123-241`: ONE container `data-testid="pl-clarification-panel"` (`:147`), title "one panel for this drafting turn (N slots)" (`:150-152`), one `<section>` PER FACT (`:153-171`) with `request.slot` identity (`:158-169`) and the prompt once per slot, ONE picker per slot keyed by `request.id` (`:212-221`), answers ride the request's own identity (`onPick`, `:126-142`) |
| The panel's single Submit precedent | `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx:765-772` `data-testid="pl-submit-answers"`, `disabled={... allAxes.some((a) => !answers[a.axisId])}` — SUBMIT DISABLED UNTIL EVERY SLOT IS ANSWERED, never prefilled; the card pick accumulates into an answers map (`:418-433`) |
| Batch-answer channel ALREADY exists server-side (no server change needed for P4) | `server/src/ai/AgentOrchestrator.ts:1403-1500` — a `clarificationAnswers` ARRAY is folded in ONE turn, ZERO model calls, via `foldAnswersIntoShorthand(held, foldAnswers)` (`:1428`); `foldAnswersIntoShorthand` is list-based (`server/src/ai/shorthandChat.ts:968-1092`, `answered.size === 0 ⇒ null`) |
| Batch sentence builder (already exported, currently unused by the chat host) | `app/src/shared/hooks/clarificationAnswerPrompt.ts:28-41` `clarificationAnswersPrompt(answers, requests)` — `Use ${value} for ${target}.` joined with a space |
| Answer sentence builder (WIRE BYTE-STABLE — do not touch) | `clarificationAnswerPrompt.ts:18-25` `Use ${value} for ${target}.`; comment `:6-10` pins the sentence shape |
| Picker: placeholder copy | `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:390-396` — layer placeholder ?? `'Search materials or mint a local term…'` |
| Picker: mint legality | `ClarificationPicker.tsx:403-405` `canMint = resolver === resolveMaterial && (!materialLayer || materialLayer === 'material')` |
| Picker: `showMintRow` (the W9 disagreement) | `ClarificationPicker.tsx:427-432` — `canMint && allowCreateLocal === true && query.trim().length > 0 && !open && (options?.length ?? 0) === 0` |
| Picker: the mint CALL and its label source (W14) | `ClarificationPicker.tsx:438-468` `handleMintRow`; `:440` `const q = query.trim()`; `:447` `apiClient.mintLocalTerm('material', q, q)` — **the label IS the live filter box**, and `sourceQuery` is the same string |
| Picker: the label function (ONE source) | `app/src/shared/taptab/slashMenu/resolvers.ts:38-40` `mintLocalTermLabel(query) => 'Create local term "${query}"'`, shared by the resolver's mint floor and the card row (`ClarificationPicker.tsx:527`) |
| Mint endpoint: label → record name, idempotent, no concatenation | `server/src/api/handlers/VocabHandlers.ts:91-180`; `:97` `label = body.label.trim()`; `:119` `localMaterialIdForLabel(label)`; `:147-161` payload `name: label`, `status: 'proposed'`; response `{recordId, label, iri}` (`:174-179`) |
| Server-side tier-5 mint offer label (NOT this item's spelling) | `server/src/resolve/ResolveSpine.ts:271` `` `Create local term “${term}”` `` (curly quotes) matched by `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts:174` `MINT_OFFER_PREFIX = 'Create local term'` — leave BOTH byte-identical |
| Card request carries the prompt noun | `server/src/ai/shorthandChat.ts:902` `query: fact.label` in `clarificationsFromUnresolvedFacts` (`:857-917`) — `request.query` IS the prompt noun; `allowCreateLocal` `:887` |
| The deterministic bar (already exists, document-driven) | `server/src/compiler/resolution/resolveNounsPass.ts:555` `blocked = clarifications.length > 0` → `:564-573` `ok:false` + `UNRESOLVED_ARGUMENTS_CODE`; pipeline contract `schema/registry/compile-pipelines/scientist-intent-compile.yaml:17-25` ("unresolved arguments bar compilation") |
| The compile's atomic arm (bar ⇒ ZERO events) | `server/src/compiler/scientistIntent/compileScientistIntent.ts:350-370` (`barDiagnostic || producerClarifications` ⇒ `terminalArtifacts.events = []`, `outcome: 'needs-clarification'`) |
| The compile's consumption seam + the prompt slot | `compileScientistIntent.ts:372` `nounsOutput = result.outputs.get('resolve_nouns')`; `:314-326` `input.prompt = intent.sourcePrompt ?? ''`; `:430` `clarifications: nounsOutput?.clarifications ?? []`; outcome derive `:263-267` |
| The engine's bind/ambiguity policy is DATA | `schema/scientist-intent/scientist-intent-vocabulary.yaml:970-988` `policies.ambiguity.mode: clarify`, `confidenceAccept {min: 0.7, max: 1}`, `strategyRef: symbolic_label`; `add_material` contract at `:246-...` with `material` `kind: resolvable, domain: material, levels: [concept, formulation, vendor-product, instance], preferred: concept` |
| `volumeUl` is NOT required anywhere it matters (the W11 hole) | `schema/scientist-intent/scientist-intent-vocabulary.yaml:246+` `add_material.args.volumeUl = {kind: quantity, required: false}`; only THREE args in the whole file are `required: true` (`:547 targetWells`, `:742 factor`, `:745 points`) — the §5.2 sweep route is proven reachable on `targetWells` |
| The declared-absence marker contract (the `not-stated` sentinel) | `server/src/compiler/resolution/declaredOptionalHedgeFold.ts:34` `NOT_STATED_REASON = 'not-stated'`; `:40-54` `argumentPresent` treats a slot VALUE equal to the sentinel as DECLARED ABSENCE; fold guards `:84-107` — guard (3) `contract.required === true ⇒ KEEP` (a hedge on a REQUIRED arg is never folded) |
| The unresolved-fact wire contract (document-declared hedge) | `schema/workflow/scientist-intent.schema.yaml:295+` `unresolved: [{label, reason, actionLocation{actionIndex, action, argument}}]` |
| Shorthand parsing strips YAML quoting (kills the "quoted marker" reading) | `server/src/ai/shorthandChat.ts:526-538` `parseShorthandForChat` → `parseYaml(yamlText)` (`:529`) → `liftScientistIntent` → Ajv; a double-quoted scalar is the same string |
| EVIDENCE: the quoted form appears in the run where the CARD FIRED | `tour3.json scenarios[0].c.intentShorthand[0]` = `material: "DMEM"` + card; `scenarios[1]` (T2) = same quoted form, no card; the answered turn's re-serialization is unquoted (`material: DMEM`, `unresolved: []`) |
| EVIDENCE: the ONLY document diff T1→T2 is a sibling key | T1 `intentShorthand[0]` = `material/volumeUl/targetWells`; T2 = the same PLUS `labware: "plate1"` (`tour3.json scenarios[1]`) |
| EVIDENCE: invented volume | `scenarios[6]` (T7 "Add DMEM to A1") `volumeUl: 100` in the model's document, 0 cards, `1 event` staged; `wrongcommit.json` `modalText` `"volumeUl": 100` |
| PICKER-1 owns (do NOT touch) | `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` ROW RANKING/top-3/consequence line, `app/src/shared/taptab/slashMenu/*`, `schema/lab/material-profile.registry.yaml` `candidate_ranking`, `server/src/materials/MaterialProfileRegistry.ts`, `server/src/api/handlers/MaterialProfileHandlers.ts`, `ChatLog.tsx:304-307` answered-row SENTENCE rendering |

## In scope (exact paths)

- `app/src/agent/ChatClarificationCard.tsx` (NEW) — the grouped card for the chat host.
- `app/src/agent/ChatClarificationCard.mint.test.tsx` (NEW) — mint honesty/W7 red cases.
- `app/src/agent/ChatLog.tsx` — render the grouped card for `clarificationRequests.length > 1`;
  keep the single-request arm byte-identical; new optional prop `onClarificationSubmit`.
- `app/src/agent/ChatLog.grouped.card1.test.tsx` (NEW).
- `app/src/agent/HarnessChatPane.tsx` — wire the batch submit (`clarificationAnswers: answers`).
- `app/src/agent/ChatLog.css` — grouped-card chrome (reuse `pl-held-clarification-*` look; no new
  design language).
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — `mintAvailable` predicate, the mint
  row's own label field, the label handed to `mintLocalTerm`, copy derived from the same predicate.
- `app/src/event-editor/right-pane/ai/ClarificationPicker.mintrow.*` pins (copy updates only).
- `app/src/shared/taptab/slashMenu/resolvers.ts` — `mintLocalTermLabel` copy ONLY (one source; no
  ranking/comparator change — that file is PICKER-1's).
- `server/src/compiler/resolution/nounCoverage.ts` (NEW) — the slot-coverage gate predicate.
- `server/src/compiler/scientistIntent/compileScientistIntent.ts` — call the gate after `:372`.
- `server/src/compiler/resolution/nounCoverage.test.ts` (NEW) + a pin in
  `server/src/compiler/scientistIntent/` for the atomic arm.
- `schema/scientist-intent/scientist-intent-vocabulary.yaml` — ONE data line: `add_material.args.volumeUl.required: true`.
- `server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts` / `quantityWireContract.test.ts`
  — extend for the new required flag (these pin the contract block).

### ORCH AMENDMENT 1 (l2t1955, 2026-11-02) — `ai.css` is IN SCOPE (closes advc-c3 D5)

- `app/src/event-editor/right-pane/ai/ai.css` — the mint row's own declaration block. The advc-c3
  review flagged that the fix run edited this file while the in-scope list did not name it; the
  rules added are the `.message-log__clarification-mint*` selectors that already live in this
  stylesheet, and the file owns the picker's chrome. Ownership acknowledged by the orchestrator;
  no code change is required to close D5.

### ORCH RULING 2 (l2t1955) — single-request arm seed MAY change (supersedes "byte-identical" for that one expression)

The line above that keeps the single-request arm byte-identical governs the GROUPING work (it must
not be turned into the grouped card). It is NOT a bar to the browser-gate D-1/D-4 determinism fix:
advc-c3 D1 proves the single arm's `shownPrompts` seed (`new Set([message.content])`) still flips
the card hash with bubble wording on 9 of 10 gate draws. Changing ONLY that seed derivation to an
identity-derived seed is authorized; nothing else in the single arm may change.

## Explicitly OUT of scope

- **PICKER-1's merged surface**: row ranking/comparator/focus default, top-3 inline buttons,
  `schema/lab/material-profile.registry.yaml` (`candidate_ranking` AND the `clarification:` block),
  `server/src/materials/MaterialProfileRegistry.ts`, `server/src/api/handlers/MaterialProfileHandlers.ts`,
  and the answered-row SENTENCE rendering in `ChatLog.tsx:304-307` (PICKER-1 renders
  `Answered: DMEM (material record MAT-dmem-ykg0)`; CARD-1 only guarantees ONE such row).
  CARD-1 touches `ClarificationPicker.tsx` and `ChatLog.tsx` — ALLOWED, but every hunk lands on TOP
  of PICKER-1's merged shape (base tip ≥ the PICKER-1 merge commit), never in parallel with it.
- `server/src/ai/AgentOrchestrator.ts` — NO hunk unless OQ3 is approved (see Open Questions).
- `server/src/api/handlers/MaterialProfileHandlers.ts`, any registry YAML other than the
  scientist-intent vocabulary line above, `server/src/ai/shorthandChat.ts` fold logic (P4 needs no
  server change — verify, do not "improve" the fold).
- TARGET-1: the assumed-volume CHIP, the well-target slot, `ChangesPanel`/preview row rendering,
  the one-verb rule. CARD-1 owns ONLY the refuse-or-ask gate for a missing volume.
- `server/src/resolve/ResolveSpine.ts:271` (the tier-5 offer label) and
  `ProtocolLocalizationThread.clarificationAdapter.ts:174` (`MINT_OFFER_PREFIX`) — byte-identical.
- The agent-facing tool/prompt text (`server/src/ai/submitSuggestionTool.ts:635-640` and the
  shorthand drafting config): unchanged. Wire byte-stability is an acceptance gate.
- No new vocabulary: material record / material-spec formulation / instance / aliquot /
  vendor-product / Composition. "local term" survives ONLY inside the server wire label and
  `MINT_OFFER_PREFIX` (see Reviewer bait 6).

## Change 1 — P4: one card per sentence, one Submit, one answered row (chat host)

Design against the EXISTING deck-panel semantics (do not invent a second grouping model):

1. **One container.** When `message.clarificationRequests.length > 1`, `ChatLog` renders ONE
   `ChatClarificationCard` instead of the `.map(...)` at `ChatLog.tsx:311` (which stays for the
   single-request and legacy arms). The card is the chat-host analogue of
   `ClarificationPanel.tsx:144-241`: one bordered container, a title naming the slot count
   (`Answer the unresolved facts — {n} slot(s)`), one `<section>` per request.
2. **One slot per fact.** Each section renders, in this order: the slot identity when present
   (`request.slot`, the panel's `data-testid="pl-clarification-slot"` precedent at
   `ClarificationPanel.tsx:167-169`), the prompt ONCE (the panel's `:170`), then exactly ONE
   answer surface — `<ClarificationPicker key={request.id} request={request} onPick={(a)=>record(request,a)} />`
   when `requestHasPicker(request)` (`ClarificationPicker.tsx:46-48`), else the numbered options
   (mirroring `ChatLog.tsx:224-238`) or a text input (mirroring the panel's `ParameterAnswerInput`,
   `ClarificationPanel.tsx:225-233`). Keys are `request.id` — the same per-slot picker identity law
   the panel documents (`ClarificationPanel.tsx:38-40`, "the request.id query-reset law").
3. **One Submit.** A single `data-testid="chat-clarification-submit"` button, `disabled` until every
   slot has a pick — the `ProtocolLocalizationThread.tsx:765-772` rule. NO slot is ever prefilled
   (never-guess; the panel prefills nothing).
4. **One answer turn.** Submit calls the new optional
   `onClarificationSubmit(answerText, answers, requests)` where
   `answerText = clarificationAnswersPrompt(answers, requests)` (`clarificationAnswerPrompt.ts:28-41`,
   already exported and currently unused) and `answers: AiClarificationAnswer[]` preserves slot
   order. `HarnessChatPane.tsx:373-375` adds:
   `onClarificationSubmit={(text, answers) => chat.sendPrompt(text, undefined, { clarificationAnswers: answers })}`.
   The wire field is ALREADY an array; the server already folds the batch in one turn with zero model
   calls (`AgentOrchestrator.ts:1403-1500`). **No server change is permitted for this leg** — if the
   coder believes one is needed, stop and report.
5. **One answered row, free.** `isClarificationAnswered` (`ChatLog.tsx:74-76`) is "a following user
   message exists". One batch submit = one user message = one `Answered:` row with no predicate
   change. Assert it; do not re-render sentences (PICKER-1 owns that).
6. **Single-slot regression lock.** `requests.length === 1` keeps the current immediate one-click path
   (`onClarificationPick`) and renders NO Submit — 20+ pins (`ChatLog.test.tsx:131`
   `toHaveBeenCalledTimes(1)`, `ChatLog.answerChannel.test.tsx:66`,
   `ChatLog.bothfields.uifix1.test.tsx:105/138`) must stay green untouched.
7. **State.** `picks: Record<string, AiClarificationAnswer>` local to the card, reset by a
   `turnKey` prop (`message.id` + ordered request ids) — the panel's `turnKey` staleness argument
   (`ClarificationPanel.tsx:58-64`) applies verbatim: a new fold REPLACES the card.
8. **Never-guess.** A pick answers a slot; nothing auto-answers, nothing pre-selects a candidate, and
   Submit never fires for an unanswered slot.
9. **Single-open invariant.** The card must not mount any popover open; each picker keeps the module
   single-open store (`ClarificationPicker.tsx:50-97`) untouched. Grouping N pickers under one card
   must not regress the uifix2 stack-open pin (`ClarificationPicker.lifecycle.uifix2.test.tsx`).

## Change 2 — W9 copy/affordance agreement + P5/W14/W7 mint honesty

All three mints defects share ONE root: the row's label and the row's existence are computed from
the live filter box, while the honest sentence describes a durable write of the PROMPT's noun.

1. **One predicate drives existence AND copy (W9).** In `ClarificationPicker.tsx` replace the
   `query.trim().length > 0` arm of `showMintRow` (`:427-432`) with a named predicate
   `mintAvailable = canMint && request.allowCreateLocal === true && !open && (request.options?.length ?? 0) === 0 && mintLabelFor(request, query).length > 0`
   and derive the PLACEHOLDER from the same boolean:
   `mintAvailable ? 'Search materials or create a material record…' : 'Search materials…'`
   (material branch only; the `/l` and `/e` strings at `:392-395` are untouched). The empty-seed
   card of W9 (`request.query` absent — the "of what?" fact) therefore shows copy that promises
   search only, and shows no mint row. Copy and affordance cannot disagree again: they are one
   expression.
2. **The label is the prompt noun, not the filter (W14/P5).** Add
   `mintLabelFor(request, query) = (request.query ?? '').trim() || query.trim()` — the prompt noun
   (server-set at `shorthandChat.ts:902`), falling back to the user's typed text ONLY when the fact
   named no noun. Seed the mint row's own label state from it; RESET on `request.id` change (the
   same reset law as the query).
3. **The row previews the exact label and states the write (P5).** Replace the button at
   `ClarificationPicker.tsx:509-529` with a row (`data-testid="clarification-mint-row"`) that shows:
   an inline text input (`data-testid="clarification-mint-label"`, value = the label state, the ONLY
   edit surface — typing in the SEARCH box no longer changes what is minted), the one-source sentence
   `mintLocalTermLabel(labelState)`, and the create button. `mintLocalTermLabel` becomes
   `Create material record "<label>" in the lab (new record)` in
   `resolvers.ts:38-40` — ONE source, so the popover's mint floor row (`resolvers.ts` `mint:<q>`
   suggestion) and this row say the same thing. Update the copy pins that render the real function
   (at minimum `ClarificationPicker.mintrow.uifix2.fix2.test.tsx:92`, plus every
   `Create local term` assertion that is not a test-local stub: grep
   `git -c core.fileMode=false grep -n 'Create local term' -- app/src` and classify each hit).
4. **The call mints exactly the previewed label (W7).** `handleMintRow` calls
   `apiClient.mintLocalTerm('material', labelState.trim())` — one string, the same one the row
   renders. Drop the second positional `q` (provenance only; pass the filter as `sourceQuery` ONLY
   if a distinct value is wanted, never as the label). The red case is the concatenation shape
   observed at W7 (`[Local] 1 mM clofibrate1 mM Clofibrate in DMSO`, r3-14/19/24): seed + filter (or
   filter + seed) must never be joined into a stored name — the assertion is on the ARGUMENT
   (`mintLocalTerm` called with the seed; never with `${seed}${query}` or
   `${query}${seed}`) plus the preview string equality.
5. **The answered row names the new record id (P5).** After a successful mint the answer carries
   `ref {kind:'record', type:'material', id: res.recordId}` (`ClarificationPicker.tsx:448-453`,
   already true) and the host's answer sentence is
   `Use [[material:<id>|<label>]] for material.` (byte-stable builder). The id therefore reaches the
   transcript through PICKER-1's answered-row rendering. Assert the harness-visible outcome: the
   answered row's text contains the new `recordId`. **Do not** re-render the sentence here.
6. **Failure stays honest.** A mint error leaves the row in place and fabricates nothing (today's
   `catch` at `:461-463` — keep).

## Change 3 — the deterministic gate (W12 material + W11-volume)

Placement rule: **the gate lives where the COMPILER consumes the document, and it decides from
DATA**. Client code is never the authority (W12's whole finding: 5 asks / 1 silent stage on
identical fresh threads is model nondeterminism — a client fix cannot make it 10/10).

### 3a. The material gate: no symbolic noun may reach the event graph unresolved

Two arms, both server-side, neither a new channel nor a new vocabulary:

- **A1 — atomicity pin (already true; PIN it, do not re-implement).**
  `compileScientistIntent.ts:350-370` already returns `outcome: 'needs-clarification'` with
  `terminalArtifacts.events === []` whenever `resolve_nouns` barred. Add a regression test that
  compiles a document whose material slot bars and asserts `outcome`, `events: []`, and the
  clarification's `actionLocation`. This is the contract `shorthandResultFromCompile`
  (`shorthandChat.ts:1450-1500`) relies on to emit `events: []` + cards.
- **A2 — slot coverage (NEW, the missing invariant).**
  `server/src/compiler/resolution/nounCoverage.ts` exports a PURE
  `unboundDeclaredSlots(intent, vocabulary, resolveNounsOutput)`:
  for every action index and every declared arg contract with
  `kind === 'resolvable' | 'wells'` whose slot value is PRESENT (the `argumentPresent` shape,
  `declaredOptionalHedgeFold.ts:49-54`), require a `ResolveNounsOutput.bindings` entry with the same
  `(actionIndex, argument)` identity (the `identityKey` idiom, `resolveNounsPass.ts:154-166`).
  Returns the leftover slot identities. `compileScientistIntent.ts` calls it immediately after
  `:372` and, when non-empty, takes the SAME atomic arm as the bar (`:352-370`) with one synthesized
  `ScientistIntentUnresolvedFact` per leftover slot (`reason` = the engine's OWN stable
  `'unknown-noun'` code, `actionLocation` from the contract, `label` = the raw slot value).
  Why this is the right invariant: the engine silently SKIPS a slot whose value is not a string
  (`resolutionEngine.ts:505-509` door) and silent-skips arrays without the declared cardinality, so
  a document can carry a material that was never resolved, was never asked about, and still compiles
  to a `complete` outcome with an event carrying a bare label (the W12 class; the staged event's
  `material` is a LABEL string, verified in `wrongcommit.json` `modalText`). A2 converts every such
  drop into the same bar. Zero verb/argument/domain literals; it reads declared contracts + the
  pass's own output.
- **A3 — the 10/10 instrument is the acceptance, not a unit test.** 10 fresh threads, one prompt
  ("Add 100 ul of DMEM"), assert every draw ∈ {exactly one clarification card, an explicit compile
  refusal} and NEVER a staged proposal. Run by `cl-prompt-scout` (or `cl-browser-reviewer`) against
  live `:5193` from a committed driver (`receipts/.../card1-draws.cjs`), WRITING one JSON per draw
  plus screenshots — never by vitest (a DRAW is a live model run; vitest cannot see it).
- **Honest limit, must be in the report:** a deterministic gate cannot make the MODEL ask. It makes
  the server refuse to stage anything it cannot prove resolved. That is exactly the acceptance's
  "card or refusal" disjunction.

### 3b. The volume gate: never stage an invented number

- **V1 — declared-required (DATA, deterministic, ships first).** Set
  `add_material.args.volumeUl.required: true` in
  `schema/scientist-intent/scientist-intent-vocabulary.yaml` (today `required: false`, contract at
  `:246+`; the required route is proven reachable by `targetWells` at `:547` and by
  `resolveNounsPass.requiredArgumentClarifications` `:259-284`). Effects, both already-coded:
  (i) a document that OMITS the volume produces a `missing-required-argument` clarification → card;
  (ii) a model that HEDGES (`volumeUl: not-stated`, the declared-absence sentinel,
  `declaredOptionalHedgeFold.ts:34/50`) is no longer folded into silence, because guard (3)
  (`:98`, `contract.required === true ⇒ KEEP`) keeps the hedge answerable.
  Scope note: only `add_material` is flipped; `seed`/`transfer`/`dispense` keep `required: false`
  (disclosed in the report; TARGET-1's chip generalizes).
- **V2 — prompt-attributable quantity (needs OQ3; do NOT start it before the ruling).**
  A document's quantity value that the PROMPT never stated is an invented value. The check is a pure
  cross-check against the server's own prompt using the EXISTING deterministic extractors
  (`server/src/compiler/precompile/ParameterGrammar.ts` `extractVolumes`, per
  `DeterministicPrecompilePass.ts:22-27/361-371`): if the prompt yields NO volume for an action and
  the document declares one, bar on the same atomic arm with the existing `not-stated` reason code.
  This is a structural gate (no verb/unit literals in TS); it is deliberately conservative — it
  fires only when the prompt is silent, never to re-derive a stated number.
  **It needs the real prompt, which the compile does not currently receive** (it reads
  `intent.sourcePrompt`, model-authored — `compileScientistIntent.ts:314-315`). See OQ3.

## RED-first test plan

Server (vitest, `cd server`):

1. `src/compiler/resolution/nounCoverage.test.ts` (NEW, RED first):
   - a declared `material` slot whose value is a non-string object ⇒ `unboundDeclaredSlots` returns
     that `(actionIndex, argument)`; a bound slot returns nothing;
   - a document with a model `unresolved` hedge on a `required: true` volume slot keeps the fact
     (fold guard 3) — the W11 honesty arm;
   - end-to-end pin: `compileScientistIntent` on a two-slot document whose material is a bar ⇒
     `outcome === 'needs-clarification'`, `terminalArtifacts.events` length 0.
2. `src/compiler/scientistIntent/quantityWireContract.test.ts` (+ the vocabulary contract block
   test): `add_material.volumeUl.required === true`; every other verb's `volumeUl` unchanged;
   `requiredArgumentClarifications` raises exactly one fact for an omitted `add_material` volume
   with `reason === 'missing-required-argument'` and a filled `actionLocation`.
3. Golden/normalize regression: run the existing `src/compiler/scientistIntent` suite — any golden
   that legitimately omits a volume on `add_material` will now bar. Expected changes are LIMITED to
   goldens whose action is `add_material` with no `volumeUl`; list them in the report with a
   one-line justification each. A golden that changes for any other reason is a defect.

App (vitest, `cd app`):

4. `src/agent/ChatLog.grouped.card1.test.tsx` (NEW, RED first): a message with TWO
   `clarificationRequests` (the clofibrate+solvent shape, `tour3.json scenarios[2]`'s two-noun
   sibling = `scenarios[3]`'s two cards) renders ONE `[data-testid="chat-clarification-card"]` with
   TWO slot sections and ONE `chat-clarification-submit`; the submit is disabled until both slots are
   picked; picking both and submitting calls `onClarificationSubmit` ONCE with a 2-element array and
   a sentence equal to `clarificationAnswersPrompt(answers, requests)`; `onClarificationPick` is NOT
   called. Plus: `requests.length === 1` renders no submit and keeps the single-pick path
   (regression lock).
5. `src/agent/ChatLog.grouped.card1.test.tsx` answered-row arm: after the batch turn, EXACTLY ONE
   `chat-log-clarification-answered` row exists (count assertion, not textContent).
6. `src/agent/ChatClarificationCard.mint.test.tsx` (NEW):
   - **W7 red case**: `request.query = '1 mM Clofibrate in DMSO'`, user types `1 mM clofibrate` in
     the SEARCH box, clicks create ⇒ `apiClient.mintLocalTerm` is called with
     `('material', '1 mM Clofibrate in DMSO')` and NEVER with `'1 mM clofibrate1 mM Clofibrate in DMSO'`,
     `'1 mM Clofibrate in DMSO1 mM clofibrate'`, or the bare filter text; the row's rendered label
     string EQUALS the argument (single-source equality assertion).
   - **W14 seed rule**: typing in the search box does not change the minted label; editing the mint
     label input DOES, and the preview follows before the click.
   - **W9 copy/affordance agreement, both directions**: (a) seed-less request + empty query ⇒ no
     mint row AND the placeholder does not match `/mint|create a material record/i`; (b) seed present
     ⇒ the row exists whenever the placeholder promises it. Assert the placeholder text and the row
     presence from the SAME fixture pair so drift is impossible.
   - **Answered row names the id**: after mint, the answered row text contains the returned
     `recordId`.
7. `ClarificationPicker.mintrow.uifix2.fix2.test.tsx` + `.lifecycle` + `.searchReplace` — copy pins
   updated to the new `mintLocalTermLabel` sentence; behaviour untouched (the mint row still hides
   while the popover is open, still hides when server options exist).

## First targeted check (run before building anything else)

```
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run src/agent/ChatLog.test.tsx src/agent/ChatLog.grouped.card1.test.tsx
```

`ChatLog.grouped.card1.test.tsx` fails today (two cards, two answered rows, no submit) and passes
only when Change 1 lands; `ChatLog.test.tsx` proves the single-slot contract did not move. This one
command decides whether the whole P4 approach is sound — it is also the lowest-risk leg, so it goes
first.

## Verification commands (exact invocations + expected output)

App tests (all green; the three files marked BASELINE currently fail for pre-existing reasons and
must fail IDENTICALLY after the change):

```
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run \
  src/agent/ChatLog.test.tsx \
  src/agent/ChatLog.answerChannel.test.tsx \
  src/agent/ChatLog.bothfields.uifix1.test.tsx \
  src/agent/ChatLog.d3chrome.uifix3.test.tsx \
  src/agent/ChatLog.grouped.card1.test.tsx \
  src/agent/ChatClarificationCard.mint.test.tsx \
  src/agent/HarnessChatPane.test.tsx \
  src/agent/HarnessChatPane.clarificationEnds.regatefix2.test.tsx \
  src/event-editor/right-pane/ai/ClarificationPicker.test.tsx \
  src/event-editor/right-pane/ai/ClarificationPicker.mintrow.uifix2.fix2.test.tsx \
  src/event-editor/right-pane/ai/ClarificationPicker.lifecycle.uifix2.test.tsx \
  src/event-editor/right-pane/ai/ClarificationPicker.searchReplace.uifix3.test.tsx
```
BASELINE (pre-existing at a544a2a5, do not "fix"): `src/event-editor/right-pane/protocol/ClarificationPanel.test.tsx`
has ONE pre-existing failure — test "4. mint absent below formulation: an all-aliquot slot has NO
mint affordance…" (`ClarificationPanel.test.tsx:190` `waitFor(materialCtx.length > 0)`, 8 pass / 1
fail). Any NEW failure there is the coder's.

Server tests (all green):

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run \
  src/compiler/resolution src/compiler/scientistIntent \
  src/ai/shorthandChat.foldNullArms.test.ts src/ai/shorthandChat.nounShape.test.ts \
  src/ai/shorthandChat.readingCard.test.ts src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts \
  src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts \
  src/api/handlers/VocabHandlers.mint.test.ts
```

Typecheck, zero-new baselines measured first-hand at a544a2a5:

- `cd server && npx tsc --noEmit` → **0 errors today**; must stay 0 (server is
  `exactOptionalPropertyTypes: true`).
- `cd app && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | sort` → **10 pre-existing errors
  today**, all outside this item's files:
  `src/event-editor/EventEditorContext.tsx`, `deck/LawnSurface.moveAcross.test.tsx`,
  `deck/PreviewActionBar.test.tsx`, `editorHistory.test.ts` (x2),
  `focus/LabwareFocus.instrument.test.tsx`, `viewer/Viewer.tsx`, `viewer/ViewerToolbar.tsx`,
  `ingestion/components/IngestionUploadModal.tsx`,
  `ingestion/protocol-review/ExtractionProgressPanel.test.tsx`.
  Compare with `diff <(sort baseline.txt) <(cd app && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | sort)`
  → EMPTY. (Baseline list also saved at `/tmp/app-tsc-base-a544a2a5.txt` on this host.)
- Grep assertions:
  `git -c core.fileMode=false grep -n "mintLocalTerm('material', q" -- app` → empty;
  `git -c core.fileMode=false grep -n "Create local term" -- app/src app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts`
  → only the adapter's `MINT_OFFER_PREFIX` and the server-facing golden/label paths remain.
- **YAML reload trap**: the vocabulary YAML change needs a lane-2 stack RESTART (`tsx --watch` does
  NOT reload YAML, per the lane env fact). Restart, then health-check `:3093`, before any live claim.

## Browser gate (verified-by, verbatim from the task list, ROUND-TRIP-GATE-1)

> Live :5193: clofibrate-in-DMSO prompt -> ONE card, two slots, one Submit, turn settles with one
> Answered row (screenshots); mint row names the noun from the prompt and states the write;
> unit/fixture: silent-stage red-case — identical prompt with unresolved quoted noun either produces
> the card or a compile refusal, never a staged proposal (10 fresh-thread draws, 10/10
> deterministic, receipts).

Operating notes for the gate driver: real backend, ZERO interception of `/api/ai/**`; every changed
surface needs a request-body artifact PAIRED with a rendered-answer screenshot; "mounted DOM" alone
is not evidence. The 10-draw leg is run by `cl-prompt-scout` (or `cl-browser-reviewer`), one fresh
thread per draw, `startMsgs=0`, same 4-well selection as the recon (`A2,A3,B2,B3`).

## Worker contract

- Worktree `wt/L2-CLARIFY-CARD-1-lane2-l2t<tick>` off trunk `cl/integration-2`; branch
  `cl/lane2-clarifycard-1-l2t<tick>`.
- **Base tip must be ≥ the PICKER-1 MERGE commit** (not merely `a544a2a5`, which predates it).
  Before claiming, run
  `git -c core.fileMode=false merge-base --is-ancestor <picker1-merge-sha> HEAD && echo OK`
  and put the output in the report. If PICKER-1 is not merged when the slot frees, the item WAITS —
  do not develop against the pre-merge shape and rebase later (the panel/answered-row/row-rendering
  hunks would conflict semantically, not textually).
- One worker. NO hunks under `server/src/ai/` unless OQ3 is approved; NO hunks in
  `MaterialProfileHandlers.ts`, `MaterialProfileRegistry.ts`, or
  `schema/lab/material-profile.registry.yaml`.
- Deliverable/report: `.hermes/plans/L2-CLARIFY-CARD-1-report.wip-l2t<tick>.md` (unique per tick; the
  orchestrator promotes). Must contain the base-tip proof, the typecheck diffs, the golden-change
  list, the draw receipts index, and any OQ that blocked a leg.
- Commit sequence: RED tests → Change 1 (grouped card) → Change 2 (mint honesty) → Change 3a
  (coverage gate + required flag) → green. Do not commit Change 3b without OQ3.

## Reviewer bait (pre-empt these; the adversarial gate WILL look)

1. **exactOptionalPropertyTypes (SERVER-strict)** — every new optional on a server type must be
   conditionally spread (`...(x !== undefined ? { x } : {})`), never `x: undefined`. New synthesized
   `ScientistIntentUnresolvedFact`s must include `actionLocation` only when fully known. The app is
   NOT eOPT-strict: do not "harmonize" app optionals to `| undefined`.
2. **Wire byte-stability** — `clarificationAnswerPrompt.ts:18-25` sentence shape and
   `submitSuggestionTool.ts:635-640` tool text unchanged. Any diff touching those strings is a defect
   flag. The batch path ADDS a caller, it does not change the builder.
3. **Two local terms for one entity** — the visible mint sentence becomes
   `Create material record "<label>" in the lab (new record)`; do NOT also introduce "local term",
   "draft term", "concept", "recipe", "mixture" anywhere new. The ONLY surviving "local term" strings
   are the SERVER wire label `ResolveSpine.ts:271` and `MINT_OFFER_PREFIX`
   (`clarificationAdapter.ts:174`) — both are payload parsers, never rendered, and both are
   explicitly out of scope. Do not "unify" them; changing them breaks goldens and the dead-end
   drop rule.
4. **Silent-stage counterexample** — the reviewer will construct a document whose material slot the
   engine silently skips (non-string value, or an array on a non-`many` contract) and check that it
   can no longer compile `complete`. That is A2's whole purpose: show the failing test.
5. **Single-Submit regressions of the deck-host panel** — `ClarificationPanel` is the DECK host and
   is NOT edited; its pre-existing failing test (test 4) must stay exactly as red as it is now.
   Touching that file is out of scope.
6. **`satisfies` / narrowing traps** — `resolveNounsOutput` is read as
   `result.outputs.get('resolve_nouns')` (`compileScientistIntent.ts:372`); keep it `| undefined` and
   treat `undefined` as "no proof of binding" (bar), never as "nothing to check" (that would be the
   silent-stage hole again).
7. **Data-vs-code boundary** — the gate ALGORITHM may be TS; the POLICY may not. No verb names, no
   argument-name tables, no unit strings, no reason strings beyond the stable codes already exported
   (`UNRESOLVED_ARGUMENTS_CODE`, `MISSING_REQUIRED_ARGUMENT_REASON`, `NOT_STATED_REASON`). The
   volume requirement is a YAML flag, not a TS `if`.
8. **Required-flag blast radius** — flipping `add_material.volumeUl.required` changes outcomes for
   every prompt that adds material without a volume. Enumerate the goldens it flips; a flip outside
   `add_material`-without-volume is a regression. Re-run `PROMPT1-REGATE-1`'s journey mentally:
   "Add 100 ul of DMEM" states a volume, so the regate's own legs are unaffected — say so in the
   report.
9. **Copy/affordance drift** — the placeholder and the mint row must be derived from ONE boolean in
   one expression. A second `query.length > 0` check anywhere is the W9 bug returning.
10. **YAML reload trap** — server tests green against a stale backend prove nothing; restart before
    the live claim.
11. **Draw rigor** — 10 draws means 10 receipt directories with a per-draw JSON (`outcome`,
    `cards`, `mintRows`, `previewBar`, `stagedEvents`), not 10 screenshots and a claim. A draw that
    produced a proposal is a FAIL even if 9 cards fired.

## Open questions for the orchestrator

1. **The "quoted material" marker does not exist as a machine contract — the ruling's phrasing
   needs a ruling-of-record.** The task text and the ruling call `material: "DMEM"` "the unresolved
   marker". Verified first-hand: `parseShorthandForChat` (`shorthandChat.ts:526-538`) runs
   `parseYaml` and strips quoting, and `git grep -n 'unresolved' server/src schema` shows no
   quote-based marker anywhere; the SAME double-quoted form appears in the run where the card DID
   fire (`tour3.json scenarios[0].intentShorthand[0]`) and the answered turn re-serializes the same
   noun unquoted. The executable marker contract is: the document's `unresolved: [...]` array
   (`schema/workflow/scientist-intent.schema.yaml:295`), the slot VALUE sentinel `not-stated`
   (`declaredOptionalHedgeFold.ts:34,50`), and the engine's `resolve_nouns` bar
   (`resolveNounsPass.ts:555-573`). RECOMMENDATION: adopt that as the marker of record (the spec
   above does) and drop "quoted" from later cycle language so nobody codes a quote check.
   Checked: `shorthandChat.ts` parse/lift path, the three W12 captures, `schema/` + `server/src`
   greps for quote handling, the fold leaf.

2. **The T1/T2 divergence is NOT explained by the captured documents — root-cause before the gate is
   shaped.** T1 (card) and T2 (silent, 4 events staged) ran the same prompt with documents whose ONLY
   difference is a sibling key: T2 additionally carries `labware: "plate1"` (`tour3.json`
   `scenarios[0]` vs `scenarios[1]` `intentShorthand[0]`). The compile is a pure function of the
   document (`resolutionEngine.ts:467-518` walks actions × declared contracts; nothing reads a
   sibling key to resolve a material), and the shipped ambiguity policy is `clarify`
   (`scientist-intent-vocabulary.yaml:977-982`), so the material slot should have barred in BOTH
   runs. Either (a) something outside the document shifted (spine search result set, deck-binding
   interaction), or (b) the captured shorthand is not the document that was compiled. RECOMMENDATION:
   the coder's FIRST action on this leg is a replay of the two captured documents through
   `compileScientistIntent` against the lane store (a fixture test), and only after that the gate is
   wired; if the replay is identical for both documents, the 10-draw instrument is the authority and
   the report must say so with the divergence diff. Checked: the receipt artifacts (`T1-req-02`,
   `T2-req-02`, `tour3.log`, `tour3.json`), `resolutionEngine.ts`, `strategies.ts`,
   `resolveNounsPass.ts`, `compileScientistIntent.ts`, the vocabulary policy block, and the
   `t2/settled` outcome.

3. **V2 (invented volume) needs the SERVER's prompt inside the compile — that is one hunk in
   `AgentOrchestrator.ts` (the GHOST-1 hot file).** `compileScientistIntent` only sees
   `intent.sourcePrompt` (`:314-315`), which is model-authored, so a provenance check built on it is
   circular. The real prompt lives at `AgentOrchestrator.ts:1269-1270` (`effectivePrompt`) and reaches
   the compile via `compileShorthandDeterministically(...)` at `:3005-3040` and/or
   `shorthandResultFromCompile(...)` at `:3083-3092`. RECOMMENDATION (a): approve ONE hunk — add
   `deps.prompt` to `ShorthandCompileDeps`/`compileScientistIntent` and pass `effectivePrompt` at
   `:3005`, with the orchestrator serializing it against GHOST-1; (b) if the hot file must stay
   untouched this cycle, ship V1 only (declared-required) and let TARGET-1's assumed chip carry the
   invented-number case — V1 alone already converts "no volume ⇒ silent stage" into "card", which is
   the acceptance disjunction. Do NOT let the coder invent a third option. Checked:
   `compileScientistIntent.ts:300-330`, `shorthandChat.ts:490-511/1429-1500`,
   `AgentOrchestrator.ts:1269-1270/1403-1500/3005-3040/3083-3092`, and the
   `ParameterGrammar` extractors' availability.

DRAFT COMPLETE

---

## Orch OQ rulings (l2t2310, 2026-11-01T23:35 EDT — binding for the coder)

**OQ1 RULED APPROVED.** The marker of record is the machine contract: the document's
`unresolved: [...]` array, the `not-stated` slot-value sentinel, and the `resolve_nouns` bar
(resolveNounsPass.ts:555 — orch-verified first-hand at trunk). "Quoted material" language is
DEAD: no quote check may be coded anywhere.

**OQ2 RULED APPROVED as recommended.** First action on the gate leg = fixture replay of the two
captured documents (T1-req-02 / T2-req-02 shorthand docs) through compileScientistIntent against
the lane store; the outcome diff goes in the report; then wire the gate. If both documents replay
identically, state that the 10-draw browser instrument is the authority on the nondeterminism.

**OQ3 RULED: APPROVE OPTION (a) — the ONE AgentOrchestrator hunk.** Grounds: GHOST-1 merged to
trunk 15bf5f7e at 22:0x and its browser gate closed — the hot-file serialization condition the
option carried is satisfied (CARD-1's base will be ≥ the PICKER-1 merge, which is ≥ 15bf5f7e).
V1-only does NOT satisfy ruling amendment (6): an INVENTED volumeUl satisfies a required-flag bar,
so the T7 silent-stage path survives without provenance-in-the-compile. Scope is exactly one hunk:
`deps.prompt` (name per existing deps conventions) threaded to `compileScientistIntent` at
AgentOrchestrator.ts:3005 carrying `effectivePrompt`; the V2 arm's outcome is the SAME
refuse-or-ask bar as V1 (missing provenance for a quantity arg ⇒ the fact enters clarifications,
card fires), never a hard-fail and never a silent drop. Wire byte-stability pins must stay green.
If the single hunk grows beyond that shape, STOP and end with BLOCKED, do not improvise.

**Sequencing (orch, binding):** dispatch only after L2-CLARIFY-PICKER-1 merges to trunk; base tip
≥ that merge. PICKER-1 owns the row rendering; CARD-1's hunks land on top, never in parallel.

## Orch audit note (l2t2310)
Pin table spot-verified first-hand at trunk ec5a9a97 before promotion: ChatLog.tsx:311 map,
ClarificationPanel.tsx:147/:150-152 panel title, resolveNounsPass.ts:555 bar,
scientist-intent-vocabulary.yaml volumeUl required:false (:31-33), ClarificationPicker.tsx:440/:447
mint-from-live-query, clarificationAnswerPrompt.ts:24/:28 sentence + batch builders. Composer
claims not re-verified by orch are the coder's own gate duties, not accepted evidence.

### ORCH AMENDMENT 2 (l2t2110, 2026-11-02) — the card OWNS its prompts; bubble suppression must be derived from what actually RENDERS

Closes advc-c4 D2 (authorization gap) and scopes fix run 3.

1. RULING 2's "identity-derived seed" wording is SUPERSEDED. An identity-derived seed still flips the
   card's visible prompts between the first-ask and repeat-ask wordings (advc-c4 measured it), because
   card membership is by prompt STRING, not by slot identity. The authorized shape is the one fix run 2
   shipped: `shownPrompts` / `groupedShownPrompts` start EMPTY and the card prints every prompt it owns,
   exactly once, independent of the bubble's wording. The card, not the bubble, owns its prompts.
2. `app/src/agent/ChatLog.test.tsx` is IN SCOPE: the browser-gate D3 pin's DOM owner moved from the
   bubble `<p>` to the card, so the pin necessarily changes in that file.
3. The bubble-side `<p>` may be suppressed ONLY for a request the card actually renders a prompt for.
   Authorization for the suppression is ack'd, with that predicate as its condition (see fix run 3 D1).
4. STILL OUT OF SCOPE, unchanged: the deferred 3b volume gate's own semantics and any new
   parameter-input UI. A request the card cannot render keeps base behaviour (the bubble prints the
   question once) until the item that owns that surface lands.
