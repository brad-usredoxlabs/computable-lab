"""GC-7 — DETERMINISTIC synthetic-signal generator for peak-integration tests.

SYNTHETIC ONLY — NO real NAS bytes in git (spec B2; the real-NAS proof is the
lane-only read-only smoke script T3). This module returns in-memory
``{axis, values}`` dicts (the tests import it directly) and can ALSO write a
synthetic v181 .CH via the GC-6 encoder doctrine (fixtures/gc-d/make_d_fixture
``encode_ch``) so the vitest leg has real .CH-shaped bytes with no committed
signal bytes (same doctrine as GC-6's fixtures/gc-d/).

Every trace is a pure function of its declared parameters (Gaussians on a
declared axis) — no RNG, no committed bytes. The generators are the fixtures;
the BYTES are never committed (GC-6 doctrine [GC6:208-210]).
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

GC_D_FIXTURES = Path(__file__).resolve().parents[1] / "gc-d"


def gaussian(amplitude_pa: float, rt_min: float, sigma_min: float) -> Dict[str, Any]:
    """Return (axis, values) for a single Gaussian on a fixed fine grid
    [rt - 6*sigma, rt + 6*sigma], dt = sigma/50 (dense: the spec's analytic
    case uses dt = 0.001 for sigma = 0.1 — the same ratio)."""
    dt = sigma_min / 50.0
    lo = rt_min - 6.0 * sigma_min
    hi = rt_min + 6.0 * sigma_min
    n = int(round((hi - lo) / dt)) + 1
    axis = [lo + i * dt for i in range(n)]
    values = [amplitude_pa * math.exp(-0.5 * ((t - rt_min) / sigma_min) ** 2) for t in axis]
    return _dict(axis, values)


def _dict(axis: Sequence[float], values: Sequence[float]) -> Dict[str, Any]:
    return {"axis": list(axis), "values": list(values), "axis_units": "min", "value_units": "pA"}


def multi_gaussian(
    peaks: Sequence[Tuple[float, float, float]],
    *,
    offset_pa: float = 0.0,
    t0: float = 0.0,
    t_end: float = float("nan"),
    dt: float = 0.001,
    drift: Optional[Tuple[float, float]] = None,
) -> Dict[str, Any]:
    """Multiple Gaussians (amplitude_pa, rt_min, sigma_min each) on a shared
    uniform axis [t0, t_end] step dt, plus a constant offset and an optional
    linear drift (start_pa, end_pa) added across the axis. Deterministic."""
    import math as _m

    if _m.isnan(t_end):
        t_end = max(rt + 6.0 * sig for (_a, rt, sig) in peaks) + 0.5
    n = int(round((t_end - t0) / dt)) + 1
    axis = [t0 + i * dt for i in range(n)]
    values: List[float] = []
    for t in axis:
        v = offset_pa
        if drift is not None:
            v += drift[0] + (drift[1] - drift[0]) * ((t - t0) / (t_end - t0))
        for (a, rt, sig) in peaks:
            v += a * _m.exp(-0.5 * ((t - rt) / sig) ** 2)
        values.append(v)
    return _dict(axis, values)


def flat_top(
    amplitude_pa: float,
    rt_min: float,
    sigma_min: float,
    *,
    plateau_points: int = 30,
    t0: float = 0.0,
    t_end: float = float("nan"),
    dt: float = 0.001,
    offset_pa: float = 0.0,
) -> Dict[str, Any]:
    """A Gaussian whose top is CLIPPED to a flat plateau of
    ``plateau_points`` samples (the synthetic saturated-plateau case, T1-8).
    The clip level is the Gaussian's max (amplitude above offset)."""
    import math as _m

    if _m.isnan(t_end):
        t_end = rt_min + 6.0 * sigma_min + 0.5
    n = int(round((t_end - t0) / dt)) + 1
    axis = [t0 + i * dt for i in range(n)]
    # Plateau index range centered on rt.
    mid = int(round((rt_min - t0) / dt))
    i_lo = max(0, mid - plateau_points // 2)
    i_hi = min(n - 1, i_lo + plateau_points - 1)
    values: List[float] = []
    for i, t in enumerate(axis):
        v = offset_pa + amplitude_pa * _m.exp(-0.5 * ((t - rt_min) / sigma_min) ** 2)
        if i_lo <= i <= i_hi:
            v = offset_pa + amplitude_pa
        values.append(v)
    return _dict(axis, values)


def zeros(n: int, *, t0: float = 0.0, dt: float = 0.001, offset_pa: float = 0.0) -> Dict[str, Any]:
    """The empty-signal case (T1-9): a flat baseline of ``offset_pa`` over n
    samples — no peaks possible."""
    axis = [t0 + i * dt for i in range(n)]
    values = [offset_pa] * n
    return _dict(axis, values)


def empty_axis() -> Dict[str, Any]:
    """The axis-less input (T1-9): n == 0 — a named failure, never an empty
    success that looks real."""
    return _dict([], [])


def spike(n: int, *, spike_index: int, amplitude_pa: float, dt: float = 0.001,
          t0: float = 0.0, offset_pa: float = 0.0) -> Dict[str, Any]:
    """A 2-sample-wide spike (T1-7 width-reject case): offset + one tall
    sample (and its neighbours one step lower) — far narrower than the
    declared peak_width_s window."""
    axis = [t0 + i * dt for i in range(n)]
    values = [offset_pa] * n
    if 0 <= spike_index < n:
        values[spike_index] = offset_pa + amplitude_pa
        if spike_index + 1 < n:
            values[spike_index + 1] = offset_pa + amplitude_pa / 2.0
        if spike_index - 1 >= 0:
            values[spike_index - 1] = offset_pa + amplitude_pa / 2.0
    return _dict(axis, values)


def make_synthetic_ch_bytes(
    n_points: int,
    *,
    t0_min: float = 0.05,
    t_end_min: float = 9.6,
    scale: float = 1.302083401242271e-4,
    intercept: float = 0.0,
) -> bytes:
    """Write NO file — return the v181 .CH-shaped BYTES for a synthetic trace
    (the GC-6 encoder doctrine, fixtures/gc-d/make_d_fixture.encode_ch).

    The levels are a gentle ramp + a few plateau plateaus kept in the int16
    slot-delta envelope (each raw step small relative to 32767), so the
    encoder never raises. Used ONLY by the vitest leg (real .CH-shaped bytes
    for the runner), never committed to git.
    """
    import sys

    sys.path.insert(0, str(GC_D_FIXTURES))
    from make_d_fixture import encode_ch  # noqa: E402

    # Build an int16-safe raw level sequence: a sawtooth ramp 0..3000 with
    # gentle steps (delta 3) — every slot delta stays tiny.
    raw: List[int] = []
    v = 100
    for i in range(n_points):
        raw.append(v)
        v += 3
        if v > 3000:
            v = 100
    return encode_ch(dict(raw_levels=raw, escapes=[], scale=scale, intercept=intercept,
                          t0_ticks=t0_min * 60000.0, t_end_ticks=t_end_min * 60000.0))
