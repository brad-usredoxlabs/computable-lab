"""GC-7 — declared-settings peak integration (stdlib core).

The reusable scientific core of the GC-7 analysis revision. Everything here is
PURE w.r.t. its inputs: ``integrate_peaks(ctx, decoded_signals, params)`` reads
ONLY the named decoded inputs and the declared run parameters. There are ZERO
hardcoded domain truths in this module: no NAS paths, no method names, no
compound lists, no filename literals, and NO threshold literal in algorithm
position — every scientific threshold arrives via ``params[...]`` from
validated run parameters. The runner does not validate parameters; THIS module
is the validator and fails loudly with a named ``IntegrationError`` code on
anything missing/unknown (GC-2's unknown-is-unknown rule).

Contract anchors (promoted spec 2026-10-28_GC-7-integration-revision.md):
- §A1 peak-table columns + units + declared-null reason codes (a row with a
  null numeric column MUST carry its reason code in ``flags``; no code path
  substitutes 0.0 for null — KERRY lesson, GC-1 :84);
- §A2 parameter contract (gc-method effective-settings mapping);
- §A3 pipeline (validation → timed events → baseline → detection → widths/
  rejects → saturated rule → metrics);
- §A3.6 artifact + view output contract.

Declared interpretations (OQ4 — the vendor semantics are undocumented per the
GC-1 IQ1.MTH note; the revision's methodNotes says so verbatim):
- vertical-drop baseline: a snaking centered rolling-min floor (declared
  baseline_window_s), refined by a centered smoothing pass (declared
  peak_width_s), then a peak-referenced VERTICAL DROP: under each detected
  maximum the baseline drops to the foot level (the floor in the region
  just outside the peak's prominence window). A plain min filter under a
  peak top would return the peak's own values — the drop is what makes the
  baseline honest under peaks.
- tangent skim: after the drop, valleys between adjacent maxima whose floor
  lies in the declared ratio band (skim_ratio·small_h < floor <
  valley_to_peak_ratio·small_h — a ONE-SIDED lower gate, spec §A3.3: the
  floor must rise above the smaller flank's half-height by ratio
  skim_ratio, and valley_to_peak_ratio gates which valleys skim) are
  skimmed to the straight line between the two flanks' foot points; deep
  valleys (below the band) are NOT skimmed.
- detection: flat-top-aware local maxima strictly above the prominence floor
  (slope_sensitivity × the segment's robust range); peak windows extend to
  the prominence floor and are TILED at the valley between overlapping
  maxima (the shared region is never double-counted — linearity of the
  trapezoid over the tiled union).
ORDERING DECLARED: detect → baseline → skim → re-measure (a fixed two-pass
convergence: detect on the seed baseline → build the baseline → detect again
on the built baseline → build again → the final detection measures).
Synthetic-truth tests pin THIS behavior, not ChemStation's.

Determinism (bait #11): maxima are ordered by index (== (rt, index) order on
the decoder's linear axis); every sum that feeds a reported value uses
``math.fsum``; the params digest is sha256 over
``json.dumps(params, sort_keys=True, separators=(",", ":"))``. Same inputs
twice → byte-identical digest / table JSON / metrics.

UNIT CONVENTION (declared): the axis is in MINUTES (the signal artifact's
axis_units) while the ``*_s`` parameters are in SECONDS (their unit is in
the field name — gc-method convention). Every seconds→samples conversion
therefore divides by 60 * dt (dt in min) — a unit constant, not a domain
threshold.

Backend selection (§A3.0): the stdlib path is pure (lists + math). The
optional ``backend == "scipy"`` branch lazily imports scipy INSIDE the branch;
an ImportError there is the DECLARED failure ``BACKEND_UNAVAILABLE`` — never a
silent fallback to/from scipy (GC-5's no-substitution policy mirrored).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import tempfile
from typing import Any, Dict, List, Optional, Sequence, Tuple


# ---------------------------------------------------------------------------
# Declared failures — NAMED codes (each has its own test, T1-1/T1-10)
# ---------------------------------------------------------------------------
class IntegrationError(Exception):
    """A declared, named integration failure. ``code`` is the machine token."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


# Reason codes for DECLARED-NULL cells (§A1). A row with a null numeric column
# MUST carry one of these in ``flags`` — the pairing invariant is asserted both
# ways by the tests (T1-12).
REASON_SATURATED = "UNRECOVERABLE_SATURATED"
REASON_ZERO_HEIGHT = "UNDEFINED_ZERO_HEIGHT"
REASON_SIBLING_AREA_NULL = "UNDEFINED_SIBLING_AREA_NULL"
REASON_ZERO_TOTAL = "UNDEFINED_ZERO_TOTAL"
REASON_HALF_HEIGHT_UNBOUNDED = "UNDEFINED_HALF_HEIGHT_UNBOUNDED"
FLAG_TIMED_OFF_WINDOW = "TIMED_OFF_WINDOW"
FLAG_OVERLAP_SHARED_BASELINE = "OVERLAP_SHARED_BASELINE"

# Column definitions + units ship ONTO THE ARTIFACT as data (§A1) — the
# definitions live in DATA, not inferred by readers.
PEAK_TABLE_COLUMNS: List[Dict[str, Any]] = [
    {"name": "peak", "type": "integer", "units": None,
     "definition": "1-based index in RT order"},
    {"name": "rt_min", "type": "number", "units": "min",
     "definition": "time-axis value at the max sample inside the peak window"},
    {"name": "height_pa", "type": "number", "units": "pA",
     "definition": "max sample value minus the peak's baseline at the RT point"},
    {"name": "area_pa_min", "type": "number", "units": "pA*min",
     "definition": "trapezoid of max(signal - baseline, 0) over the peak's "
                   "start/end window (GC-1 decD area method)"},
    {"name": "width_min", "type": "number", "units": "min",
     "definition": "area_pa_min / height_pa (tangential-equivalent width)"},
    {"name": "area_percent", "type": "number", "units": "% of reported total",
     "definition": "area / sum(reported non-null areas) * 100 over the current "
                   "table; null on EVERY row when any accepted peak's area is "
                   "null or the sum is zero"},
    {"name": "symmetry", "type": "number", "units": "ratio",
     "definition": "front/back half-height widths at half height (f/b); "
                   "symmetric ~ 1"},
    {"name": "saturated", "type": "boolean", "units": None,
     "definition": "declared rule: >= saturated_min_plateau_points consecutive "
                   "samples within saturated_top_fraction_of_max of the peak's "
                   "max (values arrive as parameters)"},
    {"name": "flags", "type": "string[]", "units": None,
     "definition": "reason codes above + TIMED_OFF_WINDOW boundary notes"},
]

