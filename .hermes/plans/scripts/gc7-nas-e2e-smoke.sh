#!/usr/bin/env bash
# GC-7 T3 — REAL-NAS end-to-end smoke (LANE-ONLY, READ-ONLY; spec B2).
#
# NOT a vitest/unittest case: real NAS bytes are proofed HERE ONLY. The script
# reads NOTHING into the code repo, copies NOTHING, and writes NOTHING to the
# NAS — it runs THIS WORKTREE's shipped SDK (d_reader + peak_integration)
# in-process against the mounted RES35077-4.D tree, and asserts the GC-1
# decD-pinned table [G1:52-60]:
#
#   RES35077-4.D (9.6 min run, 50 Hz):
#     anchor 4.0217 min / 24,063.8 pA (isolated)
#     envelope max 4.6074 min / 400,112.83 pA
#     the 4.48-4.66 region is ONE unresolved envelope of local maxima (AS-5)
#
# Declared settings (LANE DATA in this heredoc — the "FAME method's
# transcribed settings" of the spec T3; values arrive as DATA, never code
# constants in the module):
#   baseline vertical_drop (30 s window) / peak_width 17 s /
#   slope_sensitivity 0.005 / width factors 0.1-3.0 /
#   saturation f=0.005 N>=10 / backend stdlib.
#
# Live-lane API note (honest boundary, OQ1): at receipt time the live :3092
# lane stack serves the TRUNK worktree (cl-integration-1), whose SDK does not
# yet carry the unmerged peak_integration module — so the end-to-end RUN
# (revision + run + execute via the API) is executed by the ORCHESTRATOR at
# the acceptance gate, post-merge, on the merged lane stack. THIS script is
# the read-only real-NAS leg the orch re-runs: it proves the module's
# end-to-end decode + integrate + assert pipeline against real bytes with the
# worktree's exact SDK. The live-API mint procedure (post-merge) is:
#   (1) POST /api/acquisition-packages (device 'vast', directoryKey
#       'RES35077-4.D') — TEST-prefixed title;
#   (2) GET the package record → packageAnalysisInputs (per-file DREFs);
#   (3) POST /api/analysis-revisions (entryScript = the reference entry,
#       engineRef per GC-5, sdkVersion 0.3.0) → POST /api/analysis-runs with
#       the declared parameters above → POST /api/analysis-runs/:id/execute;
#   (4) assert the stored peak_table matches the decD pins below.
#
# Exit 0 + "GC7 NAS E2E OK <n_peaks> <maxrt>" on full agreement; non-zero
# with a NAMED mismatch otherwise. PINS ARE PINS — if one disagrees, the
# module (or the pin transcription) is wrong: check against gc1-decD.py,
# then STOP (B3).
set -euo pipefail

NAS_ROOT="/mnt/vast/gc-fid/machine1"
if [ ! -d "$NAS_ROOT" ]; then
  echo "GC7 NAS E2E SKIP: $NAS_ROOT not mounted (lane-only leg — skip is OK, fail is not)" >&2
  exit 0
fi

# This worktree's SDK src (script lives at <worktree>/.hermes/plans/scripts/;
# the package lives at <worktree>/server/python-executor-service/src).
SDK_SRC="$(cd "$(dirname "$0")/../../../server/python-executor-service/src" && pwd)"

export PYTHONPATH="$SDK_SRC"
/usr/bin/python3 - "$NAS_ROOT" <<'PY'
import sys

nas = sys.argv[1]

from computable_lab_analysis.d_reader import (
    READER_NAME,
    READER_VERSION,
    read_ch_bytes,
)
from computable_lab_analysis.ctx import Context
from computable_lab_analysis.peak_integration import integrate_peaks

# [G1:52-60] decD-pinned anchors for RES35077-4.D (decoder D, the decode
# authority per the GC-1 errata pointer [G1:195]).
ANCHOR_RT = 4.0217
ANCHOR_H = 24063.8
MAX_RT = 4.6074
MAX_H = 400112.83
ENV_LO, ENV_HI = 4.46, 4.68  # the unresolved-envelope region (AS-5)
D_RT = 0.02                  # [G1:155] RT tolerance (min)
D_H = 0.05                   # [G1:156] height tolerance (fraction)

