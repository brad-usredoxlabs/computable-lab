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
        full_accept = {h: "accept" for h in inv_ids}
        dropped = inv_ids[0]                 # drop the FIRST host (deterministic)
        subset = {h: "accept" for h in inv_ids if h != dropped}
        # (7a) the FULL inventory, every host accept -> the pure grader is ok.
        ok_a, miss_a, na_a, und_a = cg.grade_chat_host_sweep(full_accept, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: the FULL inventory all-accept -> ok (non-vacuous)",
                        ok_a and not miss_a and not na_a and not und_a,
                        ["ok=%r miss=%r na=%r und=%r" % (ok_a, miss_a, na_a, und_a)]))
        # (7b) THE RED CASE: a STRICT SUBSET (one host dropped) -> NOT ok,
        # names the missing host. This is the spec's pinned non-vacuous RED.
        ok_b, miss_b, na_b, und_b = cg.grade_chat_host_sweep(subset, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: a STRICT-SUBSET table (dropped %r) -> RED, names the host" % dropped,
                        (not ok_b) and miss_b == [dropped],
                        ["ok=%r miss=%r" % (ok_b, miss_b)]))
        # (7c) a present-but-not-accept verdict -> NOT ok, names the host.
        na_verdicts = dict(full_accept, **{dropped: "red"})
        ok_c, miss_c, na_c, und_c = cg.grade_chat_host_sweep(na_verdicts, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: a not-accept verdict -> RED, names the host",
                        (not ok_c) and na_c == [dropped],
                        ["ok=%r na=%r" % (ok_c, na_c)]))
        # (7d) an UNDECLARED host in the table (tamper evidence) -> NOT ok.
        und_verdicts = dict(full_accept, **{"BOGUS-HOST": "accept"})
        ok_d, miss_d, na_d, und_d = cg.grade_chat_host_sweep(und_verdicts, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: an UNDECLARED host -> RED (N5 exact-set)",
                        (not ok_d) and und_d == ["BOGUS-HOST"],
                        ["ok=%r und=%r" % (ok_d, und_d)]))
        # (7h) fix1 D3: the four-way 'analysis' surface collision is NOT an
        # alias (one key cannot stand for four hosts). A verdict table keyed
        # by DISTINCT surface values is therefore a strict subset (missing the
        # analysis hosts) + undeclared 'analysis' -> RED.
        amap = cg.alias_map(inv_ids, inv_surfaces)
        analysis_hosts = sorted(h for h, s in zip(inv_ids, inv_surfaces)
                                if s == "analysis")
        distinct_surfs = sorted(set(inv_surfaces))
        surf_keyed = {s: "accept" for s in distinct_surfs}
        ok_s, miss_s, na_s, und_s = cg.grade_chat_host_sweep(
            surf_keyed, inv_ids, inv_surfaces)
        results.append(("CHATHOST grader: a table keyed by DISTINCT surface values (the four-way 'analysis' collision) -> RED, fail-closed (fix1 D3)",
                        (not ok_s) and miss_s == analysis_hosts
                        and "analysis" in und_s and "analysis" not in amap,
                        ["ok=%r miss=%r und=%r" % (ok_s, miss_s, und_s)]))
        # (7e) Drive THE ACTUAL gate (check-gate.py --chat-hosts) against a
        # synthetic sweep run: the full table exits 0, the dropped-host table
        # exits non-zero and names the host. This is the "checker exits
        # non-zero" pin (non-vacuous — real check-gate, real inventory).
        with tempfile.TemporaryDirectory() as td_ch:
            run_dir = os.path.join(td_ch, "20261102T000000Z")
            os.makedirs(run_dir)
            with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
                json.dump({"chat_host_verdicts": full_accept}, fh)
            os.symlink(run_dir, os.path.join(td_ch, "latest"))
            env_ch = dict(os.environ, CL_RECEIPTS=td_ch,
                          CL_CHAT_HOSTS=inv_path, CL_CHAT_HOSTS_MANIFEST=man_path)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                "--chat-hosts"], capture_output=True, text=True,
                               env=env_ch)
            results.append(("CHATHOST gate: a FULL-inventory sweep run exits 0 (green)",
                            p.returncode == 0 and "GATE-VERDICT green" in p.stdout,
                            ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
            # THE RED pin: drop one host from the verdict fixture -> exit != 0.
            with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
                json.dump({"chat_host_verdicts": subset}, fh)
            p = subprocess.run([sys.executable, os.path.join(HERE, "check-gate.py"),
                                "--chat-hosts"], capture_output=True, text=True,
                               env=env_ch)
            results.append(("CHATHOST gate: a DROPPED-HOST (strict-subset) verdict exits non-zero + names the host",
                            p.returncode == 1 and "STRICT SUBSET" in p.stdout
                            and dropped in p.stdout,
                            ["rc=%d out=%s" % (p.returncode, p.stdout.strip()[:160])]))
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
            # (7g) a shrink WITHOUT a re-bless (the manifest still carries the
            # full 6-host blessed sha) is RED even when driven through the
            # gate. The shrunk inventory carries the `surface` field (D3), so
            # ONLY the shrink-guard can turn this red — proves the guard is
            # the authority, not the verdict table.
            with tempfile.TemporaryDirectory() as td_sh:
                shrunk_inv = os.path.join(td_sh, "shrunk.yaml")
                sh_hosts = [{"id": h, "surface": inv_surfaces[inv_ids.index(h)]}
                            for h in shrunk]
                with open(shrunk_inv, "w") as fh:
                    yaml.safe_dump({"hosts": sh_hosts}, fh)
                run_dir2 = os.path.join(td_sh, "20261102T000001Z")
                os.makedirs(run_dir2)
                # the sweep table itself is complete for the (shrunk) set, so
                # ONLY the shrink-guard can turn this red.
                with open(os.path.join(run_dir2, "run-meta.json"), "w") as fh:
                    json.dump({"app_base": "http://localhost:5193",
                               "chat_host_verdicts":
                               {h: "accept" for h in shrunk}}, fh)
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
