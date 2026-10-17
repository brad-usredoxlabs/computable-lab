# W2-8 A5 accept-leg deadlock — ARCHITECT DECISION (2026-10-17 packet)

Trunk at decision time: 0c21bfc9 (contains 4e3428a3). Packet:
prompts/architect-W28A5-accept-leg-20261017T1215.txt. Gate receipt:
/home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-17_1125-a5d-tier2/REPORT.md
(VERDICT: fix, VALID — 4 distinct-md5 shots, trail.json, md5s.txt).
Rides on W2-11-d4-deckreview-empty-decision.md (VERDICT (c)) and
W2-11-d4-unknown-noun-resolution-decision.md (VERDICT (c)); both rulings stand —
their product halves DECK-FOLD-1 (DONE, browser-gate accepted) and THREAD-ASK-1
(merged 11af0d19) have since shipped. What this packet adds is a THIRD failure
shape none of them covers: a held fact that is a missing CAPABILITY, not a missing noun.

## First-hand verification (all re-checked at 0c21bfc9; git -c core.fileMode=false)

1. CONFIRMED — the SPINE-4 bar arm (compileScientistIntent.ts:284-307) returns
   terminalArtifacts {events:[], directives:[], gaps:[]} (+protocolIntent) on
   needs-clarification, BY DESIGN. The in-file rationale (SPINE-7 fix1/D1,
   :276-282) is explicit: shipping a producer-emitted un-realizable value with
   the bundle "would be silent data loss." The bar arm carrying artifacts is the
   exact failure that design exists to prevent.

2. CONFIRMED — deriveDeckLabware (app/src/event-editor/right-pane/protocol/
   ProtocolLocalizationThread.tsx:116) now folds additions + requirements +
   resolvedLabwares (DECK-FOLD-1 landed; kind: 'addition'|'requirement'|'resolved',
   :100). All three sources are pass outputs the cascade SKIPS on the bar arm —
   the client is no longer the gap; the empty deck on a held 422 is spine
   semantics, correctly.

3. CONFIRMED (the decisive fact) — schema/scientist-intent/scientist-intent-
   vocabulary.yaml declares exactly 31 verbs:
   seed incubate mix resuspend dilute shake count read add_material
   create_container transfer stain fix permeabilize block quench label transfect
   aliquot wash elute harvest passage freeze thaw spin pellet serial_dilution
   media_swap_duplicate_columns source_wells_to_duplicate_target_columns repeat_rows.
   NO bead-beating / lyse / homogenize / disrupt / sonicate verb exists. The
   model's held fact "the allowed action set has no bead-beating verb; lysis was
   expressed as lysis-reagent addition plus mechanical mix" is the SPINE doing
   its job: the bead-beater condition is unexecutable BY DATA, and the model
   honestly refused to fake an event for it. The lab-profile label is literally
   "Redox Labs — bead-basher microbiome unit" — this is a real capability gap in
   our own declared action vocabulary for OUR OWN flagship unit.

4. CONFIRMED (governing wrinkle) — the 31-set is adjudicated DATA with teeth:
   schema/workflow/scientist-intent.schema.yaml $defs/actionVerb enum;
   vocabularyMirrorDrift.test.ts enforces set-equality + declaration-order
   mirror; schema/registry/wave2-verb-adjudication.yaml (the ONE verb
   adjudication table) re-derives its counts in Wave2NamingCrosswalk.test.ts and
   already records VERB-SONICATE (and VERB-STIR) as `protocol_semantic_only` —
   i.e. mechanical-disruption verbs were CONSIDERED and adjudicated as
   compiler-absent. A bead-beat verb ADDITION reverses that adjudicated posture
   and changes a Brad-RULED wave-1 boundary ("verb union = 31", memo 2026-10-06,
   ruled 10-07). It is a domain-policy act, not an implementation detail — the
   same class as the /vocab/mint labware-floor question I routed to Brad in the
   W2-11 D4 ruling rather than deciding.

5. CONFIRMED — the free-form-reason observation: CLARIFICATION_MENU_BY_REASON
   (app/src/event-editor/right-pane/protocol/
   ProtocolLocalizationThread.clarificationAdapter.ts, shipped by THREAD-ASK-1)
   is a DATA table mapping reason -> menu; a reason with no entry renders no
   card and the infoMsg remains the honest fallback (adapter header, spec test
   4). That is correct as designed: a fact like "no bead-beating verb exists"
   has NO record to pick and NO noun to mint — an answerable card would offer a
   picker where no answer exists.

