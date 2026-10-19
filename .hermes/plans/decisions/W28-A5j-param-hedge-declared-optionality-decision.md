# W28-A5j declared-optional param hedges — ARCHITECT DECISION (2026-10-19)

Lane 2, trunk 81c9397b (tip confirmed via `git -c core.fileMode=false log --oneline -1`;
containment of b52f5dfc/5cdfb8d0/aea12351/8b2c973a verified by the probe itself,
CONTAINMENT OK line 1-2 of the log). All repos read-only for me; only this file written.

Evidence read first-hand for this ruling:
- `/home/brad/.hermes/cl/lanes/2/logs/step0-probe-a5d-r3v2-l2t2215.log` (16 lines, full):
  5/5 http 422, `needs-clarification`, byte-identical survivor
  `not-stated|Lyse the sample (gate 2025)` every draw (FACT COUNTER = 5), all BOUNDED
  (`bounded_survivors` non-empty, `slotless_survivors: []`), PROBE VERDICT arm C.
  The packet states the three facts (duration/temperatureC/cycles) share the sentence
  label, so the counter collapses them into one key; each carries its own
  `actionLocation {actionIndex:0, action:bead_beat, argument:<param>}`.
- `server/src/compiler/scientistIntent/intentCompile.ts` :61-70 (generated ARGUMENTS
  block, `name?` = optional, GENERATED from `argContracts`), :115-116, :129-131 (the
  hedge rule: hedge required-absences ONLY; NEVER hedge optional absences; label =
  scientist's own word, never a sentence), :107 (closed reason set
  `not-stated | ambiguous | contradicts-the-text`).
- `schema/registry/prompt-templates/intent.compile.system.yaml` :33, :65 (bead_beat line:
  `duration?:scalar, temperatureC?:quantity, cycles?:quantity` — every arg optional),
  :93-95 (mirror rule, byte-in-lock-step).
- `server/src/compiler/resolution/resolveNounsPass.ts` :20-23 (module law: switches on
  identity + engine output + declared contract fields; reason CODES are among the only
  legal string-literal comparisons), :47-49 (`UNRESOLVED_ARGUMENTS_CODE`,
  `MISSING_REQUIRED_ARGUMENT_REASON` — the precedent stable-code constants), :132-144
  (identityKey: actionIndex+argument -> `slot:<i>:<arg>`), :164-221 (§5.1 reconcile:
  DROP on boundKeys :190, MERGE :192-212, KEEP :215-217), :230-235 (`argumentPresent`),
  :237-262 (§5.2 sweep — skips `kind==='scalar'` :247 and `required!==true` :248),
  :284-320 (`answeredSlotBindings`: `kind!=='resolvable'` skip :296, raw-string equality
  :300-301), :360 (sweep call), :383-386 (answer-drop arm + the named sweep exception),
  :388-392 (reconcile call), :435 (`blocked = clarifications.length > 0`).
- `server/src/compiler/resolution/resolutionEngine.ts` :326 — the engine only ever
  touches `resolvable`/`wells` contracts; it produces NOTHING for an absent
  scalar/quantity param.
- `schema/scientist-intent/scientist-intent-vocabulary.yaml` :812-834 — bead_beat args:
  labware/material resolvable required:false; duration scalar required:false
  (:826-828); temperatureC quantity required:false (:829-831); cycles quantity
  required:false (:832-834).
- `.hermes/plans/decisions/W28-A5i-slotless-hedge-bar-decision.md` (full; note: the
  dispatch named `decisions/W28-A5i-...` — the file lives under `.hermes/plans/decisions/`,
  corrected here, contents identical to the cited ruling).
- `logs/step0-probe-f1-l2t1330.log` (full): pre-HEDGE-TYPE-1, 1/5 complete, and its
  survivors were FREE-PROSE bounded-null facts (`bounded_survivors: []` on every F1
  draw) — the class HEDGE-TYPE-1 abolished. Today's survivors are the OPPOSITE shape:
  correctly actionLocation-typed, closed-set reason, WRONG on one axis only.

## PATHNOTE (dispatch correction, minor)

