#!/usr/bin/env python3
"""Driver-level self-check leg (advc cycle-1, D1 fix-run).

Proves the P5 8-channel expectation check (run-suite-a.check_expectation,
`channel_semantics == "8-channel"`) is asserted STRUCTURALLY over the
expectation/compiler well set — i.e. it PASSES on the compiler's OWN A2:H2
expansion shape and FAILS on a wrong set.

B3 discipline honored throughout: the expected 8-well set is NOT re-encoded
in this harness. It comes from the SAME source the exp_wells compare consumes
— expectations/P5.json `wells` (the compiler's expansion pinned via
wellRange.ts). This leg independently re-runs the compiler's own
`lib/well-expansions.ts` (which imports server/src/ai/wellRange.ts
expandWellTokens) and asserts the pinned expectation matches that real
expansion BEFORE feeding the check. No row/column axis mapping is derived in
python (the pre-fix defect: it required row-letter 'A' + columns 2-9, but
wellRange.ts expands 'A2:H2' to A2,B2,...,H2 = ROW letters vary, column fixed).

Zero model calls, zero server contact — pure function-level + compiler
expansion. Re-runnable:
    python3 .hermes/plans/harness/l2-suite-a/test-channel-selfcheck.py
Exit 0 = the check passes on the compiler set and fails on wrong sets.
Exit 1 = the check misbehaves (RED).
"""
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# Load the driver module (hyphenated filename -> load by path).
_spec = importlib.util.spec_from_file_location(
    "run_suite_a", os.path.join(HERE, "run-suite-a.py"))
if _spec is None or _spec.loader is None:
    raise SystemExit("SELFCHECK: cannot load the driver module by path")
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)


def _state(events, cards=None, verdict="events-bound"):
    """A synthetic per-prompt state for check_expectation (channel shapes only)."""
    return {"verdict": verdict, "events": events, "cards": cards or [],
            "done": {}, "computed_wells": None}


def main():
    exps = rs.load_expectations(os.path.join(HERE, "expectations"))
    exp = exps[5]
    exp_wells = exp.get("wells")
    if not exp_wells:
        print("SELFCHECK: FAIL — expectations/P5.json has no `wells` set")
        return 1

    # 1) The expected 8-well set comes from the expectation (compiler expansion
    #    pinned via wellRange.ts). Independently re-run the COMPILER's own
    #    expansion of A2:H2 and confirm the pinned expectation matches it (B3
    #    parity: the harness never re-derives the axis mapping).
    raw = subprocess.run(
        ["node", "--no-warnings", os.path.join(HERE, "lib", "well-expansions.ts")],
        capture_output=True, text=True, timeout=60)
    comp = {}
    for line in raw.stdout.strip().splitlines():
        try:
            o = json.loads(line)
            comp[o["token"]] = o["wells"]
        except Exception:
            continue
    if "A2:H2" not in comp:
        print("SELFCHECK: FAIL — could not read the compiler's A2:H2 expansion")
        print(raw.stderr[:400])
        return 1
    compiler_set = comp["A2:H2"]
    parity = (compiler_set == exp_wells)

    # 2) PASS case: ONE material-bearing event whose well set == the compiler's
    #    A2:H2 expansion shape (with an honest channels:8). Must produce NO
    #    violation. (Under the pre-fix transposed check this FAILED: rows != {A}
    #    AND no '8-column over A2:H2' op.)
    good = {"verb": "add_material",
            "details": {"wells": list(compiler_set), "labwareId": "LBW-p",
                        "channels": 8}}
    pass_viol = rs.check_expectation(5, exp, _state([good]))

    # 3) FAIL case (a): the pre-fix / transposed assumption — a single op over
    #    row-A columns 2-9 (A2..A9). Well set != the compiler set -> violation.
    transposed = ["A%d" % i for i in range(2, 10)]
    bad_a = {"verb": "add_material",
             "details": {"wells": list(transposed), "labwareId": "LBW-p",
                         "channels": 8}}
    fail_a = rs.check_expectation(5, exp, _state([bad_a]))

    # 4) FAIL case (b): a SPREAD of 8 single-well (single-channel) events. The
    #    union matches the expected set (so the plain exp_wells compare alone
    #    would pass), but there is NO single 8-channel operation over the full
    #    8-well set -> the structural 8-channel assertion must catch it (B8).
    spread = [{"verb": "add_material",
               "details": {"wells": [w], "labwareId": "LBW-p"}}
              for w in compiler_set]
    fail_b = rs.check_expectation(5, exp, _state(spread))

    # 5) FAIL case (c): a single op over the compiler set that honestly carries
    #    channels:1 (a single-channel interpretation over 8 wells) -> the
    #    honest channel-count contradicts 8-channel -> violation.
    bad_c = {"verb": "add_material",
             "details": {"wells": list(compiler_set), "labwareId": "LBW-p",
                         "channels": 1}}
    fail_c = rs.check_expectation(5, exp, _state([bad_c]))

    # 6) PASS case (d): one op over the compiler set carrying NO honest
    #    channel-count field (the realistic delivery where the compiler emits
    #    no `channels` key). The single-op-over-8-wells shape IS the 8-channel
    #    operation; nothing contradicts it -> no violation.
    good_d = {"verb": "add_material",
              "details": {"wells": list(compiler_set), "labwareId": "LBW-p"}}
    pass_d = rs.check_expectation(5, exp, _state([good_d]))

    print("compiler A2:H2 expansion :", compiler_set)
    print("expectation P5.wells     :", exp_wells)
    print("expectation==compiler    :", parity)
    print()
    print("PASS case (compiler set, one 8-ch op, channels:8)      viol=%r -> %s"
          % (pass_viol, "PASS(ok)" if not pass_viol else "UNEXPECTED-FAIL(RED)"))
    print("PASS case (compiler set, one 8-ch op, no channels key) viol=%r -> %s"
          % (pass_d, "PASS(ok)" if not pass_d else "UNEXPECTED-FAIL(RED)"))
    print("FAIL case (transposed A2..A9)                          viol=%r -> %s"
          % (fail_a, "FAIL(ok)" if fail_a else "UNEXPECTED-PASS(RED)"))
    print("FAIL case (8 single-well events, no 8-ch op)           viol=%r -> %s"
          % (fail_b, "FAIL(ok)" if fail_b else "UNEXPECTED-PASS(RED)"))
    print("FAIL case (compiler set but honest channels:1)         viol=%r -> %s"
          % (fail_c, "FAIL(ok)" if fail_c else "UNEXPECTED-PASS(RED)"))

    ok = (parity
          and not pass_viol
          and not pass_d
          and bool(fail_a)
          and bool(fail_b)
          and bool(fail_c))
    print()
    print("SELFCHECK:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
