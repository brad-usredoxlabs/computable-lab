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
# The D1 consumer arm below retargets the driver module's RECEIPTS_ROOT at a
# temp receipts root; remember the imported default to restore it after.
RECEIPTS_ROOT_DEFAULT = rj.RECEIPTS_ROOT


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
    # Drives THE SAME function the driver runs (run-journeys.py
    # attestation_violations) — no local copy that could diverge.
    results.append(("FAIL case (ui receipt route_handlers_used=1)",
                    any("BANNED" in v for v in
                        rj.attestation_violations({"route_handlers_used": 1})), []))
    results.append(("PASS case (ui receipt route_handlers_used=0, wrapped=true)",
                    not rj.attestation_violations(
                        {"route_handlers_used": 0,
                         "attestations": {"route_api_wrapped": True}}), []))
    # ---- (2a2) N4: the ATTESTATION arm — missing/false = journey RED -----
    # The prototype-identity tripwire: route_api_wrapped false (wrapper
    # identities detoured) or missing (pre-N4 receipt shape) must name the
    # violation even when the counter reads a clean 0.
    v_false = rj.attestation_violations(
        {"route_handlers_used": 0, "attestations": {"route_api_wrapped": False}})
    results.append(("N4 FAIL case (route_api_wrapped=false, counter clean -> RED)",
                    any("route_api_wrapped" in v for v in v_false), v_false))
    v_missing = rj.attestation_violations({"route_handlers_used": 0})
    results.append(("N4 FAIL case (attestations missing entirely -> RED)",
                    any("route_api_wrapped" in v for v in v_missing), v_missing))
    v_nottrue = rj.attestation_violations(
        {"route_handlers_used": 0, "attestations": {"route_api_wrapped": "yes"}})
    results.append(("N4 FAIL case (route_api_wrapped truthy-but-not-true -> RED)",
                    any("route_api_wrapped" in v for v in v_nottrue), v_nottrue))

    # ---- (2b) CONSTRUCTION: ui-drive.cjs carries zero interception CALLS --
    # D1 widened: ANY receiver (`*.route(`, `*.routeFromHAR(`,
    # setRequestInterception) and ANY fulfilment method on ANY receiver
    # (`.fulfill(`, `.abort(`, `.fail(`). Comments/doc lines are stripped.
    # N5: the setDefaultNavigation arm was DEAD — `setDefaultNavigation\s*\(`
    # can never match the real Playwright API name
    # `setDefaultNavigationTimeout(` (the literal `Timeout` sits before the
    # paren). Fixed to the REAL name so a text scan can see that call. NOTE
    # (honest residual): ui-drive wraps only route/routeFromHAR/
    # setRequestInterception today — nothing counter-wraps
    # setDefaultNavigationTimeout — so this arm closes the TEXT-SCAN hole
    # only; a real setDefaultNavigationTimeout call would be caught here at
    # construction time, not by the runtime counter.
    src = open(os.path.join(HERE, "ui-drive.cjs")).read()
    code = "\n".join(l for l in src.splitlines()
                     if not l.strip().startswith(("//", "*", "/*")))
    hits = re.findall(
        r"(?:\w+\.)?(?:route|routeFromHAR|setDefaultNavigationTimeout|setRequestInterception)\s*\("
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
                        used >= 1 and wrapped is True
                        and any("route_api_wrapped" in v
                                for v in rj.attestation_violations(rec)) is False,
                        ["route_handlers_used=%r wrapped=%r rc=%d" % (used, wrapped, p.returncode)]))
        import shutil
        shutil.rmtree(td2, ignore_errors=True)

    # ---- (2d) N4 LIVE INJECTION: PROTOTYPE EXTRACTION => attestation RED --
    # advc-c2's bypass shape on a throwaway copy: DELETE the own-property
    # wrapper, then call the ORIGINAL resolved off the prototype chain
    # (Object.getPrototypeOf(context).route.call(context, ...)). The counter
    # misses it by construction (the original never runs our wrapper code) —
    # the identity snapshot is the remaining tripwire, so post-fix the
    # receipt MUST carry route_api_wrapped=false and the driver's
    # attestation_violations() MUST name it. Pre-fix this injection produced
    # route_handlers_used=0 AND route_api_wrapped=true (silent green — the
    # N4 defect).
    inj_p = src
    anchor_p = "  await page.goto(appBase + step.path"
    if anchor_p not in inj_p:
        results.append(("N4 INJECTION (prototype-extraction flips the attestation)",
                        False, ["anchor 'await page.goto(appBase + step.path' "
                                "not found — the prototype-extraction case "
                                "must be kept wired"]))
    else:
        inj_p = inj_p.replace(
            anchor_p,
            "  delete context.route;\n"
            "  const _proto = Object.getPrototypeOf(context);\n"
            "  await _proto.route.call(context, '**/api/ai/**', (r) => r.fulfill("
            "{status: 200, contentType: 'application/json', body: '{}'}));\n"
            "  await page.goto(appBase + step.path", 1)
        td2p = tempfile.mkdtemp(prefix="sc-inject-proto-")
        probe_p = os.path.join(td2p, "ui-drive-proto.cjs")
        with open(probe_p, "w") as fh:
            fh.write(inj_p)
        jpath_p = os.path.join(td2p, "INJP.yaml")
        with open(jpath_p, "w") as fh:
            fh.write("id: INJP\ntimeout_s: 20\nlog_selector: 'body'\nsteps:\n"
                     "  - step: goto\n    path: /deck/NOPE\n")
        opath_p = os.path.join(td2p, "INJP-ui.json")
        root_nm_p = os.path.join(REPO_ROOT, "node_modules")
        if not os.path.isdir(os.path.join(root_nm_p, "js-yaml")):
            root_nm_p = "/mnt/vast/home/brad/git/cl-integration-2/node_modules"
        os.symlink(root_nm_p, os.path.join(td2p, "node_modules"))
        p = subprocess.run(["node", probe_p, "--journey", jpath_p,
                            "--out", opath_p,
                            "--app-base", "http://127.0.0.1:9"],
                           cwd=APP_DIR, capture_output=True, text=True,
                           timeout=180)
        try:
            rec_p = json.load(open(opath_p))
            used_p = rec_p.get("route_handlers_used", -1)
            wrapped_p = (rec_p.get("attestations") or {}).get("route_api_wrapped")
            att_viol_p = rj.attestation_violations(rec_p)
        except Exception as exc:
            rec_p, used_p, wrapped_p, att_viol_p = {}, -1, None, []
            rec_p = {"read_error": str(exc), "stderr": p.stderr[-400:]}
        results.append(("N4 INJECTION (prototype-extraction flips the attestation "
                        "+ driver names the violation)",
                        wrapped_p is False
                        and any("route_api_wrapped" in v for v in att_viol_p),
                        ["route_handlers_used=%r wrapped=%r rc=%d viol=%r"
                         % (used_p, wrapped_p, p.returncode, att_viol_p[:1])]))
        import shutil
        shutil.rmtree(td2p, ignore_errors=True)

    # ---- (2e) N4 LIMITATION PIN: NO-DELETE PROTOTYPE CALL STAYS GREEN -----
    # advc cycle-1 DEFECT 1: the ITEM-CITED bypass shape is
    # `Object.getPrototypeOf(context).route.call(...)` with NO deletion of
    # the own-property wrapper. The identity snapshot CANNOT see it (own
    # property intact => recv[meth] === _wrappers[key] stays true) and the
    # counter misses it (the original runs). This arm PINS THAT LIMITATION
    # HONESTLY: it asserts the known residual (route_api_wrapped stays True,
    # counter 0 = silent green for THIS tripwire), labelled as a limitation
    # pin, NOT a pass claim — the defense for that class is the construction
    # ban + the real-transport ai_request_bodies receipt. If anyone ever
    # "fixes" the snapshot to bite this shape, this arm fails LOUDLY and the
    # comment/report must be updated then. PINGS THE GAP SO THE OVERCLAIM
    # CANNOT SILENTLY RETURN (spec N4 arm 3).
    inj_l = src
    anchor_l = "  await page.goto(appBase + step.path"
    if anchor_l not in inj_l:
        results.append(("N4 LIMITATION PIN (no-delete prototype call stays TRUE "
                        "= known residual, not a detection claim)",
                        False, ["anchor 'await page.goto(appBase + step.path' "
                                "not found — the limitation-pin case must be "
                                "kept wired"]))
    else:
        inj_l = inj_l.replace(
            anchor_l,
            "  const _protoL = Object.getPrototypeOf(context);\n"
            "  await _protoL.route.call(context, '**/api/ai/**', (r) => r.fulfill("
            "{status: 200, contentType: 'application/json', body: '{}'}));\n"
            "  await page.goto(appBase + step.path", 1)
        td2l = tempfile.mkdtemp(prefix="sc-inject-nodel-")
        probe_l = os.path.join(td2l, "ui-drive-nodel.cjs")
        with open(probe_l, "w") as fh:
            fh.write(inj_l)
        jpath_l = os.path.join(td2l, "INJL.yaml")
        with open(jpath_l, "w") as fh:
            fh.write("id: INJL\ntimeout_s: 20\nlog_selector: 'body'\nsteps:\n"
                     "  - step: goto\n    path: /deck/NOPE\n")
        opath_l = os.path.join(td2l, "INJL-ui.json")
        root_nm_l = os.path.join(REPO_ROOT, "node_modules")
        if not os.path.isdir(os.path.join(root_nm_l, "js-yaml")):
            root_nm_l = "/mnt/vast/home/brad/git/cl-integration-2/node_modules"
        os.symlink(root_nm_l, os.path.join(td2l, "node_modules"))
        p = subprocess.run(["node", probe_l, "--journey", jpath_l,
                            "--out", opath_l,
                            "--app-base", "http://127.0.0.1:9"],
                           cwd=APP_DIR, capture_output=True, text=True,
                           timeout=180)
        try:
            rec_l = json.load(open(opath_l))
            used_l = rec_l.get("route_handlers_used", -1)
            wrapped_l = (rec_l.get("attestations") or {}).get("route_api_wrapped")
        except Exception as exc:
            used_l, wrapped_l = -1, None
        results.append(("N4 LIMITATION PIN (no-delete prototype call stays TRUE "
                        "= known residual, not a detection claim)",
                        used_l == 0 and wrapped_l is True,
                        ["route_handlers_used=%r wrapped=%r rc=%d"
                         % (used_l, wrapped_l, p.returncode)]))
        import shutil
        shutil.rmtree(td2l, ignore_errors=True)

    # ---- (3) the tick gate helper: red blocks, green passes ---------------
    # D2 (fix4): a clearing verdict requires fake_mode (hard set
    # J1+J2(fake)+J3); D1 (fix4): the gate RE-DERIVES the A2 grade from
    # fake_restore.restore_ok — fixtures must carry the first-class
    # fake_mode field + an honest fake_restore record so the red case tests
    # the RED arm, and the new cases prove the D1/D2 arms bite.
    full_green = {"J1": "green", "J2": "green", "J3": "green"}
    trunk_meta = {"app_base": "http://localhost:5193",
                  "app_base_is_trunk": True}
    live_u = "http://127.0.0.1:18099/api/v1"
    fake_u = "http://127.0.0.1:39329/api/v1"
    ok_restore = {"restore_ok": True, "live_url": live_u,
                  "pointed_url": fake_u, "restored_url": live_u}
    fail_restore = {"restore_ok": False, "live_url": live_u,
                    "pointed_url": fake_u, "restored_url": fake_u}
    fake_meta = dict(trunk_meta, fake_mode=True, fake_restore=dict(ok_restore))
    with tempfile.TemporaryDirectory() as td:
        red_dir = os.path.join(td, "20260101T000000Z")
        os.makedirs(red_dir)
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="RED",
                           verdicts={"J1": "red", "J2": "green",
                                     "J3": "green"}), fh)
        os.symlink(red_dir, os.path.join(td, "latest"))
        env = dict(os.environ, CL_RECEIPTS=td)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE red-run exits non-zero and prints BLOCKER J1",
                        p.returncode == 1 and "BLOCKER" in p.stdout and "J1" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE fake ALL-GREEN (restore ok) exits 0",
                        p.returncode == 0,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case A: complete greens but only J1 ran (incomplete table) => blocks
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts={"J1": "green"}), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: incomplete verdicts table (J1-only) BLOCKS",
                        p.returncode == 1 and "INCOMPLETE" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # N5 case A: a SUPERSET verdicts table — the exact greens PLUS a
        # bogus extra journey (a tampered run-meta's shape) — must BLOCK
        # and name the undeclared key (pre-N5 the missing-only check waved
        # it through: RED capture in the report).
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=dict(full_green, **{"JBOGUS": "green"})), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE N5: SUPERSET verdicts table (extra JBOGUS) BLOCKS, names the diff",
                        p.returncode == 1 and "SUPERSET" in p.stdout
                        and "JBOGUS" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # N5 case B: BOTH directions wrong (J3 missing AND JBOGUS extra) —
        # the diff must name both sides.
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts={"J1": "green", "J2": "green",
                                     "JBOGUS": "green"}), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE N5: mixed diff (J3 missing + JBOGUS extra) BLOCKS, names BOTH",
                        p.returncode == 1 and "EXACTLY" in p.stdout
                        and "JBOGUS" in p.stdout and "J3" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # N5 regression: the EXACT declared set still greens (the check above
        # re-greens full_green only if this holds; keep an explicit pin).
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE N5: EXACT declared set (J1/J2/J3) still greens",
                        p.returncode == 0,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case B: complete greens against a SCRATCH frontend => blocks
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump({"app_base": "http://127.0.0.1:5195",
                       "app_base_is_trunk": False, "fake_mode": True,
                       "fake_restore": dict(ok_restore),
                       "verdict": "ALL-GREEN", "verdicts": full_green}, fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: scratch-frontend (:5195) run BLOCKS",
                        p.returncode == 1 and "NON-TRUNK" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case C (fix4): a complete ALL-GREEN run WITHOUT --fake
        # (live-sampler lottery; the historical 20261101T034018Z shape) must
        # NOT clear the gate — the hard set is J1+J2(fake)+J3.
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(trunk_meta, verdict="ALL-GREEN",
                           verdicts=full_green,
                           fake_mode=False), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: non-fake complete ALL-GREEN BLOCKS (lottery)",
                        p.returncode == 1 and "--fake" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D2 case D (fix4): LEGACY meta with the fake_mode key MISSING
        # entirely (pre-fix4 receipts) must also block — fail closed.
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(trunk_meta, verdict="ALL-GREEN",
                           verdicts=full_green), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D2: legacy meta (fake_mode key missing) BLOCKS",
                        p.returncode == 1 and "--fake" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D1 case A (fix4): a fake run whose A2 restore FAILED must block the
        # gate even though its verdict table is complete + green.
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green,
                           fake_restore=dict(fail_restore),
                           red_blocks_claims=True), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D1: fake run with FAILED restore BLOCKS (gate re-derives restore_ok)",
                        p.returncode == 1 and "BLOCKER" in p.stdout
                        and "FAILED" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D1 case B (fix4): a TAMPERED meta — verdict ALL-GREEN +
        # red_blocks_claims false but the graded restore record says the
        # pointer leaked — must STILL block (the gate trusts the restore
        # record, never the verdict string).
        with open(os.path.join(red_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green,
                           fake_restore=dict(fail_restore),
                           red_blocks_claims=False), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D1: tampered verdict over a FAILED restore STILL BLOCKS",
                        p.returncode == 1 and "BLOCKER" in p.stdout
                        and "FAILED" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D1 case C (fix4): the GRADED FLIP means a failed restore never
        # owns `latest` — so the gate must catch the poisoned state from
        # the TRAIL itself: `latest` points at the older GREEN run, the
        # NEWER run's restore record failed.
        ok_dir = os.path.join(td, "20260101T000001Z")
        os.makedirs(ok_dir)
        with open(os.path.join(ok_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green,
                           fake_restore=dict(ok_restore)), fh)
        os.remove(os.path.join(td, "latest"))
        os.symlink(ok_dir, os.path.join(td, "latest"))
        fail2_dir = os.path.join(td, "20260101T000002Z")  # NEWER, restore failed
        os.makedirs(fail2_dir)
        with open(os.path.join(fail2_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green,
                           fake_restore=dict(fail_restore)), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D1: a FAILED restore in the trail BLOCKS even when `latest` targets the older green run",
                        p.returncode == 1 and "BLOCKER" in p.stdout
                        and "restore" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D1 case D (fix4): the trail MOVES ON — a newer run with a
        # SUCCESSFUL restore supersedes the older failed record; the gate
        # clears again (no permanent trip-wire).
        with open(os.path.join(fail2_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN",
                           verdicts=full_green,
                           fake_restore=dict(ok_restore)), fh)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE D1: a newer ok-restore run supersedes the older failed record (gate clears again)",
                        p.returncode == 0,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # A3: an advisory latest (should be unreachable via the driver — it
        # never flips latest — but the gate blocks if one lands there).
        # Point `latest` at the advisory run explicitly (D1-C above moved
        # the link to ok_dir).
        adv_dir = os.path.join(td, "20260101T000003Z")
        os.makedirs(adv_dir)
        with open(os.path.join(adv_dir, "run-meta.json"), "w") as fh:
            json.dump(dict(fake_meta, verdict="ALL-GREEN-ADVISORY",
                           verdicts=full_green, advisory=True), fh)
        os.remove(os.path.join(td, "latest"))
        os.symlink(adv_dir, os.path.join(td, "latest"))
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("GATE A3: an advisory latest BLOCKS",
                        p.returncode == 1 and "ADVISORY" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
        # D1 case E (fix4): the FRESH-ROOT shape — a failed-restore run
        # with NO `latest` at all (the first fake run on a new receipts
        # root, restore forced failing) must FAIL CLOSED: a missing
        # `latest` is "no verdict", not "green" — and the newest restore
        # record in the trail graded FAILED. (Pre-scan, this shape
        # printed "GATE-VERDICT green (never-ran)" over a poisoned
        # backend: the fail-open D1 exists to kill.)
        fresh_td = tempfile.mkdtemp(prefix="sc-freshroot-")
        try:
            fr_dir = os.path.join(fresh_td, "20260101T000003Z")
            os.makedirs(fr_dir)
            with open(os.path.join(fr_dir, "run-meta.json"), "w") as fh:
                json.dump(dict(fake_meta, verdict="ALL-GREEN",
                               verdicts=full_green,
                               fake_restore=dict(fail_restore)), fh)
            env_fresh = dict(os.environ, CL_RECEIPTS=fresh_td)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                               capture_output=True, text=True, env=env_fresh)
            results.append(("GATE D1: a fresh root with ONLY a failed-restore run FAILS CLOSED (no `latest` is not green)",
                            p.returncode == 1 and "BLOCKER" in p.stdout
                            and "restore" in p.stdout.lower(),
                            ["rc=%d out=%s" % (p.returncode,
                                               p.stdout.strip()[:160])]))
        finally:
            import shutil
            shutil.rmtree(fresh_td, ignore_errors=True)

    # ---- (4) A2: the model-layer fake restore is GRADED, not promised ----
    # A leaked fake pointer (restored != live) must grade FAILED; an exact
    # restore of the live sampler URL must grade OK. Pure helper — no server.
    live = "http://127.0.0.1:18099/api/v1"
    fakeu = "http://127.0.0.1:43210/api/v1"
    results.append(("A2 restore: exact live URL grades OK",
                    rj.restore_ok(live, live),
                    ["restore_ok(%r, %r)=%r" % (live, live, rj.restore_ok(live, live))]))
    results.append(("A2 restore: a LEAKED fake pointer grades FAILED",
                    not rj.restore_ok(live, fakeu),
                    ["restore_ok(%r, %r)=%r" % (live, fakeu, rj.restore_ok(live, fakeu))]))
    results.append(("A2 restore: a null live URL never grades OK",
                    not rj.restore_ok(None, live),
                    ["restore_ok(None, %r)=%r" % (live, rj.restore_ok(None, live))]))
    # ---- (4b) D1 (fix4): the restore grade is CONSUMED by the driver -----
    # The pure helper above is only one half of A2. These arms drive the
    # DRIVER CONSUMER (downgrade_restore_failure): a run whose restore failed
    # must be downgraded to RED-RESTORE-FAILED, must set red_blocks_claims,
    # and must UNDO its own `latest` flip (restore-last, D1 aggravator (a)).
    with tempfile.TemporaryDirectory() as td_d1:
        # a previous green fake run owns `latest` ...
        prev_dir = os.path.join(td_d1, "20260101T000010Z")
        os.makedirs(prev_dir)
        with open(os.path.join(prev_dir, "run-meta.json"), "w") as fh:
            json.dump({"run": "20260101T000010Z", "verdict": "ALL-GREEN",
                       "verdicts": dict(full_green), "fake_mode": True,
                       "fake_restore": dict(ok_restore)}, fh)
        os.symlink(prev_dir, os.path.join(td_d1, "latest"))
        # ... then a LATER fake run flips `latest` to itself and its
        # restore FAILS — the driver consumer must un-do the flip.
        fail_dir = os.path.join(td_d1, "20260101T000020Z")
        os.makedirs(fail_dir)
        meta_fail = {"run": "20260101T000020Z", "verdict": "ALL-GREEN",
                     "verdicts": dict(full_green), "fake_mode": True,
                     "advisory": False, "latest_was": prev_dir}
        with open(os.path.join(fail_dir, "run-meta.json"), "w") as fh:
            json.dump(meta_fail, fh)
        os.remove(os.path.join(td_d1, "latest"))  # the driver's flip
        os.symlink(fail_dir, os.path.join(td_d1, "latest"))
        rj.RECEIPTS_ROOT = td_d1  # the consumer operates on the module's root
        try:
            meta2, note = rj.downgrade_restore_failure(
                fail_dir, meta_fail, {"restore_ok": False, "live_url": live,
                                      "restored_url": fake_u})
        finally:
            rj.RECEIPTS_ROOT = RECEIPTS_ROOT_DEFAULT
        latest_now = (os.path.realpath(os.path.join(td_d1, "latest"))
                      if os.path.islink(os.path.join(td_d1, "latest"))
                      else None)
        results.append(("D1 driver: a FAILED restore UNDOES this run's `latest` flip (restore-last)",
                        latest_now == prev_dir and "UNDONE" in note,
                        ["latest_now=%r note=%r" % (latest_now, note)]))
        results.append(("D1 driver: the run is downgraded to RED-RESTORE-FAILED + red_blocks_claims",
                        meta2["verdict"] == "RED-RESTORE-FAILED"
                        and meta2["red_blocks_claims"] is True
                        and meta2["restore_ok"] is False
                        and os.path.isfile(os.path.join(fail_dir, "run-meta.json"))
                        and json.load(open(os.path.join(fail_dir, "run-meta.json")))["verdict"]
                        == "RED-RESTORE-FAILED",
                        ["verdict=%r rbc=%r" % (meta2["verdict"],
                                                meta2["red_blocks_claims"])]))
        # the advisory suffix survives the downgrade (an advisory run's
        # honest verdict must stay honest).
        meta_adv = {"run": "20260101T000021Z", "verdict": "GREEN-NOT-GATING-ADVISORY",
                    "verdicts": dict(full_green), "advisory": True,
                    "latest_was": None}
        with open(os.path.join(fail_dir, "run-meta.json"), "w") as fh:
            json.dump(meta_adv, fh)
        meta3, _ = rj.downgrade_restore_failure(
            fail_dir, meta_adv, {"restore_ok": False, "live_url": live,
                                 "restored_url": fake_u})
        results.append(("D1 driver: the advisory marker survives the downgrade (run grade RED, advisory mode kept)",
                        meta3["verdict"] == "RED-RESTORE-FAILED-ADVISORY"
                        and meta3["red_blocks_claims"] is True,
                        ["verdict=%r" % meta3["verdict"]]))
        # no regression: the driver's consumer is the guard `if not
        # restore_ok:` itself — a successful restore record must NOT trigger
        # the downgrade. Pin the exact guard the finally block runs.
        results.append(("D1 driver: the downgrade guard (not restore_ok) fires ONLY on failure (ok-restore is a no-op)",
                        (not rj.restore_ok(live, live)) is False
                        and (not rj.restore_ok(live, fake_u)) is True,
                        ["ok-restore guard=%r fail-restore guard=%r" % (
                            not rj.restore_ok(live, live),
                            not rj.restore_ok(live, fake_u))]))
    # ---- (4c) D2 (fix4): the verdict ladder is FAKE-GATED (pure) --------
    # A complete trunk green on the LIVE sampler is GREEN-NOT-GATING and can
    # never own `latest`; only the fake claim run does. These pin the pure
    # functions the driver and the gate both consume.
    results.append(("D2 ladder: complete+trunk+FAKE greens are ALL-GREEN",
                    rj.overall_verdict(0, 0, True, True, False, True) == "ALL-GREEN",
                    ["overall_verdict(0,0,True,True,False,True)"]))
    results.append(("D2 ladder: complete+trunk+NON-fake greens are GREEN-NOT-GATING",
                    rj.overall_verdict(0, 0, True, True, False, False) == "GREEN-NOT-GATING",
                    ["overall_verdict(0,0,True,True,False,False)"]))
    results.append(("D2 flip: a non-fake complete trunk run NEVER owns `latest`",
                    rj.flips_latest(True, True, False, True) is True
                    and rj.flips_latest(True, True, False, False) is False,
                    ["flips_latest(fake=True)=%r flips_latest(fake=False)=%r"
                     % (rj.flips_latest(True, True, False, True),
                        rj.flips_latest(True, True, False, False))]))

    # ---- (5) A4/N1: the trunk FE identity is a LITERAL set, no env -------
    # CL_JOURNEY_APP_BASE (or --app-base) may SELECT the run target, but it
    # must NEVER make a scratch frontend count as trunk. check-gate re-derives
    # the same literal. The cycle-1 D2 defect (env-spoofable app_base_is_trunk)
    # must be gone.
    results.append(("N1 literal-trunk: :5193 (both hosts) IS trunk",
                    rj.app_base_is_trunk("http://localhost:5193")
                    and rj.app_base_is_trunk("http://127.0.0.1:5193"),
                    ["TRUNK_PORTS=%r" % (getattr(rj, "TRUNK_PORTS", None),)]))
    results.append(("N1 literal-trunk: a scratch FE (:5195) is NOT trunk (env cannot spoof)",
                    not rj.app_base_is_trunk("http://127.0.0.1:5195")
                    and not rj.app_base_is_trunk("http://localhost:5195"),
                    []))
    results.append(("N1 literal-trunk: a missing/None app_base is NOT trunk",
                    not rj.app_base_is_trunk(None) and not rj.app_base_is_trunk(""),
                    []))
    # The gate must BLOCK a run whose app_base is scratch even when the
    # run-meta flag claims trunk (the gate re-derives from app_base, N1).
    with tempfile.TemporaryDirectory() as td_n1:
        spoof_dir = os.path.join(td_n1, "20260101T000001Z")
        os.makedirs(spoof_dir)
        with open(os.path.join(spoof_dir, "run-meta.json"), "w") as fh:
            json.dump({"app_base": "http://127.0.0.1:5195",
                       "app_base_is_trunk": True,   # a LYING flag
                       "verdict": "ALL-GREEN", "verdicts": full_green}, fh)
        os.symlink(spoof_dir, os.path.join(td_n1, "latest"))
        env = dict(os.environ, CL_RECEIPTS=td_n1)
        p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py")],
                           capture_output=True, text=True, env=env)
        results.append(("N1 gate: a LIES-flag scratch run is BLOCKED (gate re-derives trunk)",
                        p.returncode == 1 and "NON-TRUNK" in p.stdout,
                        ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))

    # ---- (6) D3/D4 (fix4): the fake dispatch is DATA-driven and logs the
    # RESOLVED turn ------------------------------------------------------
    # The journey set is the canned YAML (no hardcoded id tuple), matching
    # runs on the current user message first / history second, and the
    # receipt log carries the SAME turn variable dispatch used (D4: the
    # pre-fix4 log recomputed turn from the marker alone and misreported
    # the answer turn as turn 1).
    _spec_fi = importlib.util.spec_from_file_location(
        "fake_inference", os.path.join(HERE, "fake-inference.py"))
    if _spec_fi is None or _spec_fi.loader is None:
        raise SystemExit("SELFCHECK: cannot load fake-inference by path")
    fi = importlib.util.module_from_spec(_spec_fi)
    _spec_fi.loader.exec_module(fi)
    with open(os.path.join(HERE, "canned", "completions.yaml")) as fh:
        canned = yaml.safe_load(fh)
    j2_ask = "Add 100uL of 50/50 Trypsin-EDTA/DMEM with 10% FBS to wells A2:H6"
    j2_answer = "Use whole-mixture supplement"
    # (6a) D3: the ANSWER turn of J2 — the journey prompt rides the HISTORY
    # (current message is the answer); dispatch resolves J2 + turn 2, and
    # the receipt log entry (built from the SAME variables) agrees.
    msgs_a = [{"role": "system", "content": "sys"},
              {"role": "user", "content": j2_ask},
              {"role": "assistant", "content": "[card]"},
              {"role": "user", "content": j2_answer}]
    convo_a = "\n".join(m["content"] for m in msgs_a)
    jid_a, spec_a, where_a = fi.pick_completion(canned, convo_a,
                                                saw_assistant=True,
                                                current_text=j2_answer)
    dump_a, log_a = fi.describe_request(msgs_a, convo_a, True, j2_answer,
                                        jid_a, spec_a, where_a, False,
                                        "/api/v1/chat/completions")
    results.append(("D3 fake: J2 answer turn dispatches via HISTORY (current-first, then history)",
                    jid_a == "J2" and where_a == "history"
                    and spec_a is not None and spec_a.get("shorthand", "").count("45%") == 2,
                    ["jid=%r where=%r" % (jid_a, where_a)]))
    results.append(("D4 fake: the answer-turn LOG carries the resolved turn 2 + saw_assistant + the block id that served",
                    log_a["turn"] == 2 and log_a["saw_assistant"] is True
                    and log_a["journey_block"] == "J2"
                    and log_a["journey_match"] is True,
                    ["log=%r" % log_a]))
    # (6b) D3: a NEW journey block dispatches with NO code change — the
    # journey set is the canned YAML (the pre-fix4 hardcoded
    # ("J1","J2","J3") tuple would never reach J4).
    canned4 = {"model": "l2trunkj-fake",
               "journeys": dict(canned["journeys"],
                                **{"J4": {"prompt_contains": "vortex the plate",
                                          "turn1": {"intent": "event_shorthand",
                                                    "shorthand": "intentId: vortex-all\n"}}})}
    jid4, spec4, where4 = fi.pick_completion(
        canned4, "please vortex the plate now", saw_assistant=False,
        current_text="please vortex the plate now")
    results.append(("D3 fake: a NEW canned block (J4) dispatches with no code change",
                    jid4 == "J4" and where4 == "current" and spec4 is not None,
                    ["jid=%r where=%r" % (jid4, where4)]))
    # (6c) D3: current-first over history — history mentions J1 (first in
    # the joined text), the CURRENT turn asks J2: dispatch must bind J2.
    convo_c = "mix all wells that have material\n" + j2_ask
    jid_c, spec_c, where_c = fi.pick_completion(canned, convo_c,
                                                saw_assistant=False,
                                                current_text=j2_ask)
    results.append(("D3 fake: current turn binds over history (J2 despite J1 earlier in convo)",
                    jid_c == "J2" and where_c == "current",
                    ["jid=%r where=%r" % (jid_c, where_c)]))
    # (6d) D4: a MARKER-carrying request (a surface that appends the marker)
    # resolves turn 2 even without an assistant message — and the log says so.
    marker_convo = j2_ask + " [Answered clarifications]"
    jid_m, spec_m, where_m = fi.pick_completion(
        canned, marker_convo, saw_assistant=False, current_text=marker_convo)
    dump_m, log_m = fi.describe_request(
        [{"role": "user", "content": marker_convo}], marker_convo, False,
        marker_convo, jid_m, spec_m, where_m, True, "/x")
    results.append(("D4 fake: the marker (secondary key) resolves turn 2 and the log agrees",
                    spec_m is not None and log_m["turn"] == 2
                    and log_m["marker"] is True and log_m["saw_assistant"] is False,
                    ["log=%r" % log_m]))
    # (6e) D3/D4: an unmatched prompt yields the honest unknown arm, and the
    # log still records the resolved turn + the (absent) block id.
    jid_x, spec_x, where_x = fi.pick_completion(
        canned, "hello there", saw_assistant=False, current_text="hello there")
    dump_x, log_x = fi.describe_request(
        [{"role": "user", "content": "hello"}], "hello", False, "hello",
        jid_x, spec_x, where_x, False, "/x")
    results.append(("D3/D4 fake: an unmatched prompt logs journey_block None + honest unknown arm",
                    jid_x is None and spec_x is None
                    and log_x["journey_match"] is False
                    and log_x["journey_block"] is None and log_x["turn"] == 1,
                    ["log=%r" % log_x]))

    # ---- (7) CHATHOST-SWEEP-1: the chat-host sweep grades against the
    # DATA inventory; a strict-subset verdict table (a dropped host) is RED.
    # Proves the sweep scope axis non-vacuously against the REAL inventory
    # (config/chat/chat-hosts.yaml), the same way the N5/D2/D1 arms drive the
    # gate against synthetic run-metas. The RED case is a PIN, not a live
    # drive: drop one host from the verdict fixture -> the checker exits
    # non-zero (the spec's "non-vacuous pin").
    import importlib.util as _ilu
    _spec_cg = _ilu.spec_from_file_location(
        "check_gate", os.path.join(HERE, "check-gate.py"))
    if _spec_cg is None or _spec_cg.loader is None:
        raise SystemExit("SELFCHECK: cannot load check-gate.py by path")
    cg = _ilu.module_from_spec(_spec_cg)
    _spec_cg.loader.exec_module(cg)
    _spec_sg = _ilu.spec_from_file_location(
        "chat_hosts_shrink_guard",
        os.path.join(HERE, "chat-hosts-shrink-guard.py"))
    if _spec_sg is None or _spec_sg.loader is None:
        raise SystemExit("SELFCHECK: cannot load chat-hosts-shrink-guard.py")
    sgm = _ilu.module_from_spec(_spec_sg)
    _spec_sg.loader.exec_module(sgm)
    # Load the REAL inventory + blessed manifest (tracked in the repo). A
    # missing/malformed inventory is a RED pin, not a crash (fail closed).
    inv_path = os.path.join(REPO_ROOT, "config", "chat", "chat-hosts.yaml")
    man_path = os.path.join(REPO_ROOT, "config", "chat", "chat-hosts.manifest.yaml")
    try:
        inv_ids, inv_surfaces = cg.load_chat_host_inventory(inv_path)
        inv_ok = bool(inv_ids)
    except Exception as _e:
        inv_ids, inv_surfaces, inv_ok = [], [], False
        _inv_err = str(_e)
    else:
        _inv_err = ""
    results.append(("CHATHOST inventory: config/chat/chat-hosts.yaml parses to >=1 host (non-vacuous)",
                    inv_ok, ["inventory=%r err=%s" % (inv_ids, _inv_err if not inv_ok else "")]))
    if inv_ids:
        # fix1 D7: an ACCEPT verdict is an OBJECT with a per-host receipt
        # reference — a bare string alone is not-accept.
        def _acc(host):
            return {"verdict": "accept", "receipts": "receipts/%s.json" % host}
        full_accept = {h: _acc(h) for h in inv_ids}
        dropped = inv_ids[0]                 # drop the FIRST host (deterministic)
        subset = {h: _acc(h) for h in inv_ids if h != dropped}
        # (7a) the FULL inventory, every host an accept OBJECT -> the pure
        # grader is ok.
        ok_a, miss_a, na_a, und_a = cg.grade_chat_host_sweep(
            full_accept, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: the FULL inventory all-accept objects -> ok (non-vacuous)",
                        ok_a and not miss_a and not na_a and not und_a,
                        ["ok=%r miss=%r na=%r und=%r" % (ok_a, miss_a, na_a, und_a)]))
        # (7b) THE RED CASE: a STRICT SUBSET (one host dropped) -> NOT ok,
        # names the missing host. This is the spec's pinned non-vacuous RED.
        ok_b, miss_b, na_b, und_b = cg.grade_chat_host_sweep(
            subset, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: a STRICT-SUBSET table (dropped %r) -> RED, names the host" % dropped,
                        (not ok_b) and miss_b == [dropped],
                        ["ok=%r miss=%r" % (ok_b, miss_b)]))
        # (7c) fix1 D7: a self-declared BARE STRING ("accept", no receipt) is
        # NOT accept -> the host is not-accept and the table is RED.
        na_str = dict(full_accept, **{dropped: "accept"})
        ok_c, miss_c, na_c, und_c = cg.grade_chat_host_sweep(
            na_str, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: a bare 'accept' STRING (no receipt) -> not-accept, RED (fix1 D7)",
                        (not ok_c) and na_c == [dropped],
                        ["ok=%r na=%r" % (ok_c, na_c)]))
        # (7c2) fix1 D7: a verdict object with NO receipts path is not-accept.
        na_norx = dict(full_accept, **{dropped: {"verdict": "accept"}})
        ok_c2, miss_c2, na_c2, und_c2 = cg.grade_chat_host_sweep(
            na_norx, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: an accept object with NO receipts path -> not-accept, RED (fix1 D7)",
                        (not ok_c2) and na_c2 == [dropped],
                        ["ok=%r na=%r" % (ok_c2, na_c2)]))
        # (7d) an UNDECLARED host in the table (tamper evidence) -> NOT ok.
        und_verdicts = dict(full_accept, **{"BOGUS-HOST": _acc("BOGUS-HOST")})
        ok_d, miss_d, na_d, und_d = cg.grade_chat_host_sweep(
            und_verdicts, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: an UNDECLARED host -> RED (N5 exact-set)",
                        (not ok_d) and und_d == ["BOGUS-HOST"],
                        ["ok=%r und=%r" % (ok_d, und_d)]))
        # (7h) fix1 D3: the four-way 'analysis' surface collision is NOT an
        # alias (one key cannot stand for four hosts). A verdict table keyed
        # by DISTINCT surface values is therefore a strict subset (missing the
        # analysis hosts) + undeclared 'analysis' -> RED. Unique surface
        # values ARE aliases (a table keyed by a unique surface resolves).
        amap = cg.alias_map(inv_ids, inv_surfaces)
        analysis_hosts = sorted(h for h, s in zip(inv_ids, inv_surfaces)
                                if s == "analysis")
        amb = [s for s in set(inv_surfaces)
               if sum(1 for x in inv_surfaces if x == s) > 1 and s not in amap]
        distinct_surfs = sorted(set(inv_surfaces))
        surf_keyed = {s: _acc(s) for s in distinct_surfs}
        ok_s, miss_s, na_s, und_s = cg.grade_chat_host_sweep(
            surf_keyed, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: a table keyed by DISTINCT surface values (the four-way 'analysis' collision) -> RED, fail-closed (fix1 D3)",
                        (not ok_s) and miss_s == analysis_hosts
                        and "analysis" in und_s and "analysis" not in amap
                        and amb == ["analysis"],
                        ["ok=%r miss=%r und=%r amb=%r"
                         % (ok_s, miss_s, und_s, amb)]))
        # (7e) Drive THE ACTUAL gate (check-gate.py --chat-hosts): the full
        # table (accept OBJECTS + EXISTING receipt files, trunk app_base)
        # exits 0; the dropped-host table exits non-zero and names the host.
        with tempfile.TemporaryDirectory() as td_ch:
            run_dir = os.path.join(td_ch, "20261102T000000Z")
            os.makedirs(run_dir)
            rx_dir = os.path.join(run_dir, "receipts")
            os.makedirs(rx_dir)
            for h in inv_ids:                 # the receipt FILES must exist (D7)
                with open(os.path.join(rx_dir, "%s.json" % h), "w") as rfh:
                    json.dump({"host": h, "body": {"surface": "x"}}, rfh)
            with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
                json.dump({"app_base": "http://localhost:5193",
                           "chat_host_verdicts": full_accept}, fh)
            os.symlink(run_dir, os.path.join(td_ch, "latest"))
            env_ch = dict(os.environ, CL_RECEIPTS=td_ch,
                          CL_CHAT_HOSTS=inv_path, CL_CHAT_HOSTS_MANIFEST=man_path)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                "--chat-hosts"], capture_output=True, text=True,
                               env=env_ch)
            results.append(("CHATHOST gate: a FULL-inventory sweep run (accept objects + existing receipts) exits 0 (green)",
                            p.returncode == 0 and "GATE-VERDICT green" in p.stdout,
                            ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
            # THE RED pin: drop one host from the verdict fixture -> exit != 0.
            with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
                json.dump({"app_base": "http://localhost:5193",
                           "chat_host_verdicts": subset}, fh)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                "--chat-hosts"], capture_output=True, text=True,
                               env=env_ch)
            results.append(("CHATHOST gate: a DROPPED-HOST (strict-subset) verdict exits non-zero + names the host",
                            p.returncode == 1 and "STRICT SUBSET" in p.stdout
                            and dropped in p.stdout,
                            ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
            # (7e-n1) fix1 D6: the N1 trunk rule applies to the chat axis — a
            # sweep run targeted at a NON-TRUNK app_base (a scratch vite) may
            # never clear the gate, full accept table or not.
            with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
                json.dump({"app_base": "http://localhost:5195",
                           "chat_host_verdicts": full_accept}, fh)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                "--chat-hosts"], capture_output=True, text=True,
                               env=env_ch)
            results.append(("CHATHOST gate: a NON-TRUNK app_base (scratch FE) sweep is RED (fix1 D6 / N1)",
                            p.returncode == 1 and "NON-TRUNK" in p.stdout,
                            ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
            # (7e-d7) fix1 D7: an accept OBJECT whose receipt FILE does not
            # exist is not-accept (the gate does not trust a self-declared
            # verdict without a request-body receipt artefact).
            dangling = {h: {"verdict": "accept",
                            "receipts": "receipts/does-not-exist-%s.json" % h}
                        for h in inv_ids}
            with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
                json.dump({"app_base": "http://localhost:5193",
                           "chat_host_verdicts": dangling}, fh)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                "--chat-hosts"], capture_output=True, text=True,
                               env=env_ch)
            results.append(("CHATHOST gate: an accept verdict whose receipt FILE is missing is RED (fix1 D7)",
                            p.returncode == 1 and "does not exist" in p.stdout,
                            ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
            # ---- (7e-o1) O-1 (advc c8): the gate CONSUMES the probe receipt's
            # OWN teardown claim — a receipt that says teardown_ok: false, or a
            # side_teardown with a *_deleted flag false, is NOT-ACCEPT at the
            # gate (the honest receipt is graded, not just file-checked).
            # Receipts carrying NO teardown claim (no `teardown_ok` / no
            # `side_teardown` — the non-probe J1/J2/J3 shape) are graded
            # unchanged.
            # (7e-o1p) the PURE grader pins (no I/O).
            try:
                _o1_flag = {"side_teardown": {
                    "acl_record_deleted": False,
                    "study_workspace_sidecar_deleted": True}}
                results.append(("FIX2 O-1 pure: receipt_teardown_grade({'teardown_ok': False}) names a reason",
                                bool(cg.receipt_teardown_grade(
                                    {"teardown_ok": False})),
                                ["got=%r" % (cg.receipt_teardown_grade(
                                    {"teardown_ok": False}),)]))
                results.append(("FIX2 O-1 pure: a side_teardown flag false -> a reason naming the flag",
                                isinstance(cg.receipt_teardown_grade(_o1_flag), list)
                                and any("acl_record_deleted" in r
                                        for r in cg.receipt_teardown_grade(_o1_flag)),
                                ["got=%r" % (cg.receipt_teardown_grade(_o1_flag),)]))
                results.append(("FIX2 O-1 pure: teardown_ok true + all-true side_teardown -> honest (None)",
                                cg.receipt_teardown_grade({
                                    "teardown_ok": True,
                                    "side_teardown": {
                                        "acl_record_deleted": True,
                                        "study_workspace_sidecar_deleted": True}})
                                is None,
                                []))
                results.append(("FIX2 O-1 pure: a receipt WITHOUT side_teardown (J1/J2/J3 shape) -> unchanged (None)",
                                cg.receipt_teardown_grade(
                                    {"journey": "run-workspace", "verdict": "green"})
                                is None,
                                []))
            except Exception as _e:
                results.append(("FIX2 O-1 pure: the receipt_teardown_grade pins (helper present + behaviour)",
                                False, ["err=%s" % _e]))
            # (7e-o1) drive THE REAL gate over a fixture run whose receipt
            # FILES carry the honest teardown claims the probe writes.
            with tempfile.TemporaryDirectory() as td_o1:
                run_o1 = os.path.join(td_o1, "20261104T000000Z")
                os.makedirs(run_o1)
                rx_o1 = os.path.join(run_o1, "receipts")
                os.makedirs(rx_o1)
                env_o1 = dict(os.environ, CL_RECEIPTS=td_o1,
                              CL_CHAT_HOSTS=inv_path,
                              CL_CHAT_HOSTS_MANIFEST=man_path)

                def _o1_gate(rec_fn):
                    for h in inv_ids:
                        with open(os.path.join(rx_o1, "%s.json" % h),
                                  "w") as rfh:
                            json.dump(rec_fn(h), rfh)
                    with open(os.path.join(run_o1, "run-meta.json"),
                              "w") as fh:
                        json.dump({"app_base": "http://localhost:5193",
                                   "chat_host_verdicts": full_accept}, fh)
                    os.symlink(run_o1, os.path.join(td_o1, "latest"))
                    p = subprocess.run(
                        [sys.executable, os.path.join(HERE, "check-gate.py"),
                         "--chat-hosts"], capture_output=True, text=True,
                        env=env_o1)
                    os.unlink(os.path.join(td_o1, "latest"))
                    return p

                # (7e-o1a) THE RED pin (pre-O-1 this fixture cleared the gate
                # — the hole the reviewer recorded): every receipt says
                # teardown_ok: false -> the gate must NOT accept.
                p_o1a = _o1_gate(lambda h: {"verdict": "green",
                                            "teardown_ok": False})
                results.append(("FIX2 O-1 gate: a sweep whose receipts say teardown_ok: false is NOT-ACCEPT (exit 1, reason named)",
                                p_o1a.returncode == 1 and "NOT-ACCEPT" in p_o1a.stdout
                                and "teardown_ok" in p_o1a.stdout,
                                ["rc=%d out=%s"
                                 % (p_o1a.returncode,
                                    p_o1a.stdout.strip()[:220])]))
                # (7e-o1b) the reviewer's exact other case: a side_teardown
                # flag false (acl_record_deleted: false) -> NOT-ACCEPT.
                p_o1b = _o1_gate(lambda h: {
                    "verdict": "green", "teardown_ok": True,
                    "side_teardown": {
                        "acl_record_deleted": False,
                        "study_workspace_sidecar_deleted": True}})
                results.append(("FIX2 O-1 gate: a side_teardown flag false (acl_record_deleted: false) is NOT-ACCEPT (exit 1, flag named)",
                                p_o1b.returncode == 1 and "NOT-ACCEPT" in p_o1b.stdout
                                and "acl_record_deleted" in p_o1b.stdout,
                                ["rc=%d out=%s"
                                 % (p_o1b.returncode,
                                    p_o1b.stdout.strip()[:220])]))
                # (7e-o1c) honest receipts (teardown_ok true + all-true
                # side_teardown) still clear the gate.
                p_o1c = _o1_gate(lambda h: {
                    "verdict": "green", "teardown_ok": True,
                    "side_teardown": {
                        "acl_record_deleted": True,
                        "study_workspace_sidecar_deleted": True}})
                results.append(("FIX2 O-1 gate: an honest sweep (teardown_ok true + side_teardown all-true) still clears the gate (rc 0)",
                                p_o1c.returncode == 0
                                and "GATE-VERDICT green" in p_o1c.stdout,
                                ["rc=%d out=%s"
                                 % (p_o1c.returncode,
                                    p_o1c.stdout.strip()[:220])]))
                # (7e-o1d) receipts WITHOUT a teardown claim (the non-probe
                # J1/J2/J3 shape) are graded UNCHANGED.
                p_o1d = _o1_gate(lambda h: {"verdict": "green"})
                results.append(("FIX2 O-1 gate: receipts WITHOUT side_teardown (J1/J2/J3 shape) are graded unchanged (rc 0)",
                                p_o1d.returncode == 0
                                and "GATE-VERDICT green" in p_o1d.stdout,
                                ["rc=%d out=%s"
                                 % (p_o1d.returncode,
                                    p_o1d.stdout.strip()[:220])]))
        # (7f) Change 3 shrink-guard (PURE): the current inventory vs the
        # blessed manifest is green; a SHRUNKEN inventory is RED + names the
        # host; pure GROWTH is allowed. The guard returns a 4-tuple
        # (ok, removed, reason, authorized) and asserts the manifest invariant
        # canonical_sha(blessed_ids) == blessed_sha256 (fix1 D1).
        try:
            with open(man_path) as fh:
                manifest = yaml.safe_load(fh) or {}
            sg_ok0, sg_rm0, sg_reason0, sg_auth0 = sgm.shrink_guard(
                inv_ids, manifest)
            results.append(("CHATHOST shrink-guard: current inventory matches the blessed manifest -> green",
                            sg_ok0 and not sg_rm0 and sg_reason0 is None,
                            ["ok=%r removed=%r reason=%r" % (sg_ok0, sg_rm0, sg_reason0)]))
            shrunk = [h for h in inv_ids if h != dropped]
            sg_ok1, sg_rm1, sg_reason1, _a1 = sgm.shrink_guard(shrunk, manifest)
            results.append(("CHATHOST shrink-guard: a SHRUNKEN inventory (dropped %r) -> RED, names the host" % dropped,
                            (not sg_ok1) and dropped in sg_rm1,
                            ["ok=%r removed=%r reason=%r" % (sg_ok1, sg_rm1, sg_reason1)]))
            grown = list(inv_ids) + ["NEW-HOST"]
            sg_ok2, sg_rm2, sg_reason2, _a2 = sgm.shrink_guard(grown, manifest)
            results.append(("CHATHOST shrink-guard: pure GROWTH (new host) is allowed (not a shrink)",
                            sg_ok2 and not sg_rm2,
                            ["ok=%r removed=%r reason=%r" % (sg_ok2, sg_rm2, sg_reason2)]))
            # (7f-d1) fix1 D1: shrink + TRIMMED blessed_ids (sha UNCHANGED) is
            # RED via the manifest invariant — the removed-set is derived from
            # the hashed payload, never a mutable blessed_ids. This is exactly
            # the reviewer's /tmp drain case (RED-before-fix on a /tmp copy).
            trimmed_manifest = dict(manifest,
                                    blessed_ids=[h for h in manifest.get(
                                        "blessed_ids", []) if h != dropped])
            sg_ok3, sg_rm3, sg_reason3, _a3 = sgm.shrink_guard(
                shrunk, trimmed_manifest)
            results.append(("CHATHOST shrink-guard: shrink + TRIMMED blessed_ids, sha UNCHANGED -> RED via invariant (fix1 D1)",
                            (not sg_ok3) and sg_reason3 == "invariant",
                            ["ok=%r removed=%r reason=%r"
                             % (sg_ok3, sg_rm3, sg_reason3)]))
            # (7f-d1b) fix1 D1: the FULL DRAIN (hosts:[] + blessed_ids:[]) with
            # the sha left at the 6-host value breaks the invariant -> RED.
            drain_manifest = dict(manifest, blessed_ids=[])
            sg_ok4, sg_rm4, sg_reason4, _a4 = sgm.shrink_guard(
                [], drain_manifest)
            results.append(("CHATHOST shrink-guard: a FULL DRAIN (hosts:[] + blessed_ids:[]) -> RED via invariant (fix1 D1)",
                            (not sg_ok4) and sg_reason4 == "invariant",
                            ["ok=%r removed=%r reason=%r"
                             % (sg_ok4, sg_rm4, sg_reason4)]))
            # (7f-d2) fix1 D2: on a blessed-sha CHANGE (a re-bless record whose
            # sha == the current inventory sha + consistent blessed_ids) the
            # bless_note MUST cite an existing spec, else RED. Control: the
            # SAME record WITH an existing spec path is authorized (GREEN).
            shrunk_sha = sgm.canonical_sha(shrunk)
            good_spec = ".hermes/plans/2026-11-02_0500-L2-CHATHOST-SWEEP-1-spec.md"
            rec_no_spec = {"blessed_sha256": shrunk_sha, "blessed_ids": shrunk,
                           "bless_note": "nope, no spec cited here",
                           "blessed_at": "20261102T999999Z"}
            d2_red = dict(manifest, blessed_records=[rec_no_spec])
            sg_ok5, sg_rm5, sg_reason5, sg_auth5 = sgm.shrink_guard(
                shrunk, d2_red)
            results.append(("CHATHOST shrink-guard: a re-bless whose bless_note cites NO existing spec -> RED (fix1 D2)",
                            (not sg_ok5) and sg_reason5 == "no-consistent-record"
                            and sg_auth5 is None,
                            ["ok=%r removed=%r reason=%r auth=%r"
                             % (sg_ok5, sg_rm5, sg_reason5, sg_auth5)]))
            rec_spec = {"blessed_sha256": shrunk_sha, "blessed_ids": shrunk,
                        "bless_note": "Deleted %s; authorized by %s."
                                       % (dropped, good_spec),
                        "blessed_at": "20261102T999999Z"}
            d2_green = dict(manifest, blessed_records=[rec_spec])
            sg_ok6, sg_rm6, sg_reason6, sg_auth6 = sgm.shrink_guard(
                shrunk, d2_green)
            results.append(("CHATHOST shrink-guard: a re-bless whose bless_note cites an EXISTING spec -> authorized GREEN (fix1 D2)",
                            sg_ok6 and sg_rm6 == [dropped]
                            and sg_reason6 is None and sg_auth6 == good_spec,
                            ["ok=%r removed=%r reason=%r auth=%r"
                             % (sg_ok6, sg_rm6, sg_reason6, sg_auth6)]))
            # (7f-fix2) fix2 D2: a CONSISTENT top-level REWRITE — blessed_ids
            # trimmed + blessed_sha256 re-set to the new set's sha (invariant
            # holds) + current inventory equal to the rewritten set — is a
            # blessed-set change, NOT a no-change: it is authorized ONLY via a
            # blessed_records entry citing an existing spec. The top-level
            # bless_note is prose and is NEVER read as authorization. RED
            # before the fix (the old guard returned (True, [], None, None)
            # here — the cycle-2 reviewer's evidence case).
            rewrite = dict(manifest,
                           blessed_sha256=shrunk_sha,
                           blessed_ids=shrunk,
                           bless_note="deleted %s, no spec cited here"
                                      % dropped)
            sg_ok7, sg_rm7, sg_reason7, sg_auth7 = sgm.shrink_guard(
                shrunk, rewrite)
            results.append(("CHATHOST shrink-guard: a CONSISTENT top-level re-bless (rewritten blessed_ids+blessed_sha256) whose bless_note cites NO existing spec -> RED (fix2 D2)",
                            (not sg_ok7) and sg_auth7 is None,
                            ["ok=%r removed=%r reason=%r auth=%r"
                             % (sg_ok7, sg_rm7, sg_reason7, sg_auth7)]))
            rewrite_cited = dict(rewrite, blessed_records=[rec_spec])
            sg_ok8, sg_rm8, sg_reason8, sg_auth8 = sgm.shrink_guard(
                shrunk, rewrite_cited)
            # CONSOLIDATE-1 OBS-B option (i): with a consistent top-level
            # rewrite the top level already FORGETS the dropped host, but the
            # ANCHOR SET (first_blessed_ids) is what REMEMBERS it — removed is
            # derived from the anchor, so the dropped host is NAMED even on
            # the authorized path (c3 D3, closed). The point of this arm is
            # therefore that the spec-cited blessed_records entry AUTHORIZES
            # the rewritten state (RED without it, per the arm above) AND
            # that the authorized removed-set names the dropped host.
            results.append(("CHATHOST shrink-guard: a CONSISTENT top-level re-bless + a blessed_records entry citing an EXISTING spec -> authorized GREEN, dropped host NAMED (OBS-B i)",
                            sg_ok8 and sg_rm8 == [dropped]
                            and sg_reason8 is None and sg_auth8 == good_spec,
                            ["ok=%r removed=%r reason=%r auth=%r"
                             % (sg_ok8, sg_rm8, sg_reason8, sg_auth8)]))
            # (7g) a shrink WITHOUT a re-bless (the manifest still carries the
            # full 6-host blessed sha) is RED even when driven through the
            # gate. The shrunk inventory carries the `surface` field (D3) and
            # the sweep table is complete accept-objects, so ONLY the
            # shrink-guard can turn this red — proves the guard is the
            # authority, not the verdict table.
            with tempfile.TemporaryDirectory() as td_sh:
                shrunk_inv = os.path.join(td_sh, "shrunk.yaml")
                sh_hosts = [{"id": h, "surface": inv_surfaces[inv_ids.index(h)]}
                            for h in shrunk]
                with open(shrunk_inv, "w") as fh:
                    yaml.safe_dump({"hosts": sh_hosts}, fh)
                run_dir2 = os.path.join(td_sh, "20261102T000001Z")
                os.makedirs(run_dir2)
                rx2 = os.path.join(run_dir2, "receipts")
                os.makedirs(rx2)
                for h in shrunk:                # receipt files must exist (D7)
                    with open(os.path.join(rx2, "%s.json" % h), "w") as rfh:
                        json.dump({"host": h, "body": {}}, rfh)
                with open(os.path.join(run_dir2, "run-meta.json"), "w") as fh:
                    json.dump({"app_base": "http://localhost:5193",
                               "chat_host_verdicts": {h: _acc(h) for h in shrunk}},
                              fh)
                os.symlink(run_dir2, os.path.join(td_sh, "latest"))
                env_sh = dict(os.environ, CL_RECEIPTS=td_sh,
                              CL_CHAT_HOSTS=shrunk_inv,
                              CL_CHAT_HOSTS_MANIFEST=man_path)
                p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                    "--chat-hosts"], capture_output=True, text=True,
                                   env=env_sh)
                results.append(("CHATHOST shrink-guard: an un-re-blessed SHRINK blocks the gate even with a complete sweep table",
                                p.returncode == 1
                                and "authorized re-bless" in p.stdout
                                and dropped in p.stdout,
                                ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:220])]))
        except Exception as _e:
            results.append(("CHATHOST shrink-guard: manifest load (Change 3)",
                            False, ["err=%s" % _e]))

        # ---- (T4) §8.2 T-4 / §6 LEG-C6-SWEEP-DEBT: the DRIVER's EMMITTER
        # (run-journeys.py emit_chat_host_verdicts) over a SYNTHETIC sweep
        # fixture. The arms drive THE SAME function the driver runs when it
        # writes chat_host_verdicts (no helper divergence), so a broken or
        # fabricated emitter makes the arm RED (non-vacuous). The emitter
        # maps each per-host receipt that EXISTS in the run dir to an accept
        # OBJECT; a host whose receipt was never written is OMITTED, which is
        # exactly what the gate's strict-subset check names.
        with tempfile.TemporaryDirectory() as td_t4:
            run_dir_t4 = os.path.join(td_t4, "20261103T000000Z")
            os.makedirs(run_dir_t4)
            for h in inv_ids:                    # one green receipt per host
                with open(os.path.join(run_dir_t4, "%s.json" % h), "w") as rfh:
                    json.dump({"journey": h, "verdict": "green",
                               "ai_request_bodies": [{"endpoint": "/api/ai/**",
                                   "body": {"prompt": rj.CHATHOST_SWEEP_PROMPT}}],
                               "screenshots": ["rendered-answer.png"]}, rfh)
            # (T4a) the EMITTER over a FULL synthetic sweep -> a table keyed by
            # every inventory id, each an accept OBJECT with a per-host receipt.
            t4_table = rj.emit_chat_host_verdicts(run_dir_t4, inv_ids)
            results.append(("§6 T-4: the DRIVER emitter over a FULL synthetic sweep -> all six ids accept (non-vacuous)",
                            sorted(t4_table) == sorted(inv_ids)
                            and all(t4_table[h]["verdict"] == "accept" for h in inv_ids)
                            and all(t4_table[h]["receipts"] == "%s.json" % h for h in inv_ids),
                            ["table_keys=%r" % (sorted(t4_table),)]))
            # the emitter's FULL table drives the REAL gate -> GREEN (rc 0)
            with open(os.path.join(run_dir_t4, "run-meta.json"), "w") as fh:
                json.dump({"app_base": "http://localhost:5193",
                           "chat_host_verdicts": t4_table}, fh)
            os.symlink(run_dir_t4, os.path.join(td_t4, "latest"))
            env_t4 = dict(os.environ, CL_RECEIPTS=td_t4,
                          CL_CHAT_HOSTS=inv_path, CL_CHAT_HOSTS_MANIFEST=man_path)
            p_t4 = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                   "--chat-hosts"], capture_output=True, text=True,
                                  env=env_t4)
            results.append(("§6 T-4: the emitter's FULL-inventory table drives the REAL gate GREEN (rc 0)",
                            p_t4.returncode == 0 and "GATE-VERDICT green" in p_t4.stdout,
                            ["rc=%d out=%s" % (p_t4.returncode, p_t4.stdout.strip()[:160])]))
            # (T4b) THE RED CASE: the SAME emitter with FIVE hosts (one host's
            # receipt was never written) -> the table is a STRICT SUBSET and the
            # REAL gate exits 1 NAMING the missing host. Non-vacuous: an emitter
            # that fabricates the dropped host's accept (or always emits all six)
            # makes missing5 != [dropped] and this arm fails.
            os.remove(os.path.join(run_dir_t4, "%s.json" % dropped))
            t4_table5 = rj.emit_chat_host_verdicts(run_dir_t4, inv_ids)
            with open(os.path.join(run_dir_t4, "run-meta.json"), "w") as fh:
                json.dump({"app_base": "http://localhost:5193",
                           "chat_host_verdicts": t4_table5}, fh)
            p_t4b = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                    "--chat-hosts"], capture_output=True, text=True,
                                   env=env_t4)
            missing5 = [h for h in inv_ids if h not in t4_table5]
            results.append(("§6 T-4: the emitter with FIVE hosts (dropped %r) -> the REAL gate exits 1 + names the host" % dropped,
                            missing5 == [dropped]
                            and p_t4b.returncode == 1
                            and "STRICT SUBSET" in p_t4b.stdout
                            and dropped in p_t4b.stdout,
                            ["missing=%r rc=%d out=%s"
                             % (missing5, p_t4b.returncode, p_t4b.stdout.strip()[:160])]))
            # (T4c) non-vacuity of the DATA tie: the ONE shared probe prompt must
            # be the substring the single CHATHOST-SWEEP canned block matches on
            # (prompt_contains), so the fake serves the sweep prompt with a real
            # rendered answer — one block serves all six hosts. Break the prompt
            # <-> block tie (or drop the block) and this arm fails, i.e. the
            # sweep would ride no canned completion.
            with open(os.path.join(HERE, "canned", "completions.yaml")) as fh:
                _cand = yaml.safe_load(fh) or {}
            _sweep_block = (_cand.get("journeys") or {}).get("CHATHOST-SWEEP")
            _needle = (_sweep_block or {}).get("prompt_contains")
            results.append(("§6 T-4: the probe prompt is matched by the ONE CHATHOST-SWEEP canned block (non-vacuous)",
                            isinstance(_sweep_block, dict)
                            and isinstance(_needle, str) and _needle
                            and _needle in rj.CHATHOST_SWEEP_PROMPT,
                            ["block_present=%r needle=%r" % (isinstance(_sweep_block, dict), _needle)]))

    # ---- (U1b) CHATHOST-CONSOLIDATE-1 negative control (pure — no browser,
    # no stack). The open_ai_tab step was made to DETECT THE PANE FIRST (the
    # composer 'Message' locator the ask step already uses) and click the
    # right-pane-tab-ai tab ONLY when it exists — tolerating the surface's
    # honest shape (run-workspace mounts the chat pane already open, with no
    # tab element). The assertion must stay intact: a host that GENUINELY
    # lacks the chat pane yields no rendered assistant answer, and the
    # probe's OWN assert.rendered must score that evidence RED (not a step
    # skip). Feed the driver's pure grader the evidence ui-drive records:
    #   pane-absent  -> 0 assistant turns (RED on the probe's own assertion);
    #   pane-present -> 1 non-empty answer (GREEN, i.e. the fix is not
    #                   over-strict). The assert.rendered block is the
    # probe's real one (built from the real inventory route DATA).
    try:
        _u1_probe = rj.build_chat_host_probe(
            "chathost-sweep-negative-control", "x", "/x")
        _u1_assert_rendered = _u1_probe["assert"]["rendered"]
        _u1_ev_absent = {"assistant_turns": 0,
                         "last_assistant_text_nonempty": False,
                         "turns_completed": 0, "error_frames": 0}
        _u1_ev_present = {"assistant_turns": 1,
                          "last_assistant_text_nonempty": True,
                          "turns_completed": 1, "error_frames": 0}
        _u1_v_absent = rj.check_rendered_assertions(
            _u1_ev_absent, _u1_assert_rendered)
        _u1_v_present = rj.check_rendered_assertions(
            _u1_ev_present, _u1_assert_rendered)
        results.append(("U1b: the probe assert.rendered DEMANDS a visible assistant answer",
                        any("assistant_answer_visible" in a for a in _u1_assert_rendered),
                        ["assert.rendered=%r" % (_u1_assert_rendered,)]))
        results.append(("U1b negative control: pane-ABSENT evidence is RED on the probe's own assert.rendered",
                        bool(_u1_v_absent)
                        and any("assistant" in v for v in _u1_v_absent),
                        ["violations=%r" % (_u1_v_absent,)]))
        results.append(("U1b control: pane-present non-empty evidence is GREEN (fix not over-strict)",
                        not _u1_v_present,
                        ["violations=%r" % (_u1_v_present,)]))
        # ONE shared step implementation (no per-host branch): detect the
        # pane FIRST (composer 'Message'), click the tab only when present,
        # fail closed when neither is present.
        _u1_src = open(os.path.join(HERE, "ui-drive.cjs")).read()
        results.append(("U1b: open_ai_tab detects the pane FIRST (tab + composer locators) and fails closed",
                        '[data-testid="right-pane-tab-ai"]' in _u1_src
                        and "getByLabel('Message', { exact: true })" in _u1_src
                        and "throw new Error('open_ai_tab: neither" in _u1_src,
                        []))
        results.append(("U1b: the probe step sequence keeps open_ai_tab as step 2",
                        _u1_probe["steps"][1] == {"step": "open_ai_tab"},
                        ["steps=%r" % (_u1_probe["steps"],)]))
        # (U1a) the artifact-host probe materialises its REAL record via the
        # standard seed.record / teardown.delete_record machinery (recordId
        # from the route's :artifactId token); the other hosts stay seedless
        # (no per-host special-casing). Checked on the REAL inventory DATA.
        _u1_inv = yaml.safe_load(open(rj.CHAT_HOSTS_INVENTORY)) or {}
        _u1_hosts = _u1_inv.get("hosts") or []
        _u1_ah = next((h for h in _u1_hosts if h.get("id") == "artifact-host"), None)
        _u1_ahp = (rj.build_chat_host_probe(_u1_ah["id"], _u1_ah["surface"],
                                            _u1_ah["route"])
                   if _u1_ah else None)
        _u1_seedrec = ((_u1_ahp or {}).get("seed") or {}).get("record") or {}
        results.append(("U1a: artifact-host probe seeds a REAL record (recordId from the route's :artifactId token)",
                        bool(_u1_ahp)
                        and _u1_seedrec.get("recordId") == "CHATHOST-PROBE"
                        and _u1_seedrec.get("payload", {}).get("kind") == "artifact",
                        ["seed.record=%r" % (_u1_seedrec,)]))
        results.append(("U1a: the seeded artifact record carries schemaId + a schema-valid payload (kind/studyId/recordId)",
                        bool(_u1_ahp)
                        and "schemaId" in _u1_seedrec
                        and _u1_seedrec.get("payload", {}).get("studyId", "").startswith("STU-")
                        and _u1_seedrec.get("payload", {}).get("recordId") == _u1_seedrec.get("recordId"),
                        ["schemaId=%r" % (_u1_seedrec.get("schemaId"),)]))
        results.append(("U1a: artifact-host probe tears down the seeded record (delete_record)",
                        (_u1_ahp or {}).get("teardown") == {"delete_record": "CHATHOST-PROBE"},
                        ["teardown=%r" % ((_u1_ahp or {}).get("teardown"),)]))
        _u1_rw = next((h for h in _u1_hosts if h.get("id") == "run-workspace"), None)
        _u1_rwp = (rj.build_chat_host_probe(_u1_rw["id"], _u1_rw["surface"],
                                            _u1_rw["route"])
                   if _u1_rw else None)
        results.append(("U1a: run-workspace probe stays seedless (its /runs/:id route mounts no artifact record)",
                        bool(_u1_rwp)
                        and (_u1_rwp.get("seed") in ({}, None)),
                        ["run-workspace seed=%r" % ((_u1_rwp or {}).get("seed"),)]))
        # CHATHOST-CONSOLIDATE-1 (replaces the pre-alertseed "ONLY the
        # artifact route materialises a record" arm — that model is now
        # SUPERSEDED: the probe seed is pure ROW DATA, `probe_seed:`, read by
        # id. artifact-host keeps its pre-existing route-shape seeding (no
        # probe_seed field), event-editor/record-host carry probe_seed, the
        # rest stay seedless — ALL decided by the row's DATA, never by a
        # host-name comparison in the builder).
        _u1_withseed_ok = True
        _u1_withseed_ids = []
        for h in _u1_hosts:
            if not h.get("probe_seed"):
                continue
            _u1_withseed_ids.append(h.get("id"))
            _u1_p = rj.build_chat_host_probe(h["id"], h.get("surface"),
                                             h.get("route") or "")
            _u1_rec = (_u1_p.get("seed") or {}).get("record")
            _u1_td = _u1_p.get("teardown")
            if not (_u1_rec == h.get("probe_seed", {}).get("record")
                    and _u1_td == (h.get("probe_seed", {}).get("teardown")
                                   or {})):
                _u1_withseed_ok = False
        results.append(("U1a: a row WITH probe_seed produces a probe carrying that seed + matching teardown (event-editor/record-host)",
                        _u1_withseed_ok and len(_u1_withseed_ids) >= 2,
                        ["with-seed rows=%r" % (_u1_withseed_ids,)]))
        _u1_nonseeded_rec = sum(
            1 for h in _u1_hosts if not h.get("probe_seed")
            and (rj.build_chat_host_probe(
                h["id"], h.get("surface"), h.get("route") or "").get("seed")
                or {}).get("record"))
        results.append(("U1a: a row WITHOUT probe_seed behaves EXACTLY as today (artifact keeps its route-shape record; the other four stay seedless)",
                        _u1_nonseeded_rec == 1
                        and (rj.build_chat_host_probe("run-workspace", "x",
                                                     "/runs/x").get("seed")
                             in ({}, None)),
                        ["non-seeded rows materialising records (expect 1 = the /artifact/ route-shape rule)"]))
        # grep-provability pin (PINS): the BUILDER carries zero id-equality
        # branches (no `if host ==` / id == comparisons) — the seed is a DATA
        # lookup keyed by id (the id only keys the row read inside
        # _inventory_probe_seed, never a branch condition), so adding a
        # probe_seed row changes NO code.
        _u1_builder_src = open(os.path.join(HERE, "run-journeys.py")).read()
        _u1_builder_fn = _u1_builder_src.split("def build_chat_host_probe", 1)[1]
        _u1_builder_fn = _u1_builder_fn.split("\ndef ", 1)[0]
        results.append(("U1a: the probe builder is id-branch-free (a data lookup, grep-provable — zero `if host ==` / id-equality branches)",
                        ("if host_id ==" not in _u1_builder_fn)
                        and ('if host_id' not in _u1_builder_fn)
                        and ("== \"artifact-host\"" not in _u1_builder_fn)
                        and ("== \"event-editor\"" not in _u1_builder_fn)
                        and ("== \"record-host\"" not in _u1_builder_fn)
                        and ("_inventory_probe_seed(host_id)" in _u1_builder_fn),
                        ["builder fn len=%d" % len(_u1_builder_fn)]))
    except Exception as _e:
        results.append(("U1a/U1b: self-check (probe seed + open_ai_tab negative control)",
                        False, ["err=%s" % _e]))

    # ---- (D6) CHATHOST-CONSOLIDATE-1 GRADER FIX (ruling D-6, l2t0150):
    # the Q3 negative-control pins + Q4 umbrella. Each browser arm drives
    # the REAL ui-drive.cjs (temp-dir probe, symlinked node_modules, file://
    # fixture page — the existing arm mechanism) so the receipt's
    # rendered_evidence is the driver's OWN computation, then grades it
    # through the driver's OWN check_rendered_assertions + the probe's real
    # assert.rendered. Every arm must grade NOT-ACCEPT (violations non-empty
    # -> red). The Q4 umbrella is pinned on the RECEIPTS (the selector-proof
    # triple + bubbles_matched) and the driver SOURCE (no body_text_tail
    # borrowing for the selector-proof terms).
    _D6_NM = os.path.join(REPO_ROOT, "node_modules")
    if not os.path.isdir(os.path.join(_D6_NM, "js-yaml")):
        _D6_NM = "/mnt/vast/home/brad/git/cl-integration-2/node_modules"

    def _d6_drive(tag, rows_html, log_selector=None, review_log=""):
        """Drive the REAL driver against a file:// fixture page: a
        [aria-label=Conversation] log root holding rows_html, plus an
        OPTIONAL .review-ai__log root (the doc-root fallback target) so the
        fallback path is EXERCISED, not skipped. Returns (rc, rec, stderr)."""
        td6 = tempfile.mkdtemp(prefix="sc-d6-%s-" % tag)
        try:
            fix = os.path.join(td6, "fixture.html")
            with open(fix, "w") as fh:
                fh.write("<!doctype html><html><body>\n"
                         "<div aria-label=\"Conversation\" "
                         "class=\"sequence-chat-messages\">\n"
                         "%s\n</div>\n%s\n</body></html>\n"
                         % (rows_html, review_log))
            jp = os.path.join(td6, "D6-%s.yaml" % tag)
            # Build the journey YAML by hand (json.dumps gives valid YAML
            # double-quoted scalars). log_selector is OMITTED when None so
            # the driver's documented default ('[aria-label="Conversation"]')
            # applies — yaml.safe_dump(None) would emit 'null' + a '...'
            # doc-end marker that js-yaml rejects ("expected a single
            # document"), the rc=1 the earlier draft hit.
            _d6_lines = ["id: D6-%s" % tag, "timeout_s: 30"]
            if log_selector is not None:
                _d6_lines.append("log_selector: %s" % json.dumps(log_selector))
            _d6_lines += ["steps:", "  - step: goto",
                          "    path: %s" % json.dumps(fix)]
            with open(jp, "w") as fh:
                fh.write("\n".join(_d6_lines) + "\n")
            op = os.path.join(td6, "D6-%s-ui.json" % tag)
            os.symlink(_D6_NM, os.path.join(td6, "node_modules"))
            p = subprocess.run(
                ["node", os.path.join(HERE, "ui-drive.cjs"),
                 "--journey", jp, "--out", op, "--app-base", "file://"],
                cwd=APP_DIR, capture_output=True, text=True, timeout=180)
            try:
                rec = json.load(open(op))
            except Exception:
                rec = {"_unreadable": True}
            return p.returncode, rec, (p.stderr or "")[-500:]
        finally:
            try:
                os.unlink(os.path.join(td6, "node_modules"))
            except OSError:
                pass
            shutil.rmtree(td6, ignore_errors=True)

    _D6_ROWS_USER_ONLY = ('<div class="chat-log-msg chat-log-msg--user">'
                          "<strong>You</strong><span>just a user row</span>"
                          "</div>")
    _D6_ROWS_ASSISTANT_EMPTY = ('<div class="chat-log-msg '
                                'chat-log-msg--assistant"><strong>'
                                "Assistant</strong></div>")
    _D6_ROWS_ASSISTANT_ANSWER = ('<div class="chat-log-msg '
                                 'chat-log-msg--assistant"><strong>'
                                 "Assistant</strong>"
                                 "<p>here is the rendered answer</p></div>")
    _D6_REVIEW_LOG = ('<div class="review-ai__log">'
                      "<div class=\"review-ai__message\">review log "
                      "chrome</div></div>")
    try:
        _d6_src = open(os.path.join(HERE, "ui-drive.cjs")).read()
        # (a) the driver's assistant-row set is the ruling's EXACT set: the
        #     assistant row class + the intent-card render class. The check
        #     is scoped to the ACTUAL selector token (the one that computes
        #     `bubbles` inside readAssistantTexts) — scanning the whole file
        #     for absence of the legacy names would false-RED on this
        #     comment and on the FROZEN review-surface settle logic
        #     (lines ~293/304) which legitimately uses
        #     .message-log__bubble--assistant for the MessageLog surface.
        #     .message-log__bubble is a USER-row base class (MessageLog.tsx:143
        #     `message-log__bubble message-log__bubble--user`) — keeping it in
        #     the assistant set would count user rows as assistant turns, the
        #     flattery the ruling forbids. Raw .chat-log-msg (all rows) is
        #     deliberately NOT in the set either.
        _d6_m = re.search(
            r"const\s+bubbles\s*=\s*Array\.from\(\s*root\.querySelectorAll\(([^)]*)\)\s*\)",
            _d6_src)
        _d6_set = _d6_m.group(1).strip() if _d6_m else ""
        results.append((
            "D6 Q1: driver assistant set is the ruling's exact set "
            "(.chat-log-msg--assistant, .chat-log-intent-card; legacy + "
            "raw .chat-log-msg ABSENT from that set)",
            _d6_set == "'.chat-log-msg--assistant, .chat-log-intent-card'"
            and "chat-log__bubble" not in _d6_set
            and "message-log__bubble" not in _d6_set
            and "'.chat-log-msg'" not in _d6_set,
            ["bubbles set token=%r" % (_d6_set,)]))
        # (b) Q4 umbrella (source-level): the selector-proof triple +
        #     bubbles_matched are computed from MATCHED elements (the
        #     readAssistantTexts result `after`), never borrowed from the
        #     page-body text tail. `evidence.body_text_tail` is assigned
        #     EXACTLY ONCE (the legitimate body-text read for text_contains)
        #     and NONE of the four selector-proof fields read it.
        _d6_tail_assigns = _d6_src.count("evidence.body_text_tail")
        _d6_proof_lines = [ln for ln in _d6_src.splitlines()
                           if re.match(
                               r"\s*evidence\.(assistant_turns|turns_completed"
                               r"|bubbles_matched|last_assistant_text_nonempty)"
                               r"\s*=", ln)]
        _d6_no_tail_borrow = (
            _d6_tail_assigns == 1
            and len(_d6_proof_lines) == 4
            and not any("body_text_tail" in ln for ln in _d6_proof_lines))
        results.append(("D6 Q4: selector-proof terms computed from matched "
                        "elements, no body_text_tail borrowing",
                        _d6_no_tail_borrow,
                        ["body_text_tail assigns=%r proof-fields=%r"
                         % (_d6_tail_assigns, len(_d6_proof_lines))]))
        # (c) Q2 semantics pin (pure, no browser): assistant_answer_visible
        #     requires BOTH a completed turn (baseline-subtracted
        #     turns_completed >= 1) AND a non-empty last assistant row.
        #     Pre-existing rows (assistant_turns >= 1, turns_completed == 0)
        #     must NOT satisfy it; user-only / empty threads must grade
        #     not-green. Uses the probe's REAL assert.rendered.
        #
        #     advc c10 D3: the pre-existing case is graded with the
        #     {assistant_answer_visible: true} assertion ALONE — against the
        #     full assert.rendered the sibling turns_at_least backstop
        #     (turns_completed=0 < 1) would RED it at BASE too, so the arm
        #     passed both ways and did not test the Q2 change. Alone, it
        #     grades GREEN at base (assistant_answer_visible read
        #     assistant_turns=1, nonempty=True — the false positive) and RED
        #     at head — the arm flips with the Q2 line (verified against a
        #     /tmp copy with the Q2 line reverted).
        _d6_probe = rj.build_chat_host_probe("d6-semantics", "x", "/x")
        _d6_ar = _d6_probe["assert"]["rendered"]
        _d6_aav_only = [{"assistant_answer_visible": True}]
        _d6_green_ev = {"assistant_turns": 1, "turns_completed": 1,
                        "last_assistant_text_nonempty": True,
                        "error_frames": 0}
        _d6_pre_ev = {"assistant_turns": 1, "turns_completed": 0,
                      "last_assistant_text_nonempty": True, "error_frames": 0}
        _d6_user_ev = {"assistant_turns": 0, "turns_completed": 0,
                       "last_assistant_text_nonempty": False,
                       "error_frames": 0}
        _d6_empty_ev = {"assistant_turns": 1, "turns_completed": 1,
                        "last_assistant_text_nonempty": False,
                        "error_frames": 0}
        _d6_v = {k: rj.check_rendered_assertions(ev, _d6_ar)
                 for k, ev in [("green", _d6_green_ev),
                               ("useronly", _d6_user_ev),
                               ("empty", _d6_empty_ev)]}
        _d6_pre_alone = rj.check_rendered_assertions(_d6_pre_ev, _d6_aav_only)
        _d6_pre_specific = any(
            "no visible non-empty assistant answer" in v and "turns_completed=0" in v
            for v in _d6_pre_alone)
        results.append(("D6 Q2: green IFF (turns_completed>=1 AND "
                        "non-empty last row); user-only / empty all grade "
                        "not-green",
                        not _d6_v["green"]
                        and bool(_d6_v["useronly"])
                        and bool(_d6_v["empty"]),
                        ["violations=%r" % (
                            {k: (v[:1] if v else v) for k, v in _d6_v.items()},
                        )]))
        results.append(("D6 Q2 pin: pre-existing evidence (assistant_turns=1, "
                        "turns_completed=0) graded with {assistant_answer_"
                        "visible:true} ALONE is RED with the specific "
                        "violation (advc c10 D3 — alone it grades GREEN at "
                        "base, so the arm flips with the Q2 line)",
                        _d6_pre_specific,
                        ["alone violations=%r" % (_d6_pre_alone,)]))
        # (d) PIN 1 — user-only: ONLY a .chat-log-msg--user row renders.
        _d6_rc_uo, _d6_rec_uo, _d6_err_uo = _d6_drive(
            "uonly", _D6_ROWS_USER_ONLY)
        _d6_ev_uo = (_d6_rec_uo.get("rendered_evidence") or {})
        _d6_vu = rj.check_rendered_assertions(
            _d6_ev_uo, _d6_probe["assert"]["rendered"])
        results.append(
            ("D6 Q3 pin 1: user-only thread grades NOT-ACCEPT "
             "(assistant_turns=0, last_assistant_text_nonempty=false)",
             _d6_rc_uo == 0
             and _d6_ev_uo.get("assistant_turns") == 0
             and _d6_ev_uo.get("last_assistant_text_nonempty") is False
             and _d6_ev_uo.get("bubbles_matched") == 0
             and bool(_d6_vu),
             ["rc=%s ev=%r viol=%s"
              % (_d6_rc_uo,
                 {k: _d6_ev_uo.get(k) for k in (
                     "assistant_turns", "last_assistant_text_nonempty",
                     "turns_completed", "bubbles_matched")},
                 _d6_vu[:2])]))
        # (e) PIN 2 — empty assistant: ONE assistant-tagged row, empty
        #     body, no intent card. assistant_turns >= 1 (the row IS
        #     matched) but the last row grades empty -> not-accept.
        _d6_rc_ea, _d6_rec_ea, _d6_err_ea = _d6_drive(
            "eassist", _D6_ROWS_ASSISTANT_EMPTY)
        _d6_ev_ea = (_d6_rec_ea.get("rendered_evidence") or {})
        _d6_vea = rj.check_rendered_assertions(
            _d6_ev_ea, _d6_probe["assert"]["rendered"])
        results.append(
            ("D6 Q3 pin 2: empty assistant row grades NOT-ACCEPT "
             "(assistant_turns>=1 but last_assistant_text_nonempty=false)",
             _d6_rc_ea == 0
             and _d6_ev_ea.get("assistant_turns", 0) >= 1
             and _d6_ev_ea.get("bubbles_matched", 0) >= 1
             and _d6_ev_ea.get("last_assistant_text_nonempty") is False
             and bool(_d6_vea),
             ["rc=%s ev=%r viol=%s"
              % (_d6_rc_ea,
                 {k: _d6_ev_ea.get(k) for k in (
                     "assistant_turns", "last_assistant_text_nonempty",
                     "turns_completed", "bubbles_matched")},
                 _d6_vea[:2])]))
        # (f) PIN 3 — absent log root: log_selector matches NOTHING; the
        #     fail-closed path returns turns:0. The fixture ALREADY CARRIES
        #     a .review-ai__log (the doc-root fallback target) with
        #     non-chrome text in the BODY — proving (1) the fallback does
        #     NOT rescue (it carries no assistant rows: the assistant
        #     set matches 0 inside it -> still turns:0, no double-count)
        #     and (2) body-text-only "proof" would have found the answer
        #     text in the page while the selector-proof triple stays 0.
        _d6_rc_ab, _d6_rec_ab, _d6_err_ab = _d6_drive(
            "absroot", _D6_ROWS_ASSISTANT_ANSWER,
            log_selector=".no-such-log-root", review_log=_D6_REVIEW_LOG)
        _d6_ev_ab = (_d6_rec_ab.get("rendered_evidence") or {})
        _d6_vab = rj.check_rendered_assertions(
            _d6_ev_ab, _d6_probe["assert"]["rendered"])
        _d6_fallback_no_rescue = (
            _d6_rc_ab == 0
            and _d6_ev_ab.get("assistant_turns") == 0
            and _d6_ev_ab.get("bubbles_matched") == 0
            and _d6_ev_ab.get("last_assistant_text_nonempty") is False
            and bool(_d6_vab))
        results.append(
            ("D6 Q3 pin 3: absent log root fails CLOSED (turns:0, "
             "bubbles_matched:0, not-accept) even WITH the .review-ai__log "
             "fallback present — no rescue, no double-count",
             _d6_fallback_no_rescue,
             ["rc=%s ev=%r viol=%s stderr=%s"
              % (_d6_rc_ab,
                 {k: _d6_ev_ab.get(k) for k in (
                     "assistant_turns", "last_assistant_text_nonempty",
                     "turns_completed", "bubbles_matched")},
                 _d6_vab[:2], _d6_err_ab[:200])]))
        # (f2) PIN 3b — advc c10 D1: the fallback claim is pinned on the
        #      SURFACE property, not a false universal. (i) The real
        #      fallback root is a MessageLog surface: ReviewAiPanel.tsx
        #      wraps <MessageLog> in .review-ai__log, and MessageLog.tsx
        #      carries NO chat-log row class — so the assistant set can
        #      never match inside it, and the fallback cannot rescue a
        #      chat-log selector ON THE REAL SURFACES. (ii) The property is
        #      falsifiable: the reviewer's c10 repro — a fallback root that
        #      DID carry a .chat-log-msg--assistant row — counts it
        #      (turns:1), proving the fallback is a root substitution that
        #      grades whatever the fallback root contains. A pin that only
        #      checks "chrome-only fixture -> 0" (the c10 finding: passes
        #      both ways for the stronger claim) is NOT a pin.
        _d6_panel = os.path.join(REPO_ROOT, "app", "src", "ingestion",
                                 "protocol-review", "ReviewAiPanel.tsx")
        _d6_mlog = os.path.join(REPO_ROOT, "app", "src", "event-editor",
                                "right-pane", "ai", "MessageLog.tsx")
        _d6_panel_src = ""
        _d6_mlog_src = ""
        try:
            with open(_d6_panel) as fh:
                _d6_panel_src = fh.read()
        except OSError:
            pass
        try:
            with open(_d6_mlog) as fh:
                _d6_mlog_src = fh.read()
        except OSError:
            pass
        _d6_fallback_surface = (
            bool(_d6_panel_src) and bool(_d6_mlog_src)
            # the fallback root wraps the MessageLog component
            and re.search(
                r'<div className="review-ai__log">\s*<MessageLog\b',
                _d6_panel_src) is not None
            # the MessageLog surface renders its rows as message-log__bubble
            and "message-log__bubble--assistant" in _d6_mlog_src
            and "message-log__bubble--user" in _d6_mlog_src
            # and carries NO chat-log row class anywhere (the reviewer's
            # c10 grep: MessageLog.tsx has no chat-log-intent-card either)
            and "chat-log-msg--assistant" not in _d6_mlog_src
            and "chat-log-intent-card" not in _d6_mlog_src)
        results.append(
            ("D6 Q3 pin 3b: the REAL fallback root (.review-ai__log -> "
             "MessageLog) carries no .chat-log-msg--assistant / "
             ".chat-log-intent-card rows — no chat-log rescue ON THE REAL "
             "SURFACES (advc c10 D1)",
             _d6_fallback_surface,
             ["panel wraps MessageLog in .review-ai__log=%r MessageLog has "
              "message-log rows=%r chat-log classes absent=%r"
              % (bool(re.search(
                      r'<div className="review-ai__log">\s*<MessageLog\b',
                      _d6_panel_src or "")),
                 "message-log__bubble--assistant" in _d6_mlog_src,
                 "chat-log-msg--assistant" not in _d6_mlog_src
                 and "chat-log-intent-card" not in _d6_mlog_src)]))
        _D6_REVIEW_LOG_WITH_ANSWER = (
            '<div class="review-ai__log">'
            '<div class="chat-log-msg chat-log-msg--assistant">'
            "<strong>Assistant</strong>"
            "<p>answer inside review log</p></div></div>")
        _d6_rc_rs, _d6_rec_rs, _d6_err_rs = _d6_drive(
            "rescue", _D6_ROWS_ASSISTANT_ANSWER,
            log_selector=".no-such-log-root",
            review_log=_D6_REVIEW_LOG_WITH_ANSWER)
        _d6_ev_rs = (_d6_rec_rs.get("rendered_evidence") or {})
        results.append(
            ("D6 Q3 pin 3b (falsifiable): a fallback root that DID carry a "
             "chat-log assistant row IS counted (turns>=1) — the fallback "
             "grades whatever the fallback root contains, so the no-rescue "
             "claim holds ONLY on the real MessageLog surface",
             _d6_rc_rs == 0
             and _d6_ev_rs.get("assistant_turns", 0) >= 1
             and _d6_ev_rs.get("bubbles_matched", 0) >= 1,
             ["rc=%s ev=%r stderr=%s"
              % (_d6_rc_rs,
                 {k: _d6_ev_rs.get(k) for k in (
                     "assistant_turns", "bubbles_matched",
                     "last_assistant_text_nonempty")},
                 _d6_err_rs[:200])]))
        # (g) POSITIVE CONTROL (the fix is not over-strict): a real
        #     assistant row with body text, fresh (turns_completed=1),
        #     no error frame -> the probe's own assert.rendered is CLEAN
        #     (rendered-leg green).
        _d6_rc_gc, _d6_rec_gc, _d6_err_gc = _d6_drive(
            "greenctl", _D6_ROWS_ASSISTANT_ANSWER)
        _d6_ev_gc = (_d6_rec_gc.get("rendered_evidence") or {})
        _d6_vgc = rj.check_rendered_assertions(
            _d6_ev_gc, _d6_probe["assert"]["rendered"])
        results.append(
            ("D6 control: a genuine rendered answer passes the probe's "
             "own assert.rendered (fix not over-strict)",
             _d6_rc_gc == 0 and not _d6_rec_gc.get("failure")
             and _d6_ev_gc.get("assistant_turns", 0) >= 1
             and _d6_ev_gc.get("turns_completed", 0) >= 1
             and _d6_ev_gc.get("last_assistant_text_nonempty") is True
             and _d6_ev_gc.get("error_frames", 0) == 0
             and not _d6_vgc,
             ["rc=%s ev=%r viol=%s"
              % (_d6_rc_gc,
                 {k: _d6_ev_gc.get(k) for k in (
                     "assistant_turns", "last_assistant_text_nonempty",
                     "turns_completed", "bubbles_matched",
                     "error_frames")},
                 _d6_vgc[:2])]))
        # (h) Q4 umbrella on the RECEIPTS: every D6 receipt's
        #     rendered_evidence carries the selector-proof TRIPLE
        #     (assistant_turns, last_assistant_text_nonempty,
        #     turns_completed) AND bubbles_matched (the number of bubbles
        #     actually matched).
        _d6_triple = ("assistant_turns", "last_assistant_text_nonempty",
                      "turns_completed", "bubbles_matched")
        _d6_umb = all(
            all(k in ev for k in _d6_triple)
            and isinstance(ev.get("bubbles_matched"), int)
            for ev in (_d6_ev_uo, _d6_ev_ea, _d6_ev_ab, _d6_ev_gc))
        results.append(
            ("D6 Q4 umbrella: every receipt's rendered_evidence carries "
             "the selector-proof triple + bubbles_matched",
             _d6_umb,
             ["keys=%r" % (
                 {_name: (set(_d6_ev) & set(_d6_triple) == set(_d6_triple))
                  for _name, _d6_ev in (
                      ("uonly", _d6_ev_uo), ("eassist", _d6_ev_ea),
                      ("absroot", _d6_ev_ab), ("green", _d6_ev_gc))},
             )]))
        # (i) THE grader-bug regression, demonstrated RED against the BASE
        #     (96b3d8d4) selector set. The revert is a faithful RE-DRIVE of
        #     the base commit's OWN driver file (git show) against the
        #     SAME rendered-answer fixture the fixed driver grades green:
        #     the base set (.chat-log__bubble / .message-log__bubble /
        #     .chat-log-intent-card) matches ZERO rows on the current
        #     ChatLog DOM (ChatLog.tsx:399-403 renders
        #     chat-log-msg--*), so the base grades turns:0 while the fixed
        #     driver counts the rendered answer — the fix is what changed
        #     the grade. (Stated revert-and-restore: the base file is
        #     materialised to a throwaway copy under /tmp, driven, and
        #     deleted; the worktree file is never modified, so there is
        #     nothing to restore — but the demonstration IS a revert of the
        #     selector set.)
        _d6_git_show = subprocess.run(
            ["git", "-C", REPO_ROOT, "show", "96b3d8d4:"
             ".hermes/plans/harness/l2-trunk-journeys/ui-drive.cjs"],
            capture_output=True, text=True)
        _d6_base_src = _d6_git_show.stdout if _d6_git_show.returncode == 0 \
            else ""
        _d6_base_set_line = next(
            (ln for ln in _d6_base_src.splitlines()
             if "const bubbles" in ln and "querySelectorAll" in ln), "")
        results.append(
            ("D6 RED-against-revert: the base selector set is still "
             "wired (git show 96b3d8d4 selector line differs ONLY in the "
             "selector tokens from the fixed line)",
             bool(_d6_base_set_line)
             and _d6_base_src != _d6_src
             and ".chat-log__bubble" in _d6_base_set_line
             and ".message-log__bubble" in _d6_base_set_line
             and ".chat-log-msg--assistant" not in _d6_base_set_line
             and ".chat-log-msg--assistant" in _d6_src,
             ["base set line=%r" % (_d6_base_set_line.strip()[:120],)]))
        if _d6_base_src and _d6_base_set_line:
            td6r = tempfile.mkdtemp(prefix="sc-d6-rev-")
            try:
                _d6_rev_probe = os.path.join(td6r, "ui-drive-rev.cjs")
                with open(_d6_rev_probe, "w") as fh:
                    fh.write(_d6_base_src)
                fixr = os.path.join(td6r, "fixture.html")
                with open(fixr, "w") as fh:
                    fh.write("<!doctype html><html><body>\n"
                             "<div aria-label=\"Conversation\" "
                             "class=\"sequence-chat-messages\">\n"
                             "<div class=\"chat-log-msg "
                             "chat-log-msg--assistant\"><strong>"
                             "Assistant</strong>"
                             "<p>here is the rendered answer</p></div>\n"
                             "</div>\n</body></html>\n")
                jpr = os.path.join(td6r, "D6-rev.yaml")
                with open(jpr, "w") as fh:
                    fh.write("id: D6-rev\ntimeout_s: 30\n"
                             "log_selector: '[aria-label=\"Conversation\"]'\n"
                             "steps:\n  - step: goto\n    path: %s\n" % fixr)
                opr = os.path.join(td6r, "D6-rev-ui.json")
                os.symlink(_D6_NM, os.path.join(td6r, "node_modules"))
                _d6_pr = subprocess.run(
                    ["node", _d6_rev_probe, "--journey", jpr,
                     "--out", opr, "--app-base", "file://"],
                    cwd=APP_DIR, capture_output=True, text=True,
                    timeout=180)
                try:
                    _d6_rrec = json.load(open(opr))
                except Exception:
                    _d6_rrec = {"_unreadable": True}
                _d6_rev_ev = (_d6_rrec.get("rendered_evidence") or {})
                results.append(
                    ("D6 RED-against-revert: the BASE set grades the "
                     "rendered assistant answer turns:0 (the proven "
                     "grader bug) while the fixed set counts it",
                     _d6_pr.returncode == 0
                     and _d6_rev_ev.get("assistant_turns") == 0
                     and _d6_rev_ev.get("last_assistant_text_nonempty")
                     is False
                     and _d6_ev_gc.get("assistant_turns", 0) >= 1,
                     ["base ev=%r fixed assistant_turns=%r"
                      % ({k: _d6_rev_ev.get(k) for k in (
                          "assistant_turns",
                          "last_assistant_text_nonempty")},
                         _d6_ev_gc.get("assistant_turns"))]))
            finally:
                try:
                    os.unlink(os.path.join(td6r, "node_modules"))
                except OSError:
                    pass
                shutil.rmtree(td6r, ignore_errors=True)
        # (j) A-LEG data pass-through: the builder READS the inventory
        #     row's answer_selector DATA (by id — never a branch) and
        #     injects it as the probe's log_selector; every inventory
        #     row carries the field; an explicit override is respected.
        _d6_inv = yaml.safe_load(open(rj.CHAT_HOSTS_INVENTORY)) or {}
        _d6_rows = _d6_inv.get("hosts") or []
        _d6_sel_all = [h.get("answer_selector") for h in _d6_rows]
        _d6_p = rj.build_chat_host_probe(
            "artifact-host", "analysis", "/artifact/x/CHATHOST-PROBE")
        results.append(
            ("D6 A-leg: builder injects the inventory answer_selector "
             "DATA as log_selector (data lookup, no per-host branch)",
             len(_d6_rows) == 6
             and all(s == '[aria-label="Conversation"]' for s in _d6_sel_all)
             and _d6_p.get("log_selector") == '[aria-label="Conversation"]',
             ["rows=%d selectors=%r probe.log_selector=%r"
              % (len(_d6_rows), set(_d6_sel_all),
                 _d6_p.get("log_selector"))]))
        _d6_ov = rj.build_chat_host_probe(
            "artifact-host", "analysis", "/artifact/x/CHATHOST-PROBE",
            answer_selector="[data-testid='custom-log']")
        results.append(
            ("D6 A-leg: an explicit answer_selector override is respected "
             "(the pin arms' model of a row lacking the field)",
             _d6_ov.get("log_selector") == "[data-testid='custom-log']",
             ["override log_selector=%r" % (_d6_ov.get("log_selector"),)]))
        # (k) CHATHOST-CONSOLIDATE-1 PIN: the `alert_texts` CAPTURE line.
        #     (k1) POSITIVE — drive the REAL driver against a file:// fixture
        #          that renders TWO role="alert" nodes; the receipt's
        #          rendered_evidence.alert_texts must SHOW both texts (the
        #          ruling's exact expression, each truncated to 300 chars),
        #          proving the capture lands in rendered_evidence (NOT just
        #          error_frames' count).
        #     (k2) RED-against-revert (the PINS mutation arm) — a /tmp COPY of
        #          ui-drive.cjs with the alert_texts CAPTURE line reverted
        #          (deleted) is driven against the SAME fixture: alert_texts
        #          is then ABSENT from rendered_evidence while error_frames'
        #          count is UNCHANGED (the mutation is scoped to the capture
        #          line, not the count). Reverting the line flips the arm
        #          RED — the capture line is what produces the field.
        _ALT_ONE = ("role=alert one: could not place that subject in "
                    "server-known time")
        _ALT_TWO = "role=alert two: agent-action envelope rejected by the schema"
        _ALT_FIXTURE = ("<!doctype html><html><body>\n"
                        "<div aria-label=\"Conversation\" "
                        "class=\"sequence-chat-messages\">\n"
                        "<div class=\"chat-log-msg "
                        "chat-log-msg--assistant\"><strong>Assistant</strong>"
                        "<p>here is the rendered answer</p></div>\n"
                        "</div>\n"
                        "<div role=\"alert\">%s</div>\n"
                        "<div role=\"alert\">%s</div>\n"
                        "</body></html>\n" % (_ALT_ONE, _ALT_TWO))

        def _alt_drive(driver_src, tag):
            _tda = tempfile.mkdtemp(prefix="sc-alt-%s-" % tag)
            try:
                _fixa = os.path.join(_tda, "fixture.html")
                with open(_fixa, "w") as fh:
                    fh.write(_ALT_FIXTURE)
                _dpa = os.path.join(_tda, "ui-drive-%s.cjs" % tag)
                with open(_dpa, "w") as fh:
                    fh.write(driver_src)
                _jpa = os.path.join(_tda, "ALT-%s.yaml" % tag)
                with open(_jpa, "w") as fh:
                    fh.write("id: ALT-%s\ntimeout_s: 30\n"
                             "log_selector: '[aria-label=\"Conversation\"]'\n"
                             "steps:\n  - step: goto\n    path: %s\n"
                             % (tag, _fixa))
                _opa = os.path.join(_tda, "ALT-%s-ui.json" % tag)
                os.symlink(_D6_NM, os.path.join(_tda, "node_modules"))
                _pra = subprocess.run(
                    ["node", _dpa, "--journey", _jpa, "--out", _opa,
                     "--app-base", "file://"],
                    cwd=APP_DIR, capture_output=True, text=True, timeout=180)
                try:
                    _rea = json.load(open(_opa))
                except Exception:
                    _rea = {"_unreadable": True}
                return _pra, (_rea.get("rendered_evidence") or {})
            finally:
                try:
                    os.unlink(os.path.join(_tda, "node_modules"))
                except OSError:
                    pass
                shutil.rmtree(_tda, ignore_errors=True)

        _alt_real_p, _alt_real_ev = _alt_drive(_d6_src, "real")
        _alt_real_texts = _alt_real_ev.get("alert_texts")
        results.append(
            ("CHATHOST-CONSOLIDATE-1 PIN: alert_texts SHOWS the texts for a "
             "two-alert DOM (capture rides rendered_evidence)",
             _alt_real_p.returncode == 0
             and isinstance(_alt_real_texts, list)
             and len(_alt_real_texts) == 2
             and _alt_real_texts[0] == _ALT_ONE[:300]
             and _alt_real_texts[1] == _ALT_TWO[:300]
             and _alt_real_ev.get("error_frames") == 2,
             ["real alert_texts=%r error_frames=%r"
              % (_alt_real_texts, _alt_real_ev.get("error_frames"))]))
        # the /tmp MUTATION: revert (REVERT) the alert_texts capture — the
        # whole multi-line `evidence.alert_texts = await page.evaluate(...)
        # .catch(() => []);` statement is deleted from a /tmp copy (removing
        # only the first line would leave a dangling arrow-expression and
        # break the file's syntax; the revert must be the PRE-feature driver:
        # no alert_texts field at all, everything else identical). The
        # mutation spans from the line carrying `evidence.alert_texts`
        # through the line that closes the statement (`.catch(() => []);`).
        # advc c12 D3: removal detection must be INDEPENDENT of the source's
        # trailing newline. The pre-fix `_alt_mut_src != _d6_src` was TRUE even
        # when NO line was removed (_d6_src ends with "\n"; splitlines() +
        # join() drops it), so the NO-OP branch below never fired and the arm
        # drove a copy identical to the source — vacuously green when the
        # capture block is absent. Detection now = the skip loop actually
        # consumed a line.
        _alt_lines = _d6_src.splitlines()
        _alt_mut_lines = []
        _alt_skip = False
        _alt_skipped_any = False
        for _alt_ln in _alt_lines:
            if "evidence.alert_texts" in _alt_ln:
                _alt_skip = True
                _alt_skipped_any = True
                continue
            if _alt_skip:
                if ")).catch(() => []);" in _alt_ln:
                    _alt_skip = False
                _alt_skipped_any = True
                continue
            _alt_mut_lines.append(_alt_ln)
        _alt_mut_src = "\n".join(_alt_mut_lines)
        _alt_mut_removed = _alt_skipped_any
        if _alt_mut_removed:
            _alt_mut_p, _alt_mut_ev = _alt_drive(_alt_mut_src, "mut")
            _alt_mut_ok = (_alt_mut_removed
                           and _alt_mut_p.returncode == 0
                           and "alert_texts" not in _alt_mut_ev
                           and _alt_mut_ev.get("error_frames") == 2)
            _alt_mut_note = ("mutated ev has alert_texts=%r error_frames=%r "
                             "(count untouched, capture gone)"
                             % (_alt_mut_ev.get("alert_texts"),
                                _alt_mut_ev.get("error_frames")))
        else:
            _alt_mut_ok = False
            _alt_mut_note = "mutation was a NO-OP (capture line not found — " \
                            "the line moved; re-point the mutation)"
        results.append(
            ("CHATHOST-CONSOLIDATE-1 PIN: REVERTING the alert_texts capture "
             "line (a /tmp copy) makes the receipt's rendered_evidence lose "
             "alert_texts (mutation RED) while error_frames is unchanged",
             _alt_mut_ok, [_alt_mut_note]))
    except Exception as _d6_e:
        results.append(("D6 Q3/Q4 pins (self-check)", False,
                        ["err=%s" % _d6_e]))

    # ---- (T5) CHATHOST-CONSOLIDATE-1 FIX2 (advc c8 D-1): probe side-record
    # teardown HONESTY — `_delete_probe_side_records` must report
    # acl_clean = False when the ACL GET returns ANY non-200 status except
    # 404: 403/500 (server errors) and -1 (transport error) mean the record
    # may STILL EXIST and the read merely failed — an unobserved absence is
    # not clean. ONLY 404 proves the record absent. Drives the driver's OWN
    # function over a stubbed `_api` (no server contact — the existing
    # self-check style); the stub is restored in `finally`.
    try:
        _d1_journey = {"seed": {"record": {
            "recordId": "CHATHOST-PROBE",
            # studyId absent -> the filesystem sidecar arm is skipped, so
            # these arms isolate the ACL branch.
            "payload": {}}}}
        _d1_orig_api = rj._api

        def _d1_stub_factory(get_status, delete_status=200,
                             ref_rid="CHATHOST-PROBE"):
            def _stub(api_base, method, path, body=None, timeout=30,
                      user_id="USR-BRAD"):
                if method == "GET" and path.startswith("/api/records/ACL-"):
                    if get_status == 404:
                        return 404, {}
                    return get_status, {"record": {"payload": {
                        "resourceRef": {"id": ref_rid}}}}
                if method == "DELETE":
                    return delete_status, {}
                return 200, {}
            return _stub
        try:
            # 403 (server error) -> NOT observed absent -> acl_clean False
            # (pre-fix this branch set acl_clean = True for EVERY non-200).
            rj._api = _d1_stub_factory(403)
            _d1_a403 = rj._delete_probe_side_records(_d1_journey, "http://stub")
            # 500 -> likewise NOT observed absent -> False.
            rj._api = _d1_stub_factory(500)
            _d1_a500 = rj._delete_probe_side_records(_d1_journey, "http://stub")
            # -1 (transport error: the record may still exist) -> False.
            rj._api = _d1_stub_factory(-1)
            _d1_aneg1 = rj._delete_probe_side_records(_d1_journey, "http://stub")
            # 404 -> ABSENT is legitimately clean -> True.
            rj._api = _d1_stub_factory(404)
            _d1_a404 = rj._delete_probe_side_records(_d1_journey, "http://stub")
            # 200 + matching resourceRef + DELETE 200 -> removed -> True.
            rj._api = _d1_stub_factory(200, delete_status=200,
                                       ref_rid="CHATHOST-PROBE")
            _d1_a200 = rj._delete_probe_side_records(_d1_journey, "http://stub")
            # 200 + FOREIGN resourceRef -> refused (pre-existing contract).
            rj._api = _d1_stub_factory(200, delete_status=200,
                                       ref_rid="OTHER-REC")
            _d1_af = rj._delete_probe_side_records(_d1_journey, "http://stub")
        finally:
            rj._api = _d1_orig_api
        results.append(("FIX2 D-1 (advc c8): ACL GET 403 -> acl_clean False + note names 403 (not observed absent)",
                        _d1_a403[0] is False
                        and any("403" in n and "NOT observed absent" in n
                                for n in _d1_a403[2]),
                        ["acl_clean=%r notes=%r" % (_d1_a403[0], _d1_a403[2])]))
        results.append(("FIX2 D-1 (advc c8): ACL GET 500 -> acl_clean False + note names 500",
                        _d1_a500[0] is False
                        and any("500" in n and "NOT observed absent" in n
                                for n in _d1_a500[2]),
                        ["acl_clean=%r notes=%r" % (_d1_a500[0], _d1_a500[2])]))
        results.append(("FIX2 D-1 (advc c8): ACL GET -1 (transport error) -> acl_clean False + note names -1",
                        _d1_aneg1[0] is False
                        and any("-1" in n and "NOT observed absent" in n
                                for n in _d1_aneg1[2]),
                        ["acl_clean=%r notes=%r" % (_d1_aneg1[0], _d1_aneg1[2])]))
        results.append(("FIX2 D-1 (advc c8): ACL GET 404 -> acl_clean True (absent IS legitimately clean)",
                        _d1_a404[0] is True
                        and any("absent" in n and "404" in n for n in _d1_a404[2]),
                        ["acl_clean=%r notes=%r" % (_d1_a404[0], _d1_a404[2])]))
        results.append(("FIX2 D-1 (advc c8): ACL GET 200 + matching resourceRef + DELETE 200 -> acl_clean True (removed)",
                        _d1_a200[0] is True
                        and any("removed" in n for n in _d1_a200[2]),
                        ["acl_clean=%r notes=%r" % (_d1_a200[0], _d1_a200[2])]))
        results.append(("FIX2 D-1 (advc c8): ACL GET 200 + FOREIGN resourceRef -> acl_clean False (refused to touch)",
                        _d1_af[0] is False
                        and any("refused" in n for n in _d1_af[2]),
                        ["acl_clean=%r notes=%r" % (_d1_af[0], _d1_af[2])]))
    except Exception as _e:
        results.append(("FIX2 D-1 (advc c8): _delete_probe_side_records stubbed _api arms",
                        False, ["err=%s" % _e]))

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
