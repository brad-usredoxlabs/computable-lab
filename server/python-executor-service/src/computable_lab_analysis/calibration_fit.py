"""GC-8 — calibration_fit (Leg 0 stub; Leg 1/2 ships the implementation).

The calibration-fit module: declared-parameters weighted least-squares curve
fitting over DECLARED standard level data (levels[] parameters) + peak tables
(named inputs, GC-7 peak_table shape). Publishes the ``calibration_table`` and
``calibration_model`` artifacts plus ``effective_parameters``.

Everything scientific is a DECLARED parameter (model, weighting, origin
constraint, correlation statistic, amount unit, ISTD role, per-level fit
eligibility / required flag, RT windows, amounts). Zero defaults, zero
hardcoded domain truth — see spec §A2/§A3/B5.
"""
from __future__ import annotations

from typing import Any, Dict


class CalibrationError(Exception):
    """A named calibration failure. ``code`` is the declared failure token
    (spec §A2.7) that the runner surfaces in RUN_FAILED."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def fit_calibration(ctx: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    """Leg 0 stub — replaced by the Leg 1 implementation."""
    raise NotImplementedError("calibration_fit.fit_calibration lands in Leg 1")
