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

__version__ = "0.1.0"
__all__ = ["run", "Context", "OutputManifest", "DatasetHandle", "RuntimeContext"]