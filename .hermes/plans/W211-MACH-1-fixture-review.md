# W211-MACH-1 fixture review — zymo-intent.frozen.yaml v1 (reviewed content)

Review artifact per the spec's FIXTURE CONTRACT §5: every planted sentence,
which obligation it serves, and why its ambiguity class ACTUALLY exercises the
machinery. Fixture: `app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml`
(sha256 be891b174f8b0c63a19ea567f2889985dfe5e7fc687507a214945f956211b768,
self-pinned; PROVENANCE.md carries the same value; content-rev 1.1 = advc c1
FIX1 D3/D5 — fidelity block machine-readable + SELF-PIN comment corrected,
reviewed VALUES unchanged).

## Scope honesty (the historical drift this fixture is NOT)

The historical W2-11 4->6->6->6 fact-count drift was MODEL naming instability
plus the arithmetically-inconvergable ambiguous-noun (A5h Q1.3). Neither is an
obligation class here: with the producer REPLACED at its wire boundary, model
drift is out of scope BY CONSTRUCTION (the frozen `modelOutput` is byte-fixed),
and each ambiguity class below is the one the BIND-1 / SURFACE-1 / mint / deck
machinery respectively consumes.

## Sentence -> obligation map (protocolText; the frozen macro mirrors it)

| Sentence (abridged) | Serves | Why the class exercises real machinery |
|---|---|---|
| "Bring one Sample Plate holding 50 uL of each stool sample..." | (a) | `Sample Plate` names exactly ONE seeded labware (LAB-w211-sample-plate). Tier-1 single in-band hit -> the engine's single-winner arm binds it with NO clarification fact (probeE: zero facts name it). Negative half (non-unique DOES card) is exercised by (b)'s card — no second fixture noun needed (spec (a)). |
| "Transfer 50 uL from the Sample Plate to the Lysis Plate." | fidelity | transfer volumeUl 50 — parameter fidelity in the recomputed macro + LPR overrides. |
| "Add 700 uL of Lysis Solution..." | fidelity | add_material volumeUl 700; Lysis Solution is seeded (MAT-w211-lysis) -> silent bind. |
| "Bead beat the samples in the Bead Beating Plate for 30 s." | (b) | `Bead Beating Plate` names TWO seeded labware (…-beadplate-a / …-beadplate-b), both tier-1 in-band (confidenceAccept band, re-pinned from the merged tree) -> deterministic ambiguous-noun with actionLocation {actionIndex 2, bead_beat, argument labware}. Card routes '/l' (ANSWER-SURFACE-1), NO mint floor; the pick emits [[labware:<id>|label]]; BIND-1 binds authoritatively and the fact shrinks next draw. |
| "Spin the Lysis Plate at 3000 rpm for 10 min." | fidelity | spin rpm/duration survive. |
| "Transfer 500 uL from the Lysis Plate to the MagBinding Plate." | fidelity | second transfer volumeUl 500. |
| "Add 500 uL of MagBinding Beads v211g1..." | (c) | `MagBinding Beads v211g1` is the cohort-nonce ZERO-MATCH material noun -> unknown-noun with actionLocation {actionIndex 5, add_material, argument material}. Card routes '/m' WITH the picker's mint floor row; the REAL UI mint act POSTs /vocab/mint {refKind:'material'} (material-only, MINTABLE VocabHandlers.ts:45); the minted record is kind material, status 'proposed' (governed provenance); the idiom answer clears the fact. NEVER a labware noun (A5h Q3 category error). |
| "Add 800 uL of MagBinding Buffer..., then wash the plate once." | fidelity | add_material 800 + wash cycles 1. |
| "Elute ... with 100 uL of nuclease-free water." | fidelity | the seeded MAT-w211-water synonym 'nuclease-free water' routes the elute.material noun tier-1 (the l2t2150 synonym pattern). |
| "Incubate the Sample Plate at 37 C for 30 min." | fidelity | declared temperatureC 37 forwarded (WIRE-TEMP-1). |
| "Read the Sample Plate at 600 nm absorbance." | fidelity | read mode/wavelength survive. |

## Store-residue discipline (spec bait: MAT-microcentrifuge-tube-sgzg)

The class-(b) noun is 'Bead Beating Plate' — it does not collide with the
permanent A5-gate residue 'MAT-microcentrifuge-tube-sgzg' (a MATERIAL; the '/l'
routing keeps it off the labware card regardless). The class-(c) noun carries
the fixture-versioned cohort nonce `v211g1` (version bump per cohort if the
nonce ever pre-exists); the leg FAILS the zero-match guard if it pre-exists
(clearGoldenNonce) rather than vacuating the unknown-noun assertion.

## Deck-fidelity bar (NOT boxCount>0)

expectedDeck: exactCheckboxCount 4, mustIncludeLabels = the four bound records'
REAL titles (Sample Plate, Lysis Plate, Bead Beating Plate A, MagBinding
Plate), pickedCheckboxLabel = 'Bead Beating Plate A' — the strongest fidelity
link (the deck shows what the scientist picked). probeF2 measured the completing
compile carries NO labwareAdditions: every deck row is a resolved placement
titled with the record's real title. The retired D4 arm keeps its old
`boxCount > 0` assertion byte-untouched (skip-marked, QUAL-1 pointer).

## Class-(d) honesty

The planted gap-fact entry (plantedFacts[3]) documents the STEP 0 finding: a
non-noun gap fact reaches NO answerable card surface (held-422 arm:
heldFactToClarificationRequest maps a reason with no menu row to null; 200-gap
arm: the client's 200 arms never fold res.clarifications). expectedCard:false
is the BLOCKED-ON-FIX pin (holds at base AND tip). Named fix task:
W211-GAPCARD-1. The fixture is NOT weakened: the obligation stays declared,
the pin documents the gap, and the deck-surface fidelity bar transferred to
(b)'s picked placement offer.

## Ids and mint posture

Every id literal in the fixture is a seedPlan seed id (integrity test pin 3:
no MAT-minted / LPR- / CAN-protocol- pins). No obligation requests a
refKind:'labware' mint (pin 2). The minted (c) id is read dynamically from the
UI's own mint response in the leg.
