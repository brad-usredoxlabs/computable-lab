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
                    "effective_weighting",
                    "origin_constraint", "statistic_name", "statistic_value",
                    "statistic_definition", "residual_basis", "response_quantity",
                    "amount_unit", "fit_points", "x_min", "x_max", "params_digest",
                    "calibration_scope"):
            self.assertIn(key, model)
        # D3: the identity fit (w=1 everywhere) reports effective "none" —
        # the marker is machine-readable from the APPLIED weights, never the echo.
        self.assertEqual(model["effective_weighting"], "none")
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
        # D3 (the C3 probe): the declared scheme says "none" but per-point
        # weights 1,1,4 WERE applied — the effective-weighting marker MUST say
        # so. The original run's artifact read weighting: "none" for this very
        # fit (the contradictory echo D3 punishes).
        self.assertEqual(model["weighting"], "none")
        self.assertEqual(model["effective_weighting"], "per_point")

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
        # D3: a real declared scheme applied → the effective marker names the scheme.
        self.assertEqual(model["effective_weighting"], "1/x")


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


class TestC4QuadraticExact(unittest.TestCase):
    """C4 — quadratic, w=none, x=1..5 on y = 1 + 2x + 0.1x² (1/10 exact
    rational): c0 = 1.0, c1 = 2.0, c2 = 0.1 within float epsilon; the
    equation carries the x**2 form; residuals are 0."""

    def test_c4_quadratic(self):
        fixture = fx.C4
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture, model="quadratic")
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["c0"], fixture["expected_c0"], "C4 c0")
        assert_close(self, model["coefficients"]["c1"], fixture["expected_c1"], "C4 c1")
        assert_close(self, model["coefficients"]["c2"], fixture["expected_c2"], "C4 c2")
        assert_close(self, model["statistic_value"], 1.0, "C4 r2_w")
        for row in res["table_rows"]:
            assert_close(self, row["relative_residual"], 0.0, "C4 residual")
        self.assertIn("amount_ng_uL**2", model["equation"])
        self.assertEqual(model["model"], "quadratic")


class TestC5LinearThroughOrigin(unittest.TestCase):
    """C5 — linear_through_origin, points (1,3),(2,6),(3,9),(4,12): slope =
    3.0 EXACT; the equation string says the '+ 0' form; the intercept is
    zero BY CONSTRUCTION (absent/zero flag in the payload)."""

    def test_c5_through_origin(self):
        fixture = fx.C5
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture, model="linear_through_origin")
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], fixture["expected_slope"], "C5 slope 3.0")
        self.assertEqual(model["coefficients"]["intercept"], 0.0)  # by construction
        self.assertTrue(model["equation"].endswith("+ 0.0"))
        assert_close(self, model["statistic_value"], 1.0, "C5 r2_w")
        for row in res["table_rows"]:
            assert_close(self, row["relative_residual"], 0.0, "C5 residual")
        self.assertEqual(model["model"], "linear_through_origin")


