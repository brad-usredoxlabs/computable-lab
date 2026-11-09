"""GC-8 — quantification: the cross-run consumer of a PROMOTED calibration
model (spec §A4-A6).

Inputs (named): ``calibration_model`` — the PROMOTED ``calibration_model``
artifact from a CAL run (spec A5: file_bytes + json.loads of the streamed
``<name>.bin`` bytes; a dict-inline UNPROMOTED input is the declared
``INPUT_NOT_PROMOTED`` failure BEFORE any filesystem read — the [F-run]
FileNotFoundError trap discharged as a declared code) + ``peak_table`` — a
DIFFERENT run's GC-7 peak-table artifact (the acceptance spine: the model's
run and the sample's run are distinct; cross-run lineage rides the runner's
auto sourceRelations, not anything this module invents).

The model payload is the CONTRACT (A6): ``model_version``, ``equation``,
``coefficients``, ``amount_unit``, ``response_quantity``, ``x_min``/``x_max``,
``params_digest`` — any missing/typed-wrong key → ``MODEL_PAYLOAD_INVALID``
(no row-coercion heuristics, no CSV guessing — A5).

ISTD semantics (A3, bidirectional guard): the model's ``response_quantity``
says which quantity the curve was fit on; the QUANT parameter ``istd.role``
MUST be consistent with it — ``internal_standard`` against a
``raw_area_pa_min`` model would re-ratio an already-ratioed curve, and
``none`` against an ``area_ratio`` model would quantify raw areas off a
ratio curve → both hard-fail ``ISTD_DOUBLE_APPLICATION`` naming both sides.
The ratio is computed exactly ONCE per sample table (analyte area / ISTD
peak area, the SAME single combination rule CAL applied to the standards) —
this module never applies the ISTD division a second time to an already-
ratioed quantity.

Units: every concentration output is NAMED with the model's declared amount
unit (``amount_<unit>`` / ``amount_reported_<unit>`` — units-in-names,
[G7:335]); the sample multiplier/dilution factors are applied EXACTLY ONCE
in the reporting step under the declared ``amount_semantics`` (A4.4).

Area%-honesty (A4.5, binding clause): ``area_percent`` rides verbatim in its
own column, and the artifact schema carries the sentence — verbatim,
test-asserted — that area% is a peak-area fraction, NOT a mass fraction, NOT
a concentration, and NOT derived from the calibration model.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .calibration_fit import (
    CALIBRATION_SCOPE,
    RESPONSE_QUANTITY_RATIO,
    RESPONSE_QUANTITY_RAW,
    CalibrationError,
    _params_digest,
    _require_bool,
    _require_number,
    load_structured_input,
)
from .ctx import DatasetHandle

# ---------------------------------------------------------------------------
# Declared enums + constants (declared values, not domain truth)
# ---------------------------------------------------------------------------
AMOUNT_SEMANTICS_ENUM: Tuple[str, ...] = ("model_amount_as_reported", "apply_multipliers")
EXTRAPOLATION_ENUM: Tuple[str, ...] = ("reject", "allow_within_declared_extension")
ISTD_ROLE_ENUM: Tuple[str, ...] = ("none", "internal_standard")

CODE_MODEL_PAYLOAD_INVALID = "MODEL_PAYLOAD_INVALID"
CODE_ISTD_DOUBLE_APPLICATION = "ISTD_DOUBLE_APPLICATION"
CODE_ISTD_PEAK_NOT_FOUND = "ISTD_PEAK_NOT_FOUND"
CODE_OUT_OF_RANGE = "OUT_OF_RANGE"
CODE_EXTRAPOLATION_UNSUPPORTED = "EXTRAPOLATION_UNSUPPORTED"
CODE_AMBIGUOUS_PEAK_MATCH = "AMBIGUOUS_PEAK_MATCH"
CODE_NO_REAL_ROOT = "NO_REAL_ROOT"
CODE_PEAK_TABLE_SHAPE_INVALID = "PEAK_TABLE_SHAPE_INVALID"
CODE_INPUT_NOT_PROMOTED = "INPUT_NOT_PROMOTED"
CODE_INPUT_JSON_INVALID = "INPUT_JSON_INVALID"

# Row flags (the loudness is data — A4.3: the arithmetic never guesses)
FLAG_UNASSIGNED_PEAK = "UNASSIGNED_PEAK"
FLAG_OUT_OF_RANGE = "OUT_OF_RANGE"
FLAG_EXTRAPOLATED = "EXTRAPOLATED"
FLAG_NO_REAL_ROOT = "NO_REAL_ROOT"

# A4.5 — the area%-honesty sentence, VERBATIM (test-asserted; dropping or
# rewording it fails the description clause).
AREA_PERCENT_HONESTY = (
    "area_percent is a peak-area fraction of the reported table total; "
    "it is NOT a mass fraction, NOT a concentration, and is not derived "
    "from the calibration model."
)

MODEL_VERSION_EXPECTED = 1

QUANT_REQUIRED_PARAMS: Tuple[str, ...] = (
    "istd",
    "targets",
    "extrapolation",
    "fail_on_out_of_range",
    "amount_semantics",
)
# NOTE: `allow_inline_inputs` is NOT a required parameter — it is a
# FAIL-CLOSED GATE the loader reads (spec A5.1 + T2-2): a dict-inline input is
# allowed ONLY when it is declared true; ABSENT → INPUT_NOT_PROMOTED (the
# declared failure), never PARAM_MISSING and never normalization-by-default.
# The shipped spine promotes instead (POST /analysis-artifacts/:id/promote).
# It is still a DECLARED (known) parameter — the spec's parameterSchema lists
# it (QUANT :470) — so it lives in the known set, just not required.
QUANT_OPTIONAL_PARAMS: Tuple[str, ...] = (
    # the A5 fail-closed gate (declared param; absent → INPUT_NOT_PROMOTED).
    "allow_inline_inputs",
    # the sample factors block (A4.4) — required when amount_semantics =
    # 'apply_multipliers', absent otherwise (the factors are DATA, never
    # defaults; an absent sample + apply_multipliers → PARAM_MISSING).
    "sample",
    # consumer-side verification tolerance (percent): DECLARED by the
    # submitting test/run for the downstream check — echoed into the
    # effective_parameters provenance; the module's arithmetic NEVER applies
    # it (the inverse prediction is exact; a tolerance inside the algorithm
    # would be laundering).
    "quant_tolerance_percent",
    # the declared extension bounds (spec A4.3): REQUIRED when
    # extrapolation = 'allow_within_declared_extension' (their absence there
    # is PARAM_MISSING via _require_number); harmless (unused) otherwise —
    # the arithmetic never extrapolates on undeclared bounds.
    "extension_low",
    "extension_high",
)
QUANT_KNOWN_PARAMS = frozenset(QUANT_REQUIRED_PARAMS) | frozenset(QUANT_OPTIONAL_PARAMS)

# The GC-7 peak_table columns THIS consumer reads (B1 re-pin: the shipped
# table also carries width_min + symmetry — subset, not equality).
PEAK_TABLE_REQUIRED_COLUMNS = ("rt_min", "area_pa_min", "area_percent", "saturated", "flags")

# The model-payload contract (A6) — every key must be present and typed.
MODEL_PAYLOAD_KEYS = (
    "model_version",
    "model",
    "equation",
    "coefficients",
    "amount_unit",
    "response_quantity",
    "x_min",
    "x_max",
    "params_digest",
)

# The promoted-artifact storage layout the runner mints
# (artifactPromotion.ts: <defaultDevice>/analysis-artifacts/promoted/<id>/<name>.json).
_PROMOTED_PATH_RE = re.compile(r"^analysis-artifacts/promoted/([A-Za-z0-9-]+)/")


class QuantificationError(Exception):
    """A named quantification failure. ``code`` is the declared failure token
    that the runner surfaces in RUN_FAILED."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Model payload contract (A4.1: validation FIRST; no heuristics)
