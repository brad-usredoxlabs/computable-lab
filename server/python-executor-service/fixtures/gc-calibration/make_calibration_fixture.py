"""GC-8 fixtures — deterministic calibration level sets + synthetic peak
tables (spec Fixtures C1-C10; Leg 1 ships C1/C3/C6; Leg 2 adds C2/C4/C5/C7
+ the failure-matrix builders; Leg 3 consumes the model outputs for C8/C9).

Generator-produced data only (GC-6/GC-7 doctrine): NO committed signal
bytes, NO real NAS bytes (B2). Every compound identity is a GENERIC label
(``TEST-CMPD-*``) — real labels appear only in the lane-only smoke script's
heredoc (B2 + the spec's hardcode greps).

Expected coefficients are HAND-CHECKED exact rationals (computed with exact
rational arithmetic by the spec's composer; the float literals below are
their exact IEEE-754 doubles):

- C1: linear, w=none, x=1..5 on y = 2x+1
      intercept = 1.0, slope = 2.0 EXACT, weighted_r_squared = 1.0,
      all relative_residual = 0.0
- C3: linear, w=(1,1,4), points (1,2),(2,4),(3,9)
      slope = 26/7 = 3.7142857142857144, intercept = -16/7 = -2.2857142857142856,
      r2_w = 0.9657142857142857 (the WEIGHTED statistic — plain unweighted
      r^2 on this data = 0.9364207221350078, DIFFERENT by construction; the
      test asserting the weighted value is the anti-laundering assertion),
      relative residuals = -200/7 %, +200/7 %, -100/63 %
      (= -28.571428..., +28.571428..., -1.587301... %)
- C6: origin_constraint=true FORCED on y = 2x+1, x=1..4
      slope = 70/30 = 7/3 = 2.3333333333333335 EXACT (= sum(w*x*y)/sum(w*x^2),
      w=1) — proves the forcing happened and is VISIBLE in the residuals
      (non-zero!), the equation string, and the statistic. A "forced" fit
      that secretly keeps an intercept shows slope = 2.0 — the test
      discriminates (bait #4).
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

# Exact-rational fixture expectations (hand-checked; see the module docstring).
C1 = {
    "x": [1, 2, 3, 4, 5],
    "y": [3.0, 5.0, 7.0, 9.0, 11.0],  # y = 2x + 1
    "weights": [1.0, 1.0, 1.0, 1.0, 1.0],
    "expected_intercept": 1.0,
    "expected_slope": 2.0,
    "expected_r2_w": 1.0,
    "expected_residuals": [0.0, 0.0, 0.0, 0.0, 0.0],
}
C3 = {
    "x": [1, 2, 3],
    "y": [2.0, 4.0, 9.0],
    "weights": [1.0, 1.0, 4.0],
    "expected_slope": 3.7142857142857144,       # 26/7
    "expected_intercept": -2.2857142857142856,  # -16/7
    "expected_r2_w": 0.9657142857142857,        # 169/175
    "expected_residuals": [
        -28.571428571428573,  # -200/7
        28.571428571428570,   # +200/7
        -1.5873015873015872,  # -100/63
    ],
}
C6 = {
    "x": [1, 2, 3, 4],
    "y": [3.0, 5.0, 7.0, 9.0],  # y = 2x + 1 (the FORCED origin fit must distort)
    "weights": [1.0, 1.0, 1.0, 1.0],
    "expected_slope": 2.3333333333333335,  # 7/3 = sum(x*y)/sum(x^2) = 70/30
    # Non-ZERO residuals are the bait-#4 discriminator: the forced fit's
    # residuals are (fitted - observed)/observed * 100 on y = 2x+1:
    # x=1: (7/3 - 3)/3*100 = -22.222...; x=2: (14/3 - 5)/5*100 = -6.666...;
    # x=3: (7 - 7)/7*100 = 0.0; x=4: (28/3 - 9)/9*100 = 2.777...
    "expected_residuals": [
        -22.222222222222221,  # (7/3-3)/3*100 = -200/9
        -6.666666666666666,   # (14/3-5)/5*100 = -20/3
        0.0,                  # (7-7)/7*100
        3.7037037037037037,   # (28/3-9)/9*100 = 100/27
    ],
}
C4 = {
    # quadratic, w=none, x=1..5 on y = 1 + 2x + 0.1x^2 (1/10 exact rational)
    "x": [1, 2, 3, 4, 5],
    "y": [3.1, 5.4, 7.9, 10.6, 13.5],
    "weights": [1.0, 1.0, 1.0, 1.0, 1.0],
    "expected_c0": 1.0,
    "expected_c1": 2.0,
    "expected_c2": 0.1,  # 1/10
}
C5 = {
    # linear_through_origin, points (1,3),(2,6),(3,9),(4,12)
    "x": [1, 2, 3, 4],
    "y": [3.0, 6.0, 9.0, 12.0],
    "weights": [1.0, 1.0, 1.0, 1.0],
    "expected_slope": 3.0,
}
# C7 — ISTD ratio mode: level tables each carry an analyte peak + a declared
# ISTD peak; analyte area = k*amount (k=500 pA*min per ng/uL), ISTD area
# constant 1000 pA*min → ratio = 0.5*amount EXACT. The ratio-curve slope is
# k/1000 = 0.5 EXACT; response_quantity == "area_ratio"; the quant round-trip
# recovers the declared amounts (Leg 3 consumes this model).
C7 = {
    "x": [1.0, 2.0, 3.0],
    "k": 500.0,  # pA*min per ng/uL (declared synthetic response factor)
    "istd_area": 1000.0,  # constant ISTD peak area (pA*min)
    "analyte_rt": [1.0, 2.0, 3.0],
    "istd_rt": 5.0,
    "expected_slope": 0.5,  # k/1000 exact
    "expected_intercept": 0.0,
}


def peak_table(rt: float, area_pa_min: float, flags: List[str] | None = None,
               saturated: bool = False, extra_columns: bool = False) -> Dict[str, Any]:
    """A synthetic peak-table payload in the GC-7 §A1 shape ({columns, rows}).

    Carries the SHIPPED column set (rt_min/height_pa/area_pa_min/area_percent/
    saturated/flags — plus the shipped width_min/symmetry extras when
    ``extra_columns``) so the consumer's SUBSET shape check is exercised
    against the shipped superset (B1 re-pin). Compound identities are
    GENERIC labels only.
    """
    rows = [{
        "peak": 1,
        "rt_min": rt,
        "height_pa": area_pa_min / 0.05 if area_pa_min else 0.0,  # cosmetic synthetic height
        "area_pa_min": area_pa_min,
        "width_min": 0.05,
        "area_percent": 100.0,
        "symmetry": 1.0,
        "saturated": saturated,
        "flags": flags if flags is not None else [],
    }]
    if extra_columns:
        columns = ["peak", "rt_min", "height_pa", "area_pa_min", "width_min",
                   "area_percent", "symmetry", "saturated", "flags"]
    else:
        columns = ["rt_min", "area_pa_min", "saturated", "flags"]
        rows = [{
            "rt_min": r["rt_min"], "area_pa_min": r["area_pa_min"],
            "saturated": r["saturated"], "flags": r["flags"],
        } for r in rows]
    return {"columns": columns, "rows": rows}


def two_peak_table(analyte: Tuple[float, float], istd: Tuple[float, float],
                   ) -> Dict[str, Any]:
    """ISTD-mode level table: analyte peak + declared ISTD peak (C7 shape)."""
    ar_a, rt_a = analyte
    ar_i, rt_i = istd
    total = ar_a + ar_i
    return {
        "columns": ["peak", "rt_min", "height_pa", "area_pa_min", "width_min",
                    "area_percent", "symmetry", "saturated", "flags"],
        "rows": [
            {"peak": 1, "rt_min": rt_a, "height_pa": ar_a / 0.05, "area_pa_min": ar_a,
             "width_min": 0.05, "area_percent": 100.0 * ar_a / total, "symmetry": 1.0,
             "saturated": False, "flags": []},
            {"peak": 2, "rt_min": rt_i, "height_pa": ar_i / 0.05, "area_pa_min": ar_i,
             "width_min": 0.05, "area_percent": 100.0 * ar_i / total, "symmetry": 1.0,
             "saturated": False, "flags": []},
        ],
    }


def c7_level_payloads(fixture: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """C7 per-level tables: analyte peak (area = k*amount) + declared ISTD
    peak (constant area) — the ISTD combination's raw material."""
    out = {}
    for i, amount in enumerate(fixture["x"]):
        out[f"level_{i + 1}"] = two_peak_table(
            (fixture["k"] * amount, fixture["analyte_rt"][i]),
            (fixture["istd_area"], fixture["istd_rt"]),
        )
    return out


