"""GC-8 — quantification (Leg 0 stub; Leg 3 ships the implementation).

The quantification consumer module: loads the PROMOTED ``calibration_model``
artifact payload (file_bytes + json.loads — never read_rows; a dict-inline
unpromoted input is the declared INPUT_NOT_PROMOTED failure, spec §A5),
matches a DIFFERENT run's GC-7 peak table to declared RT windows, applies the
ISTD-role consistency guard (ISTD_DOUBLE_APPLICATION, spec §A3), inverse-
predicts amounts under the declared extrapolation policy, and publishes
``quantified_peak_table`` + ``effective_parameters``.
"""
from __future__ import annotations

from typing import Any, Dict


class QuantificationError(Exception):
    """A named quantification failure. ``code`` is the declared failure token
    that the runner surfaces in RUN_FAILED."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def quantify_peaks(ctx: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    """Leg 0 stub — replaced by the Leg 3 implementation."""
    raise NotImplementedError("quantification.quantify_peaks lands in Leg 3")
