# RULING — L2-LABSTATE-CONTENTS-1 mix-turn sampler determinism + control-leg reachability (l2t1930 packet)

Filed 2026-10-30 by the lane-2 architect. Packet:
`/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/decisions/LABSTATE-SAMPLER-DETERMINISM-question-l2t1930.md`.
READ-ONLY ruling: no product code, no vocab/prompt edits, no drive run, no merge.
Consistency: this ruling CONTINUES `LABSTATE-MATERIALNOUN-gate-l2t0310-ruling.md`; it
SUPERSEDES exactly one expectation of that ruling (turn X "actually reached live" with the
ghost-plate utterance — see Q3) and leaves everything else intact.

## Root cause found first-hand (the packet's matrix has ONE upstream cause)

The packet's three outcomes (a)/(b)/(c) are not three defects and not a coin-flip in the
sampler's resolution core. They are three legitimate server responses to a wire document
that NEVER carries the declarative wellset token. Verified by the architect across ALL NINE
receipts (193551Z, 203317Z, 211859Z, 213618Z, 214441Z, 215810Z, 215841Z, 225807Z, 235639Z):
the turn-2 `shorthand` string contains `all-wells-containing-materials` in ZERO of them.
Every run instead carries a model-authored literal (`wells: [A1:H1, A2:H2]`, `wells: ["A1:H2"]`)
or no wells at all, and the `labware:` value free-varies (`(none)`, `plate`, `"the plate"`,
`"Generic 96 Well Plate, Flat Bottom (seed)"`, `"96-well plate"`) — the intentId itself
flips `mix-wells-with-material` vs `mix-material-wells`. The run-to-run variance is entirely
in the MODEL's shorthand emission; the server layers below it behave deterministically given
the wire they were handed (shown leg-by-leg below).

The declarative producer-side declaration that would make the model emit the token DOES NOT
EXIST. `schema/registry/prompt-templates/intent.compile.system.yaml:36` lists
`wells?:wellset(labware)` for mix, but the PARAMETERS section (:67-87) never mentions the
wellset carrier or the token's semantics, and RULES :97 ("Do not add wells/volumes the
scientist did not state") actively discourages inventing wells. A small model given
"mix all wells that have material" and a closed vocabulary with an unexplained `wellset`
argument cannot be expected to emit `wells: all-wells-containing-materials` — it free-fills
or omits the optional arg. That is the determinism gap: an under-declared producer surface,
not sampler non-determinism.

## Q1 — Which outcome is the contract, and where does the union come from?

RULING: with NO token on the wire, the contract is (b) — byte-identical passthrough with
vacuous `details` — and (c) is the same passthrough plus a resolve_labware-bound labwareId.
(a) is the legitimate SPINE-4 bar when the model injects an unbindable labware noun. NONE
of the three can produce the 48-well union, because the server was never ASKED: the union
path is token-gated. First-hand chain:

- The union surface exists and is DATA-declared: `mix.wells` as `kind: wellset`,
  `domain: labware` — `schema/scientist-intent/scientist-intent-vocabulary.yaml:119-122`;
  the token class `wellsetValueTokens: [all-wells-containing-materials]` — same file
  :883-884; the pass `resolve_wellsets` downstream of the noun door —
  `schema/registry/compile-pipelines/scientist-intent-compile.yaml:91-94` (consumers
  `lab_state` :115-118 and `compute_volumes` :96-98 declare the edge).
- The core reads the committed ledger exactly as spec §11 needs:
  `server/src/compiler/scientistIntent/wellsetResolver.ts:209` (`buildContentsLedger` —
  committed priorLabState layer + pending layer, one identity space) and :335
  (`resolveContentsWellset` — single populated bucket -> sorted wells + labware binding;
  never-guess on >1). End-to-end proof this path emits a NON-vacuous union through the REAL
  pipeline: `server/src/compiler/scientistIntent/wellsetSeededDrive.test.ts` (its header
  :1-16 records the binding D13 ruling: the production contents-wiring is pre-existing and
  OUTSIDE the item; the seeded drive proves everything downstream of the commit leg).
- The gate: `findWellsetTokenCandidates` (`wellsetResolver.ts:398`) scans candidateEvents
  for vocabulary-declared token values; `resolveWellsets` :545-551 — "No wellset token
  anywhere (the overwhelmingly common case): passthrough". All nine runs hit this arm.
  The pass is therefore innocent of the vacuous `details {}`; it never engaged.
- Why `details {}` even though the model typed `wells: [A1:H1, A2:H2]`: the array is not a
  string so `parseScientistIntent.ts:119-124` (wellset carrier requires
  `typeof value === 'string'`) drops it, and `mixExpander`
  (`server/src/compiler/biology/verbs/simpleVerbs.ts:157-173`) emits `details` carrying
  ONLY `volume`/`cycles` — a literal well list on mix is a no-consumer shape (the seeded
  test header names the expander's symbolic emission, `simpleVerbs.ts:522-640` region, as
  PRE-EXISTING and outside this item — same D13 boundary).