def c7_istd(fixture: Dict[str, Any], label: str = "TEST-ISTD") -> Dict[str, Any]:
    """The declared ISTD parameter block for C7 (names WHICH peak row is the
    internal standard in each table — matched by the same RT-window
    machinery as any compound)."""
    return {
        "role": "internal_standard",
        "compound_label": label,
        "rt_target_min": fixture["istd_rt"],
        "rt_window_min": 0.25,
    }


def level_table_payloads(fixture: Dict[str, Any], rt0: float = 1.0, d_rt: float = 0.5,
                         input_names: List[str] | None = None,
                         extra_columns: bool = False) -> Dict[str, Dict[str, Any]]:
    """Build the per-level peak-table INPUT payloads for a fixture: one table
    per (x_i, y_i) point, peak at rt0 + i*d_rt with area = y_i (pA*min)."""
    n = len(fixture["x"])
    names = input_names or [f"level_{i + 1}" for i in range(n)]
    return {
        names[i]: peak_table(rt0 + i * d_rt, float(fixture["y"][i]), extra_columns=extra_columns)
        for i in range(n)
    }


def level_params(fixture: Dict[str, Any], rt0: float = 1.0, d_rt: float = 0.5,
                 input_names: List[str] | None = None,
                 compound_label: str = "TEST-CMPD-A",
                 rt_window: float = 0.25,
                 weights: List[float] | None = None) -> List[Dict[str, Any]]:
    """The DECLARED levels[] parameter entries for a fixture (levels are
    PARAMETERS, peak tables are named INPUTS — spec OQ5). ``weights`` are the
    per-level DECLARED weights (C3's w=1,1,4 — DATA, the more-specific
    declaration channel; absent when the `weighting` scheme applies)."""
    n = len(fixture["x"])
    names = input_names or [f"level_{i + 1}" for i in range(n)]
    out = []
    for i in range(n):
        entry = {
            "level": i + 1,
            "compound_label": compound_label,
            "amount": float(fixture["x"][i]),
            "rt_target_min": rt0 + i * d_rt,
            "rt_window_min": rt_window,
            "fit": True,
            "required": False,
            "input_names": [names[i]],
        }
        if weights is not None:
            entry["weight"] = float(weights[i])
        out.append(entry)
    return out
