"""GC-8 reference entry script — the thin consumer of the reusable
quantification module (spec §A0).

This file is FIXTURE DATA (the reference copy for review + the vitest leg's
createRevision source). The AUTHORITATIVE copy lives in the analysis-revision
RECORD (data repo, minted via POST /analysis-revisions) — never in the code
repo. The entry script contains ZERO domain truth: it passes the DECLARED run
parameters through and publishes whatever quantify_peaks emits (the module
publishes the quantified_peak_table + the effective_parameters provenance
artifact itself — §A4/A6).

Named inputs: `calibration_model` (the PROMOTED model artifact from a CAL run)
+ `peak_table` (a DIFFERENT run's GC-7 artifact — the acceptance spine).
No filename literal, no compound list, no window literal, no default.
"""
from computable_lab_analysis.quantification import quantify_peaks


def run(ctx):
    quantify_peaks(ctx, ctx.parameters)