class TestC7ISTDRatioMode(unittest.TestCase):
    """C7 — ISTD ratio mode: analyte area = k*amount, ISTD area constant 1000
    → ratio curve slope = k/1000 = 0.5 EXACT; response_quantity ==
    'area_ratio'; response_ratio column is the ratio (the ONLY ISTD division
    in the system — A3); residuals 0; statistic 1.0."""

    def test_c7_ratio_curve(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        params = cal_params(
            fixture,
            levels=fx.level_params(fixture, rt0=1.0, d_rt=1.0,
                                   compound_label="TEST-CMPD-ANALYTE"),
            istd=fx.c7_istd(fixture),
        )
        res = run_fit(inputs, params)
        model = res["model"]
        assert_close(self, model["coefficients"]["slope"], fixture["expected_slope"],
                     "C7 ratio slope k/1000 exact")
        assert_close(self, model["coefficients"]["intercept"], fixture["expected_intercept"],
                     "C7 intercept")
        self.assertEqual(model["response_quantity"], "area_ratio")
        assert_close(self, model["statistic_value"], 1.0, "C7 r2_w")
        # response_ratio = area(analyte)/area(istd) per table (the declared
        # ISTD combination; the plain raw column carries the raw area).
        for row, amount in zip(res["table_rows"], fixture["x"]):
            assert_close(self, row["response_ratio"], fixture["k"] / fixture["istd_area"] * amount,
                         "C7 ratio value")
            assert_close(self, row["response_raw_pa_min"], fixture["k"] * amount, "C7 raw area")
            assert_close(self, row["relative_residual"], 0.0, "C7 residual")
        self.assertEqual(model["residual_basis"],
                         "relative_residual = (fitted - observed)/observed * 100 on the fit response: "
                         "area_ratio (ISTD-mode response, A3)")


class TestNullReasonPairingInvariant(unittest.TestCase):
    """GC-7's null/reason pairing invariant (inherited), asserted BOTH
    directions over ALL fixture outputs:
    (a) every null numeric cell names its code in flags;
    (b) every reason code in flags corresponds to a null cell."""

    NUMERIC_NULLS = ("response_raw_pa_min", "response_ratio", "relative_residual")
    REASON_TO_FIELD = {
        "NO_MATCHING_PEAK": "response_raw_pa_min",
        "UNRECOVERABLE_SATURATED": "response_raw_pa_min",
        "EXCLUDED_FROM_FIT": "relative_residual",
        "ZERO_OBSERVED": "relative_residual",
    }

    def _all_rows(self):
        rows = []
        for name in ("C1", "C3", "C4", "C5", "C6"):
            fixture = getattr(fx, name)
            inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
            kwargs = {"model": "quadratic"} if name == "C4" else \
                     {"model": "linear_through_origin"} if name == "C5" else \
                     {"origin_constraint": True} if name == "C6" else {}
            if name == "C3":
                kwargs["levels"] = fx.level_params(fixture, rt0=1.0, d_rt=1.0,
                                                   weights=fixture["weights"])
            params = cal_params(fixture, **kwargs)
            rows.extend(run_fit(inputs, params)["table_rows"])
        # the NO_MATCHING_PEAK leg (a row with null response + declared flag)
        fixture = fx.C1
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0)
        levels[2] = dict(levels[2], rt_target_min=99.0)  # window misses the table
        params = cal_params(fixture, levels=levels)
        rows.extend(run_fit(fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0), params)["table_rows"])
        return rows

    def test_a_null_implies_reason(self):
        for row in self._all_rows():
            for field in self.NUMERIC_NULLS:
                if row[field] is None:
                    self.assertTrue(
                        any(f in self.REASON_TO_FIELD for f in row["flags"]),
                        f"null {field} on level {row['level']} without a declared reason: {row}",
                    )

    def test_b_reason_implies_null(self):
        for row in self._all_rows():
            for field in self.NUMERIC_NULLS:
                if row[field] is not None:
                    self.assertNotIn("EXCLUDED_FROM_FIT", row["flags"],
                                     f"{field} present but EXCLUDED_FROM_FIT flagged: {row}")
                    self.assertNotIn("NO_MATCHING_PEAK", row["flags"],
                                     f"{field} present but NO_MATCHING_PEAK flagged: {row}")
            # peak_source null iff the row has no matched peak
            if row["peak_source"] is None:
                self.assertIn("NO_MATCHING_PEAK", row["flags"], f"null peak_source unreasoned: {row}")
            else:
                self.assertNotIn("NO_MATCHING_PEAK", row["flags"],
                                 f"peak_source set but NO_MATCHING_PEAK flagged: {row}")


