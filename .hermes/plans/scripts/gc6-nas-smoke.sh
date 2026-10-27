#!/usr/bin/env bash
# GC-6 T4 — REAL-NAS manual smoke (LANE-ONLY, READ-ONLY; spec B5).
#
# NOT a vitest/unittest case: real NAS bytes are proofed HERE ONLY. The script
# copies NOTHING and writes NOTHING — it runs the shipped SDK in-process
# against the mounted .D tree and asserts the [F-fixture] pins (re-verified
# first-hand by the spec composer with the canonical decD):
#
#   RES35077-4.D     n=28812 esc=2013 esc_tag_nonzero=0 max=400112.8313 pA @ 4.6074 min
#   RES35077-5.D     n=52216 esc=2185 esc_tag_nonzero=0 max=155916.5549 pA @ 8.1247 min
#   20201023-KERRYGOLD.D n=48757 esc=858  esc_tag_nonzero=400 max=585602.8158 pA @ 4.5556 min
#
# The KERRY esc_tag_nonzero=400 is the escape-tag AUDIT case [G1:99]:
# reported by the reader, never absorbed, never rejected.
#
# Exit 0 + "GC6 NAS SMOKE OK <n> <esc>" on full agreement; non-zero with a
# NAMED mismatch otherwise. PINS ARE PINS — if one disagrees, the reader (or
# the pin transcription) is wrong: check against gc1-decD.py, then STOP.

set -euo pipefail

NAS_ROOT="/mnt/vast/gc-fid/machine1"
if [ ! -d "$NAS_ROOT" ]; then
  echo "GC6 NAS SMOKE SKIP: $NAS_ROOT not mounted (lane-only leg — skip is OK, fail is not)" >&2
  exit 0
fi

# The worktree's SDK src (this script lives at <worktree>/.hermes/plans/scripts/;
# the package lives at <service>/src — PYTHONPATH points at `src`).
SDK_SRC="$(cd "$(dirname "$0")/../../../server/python-executor-service/src" && pwd)"

export PYTHONPATH="$SDK_SRC"
/usr/bin/python3 - "$NAS_ROOT" <<'PY'
import sys

nas = sys.argv[1]

from computable_lab_analysis.d_reader import (
    READER_NAME,
    READER_VERSION,
    decode_run_log,
    decode_sample_xml,
    read_ch_bytes,
)

# [F-fixture] pins (composer-verified first-hand with gc1-decD; spec T4).
PINS = {
    "RES35077-4.D": dict(n=28812, esc=2013, esc_tag=0, max_pa=400112.8313, rt_min=4.6074),
    "RES35077-5.D": dict(n=52216, esc=2185, esc_tag=0, max_pa=155916.5549, rt_min=8.1247),
    "20201023-KERRYGOLD.D": dict(n=48757, esc=858, esc_tag=400, max_pa=585602.8158, rt_min=4.5556),
}

failures = []
last = None
for name, pin in PINS.items():
    ch = open(f"{nas}/{name}/FID1A.CH", "rb").read()
    out = read_ch_bytes(ch, source=f"{name}/FID1A.CH")
    n = out["meta"]["n_points"]
    esc = out["meta"]["escape_count"]
    esc_tag = out["meta"]["escape_tag_nonzero"]
    max_pa = max(out["values"])
    rt_min = out["axis"][out["values"].index(max_pa)]

    def check(label, got, want, tol=0.0):
        ok = abs(got - want) <= tol if isinstance(want, float) else got == want
        if not ok:
            failures.append(f"{name}: {label} = {got!r}, expected {want!r}")

    check("n", n, pin["n"])
    check("esc", esc, pin["esc"])
    check("esc_tag_nonzero", esc_tag, pin["esc_tag"])
    check("max pA", round(max_pa, 4), pin["max_pa"])  # 4-decimal pin
    check("RT min", round(rt_min, 4), pin["rt_min"])  # 4-decimal pin
    last = (n, esc)
    print(f"{name}: n={n} esc={esc} esc_tag={esc_tag} "
          f"max={max_pa:.4f} pA @ {rt_min:.4f} min — {'OK' if not failures else 'MISMATCH'}")

# RES35077-4 metadata legs (the [F-fixture] first-hand facts):
xml = decode_sample_xml(open(f"{nas}/RES35077-4.D/SAMPLE.XML", "rb").read(),
                        source="RES35077-4.D/SAMPLE.XML")
if xml["name"] != "RES35077-4":
    failures.append(f"SAMPLE.XML name = {xml['name']!r}, expected 'RES35077-4'")
if not xml["raw_text"]:
    failures.append("SAMPLE.XML raw_text empty — lossless clause violated")

log = decode_run_log(open(f"{nas}/RES35077-4.D/RUN.LOG", "rb").read(),
                     source="RES35077-4.D/RUN.LOG")
if log["recognized_count"] <= 0:
    failures.append(f"RUN.LOG recognized_count = {log['recognized_count']} (expected > 0)")
if log["unrecognized_count"] <= 0:
    failures.append("RUN.LOG unrecognized_count = 0 — hex event lines NOT preserved (lossless clause violated)")
if log["recognized_count"] + log["unrecognized_count"] != len(log["lines"]):
    failures.append("RUN.LOG line-count round-trip violated")
print(f"RUN.LOG: {len(log['lines'])} lines, {log['recognized_count']} recognized, "
      f"{log['unrecognized_count']} preserved verbatim")

print(f"reader: {READER_NAME} {READER_VERSION}")

if failures:
    for f in failures:
        print(f"MISMATCH: {f}", file=sys.stderr)
    sys.exit(1)

print(f"GC6 NAS SMOKE OK {last[0]} {last[1]}")
PY
