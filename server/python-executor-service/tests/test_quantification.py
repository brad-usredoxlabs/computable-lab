"""GC-8 T1 (Leg 3) — python unit tests for the quantification module.

Round-trip honesty (spec T1): the model payloads consumed HERE are REAL
outputs of ``fit_calibration`` on the C-fixtures — the consumer consumes the
producer's exact artifact, not a hand-copy. Peak-table payloads are built
DIRECTLY in the GC-7 §A1 shape (columns/rows dicts) — no GC-7 import needed
for the math legs; the shipped column SET (width_min + symmetry extras) is
carried so the consumer's SUBSET shape check is exercised against the
shipped superset (B1 re-pin).

The promoted model input rides a FILE (temp JSON → ``path``) with the
promoted-artifact dref-path layout in ``meta.sourcePath`` — A5's
file_bytes + json.loads leg (NEVER read_rows); the sample table rides the
inline-list edge (a list-inline is the shipped inline-list provisioning).
``allow_inline_inputs: false`` + a DICT-inline model input is the
INPUT_NOT_PROMOTED leg (the [F-run] trap, discharged before any filesystem
read).
"""
from __future__ import annotations

import copy
import json
import os
import sys
import tempfile
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SDK = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_SDK, "src"))
sys.path.insert(0, os.path.join(_SDK, "fixtures", "gc-calibration"))

import make_calibration_fixture as fx  # noqa: E402
from computable_lab_analysis import quantification as q  # noqa: E402
from computable_lab_analysis.calibration_fit import (  # noqa: E402
    fit_calibration,
)
from computable_lab_analysis.ctx import Context  # noqa: E402

_EPS = 1e-12  # float-epsilon (A2.8): exact fixtures vs float arithmetic


def assert_close(test, got, want, label):
    test.assertAlmostEqual(got, want, delta=_EPS * max(1.0, abs(want)),
                           msg=f"{label}: got {got!r}, want {want!r}")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def cal_ctx_and_fit(fixture, **kwargs):
    """Run the REAL fit_calibration on a C-fixture → (ctx, params, result)."""
    inputs = kwargs.pop("inputs", None) or fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
    levels = kwargs.pop("levels", None) or fx.level_params(fixture, rt0=1.0, d_rt=1.0)
    params = {
        "model": kwargs.pop("model", "linear"),
        "weighting": "none",
        "origin_constraint": kwargs.pop("origin_constraint", False),
        "correlation_statistic": "weighted_r_squared",
        "amount_unit": "ng/uL",
        "istd": kwargs.pop("istd", {"role": "none"}),
        "extrapolation": "reject",
        "fail_on_out_of_range": True,
        "allow_inline_inputs": True,
        "levels": levels,
    }
    for k, v in kwargs.items():
        params[k] = v
    ctx = Context(inputs={n: {"dataKind": "table", "inline": p} for n, p in inputs.items()},
                  parameters=params)
    return ctx, params, fit_calibration(ctx, params)


def make_quant_ctx(model_payload, table_rows, model_meta=None, parameters=None):
    """A synthetic Context with the PROMOTED model as a file input (A5's
    file_bytes + json.loads leg) and the sample table as an inline list."""
    fd, path = tempfile.mkstemp(suffix=".bin", prefix="gc8-model-")
    with os.fdopen(fd, "w") as f:
        json.dump(model_payload, f)
    meta = model_meta or {
        "sourcePath": "analysis-artifacts/promoted/AOUT-000424/calibration_model.json",
    }
    return (
        Context(
            inputs={
                "calibration_model": {"dataKind": "table", "path": path, "meta": meta},
                "peak_table": {"dataKind": "table", "inline": table_rows},
            },
            parameters=parameters or {},
        ),
        path,
    )


def quant_params(**overrides):
    p = {
        "istd": {"role": "none"},
        "targets": [{
            "compound_label": "TEST-CMPD-A",
            "rt_target_min": 1.0,
            "rt_window_min": 0.25,
        }],
        "extrapolation": "reject",
        "fail_on_out_of_range": False,
        "amount_semantics": "model_amount_as_reported",
        "allow_inline_inputs": False,
    }
    for k, v in overrides.items():
        p[k] = v
    return p


def run_quant(model_payload, table_rows, params, model_meta=None, return_ctx=False):
    """Run quantify_peaks on a synthetic promoted-model ctx. Returns the
    result dict (or (ctx, result) when return_ctx — for published-schema
    assertions; the ctx owns the QUANT run's manifest)."""
    ctx, path = make_quant_ctx(model_payload, table_rows, model_meta=model_meta,
                               parameters=params)
    try:
        out = q.quantify_peaks(ctx, params)
        return (ctx, out) if return_ctx else out
    finally:
        os.unlink(path)


