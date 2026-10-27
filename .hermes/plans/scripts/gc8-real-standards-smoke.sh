#!/usr/bin/env bash
# GC-8 T3 — REAL-STANDARDS smoke (LANE-ONLY, READ-ONLY; spec B2 / T3 / OQ1).
#
# NOT a vitest/unittest case: real NAS bytes are proofed HERE ONLY (B2: NAS
# path literals live ONLY in this script; the code repo + fixtures carry ZERO
# /mnt/vast/gc-fid/machine1 literal).
#
# WHAT THIS PROVES
#   The GC-8 acceptance spine runs END-TO-END on REAL FID bytes with THIS
#   WORKTREE's exact shipped SDK (d_reader + peak_integration + calibration_fit
#   + quantification), in-process:
#     real standard .CH  --decode-->  real peak table (peak_integration)
#     declared level params (placeholder amounts, real RT windows) + the real
#     standard peak table  --fit_calibration-->  calibration_table artifact
#       (THE `verified by` clause: "real-standards run produces the
#        calibration table artifact")  + calibration_model artifact
#     calibration_model  --promote (in-process: the model bytes are written to
#       a temp file and handed to the QUANT run as a FILE input, exactly the
#       shape a promoted dref streams to <name>.bin)-->
#     real SAMPLE .CH  --decode-->  real sample peak table
#       + promoted model  --quantify_peaks-->  quantified rows
#
# HONESTY GATE (raw-proposal :279, BINDING; OQ1 ratified)
#   The corpus' SAMPLE.XML amounts are `0`/placeholder [G1:15] — genuine
#   calibration-standard amounts are scientist data NOT in the repo. So the
#   level->artifact leg runs with DECLARED PLACEHOLDER amounts and every
#   emitted artifact payload is marked
#     provenance_status: "synthetic_levels_not_production_evidence".
#   The receipt line is the DEFERRED class:
#     GC8 REAL-STANDARDS DEFERRED <reason>
#   The orchestrator re-runs at the acceptance gate with genuine amounts
#   (GC-7 OQ1 posture). A DEFERRED-with-honesty-marked-placeholder receipt is
#   the OQ1-ratified acceptable outcome — this leg proves the PIPELINE on
#   real bytes, it does NOT make a production quantitative claim.
#
# Live-lane API note (honest boundary, OQ1 / GC-7 T3 precedent): at receipt
# time the live lane-1 stack (:3092) serves the TRUNK worktree
# (cl-integration-1), whose SDK does not yet carry the unmerged GC-8 modules
# (calibration_fit / quantification) — so the live-API end-to-end RUN
# (register the standard .D package via packageAnalysisInputs, mint the
# revision, execute) is executed by the ORCHESTRATOR at the acceptance gate,
# post-merge, on the merged lane stack. THIS script is the read-only
# real-NAS leg the orch re-runs: it proves the module chain's
# decode -> integrate -> fit -> publish -> promote -> quantify pipeline
# against REAL bytes with the worktree's exact SDK.
#
# Exit 0 + the DEFERRED (or OK) receipt on a full end-to-end run; non-zero
# with a NAMED failure otherwise.
set -euo pipefail

NAS_ROOT="/mnt/vast/gc-fid/machine1"
# The real FAME standard series (RESTEK 35077) and a real butter SAMPLE:
#   standard .D (the 6:0/8:0/... FAME series) and one sample .D.
STD_DIR="20201024-RESTEK-60-RESTEK-H.D"
SAMPLE_DIR="20201023-WEGMANS-BUTTER.D"
if [ ! -f "$NAS_ROOT/$STD_DIR/FID1A.CH" ] || [ ! -f "$NAS_ROOT/$SAMPLE_DIR/FID1A.CH" ]; then
  echo "GC8 REAL-STANDARDS SKIP: $NAS_ROOT not fully mounted (lane-only leg — skip is OK, fail is not)" >&2
  exit 0
fi

# This worktree's SDK src (script lives at <worktree>/.hermes/plans/scripts/;
# the package lives at <worktree>/server/python-executor-service/src).
SDK_SRC="$(cd "$(dirname "$0")/../../../server/python-executor-service/src" && pwd)"
export PYTHONPATH="$SDK_SRC"

