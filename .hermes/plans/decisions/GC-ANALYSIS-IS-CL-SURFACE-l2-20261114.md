# GC analysis is computable-lab's analysis surface, built to the manual's spec (BRAD RULING 2026-11-14)

Status: BINDING product intent. Recorded by the architect; the decision is Brad's.

## Brad's words (verbatim, 2026-11-14)

> this is a) . the manual was written by an AI with zeto knowledge of computable-lab architecture.
> as soon as the prompt 1 work comes back and we setermine we have the correct approach, the next
> priority is building out the GC analysus to this soec.

Option (a) in the question put to him was: **this is computable-lab's GC analysis surface**, not a
standalone application that exchanges files with CL.

## The spec, and where it lives

`/mnt/vast/gc-fid/manual/2026-workflow-for-GC-FID-data-analysis.md` — a design proposal and operator
manual (470 lines) covering: add runs → review standard → confirm identities → validate calibration →
review sample → export. It was written by an AI with NO knowledge of computable-lab, so it must be read
as the SCIENTIFIC WORKFLOW SPEC, not as an architecture: every structural choice in it is subject to
the computable-lab way.

Companion: `ChemStation-FAME-Manual.md` (the installed 2015 ChemStation workflow, and its limits), and
`restek35077-compounds.txt` (the 37-component inventory with CAS numbers and weight fractions).

## Why the spec is adopted

It is the first document to state the GC analysis workflow as a sequence of stages with a named
completion condition per stage, and to state, per stage, what the operator does, what the app may
compute, and what it must never claim. That is the journey doctrine expressed in the domain. Its
acceptance table (§11) maps one-to-one onto lint rules and tripwires.

Three specific doctrines in it are adopted as CL rules:

1. **Saved ≠ approved.** A draft is saved only after a durable write; **Approve calibration** is a
   distinct, versioned event that produces a reusable artifact. (Same discipline as the journey
   readiness artefact: a green flag is derived from evidence, never set by an unrelated action.)
2. **Never tune to hit a number.** Settings are never adjusted automatically to reach an expected peak
   count; a mismatch is shown with the responsible regions and invites review.
3. **Epistemic states are data.** `measured | not detected | not determined | below reporting limit |
   unresolved | excluded` are distinct states. A blank is not zero, and a missing component (C4:0 in the
   solvent front) is *not determined / solvent interference*, retained in the inventory.

## Model mapping (manual → computable-lab)

| Manual model | computable-lab today |
|---|---|
| RawRun / Signal | `data-reference` + `measurement` (exists) |
| IntegrationRecipe + per-run overrides | `analysis-revision` parameters (exists; needs to be a reusable, versioned recipe) |
| Peak + manual edits | peak-table artifact + reason-coded flags (exists: a null numeric column must carry a reason code) |
| CompoundDefinition + identity assignment + evidence + status | **absent** — no analyte library, no evidence column, no assignment status |
| StandardPreparation + concentrations | `material` / formulation records (exists by design, unused for this) |
| CalibrationDraft → CalibrationVersion | `calibration_fit` artifact + promotion (exists) |
| SampleAnalysisRevision | `analysis-run` + artifact revisions (exists) |
| ViewState (zoom, alignment, scale) | surface state only, never a record (already correct) |
| ResultBasis (4 output bases + denominators) | **absent** as a declaration |

So roughly two thirds of the model already exists. The spec's value is that it names the missing third
precisely, and names the workflow that makes the existing two thirds usable by a scientist.

## The order of work (Brad's priority)

1. Finish prompt 1 and reach a verdict on the driving approach. Nothing here pre-empts that.
2. Then, in this order, because each is data and each makes the later screens honest:
   a. the compound inventory as registry data (37 components, CAS, fractions, certificate provenance,
      and an explicit statement that line order is NOT elution order);
   b. the four result bases as declared options with denominators and prerequisites;
   c. the epistemic states as a closed enum with reason codes;
   d. the reusable integration recipe (solvent exclusion + minimum area + baseline edits) as a versioned
      declaration;
   e. the stage-based review surface, reworking the existing `/analysis` page rather than adding an app.
3. Vendor integration (ChemStation's own peak table inside the AIA export) is retained as a **comparison
   artifact**, never merged into our computed result: two authorities may be displayed side by side, but
   only one may be committed as the analysis.

## Non-negotiables carried from existing doctrine

- Raw files immutable; hashes recorded; the original name and import metadata preserved.
- No ChemStation version is declared supported until its reader is validated against that version's
  files. (This is why `.CH` remains unsupported while the AIA/netCDF path is proven.)
- Display changes — zoom, alignment, normalisation — never change integrated areas or reported amounts.
- Every result is traceable to an immutable revision; a later edit creates a new revision and the older
  report is marked as earlier.
