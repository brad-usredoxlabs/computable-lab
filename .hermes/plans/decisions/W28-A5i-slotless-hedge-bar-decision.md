# W28-A5i slot-less hedge bar — ARCHITECT DECISION (2026-10-18)

Trunk at decision time: b7ebdf2c (docs-only above 5cdfb8d0; ANSWER-BIND-1 b52f5dfc and
ANSWER-SURFACE-1 5cdfb8d0 re-confirmed as ancestors via
`git merge-base --is-ancestor 5cdfb8d0 HEAD` -> ANCESTOR-OK; b52f5dfc is 5cdfb8d0's
first parent). Evidence: /home/brad/.hermes/cl/lanes/2/logs/step0-probe-a5d-r3-l2t1210.log
(x5 draws, 0/5 complete, http 422 every draw, byte-identical survivor set on all five:
`lysis duration not stated|bead_beat duration`, `number of bead-beating cycles not
stated|bead_beat cycles`, `scientist referred to 'the sample' ...|sample`;
`bounded_survivors: []` on every draw — the probe's own bounded test (:67-76,
actionLocation-presence OR carded reason) proves all three are slot-less AND uncarded).
Rides on: W28-A5h (Q4.6 arm 2 — this is that arm arriving; its "Honest residual" named
this class and forbade pre-authorization — this artifact IS the authorized ruling on the
named facts), W28-A5g Q1 (bar correct by design) + its Q2.3 (never append invented
values to protocol text; "the honest fold of genuinely unspecified parameters is the
product's job"), W28-A5d ("fix the emitter, not the rule"; V6 drift class; (b)/(c)
CLOSED), W28-A5-accept-leg (fixture change to a no-held-facts compile REJECTED as (d)).
No stack touched, no product code changed. Only this file written. All git via
`git -c core.fileMode=false`.

## Q1 — ROOT CAUSE: (a) for the two PARAMETER hedges, (c) for the SAMPLE hedge; NOT (b).

Three separate mechanisms, all verified first-hand at b7ebdf2c (identical to 5cdfb8d0
in all cited files; the two commits above it are docs-only handoffs):

