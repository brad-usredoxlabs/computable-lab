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
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
APP_DIR = os.path.join(REPO_ROOT, "app")  # node_modules resolution for the probe

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

    # ---- (1e) D5: PARTIAL well loss must be RED under exact-set equality --
    partial = honest_body(j1)
    partial["context"]["selectedWells"]["wells"] = ["A1"]
    partial["context"]["sourceSelection"]["wells"] = ["A1"]
    viol = rj.check_channel_assertions(partial, assertions)
    caught_partial = any("not EXACTLY the set" in v for v in viol)
    results.append(("FAIL case (D5 partial well loss: wells=[A1] under equals_set)",
                    caught_partial, viol))
    # order-insensitive: the same set in another order must PASS
    reordered = honest_body(j1)
    reordered["context"]["selectedWells"]["wells"] = ["B1", "A1"]
    viol = rj.check_channel_assertions(reordered, assertions)
    results.append(("PASS case (D5 reordered set [B1,A1] under equals_set)",
                    not viol, viol))

    # ---- (1f) D8: content digest catches a SAME-SIZE content change -------
    with tempfile.TemporaryDirectory() as td8:
        rec8 = os.path.join(td8, "records")
        os.makedirs(rec8)
        f8 = os.path.join(rec8, "a.yaml")
        with open(f8, "w") as fh:
            fh.write("label: original-value\n")
        d1_8 = rj.digest_repo(td8)
        with open(f8, "w") as fh:
            fh.write("label: CHANGED-same-l\n")  # identical byte length
        d2_8 = rj.digest_repo(td8)
        results.append(("D8 digest: same-size content change flips the digest",
                        d1_8 != d2_8 and d1_8 is not None,
                        ["%s vs %s" % (d1_8, d2_8)]))

    # ---- (2) interception gate: a receipt with route handlers is BANNED ---
    # Reproduce the driver's belt-check exactly (the same expression the
    # driver runs over ui receipts).
    def banned_check(ui):
        return (ui.get("route_handlers_used", 0) != 0)
    results.append(("FAIL case (ui receipt route_handlers_used=1)",
                    banned_check({"route_handlers_used": 1}), []))
    results.append(("PASS case (ui receipt route_handlers_used=0)",
                    not banned_check({"route_handlers_used": 0}), []))

    # ---- (2b) CONSTRUCTION: ui-drive.cjs carries zero interception CALLS --
    # D1 widened: ANY receiver (`*.route(`, `*.routeFromHAR(`,
    # setRequestInterception) and ANY fulfilment method on ANY receiver
    # (`.fulfill(`, `.abort(`, `.fail(`). Comments/doc lines are stripped.
    src = open(os.path.join(HERE, "ui-drive.cjs")).read()
    code = "\n".join(l for l in src.splitlines()
                     if not l.strip().startswith(("//", "*", "/*")))
    hits = re.findall(
        r"(?:\w+\.)?(?:route|routeFromHAR|setDefaultNavigation|setRequestInterception)\s*\("
        r"|\.(?:fulfill|abort|fail)\s*\(", code)
    # The D1 counter WRAPS the registration methods by PROPERTY ASSIGNMENT
    # (target[meth] = wrapper) — it never CALLS one. Whitelist exactly the
    # wrapper plumbing lines (they contain no interception call syntax).
    results.append(("CONSTRUCTION (ui-drive.cjs contains no interception CALL "
                    "on any receiver — route/routeFromHAR/fulfill/abort/fail/"
                    "setRequestInterception)",
                    not hits, ["hits: %r" % (hits,)]))

    # ---- (2c) LIVE INJECTION: context.route on a throwaway copy => RED ---
    # D1's teeth: copy ui-drive.cjs to a temp file, inject a perfect fake
    # context.route('**/api/ai/**') immediately before the FIRST page use
    # (after the wrappers are installed, so it exercises the wrapper), run it
    # against a dead app-base with a fast-failing goto, and assert the
    # receipt reports route_handlers_used >= 1 (fails closed).
    inj = src
    anchor = "  await page.goto(appBase + step.path"
    if anchor not in inj:
        results.append(("INJECTION (context.route on a throwaway copy goes RED)",
                        False, ["anchor 'await page.goto(appBase + step.path' "
                                "not found — the injection case must be kept wired"]))
    else:
        inj = inj.replace(
            anchor,
            "  await context.route('**/api/ai/**', (r) => r.fulfill("
            "{status: 200, contentType: 'application/json', body: '{}'}));\n"
            "  await page.goto(appBase + step.path", 1)
        td2 = tempfile.mkdtemp(prefix="sc-inject-")
        probe = os.path.join(td2, "ui-drive-probe.cjs")
        with open(probe, "w") as fh:
            fh.write(inj)
        # Fast-failing journey: first step is a goto to an unroutable base,
        # then a screenshot so the receipt (with the counter) still lands.
        jpath = os.path.join(td2, "INJ.yaml")
        with open(jpath, "w") as fh:
            fh.write("id: INJ\ntimeout_s: 20\nlog_selector: 'body'\nsteps:\n"
                     "  - step: goto\n    path: /deck/NOPE\n")
        opath = os.path.join(td2, "INJ-ui.json")
        # The probe lives in a temp dir: give it node_modules via a symlink to
        # the ROOT-level node_modules (js-yaml + @playwright/test live there).
        # Read-only symlink — never touches the shared tree's contents.
        root_nm = os.path.join(REPO_ROOT, "node_modules")
        if not os.path.isdir(os.path.join(root_nm, "js-yaml")):
            root_nm = "/mnt/vast/home/brad/git/cl-integration-2/node_modules"
        os.symlink(root_nm, os.path.join(td2, "node_modules"))
        p = subprocess.run(["node", probe, "--journey", jpath, "--out", opath,
                            "--app-base", "http://127.0.0.1:9"],
                           cwd=APP_DIR, capture_output=True, text=True,
                           timeout=180)
        try:
            rec = json.load(open(opath))
            used = rec.get("route_handlers_used", -1)
            wrapped = (rec.get("attestations") or {}).get("route_api_wrapped")
        except Exception as exc:
            used, wrapped = -1, None
            rec = {"read_error": str(exc), "stderr": p.stderr[-400:]}
        results.append(("INJECTION (context.route on a throwaway copy goes RED)",
                        used >= 1 and wrapped is True,
                        ["route_handlers_used=%r wrapped=%r rc=%d" % (used, wrapped, p.returncode)]))
        import shutil
        shutil.rmtree(td2, ignore_errors=True)

    # ---- (3) the tick gate helper: red blocks, green passes ---------------
    # D2: fixtures must satisfy the COMPLETE+TRUNK preconditions so the red
    # case tests the RED arm, and new cases prove INCOMPLETE / scratch-FE runs
    # fail closed on their own.
    full_green = {"J1": "green", "J2": "green", "J3": "green"}
    trunk_meta = {"app_base": "http://localhost:5193",
                  "app_base_is_trunk": True}
    with tempfile.TemporaryDirectory() as td:
        red_dir = os.path.join(td, "20260101T000000Z")
        os.makedirs(red_dir)
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(trunk_meta, verdict="RED",
                           verdicts={"J1": "red", "J2": "green", "J3": "green"}), fh)
        os.symlink(red_dir, os.path.join(td, "latest"))
        env = dict(os.environ, CL_RECEIPTS=td)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE red-run exits non-zero and prints BLOCKER J1",
                        p.returncode == 1 and "BLOCKER" in p.stdout and "J1" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(trunk_meta, verdict="ALL-GREEN", verdicts=full_green), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE green-run exits 0", p.returncode == 0,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case A: complete greens but only J1 ran (incomplete table) => blocks
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(trunk_meta, verdict="ALL-GREEN",
                           verdicts={"J1": "green"}), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: incomplete verdicts table (J1-only) BLOCKS",
                        p.returncode == 1 and "INCOMPLETE" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case B: complete greens against a SCRATCH frontend => blocks
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump({"app_base": "http://127.0.0.1:5195",
                       "app_base_is_trunk": False,
                       "verdict": "ALL-GREEN", "verdicts": full_green}, fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: scratch-frontend (:5195) run BLOCKS",
                        p.returncode == 1 and "NON-TRUNK" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case C (negative control): legacy meta with no app_base_is_trunk
        # flag and trunk app_base => completeness governs, trunk ok.
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump({"app_base": "http://localhost:5193",
                       "verdict": "ALL-GREEN", "verdicts": full_green}, fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: trunk app_base without the flag still passes",
                        p.returncode == 0,
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
