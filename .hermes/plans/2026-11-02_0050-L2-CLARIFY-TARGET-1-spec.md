# L2-CLARIFY-TARGET-1 — spec (RATIFIED by orch l2t0015 2026-11-02T00:50; OQ rulings in the appendix below; pins at 504d22bb — coder re-pins at its own base tip)

Goal: turn the two invisible assumptions of a clarification answer into facts the scientist
approves — an editable, data-declared `volume: 100 uL (assumed)` chip and a well-target slot on the
card when the run host carries no selection — and make the last screen before a plate write readable
(`A2 ← 100 uL DMEM (MAT-dmem-ykg0)`, one verb), inside the EXISTING review surface.

Evidence base: `~/.hermes/cl/receipts/CLARIFY-WEIRD-20261101/20261101_174042/report.md`
(P6, P7, W11, W13; §2 byte-captured proposal body; `hosts.json` + `artifacts/HV-req-02.json`).
Binding rulings: `decisions/CLARIFY-WEIRD-routing-l2t1915-ruling.md` Q2 item 3 (ratified as filed),
Q3 D1 guardrail + never-guess, Q4 sequencing (TARGET-1 is THIRD, after CARD-1).
Sibling boundaries (read first; this item lands ON TOP of both merged shapes):
`.hermes/plans/2026-11-01_1945-L2-CLARIFY-PICKER-1-spec.md` (row rendering, `candidate_ranking`) and
`.hermes/plans/2026-11-01_2330-L2-CLARIFY-CARD-1-spec.md` (grouped card, mint honesty, refuse-or-ask
gate for missing volume).

**Every cite below was verified first-hand at lane-2 trunk tip
`504d22bbfffd5890dd788f48340db617792c7977` (branch `cl/integration-2`,
`git -c core.fileMode=false rev-parse HEAD`, 2026-11-02). At that tip NEITHER PICKER-1 NOR CARD-1 is
merged (PICKER-1 merge expected `b2a17eed7718e499712d8d9becfa6f5662cea0dc`). Every app line number in
this spec is therefore the PRE-MERGE shape and may move; the coder re-verifies each cite at its own
base tip and records the re-verified numbers in the report. No cite here is a substitute for that.**

## Ground truth (verified pin table @ 504d22bb)

