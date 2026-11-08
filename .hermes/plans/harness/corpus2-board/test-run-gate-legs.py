#!/usr/bin/env python3
"""Tests for run-gate-legs.py — RED before wrapper exists, GREEN after."""
import importlib.util
import json
import os
import sys
import tempfile

# Load run-gate-legs.py (has dashes in name)
_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location(
    "run_gate_legs", os.path.join(_HERE, "run-gate-legs.py"))
assert _SPEC is not None, "run-gate-legs.py spec not found"
mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(mod)

PASS = 0
FAIL = 0


def assert_true(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        print(f"FAIL: {msg}")


# ── T1: plan returns exactly 7 steps in order ──
def test_plan_order():
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        os.makedirs(os.path.join(drv, "drivers"), exist_ok=True)
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                assert_true(len(steps) == 7,
                            f"expected 7 steps, got {len(steps)}")
                names = [s["name"] for s in steps]
                expected = ["seed-board", "verify-board",
                            "workspace-reset", "verify-workspace",
                            "legAB", "leg3", "leg4"]
                assert_true(names == expected,
                            f"plan order {names} != {expected}")
                # seed/verify/workspace steps use sys.executable
                for i in range(min(4, len(steps))):
                    assert_true(steps[i]["argv"][0] == sys.executable,
                                f"step {i} argv[0] should be sys.executable")
                # no shell=True anywhere (plan doesn't use shell)
                # leg steps use node
                for i in range(min(4, len(steps)), len(steps)):
                    assert_true(steps[i]["argv"][0] == "node",
                                f"step {i} argv[0] should be 'node'")


# ── T2: fail-closed on reset failure ──
def test_fail_closed_reset():
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                invocations = []
                def fake_runner(*a, **kw):
                    invocations.append(kw)
                    class R:
                        returncode = 1
                        stdout = ""
                        stderr = "workspace PUT failed"
                    return R
                rc = mod.run(steps, runner=fake_runner)
                assert_true(rc == 1, f"expected rc=1 on reset fail, got {rc}")
                assert_true(len(invocations) == 1,
                            f"expected 1 invocation on fail, got {len(invocations)}")


# ── T3: fail-closed on undeclared tab ──
def test_fail_closed_undeclared():
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                invocations = []
                call_count = [0]
                def fake_runner(*a, **kw):
                    call_count[0] += 1
                    invocations.append(kw)
                    class R:
                        returncode = 0
                        if call_count[0] == 4:
                            # verify-workspace: stdout missing "all declared"
                            stdout = "workspace: UNDECLARED tab id=legacy-tab"
                        else:
                            stdout = "ok"
                        stderr = ""
                    return R
                rc = mod.run(steps, runner=fake_runner)
                assert_true(rc == 1,
                            f"expected rc=1 on undeclared, got {rc}")
                assert_true(len(invocations) == 4,
                            f"expected 4 invocations, got {len(invocations)}")
                # T3b: mutation-proof — when rc=0 but stderr contains UNDECLARED
                invocations2 = []
                call_count2 = [0]
                def fake_runner2(*a, **kw):
                    call_count2[0] += 1
                    invocations2.append(kw)
                    class R:
                        returncode = 0
                        if call_count2[0] == 4:
                            stdout = "workspace: 2 tabs"
                            stderr = "workspace: UNDECLARED tab id=x"
                        else:
                            stdout = "ok"
                            stderr = ""
                    return R
                rc2 = mod.run(steps, runner=fake_runner2)
                assert_true(rc2 == 1,
                            f"expected rc=1 on UNDECLARED in stderr, got {rc2}")
                assert_true(len(invocations2) == 4,
                            f"expected 4 invocations (stderr UNDECLARED), "
                            f"got {len(invocations2)}")


# ── T4: fail-closed on seed-board failure — BEFORE any leg ──
def test_fail_closed_seed():
    """Prove that a seed failure stops execution before any leg runs."""
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                argvs = []
                def fake_runner(argv, **kw):
                    argvs.append(argv)
                    class R:
                        returncode = 1
                        stdout = ""
                        stderr = "seed failed"
                    return R
                rc = mod.run(steps, runner=fake_runner)
                assert_true(rc == 1, f"expected rc=1 on seed fail, got {rc}")
                assert_true(len(argvs) == 1,
                            f"expected 1 invocation (seed-board only), "
                            f"got {len(argvs)}")
                # Verify no leg command was executed
                leg_executed = any("leg" in str(a) for a in argvs)
                assert_true(not leg_executed,
                            "a leg command ran despite seed failure")


# ── T5: all green — 7 steps run in order with RECEIPT_DIR ──
def test_all_green():
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                invocations = []
                call_num = [0]
                def fake_runner(*a, **kw):
                    call_num[0] += 1
                    invocations.append(kw)
                    class R:
                        returncode = 0
                        if call_num[0] == 4:
                            stdout = "workspace: 2 tabs, activeTabId=abc — all declared"
                        else:
                            stdout = "ok"
                        stderr = ""
                    return R
                rc = mod.run(steps, runner=fake_runner)
                assert_true(rc == 0, f"expected rc=0 all green, got {rc}")
                assert_true(len(invocations) == 7,
                            f"expected 7 invocations, got {len(invocations)}")
                # leg steps (5,6,7) must have RECEIPT_DIR
                last_leg_inv = invocations[6]
                for i in range(4, 7):
                    env = invocations[i].get("env", {})
                    assert_true(
                        "RECEIPT_DIR" in env,
                        f"step {i} missing RECEIPT_DIR in env")
                assert_true(last_leg_inv["env"]["RECEIPT_DIR"] == rec,
                            f"step {last_leg_inv.get('env', {}).keys()} RECEIPT_DIR mismatch")
                # leg order: legAB, leg3, leg4
                leg_names = [s["name"] for s in steps[4:7]]
                assert_true(leg_names == ["legAB", "leg3", "leg4"],
                            f"leg order {leg_names} != expected")


# ── T6: usage error — missing --drivers → exit 2 ──
def test_usage_missing_drivers():
    import subprocess
    # Run the module as a script with --dry-run but no --drivers
    result = subprocess.run(
        [sys.executable, os.path.join(_HERE, "run-gate-legs.py"),
         "--dry-run", "--receipt-dir", "/tmp/x"],
        capture_output=True, text=True)
    assert_true(result.returncode == 2,
                f"expected exit 2 missing drivers, got {result.returncode}")


if __name__ == "__main__":
    test_plan_order()
    test_fail_closed_reset()
    test_fail_closed_undeclared()
    test_fail_closed_seed()
    test_all_green()
    test_usage_missing_drivers()
    print(f"{PASS} passed")
    if FAIL:
        print(f"{FAIL} failures")
        sys.exit(1)
