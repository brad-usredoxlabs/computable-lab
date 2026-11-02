# L2-CLARIFY-TARGET-1 — spec RE-PIN (base tip `4a65d4c1`, lane 2 trunk `cl/integration-2`)

Status: DRAFT for orchestrator audit. Canonical path NOT touched
(`.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md` stays as ratified).
This file re-pins every code cite in the ratified spec against the CURRENT trunk tip and
adapts the change-text where the CARD-1 merge changed the shape it builds on.

Ratified source: `.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md`, read IN FULL
(518 lines on disk). Intent, acceptance criteria and the OQ1/OQ2/OQ3 + ratification appendix
are carried VERBATIM below — nothing in this re-pin re-opens a ruling.

md5 of record: the lane task list records the ratified file as `456d8dcd8d978d6b4811b81f4fa27572`.
That is the file AS RATIFIED at commit `a410e106` (verified first-hand: `git show
a410e106:.hermes/plans/…-spec.md | md5sum` → `456d8dcd…`). Two DOC-ONLY commits landed after:
`9a1bb0fb` (`80a1b790…`) and `eca2ae76` (`cdb336de…`, the AMENDMENT l2t0920 block at
`:503-519`). On-disk today = `cdb336deaa7eaedd44538b54cbfae02e` = ratified text + both
amendments. No content differs beyond those two doc commits; the re-pin below is against the
on-disk (current) text.

Base tip of this re-pin: `4a65d4c1d633219cd61cb51d39027edda2dfbfe5`
(`git -c core.fileMode=false rev-parse HEAD`), merges since the ratified pins:
`0ae98e47` (LABSTATE fix-4: `add_material.labware` teaching DATA, +14 YAML lines inside
`add_material`) and `4a65d4c1` (CARD-1 PARTIAL: 3a + fix-run-1 D1/D2/D3 — W12 slot-coverage
gate, mint honesty, prompt-only mint label, shared unknown-noun code; **3b DEFERRED BY
RULING**, `volumeUl.required: false` stays the FACT OF RECORD).

Goal (unchanged, verbatim): turn the two invisible assumptions of a clarification answer into
facts the scientist approves — an editable, data-declared `volume: 100 uL (assumed)` chip and a
well-target slot on the card when the run host carries no selection — and make the last screen
before a plate write readable (`A2 ← 100 uL DMEM (MAT-dmem-ykg0)`, one verb), inside the
EXISTING review surface.

Evidence base (unchanged): `~/.hermes/cl/receipts/CLARIFY-WEIRD-20261101/20261101_174042/report.md`
(P6, P7, W11, W13; §2 byte-captured proposal body; `hosts.json` + `artifacts/HV-req-02.json`).
Binding rulings (unchanged): `decisions/CLARIFY-WEIRD-routing-l2t1915-ruling.md` Q2 item 3,
Q3 D1 guardrail + never-guess, Q4 sequencing; `decisions/CARD1-W11-volume-boundary-l2t0747-ruling.md`
Q1 (3b → TARGET-1, folded in by AMENDMENT l2t0920).
Sibling boundaries (unchanged): `2026-11-01_1945-L2-CLARIFY-PICKER-1-spec.md` (merged),
`2026-11-01_2330-L2-CLARIFY-CARD-1-spec.md` (merged PARTIAL — see RE-PIN NOTE S1).

## Ground truth measured first-hand at `4a65d4c1` (replaces the 504d22bb table)

- Lane tip / branch: `4a65d4c1` on `cl/integration-2`; log head "merge(lane2):
  L2-CLARIFY-CARD-1 PARTIAL (3a + fix-run-1 D1/D2/D3) … 3b DEFERRED BY RULING:
  volumeUl.required:false stays the FACT OF RECORD (Brad)".
- **The invented `100` still has NO TypeScript default in the shorthand path.**
  `simpleVerbs.ts` derives `volumeUl` only from declared params (`volume_uL`, `volume_ul`,
  numeric `volume`, `material.volume_uL`) — `const volumeUl =` `:559`, `resolvedVolumeUl`
  `:587`, `volumeDetails` `:593` (moved +15/+15/+15 by LABSTATE fix-3/fix-4 line churn; the
  SEMANTICS are unchanged). Honest correction to the ratified pin's grep claim: the string
  `?? 100` DOES occur once in `server/src` — `server/src/mcp/tools/aiPlanningTools.ts:343`
  (`transferVolume_uL ?? 100`, the MCP transfer planning tool) — it is NOT on the
  scientist-intent/shorthand compile path and is out of scope; no `DEFAULT_VOLUME` exists
  anywhere and no `volumeUl ?? <literal>` exists in `server/src/compiler/**` or `server/src/ai/**`
  (all hits are `?? 0` / `?? 0.1` in protocol/lab-state summary code).
- **The real origin of `100` is still the frozen prompt example.** `submitSuggestionTool.ts`
  `:645` `'    volumeUl: 100\n'`, `:646` `'    targetWells: [A1]\n\n'` (inside the
  `shorthand` description `:635-647`, `SHORTHAND_CONTRACT_BLOCK` at `:647`); duplicated in
  `shorthandChat.ts:1345`/`:1346` and `:1378`/`:1379`. Byte-frozen for this item.
- **`add_material` still declares NO wells argument.** Args run `:250-305` and end at
  `composition` `:300-305` (`source` :250, `target` :255, `labware` :260 (+ teaching
  :265-278), `material` :279, `source_name` :291, `volumeUl` :294, `volume` :297,
  `composition` :300). Insert point for the new arg: after `:305`.
- **`add_material.volumeUl` is `required: false`** — `:294-296` — FACT OF RECORD (CARD-1 3b
  deferred). TARGET-1 owns the flip (V1) per AMENDMENT l2t0920.
- **`aliquot` still proves the `required: true` + `kind: wells` route**: `:559-561`
  (`targetWells`, kind `wells`, `required: true`) with the SPINE-7 comment `:556-558`.
- **The required-argument sweep is still DATA-driven**: `resolveNounsPass.ts:259-284`
  (`argumentPresent` :252-257, `argContracts` loop :266, `kind === 'scalar'` skip :269,
  `required !== true` skip :270, `MISSING_REQUIRED_ARGUMENT_REASON` :65 emitted at `:274`).
- **The answer fold still splices ONLY string/array slots** and returns `null` otherwise:
  `shorthandChat.ts:968-1092` (slot resolution :1022-1030, string arm :1031, array arm
  :1033-1051, `else { return null }` :1049-1050, `answered.size === 0 ⇒ null` :1060). A quantity
  slot (number or absent) still cannot be answered.
- **NEW (CARD-1 merged): the W12 slot-coverage gate exists and is `resolvable`-only** —
  `server/src/compiler/resolution/nounCoverage.ts:99-134`, `if (contract.kind !== 'resolvable')
  continue` `:121`, wired at `compileScientistIntent.ts:390`. It does NOT see `volumeUl`
  (quantity) or `targetWells` (wells). Do not widen it.
- **NEW (CARD-1 merged): there is NO V2 prompt-provenance bar on trunk.** 3b (V1+V2 as a
  unit) was deferred; `resolveNounsPass.ts:485-488` is the only answered-slot interaction and
  it deliberately KEEPS a `missing-required-argument` fact even when its slot was answered.
- Typecheck baselines RE-MEASURED first-hand at `4a65d4c1` (`npx tsc --noEmit`, noEmit-only,
  read-only): **server 0 errors**; **app 10 errors, BYTE-IDENTICAL to the 504d22bb list**
  (`diff` of `/tmp/app-tsc-base-504d22bb.txt` vs `/tmp/app-tsc-repin-4a65d4c1.txt` is EMPTY;
  saved lists at `/tmp/app-tsc-repin-4a65d4c1.txt` and `/tmp/server-tsc-repin-4a65d4c1.txt`).
  The 11th line in the intermediate `/tmp/app-tsc-base-l2t0230.txt`
  (`src/editor/taptab/tabNavPlugin.ts(102,7)`) does NOT reproduce at `4a65d4c1`.

## Acceptance criteria (VERBATIM from the lane task list, item `L2-CLARIFY-TARGET-1`)

Description (1)(2), verbatim:

> (1) P6 — 'Add DMEM to A1' today stages events with volumeUl:100 INVENTED, no card (W11,
> byte-captured proposal body): when the prompt states no volume, the card (or, if no card
> fires, the preview bar) shows an editable 'volume: 100 uL (assumed)' chip the scientist
> approves or changes; the assumed-value + its source (lint/config YAML default, never
> TS-hardcoded) is declared in data. When no wells are selected the target is absent silently
> on the run host (deck host carries selection, run host does not — hosts.json): a target slot
> appears on the card instead of events with no target. (2) P7 — the proposed changes list
> renders four identical 'add_material / 100 uL' rows with a 'Drop' verb while the bar says
> 'Discard/Accept' (W13): each row renders the checkable fact 'A2 <- 100 uL DMEM
> (MAT-dmem-ykg0)' and row-action uses the bar's verb.
>
> ARCHITECT RATIFIED as filed (ruling Q2 item 3), with D1 guardrail: P7 row rendering must
> enrich the EXISTING proposed-changes rows (ChangesPanel/preview) and reuse the bar's verb —
> must not become a second approval surface.

"verified by:" (VERBATIM — the browser gate, ROUND-TRIP-GATE-1):

> Live :5193: 'Add DMEM to A1' (no volume) -> assumed-volume chip visible + editable, and
> accept carries the approved number (body + shot); no-selection run-host turn -> target
> slot, not silent no-target events; proposal rows name well+volume+material+record id
> (shot); one verb everywhere.