The prior decision and this one live under `.hermes/plans/decisions/` on the trunk, not
`decisions/` at repo root. Fix-run authors should cite the `.hermes/plans/decisions/`
path for all W28-A5* decisions.

## DECISION — option (b), with one guard the packet's wording lacked

RULE (the "declared-optional-absence fold"): in `resolveNounsPass`, a MODEL-side
unresolved fact is MOOT — dropped before the bar — exactly when ALL FOUR of these hold,
each read as data/identity, never as a domain name:

1. the fact carries slot identity: `actionLocation.actionIndex !== undefined &&
   typeof actionLocation.argument === 'string'` (same guard shape as SH-QA-1's :409);
2. that slot resolves to a declared arg contract — `vocabulary.argContracts(action)`
   (from the fact's `actionLocation.action`) contains a contract `c` with
   `c.name === actionLocation.argument`; (no contract -> KEEP — never silently drop a
   fact the data can't speak for);
3. `c.required !== true` (the vocabulary declares the absence legal — data,
   vocabulary.yaml:826-834 for the named facts); AND
4. the argument is ABSENT in the parsed action: `!argumentPresent(fields[c.name])`
   (reusing the sweep's own helper :230-235); AND
5. `fact.reason === NOT_STATED_REASON` — a new exported stable-code constant
   `NOT_STATED_REASON = 'not-stated' as const` beside :49, mirroring
   `MISSING_REQUIRED_ARGUMENT_REASON` exactly (a stable reason code, legal per the
   module law :20-23, NOT a domain/verb/argument name).

(Counted 1-5 for precision; "all five" is the fold's complete trigger.)

Applied to the model facts only (the input of :388's `deps.intent.unresolved`, or a
filter immediately after `reconcileModelUnresolved` returning model-kept facts — fix
run's choice, smallest diff; the folded set MUST NOT be computed by identity-matching
against engine clarifications — engine facts and gated survivors (:406-412) are
untouched by construction).

THE GUARD (4) IS LOAD-BEARING and is the one addition to the ORCH recommendation:
`bead_beat`'s labware/material are ALSO `required:false` (:816-824). Without the
argument-absent guard, a fold keyed only on `required:false + not-stated + bounded`
would swallow SAMPLE-CARD-1's live answer class (a hedged but PRESENT resolvable value
the scientist legitimately answers via '/l'), silently weakening the bar on a surface
that has a working answer path WITH the fix shipped in A5i. With guard (4), the two
classes are separated purely by data: present mention -> answerable, kept; absent
declared-optional -> nothing to answer, folded. No kind check is needed at all —
an absent required:false RESOLVABLE hedge is folded too, correctly: with no raw value,
`answeredSlotBindings` can never bind it (:300 requires `typeof raw === 'string'`), so
it is unanswerable-by-construction exactly like the scalar case, and the fold is its
symmetric remedy.

## WHY (b) AND NOT THE REST

Q1 — The mechanism, first-hand: the model's fact is slot-identified
(`slot:0:duration` etc., :140-141), but NO binding exists for an absent param (nothing
to bind; the engine never even looks at it, resolutionEngine.ts:326) and NO engine
clarification exists (the sweep exempts `required!==true` at :248 — BY DESIGN, the
vocabulary declared the absence legal). So the fact meets neither the DROP (:190) nor
the MERGE (:192) arm and hits KEEP (:215-217) — "bars exactly like an engine
clarification" — and :435 blocks. The emitter violated its own contract
(intentCompile.ts:130, mirror :94 — both explicit, both correct, both byte-verified
present today), deterministically, 5/5.

The fold is the EXACT mirror of §5.2 in the other direction: the sweep is the compiler
trusting DECLARED DATA over the model when the model omits a REQUIRED arg (silence
about a required absence becomes a question the DATA raises, not one the model raises);
the fold is the compiler trusting DECLARED DATA over the model when the model raises a
question about an OPTIONAL absence the data says is not a question. Same source of
authority (`argContracts[].required`), same identity machinery, same class of string
literals (stable reason codes at :47-49 are the sanctioned precedent). Identity/
data-driven, zero domain literals — bead_beat/duration/cycles appear nowhere in the
fold's code, and the fold works identically for every verb's optional args in the
vocabulary, today and after any future vocabulary edit.

Q2 — Anti-fabrication property check (the packet's question, answered concretely):
NO weakening.
- A model that SUPPRESSES a genuinely-needed optional just omits it silently — that is
  ALREADY today's legal behavior for every other caller AND the behavior the prompt
  mandates (:130). The fold changes only the fate of a fact that, had the emitter
  obeyed, would not exist. Post-fold, model-compliance and model-violation converge on
  the SAME outcome: the data-declared one. The vocabulary's `required:false` is the
  authority for both paths.
- The fold CANNOT hide a stated value: guard (4) keeps any hedge whose argument is
  present in the parsed action.
- It CANNOT swallow the other reason codes: `ambiguous` /
  `contradicts-the-text` (:107) are kept — those are stated-but-uncommitted, the class
  the prompt says to keep.
- It CANNOT swallow prose-shaped or unlocated facts: guard (1) keeps slot-less facts
  (the A5i class) so they remain VISIBLE defects, honest FAILs, not silent drops.
- No card can be orphaned: the folded facts never had a menu row anyway (the client
  adapter is reason+argument keyed; a folded fact simply never reaches the surface).
- The scientist still SEES the compiled action lacking the field in the workstate —
  A5i's honesty clause ("the compiled action visibly lacks the field", A5i Q2) is
  adopted verbatim; no notice class is pre-decided either way (A5i Q3's open product
  edge unchanged).

Q3 — WHY NOT (a): the rule text is already maximally explicit on BOTH copies
(intentCompile.ts:130, yaml:94) and the 350M-class emitter violated it 5/5 byte-
identical under WIRE-TEMP determinism. HEDGE-TYPE-1 already spent the "strengthen the
emitter rule" lever and it demonstrably fixed the classes it targeted (slot-less and
prose survivors are GONE per r3-v2 vs F1) — but this emitter class persists. A second
prompt-text iteration against a deterministic violation is the "CHASE THE EMITTER"
rejection (A5i) in costume: more draws/prompt-pokes against a contract the DATA can
enforce itself is waste. (a) stays true-but-insufficient: the prompt keeps its rule
unchanged; the fold is the compiler's backstop for a small-model class the data already
settles.

Q4 — WHY NOT (c): a scalar/quantity answers-map channel is a separate FEATURE (new
answer vocabulary, new surfaces, new provenance questions — A5h's THREAD-ASK-1 line
again). With the fold, its producer on this gate is GONE (no folded fact is ever a
question), so building it now recreates A5i's dead-chrome rejection: an answer surface
with no answerable fact class. It stays DEFERRED for the same reason (iii) was, with
the same named future home (the `missing-required-argument` trigger + W211-MACH-1
harness, A5i Consequences — that class is engine-side, required:true, and remains
NOT folded and NOT answerable; unchanged, recorded there).

Q5 — WHY NOT (d): WIRE-TEMP determinism is working as designed (byte-identical draws
are the point, A5i Q1.1); loosening temperature to randomize around a deterministic
contract violation trades the gate's reproducibility for a coin-flip. Rejected.

## DISCHARGE NOTE — the A5i rejection of "PASS-SIDE HEDGE-SUPPRESSION"

A5i REJECTED a pass-side rule that drops "model facts whose PROSE names a
required:false arg", and this decision adopts a pass-side fold. Not a contradiction;
the named rejection keyed on THREE things this fold does not do, each different for a
recordable reason:
1. It keyed on PROSE (label text naming an argument) — an unjoinable, name-based trust
   judgment. This fold keys on the fact's own `actionLocation` joined to the declared
   contract list — the identity machinery the module is built on (:158-161 "SMALLEST
   GENERIC CODE LOCATION ... identity + engine output + declared contract fields").
2. It was raised when the contradiction still lived in the EMISSION CONTRACT; A5i's
   fix-where-the-contradiction-lives correctly shipped HEDGE-TYPE-1 first. Now the
   contract is correct AND empirically, deterministically violated (5/5) — the
   emission-side lever is spent, and A5i's own arm B protocol ("return log; do not
   force") routed exactly this state to exactly a new decision on exactly named facts.
   This artifact IS that ruling — the one-shape-at-a-time discipline A5i Q4-D named,
   executed on the new bounded `not-stated` class.
3. A5i's clause "the pass cannot distinguish a trustworthy hedge from an
   untrustworthy one" holds for PROSE-based trust — but here the pass does NOT judge
   trustworthiness at all: it asks only what the VOCABULARY + PARSED ACTION say
   (declared optional? absent? stable code?), the identical questions §5.2 already asks.
   No policy of "which model facts to trust" enters; the data decides, always toward
   the outcome the data itself mandates.

## THE FIX RUN — exact files it must touch

TASK PARAM-FOLD-1 (server-side, one module + tests; RED-first):
- `server/src/compiler/resolution/resolveNounsPass.ts` — add `export const
  NOT_STATED_REASON = 'not-stated' as const` beside :49; add the fold (pure function,
  e.g. `declaredOptionalAbsentFacts`/filter, taking intent + vocabulary + the model
  facts), applied so folded facts never enter `clarifications` (:418) and therefore
  never count toward `blocked` (:435). No change to reconcile's DROP/MERGE/KEEP arms,
  the sweep, `answeredSlotBindings`, the gate (:435), or gated survivors.
- Tests: `server/src/compiler/resolution/resolveNounsPass.test.ts` (or a sibling file
  following the `resolveNounsPass.answeredNouns.test.ts` precedent) — see verified-by.
- NO other file. In particular NO changes to: intentCompile.ts, the mirror yaml
  (rules stay as-is; promptShapeParity/mirror-drift suites must stay green UNTOUCHED),
  resolutionEngine.ts, any app/ file, any schema yaml, the fixture, or the probe's
  answers map. A diff touching those in the fix report is itself the defect (the
  HEDGE-TYPE-1 discipline).

VERIFIED-BY additions for the fix task (all fake-LLM/unit level, deterministic):
1. RED pin from the probe verbatim-shape: model facts
   `{label:'Lyse the sample (gate 2025)', reason:'not-stated', actionLocation:
   {actionIndex:0, action:'bead_beat', argument:'duration'|'temperatureC'|'cycles'}}`
   on an intent whose bead_beat action OMITS those params -> after the pass, zero
   clarifications from them, `blocked:false`; assertions iterate vocabulary data for
   the three names (no domain literal in the test either — pin them via
   `argContracts` entries with `required===false`).
2. KEEP-arm guards, each its own test:
   (a) same fact but the param IS present in the action -> KEPT (guard 4);
   (b) reason `ambiguous` on an absent optional -> KEPT;
   (c) NO actionLocation -> KEPT (guard 1);
   (d) actionLocation naming an argument NOT in the verb's contracts -> KEPT (guard 2);
   (e) an absent REQUIRED arg's engine `missing-required-argument` fact is NEVER folded
       (required guard + engine-side untouched — this also pins that the A5i
       named-follow-on class stays visible/unanswerable-by-design).
   (f) a fact on an absent required:false RESOLVABLE param (e.g. kind-resolvable) ->
       FOLDED, and a fact on a PRESENT required:false resolvable (the SAMPLE-CARD-1
       class) -> KEPT — the two-class separation the guard buys.
3. Characterization: an engine clarification and a gated survivor ride the pass
   byte-identically with the fold installed (existing suites green, order preserved).
4. No-prompt-change pin: `hedgeOptionality.test.ts` + `promptShapeParity.test.ts` +
   the mirror-drift suite pass with an EMPTY diff on intentCompile.ts + the mirror yaml.
5. Anti-fabrication posture byte-present: prompt still forbids inventing values
   (existing byte pins in hedgeOptionality.test.ts cover it; no new text needed).

## STEP-0 PROBE r4 (gate consequence)

After PARAM-FOLD-1 merges: containment adds its SHA alongside
b52f5dfc/5cdfb8d0/aea12351/8b2c973a; same fixture, same answers map (gate-exact 4 +
{'the sample': labware idiom}) — do NOT add duration/temperatureC/cycles answers
(A5h Q4 / A5i arm B stand: answering a folded non-question is workaround-class).
5 draws, WIRE-TEMP unchanged. ARMS:
  A >=1 completing draw -> tier-2 A5d r3 proceeds UNCHANGED (all A5i Q4 tier-2
    criteria and its three added assertions verbatim; MAX_REDRAW 8; honest-FAIL;
    two-fails -> infra suspicion per SOP).
  B completing draw still holding the SAME class -> fold defect (it didn't fire) ->
    return per-draw log; fix run returns; do not force.
  C a survivor with reason != not-stated, or slot-less, or param-present -> NEW named
    fact, new decision, one-shape-at-a-time; do not generalize.
  D a prose/classic A5i-class survivor -> emitter regression; HEDGE-TYPE-1 pins
    should have caught it unit-side; honest FAIL.

ARMS IF I PROBED DIFFERENTLY: one cheap zero-code measurement is available NOW if the
orchestrator wants the fold's behavior pinned pre-merge — replay the pass in a unit
harness over the captured r3-v2 clarification JSON with the five guards hand-applied
(receipts to `logs/param-fold-replay-*`); informative only, it does not gate the fix
run (the fake-LLM RED test verifies the same join in-repo). I would NOT re-draw the
model: 5/5 byte-identical is already a deterministic sample.

## UNCERTAINTY

- Single-model, single-fixture evidence: the 5/5 wall is real for THIS emitter build
  at THIS temperature on THIS 61-char fixture; the fold is vocabulary-general, but its
  blast radius beyond this fixture is characterized only by unit tests, not by more
  live draws. Accepted: the fold's outcome always equals the outcome data-compliance
  would produce, so overreach beyond the wall is bounded by that equivalence.
- The clarification payload the UI thread renders is asserted here to be the PASS's
  `clarifications` (the structured payload on the 422/needs-clarification response —
  probe reads it, :444-449 diagnostic path), NOT the raw parsed `intent.unresolved`.
  I verified the pass-side plumbing, not every downstream consumer. THE FIX RUN MUST
  VERIFY: the localization thread / 422 payload source reads the resolve_nouns
  clarifications; if any surface ALSO renders raw parsed unresolved entries, a folded
  fact would ghost there — that surface would need the same view (name it in the
  report; a second fold point is NOT pre-authorized — return it as a new named fact).
- The probe's fact counter cannot distinguish 1 vs 3 surviving facts (same label); the
  packet's account (three, distinct actionLocation args) is taken on the
  orchestrator's per-draw evidence and is consistent with the log. The fold is
  per-fact, so the count does not change the ruling.
- "Label = never a sentence" remains violated by the emitter for the folded class
  (the label is still prose). Post-fold that prose is moot; I am NOT authoring a
  follow-on emitter task to fix the label ON FOLDED FACTS. The rule stays in the
  prompt for the kept classes, where SAMPLE-CARD-1/ANSWER-BIND-1 need it.

HARD-RULE COMPLIANCE: zero domain/verb/param literals (guards read `required`, `kind`
not at all, `argumentPresent`, contract-name join from the FACT's own location, one
stable reason-code constant per the :47-49 precedent); no hardcoding of bead_beat or
any value; the fold is trust-in-data, the repo's core posture ("code interprets the
rules declared in data"); the bar is NOT weakened — it blocks on exactly the facts the
data does not already settle.

DECISION: (b) — the declared-optional-absence fold in resolveNounsPass, guards 1-5
(slot identity + contract exists + required!==true + argument ABSENT + reason==
NOT_STATED_REASON stable code), a pass-side backstop that makes the compiler trust the
vocabulary over a deterministically non-compliant small emitter exactly as §5.2 already
trusts the vocabulary over a silent one; (a) spent, (c) deferred with its producer now
gone, (d) rejected; step-0 r4 gate-exact, A5i arm-B protocol retained, tier-2
criteria unchanged; no fixture edit, no answers-map param workaround, no prompt change,
no new answer surface, no Brad gate (the posture shift is decided by required:false
data, A5i Q3's reasoning applies verbatim and was already the FYI-not-question class).

ARCHITECT DONE W28-A5j
W28-A5j DECIDED