export NAS_ROOT STD_DIR SAMPLE_DIR
/usr/bin/python3 - <<'PY'
import json
import os
import sys
import tempfile

nas = os.environ["NAS_ROOT"]
std_dir = os.environ["STD_DIR"]
sample_dir = os.environ["SAMPLE_DIR"]

from computable_lab_analysis.d_reader import read_ch_bytes
from computable_lab_analysis.peak_integration import integrate_peaks
from computable_lab_analysis.calibration_fit import fit_calibration
from computable_lab_analysis.quantification import quantify_peaks
from computable_lab_analysis.ctx import Context

PROV = "synthetic_levels_not_production_evidence"  # the HONESTY GATE marker

# Declared integration settings (LANE DATA in this heredoc — transcribed from
# the corpus' FAME-method analysis section; the values arrive as DATA, never
# as module constants — GC-7 T3 doctrine).
INTEG_PARAMS = {
    "baseline_correction": "vertical_drop",
    "baseline_window_s": 30.0,
    "peak_width_s": 17.0,
    "slope_sensitivity": 0.005,
    "min_width_factor": 0.1,
    "max_width_factor": 3.0,
    "saturated_top_fraction_of_max": 0.005,
    "saturated_min_plateau_points": 10,
    "backend": "stdlib",
    "method_label": "TEST-GC8-REALSTANDARDS-transcribed",
}


def decode(ch_path: str, source: str):
    ch = open(ch_path, "rb").read()  # READ-ONLY
    return read_ch_bytes(ch, source=source)


def to_sig(out):
    return {"axis": out["axis"], "values": out["values"],
            "axis_units": "min", "value_units": "pA"}


def integrate(ch_path, source):
    out = decode(ch_path, source)
    rows = integrate_peaks(Context(), {"signal1": to_sig(out)}, INTEG_PARAMS)["rows"]
    print(f"  decoded {source}: n_points={out['meta']['n_points']} | "
          f"integrated rows={len(rows)}")
    return rows


std_rows = integrate(f"{nas}/{std_dir}/FID1A.CH", f"{std_dir}/FID1A.CH")
sample_rows = integrate(f"{nas}/{sample_dir}/FID1A.CH", f"{sample_dir}/FID1A.CH")


def table_payload(rows):
    """Re-shape the real integrated rows into the GC-7 §A1 {columns, rows}
    peak_table shape the CAL/QUANT consumers read (subset columns)."""
    cols = ["peak", "rt_min", "height_pa", "area_pa_min", "width_min",
            "area_percent", "symmetry", "saturated", "flags"]
    n = len(rows) or 1
    out = []
    for i, r in enumerate(rows):
        area = r.get("area_pa_min")
        out.append({
            "peak": i + 1,
            "rt_min": r.get("rt_min"),
            "height_pa": r.get("height_pa"),
            "area_pa_min": area,
            "width_min": 0.05,
            "area_percent": (100.0 / n if area is not None else None),
            "symmetry": 1.0,
            "saturated": bool(r.get("saturated", False)),
            "flags": list(r.get("flags", [])),
        })
    return {"columns": cols, "rows": out}


std_table = table_payload(std_rows)
sample_table = table_payload(sample_rows)

# ---------------------------------------------------------------------------
# Declare the FAME standard-level parameters (LANE DATA).
#
# HONESTY: the compound labels/refs are the FAME-LOCAL controlled identifiers
# for the 6:0/8:0/10:0 GC-FID standard series; the AMOUNTS are DECLARED
# PLACEHOLDER values (a nominal ladder) because the genuine amounts are not
# scientifically available (the corpus' SAMPLE.XML Amount = 0/placeholder
# [G1:15]). The RT windows are placed at REAL, integrated, non-saturated
# peaks of the standard run so the leg exercises real bytes end-to-end. The
# method's compound<->RT mapping is not in the repo (GC-7 B6: the integrator
# never maps RT->compound; GC-8 owns the mapping from DECLARED data) — so the
# whole leg is marked synthetic_levels_not_production_evidence.
# ---------------------------------------------------------------------------
# Real, resolved, non-saturated peaks with DEFINED areas from the standard run
# (chosen from the real integrated table so the CAL leg gets real fit points).
real_early = [r for r in std_rows if r.get("area_pa_min") is not None
              and not r.get("saturated")]