Plus the AMENDMENT l2t0920 gate (verbatim in substance, carried at the appendix below):
(i) V1 leg — a document omitting `add_material` volume produces a missing-required-argument
card (the required-flag flip, YAML not TS); (ii) V2 leg — "Add DMEM to A1", no volume in the
prompt, yields a card or the declared assumed-value chip — never a silent staged
`volumeUl: 100`; (iii) `foldNullArms.test.ts:516` expectation updated as part of the flip's
declared blast radius, plus the golden enumeration.

## In scope (exact paths, re-pinned)

- `config/drafting/shorthand-drafting.yaml` — ONE new `assumedValues:` section appended AFTER
  `blobDetectPatterns` (file is 88 lines today; `surfaces:` :27, `nounShape:` :49).
- `server/src/compiler/resolution/assumedQuantities.ts` (NEW) — per-call loader + lookup,
  mirroring `nounShape.ts` (`:29` path constant, `:52-109` loader).
- `server/src/compiler/resolution/assumedQuantities.test.ts` (NEW) — loader + data⇄vocabulary lint.
- `server/src/ai/shorthandChat.ts` — two contained hunks:
  (a) `clarificationsFromUnresolvedFacts` (`:857-917`): stamp `clarifyControl` for declared
  `quantity`/`wells` facts from DATA;
  (b) `foldAnswersIntoShorthand` (`:968-1092`): the declared-kind splice arm for `quantity`
  and `wells` slots (today unreachable — see the pin).
- `server/src/ai/shorthandChat.assumedValue.target1.test.ts` (NEW),
  `server/src/ai/shorthandChat.wellTarget.target1.test.ts` (NEW).
- `server/src/ai/types.ts` — ONE additive optional field on `AgentClarificationRequest`
  (`:584-622`; `unresolvedFact` is the last field, `:621`).
- `app/src/types/ai.ts` — the mirror field on `AiClarificationRequest` (`:270-288`).
- `app/src/agent/ClarifyAssumedChip.tsx` (NEW) — the editable assumed-value chip.
- `app/src/agent/ClarifyWellTargetSlot.tsx` (NEW) — the target slot.
- `app/src/agent/proposalRowFacts.ts` (NEW) — the declarative row-fact formatter for P7.
- `app/src/agent/ChatPreviewCard.tsx` — rows use `proposalRowFacts` + the bar's verb (P7).
- `app/src/agent/ChatClarificationCard.tsx` — ONE insertion at the per-slot answer-surface
  ternary (`:160-197`), chip first; nothing else in the card (see RE-PIN NOTE S2).
- `app/src/agent/ChatLog.tsx` — ONE bounded insertion in `renderTypedClarification`
  (`:269-304`): the same two components for the **single-request** arm, plus the guard
  change at `:276` (see RE-PIN NOTE S3 — this is a declared, minimal expansion).
- `app/src/shared/context/WellSelectionContext.tsx` — ONE additive export
  `useOptionalWellSelection()` (null-safe sibling of `useWellSelection`, `:195-199`), for the
  optional "use selected wells" affordance. No behavior change to the existing hook.
- Tests (NEW): `app/src/agent/ClarifyAssumedChip.test.tsx`,
  `app/src/agent/ClarifyWellTargetSlot.test.tsx`, `app/src/agent/proposalRowFacts.test.ts`,
  `app/src/agent/ChatPreviewCard.rowFact.target1.test.tsx`,
  `app/src/agent/ChatClarificationCard.target1.test.tsx`,
  `app/src/agent/ChatLog.singleSlotChip.target1.test.tsx`.

## Explicitly OUT of scope

- **CARD-1's merged surface**: `ChatClarificationCard.tsx`'s grouping / Submit / answered-row
  logic, `ChatLog.tsx`'s n>1 render DECISION (`:373` condition stays `length > 1`), the mint
  row (`ClarificationPicker.tsx:253-258` and its render), `HarnessChatPane.tsx`'s batch
  submit (`:383-385`). TARGET-1 adds ONE arm to the card's per-slot ternary and ONE arm to
  the typed arm; it does not re-decide which arm renders.
- **PICKER-1's merged surface**: `ClarificationPicker.tsx` row ranking/top-3/consequence
  line, `app/src/shared/taptab/slashMenu/*`, `schema/lab/material-profile.registry.yaml`,
  `MaterialProfileRegistry.ts`, `MaterialProfileHandlers.ts`.
- **CARD-1's legs**: the W12 slot-coverage gate (`nounCoverage.ts` — do not widen it to
  `wells`/`quantity`), the one-AgentOrchestrator-hunk provenance check, and the
  `add_material.volumeUl.required` flip itself is now TARGET-1's (V1) — but no OTHER
  vocabulary arg may move.
- **The search prompt example strings** `submitSuggestionTool.ts:635-647`,
  `shorthandChat.ts:1345`/`:1346`, `:1378`/`:1379` — byte-frozen (only the GENERATED
  `contractBlock` may move, via ratified DATA; see OQ1).
- **The deck-side review surfaces**: `PreviewActionBar.tsx:149-176`, `ChangesPanel.tsx:99-111`
  + `:124-142`, `ProposedGraphModal.tsx`. D1: the P7 enrichment is the pane list only.
- `server/src/ai/AgentOrchestrator.ts` — zero hunks (its `contractBlock()` embed at `:596`
  moves by DATA only). If the coder believes a hunk is needed, STOP and report BLOCKED.
- `server/src/compiler/resolution/clarificationDedupe.ts` — UNLESS the same-noun fold
  provably collapses two distinct `clarifyControl` slots (RE-PIN NOTE S4); then exactly one
  narrow guard, declared in the report.
- Any new vocabulary: material record / material-spec formulation / instance / aliquot /
  vendor-product / Composition only. No "dose", "amount", "target volume" as new local terms.

## Change 1 — the assumed value is DATA (the number stops being a prompt artifact)

New section in `config/drafting/shorthand-drafting.yaml` (append after `blobDetectPatterns`,
i.e. after line 88; same file, same per-call loader discipline, no new YAML file):

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
  wells:
    - verb: add_material
      argument: targetWells
      question: 'Which wells? Name a range (A2:B3) or pick wells on the deck.'
```

`assumedQuantities.ts` contract (mirror `nounShape.ts:29` path + `:52-109` loader):
- `loadAssumedQuantities(path = <config file>)`: per call, never cached. Absent
  file/section ⇒ `[]`. Present-but-malformed ⇒ throw naming the path and the offending entry
  (`nounShape.ts:65` / `:74` are the throw idioms — `must be an object`, `must be a non-empty
  string list`; `:59` is the unreadable-file arm).
- Shape validation only (verb/argument non-empty strings, `value` a finite number > 0, `unit`
  and `source` non-empty, `question` containing `{value}` and `{unit}`; wells entries need
  verb/argument/question only).
- `assumedQuantityFor(verb, argument, entries)`: exact (verb, argument) join; no fallback, no
  per-domain default. **Absent declaration ⇒ no assumption is offered anywhere.** Never
  synthesize 100 in TS.
- **Lint (in `assumedQuantities.test.ts`):** every declared `(verb, argument)` MUST be an
  `argContracts(verb)` entry of the declared kind (`quantity` for `quantities`, `wells` for
  `wells`) — a declaration for a non-existent or wrong-kind slot throws the test. Also: the
  declared `value`/`unit` MUST equal the numbers in the frozen example at
  `submitSuggestionTool.ts:645` (`volumeUl: 100`); if someone edits the example, this test
  fails and forces a conscious data edit. Zero verb/argument/unit literals in the loader.

## Change 2 — the chip on the card (P6/W11), editable and never a silent default

Wire addition (ONE field, additive, eOPT-safe conditional spread — key ABSENT when undeclared):

```ts
// server/src/ai/types.ts AgentClarificationRequest (:584-622)  and  app/src/types/ai.ts (:270-288)
clarifyControl?:
  | { kind: 'quantity'; label: string; value: number; unit: string; source: string; question: string }
  | { kind: 'wells'; question: string }