PEAK_TABLE_UNITS: Dict[str, Optional[str]] = {c["name"]: c["units"] for c in PEAK_TABLE_COLUMNS}

# Parameter vocabulary (§A2). REQUIRED = absent means PARAM_MISSING (no
# defaults applied). Every unit-bearing field carries its unit IN the name.
REQUIRED_PARAMS: Tuple[str, ...] = (
    "baseline_correction",
    "baseline_window_s",
    "peak_width_s",
    "slope_sensitivity",
    "min_width_factor",
    "max_width_factor",
    "saturated_top_fraction_of_max",
    "saturated_min_plateau_points",
    "backend",
)
OPTIONAL_PARAMS: Tuple[str, ...] = (
    "timed_events",
    "area_reject_pa_min",
    "height_reject_pa",
    "method_label",
    "method_revision_ref",
    "channel",
    "skim_ratio",
    "valley_to_peak_ratio",
)
KNOWN_PARAMS: frozenset = frozenset(REQUIRED_PARAMS) | frozenset(OPTIONAL_PARAMS)

# The gc-method enum values (§A2): 'other' validates (it is a shipped gc-method
# value) but is a NAMED declared failure — no invented semantics.
BASELINE_CORRECTION_ENUM = ("none", "tangent_skim", "vertical_drop", "other")
BACKEND_ENUM = ("stdlib", "scipy")
INTEGRATION_STATES = ("on", "off")

# The DECLARED default integration state before the first timed event
# (bait #3: it must be DECLARED, not incidental). The contract logs it.
DEFAULT_INTEGRATION_STATE = "on"


# ---------------------------------------------------------------------------
# Validation helpers (loud, named, zero defaults)
# ---------------------------------------------------------------------------
def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v))


def _require_number(params: Dict[str, Any], name: str, *, minimum: Optional[float] = None,
                    maximum: Optional[float] = None, integer: bool = False) -> float:
    if name not in params:
        raise IntegrationError("PARAM_MISSING",
                               f"required parameter '{name}' is absent — no default is applied")
    v = params[name]
    if not _is_number(v):
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}' must be a finite number, got {v!r}")
    fv = float(v)
    if integer and int(fv) != fv:
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}' must be an integer, got {v!r}")
    if minimum is not None and fv < minimum:
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}'={fv} is below its declared minimum {minimum}")
    if maximum is not None and fv > maximum:
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}'={fv} exceeds its declared maximum {maximum}")
    return fv


def _require_enum(params: Dict[str, Any], name: str, allowed: Tuple[str, ...]) -> str:
    if name not in params:
        raise IntegrationError("PARAM_MISSING",
                               f"required parameter '{name}' is absent — no default is applied")
    v = params[name]
    if not isinstance(v, str) or v not in allowed:
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}' must be one of {list(allowed)}, got {v!r}")
    return v


def _optional_number(params: Dict[str, Any], name: str, *, minimum: Optional[float] = None,
                     maximum: Optional[float] = None) -> Optional[float]:
    if name not in params:
        return None
    v = params[name]
    if not _is_number(v):
        raise IntegrationError("PARAM_INVALID",
                               f"parameter '{name}' must be a finite number when present, got {v!r}")
    fv = float(v)
    if minimum is not None and fv < minimum:
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}'={fv} is below its declared minimum {minimum}")
    if maximum is not None and fv > maximum:
        raise IntegrationError("PARAM_INVALID", f"parameter '{name}'={fv} exceeds its declared maximum {maximum}")
    return fv


def _optional_string(params: Dict[str, Any], name: str) -> Optional[str]:
    if name not in params:
        return None
    v = params[name]
    if not isinstance(v, str):
        raise IntegrationError("PARAM_INVALID",
                               f"parameter '{name}' must be a string when present, got {v!r}")
    return v


def _validate_timed_events(params: Dict[str, Any], axis_range: Tuple[float, float],
                           ctx: Any) -> List[Dict[str, Any]]:
    """Validate the timed_events array (§A2/§A3.1/§A3.2). The array MUST
    already be sorted by at_min (unsorted → PARAM_INVALID, T1-10); an event
    past the trace end is DECLARED via a log line, not swallowed (it opens a
    window with no samples). Returns the normalized list (input order)."""
    if "timed_events" not in params:
        return []
    evs = params["timed_events"]
    if not isinstance(evs, list):
        raise IntegrationError("PARAM_INVALID",
                               f"parameter 'timed_events' must be an array, got {type(evs).__name__}")
    out: List[Dict[str, Any]] = []
    prev_at: Optional[float] = None
    for i, ev in enumerate(evs):
        if not isinstance(ev, dict):
            raise IntegrationError("PARAM_INVALID", f"timed_events[{i}] must be an object, got {ev!r}")
        if "at_min" not in ev:
            raise IntegrationError("PARAM_MISSING", f"timed_events[{i}] is missing required field 'at_min'")
        at = ev["at_min"]
        if not _is_number(at) or at < 0:
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events[{i}].at_min must be a number >= 0, got {at!r}")
        if prev_at is not None and float(at) < prev_at:
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events is not sorted by at_min (event {i} at {at} < previous {prev_at})")
        prev_at = float(at)
        if "integration" not in ev:
            raise IntegrationError("PARAM_MISSING", f"timed_events[{i}] is missing required field 'integration'")
        integ = ev["integration"]
        if integ not in INTEGRATION_STATES:
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events[{i}].integration must be one of {list(INTEGRATION_STATES)}, got {integ!r}")
        slope = ev.get("slope_sensitivity")
        if slope is not None and not (_is_number(slope) and 0 <= float(slope) <= 1):
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events[{i}].slope_sensitivity must be a fraction in [0,1], got {slope!r}")
        pw = ev.get("peak_width_s")
        if pw is not None and not (_is_number(pw) and float(pw) > 0):
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events[{i}].peak_width_s must be a positive number, got {pw!r}")
        ar = ev.get("area_reject_pa_min")
        if ar is not None and not _is_number(ar):
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events[{i}].area_reject_pa_min must be a number, got {ar!r}")
        hr = ev.get("height_reject_pa")
        if hr is not None and not _is_number(hr):
            raise IntegrationError("PARAM_INVALID",
                                   f"timed_events[{i}].height_reject_pa must be a number, got {hr!r}")
        if float(at) > axis_range[1]:
            ctx.log(
                f"peak_integration: timed_events[{i}] at_min={float(at)} is past the trace end "
                f"({axis_range[1]} min) — declared, kept (it opens a window with no samples)",
                level="warning", code="TIMED_EVENT_PAST_TRACE_END",
            )
        out.append({
            "at_min": float(at),
            "integration": integ,
            "slope_sensitivity": (float(slope) if slope is not None else None),
            "peak_width_s": (float(pw) if pw is not None else None),
            "area_reject_pa_min": (float(ar) if ar is not None else None),
            "height_reject_pa": (float(hr) if hr is not None else None),
        })
    return out