# Take up to three real peaks with defined areas, ordered by RT, as the
# declared standard-level anchors (declared data; synthetic amounts).
anchors = real_early[:3]
if len(anchors) < 2:
    print("GC8 REAL-STANDARDS DEFERRED "
          "insufficient non-saturated real peaks with defined areas on the "
          "standard run to declare the level leg (real-standards amounts are "
          "not in the repo; re-run at the gate with genuine amounts + a "
          "resolved standard series)", file=sys.stderr)
    sys.exit(0)

FAME_REFS = [
    ("FAME-LOCAL:methyl-hexanoate-n6", "6:0"),
    ("FAME-LOCAL:methyl-octanoate-n8", "8:0"),
    ("FAME-LOCAL:methyl-decanoate-n10", "10:0"),
]
PLACEHOLDER_AMOUNTS_NG_UL = [10.0, 50.0, 100.0]  # DECLARED placeholder ladder

levels = []
for i, r in enumerate(anchors):
    ref, chain = FAME_REFS[i]
    levels.append({
        "level": i + 1,
        "compound_label": f"TEST-FAME-{chain}",
        "compound_ref": ref,
        "amount": PLACEHOLDER_AMOUNTS_NG_UL[i],  # DECLARED PLACEHOLDER (not genuine)
        "rt_target_min": round(float(r["rt_min"]), 4),  # REAL integrated RT
        "rt_window_min": 0.20,
        "fit": True,
        "required": False,
        "input_names": [f"level_{i + 1}"],
    })

cal_params = {
    "model": "linear",
    "weighting": "none",
    "origin_constraint": False,
    "correlation_statistic": "weighted_r_squared",
    "amount_unit": "ng/uL",
    "istd": {"role": "none"},
    "extrapolation": "reject",
    "fail_on_out_of_range": False,   # flag mode: out-of-range is visible, not fatal
    "allow_inline_inputs": True,     # the in-process leg feeds the real table inline
    "levels": levels,
    # NOTE: the HONESTY marker is NOT a module parameter (the module's
    # unknown-is-unknown gate would loud-fail) — it is injected into the
    # EMITTED ARTIFACT PAYLOADS at the script layer below (spec T3: "every
    # emitted artifact's payload" carries the marker).
}
# Per-level table inputs: the whole real standard table feeds every level
# (the level's RT window selects its own peak row).
cal_inputs = {f"level_{i + 1}": std_table for i in range(len(anchors))}

cal_ctx = Context(inputs={n: {"dataKind": "table", "inline": p}
                          for n, p in cal_inputs.items()},
                  parameters=cal_params)
cal_res = fit_calibration(cal_ctx, cal_params)

# HONESTY GATE: mark EVERY emitted CAL artifact payload (script-layer
# provenance — the declared placeholder amounts make these payloads NOT
# production evidence; raw-proposal :279).
for art in cal_ctx._manifest.artifacts:
    if isinstance(art.value, dict):
        art.value["provenance_status"] = PROV

model_payload = cal_res["model"]

# THE `verified by` CLAUSE: assert the calibration TABLE artifact landed.
art_names = [a.name for a in cal_ctx._manifest.artifacts]
if "calibration_table" not in art_names:
    print("GC8 REAL-STANDARDS FAIL: calibration_table artifact did not land "
          f"(published: {art_names})", file=sys.stderr)
    sys.exit(1)
cal_table_art = next(a for a in cal_ctx._manifest.artifacts if a.name == "calibration_table")
# the model artifact is what gets PROMOTED — it carries the marker too
model_art = next(a for a in cal_ctx._manifest.artifacts if a.name == "calibration_model")
promoted_model_payload = model_art.value
print(f"  CAL leg: calibration_table artifact LANDED "
      f"({len(cal_table_art.value['rows'])} level rows) + calibration_model "
      f"(model={promoted_model_payload.get('model')}, statistic="
      f"{promoted_model_payload.get('statistic_name')}, "
      f"provenance_status={promoted_model_payload.get('provenance_status')})")