- (c) `details {cycles, labwareId: lbw-seed-plate-96-flat}` no wells key: same passthrough
  (string `A1:H2` is a valid well RANGE but NOT a token — normalize :831 lets real addresses
  through, `findWellsetTokenCandidates` rejects non-token values), plus the model happened
  to name the seed plate title so resolve_labware bound it. No wells key is EXPECTED with
  no token.
- (a) the card: `resolve_nouns` is SPINE-4, "unresolved arguments bar compilation"
  (`scientist-intent-compile.yaml:17-25`) — the model injected `labware: plate` / `"the plate"`;
  the door barred and the cascade skipped every consumer incl. `resolve_wellsets` and
  `lab_state` (arm_log [] on those turns — consistent).

FIX CHARACTERIZATION: declarative, no product code. The token membership, the pass, the
ledger core, and the card plumbing already ship; the missing declaration is the
MODEL-FACING prompt data: `schema/registry/prompt-templates/intent.compile.system.yaml`
must declare, as data in the ARGUMENTS/PARAMETERS/RULES block, that a contents-derived
phrase ("all wells that have material") is expressed on a `kind: wellset` argument as the
vocabulary's declared token, never as a literal well list and never by inventing a labware
noun. NEW-ITEM BOUNDARY: that file is the sampler/model-facing surface and is OUTSIDE
L2-LABSTATE-CONTENTS-1's approved scope ("server contents-ledger", per the packet's own
boundary). It requires a new lane-2 item, queued only on Brad's approval — proposed name
L2-WELLSET-TOKEN-EMIT-1 (declare the wellset token's producer-side semantics in the intent
compile prompt data; acceptance: the ratified turn-2 utterance yields
`wells: all-wells-containing-materials` in the shorthand on a pre-flight n-probe, plus the
full SUITE-A `--all` green). No vocabulary-data change is needed (the token list already
ships at :883-884); if the amendment also wants a lint pin (vocab lint P7 family) that is
the same item's work.

## Q2 — options=[] on a labware card with an in-session deck plate: defect or intentional?

RULING: **intentional at both layers; not a candidate-population defect of this item, and
NOT a defect at all under the current architecture — it is the forced-draft card design.**

- `options: []` is the DECLARED shape of the forced-draft arm:
  `server/src/ai/shorthandChat.ts:903-911` — "Forced-draft mode offers NO model-authored
  options; the live /m or /l search (real records + ontologies) is the only menu. The bar's
  own candidates ride on `unresolvedFact`, untouched." The card's menuProvider is `/l`
  (domain map :880-888): the scientist searches live; the options field is deliberately
  empty. This is NOT the wellset reading-card arm (menuProvider `choice`, options ARE the
  resolved records — `resolveWellsetsPass.ts` header :28-34), which never fired here
  because the wellset resolver never engaged (Q1).
- The reason flip (ambiguous-noun vs unknown-noun) is deterministic GIVEN the label:
  `plate` -> 5 in-band tier-1 store records -> `inBand.length > 1` -> ambiguous-noun
  (`server/src/compiler/resolution/resolutionEngine.ts:364-372`); `the plate` -> zero
  in-band -> unknown-noun (:402). The label flips because of the model variance in Q1, not
  because the engine wobbles.
- `'the plate'`/`'plate'` intentionally do NOT bind to a run-placed deck instance. The
  spine's labware pool is STORE records (adapters gather tier-1 candidates from
  labware/store lookups); the run-placed LWI-1 lives in lab state, not the resolution pool
  — the D2 protocol-vs-run identity boundary. The deck plate is bound at the FOLD, not the
  door: the `labwareIdentityResolution` ladder (`scientist-intent-vocabulary.yaml:946-954`,
  rung `uniqueLabwareType`) folds a symbolic hint onto the placed instance. The green add
  legs are the live proof of the utterance form that DOES bind end-to-end: shorthand
  `labware: "96-well plate"` passes the door (single store candidate — the
  `generic_96_well_plate` alias, `server/src/ai/compiler/labwareLookup.ts:23`) and the
  fold keys wells onto LWI-1 (235639Z arm-log: `after_labware={"LWI-1":{"A1:H1":[beads]}}`).
  NAMED BINDING FORM for labware nouns that must pass resolve_nouns: the labware's TYPE
  word as declared in the store (e.g. `"96-well plate"`), or a pre-flighted unique store
  label. A bare deictic ("the plate", "plate") is not, and making it one would collapse
  run-instance identity into the store pool — a new campaign against D2, not this item.
  (The product gap "deck-aware noun binding at the door" is real; it joins the A0r/Anti-A4
  open-edge conversation, it is not a defect claim against these receipts.)

## Q3 — Control leg: re-shape, not named limitation

