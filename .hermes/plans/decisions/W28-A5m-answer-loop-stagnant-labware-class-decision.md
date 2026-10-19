# W28-A5m — ANSWER-LOOP STAGNANT-LABWARE class: architect decision

Date: 2026-10-19 (EDT). Lane 2, trunk cl/integration-2 @ a8489a57 (W28-FOLDSENT-1 merged).
Inputs: tmp-orch/probe-r5-l2t0830.out, /tmp/w28a5m-probe.py (read-only diagnostic on :3093,
4 runs, WRITE-FREE /api/intent/compile-from-prompt), code read of the answers pipeline
(server + app) at the merged trunk.

## probe-r5 evidence summary

- Arm A (UI-shaped protocolText + r4's 5-answer map): PASS, 3/3 draws zero surviving
  clarifications (one outcome=complete). The W28-FOLDSENT-1 fix holds on this arm.
- Arm B (axis-only first compile -> answer-every-card loop, handleClarificationPick
  shape, mention idiom per card): FAIL, identical trajectory in all 3 loops.
  Round 1 n=4 (ambiguous-noun 'microcentrifuge tube' @ a0.labware; not-stated
  'sample (gate 2025)' @ a0.source; not-stated 'variant b' @ a0.duration; unknown-noun
  'lysis reagent' @ a0.material). Round 2 n=2 (not-stated 'variant b' @ a2.labware;
  unknown-noun 'variant a' @ a1.labware). Round 3 n=1: not-stated 'variant b' @
  a2.labware — STAGNANT, byte-identical on every subsequent round, despite the label
  being answered with `[[labware:...]]` from round 1 onward.
- Two aggravating facts visible in the log: (i) the label 'variant b' is carried by TWO
  different cards at two different locations (a0.duration, then a2.labware) — the answers
  map is keyed BY LABEL, so the second card inherits the first card's answer (the probe
  skips re-adding an existing key; the UI overwrites the shared key with the latest pick);
  (ii) the surviving card's label is a model hedge word, not a slot value.

## Q1 — root cause, grounded in code

VERDICT: it is neither a pure label-collision bug nor a pure re-emission problem. It is an
ANSWER-BIND IDENTITY GAP: the answer binds by (answer KEY == raw SLOT VALUE), but a
model-emitted not-stated card is keyed by the model's own hedge LABEL, which the emitter
prompt does NOT constrain to equal the slot value. When label != slot value, the card is
unanswerable by construction — every drop path misses it — and the stateless re-compile
re-emits the model fact every round. Label collision is a real aggravating sub-class, not
the root cause.

Mechanism chain (file:line at a8489a57):