6. CONFIRMED (kills (d) standalone) — the three held facts are BRANCH-
   INDEPENDENT: sample identity, the bead-beater condition, and lysis-reagent
   identity all ride from the protocol text, not from the axis answer. Re-answering
   the gate "freeze-thaw" instead of "bead-beater" would still bar on the
   sample/reagent facts (freeze/thaw exist in the enum, but facts 6's subjects
   do not resolve either). The gate cannot dodge the bar by choosing the other
   condition; and per the W2-11 D4 ruling precedent, the bar must be ANSWERED,
   not dodged.

## Ruling on the options

(a) SPINE-4 amendment — bar arm carries declared-role offers — REJECTED.
    Directly contradicts the SPINE-7 fix1/D1 rationale (fact 1): artifacts on a
    compile that refused to realize its own actions IS the silent-data-loss
    channel the atomic bar exists to block, and it would regress PROTO-AI/SPINE
    invariants plus the A5 "honest fold" leg that PASSED at tier-2. The accept
    gate stayed disabled because there was honestly nothing to accept — that is
    the by-design ruling (AS-LANE2-W28-A5D-ACCEPT-GATE-BY-DESIGN) holding, not
    failing. Its debt clause ("accept path becomes the suspect") is discharged
    by this packet: the suspect is the capability data, not the accept path.

(b) Vocabulary DATA fix — PRIMARY, but needs Brad (see ask below). It is the
    declarative-correct root-cause fix: capabilities live in the vocabulary
    triplet BY CONSTRUCTION; the loader has no hand-maintained TS list; verb
    addition flows through schema + lint + mirror + adjudication data, and
    rip-out discipline is preserved (delete the entry -> the capability honestly
    disappears). If the answered compile then COMPLETES, artifacts flow,
    DECK-FOLD-1 + the existing zero-match additions arm fill pl-deck-review,
    ghosting + the >=1-preview accept gate open on real placements with NO
    product change — A5's accept leg closes on product that already exists.

(c) Client adapter for free-form reasons — REJECTED as the fix; NOT needed for
    A5. Fact 5: a card cannot answer a missing-capability fact. If the post-(b)
    probe (below) shows a remaining fact that IS record-resolvable yet
    uncarded, THAT fact re-opens (c) as its own task with a named reason —
    none is evidenced today.

(d) Gate-fixture change to a no-held-facts compile — REJECTED as stated; folded
    into (b)'s probe as a contingency. Fact 6 shows the trivial swap does not
    work. A different family fixture with a vocabulary-executable family AND
    branch-independent facts that resolve honestly is legitimate ONLY if (b) is
    refused — and it must be justified as "the A5 surface does not require the
    needs-clarification path," not as bar-dodging, else it is assertion
    weakening by another name.

## ASK FOR BRAD (precise, one decision)

Should the scientist-intent action vocabulary gain a mechanical-cell-disruption
verb (proposed name `bead_beat`, class simple, policyRef hint-authority, args:
labware resolvable/hintEligible, material resolvable/domain material, duration,
temperatureC, cycles — coder re-anchors against mix/shake entries), declared
through the governance chain (scientist-intent.schema.yaml actionVerb enum ->
vocabulary triplet -> wave2-verb-adjudication adjudication entry superseding the
VERB-SONICATE protocol_semantic_only posture for this operation -> verb-action-map
synonyms bead-beat/homogenize, OBI lookup done or 'no canonical mapping' note per
the seed/verb precedent)?

This reverses a documented wave-2 adjudication and changes the Brad-ruled
31-verb union, so it is domain policy — Brad's call, not the lane's.
RECOMMENDATION: yes. The lab's own profile is a bead-basher unit; every
microbiome-lysis protocol we will ever localize needs this act; the model
already refuses to fake it; the fix is 100% data with existing teeth.

WHAT UNBLOCKS AT EACH ANSWER:
- YES: orchestrator authors W2-8-A5g (plan below). Expected: A5d re-shoot goes
  green end-to-end and W2-8 A5 closes at the existing gate, no assertion change.
- NO: the A5 accept leg stays open on this fixture; lane files the (d)
  contingency — a new gate family whose every condition is executable in the
  31-verb set and whose facts resolve honestly — with its own spec justifying
  it against the no-dodging precedent, or Brad waives the accept leg to a
  headless-verified contract. A5 stays in-progress either way until one lands.

## Work plan if approved (owning item: W2-8 follow-on task W2-8-A5g
'bead_beat vocabulary verb'; NO task-list edit by architect — orchestrator authors)

0. PROBE FIRST (measurement, authorized now, no shipping): the vocabulary
   loader accepts fixture path injection (vocabulary.ts:106-107 `path?`).
   Headless POST /api/intent/compile-from-prompt against a bead_beat-augmented
   vocab copy with the gate-exact protocolText + both axis answers. Record:
   outcome (complete vs 422), and if 422, WHICH facts still bar. This answers
   whether the sample/reagent free-form facts are informational or bar-causing
   BEFORE any merge. If they still bar, stop and return to the architect —
   (c)/(d) re-open with the named facts, do not force the gate.