RULING: the non-vacuous arm-log evidence is UNREACHABLE *for a noun that fails the door* —
structurally, not contingently: `resolve_nouns` bars the compile and the cascade barrier
skips every consumer without invoking run()
(`scientist-intent-compile.yaml:17-25`; `lab_state` is downstream at :115-118). "ghost-plate"
is an unboundable coin word, so the fold can NEVER run for it at any spine ordering —
AS-L2T1651-CONTROL-SPINE-INTERCEPTS is confirmed as permanent, and the l2t0310 Q2
expectation that the ghost-plate leg would be "actually reached live" is hereby
SUPERSEDED (reason: it assumed reachability of a door-barred noun; the door order was
never the fixable variable — the noun's bindability is).

The fold's never-guess diagnostic surface does not need the noun to FAIL the door — it needs
the noun to PASS the door but no-op the fold's identity ladder (zero matching rungs ->
no-op + `lab_state_unresolved_*` diagnostic, the `labStateContentBearingEventTypes`
declaration at `scientist-intent-vocabulary.yaml:897-915`). That is a re-shape INSIDE the
l2t0310 Q4 swap authority (it plausibly flips the named root cause):

  turn X (ratified replacement)  "add beads to <DECK-ABSENT STORE-RESOLVABLE PLATE LABEL> well C1"

where the label is pre-flighted via the `/l` probe to EXACTLY ONE bind:pass tier-1
candidate that is NOT the deck-placed instance (the receipts' own candidate dump shows
single-candidate store labware exist — e.g. probe "Bead Beating Plate A" /
LAB-w211-golden-beadplate-a). Expected contract: door binds the store record ->
expand emits add_material with a labware hint that is neither a committed instance id, a
declared identity token, nor a unique placed labwareType -> fold no-ops, arm_log proves
after==prior, pass surfaces the diagnostic, no contents written, no second labware placed
— the identical evidence shape l2t0310 Q2 promised ("lab_state diagnostic, no contents, no
second labware"). Two cautions for the drive: (i) 235639Z turn X shows the model
HALLUCINATING a second `mix labware: "the plate"` action on this prompt — if the card
names a noun other than the control plate, capture the receipt and report, do not chase;
(ii) if the re-shaped control bars at a DIFFERENT surface than the fold no-op, that is a
receipt-back-to-architect event (same instruction as l2t0310 §4), not a fix-run.

## Q4 — Determinism is not the acceptance; the ONE-green-run bar stands, blocked upstream

RULING: **determinism per se is NOT in scope for L2-LABSTATE-CONTENTS-1's acceptance, and
the acceptance is NOT re-defined to n-of-m.** Spec §11
(`.hermes/plans/2026-10-29_L2-LABSTATE-CONTENTS-1-spec.md:423+`) expects ONE green all-legs
run and stays byte-identically. Consequences:

1. The mix leg CANNOT go green on any number of re-runs until the Q1 producer-side data
   declaration ships: with no token on the wire the server is contractually forbidden from
   guessing the union (never-guess is the design, and vacuous `details {}` is the named
   acceptance failure, not a near-miss). Re-running a coin-flip harness against a contract
   that was never engaged is not evidence either way.
2. The item is therefore **blocked pending Brad's approval of the new item
   L2-WELLSET-TOKEN-EMIT-1** (Q1 boundary). That item owns the sampler-surface prompt-data
   declaration; THIS item's diff stays untouched (l2t0310 Q4 stands: 15-file diff needs no
   edit; the fold is proven correct when engaged). Once the token emission ships, the
   server's mix behavior is deterministic (pure ledger core, DATA gates); whatever residual
   model-emission variance survives is a drive-environment property to be evidenced, not
   waived.
3. Ed-L2-LABSTATE-CONTENTS-1-CANONICAL-SHAPE / ED-WELLSET-AC2-LIVE clear ONLY on the
   ONE green all-legs post-merge re-drive (turns A/1/1b/2 green + turn X green on the
   re-shaped control + SUITE-A `--all` incl. P7 green). No seeded-sampler precondition,
   no temperature pin, no n-of-m relaxation — seeding would mask the very producer-surface
   gap the new item fixes.
4. The add legs being green twice and the ledger persistence proof being green twice are
   real, standing evidence for the item's fold scope (they mirror the seeded test's
   downstream-of-commit claim); they do not clear the mix/control legs and no one should
   read them as close.

## Instructions to the orchestrator

1. Do NOT re-drive the mix leg or the ghost-plate control in the interim; both are
   contractually incapable of flipping green (Q1/Q3). Further utterance swaps on turn 2
   are OUTSIDE the l2t0310 Q4 swap authority — no carrier word can make an
   unemitted token exist. The only authorized utterance change is the Q3 turn-X re-shape,
   and it may be exercised WHEN the acceptance drive is next run, not before.
2. File L2-WELLSET-TOKEN-EMIT-1 as an amendment proposal for Brad with the Q1 boundary,
   the nine-receipt token-absence evidence (architect-verified), and the acceptance above;
   do not enqueue it until approved. Lane 2, single task.
3. When the acceptance drive is next run (post the new item, post-merge): pre-flight the
   Q3 control label via /l exactly as l2t0310's material pre-flight (one bind:pass tier-1
   candidate, report probe output in the receipt); keep the mix and control legs red-named
   until green-named.
4. Route the 235639Z turn-X hallucinated-mix-action observation to the new item as
   model-variance evidence (it strengthens the under-declared-producer-surface case).
5. This ruling changes no spec text, no item diff, no vocabulary file, and no queue.

END-RULING
