"""computable_lab_analysis — analysis SDK (design contract, not yet a published package).

An analysis exports ``run(ctx)``. The runner imports the entry module and calls
it ONCE in a fresh interpreter. Inputs + parameters are supplied by the runner;
scripts must not depend on previous executions (fresh ctx per run).

Context responsibilities:
- ``ctx.input(name)``  -> a DatasetHandle (read methods per dataKind)
- ``ctx.parameters``   -> immutable validated parameter mapping
- ``ctx.publish(...)`` -> persist a named dataset/artifact with schema + units
- ``ctx.view(...)``    -> append a validated view spec
- ``ctx.metric(...)``  -> publish a scalar with units + label
- ``ctx.log(...)``     -> emit a bounded execution message
- ``ctx.progress(...)``-> emit a progress update

The SDK does NOT dictate algorithms; scientific calculations are ordinary
Python functions in the entry script.
"""
from __future__ import annotations

__version__ = "0.4.0"  # GC-8 (OQ4 fold, orch-confirmed): ships calibration_fit + quantification
                      # (declared-parameters calibration curve + cross-run quantification) —
                      # 0.3.0 shipped peak_integration (GC-7); 0.2.0 shipped the .D reader (d_reader)
__all__ = [
    "run",
    "Context",
    "OutputManifest",
    "DatasetHandle",
    "RuntimeContext",
    "attach_package_inputs",
    "READER_NAME",
    "READER_VERSION",
    "integrate_peaks",
    "fit_calibration",
    "quantify_peaks",
    "CalibrationError",
    "QuantificationError",
]

# GC-6: the .D reader (lazily re-exported so plain-SDK runs pay no import cost;
# d_reader itself is stdlib-only, so the re-export is safe either way).
from .d_reader import READER_NAME, READER_VERSION, attach as attach_package_inputs  # noqa: E402

# GC-7: the declared-settings peak-integration module (stdlib-only core).
from .peak_integration import integrate_peaks  # noqa: E402

# GC-8: the declared-parameters calibration-fit + quantification modules
# (stdlib-only; the fit is weighted normal equations — no numpy/scipy).
from .calibration_fit import CalibrationError, fit_calibration  # noqa: E402
from .quantification import QuantificationError, quantify_peaks  # noqa: E402