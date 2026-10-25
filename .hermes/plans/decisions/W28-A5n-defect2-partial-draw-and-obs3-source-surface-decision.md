# W28-A5n — r4 DEFECT-2 (partial-draw survival) + OBSERVATION-3 ('the sample' surface): architect decision

Date: 2026-10-19 (EDT). Lane 2, trunk cl/integration-2 @ c3ed2f27 (read-only inspection;
no product file touched). Inputs verified first-hand, not on the report's word:
receipts /home/brad/.hermes/cl/lanes/2/receipts/W28-A5D-R3/2026-10-19_1208-r4/
(REPORT.md, probe6.json rounds 1-4, trail.json cycles — recapture md5s re-computed:
round2/3/4 = a256d214a0e86dc9e8b510cd..., round1 distinct — the r4 filing is accurate),
code reads at c3ed2f27 (server resolveNounsPass.ts / resolutionEngine.ts /
IntentCompileFromPromptHandlers.ts, app clarificationAdapter.ts /
ProtocolLocalizationThread.tsx / ClarificationPicker.tsx / slashMenu resolvers.ts,
schema/scientist-intent/scientist-intent-vocabulary.yaml), lineage
decisions/W28-A5m-answer-loop-stagnant-labware-class-decision.md,
decisions/W28-A5i-slotless-hedge-bar-decision.md (via the SAMPLE-CARD-1 task block,
task-list ~line 9868), .hermes/plans/2026-10-19_W28-AXISSLUG-1-axisid-normalization-spec.md
(DEFECT-1 already claimed there — not re-adjudicated).

===============================================================================
Q1 — r4 DEFECT-2: partial-draw survival of the answered `/l` microcentrifuge card
===============================================================================

## CLASS VERDICT: (b) NEW-CLASS follow-up task — NOT an A5m/STAGNANT-HEDGE residual,
## NOT accepted-by-design. Named class: OPTION-PICK NON-BINDING. Does NOT need to
## land before r5.

## The mechanism, verified in code (why the answer is inert, byte-identical re-emission
## is the deterministic consequence, not a stochastic glitch):

1. The `/l` card's OPTION buttons cannot emit a binding answer. The wire's clarification
   candidates carry `{label, confidence}` ONLY — the engine strips every record identity:
   `candidateFact` returns just those two fields (server/src/compiler/resolution/
   resolutionEngine.ts:77-79, applied at :91). The UI option-button click therefore has
   no ref to ride: `value = answer.mentionToken ?? answer.label ?? answer.value`
   (app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx:410; the
   option onClick at :791-797 passes `{label: option.label, ...(option.ref ...)}` and
   adapter-built options never carry a ref,
   ProtocolLocalizationThread.clarificationAdapter.ts:180-194 — the option id is a
   positional `held-candidate-<i>-<j>`, not a record). probe6's req confirms it on the
   wire: `"microcentrifuge tube":"1.5 mL Microcentrifuge Tube (seed)"` — a PLAIN LABEL,
   never `[[labware:...|...]]`. Only ClarificationPicker rows emit the idiom
   (`answerFromMention`, ClarificationPicker.tsx:118-131).

2. A plain-label answer is DATA-INERT by the ANSWER-BIND contract. The handler
   constructs `AnsweredNounAnswer[]` only from values matching
   `MENTION_ANSWER_PATTERN` (server/src/api/handlers/
   IntentCompileFromPromptHandlers.ts:212-224) AND store-validated (`:350-354`,
   comment verbatim: "axis answers / plain text: prompt-echo only, as today"). So the
   partial draw's `answeredSlots` is EMPTY → `answeredSlotBindings`' label-key join
   (`answerByKey` built from validated entries,
   server/src/compiler/resolution/resolveNounsPass.ts:303, join :313) has nothing to
   bind → `answeredSlotKeys` is empty → the engine `ambiguous-noun` card is NOT settled
   (drop arm resolveNounsPass.ts:468-471) → it re-bars. The stateless recompile gets a
   materially different prompt (the extra echo line) but an IDENTICAL parse (WIRE-TEMP
   determinism kept the slot raw at "microcentrifuge tube" 4/4), hence 4/4
   byte-identical 422s. Invariant recaptures = the correct proof of an inert input.

