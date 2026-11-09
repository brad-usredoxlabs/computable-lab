# RULING — L2-LABSTATE-CONTENTS-1 material-noun gate (l2t0310 packet)

Filed 2026-10-30 by the lane-2 architect. Packet:
`/home/brad/.hermes/cl/lanes/2/decisions/LABSTATE-MATERIALNOUN-gate-question-l2t0310.md`.
Item: L2-LABSTATE-CONTENTS-1, branch cl/lane2-labstate-contents-1-l2t2255 (HEAD 3b282bb9,
code 0ee16eb9). READ-ONLY ruling: no product code, no merge, no drive run by the architect.

## First-hand verification (everything load-bearing re-checked by the architect)

1. CONFIRMED — pipeline ordering. `schema/registry/compile-pipelines/scientist-intent-compile.yaml`:
   `resolve_nouns` depends only on `ai_precompile` (:22-25); `expand_biology_verbs` depends on
   resolve_nouns (:47-49); `resolve_roles` (:67-69), `resolve_wellsets` (:91-94), and `lab_state`
   (:115-118) all sit downstream. The pass is documented IN THE DATA as "SPINE-4: the one
   noun-resolution door ... Any argument still unresolved bars the compile" (:17-21) and
   "unresolved arguments bar compilation" (:25). The bar is the declared contract, not an accident.
2. CONFIRMED — scope proof. `git -c core.fileMode=false diff --name-only 150359aa~1 HEAD` in
   wt/L2-LABSTATE-CONTENTS-1-lane2-l2t2255: 15 files, NONE matching
   resolveNouns|normalizeScientist|shorthandChat.ts|resolutionEngine (grep count 0). The gate is
   provably pre-existing and upstream; the item's diff cannot have caused it.
3. CONFIRMED — raw drive receipt (20261030T063626Z): turn A fires the fold live
   (create_container event, ARM-LOG `after_labware={"LWI-1":{}}`, R3-unique per OQ-3);
   turns 1/1b/2 all `events:[]` + material card (unknown-noun on "material A", then
   ambiguous-noun on "A"/"B" with tier-1 candidates acetonitrile / clofibrate /
   Trypsin-EDTA-DMEM-FBS / BashingBead-etc.) and EMPTY ARM-LOG (fold never invoked).
   Turn 2 union vacuous — a named acceptance failure, honestly reported.
4. CONFIRMED — mint+answer receipt (20261030T064740Z): mint 'A' -> MAT-a-3t3a (200),
   answer with ref kind=record, recompile STILL bars. The recompile's own candidate dump shows
   THREE tier-1 candidates for "A" (the freshly minted A, acetonitrile, clofibrate-in-DMSO) —
   i.e. reason flipped to ambiguous-noun because minting ADDED a candidate to an already
   multi-candidate label. This is exactly the arithmetic already ruled in
   `decisions/W28-A5h-labware-semantic-noun-answer-decision.md` (ambiguous-noun fires on >=2
   in-band candidates; mint can never clear it; the answer path is prompt-text-only until the
   answered-slot-binding ships).
5. CONFIRMED — the report (§7-§8) and spec §11/§12/§15 say what the packet says: §12 pre-names
   this exact escalation ("store-record material resolution ... architect escalation, NOT a
   fix-run"); OQ-1/OQ-2/OQ-3 ratified as the packet describes (4-turn drive stands; RANGE_RE
   off-limits, ':' form permitted as ratified fallback; R3-unique is the live winner).

## Q1 — Is the bare-label material-noun bar the INTENDED no-seed product behavior?

RULING: **Yes.** `resolve_nouns` is the declared SPINE-4 door: an unresolved noun argument bars
the compile and cascades the barrier to every consumer below it (pipeline YAML :17-25,
first-hand). Baring a bare single-letter label ("A"/"B" — ambiguous against multiple tier-1
store concepts, unknown against none) is the never-guess contract the system is built on; an
accepted-but-unbound material would put invented identity into the ledger — exactly what the
item's own §5.3 material-purity contract forbids downstream. Tension noted honestly: the AI-loop
ruling's direction (confirm terms in the REVIEW dialogue, never a blocking pre-draft card) is a
PRODUCT-DIRECTION ruling about ontology pre-enforcement in the drafting loop; it does not repeal
today's structural noun door at compile, and this item may not change resolve_nouns either way
(packet constraint, honored). If Brad later wants the shorthand surface to draft through
unresolved nouns and confirm at review, that is a NEW campaign against the SPINE-4 contract —
not this item.

## Q2 — Ratified replacement utterances for the acceptance drive

RULING: acceptance line 1 is re-shaped to RESOLVABLE material nouns. The fold's contract
(symbolic->instance ladder, verbatim material passthrough, never-guess) is what the item owns;
the bare-label gate is upstream product contract. NO code change is required or permitted in
this item — the drive passes on the current diff. The 48-well A1..H1 + A2..H2 -> A1:H2 union
semantics, the non-vacuous-[] rule, and the never-guess negatives are UNCHANGED.

Ratified drive utterances (verbatim; ':' form per the OQ-2 ratification — the receipts already
prove the hyphen survives lowering, but the ratified ':' form removes the live-lowering risk):

  turn A   "Place a 96-well plate on the deck."                    (unchanged, verbatim)
  turn 1   "add acetonitrile to A1:H1"
  turn 1b  "add clofibrate 1mM to A2:H2"
  turn 2   "mix all wells that have material"                      (unchanged, verbatim)
  turn X   "add acetonitrile to the ghost-plate well C1"           (control: now uses a
                                                                 resolvable material so the
                                                                 GHOST-PLATE never-guess leg
                                                                 is actually reached live —
                                                                 the old "material Z" control
                                                                 died at the material gate
                                                                 first, per report §10)

