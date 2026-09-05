"""Headless reproducibility test (spec A03/A15).

Runs the gc-area fixture through the SDK CLI exactly as a headless replay would
(`python3 -m computable_lab_analysis run <entry> --inputs --parameters`) and
asserts the reproduced area matches the known fixture value within tolerance.

This is the reproducibility bundle contract: entry script + inputs + parameters
reproduce a known result WITHOUT the React application, from a fresh
interpreter, and with a pinned environment.
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "gc-area"
ENTRY = FIXTURES / "entry.py"
TRACE = FIXTURES / "trace.csv"
SDK_SRC = Path(__file__).resolve().parent.parent / "src"

# Known area under [0.5, 2.5] for the fixture trace (2+4+6+4+2 = 18).
KNOWN_AREA = 18.0
PLACES = 9


class HeadlessReproTests(unittest.TestCase):
    def _replay(self, window: list[float]) -> dict:
        inputs = {"trace": {"dataKind": "signal", "path": str(TRACE)}}
        parameters = {"window": window}
        proc = subprocess.run(
            [
                sys.executable,
                "-m",
                "computable_lab_analysis",
                "run",
                str(ENTRY),
                "--inputs",
                json.dumps(inputs),
                "--parameters",
                json.dumps(parameters),
            ],
            cwd=SDK_SRC,
            env={**__import__("os").environ, "PYTHONPATH": str(SDK_SRC)},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, f"replay failed: {proc.stderr}")
        parsed = json.loads(proc.stdout)
        self.assertTrue(parsed["ok"])
        return parsed["manifest"]

    def test_reproduces_fixture_area_within_tolerance(self) -> None:
        manifest = self._replay([0.5, 2.5])
        artifact = manifest["artifacts"][0]
        self.assertEqual(artifact["name"], "peak_results")
        self.assertAlmostEqual(float(artifact["value"][0]["area"]), KNOWN_AREA, places=PLACES)
        self.assertAlmostEqual(float(manifest["metrics"][0]["value"]), KNOWN_AREA, places=PLACES)

    def test_reproduces_a_different_window(self) -> None:
        # window [1.0, 2.0] -> 4+6+4 = 14
        manifest = self._replay([1.0, 2.0])
        self.assertAlmostEqual(float(manifest["artifacts"][0]["value"][0]["area"]), 14.0, places=PLACES)


if __name__ == "__main__":
    unittest.main()