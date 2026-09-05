"""Tests for the computable_lab_analysis SDK context + runner."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from computable_lab_analysis.ctx import Context, run


class ContextTests(unittest.TestCase):
    def setUp(self) -> None:
        # write a known CSV to a temp dir for input provisioning
        self._tmp = tempfile.TemporaryDirectory()
        self._dir = Path(self._tmp.name)
        self._csv = self._dir / "trace.csv"
        self._csv.write_text("time,intensity\n0.1,12.5\n0.2,14.0\n0.4,11.2\n", encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_publish_file_registers_blob_with_sha_and_size(self) -> None:
        blob = self._dir / "model.pkl"
        blob.write_bytes(b"\x80\x04model-bytes-abcd")
        ctx = Context()
        ctx.publish_file("model", str(blob), kind="model", format="pkl")
        a = ctx.manifest().artifacts[0]
        self.assertEqual(a.name, "model")
        self.assertEqual(a.data_kind, "model")
        self.assertEqual(a.value, "model.pkl")
        self.assertEqual(a.blob["format"], "pkl")
        import hashlib
        self.assertEqual(a.blob["sha256"], hashlib.sha256(b"\x80\x04model-bytes-abcd").hexdigest())
        self.assertEqual(a.blob["sizeBytes"], len(b"\x80\x04model-bytes-abcd"))
        # serialized manifest carries the blob
        d = ctx.manifest().to_dict()["artifacts"][0]
        self.assertEqual(d["blob"]["path"], str(blob))

    def test_publish_file_missing_path_raises(self) -> None:
        ctx = Context()
        with self.assertRaises(FileNotFoundError):
            ctx.publish_file("model", str(self._dir / "nope.pkl"))

    def test_input_file_bytes_reads_model_bytes(self) -> None:
        ctx = Context(inputs={"model": {"dataKind": "model", "path": str(self._csv)}})
        self.assertEqual(ctx.input("model").file_bytes(), self._csv.read_bytes())

    def test_read_rows_parses_json_array_input(self) -> None:
        js = self._dir / "preds.json"
        js.write_text('[{"x": 20, "pred": 41}, {"x": 30, "pred": 61}]', encoding="utf-8")
        ctx = Context(inputs={"predictions": {"dataKind": "table", "path": str(js)}})
        self.assertEqual(ctx.input("predictions").read_rows(), [{"x": 20, "pred": 41}, {"x": 30, "pred": 61}])

    def test_parameters_are_immutable_snapshot(self) -> None:
        ctx = Context(parameters={"window": [0.1, 0.5], "n": 3})
        params = ctx.parameters
        params["n"] = 999  # mutating the copy must not affect ctx
        self.assertEqual(ctx.parameters["n"], 3)

    def test_input_read_signal_and_rows(self) -> None:
        ctx = Context(
            inputs={"trace": {"dataKind": "signal", "path": str(self._csv)}},
        )
        h = ctx.input("trace")
        sig = h.read_signal()
        self.assertEqual(len(sig["axis"]), 3)
        self.assertAlmostEqual(sig["values"][0], 12.5)
        rows = h.read_rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["time"], 0.1)

    def test_input_read_from_input_dir_by_name(self) -> None:
        ctx = Context(inputs={"trace": {"dataKind": "signal"}}, input_dir=str(self._dir))
        h = ctx.input("trace")
        self.assertEqual(h.source_path, str(self._csv))

    def test_input_missing_raises(self) -> None:
        ctx = Context(inputs={})
        with self.assertRaises(KeyError):
            ctx.input("nope")

    def test_publish_view_metric_build_manifest(self) -> None:
        ctx = Context()
        ctx.publish("peak_results", [{"start": 0.1, "end": 0.4, "area": 3.2}], kind="table")
        ctx.publish("trace_display", {"axis": [1, 2], "values": [3, 4]}, kind="signal")
        ctx.view("trace", "signal", artifact="trace_display", bindings={"x": "axis", "y": "values"})
        ctx.view("results", "table", artifact="peak_results")
        ctx.metric("total_area", 3.2, unit="a.u.", label="Peak area")
        ctx.log("done")

        d = ctx.manifest().to_dict()
        self.assertEqual(d["version"], 1)
        self.assertEqual(len(d["artifacts"]), 2)
        self.assertEqual(len(d["views"]), 2)
        self.assertEqual(d["metrics"][0]["value"], 3.2)
        # stable JSON
        s1 = ctx.manifest().to_json()
        s2 = ctx.manifest().to_json()
        self.assertEqual(s1, s2)
        json.loads(s1)  # must parse


class RunnerTests(unittest.TestCase):
    def _write_entry(self, body: str) -> Path:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "entry.py"
            p.write_text(body, encoding="utf-8")
            return p

    def test_run_calls_entry_run_once_and_collects_manifest(self) -> None:
        body = (
            "def run(ctx):\n"
            "    ctx.publish('out', [1,2,3], kind='table')\n"
            "    ctx.metric('n', 3)\n"
            "    return 'ignored'\n"
        )
        # use a persistent tmp dir so the module file survives run()
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "entry.py"
            p.write_text(body, encoding="utf-8")
            m = run(str(p), Context())
            self.assertEqual(len(m.artifacts), 1)
            self.assertEqual(m.artifacts[0].name, "out")
            self.assertEqual(m.metrics[0]["value"], 3)

    def test_run_requires_exported_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "entry.py"
            p.write_text("x = 1\n", encoding="utf-8")
            with self.assertRaises(AttributeError):
                run(str(p), Context())

    def test_full_gc_like_script(self) -> None:
        body = (
            "def run(ctx):\n"
            "    trace = ctx.input('trace').read_signal()\n"
            "    x = trace['axis']\n"
            "    y = trace['values']\n"
            "    low, high = ctx.parameters['window']\n"
            "    chosen = [(xx, yy) for xx, yy in zip(x, y) if low <= xx <= high]\n"
            "    area = sum(yy for _, yy in chosen)\n"
            "    ctx.publish('peak_results', [{'start': low, 'end': high, 'area': area}], kind='table')\n"
            "    ctx.metric('total_area', area, unit='a.u.', label='Area under window')\n"
            "    ctx.view('results', 'table', artifact='peak_results')\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            root.joinpath("trace.csv").write_text("time,intensity\n0.1,5\n0.3,5\n1.0,0\n", encoding="utf-8")
            p = root / "entry.py"
            p.write_text(body, encoding="utf-8")
            ctx = Context(
                inputs={"trace": {"dataKind": "signal", "path": str(root / "trace.csv")}},
                parameters={"window": [0.0, 0.5]},
            )
            m = run(str(p), ctx)
            rows = m.artifacts[0].value
            self.assertEqual(rows, [{"start": 0.0, "end": 0.5, "area": 10.0}])
            self.assertEqual(m.metrics[0]["value"], 10.0)


if __name__ == "__main__":
    unittest.main()