```

(`question` on the wells arm too — the wording is DATA, so the client renders the server's
declared sentence rather than inventing copy; the quantity arm carries it for the same reason.)

Stamped in `clarificationsFromUnresolvedFacts` (`shorthandChat.ts:857-917`) — it already
resolves the declared contract for the fact's `actionLocation` (`domain` lookup `:876-878`,
`kind` `:879`, request object `:892-917`). Rules, all from declared DATA / declared KIND, zero
verb-argument literals:

1. Resolve `contract = vocabulary.argContracts(loc.action).find(c => c.name === loc.argument)`.
2. `contract.kind === 'quantity'` AND `assumedQuantityFor(loc.action, loc.argument)` exists ⇒
   `clarifyControl: {kind:'quantity', ...entry}` and `prompt = entry.question` rendered with
   `{label}{value}{unit}{verb}`. The noun template at `:888-890` is NOT used for this arm (it
   would say `The draft names "volumeUl"…`).
3. `contract.kind === 'wells'` ⇒ `clarifyControl: {kind:'wells', question}`; prompt = the
   declared `assumedValues.wells` question. `menuProvider` stays `'choice'`, `options: []`
   (`:908-912`). NOTE: `requestHasPicker` (`ClarificationPicker.tsx:47-49`) is FALSE for these
   requests (no `/m`,`/l`,`/e` provider, `kind !== 'labware'`), so no picker competes.
4. Both arms set `entityType` to the declared argument name (`volumeUl` / `targetWells`) so the
   answer sentence reads `Use 100 uL for volumeUl.` / `Use A2:B3 for targetWells.` — the
   sentence SHAPE (`clarificationAnswerPrompt.ts:18-25`, batch `:28-41`, joined with `' '`) is
   untouched; only the `target` token differs, and only for request families that did not
   exist before.
5. Every other fact (nouns, readings, model asks) keeps today's request byte-for-byte. A fact
   with no declaration gets NO `clarifyControl` key (conditional spread, never `undefined`).

App chip `ClarifyAssumedChip.tsx` (rendered when `request.clarifyControl?.kind === 'quantity'`;
chosen by THAT field alone — the app holds no policy):
- Renders: the slot label, a numeric `<input data-testid="clarify-assumed-value">` seeded with
  `value`, the unit, a `(assumed)` badge, and the data `source` as `title` + `data-source`.
- **Never a silent default (never-guess):** the slot starts UNANSWERED. Typing in the input, or
  pressing `data-testid="clarify-assumed-approve"` labelled `Use {value} {unit}`, marks the slot
  answered with
  `{requestId, label: '<n> <unit>', value: String(n), ref: {kind:'quantity', value:n, unit}}`.
  Until then CARD-1's Submit stays disabled (`ChatClarificationCard.tsx:112` `allAnswered`) —
  the scientist approved a visible assumption, exactly as the panel refuses to prefill
  (`ProtocolLocalizationThread.tsx:765-772` rule, cited by CARD-1).
- Editing to `250` then approving sends 250 (the APPROVED number, never the assumed one).
  Clearing the input disables approve (no empty answer). Rejecting the assumed value is out of
  scope: the scientist types the real number.
- The chip states the assumption ONCE per slot — no extra card, no second Submit.
- The chip's answer MUST reach the card through `record(request, answer)`
  (`ChatClarificationCard.tsx:105-107`) — the existing per-slot sink. No new callback, no new
  state channel.

## Change 3 — the fold can accept a declared quantity/wells answer (today it cannot)

`foldAnswersIntoShorthand` (`shorthandChat.ts:968-1092`) resolves a slot only when its value is
a string or an array (`:1022-1030`, string arm `:1031`, array arm `:1033-1051`) and returns
`null` for a numeric or ABSENT slot (`:1049-1050`) — so a card answer for `volumeUl` (numeric or
missing) and for an absent `targetWells` cannot fold at all. ONE arm, keyed on the DECLARED kind:

```
contract = vocabulary.argContracts(loc.action).find(c => c.name === loc.argument)
if (contract?.kind === 'quantity' | 'wells') { ...declared-kind splice... ; continue }
```

- `quantity`: value from `answer.ref` `{kind:'quantity', value:number, unit:string}`
  (preferred), else parse `answer.label` with the existing quantity parser (never an ad-hoc
  regex). Require `unit === assumedQuantityFor(...).unit` (the declaration's own unit — no
  `'uL'` literal); on any mismatch return `null` (never guess). Write the NUMBER into
  `action[loc.argument]` (the schema types `volumeUl` as number,
  `scientist-intent.schema.yaml:167-168`).
- `wells`: expand `answer.label` with the ONE parser `expandWellTokens`
  (`server/src/ai/wellRange.ts:38`) and write the ARRAY into `action[loc.argument]`. A range
  STRING in a declared `kind: wells` slot is a symbolic well LABEL to the engine (SPINE-7) and
  would bar again — never write the string.
- Both arms: `answered.add(fact)` (`:1052`), `answeredSlots.push({actionIndex, argument,
  label})` (`:1053`), remove the answered fact from `doc.unresolved` exactly as the existing
  arms do (`:1063-1068`). No record bindings are recorded (`ref` carries no `id`).

- **The loop (re-pinned — this is the part the CARD-1 merge changed).** The ratified text
  assumed CARD-1's V2 provenance bar would re-bar an approved assumption. **On trunk there is
  NO V2 bar** (3b deferred by ruling; RE-PIN NOTE S1). What actually happens on the recompile
  is:
  1. the fold writes the approved number into the document, so
  2. `requiredArgumentClarifications` (`resolveNounsPass.ts:259-284`) sees the slot PRESENT
     (`argumentPresent` `:252-257`, number arm `:255`) and emits NO fact, and
  3. the DROP arm that deliberately KEEPS an answered required-arg fact
     (`:485-488`) never sees one.
  So the loop closes by the VALUE being written, not by an exemption. **The RED loop pin is
  still mandatory** (answer-once-then-settle). If, and only if, it reproduces a re-bar, the ONE
  permitted hunk is `resolveNounsPass.ts:485-488` (keep → drop for a slot this turn's answers
  filled) — no new document field, no orchestrator hunk. Anything larger ⇒ STOP, report BLOCKED.

## Change 4 — the target slot when no wells are selected (P6 run-host half)

DATA first: add to `add_material`'s args in
`schema/scientist-intent/scientist-intent-vocabulary.yaml` (after `composition`, which now ends
at `:305`):

```yaml
      - name: targetWells
        kind: wells
        required: true
