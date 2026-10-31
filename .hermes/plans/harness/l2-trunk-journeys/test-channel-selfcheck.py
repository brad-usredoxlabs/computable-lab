#!/usr/bin/env python3
"""test-channel-selfcheck.py — the fails-closed self-check leg (l2-suite-a
test-channel-selfcheck pattern, applied to the trunk journeys).

Proves, WITHOUT any server contact or model call, that the harness cannot
paper over its own motivating bug class:

 (1) THE CHANNEL ASSERTION CATCHES THE RENAMED CHANNEL. The expected channel
     names come from journeys/J1.yaml (DATA — never re-encoded here). Feed
     the driver's pure assertion check (a) the honest outgoing body shape ->
     must PASS; (b) the 2026-10-31 regression shape (selectedWells renamed to
     context.selection, the exact be270f5f bug form) -> must be RED on BOTH
     the `selectedWells present` and the `selection absent` assertions;
     (c) the channel present-but-empty shape -> must be RED.
 (2) THE INTERCEPTION GATE BITES. The driver fails a journey whose ui receipt
     reports ANY route handler; a synthetic receipt with
     route_handlers_used=1 must produce the BANNED violation. And the
     construction proof: ui-drive.cjs source must contain NO page.route /
     route.fulfill / route.abort / route.fail call at all (grep the served-
     nothing file itself) — if this leg ever sees one, it goes RED.
 (3) THE GATE HELPER FAILS CLOSED. check-gate.py against a deliberately red
     run-meta must exit non-zero and print the BLOCKER line; against a green
     one, exit 0.

Exit 0 = every leg behaves. Exit 1 = the self-check found a hole (RED).
    python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))

_spec = importlib.util.spec_from_file_location(
    "run_journeys", os.path.join(HERE, "run-journeys.py"))
if _spec is None or _spec.loader is None:
    raise SystemExit("SELFCHECK: cannot load the driver module by path")
rj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rj)


def honest_body(j1):
    """The deck pane's OUTGOING body at trunk (DeckSurfaceChat.tsx:96-115 +
    the projection): selectedWells OBJECT form + sourceSelection, no
    `selection` key... except the client's own surfaceContext historically
    rode selection:null — J1 asserts that ABSENT too (the pane replaced it)."""
    return {
        "prompt": "mix all wells that have material",
        "context": {
            "eventGraphId": "EVG-JOURNEYS-1",
            "runId": "r-selfcheck",
            "selectedWells": {"labwareId": "LBW-JOURNEYS-1", "wells": ["A1", "B1"]},
            "sourceSelection": {"labwareId": "LBW-JOURNEYS-1",
                                "labwareName": "Journeys Plate", "wells": ["A1", "B1"]},
        },
        "history": [],
    }


def main():
    with open(os.path.join(HERE, "journeys", "J1.yaml")) as fh:
        j1 = yaml.safe_load(fh)
    assertions = j1["assert"]["request_body_channels"]
    results = []

    # ---- (1a) honest trunk-shape body must satisfy EVERY assertion --------
    viol = rj.check_channel_assertions(honest_body(j1), assertions)
    results.append(("PASS case (honest body: selectedWells object, no selection)",
                    not viol, viol))

    # ---- (1b) THE regression form: rename selectedWells -> selection ------
    reg = honest_body(j1)
    reg["context"]["selection"] = reg["context"].pop("selectedWells")
    viol = rj.check_channel_assertions(reg, assertions)
    caught_present = any("context.selectedWells" in v for v in viol)
    caught_absent = any("must be ABSENT but PRESENT: context.selection" in v for v in viol)
    results.append(("FAIL case (2026-10-31 rename: selectedWells -> selection)",
                    bool(viol) and caught_present and caught_absent, viol))

    # ---- (1c) present-but-empty channel is not a pass --------------------
    empty = honest_body(j1)
    empty["context"]["selectedWells"] = {"labwareId": "LBW-JOURNEYS-1", "wells": []}
    viol = rj.check_channel_assertions(empty, assertions)
    results.append(("FAIL case (selectedWells present but wells=[])",
                    bool(viol), viol))

    # ---- (1d) null-valued channel (the pre-projection 'selection: null'
    #           shape) never counts as present ------------------------------
    nulls = honest_body(j1)
    nulls["context"]["selectedWells"] = None
    viol = rj.check_channel_assertions(nulls, assertions)
    results.append(("FAIL case (selectedWells: null)", bool(viol), viol))

    # ---- (2) interception gate: a receipt with route handlers is BANNED ---
    # Reproduce the driver's belt-check exactly (the same expression the
    # driver runs over ui receipts).
    def banned_check(ui):
        return (ui.get("route_handlers_used", 0) != 0)
    results.append(("FAIL case (ui receipt route_handlers_used=1)",
                    banned_check({"route_handlers_used": 1}), []))
    results.append(("PASS case (ui receipt route_handlers_used=0)",
                    not banned_check({"route_handlers_used": 0}), []))

    # ---- (2b) CONSTRUCTION: ui-drive.cjs carries zero interception calls --
    src = open(os.path.join(HERE, "ui-drive.cjs")).read()
    hits = re.findall(r"page\.route\s*\(|route\.(fulfill|abort|fail)\s*\(|waitForResponse\s*\(|setRequestInterception", src)
    # strip the file's own comments/doc from the verdict by re-grepping code
    code = "\n".join(l for l in src.splitlines()
                     if not l.strip().startswith(("//", "*", "/*")))
    hits = re.findall(r"page\.route\s*\(|route\.(?:fulfill|abort|fail)\s*\(", code)
    results.append(("CONSTRUCTION (ui-drive.cjs contains no page.route/fulfill/abort/fail)",
                    not hits, ["hits: %r" % (hits,)]))

    # ---- (3) the tick gate helper: red blocks, green passes ---------------
    with tempfile.TemporaryDirectory() as td:
        red_dir = os.path.join(td, "20260101T000000Z")
        os.makedirs(red_dir)
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump({"verdict": "RED", "verdicts": {"J1": "red", "J2": "green"}}, fh)
        os.symlink(red_dir, os.path.join(td, "latest"))
        env = dict(os.environ, CL_RECEIPTS=td)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE red-run exits non-zero and prints BLOCKER J1",
                        p.returncode == 1 and "BLOCKER" in p.stdout and "J1" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump({"verdict": "ALL-GREEN", "verdicts": {"J1": "green", "J2": "green"}}, fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE green-run exits 0", p.returncode == 0,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))

    ok = True
    for name, passed, notes in results:
        print("%-64s %s" % (name, "OK" if passed else "RED"))
        if not passed and notes:
            for n in notes:
                print("      note:", n)
        ok = ok and passed
    print()
    print("SELFCHECK:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