def peak_table(areas_rts, area_percents=None, extra=True):
    """A GC-7 §A1-shaped sample table (columns + rows). ``areas_rts`` is a
    list of (area_pa_min, rt_min) — None area = the GC-7 declared-null shape
    (flags carry the reason)."""
    n = len(areas_rts)
    rows = []
    for i, (area, rt) in enumerate(areas_rts):
        flags = []
        if area is None:
            flags = ["UNRECOVERABLE_SATURATED"]
        rows.append({
            "peak": i + 1,
            "rt_min": rt,
            "height_pa": (area or 0.0) / 0.05,
            "area_pa_min": area,
            "width_min": 0.05,
            "area_percent": (area_percents[i] if area_percents else
                             (100.0 / n if area is not None else None)),
            "symmetry": 1.0,
            "saturated": area is None,
            "flags": flags,
        })
    columns = (["peak", "rt_min", "height_pa", "area_pa_min", "width_min",
                "area_percent", "symmetry", "saturated", "flags"] if extra else
               ["rt_min", "area_pa_min", "area_percent", "saturated", "flags"])
    if not extra:
        rows = [{k: r[k] for k in ("rt_min", "area_pa_min", "area_percent", "saturated", "flags")}
                for r in rows]
    return {"columns": columns, "rows": rows}


# ---------------------------------------------------------------------------
# Legs
# ---------------------------------------------------------------------------
class TestRoundTripRawArea(unittest.TestCase):
    """C1 round-trip: REAL fit_calibration output (y = 2x+1) consumed by the
    quantifier — declared amounts recovered to float epsilon; the reporting
    step is the model's x directly (model_amount_as_reported); the honesty
    sentence is verbatim in the published schema; the unit name is the
    MODEL's declared amount unit (no mid-chain re-labeling)."""

    def test_roundtrip_recovers_amounts(self):
        _ctx, _p, res = cal_ctx_and_fit(fx.C1)
        model = res["model"]
        # sample table: peaks at the level rts (1..5), areas = 2x+1
        table = peak_table([(3.0, 1.0), (5.0, 2.0), (7.0, 3.0), (9.0, 4.0), (11.0, 5.0)])
        params = quant_params(
            targets=[{"compound_label": "TEST-CMPD-A", "rt_target_min": 1.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-B", "rt_target_min": 2.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-C", "rt_target_min": 3.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-D", "rt_target_min": 4.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-E", "rt_target_min": 5.0, "rt_window_min": 0.25}],
            quant_tolerance_percent=1.0,  # declared by the test — echoed, never applied
        )
        got_ctx_out = run_quant(model, table["rows"], params, return_ctx=True)
        qctx, out = got_ctx_out
        self.assertEqual(out["amt_col"], "amount_ng_uL")
        self.assertEqual(out["rep_col"], "amount_reported_ng_uL")
        got = [r[out["amt_col"]] for r in out["rows"]]
        for g, want in zip(got, [1.0, 2.0, 3.0, 4.0, 5.0]):
            assert_close(self, g, want, "round-trip amount")
        # model_amount_as_reported: reported == the model's x, applied ONCE
        for r in out["rows"]:
            assert_close(self, r[out["rep_col"]], r[out["amt_col"]], "reported == x")
        # labels + refs: identity arrives only from the declared targets
        self.assertEqual([r["compound_label"] for r in out["rows"]],
                         ["TEST-CMPD-A", "TEST-CMPD-B", "TEST-CMPD-C", "TEST-CMPD-D", "TEST-CMPD-E"])
        # the model identity: the promoted artifact id from the dref path layout
        self.assertEqual(out["model_artifact_id"], "AOUT-000424")
        # the digest echo (A6): the CAL run's params_digest, verbatim
        self.assertEqual(out["rows"][0]["fit_detail"].get("rule"), "linear x = (y - a)/b")
        # metrics (A4.6)
        self.assertEqual(out["metrics"]["compounds_quantified"], 5)
        self.assertEqual(out["metrics"]["peaks_unassigned"], 0)
        self.assertEqual(out["metrics"]["out_of_range_count"], 0)
        self.assertEqual(out["metrics"]["model_artifact_id"], "AOUT-000424")
        self.assertEqual(out["metrics"]["model_params_digest"], res["model"]["params_digest"])
        # the honesty sentence — VERBATIM in the published schema (A4.5).
        art = next(a for a in qctx.manifest().artifacts if a.name == "quantified_peak_table")
        self.assertEqual(art.schema["columns"]["area_percent"], q.AREA_PERCENT_HONESTY)
        # the unit of the concentration columns is the MODEL's declared unit.
        self.assertEqual(art.units[out["amt_col"]], model["amount_unit"])
        self.assertEqual(art.units[out["rep_col"]], model["amount_unit"])
        # area_percent rides verbatim, in its own column (A4.5).
        for r, want in zip(out["rows"], [20.0, 20.0, 20.0, 20.0, 20.0]):
            assert_close(self, r["area_percent"], want, "area_percent verbatim")
        # response column = raw area verbatim (plain mode identity).
        for r, want in zip(out["rows"], [3.0, 5.0, 7.0, 9.0, 11.0]):
            assert_close(self, r["response"], want, "response verbatim")
        # determinism: same inputs twice → byte-identical rows (sort_keys).
        out2 = run_quant(copy.deepcopy(model), copy.deepcopy(table["rows"]), copy.deepcopy(params))
        self.assertEqual(json.dumps(out["rows"], sort_keys=True),
                         json.dumps(out2["rows"], sort_keys=True))

    def test_unassigned_peak_row_kept(self):
        """A4.2: a peak matching NO target → row kept, compound fields null +
        UNASSIGNED_PEAK (the peak is real; identity is unknown — never
        invented, never dropped)."""
        _ctx, _p, res = cal_ctx_and_fit(fx.C1)
        model = res["model"]
        table = peak_table([(3.0, 1.0), (77.0, 9.0)])  # the 9.0 peak matches no target
        out = run_quant(model, table["rows"], quant_params())
        self.assertIsNone(out["rows"][1]["compound_label"])
        self.assertIsNone(out["rows"][1]["compound_ref"])
        self.assertIn("UNASSIGNED_PEAK", out["rows"][1]["flags"])
        self.assertEqual(out["metrics"]["peaks_unassigned"], 1)
        assert_close(self, out["rows"][0][out["amt_col"]], 1.0, "assigned peak still quantified")