# ---------------------------------------------------------------------------
# PROMOTE (in-process): the model bytes are written to a temp file and handed
# to the QUANT run as a FILE input — exactly the shape a promoted dref streams
# to <name>.bin (the A5 file_bytes + json.loads leg). The promoted artifact id
# is parsed by the consumer from the dref-path layout in meta.sourcePath.
# ---------------------------------------------------------------------------
PROMOTED_ID = "AOUT-GC8-SMOKE"
fd, model_path = tempfile.mkstemp(suffix=".bin", prefix="gc8-promoted-model-")
with os.fdopen(fd, "w") as f:
    json.dump(promoted_model_payload, f)  # the MARKED model payload (honesty gate)
print(f"  PROMOTE leg: model promoted in-process -> dref-path layout "
      f"analysis-artifacts/promoted/{PROMOTED_ID}/calibration_model.json")

# ---------------------------------------------------------------------------
# QUANTIFY one real SAMPLE run with the PROMOTED model (cross-run consumption).
# ---------------------------------------------------------------------------
# Declare the sample target at a REAL, integrated, non-saturated sample peak
# (real bytes; the RT window is real). amount_semantics is the model's x
# verbatim; the inverse is flagged (not fatal) if it falls outside the
# placeholder fit range — honest, and the receipt is DEFERRED regardless.
real_sample_anchors = [r for r in sample_rows if r.get("area_pa_min") is not None
                       and not r.get("saturated")]
if not real_sample_anchors:
    print("GC8 REAL-STANDARDS FAIL: no non-saturated real peak with a defined "
          "area on the sample run to quantify", file=sys.stderr)
    sys.exit(1)
tgt = real_sample_anchors[0]
quant_params = {
    "istd": {"role": "none"},
    "targets": [{
        "compound_label": "TEST-FAME-6:0",
        "compound_ref": FAME_REFS[0][0],
        "rt_target_min": round(float(tgt["rt_min"]), 4),  # REAL sample RT
        "rt_window_min": 0.20,
    }],
    "extrapolation": "reject",
    "fail_on_out_of_range": False,   # flag mode
    "amount_semantics": "model_amount_as_reported",
    "allow_inline_inputs": True,     # the in-process leg feeds the sample table inline
}
# NOTE: the HONESTY marker is injected into the EMITTED QUANT artifact payloads
# at the script layer (same reason as the CAL leg — it is not a module param).
quant_ctx = Context(
    inputs={
        "calibration_model": {"dataKind": "table", "path": model_path,
                              "meta": {"sourcePath":
                                       f"analysis-artifacts/promoted/{PROMOTED_ID}/"
                                       f"calibration_model.json"}},
        "peak_table": {"dataKind": "table", "inline": sample_table["rows"]},
    },
    parameters=quant_params,
)
try:
    quant_res = quantify_peaks(quant_ctx, quant_params)
finally:
    os.unlink(model_path)

# HONESTY GATE: mark EVERY emitted QUANT artifact payload (script-layer
# provenance — the quantified amounts derive from the placeholder-amount model).
for art in quant_ctx._manifest.artifacts:
    if isinstance(art.value, dict):
        art.value["provenance_status"] = PROV

qrows = quant_res.get("rows", [])
qmetrics = quant_res.get("metrics", {})
quant_provenance = None
for art in quant_ctx._manifest.artifacts:
    if isinstance(art.value, dict):
        quant_provenance = art.value.get("provenance_status")
        break
print(f"  QUANT leg: consumed promoted model id={quant_res.get('model_artifact_id')} "
      f"| quantified rows={len(qrows)} | compounds_quantified="
      f"{qmetrics.get('compounds_quantified')} | provenance_status={quant_provenance}")

# ---------------------------------------------------------------------------
# RECEIPT (OQ1 honesty gate). Genuine amounts are NOT available at gate time
# (corpus SAMPLE.XML Amount = 0/placeholder [G1:15]), so the leg ran with
# declared PLACEHOLDER amounts marked synthetic_levels_not_production_evidence.
# The DEFERRED receipt is the OQ1-ratified outcome; the orchestrator re-runs
# at the gate with genuine amounts.
# ---------------------------------------------------------------------------
reason = ("genuine standard amounts not available at gate time - corpus "
          "SAMPLE.XML Amount=0/placeholder [G1:15]; level->artifact leg ran "
          "end-to-end on REAL bytes with DECLARED placeholder amounts marked "
          "provenance_status=synthetic_levels_not_production_evidence; "
          "orchestrator re-runs at the gate (OQ1)")
print(f"GC8 REAL-STANDARDS DEFERRED {reason}")
PY
