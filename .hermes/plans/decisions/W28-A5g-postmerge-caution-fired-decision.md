# W2-8-A5g post-merge CAUTION fired — ARCHITECT DECISION (2026-10-17)

Trunk at decision time: 7ed172e2 (bead_beat merged; advc ACCEPT
reviews/advc-A5g-c1-l2t1835.md; orch-verified 247/247, tsc baseline unchanged).
Evidence: /home/brad/.hermes/cl/lanes/2/tmp-orch/repro-a-A5g-postmerge-l2t1835.txt
(fixture CAN-protocol-1791692042751, draw2 HTTP 422 needs-clarification).
Rides on: W28-A5-accept-leg-decision-20261017.md (work plan step 3 + Risks —
the CAUTION this packet discharges), W2-11-d4-unknown-noun-resolution-decision.md
(HONEST MINT REPLAY precedent), W28-A5-beadbeat-brad-ruling-20261017.md ("a) yes").
No stack touched, no port touched, no product code changed. Only this file written.

## First-hand verification (all re-checked at 7ed172e2, git -c core.fileMode=false)

1. CONFIRMED — the barring rule, cited exactly. `server/src/compiler/resolution/
   resolveNounsPass.ts:326-343`: `const blocked = clarifications.length > 0;` —
   ANY clarification (engine, required-argument, or KEPT model hedge) makes the
   pass return `{ok:false}` with the `unresolved_arguments` diagnostic
   ("argument(s) unresolved — compilation barred"). `server/src/compiler/
   scientistIntent/compileScientistIntent.ts:267-307` then takes the SPINE-4
   atomic bar arm: terminalArtifacts `{events:[], directives:[], gaps:[]}` +
   protocolIntent, outcome `needs-clarification`, HTTP 422
   (IntentCompileFromPromptHandlers.ts:415-427). The in-file rationale (SPINE-7
   fix1/D1, :276-281): shipping a producer-emitted value that cannot reach a
   compiled event "would be silent data loss." An unresolved MATERIAL ref on
   `add_material.source` is precisely that: the event would reference a record
   that does not exist. The bar is correct BY DESIGN, not a bug.

2. CONFIRMED — the unknown-noun arm OFFERS the answer. resolutionEngine.ts:204-229:
   the mint affordance is offered ONLY on the unknown-noun arm, filtered by the
   nounShape DATA (config/drafting/shorthand-drafting.yaml). "lysis-reagent"
   passed the shape filter (the repro shows the affordance present), so the
   system itself declares mint-to-answer the legitimate response to this fact.

3. CONFIRMED — there is NO informational tier in the contract for this fact-class.
   schema/workflow/scientist-intent.schema.yaml `unresolved` $defs (lines ~219-275)
   declares `{label, reason, actionLocation?, candidates?[]}` with NO
   informational/barring flag. The informational channel is the 200 `gap`
   OUTCOME, which only exists when resolve_nouns did NOT block. An engine
   clarification on an unbound slot therefore has exactly one legal fate: bar.
   Option (b) has no representation in the frozen SPINE-1 shape.

4. CONFIRMED — the answer surface SHIPPED. THREAD-ASK-1 (merged 11af0d19) is
   live on this trunk: (i) server — composeAnsweredPrompt
   (IntentCompileFromPromptHandlers.ts:139-156 header + :147-156): "a
   clarification ANSWER rides this SAME map as data — key = the clarification's
   own label, value = ... mention idiom `[[material:MAT-…|label]]`... the spine's
   tier-1 remains the ONLY binder"; (ii) client — app/src/event-editor/
   right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts:38-42:
   `CLARIFICATION_MENU_BY_REASON = { 'unknown-noun': '/m', ... }` — held
   unknown-noun facts render as answerable cards with the ClarificationPicker
   and its mint floor. So the "uncarded free-form" limitation of the accept-leg
   ruling does NOT apply to the barring fact: lysis-reagent (unknown-noun) HAS
   a card; the two free-form hedges do not — and cannot, honestly (§6).

