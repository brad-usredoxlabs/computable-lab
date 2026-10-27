"""GC-8 reference entry script — the thin consumer of the reusable
calibration-fit module (spec §A0).

This file is FIXTURE DATA (the reference copy for review + the vitest leg's
createRevision source). The AUTHORITATIVE copy lives in the analysis-revision
RECORD (data repo, minted via POST /analysis-revisions) — never in the code
repo. The entry script contains ZERO domain truth: it passes the DECLARED run
parameters through and publishes whatever fit_calibration emits (the module
publishes the calibration_table, the calibration_model, and the
effective_parameters provenance artifact itself — §A1/A6).

Named inputs = one peak-table-shaped input PER standard level (`level_<k>`) —
the submitter wires GC-7 peak_table artifact refs (or promoted drefs) into the
level slots; the module classifies by CONTENT, never by naming (A0/OQ5).
No filename literal, no compound list, no window literal, no default.
"""
from computable_lab_analysis.calibration_fit import fit_calibration


def run(ctx):
    fit_calibration(ctx, ctx.parameters)