1. Data: add actionVerb enum entry + vocabulary triplet entry (+lint check),
   adjudication row, verb-action-map synonyms + OBI (lookup or 'no canonical
   mapping' note), realization mapping so bead_beat lowers to an event the
   deck/ghost path consumes. Mirror-drift, crosswalk-count, prompt-shape-parity,
   rip-out and golden suites updated, not pinned around.
2. advc + orch self-verify + merge + restart (server boot reloads vocab; FAIL
   LOUD loader means a bad triplet breaks boot — the probe de-risks this).
3. Orch repro-A re-run, then A5d tier-2 RE-SHOOT at the new tip: family
   questions -> answer bead-beater -> compile completes -> pl-deck-review >=1
   checkbox -> pl-load-deck ghosts >=1 event -> pl-accept enables -> LPR minted
   -> GET shows branch_resolution[].choices == {"lysis-method":"bead-beater"};
   receipt names the LPR id. Gate criteria UNCHANGED throughout.

## Risks

- Compile may still bar on the sample/reagent free-form facts (fact 6) — probe
  step 0 resolves this before spend; if so, this ruling's (c)/(d) contingencies
  re-open with named evidence, A5 stays in-progress.
- Verb-addition touches the ONE verb-adjudication table and several machine-
  re-derived counts — mechanically loud failures (drift/crosswalk tests), low
  silent-breakage risk; boot fails loud on a broken triplet by design.
- Small-model non-determinism on the re-shoot draw: the MAX_REDRAW bounded
  re-draw precedent from W2-11 D4 applies; label drift does not, since the bar
  cause is data-removed, not wording-sensitive.
- If the re-shoot passes, A5 closes but the free-form-reason no-card behavior
  stands (correct today) — a discoverability debt worth a follow-on note, NOT a
  task absent a named answerable fact-class.

DECISION: needs-brad approve (or refuse) adding a `bead_beat` verb to the scientist-intent action vocabulary (reverses the wave-2 VERB-SONICATE protocol_semantic_only adjudication and the ruled 31-verb union) — it is the sole root-cause fix that opens the A5 accept leg without touching the SPINE-4 atomic bar or weakening the gate; probe-first plan and refused-path contingency above.

## STEP-0 PROBE RESULTS (orch l2t1230, 2026-10-17T13:1x EDT — measurement authorized by this ruling; NO shipping)

Method: throwaway worktree wt/W28-A5g-probe-lane2-l2t1230 (detached at 0c26bebf), vocab triplet
augmented with ONE bead_beat entry (class simple, policyRef hint-authority, args labware/
material resolvable+hintEligible, duration scalar, temperatureC/cycles quantity — modelled on
mix). Boot with the augmented triplet PASSED loader schema+lint (no boot failure). Probe server
on :3099, lane data copied to ~/.computable-lab-lane2-probe (trunk store untouched). 5 headless
POST /api/intent/compile-from-prompt per side, gate-exact protocolText + answers
{lysis-method: bead-beater, lyse_variant: variant_a}, active profile qwen3.8-thunderbeast.

CONTROL (:3093, shipped 31-verb): complete, 422, 422, complete, 422 — 2/5 COMPLETE. The completes
fold lysis as add_material+mix/resuspend (exactly the gate's honest-fold workaround text). The
422 fact sets vary per draw (ambiguous-noun microcentrifuge-tube x4; gate-2025-lyse free-form;
sample + lysis-reagent unknown-noun).
PROBE (:3099, +bead_beat): 422, 422, complete, complete, 422 — 2/5 COMPLETE, and BOTH completes
emit a REAL bead_beat action (model uses the verb verbatim; actions: [add_material, bead_beat,
transfer] / [bead_beat, transfer]). Loader accepted the entry end-to-end (prompt enum, tool
schema, compile, realization).

ANSWER TO THE RULING'S STEP-0 QUESTION (are the sample/reagent free-form facts bar-causing?):
PARTLY, AND DRAW-DEPENDENT. Removing the bead-verb bar does NOT deterministically clear the
compile: the remaining held facts are (i) ambiguous-noun 'microcentrifuge tube' — STRUCTURED,
card-answerable, and notable: it fires even though the protocol DECLARES that role (role-vs-store
collision candidate for a follow-up look); (ii) free-form duration/sample-source facts — uncarded.
CRUCIAL NEW FACT the ruling did not have: the SHIPPED vocab also completes on ~40% of draws via
the mix-fold workaround, so the A5d held-422 was itself a draw, not a deterministic bar. Either
answer, the green-gate re-shoot rides the bounded MAX_REDRAW precedent; bead_beat makes the
honest (non-workaround) completion path exist, which is what the ruling's (b) argued.
