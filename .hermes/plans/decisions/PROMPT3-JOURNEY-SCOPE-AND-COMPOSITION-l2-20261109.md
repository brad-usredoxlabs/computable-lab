# PROMPT 3 — journey scope and the well-composition figures (lane 2, 2026-11-09)

Status: **RESOLVED BY ARCHITECT on evidence** — not a preference call, so it does not wait on Brad.
Informed for the record; Brad can overturn only by changing the recipe itself (see "What would
overturn this"). Binding for lane 2's prompt-3 rubric and for the gate that grades it.

Two of the four open questions in `lanes/2/ARCHITECT-HANDOFF-20261109.md` §5 are settled here,
because the corpus text answers them without additional information:

1. whether the two corpus sections both titled "Prompt 3" are one journey or two;
2. which percentage figures the well tooltip must display.

The remaining two (§5.1 prompt-2 driver ruling, §5.2 seed content) are genuine Brad decisions and
are NOT settled by this note.

---

## 1. The two "Prompt 3" sections are ONE journey in two halves

Source: `test-prompts/AI-Chat-Corpus2.md` — line 35 (`## Prompt 3`, cell dosing, ends "accept") and
line 46 (a second `## Prompt 3`, the 24 h incubation).

Evidence (all from the corpus file itself):

- line 3, verbatim: *"These propmts are meant to follow one another being part of a single
  experimental setup.  Do not clear context between prompts."*
- line 54, the `## Prompt 4` expectation, verbatim: *"The wells are now empty except for the HepG2
  cells which have now grown in number over the 24 hours based on an assumed doubling time of 30
  hours."* That 24-hour growth is **the second Prompt 3's incubation**. Split the two sections and
  prompt 4's stated expectation becomes unreachable — there would be no incubation in context to
  grow the cells over.
- line 48's incubation carries no target of its own; it operates on the wells the dosing half just
  filled.

Ruling: draft prompt 3 as **one journey, two halves** — dosing (O1–O4 in
`lanes/2/prompt3-criteria-draft.md`) then incubation (O5). No split into two prompts; no reordering.

Consequence for the queue: the 13 queued items and the rubric's O5 already model it this way
(`prompt3-criteria-draft.md` cites "lines 35 and 46 — cell dosing, then incubation"). Nothing to
re-plan; this note only removes the open question.

## 2. The displayed composition figures are the DERIVED ones, not the corpus text's

The corpus expectation at line 44 reads, verbatim: *"the final concentrations of FBS, DMEM,
Trypsin-EDTA (~8.6%, ~82.9%, ~8.6%).  The wells E2-H5 will also show ~0.7% DMSO."*

Measured against the recipe the corpus itself gives (Cell Seeding protocol steps 4 and 6: 2 mL
trypsin-EDTA, then quench with an **equal volume** of DMEM + 10 % FBS), plus prompt 2's 100 µL DMEM
already in every well A2–H5:

| quantity | value |
|---|---|
| dose | 10,000 ÷ 483 = 20.7039 µL, offered as **20.7 µL** |
| of that dose: trypsin / DMEM / FBS | 50 % / 45 % / 5 % (equal volumes, quench is 90:10) |
| well total | 100 + 20.7 = 120.7 µL |
| trypsin-EDTA | **8.58 %** |
| DMEM | **90.57 %** |
| FBS | **0.86 %** |
| DMSO on E2–H5 | **0.82 %** (1 µL of the prompt-2 clofibrate/DMSO addition in 121.7 µL) |

The corpus figures are internally consistent only as a *sum*: 8.6 + 82.9 + 8.6 = 100.1. Read against
the recipe they are three different mistakes:

- **trypsin ~8.6 % — correct.** This is the control. It matches the derivation to two decimal places,
  which is what establishes that the recipe reading above is the one the corpus author had in mind.
- **DMEM ~82.9 %** is 100 / 120.7 = 82.85 % — the *original 100 µL bolus* as a share of the final well,
  i.e. it omits the ~9.3 µL of DMEM that arrives inside the dose.
- **FBS ~8.6 %** duplicates the trypsin figure; the derived value is 0.86 % (exactly a factor of 10).
- **DMSO ~0.7 %** does not follow from any of the recorded volumes (derived 0.82 %), and the corpus's
  own earlier figure is consistent with the derivation — prompt 2 line 33 expects *"1ul of DMSO
  (~0.9%)"* on a 101 µL well, and 1/101 = 0.99 %. So the 0.7 % is the outlier in its own family.

Ruling: the tooltip displays the **derived** values (trypsin ~8.6 %, DMEM ~90.6 %, FBS ~0.9 %,
DMSO ~0.8 %), graded with a **±0.1 percentage-point tolerance**, and the gate receipt records the
discrepancy against the corpus text rather than treating it as an app defect. Grading the app
against 82.9 % / 8.6 % would demand that it reproduce two arithmetic slips.

Rubric updated accordingly (`lanes/2/prompt3-criteria-draft.md`: O2 and §4).

## What would overturn this

Only a change to the recipe, i.e. a statement from Brad that:

- the quench is not 90 % DMEM : 10 % FBS, or
- trypsin-EDTA is not added at an equal volume to the quench (the "50:50" in the corpus), or
- the 100 µL DMEM from prompt 2 is not still in the well when the cells go in.

Any one of those changes the derivation chain and this note must be revisited before the gate is
written. The corpus's own percentages cannot overturn it: they contradict the corpus's own recipe.
