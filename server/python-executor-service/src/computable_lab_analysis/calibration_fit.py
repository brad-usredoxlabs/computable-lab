"""GC-8 — calibration_fit: declared-parameters calibration curve fitting.

The calibration revision's module (spec §A0-A3, §A5, §A6). Everything
scientific is a DECLARED parameter — model set, weighting, origin constraint,
correlation statistic, amount unit, ISTD role, per-level fit eligibility /
required flag, RT windows, amounts, units (B5: ZERO defaults, ZERO hardcoded
domain truth). The fit is weighted least squares via the normal equations on
stdlib floats (OQ3: stdlib-only, no numpy/scipy); summation uses
``math.fsum`` over a FIXED level order for determinism (§A2.8).

Inputs: ONE peak-table-shaped input PER standard level (named ``level_<k>``
by convention, or overridden per level by the declared ``input_names``) —
GC-7 ``peak_table`` shape ``{columns, rows}`` (or a bare rows list). The
module classifies by CONTENT (shape-checks the required column subset) and
NEVER by GC-4/GC-7 naming. Compound identities are ref/label DATA echoed
verbatim — never parsed, never branched on.

The ISTD combination is THIS module's declared step (spec §A3): GC-7 tables
carry RAW areas (no ISTD normalization, no compound identity — [G7:286-289]);
the ONLY division by an ISTD area anywhere is here. ``quantification.py``
never divides again (the ``ISTD_DOUBLE_APPLICATION`` guard is bidirectional).

Failure codes (spec §A2.7) are raised as ``CalibrationError(code)``; the
runner surfaces them in RUN_FAILED. ``NO_MATCHING_PEAK`` is per-level (row
present, response null) unless the level declared ``required: true`` →
hard ``LEVEL_UNMATCHED`` — ``required`` is a required boolean per level
entry; no default may decide it.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .ctx import DatasetHandle

# ---------------------------------------------------------------------------
# Declared enums + constants (declared values, not domain truth)
# ---------------------------------------------------------------------------
MODEL_ENUM: Tuple[str, ...] = ("linear", "linear_through_origin", "quadratic")
WEIGHTING_ENUM: Tuple[str, ...] = ("none", "1/x", "1/x^2", "1/y^2")
STATISTIC_ENUM: Tuple[str, ...] = ("weighted_r_squared", "max_abs_relative_residual")
ISTD_ROLE_ENUM: Tuple[str, ...] = ("none", "internal_standard")
EXTRAPOLATION_ENUM: Tuple[str, ...] = ("reject", "allow_within_declared_extension")
RESPONSE_QUANTITY_RAW = "raw_area_pa_min"
RESPONSE_QUANTITY_RATIO = "area_ratio"
CALIBRATION_SCOPE = "analytical"  # lexical-distinctness marker (B4): analytical
                                   # calibration, NOT the acquisition calibration-record
                                   # vocabulary — a payload value, never a kind/id.

# The GC-7 peak_table columns THIS consumer reads (B1 re-pin: the shipped table
# ALSO carries width_min + symmetry — the shape check is SUBSET, not equality,
# so extra columns are ignored).
PEAK_TABLE_REQUIRED_COLUMNS = ("rt_min", "area_pa_min", "saturated", "flags")

# The declared failure-token vocabulary (spec §A2.7 + the consumer-side codes
# the spec's failure matrix names).
CODE_LEVEL_AMOUNT_MISSING = "LEVEL_AMOUNT_MISSING"
CODE_DUPLICATE_LEVEL = "DUPLICATE_LEVEL"
CODE_UNIT_INVALID = "UNIT_INVALID"
CODE_RT_WINDOW_INVALID = "RT_WINDOW_INVALID"
CODE_NO_FIT_POINTS = "NO_FIT_POINTS"
CODE_INSUFFICIENT_POINTS = "INSUFFICIENT_POINTS"
CODE_MODEL_UNSUPPORTED = "MODEL_UNSUPPORTED"
CODE_ORIGIN_CONSTRAINT_UNSUPPORTED = "ORIGIN_CONSTRAINT_UNSUPPORTED"
CODE_WEIGHTING_UNSUPPORTED = "WEIGHTING_UNSUPPORTED"
CODE_WEIGHT_UNDEFINED_AT_ZERO = "WEIGHT_UNDEFINED_AT_ZERO"
# D3: per-point declared weights (levels[i].weight) are MUTUALLY EXCLUSIVE with a
# conflicting `weighting` scheme — declaring BOTH channels is a parameter
# conflict, loud-failed (never silently one channel overrides the other) with
# the declared PARAM_INVALID token (this module's existing invalid-parameter
# vocabulary; the spec's calibration-leg failure vocabulary enumerates no
# weighting-conflict token), and the model payload emits an
# `effective_weighting` marker so the declared-scheme field never says "none"
# while weights were applied.
CODE_STATISTIC_UNSUPPORTED = "STATISTIC_UNSUPPORTED"
CODE_STATISTIC_UNDEFINED = "STATISTIC_UNDEFINED"
CODE_INPUT_NOT_PROMOTED = "INPUT_NOT_PROMOTED"
CODE_INPUT_JSON_INVALID = "INPUT_JSON_INVALID"
CODE_INPUT_MISSING = "INPUT_MISSING"
CODE_PEAK_TABLE_SHAPE_INVALID = "PEAK_TABLE_SHAPE_INVALID"
CODE_ISTD_PEAK_NOT_FOUND = "ISTD_PEAK_NOT_FOUND"
CODE_NO_MATCHING_PEAK = "NO_MATCHING_PEAK"
CODE_LEVEL_UNMATCHED = "LEVEL_UNMATCHED"
CODE_AMBIGUOUS_PEAK_MATCH = "AMBIGUOUS_PEAK_MATCH"
CODE_FIT_ILL_CONDITIONED = "FIT_ILL_CONDITIONED"

# Null/reason pairing invariant (GC-7's, inherited): every null numeric cell
# names its code in ``flags``; the test asserts both directions.
REASON_EXCLUDED_FROM_FIT = "EXCLUDED_FROM_FIT"
REASON_ZERO_OBSERVED = "ZERO_OBSERVED"
REASON_STATISTIC_UNDEFINED = "STATISTIC_UNDEFINED"

# Float-epsilon constant, declared as such (B5: the only numeric literal
# permitted in algorithm position is a named float-epsilon; every scientific
# threshold is a declared parameter).
_EXACT_EPS = 1e-12  # float-epsilon: exact-rational fixtures vs float arithmetic
# Scale-relative near-singularity guard for the determinant test (§A2.8):
# det/(scale^2) below this → ill-conditioned, a DECLARED failure.
_SINGULARITY_REL_EPS = 1e-12  # float-epsilon: relative scale of the 2x2/3x3 determinant

MODEL_VERSION = 1  # the artifact's payload version (declared contract, A6)

# Parameter schema (spec §A7) — REQUIRED lists; the module is the validator.
CAL_REQUIRED_PARAMS: Tuple[str, ...] = (
    "model",
    "weighting",
    "origin_constraint",
    "correlation_statistic",
    "amount_unit",
    "istd",
    "extrapolation",
    "fail_on_out_of_range",
    "levels",
)
# NOTE: `allow_inline_inputs` is NOT a required parameter — it is a
# FAIL-CLOSED GATE the loader reads (spec A5.1 + T2-2): a dict-inline input is
# allowed ONLY when it is declared true; ABSENT → INPUT_NOT_PROMOTED (the
# declared failure), never PARAM_MISSING and never normalization-by-default.
# The shipped spine promotes instead (POST /analysis-artifacts/:id/promote).
# It is still a DECLARED (known) parameter — the spec's parameterSchema lists
# it (CAL :468 / QUANT :470) — so it lives in the known set, just not required.
CAL_OPTIONAL_PARAMS: Tuple[str, ...] = (
    # the A5 fail-closed gate (declared param; absent → INPUT_NOT_PROMOTED).
    "allow_inline_inputs",
    # Declare the calibration run's id when known so the model artifact carries
    # machine-readable lineage (A6 calibration_run_id). The submitter wired it,
    # so it is DATA; absent → the payload field is null (never guessed).
    "calibration_run_id",
)
CAL_KNOWN_PARAMS = frozenset(CAL_REQUIRED_PARAMS) | frozenset(CAL_OPTIONAL_PARAMS)

LEVEL_REQUIRED_FIELDS: Tuple[str, ...] = (
    "level",
    "compound_label",
    "amount",
    "rt_target_min",
    "rt_window_min",
    "fit",
    "required",
)
# Optional per-level fields (spec §A7 + the fixture table: C3 declares w =
# 1,1,4 as DATA — the per-point declared-weight channel; the `weighting`
# enum is the standard-scheme channel, and a per-level declared weight is
# the more specific declaration, so it wins when present).
LEVEL_OPTIONAL_FIELDS: Tuple[str, ...] = ("compound_ref", "input_names", "weight")


class CalibrationError(Exception):
    """A named calibration failure. ``code`` is the declared failure token
    (spec §A2.7) that the runner surfaces in RUN_FAILED."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Parameter validation helpers (GC-7 doctrine: loud, named, zero defaults)