1. The wire contract keys answers by label. `CompileFromPromptBody.answers:
   Record<string,string>` (server/src/api/handlers/IntentCompileFromPromptHandlers.ts:126);
   the ANSWER-BIND validator emits `AnsweredNounAnswer { label: key, ... }`
   (IntentCompileFromPromptHandlers.ts:350-367, esp. :364 `label: key`). The pass header
   states the join explicitly: "The answers-map KEY — the clarification's own label
   (exact-match target against the parsed intent's raw slot values)"
   (server/src/compiler/resolution/resolveNounsPass.ts:75-77).

2. The binder joins KEY against the RAW SLOT VALUE, not against the fact.
   `answeredSlotBindings` iterates the parsed intent's resolvable-kind slots and matches
   `answerByKey.get(raw.trim())` — the slot's raw string value must EQUAL the answer key
   (resolveNounsPass.ts:296-332, esp. :303 the label-keyed Map and :313 the exact join;
   :308 skips non-resolvable kinds, so a duration/cycles answer can never bind at all).

3. For ENGINE clarifications the two keys coincide, so arm A is clean: the engine's
   clarification label IS the slot's raw value — `clarificationFor` rides `req.label`
   (server/src/compiler/resolution/resolutionEngine.ts:81-94, :89) and the scalar arm
   passes `raw.trim()` as the request label (resolutionEngine.ts:354). Answer key == card
   label == slot value: the :313 join hits, the slot is settled, the clarification is
   dropped (resolveNounsPass.ts:399-409), and reconcile drops the model twin via boundKeys
   (resolveNounsPass.ts:186-190, :196-202). r5 arm A and every converging round in the loop
   ride this arm.

4. For MODEL-side not-stated facts the label is model-chosen free text. The emitter prompt
   commands "label: EXACTLY the scientist's own word for the thing — never a sentence"
   (server/src/compiler/scientistIntent/intentCompile.ts:131) with NO requirement that the
   label equal the slot's raw value. The live diagnostic caught the divergence directly: a
   parse emitted `{label: "sample", reason: "not-stated", actionLocation: {0, bead_beat,
   labware}}` while the parsed slot value at a0.labware was "microcentrifuge tube"
   (/tmp/w28a5m-probe.py run output, round 1, all 4 runs). So an answer keyed by the model
   fact's label ("variant b") misses the :313 join whenever the slot's raw value differs —
   which is exactly the situation the fact itself describes (the model wrote SOMETHING into
   the slot and separately hedged it).

5. No drop path can then fire for the stagnant fact:
   - the PARAM-FOLD keeps it: guard (4) holds a PRESENT hedge as answerable
     (server/src/compiler/resolution/declaredOptionalHedgeFold.ts:99-102,
     `if (argumentPresent(...)) return true` — SAMPLE-CARD-1's deliberate rule; the
     W28-FOLDSENT-1 sentinel arm only folds the sentinel itself, :49-54);
   - reconcile keeps it: no binding exists for slot:2:labware, so boundKeys (:186-190)
     never covers its identityKey and no engine fact shares the key to merge it into
     (resolveNounsPass.ts:196-215);
   - the ANSWER-BIND drop arm never sees it settled: the answer never produced a binding
     for that slot (step 2/4), so settledEngineClarifications (:406-409) is irrelevant.
   So the fact re-enters `clarifications` (:447) and re-bars (:464-481) on every round.

6. Re-emission is the delivery mechanism, not the cause. compile-from-prompt is stateless:
   every round re-parses protocolText + the echoed "SCIENTIST-RESOLVED CHOICES" block
   (composeAnsweredPrompt, IntentCompileFromPromptHandlers.ts:148-157) fresh. The echo arm
   is stochastic luck — my 4 diagnostic draws drifted (3 reached zero by round 2-3 when the
   model's echo-influenced re-parse happened to omit or re-shape the hedge; r5's 3 loops
   happened to re-emit the identical a2.labware hedge, deterministically enough to
   stagnate). A class whose only exit is echo luck is a defect class regardless of draw
   luck.

7. Label collision is a genuine sub-class on both sides of the wire. The answers map is a
   flat label-keyed record on the server (:126, :303) AND in the UI
   (`setClarificationAnswers(prev => ({...prev, [label]: value}))`,
   app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx:409-412, label =
   `request.prompt`, and the adapter maps fact.label -> prompt verbatim,
   ProtocolLocalizationThread.clarificationAdapter.ts:194, :250). Two cards sharing a label
   (r5: 'variant b' @ a0.duration, then @ a2.labware) share ONE answer: the probe never
   re-answers the second card, the UI silently OVERWRITES the first card's answer when the
   second is answered. This is the wire's stated semantics — "the scientist answered the
   MENTION" (resolveNounsPass.ts:293-295 already generalizes one label across every slot
   carrying it) — so collision is a symptom of label-level semantics, not an accidental key
   bug.

## Q2 — class name and fix surface

CLASS NAME: MODEL-HEDGE LABEL-DIVERGENCE (STAGNANT-HEDGE class) — a model-side
not-stated card whose label does not equal its slot's raw value is unanswerable by
construction under the label-key/ slot-value join; label collision is the named sub-class
(2a).

Fix surface ruling: (b) — a consume rule for answered not-stated cards, server-side,
inside the existing ANSWER-BIND machinery. NOT (a), NOT (c) alone.

Ruled fix (smallest defensible): in resolveNounsPass, extend the ANSWER-BIND drop arm with
a FACT-level consume, mirroring the PARAM-FOLD's guard discipline exactly: a model-side
unresolved fact (one arriving via `intent.unresolved` into reconcileModelUnresolved, never
an engine clarification, never the §5.2 sweep, never a gated survivor) is MOOT when all of:
  (1) it carries slot identity (actionLocation actionIndex + argument — same guard shape as
      the fold's guard 1 and SH-QA-1's gate);
  (2) its actionLocation slot is a declared `kind: resolvable` contract of its verb (data
      from argContracts — same read as answeredSlotBindings :306-308; this alone keeps
      scalar cards untouched: no mint-floor, no gate-widening, A5i/A5l discipline holds);
  (3) its reason is the stable NOT_STATED_REASON code (ambiguous / contradicts-the-text
      stay answerable/kept, same as fold guard 5);
  (4) the answers map contains an entry whose key EQUALS the fact's label (exact-label
      identity — never containment; the same join discipline as :313), and that entry's
      value was a store-validated mention (i.e., it is already in `deps.answeredSlots`).