5. CORRECTION to the orchestrator's packet framing — the two free-form facts are
   NOT "non-barring informational." resolveNounsPass.ts §5.1
   (reconcileModelUnresolved :139-196, :190-192: "KEEP: the model names a slot
   the engine never saw — it bars exactly like an engine clarification"):
   "sample volume" and "bead beating parameters" arrive in the model's
   `unresolved` array WITHOUT actionLocation, so identityKey is
   `label:...` (:107-119), which never matches a bound SLOT key; they are KEPT
   and count toward `blocked`. The repro-A draw2 barred on all three facts
   jointly. They are the model's own hedging — draw-dependent, NOT a
   deterministic bar (draw1 completed with clarifications: 0 on the same
   inputs; step-0 probe + control series 2 already proved per-draw variance).
   This does not change the ruling below; it changes what MAX_REDRAW is
   protecting against (see Q2.4).

6. DISCLOSED, not re-decided — the duplicate `Create local term "lysis-reagent"`
   candidate rows (x2 @ 0.05, visible API-side in the repro) are the mint-floor
   duplicate-rows item Brad already approved verbatim "b) mint now" in
   W28-A5-beadbeat-brad-ruling-20261017.md:10-13 (MINT-FLOOR-UI-1 batch). It is
   an existing approved lane-2 task; this decision neither folds it into A5g nor
   lets it gate the re-shoot (dedupe-by-label at the harness/picker consumes it
   harmlessly).

## Q1 — VERDICT: (a). The bar stays CORRECT; the accept leg ANSWERS the fact.

(a) bar stays correct, re-shoot exercises the mint/answer path — ADOPTED.
Reasons, in order of weight:
- It is the spine's own design and the repo's own precedent: "the bar must be
  ANSWERED, not dodged" (W2-11 D4 fact 6, ruled for this exact failure shape),
  and the unknown-noun arm exists precisely so the scientist can mint the noun
  the protocol text named but the store does not (fact 2 above).
- The answer machinery is ALREADY product (fact 4): mint floor in the '/m' card
  (server POST /vocab/mint {refKind:'material', label}, idempotent by label,
  creates a 'proposed' MAT- draft; W2-11 D4 fact 8 measured that minted
  materials bind tier-1 on the next local search and do NOT flip labware hints
  into resolvedLabwares, so the deck's zero-match additions arm — the checkbox
  path the gate needs — is NOT tripped by minting).
- (b) REJECTED: reclassifying an unbound material ref as informational means
  emitting a compiled event that references a non-existent record — the exact
  silent-data-loss channel SPINE-4 + SPINE-7 fix1/D1 exist to block (fact 1),
  with no representation in the frozen contract (fact 3). It would gut
  resolveNounsPass/goldenIntentToClarification goldens and reverse two ruled
  precedents to spare the harness one mint cycle. Weakens the gate, not the fixture.
- (c) REJECTED: a protocol that names a generic "lysis reagent" without a
  catalogue id is SCIENTIST-PLAUSIBLE text — it is the normal state of wet-lab
  prose, and mint-on-unknown-noun is the designed interaction for it
  (creation-entry-points.md §6: mint is the last resort, offered when nothing
  else matches). "Amending the fixture expectation" here means "assume away
  unknown nouns," i.e. assertion weakening by another name. The ruling's
  fixture expectation never required a no-held-facts compile; the accept-leg
  ruling's own step-0 probe already recorded these facts as expected-draw-dependent.

## Q2 — Exact discipline the A5d tier-2 re-shoot must follow (orchestrator encodes in gate prompt)

The gate criteria stay UNCHANGED (family questions -> answer bead-beater ->
compile completes -> pl-deck-review >=1 checkbox -> pl-load-deck ghosts >=1
event -> pl-accept enables -> LPR minted -> choices ==
{"lysis-method":"bead-beater"}). What is ADDED is the bounded honest-mint cycle,
identical in spirit to W2-11 D4's harness discipline:

1. MINT THE BARRING NOUN, ONCE, VIA THE AFFORDANCE THE CLARIFICATION OFFERS.
   Preferred (product path, browser leg): on the held 422, the
   lysis-reagent unknown-noun card's '/m' picker -> mint floor ->
   "Create local term “lysis-reagent”" (dedupe the duplicate rows; they are
   MINT-FLOOR-UI-1, one affordance). The thread re-sends with the answer riding
   the answers map as `lysis-reagent = [[material:<minted MAT-…>|lysis-reagent]]`
   (THREAD-ASK-1 Leg 1 idiom). Honest answer text = the scientist's own words:
   "use lysis-reagent — create the local term". Do NOT invent a brand/catalogue
   id (e.g. never "ZymoBIOMICS Lysis Reagent" or any MAT id not produced by the
   mint itself); the mint IS the resolution act, and minting is idempotent by
   label (W2-11 D4 fact 8), so the label `lysis-reagent` bars no more draws
   after the first cycle.
   Permitted fallback (API seam, only if the card/picker infra faults — log it
   as a defect if used): POST /vocab/mint {refKind:'material',
   label:'lysis-reagent'} then re-POST compile-from-prompt with answers =
   {lysis-method:'bead-beater', lyse_variant:'variant_a',
   'lysis-reagent':'[[material:<returned id>|lysis-reagent]]'}.
2. BOUNDED CYCLE + LOG: cap 8 cycles (W2-11 D4 recommendation). Per cycle log
   `{draw, http, unknown_labels_before, minted_labels}`. If the unknown-noun set
   does not STRICTLY SHRINK two cycles running, fail the leg honestly and hand
   back the per-cycle log — that is a spine defect, not a fixture defect.
3. NEVER fabricate or force-override to clear the two free-form hedges. Per
   fact 5 they bar when present but are model hedging, not a deterministic bar;
   a completing draw simply does not emit them (draw1, HTTP 200, clarifications
   0, proves the model emits neither on some draws). The re-shoot rides the
   MAX_REDRAW bounded re-draw precedent for exactly this; do not append
   invented volumes/cycle-counts to the protocol text — the honest fold of
   genuinely unspecified parameters is the product's job, not the harness's.
4. Sequence expectation for the receipt: cycle 1 mints lysis-reagent; the
   unknown-noun bar is then deterministically removed for the session (idempotent
   record, tier-1 binds). Residual 422s after that are hedge-draws only, covered
   by MAX_REDRAW. On the completing draw: the macro carries the REAL bead_beat
   action (already proven end-to-end at repro-A draw2's localMacro), deck
   review fills via the zero-match additions arm (minting materials does not
   trip the resolvedLabwares trap, fact 8), and the accept leg proceeds on
   >=1 real placement. Receipt names the LPR id.
5. Do NOT edit the fixture, the spec assertions, the MAX_REDRAW cap, or any
   wording in the protocol text (W2-11 D4 fact 6: wording edits convert a
   bounded budget into unbounded label drift).

## Q3 — CAUTION interpretation: CONFIRMED.

The CAUTION ("STOP and return to the architect... do NOT force the gate")
fired at the deterministic repro-A level before any UI spend, and the
orchestrator honored it correctly. This artifact discharges it with (a): the
gate is not forced — the re-shoot ANSWERS the bar through shipped product
machinery. W2-8 A5 stays `in-progress` regardless of re-shoot outcome until a
real VERDICT: accept lands on browser-review receipts; a BLOCKED or death
result is not a pass, and two fails means suspecting the harness/slot as an
infra defect per the standing browser-gate SOP.

## Consequences / notes

- No product-code task emerges from this decision. MINT-FLOOR-UI-1 (duplicate
  mint rows, API-side confirmed here at 7ed172e2) rides the already-approved
  "b) mint now" batch — the orchestrator keeps it as its own lane-2 task; A5g's
  re-shoot must not be blocked on it (dedupe-by-label absorbs it).
- Follow-on discoverability note stands unchanged from the accept-leg ruling:
  free-form hedge facts are uncarded (correct today per that ruling's fact 5);
  if a future gate surfaces one that IS record-resolvable yet uncarded, THAT
  re-opens the adapter question with a named reason. Not a task today.
- If the re-shoot still bars after the mint cycle with the unknown set NOT
  shrinking: honest FAIL -> spine defect -> return to the architect with the
  per-cycle log. Do not re-open (b)/(c) by instinct; (b)/(c) are rejected here
  on first-hand code grounds, not preference.

ARCHITECT DONE