# ---------------------------------------------------------------------------
def _model_field(model: Dict[str, Any], key: str, what: str) -> Any:
    if key not in model:
        raise QuantificationError(
            CODE_MODEL_PAYLOAD_INVALID, f"model payload is missing required key '{key}' ({what})"
        )
    return model[key]


def validate_model_payload(model: Any) -> Dict[str, Any]:
    """Validate the promoted model payload against the A6 contract. Returns
    the validated view the algorithm reads (single truth-site: the artifact)."""
    if not isinstance(model, dict):
        raise QuantificationError(
            CODE_MODEL_PAYLOAD_INVALID,
            f"model payload is not an object (got {type(model).__name__}) — the promoted "
            f"calibration_model artifact payload is a JSON object",
        )
    for key in MODEL_PAYLOAD_KEYS:
        if key not in model:
            raise QuantificationError(
                CODE_MODEL_PAYLOAD_INVALID, f"model payload is missing required key '{key}'"
            )
    mv = model["model_version"]
    if mv != MODEL_VERSION_EXPECTED:
        raise QuantificationError(
            CODE_MODEL_PAYLOAD_INVALID,
            f"model payload model_version={mv!r} != {MODEL_VERSION_EXPECTED} — unsupported model "
            f"contract (never adapted silently)",
        )
    m = model["model"]
    if m not in ("linear", "linear_through_origin", "quadratic"):
        raise QuantificationError(
            CODE_MODEL_PAYLOAD_INVALID, f"model payload model={m!r} is not a supported model"
        )
    if not isinstance(model["equation"], str) or not model["equation"]:
        raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, "model payload equation is not a string")
    coef = model["coefficients"]
    if not isinstance(coef, dict):
        raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, "model payload coefficients is not an object")
    if m == "quadratic":
        for k in ("c0", "c1", "c2"):
            if not _is_number(coef.get(k)):
                raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, f"coefficients.{k} missing or not a number")
    else:
        if not _is_number(coef.get("slope")):
            raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, "coefficients.slope missing or not a number")
        if m == "linear" and not _is_number(coef.get("intercept")):
            raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, "coefficients.intercept missing or not a number")
    amount_unit = model["amount_unit"]
    if not isinstance(amount_unit, str) or not amount_unit.strip():
        raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, "model payload amount_unit is not a non-empty string")
    rq = model["response_quantity"]
    if rq not in (RESPONSE_QUANTITY_RAW, RESPONSE_QUANTITY_RATIO):
        raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, f"model payload response_quantity={rq!r} is not declared")
    x_min, x_max = model["x_min"], model["x_max"]
    if not _is_number(x_min) or not _is_number(x_max) or x_min > x_max:
        raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID,
                                  f"model payload x_min/x_max invalid ({x_min!r}, {x_max!r})")
    if not isinstance(model["params_digest"], str) or not model["params_digest"]:
        raise QuantificationError(CODE_MODEL_PAYLOAD_INVALID, "model payload params_digest is not a string")
    return model


def _is_number(v: Any) -> bool:
    return not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(float(v))


def _unit_slug(amount_unit: str) -> str:
    """The units-in-names convention ([G7:335]): ng/uL -> ng_uL. The model's
    declared unit is the ONLY unit that may appear in a concentration column
    name (bait-#6: no mid-chain re-labeling)."""
    return amount_unit.replace("/", "_")