# ---------------------------------------------------------------------------
def _params_digest(params: Dict[str, Any]) -> str:
    """sha256 of the canonicalized params JSON (GC-7 _params_digest formula)."""
    return hashlib.sha256(
        json.dumps(params, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _require_present(p: Dict[str, Any], name: str) -> None:
    if name not in p:
        raise CalibrationError(
            "PARAM_MISSING", f"required parameter '{name}' is absent — no default is applied"
        )


def _require_bool(p: Dict[str, Any], name: str) -> bool:
    _require_present(p, name)
    v = p[name]
    if not isinstance(v, bool):
        raise CalibrationError("PARAM_INVALID", f"parameter '{name}' must be a boolean, got {v!r}")
    return v


def _require_number(p: Dict[str, Any], name: str, *, minimum: Optional[float] = None) -> float:
    _require_present(p, name)
    v = p[name]
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise CalibrationError("PARAM_INVALID", f"parameter '{name}' must be a number, got {v!r}")
    fv = float(v)
    if not math.isfinite(fv):
        raise CalibrationError("PARAM_INVALID", f"parameter '{name}' must be finite, got {v!r}")
    if minimum is not None and fv < minimum:
        raise CalibrationError("PARAM_INVALID", f"parameter '{name}'={fv} is below its declared minimum {minimum}")
    return fv


def _require_enum(p: Dict[str, Any], name: str, allowed: Tuple[str, ...], code: str) -> str:
    _require_present(p, name)
    v = p[name]
    if v not in allowed:
        raise CalibrationError(code, f"parameter '{name}' must be one of {list(allowed)}, got {v!r}")
    return v


# ---------------------------------------------------------------------------
# A5 — the promoted-input load path (anchor-fact-driven; GC-8's OWN helper,
# zero platform change). NEVER the ctx.py row-coercion helper (its numeric-guessing
# coercion is a silent identity-corruptor for compound labels and a silent
# mangle of ref objects). file_bytes + json.loads only.
# ---------------------------------------------------------------------------
def load_structured_input(handle: DatasetHandle, params: Dict[str, Any]) -> Any:
    """Load a table/model-shaped input payload verbatim.

    1. Dict-inline (an UNPROMOTED inline artifact's ``inlineValue`` is a dict;
       the runner provisions it as ``<name>.inline`` — a file that is NEVER
       WRITTEN, analysisRunner.ts:195 [F-run]): allowed ONLY when
       ``allow_inline_inputs`` is DECLARED true (a fail-closed gate, not a
       required parameter — spec A5.1 + T2-2: ABSENT → INPUT_NOT_PROMOTED,
       the declared failure; the shipped spine promotes instead). Otherwise
       ``INPUT_NOT_PROMOTED`` is raised BEFORE any filesystem read — never a
       FileNotFoundError.
    2. List-inline (the shipped inline-list edge): the payload is already in
       memory — returned verbatim (no filesystem, no coercion).
    3. File-backed (promoted dref streamed to ``<name>.bin`` [F :166-176], or
       a data-reference input): ``json.loads`` of the raw bytes;
       unreadable/invalid JSON → ``INPUT_JSON_INVALID``.
    """
    # A5 gate: fail-closed read. `params.get(name)` WITHOUT a default — the
    # absence IS the declared reject path (INPUT_NOT_PROMOTED), so no default
    # is ever supplied (B5: zero defaults; the gate decides, not a fallback).
    allow_inline = params.get("allow_inline_inputs") is True
    inline = handle.inline
    if isinstance(inline, dict):
        if not allow_inline:
            raise CalibrationError(
                CODE_INPUT_NOT_PROMOTED,
                f"input '{handle.name}' is an unpromoted dict-inline artifact "
                f"(inlineValue is a dict; the '.inline' file is never written) — "
                f"promote it first (POST /analysis-artifacts/:id/promote) or declare "
                f"allow_inline_inputs: true; declared failure, never a FileNotFoundError",
            )
        return inline
    if isinstance(inline, list):
        return inline
    if inline is not None:
        # a NON-structured inline value (scalar/string): pass it through — the
        # CALLER's shape/contract check raises the consumer-side code
        # (PEAK_TABLE_SHAPE_INVALID for tables, MODEL_PAYLOAD_INVALID for the
        # model). The loader never guesses, never coerces (A5).
        return inline
    if handle.path:
        try:
            raw = Path(handle.path).read_bytes()
        except OSError as e:
            raise CalibrationError(
                CODE_INPUT_JSON_INVALID, f"input '{handle.name}' is unreadable at {handle.path}: {e}"
            )
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise CalibrationError(
                CODE_INPUT_JSON_INVALID, f"input '{handle.name}' is not valid JSON: {e}"
            )
    raise CalibrationError(
        CODE_INPUT_JSON_INVALID, f"input '{handle.name}' has neither a file path nor inline data"
    )


def _peak_table_shape(payload: Any, input_name: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Consumer-side shape check (A2.7 PEAK_TABLE_SHAPE_INVALID): the required
    GC-7 §A1 column SUBSET is present — never a re-derivation, never a
    re-computation of a GC-7 column. Extra columns (width_min, symmetry, ...)
    are ignored (B1: subset, not equality)."""
    if isinstance(payload, list):
        rows = [dict(r) for r in payload if isinstance(r, dict)]
        if not rows:
            raise CalibrationError(
                CODE_PEAK_TABLE_SHAPE_INVALID, f"input '{input_name}' is an empty peak table"
            )
        colset = set()
        for r in rows:
            colset.update(r.keys())
    elif isinstance(payload, dict):
        rows = payload.get("rows")
        if not isinstance(rows, list):
            raise CalibrationError(
                CODE_PEAK_TABLE_SHAPE_INVALID,
                f"input '{input_name}' peak table has no 'rows' list (GC-7 §A1 shape)",
            )
        cols = payload.get("columns")
        if isinstance(cols, list):
            colset = set()
            for c in cols:
                if isinstance(c, dict):
                    name = c.get("name")
                    if isinstance(name, str):
                        colset.add(name)
                elif isinstance(c, str):
                    colset.add(c)
        else:
            # No declared column list — derive from the rows' keys (the
            # consumer-side check; the required subset must still be present).
            colset = set()
            for r in rows:
                if isinstance(r, dict):
                    colset.update(r.keys())
        rows = [dict(r) for r in rows if isinstance(r, dict)]
    else:
        raise CalibrationError(
            CODE_PEAK_TABLE_SHAPE_INVALID,
            f"input '{input_name}' is not a peak table (expected {{columns, rows}} or a rows list)",
        )
    missing = [c for c in PEAK_TABLE_REQUIRED_COLUMNS if c not in colset]
    if missing:
        raise CalibrationError(
            CODE_PEAK_TABLE_SHAPE_INVALID,
            f"input '{input_name}' peak table is missing required column(s) {missing} "
            f"(GC-7 §A1 subset: {list(PEAK_TABLE_REQUIRED_COLUMNS)})",
        )
    return sorted(colset), rows


# ---------------------------------------------------------------------------
# Level-matrix assembly (parameters + inputs → one fit point per fit level)
# ---------------------------------------------------------------------------
def _resolve_level_input(ctx: Any, input_names: List[str]) -> Tuple[str, Any]:
    """Search the declared input names in order; the first that is provisioned
    wins. Absent everywhere → INPUT_MISSING (named; never a KeyError leak)."""
    last_err: Optional[Exception] = None
    for name in input_names:
        try:
            handle = ctx.input(name)
        except KeyError as e:
            last_err = e
            continue
        return name, load_structured_input(handle, _params_of(ctx))
    raise CalibrationError(
        CODE_INPUT_MISSING,
        f"no provisioned input among the declared name(s) {input_names} "
        f"(looked for a peak table; {last_err})",
    )


def _params_of(ctx: Any) -> Dict[str, Any]:
    return dict(ctx.parameters)


def _match_peak_in_window(rows: List[Dict[str, Any]], rt_target: float, rt_window: float,
                          what: str) -> Tuple[Optional[int], Optional[int]]:
    """Peaks with rt_min in [rt_target - rt_window, rt_target + rt_window].
    Returns (count, index) — the caller decides loudness (A4.2: multiple →
    AMBIGUOUS_PEAK_MATCH naming both rows; zero → the caller's per-context
    code). NO nearest-RT rescue anywhere."""
    lo = rt_target - rt_window
    hi = rt_target + rt_window
    idxs = [i for i, r in enumerate(rows) if _rt_in(r, lo, hi)]
    if not idxs:
        return 0, None
    if len(idxs) > 1:
        return len(idxs), idxs[0]
    return 1, idxs[0]


def _rt_in(row: Dict[str, Any], lo: float, hi: float) -> bool:
    rt = row.get("rt_min")
    if isinstance(rt, bool) or not isinstance(rt, (int, float)):
        return False
    return lo <= float(rt) <= hi


def _row_area(row: Dict[str, Any], what: str) -> Tuple[Optional[float], Optional[str]]:
    """The row's declared area_pa_min with its inherited null reason (GC-7's
    declared-nulls pair with reason codes in flags — inherited verbatim,
    never re-derived)."""
    area = row.get("area_pa_min")
    if area is None:
        flags = row.get("flags")
        reason = None
        if isinstance(flags, list) and flags and isinstance(flags[0], str):
            reason = flags[0]
        if reason is None:
            raise CalibrationError(
                CODE_PEAK_TABLE_SHAPE_INVALID,
                f"peak row ({what}) has null area_pa_min with no declared reason in flags — "
                f"violates the GC-7 declared-null pairing invariant",
            )
        return None, reason
    if isinstance(area, bool) or not isinstance(area, (int, float)) or not math.isfinite(float(area)):
        raise CalibrationError(
            CODE_PEAK_TABLE_SHAPE_INVALID,
            f"peak row ({what}) area_pa_min is not a finite number: {area!r}",
        )
    return float(area), None


def _saturation_reason(row: Dict[str, Any]) -> Optional[str]:
    """A GC-7 row whose saturation/declared-null flags say the area is
    unrecoverable → its inherited reason (UNRECOVERABLE_SATURATED or the
    row's first flag)."""
    flags = row.get("flags")
    flag_list = flags if isinstance(flags, list) else []
    if row.get("saturated") is True:
        for f in flag_list:
            if isinstance(f, str):
                return f
        return "UNRECOVERABLE_SATURATED"
    return None


# ---------------------------------------------------------------------------
# The fit: weighted normal equations (stdlib, deterministic)
# ---------------------------------------------------------------------------
def _weights(model: str, weighting: str, x: float, y: float, level_no: int) -> float:
    if weighting == "none":
        return 1.0
    if weighting in ("1/x", "1/x^2"):
        if x <= 0.0:
            raise CalibrationError(
                CODE_WEIGHT_UNDEFINED_AT_ZERO,
                f"weighting '{weighting}' is undefined for level {level_no}: amount x={x} is not > 0",
            )
        return (1.0 / x) ** (1 if weighting == "1/x" else 2)
    if weighting == "1/y^2":
        if y == 0.0:
            raise CalibrationError(
                CODE_WEIGHT_UNDEFINED_AT_ZERO,
                f"weighting '1/y^2' is undefined for level {level_no}: response y=0",
            )
        return 1.0 / (y * y)
    raise CalibrationError(
        CODE_WEIGHTING_UNSUPPORTED, f"weighting '{weighting}' is not a declared value"
    )


def _det_scale_relative(det: float, scale_x2: float, scale_y2: float) -> bool:
    """Near-singular guard (§A2.8): the scale-RELATIVE determinant test.
    Returns True when the matrix is ill-conditioned (det vanishes relative to
    the scale of its quadratic form) — a DECLARED failure, never garbage."""
    scale = max(scale_x2 * scale_y2, 0.0)
    if scale <= 0.0:
        return True
    return abs(det) / scale < _SINGULARITY_REL_EPS


def _fit_linear(points: List[Tuple[float, float, float]], through_origin: bool) -> Dict[str, float]:
    """Weighted least squares y = b·x (+ a). Returns {slope, intercept}."""
    sw = math.fsum(p[2] for p in points)
    swx = math.fsum(p[2] * p[0] for p in points)
    swy = math.fsum(p[2] * p[1] for p in points)
    swxx = math.fsum(p[2] * p[0] * p[0] for p in points)
    swxy = math.fsum(p[2] * p[0] * p[1] for p in points)
    if through_origin:
        denom = swxx
        if _det_scale_relative(denom, 1.0, max((p[1] ** 2 for p in points), default=0.0)):
            raise CalibrationError(
                CODE_FIT_ILL_CONDITIONED,
                "origin-constrained fit is ill-conditioned (Σw·x² vanishes at scale) — "
                "no coefficients are invented",
            )
        b = swxy / denom
        return {"slope": b, "intercept": 0.0}
    det = sw * swxx - swx * swx
    if _det_scale_relative(det, swxx or 1.0, math.fsum(p[2] * p[1] * p[1] for p in points) or 1.0):
        raise CalibrationError(
            CODE_FIT_ILL_CONDITIONED,
            "linear fit is ill-conditioned (scale-relative determinant vanishes) — "
            "no coefficients are invented",
        )
    b = (sw * swxy - swx * swy) / det
    a = (swy - b * swx) / sw
    return {"slope": b, "intercept": a}


def _fit_quadratic(points: List[Tuple[float, float, float]]) -> Dict[str, float]:
    """Weighted least squares y = c2·x² + c1·x + c0 (3x3 normal equations,
    Gaussian elimination with partial pivoting; near-singular →
    FIT_ILL_CONDITIONED, never garbage numbers)."""
    sums = {}
    for i in range(5):
        sums[i] = 0.0
    for j in range(3):
        sums["y%d" % j] = 0.0
    for x, y, w in points:
        x2 = x * x
        sums[0] = math.fsum([sums[0], w])
        sums[1] = math.fsum([sums[1], w * x])
        sums[2] = math.fsum([sums[2], w * x2])
        sums[3] = math.fsum([sums[3], w * x2 * x])
        sums[4] = math.fsum([sums[4], w * x2 * x2])
        sums["y0"] = math.fsum([sums["y0"], w * y])
        sums["y1"] = math.fsum([sums["y1"], w * x * y])
        sums["y2"] = math.fsum([sums["y2"], w * x2 * y])
    m = [
        [sums[0], sums[1], sums[2], sums["y0"]],
        [sums[1], sums[2], sums[3], sums["y1"]],
        [sums[2], sums[3], sums[4], sums["y2"]],
    ]
    for c in range(3):
        piv = max(range(c, 3), key=lambda r: abs(m[r][c]))
        if abs(m[piv][c]) == 0.0:
            raise CalibrationError(
                CODE_FIT_ILL_CONDITIONED,
                "quadratic fit is ill-conditioned (zero pivot in the normal equations) — "
                "no coefficients are invented",
            )
        m[c], m[piv] = m[piv], m[c]
        for r in range(c + 1, 3):
            f = m[r][c] / m[c][c]
            for k in range(c, 4):
                m[r][k] = math.fsum([m[r][k], -f * m[c][k]])
    coef = [0.0, 0.0, 0.0]
    for r in range(2, -1, -1):
        if abs(m[r][r]) == 0.0:
            raise CalibrationError(
                CODE_FIT_ILL_CONDITIONED,
                "quadratic fit is ill-conditioned (singular back-substitution) — "
                "no coefficients are invented",
            )
        s = m[r][3]
        for j in range(r + 1, 3):
            s = math.fsum([s, -m[r][j] * coef[j]])
        coef[r] = s / m[r][r]
    return {"c0": coef[0], "c1": coef[1], "c2": coef[2]}


def _predict(model: str, coefficients: Dict[str, float], x: float) -> float:
    if model == "linear":
        return math.fsum([coefficients["slope"] * x, coefficients["intercept"]])
    if model == "linear_through_origin":
        return coefficients["slope"] * x
    c0, c1, c2 = coefficients["c0"], coefficients["c1"], coefficients["c2"]
    return math.fsum([c2 * x * x, c1 * x, c0])


def _equation(model: str, coefficients: Dict[str, float], response_quantity: str,
              amount_unit: str, origin_forced: bool) -> str:
    """A2.6 — explicit equation string from the ACTUAL coefficients at
    repr(float) round-trip precision. The structured coefficients carry the
    truth; nothing here is parse-dependent. No vendor-echo equations."""
    xname = f"amount_{amount_unit.replace('/', '_')}"
    yname = response_quantity
    if model == "quadratic":
        return (
            f"{yname} = {coefficients['c2']!r} * {xname}**2 "
            f"+ {coefficients['c1']!r} * {xname} + {coefficients['c0']!r}"
        )
    b = coefficients["slope"]
    a = coefficients["intercept"]
    tail = f"+ {a!r}" if (model == "linear" or origin_forced) else "+ 0.0"
    # linear_through_origin (BY CONSTRUCTION): the intercept is zero by
    # construction — the equation says so explicitly (fixture C5: '+ 0' form).
    if model == "linear_through_origin":
        return f"{yname} = {b!r} * {xname} + 0.0"
    return f"{yname} = {b!r} * {xname} {tail}"


def _relative_residual(fitted: float, observed: float) -> Optional[float]:
    """A2.5 — per-point relative residual = (fitted − observed)/observed × 100
    on the FIT response quantity. observed == 0 → None (the caller pairs it
    with ZERO_OBSERVED; never ±inf, never dropped silently)."""
    if observed == 0.0:
        return None
    return (fitted - observed) / observed * 100.0


# ---------------------------------------------------------------------------
# The public entry point
# ---------------------------------------------------------------------------
def fit_calibration(ctx: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    """Run the declared-parameters calibration fit and publish the
    ``calibration_table`` + ``calibration_model`` (+ ``effective_parameters``)
    artifacts onto ``ctx``. Returns the result dict (also used directly by the
    unit tests)."""
    p = dict(params)

    # ---- 1. Validation (loud, named, zero defaults; GC-7 T1-10 pattern) ----
    for name in CAL_REQUIRED_PARAMS:
        _require_present(p, name)
    unknown = sorted(set(p) - CAL_KNOWN_PARAMS)
    if unknown:
        raise CalibrationError(
            "PARAM_INVALID",
            f"unknown parameter(s) {unknown} — no silent ignore (unknown-is-unknown)",
        )
    model = _require_enum(p, "model", MODEL_ENUM, CODE_MODEL_UNSUPPORTED)
    weighting = _require_enum(p, "weighting", WEIGHTING_ENUM, CODE_WEIGHTING_UNSUPPORTED)
    origin_constraint = _require_bool(p, "origin_constraint")
    if model == "quadratic" and origin_constraint:
        raise CalibrationError(
            CODE_ORIGIN_CONSTRAINT_UNSUPPORTED,
            "origin_constraint: true is not a declared semantics for the quadratic model "
            "(no invented half-model)",
        )
    statistic_name = _require_enum(p, "correlation_statistic", STATISTIC_ENUM,
                                   CODE_STATISTIC_UNSUPPORTED)
    amount_unit = p["amount_unit"]
    if not isinstance(amount_unit, str) or not amount_unit.strip():
        raise CalibrationError(
            CODE_UNIT_INVALID,
            f"amount_unit must be a non-empty string (the ONE declared unit for all levels; "
            f"no unit conversion is ever guessed), got {amount_unit!r}",
        )
    _validate_istd(p["istd"], "istd")
    _require_enum(p, "extrapolation", EXTRAPOLATION_ENUM, "EXTRAPOLATION_UNSUPPORTED")
    _require_bool(p, "fail_on_out_of_range")
    # (allow_inline_inputs is a fail-closed GATE the loader reads — spec
    # A5.1/T2-2: absent → INPUT_NOT_PROMOTED, never PARAM_MISSING; the
    # runner hands run parameters through verbatim and the gate decides.)
    levels_raw = p["levels"]
    if not isinstance(levels_raw, list) or not levels_raw:
        raise CalibrationError("PARAM_INVALID", "parameter 'levels' must be a non-empty array")

    # ---- 2. Level-matrix assembly (parameter honesty + duplicate guards) ----
    levels = []
    seen_slot: Dict[int, int] = {}
    seen_label_amount: Dict[Tuple[str, float], int] = {}
    windows_by_label: Dict[str, List[Tuple[int, float, float]]] = {}
    for idx, lv in enumerate(levels_raw):
        if not isinstance(lv, dict):
            raise CalibrationError("PARAM_INVALID", f"levels[{idx}] must be an object, got {lv!r}")
        for f in LEVEL_REQUIRED_FIELDS:
            if f == "amount":
                continue  # the dedicated LEVEL_AMOUNT_MISSING check below owns
                          # the missing-amount code (spec A1: missing amount =
                          # whole-run failure LEVEL_AMOUNT_MISSING, NOT PARAM_MISSING)
            if f not in lv:
                raise CalibrationError(
                    "PARAM_MISSING", f"levels[{idx}] is missing required field '{f}' — no default is applied"
                )
        level_no = lv["level"]
        if isinstance(level_no, bool) or not isinstance(level_no, int) or level_no < 1:
            raise CalibrationError(
                "PARAM_INVALID", f"levels[{idx}].level must be a positive integer, got {level_no!r}"
            )
        label = lv["compound_label"]
        if not isinstance(label, str) or not label.strip():
            raise CalibrationError(
                "PARAM_INVALID", f"levels[{idx}].compound_label must be a non-empty string, got {label!r}"
            )
        amount = lv.get("amount")
        if "amount" not in lv or amount is None:
            raise CalibrationError(
                CODE_LEVEL_AMOUNT_MISSING,
                f"level {level_no} ({label}) has no declared amount — missing amount is a "
                f"whole-run failure, never a dropped point",
            )
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(float(amount)):
            raise CalibrationError(
                "PARAM_INVALID", f"levels[{idx}].amount must be a finite number, got {amount!r}"
            )
        amount = float(amount)
        rt_target = _require_number(lv, "rt_target_min")
        rt_window = _require_number(lv, "rt_window_min")
        if rt_target < 0.0 or rt_window <= 0.0:
            raise CalibrationError(
                CODE_RT_WINDOW_INVALID,
                f"level {level_no} ({label}): rt_target_min must be >= 0 and rt_window_min > 0 "
                f"(got {rt_target!r}, {rt_window!r})",
            )
        fit = _require_bool(lv, "fit")
        required = _require_bool(lv, "required")
        declared_weight = lv.get("weight")  # optional declared per-point weight (C3: w=1,1,4)
        if declared_weight is not None:
            if isinstance(declared_weight, bool) or not isinstance(declared_weight, (int, float)) \
                    or not math.isfinite(float(declared_weight)) or float(declared_weight) <= 0.0:
                raise CalibrationError(
                    "PARAM_INVALID",
                    f"levels[{idx}].weight must be a positive finite number when declared, "
                    f"got {declared_weight!r}",
                )
        if level_no in seen_slot:
            raise CalibrationError(
                CODE_DUPLICATE_LEVEL,
                f"level number {level_no} is declared twice (levels[{seen_slot[level_no]}] and levels[{idx}])",
            )
        seen_slot[level_no] = idx
        key = (label, amount)
        if key in seen_label_amount:
            raise CalibrationError(
                CODE_DUPLICATE_LEVEL,
                f"compound '{label}' at amount {amount} {amount_unit} is declared twice "
                f"(levels[{seen_label_amount[key]}] and levels[{idx}])",
            )
        seen_label_amount[key] = idx
        levels.append({
            "index": idx,
            "level": level_no,
            "compound_label": label,
            "compound_ref": lv.get("compound_ref"),  # echoed verbatim or None (declared)
            "amount": amount,
            "rt_target_min": rt_target,
            "rt_window_min": rt_window,
            "fit": fit,
            "required": required,
            "input_names": lv.get("input_names") or [f"level_{level_no}"],
            "weight": float(declared_weight) if declared_weight is not None else None,
        })
        if fit:
            windows_by_label.setdefault(label, []).append((idx, rt_target - rt_window, rt_target + rt_window))
    # Two FIT-ELIGIBLE windows overlapping for the same compound → DUPLICATE_LEVEL.
    for label, wins in windows_by_label.items():
        for i in range(len(wins)):
            for j in range(i + 1, len(wins)):
                _, lo1, hi1 = wins[i]
                _, lo2, hi2 = wins[j]
                if lo1 < hi2 and lo2 < hi1:
                    raise CalibrationError(
                        CODE_DUPLICATE_LEVEL,
                        f"two fit-eligible windows for compound '{label}' overlap "
                        f"(levels[{wins[i][0]}] {lo1}-{hi1} min and levels[{wins[j][0]}] {lo2}-{hi2} min)",
                    )

    # D3: per-point declared weights (levels[i].weight) are MUTUALLY EXCLUSIVE
    # with a conflicting `weighting` scheme (A2.2's scheme channel vs the
    # per-point data channel). Declaring BOTH is a parameter conflict — loud
    # PARAM_INVALID, never a silent override. The original run let the
    # per-point channel silently win while the payload's `weighting` field
    # still echoed the scheme, so the artifact said "none" while weights
    # 1,1,4 were actually applied — the contradictory echo D3 punishes.
    # `weighting: "none"` is the scheme channel's IDENTITY (w=1 everywhere):
    # it names NO scheme, so per-point weights + "none" is the legal C3
    # combination (exactly one channel declared, not two).
    weighted_levels = [lv["index"] for lv in levels if lv["weight"] is not None]
    if weighted_levels and weighting != "none":
        raise CalibrationError(
            "PARAM_INVALID",
            f"per-point declared weights (levels{weighted_levels}) conflict with the "
            f"declared weighting scheme '{weighting}' — declare ONE channel: either the "
            f"per-point weights (with weighting: 'none') or the scheme (no per-level "
            f"weights); a silent override is never applied",
        )

    istd = _validate_istd(p["istd"], "istd")
    istd_mode = istd["role"] == "internal_standard"
    response_quantity = RESPONSE_QUANTITY_RATIO if istd_mode else RESPONSE_QUANTITY_RAW

    # ---- 3. Per-level response extraction (content-classified) ----
    table_rows: List[Dict[str, Any]] = []
    fit_points: List[Dict[str, Any]] = []
    for lv in levels:
        input_name, payload = _resolve_level_input(ctx, lv["input_names"])
        _cols, rows = _peak_table_shape(payload, input_name)
        count, first_idx = _match_peak_in_window(
            rows, lv["rt_target_min"], lv["rt_window_min"],
            f"level {lv['level']} ({lv['compound_label']})",
        )
        if count > 1:
            r0 = rows[first_idx]
            # name BOTH rows (no nearest-RT rescue)
            other = next(i for i, r in enumerate(rows)
                         if i != first_idx and _rt_in(r, lv["rt_target_min"] - lv["rt_window_min"],
                                                      lv["rt_target_min"] + lv["rt_window_min"]))
            raise CalibrationError(
                CODE_AMBIGUOUS_PEAK_MATCH,
                f"level {lv['level']} ({lv['compound_label']}): target window "
                f"[{lv['rt_target_min'] - lv['rt_window_min']}, {lv['rt_target_min'] + lv['rt_window_min']}] "
                f"matches MULTIPLE peaks in input '{input_name}' — row {first_idx} (rt {r0.get('rt_min')!r}) "
                f"and row {other} (rt {rows[other].get('rt_min')!r}); no nearest-RT rescue",
            )
        row: Dict[str, Any] = {
            "level": lv["level"],
            "compound_label": lv["compound_label"],
            "compound_ref": lv["compound_ref"],  # echoed verbatim (None when undeclared)
            "amount": lv["amount"],
            "rt_target_min": lv["rt_target_min"],
            "rt_window_min": lv["rt_window_min"],
            "peak_source": None,
            "response_raw_pa_min": None,
            "response_ratio": None,
            "fit_point": lv["fit"],
            "relative_residual": None,
            "flags": [],
        }
        response_raw: Optional[float] = None
        raw_reason: Optional[str] = None
        raw_index: Optional[int] = None
        if count == 0:
            raw_reason = CODE_NO_MATCHING_PEAK
            if lv["required"]:
                raise CalibrationError(
                    CODE_LEVEL_UNMATCHED,
                    f"level {lv['level']} ({lv['compound_label']}) declared required: true but no peak "
                    f"lies in its window [{lv['rt_target_min'] - lv['rt_window_min']}, "
                    f"{lv['rt_target_min'] + lv['rt_window_min']}] in input '{input_name}'",
                )
        else:
            match_row = rows[first_idx]
            sat_reason = _saturation_reason(match_row)
            area, area_reason = (None, sat_reason) if sat_reason else _row_area(match_row, f"input '{input_name}' row {first_idx}")
            if area is None:
                raw_reason = area_reason
            else:
                response_raw = area
                raw_index = first_idx
                row["peak_source"] = f"{input_name}:row{first_idx}"
        if response_raw is None:
            row["flags"].append(raw_reason or CODE_NO_MATCHING_PEAK)
        # ISTD combination (A3): the ONLY division by an ISTD area in the
        # system. A level whose table lacks the ISTD peak → ISTD_PEAK_NOT_FOUND
        # (never a silent fallback to raw area — that would mix quantities).
        response: Optional[float] = None
        if istd_mode:
            if response_raw is not None:
                istd_count, istd_idx = _match_peak_in_window(
                    rows, istd["rt_target_min"], istd["rt_window_min"],
                    f"ISTD ({istd['compound_label']}) in input '{input_name}'",
                )
                if istd_count == 0:
                    raise CalibrationError(
                        CODE_ISTD_PEAK_NOT_FOUND,
                        f"level {lv['level']} ({lv['compound_label']}): the declared ISTD "
                        f"'{istd['compound_label']}' has no matching peak row in input '{input_name}' "
                        f"(window [{istd['rt_target_min'] - istd['rt_window_min']}, "
                        f"{istd['rt_target_min'] + istd['rt_window_min']}]) — never a fallback to raw area",
                    )
                if istd_count > 1:
                    raise CalibrationError(
                        CODE_AMBIGUOUS_PEAK_MATCH,
                        f"level {lv['level']} ({lv['compound_label']}): the declared ISTD "
                        f"'{istd['compound_label']}' matches MULTIPLE peak rows in input '{input_name}' — "
                        f"no nearest-RT rescue",
                    )
                istd_row = rows[istd_idx]
                istd_sat = _saturation_reason(istd_row)
                istd_area, istd_reason = (None, istd_sat) if istd_sat else _row_area(istd_row, f"ISTD row {istd_idx}")
                if istd_area is None or istd_area == 0.0:
                    raise CalibrationError(
                        CODE_ISTD_PEAK_NOT_FOUND,
                        f"level {lv['level']} ({lv['compound_label']}): the declared ISTD peak "
                        f"(input '{input_name}' row {istd_idx}) has no usable area ({istd_reason or 'zero'}) — "
                        f"the ratio is undefined; no fallback to raw area",
                    )
                response = response_raw / istd_area
        else:
            response = response_raw
        row["response_raw_pa_min"] = response_raw
        row["response_ratio"] = response  # plain mode: == response_raw (declared identity)
        table_rows.append(row)
        if lv["fit"] and response is not None:
            fit_points.append({
                "level_index": lv["index"],
                "amount": lv["amount"],
                "response": response,
                "source_input": input_name,
                "source_peak_index": raw_index,
            })

    n_fit = len(fit_points)
    if n_fit == 0:
        raise CalibrationError(
            CODE_NO_FIT_POINTS,
            "no fit points: every level is fit: false or carries no usable response — "
            "the fit is impossible; nothing is dropped silently",
        )
    # Point-count floors (A2.1). `correlation_statistic` is a REQUIRED
    # parameter — every legal run DEMANDS a statistic (A2.4) — so a plain
    # linear fit needs >= 3 points: with exactly 2 points the weighted line
    # passes both by construction (SS_res == 0) and a "1.0" statistic would be
    # a guaranteed certainty dressed as evidence — the exact anti-laundering
    # failure A2.4/A2.5 forbid (D2). The origin-CONSTRAINED linear behaves as
    # linear_through_origin (A2.3) and keeps the 1-point floor: there is no
    # intercept left to over-determine.
    if model == "quadratic":
        floor = 3
    elif model == "linear_through_origin" or (model == "linear" and origin_constraint):
        floor = 1
    else:  # plain linear, statistic demanded (required param — A2.1)
        floor = 3
    if n_fit < floor:
        raise CalibrationError(
            CODE_INSUFFICIENT_POINTS,
            f"model '{model}' requires >= {floor} fit points; {n_fit} present (named count)",
        )

    # ---- 4. Weights (enter the normal equations; no implicit weights).
    # A per-level DECLARED weight (levels[i].weight — the C3 channel) is the
    # more specific declaration and wins; otherwise the declared `weighting`
    # scheme is applied (A2.2). ----
    wpts: List[Tuple[float, float, float]] = []  # (x, y, w) — fixed level order
    weights: Dict[int, float] = {}
    for fp in fit_points:
        lv = levels[fp["level_index"]]
        if lv["weight"] is not None:
            w = lv["weight"]
        else:
            w = _weights(model, weighting, fp["amount"], fp["response"], fp["level_index"])
        weights[fp["level_index"]] = w
        wpts.append((fp["amount"], fp["response"], w))

    # ---- 5. The fit (A2.8: weighted normal equations, deterministic) ----
    if model == "quadratic":
        coefficients = _fit_quadratic(wpts)
    elif model == "linear_through_origin":
        coefficients = _fit_linear(wpts, through_origin=True)
    else:
        coefficients = _fit_linear(wpts, through_origin=origin_constraint)

    # ---- 6. Per-point relative residuals (A2.5, on the FIT response) ----
    for row_i, row in enumerate(table_rows):
        lv = levels[row_i]
        if not lv["fit"]:
            row["relative_residual"] = None
            if REASON_EXCLUDED_FROM_FIT not in row["flags"]:
                row["flags"].append(REASON_EXCLUDED_FROM_FIT)
            continue
        response_value = row["response_ratio"]
        if response_value is None:
            # a fit-eligible level with no usable response: its null reason is
            # already in flags (NO_MATCHING_PEAK / inherited) — the pairing
            # invariant holds; nothing to add.
            continue
        resid = _relative_residual(_predict(model, coefficients, lv["amount"]), response_value)
        if resid is None:
            row["relative_residual"] = None
            if REASON_ZERO_OBSERVED not in row["flags"]:
                row["flags"].append(REASON_ZERO_OBSERVED)
        else:
            row["relative_residual"] = resid
    # fit_points carry their residual (structured, for the model artifact)
    for fp in fit_points:
        row = table_rows[fp["level_index"]]
        fp["relative_residual"] = row["relative_residual"]
        fp["weight"] = weights[fp["level_index"]]

    # ---- 7. The declared correlation statistic (A2.4 — definition pinned) ----
    statistic_value: Optional[float] = None
    statistic_reason: Optional[str] = None
    if statistic_name == "weighted_r_squared":
        sw = math.fsum(fp["weight"] for fp in fit_points)
        yw = math.fsum(fp["weight"] * fp["response"] for fp in fit_points) / sw
        ss_res = math.fsum(
            fp["weight"] * (fp["response"] - _predict(model, coefficients, fp["amount"])) ** 2
            for fp in fit_points
        )
        ss_tot = math.fsum(fp["weight"] * (fp["response"] - yw) ** 2 for fp in fit_points)
        if ss_tot == 0.0:
            statistic_value = None
            statistic_reason = REASON_STATISTIC_UNDEFINED
        else:
            statistic_value = 1.0 - ss_res / ss_tot
    else:  # max_abs_relative_residual
        vals = [abs(fp["relative_residual"]) for fp in fit_points if fp["relative_residual"] is not None]
        if vals:
            statistic_value = max(vals)
        else:
            statistic_value = None
            statistic_reason = REASON_ZERO_OBSERVED
    STATISTIC_DEFINITIONS = {
        "weighted_r_squared": (
            "1 - SS_res/SS_tot with SS_res = sum(w_i*(y_i - y_hat_i)^2), "
            "SS_tot = sum(w_i*(y_i - y_wbar)^2), y_wbar = sum(w_i*y_i)/sum(w_i) — the "
            "declared weighted r^2 (ordinary r^2 when weighting is 'none'); "
            "null + STATISTIC_UNDEFINED when SS_tot == 0, never 1.0/0.0 substituted"
        ),
        "max_abs_relative_residual": (
            "max |relative_residual| over fit points, relative_residual = "
            "(fitted - observed)/observed * 100 on the fit response quantity; "
            "null + ZERO_OBSERVED when no fit point has a non-zero observed response"
        ),
    }
    statistic_definition = STATISTIC_DEFINITIONS[statistic_name]

    # ---- 8. Equation string + model payload (A2.6, A6) ----
    equation = _equation(model, coefficients, response_quantity, amount_unit,
                         origin_constraint and model == "linear")
    amounts = [fp["amount"] for fp in fit_points]
    x_min, x_max = min(amounts), max(amounts)
    run_id = p.get("calibration_run_id")  # optional declared echo (lineage) or None
    digest = _params_digest(p)
    fit_points_payload = []
    for fp in fit_points:
        if fp["source_peak_index"] is not None:
            src = ctx.input(fp["source_input"])
            meta = src.meta if hasattr(src, "meta") and isinstance(src.meta, dict) else {}
            src_ref: Dict[str, Any] = {
                # A6: source_point_ref = {artifact_or_dref_id, input_name,
                # peak_row_index}. The identity slot carries the INPUT'S
                # DECLARED ref id — the artifact/data-reference record id the
                # run's `inputs` map declared for this input (D4: a filesystem
                # PATH must never sit under an `_id` name; the original run
                # echoed meta.sourcePath there). The runner hands the declared
                # id through the input meta as `sourceRefId` when it has one;
                # when NO id exists (e.g. an unpromoted inline artifact input,
                # which declares no record id), the key is OMITTED — never a
                # path, never invented (documented in the model schema note).
                **({"artifact_or_dref_id": meta["sourceRefId"]}
                    if isinstance(meta.get("sourceRefId"), str) and meta["sourceRefId"] else {}),
                "input_name": fp["source_input"],
                "peak_row_index": fp["source_peak_index"],
                **({"contentHash": meta["contentHash"]}
                    if isinstance(meta.get("contentHash"), str) else {}),
            }
        else:
            # Defensive: a fit point always carries a matched peak (response
            # is None without a match); if this invariant ever breaks, the
            # ref degrades to the input name + null row — never a crash.
            src_ref = {"input_name": fp["source_input"], "peak_row_index": None}
        fit_points_payload.append({
            "amount": fp["amount"],
            "response": fp["response"],
            "weight": fp["weight"],
            "relative_residual": fp["relative_residual"],
            "source_input": fp["source_input"],
            "source_peak_index": fp["source_peak_index"],
            "source_point_ref": src_ref,
        })
    # D3: the EFFECTIVE weighting that actually entered the normal equations —
    # emitted so the declared-scheme field (`weighting`) never says "none"
    # while non-unit weights were applied (C3: weights 1,1,4 were applied
    # under the declared identity scheme). The marker is machine-readable
    # from the APPLIED weights, never from the echo:
    #   "none"               — every applied weight is 1.0 (the identity);
    #   "per_point"          — per-level declared weights (C3 channel) were
    #                          applied (weighting was the identity scheme);
    #   <scheme>             — the declared A2.2 scheme was applied (1/x,
    #                          1/x^2, 1/y^2 — never all-1 by construction).
    applied_weights = [weights[fp["level_index"]] for fp in fit_points]
    if all(w == 1.0 for w in applied_weights):
        effective_weighting = "none"
    elif weighting == "none":
        effective_weighting = "per_point"
    else:
        effective_weighting = weighting
    model_payload: Dict[str, Any] = {
        "model_version": MODEL_VERSION,
        "model": model,
        "equation": equation,
        "coefficients": coefficients,
        "weighting": weighting,
        "effective_weighting": effective_weighting,
        "origin_constraint": origin_constraint,
        "statistic_name": statistic_name,
        "statistic_value": statistic_value,
        "statistic_definition": statistic_definition,
        "residual_basis": (
            "relative_residual = (fitted - observed)/observed * 100 on the fit response: "
            + ("area_ratio (ISTD-mode response, A3)" if istd_mode
               else "raw_area_pa_min (plain mode — response == raw area, declared identity)")
        ),
        "response_quantity": response_quantity,
        "amount_unit": amount_unit,
        "fit_points": fit_points_payload,
        "x_min": x_min,
        "x_max": x_max,
        "calibration_run_id": run_id if isinstance(run_id, str) else None,
        "params_digest": digest,
        "calibration_scope": CALIBRATION_SCOPE,
    }

    # ---- 9. Publish (A1 + A6; units/schema verbatim) ----
    _publish(ctx, table_rows, model_payload, p, digest, levels, response_quantity,
             amount_unit, istd, n_fit, statistic_value, statistic_reason)

    metrics = {m["name"]: m["value"] for m in ctx.manifest().metrics}
    return {
        "table_rows": table_rows,
        "columns": CAL_TABLE_COLUMNS,
        "units": CAL_TABLE_UNITS,
        "model": model_payload,
        "metrics": metrics,
        "params_digest": digest,
    }


# ---------------------------------------------------------------------------
# Artifact payloads + publish (A1 / A6)
# ---------------------------------------------------------------------------
CAL_TABLE_COLUMNS = [
    "level", "compound_label", "compound_ref", "amount", "rt_target_min",
    "rt_window_min", "peak_source", "response_raw_pa_min", "response_ratio",
    "fit_point", "relative_residual", "flags",
]

CAL_TABLE_UNITS = {
    # Column units: the response/time columns are fixed by definition;
    # `amount` is OVERRIDDEN at publish with the ONE declared amount_unit
    # (verbatim — the module never invents a unit).
    "amount": "pA*min",
    "rt_target_min": "min",
    "rt_window_min": "min",
    "response_raw_pa_min": "pA*min",
    "response_ratio": "ratio",
    "relative_residual": "%",
}

_CAL_SCHEMA_NOTE = {
    "level": "1-based declared level index (parameter data)",
    "compound_label": "the declared identity label, echoed verbatim (never parsed, never branched on)",
    "compound_ref": "declared ref (local-curie / ChEBI data) echoed; null when the level declared none",
    "amount": "declared level amount in the ONE declared amount_unit (no unit conversion ever guessed)",
    "rt_target_min": "declared RT window centre (min)",
    "rt_window_min": "declared RT window half-width (min)",
    "peak_source": "which input name + peak row the response came from (null + NO_MATCHING_PEAK when unmatched)",
    "response_raw_pa_min": "matched peak's area_pa_min VERBATIM from the GC-7 table — never recomputed "
                           "(null + NO_MATCHING_PEAK / UNRECOVERABLE_SATURATED inherited)",
    "response_ratio": "ISTD-mode: response_raw / istd_peak_area (A3 — the only ISTD division); "
                      "plain mode: == response_raw_pa_min (declared identity, documented here)",
    "fit_point": "whether the point entered the fit (fit-eligibility is DECLARED per level; fit: false excludes)",
    "relative_residual": "(fitted - observed)/observed * 100 on the fit response quantity (A2.5); "
                         "null + EXCLUDED_FROM_FIT / ZERO_OBSERVED",
    "flags": "reason codes (the null/reason pairing invariant: every null numeric cell names its code)",
}


def _validate_istd(istd: Any, name: str) -> Dict[str, Any]:
    if not isinstance(istd, dict) or "role" not in istd:
        raise CalibrationError(
            "PARAM_MISSING",
            f"{name}.role is absent — absence is never normalization-by-default (A3)",
        )
    role = istd["role"]
    if role not in ISTD_ROLE_ENUM:
        raise CalibrationError(
            "PARAM_INVALID", f"{name}.role must be one of {list(ISTD_ROLE_ENUM)}, got {role!r}"
        )
    if role == "internal_standard":
        label = istd.get("compound_label")
        if not isinstance(label, str) or not label.strip():
            raise CalibrationError(
                "PARAM_MISSING",
                f"{name}.compound_label is required when role is 'internal_standard' — it names WHICH "
                f"peak row is the internal standard in each table",
            )
        rt_target = _require_number(istd, "rt_target_min")
        rt_window = _require_number(istd, "rt_window_min")
        if rt_target < 0.0 or rt_window <= 0.0:
            raise CalibrationError(
                CODE_RT_WINDOW_INVALID,
                f"{name}: rt_target_min must be >= 0 and rt_window_min > 0 (got {rt_target!r}, {rt_window!r})",
            )
        return {
            "role": role,
            "compound_label": label,
            "compound_ref": istd.get("compound_ref"),
            "rt_target_min": rt_target,
            "rt_window_min": rt_window,
        }
    return {"role": role}


def _publish(
    ctx: Any,
    table_rows: List[Dict[str, Any]],
    model_payload: Dict[str, Any],
    p: Dict[str, Any],
    digest: str,
    levels: List[Dict[str, Any]],
    response_quantity: str,
    amount_unit: str,
    istd: Dict[str, Any],
    n_fit: int,
    statistic_value: Optional[float],
    statistic_reason: Optional[str],
) -> None:
    cal_table_payload: Dict[str, Any] = {
        "rows": table_rows,
        "columns": CAL_TABLE_COLUMNS,
        "amount_unit": amount_unit,
        "istd": istd.get("role"),  # declared role echo (A1)
        "calibration_scope": CALIBRATION_SCOPE,
        "params_digest": digest,
    }
    units = dict(CAL_TABLE_UNITS)
    units["amount"] = amount_unit  # the ONE declared unit, verbatim
    schema: Dict[str, Any] = {
        "columns": {c: {"definition": _CAL_SCHEMA_NOTE[c]} for c in CAL_TABLE_COLUMNS},
        "note": (
            "analytical calibration (calibration_scope: 'analytical') — lexically distinct from the "
            "acquisition calibration-record vocabulary (B4); response columns are NEVER recomputed "
            "from signal; area% is never silently mass%/concentration"
        ),
    }
    ctx.publish("calibration_table", cal_table_payload, kind="table", units=units, schema=schema)
    model_units: Dict[str, str] = {"amount": amount_unit, "response": response_quantity,
                                   "x_min": amount_unit, "x_max": amount_unit}
    model_schema: Dict[str, Any] = {
        "note": (
            "fitted-model artifact (A6): coefficients at float round-trip precision + the explicit "
            "equation string (parse-free: the structured coefficients carry the truth); "
            "statistic_definition is emitted verbatim so a reader never has to guess; "
            "source_point_ref per fit point = {artifact_or_dref_id, input_name, peak_row_index} — "
            "artifact_or_dref_id carries the INPUT'S DECLARED ref id (the artifact/data-reference "
            "record id the run's inputs map declared for that input) and is OMITTED when no id "
            "exists for the input (e.g. an unpromoted inline artifact input declares no record "
            "id): a filesystem path is NEVER placed under an _id field (D4); "
            "effective_weighting names the weighting actually applied (none / per_point / "
            "the declared A2.2 scheme) so `weighting` never reports 'none' while non-unit weights "
            "entered the fit (D3)"
        )
    }
    ctx.publish("calibration_model", model_payload, kind="table", units=model_units, schema=model_schema)

    # effective_parameters (A6 / GC-7 §A3.6 doctrine): exact parameters +
    # params_digest + source_content_sha256 echoes from input meta.
    eff: Dict[str, Any] = {"parameters": p, "params_digest": digest}
    src_hashes: Dict[str, str] = {}
    for name in sorted(ctx.input_names()):
        try:
            h = ctx.input(name).meta
        except KeyError:
            continue
        ch = h.get("contentHash") if isinstance(h, dict) else None
        if isinstance(ch, str):
            src_hashes[name] = ch
    if src_hashes:
        eff["source_content_sha256"] = src_hashes  # echo, never re-hash (GC-6 D5)
    ctx.publish("effective_parameters", eff, kind="table",
                schema={"note": "exact run parameters + provenance echoes (machine-readable)"})

    # Metrics (machine-readable, GC-7's doctrine)
    ctx.metric("n_levels", len(levels), unit="levels", label="declared standard levels")
    ctx.metric("n_fit_points", n_fit, unit="points", label="levels that entered the fit")
    ctx.metric("n_unmatched_levels",
               sum(1 for r in table_rows if CODE_NO_MATCHING_PEAK in r["flags"]),
               unit="levels", label="levels with NO_MATCHING_PEAK (response null)")
    ctx.metric("n_zero_observed",
               sum(1 for r in table_rows if REASON_ZERO_OBSERVED in r["flags"]),
               unit="levels", label="fit points with zero observed response")
    ctx.metric("calibration_statistic",
               statistic_value if statistic_value is not None else (statistic_reason or "null"),
               label="the declared correlation statistic (value or its declared-undefined reason)")
    ctx.metric("params_digest", digest, unit=None, label="sha256 of canonicalized run parameters")

    ctx.view("calibration_table_view", "table", artifact="calibration_table")
    ctx.view("calibration_model_view", "table", artifact="calibration_model")