Grounding of the two nouns: `acetonitrile` (MAT-acetonitrile-dl1b) and `clofibrate 1mM`
(MAT-clofibrate-1mm-10tf) are REAL store records the spine itself surfaced as tier-1
referentLevel:concept candidates with `bind: pass` in the 20261030T063626Z receipt's own
candidate dump — the engine considers them bind-eligible; no harness seeding, no new records.

PRE-FLIGHT (mandatory, orch, before the acceptance run): for each material label, query the
resolution surface (/m menuProvider, the same spine the card uses) and require EXACTLY ONE
bind:pass tier-1 candidate. "clofibrate 1mM" is one candidate in the receipt dump but the store
also holds "1 mM clofibrate1 mM Clofibrate in DMSO"; if the probe returns >=2 in-band candidates,
SWAP that label for any other /m-verified unique material label (e.g. probe "bench bead beater",
"96-well deep block", or any store material that returns a single bind:pass match). The swap
authority is orch's; the invariant is: two DISTINCT resolvable materials, each single-candidate,
no bare single letters. Report the probe output in the receipt.

Expected live result (the acceptance, unchanged in shape): turn 1 accepted -> ARM-LOG
after_labware LWI-1 wells non-empty over A1..H1 keyed to the seen material label (verbatim
passthrough — the label the scientist typed, per §5.3, NOT a MAT- id); turn 1b's PRIOR already
contains turn 1's contents (persistence proof); turn 2's mix event details carry EXACTLY the
48-well A1..H1+A2..H2 union by the committed ledger; turn X -> lab_state diagnostic, no contents,
no second labware. Vacuous []==[] remains an acceptance failure.

If the drive instead dies on the material gate for a PRE-FLIGHT-VERIFIED unique label, that is
NOT a fix-run: capture the receipt and route back to the architect (it would mean the spine bars
single-candidate tier-1 bind:pass nouns, which contradicts resolutionEngine's
`inBand.length === 1 -> bindingFor` contract and would be a new defect class).

## Q3 — Mint+answer re-bar: defect or expected?

RULING: **expected under the CURRENT architecture, already owned elsewhere — NOT a new item and
not a LABSTATE defect.** Mechanism (all previously adjudicated, re-confirmed in the receipt
above): (a) a clarification answer is prompt text only until the answered-slot-binding ships —
`W28-A5h` Q1 first-hand (boundKeys come exclusively from engine.bindings; the answer never
enters a binding check); (b) mint can never clear ambiguous-noun by arithmetic — the mint turned
"A" into a THIRD candidate; (c) the recompile re-derives the shorthand from the model text, which
re-emits the bare `material: "A"`. The product gap is REAL and already ticketed: ANSWER-BIND-1
("clarification answers with a record idiom become authoritative data-bound slot bindings BEFORE
resolve_nouns", THE LIST lane 2 :9649, spec
`.hermes/plans/2026-10-18_0845-ANSWER-BIND-1-answered-slot-binding-spec.md`, origin W28-A5h
Q2/Q4.6). Disposition: (i) do NOT open a new item; (ii) fold this drive-mint receipt into
ANSWER-BIND-1's evidence as a confirmed shorthand-surface reproduction (kind=record answer);
(iii) the untested kind=material/vocabulary-style answer is ANSWER-BIND-1's evidence-debt too,
not LABSTATE's. ED-L2-LABSTATE-CONTENTS-1-CANONICAL-SHAPE clears ONLY on the Q2 drive: the
post-merge D13-C orch re-drive of the ratified utterances above, receipts under
/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/ (the mint+answer path is NOT the
clearing drive — it exercises a gap ANSWER-BIND-1 owns).

## Q4 — LABSTATE diff disposition

CONFIRMED: **no change to the merged/pending LABSTATE diff is implied by this ruling.** None of
the 15 item-diff files (fold, pass seam, vocabulary DATA + loader, tests, harness, report) needs
an edit: the fold is proven correct when events reach it (128/128, canonical-shape 7/7 on real
expander output, turn-A live). The drive harness's four utterance strings + the control are
harness inputs, not product code — orch updates drive.py's TURNS list to the Q2 utterances as
part of the post-merge re-drive (harness edit committed by orch alongside the re-drive receipts;
this is evidence collection, not a product change, and does not reopen the item's diff).
No resolve_nouns change in this item either way.

## Instructions to the orchestrator

1. Post-merge (WELLSET-adjacent merge order per the item's D13-C plan), re-drive with the Q2
   utterances after the pre-flight probe; receipts are the acceptance and clear
   ED-WELLSET-AC2-LIVE (D13-C) + ED-L2-LABSTATE-CONTENTS-1-CANONICAL-SHAPE.
2. Keep the SUITE-A `--all` re-drive green (P7 regression bar) per spec §11.
3. Route the drive-mint receipt to ANSWER-BIND-1 as evidence (Q3); no new item.
4. If the re-drive passes every leg except turn X reaching a DIFFERENT bar than the ghost-plate
   never-guess, report the receipt — do not fix-run the control.
5. Item stays NOT complete until the re-drive legs are green; the coder's honest non-claim
   (§8, no DONE marker) was correct behavior and stands.

END-RULING