```

Plus the V1 flip in the SAME file (CARD-1 3b, deferred to this item): `add_material.volumeUl`
`:294-296` gains `required: true`. Both are DATA; the `aliquot` precedent (`:559-561`, comment
`:556-558`) is the exact same declaration shape.

The §5.2 sweep (`resolveNounsPass.ts:259-284`) then emits ONE
`missing-required-argument` fact per absent declared-required arg — the compile bars atomically
(`blocked = clarifications.length > 0`), the card fires, and the slot renders. No new server
predicate, no verb name, no arg name in TS.

**Generated contract-block delta (measured first-hand at 4a65d4c1, do not paraphrase):**
today the block renders
`- add_material — source?:resolvable(labware), target?:resolvable(labware), labware?:resolvable(labware), material?:resolvable(material), source_name?:scalar, volumeUl?:quantity, volume?:quantity, composition?:resolvable(material)`
followed by the LABSTATE teaching line
`  labware: If the scientist names or implies a container the deck holds (even "the plate"), carry it in the labware arg; omit it only when the scientist names none.`
(`vocabulary.ts:375-392`; the arg map with the `?` render is `:378-380` (`:379`), the teaching
lines `:382-388` (`:383` gate, `:387` push)). After the flip it MUST read
`- add_material — source?:resolvable(labware), target?:resolvable(labware), labware?:resolvable(labware), material?:resolvable(material), source_name?:scalar, volumeUl:quantity, volume?:quantity, composition?:resolvable(material), targetWells:wells`
— one line changed, the teaching line unchanged. Any OTHER prompt-string diff is a defect.

App `ClarifyWellTargetSlot.tsx` (rendered when `request.clarifyControl?.kind === 'wells'`):
- A text input `data-testid="clarify-well-target"` with placeholder `A2:B3` (range or comma list).
- Validation is LOCAL and syntactic only (non-empty, matches the address/range grammar the client
  already uses for plate coordinates); invalid text disables the approve affordance. No
  resolution, no guessing, no auto-fill.
- Approve sends `{requestId, label: 'A2:B3', value: 'A2:B3', ref: {kind:'wells', wells:[...]}}`;
  the server expands authoritatively (`expandWellTokens`) — the client's list is a hint, the
  server's expansion is the truth.
- Optional affordance: when `useOptionalWellSelection()` returns a non-empty selection, render a
  `Use selected wells (A2, A3, B2, B3)` button that fills the input. It fills, it does not answer.
  When the context is absent the button simply does not render.
- Same slot rules: unanswered until approve; one Control per slot; answer reaches the card via
  `record(request, answer)`.

**Honest limit, disclose in the report:** a model that INVENTS a `targetWells` value the prompt
never mentioned is not caught by this leg (the declaration only catches the ABSENT case).
Extending a prompt-provenance arm to `kind: wells` is named as the follow-up, not built here.

## Change 5 — P7: readable rows, one verb, inside the existing surface (D1)

`ChatPreviewCard.tsx` only (all pins HOLD unchanged: `eventDetailLine` `:51-95`, section
aria-label `:112`, title `:114`, rows map `:141-171`, toggle testid `:163`, `setPreviewEventState`
`:165`, label `:167`, `Apply` `:183`, `Discard` `:192`). D1 GUARDRAIL (binding): this is the
EXISTING proposed-changes list; it must NOT become a second approval surface — no new rail, no
new checkbox, no new write path. The per-row toggle keeps calling
`chat.setPreviewEventState(event.eventId, …)` (`:165`). Nothing else is added.

1. New `proposalRowFacts.ts`: `proposalRowFact(event, recordIds)` returns the checkable fact
   `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` from the event's OWN `details`, declaratively (the
   `eventDetailLine` doctrine at `:51-95`, extended):
   - well(s): `details.well` (string) else `details.wells` (array) → `A2` / `A2, A3, B2, B3`;
   - volume: `details.volumeUl` else `details.volume` (number ⇒ `n uL`; `{value,unit}` verbatim);
   - material: `details.material` when a string;
   - record id: `recordIds.get(materialLabel)` — **only when present; ABSENT otherwise, never
     invented**;
   - no recognised field ⇒ `null` (the caller keeps today's `eventLabel` + `eventDetailLine`
     line; dead chrome is not added).
2. `recordIds` at render time: `useMemo` over `chat.messages` (`UseAiChatReturn.messages`,
   `useAiChat.ts:236-237`) — take the LAST user message (the answer sentence of the turn that
   produced the preview) and run the EXISTING `parsePromptMentions`
   (`aiPromptMentions.ts:106`); keep `type === 'material' && id` keyed by the mention `label`
   (the parser returns `{type, entityKind, id, label}`, `:38-52`). No new grammar, no server
   field, no re-search. A label mismatch (e.g. the answer said `DMEM` but the bound row is
   `DMEM + FBS`) yields no id — correct, and the reviewer will check exactly this.
3. Row action verb: ONE module constant in the component for the proposal's reject verb
   (`Discard`, the bar's own word at `:192`); the row button renders it when pending and
   `Restore` when dropped, with `aria-label` = `${verb} ${fact}` so two identically-worded
   controls are still distinguishable. `chat-preview-toggle-${eventId}` testid unchanged
   (pinned by `HarnessChatPane.test.tsx:177`).
4. The four `add_material` rows of W13 become four DISTINCT strings (well + volume + material),
   which is the whole finding: `A2 ← 100 uL DMEM + FBS`, `A3 ← 100 uL DMEM + FBS`, …

## RED-first unit test plan (re-pinned)

Server (`cd server`, vitest):
1. `src/compiler/resolution/assumedQuantities.test.ts` (NEW, RED): the loader returns the
   declared `(add_material, volumeUl)` entry; absent section ⇒ `[]`; malformed entry throws
   naming the path; data⇄vocabulary lint (declared slot has the declared kind; value/unit equal
   the frozen example).
2. `src/ai/shorthandChat.assumedValue.target1.test.ts` (NEW, RED):
   - a `missing-required-argument` volumeUl fact and a `not-stated` volumeUl fact both produce a
     request with `clarifyControl = {kind:'quantity', value:100, unit:'uL', …}` and the DATA
     `question` (not the noun template);
   - a fact whose slot has NO declaration emits NO `clarifyControl` key (`'clarifyControl' in req`
     is false — the eOPT pin);
   - fold: doc `{volumeUl: 100}` + answer `{label:'250 uL', ref:{kind:'quantity', value:250,
     unit:'uL'}}` ⇒ re-parsed doc `volumeUl === 250` (number), fact removed;
   - fold: unit `mL` ⇒ `null`; no declaration for the arg ⇒ `null` (unchanged behaviour);
   - **loop pin:** approving the ASSUMED value (100) recompiles to `complete` with the event
     carrying `volumeUl: 100` and **no** clarification on the re-ask (Change 3's loop section).
3. `src/ai/shorthandChat.wellTarget.target1.test.ts` (NEW, RED): a doc with `add_material` and no
   `targetWells` yields exactly one fact `{argument:'targetWells',
   reason:'missing-required-argument'}` and the compile outcome is `needs-clarification` with
   `events: []`; a doc carrying `targetWells: [A1]` yields none; the fold turns answer
   `{label:'A2:B3'}` into `targetWells: ['A2','A3','B2','B3']` (array, expanded).
4. `src/compiler/scientistIntent/vocabularyContractBlock.test.ts` (extend): the generated
   `add_material` line is EXACTLY the post-flip string quoted in Change 4 (record the real string
   verbatim; the existing `toContain('add_material — source?')` at `:16` and the FIX4 teaching
   leg at `:56-66` must both stay green).
5. **NEW (re-pin):** `src/ai/shorthandChat.sameNounDedupe.target1.test.ts` — two `add_material`
   actions both missing `volumeUl` must yield TWO `clarifyControl` requests, not one
   (`clarificationDedupe.ts:74-119` folds by `(query, actionSignature)`; `actionSignature` is
   `JSON.stringify([kind, menuProvider, options])` `:66-68` — identical for both slots). If the
   RED shows a collapse, the ONE narrow guard is permitted; otherwise no hunk.

App (`cd app`, vitest):
6. `src/agent/ClarifyAssumedChip.test.tsx` (NEW, RED): renders value/unit/badge/`data-source`;
   approve disabled-clean on empty input; approve at 100 emits
   `{label:'100 uL', value:'100', ref:{kind:'quantity', value:100, unit:'uL'}}`; edit-to-250 emits
   250; NO callback fires before interaction.
7. `src/agent/ClarifyWellTargetSlot.test.tsx` (NEW, RED): placeholder `A2:B3`; invalid text
   disables approve; approve emits the label + `ref.wells`; no selection context ⇒ no "Use
   selected wells" button; with a selection ⇒ the button fills the input but does NOT answer.
8. `src/agent/proposalRowFacts.test.ts` (NEW, RED): `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` for
   `{well:'A2', material:'DMEM', volumeUl:100}` + a matching id; id omitted when the map lacks the
   label; `volume:{value:100,unit:'uL'}` renders identically; an incubate event renders `null`.
9. `src/agent/ChatPreviewCard.rowFact.target1.test.tsx` (NEW, RED): four add_material events
   render four DISTINCT rows; row button text === the bar's reject verb; `aria-label` names the
   fact; the toggle still calls `setPreviewEventState` with the same `eventId` and NO other
   callback (D1 pin); a message with no material mention renders no `(…)` suffix anywhere.
10. `src/agent/ChatClarificationCard.target1.test.tsx` (NEW, RED, on CARD-1's card): a two-slot
    message (material + quantity) renders exactly one chip inside the matching
    `data-testid="chat-clarification-slot"`; Submit (`:206`) stays disabled until the chip is
    approved AND the material slot is picked; the batch sentence contains `100 uL`. CARD-1's own
    pins must stay green: 1 card / 2 slots / 1 submit (`ChatLog.grouped.card1.test.tsx:104-106`).
11. `src/agent/ChatLog.singleSlotChip.target1.test.tsx` (NEW, RED — the n===1 arm): ONE
    quantity-only request renders the chip through `renderTypedClarification` and still renders
    NO `chat-clarification-card` and NO `chat-clarification-submit`
    (`ChatLog.grouped.card1.test.tsx:195-196` is the pin that forbids the card at n=1).

## First targeted check (run before building anything else)

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/compiler/resolution/assumedQuantities.test.ts src/ai/shorthandChat.assumedValue.target1.test.ts
```

It fails today for the right reason (no loader; quantity answers return `null` from the fold) and
it proves the two load-bearing facts of the whole item — the data is the number's only home, and
an approved number can re-enter the document. If the fold RED cannot be made green without
touching `AgentOrchestrator.ts`, stop and report BLOCKED rather than improvising.

## Verification commands (exact invocations, expected output)

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run \
  src/compiler/resolution src/compiler/scientistIntent \
  src/ai/shorthandChat.assumedValue.target1.test.ts \
  src/ai/shorthandChat.wellTarget.target1.test.ts \
  src/ai/shorthandChat.sameNounDedupe.target1.test.ts \
  src/ai/shorthandChat.foldNullArms.test.ts src/ai/shorthandChat.nounShape.test.ts \
  src/ai/shorthandChat.readingCard.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts
```
All green. (All nine paths verified to exist at 4a65d4c1.)

```
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run \
  src/agent/ClarifyAssumedChip.test.tsx src/agent/ClarifyWellTargetSlot.test.tsx \
  src/agent/proposalRowFacts.test.ts src/agent/ChatPreviewCard.rowFact.target1.test.tsx \
  src/agent/ChatClarificationCard.target1.test.tsx src/agent/ChatLog.singleSlotChip.target1.test.tsx \
  src/agent/ChatPreviewCard.regatefix2.test.tsx src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx \
  src/agent/ChatPreviewCard.incubateDetails.uifix3.test.tsx src/agent/ChatPreviewCard.errorWall.regatefix2.test.tsx \
  src/agent/ChatLog.test.tsx src/agent/HarnessChatPane.test.tsx \
  src/agent/ChatLog.grouped.card1.test.tsx src/agent/ChatClarificationCard.mint.test.tsx
```
All green. (`ChatLog.grouped.card1` and `ChatClarificationCard.mint` are CARD-1's merged pins —
they are in the run BECAUSE TARGET-1 inserts into that card.)

Typecheck — baselines MEASURED first-hand at 4a65d4c1, re-measure at the actual base:

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx tsc --noEmit      # 0 errors at 4a65d4c1; must stay 0
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | sort
# 10 pre-existing at 4a65d4c1 (list byte-identical to 504d22bb); diff against the base list must be EMPTY
```

Data/code boundary greps (each must be empty unless stated):
```
git -c core.fileMode=false grep -n "100" -- server/src/compiler/resolution/assumedQuantities.ts server/src/ai/shorthandChat.ts | grep -v "test"
git -c core.fileMode=false grep -n "volumeUl\|targetWells" -- server/src/compiler/resolution/assumedQuantities.ts
```
The first may legitimately show the frozen example lines already in `shorthandChat.ts` (`:1345`,
`:1378`) — no NEW hit in the loader or in the changed hunks. The second must be empty (the
loader never names an argument).

**YAML reload trap:** `config/drafting/*.yaml` is loaded per call, but the live stack still needs
a restart for a clean claim; restart and health-check `:3093` before any browser claim.

## Browser gate (verified-by, verbatim from the task list, ROUND-TRIP-GATE-1)

> Live :5193: 'Add DMEM to A1' (no volume) -> assumed-volume chip visible + editable, and
> accept carries the approved number (body + shot); no-selection run-host turn -> target
> slot, not silent no-target events; proposal rows name well+volume+material+record id
> (shot); one verb everywhere.

Driver notes: real backend, ZERO interception of `/api/ai/**`; every changed surface needs a
request-body artifact PAIRED with a rendered-answer screenshot. The no-selection turn must be
driven with `context.selectedWells: null` (the `HV-req-02.json` shape; the wire field is built at
`RunSurfaceChatBridge.tsx:51-62` and read at `systemPrompt.ts:672-673`) AND a control turn WITH a
selection that must produce NO wells card (regression: the Prompt-1 regate journey).

**Re-pin addition for the gate:** the V2 leg ("Add DMEM to A1", no volume) is a SINGLE-fact turn
→ it renders through `renderTypedClarification` (`ChatLog.tsx:388` → `:269-304`), NOT through
`ChatClarificationCard`. The gate must therefore assert the chip inside
`[data-testid^="chat-log-request-"]`, and separately assert (multi-fact turn) the chip inside
`[data-testid="chat-clarification-slot"]`. A gate that only looks for the card will "fail" a
correct build.

## Worker contract

- Worktree `wt/L2-CLARIFY-TARGET-1-lane2-l2t<tick>` off trunk `cl/integration-2`; branch
  `cl/lane2-clarifytarget-1-l2t<tick>`.
