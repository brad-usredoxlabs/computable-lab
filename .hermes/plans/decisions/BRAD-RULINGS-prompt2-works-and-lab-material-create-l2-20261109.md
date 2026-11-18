# BRAD RULINGS — prompt 2 banked, and the lab-material create route (lane 2, 2026-11-09)

Status: DECIDED by Brad. Binding for lane 2. Do not re-litigate in code.

Source: Brad, in session with cl-architect, 2026-11-09 ~11:30 EST, answering the four open
questions in `lanes/2/ARCHITECT-HANDOFF-20261109.md` §5. His words are quoted verbatim where they
carry the decision.

---

## R1 — the well percentages

  "you are correct that the final wuantity is 0.86%."

Binding, and consistent with the derivation already recorded in
`.hermes/plans/decisions/PROMPT3-JOURNEY-SCOPE-AND-COMPOSITION-l2-20261109.md`: the tooltip shows
the DERIVED composition (trypsin ~8.6 %, DMEM ~90.6 %, FBS ~0.9 %), graded at ±0.1 percentage point.
The corpus text's 82.9 % / 8.6 % are arithmetic slips, recorded in the receipt as corpus slips, not
app defects. No further question on this.

## R2 — prompt 2: bank it (Option B)

  Question put: "Option A — teach the robot to type, and re-run that one leg on the same frozen code.
  … Option B — declare the two question-card legs 'covered by unit tests' and stamp prompt 2 as
  working on the strength of the two legs that passed today."
  Brad: "Q1) B, its time to move on."

What the orchestrator must do, in this order:

1. Flip `corpus-state.md` prompt-2 from `GATE-PENDING` to **`WORKS`**, with the basis stated in the
   same line and NOT overstated:
   - PASS, on frozen revision `3d94c838`, receipts
     `~/.hermes/cl/receipts/L2-PROMPT2-GATE-20261109/20261109T134959Z-alllegs/` (legAB: full
     journey, 16 wells, 18 events after cold reload, no unwanted question; leg3: no-selection leg,
     record stays at 2 events).
   - leg4 NOT banked as a pass. Banked as **covered by unit tests** by Brad's decision, with the
     measured reason on the record: the app asked a legitimate typed question and the frozen
     driver cannot type (`drivers/leg4.cjs:53` fills only `chat-clarification-slot` testids), so the
     leg is undrivable rather than failed. `L2-GROUPEDSUBMIT-ARM-ANSWER-1` already browser-passes the
     grouped-submit arm that leg4 pins.
2. Close `cards/BRAD-CARD-prompt2-regate-2iterations-l2t3385.md` as ANSWERED (B) so no tick re-raises
   it; do not spawn the typed-answer driver leg — that work is now cancelled, not deferred.
3. Open the prompt-3 line: `corpus-state.md` prompt-3 leaves `LOCKED` only once the ladder is
   dispatchable (R3 below writes the two prerequisites).
4. Keep the nondeterminism finding filed as an observation, not a defect: four identical runs on
   identical code gave no card once and a typed question three times. The precedent for this shape
   is `L2-CLARIFY-REQUEST-COUNT-NONDETERMINISTIC-1`, closed as model sampling variance after eight
   identical request bodies proved the pipeline sent the same bytes every time. If anyone wants to
   spend a unit on it, that hashing probe is the cheap test — do not open it as a product defect.

Do NOT re-run the all-legs gate on a new revision to "confirm" WORKS. The certification is
revision-bound to `3d94c838` and is banked by decision; a later merge does not un-bank it, it only
means a future re-gate would need a fresh frozen revision.

## R3 — the vendor materials are created through the UI, not seeded (Option C)

  "Q2) Option C. I guess i change my mind on this. The driver should be able to add tge materials via
  the UI before beginning the run. right now there are two potential routes to get there: /ingestion
  and /lab . currently neither route allows the search and ingestion of new vendor materials. lets
  add a +new button under /lab/materials and the furst task is : go to /lab/materials and add Thermo
  Trypsin-EDTA, Sigma D6429-500ML DMEM, sigma F4135-100ML FBS."

Consequences, now encoded in the queue:

- **Route chosen: `/lab/materials`.** `/ingestion` is not the home for this; it stays the protocol /
  vendor-document surface. The create affordance is a `+ New` next to the Materials category,
  following the existing `+ New PDF` pattern in `app/src/collections/LabCollectionView.tsx:323-332`.
- **Three real products, verbatim from Brad** (test INPUTS typed by the driver, never seed rows and
  never hardcoded in the app):
  - Thermo — Trypsin-EDTA — CAT# **25200056**
  - Sigma — DMEM — **D6429-500ML**
  - Sigma — FBS — **F4135-100ML**
- **`L2-SEED-LABLOCAL-1` is amended**: it no longer seeds vendor products or lots. It seeds labware
  definitions and ontology-anchored material CONCEPTS only. Seeding the products would let the
  journey skip the create path that Brad wants exercised.