# Declared run settings (lane data — transcribed from the FAME method's
# analysis section; see the script header). The module applies ZERO defaults.
PARAMS = {
    "baseline_correction": "vertical_drop",
    "baseline_window_s": 30.0,
    "peak_width_s": 17.0,
    "slope_sensitivity": 0.005,
    "min_width_factor": 0.1,
    "max_width_factor": 3.0,
    "saturated_top_fraction_of_max": 0.005,
    "saturated_min_plateau_points": 10,
    "backend": "stdlib",
    "method_label": "TEST-RES4-FAME-transcribed",
}

ch = open(f"{nas}/RES35077-4.D/FID1A.CH", "rb").read()  # READ-ONLY
out = read_ch_bytes(ch, source="RES35077-4.D/FID1A.CH")
axis, values = out["axis"], out["values"]
n = out["meta"]["n_points"]
mx = max(values)
maxrt = axis[values.index(mx)]

failures = []

def check(label, got, want, tol):
    ok = abs(got - want) <= tol
    if not ok:
        failures.append(f"{label} = {got!r}, expected {want!r} (tol {tol})")
    print(f"  {label}: got {got:.4f}, want {want:.4f} (tol {tol}) — {'OK' if ok else 'MISMATCH'}")

check("n_points", n, 28812.0, 0.0)           # [G1:52]
check("max pA", round(mx, 4), 400112.8313, 0.0001)
check("max RT min", round(maxrt, 4), 4.6074, 0.0001)

sig = {"axis": axis, "values": values, "axis_units": "min", "value_units": "pA"}
res = integrate_peaks(Context(), {"signal1": sig}, PARAMS)
rows = res["rows"]
print(f"  peak_table rows: {len(rows)} | rejected: {res['rejected']} | "
      f"saturated: {res['saturated_peaks']}")

def near(rt, h):
    return any(abs(r["rt_min"] - rt) <= D_RT and r["height_pa"] is not None
               and abs(r["height_pa"] - h) <= D_H * h for r in rows)

if not near(ANCHOR_RT, ANCHOR_H):
    failures.append(f"anchor {ANCHOR_RT}/{ANCHOR_H} not tabled within [G1] tolerances")
    print(f"  anchor {ANCHOR_RT}/{ANCHOR_H}: MISMATCH")
else:
    print(f"  anchor {ANCHOR_RT}/{ANCHOR_H}: OK")

if not near(MAX_RT, MAX_H):
    failures.append(f"envelope max {MAX_RT}/{MAX_H} not tabled within [G1] tolerances")
    print(f"  envelope max {MAX_RT}/{MAX_H}: MISMATCH")
else:
    print(f"  envelope max {MAX_RT}/{MAX_H}: OK")

# The 4.48-4.66 envelope: rows present + flagged, NO crash (AS-5 honesty:
# an envelope is not N compounds; the shared-region flag is the declared
# honesty marker).
env_rows = [r for r in rows if ENV_LO <= r["rt_min"] <= ENV_HI]
if not env_rows:
    failures.append("no tabled row inside the 4.46-4.68 envelope region")
if not any(r["flags"] for r in env_rows):
    failures.append("envelope rows present but NONE flagged (OVERLAP/honesty marker missing)")
print(f"  envelope region {ENV_LO}-{ENV_HI}: {len(env_rows)} row(s), "
      f"{sum(1 for r in env_rows if r['flags'])} flagged")

print(f"reader: {READER_NAME} {READER_VERSION}")
print("honest note: GC-7 tables bound truth WITHIN DECODER tolerances [G1:100],")
print("not vendor parity — ChemStation's own rules will merge/split differently.")

if failures:
    for f in failures:
        print(f"MISMATCH: {f}", file=sys.stderr)
    sys.exit(1)

print(f"GC7 NAS E2E OK {len(rows)} {round(maxrt, 4)}")
PY