On consume, the fact is dropped BEFORE reconcile/blocked; the slot itself keeps its raw
value for the ENGINE to resolve normally (this rule drops the QUESTION, it does not mint a
binding — the existing :313 value-join stays byte-unchanged for everything it already
settles). This automatically defuses sub-class 2a: one label-answered mention consumes
EVERY fact carrying that label at a resolvable slot — the same "the scientist answered the
mention" generalization already commented at :293-295 and already implemented for slot
bindings.

Why not (a): re-keying the answers map by actionLocation identity changes the SPINE-1/
THREAD-ASK-1 wire contract (422 fact -> answers key), the UI map, ClarificationPicker, and
golden fixtures, and it contradicts the product's stated label-mention semantics. That is
scope-changing and would need Brad; this ruling says the label semantics are salvageable
and (b) closes the class without touching the wire. If Brad later wants per-slot answers,
that is a separate amendment, not a prerequisite for this fix.
Why not (c): the stochastic echo arm is real model-quality drag (and the drift in my
diagnostic runs shows it), but the class has a deterministic server-side hole — an
unanswerable-by-construction card — and fixing (b) makes loop convergence independent of
echo luck. Record "echo-arm drift" as a noted non-blocking model-quality item for the
A5i/A5l-style discipline file, not a task here.
Why not (d) something else: the grounding above shows the slot-value join is CORRECT for
engine cards (arm A passes 3/3) — replacing it wholesale would be widening, not smallest.

Hard constraints on the fix (carry into the spec): server-only, one module
(resolveNounsPass.ts / reconcile stage), zero new reason codes, zero verb/argument/kind
NAME literals (identity + declared contract data + the two stable codes only), no change to
composeAnsweredPrompt, validateAnsweredSlots, the 422 envelope, the fold leaf, or any app
file. The engine's 'ambiguous-noun'/'unknown-noun' cards keep binding via the :313 value
join exactly as today.

## Q3 — gate sequence ruling: W28-A5D-R3 MUST WAIT for this fix

Verified in code: the gate's card-answering path is the same label-keyed map.
ProtocolLocalizationThread.tsx:405-420 — `handleClarificationPick` keys
`clarificationAnswers` by `request.prompt` (:409, :412) and re-sends
`answers: {...answers, ...clarificationAnswers, [label]: value}` (:419); the adapter sets
`prompt` = the fact's label (clarificationAdapter.ts:194, :250); 'not-stated' cards are
carded via the `CLARIFICATION_MENU_BY_REASON` table row `'not-stated': '/m'` (added by
SAMPLE-CARD-1, W28-A5i Q2). So any not-stated card whose label diverges from its slot value
— the exact R3-r2 named-residual-set pattern ("every UI compile leaves a residual set that
drifts/grows") — stagnates the UI loop exactly as arm B did. Arm A's 3/3 zero-survivor does
NOT clear the gate: its answer keys ("microcentrifuge tube", "lysis reagent", "the sample")
were supplied out-of-band and happen to hit the engine value-join; the gate exercise DERIVES
its answers from the cards themselves, i.e. it walks the broken model-hedge arm.
Ruling: W28-A5D-R3 stays blocked. Sequence: (1) this ruling lands ('W28-A5m DECIDED');
(2) orchestrator raises the STAGNANT-HEDGE consume rule as a server-only coder task (RED
first: a unit test with a label-divergent not-stated fact + label-keyed validated answer
-> today it re-bars, after the fix it consumes); (3) after merge, a step-0 probe r6 on the
merged trunk: arm B loop, 3 draws, PASS CONDITION >=1 (target all) zero-clarification loop
draws — deterministic proof, no fixture-route substitute; (4) only then dispatch the
tier-2 gate re-shoot, criteria UNCHANGED (A5d discipline: no gate re-shoot into a known
class, no mint-floor answers, no widened gate answers). The F2 browser obligation
(sample renders /m not /l) stays open and rides the gate as before.

## Non-blocking notes (recorded, not tasked here)

- Duration/cycles not-stated cards are unbindable by the :313 join BY DESIGN (kind: scalar,
  :308) and exit only via the FOLDSENT sentinel fold or echo luck; the gate must not lean
  on answering them. Consistent with the no-mint-floor ruling.
- Echo-arm drift: model re-parse variance across draws on the same trunk is confirmed live
  (my 4 diagnostic runs drifted; r5's 3 loops were stable). Model-quality item, out of lane,
  per A5i/A5l discipline.
- Orch's corroborating screen (task-list BLOCKER WATCH 09:55: label-keyed join +
  request.prompt keying) aligns with this ruling's steps 1/2/7.

W28-A5m DECIDED
