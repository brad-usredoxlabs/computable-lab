# PEAK NAMES COME FROM THE STANDARD, AND SAMPLES INHERIT THEM BY RT MAPPING

Status: RULING — Brad, 2026-11-15, in session, verbatim:

> "at the very least, there should be a table - like in ChemStation - where i can give each peak in a run
> its chemical name"

> "this can be applied to the standard and then mapped onto samples"

Lane: 2. Supersedes nothing; it fills the gap that `GC-ANALYSIS-IS-CL-SURFACE` left open (that decision
said the GC analysis surface is CL's own, and that the AI invokes existing manual operations — it did not
say where peak identity comes from).

## The ruling

1. **A peak is named on a reference run** — the standard (the FAME-37 mix) — by a human selecting the peak
   in a table and binding it to a compound reference. The name is a compound id (registry / CURIE), never
   free text. Free text is only ever a *proposal for a new local term*.
2. **The naming is an annotation over the measurement, never an edit of it.** The parsed peak table is
   evidence and stays byte-identical. What is written is a peak-identification record: measurement id, peak
   index, compound id, observed RT, unit, author, timestamp, source of the name.
3. **The standard's names compose a retention-time reference library** — a versioned record derived from
   the annotations, scoped to the GC method (column, temperature program, flow, detector). It is never typed
   by hand and never assumed to apply to a different method.
4. **A sample is named by mapping, not by asking again.** Sample peaks are matched against the library
   within a tolerance declared in data, and each match is presented as a *proposal* with its evidence
   (matched reference peak, ΔRT, tolerance, library revision). Acceptance writes sample-scoped annotations
   citing that revision. A peak with no match is shown as unnamed — never guessed, never defaulted.

## Why it is this shape and not "just type a name in the table"

- Identity as ontology id keeps the record computable (coverage, quantification, calibration all key off
  compound id); free text would put us back in Babel.
- Annotation-over-measurement keeps provenance honest: "what the instrument reported" and "what a human
  said this is" are two different claims with two different authors.
- A method-scoped, versioned library is what makes the naming **reproducible**: a sample named in March is
  explainable in June because the library revision and the ΔRT are on the record.
- The tolerance and the matching rules live in data, so a different column or a different method gets a
  different library rather than a silent wrong answer.

## Consequences for the queue

- `L2-GC-AIA-PARSER-SHAPE-1` is a prerequisite: peaks must be addressable by index (not by an RT smuggled
  into the `well` field) before anything can be named.
- `L2-GC-PEAK-NAMING-1` implements points 1–4 above on the existing analysis surface (peak table +
  chromatogram markers), reusing `schema/registry/compound-classes/fame-medium-chain.yaml`.
- The blocked GC items remain the natural continuation: compound library (which compounds the analyst may
  choose), result bases, peak states (excluded / manually reintegrated / saturated), analysis stages.

## What is NOT decided here

- Whether acceptance may ever be automatic for a high-confidence match. Default today: a human accepts.
- Compound standardisation beyond the FAME chain (the 37-component mix needs the full chain, only 6:0/8:0/
  10:0 are declared today).
- Calibration/quantification (response factors) — that is the calibration-curve path, already separate.