class TestRoundTripISTDRatio(unittest.TestCase):
    """C7 round-trip: the REAL ratio-mode model (response_quantity
    area_ratio) consumed with the declared ISTD role — the ratio is computed
    once per table and the declared amounts recovered; bait-#5 companion: the
    consumer NEVER re-divides (the response is area/istd once)."""

    def test_ratio_roundtrip(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE")
        params = {
            "model": "linear", "weighting": "none", "origin_constraint": False,
            "correlation_statistic": "weighted_r_squared", "amount_unit": "ng/uL",
            "istd": fx.c7_istd(fixture), "extrapolation": "reject",
            "fail_on_out_of_range": True, "allow_inline_inputs": True, "levels": levels,
        }
        ctx = Context(inputs={n: {"dataKind": "table", "inline": p} for n, p in inputs.items()},
                      parameters=params)
        res = fit_calibration(ctx, params)
        model = res["model"]
        self.assertEqual(model["response_quantity"], "area_ratio")
        # sample table: analyte peaks + the ISTD peak (area 1000)
        table = {
            "columns": ["peak", "rt_min", "height_pa", "area_pa_min", "width_min",
                        "area_percent", "symmetry", "saturated", "flags"],
            "rows": [
                {"peak": 1, "rt_min": 1.0, "height_pa": 50.0, "area_pa_min": 500.0,
                 "width_min": 0.05, "area_percent": 33.3, "symmetry": 1.0, "saturated": False, "flags": []},
                {"peak": 2, "rt_min": 2.0, "height_pa": 100.0, "area_pa_min": 1000.0,
                 "width_min": 0.05, "area_percent": 33.3, "symmetry": 1.0, "saturated": False, "flags": []},
                {"peak": 3, "rt_min": 3.0, "height_pa": 150.0, "area_pa_min": 1500.0,
                 "width_min": 0.05, "area_percent": 33.4, "symmetry": 1.0, "saturated": False, "flags": []},
                {"peak": 4, "rt_min": 5.0, "height_pa": 200.0, "area_pa_min": 1000.0,
                 "width_min": 0.05, "area_percent": 0.0, "symmetry": 1.0, "saturated": False, "flags": []},
            ],
        }
        qparams = quant_params(
            istd=fx.c7_istd(fixture),
            targets=[{"compound_label": "TEST-CMPD-ANALYTE", "rt_target_min": 1.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-ANALYTE-2", "rt_target_min": 2.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-ANALYTE-3", "rt_target_min": 3.0, "rt_window_min": 0.25}],
        )
        out = run_quant(model, table["rows"], qparams)
        # the ISTD peak (row 3, rt 5.0) is NOT a target → unassigned, and it is
        # never quantified off its own area (the guard that matters).
        self.assertIn("UNASSIGNED_PEAK", out["rows"][3]["flags"])
        got = [r[out["amt_col"]] for r in out["rows"][:3]]
        for g, want in zip(got, [1.0, 2.0, 3.0]):
            assert_close(self, g, want, "ratio round-trip amount")
        # the response column is the ONE ratio (area/istd), never a re-ratio.
        for r, want in zip(out["rows"][:3], [0.5, 1.0, 1.5]):
            assert_close(self, r["response"], want, "ratio response (computed once)")


class TestQuadraticInverse(unittest.TestCase):
    """C8: the REAL C4 quadratic model; a declared response y = 5 has TWO real
    roots (1.8321595661992318 and -21.832159566199234) — the selected root is
    the one NEAREST the fit-range midpoint (x in [1,5] → mid 3.0 → 1.832...),
    and BOTH roots ride fit_detail (auditable)."""

    def test_c8_quadratic_inverse(self):
        _ctx, _p, res = cal_ctx_and_fit(fx.C4, model="quadratic")
        model = res["model"]
        # response y = 5.0 at rt 1.0 (in range: model response range [3.1, 13.5])
        table = peak_table([(5.0, 1.0)])
        out = run_quant(model, table["rows"], quant_params())
        x = out["rows"][0][out["amt_col"]]
        assert_close(self, x, 1.8321595661992318, "selected root (nearest midpoint)")
        detail = out["rows"][0]["fit_detail"]
        self.assertEqual(len(detail["roots"]), 2)
        assert_close(self, detail["roots"][0], 1.8321595661992318, "root 1")
        assert_close(self, detail["roots"][1], -21.832159566199234, "root 2")
        assert_close(self, detail["fit_range_midpoint"], 3.0, "midpoint")
        self.assertIn("nearest the fit-range midpoint", detail["rule"])
        assert_close(self, detail["selected"], x, "selected == emitted x")

    def test_no_real_root(self):
        """c2 > 0 with a response below the vertex minimum → discriminant < 0
        → null + NO_REAL_ROOT (loud data, never a crash, never a guess)."""
        _ctx, _p, res = cal_ctx_and_fit(fx.C4, model="quadratic")
        model = res["model"]
        model = copy.deepcopy(model)
        # widen the x-range so the response 2.0 counts as "in range" while the
        # vertex (x=-10, y=-9) keeps disc < 0 for y=2.0: y - c0 = 1.0 →
        # disc = 4 - 4*0.1*1.0 = 3.6 > 0 — instead push c0 up: y below the
        # model's minimum on [x_min, x_max] is rejected as OUT_OF_RANGE; the
        # NO_REAL_ROOT corner is the quadratic corner (response in range,
        # selected root out of range) or a model with disc < 0 at in-range y.
        # Build it directly: c2=1, c1=0, c0=10 → y = x^2 + 10 (vertex 10);
        # x-range [0, 5] → response range [10, 35]; y = 5 is OUT_OF_RANGE.
        # For NO_REAL_ROOT: response IN [10,35] but x outside [0,5]: y=12 →
        # x = sqrt(2) = 1.414 IN range. y=36 is OOR. Use c2=-1 (concave):
        # y = -x^2 + 10, x in [0,5] → responses [10-25=-15 .. 10]; y = -14
        # → x = sqrt(24) = 4.899 IN range... pick y=0.5: x = sqrt(9.5)=3.08
        # IN range. The disc<0 corner: c2>0, y below vertex: vertex 10,
        # y=9.9 is in range [10..35]? NO (9.9 < 10 → OOR). The honest corner:
        # declare extension and a concave model where the root leaves the
        # extension... simplest true disc<0: c2=1, c1=0, c0=10, x in [0,5],
        # response range [10, 35]; with extension_low=0, extension_high=10
        # and y=36 → OOR anyway. So: c2=1, c1=0, c0=10; y=5.0 < 10 → the
        # module's declared path is OUT_OF_RANGE (fail or flag). NO_REAL_ROOT
        # is reached when the response IS in range but disc < 0 — impossible
        # for a single real model over a connected range; the corner is the
        # DEGENERATE path (c2=0, c1=0): the model payload's own coefficients.
        # Exercise the degenerate path via a hand-built model payload — the
        # contract (A4.1) still applies: this is the DECLARED no-root corner.
        degenerate = {
            "model_version": 1, "model": "quadratic",
            "equation": "response = 0.0 * x**2 + 0.0 * x + 5.0",
            "coefficients": {"c0": 5.0, "c1": 0.0, "c2": 0.0},
            "amount_unit": "ng/uL", "response_quantity": "raw_area_pa_min",
            "x_min": 0.0, "x_max": 10.0, "params_digest": "deadbeef",
        }
        # y = 5.0 everywhere: the model is a constant — no x solves it
        # uniquely; the degenerate c2=0/c1=0 corner names NO_REAL_ROOT.
        table = peak_table([(5.0, 1.0)])
        out = run_quant(degenerate, table["rows"], quant_params())
        self.assertIsNone(out["rows"][0][out["amt_col"]])
        self.assertIn("NO_REAL_ROOT", out["rows"][0]["flags"])
        self.assertIn("degenerate", out["rows"][0]["fit_detail"]["reason"])

    def test_extrapolated_flag_with_extension(self):
        """A4.3: extrapolation='allow_within_declared_extension' — a response
        OUTSIDE the model's [x_min, x_max]-derived response range, whose
        selected root (nearest the fit-range midpoint, the PINNED rule) lies
        INSIDE the declared extension bounds → the row is emitted with the
        amount flagged EXTRAPOLATED (visible, never a quiet number).

        Reachable corner: a CONCAVE model (c2 < 0) fit on [1,5], consumed
        with the declared fit range narrowed to [3,5] (vertex at x = 10 lies
        right of the range → the model is monotone increasing over it;
        response range [6.1, 8.5]). Response 9.0 is outside that range;
        its nearest root x = 10 − 2√5 ≈ 5.52786 is outside [3,5] but inside
        the declared extension [5, 20] → emitted flagged EXTRAPOLATED.
        The SAME model with extrapolation='reject' hard-fails (the declared
        policy is the difference — the arithmetic never guesses).
        """
        # y = 1 + 2x − 0.1x² — EXACT concave data (the fit recovers
        # c2 = −0.1, c1 = 2, c0 = 1 to float ε).
        fixture = {
            "x": [1, 2, 3, 4, 5],
            "y": [2.9, 4.6, 6.1, 7.4, 8.5],
            "weights": [1.0, 1.0, 1.0, 1.0, 1.0],
        }
        levels = [{"level": i + 1, "compound_label": f"TEST-CMPD-A",
                   "compound_ref": {"id": f"LC-CMPD-{i+1}"}, "amount": float(i + 1),
                   "rt_target_min": float(i + 1), "rt_window_min": 0.25,
                   "fit": True, "required": True}
                  for i in range(5)]
        inputs = fx.level_table_payloads(fixture, rt0=1.0, d_rt=1.0)
        params = {"model": "quadratic", "weighting": "none", "origin_constraint": False,
                  "correlation_statistic": "weighted_r_squared", "amount_unit": "ng/uL",
                  "istd": {"role": "none"}, "extrapolation": "reject",
                  "fail_on_out_of_range": True, "allow_inline_inputs": True, "levels": levels}
        ctx = Context(inputs={n: {"dataKind": "table", "inline": p} for n, p in inputs.items()},
                      parameters=params)
        model = copy.deepcopy(fit_calibration(ctx, params)["model"])
        # the declared fit range the consumer trusts (payload fields — the
        # contract): narrowed to [3,5] (vertex x = 10 lies outside it → the
        # model is monotone increasing on it; response range [6.1, 8.5])
        model["x_min"] = 3.0
        model["x_max"] = 5.0
        table = peak_table([(9.0, 1.0)])  # 9.0 > 8.5 (outside the response range)
        out = run_quant(model, table["rows"], quant_params(
            extrapolation="allow_within_declared_extension",
            extension_low=5.0, extension_high=20.0,
        ))
        # the nearest-midpoint root: 10 − 2√5 (the other root 10 + 2√5 is
        # farther from mid(3,5) = 4); both recorded in fit_detail (A4.3)
        x = out["rows"][0][out["amt_col"]]
        assert_close(self, x, 10.0 - (20.0 ** 0.5), "extrapolated root (10 − 2√5)")
        self.assertIn("EXTRAPOLATED", out["rows"][0]["flags"])
        self.assertEqual(len(out["rows"][0]["fit_detail"]["roots"]), 2)
        # the declared policy is the difference: the SAME model + response
        # under extrapolation='reject' → hard OUT_OF_RANGE (loud)
        with self.assertRaises(q.QuantificationError) as e:
            run_quant(copy.deepcopy(model), table["rows"], quant_params(
                fail_on_out_of_range=True))
        self.assertEqual(e.exception.code, "OUT_OF_RANGE")


class TestOutOfRangePolicy(unittest.TestCase):
    """C9: out-of-range sample, BOTH declared settings (bait-#7: the
    loudness is data — fail-mode is LOUD, flag-mode is VISIBLE, never a
    quiet number)."""

    def setUp(self):
        _ctx, _p, res = cal_ctx_and_fit(fx.C1)
        self.model = res["model"]
        # response 12.0 > model max 11.0 → OUT_OF_RANGE; the peak at rt 1.0
        # MATCHES the declared target (the loud message names the compound).
        self.table = peak_table([(12.0, 1.0)])

    def test_fail_mode_is_loud(self):
        params = quant_params(fail_on_out_of_range=True)
        with self.assertRaises(q.QuantificationError) as e:
            run_quant(self.model, self.table["rows"], params)
        self.assertEqual(e.exception.code, "OUT_OF_RANGE")
        self.assertIn("TEST-CMPD-A", str(e.exception))  # names the compound
        self.assertIn("12.0", str(e.exception))  # names the value

    def test_flag_mode_is_visible(self):
        out = run_quant(self.model, self.table["rows"], quant_params(fail_on_out_of_range=False))
        row = out["rows"][0]
        self.assertIsNone(row[out["amt_col"]])
        self.assertIsNone(row[out["rep_col"]])
        self.assertIn("OUT_OF_RANGE", row["flags"])
        self.assertEqual(out["metrics"]["out_of_range_count"], 1)


class TestISTDDoubleApplication(unittest.TestCase):
    """A3 bait-#5: the guard is BIDIRECTIONAL — both mismatch directions
    hard-fail ISTD_DOUBLE_APPLICATION naming both sides."""

    def test_istd_role_against_raw_model(self):
        _ctx, _p, res = cal_ctx_and_fit(fx.C1)  # raw_area_pa_min model
        model = res["model"]
        table = peak_table([(3.0, 1.0)])
        params = quant_params(istd={"role": "internal_standard", "compound_label": "TEST-ISTD",
                                    "rt_target_min": 5.0, "rt_window_min": 0.25})
        with self.assertRaises(q.QuantificationError) as e:
            run_quant(model, table["rows"], params)
        self.assertEqual(e.exception.code, "ISTD_DOUBLE_APPLICATION")
        self.assertIn("raw_area_pa_min", str(e.exception))
        self.assertIn("internal_standard", str(e.exception))

    def test_none_role_against_ratio_model(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE")
        params = {
            "model": "linear", "weighting": "none", "origin_constraint": False,
            "correlation_statistic": "weighted_r_squared", "amount_unit": "ng/uL",
            "istd": fx.c7_istd(fixture), "extrapolation": "reject",
            "fail_on_out_of_range": True, "allow_inline_inputs": True, "levels": levels,
        }
        ctx = Context(inputs={n: {"dataKind": "table", "inline": p} for n, p in inputs.items()},
                      parameters=params)
        model = fit_calibration(ctx, params)["model"]
        table = peak_table([(500.0, 1.0), (1000.0, 5.0)])
        with self.assertRaises(q.QuantificationError) as e:
            run_quant(model, table["rows"], quant_params())  # istd.role 'none'
        self.assertEqual(e.exception.code, "ISTD_DOUBLE_APPLICATION")
        self.assertIn("area_ratio", str(e.exception))


class TestQuantFailureMatrix(unittest.TestCase):
    """The quant-side named-failure matrix (spec T1 + A4)."""

    def setUp(self):
        _ctx, _p, res = cal_ctx_and_fit(fx.C1)
        self.model = res["model"]
        self.table = peak_table([(3.0, 1.0)])

    def expect_code(self, model, table, params, code, msg_part=None):
        with self.assertRaises(q.QuantificationError) as e:
            run_quant(model, table, params)
        self.assertEqual(e.exception.code, code)
        if msg_part:
            self.assertIn(msg_part, str(e.exception))
        return e

    def test_input_not_promoted(self):
        """A5: dict-inline model + allow_inline_inputs: false →
        INPUT_NOT_PROMOTED BEFORE any filesystem read."""
        ctx = Context(
            inputs={
                "calibration_model": {"dataKind": "table", "inline": self.model},
                "peak_table": {"dataKind": "table", "inline": self.table["rows"]},
            },
            parameters=quant_params(),
        )
        with self.assertRaises(q.QuantificationError) as e:
            q.quantify_peaks(ctx, quant_params())
        self.assertEqual(e.exception.code, "INPUT_NOT_PROMOTED")
        self.assertIn("never written", str(e.exception))

    def test_input_not_promoted_accept_branch(self):
        """A5 accept branch: the SAME dict-inline with allow_inline_inputs:
        true → the run proceeds (the declared parameter earning its keep)."""
        ctx = Context(
            inputs={
                "calibration_model": {"dataKind": "table", "inline": self.model},
                "peak_table": {"dataKind": "table", "inline": self.table["rows"]},
            },
            parameters=quant_params(allow_inline_inputs=True),
        )
        out = q.quantify_peaks(ctx, quant_params(allow_inline_inputs=True))
        assert_close(self, out["rows"][0][out["amt_col"]], 1.0, "accept branch round-trip")

    def test_model_payload_invalid_missing_key(self):
        bad = copy.deepcopy(self.model)
        del bad["coefficients"]
        self.expect_code(bad, self.table["rows"], quant_params(), "MODEL_PAYLOAD_INVALID",
                         "coefficients")

    def test_model_payload_invalid_bad_version(self):
        bad = copy.deepcopy(self.model)
        bad["model_version"] = 99
        self.expect_code(bad, self.table["rows"], quant_params(), "MODEL_PAYLOAD_INVALID",
                         "model_version")

    def test_model_payload_invalid_not_an_object(self):
        self.expect_code([self.model], self.table["rows"], quant_params(),
                         "MODEL_PAYLOAD_INVALID")

    def test_model_input_json_invalid(self):
        """A5 file-backed leg: the .bin bytes are not JSON → INPUT_JSON_INVALID."""
        ctx, path = make_quant_ctx(self.model, self.table["rows"])
        try:
            with open(path, "w") as f:
                f.write("not json")
            ctx._parameters = dict(quant_params())
            with self.assertRaises(q.QuantificationError) as e:
                q.quantify_peaks(ctx, quant_params())
            self.assertEqual(e.exception.code, "INPUT_JSON_INVALID")
        finally:
            os.unlink(path)

    def test_peak_table_shape_invalid(self):
        bad_table = {"columns": ["rt_min", "saturated"], "rows": [{"rt_min": 1.0, "saturated": False}]}
        self.expect_code(self.model, bad_table["rows"], quant_params(),
                         "PEAK_TABLE_SHAPE_INVALID")
        # the non-table corner
        self.expect_code(self.model, 42, quant_params(), "PEAK_TABLE_SHAPE_INVALID")

    def test_ambiguous_peak_match(self):
        table = peak_table([(3.0, 1.0), (4.0, 1.05)])  # two peaks in [1±0.25]
        self.expect_code(self.model, table["rows"], quant_params(),
                         "AMBIGUOUS_PEAK_MATCH", msg_part="MULTIPLE")

    def test_single_target_multiple_peaks_names_both_rows(self):
        # D5 per-target matching: ONE target matching TWO in-window peaks is
        # AMBIGUOUS_PEAK_MATCH naming the two row INDICES (0 and 1) — spec
        # A4.2 (a single row never names itself twice; the two DISTINCT row
        # indices are the two in-window peaks of the ONE target).
        # two peaks inside the SAME declared window [1±0.25]:
        table = peak_table([(3.0, 0.9), (3.5, 1.1)])
        p = quant_params(targets=[{"compound_label": "TEST-CMPD-A",
                                   "rt_target_min": 1.0, "rt_window_min": 0.25}])
        self.expect_code(self.model, table["rows"], p, "AMBIGUOUS_PEAK_MATCH",
                         msg_part="rows 0 and 1")

    def test_shared_window_single_peak_is_not_ambiguous(self):
        # D5 (the review's probes E+F): TWO declared targets sharing a window
        # ([0.75, 1.25] both) and a SINGLE peak in it must NOT raise
        # AMBIGUOUS_PEAK_MATCH (the original run raised it naming "rows 0 and
        # 0" — a row never conflicts with itself). The DECLARED precedence
        # rule resolves the shared row to the FIRST-named target (declared
        # targets order): the row is quantified ONCE by that target, the other
        # target is unmatched (TARGET_UNMATCHED), and the conflict is a
        # DECLARED warning log (TARGET_WINDOW_OVERLAP), never a silent
        # overwrite.
        table = peak_table([(3.0, 1.0)])  # one peak, rt 1.0, area 3.0
        p = quant_params(targets=[
            {"compound_label": "TEST-CMPD-A", "rt_target_min": 1.0, "rt_window_min": 0.25},
            {"compound_label": "TEST-CMPD-B", "rt_target_min": 1.25, "rt_window_min": 0.25},
        ])
        qctx, out = run_quant(self.model, table["rows"], p, return_ctx=True)
        rows = out["rows"]
        self.assertEqual(len(rows), 1)
        # the first-named target owns the shared row (declared precedence)
        self.assertEqual(rows[0]["compound_label"], "TEST-CMPD-A")
        assert_close(self, rows[0][out["amt_col"]], 1.0, "shared-row amount")
        self.assertEqual(rows[0]["flags"], [])  # quantified cleanly, no self-conflict
        # the second target claimed the row but lost the precedence rule →
        # unmatched (loudness is data)
        self.assertEqual(out["metrics"]["compounds_quantified"], 1)
        logs = qctx.manifest().logs
        overlap = [lg for lg in logs if lg.get("code") == "TARGET_WINDOW_OVERLAP"]
        self.assertEqual(len(overlap), 1)  # the conflict is DECLARED, exactly once
        self.assertIn("TEST-CMPD-A", overlap[0]["message"])
        self.assertIn("TEST-CMPD-B", overlap[0]["message"])
        self.assertIn("row 0", overlap[0]["message"])
        unmatched = [lg for lg in logs if lg.get("code") == "TARGET_UNMATCHED"]
        self.assertTrue(any("TEST-CMPD-B" in lg["message"] for lg in unmatched))

    def test_istd_peak_not_found(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE")
        params = {
            "model": "linear", "weighting": "none", "origin_constraint": False,
            "correlation_statistic": "weighted_r_squared", "amount_unit": "ng/uL",
            "istd": fx.c7_istd(fixture), "extrapolation": "reject",
            "fail_on_out_of_range": True, "allow_inline_inputs": True, "levels": levels,
        }
        ctx = Context(inputs={n: {"dataKind": "table", "inline": p} for n, p in inputs.items()},
                      parameters=params)
        model = fit_calibration(ctx, params)["model"]
        # sample table WITHOUT the ISTD peak
        table = peak_table([(500.0, 1.0)])
        qparams = quant_params(istd=fx.c7_istd(fixture))
        self.expect_code(model, table["rows"], qparams, "ISTD_PEAK_NOT_FOUND",
                         msg_part="no fallback to raw area")

    def test_istd_zero_area(self):
        fixture = fx.C7
        inputs = fx.c7_level_payloads(fixture)
        levels = fx.level_params(fixture, rt0=1.0, d_rt=1.0, compound_label="TEST-CMPD-ANALYTE")
        params = {
            "model": "linear", "weighting": "none", "origin_constraint": False,
            "correlation_statistic": "weighted_r_squared", "amount_unit": "ng/uL",
            "istd": fx.c7_istd(fixture), "extrapolation": "reject",
            "fail_on_out_of_range": True, "allow_inline_inputs": True, "levels": levels,
        }
        ctx = Context(inputs={n: {"dataKind": "table", "inline": p} for n, p in inputs.items()},
                      parameters=params)
        model = fit_calibration(ctx, params)["model"]
        # the ISTD peak is SATURATED (declared-null area) → the ratio is
        # undefined → ISTD_PEAK_NOT_FOUND (never a fallback to raw area)
        table = peak_table([(500.0, 1.0), (0.0, 5.0)], extra=False)
        table["rows"][1] = {"rt_min": 5.0, "area_pa_min": None, "area_percent": None,
                            "saturated": True, "flags": ["UNRECOVERABLE_SATURATED"]}
        qparams = quant_params(istd=fx.c7_istd(fixture))
        self.expect_code(model, table["rows"], qparams, "ISTD_PEAK_NOT_FOUND")

    def test_null_area_inherited(self):
        """A4.2: a peak with area_pa_min null [G7:313] carries the null
        through with the inherited code (never quantified from null)."""
        table = peak_table([(3.0, 1.0), (None, 2.0)])
        out = run_quant(self.model, table["rows"], quant_params(
            targets=[{"compound_label": "TEST-CMPD-A", "rt_target_min": 1.0, "rt_window_min": 0.25},
                     {"compound_label": "TEST-CMPD-B", "rt_target_min": 2.0, "rt_window_min": 0.25}]))
        row = out["rows"][1]
        self.assertIsNone(row[out["amt_col"]])
        self.assertIsNone(row["area_pa_min"])
        self.assertIn("UNRECOVERABLE_SATURATED", row["flags"])  # the inherited reason

    def test_extrapolation_unsupported(self):
        self.expect_code(self.model, self.table["rows"], quant_params(extrapolation="always"),
                         "EXTRAPOLATION_UNSUPPORTED")

    def test_amount_semantics_unsupported(self):
        self.expect_code(self.model, self.table["rows"], quant_params(amount_semantics="guess"),
                         "PARAM_INVALID")

    # NOTE: `allow_inline_inputs` is NOT in this list — it is a FAIL-CLOSED
    # GATE the loader reads (spec A5.1/T2-2), not a required parameter:
    # absent → INPUT_NOT_PROMOTED (the declared failure), never PARAM_MISSING.
    def test_param_missing(self):
        for field in ("istd", "targets", "extrapolation", "fail_on_out_of_range",
                      "amount_semantics"):
            p = quant_params()
            del p[field]
            with self.assertRaises(q.QuantificationError) as e:
                run_quant(self.model, self.table["rows"], p)
            self.assertEqual(e.exception.code, "PARAM_MISSING")
            self.assertIn(field, str(e.exception))

    def test_allow_inline_absent_is_the_gate_not_param_missing(self):
        """A5.1/T2-2 contract: the file-backed model + ABSENT
        `allow_inline_inputs` → the run proceeds via the file path (the gate
        only rejects dict-inline); a DICT-inline model + absent gate →
        INPUT_NOT_PROMOTED, never PARAM_MISSING (spec :432-435 + T2-2 :539)."""
        # file-backed model + absent gate → proceeds (the gate is inert for
        # file-backed inputs — the declared parameter is OPTIONAL, not required)
        p = quant_params()
        del p["allow_inline_inputs"]
        out = run_quant(self.model, self.table["rows"], p)
        assert_close(self, out["rows"][0][out["amt_col"]], 1.0, "absent gate + file-backed model")
        # dict-inline model + absent gate → the declared failure (INPUT_NOT_PROMOTED)
        ctx = Context(
            inputs={
                "calibration_model": {"dataKind": "table", "inline": self.model},
                "peak_table": {"dataKind": "table", "inline": self.table["rows"]},
            },
            parameters=p,
        )
        with self.assertRaises(q.QuantificationError) as e:
            q.quantify_peaks(ctx, p)
        self.assertEqual(e.exception.code, "INPUT_NOT_PROMOTED")

    def test_unknown_param(self):
        p = quant_params()
        p["extra_thinking"] = 1
        self.expect_code(self.model, self.table["rows"], p, "PARAM_INVALID",
                         "extra_thinking")

    def test_apply_multipliers_once(self):
        """A4.4: amount_semantics='apply_multipliers' — the factors are
        applied EXACTLY ONCE in the reporting step (multiplier × amount ÷
        dilution); the model column is untouched by the factors."""
        out = run_quant(self.model, self.table["rows"], quant_params(
            amount_semantics="apply_multipliers",
            sample={"multiplier": 2.0, "dilution": 4.0},
        ))
        x = out["rows"][0][out["amt_col"]]
        assert_close(self, x, 1.0, "model x untouched")
        assert_close(self, out["rows"][0][out["rep_col"]], 0.5,
                     "reported = x * 2.0 / 4.0 (applied once)")

    def test_apply_multipliers_requires_sample(self):
        self.expect_code(self.model, self.table["rows"],
                         quant_params(amount_semantics="apply_multipliers"),
                         "PARAM_MISSING", "sample")

    def test_dilution_zero(self):
        self.expect_code(self.model, self.table["rows"],
                         quant_params(amount_semantics="apply_multipliers",
                                      sample={"multiplier": 1.0, "dilution": 0.0}),
                         "PARAM_INVALID", "dilution")

    def test_target_missing_field(self):
        p = quant_params(targets=[{"compound_label": "TEST-CMPD-A"}])
        self.expect_code(self.model, self.table["rows"], p, "PARAM_MISSING", "rt_target_min")

    def test_target_window_invalid(self):
        p = quant_params(targets=[{"compound_label": "TEST-CMPD-A",
                                   "rt_target_min": 1.0, "rt_window_min": 0.0}])
        self.expect_code(self.model, self.table["rows"], p, "RT_WINDOW_INVALID")

    def test_istd_window_invalid(self):
        p = quant_params(istd={"role": "internal_standard", "compound_label": "TEST-ISTD",
                               "rt_target_min": 1.0, "rt_window_min": -1.0})
        self.expect_code(self.model, self.table["rows"], p, "RT_WINDOW_INVALID")


if __name__ == "__main__":
    unittest.main()
