#!/usr/bin/env python3
"""check-gate.py — the TICK-FACING contract of the trunk-journeys harness.

The lane tick runs this BEFORE claiming any new item:

    python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py
    exit 0 = trunk journeys GREEN (or no run yet — never gate a virgin lane)
    exit 1 = at least one journey RED: the ready set is EMPTY this tick and
             the printed BLOCKER line names the red journey(s)
    exit 2 = the receipt root itself is unreadable (env error, fail closed
             on claiming too: a broken receipts trail proves nothing green)

Reads receipts-root `latest` -> run-meta.json `verdicts` (the machine table).
"""
import json
import os
import sys

RECEIPTS_ROOT = os.environ.get(
    "CL_RECEIPTS", "/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS")


def main():
    link = os.path.join(RECEIPTS_ROOT, "latest")
    if not os.path.exists(link):
        print("GATE: no trunk-journeys run yet at %s — no verdict, not blocking"
              % RECEIPTS_ROOT)
        print("GATE-VERDICT green (never-ran)")
        return 0
    meta_path = os.path.join(os.path.realpath(link), "run-meta.json")
    try:
        with open(meta_path) as fh:
            meta = json.load(fh)
    except Exception as exc:
        print("GATE: latest run-meta unreadable (%s) — FAIL CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    verdicts = meta.get("verdicts") or {}
    reds = [j for j, v in sorted(verdicts.items()) if v != "green"]
    print("latest: %s verdict=%s" % (os.path.realpath(link), meta.get("verdict")))
    for j in sorted(verdicts):
        print("  %s: %s" % (j, verdicts[j]))
    if reds:
        for j in reds:
            print("BLOCKER: trunk journey %s is RED (verdict=%s) — "
                  "ready set EMPTY this tick; repair trunk before claiming"
                  % (j, verdicts[j]))
        print("GATE-VERDICT blocking")
        return 1
    print("GATE-VERDICT green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