3. The STAGNANT-HEDGE consume rule CANNOT cover it — by its own shipped guards, not by
   oversight. `consumeAnsweredLabelHedges` (resolveNounsPass.ts:379-415, merged
   49b5994e) reads MODEL facts only, and guard (3) (:405) keeps any fact whose reason is
   not the stable `NOT_STATED_REASON`. This card is the ENGINE's `ambiguous-noun`
   (reason code minted at resolutionEngine.ts:217), and A5m §Q2's hard constraints say
   the engine arms stay byte-unchanged ("The engine's 'ambiguous-noun'/'unknown-noun'
   cards keep binding via the :313 value join exactly as today"). The A5m root cause was
   also the opposite shape: label DIVERGENT from slot value; here label EQUALS slot raw
   value — the join target hits fine, the join never sees an eligible answer. Different
   reason code, different mechanism (answer-VALUE validation, not key identity). (a) is
   excluded.

4. The completing path does NOT prove a "draw consumed as a whole set" contract — no
   such contract exists. The handler iterates `answers` entries independently
   (validateAnsweredSlots :352 `for (const [key, value] of Object.entries(answers))`;
   composeAnsweredPrompt :148-155 echoes every entry). The completing draw cleared the
   `/l` card through the ECHO arm + engine, not through set semantics: trail.json's
   completing req carries the SAME plain label for microcentrifuge (still no idiom —
   still no binding), plus the `/m` idiom for lysis reagent; the 200/`resolvedLabwares
   lbw-seed-tube-1p5ml` came from the echoed settled-choice line re-shaping the model
   re-parse so the slot value resolved via the labware-hint adapter
   (adapters.ts:114-133) tier-1 to one record. That is A5m §6's named stochastic
   echo-arm luck — it converged in every observed completing run, but it is not a
   guarantee, and it is not what DEFECT-2 is about. (c) is excluded: an option-button
   that looks answerable but whose answer is inert is dead-chrome-class (a control whose
   stated affordance does not do what it appears to do), the repo's own defect standard.

## Scope discipline (why this is non-blocking):
The `/l` card ALSO carries a live picker (`hasSearch: true` in the r4 trail) —
ClarificationPicker rows DO emit `[[labware:<id>|label]]` (ClarificationPicker.tsx:124)
and a picker-pick of the same seed binds via the untouched :313 value-join. The card is
therefore answerable TODAY; the broken surface is specifically the OPTION BUTTON on an
engine ambiguous-noun card. r5 replays the completing path (per the r4 trail's own
known-good plan), which never exercises an option-only partial draw.

## Smallest fix surface (for the follow-up task; NOT an r5 precondition):
Class fix = let an option-button pick carry the record identity the engine already
holds, so it can emit the idiom:
- server/src/compiler/resolution/resolutionEngine.ts:77-79 (`candidateFact`) — add an
  OPTIONAL record handle to a candidate fact, populated only from the candidate's own
  store-backed curie (tier ≤1 / mint affordances get none — anti-fabrication holds, the
  handle is the engine's existing gathered evidence, never a minted value);
- the SPINE-1 frozen unresolved shape's candidate entry
  (schema/workflow/scientist-intent.schema.yaml + wire type) gains the optional field —
  additive-only, golden-fixture integrity pins updated together (the sanctioned
  pin+row pattern);
- app clarificationAdapter.ts:180-194 (option mapping) — ride the handle onto
  `AiClarificationOption` (the `ref?` field at types/ai.ts:200 already exists);
- ProtocolLocalizationThread.tsx:410/:791-797 — when the option carries a handle, emit
  `[[labware:<id>|label]]` (the exact `answerFromMention` shape), else today's label.
This is wire-contract-adjacent (SPINE-1 additive field + server test + app pin), so it
deserves its own spec/RED cycle — one task, zero new drop rules, the :313 join and the
A5m consume rule byte-unchanged. Orchestrator: enqueue under lane 2 (proposed id
W28-OPTIONBIND-1); no gate criterion changes on r5 for it.

## r5 dispatch note (not a new obligation):
The completing path's `/l` clearance rides echo luck (A5m §6 model-quality item, already
non-blocking). If r5's completing draw ever re-bars with an identical
microcentrifuge-tube card, that is fresh evidence for OPTION-PICK NON-BINDING /
echo-drift — route it here, do not re-fail the accept leg on it as a new class.

===============================================================================
Q2 — r4 OBSERVATION-3: 'the sample' (reason 'not-stated', argument 'source') renders /m
===============================================================================

## CLASS VERDICT: DATA-AMENDMENT — add ('not-stated','source') -> '/l' to the declared
## presentation table. It is data-only. It should ship BEFORE r5.

## Domain ruling — 'source' IS labware-semantic by contract, from the declared data:
- schema/scientist-intent/scientist-intent-vocabulary.yaml: EVERY declared `source`
  argument, all 23 verbs that declare it (:18, :55, :73, :104, :213, :263, :294, :323,
  :349, :375, :401, :427, :450, :476, :507, :546, :572, :591, :685, :723, :757, :788,
  ...), is `kind: resolvable` + `domain: labware`; all 21 declared `target` arguments
  likewise (21/21 domain: labware). Material-semantic slots are named `material` /
  `composition` / `source_name` (`domain: material`) — the vocabulary never declares a
  material-domain `source`. The prompt mirror says the same: every
  `source?:resolvable(labware)` (schema/registry/prompt-templates/
  intent.compile.system.yaml:34-65). So a `source`-argument fact answered on `/m` (the
  MATERIAL ontology funnel, resolvers.ts resolveMaterial, with the material mint floor)
  is a domain misroute of the DECLARED kind — the same class SAMPLE-CARD-1/W28-A5i Q2
  cured for `labware`. The r4 fixture proves the semantics from the other side: the
  correct answer to 'the sample' is the seeded labware `lbw-seed-tube-1p5ml`, which the
  completing `/l` path resolved verbatim (trail.json `resolvedLabwares`). "Could source
  legitimately be a material source?" is answered NO by the vocabulary data itself; the
  material need is a DIFFERENT declared argument (`material`).

## The exact amendment (one row, presentation data, ZERO code):
File: app/src/event-editor/right-pane/protocol/
ProtocolLocalizationThread.clarificationAdapter.ts, table
`CLARIFICATION_MENU_BY_REASON_ARGUMENT` (:107-119), 'not-stated' entry:

    'not-stated': { labware: '/l', source: '/l' },

Lookup `menuForFact` (:126-131) is the ONE existing read path — no code change, no
resolver/picker/schema/wire change. The `/l` picker already has no mint floor
(resolveLabware emits none; mint floor is `/m`-only, resolvers.ts). Pin delta required
in the same commit (the sanctioned SAMPLE-CARD-1/GAPCARD-1 deliberate-pin-update
pattern): gapcard test 5 (ProtocolLocalizationThread.clarificationAdapter.gapcard.
test.ts:157-161) currently pins `(reason,'source') -> '/m'` for four reasons — the
'not-stated' line flips to '/l', the other three stay '/m'. sampleCard1 test 1/2 and
test 3's loop are unaffected (labware and unlocated rows unchanged; the reason-table
`:107` fallback `'not-stated': '/m'` stays — a SOURCE-LESS not-stated hedge keeps /m).
RED-first per lane doctrine: one test asserting
`{reason:'not-stated', actionLocation.argument:'source'} -> '/l'`, then the row.