1. THE EMITTER'S OWN CONTRACT MANDATES THE PARAMETER HEDGES — a contract-vs-data
   contradiction, class (a). `server/src/compiler/scientistIntent/intentCompile.ts:101`
   (the GENERATED closed-vocabulary system prompt): "If a parameter is ambiguous or
   missing, put it under unresolved instead of inventing it." The fixture text genuinely
   leaves bead_beat duration/cycles unstated, so a deterministic emitter (WIRE-TEMP-1 is
   confirmed working — the probe's survivor set is IDENTICAL on all 5 draws) emits the
   hedge EVERY draw. But the vocabulary declares those args `required: false`
   (`schema/scientist-intent/scientist-intent-vocabulary.yaml:826-834`:
   duration kind:scalar required:false, cycles kind:quantity required:false), and the
   engine's own sweep exempts exactly that class: `resolveNounsPass.ts:246-251` skips
   `kind === 'scalar'` and `required !== true` contracts — the engine NEVER asks about an
   unstated optional param. So the emission-side rule contradicts the declared data: the
   model manufactures a BLOCKING question for an absence the system's own vocabulary
   declares legal. The bar itself is innocent (see 4). Note what changed since A5g fact 5:
   the hedges were draw-dependent flake then; WIRE-TEMP-1's determinism converted
   draw-dependent hedging into a permanent 0/5 wall — a foreseen consequence of fixing
   the drift, and exactly why the contract rule, not the temperature, is the residue.

2. THE SAMPLE HEDGE IS AN ANSWER-SURFACE GAP, class (c), with TWO sub-gaps, both
   structural:
   (i) NO CARD. The menu lookup is keyed (reason, argument) with the reason table as the
   mandatory first gate: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts:46-50`
   (only `unknown-noun`/`ambiguous-noun`/`resolution-lookup-failed` get '/m'),
   `:59-61` (the only argument override), `:69-73` (`menuForFact`: "A reason with NO menu
   row never gets a card, argument or not"). A model hedge's reason is free prose -> no
   row -> no card -> the thread's honest infoMsg line with NO answer control (adapter
   header :16-18, :104). The tier-2 browser gate therefore cannot answer it in-product —
   the same unanswerable-by-construction class as A5c root cause 2.
   (ii) NO SLOT IDENTITY. The probe shows no `actionLocation` on any survivor, so
   `identityKey` falls to `label:<free prose>` (`resolveNounsPass.ts:132-141`), which can
   never equal a `slot:<i>:<arg>` or `label:<slot raw>` bound key, so ANSWER-BIND-1 can
   never drop it even when its slot IS settled: the DROP arm joins exact identity
   (`:203` boundKeys / :165-equiv drop), and `answeredSlotBindings` binds ONLY
   `kind:'resolvable'` slots whose raw string EQUALS the answers-map key
   (`:284-306`, `:296`) — a prose label never equals a slot's raw mention, and an
   answers-map key can never equal a prose hedge label. The frozen contract SUPPORTS the
   fix shape the model isn't using: `actionLocation` is legal on unresolved facts
   (`schema/workflow/scientist-intent.schema.yaml:236-249`) and normalize PRESERVES it
   (`parseScientistIntent.ts:133-138,145`).

3. WHY OPTION (i)-STYLE ANSWERS CANNOT SETTLE THESE DETERMINISTICALLY AT CODE LEVEL
   (answers the packet's r1/r2 question precisely): the answered-prompt channel appends
   `- <key> = <value>` verbatim (`IntentCompileFromPromptHandlers.ts:148-158`) and the
   DATA channel (`:350-369 validateAnsweredSlots` -> `:435 answeredSlots` -> pass
   `:284-306`) binds ONLY resolvable noun slots. A duration/cycles answer has NO data
   path to the scalar/quantity slot at all — clearing it depends entirely on the model
   re-reading the settled block and moving the value into the action field: the
   drift-hostage re-emission class ANSWER-BIND-1 was built to abolish (A5h point 2,
   "clearing then depends on the model re-emitting ... drift-hostage, the A5d V6 failure
   mode"). Note the probe never even SENT duration/cycles/sample answers (script :54-59),
   so headless evidence on whether prose-silencing-by-prompt works for 'sample' does not
   exist yet — F1 below measures it (cheap, and its answer does not change the fix set
   for the parameters, only the 'sample' headless route).

4. THE BAR IS CORRECT AND STAYS: `resolveNounsPass.ts:435` `blocked = clarifications.length > 0`
   plus the KEEP arm (`:215-217`, "bars exactly like an engine clarification") remain
   correct by design (A5g fact 1, SPINE-4/SPINE-7; the A5h instruction "do NOT weaken the
   bar itself" is honored verbatim). What died is not the bar but the EMITTER'S input to
   it — the model manufactures blocking questions the declared data says must not be
   questions (params), or phrases them in prose the identity machinery cannot answer
   (sample).

VERDICT Q1: (a) emitter-contract defect for `bead_beat duration` and `bead_beat cycles`
(the prompt rule at intentCompile.ts:101 vs vocabulary required:false data at
:826-834 and the pass's own exemption at resolveNounsPass.ts:246-251); (c) answer-surface
+ identity-typing gap for the `sample` fact (uncardable free reason + unjoinable prose
label). NOT (b): the 61-char text is scientist-plausible wet-lab prose and A5g Q1 (c)
rejected "assume away unstated parameters" as fixture-expectation weakening on this exact
ground — the thin fixture is the intended stress; the gate exists to prove the system
survives prose that omits optional params.

## Q2 — SMALLEST FIX SET: two tasks (one prompt/data task, one tiny presentation-data
addition), plus one measurement. Zero TS policy, zero new surfaces, no fixture change.

TASK HEDGE-TYPE-1 (server-side PROMPT DATA + registry mirror; no TS logic change)
  scope: edit the GENERATED system prompt (`intentCompileSystemPrompt`,
    intentCompile.ts:61-102) and its drift-gated mirror
    (`schema/registry/prompt-templates/intent.compile.system.yaml`, rule at :58-59) so the
    hedge rule honors the declared data instead of contradicting it:
    (1) hedge ONLY what the scientist STATED but you could not commit (ambiguity,
        contradiction, unknown existing-vs-new) or a REQUIRED parameter the verb block
        marks required and the text omits;
    (2) NEVER hedge the absence of a parameter the ALLOWED-ACTIONS block marks optional —
        omit the field; the compiler's required-argument sweep and downstream fold own
        optional absences;
    (3) every unresolved entry that is about a specific action's argument MUST carry
        `actionLocation: {actionIndex, action, argument}` (the argument name exactly as
        the verb block declares it) and `label:` EXACTLY the scientist's own word for the
        thing — never a sentence;
    (4) the generated verb block must mark required-vs-optional args per verb, GENERATED
        from the arg-contract `required` field (`vocabulary.argContracts`), zero verb/arg
        name literals — same generation principle as `promptVerbBlock()`.
    The anti-fabrication core of the rule ("instead of inventing it", "Do NOT add
    wells/volumes the scientist did not state", :99,101) stays byte-present; this only
    scopes WHEN to speak, never WHAT to invent.
  honesty clause (A5g standing clause discharged, not evaded): this IS a ruling on the
    two named parameter facts and it deliberately makes the compiler SILENT about absent
    OPTIONAL params. Grounds: the system already declared their absence legal (required:
    false data + the pass's own sweep exemption), so no information is suppressed that
    the data treats as blocking; and the compiled action visibly lacks the field for the
    scientist to see in the workstate. If Brad later wants an informational notice for
    absent-optional params, that is a separate FOLD/notice product decision (A5g Q2.3's
    "product's job"), NOT this one, and nothing here pre-decides it.
  verified by: server tests with a fake LLM client — (a) an intent whose actions omit
    optional params with NO unresolved entries compiles outcome 'complete' on this
    fixture's macro shape (bead_beat without duration/cycles produces a complete macro;
    proves downstream expansion tolerates the declared optional absence); (b) the prompt
    + mirror stay in lock-step (existing vocabularyMirrorDrift discipline,
    vocabularyMirrorDrift.test.ts); (c) NO engine-side file changes at all — a
    resolveNounsPass/resolutionEngine diff in the task's report is itself the defect.

TASK SAMPLE-CARD-1 (client presentation DATA only, same sanctioned class as the two
existing menu tables)
  scope: one row in `CLARIFICATION_MENU_BY_REASON` + argument overrides in
    `CLARIFICATION_MENU_BY_REASON_ARGUMENT` (clarificationAdapter.ts:46-61) giving the
    stable model-side reason HEDGE-TYPE-1 instructs for stated-but-uncommitted nouns
    (e.g. reason `not-stated`) its menus: argument-named routes to '/l' where the
    declared arg contract's noun kind is labware, default '/m', exactly the existing
    pattern. NO schema change, NO picker change, NO resolver change: the pick emits the
    `[[labware:<id>|label]]` idiom, `validateAnsweredSlots` + `answeredSlotBindings`
    bind the slot, and the §5.1 join drops the (now actionLocation-TYPED,
    exact-label) fact with zero new drop-rule — the machinery shipped in b52f5dfc/
    5cdfb8d0 IS the answer path; the missing piece is only that a prose-shaped fact
    cannot reach it. The carded-fact label on the wire is the engine fact's label (the
    raw mention), so MERGE (model fact + engine unknown-noun on the same slot key ->
    engine wins, resolveNounsPass.ts:178-201) plus the exact-label rule of HEDGE-TYPE-1
    (3) make the answers-map key joinable deterministically.
  verified by: client unit test — a fact {reason:'not-stated', actionLocation:
    {argument:'labware'...}} maps to '/l' with no mint floor; an unlocated
    {reason:'not-stated'} without actionLocation maps to the table default; every
    existing engine-reason card is byte-identical (the (reason,'*') fallback rule,
    :66-73). Browser proof rides A5d r3 (Q4).

MEASUREMENT F1 (orchestrator, ZERO code, authorized now; step-0 precedent): repeat the
probe x5 on current trunk with the answers map EXTENDED by scientist-stated values for
the three survivors ({'lysis duration':'10 min', 'bead-beating cycles':'5', 'the
sample':'[[labware:lbw-seed-tube-1p5ml|1.5 mL Microcentrifuge Tube (seed)]]'} —
scientist-declared probe answers in the answers map, NOT protocol-text appends; the
A5g Q2.3 prohibition is on protocol-text fabrication and is untouched). Arms: completing
draw -> prose-silencing-by-settled-block is real (informative for r3's headless route
only — the tier-2 browser leg STILL needs SAMPLE-CARD-1 because an uncarded fact has no
answer control regardless); 0/5 -> option (i) empirically dead for prose facts, as the
code analysis says. Either arm proceeds to authoring HEDGE-TYPE-1 + SAMPLE-CARD-1; F1
does not gate them, it prices the residual.

OPTION RULINGS: (i) REJECTED as the fix (not deterministic for scalar/quantity slots —
mechanism in Q1.3; retained only as measurement F1). (ii) ADOPTED as HEDGE-TYPE-1 — it
is prompt/vocabulary DATA, the most declarative location in the pipeline, and it is
A5d's own "fix the emitter, not the rule" applied one layer up. (iii) DEFERRED, not
rejected in principle (see REJECTED-ALTERNATIVES: it has no engine-reason producer on
this fixture; its natural trigger is an engine `missing-required-argument` fact, which
today is genuinely unanswerable — named, not fixed, see Consequences). (iv) REJECTED —
see REJECTED-ALTERNATIVES (fixture edit binds).

HARD-RULE COMPLIANCE: no hardcode (both tasks are generated prompt text + client
presentation tables; the only new strings are a stable reason code and argument names,
which ARE declared vocabulary data); no TS domain/verb branch (zero TS logic touched);
no hedge-suppression RULE in the pass (the bar and KEEP arm untouched at :435/:215 —
the pass cannot distinguish a trustworthy hedge from an untrustworthy one without a
policy decision, and inventing that distinction in TS is exactly the imperative policy
the repo forbids); fabrication stays forbidden (prompt keeps "instead of inventing it"
and "Do NOT add ... the scientist did not state"); the bar is not weakened.

## Q3 — NOT BRAD-GATED. One FYI for the orchestrator to surface, no blocking question.

The A5h Q3 door was labware MINTING (materials provenance hierarchy) — untouched: this
fix set mints nothing, answers labware by picking '/l' (material-only mint floor
reaffirmed a fourth time), and never infers a parameter value (the model OMITS absent
optional fields; a scientist-confirmed value still rides the answers map / '/l' pick as
the scientist's own stated data, the THREAD-ASK-1 provenance line unchanged). The one
adjacent domain-posture shift — the compiler goes SILENT about absent OPTIONAL params
rather than asking — is already decided BY THE DATA (required:false) and already the
engine's own behavior (:246-251); the emitter was the sole dissenter. Per the architect
contract this is a routine choice inside the standing vocabulary's authority, not a
reopening of a Brad decision. FYI (not a question): "should the product ever show an
informational notice for absent-optional params (the fold A5g Q2.3 assigns to the
product)" stays an open product edge, recorded in the Architecture-of-Record §8 spirit;
if Brad wants it voiced, it becomes its own task later.

## Q4 — GATE CONSEQUENCE: W28-A5D-R3's step-0 becomes a THREE-ARM probe after the two
tasks merge; the tier-2 criteria stay UNCHANGED.

STEP-0 PROBE r3 (headless, after HEDGE-TYPE-1 + SAMPLE-CARD-1 merge to cl/integration-2;
containment check names both SHAs alongside b52f5dfc + 5cdfb8d0): gate-exact 4 answers
UNCHANGED + {'the sample': labware idiom} added (the sample fact is now a question the
scientist legitimately answers — answering MORE questions is not assertion-weakening).
5 draws. ARMS:
  A >=1 completing draw with ZERO survivors -> proceed to tier-2.
  B completing draw still holding `duration`/`cycles` hedges -> HEDGE-TYPE-1 emitter
    non-compliance -> return per-draw log; do NOT force; do NOT add the params to
    answers as a workaround (that recreates the drift-hostage class at the gate).
  C a BOUNDED (carded or slotted) survivor that an answered key should have cleared ->
    ANSWER-BIND-1 defect (unchanged from A5h Q4.6).
  D a NEW prose-shaped slot-less survivor -> new named fact, new decision. The one-shape-
    at-a-time discipline persists; do not generalize from it.

TIER-2 (A5d r3): criteria verbatim from A5g Q2 / A5d Q4 / A5h Q4 — family questions ->
answer -> compile completes -> pl-deck-review >=1 checkbox -> pl-load-deck ghosts >=1 ->
pl-accept enables -> LPR minted -> choices == {"lysis-method":"bead-beater"}; per-cycle
log; MAX_REDRAW cap 8 UNCHANGED; honest-FAIL path; two fails -> suspect harness/slot
infra per SOP. NEW assertions (replacing none, adding): (1) the sample fact's card
renders the '/l' surface with NO mint floor; an uncarded slot-less free-form fact
surviving to a browser draw is a VALID defect return (fix-class), not a draw; (2) the
answered-label shrink rule (A5h Q4.3) extends verbatim to the sample label — answered
typed fact MUST be gone next draw, a survivor is a spine defect -> honest FAIL; (3) the
no-labware-mint discipline stands; the never-fabricate-durations rule stands and is now
MOOT for a completing path by construction (the completing draw simply carries no
param hedges — if one appears, arm B logic applies even mid-gate).

W2-8-SAID-MEANT-SURFACE: stays `in-progress`. No alternative closure exists — VERDICT:
accept on browser-review receipts is the only door (A5g Q3, standing SOP). A BLOCKED or
death result is not a pass.

## REJECTED-ALTERNATIVES

- (iv) FIXTURE ENRICHMENT (state durations/cycles in protocolText): REJECTED, and the
  precedent question is answered precisely: the binding precedent is not "only edits to
  force a pass are forbidden" — it is that a fixture edit CHANGING WHAT THE GATE MEASURES
  is forbidden. A5g Q1 (c) rejected "assume away unstated parameters" as
  assertion-weakening-by-another-name; A5-accept-leg rejected (d) "gate-fixture change to
  a no-held-facts compile"; A5d Q4 closed (c) "fixture-assertion weakening". Stating the
  params turns the gate from "system survives prose with omitted optional params" into
  "system survives prose that states everything" — a different, easier measurement. The
  thin text is the design point, not an honesty defect.
- (iii) numeric/param answer surface NOW: DEFERRED — no engine reason emits a
  param-question on this fixture (required:false is exempted at
  resolveNounsPass.ts:246-251), so a param card would be dead chrome until a producer
  exists (see Consequences: missing-required-argument naming); building an answer surface
  with no answerable fact class is speculative scope. When its trigger fires, the
  W211-MACH-1 harness (which PLANTS obligations so every fact is carded) is its named
  future home, exactly as the packet notes.
- SERVER-SIDE PARAM STAMPING (inject answered scalar/quantity values into the parsed
  intent beside the prompt, generalizing answeredSlotBindings past `:296`): REJECTED —
  it mutates model output with server-side authoring, cuts a second answer channel
  beside the spine, and is unnecessary once the emitter stops manufacturing the
  question; it also collides with the THREAD-ASK-1 provenance line the A5h decision
  just finished shipping ("the spine remains the only binder").
- LOOSEN THE JOIN (containment/fuzzy drop of prose hedges): REJECTED — A5h Q2 settled
  exact-label identity deliberately; a containment join recreates the A5d V6
  spaced/hyphenated drift class. The fix types the emitter's facts instead of weakening
  the join.
- PASS-SIDE HEDGE-SUPPRESSION RULE (drop model facts whose prose names a required:false
  arg): REJECTED — that is imperative policy in TS deciding which model facts to trust,
  the exact thing the A5g standing clause forbids pre-authorizing and code-branching
  policy the repo forbids; the contradiction lives in the emission contract, so the fix
  lives in the emission contract.
- INFORMATIONAL RECLASSIFICATION of hedges: REJECTED — no representation in the frozen
  SPINE-1 unresolved shape (A5g fact 3); unchanged.
- CHASE THE EMITTER (temperature/sampling changes, more draws): REJECTED — WIRE-TEMP-1
  determinism is working AS DESIGNED (identical survivor sets); the wall is contract,
  not sampling. More redraws against a deterministic contract violation is waste, and
  A5g Q2.3 already forbids burning MAX_REDRAW this way.

## Consequences / notes

- ORCHESTRATOR NEXT, in order: (1) run MEASUREMENT F1 (zero code, authorized above; log
  it as step0-probe-f1-* — its ONLY output is pricing the 'sample' headless residual;
  it does not gate step 2); (2) author HEDGE-TYPE-1 and SAMPLE-CARD-1 into lane 2 (no
  architect task-list edit; either order, independent); (3) after both merge, run
  STEP-0 PROBE r3 per Q4 with the named containment SHAs; (4) tier-2 A5d r3 with the
  three new assertions; MAX_REDRAW 8, honest-FAIL, per-cycle log unchanged.
- NAMED FOLLOW-ON, not a task today: an engine `missing-required-argument` fact
  (required:true arg absent) has actionLocation but NO menu row -> no card, and the
  pass's honest exception means BIND-1 never drops it (resolveNounsPass.ts:~400) — so it
  is unanswerable-by-construction the same way, with no data channel yet. Its trigger
  has NOT fired on any fixture; when it does, that named fact re-enters as its own
  decision (option (iii) + param-stamping get weighed THERE, with the W211-MACH-1
  harness as testbed). Recorded, not pre-authorized.
- Declared-role-consultation spine decision stays EARNED and queued after A5 closes
  (A5h consequences): microcentrifuge-tube pre-resolution would also shrink the
  sample-class questions at the engine layer; do not smuggle it in here.
- W2-8-SAID-MEANT-SURFACE and its ANSWER-BIND-1/ANSWER-SURFACE-1 browser proof ride r3;
  both stay in-progress; a BLOCKED/FAIL is not a pass.
- Store side effects: none new from this decision (probe is compile-only, proposes never
  write). MAT-lysis-reagent-1dkp reuse idiom unchanged.
- No stack touched by me; no product code changed; every load-bearing claim above is
  file:line first-hand at b7ebdf2c (code identical to 5cdfb8d0).

DECISION: the step-0 wall is NOT the bar and NOT the fixture — for `bead_beat
duration`/`cycles` the generated emitter prompt (intentCompile.ts:101) mandates hedging
absences that the vocabulary declares optional (vocabulary.yaml:826-834) and that the
engine's own sweep exempts (resolveNounsPass.ts:246-251), so under WIRE-TEMP determinism
the contract manufactures a permanent 0/5; for `sample` the fact is prose-shaped (no
actionLocation, free reason) so neither the '/l' card (clarificationAdapter.ts:46-73
reason-gate) nor the ANSWER-BIND-1 exact-identity join (:132-141, :284-306) can ever
reach it — fix by HEDGE-TYPE-1 (generated prompt DATA + mirror: hedge only stated-but-
uncommitted or declared-required absences; type every located unresolved fact with
actionLocation + the scientist's exact label; NO TS change) + SAMPLE-CARD-1 (one reason
row + argument overrides in the existing presentation tables), with zero-coding F1
probing the settled-block route in parallel; no fixture edit (binding precedent: an edit
changing what the gate measures is forbidden, whatever its intent), no pass-side
suppression rule, no param surface yet (its producer doesn't exist), no Brad gate.

ARCHITECT DONE W28-A5i