- **Base tip must be ≥ the CARD-1 MERGE commit `4a65d4c1`** (itself ≥ the PICKER-1 merge).
  Proof in the report: `git -c core.fileMode=false merge-base --is-ancestor 4a65d4c1 HEAD && echo OK`.
- Re-verify every cite in this spec at that tip and list the deltas in the report (the PIN TABLE
  at the end is the checklist; every row must be marked HOLDS / MOVED→<line> / CHANGED).
- One worker. NO hunks in `AgentOrchestrator.ts`; NO hunks in `ClarificationPicker.tsx`,
  `slashMenu/*`, `material-profile.registry.yaml`, `ChangesPanel.tsx`, `PreviewActionBar.tsx`,
  `nounCoverage.ts`.
- Deliverable/report: `.hermes/plans/L2-CLARIFY-TARGET-1-report.wip-l2t<tick>.md` (unique per
  tick; the orchestrator promotes). Must contain: base-tip proof, the per-pin HOLDS/MOVED table,
  typecheck diffs against the base, the contract-block before/after lines (exact strings from
  Change 4), the golden-change list (Change 4's blast radius), and any OQ that blocked a leg.
- Commit sequence: RED tests → Change 1 (data) → Change 2 (stamp + chip) → Change 3 (fold) →
  Change 4 (target slot + required flip) → Change 5 (rows) → green.

## Reviewer bait (pre-empt these; the adversarial gate WILL look)

1. **Invented-number counterexample.** Construct a doc with `volumeUl: 250` for a prompt that
   states no volume. The chip must show **100 uL (assumed)** — the DATA value — never 250, and
   nothing may stage. If the chip can ever display the model's number, the leg is wrong. Second
   variant: prompt states `250 uL` → there is NO chip at all.
2. **Chip-not-editable / pristine prefill.** If Submit is enabled before the scientist touches the
   chip, the assumption became a silent default — the exact W11 defect wearing new chrome.
3. **Second approval surface (D1).** The rows are the existing list; the toggle is the existing
   `setPreviewEventState`. A new checkbox, a new accept button per row, a new panel, or a per-row
   write call is a D1 violation.
4. **Data-vs-code drift.** No `100`, `'uL'`, `'volumeUl'`, `'targetWells'` literal in the new TS
   loader or in the stamping arm; no fallback when the declaration is absent. Grep-clean is a gate.
5. **exactOptionalPropertyTypes (SERVER-strict — `server/tsconfig.json:13`).** `clarifyControl`
   rides only via conditional spread; a request with no declaration must have the key ABSENT
   (`'clarifyControl' in req`), never `undefined`. The app is NOT eOPT-strict
   (`app/tsconfig.json` has no such flag) — do not "harmonize" app optionals.
6. **The loop.** Approve the assumed 100 → recompile → must settle complete. The closure rides the
   VALUE being written (Change 3's loop section), not a new field. The loop pin is mandatory.
7. **Range string in a declared wells slot.** Writing `"A2:B3"` into a declared `kind: wells`
   argument makes the engine treat it as a symbolic LABEL (SPINE-7) and bar again. The fold must
   write an expanded ARRAY.
8. **Contract-block delta.** The exact post-flip line is quoted in Change 4 — a diff to any OTHER
   prompt string, or a hand-edited `SHORTHAND_CONTRACT_BLOCK`/repair-prompt literal, is a defect.
9. **P7 string invention.** `(MAT-dmem-ykg0)` must come from the transcript's mention token. A row
   that prints an id it did not receive (or a re-searched id) is fabrication. Also: the id must
   NOT appear when the label doesn't match.
10. **YAML reload trap / stale backend.** Green unit tests against a stale process prove nothing.
11. **Golden blast radius of Change 4.** Every `add_material` document with no wells now bars.
    First-hand inventory at 4a65d4c1: 7 fixtures carry `action: add_material`
    (`mixfrac-canonical-flat`, `mixfrac-final-volume`, `labware-hint-lookup-failure`,
    `unresolvable-mixture-component`, `cells-rate-per-volume`, `mixfrac-on-top`,
    `mixfrac-canonical-ambiguous`); **`labware-hint-lookup-failure.yaml` is the only one with NO
    `targetWells`/`wells` line** and is therefore the certain new bar — the coder must confirm each
    of the other six by reading, and enumerate every flipped golden with one line each. The
    `MANIFEST.yaml` re-bless is the THIRD in this lane today (LABSTATE fix-4 `15e5820d→4f72ede5`,
    CARD-1 +10 lines) — bless once, per the b6bb2386 discipline. `foldNullArms.test.ts:516`
    (`expect(requests.length).toBe(5)`) is IN the flip's blast radius (its fixture's
    `add_material` action gains a `targetWells` fact) — update the count with a comment naming
    WHY, never by loosening to `toBeGreaterThan`.
12. **The n===1 gap (re-pin).** A build that mounts the chip only in `ChatClarificationCard` looks
    right in unit tests that use 2-slot messages and is INVISIBLE on the live V2 leg. Bait: the
    gate screenshot shows no chip. The `ChatLog.singleSlotChip.target1.test.tsx` RED is the guard.

## Open questions for the orchestrator

OQ1/OQ2/OQ3 are RATIFIED (appendix below) and are NOT re-opened. Two NEW questions arise from the
re-pin only:

4. **The n===1 seam is outside the ratified "in scope" list.** `ChatLog.tsx:373` mounts
   `ChatClarificationCard` only for `clarificationRequests.length > 1`, and the single-request arm
   `renderTypedClarification` returns `null` at `:276` when `options.length === 0 && !hasPicker` —
   which is exactly the shape of a `clarifyControl` request (`kind: 'general'`,
   `menuProvider: 'choice'`, `options: []`). So on trunk the canonical V2 turn ("Add DMEM to A1",
   one volume fact) has NO answer surface at all, and a card-only build cannot pass the browser
   gate. **Recommendation:** APPROVE the bounded `ChatLog.tsx` insertion (ONE arm in
   `renderTypedClarification` + the `:276` guard gaining `request.clarifyControl != null`), with
   the n>1 render decision untouched and `ChatLog.grouped.card1.test.tsx:195-196` (n=1 ⇒ no card,
   no submit) still green. **Checked:** `ChatLog.tsx:366-391` (the arm decision), `:269-304` (the
   typed arm and its null guard), `ClarificationPicker.tsx:34-49` (`resolverFor`/`requestHasPicker`
   — false for these requests), `ChatClarificationCard.tsx:105-112` (the `record` sink and
   `allAnswered`), `ChatLog.grouped.card1.test.tsx:104-106`/`:195-196` (CARD-1's pins).
   **Alternative refused:** widening the n>1 condition — it breaks CARD-1's single-slot
   regression lock and re-decides the render decision.
5. **Same-noun dedupe can collapse two distinct declared slots.**
   `clarificationDedupe.ts:74-119` groups by `(query, actionSignature)` where `query` is the
   fact's label (the argument name) and `actionSignature` is
   `JSON.stringify([kind, menuProvider, options])` (`:66-68`) — identical for two
   `missing-required-argument` facts on the SAME verb in a multi-action document (both
   `query='volumeUl'`, both `general/choice/[]`). The ratified spec's "one Control per slot"
   therefore may be violated for a 2-action document. **Recommendation:** let the RED
   (`shorthandChat.sameNounDedupe.target1.test.ts`) decide; if it collapses, permit ONE narrow
   guard in `clarificationDedupe.ts` (do not fold cards that carry `clarifyControl`), declared in
   the report. If the orchestrator prefers, this can instead be filed as a follow-up — the
   single-action V2 leg is unaffected either way. **Checked:** `clarificationDedupe.ts:66-68`
   (`actionSignature`), `:74-119` (the fold), `shorthandChat.ts:892-917` (the request fields a
   clarifyControl card would carry), `shorthandChat.sameNounDedupe.uifix3.test.ts:46+` (the
   existing one-noun-one-card contract that the guard must not break).

## ORCH RATIFICATION APPENDIX (l2t0015, 2026-11-02T00:50 EDT — binding for the coder) — VERBATIM, UNCHANGED

Pin spot-verification (orch first-hand at 504d22bb): submitSuggestionTool.ts:645 + shorthandChat.ts:1345/:1378 carry the frozen `volumeUl: 100` example (grep-verified); NO `?? 100`/DEFAULT_VOLUME volume default exists in the compiler (grep-verified); ChatPreviewCard.tsx:112/:114/:167 `Proposed deck changes` + Drop/Include verified; trunk tip confirmed 504d22bb.

OQ1 RULED — APPROVED (data-driven contract-block delta). Declaring `targetWells` on add_material necessarily changes the GENERATED contractBlock; that is data doing its job. The byte-freeze applies to hand-edited prompt STRINGS: any diff to submitSuggestionTool.ts:635-647 / shorthandChat.ts:1345/:1378 or any other prompt-string site is a DEFECT. The report must include the exact before/after generated contract line. CARD-1's `required` flip sets the precedent.

OQ2 RULED — APPROVED as recommended. The provenance exemption lives at CARD-1's seam riding the existing answered-slot channel (resolveNounsPass.ts:117-123): an action slot THIS turn's answers explicitly filled is prompt-attributable. TARGET-1 implements it ONLY if CARD-1's merged shape lacks it — ONE hunk, RED test = answer-once-then-settle. Any growth past one hunk (new document field, orchestrator hunk) => STOP, report BLOCKED.

OQ3 RULED — APPROVED as recommended: transcript mention-token route, no server change, no new wire field; honest no-id rendering when the label does not match. The additive `resolvedMaterialRefs` fallback is a SEPARATE reviewed hunk, only on browser-gate evidence that a legitimately-answered row lacks its id.

SEQUENCING (restated): base tip >= CARD-1 merge (CARD-1 not yet dispatched — TARGET-1 stays behind it). Re-pin every cite at the actual base tip before building; the draft's pins are at 504d22bb, pre-PICKER-1-merge.

---
## AMENDMENT l2t0920 — W11 volume refuse-or-ask gate folded in VERBATIM (architect ruling decisions/CARD1-W11-volume-boundary-l2t0747-ruling.md, Q1) — VERBATIM, UNCHANGED

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

## RE-PIN NOTES (appendix — every delta and every semantic adaptation)

Line deltas are stated as ratified-cite → current-cite at `4a65d4c1`. `[MOVE]` = pure line
movement (no semantic change). `[ADAPT]` = the change-text was rewritten because the CARD-1
merge changed the shape TARGET-1 builds on. `[FIX]` = the ratified cite was already inaccurate
at 504d22bb (pin-author error, NOT merge-caused) — recorded so the coder does not chase a merge
that never touched the file.

**[MOVE] M1 — LABSTATE fix-4 (`0ae98e47`) inserted 14 YAML lines inside `add_material`.**
`scientist-intent-vocabulary.yaml`: `add_material` `:246` unchanged, but the `labware` arg gained
a `teaching:` block at `:265-278`, pushing everything after it by +14. Consequences:
args end `composition` `:286-291` → `:300-305`; `volumeUl` `:280-282` → `:294-296`
(`required: false` still — FACT OF RECORD intact); `aliquot` `:545-547` → `:559-561`
(SPINE-7 comment `:542-544` → `:556-558`).

**[MOVE] M2 — `simpleVerbs.ts` shifted by the LABSTATE well-expansion block.**
`const volumeUl =` `:544` → `:559`; `resolvedVolumeUl` `:572` → `:587`; `volumeDetails` `:578`
→ `:593`; the `add_material` event material label `:600-640` → legacy `:617`, modern `:642`.
Semantics unchanged (still no TS volume default).

**[MOVE] M3 — `shorthandChat.ts` (NOT touched by CARD-1; the drift is older).**
`clarificationsFromUnresolvedFacts` `:857-917` → `:857-917` (holds); `nounPrompt` `:890-892` →
`:888-890`; request object `:893-916` → `:892-917`; `foldAnswersIntoShorthand` `:968-1093` →
`:968-1092`; splice decision `:1017-1032` → `:1022-1051`; `answered.size === 0` `:1064` →
`:1060`. **`[FIX]`** `shorthandResultFromCompile` `:1590-1600` → `:1429-1448`: this cite was
ALREADY wrong at 504d22bb (`git show 504d22bb:… | grep -n` → `1429`). The claim it supports (no
material binding map on the done payload) is verified independently: no `materialRefs` /
`resolvedByLabel` / `outputs` symbol exists in the file.

**[MOVE] M4 — `server/src/ai/types.ts` +4 lines.** `AgentClarificationRequest` `:584-618` →
`:584-622`; `unresolvedFact` `:617` → `:621`; `AgentClarificationAnswer` `:621-628` → `:624-630`
(`ref?: Record<string, unknown>` `:630`). App mirror `app/src/types/ai.ts:270-288` and
`:290-297` HOLD byte-exactly.

**[MOVE] M5 — small drifts elsewhere.** `systemPrompt.ts` selected-wells read `:665-673` →
`:672-673` (`formatSelectedWells` `:70-86` holds). `resolveNounsPass.ts` `ResolveNounsOutput`
`:140-147` → `:140-146`; the §5.2 sweep `:259-283` → `:259-284`; `answeredSlots` `:117-123`
HOLDS. `scientist-intent.schema.yaml` `targetWells` `:107-113` HOLDS; `volume: {}` `:167` →
`:166`; `volumeUl`/`type: number` `:167-168` HOLDS. `vocabulary.ts` contractBlock `:375-393` HOLDS as a
function range (`:375-392`); only the inner anchors shift (the `?` render `:380` → `:379`).
`compileScientistIntent.ts`
`ScientistIntentCompileResult` `:132-140` → `:133-141`. `aiPromptMentions.ts` `MENTION_PATTERN`
`:4` → `:3`; `parsePromptMentions` `:106-108` HOLDS. `WellSelectionContext.tsx` `:190+` →
`useWellSelection` `:195-199` (context `:32`). `ClarificationPicker.tsx` material mention token
`:176` → `:232` (grounded-record token `:192`). `ChatPreviewCard.tsx` — **every** pin HOLDS
(`:51-95`, `:112`, `:114`, `:141-171`, `:163`, `:165`, `:167`, `:183`, `:192`).
`submitSuggestionTool.ts:635-647`/`:645`/`:646`/`:647`, `shorthandChat.ts:1345`/`:1378`,
`wellRange.ts:38`, `AgentOrchestrator.ts:596`, `HarnessChatPane.test.tsx:177`,
`foldNullArms.test.ts:516`, `config/drafting/shorthand-drafting.yaml:27`/`:49`,
`nounShape.ts:29`/`:52`, `RunSurfaceChatBridge.tsx:51-62` — all HOLD.

**[ADAPT] S1 — CARD-1 merged PARTIAL: 3b DEFERRED, so there is NO V2 bar to exempt.**
The ratified Change 3 said "CARD-1's V2 bars a document whose quantity the prompt never stated …
a naive V2 re-bars it forever", and OQ2 built the provenance exemption on that premise. On trunk
`4a65d4c1` the merge message states 3b is DEFERRED BY RULING and `volumeUl.required: false`
stays the fact of record; `nounCoverage.ts` is the W12 (resolvable-slot) gate only
(`:121`), and `resolveNounsPass.ts:485-488` is the only answered-slot interaction. The loop
therefore closes because the FOLD WRITES THE VALUE (`argumentPresent` `:252-257`, number arm
`:255`) and the sweep is recomputed from the folded intent (`:462`). OQ2's ruling stands but its
trigger condition ("ONLY if CARD-1's merged shape lacks it") is now satisfied by construction: no
hunk is needed unless the RED proves otherwise, and then only `:485-488`.

**[ADAPT] S2 — the chip mounts at CARD-1's `record()` seam, first in the ternary.**
The ratified text said "inserts TWO components at CARD-1's existing per-slot control seam". The
merged seam is concrete: `ChatClarificationCard.tsx:160-197` is
`hasPicker ? <ClarificationPicker/> : options.length > 0 ? <ol/> : <ParameterAnswerInput/>`, and
the ONLY answer sink is `record(request, answer)` (`:105-107`) feeding `picks` → `allAnswered`
(`:112`) → `submit` (`:117-123`) → `clarificationAnswersPrompt` (`:122`). So: add
`request.clarifyControl?.kind === 'quantity'` / `==='wells'` as the FIRST arms, wired to
`record`. No new state, no new Submit, no change to `allAnswered`. CARD-1's pins that must stay
green: `ChatLog.grouped.card1.test.tsx:104-106` (1 card / 2 slots / 1 submit).

**[ADAPT] S3 — the n===1 gap: the card does not render for the canonical V2 turn.**
`ChatLog.tsx:373` mounts `ChatClarificationCard` only when
`message.clarificationRequests.length > 1 && onClarificationSubmit`; otherwise `:388` maps
`renderTypedClarification` (`:269-304`), whose guard `:276`
(`if (options.length === 0 && !hasPicker) return null`) DROPS a `clarifyControl` request
(`kind: 'general'`, `menuProvider: 'choice'`, `options: []` — `resolverFor` returns null at
`ClarificationPicker.tsx:34-39`). The ratified spec's assumption ("the chat host renders ONE
element per request … TARGET-1 inserts into CARD-1's card, never here") is FALSE for a
single-fact turn, and the browser gate's V2 leg IS a single-fact turn. Adaptation: the same two
components mount in BOTH seams, and the typed-arm hunk is bounded to (a) the `:276` guard
allowing `request.clarifyControl != null` and (b) one additive answer-surface arm — the n>1
decision at `:373` and CARD-1's n=1 "no card, no submit" pin (`grouped.card1:195-196`) stay
untouched. Raised as OQ4.

**[ADAPT] S4 — same-noun dedupe can collapse two declared slots (new hazard).**
`clarificationDedupe.ts:74-119` groups cards by `(query, actionSignature)`;
`actionSignature` = `JSON.stringify([kind, menuProvider, options])` (`:66-68`), and
`clarificationsFromUnresolvedFacts` sets `query = fact.label` (the argument name). Two
`add_material` actions each missing `volumeUl` therefore share BOTH keys and fold into ONE card —
"one Control per slot" would silently lose a slot. Raised as OQ5; a RED test decides, and a
narrow guard (never fold a card carrying `clarifyControl`) is the only permitted hunk.

**[ADAPT] S5 — do not widen the W12 gate.** `nounCoverage.ts:99-134` is `kind === 'resolvable'`
only (`:121`) and its own header (`:15-25`) explains why `wells` must NOT be required to carry a
`resolve_nouns` binding (it would false-bar every `targetWells` and break green goldens).
Declaring `targetWells` therefore interacts with NO gate. State this in the report so the
reviewer sees it was considered, not missed.

**[ADAPT] S6 — the contract block already carries a second line.** `vocabulary.ts:382-388`
renders any arg with a `teaching:` string as an indented line (`:383` field-presence gate,
`:387` push); `add_material.labware` has one
since LABSTATE fix-4. So test 4's "exactly this line" must be the TWO-line rendering (action line
+ `  labware: …`), and the post-flip action line is the exact string quoted in Change 4
(measured first-hand by calling `contractBlock()` at `4a65d4c1`). A test that asserts only the
action line is fine; a test that asserts the WHOLE block must include the teaching line.

**[ADAPT] S7 — the app-side picker/mint surface is CARD-1's and stays shut.**
`ClarificationPicker.tsx` gained the mint row (`:253-258` state, plus the render) and the
`groundedAnswerFromMention` grounding path (`:175-198`). `requestHasPicker` (`:47-49`) is the
predicate TARGET-1's requests fail, which is exactly why they need their own arm. Mention-token
shapes for P7 are now `:232` (material, `[[${entityKind}:${id}|label]]`) and `:192` (grounded
record) — P7 reads tokens, it does not write them.

**[ADAPT] S8 — typecheck baseline re-measured (10, not 16, not 11).**
First-hand at `4a65d4c1`: server `0`, app `10`, and the app list is BYTE-IDENTICAL to the
504d22bb list (`diff` empty). The CARD-1 merge commit message's "16-line baseline" refers to a
different capture shape (multi-line TS output), and the intermediate l2t0230 file's 11th line
(`tabNavPlugin.ts(102,7)`) does not reproduce. The coder must still re-measure at its own base and
attach the diff.

**[ADAPT] S9 — golden blast radius inventoried first-hand.** 7 fixtures carry
`action: add_material`; only `labware-hint-lookup-failure.yaml` has no `targetWells`/`wells` line
(certain new bar); `foldNullArms.test.ts:516` (`toBe(5)`) is inside the blast radius; the
`MANIFEST.yaml` re-bless would be the third today. Enumerate, do not blanket-rebless.

## PIN TABLE (machine-checkable; final section)

FORMAT: `<path>:<line> | <what it proves>`. Every row was verified first-hand at
`4a65d4c1` (`grep -n` / `sed -n` on the worktree, no writes). Check with
`grep -n "<anchor>" <path>` and compare the printed line number.

```
server/src/compiler/biology/verbs/simpleVerbs.ts:559 | `const volumeUl =` — derived only from declared params (volume_uL/volume_ul/numeric volume/material.volume_uL); no TS default
server/src/compiler/biology/verbs/simpleVerbs.ts:587 | `const resolvedVolumeUl =` — the uL-only derivation
server/src/compiler/biology/verbs/simpleVerbs.ts:593 | `const volumeDetails:` — the details spread both emit branches use
server/src/compiler/biology/verbs/simpleVerbs.ts:617 | legacy add_material event: `material` is a LABEL string (OQ3: no id on the event)
server/src/compiler/biology/verbs/simpleVerbs.ts:642 | modern add_material event: `...(typeof material === 'string' ? { material } : {})` (OQ3)
server/src/mcp/tools/aiPlanningTools.ts:343 | the ONLY `?? 100` volume default in server/src — MCP transfer planning, NOT the shorthand compile path
server/src/ai/submitSuggestionTool.ts:635 | `shorthand:` description start (byte-frozen)
server/src/ai/submitSuggestionTool.ts:645 | `'    volumeUl: 100\n'` — the frozen example the model copies
server/src/ai/submitSuggestionTool.ts:646 | `'    targetWells: [A1]\n\n'` — same example
server/src/ai/submitSuggestionTool.ts:647 | `+ SHORTHAND_CONTRACT_BLOCK` — the generated block embed
server/src/ai/shorthandChat.ts:1345 | repair prompt 1 `'    volumeUl: 100'`
server/src/ai/shorthandChat.ts:1346 | repair prompt 1 `'    targetWells: [A1]'`
server/src/ai/shorthandChat.ts:1378 | repair prompt 2 `'    volumeUl: 100'`
server/src/ai/shorthandChat.ts:1379 | repair prompt 2 `'    targetWells: [A1]'`
schema/scientist-intent/scientist-intent-vocabulary.yaml:246 | `- name: add_material` verb block
schema/scientist-intent/scientist-intent-vocabulary.yaml:294 | `- name: volumeUl` under add_material
schema/scientist-intent/scientist-intent-vocabulary.yaml:296 | `required: false` — FACT OF RECORD at CARD-1 merge (flip lands in TARGET-1)
schema/scientist-intent/scientist-intent-vocabulary.yaml:300 | `- name: composition` — last add_material arg today
schema/scientist-intent/scientist-intent-vocabulary.yaml:305 | `itemNounField: material` — insertion point for targetWells is AFTER this line
schema/scientist-intent/scientist-intent-vocabulary.yaml:531 | `- name: aliquot` — the precedent verb
schema/scientist-intent/scientist-intent-vocabulary.yaml:556 | SPINE-7 comment: address arg declared required, sweep route-reachable
schema/scientist-intent/scientist-intent-vocabulary.yaml:559 | `- name: targetWells` under aliquot
schema/scientist-intent/scientist-intent-vocabulary.yaml:561 | `required: true` on a `kind: wells` arg — the exact declaration shape TARGET-1 copies
server/src/compiler/resolution/resolveNounsPass.ts:65 | `MISSING_REQUIRED_ARGUMENT_REASON = 'missing-required-argument'`
server/src/compiler/resolution/resolveNounsPass.ts:123 | `answeredSlots?: readonly AnsweredNounAnswer[]` — the answered-slot channel (OQ2)
server/src/compiler/resolution/resolveNounsPass.ts:252 | `function argumentPresent` — presence predicate
server/src/compiler/resolution/resolveNounsPass.ts:255 | number arm of argumentPresent — a written number counts as PRESENT (the loop closes here)
server/src/compiler/resolution/resolveNounsPass.ts:259 | `export function requiredArgumentClarifications` — the §5.2 data-driven sweep
server/src/compiler/resolution/resolveNounsPass.ts:269 | `if (contract.kind === 'scalar') continue` — kind decides eligibility
server/src/compiler/resolution/resolveNounsPass.ts:270 | `if (contract.required !== true) continue` — the flag TARGET-1 flips
server/src/compiler/resolution/resolveNounsPass.ts:274 | `reason: MISSING_REQUIRED_ARGUMENT_REASON`
server/src/compiler/resolution/resolveNounsPass.ts:275 | `actionLocation: {` — the slot identity the card/fold key off
server/src/compiler/resolution/resolveNounsPass.ts:462 | `const required = requiredArgumentClarifications(deps.intent, …)` — recomputed from the FOLDED intent
server/src/compiler/resolution/resolveNounsPass.ts:485 | `settledEngineClarifications` — the answered-slot DROP arm
server/src/compiler/resolution/resolveNounsPass.ts:487 | `return c.reason === MISSING_REQUIRED_ARGUMENT_REASON;` — required facts are deliberately KEPT (the only permitted loop hunk site)
server/src/compiler/resolution/resolveNounsPass.ts:140 | `export interface ResolveNounsOutput` (OQ3: bindings/resolvedByLabel exist, unused by the done payload)
server/src/compiler/resolution/resolveNounsPass.ts:143 | `resolvedByLabel` — the map the OQ3 fallback would source from
schema/workflow/scientist-intent.schema.yaml:107 | `targetWells:` key on the action
schema/workflow/scientist-intent.schema.yaml:113 | end of the array-or-string oneOf (address ARRAY or scalar STRING on the wire)
schema/workflow/scientist-intent.schema.yaml:166 | `volume: {}` — the object-form volume slot
schema/workflow/scientist-intent.schema.yaml:167 | `volumeUl:` key
schema/workflow/scientist-intent.schema.yaml:168 | `type: number` — the fold must write a NUMBER
server/src/ai/shorthandChat.ts:857 | `export function clarificationsFromUnresolvedFacts` — the stamping seam
server/src/ai/shorthandChat.ts:869 | `const nounShape = loadNounShape()` — per-call DATA loader idiom to mirror
server/src/ai/shorthandChat.ts:876 | `const domain =` — declared-contract lookup per fact
server/src/ai/shorthandChat.ts:879 | `const kind =` — domain→kind map
server/src/ai/shorthandChat.ts:888 | `const nounPrompt =` — the template the clarifyControl arms must NOT use
server/src/ai/shorthandChat.ts:892 | `return {` — the request object (conditional-spread site for clarifyControl)
server/src/ai/shorthandChat.ts:908 | `options: (readings ?? []).map(` — stays `[]` for the new arms
server/src/ai/shorthandChat.ts:917 | function end
server/src/ai/shorthandChat.ts:968 | `export function foldAnswersIntoShorthand` — the fold seam
server/src/ai/shorthandChat.ts:1022 | `const slotKey =` — slot location resolution (string/array only)
server/src/ai/shorthandChat.ts:1031 | `if (typeof slotValue === 'string')` — string splice arm
server/src/ai/shorthandChat.ts:1033 | `} else if (Array.isArray(slotValue))` — array splice arm
server/src/ai/shorthandChat.ts:1049 | `} else {` → `return null` (:1050) — a numeric/absent slot CANNOT fold today (the RED this item fixes)
server/src/ai/shorthandChat.ts:1052 | `answered.add(fact)`
server/src/ai/shorthandChat.ts:1053 | `answeredSlots.push({ actionIndex, argument, label })`
server/src/ai/shorthandChat.ts:1060 | `if (answered.size === 0) return null`
server/src/ai/shorthandChat.ts:1063 | `const filledLabels` — doc.unresolved removal
server/src/ai/shorthandChat.ts:1092 | fold function close (the `throw error` catch tail is :1088-1092)
server/src/ai/shorthandChat.ts:1429 | `export function shorthandResultFromCompile` — no material binding map on the done payload (OQ3); cite MOVED from :1590
server/src/ai/types.ts:584 | `export interface AgentClarificationRequest`
server/src/ai/types.ts:621 | `unresolvedFact?` — last field today; the additive `clarifyControl?` lands beside it
server/src/ai/types.ts:624 | `export interface AgentClarificationAnswer`
server/src/ai/types.ts:630 | `ref?: Record<string, unknown>` — free-form ref carries `{kind:'quantity', value, unit}`
app/src/types/ai.ts:270 | `export interface AiClarificationRequest` (mirror)
app/src/types/ai.ts:288 | interface end (`materialLayer?` is last)
app/src/types/ai.ts:290 | `export interface AiClarificationAnswer`
app/src/types/ai.ts:297 | interface end
app/src/shared/hooks/clarificationAnswerPrompt.ts:18 | single builder `clarificationAnswerPrompt`
app/src/shared/hooks/clarificationAnswerPrompt.ts:24 | `` return `Use ${value} for ${target}.` `` — byte-stable sentence shape
app/src/shared/hooks/clarificationAnswerPrompt.ts:29 | batch builder `clarificationAnswersPrompt`
app/src/shared/hooks/clarificationAnswerPrompt.ts:41 | batch end (joined with a single space)
app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:34 | `resolverFor` — only /l,/e,/m or kind labware
app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:47 | `requestHasPicker` — FALSE for a clarifyControl request (no picker competes)
app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:192 | grounded-record mention token `[[${recordType}:${id}|${label}]]`
app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:232 | material mention token `[[${mention.entityKind}:${id}|${label}]]`
app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:253 | mint-row state (CARD-1 merged; OUT of scope)
app/src/shared/lib/aiPromptMentions.ts:3 | `MENTION_PATTERN` (cite MOVED from :4)
app/src/shared/lib/aiPromptMentions.ts:39 | `const [id = '', label = id] = body.split('|')` — id/label split
app/src/shared/lib/aiPromptMentions.ts:106 | `parsePromptMentions` — the ONE parser P7 reuses
app/src/agent/ChatPreviewCard.tsx:51 | `function eventDetailLine` — the declarative detail doctrine
app/src/agent/ChatPreviewCard.tsx:95 | eventDetailLine end (volume/cycles/duration/temperature only — no well/material)
app/src/agent/ChatPreviewCard.tsx:97 | `ChatPreviewCard({ chat }: { chat: UseAiChatReturn })` — `chat.messages` available for recordIds
app/src/agent/ChatPreviewCard.tsx:112 | `<section … aria-label="Proposed deck changes">`
app/src/agent/ChatPreviewCard.tsx:114 | title `Proposed deck changes`
app/src/agent/ChatPreviewCard.tsx:141 | `{events.map((event) => {` — the row map
app/src/agent/ChatPreviewCard.tsx:163 | `data-testid={`chat-preview-toggle-${event.eventId}`}`
app/src/agent/ChatPreviewCard.tsx:165 | `onClick={() => chat.setPreviewEventState(...)}` — the D1 pin (no new write path)
app/src/agent/ChatPreviewCard.tsx:167 | `{dropped ? 'Include' : 'Drop'}` — the row verb to align with the bar
app/src/agent/ChatPreviewCard.tsx:183 | `Apply` — bar verb
app/src/agent/ChatPreviewCard.tsx:192 | `Discard` — the bar's reject verb the rows must reuse
app/src/agent/ChatClarificationCard.tsx:105 | `const record = (request, answer) => setPicks(...)` — the ONLY per-slot answer sink
app/src/agent/ChatClarificationCard.tsx:112 | `const allAnswered = requests.every(...)` — Submit gate
app/src/agent/ChatClarificationCard.tsx:143 | `<section … data-testid="chat-clarification-slot">` — per-slot container
app/src/agent/ChatClarificationCard.tsx:160 | `{hasPicker ? (` — the answer-surface ternary (insertion seam, chip FIRST)
app/src/agent/ChatClarificationCard.tsx:197 | `)}` — ternary end
app/src/agent/ChatClarificationCard.tsx:201 | `{onClarificationSubmit ? (` — one Submit
app/src/agent/ChatClarificationCard.tsx:206 | `disabled={disabled || !allAnswered}` — pristine prefill is impossible
app/src/agent/ChatLog.tsx:269 | `function renderTypedClarification` — the n===1 arm
app/src/agent/ChatLog.tsx:276 | `if (options.length === 0 && !hasPicker) return null` — DROPS a clarifyControl request today (OQ4)
app/src/agent/ChatLog.tsx:366 | `{answered ? (` compact answered row
app/src/agent/ChatLog.tsx:373 | `message.clarificationRequests.length > 1 && onClarificationSubmit` — the n>1 card decision (unchanged)
app/src/agent/ChatLog.tsx:388 | `clarificationRequests?.map((request) => renderTypedClarification(...))` — single-request path
app/src/agent/HarnessChatPane.tsx:373 | `onClarificationPick` → `clarificationAnswers: [answer]` (single-slot channel)
app/src/agent/HarnessChatPane.tsx:383 | `onClarificationSubmit` → `clarificationAnswers: answers` (batch channel; unchanged)
app/src/agent/HarnessChatPane.test.tsx:177 | `chat-preview-toggle-EVT-1` testid pin
app/src/agent/ChatLog.grouped.card1.test.tsx:104 | exactly 1 `chat-clarification-card`
app/src/agent/ChatLog.grouped.card1.test.tsx:105 | exactly 2 `chat-clarification-slot`
app/src/agent/ChatLog.grouped.card1.test.tsx:195 | n=1 ⇒ NO card (TARGET-1 must not break this)
app/src/event-editor/deck/PreviewActionBar.tsx:149 | deck bar verbs (OUT of scope)
app/src/event-editor/right-pane/ai/ChangesPanel.tsx:99 | deck-side rows (OUT of scope)
app/src/run/RunSurfaceChatBridge.tsx:51 | `const chatContext = useMemo<AiContext>` — the selection carrier
app/src/run/RunSurfaceChatBridge.tsx:57 | `selectedWells: selection ? { labwareId, wells } : null` — the wire shape the gate drives
app/src/run/RunSurfaceChatBridge.tsx:62 | memo end
server/src/ai/systemPrompt.ts:70 | `function formatSelectedWells` — `(none selected)` when absent
server/src/ai/systemPrompt.ts:672 | `const selectedWells = formatSelectedWells(context.selectedWells)` (cite MOVED from :665)
server/src/ai/systemPrompt.ts:673 | `sections.push('Selected wells: …')` — only when a selection exists
server/src/compiler/scientistIntent/vocabulary.ts:375 | `const contractBlock = (): string =>` (ratified range :375-393 HOLDS)
server/src/compiler/scientistIntent/vocabulary.ts:379 | `` `${a.name}${a.required ? '' : '?'}:${a.kind}…` `` — the `?` IS the required flag (data→prompt)
server/src/compiler/scientistIntent/vocabulary.ts:383 | teaching-line gate (`if (typeof a.teaching !== 'string') continue`)
server/src/compiler/scientistIntent/vocabulary.ts:387 | `lines.push(`  ${a.name}: ${a.teaching}…`)` — the second contract line (LABSTATE fix-4)
server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts:16 | existing `toContain('add_material — source?')` pin (must stay green)
server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts:56 | FIX4 teaching leg (presence + byte-parity)
server/src/ai/AgentOrchestrator.ts:596 | `defaultScientistIntentVocabulary().contractBlock(),` — the block the model reads (zero hunks)
server/src/compiler/scientistIntent/compileScientistIntent.ts:133 | `export interface ScientistIntentCompileResult` (cite MOVED from :132)
server/src/compiler/scientistIntent/compileScientistIntent.ts:141 | interface end — NO `outputs`, no material binding map (OQ3)
server/src/compiler/scientistIntent/compileScientistIntent.ts:390 | `const unbound = unboundDeclaredSlots(compileIntent, vocabulary, nounsOutput)` — W12 gate wiring
server/src/compiler/resolution/nounCoverage.ts:99 | `unboundDeclaredSlots` — the W12 slot-coverage gate
server/src/compiler/resolution/nounCoverage.ts:121 | `if (contract.kind !== 'resolvable') continue` — wells/quantity NOT covered (do not widen)
server/src/compiler/resolution/clarificationDedupe.ts:66 | `function actionSignature` — `JSON.stringify([kind, menuProvider, options])`
server/src/compiler/resolution/clarificationDedupe.ts:74 | `foldSameNounCards` — (query, signature) grouping (OQ5 collapse hazard)
server/src/compiler/pipeline/CompileContracts.ts:298 | `export interface TerminalArtifacts` (full path; the ratified cite omitted the dir)
server/src/ai/wellRange.ts:38 | `export function expandWellTokens` — the ONE well parser
server/src/compiler/resolution/nounShape.ts:29 | `NOUN_SHAPE_POLICY_PATH` — the config-path idiom to mirror
server/src/compiler/resolution/nounShape.ts:52 | `loadNounShape` — per-call loader to mirror
server/src/compiler/resolution/nounShape.ts:65 | `throw new Error(`noun-shape data (${displayPath}): \`nounShape:\` must be an object`)` — the malformed-data throw idiom (:74 is the list arm, :59 the unreadable arm)
config/drafting/shorthand-drafting.yaml:27 | `surfaces: [run-workspace, event-editor]`
config/drafting/shorthand-drafting.yaml:49 | `nounShape:` — the section the new `assumedValues:` sits beside
config/drafting/shorthand-drafting.yaml:88 | file end (`blobDetectPatterns` list) — append assumedValues AFTER this
app/src/shared/context/WellSelectionContext.tsx:32 | `createContext<WellSelectionContextValue | null>(null)` — null when absent
app/src/shared/context/WellSelectionContext.tsx:195 | `export function useWellSelection` — the hook the additive `useOptionalWellSelection` siblings
server/tsconfig.json:13 | `"exactOptionalPropertyTypes": true` — the conditional-spread requirement
server/src/ai/shorthandChat.foldNullArms.test.ts:516 | `expect(requests.length).toBe(5)` — IN the required-flip blast radius
server/src/compiler/scientistIntent/goldens/MANIFEST.yaml:1 | the golden bless ledger (re-bless once per the b6bb2386 discipline)
```

RE-PIN COMPLETE