## Sequencing: yes — ship before r5 (rides alongside W28-AXISSLUG-1, app-only TS data
row, tsx --watch reloads, no stack restart). With it, the fold of draw 1 renders the
sample card with the `/l` badge + labware picker, so SAMPLE-CARD-1's F2 / R4-C browser
obligation is evaluable IN the r5 receipts and clears there; the orchestrator should add
to the r5 dispatch criteria: "sample fact card renders with the `/l` badge at first
fold" (observable at fold time, no answering required).

## Recorded observations on this fact (not blockers, not tasked here):
1. bead_beat declares NO `source` argument (vocabulary :812-834: labware, material,
   duration, temperatureC, cycles). The model's `actionLocation.argument:'source'` on
   this card is an emitter-side location the contract does not declare — so an answered
   sample card can never produce a binding there (answeredSlotBindings iterates
   `argContracts(bead_beat)`; STAGHEDGE guard 2 keeps it). F2's observable (renders `/l`,
   answerable via the labware picker) is met by the row; the fact's post-answer
   convergence is the same emitter-discipline line as the echo-drift/model-quality
   non-blocking item, and the completing draw's non-blocking `sample (not-stated)` gap
   stays exactly as r4 measured it. Do NOT fail r5 on sample-answer convergence.
2. Follow-up (enqueue with or beside W28-OPTIONBIND-1, not r5-scoped): the same
   declared-domain argument applies to `(other carded reasons, 'source')` and to
   `'target'` (21/21 domain: labware) — a one-commit generalization of the override
   table once the engine-side cards' surface needs are adjudicated; the engine cards'
   option/picker story intersects Q1's class, so it is not folded into this r5-blocking
   amendment.

===============================================================================
Ruling summary for the orchestrator
===============================================================================
- Q1: NEW-CLASS follow-up (W28-OPTIONBIND-1, engine candidate record-handle + option
  idiom emit). NOT pre-r5. No r5 criteria change beyond the echo-drift routing note.
- Q2: DATA-AMENDMENT, one table row + one deliberate pin flip, data-only, ships in the
  pre-r5 window with W28-AXISSLUG-1; add "sample card renders `/l` at first fold" to
  the r5 dispatch criteria so F2 clears in r5.
- DEFECT-1 / W28-AXISSLUG-1: untouched, as instructed.

W28-A5n DECIDED
