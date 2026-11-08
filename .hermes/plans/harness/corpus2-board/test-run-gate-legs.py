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

# Load board-gate.py for assertion tests
_BG_SPEC = importlib.util.spec_from_file_location(
    "board_gate", os.path.join(_HERE, "board-gate.py"))
assert _BG_SPEC is not None, "board-gate.py spec not found"
bg_mod = importlib.util.module_from_spec(_BG_SPEC)
_BG_SPEC.loader.exec_module(bg_mod)

PASS = 0
FAIL = 0


def assert_true(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        print(f"FAIL: {msg}")


# ── T1: plan returns exactly 9 steps in order ──
def test_plan_order():
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        os.makedirs(os.path.join(drv, "drivers"), exist_ok=True)
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                assert_true(len(steps) == 9,
                            f"expected 9 steps, got {len(steps)}")
                names = [s["name"] for s in steps]
                expected = ["seed-board", "verify-board", "reset-board",
                            "board-gate", "workspace-reset", "verify-workspace",
                            "legAB", "leg3", "leg4"]
                assert_true(names == expected,
                            f"plan order {names} != {expected}")
                # seed/verify/reset/board-gate/workspace steps use sys.executable
                for i in range(min(6, len(steps))):
                    assert_true(steps[i]["argv"][0] == sys.executable,
                                f"step {i} argv[0] should be sys.executable")
                # no shell=True anywhere (plan doesn't use shell)
                # leg steps use node
                for i in range(min(6, len(steps)), len(steps)):
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
                        if call_count[0] == 6:
                            # verify-workspace: stdout missing "all declared"
                            stdout = "workspace: UNDECLARED tab id=legacy-tab"
                        else:
                            stdout = "ok"
                        stderr = ""
                    return R
                rc = mod.run(steps, runner=fake_runner)
                assert_true(rc == 1,
                            f"expected rc=1 on undeclared, got {rc}")
                assert_true(len(invocations) == 6,
                            f"expected 6 invocations, got {len(invocations)}")
                # T3b: mutation-proof — when rc=0 but stderr contains UNDECLARED
                invocations2 = []
                call_count2 = [0]
                def fake_runner2(*a, **kw):
                    call_count2[0] += 1
                    invocations2.append(kw)
                    class R:
                        returncode = 0
                        if call_count2[0] == 6:
                            stdout = "workspace: 2 tabs"
                            stderr = "workspace: UNDECLARED tab id=x"
                        else:
                            stdout = "ok"
                            stderr = ""
                    return R
                rc2 = mod.run(steps, runner=fake_runner2)
                assert_true(rc2 == 1,
                            f"expected rc=1 on UNDECLARED in stderr, got {rc2}")
                assert_true(len(invocations2) == 6,
                            f"expected 6 invocations (stderr UNDECLARED), "
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


# ── T5: all green — 9 steps run in order with RECEIPT_DIR ──
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
                        if call_num[0] == 6:
                            stdout = "workspace: 2 tabs, activeTabId=abc — all declared"
                        else:
                            stdout = "ok"
                        stderr = ""
                    return R
                rc = mod.run(steps, runner=fake_runner)
                assert_true(rc == 0, f"expected rc=0 all green, got {rc}")
                assert_true(len(invocations) == 9,
                            f"expected 9 invocations, got {len(invocations)}")
                # leg steps (indices 6,7,8) must have RECEIPT_DIR
                last_leg_inv = invocations[8]
                for i in range(6, 9):
                    env = invocations[i].get("env", {})
                    assert_true(
                        "RECEIPT_DIR" in env,
                        f"step {i} missing RECEIPT_DIR in env")
                assert_true(last_leg_inv["env"]["RECEIPT_DIR"] == rec,
                            f"step {last_leg_inv.get('env', {}).keys()} RECEIPT_DIR mismatch")
                # leg order: legAB, leg3, leg4
                leg_names = [s["name"] for s in steps[6:9]]
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


# ── T7: board-gate assertion rejects wrong volume ──
def test_board_gate_rejects_wrong_volume():
    """assert_e2 must reject a probe payload with wrong volume."""
    expect = {"volume_uL": 100, "material": "Thermo DMEM", "rows": 1, "events": 1}
    # Mutated: volume is 200 instead of 100
    probe = {
        "well": "E2",
        "tipVolume": "200.0 \u00b5L",
        "tipRows": [{"name": "Thermo DMEM", "conc": "\u2014", "vol": "200.0 \u00b5L"}],
        "tipMeta": "1 event applied"
    }
    failures = bg_mod.assert_e2(probe, expect)
    assert_true(len(failures) >= 1,
                f"expected failures for wrong volume, got {failures}")
    has_vol = any("volume" in f for f in failures)
    assert_true(has_vol,
                f"expected volume failure in {failures}")


# ── T8: board-gate assertion rejects wrong event count ──
def test_board_gate_rejects_wrong_events():
    """assert_e2 must reject a probe payload with wrong event count."""
    expect = {"volume_uL": 100, "material": "Thermo DMEM", "rows": 1, "events": 1}
    probe = {
        "well": "E2",
        "tipVolume": "100.0 \u00b5L",
        "tipRows": [{"name": "Thermo DMEM", "conc": "\u2014", "vol": "100.0 \u00b5L"}],
        "tipMeta": "2 events applied"
    }
    failures = bg_mod.assert_e2(probe, expect)
    assert_true(len(failures) >= 1,
                f"expected failures for wrong events, got {failures}")
    has_evt = any("event" in f for f in failures)
    assert_true(has_evt,
                f"expected event failure in {failures}")


# ── T9: board-gate assertion accepts correct payload ──
def test_board_gate_accepts_correct():
    """assert_e2 must return empty failures for the correct payload."""
    expect = {"volume_uL": 100, "material": "Thermo DMEM", "rows": 1, "events": 1}
    probe = {
        "well": "E2",
        "tipVolume": "100.0 \u00b5L",
        "tipRows": [{"name": "Thermo DMEM", "conc": "\u2014", "vol": "100.0 \u00b5L"}],
        "tipMeta": "1 event applied"
    }
    failures = bg_mod.assert_e2(probe, expect)
    assert_true(len(failures) == 0,
                f"expected no failures for correct payload, got {failures}")


# ── T10: board-gate step exists in plan at position 3 ──
def test_board_gate_step_in_plan():
    """The board-gate step must be a sys.executable call to board-gate.py."""
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        os.makedirs(os.path.join(drv, "drivers"), exist_ok=True)
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                bg_step = steps[3]
                assert_true(bg_step["name"] == "board-gate",
                            f"step 3 name is {bg_step['name']}, expected board-gate")
                assert_true(bg_step["argv"][0] == sys.executable,
                            "board-gate step argv[0] should be sys.executable")
                # argv[1] should be the board-gate.py script
                assert_true("board-gate.py" in bg_step["argv"][1],
                            f"board-gate step should invoke board-gate.py: {bg_step['argv']}")


# ── T11: reset-board step exists in plan at position 2 ──
def test_reset_board_step_in_plan():
    """The reset-board step must invoke seed-board.py --reset."""
    seed = os.path.join(_HERE, "seed-board.py")
    with tempfile.TemporaryDirectory() as drv:
        os.makedirs(os.path.join(drv, "drivers"), exist_ok=True)
        with tempfile.TemporaryDirectory() as rec:
            with tempfile.TemporaryDirectory() as tmp:
                steps = mod.plan(seed, os.path.join(drv, "drivers"),
                                 "http://127.0.0.1:3093", rec, tmp)
                reset_step = steps[2]
                assert_true(reset_step["name"] == "reset-board",
                            f"step 2 name is {reset_step['name']}, expected reset-board")
                assert_true("--reset" in reset_step["argv"],
                            f"reset-board step should contain --reset: {reset_step['argv']}")


if __name__ == "__main__":
    test_plan_order()
    test_fail_closed_reset()
    test_fail_closed_undeclared()
    test_fail_closed_seed()
    test_all_green()
    test_usage_missing_drivers()
    test_board_gate_rejects_wrong_volume()
    test_board_gate_rejects_wrong_events()
    test_board_gate_accepts_correct()
    test_board_gate_step_in_plan()
    test_reset_board_step_in_plan()
    print(f"{PASS} passed")
    if FAIL:
        print(f"{FAIL} failures")
        sys.exit(1)
