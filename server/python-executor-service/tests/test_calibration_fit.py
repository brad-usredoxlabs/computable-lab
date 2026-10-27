"""GC-8 T1 — python unit tests for the calibration-fit module (Leg 1: C1/C3/C6).

Gate (spec V1): PYTHONPATH=src /usr/bin/python3 -m unittest tests.
stdlib only; the fit is weighted normal equations (OQ3: no numpy/scipy).

First-targeted gate (spec "First targeted check"): C1 (weight-invariance on
an exact line), C3 (the weighted r^2 = 0.9657142857142857 anti-laundering
assertion against 26/7, -16/7 — plain unweighted r^2 on the same data is
0.9364207221350078, DIFFERENT by construction), C6 (origin FORCING visible
in the non-zero residuals: slope 7/3, not 2.0).

Fixtures: fixtures/gc-calibration/make_calibration_fixture.py
(generator-produced synthetic data — no committed bytes, no NAS, B2).
"""
from __future__ import annotations

import copy
import json
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SDK = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_SDK, "src"))
sys.path.insert(0, os.path.join(_SDK, "fixtures", "gc-calibration"))

import make_calibration_fixture as fx  # noqa: E402
from computable_lab_analysis.calibration_fit import (  # noqa: E402
    CALIBRATION_SCOPE,
    CalibrationError,
    fit_calibration,
)
from computable_lab_analysis.ctx import Context  # noqa: E402

_EPS = 1e-12  # float-epsilon: exact-rational fixtures vs float arithmetic (A2.8)


def assert_close(test: unittest.TestCase, got: float, want: float, label: str) -> None:
    test.assertAlmostEqual(
        got, want, delta=_EPS * max(1.0, abs(want)), msg=f"{label}: got {got!r}, want {want!r}"
    )


def cal_params(fixture, *, model="linear", weighting="none", origin_constraint=False,
               statistic="weighted_r_squared", amount_unit="ng/uL", istd=None,
               levels=None, input_names=None, rt0=1.0, d_rt=1.0,
               **overrides):
    """A fully-declared CAL parameter set (B5: every field present — the
    module applies ZERO defaults; the missing/unknown legs prove the other
    side)."""
    if istd is None:
        istd = {"role": "none"}
    params = {
        "model": model,
        "weighting": weighting,
        "origin_constraint": origin_constraint,
        "correlation_statistic": statistic,
        "amount_unit": amount_unit,
        "istd": istd,
        "extrapolation": "reject",
        "fail_on_out_of_range": True,
        "allow_inline_inputs": True,  # unit tests feed dicts through Context(inputs=...)
        "levels": levels if levels is not None else fx.level_params(
            fixture, rt0=rt0, d_rt=d_rt, input_names=input_names
        ),
    }
    for k, v in overrides.items():
        params[k] = v
    return params


def make_ctx(inputs: dict, params: dict) -> Context:
    """A synthetic Context: inline dict payloads (the DECLARED accept branch
    of A5, allow_inline_inputs: true — the shipped spine promotes instead)."""
    return Context(
        inputs={name: {"dataKind": "table", "inline": payload} for name, payload in inputs.items()},
        parameters=params,
    )


def run_fit(inputs, params):
    return fit_calibration(make_ctx(inputs, params), params)


class TestC1WeightInvarianceExactLine(unittest.TestCase):
    """C1 — linear, w=none, 5 points x=1..5 on y=2x+1: intercept=1.0, slope=2.0
    EXACT, weighted_r_squared=1.0, all relative_residual=0.0."""

    def test_c1_exact_line(self):
        fixture = fx.C1
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture)
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], fixture["expected_slope"], "C1 slope")
        assert_close(self, model["coefficients"]["intercept"], fixture["expected_intercept"],
                     "C1 intercept")
        assert_close(self, model["statistic_value"], fixture["expected_r2_w"], "C1 r2_w")
        for row, want_r in zip(res["table_rows"], fixture["expected_residuals"]):
            assert_close(self, row["relative_residual"], want_r, "C1 residual")
        # the declared-identity columns (plain mode): response_ratio == raw.
        for row in res["table_rows"]:
            self.assertEqual(row["response_ratio"], row["response_raw_pa_min"])
        self.assertEqual(model["response_quantity"], "raw_area_pa_min")
        self.assertEqual(model["calibration_scope"], CALIBRATION_SCOPE)
        # A6 payload contract: every key the quantifier (and a reviewer) reads.
        for key in ("model_version", "model", "equation", "coefficients", "weighting",
                    "origin_constraint", "statistic_name", "statistic_value",
                    "statistic_definition", "residual_basis", "response_quantity",
                    "amount_unit", "fit_points", "x_min", "x_max", "params_digest",
                    "calibration_scope"):
            self.assertIn(key, model)
        self.assertEqual(model["amount_unit"], "ng/uL")
        self.assertEqual(model["x_min"], 1.0)
        self.assertEqual(model["x_max"], 5.0)
        self.assertEqual(len(model["fit_points"]), 5)
        fp0 = model["fit_points"][0]
        self.assertEqual(fp0["source_input"], "level_1")
        self.assertEqual(fp0["source_peak_index"], 0)
        self.assertIn("source_point_ref", fp0)
        self.assertIn("input_name", fp0["source_point_ref"])
        self.assertIn("peak_row_index", fp0["source_point_ref"])
        # the equation string is explicit + built from the actual coefficients.
        self.assertIn("amount_ng_uL", model["equation"])
        self.assertIn("raw_area_pa_min", model["equation"])
        # the calibration_table payload contract (A1).
        table_art = next(a for a in res["table_rows"] if a["level"] == 1)
        self.assertEqual(table_art["compound_label"], "TEST-CMPD-A")
        self.assertIsNone(table_art["compound_ref"])  # declared-none → null, label sole identity
        self.assertTrue(all(r["fit_point"] for r in res["table_rows"]))
        self.assertTrue(all(not r["flags"] for r in res["table_rows"]))

    def test_c1_determinism_byte_identical(self):
        """A2.8: same inputs twice → byte-identical artifact JSON."""
        fixture = fx.C1
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture)
        res1 = run_fit(copy.deepcopy(inputs), copy.deepcopy(params))
        res2 = run_fit(copy.deepcopy(inputs), copy.deepcopy(params))
        self.assertEqual(
            json.dumps(res1["model"], sort_keys=True),
            json.dumps(res2["model"], sort_keys=True),
            "model payload must be byte-identical (sort_keys compare)",
        )
        self.assertEqual(
            json.dumps(res1["table_rows"], sort_keys=True),
            json.dumps(res2["table_rows"], sort_keys=True),
            "table rows must be byte-identical (sort_keys compare)",
        )