# ---------------------------------------------------------------------------
# RT-window matching (the SAME declared-window vocabulary the CAL revision
# used — identity never invents itself)
# ---------------------------------------------------------------------------
def _window_contains(row: Dict[str, Any], rt_target: float, rt_window: float) -> bool:
    rt = row.get("rt_min")
    if not _is_number(rt):
        return False
    return rt_target - rt_window <= float(rt) <= rt_target + rt_window


def _row_area(row: Dict[str, Any], what: str) -> Tuple[Optional[float], Optional[str]]:
    """The row's declared area_pa_min with its inherited null reason (GC-7's
    declared-nulls pair with reason codes in flags — inherited verbatim)."""
    area = row.get("area_pa_min")
    if area is None:
        flags = row.get("flags")
        reason = None
        if isinstance(flags, list) and flags and isinstance(flags[0], str):
            reason = flags[0]
        if reason is None:
            raise QuantificationError(
                CODE_PEAK_TABLE_SHAPE_INVALID,
                f"peak row ({what}) has null area_pa_min with no declared reason in flags",
            )
        return None, reason
    if not _is_number(area):
        raise QuantificationError(CODE_PEAK_TABLE_SHAPE_INVALID,
                                  f"peak row ({what}) area_pa_min is not a finite number: {area!r}")
    return float(area), None


def _saturated_reason(row: Dict[str, Any]) -> Optional[str]:
    flags = row.get("flags")
    flag_list = flags if isinstance(flags, list) else []
    if row.get("saturated") is True:
        for f in flag_list:
            if isinstance(f, str):
                return f
        return "UNRECOVERABLE_SATURATED"
    return None


# ---------------------------------------------------------------------------
# Inverse prediction (A4.3: the declared extrapolation policy)
# ---------------------------------------------------------------------------
def _predict(model_kind: str, coefficients: Dict[str, Any], x: float) -> float:
    if model_kind == "linear":
        return math.fsum([float(coefficients["slope"]) * x, float(coefficients["intercept"])])
    if model_kind == "linear_through_origin":
        return float(coefficients["slope"]) * x
    c0, c1, c2 = float(coefficients["c0"]), float(coefficients["c1"]), float(coefficients["c2"])
    return math.fsum([c2 * x * x, c1 * x, c0])


def _response_range(model_kind: str, coefficients: Dict[str, Any],
                    x_min: float, x_max: float) -> Tuple[float, float]:
    """The model's [x_min, x_max]-derived response range (A4.3): the min/max
    of the model over the fit range (endpoints + the quadratic vertex when it
    lies inside)."""
    vals = [_predict(model_kind, coefficients, x_min), _predict(model_kind, coefficients, x_max)]
    if model_kind == "quadratic":
        c2 = float(coefficients["c2"])
        if c2 != 0.0:
            xv = -float(coefficients["c1"]) / (2.0 * c2)
            if x_min <= xv <= x_max:
                vals.append(_predict(model_kind, coefficients, xv))
    return min(vals), max(vals)


def _inverse(model_kind: str, coefficients: Dict[str, Any], y: float,
             x_min: float, x_max: float) -> Tuple[Optional[float], Dict[str, Any]]:
    """Solve the model for x given response y. Returns (x or None, fit_detail).
    Quadratic: BOTH real roots are recorded in fit_detail (auditable); the
    selection rule is PINNED here: the root nearest the fit-range midpoint.
    No real root → (None, ...) with NO_REAL_ROOT (loud data, never a crash)."""
    if model_kind == "linear_through_origin":
        b = float(coefficients["slope"])
        if b == 0.0:
            return None, {"reason": "zero slope — no x solves the model"}
        x = y / b
        return x, {"rule": "origin-linear x = y/b", "x": x}
    if model_kind == "linear":
        b = float(coefficients["slope"])
        a = float(coefficients["intercept"])
        if b == 0.0:
            return None, {"reason": "zero slope — no x solves the model"}
        x = (y - a) / b
        return x, {"rule": "linear x = (y - a)/b", "x": x}
    # quadratic: c2 x^2 + c1 x + (c0 - y) = 0
    c2 = float(coefficients["c2"])
    c1 = float(coefficients["c1"])
    c0 = float(coefficients["c0"]) - y
    if c2 == 0.0:
        # degenerate quadratic (c2 == 0): the declared linear leg
        if c1 == 0.0:
            return None, {"reason": "degenerate (c2=0, c1=0) — no x solves the model"}
        x = -c0 / c1
        return x, {"rule": "degenerate quadratic (c2=0): x = -c0'/c1", "x": x}
    disc = c1 * c1 - 4.0 * c2 * c0
    if disc < 0.0:
        return None, {"rule": "quadratic", "discriminant": disc,
                      "reason": "no real root (discriminant < 0)"}
    sq = math.sqrt(disc)
    r1 = (-c1 + sq) / (2.0 * c2)
    r2 = (-c1 - sq) / (2.0 * c2)
    if r1 == r2:
        return r1, {"rule": "quadratic", "discriminant": disc, "roots": [r1, r2],
                    "selected": r1, "selection": "double root"}
    mid = (x_min + x_max) / 2.0
    # PINNED selection rule: the root nearest the fit-range midpoint (A4.3).
    idx = 0 if abs(r1 - mid) <= abs(r2 - mid) else 1
    roots = [r1, r2]
    return roots[idx], {
        "rule": "quadratic — root nearest the fit-range midpoint",
        "discriminant": disc,
        "roots": roots,
        "fit_range_midpoint": mid,
        "selected": roots[idx],
    }