def _params_digest(params: Dict[str, Any]) -> str:
    """sha256 of the canonicalized params JSON — the provenance echo key."""
    return hashlib.sha256(
        json.dumps(params, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


# ---------------------------------------------------------------------------
# Baseline + geometry helpers (DECLARED interpretations, OQ4)
# ---------------------------------------------------------------------------
def _rolling_min_centered_inclusive(values: Sequence[float], r: int) -> List[float]:
    """Centered moving-min whose window is [i-r, i+r] INCLUSIVE of i (so the
    sample itself is always a candidate), clamped at the edges. A min filter
    never exceeds the local floor — the honest property the baseline relies
    on. Pure, O(n*r); corpus sizes (<= ~73k points) run well under a second
    of CPython."""
    n = len(values)
    if n == 0:
        return []
    out: List[float] = []
    for i in range(n):
        lo = max(0, i - r)
        hi = min(n, i + r + 1)
        m = values[lo]
        for j in range(lo + 1, hi):
            if values[j] < m:
                m = values[j]
        out.append(m)
    return out


def _segmented_rolling_min(values: Sequence[float], segs: List[Dict[str, Any]],
                           r: int) -> List[float]:
    """Per-sample centered moving-min whose window is CLIPPED TO THE SAMPLE'S
    SEGMENT (spec §A3.3: "per-segment the window resets at off boundaries").
    An off segment's samples never enter an on segment's floor and vice
    versa — each segment is floored from its own measured signal."""
    n = len(values)
    out = list(values)
    for seg in segs:
        s, e = seg["start"], seg["end"]
        if e - s < 2:
            continue
        sub = list(values[s:e])
        out[s:e] = _rolling_min_centered_inclusive(sub, r)
    return out


def _segment_floor(seg: Dict[str, Any], values: Sequence[float], base: Sequence[float]) -> float:
    """The segment's prominence floor = slope_sensitivity × (segmax −
    baseline min) over the segment span (declared)."""
    s, e = seg["start"], seg["end"]
    segmax = max(values[i] for i in range(s, e))
    basemin = min(base[i] for i in range(s, e))
    return seg["eff"]["slope_sensitivity"] * (segmax - basemin)


def _peak_windows(
    maxima: List[Tuple[int, float, int]],
    values: Sequence[float],
    base: Sequence[float],
    segs: List[Dict[str, Any]],
    on_mask: Sequence[bool],
) -> List[Dict[str, Any]]:
    """Prominence-floor-bounded window per maximum (the trapezoid window).
    Extends from the max while (signal − baseline) exceeds the segment's
    prominence floor; stops at an integration-off boundary (declared: a
    window truncated at an off boundary carries the TIMED_OFF_WINDOW note).
    Returns [{idx, seg, start, end, trunc}] in index order."""
    n = len(values)
    out: List[Dict[str, Any]] = []
    for (idx, _val, seg_idx) in maxima:
        seg = segs[seg_idx]
        floor = _segment_floor(seg, values, base)
        start = idx
        truncated = False
        while start > 0 and on_mask[start - 1] and (values[start - 1] - base[start - 1]) > floor:
            start -= 1
        if start > 0 and not on_mask[start - 1]:
            truncated = True
        end = idx
        while end + 1 < n and on_mask[end + 1] and (values[end + 1] - base[end + 1]) > floor:
            end += 1
        if end + 1 < n and not on_mask[end + 1]:
            truncated = True
        out.append({"idx": idx, "seg": seg_idx, "start": start, "end": end, "trunc": truncated})
    out.sort(key=lambda m: m["idx"])
    return out


def _apply_tangent_skim(
    base: List[float],
    values: Sequence[float],
    windows: List[Dict[str, Any]],
    skim_ratio: float,
    valley_to_peak_ratio: float,
    ctx: Any,
) -> List[float]:
    """DECLARED tangent skim (OQ4). For each adjacent pair of peak windows,
    let the valley be the local minimum of (value − baseline) between the
    two maxima, with flanks h_a/h_b (the two maxima's heights over the
    pre-skim baseline) and small_h = min(h_a, h_b). When the valley floor
    lies in the declared band — skim_ratio·small_h < floor <
    valley_to_peak_ratio·small_h (a ONE-SIDED lower gate per spec §A3.3:
    the floor must rise above the smaller flank's half-height by ratio
    skim_ratio; valley_to_peak_ratio gates which valleys skim) — the valley
    region (between the two maxima) is skimmed to the straight line between
    the two flanks' foot points (the window edges): a shallow shoulder is
    skimmed, a deep valley (peaks are distinct) is NOT. Synthetic tests pin
    THIS behavior — not ChemStation's (vendor-undocumented)."""
    n = len(values)
    out = list(base)
    ws = sorted(windows, key=lambda w: w["idx"])
    for a, b in zip(ws[:-1], ws[1:]):
        ia, ib = a["idx"], b["idx"]
        if ib - ia < 2:
            continue
        h_a = values[ia] - base[ia]
        h_b = values[ib] - base[ib]
        small_h = min(h_a, h_b)
        if small_h <= 0:
            continue
        # Valley floor between the maxima (pre-skim baseline).
        iv = ia
        floor = values[ia] - base[ia]
        for j in range(ia + 1, ib):
            d = values[j] - base[j]
            if d < floor:
                floor = d
                iv = j
        if not (skim_ratio * small_h < floor < valley_to_peak_ratio * small_h):
            continue
        # Foot points: the window edges of each flank (where the prominence
        # floor is crossed). The skim line connects them.
        fa, fb = a["start"], b["end"]
        lo_line = base[fa]
        hi_line = base[fb]
        span = max(1, fb - fa)
        for j in range(fa, fb + 1):
            line = lo_line + (hi_line - lo_line) * ((j - fa) / span)
            if line > out[j]:
                out[j] = line
        ctx.log(
            f"peak_integration: tangent skim applied to the valley at {values[iv] - base[iv]:.6f} "
            f"(declared band {skim_ratio * small_h:.6f} .. {valley_to_peak_ratio * small_h:.6f})",
            level="info", code="TANGENT_SKIM_APPLIED",
        )
    return out


def _build_baseline(
    mode: str,
    values: Sequence[float],
    dt: float,
    baseline_window_s: float,
    peak_width_s: float,
    skim_ratio: Optional[float],
    valley_to_peak_ratio: Optional[float],
    maxima: List[Tuple[int, float, int]],
    segs: List[Dict[str, Any]],
    on_mask: Sequence[bool],
    prev_base: Sequence[float],
    ctx: Any,
) -> List[float]:
    """Per-sample baseline y(i) for the WHOLE trace (off segments included —
    the emitted baseline trace covers them; it is the measured baseline,
    honest). DECLARED interpretations (OQ4):

    - 'none': y = 0 line; heights/areas are RAW (logged).
    - 'vertical_drop' / 'tangent_skim': a snaking centered rolling-min floor
      (declared baseline_window_s), refined by a centered smoothing pass
      (declared peak_width_s), then the peak-referenced VERTICAL DROP under
      each detected maximum (the baseline drops to the foot level just
      outside the prominence window). tangent_skim additionally skims the
      band-matched valleys (ORDERING DECLARED: detect → baseline → skim →
      re-measure).
    """
    n = len(values)
    if n == 0:
        return []
    if mode == "none":
        ctx.log(
            "peak_integration: baseline_correction='none' — the baseline is the y=0 line; "
            "heights and areas are RAW signal values (declared, not corrected)",
            level="info", code="BASELINE_NONE_RAW",
        )
        return [0.0] * n
    win_pts = max(1, int(round(baseline_window_s / (60.0 * dt)))) if dt > 0 else 1
    smo_pts = max(1, int(round(peak_width_s / (60.0 * dt)))) if dt > 0 else 1
    # Per-segment windows (spec §A3.3: the window resets at off boundaries).
    snaked = _segmented_rolling_min(values, segs, win_pts // 2)
    base = _segmented_rolling_min(snaked, segs, smo_pts // 2)
    windows = _peak_windows(maxima, values, prev_base, segs, on_mask)
    # The peak-referenced VERTICAL DROP: under each maximum, the baseline
    # drops to the FOOT level — the floor measured in a small neighborhood
    # just OUTSIDE the prominence window (where the min filter is honest:
    # the peak's own samples never enter the foot neighborhood). A plain
    # min filter under a peak top would return the peak's own values; the
    # drop is what makes the baseline honest under peaks. DECLARED details
    # (OQ4): the foot neighborhood radius = the smoothing pass radius
    # (peak_width_s-derived — a declared parameter, not a literal); feet
    # are read from the PRE-DROP baseline and applied in one pass (no
    # chaining between peaks); the drop only ever LOWERS the baseline
    # (min-only), so it can never fabricate signal.
    m = max(1, smo_pts // 2)
    feet: List[Tuple[int, int, float]] = []
    pre_drop = list(base)
    for w in windows:
        lo_a, hi_a = max(0, w["start"] - m), w["start"]
        lo_b, hi_b = w["end"], min(n, w["end"] + m + 1)
        foot_vals: List[float] = []
        if hi_a > lo_a:
            foot_vals.extend(pre_drop[lo_a:hi_a])
        if hi_b > lo_b:
            foot_vals.extend(pre_drop[lo_b:hi_b])
        if not foot_vals:
            continue
        feet.append((w["start"], w["end"], min(foot_vals)))
    for s_i, e_i, foot in feet:
        for i in range(s_i, e_i + 1):
            if base[i] > foot:
                base[i] = foot
    if mode == "tangent_skim":
        if skim_ratio is None or valley_to_peak_ratio is None:
            ctx.log(
                "peak_integration: baseline_correction='tangent_skim' without declared "
                "skim_ratio/valley_to_peak_ratio — the skim leg is OFF (declared); "
                "the vertical-drop baseline stands",
                level="warning", code="SKIM_RATIO_ABSENT",
            )
            return base
        return _apply_tangent_skim(base, values, windows, float(skim_ratio),
                                   float(valley_to_peak_ratio), ctx)
    return base


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
def _local_max_candidates(values: Sequence[float]) -> List[Tuple[int, float]]:
    """Flat-top-aware local maxima. A maximal run of EQUAL values strictly
    higher than both neighboring runs is ONE candidate at the run's CENTER
    (deterministic; a saturated plateau must be detectable — T1-8). A
    single-sample strict max is the run-length-1 case. Edge runs (trace
    start/end) have one neighbour — an edge run is a candidate iff it beats
    its single neighbour (declared). Returns [(index, value)]."""
    n = len(values)
    if n == 0:
        return []
    cands: List[Tuple[int, float]] = []
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[j + 1] == values[i]:
            j += 1
        left = values[i - 1] if i > 0 else float("-inf")
        right = values[j + 1] if j + 1 < n else float("-inf")
        if values[i] > left and values[i] > right:
            cands.append(((i + j) // 2, values[i]))
        i = j + 1
    return cands


def _segment_index(axis: Sequence[float], t: float, lo: int, hi: int) -> int:
    """First index in [lo, hi) with axis[i] >= t (== the half-open walk)."""
    i = lo
    while i < hi and axis[i] < t:
        i += 1
    return i


def _build_segments(axis: Sequence[float], events: List[Dict[str, Any]],
                    defaults: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The half-open [at_i, at_{i+1}) walk over the axis (A3.2). Every segment
    (on AND off) is emitted — detection runs on all (off candidates are only
    counted, T1-5); per-segment effective settings = the globals with the
    opening event's overrides applied from its at_min forward. The
    pre-first-event state is the DECLARED default 'on' (logged by the caller)."""
    t0, t_end = axis[0], axis[-1]
    n = len(axis)
    bounds: List[Tuple[float, float, str, Optional[Dict[str, Any]]]] = []
    cursor = t0
    current_state = DEFAULT_INTEGRATION_STATE
    current_ev: Optional[Dict[str, Any]] = None
    for ev in events:
        a = ev["at_min"]
        if a > cursor:
            bounds.append((cursor, a, current_state, current_ev))
        cursor = max(cursor, a)
        current_state = ev["integration"]
        current_ev = ev
    if cursor < t_end:
        bounds.append((cursor, t_end, current_state, current_ev))
    segs: List[Dict[str, Any]] = []
    for (s0, s1, st, ev) in bounds:
        i0 = _segment_index(axis, s0, 0, n)
        i1 = _segment_index(axis, s1, 0, n)
        if i1 <= i0:
            continue
        eff = {
            "slope_sensitivity": ev["slope_sensitivity"] if (ev and ev["slope_sensitivity"] is not None)
            else defaults["slope_sensitivity"],
            "peak_width_s": ev["peak_width_s"] if (ev and ev["peak_width_s"] is not None)
            else defaults["peak_width_s"],
            "area_reject_pa_min": ev["area_reject_pa_min"] if (ev and ev["area_reject_pa_min"] is not None)
            else defaults["area_reject_pa_min"],
            "height_reject_pa": ev["height_reject_pa"] if (ev and ev["height_reject_pa"] is not None)
            else defaults["height_reject_pa"],
        }
        segs.append({"start": i0, "end": i1, "state": st, "eff": eff,
                     "t_start": s0, "t_end": s1})
    return segs


def _detect(
    values: Sequence[float],
    base: Sequence[float],
    segs: List[Dict[str, Any]],
    dt: float,
) -> List[Tuple[int, float, int]]:
    """Local maxima (flat-top-aware) strictly above baseline + prominence
    floor, per segment (ON and OFF — off candidates are counted, not tabled).
    Prominence floor = slope_sensitivity × (segmax − baseline min) over the
    segment span. Minimum inter-peak distance = the segment-effective
    peak_width_s / dt; among closer candidates the TALLER is kept
    (deterministic tie-break: lower index). Returns [(index, value,
    segment_index)] in index order (== (rt, index) order on a linear axis —
    bait #11)."""
    n = len(values)
    cands_all = _local_max_candidates(values)
    found: List[Tuple[int, float, int]] = []
    for seg_idx, seg in enumerate(segs):
        s, e = seg["start"], seg["end"]
        floor = _segment_floor(seg, values, base)
        min_dist_pts = max(1, int(round(seg["eff"]["peak_width_s"] / (60.0 * dt)))) if dt > 0 else 1
        cands = [(i, v) for (i, v) in cands_all
                 if s <= i < e and v > base[i] + floor]
        cands.sort(key=lambda c: (-c[1], c[0]))
        kept: List[Tuple[int, float]] = []
        for i, v in cands:
            if all(abs(i - ki) >= min_dist_pts for ki, _ in kept):
                kept.append((i, v))
        for i, v in kept:
            found.append((i, v, seg_idx))
    found.sort(key=lambda t: t[0])
    seen = set()
    out = []
    for t in found:
        if t[0] in seen:
            continue
        seen.add(t[0])
        out.append(t)
    return out


def _trapz(ts: Sequence[float], ys: Sequence[float]) -> float:
    """Trapezoid via math.fsum over the per-segment contributions
    (deterministic summation order — bait #11)."""
    if len(ts) < 2:
        return 0.0
    parts: List[float] = []
    for i in range(len(ts) - 1):
        dx = ts[i + 1] - ts[i]
        parts.append(0.5 * (ys[i] + ys[i + 1]) * dx)
    return math.fsum(parts)


def _crossing_time(prev_t: float, prev_v: float, next_t: float, next_v: float,
                   level: float) -> float:
    """Linear-interpolated crossing time of `level` between two samples
    (declared geometry; deterministic)."""
    if next_v == prev_v:
        return prev_t
    frac = (level - prev_v) / (next_v - prev_v)
    frac = min(1.0, max(0.0, frac))
    return prev_t + frac * (next_t - prev_t)


def _half_height_symmetry(
    idx: int,
    values: Sequence[float],
    base: Sequence[float],
    axis: Sequence[float],
    start: int,
    end: int,
) -> Tuple[Optional[float], Optional[str]]:
    """f/b at half height (§A1). t_f = the LAST crossing of (baseline +
    height/2) BEFORE the RT (the front-flank crossing) → f = RT − t_f;
    t_b = the FIRST crossing of the half level AFTER the RT (the back-flank
    crossing) → b = t_b − RT. f and b are the front/back half-height widths
    (symmetric ≈ 1). Crossings are linearly interpolated.
    Returns (value, flag): None + REASON_HALF_HEIGHT_UNBOUNDED when a
    half-level crossing runs off the peak window; None + REASON_ZERO_HEIGHT
    when the height is not positive."""
    height = values[idx] - base[idx]
    if height <= 0:
        return None, REASON_ZERO_HEIGHT
    half = base[idx] + height / 2.0
    rt = axis[idx]
    # Back flank: scan left from idx-1; the crossing is the first place (from
    # the peak) the signal goes AT OR BELOW half.
    i = idx - 1
    while i >= start and values[i] > half:
        i -= 1
    if i < start:
        return None, REASON_HALF_HEIGHT_UNBOUNDED
    t_back = _crossing_time(axis[i], values[i], axis[i + 1], values[i + 1], half)
    # Front flank: scan right from idx+1.
    i = idx + 1
    while i <= end and values[i] > half:
        i += 1
    if i > end:
        return None, REASON_HALF_HEIGHT_UNBOUNDED
    t_front = _crossing_time(axis[i - 1], values[i - 1], axis[i], values[i], half)
    # §A1: f = RT - t_f (t_f = LAST crossing BEFORE the RT = the front-flank
    # half-width); b = t_b - RT (t_b = FIRST crossing AFTER the RT = the
    # back-flank half-width). Symmetric ≈ 1.
    f = rt - t_back
    b = t_front - rt
    if b <= 0 or f <= 0:
        return None, REASON_HALF_HEIGHT_UNBOUNDED
    return f / b, None


# ---------------------------------------------------------------------------
# The public entry point
# ---------------------------------------------------------------------------
def integrate_peaks(ctx: Any, decoded_signals: Dict[str, Dict[str, Any]],
                    params: Dict[str, Any]) -> Dict[str, Any]:
    """Run the full declared-settings integration pipeline and publish the
    artifacts + views + metrics onto ``ctx``. Returns the result dict (also
    used directly by the unit tests).

    ``decoded_signals`` maps input name → the d_reader decoded dict
    (``{axis, values, channel?, ..., meta?}``). Channel selection: the
    declared ``channel`` param picks the matching decoded signal (by its
    'channel' field or input name); otherwise exactly ONE signal-like input is
    required (single-signal assumption; multiple signals + no channel is a
    NAMED failure — never picked silently). NEVER a filename literal."""
    p = dict(params)
    # ---- 1. Validation (loud, named, zero defaults) ----
    for name in REQUIRED_PARAMS:
        if name not in p:
            raise IntegrationError("PARAM_MISSING",
                                   f"required parameter '{name}' is absent — no default is applied")
    unknown = sorted(set(p) - KNOWN_PARAMS)
    if unknown:
        raise IntegrationError("PARAM_INVALID",
                               f"unknown parameter(s) {unknown} — no silent ignore (unknown-is-unknown)")
    baseline_correction = _require_enum(p, "baseline_correction", BASELINE_CORRECTION_ENUM)
    if baseline_correction == "other":
        raise IntegrationError(
            "UNSUPPORTED_BASELINE_CORRECTION",
            "baseline_correction='other' has no declared semantics — a named failure, "
            "never invented behavior",
        )
    backend = _require_enum(p, "backend", BACKEND_ENUM)
    baseline_window_s = _require_number(p, "baseline_window_s", minimum=0.0)
    peak_width_s = _require_number(p, "peak_width_s", minimum=0.0)
    slope_sensitivity = _require_number(p, "slope_sensitivity", minimum=0.0, maximum=1.0)
    min_width_factor = _require_number(p, "min_width_factor", minimum=0.0)
    max_width_factor = _require_number(p, "max_width_factor", minimum=0.0)
    if max_width_factor < min_width_factor:
        raise IntegrationError("PARAM_INVALID",
                               f"max_width_factor ({max_width_factor}) must be >= "
                               f"min_width_factor ({min_width_factor})")
    sat_frac = _require_number(p, "saturated_top_fraction_of_max", minimum=0.0, maximum=1.0)
    sat_min_pts = _require_number(p, "saturated_min_plateau_points", minimum=2.0, integer=True)
    area_reject = _optional_number(p, "area_reject_pa_min", minimum=0.0)
    height_reject = _optional_number(p, "height_reject_pa", minimum=0.0)
    skim_ratio = _optional_number(p, "skim_ratio", minimum=0.0)
    valley_to_peak_ratio = _optional_number(p, "valley_to_peak_ratio", minimum=0.0, maximum=1.0)
    method_label = _optional_string(p, "method_label")
    method_revision_ref = _optional_string(p, "method_revision_ref")
    channel_sel = _optional_string(p, "channel")
    # Absent reject legs are DECLARED off + logged (T1-6), never incidental.
    if area_reject is None:
        ctx.log("peak_integration: area_reject_pa_min absent — the area-reject leg is OFF "
                "(declared, not defaulted)", level="info", code="REJECT_LEG_OFF")
    if height_reject is None:
        ctx.log("peak_integration: height_reject_pa absent — the height-reject leg is OFF "
                "(declared, not defaulted)", level="info", code="REJECT_LEG_OFF")

    # Backend honesty (§A3.0): the scipy branch lazily imports scipy INSIDE
    # the branch; ImportError → DECLARED BACKEND_UNAVAILABLE, never a silent
    # fallback. The stdlib path never touches scipy.
    if backend == "scipy":
        try:
            import scipy  # noqa: F401  (lazy, branch-local — B5)
        except ImportError as e:
            raise IntegrationError(
                "BACKEND_UNAVAILABLE",
                f"backend=scipy requested but scipy is not importable ({type(e).__name__}) — "
                "declared failure, never a silent fallback to the stdlib backend",
            ) from e

    # ---- Select the signal (declared channel / single-signal assumption) ----
    signals = {name: sig for name, sig in decoded_signals.items()
               if isinstance(sig, dict) and "axis" in sig and "values" in sig}
    if not signals:
        raise IntegrationError("PARAM_INVALID",
                               "no signal-like decoded input was provided (need an input with axis+values)")
    chosen_name: Optional[str] = None
    if channel_sel is not None:
        for name, sig in signals.items():
            if sig.get("channel") == channel_sel or name == channel_sel:
                chosen_name = name
                break
        if chosen_name is None:
            raise IntegrationError("PARAM_INVALID",
                                   f"declared channel '{channel_sel}' matches no decoded signal input")
    elif len(signals) == 1:
        chosen_name = next(iter(signals))
    else:
        raise IntegrationError("PARAM_INVALID",
                               f"multiple signal inputs {sorted(signals)} but no 'channel' param "
                               "declared — declare the channel to select one (never picked silently)")
    sig = signals[chosen_name]
    axis: List[float] = [float(x) for x in sig["axis"]]
    values: List[float] = [float(x) for x in sig["values"]]
    n = len(axis)
    if n == 0 or len(values) != n:
        raise IntegrationError("PARAM_INVALID",
                               f"signal has no usable axis (n={n}) or mismatched axis/values "
                               "lengths — an empty signal is a named failure, never an empty "
                               "success that looks real")
    t0, t_end = axis[0], axis[-1]
    dt = (t_end - t0) / (n - 1) if n > 1 else 0.0

    # Source-hash provenance echo (GC-6 D5 meta.contentHash — echo, never
    # re-hash; absent → metric omitted + warning log, DECLARED).
    source_hash: Optional[str] = None
    meta = sig.get("meta") if isinstance(sig.get("meta"), dict) else {}
    if isinstance(meta.get("contentHash"), str):
        source_hash = meta["contentHash"]
    else:
        for s in decoded_signals.values():
            m = s.get("meta") if isinstance(s, dict) else None
            if isinstance(m, dict) and isinstance(m.get("contentHash"), str):
                source_hash = m["contentHash"]
                break
    if source_hash is None:
        ctx.log(
            "peak_integration: no source content hash available in the decoded input meta — "
            "the source_content_sha256 metric is omitted (declared, not fabricated)",
            level="warning", code="SOURCE_HASH_ABSENT",
        )

    # ---- 2. Timed-event resolution (A3.2) ----
    events = _validate_timed_events(p, (t0, t_end), ctx)
    ctx.log(
        f"peak_integration: integration state before the first timed event is the DECLARED "
        f"default '{DEFAULT_INTEGRATION_STATE}' (contract-stated; no event precedes t0)",
        level="info", code="PRE_FIRST_EVENT_DEFAULT",
    )
    segs = _build_segments(axis, events, {
        "slope_sensitivity": slope_sensitivity,
        "peak_width_s": peak_width_s,
        "area_reject_pa_min": area_reject,
        "height_reject_pa": height_reject,
    })
    # Per-sample state array (length n exactly). Uncovered samples (axis gaps
    # or a degenerate first event) stay at the DECLARED pre-first-event state.
    on_mask = [True] * n  # DEFAULT_INTEGRATION_STATE == 'on'
    for seg in segs:
        for i in range(seg["start"], seg["end"]):
            on_mask[i] = seg["state"] == "on"

    # ---- 3. Baseline (ORDERING DECLARED: detect → baseline → skim →
    #         re-measure; a fixed two-pass convergence, deterministic) ----
    base0 = [0.0] * n
    seed_maxima = _detect(values, base0, segs, dt)
    base = _build_baseline(baseline_correction, values, dt, baseline_window_s, peak_width_s,
                           skim_ratio, valley_to_peak_ratio, seed_maxima, segs, on_mask, base0, ctx)
    mid_maxima = _detect(values, base, segs, dt)
    base = _build_baseline(baseline_correction, values, dt, baseline_window_s, peak_width_s,
                           skim_ratio, valley_to_peak_ratio, mid_maxima, segs, on_mask, base, ctx)
    # ---- 4. Detection (final, against the built baseline) ----
    maxima = _detect(values, base, segs, dt)
    windows = _peak_windows(maxima, values, base, segs, on_mask)

    # Valley tiling (DECLARED, OQ4 — the overlap honesty rule): adjacent
    # prominence windows that overlap share the valley region; tile at the
    # valley (argmin of signal-baseline between the maxima) so the shared
    # region is measured ONCE — trapezoid additivity over the tiled union
    # makes the areas sum to the envelope integral (no double count, no
    # deconvolution — out of scope). The pair is flagged
    # OVERLAP_SHARED_BASELINE (an envelope is not N compounds).
    ws_sorted = sorted(windows, key=lambda w: w["idx"])
    for a, b in zip(ws_sorted[:-1], ws_sorted[1:]):
        if a["seg"] != b["seg"] or b["start"] > a["end"]:
            continue
        best_i = a["idx"]
        best_d = values[a["idx"]] - base[a["idx"]]
        for j in range(a["idx"] + 1, b["idx"]):
            d = values[j] - base[j]
            if d < best_d:
                best_d = d
                best_i = j
        a["end"] = best_i
        b["start"] = best_i

    # ---- 5/6. Measure, reject-filter, saturate ----
    rows: List[Dict[str, Any]] = []
    rejected_width = 0
    rejected_area = 0
    rejected_height = 0
    skipped_off = 0
    overlap_pairs = 0
    for w in windows:
        idx = w["idx"]
        seg = segs[w["seg"]]
        # Off-window candidates: neither detected NOR baselined INTO the
        # table; COUNTED (declared, never vanished — T1-5).
        if seg["state"] != "on":
            skipped_off += 1
            ctx.log(f"peak_integration: peak candidate at {axis[idx]} min lies in an "
                    f"integration-off window — skipped (counted, never vanished)",
                    level="info", code="SKIPPED_INTEGRATION_OFF")
            continue
        eff = seg["eff"]
        rt = axis[idx]
        height = values[idx] - base[idx]
        start, end = w["start"], w["end"]
        # Valley tiling for overlapping windows (OVERLAP_SHARED_BASELINE):
        # the shared region is measured once, against the tiled boundary at
        # the valley floor — never double-counted.
        flags: List[str] = []
        if w["trunc"]:
            flags.append(FLAG_TIMED_OFF_WINDOW)
        area = _trapz(
            [axis[i] for i in range(start, end + 1)],
            [max(values[i] - base[i], 0.0) for i in range(start, end + 1)],
        )
        # Saturated-plateau rule [G1:84/:159]: >= sat_min_pts consecutive
        # samples within sat_frac of the peak max.
        peak_max = values[idx]
        band = sat_frac * peak_max
        plateau = 1
        j = idx + 1
        while j < n and (peak_max - values[j]) <= band:
            plateau += 1
            j += 1
        j = idx - 1
        while j >= 0 and (peak_max - values[j]) <= band:
            plateau += 1
            j -= 1
        saturated = plateau >= int(sat_min_pts)
        area_val: Optional[float]
        width_val: Optional[float]
        sym_val: Optional[float]
        if saturated:
            # KERRY lesson: on a saturated plateau area/width/symmetry are
            # UNRECOVERABLE — DECLARED null + reason code, never a number.
            # RT + plateau top (height) remain (they ARE measurable).
            area_val = None
            width_val = None
            sym_val = None
            flags.append(REASON_SATURATED)
        else:
            area_val = area
            if height > 0:
                width_val = area / height
            else:
                width_val = None
                flags.append(REASON_ZERO_HEIGHT)
            sym_val, sym_flag = _half_height_symmetry(idx, values, base, axis, start, end)
            if sym_flag is not None:
                flags.append(sym_flag)
        # Width-plausibility gate (× the declared factors, against the
        # segment-effective expected width — a timed event's peak_width_s
        # override applies from its at_min forward).
        if width_val is not None:
            lo = min_width_factor * eff["peak_width_s"] / 60.0
            hi = max_width_factor * eff["peak_width_s"] / 60.0
            if width_val < lo or width_val > hi:
                rejected_width += 1
                ctx.log(f"peak_integration: peak at {rt} min width {width_val:.6f} min outside "
                        f"[{lo:.6f}, {hi:.6f}] — REJECTED_WIDTH (counted)",
                        level="info", code="REJECTED_WIDTH")
                continue
        # Area / height reject thresholds (segment-effective; absent = leg
        # off, logged at validation).
        if eff["area_reject_pa_min"] is not None and area_val is not None \
                and area_val < eff["area_reject_pa_min"]:
            rejected_area += 1
            ctx.log(f"peak_integration: peak at {rt} min area {area_val:.6f} below "
                    f"area_reject {eff['area_reject_pa_min']} — REJECTED_AREA (counted)",
                    level="info", code="REJECTED_AREA")
            continue
        if eff["height_reject_pa"] is not None and height is not None \
                and height < eff["height_reject_pa"]:
            rejected_height += 1
            ctx.log(f"peak_integration: peak at {rt} min height {height:.6f} below "
                    f"height_reject {eff['height_reject_pa']} — REJECTED_HEIGHT (counted)",
                    level="info", code="REJECTED_HEIGHT")
            continue
        rows.append({"idx": idx, "rt_min": rt, "height_pa": height,
                     "area_pa_min": area_val, "width_min": width_val,
                     "symmetry": sym_val, "saturated": saturated, "flags": flags})

    # Overlap pairing (NO deconvolution — out of scope): adjacent peaks whose
    # prominence windows overlap are tiled at the valley and FLAGGED
    # OVERLAP_SHARED_BASELINE (GC-1 AS-5 honesty: an envelope is not N
    # compounds, and we never pretend the split is clean).
    for a, b in zip(rows[:-1], rows[1:]):
        wa = next(w for w in windows if w["idx"] == a["idx"])
        wb = next(w for w in windows if w["idx"] == b["idx"])
        if wb["start"] <= wa["end"] and wa["start"] <= wb["end"]:
            if FLAG_OVERLAP_SHARED_BASELINE not in a["flags"]:
                a["flags"].append(FLAG_OVERLAP_SHARED_BASELINE)
            if FLAG_OVERLAP_SHARED_BASELINE not in b["flags"]:
                b["flags"].append(FLAG_OVERLAP_SHARED_BASELINE)
            overlap_pairs += 1

    # ---- area_percent (§A1): undefined when ANY accepted peak's area is
    #      null or sum == 0 → EVERY row's area_percent is null + reason code.
    areas = [r["area_pa_min"] for r in rows]
    any_null_area = any(a is None for a in areas)
    total_area = math.fsum(a for a in areas if a is not None)
    if any_null_area:
        pct_reason = REASON_SIBLING_AREA_NULL
        pct_values: List[Optional[float]] = [None] * len(rows)
    elif total_area == 0.0:
        pct_reason = REASON_ZERO_TOTAL
        pct_values = [None] * len(rows)
    else:
        pct_reason = None
        pct_values = [(a / total_area * 100.0) if a is not None else None for a in areas]
    for r, pv in zip(rows, pct_values):
        r["area_percent"] = pv
        if pv is None and pct_reason is not None and pct_reason not in r["flags"]:
            r["flags"].append(pct_reason)

    # ---- Assemble the table (RT order; 1-based index) ----
    rows.sort(key=lambda r: (r["rt_min"], r["idx"]))
    table_rows: List[Dict[str, Any]] = []
    for k, r in enumerate(rows, start=1):
        table_rows.append({
            "peak": k,
            "rt_min": r["rt_min"],
            "height_pa": r["height_pa"],
            "area_pa_min": r["area_pa_min"],
            "width_min": r["width_min"],
            "area_percent": r["area_percent"],
            "symmetry": r["symmetry"],
            "saturated": r["saturated"],
            "flags": list(r["flags"]),
        })

    # ---- Metrics (unit-tagged) ----
    saturated_peaks = sum(1 for r in rows if r["saturated"])
    # Declared metric interpretation (OQ4 class): the baseline NOISE floor
    # is the residual over ON samples OUTSIDE the detected peak windows —
    # peak flanks are signal, not noise. This is what makes the spec's
    # T1-3 assertion (noise < drift span) meaningful on a peak-bearing trace.
    in_win = [False] * n
    for w in windows:
        for i in range(w["start"], w["end"] + 1):
            in_win[i] = True
    diffs = [abs(values[i] - base[i]) for i in range(n)
             if on_mask[i] and not in_win[i]]
    if diffs:
        srt = sorted(diffs)
        rank = max(0, min(len(srt) - 1, int(math.ceil(0.95 * len(srt))) - 1))
        noise_p95 = srt[rank]
    else:
        noise_p95 = 0.0
    off_samples = sum(1 for i in range(n) if not on_mask[i])
    off_dur = off_samples * dt
    on_count = n - off_samples
    coverage = (on_count / n) if n else 0.0
    digest = _params_digest(p)

    ctx.metric("peaks_detected", len(rows), unit="peaks", label="accepted peaks in the table")
    ctx.metric("peaks_rejected_width", rejected_width, unit="peaks", label="REJECTED_WIDTH count")
    ctx.metric("peaks_rejected_area", rejected_area, unit="peaks", label="REJECTED_AREA count")
    ctx.metric("peaks_rejected_height", rejected_height, unit="peaks", label="REJECTED_HEIGHT count")
    ctx.metric("skipped_integration_off", skipped_off, unit="peaks",
               label="peaks in off windows (counted, never vanished)")
    ctx.metric("saturated_peaks", saturated_peaks, unit="peaks", label="saturated-plateau peaks")
    ctx.metric("overlap_shared_baseline_pairs", overlap_pairs, unit="pairs",
               label="OVERLAP_SHARED_BASELINE pairs")
    ctx.metric("baseline_noise_p95_pa", noise_p95, unit="pA",
               label="p95 |signal-baseline| over ON samples outside detected peak windows")
    ctx.metric("timed_off_duration_min", off_dur, unit="min", label="total integration-off duration")
    ctx.metric("integration_coverage_fraction", coverage, unit="fraction",
               label="ON samples / total samples")
    ctx.metric("params_digest", digest, unit=None, label="sha256 of canonicalized run parameters")
    if source_hash is not None:
        ctx.metric("source_content_sha256", source_hash, unit=None,
                   label="echoed from the input DREF meta (never re-hashed)")

    # ---- Artifacts + views (§A3.6) ----
    ctx.publish(
        "peak_table",
        {"columns": PEAK_TABLE_COLUMNS, "rows": table_rows},
        kind="table",
        units=PEAK_TABLE_UNITS,
        schema={"columns": {c["name"]: c for c in PEAK_TABLE_COLUMNS}},
    )
    payload = {
        "axis": axis,
        "values": values,
        "baseline": base,
        "axis_units": "min",
        "value_units": "pA",
        "integration_windows": [
            {"start_min": seg["t_start"], "end_min": seg["t_end"], "state": seg["state"]}
            for seg in segs
        ],
    }
    fd, path = tempfile.mkstemp(suffix=".json", prefix="gc7-signal-")
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f)
    ctx.publish_file("signal_plus_baseline", path, kind="signal", format="json",
                     units={"axis": "min", "values": "pA", "baseline": "pA"})
    eff_params_payload: Dict[str, Any] = {
        "parameters": p,
        "params_digest": digest,
    }
    if method_label is not None:
        eff_params_payload["method_label"] = method_label  # echoed, NEVER branched on
    if method_revision_ref is not None:
        eff_params_payload["method_revision_ref"] = method_revision_ref  # string-echo (OQ3)
    if source_hash is not None:
        eff_params_payload["source_content_sha256"] = source_hash
    manifest = getattr(ctx, "manifest", None)
    if callable(manifest):
        rb = getattr(manifest(), "reader", None)
        if isinstance(rb, dict):
            eff_params_payload["reader"] = rb  # reader block copy (GC-6 D4)
    ctx.publish("effective_parameters", eff_params_payload, kind="table",
                schema={"note": "exact run parameters + provenance echoes (machine-readable)"})

    ctx.view("peak_table_view", "table", artifact="peak_table")
    ctx.view("signal_view", "signal", artifact="signal_plus_baseline")

    return {
        "rows": table_rows,
        "columns": PEAK_TABLE_COLUMNS,
        "units": PEAK_TABLE_UNITS,
        "metrics": {m["name"]: m["value"] for m in ctx.manifest().metrics},
        "params_digest": digest,
        "source_content_sha256": source_hash,
        "rejected": {"width": rejected_width, "area": rejected_area,
                     "height": rejected_height, "skipped_off": skipped_off},
        "saturated_peaks": saturated_peaks,
        "overlap_pairs": overlap_pairs,
        "baseline": base,
        "on_mask": on_mask,
        "chosen_signal": chosen_name,
    }