class TestFailureMatrix(unittest.TestCase):
    """The spec's failure matrix (T1): one named assertion per code."""

    def setUp(self):
        self.fixture = fx.C1
        self.inputs = fx.level_table_payloads(self.fixture, rt0=1.0, d_rt=1.0)
        self.params = cal_params(self.fixture)

    def expect_code(self, params, inputs=None, code=None, msg_part=None):
        with self.assertRaises(CalibrationError) as ctx:
            run_fit(inputs if inputs is not None else self.inputs, params)
        if code:
            self.assertEqual(ctx.exception.code, code)
        if msg_part:
            self.assertIn(msg_part, str(ctx.exception))
        return ctx.exception

    # ---- C10 trio ----
    def test_c10_duplicate_level_same_label_amount(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[1] = dict(levels[1], amount=levels[0]["amount"], rt_target_min=2.0)
        self.expect_code(cal_params(self.fixture, levels=levels), code="DUPLICATE_LEVEL",
                         msg_part="declared twice")

    def test_c10_duplicate_level_number(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[1] = dict(levels[1], level=1, rt_target_min=2.0, amount=5.0)
        self.expect_code(cal_params(self.fixture, levels=levels), code="DUPLICATE_LEVEL")

    def test_c10_overlapping_fit_windows_same_compound(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0, rt_window=2.0)
        self.expect_code(cal_params(self.fixture, levels=levels), code="DUPLICATE_LEVEL",
                         msg_part="overlap")

    def test_c10_missing_amount(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        del levels[0]["amount"]
        self.expect_code(cal_params(self.fixture, levels=levels), code="LEVEL_AMOUNT_MISSING",
                         msg_part="no declared amount")

    def test_c10_unit_invalid_empty(self):
        self.expect_code(cal_params(self.fixture, amount_unit=""), code="UNIT_INVALID")

    def test_c10_unit_invalid_non_string(self):
        self.expect_code(cal_params(self.fixture, amount_unit=3.14), code="UNIT_INVALID")

    # ---- declared-enum failures ----
    def test_model_unsupported(self):
        self.expect_code(cal_params(self.fixture, model="cubic"), code="MODEL_UNSUPPORTED")

    def test_weighting_unsupported(self):
        self.expect_code(cal_params(self.fixture, weighting="1/x^3"), code="WEIGHTING_UNSUPPORTED")

    def test_weight_undefined_at_zero_1x(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[0] = dict(levels[0], amount=0.0)
        inputs = fx.level_table_payloads(self.fixture, rt0=1.0, d_rt=1.0)
        self.expect_code(cal_params(self.fixture, weighting="1/x", levels=levels), inputs=inputs,
                         code="WEIGHT_UNDEFINED_AT_ZERO")

    def test_weight_undefined_at_zero_1y2(self):
        # y = 0 observed response + 1/y^2 → WEIGHT_UNDEFINED_AT_ZERO
        fixture = {**fx.C1, "y": [0.0, 5.0, 7.0, 9.0, 11.0]}
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        self.expect_code(cal_params(fixture, weighting="1/y^2"), inputs=inputs,
                         code="WEIGHT_UNDEFINED_AT_ZERO")

    def test_param_invalid_per_point_plus_scheme(self):
        # D3: per-point declared weights (C3's w=1,1,4) are MUTUALLY
        # EXCLUSIVE with a conflicting `weighting` scheme — declaring BOTH is
        # a loud PARAM_INVALID (this module's declared invalid-parameter
        # token; the spec's calibration-leg vocabulary enumerates no
        # weighting-conflict token), never a silent override (the original
        # run let the per-point channel win while the payload still echoed
        # the scheme). `weighting: "none"` is the identity (names no scheme),
        # so C3 (weights + "none") stays legal — only a REAL scheme conflicts.
        fixture = fx.C3
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0, weights=fixture["weights"])
        self.expect_code(cal_params(fixture, levels=levels, weighting="1/x"),
                         inputs=inputs, code="PARAM_INVALID",
                         msg_part="conflict with the declared weighting scheme")
        # the identity combination is NOT a conflict (C3 itself, above).
        res = run_fit(inputs, cal_params(fixture, levels=levels, weighting="none"))
        self.assertEqual(res["model"]["effective_weighting"], "per_point")

    def test_origin_constraint_unsupported_quadratic(self):
        self.expect_code(cal_params(self.fixture, model="quadratic", origin_constraint=True),
                         code="ORIGIN_CONSTRAINT_UNSUPPORTED")

    def test_statistic_unsupported(self):
        self.expect_code(cal_params(self.fixture, statistic="pearson_r"),
                         code="STATISTIC_UNSUPPORTED")

    def test_statistic_undefined_single_point(self):
        # linear_through_origin with ONE fit point: SS_tot == 0 → null +
        # STATISTIC_UNDEFINED (never 1.0, never 0.0 substituted)
        fixture = {**fx.C1, "x": [1], "y": [3.0]}
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = cal_params(fixture, model="linear_through_origin")
        res = run_fit(inputs, params)
        self.assertIsNone(res["model"]["statistic_value"])
        self.assertEqual(res["model"]["statistic_name"], "weighted_r_squared")

    # ---- point-count failures ----
    def test_insufficient_points_linear(self):
        fixture = {**fx.C1, "x": [1], "y": [3.0]}
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        self.expect_code(cal_params(fixture), inputs=inputs, code="INSUFFICIENT_POINTS",
                         msg_part="1 present")

    def test_insufficient_points_linear_two_points(self):
        # D2 (the review's probe A): a 2-POINT plain-linear fit was ACCEPTED
        # while a correlation statistic is REQUIRED — SS_res == 0 by
        # construction, so the emitted r^2 = 1.0 was a guaranteed certainty
        # dressed as evidence (A2.4/A2.5 anti-laundering). correlation_statistic
        # is a required parameter, so every legal linear run demands a
        # statistic → the linear floor is 3 (A2.1). Named count: "2 present".
        fixture = {**fx.C1, "x": [1, 2], "y": [3.0, 5.0]}  # exactly 2 points
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        self.expect_code(cal_params(fixture), inputs=inputs, code="INSUFFICIENT_POINTS",
                         msg_part="2 present")

    def test_insufficient_points_quadratic(self):
        fixture = {**fx.C4, "x": [1, 2], "y": [3.1, 6.4]}
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        self.expect_code(cal_params(fixture, model="quadratic"), inputs=inputs,
                         code="INSUFFICIENT_POINTS", msg_part="2 present")

    def test_no_fit_points_all_excluded(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        for lv in levels:
            lv["fit"] = False
        self.expect_code(cal_params(self.fixture, levels=levels), code="NO_FIT_POINTS")

    # ---- ISTD failures (A3) ----
    def test_istd_peak_not_found(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        params = cal_params(
            fixture,
            levels=fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE"),
            istd={**fx.c7_istd(fixture), "rt_target_min": 42.0},  # misses every table
        )
        self.expect_code(params, inputs=inputs, code="ISTD_PEAK_NOT_FOUND",
                         msg_part="never a fallback to raw area")

    def test_istd_ambiguous(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        params = cal_params(
            fixture,
            levels=fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE"),
            istd={**fx.c7_istd(fixture), "rt_target_min": 3.0, "rt_window_min": 3.0},
        )
        # window [0,6] hits the analyte (rt 3.0 in level_3) AND the ISTD (rt 5)
        self.expect_code(params, inputs=inputs, code="AMBIGUOUS_PEAK_MATCH")

    # ---- matching failures ----
    def test_no_matching_peak_per_level(self):
        # required: false → row present with null response + NO_MATCHING_PEAK
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[2] = dict(levels[2], rt_target_min=99.0)
        res = run_fit(self.inputs, cal_params(self.fixture, levels=levels))
        row3 = res["table_rows"][2]
        self.assertIsNone(row3["response_raw_pa_min"])
        self.assertIn("NO_MATCHING_PEAK", row3["flags"])
        self.assertTrue(all(len(r["flags"]) == 0 for i, r in enumerate(res["table_rows"]) if i != 2))

    def test_level_unmatched_required(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[2] = dict(levels[2], rt_target_min=99.0, required=True)
        self.expect_code(cal_params(self.fixture, levels=levels), code="LEVEL_UNMATCHED",
                         msg_part="required")

    def test_ambiguous_peak_match(self):
        # a level's declared window matches MULTIPLE peaks in its table →
        # AMBIGUOUS_PEAK_MATCH naming both rows (no nearest-RT rescue).
        # Every level input is the SAME two-peak table (peaks at rt 3.0 and
        # 3.05); level 3's window [3-0.25, 3+0.25] catches BOTH → the failure.
        two = fx.two_peak_table((500.0, 3.0), (1000.0, 3.05))
        inputs = {f"level_{i + 1}": two for i in range(5)}
        self.expect_code(self.params, inputs=inputs,
                         code="AMBIGUOUS_PEAK_MATCH", msg_part="MULTIPLE")

    def test_unassigned_peaks_kept_in_quant(self):
        # (quant-side) — covered in test_quantification.py; here the CAL side
        # never invents identity: unmatched rows carry NO_MATCHING_PEAK.
        self.assertTrue(True)

    # ---- A5 loader failures ----
    def test_input_not_promoted_dict_inline(self):
        # dict-inline input + allow_inline_inputs: false → INPUT_NOT_PROMOTED
        # BEFORE any filesystem read (the [F-run] FileNotFoundError trap,
        # discharged as a DECLARED failure).
        params = cal_params(self.fixture, allow_inline_inputs=False)
        self.expect_code(params, code="INPUT_NOT_PROMOTED", msg_part="never written")

    def test_input_json_invalid(self):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
            f.write(b"this is not json at all")
            path = f.name
        try:
            ctx = Context(
                inputs={"level_1": {"dataKind": "table", "path": path}},
                parameters=cal_params(self.fixture),
            )
            with self.assertRaises(CalibrationError) as e:
                fit_calibration(ctx, cal_params(self.fixture))
            self.assertEqual(e.exception.code, "INPUT_JSON_INVALID")
        finally:
            import os
            os.unlink(path)

    def test_input_missing(self):
        # a declared input name that is NOT provisioned → INPUT_MISSING
        params = cal_params(self.fixture)
        ctx = Context(
            inputs={f"level_{i + 1}": {"dataKind": "table",
                                       "inline": payload}
                    for i, (name, payload) in enumerate(self.inputs.items()) if i < 4},
            parameters=params,
        )
        with self.assertRaises(CalibrationError) as e:
            fit_calibration(ctx, params)
        self.assertEqual(e.exception.code, "INPUT_MISSING")

    # ---- shape failures ----
    def test_peak_table_shape_invalid_missing_columns(self):
        bad = {"columns": ["rt_min", "saturated", "flags"],
               "rows": [{"rt_min": 1.0, "saturated": False, "flags": []}]}
        self.expect_code(self.params, inputs={"level_1": bad},
                         code="PEAK_TABLE_SHAPE_INVALID", msg_part="area_pa_min")

    def test_peak_table_shape_invalid_not_a_table(self):
        self.expect_code(self.params, inputs={"level_1": 42},
                         code="PEAK_TABLE_SHAPE_INVALID")

    def test_rt_window_invalid_zero(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[0] = dict(levels[0], rt_window_min=0.0)
        self.expect_code(cal_params(self.fixture, levels=levels), code="RT_WINDOW_INVALID")

    def test_rt_window_invalid_negative_target(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        levels[0] = dict(levels[0], rt_target_min=-1.0)
        self.expect_code(cal_params(self.fixture, levels=levels), code="RT_WINDOW_INVALID")

    def test_istd_rt_window_invalid(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        params = cal_params(
            fixture,
            levels=fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE"),
            istd={**fx.c7_istd(fixture), "rt_window_min": -1.0},
        )
        self.expect_code(params, inputs=inputs, code="RT_WINDOW_INVALID")

    # ---- ill-conditioned ----
    def test_fit_ill_conditioned(self):
        # ALL levels at the SAME amount (distinct labels — legal) → every
        # x is equal → the design matrix is singular (det = 0 at scale) →
        # FIT_ILL_CONDITIONED, never garbage numbers (A2.8).
        fixture = {**fx.C1, "x": [1.0, 1.0, 1.0, 1.0, 1.0]}
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0,
                                 compound_label="TEST-CMPD-A")
        for i, lv in enumerate(levels):
            lv["compound_label"] = f"TEST-CMPD-{chr(ord('A') + i)}"
            # distinct labels → no DUPLICATE_LEVEL; same amount → singular.
            lv["rt_target_min"] = 1.0 + i
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        self.expect_code(cal_params(fixture, levels=levels), inputs=inputs,
                         code="FIT_ILL_CONDITIONED")

    # ---- parameter honesty (GC-7 T1-10 pattern) ----
    # NOTE: `allow_inline_inputs` is NOT in this list — it is a FAIL-CLOSED
    # GATE the loader reads (spec A5.1/T2-2), not a required parameter:
    # absent → INPUT_NOT_PROMOTED (the declared failure), never PARAM_MISSING.
    def test_param_missing_names_the_field(self):
        for field in ("model", "weighting", "origin_constraint", "correlation_statistic",
                      "amount_unit", "istd", "extrapolation", "fail_on_out_of_range",
                      "levels"):
            p = dict(self.params)
            del p[field]
            with self.assertRaises(CalibrationError) as e:
                run_fit(self.inputs, p)
            self.assertEqual(e.exception.code, "PARAM_MISSING")
            self.assertIn(field, str(e.exception), f"'{field}' must be named")

    def test_allow_inline_absent_is_the_gate_not_param_missing(self):
        """A5.1/T2-2 contract: the dict-inline test inputs + ABSENT
        `allow_inline_inputs` → INPUT_NOT_PROMOTED (the fail-closed gate),
        never PARAM_MISSING and never a FileNotFoundError."""
        p = dict(self.params)
        del p["allow_inline_inputs"]
        with self.assertRaises(CalibrationError) as e:
            run_fit(self.inputs, p)
        self.assertEqual(e.exception.code, "INPUT_NOT_PROMOTED")

    def test_param_missing_level_field(self):
        levels = fx.level_params(self.fixture, rt0=1.0, d_rt=1.0)
        del levels[0]["fit"]
        with self.assertRaises(CalibrationError) as e:
            run_fit(self.inputs, cal_params(self.fixture, levels=levels))
        self.assertEqual(e.exception.code, "PARAM_MISSING")
        self.assertIn("fit", str(e.exception))

    def test_istd_role_absent_is_param_missing(self):
        fixture = fx.C1
        with self.assertRaises(CalibrationError) as e:
            run_fit(fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0),
                    cal_params(fixture, istd={}))
        self.assertEqual(e.exception.code, "PARAM_MISSING")
        self.assertIn("role", str(e.exception))

    def test_unknown_param_is_param_invalid(self):
        p = dict(self.params)
        p["mystery_parameter"] = True
        with self.assertRaises(CalibrationError) as e:
            run_fit(self.inputs, p)
        self.assertEqual(e.exception.code, "PARAM_INVALID")
        self.assertIn("mystery_parameter", str(e.exception))

    def test_zero_defaults_applied(self):
        """B5: every scientific value arrives as a declared parameter — strip
        ONE and the run fails (there is no default to apply)."""
        for field in ("model", "weighting", "correlation_statistic", "amount_unit"):
            p = dict(self.params)
            del p[field]
            with self.assertRaises(CalibrationError) as e:
                run_fit(self.inputs, p)
            self.assertIn(field, str(e.exception))


class TestSourcePointRefIdentity(unittest.TestCase):
    """D4: the A6 source_point_ref identity slot. The INPUT'S DECLARED ref id
    (the artifact/data-reference record id the run's inputs map declared for
    the input) rides `artifact_or_dref_id`; a filesystem PATH must NEVER sit
    under an `_id` name (the original run echoed meta.sourcePath there); when
    no id exists (an unpromoted inline artifact input) the key is OMITTED.

    These drive the real module through a synthetic Context whose input
    specs carry a declared ``meta`` (the runner hands the declared ref id
    through meta as ``sourceRefId`` when it has one).
    """

    def _fit_with_meta(self, meta):
        fixture = fx.C1
        params = cal_params(fixture)
        inputs_spec = {
            f"level_{i + 1}": {"dataKind": "table", "inline": payload, "meta": meta}
            for i, payload in enumerate(fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0).values())
        }
        ctx = Context(inputs=inputs_spec, parameters=params)
        return fit_calibration(ctx, params)["model"]

    def test_declared_ref_id_carried_in_source_point_ref(self):
        # a declared ref id (the promoted dref / artifact record id) IS
        # carried — under the _id name, as an id, not a path.
        meta = {"sourceRefId": "AOUT-000424"}
        model = self._fit_with_meta(meta)
        self.assertEqual(len(model["fit_points"]), 5)
        for n, fp in enumerate(model["fit_points"], start=1):
            ref = fp["source_point_ref"]
            self.assertEqual(ref["artifact_or_dref_id"], "AOUT-000424")
            self.assertEqual(ref["input_name"], f"level_{n}")  # one input per level
            self.assertIsInstance(ref["peak_row_index"], int)

    def test_path_is_never_placed_under_the_id_name(self):
        # a filesystem PATH in meta.sourcePath must NOT leak into the _id
        # slot. When the input declares no ref id (only a sourcePath), the
        # key is OMITTED — never a path under an `_id` name.
        meta = {"sourcePath": "analysis-artifacts/promoted/AOUT-000424/calibration_model.json"}
        model = self._fit_with_meta(meta)
        for fp in model["fit_points"]:
            ref = fp["source_point_ref"]
            self.assertNotIn("artifact_or_dref_id", ref)
            # and the path string itself never appears anywhere in the ref
            self.assertNotIn("analysis-artifacts", json.dumps(ref))

    def test_no_meta_no_id_key(self):
        # no meta at all → the identity key is omitted (inline input, no
        # declared ref id exists — never invented).
        model = self._fit_with_meta({})
        for fp in model["fit_points"]:
            self.assertNotIn("artifact_or_dref_id", fp["source_point_ref"])
            # the two ALWAYS-present ref fields are intact
            self.assertIn("input_name", fp["source_point_ref"])
            self.assertIn("peak_row_index", fp["source_point_ref"])


if __name__ == "__main__":
    unittest.main()