# ---------------------------------------------------------------------------
# ISTD role consistency (A3 — the bidirectional guard)
# ---------------------------------------------------------------------------
def _check_istd_consistency(istd_role: str, response_quantity: str) -> None:
    if istd_role == "internal_standard" and response_quantity == RESPONSE_QUANTITY_RAW:
        raise QuantificationError(
            CODE_ISTD_DOUBLE_APPLICATION,
            "istd.role='internal_standard' against a raw_area_pa_min model would re-ratio an "
            "already-ratioed curve — the ISTD division is applied exactly once (A3); name the fix: "
            "re-fit the model in ratio mode or declare istd.role='none'",
        )
    if istd_role == "none" and response_quantity == RESPONSE_QUANTITY_RATIO:
        raise QuantificationError(
            CODE_ISTD_DOUBLE_APPLICATION,
            "istd.role='none' against an area_ratio model would quantify raw areas off a ratio "
            "curve — the quantities do not match (A3); declare the ISTD role and window, or "
            "quantify against a raw-area model",
        )


# ---------------------------------------------------------------------------
# The public entry point
# ---------------------------------------------------------------------------
def quantify_peaks(ctx: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    """Consume the PROMOTED calibration model + a DIFFERENT run's peak table
    and publish ``quantified_peak_table`` (+ ``effective_parameters``).
    Returns the result dict (also used directly by the unit tests)."""
    p = dict(params)

    # ---- 1. Parameter validation (loud, named, zero defaults) ----
    for name in QUANT_REQUIRED_PARAMS:
        if name not in p:
            raise QuantificationError(
                "PARAM_MISSING", f"required parameter '{name}' is absent — no default is applied"
            )
    unknown = sorted(set(p) - QUANT_KNOWN_PARAMS)
    if unknown:
        raise QuantificationError(
            "PARAM_INVALID", f"unknown parameter(s) {unknown} — no silent ignore (unknown-is-unknown)"
        )
    fail_on_oor = _require_bool(p, "fail_on_out_of_range")
    # (allow_inline_inputs is a fail-closed GATE the shared loader reads —
    # spec A5.1/T2-2: absent → INPUT_NOT_PROMOTED, never PARAM_MISSING; the
    # runner hands run parameters through verbatim and the gate decides.)
    extrapolation = p["extrapolation"]
    if extrapolation not in EXTRAPOLATION_ENUM:
        raise QuantificationError(
            CODE_EXTRAPOLATION_UNSUPPORTED,
            f"extrapolation must be one of {list(EXTRAPOLATION_ENUM)}, got {extrapolation!r}",
        )
    extension_low = extension_high = None
    if extrapolation == "allow_within_declared_extension":
        extension_low = _require_number(p, "extension_low")
        extension_high = _require_number(p, "extension_high")
        if extension_low > extension_high:
            raise QuantificationError(
                "PARAM_INVALID",
                f"extension_low ({extension_low}) must be <= extension_high ({extension_high})",
            )
    amount_semantics = p["amount_semantics"]
    if amount_semantics not in AMOUNT_SEMANTICS_ENUM:
        raise QuantificationError(
            "PARAM_INVALID",
            f"amount_semantics must be one of {list(AMOUNT_SEMANTICS_ENUM)}, got {amount_semantics!r}",
        )
    multiplier = dilution = None
    if amount_semantics == "apply_multipliers":
        sample = p.get("sample")
        if not isinstance(sample, dict):
            raise QuantificationError(
                "PARAM_MISSING",
                "sample is required when amount_semantics='apply_multipliers' — the factors are "
                "DATA, never defaults",
            )
        multiplier = _require_number(sample, "multiplier")
        dilution = _require_number(sample, "dilution")
        if dilution == 0.0:
            raise QuantificationError("PARAM_INVALID", "sample.dilution must be non-zero (declared)")
    tol = p.get("quant_tolerance_percent")
    if tol is not None and (not _is_number(tol) or float(tol) <= 0.0):
        raise QuantificationError(
            "PARAM_INVALID", f"quant_tolerance_percent must be a positive number when declared, got {tol!r}"
        )

    istd = p["istd"]
    if not isinstance(istd, dict) or "role" not in istd:
        raise QuantificationError(
            "PARAM_MISSING", "istd.role is absent — absence is never normalization-by-default (A3)"
        )
    istd_role = istd["role"]
    if istd_role not in ISTD_ROLE_ENUM:
        raise QuantificationError(
            "PARAM_INVALID", f"istd.role must be one of {list(ISTD_ROLE_ENUM)}, got {istd_role!r}"
        )
    istd_rt_target = istd_rt_window = None
    if istd_role == "internal_standard":
        label = istd.get("compound_label")
        if not isinstance(label, str) or not label.strip():
            raise QuantificationError(
                "PARAM_MISSING",
                "istd.compound_label is required when role is 'internal_standard' — it names WHICH "
                "peak row is the internal standard in the sample table",
            )
        istd_rt_target = _require_number(istd, "rt_target_min")
        istd_rt_window = _require_number(istd, "rt_window_min")
        if istd_rt_target < 0.0 or istd_rt_window <= 0.0:
            raise QuantificationError(
                "RT_WINDOW_INVALID",
                f"istd: rt_target_min must be >= 0 and rt_window_min > 0 "
                f"(got {istd_rt_target!r}, {istd_rt_window!r})",
            )

    targets = p["targets"]
    if not isinstance(targets, list) or not targets:
        raise QuantificationError("PARAM_INVALID", "parameter 'targets' must be a non-empty array")
    for i, t in enumerate(targets):
        if not isinstance(t, dict):
            raise QuantificationError("PARAM_INVALID", f"targets[{i}] must be an object, got {t!r}")
        for f in ("compound_label", "rt_target_min", "rt_window_min"):
            if f not in t:
                raise QuantificationError(
                    "PARAM_MISSING", f"targets[{i}] is missing required field '{f}' — no default is applied"
                )
        if not isinstance(t["compound_label"], str) or not t["compound_label"].strip():
            raise QuantificationError("PARAM_INVALID", f"targets[{i}].compound_label must be a non-empty string")
        rt_t, rt_w = float(t["rt_target_min"]), float(t["rt_window_min"])
        if rt_t < 0.0 or rt_w <= 0.0:
            raise QuantificationError(
                "RT_WINDOW_INVALID",
                f"targets[{i}]: rt_target_min must be >= 0 and rt_window_min > 0 "
                f"(got {rt_t!r}, {rt_w!r})",
            )

    # ---- 2. Load the inputs (A5: file_bytes + json.loads; no row-coercion helper) ----
    # The shared loader raises calibration_fit.CalibrationError for the A5
    # input-load failure class (INPUT_NOT_PROMOTED / INPUT_JSON_INVALID); the
    # quant consumer re-wraps it into ITS OWN error class with the SAME code
    # and message — the runner sees the quantification module's failure
    # vocabulary (one error class per engine module; the codes are shared).
    model_handle = ctx.input("calibration_model")
    try:
        model_payload = load_structured_input(model_handle, p)
    except CalibrationError as e:
        # re-wrap in the quant consumer's own error class (one error class per
        # engine module) using the PREFIX-FREE .message (str(e) already carries
        # the code prefix — re-stamping it would double the token).
        raise QuantificationError(e.code, e.message) from None
    model = validate_model_payload(model_payload)

    table_handle = ctx.input("peak_table")
    try:
        table_payload = load_structured_input(table_handle, p)
    except CalibrationError as e:
        raise QuantificationError(e.code, e.message) from None
    if isinstance(table_payload, dict):
        rows = table_payload.get("rows")
        if not isinstance(rows, list):
            raise QuantificationError(
                CODE_PEAK_TABLE_SHAPE_INVALID,
                "peak_table input has no 'rows' list (GC-7 §A1 shape)",
            )
        rows = [dict(r) for r in rows if isinstance(r, dict)]
    elif isinstance(table_payload, list):
        rows = [dict(r) for r in table_payload if isinstance(r, dict)]
    else:
        raise QuantificationError(
            CODE_PEAK_TABLE_SHAPE_INVALID,
            f"peak_table input is not a peak table (got {type(table_payload).__name__})",
        )
    colset = set()
    for r in rows:
        colset.update(r.keys())
    missing = [c for c in PEAK_TABLE_REQUIRED_COLUMNS if c not in colset]
    if missing:
        raise QuantificationError(
            CODE_PEAK_TABLE_SHAPE_INVALID,
            f"peak_table input is missing required column(s) {missing} "
            f"(GC-7 §A1 subset: {list(PEAK_TABLE_REQUIRED_COLUMNS)})",
        )

    # model identity from the input's OWN pinned provenance (dref storage path
    # — an ECHO, never parsed for domain truth); the promoted-artifact layout
    # names the artifact id (artifactPromotion.ts).
    meta = model_handle.meta if hasattr(model_handle, "meta") and isinstance(model_handle.meta, dict) else {}
    src_path = meta.get("sourcePath") if isinstance(meta.get("sourcePath"), str) else None
    model_artifact_id = None
    if src_path:
        m = _PROMOTED_PATH_RE.match(src_path)
        if m:
            model_artifact_id = m.group(1)  # the promoted artifact's own id (layout-declared)
    model_params_digest = model["params_digest"]  # echoed (A6/A4.6), never recomputed

    # A3: the ISTD-role/model consistency gate (BIDIRECTIONAL — both
    # mismatch directions fail ISTD_DOUBLE_APPLICATION naming both sides).
    _check_istd_consistency(istd_role, model["response_quantity"])
    ratio_mode = model["response_quantity"] == RESPONSE_QUANTITY_RATIO

    amount_unit = model["amount_unit"]
    unit_slug = _unit_slug(amount_unit)
    amt_col = f"amount_{unit_slug}"
    rep_col = f"amount_reported_{unit_slug}"

    # A3: the ISTD combination is computed EXACTLY ONCE per sample table —
    # the declared ISTD peak's area is resolved up front (a missing/zero ISTD
    # peak is a hard ISTD_PEAK_NOT_FOUND before any row is quantified; a
    # multi-match is AMBIGUOUS_PEAK_MATCH — no nearest-RT rescue).
    # Invariant: ratio_mode ⇒ istd_role == 'internal_standard' ⇒ both
    # istd_rt_target/istd_rt_window were validated as finite numbers above
    # (PARAM_MISSING / RT_WINDOW_INVALID would have fired) — asserted here so
    # the invariant is checked, never assumed.
    istd_area: Optional[float] = None  # set only in ratio_mode (the A3 gate)
    if ratio_mode:
        assert istd_rt_target is not None and istd_rt_window is not None, \
            "ratio_mode requires a validated ISTD window (PARAM_MISSING/RT_WINDOW_INVALID gate)"
        istd_t = istd_rt_target
        istd_w = istd_rt_window
        istd_idx: Optional[int] = None
        for j, r2 in enumerate(rows):
            if _window_contains(r2, istd_t, istd_w):
                if istd_idx is not None:
                    raise QuantificationError(
                        CODE_AMBIGUOUS_PEAK_MATCH,
                        f"the declared ISTD (window [{istd_t - istd_w}, "
                        f"{istd_t + istd_w}] min) matches MULTIPLE peaks in "
                        f"peak_table (rows {istd_idx} and {j}) — no nearest-RT rescue",
                    )
                istd_idx = j
        if istd_idx is None:
            raise QuantificationError(
                CODE_ISTD_PEAK_NOT_FOUND,
                f"the declared ISTD has no matching peak row in peak_table (window "
                f"[{istd_t - istd_w}, {istd_t + istd_w}] min) — "
                f"the ratio is undefined; no fallback to raw area",
            )
        istd_sat = _saturated_reason(rows[istd_idx])
        istd_area, istd_reason = (None, istd_sat) if istd_sat else _row_area(rows[istd_idx], f"ISTD row {istd_idx}")
        if istd_area is None or istd_area == 0.0:
            raise QuantificationError(
                CODE_ISTD_PEAK_NOT_FOUND,
                f"the declared ISTD peak (peak_table row {istd_idx}) has no usable area "
                f"({istd_reason or 'zero'}) — the ratio is undefined; no fallback to raw area",
            )

    # ---- 3. RT-window matching + inverse prediction (per peak row) ----
    r_lo, r_hi = _response_range(model["model"], model["coefficients"],
                                 float(model["x_min"]), float(model["x_max"]))
    x_min_f, x_max_f = float(model["x_min"]), float(model["x_max"])
    out_rows: List[Dict[str, Any]] = []
    n_unassigned = 0
    n_oor = 0
    n_quantified = 0
    quantified_labels = set()

    # D5: match PER TARGET FIRST. Each declared target's in-window rows are
    # collected up front (the SAME declared-window vocabulary, inclusive
    # bounds — the A4.2 vocabulary the CAL revision used):
    #   * ZERO in-window rows for a target → the target is simply unmatched
    #     (named in the TARGET_UNMATCHED warning below — loudness is data);
    #   * MORE THAN ONE in-window row for ONE target → AMBIGUOUS_PEAK_MATCH
    #     naming the TWO row indices (spec A4.2: "Target matching MULTIPLE
    #     peaks in-window ... naming both rows"; no nearest-RT rescue);
    #   * a peak row claimed by MORE THAN ONE target → the DECLARED
    #     precedence rule resolves it: targets are matched in declared
    #     (parameters.targets) order, so the FIRST target in that order wins
    #     the shared row; the conflict is DECLARED — a warning log names every
    #     claimant (machine-readable, code=TARGET_WINDOW_OVERLAP), never a
    #     silent overwrite. The original run keyed its bookkeeping by the
    #     window BOUNDS (lo, hi) — two targets sharing a window therefore
    #     raised AMBIGUOUS for a SINGLE peak (naming "rows 0 and 0") and let
    #     the later target silently overwrite the earlier one on the same
    #     peak. Per-target matching + a named precedence rule fixes both.
    target_in_window: Dict[int, List[int]] = {}
    for ti, t in enumerate(targets):
        in_win = [i for i, r in enumerate(rows)
                  if _window_contains(r, float(t["rt_target_min"]), float(t["rt_window_min"]))]
        target_in_window[ti] = in_win
        if len(in_win) > 1:
            raise QuantificationError(
                CODE_AMBIGUOUS_PEAK_MATCH,
                f"target '{t['compound_label']}' (window "
                f"[{float(t['rt_target_min']) - float(t['rt_window_min'])}, "
                f"{float(t['rt_target_min']) + float(t['rt_window_min'])}] min) matches MULTIPLE "
                f"peaks in peak_table (rows {in_win[0]} and {in_win[1]}; rts "
                f"{rows[in_win[0]].get('rt_min')!r} and {rows[in_win[1]].get('rt_min')!r}) — "
                f"no nearest-RT rescue",
            )
    row_owner: Dict[int, int] = {}  # peak row index -> owning target index
    overlap_claims: List[Tuple[int, List[int]]] = []  # (row, [target idx...])
    for ti, t in enumerate(targets):  # declared order = the precedence rule
        for i in target_in_window[ti]:
            owner = row_owner.get(i)
            if owner is None:
                row_owner[i] = ti
            elif owner != ti:
                overlap_claims.append((i, sorted({owner, ti})))
    if overlap_claims:
        claim_text = "; ".join(
            f"peak_table row {i} (rt {rows[i].get('rt_min')!r}) is inside the windows of BOTH "
            f"'{targets[a]['compound_label']}' and '{targets[b]['compound_label']}'"
            for (i, (a, b)) in overlap_claims
        )
        ctx.log(
            f"quantification: {claim_text} — the DECLARED precedence rule resolves the shared row "
            f"to the FIRST-named target (targets are matched in declared parameters.targets order); "
            f"the conflict is declared data, never a silent overwrite (D5)",
            level="warning", code="TARGET_WINDOW_OVERLAP",
        )

    for i, row in enumerate(rows):
        rt = row.get("rt_min")
        if not _is_number(rt):
            raise QuantificationError(
                CODE_PEAK_TABLE_SHAPE_INVALID, f"peak_table row {i} rt_min is not a finite number: {rt!r}"
            )
        flags: List[str] = []
        sat_reason = _saturated_reason(row)
        area, area_reason = (None, sat_reason) if sat_reason else _row_area(row, f"peak_table row {i}")

        # identity: the declared target whose window contains this peak —
        # resolved PER TARGET above (the row's owner under the declared
        # precedence rule); a row claimed by several targets is quantified
        # once, by its owner, and the conflict is already declared (log).
        matched_target = targets[row_owner[i]] if i in row_owner else None
        if matched_target is None:
            n_unassigned += 1
            flags.append(FLAG_UNASSIGNED_PEAK)  # the peak is real; identity is unknown

        # the response quantity (A3: ratio computed ONCE per table; raw area
        # otherwise — the model's response_quantity says which)
        response = None
        if area is None:
            response_reason = area_reason
        else:
            response_reason = None
            if ratio_mode:
                assert istd_area is not None and istd_area > 0.0  # validated above (A3 gate)
                response = area / istd_area  # the ONE ISTD combination (A3)
            else:
                response = area

        # inverse prediction under the declared extrapolation policy
        amount: Optional[float] = None
        fit_detail: Dict[str, Any] = {}
        if response is None:
            flags.append(response_reason or FLAG_NO_REAL_ROOT)
        else:
            in_response_range = r_lo <= response <= r_hi
            if not in_response_range:
                # the response is OUTSIDE the model's declared [x_min, x_max]-
                # derived response range. The DECLARED extrapolation policy
                # decides the disposition (A4.3 — the loudness is data, the
                # arithmetic never guesses):
                #  allow_within_declared_extension → the row is still EMITTED
                #    (flagged EXTRAPOLATED) when the selected root (nearest
                #    the fit-range midpoint) lies inside the declared
                #    extension bounds; otherwise OUT_OF_RANGE;
                #  reject (or no real root) → OUT_OF_RANGE: hard failure when
                #    fail_on_out_of_range=true, else null + flag + metric.
                if extrapolation == "allow_within_declared_extension" and \
                        extension_low is not None and extension_high is not None:
                    x, detail = _inverse(model["model"], model["coefficients"],
                                         response, x_min_f, x_max_f)
                    fit_detail = detail
                    if x is not None and extension_low <= x <= extension_high:
                        amount = x
                        flags.append(FLAG_EXTRAPOLATED)
                    elif fail_on_oor:
                        label = matched_target["compound_label"] if matched_target else f"peak_table row {i}"
                        raise QuantificationError(
                            CODE_OUT_OF_RANGE,
                            f"{label}: response {response!r} is outside the model's declared "
                            f"[{r_lo!r}, {r_hi!r}] response range and the selected root "
                            f"{x!r} lies outside the declared extension [{extension_low!r}, "
                            f"{extension_high!r}] (model x-range [{x_min_f!r}, {x_max_f!r}]) — "
                            f"extrapolation={extrapolation!r} + fail_on_out_of_range=true is a "
                            f"hard failure",
                        )
                    else:
                        n_oor += 1
                        flags.append(FLAG_OUT_OF_RANGE)
                elif fail_on_oor:
                    label = matched_target["compound_label"] if matched_target else f"peak_table row {i}"
                    raise QuantificationError(
                        CODE_OUT_OF_RANGE,
                        f"{label}: response {response!r} is outside the model's declared "
                        f"[{r_lo!r}, {r_hi!r}] response range (model x-range [{x_min_f!r}, {x_max_f!r}]) — "
                        f"extrapolation='reject' + fail_on_out_of_range=true is a hard failure",
                    )
                else:
                    n_oor += 1
                    flags.append(FLAG_OUT_OF_RANGE)
            else:
                x, detail = _inverse(model["model"], model["coefficients"],
                                     response, x_min_f, x_max_f)
                fit_detail = detail
                if x is None:
                    flags.append(FLAG_NO_REAL_ROOT)
                elif not (x_min_f <= x <= x_max_f):
                    # the quadratic corner: response in range but the selected
                    # root outside the fit x-range → the declared policy decides
                    if extrapolation == "allow_within_declared_extension" and \
                            extension_low is not None and extension_high is not None and \
                            extension_low <= x <= extension_high:
                        amount = x
                        flags.append(FLAG_EXTRAPOLATED)
                    elif fail_on_oor:
                        label = matched_target["compound_label"] if matched_target else f"peak_table row {i}"
                        raise QuantificationError(
                            CODE_OUT_OF_RANGE,
                            f"{label}: inverse x={x!r} lies outside the model's declared fit range "
                            f"[{x_min_f!r}, {x_max_f!r}] — declared policy {extrapolation!r} + "
                            f"fail_on_out_of_range={fail_on_oor}",
                        )
                    else:
                        n_oor += 1
                        flags.append(FLAG_OUT_OF_RANGE)
                else:
                    amount = x

        # the reporting step (A4.4): the factors are applied EXACTLY ONCE.
        reported: Optional[float] = None
        if amount is not None:
            n_quantified += 1
            if matched_target is not None:
                quantified_labels.add(matched_target["compound_label"])
            if amount_semantics == "apply_multipliers":
                reported = amount * float(multiplier) / float(dilution)
            else:
                reported = amount  # model_amount_as_reported: the model's x directly

        out_rows.append({
            "peak": i + 1,
            "rt_min": float(rt),
            "compound_label": matched_target["compound_label"] if matched_target else None,
            "compound_ref": matched_target.get("compound_ref") if matched_target else None,
            "area_pa_min": area,  # verbatim (null carries its inherited reason)
            "area_percent": row.get("area_percent"),  # verbatim (A4.5)
            "response": response,
            amt_col: amount,
            rep_col: reported,
            "fit_detail": fit_detail,
            "flags": flags,
        })

    # a target that owns NO quantified row under the declared precedence rule
    # → the row is kept with nulls + the code is DATA (bait-#7: loudness is
    # data) — the UNASSIGNED count covers peaks; unmatched targets are named
    # in a warning log (machine-readable). Ownership is computed by the
    # per-target claim loop above (row_owner): a target is matched when it
    # OWNS at least one row — either a window that held only its own peaks, or
    # (under the declared precedence rule) a shared row it won as the
    # FIRST-named claimant. A target whose window held a peak it LOST to an
    # earlier-named claimant owns no row → it is unmatched here (the overlap
    # is already declared as TARGET_WINDOW_OVERLAP above).
    matched_target_labels = {targets[ti]["compound_label"] for ti in row_owner.values()}
    unmatched_targets = [t["compound_label"] for t in targets if t["compound_label"] not in matched_target_labels]

    # ---- 4. Publish (A4.5 + A6) ----
    quant_payload: Dict[str, Any] = {
        "rows": out_rows,
        "columns": ["peak", "rt_min", "compound_label", "compound_ref", "area_pa_min",
                    "area_percent", "response", amt_col, rep_col, "fit_detail", "flags"],
        "model_artifact_id": model_artifact_id,
        "model_params_digest": model_params_digest,
        "extrapolation_policy": extrapolation,
        "amount_semantics": amount_semantics,
        "calibration_scope": CALIBRATION_SCOPE,
        "params_digest": _params_digest(p),
    }
    units = {
        "rt_min": "min",
        "area_pa_min": "pA*min",
        "response": model["response_quantity"],
        amt_col: amount_unit,
        rep_col: amount_unit,
    }
    schema = {
        "columns": {
            "peak": "1-based peak row index of the CONSUMED sample table (the different run's GC-7 artifact)",
            "rt_min": "retention time (min) verbatim from the sample table",
            "compound_label": "declared target label (the SAME declared-window vocabulary the CAL revision used); null + UNASSIGNED_PEAK when no declared target matches",
            "compound_ref": "declared target ref echoed verbatim; null when undeclared or unmatched",
            "area_pa_min": "sample table's area verbatim — never recomputed (null carries the inherited GC-7 reason)",
            "area_percent": AREA_PERCENT_HONESTY,
            "response": "the quantity fed to the inverse prediction (the model's declared response_quantity: raw area or the ONE ISTD-combined ratio)",
            amt_col: f"inverse-predicted amount in the MODEL's declared unit ({amount_unit}) — the units-in-names convention; null + OUT_OF_RANGE / NO_REAL_ROOT when the declared policy says so",
            rep_col: f"the reporting step (A4.4): {amount_semantics} — multiplier/dilution applied EXACTLY ONCE when apply_multipliers; the model's x directly when model_amount_as_reported",
            "fit_detail": "machine-readable inverse detail (quadratic: BOTH roots + the pinned nearest-midpoint selection)",
            "flags": "reason codes (OUT_OF_RANGE / EXTRAPOLATED / NO_REAL_ROOT / UNASSIGNED_PEAK / inherited GC-7 null reasons); a row claimed by several targets is quantified ONCE by the first-named target (declared precedence rule) — the conflict is a declared warning log (TARGET_WINDOW_OVERLAP), never a silent overwrite or a self-conflict",
        },
        "note": (
            "analytical quantification (calibration_scope: 'analytical') — cross-run consumer of the "
            "PROMOTED calibration model; the concentration unit is the MODEL's declared amount unit "
            "(never a re-labelled area unit); area% is never silently mass%/concentration"
        ),
    }
    ctx.publish("quantified_peak_table", quant_payload, kind="table", units=units, schema=schema)

    # effective_parameters (A6 / GC-7 §A3.6 doctrine)
    eff: Dict[str, Any] = {
        "parameters": p,
        "params_digest": quant_payload["params_digest"],
        "model_params_digest": model_params_digest,  # the CAL run's digest echo (A6)
    }
    hashes: Dict[str, str] = {}
    for name in sorted(ctx.input_names()):
        try:
            h = ctx.input(name).meta
        except KeyError:
            continue
        ch = h.get("contentHash") if isinstance(h, dict) else None
        if isinstance(ch, str):
            hashes[name] = ch
    if hashes:
        eff["source_content_sha256"] = hashes
    ctx.publish("effective_parameters", eff, kind="table",
                schema={"note": "exact run parameters + model digest echo + provenance echoes (machine-readable)"})

    # Metrics (A4.6: machine-readable, GC-7's doctrine)
    ctx.metric("compounds_quantified", len(quantified_labels), unit="compounds",
               label="distinct declared targets with a quantified amount")
    ctx.metric("peaks_unassigned", n_unassigned, unit="peaks",
               label="peaks with no declared target match (UNASSIGNED_PEAK — identity unknown, never invented)")
    ctx.metric("out_of_range_count", n_oor, unit="peaks",
               label="responses outside the model's declared range (flagged or hard-failed per policy)")
    ctx.metric("ambiguous_matches", 0, unit="targets",
               label="targets matching multiple peaks (hard failure when present — never a nearest-RT rescue)")
    ctx.metric("model_artifact_id", model_artifact_id if model_artifact_id else "absent",
               label="the promoted model artifact's id (from the input's pinned dref path layout) or absent")
    ctx.metric("model_params_digest", model_params_digest, unit=None,
               label="the CAL run's params_digest, echoed (A6)")
    ctx.metric("params_digest", quant_payload["params_digest"], unit=None,
               label="sha256 of canonicalized quant run parameters")
    if tol is not None:
        ctx.metric("quant_tolerance_percent_declared", float(tol), unit="%",
                   label="consumer-side verification tolerance declared by the run — echoed, never applied by the algorithm")
    if unmatched_targets:
        ctx.log(f"quantification: declared target(s) {unmatched_targets} own no quantified peak row — "
                f"either their window held no peak or the shared peak went to an earlier-named target under the "
                f"declared precedence rule; the unmatched targets are data, not a silent drop",
                level="warning", code="TARGET_UNMATCHED")
    if n_oor:
        ctx.log(f"quantification: {n_oor} peak(s) outside the model's declared response range — "
                f"flagged OUT_OF_RANGE (declared policy fail_on_out_of_range={fail_on_oor})",
                level="warning", code="OUT_OF_RANGE")

    ctx.view("quantified_table_view", "table", artifact="quantified_peak_table")

    return {
        "rows": out_rows,
        "columns": quant_payload["columns"],
        "amount_unit": amount_unit,
        "amt_col": amt_col,
        "rep_col": rep_col,
        "model": model,
        "model_artifact_id": model_artifact_id,
        "metrics": {m["name"]: m["value"] for m in ctx.manifest().metrics},
        "params_digest": quant_payload["params_digest"],
    }
