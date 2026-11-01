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

# N1 (ruling Q-D): the SAME literal trunk set the driver compares
# (run-journeys.py TRUNK_PORTS). NO env derivation — a scratch vite on any
# other port can never be a trunk run, and the gate re-derives it from the
# run's app_base independently of the run-meta flag.
TRUNK_PORTS = {("localhost", 5193), ("127.0.0.1", 5193)}


def _hostport(u):
    from urllib.parse import urlparse
    p = urlparse(u or "")
    return (p.hostname or "", p.port)


def app_base_is_trunk(u):
    return _hostport(u) in TRUNK_PORTS


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
    # D2: fail closed unless the verdict table is a COMPLETE trunk claim.
    # The declared set is read from the harness's own journeys/ directory.
    import os as _os
    js_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "journeys")
    declared = set()
    try:
        import yaml
        for f in sorted(_os.listdir(js_dir)):
            if f.endswith(".yaml"):
                with open(_os.path.join(js_dir, f)) as fh:
                    y = yaml.safe_load(fh)
                if y and y.get("id"):
                    declared.add(y["id"])
    except Exception as exc:
        print("GATE: journeys/ unreadable (%s) — FAIL CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    missing = sorted(declared - set(verdicts))
    if missing:
        print("BLOCKER: latest verdicts table is INCOMPLETE — journeys %s never "
              "ran (D2: an incomplete run may not clear the gate)" % missing)
        print("GATE-VERDICT blocking")
        return 1
    # N1: the app_base must be the LITERAL trunk FE (same set the driver uses).
    # check-gate re-derives this from the run's recorded app_base, so a run-meta
    # flag alone can never make a scratch frontend pass.
    if not app_base_is_trunk(meta.get("app_base")):
        print("BLOCKER: latest run targeted a NON-TRUNK app_base %r (D2/N1: "
              "scratch frontend runs may not clear the gate)"
              % meta.get("app_base"))
        print("GATE-VERDICT blocking")
        return 1
    # A3: an advisory live-sampler run (J2-live shape) records an honest
    # verdict but never gates — and it never flips `latest`, so if one is
    # found here the gate blocks rather than clears on advisory data.
    if meta.get("advisory"):
        print("BLOCKER: latest is an ADVISORY run (A3: advisory verdicts never "
              "clear the gate while the live-drift product defect is open)")
        print("GATE-VERDICT blocking")
        return 1
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