class TestC3WeightedNormalEquations(unittest.TestCase):
    """C3 — linear, w=(1,1,4), points (1,2),(2,4),(3,9): slope = 26/7,
    intercept = -16/7, r2_w = 0.9657142857142857 (the WEIGHTED statistic —
    the anti-laundering assertion: plain unweighted r^2 = 0.9364207221350078),
    residuals = -200/7 %, +200/7 %, -100/63 % (A2.5, on the fit response)."""

    def test_c3_weighted(self):
        fixture = fx.C3
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(
            fixture,
            levels=fx.level_params(fixture, rt0=1.0, d_rt=1.0, weights=fixture["weights"]),
        )
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], fixture["expected_slope"], "C3 slope 26/7")
        assert_close(self, model["coefficients"]["intercept"], fixture["expected_intercept"],
                     "C3 intercept -16/7")
        assert_close(self, model["statistic_value"], fixture["expected_r2_w"],
                     "C3 r2_w (weighted — NOT the plain 0.93642...)")
        for row, want_r in zip(res["table_rows"], fixture["expected_residuals"]):
            assert_close(self, row["relative_residual"], want_r, "C3 residual")
        # the statistic_definition is emitted verbatim (A2.4: a reader never
        # has to guess which r^2 this is).
        self.assertIn("SS_tot", model["statistic_definition"])
        self.assertIn("weighted", model["statistic_definition"].lower())
        # the weights are machine-readable on the fit points (A6).
        weights = [fp["weight"] for fp in model["fit_points"]]
        self.assertEqual(weights, [1.0, 1.0, 4.0])

    def test_c3_weights_invariance_on_exact_data(self):
        """C2 — the SAME exact line with declared weights 1,2,3,4,5 keeps the
        exact coefficients (weight-invariance on exact data — catches weights
        computed but not applied / applied to the wrong side; bait-#3)."""
        fixture = fx.C1
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(
            fixture,
            levels=fx.level_params(fixture, rt0=1.0, d_rt=1.0,
                                   weights=[1.0, 2.0, 3.0, 4.0, 5.0]),
        )
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], 2.0, "C2 slope (weights on exact data)")
        assert_close(self, model["coefficients"]["intercept"], 1.0, "C2 intercept")
        assert_close(self, model["statistic_value"], 1.0, "C2 r2_w")
        self.assertEqual([fp["weight"] for fp in model["fit_points"]],
                         [1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertEqual(model["weighting"], "none")

    def test_c3_1x_weighting_scheme(self):
        """The declared `weighting` scheme channel (A2.2): 1/x on the exact
        line — weights [1, .5, 1/3, .25, .2] enter the equations and the exact
        coefficients survive."""
        fixture = fx.C1
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture, weighting="1/x")  # declared 1/x on exact data
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], 2.0, "1/x slope (exact data)")
        assert_close(self, model["coefficients"]["intercept"], 1.0, "1/x intercept")
        assert_close(self, model["statistic_value"], 1.0, "1/x r2_w")
        self.assertEqual([fp["weight"] for fp in model["fit_points"]],
                         [1.0, 0.5, 1.0 / 3, 0.25, 0.2])
        self.assertEqual(model["weighting"], "1/x")


class TestC6OriginConstraintForced(unittest.TestCase):
    """C6 — origin_constraint=true FORCED on y=2x+1, x=1..4: slope = 7/3 (NOT
    2.0), NON-ZERO residuals (the forcing is visible, bait-#4), the equation
    string carries the explicit intercept, and the statistic is defined."""

    def test_c6_forced_origin(self):
        fixture = fx.C6
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture, origin_constraint=True)
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], fixture["expected_slope"],
                     "C6 slope 7/3 (NOT 2.0 — the forcing happened)")
        self.assertGreater(model["coefficients"]["slope"], 2.2)
        self.assertLess(model["coefficients"]["slope"], 2.5)
        # (a secretly-unforced fit shows slope = 2.0 — outside this band)
        # the residuals are NON-ZERO (3 of 4): the forcing is visible.
        non_zero = [r for r in res["table_rows"] if r["relative_residual"] not in (0.0, None)]
        self.assertEqual(len(non_zero), 3)
        for row, want_r in zip(res["table_rows"], fixture["expected_residuals"]):
            assert_close(self, row["relative_residual"], want_r, "C6 residual")
        # the equation string: forced-origin linear = b*x + 0.0 form.
        self.assertIn("+ 0.0", model["equation"])
        self.assertNotEqual(model["origin_constraint"], False)
        # the statistic is defined and < 1 (a real distortion, not an exact fit).
        self.assertLess(model["statistic_value"], 1.0)
        self.assertGreater(model["statistic_value"], 0.9)


if __name__ == "__main__":
    unittest.main()
