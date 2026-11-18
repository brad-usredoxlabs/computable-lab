"""u2signalstrict — read_signal() REFUSES a CSV whose columns are not numbers.

L2-GC-ANALYSIS-BIND-1 (unit u2signalstrict): the signal consumer is where a CSV
with non-numeric columns must be refused with a named refusal, instead of
carrying strings (or a preamble line used as the header) into axis/values.
The refusal is a ValueError carrying the SIGNAL_NOT_NUMERIC string code inside
the message — the convention d_reader's ReaderError already ships (a code in
the message; no new exception class, no TS token, no schema vocabulary). The
shared row reader stays lenient: read_rows() keeps returning strings for table
consumers, and the two consumers disagree on purpose.

Run:
    cd server/python-executor-service && python3 -m unittest discover -s tests -p 'test_signal_strictness.py' -v
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

SDK_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SDK_DIR))

from computable_lab_analysis.ctx import Context  # noqa: E402


def _handle(path: str):
    return Context(inputs={"trace": {"dataKind": "signal", "path": path}}).input("trace")


class SignalStrictnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_preamble_csv_refused_and_rows_untouched(self) -> None:
        # leg (a) PREAMBLE: metadata lines above a numeric two-column table.
        # read_signal() must refuse, quoting the first offending source line;
        # read_rows() on the SAME file stays lenient (the table reader).
        p = self._dir / "preamble.csv"
        p.write_text(
            "Operator,Alice\nMethod,GC-FID-01\n0.1,12.5\n0.2,14.0\n", encoding="utf-8"
        )
        with self.assertRaises(ValueError) as cm:
            _handle(str(p)).read_signal()
        msg = str(cm.exception)
        self.assertTrue(msg.startswith("SIGNAL_NOT_NUMERIC"), msg)
        # the first offending source line (first data row whose text would be
        # carried into axis/values) is quoted verbatim; the garbage header
        # shows up in the detected-columns report
        self.assertIn("Method,GC-FID-01", msg)
        self.assertIn("'Operator'", msg)
        rows = _handle(str(p)).read_rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0], {"Operator": "Method", "Alice": "GC-FID-01"})
        self.assertEqual(rows[1]["Operator"], 0.1)

    def test_non_numeric_cell_refused_naming_the_line(self) -> None:
        # leg (b) NON-NUMERIC CELL: a clean table with one cell "45abc" —
        # the same named refusal, naming the source line containing it.
        p = self._dir / "badopt.csv"
        p.write_text("a,b\n1.0,2.0\n2.0,45abc\n3.0,6.0\n", encoding="utf-8")
        with self.assertRaises(ValueError) as cm:
            _handle(str(p)).read_signal()
        msg = str(cm.exception)
        self.assertTrue(msg.startswith("SIGNAL_NOT_NUMERIC"), msg)
        self.assertIn("2.0,45abc", msg)

    def test_clean_csv_accepted_no_over_refusal(self) -> None:
        # leg (c) OVER-REFUSAL GUARD: a clean two-column 3-row CSV returns 3
        # numeric axis points and 3 numeric values (identical shape to the pin
        # at tests/test_computable_lab_analysis.py:61).
        p = self._dir / "clean.csv"
        p.write_text("time,response\n0.1,12.5\n0.2,14.0\n0.4,11.2\n", encoding="utf-8")
        sig = _handle(str(p)).read_signal()
        self.assertEqual(len(sig["axis"]), 3)
        self.assertEqual(len(sig["values"]), 3)
        for v in sig["axis"] + sig["values"]:
            self.assertIsInstance(v, float)
        self.assertAlmostEqual(sig["values"][0], 12.5)


if __name__ == "__main__":
    unittest.main()