| Fact | Pin |
|---|---|
| Lane tip / branch | `504d22bb` on `cl/integration-2`; log head "l2t2310 — GHOST-1 DONE … PICKER-1 resume run live slot-0; CARD-1 spec ratified+promoted" |
| **The invented `100` has NO TypeScript default.** The expander derives `volumeUl` only from declared params (`volume_uL`, `volume_ul`, numeric `volume`, `material.volume_uL`) | `server/src/compiler/biology/verbs/simpleVerbs.ts:544-567` (`const volumeUl =` :544, `resolvedVolumeUl` :572, `volumeDetails` :578). No `?? 100`, no `DEFAULT_VOLUME` anywhere (`grep -rn "volumeUl ??\|?? 100\|DEFAULT_VOLUME" server/src app/src` → no volume default) |
| **The real origin of `100` is the frozen prompt example the model copies** — the tool description's `shorthand` example carries `volumeUl: 100` AND `targetWells: [A1]` | `server/src/ai/submitSuggestionTool.ts:635-647`, example lines `:643-646` (`'    volumeUl: 100\n'` :645, `'    targetWells: [A1]\n'` :646). Same example duplicated in the two repair prompts: `server/src/ai/shorthandChat.ts:1345` and `:1378` |
| That example text is agent-facing and byte-frozen for this item | CARD-1 spec, "Explicitly OUT of scope" (tool/prompt text unchanged); this spec forbids editing those three string sites |
| `add_material` declares **NO wells argument at all** — no `targetWells`, no `wells` (source/target/labware are `resolvable(labware)`), so no sweep can ever ask for a target | `schema/scientist-intent/scientist-intent-vocabulary.yaml:246-291` (args end at `composition` :286) |
| `add_material.volumeUl` is declared `required: false` today (CARD-1 flips it to `true`) | same file `:280-282` |
| The `required: true` route on a `kind: wells` arg is proven reachable (`aliquot`) | same file `:545-547` (`targetWells`, kind `wells`, `required: true`) with the comment at `:542-544` |
| The required-argument sweep is DATA-driven (loops `argContracts(verb)`, skips `kind: scalar`, emits `MISSING_REQUIRED_ARGUMENT_REASON` + `actionLocation`) | `server/src/compiler/resolution/resolveNounsPass.ts:259-283` |
| `targetWells` accepts an address ARRAY **or** a scalar **string** on the wire | `schema/workflow/scientist-intent.schema.yaml:107-113` |
| `volumeUl` is `type: number` on the wire (an object-form volume rides the separate `volume: {}` slot at `:167`) | `schema/workflow/scientist-intent.schema.yaml:167-168` |
| The answer fold splices ONLY string / array slots and returns `null` otherwise; an answer is REQUIRED to carry `label` | `server/src/ai/shorthandChat.ts:968-1093` (splice decision `:1017-1032`, `answered.size === 0 ⇒ null` `:1064`) — **today a quantity slot can never be answered** (slot is a number or absent ⇒ `null`) |
| The card request builder already resolves the declared contract per fact and maps `domain → kind` | `server/src/ai/shorthandChat.ts:857-917` (`domain` lookup `:876-878`, `kind` `:879`, request object `:893-916`) |
| The per-call drafting-config loader idiom to mirror (absent section ⇒ off, malformed ⇒ throw naming the path) | `server/src/compiler/resolution/nounShape.ts:29` (path), `:52-110` (`loadNounShape`), consumed per call at `shorthandChat.ts:869` |
| The drafting-config home where the new data section goes | `config/drafting/shorthand-drafting.yaml` — `surfaces:` :27, `nounShape:` :49 |
| Server clarification request / answer wire types | `server/src/ai/types.ts:584-618` (`AgentClarificationRequest`, incl. `unresolvedFact` :617) and `:621-628` (`AgentClarificationAnswer` with free-form `ref`) |
| App mirror types | `app/src/types/ai.ts:270-288` (`AiClarificationRequest`) and `:290-297` (`AiClarificationAnswer`) |
| Answer sentence builder, byte-stable shape `Use ${value} for ${target}.` | `app/src/shared/hooks/clarificationAnswerPrompt.ts:18-25` (single) and `:28-41` (batch) |
| The record id of an answered material is carried in the answer's MENTION TOKEN in the transcript (`[[material:<id>|<label>]]`) and parseable by the existing parser | `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:176` (token shape); `app/src/shared/lib/aiPromptMentions.ts:4` (pattern), `:106-108` (`parsePromptMentions`) |
| **P7 surface**: the pane's proposed-changes list — title `Proposed deck changes` (:114), rows map :141-171, per-row toggle label `Drop`/`Include` (:167), bar verbs `Apply` (:183) / `Discard` (:192), the declarative detail descriptor :51-95 | `app/src/agent/ChatPreviewCard.tsx` |
| The deck-side twins (OUT of scope, must not be edited) | `app/src/event-editor/deck/PreviewActionBar.tsx:149-176` (`Discard` / `View changes` / `Accept`), `app/src/event-editor/right-pane/ai/ChangesPanel.tsx:99-111` rows + `:124-142` actions |
| The run host DOES carry a deck selection when one exists (`context.selectedWells = {labwareId, wells}`) and the server renders it into the model prompt | `app/src/run/RunSurfaceChatBridge.tsx:51-62`; `server/src/ai/systemPrompt.ts:70-86` + `:665-673` |
| Evidence that the no-selection turn is the broken one: the run-host request body carries `"selectedWells": null` (the deck host's turn carried `targetWells`) | `artifacts/HV-req-02.json` (`body.context.selectedWells === null`), `artifacts/T6-req-03.json` (deck host: `targetWells: [A2,A3,B2,B3]`) |
| `contractBlock()` renders `name?` for `required: false` — a vocabulary data edit IS a prompt-text edit | `server/src/compiler/scientistIntent/vocabulary.ts:375-393` (map at `:380`) |
| The chat host renders ONE element per request (CARD-1 replaces this for n>1; TARGET-1 inserts into CARD-1's card, never here) | `app/src/agent/ChatLog.tsx:311` |
| Typecheck baselines measured first-hand at 504d22bb | `cd server && npx tsc --noEmit` → **0 errors**; `cd app && npx tsc --noEmit` → **10 pre-existing errors** (list saved `/tmp/app-tsc-base-504d22bb.txt`: `LawnSurface.moveAcross.test.tsx`, `PreviewActionBar.test.tsx`, `editorHistory.test.ts` ×2, `EventEditorContext.tsx`, `LabwareFocus.instrument.test.tsx`, `ViewerToolbar.tsx`, `Viewer.tsx`, `IngestionUploadModal.tsx`, `ExtractionProgressPanel.test.tsx`) |

## In scope (exact paths)

- `config/drafting/shorthand-drafting.yaml` — ONE new `assumedValues:` section (the assumed-value
  policy DATA; value, unit, label, question wording, source).
- `server/src/compiler/resolution/assumedQuantities.ts` (NEW) — per-call loader + lookup, mirroring
  `nounShape.ts` (absent ⇒ empty, malformed ⇒ throw naming the path).
- `server/src/compiler/resolution/assumedQuantities.test.ts` (NEW) — loader + data⇄vocabulary lint.
- `server/src/ai/shorthandChat.ts` — two contained hunks:
  (a) `clarificationsFromUnresolvedFacts` (:857-917): stamp `clarifyControl` for declared
  `quantity`/`wells` facts from DATA;
  (b) `foldAnswersIntoShorthand` (:968-1093): the declared-kind splice arm for `quantity` and `wells`
  slots (today unreachable — see pin).
- `server/src/ai/shorthandChat.assumedValue.target1.test.ts` (NEW) and
  `server/src/ai/shorthandChat.wellTarget.target1.test.ts` (NEW).
- `server/src/ai/types.ts` — ONE additive optional field on `AgentClarificationRequest` (:584-618).
- `app/src/types/ai.ts` — the mirror field on `AiClarificationRequest` (:270-288).
- `app/src/agent/ClarifyAssumedChip.tsx` (NEW) — the editable assumed-value chip.
- `app/src/agent/ClarifyWellTargetSlot.tsx` (NEW) — the target slot.
- `app/src/agent/proposalRowFacts.ts` (NEW) — the declarative row-fact formatter for P7.
- `app/src/agent/ChatPreviewCard.tsx` — rows use `proposalRowFacts` + the bar's verb (P7).
- `app/src/shared/context/WellSelectionContext.tsx` — ONE additive export
  `useOptionalWellSelection()` (null-safe sibling of `useWellSelection`, `:190+`), for the optional
  "use selected wells" affordance. No behavior change to the existing hook.
- Tests: `app/src/agent/ClarifyAssumedChip.test.tsx` (NEW),
  `app/src/agent/ClarifyWellTargetSlot.test.tsx` (NEW),
  `app/src/agent/proposalRowFacts.test.ts` (NEW),
  `app/src/agent/ChatPreviewCard.rowFact.target1.test.tsx` (NEW),
  `app/src/agent/ChatClarificationCard.target1.test.tsx` (NEW, lands on CARD-1's card).

## Explicitly OUT of scope

- **CARD-1's merged surface**: `app/src/agent/ChatClarificationCard.tsx`'s grouping / Submit /
  answered-row logic, the mint row, `ChatLog.tsx`'s render decision, `HarnessChatPane.tsx`'s batch
  submit. TARGET-1 inserts TWO components at CARD-1's existing per-slot control seam and touches
  nothing else in that card. `base tip ≥ CARD-1 merge` is mandatory.
- **PICKER-1's merged surface**: `ClarificationPicker.tsx` row ranking/top-3/consequence line,
  `app/src/shared/taptab/slashMenu/*`, `schema/lab/material-profile.registry.yaml`
  (`candidate_ranking` AND the `clarification:` block), `MaterialProfileRegistry.ts`,
  `MaterialProfileHandlers.ts`.
- **CARD-1's legs**: the W12 material gate, the W11 refuse-or-ask bar, the one-AgentOrchestrator-hunk
  provenance check, `add_material.volumeUl.required` flipping. TARGET-1 consumes that bar; it does
  not build it.
- **The search prompt example strings** `submitSuggestionTool.ts:635-647`,
  `shorthandChat.ts:1345`, `:1378` — byte-frozen (only the GENERATED `contractBlock` may move, via
  ratified DATA; see OQ1).
- **The deck-side review surfaces**: `PreviewActionBar.tsx`, `ChangesPanel.tsx`,
  `ProposedGraphModal.tsx`. D1: the P7 enrichment is the pane list only; no second rail.
- `server/src/ai/AgentOrchestrator.ts` — zero hunks. If the coder believes one is needed, STOP and
  report BLOCKED.
- Any new vocabulary: material record / material-spec formulation / instance / aliquot /
  vendor-product / Composition only. No "dose", "amount", "target volume" as new local terms.

## Change 1 — the assumed value is DATA (the number stops being a prompt artifact)

New section in `config/drafting/shorthand-drafting.yaml` (append after `nounShape:`; same file, same
per-call loader discipline, no new YAML file):

```yaml
# L2-CLARIFY-TARGET-1: the ASSUMED-VALUE policy. When the scientist's prompt states no quantity for
# a declared quantity argument, the card offers THIS value as a visible assumption the scientist
# approves or edits. Nothing is staged on an assumption. `source` is shown on the chip (title/
# aria) — the value is never bare. `question` is the slot's wording (wording is data too, the
# material-profile registration's own doctrine); placeholders: {label} {value} {unit} {verb}.
assumedValues:
  quantities:
    - verb: add_material
      argument: volumeUl
      label: volume
      value: 100
      unit: uL
      source: 'shorthand drafting example (server/src/ai/submitSuggestionTool.ts:645)'
      question: 'How much {label}? The prompt states none — {value} {unit} is assumed; approve it or enter the amount.'
```

`assumedQuantities.ts` contract:
- `loadAssumedQuantities(path = <config file>)`: per call, never cached (the `nounShape.ts:52`
  discipline). Absent file/section ⇒ `[]`. Present-but-malformed ⇒ throw naming the path and the
  offending entry.
- Shape validation only (verb/argument non-empty strings, `value` a finite number > 0, `unit` and
  `source` non-empty, `question` containing `{value}` and `{unit}`).
- `assumedQuantityFor(verb, argument, entries)`: exact (verb, argument) join; no fallback, no
  per-domain default. **Absent declaration ⇒ no assumption is offered anywhere** (the chip does not
  render; the question stays a plain question). Never synthesize 100 in TS.
- **Lint (in `assumedQuantities.test.ts`):** every declared `(verb, argument)` MUST be an
  `argContracts(verb)` entry with `kind === 'quantity'` — a declaration for a non-existent or
  non-quantity slot is a defect that throws the test. Also: the declared `value`/`unit` MUST equal
  the numbers in the frozen example at `submitSuggestionTool.ts:645`; if someone edits the example,
  this test fails and forces a conscious data edit. Zero verb/argument/unit literals in the loader.

## Change 2 — the chip on the card (P6/W11), editable and never a silent default

Wire addition (ONE field, additive, eOPT-safe conditional spread — key ABSENT when undeclared):

```ts
// server/src/ai/types.ts AgentClarificationRequest  and  app/src/types/ai.ts AiClarificationRequest
clarifyControl?:
  | { kind: 'quantity'; label: string; value: number; unit: string; source: string; question: string }
  | { kind: 'wells' }
```

Stamped in `clarificationsFromUnresolvedFacts` (`shorthandChat.ts:857-917`) — it already resolves the
declared contract for the fact's `actionLocation` (see the `domain` lookup at `:876-878`). Rules,
all from declared DATA / declared KIND, zero verb-argument literals:

1. Resolve `contract = vocabulary.argContracts(loc.action).find(c => c.name === loc.argument)`.
2. `contract.kind === 'quantity'` AND `assumedQuantityFor(loc.action, loc.argument)` exists ⇒
   `clarifyControl: {kind:'quantity', ...entry}` and `prompt = entry.question` rendered with
   `{label}{value}{unit}{verb}`. The noun template at `:890-892` is NOT used for this arm (it would
   say `The draft names "volumeUl"…`).
3. `contract.kind === 'wells'` ⇒ `clarifyControl: {kind:'wells'}`; prompt = the declared slot's
   question wording. Add an `assumedValues.wells` entry with the same `question:` template mechanism
   (e.g. `question: 'Which wells? Name a range (A2:B3) or pick wells on the deck.'`) so no copy is
   invented in TS. `menuProvider` stays `'choice'`, `options: []`.
4. Both arms set `entityType` to the declared argument name (`volumeUl` / `targetWells`) so the
   answer sentence reads `Use 100 uL for volumeUl.` / `Use A2:B3 for targetWells.` — the sentence
   SHAPE (`clarificationAnswerPrompt.ts:18-25`) is untouched; only the `target` token differs, and
   only for request families that did not exist before.
5. Every other fact (nouns, readings, model asks) keeps today's request byte-for-byte. A fact with
   no declaration gets NO `clarifyControl` key.

App chip `ClarifyAssumedChip.tsx` (rendered only when `request.clarifyControl?.kind === 'quantity'`;
chosen by THAT field alone — the app holds no policy):
- Renders: the slot label, a numeric `<input data-testid="clarify-assumed-value">` seeded with
  `value`, the unit, a `(assumed)` badge, and the data `source` as `title` + `data-source`.
- **Never a silent default (never-guess):** the slot starts UNANSWERED. Typing in the input, or
  pressing `data-testid="clarify-assumed-approve"` labelled `Use {value} {unit}`, marks the slot
  answered with
  `{requestId, label: '<n> <unit>', value: String(n), ref: {kind:'quantity', value:n, unit}}`.
  Until then CARD-1's Submit stays disabled — the scientist approved a visible assumption, exactly
  as the panel refuses to prefill (`ProtocolLocalizationThread.tsx:765-772` rule, cited by CARD-1).
- Editing to `250` then approving sends 250 (the APPROVED number, never the assumed one). Clearing
  the input disables approve (no empty answer). Rejecting the assumed value is out of scope: the
  scientist types the real number.
- The chip states the assumption ONCE per slot — no extra card, no second Submit.

## Change 3 — the fold can accept a declared quantity/wells answer (today it cannot)

`foldAnswersIntoShorthand` (`shorthandChat.ts:968-1093`) currently resolves a slot only when its
value is a string or an array (`:1017-1032`) and returns `null` for a numeric or ABSENT slot — so a
card answer for `volumeUl` (numeric or missing) and for an absent `targetWells` cannot fold at all.
Without this leg the chip's approval has nowhere to go. ONE arm, keyed on the DECLARED kind:

```
contract = vocabulary.argContracts(loc.action).find(c => c.name === loc.argument)
if (contract?.kind === 'quantity' | 'wells') { ...declared-kind splice... ; continue }
```

- `quantity`: value from `answer.ref` `{kind:'quantity', value:number, unit:string}` (preferred),
  else parse `answer.label` with the existing quantity parser (never an ad-hoc regex). Require
  `unit === assumedQuantityFor(...).unit` (the declaration's own unit — no `'uL'` literal); on any
  mismatch return `null` (never guess, the fold's existing contract). Write the NUMBER into
  `action[loc.argument]` (the schema types `volumeUl` as number, `:167-168`).
- `wells`: expand `answer.label` with the ONE parser `expandWellTokens`
  (`server/src/ai/wellRange.ts:38`) and write the ARRAY into `action[loc.argument]`. A range STRING
  in a declared `kind: wells` slot is a symbolic well LABEL to the engine (SPINE-7) and would bar
  again — never write the string.
- Both arms: `answered.add(fact)`, `answeredSlots.push({actionIndex, argument, label})`, remove the
  answered fact from `doc.unresolved` exactly as the existing arms do. No record bindings are
  recorded (`ref` carries no `id`).
- **Provenance exemption (the loop hazard).** CARD-1's V2 bars a document whose quantity the prompt
  never stated. An APPROVED assumed value is still a value the prompt never stated, so a naive V2
  re-bars it forever (card → answer → card). The fold's answered slot is the proof that the
  SCIENTIST stated it; CARD-1's arm must consult `answeredSlots`/the answered-slot channel
  (`resolveNounsPass.ts:117-123` is that channel) before barring. See OQ2 — this is the single
  highest-risk interaction in the item and it is a pin, not a hope: the RED test in Change 3 must
  prove **answer-once-then-settle**.

## Change 4 — the target slot when no wells are selected (P6 run-host half)

DATA first: add to `add_material`'s args in
`schema/scientist-intent/scientist-intent-vocabulary.yaml` (after `composition`, `:286-291`):

```yaml
      - name: targetWells
        kind: wells
        required: true
```

The §5.2 sweep (`resolveNounsPass.ts:259-283`) then emits ONE `missing-required-argument` fact for a
document that adds material with no target — the compile bars atomically (CARD-1's A1 atomic arm),
the card fires, and the target slot renders. No new server predicate, no verb name, no arg name in
TS. The `aliquot` precedent (`:545-547`) is the exact same declaration.

App `ClarifyWellTargetSlot.tsx` (rendered when `request.clarifyControl?.kind === 'wells'`):
- A text input `data-testid="clarify-well-target"` with placeholder `A2:B3` (range or comma list).
- Validation is LOCAL and syntactic only (non-empty, matches the address/range grammar the client
  already uses for plate coordinates); invalid text disables the approve affordance. No resolution,
  no guessing, no auto-fill.
- Approve sends `{requestId, label: 'A2:B3', value: 'A2:B3', ref: {kind:'wells', wells:[...]}}`;
  the server expands authoritatively (`expandWellTokens`) — the client's list is a hint, the server's
  expansion is the truth.
- Optional affordance: when `useOptionalWellSelection()` returns a non-empty selection, render a
  `Use selected wells (A2, A3, B2, B3)` button that fills the input. It fills, it does not answer —
  one more explicit act before Submit. When the context is absent the button simply does not render.
- Same slot rules: unanswered until approve; one Control per slot.

**Honest limit, disclose in the report:** a model that INVENTS a `targetWells` value the prompt never
mentioned is not caught by this leg (the declaration only catches the ABSENT case). Extending CARD-1's
prompt-provenance arm to `kind: wells` is named as the follow-up, not built here.

## Change 5 — P7: readable rows, one verb, inside the existing surface (D1)

`ChatPreviewCard.tsx` only. D1 GUARDRAIL (binding): this is the EXISTING proposed-changes list; it
must NOT become a second approval surface — no new rail, no new checkbox, no new write path. The
per-row toggle keeps calling `chat.setPreviewEventState(event.eventId, …)` (`:165`) — the same
applied-or-not state the bar's Apply honours. Nothing else is added.

1. New `proposalRowFacts.ts`: `proposalRowFact(event, recordIds)` returns the checkable fact
   `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` from the event's OWN `details`, declaratively (the
   `eventDetailLine` doctrine at `:51-95`, extended):
   - well(s): `details.well` (string) else `details.wells` (array) → `A2` / `A2, A3, B2, B3`;
   - volume: `details.volumeUl` else `details.volume` (number ⇒ `n uL`; `{value,unit}` verbatim);
   - material: `details.material` when a string;
   - record id: `recordIds.get(materialLabel)` — **only when present; ABSENT otherwise, never
     invented**;
   - no recognised field ⇒ `null` (the caller keeps today's `eventLabel` line; dead chrome is not
     added).
2. `recordIds` at render time: `useMemo` over `chat.messages` — take the LAST user message (the
   answer sentence of the turn that produced the preview) and run the EXISTING
   `parsePromptMentions` (`aiPromptMentions.ts:106`); keep `type === 'material' && id` keyed by the
   mention `label`. No new grammar, no server field, no re-search. A label mismatch (e.g. the answer
   said `DMEM` but the bound row is `DMEM + FBS`) yields no id — correct, and the reviewer will check
   exactly this.
3. Row action verb: ONE module constant in the component for the proposal's reject verb
   (`Discard`, the bar's own word at `:192`); the row button renders it when pending and `Restore`
   when dropped, with `aria-label` = `${verb} ${fact}` so two identically-worded controls are still
   distinguishable. `chat-preview-toggle-${eventId}` testid unchanged (pinned by
   `HarnessChatPane.test.tsx:177`).
4. The four `add_material` rows of W13 become four DISTINCT strings (well + volume + material), which
   is the whole finding: `A2 ← 100 uL DMEM + FBS`, `A3 ← 100 uL DMEM + FBS`, …

## RED-first unit test plan

Server (`cd server`, vitest):
1. `src/compiler/resolution/assumedQuantities.test.ts` (NEW, RED): the loader returns the declared
   `(add_material, volumeUl)` entry; absent section ⇒ `[]`; malformed entry throws naming the path;
   data⇄vocabulary lint (declared slot is `kind: quantity`; value/unit equal the frozen example).
2. `src/ai/shorthandChat.assumedValue.target1.test.ts` (NEW, RED):
   - a `missing-required-argument` volumeUl fact and a `not-stated` volumeUl fact both produce a
     request with `clarifyControl = {kind:'quantity', value:100, unit:'uL', …}` and the DATA
     `question` (not the noun template);
   - a fact whose slot has NO declaration emits NO `clarifyControl` key (`'clarifyControl' in req`
     is false — the eOPT pin);
   - fold: doc `{volumeUl: 100}` + answer `{label:'250 uL', ref:{kind:'quantity', value:250,
     unit:'uL'}}` ⇒ re-parsed doc `volumeUl === 250` (number), fact removed;
   - fold: unit `mL` ⇒ `null`; no declaration for the arg ⇒ `null` (unchanged behaviour);
   - **loop pin:** approving the ASSUMED value (100) recompiles to `complete` with the event carrying
     `volumeUl: 100` and **no** clarification on the re-ask (this is the CARD-1 V2 exemption; if it
     is absent at the base, this test is the RED that drives OQ2).
3. `src/ai/shorthandChat.wellTarget.target1.test.ts` (NEW, RED): a doc with `add_material` and no
   `targetWells` yields exactly one fact `{argument:'targetWells', reason:'missing-required-argument'}`
   and the compile outcome is `needs-clarification` with `events: []`; a doc carrying
   `targetWells: [A1]` yields none; the fold turns answer `{label:'A2:B3'}` into
   `targetWells: ['A2','A3','B2','B3']` (array, expanded).
4. `src/compiler/scientistIntent/vocabularyContractBlock.test.ts` (extend): the generated
   `add_material` line is EXACTLY `- add_material — source?:resolvable(labware), …, volumeUl:quantity,
   volume?:quantity, composition?:resolvable(material), targetWells:wells` (record the real string
   verbatim; do not paraphrase).

App (`cd app`, vitest):
5. `src/agent/ClarifyAssumedChip.test.tsx` (NEW, RED): renders value/unit/badge/`data-source`;
   approve disabled-clean on empty input; approve at 100 emits
   `{label:'100 uL', value:'100', ref:{kind:'quantity', value:100, unit:'uL'}}`; edit-to-250 emits
   250; NO callback fires before interaction.
6. `src/agent/ClarifyWellTargetSlot.test.tsx` (NEW, RED): placeholder `A2:B3`; invalid text disables
   approve; approve emits the label + `ref.wells`; no selection context ⇒ no "Use selected wells"
   button; with a selection ⇒ the button fills the input but does NOT answer.
7. `src/agent/proposalRowFacts.test.ts` (NEW, RED): `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` for
   `{well:'A2', material:'DMEM', volumeUl:100}` + a matching id; id omitted when the map lacks the
   label; `volume:{value:100,unit:'uL'}` renders identically; an incubate event renders `null`.
8. `src/agent/ChatPreviewCard.rowFact.target1.test.tsx` (NEW, RED): four add_material events render
   four DISTINCT rows; row button text === the bar's reject verb; `aria-label` names the fact; the
   toggle still calls `setPreviewEventState` with the same `eventId` and NO other callback (D1 pin);
   a message with no material mention renders no `(…)` suffix anywhere.
9. `src/agent/ChatClarificationCard.target1.test.tsx` (NEW, RED, on CARD-1's card): a two-slot
   message (material + quantity) renders exactly one chip; Submit stays disabled until the chip is
   approved AND the material slot is picked; the batch sentence contains `100 uL`.

## First targeted check (run before building anything else)

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/compiler/resolution/assumedQuantities.test.ts src/ai/shorthandChat.assumedValue.target1.test.ts
```

It fails today for the right reason (no loader; quantity answers return `null` from the fold) and it
proves the two load-bearing facts of the whole item — the data is the number's only home, and an
approved number can re-enter the document. If the fold RED cannot be made green without touching
`AgentOrchestrator.ts`, stop and report BLOCKED rather than improvising.

## Verification commands (exact invocations, expected output)

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run \
  src/compiler/resolution src/compiler/scientistIntent \
  src/ai/shorthandChat.assumedValue.target1.test.ts \
  src/ai/shorthandChat.wellTarget.target1.test.ts \
  src/ai/shorthandChat.foldNullArms.test.ts src/ai/shorthandChat.nounShape.test.ts \
  src/ai/shorthandChat.readingCard.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts
```
All green.

```
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run \
  src/agent/ClarifyAssumedChip.test.tsx src/agent/ClarifyWellTargetSlot.test.tsx \
  src/agent/proposalRowFacts.test.ts src/agent/ChatPreviewCard.rowFact.target1.test.tsx \
  src/agent/ChatClarificationCard.target1.test.tsx \
  src/agent/ChatPreviewCard.regatefix2.test.tsx src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx \
  src/agent/ChatPreviewCard.incubateDetails.uifix3.test.tsx src/agent/ChatPreviewCard.errorWall.regatefix2.test.tsx \
  src/agent/ChatLog.test.tsx src/agent/HarnessChatPane.test.tsx
```
All green.

Typecheck (baselines measured first-hand at 504d22bb; RE-MEASURE at the actual base — the PICKER-1 and
CARD-1 merges move the app count, and the report must state the base numbers it measured):

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx tsc --noEmit      # 0 errors at 504d22bb; must stay 0
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | sort
# 10 pre-existing at 504d22bb; diff against the base list must be EMPTY
```

Data/code boundary greps (each must be empty unless stated):
```
git -c core.fileMode=false grep -n "100" -- server/src/compiler/resolution/assumedQuantities.ts server/src/ai/shorthandChat.ts | grep -v "^.*test"
git -c core.fileMode=false grep -n "volumeUl\|targetWells" -- server/src/compiler/resolution/assumedQuantities.ts
```
The first may legitimately show the frozen example lines already in `shorthandChat.ts` — no NEW hit in
the loader or in the changed hunks. The second must be empty (the loader never names an argument).

**YAML reload trap:** `config/drafting/*.yaml` is loaded per call, but the live stack still needs a
restart for a clean claim; restart and health-check `:3093` before any browser claim.

## Browser gate (verified-by, verbatim from the task list, ROUND-TRIP-GATE-1)

> Live :5193: 'Add DMEM to A1' (no volume) -> assumed-volume chip visible + editable, and
> accept carries the approved number (body + shot); no-selection run-host turn -> target
> slot, not silent no-target events; proposal rows name well+volume+material+record id
> (shot); one verb everywhere.

Driver notes: real backend, ZERO interception of `/api/ai/**`; every changed surface needs a
request-body artifact PAIRED with a rendered-answer screenshot. The no-selection turn must be driven
with `context.selectedWells: null` (the `HV-req-02.json` shape) AND a control turn WITH a selection
that must produce NO wells card (regression: the Prompt-1 regate journey).

## Worker contract

- Worktree `wt/L2-CLARIFY-TARGET-1-lane2-l2t<tick>` off trunk `cl/integration-2`; branch
  `cl/lane2-clarifytarget-1-l2t<tick>`.
- **Base tip must be ≥ the CARD-1 MERGE commit, which is itself ≥ the PICKER-1 merge commit.** Proof
  in the report: `git -c core.fileMode=false merge-base --is-ancestor <card1-merge-sha> HEAD && echo OK`.
  If CARD-1 is not merged when the slot frees, the item WAITS — do not develop against the pre-merge
  card. Re-verify every app line number in this spec at that tip and list the deltas in the report.
- One worker. NO hunks in `AgentOrchestrator.ts`; NO hunks in `ClarificationPicker.tsx`,
  `slashMenu/*`, `material-profile.registry.yaml`, `ChangesPanel.tsx`, `PreviewActionBar.tsx`.
- Deliverable/report: `.hermes/plans/L2-CLARIFY-TARGET-1-report.wip-l2t<tick>.md` (unique per tick;
  the orchestrator promotes). Must contain: base-tip proof, re-verified line deltas, typecheck diffs
  against the base, the contract-block before/after lines, the golden-change list (Change 4's
  blast radius), and any OQ that blocked a leg.
- Commit sequence: RED tests → Change 1 (data) → Change 2 (stamp + chip) → Change 3 (fold) →
  Change 4 (target slot) → Change 5 (rows) → green.

## Reviewer bait (pre-empt these; the adversarial gate WILL look)

1. **Invented-number counterexample.** Construct a doc with `volumeUl: 250` for a prompt that states
   no volume. The chip must show **100 uL (assumed)** — the DATA value — never 250, and nothing may
   stage. If the chip can ever display the model's number, the leg is wrong. Second variant: prompt
   states `250 uL` → there is NO chip at all (no assumption to approve).
2. **Chip-not-editable / pristine prefill.** If Submit is enabled before the scientist touches the
   chip, the assumption became a silent default — the exact W11 defect wearing new chrome. The RED
   test asserts "no answer before interaction".
3. **Second approval surface (D1).** The rows are the existing list; the toggle is the existing
   `setPreviewEventState`. A new checkbox, a new accept button per row, a new panel, or a per-row
   write call is a D1 violation. The test pins "same callback, same eventId, nothing else".
4. **Data-vs-code drift.** No `100`, `'uL'`, `'volumeUl'`, `'targetWells'` literal in the new TS
   loader or in the stamping arm; no fallback when the declaration is absent. Grep-clean is a gate.
5. **exactOptionalPropertyTypes (SERVER-strict).** `clarifyControl` rides only via conditional
   spread; a request with no declaration must have the key ABSENT (`'clarifyControl' in req`), never
   `undefined`. The app is not eOPT-strict — do not "harmonize" app optionals.
6. **The loop.** Approve the assumed 100 → recompile → must settle complete. If CARD-1's V2 re-bars
   it, the journey is an infinite card and the whole item fails. The loop pin is mandatory, and the
   exemption must ride the EXISTING answered-slot channel, not a new field on the document.
7. **Range string in a declared wells slot.** Writing `"A2:B3"` into a declared `kind: wells`
   argument makes the engine treat it as a symbolic LABEL (SPINE-7) and bar again. The fold must
   write an expanded ARRAY.
8. **Contract-block delta.** Adding `targetWells` (and CARD-1's `required` flip) changes the
   GENERATED block that the model reads (`vocabulary.ts:380`). This is a deliberate, data-driven
   delta — enumerate the exact before/after line and do NOT hand-edit any prompt string.
9. **P7 string invention.** `(MAT-dmem-ykg0)` must come from the transcript's mention token. A row
   that prints an id it did not receive (or a re-searched id) is fabrication. Also: the id must NOT
   appear when the label doesn't match.
10. **YAML reload trap / stale backend.** Green unit tests against a stale process prove nothing.
11. **Golden blast radius of Change 4.** Every `add_material` document with no wells now bars.
    Enumerate the flipped goldens/fixtures with one line each; a flip outside that class is a
    regression. The Prompt-1 regate journey ("Add 100 ul of DMEM" with a 4-well selection) must be
    proven unaffected in the report.

## Open questions for the orchestrator

1. **The generated contract block is agent-facing text; Change 4 changes it.** Adding
   `targetWells:wells` to `add_material`'s args (and CARD-1's `required` flip) changes
   `defaultScientistIntentVocabulary().contractBlock()` — the block quoted in
   `submitSuggestionTool.ts:647`, `AgentOrchestrator.ts:596` and both repair prompts. The hard
   constraint says "agent-facing prompt text unchanged", yet no data route can ask a target question
   without declaring the argument. **Recommendation:** APPROVE the DELTA as a data-driven block
   change (no hand-edited prompt string), require the exact before/after line in the report, and
   treat any other prompt-string diff as a defect. **Checked:** `vocabulary.ts:375-393` (renders
   `name?` from `required`), the three embed sites, CARD-1's own precedent (its `required` flip has
   the same property), and the alternative (a synthesized bar on an undeclared slot) which would put
   an argument-name invariant into TS — refused as a second policy home.

2. **Who owns the provenance exemption that keeps an APPROVED assumed value from re-barring?**
   CARD-1's V2 bars a document whose quantity the prompt never stated; an approved assumption is
   still such a value. **Recommendation:** the exemption belongs at CARD-1's own seam and rides the
   EXISTING answered-slot channel (`resolveNounsPass.ts:117-123`), implemented as: an action slot
   this turn's answers explicitly filled is prompt-attributable. TARGET-1 lands after CARD-1 and
   should implement it there ONLY if CARD-1's merged shape lacks it, as ONE hunk, with the loop pin
   as its RED test; if the change grows past that (a new document field, an orchestrator hunk), STOP
   and report BLOCKED. **Checked:** the fold's `answeredSlots` return (`shorthandChat.ts:971`,
   `:1053-1057`), `resolveNounsPass.ts:117-123` (`answeredSlots?: AnsweredNounAnswer[]`), CARD-1's
   V2 prose at its spec §3b, and the T7 capture (invented 100 with no card) that motivates the bar.

3. **P7's record id has no server-side source today.** Verified: `add_material` events carry the
   material as a LABEL string (`simpleVerbs.ts:600-640`), and `shorthandResultFromCompile` ships no
   material binding map (`shorthandChat.ts:1590-1600`, `ScientistIntentCompileResult` at
   `compileScientistIntent.ts:132-140` carries no `outputs`). The only id available to the renderer is
   the answer turn's mention token in the transcript. **Recommendation:** ship the transcript-token
   route (no server change, no new wire field, honest "no id when the label doesn't match"), and let
   the browser gate decide whether it is sufficient; if the gate shows a legitimately-answered row
   without an id, the fallback is an ADDITIVE `resolvedMaterialRefs: [{label, recordId}]` on the done
   payload sourced from `resolve_nouns.resolvedByLabel` — a separate, reviewed hunk, not this item's
   default. **Checked:** `aiPromptMentions.ts:4/:106`, `ClarificationPicker.tsx:176`, the fold's
   `bindings` (`shorthandChat.ts:1053-1057`), `ResolveNounsOutput` (`resolveNounsPass.ts:140-147`),
   `TerminalArtifacts` (`CompileContracts.ts:298+`).

DRAFT COMPLETE

## ORCH RATIFICATION APPENDIX (l2t0015, 2026-11-02T00:50 EDT — binding for the coder)

Pin spot-verification (orch first-hand at 504d22bb): submitSuggestionTool.ts:645 + shorthandChat.ts:1345/:1378 carry the frozen `volumeUl: 100` example (grep-verified); NO `?? 100`/DEFAULT_VOLUME volume default exists in the compiler (grep-verified); ChatPreviewCard.tsx:112/:114/:167 `Proposed deck changes` + Drop/Include verified; trunk tip confirmed 504d22bb.

OQ1 RULED — APPROVED (data-driven contract-block delta). Declaring `targetWells` on add_material necessarily changes the GENERATED contractBlock; that is data doing its job. The byte-freeze applies to hand-edited prompt STRINGS: any diff to submitSuggestionTool.ts:635-647 / shorthandChat.ts:1345/:1378 or any other prompt-string site is a DEFECT. The report must include the exact before/after generated contract line. CARD-1's `required` flip sets the precedent.

OQ2 RULED — APPROVED as recommended. The provenance exemption lives at CARD-1's seam riding the existing answered-slot channel (resolveNounsPass.ts:117-123): an action slot THIS turn's answers explicitly filled is prompt-attributable. TARGET-1 implements it ONLY if CARD-1's merged shape lacks it — ONE hunk, RED test = answer-once-then-settle. Any growth past one hunk (new document field, orchestrator hunk) => STOP, report BLOCKED.

OQ3 RULED — APPROVED as recommended: transcript mention-token route, no server change, no new wire field; honest no-id rendering when the label does not match. The additive `resolvedMaterialRefs` fallback is a SEPARATE reviewed hunk, only on browser-gate evidence that a legitimately-answered row lacks its id.

SEQUENCING (restated): base tip >= CARD-1 merge (CARD-1 not yet dispatched — TARGET-1 stays behind it). Re-pin every cite at the actual base tip before building; the draft's pins are at 504d22bb, pre-PICKER-1-merge.

---
## AMENDMENT l2t0920 — W11 volume refuse-or-ask gate folded in VERBATIM (architect ruling decisions/CARD1-W11-volume-boundary-l2t0747-ruling.md, Q1)

The ruling defers CARD-1 change 3b (W11 volume gate, V1+V2, as a unit) to TARGET-1.
TARGET-1's acceptance criteria carry, verbatim in substance, routing amendment (6)
(CLARIFY-WEIRD-routing-l2t1915-ruling.md:75-79): "a prompt naming no volume must fire a
card or refuse, per L2-CLARIFY-TARGET-1's data-declared assumed-value chip — never
silently stage an invented number." TARGET-1's gate must show, on the live surface:
  (i) V1 leg — a document omitting add_material volume produces a
      missing-required-argument card (the required-flag flip, YAML not TS);
  (ii) V2 leg — the T7 shape ("Add DMEM to A1", no volume in the prompt) yields a card
      or the declared assumed-value chip — never a silent staged volumeUl: 100 (the
      frozen-example copying origin, submitSuggestionTool.ts:635-647, stays frozen);
  (iii) the foldNullArms.test.ts:516 expectation updated as part of the flip's declared
      blast radius, plus the golden enumeration.
`add_material.volumeUl.required` is false on trunk as a fact of record at CARD-1 merge;
the flip lands HERE. TARGET-1 owns the ENTIRE W11 volume gate (V1 + V2 + the chip).
