"""GC-7 reference entry script — the thin consumer of the reusable
peak-integration module (spec §A0).

This file is FIXTURE DATA (the reference copy for review + the vitest leg's
createRevision source). The AUTHORITATIVE copy lives in the analysis-revision
RECORD (data repo, minted via POST /analysis-revisions) — never in the code
repo. The entry script contains ZERO domain truth: it decodes the named
inputs via the GC-6 public reader API, passes the DECLARED run parameters
through, and publishes whatever integrate_peaks emits (the module publishes
the peak table, the signal+baseline artifact, and the effective_parameters
provenance artifact itself — §A3.6).

Channel selection: a single signal input is assumed (the module logs the
assumption); a declared `channel` parameter selects among multiple (the
module validates + fails loudly). No filename literal, no method name, no
compound list, no threshold.
"""
from computable_lab_analysis.d_reader import attach
from computable_lab_analysis.peak_integration import integrate_peaks


def run(ctx):
    decoded = attach(ctx)
    # D5 provenance echo: the module reads source_content_sha256 from the
    # decoded signal's meta.contentHash — the runner passes the DREF's OWN
    # pinned meta (sourcePath + contentHash) on the input spec; wire it into
    # the decoded signal's meta WITHOUT re-hashing (echo, GC-6 D5 doctrine).
    for name, sig in list(decoded.items()):
        if isinstance(sig, dict) and "axis" in sig and "values" in sig:
            handle_meta = ctx.input(name).meta if hasattr(ctx.input(name), "meta") else {}
            content_hash = handle_meta.get("contentHash") if isinstance(handle_meta, dict) else None
            if isinstance(content_hash, str):
                meta = sig.get("meta") if isinstance(sig.get("meta"), dict) else {}
                meta["contentHash"] = content_hash
                sig["meta"] = meta
    integrate_peaks(ctx, decoded, ctx.parameters)