- **Two new items authored**: `L2-LAB-MATERIAL-CREATE-1` (the surface + the data-declared authoring
  profile + the two-record write) and `L2-MATERIAL-SELECTION-POLICY-1` (the data home for "is this
  the lab's default / only DMEM?").
- Every product is anchored to an ontology term "where possible" (Brad). Where no term resolves, the
  concept is created as a local CURIE-style term (`cf:…`) and the UI says so — it must never create
  an unanchored concept silently.
- `L2-PROTOCOL-LOCAL-BIND-1` keeps its job: binding a protocol role to a lab-local product. What
  changes is that the products now exist because the scientist (or the driver) added them, so the
  binder's UNBOUND + reason arm now means "not yet catalogued — create it", with a link to
  `+ New` rather than a dead end.

## R4 — the DMEM ontology anchor, and its trap (added 2026-11-09)

Brad supplied the term directly: **DMEM = `http://purl.obolibrary.org/obo/NCIT_C185409`**, with an
**exact synonym "DMEM"**. This supersedes the architect's earlier statement that DMEM is a mixture
with no single ontology term — that was wrong.

Verified three ways, same day:

1. **House CURIE form**: `NCIT:C185409`; its derived IRI is exactly the PURL Brad cited
   (`server/src/types/ref.ts:253` builds `…/obo/${id}` with `:` → `_`).
2. **Independent lookup** (OLS4, `q=DMEM&ontology=ncit&exact=true`): one hit, `NCIT:C185409`,
   label *Dulbecco's Modified Eagle Medium*, exact synonyms `["DMEM", "Dulbecco's Modified Eagle
   Medium"]`.
3. **Live on the lane-2 stack** (`:3093`): `GET /api/ontology/search?q=DMEM&ontologies=ncit`
   returns exactly one result — id `NCIT:C185409`, label *Dulbecco's Modified Eagle Medium*, uri
   `http://purl.obolibrary.org/obo/NCIT_C185409`.

**The trap, worth a gate check:** the same query *without* the `ontologies` filter returns
`XCO:0001366` **DMEM/F-12 first** — a 1:1 mixture, a different material. A picker that shows a bare
list and autopicks the top row anchors DMEM to the wrong concept. The modal must show namespace and
full label and never autopick across namespaces.

**Reuse note:** the ontology search already exists (`/api/ontology/search`, routes.ts:497 →
OntologyHandlers; `ncit` already declared in pickerConfig:62, client `MATERIAL_OLS_ONTOLOGIES`:947,
OAK defaults:14). `/api/materials/search` is *not* it — that one searches existing records and
answers `q=DMEM` with unrelated Aspirin+DMSO specs.

**Small gap found while grounding:** `server/src/types/ref.ts:247-256` omits `ncit` from its OLS-link
list, so an NCIT ref without a stored `uri` renders no "open in ontology browser" link. Folded into
`L2-LAB-MATERIAL-CREATE-1` (the picker supplies `uri`, so the happy path is unaffected).

## R5 — both approvals given (2026-11-09)

Brad, verbatim: **"a) i approve b) approved"** — (a) the create-time field list for a vendor
material; (b) the prompt-3 rubric.

- The rubric (`lanes/2/prompt3-criteria-draft.md`) is now **APPROVED and frozen**: a check may be
  pinned more tightly with evidence; weakening, softening or deleting one after a run starts needs
  Brad's word again.
- The create-time field list is approved **as proposed** and is declared as data in
  `L2-LAB-MATERIAL-CREATE-1`: package size; formulation or stock concentration as supplied; grade or
  purity; storage recommendation; product URL plus documents; synonyms — on top of the
  schema-required vendor / catalog_number / name / ontology anchor, with the only-vs-default answer
  answered into `L2-MATERIAL-SELECTION-POLICY-1`. Lot number, expiry, quantity on hand, location and
  price stay out (they belong to the lot, instance and vendor-offer layers).

With R2 (prompt-2 WORKS by decision) and R5 (rubric approved), **both conditions that kept prompt-3
LOCKED are now open**. Flipping `corpus-state.md`'s prompt-3 state line is the orchestrator's write
(that file's own header: "The orchestrator updates ONLY the state line per prompt"); the gate item's
status annotation instructs it to do so citing this file. The architect does not edit that ledger.

## R6 — "only" is descoped; "default" is the graded fact (2026-11-09)

Brad, verbatim: *"honestly, the 'only' policy isnt really jecessary, the 'default' is the important
one."*

What changes, and it is a scope cut rather than a redesign:

- **`default` is what gets graded.** Declaring a default marks that candidate row pre-selected in the
  material picker while every other candidate stays present and selectable. That is the behaviour the
  assistant needs in order to stop asking "which DMEM?".
- **`only` stays a legal value but is unenforced.** No cross-record uniqueness lint, no load-path
  guard, no test demanding that two `only` rows fail. The consequence, stated plainly and accepted:
  two vendor products may both be marked `only` for one concept and nothing will complain. The item's
  old acceptance criterion (4) — "two ONLY records fail lint, both ids named" — is replaced by "a
  record whose selection is `only` loads, validates and is served without error, and nothing further
  happens".
- **The cycle-burner is cancelled.** The reviewer's D2 (duplicate-only never enforced on any load
  path) was the thread driving the sixth fix cycle on the client half. It is now out of scope; a
  reviewer raising it again should be pointed at this section rather than a seventh unit.
- **The surviving lint rule stays** (`material-selection-policy-non-only-requires-reason`): a policy
  that names a default must still say why. It costs one field and it is the question a colleague
  would ask anyway.

## Still owed by Brad (not decided here)

- **Rotate the two OpenRouter keys** swept into this morning's consolidation push.
