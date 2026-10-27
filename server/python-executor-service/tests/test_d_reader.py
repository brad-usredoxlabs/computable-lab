"""GC-6 — unit tests for the computable_lab_analysis d_reader (T1).

Stdlib-only (unittest, no pytest). Run:

    cd server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest tests.test_d_reader -v

The synthetic .D tree is generated at test time by fixtures/gc-d/make_d_fixture.py
(a v181-shaped header + a body ENCODER that is the exact inverse of the canonical
GC-1 decoder D loop — BIG-endian int16 slots, unbounded Python-int accumulators,
4-slot escapes). NO real NAS bytes in this suite (spec B5).

Failure-code matrix (spec X1-X7, X9): every code here is a STRING inside the
ReaderError message; no new TS error tokens, no schema vocabulary.
"""
from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

SDK_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SDK_DIR))
FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "gc-d"
sys.path.insert(0, str(FIXTURES_DIR))

from computable_lab_analysis.d_reader import (  # noqa: E402
    CH_AXIS_INVALID,
    CH_NO_POINTS,
    CH_TRUNCATED,
    CH_UNSUPPORTED_VERSION,
    METADATA_DECODE_FAILED,
    METADATA_XML_INVALID,
    READER_NAME,
    READER_VERSION,
    ReaderError,
    attach,
    decode_run_log,
    decode_sample_xml,
    read_ch_bytes,
)
from computable_lab_analysis.ctx import Context, DatasetHandle  # noqa: E402

import make_d_fixture as mkd  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ch_bytes(**kw) -> bytes:
    """A v181-shaped .CH body built by the generator's exact-inverse encoder."""
    base = dict(raw_levels=[1000, 2000, 3500, 2500, 1800, 900],
                escapes=[],
                page=13, scale=1.5e-4, intercept=0.5,
                t0_ticks=12840, t_end_ticks=576252.9)
    base.update(kw)
    return mkd.encode_ch(base)


def _read_err(fn, *a, **kw):
    try:
        fn(*a, **kw)
    except ReaderError as e:
        return e
    raise AssertionError(f"expected ReaderError, got success")


# ---------------------------------------------------------------------------
# 1. Round-trip: encode → read_ch_bytes → EXACT vs encoder inputs
# ---------------------------------------------------------------------------
class TestChRoundTrip(unittest.TestCase):
    def test_round_trip_exact(self):
        # Levels are chosen so every delta fits signed int16 (including the
        # full-b1 slot that follows the escape), the escape level matches
        # raw_levels at its index (the generator checks both), and the
        # escape's u32 lo half does NOT collide with the 32767 sentinel
        # (level 77000 → lo16 24448).
        raw_levels = [1000, 3000, 77000, 77200, 77400, 77100]
        escapes = [(2, 77000, 0)]  # (index, level, tag)
        # Exact axis endpoints the way the reader sees them: the header
        # stores RAW TICKS as f32 (t0_ticks = minutes*60000), and the reader
        # reads that f32 back and divides by 60000 — so the expected value is
        # f32(t0_ticks)/60000, NOT f32(minutes)/60000*60000/60000.
        t0 = struct.unpack(">f", struct.pack(">f", 0.05 * 60000.0))[0] / 60000.0
        t_end = struct.unpack(">f", struct.pack(">f", 9.6 * 60000.0))[0] / 60000.0
        data = _ch_bytes(raw_levels=raw_levels, escapes=escapes,
                         t0_ticks=0.05 * 60000.0,
                         t_end_ticks=9.6 * 60000.0)
        out = read_ch_bytes(data, source="SYNTH-001.D/FID1A.CH")
        # point count EXACT (spec D6: tolerance EXACT)
        self.assertEqual(len(out["values"]), 6)
        self.assertEqual(out["meta"]["n_points"], 6)
        self.assertEqual(out["meta"]["escape_count"], 1)
        self.assertEqual(out["meta"]["escape_tag_nonzero"], 0)
        # axis: linspace(t0, t_end, n); endpoints EXACT (decoder A convention, decD :47)
        self.assertEqual(out["axis"][0], t0)
        self.assertEqual(out["axis"][-1], t_end)
        dt = (t_end - t0) / 5
        for i, t in enumerate(out["axis"]):
            self.assertAlmostEqual(t, t0 + i * dt, delta=0.0)
        self.assertEqual(out["axis_units"], "min")
        self.assertEqual(out["value_units"], "pA")
        # values = raw*scale + intercept, pA, applied from the header (D6) —
        # the escape level lands at its own index, exactly like a raw point
        expected = [v * 1.5e-4 + 0.5 for v in raw_levels]
        for got, exp in zip(out["values"], expected):
            self.assertEqual(got, exp)  # EXACT — same header floats, same arithmetic
        # reader identity in meta (D4)
        self.assertEqual(out["meta"]["reader"]["name"], READER_NAME)
        self.assertEqual(out["meta"]["reader"]["version"], READER_VERSION)
        self.assertEqual(out["meta"]["format"], "agilent-chemstation-ch-v181")
        self.assertEqual(out["meta"]["source"], "SYNTH-001.D/FID1A.CH")
        self.assertEqual(out["channel"], "FID1A")  # stem of the source file
        # header block
        h = out["meta"]["header"]
        self.assertEqual(h["page"], 13)
        self.assertEqual(h["scale"], 1.5e-4)
        self.assertEqual(h["intercept"], 0.5)
        self.assertEqual(h["t0"], t0)
        self.assertEqual(h["t_end"], t_end)

    def test_no_escape_file(self):
        data = _ch_bytes(raw_levels=[10, 20, 30], escapes=[])
        out = read_ch_bytes(data)
        self.assertEqual(out["meta"]["n_points"], 3)
        self.assertEqual(out["meta"]["escape_count"], 0)
        self.assertIsNone(out["channel"])  # no source → None, never invented
        self.assertEqual(out["meta"]["source"], None)


# ---------------------------------------------------------------------------
# 5. Corruption matrix — each case raises its exact code, named details
# ---------------------------------------------------------------------------
class TestCorruptionMatrix(unittest.TestCase):
    def test_x1_truncated_header(self):
        # size < 4732+16 → body cannot exist
        e = _read_err(read_ch_bytes, b"\x00" * 4000, source="tiny.bin")
        self.assertIn(CH_TRUNCATED, str(e))
        self.assertIn("tiny.bin", str(e))

    def test_x1b_body_shorter_than_header_page_offset(self):
        # header page claims offset 6656 but file only has 6500 bytes
        data = bytearray(6144)
        struct.pack_into(">I", data, 264, 14)  # page 14 → offset 6656
        data[326] = 3
        data[327:331] = b"1\x008\x00"
        data = bytes(data) + b"\x00" * 356  # 6500 total < 6656
        e = _read_err(read_ch_bytes, data)
        self.assertIn(CH_TRUNCATED, str(e))

    def test_x2_bad_marker(self):
        data = bytearray(_ch_bytes())
        data[326] = 4  # version field ≠ 3
        e = _read_err(read_ch_bytes, bytes(data))
        self.assertIn(CH_UNSUPPORTED_VERSION, str(e))

    def test_x2b_bad_marker_text(self):
        data = bytearray(_ch_bytes())
        data[327:331] = b"1\x009\x00"  # "19" not "18"
        e = _read_err(read_ch_bytes, bytes(data))
        self.assertIn(CH_UNSUPPORTED_VERSION, str(e))

    def test_x3_mid_escape_truncation(self):
        # body ends mid-escape: 32767 followed by fewer than 4 slots
        raw = [100, 200, 300]
        data = mkd.encode_ch(dict(raw_levels=raw, escapes=[]))
        page = struct.unpack_from(">I", data, 264)[0]
        off = (page - 1) * 512
        tail = bytes([0x7f, 0xff, 0x00, 0x01])  # 32767 + only 2 more slots
        e = _read_err(read_ch_bytes, data[:off] + tail, source="broken.D/FID1A.CH")
        self.assertIn(CH_TRUNCATED, str(e))
        self.assertIn(str(off), str(e))  # names the byte offset of the broken escape
        self.assertIn("broken.D/FID1A.CH", str(e))

    def test_x4_nan_t_end(self):
        data = _ch_bytes(raw_levels=[1, 2, 3], escapes=[])
        data = bytearray(data)
        struct.pack_into(">f", data, 286, float("nan"))
        e = _read_err(read_ch_bytes, bytes(data))
        self.assertIn(CH_AXIS_INVALID, str(e))

    def test_x4b_t_end_before_t0(self):
        data = _ch_bytes(raw_levels=[1, 2, 3], escapes=[])
        data = bytearray(data)
        t = struct.unpack_from(">f", data, 282)[0]
        struct.pack_into(">f", data, 286, t - 100.0)
        e = _read_err(read_ch_bytes, bytes(data))
        self.assertIn(CH_AXIS_INVALID, str(e))

    def test_x5_no_points(self):
        # valid header, marker, times — but zero body slots (empty body)
        data = mkd.encode_ch(dict(raw_levels=[], escapes=[]))
        e = _read_err(read_ch_bytes, data)
        self.assertIn(CH_NO_POINTS, str(e))

    def test_x6_odd_length_utf16(self):
        # 2 (BOM) + 7 (ASCII) = 9 bytes — ODD: strict UTF-16 decode MUST fail
        e = _read_err(decode_sample_xml, b"\xff\xfe<Sample")
        self.assertIn(METADATA_DECODE_FAILED, str(e))
        # BOM-less odd length (5 bytes) → same named failure
        e = _read_err(decode_run_log, b"\x00ab\x00\x00")
        self.assertIn(METADATA_DECODE_FAILED, str(e))

    def test_x7_malformed_xml(self):
        e = _read_err(decode_sample_xml, '<Sample><Name>x</Sample>'.encode("utf-16le"))
        self.assertIn(METADATA_XML_INVALID, str(e))


# ---------------------------------------------------------------------------
# 3. SAMPLE.XML — exact fields + extras + raw_text (lossless)
# ---------------------------------------------------------------------------
SAMPLE_XML_TEXT = (
    '<?xml version="1.0"?>\r\n'
    "<Sample>\r\n"
    "  <Version>0</Version>\r\n"
    "  <Name>SYNTH-001</Name>\r\n"
    "  <Amount>0</Amount>\r\n"
    "  <Multiplier>1</Multiplier>\r\n"
    "  <Dilution>1</Dilution>\r\n"
    "  <Description></Description>\r\n"
    "  <ISTDs>\r\n"
    "    <ISTD Num=\"1\">0</ISTD>\r\n"
    "    <ISTD Num=\"2\">1.5</ISTD>\r\n"
    "  </ISTDs>\r\n"
    "  <TargetMasses />\r\n"
    "  <Instrument>FID</Instrument>\r\n"
    "</Sample>"
)


class TestSampleXml(unittest.TestCase):
    def test_fields_exact_and_lossless(self):
        data = b"\xff\xfe" + SAMPLE_XML_TEXT.encode("utf-16le")
        out = decode_sample_xml(data, source="SYNTH-001.D/SAMPLE.XML")
        self.assertEqual(out["name"], "SYNTH-001")
        self.assertEqual(out["amount"], "0")
        self.assertEqual(out["multiplier"], "1")
        self.assertEqual(out["dilution"], "1")
        self.assertEqual(out["version"], "0")
        self.assertEqual(out["description"], "")  # empty string, not None
        self.assertEqual(out["isstds"], [{"num": "1", "value": "0"}, {"num": "2", "value": "1.5"}])
        self.assertEqual(out["target_masses"], [])  # self-closed empty
        # unknown element → extras (nothing dropped)
        self.assertEqual(out["extras"]["Instrument"], "FID")
        # raw_text round-trips losslessly (exact decoded string)
        self.assertEqual(out["raw_text"], SAMPLE_XML_TEXT)
        self.assertEqual(out["source"], "SYNTH-001.D/SAMPLE.XML")

    def test_no_bom_fallback_utf16le(self):
        text = "<Sample><Name>N1</Name></Sample>"
        out = decode_sample_xml(text.encode("utf-16le"))
        self.assertEqual(out["name"], "N1")

    def test_xml_without_sample_root(self):
        e = _read_err(decode_sample_xml, "<Other/>".encode("utf-16le"))
        self.assertIn(METADATA_XML_INVALID, str(e))


# ---------------------------------------------------------------------------
# 4. RUN.LOG — recognized parse + unrecognized preserved (lossless)
# ---------------------------------------------------------------------------
RUN_LOG_TEXT = (
    "  67 41e2 6adb7862    0\r\n"
    "Method       Method started                                 10:08:18 10/23/26\r\n"
    "  67 41e2 6adb7862    0\r\n"
    "Method       Instrument running sample Vial 101 (front)     10:08:18 10/23/26\r\n"
    "6890       1 Not ready:F inlet flow 19.3 at runtime 6.37    10:18:19 10/23/26\r\n"
)


class TestRunLog(unittest.TestCase):
    def test_recognized_and_unrecognized(self):
        data = b"\xff\xfe" + RUN_LOG_TEXT.encode("utf-16le")
        out = decode_run_log(data, source="SYNTH-001.D/RUN.LOG")
        self.assertEqual(len(out["lines"]), 5)
        self.assertEqual(out["recognized_count"], 3)
        self.assertEqual(out["unrecognized_count"], 2)
        # recognized: {category, message, time, date}
        self.assertEqual(out["lines"][1]["parsed"]["category"], "Method")
        self.assertEqual(out["lines"][1]["parsed"]["message"], "Method started")
        self.assertEqual(out["lines"][1]["parsed"]["time"], "10:08:18")
        self.assertEqual(out["lines"][1]["parsed"]["date"], "10/23/26")
        self.assertEqual(out["lines"][4]["parsed"]["category"], "6890")
        # unrecognized: parsed None, raw VERBATIM (hex event line survives)
        self.assertIsNone(out["lines"][0]["parsed"])
        self.assertEqual(out["lines"][0]["raw"], "  67 41e2 6adb7862    0")
        # lossless: every line accounted for
        self.assertEqual(out["recognized_count"] + out["unrecognized_count"], len(out["lines"]))

    def test_zero_recognized_not_a_failure(self):
        data = b"\xff\xfe" + "  67 41e2 6adb7862    0\r\n".encode("utf-16le")
        out = decode_run_log(data)
        self.assertEqual(out["recognized_count"], 0)
        self.assertEqual(len(out["lines"]), 1)

    def test_empty_log(self):
        out = decode_run_log(b"\xff\xfe")
        self.assertEqual(out["lines"], [])
        self.assertEqual(out["recognized_count"], 0)


# ---------------------------------------------------------------------------
# 2 + 6. attach() on a real Context over the generated synthetic tree
# ---------------------------------------------------------------------------
class TestAttach(unittest.TestCase):
    def _make_tree(self, tag_escapes=0):
        # Plateau levels: raw[i] = 1000 + 10*i, so every delta fits int16 and
        # the escape levels match raw at their indices (checked by the
        # the encoder). Escape levels are the plateau values (1050 … 1490) —
        # small, so their u32 lo half never collides with the 32767 sentinel.
        #
        # Escape placement (encoder constraint, mirrored from decD): an escape
        # with tag≠0 leaves b1 := tag*2**32+level — HUGE — so the point that
        # FOLLOWS it must also be an escape (or the file must end), else the
        # next non-escape delta overflows int16. Hence: one zero-tag escape
        # mid-file (idx 5) + the tag≠0 escapes pinned at the TAIL (idx 49,
        # 48, …). All self-contained; no non-escape point follows a huge b1.
        raw_levels = [1000 + 10 * i for i in range(50)]
        tail_idx = [49 - k for k in range(tag_escapes)]
        escapes = [(5, raw_levels[5], 0)]
        for i in tail_idx:
            level = raw_levels[i]
            # the escape's DECODED raw value is tag*2**32 + level (huge) — the
            # plateau value only fills the level slots; no delta is ever
            # computed against an escape point, so the huge raw is expressible
            raw_levels[i] = 7 * 4294967296 + level
            escapes.append((i, level, 7))
        d = tempfile.mkdtemp(prefix="gc6-synth-")
        mkd.write_d_tree(Path(d), "SYNTH-001", raw_levels=raw_levels, escapes=escapes)
        return Path(d) / "SYNTH-001.D"

    def _ctx(self, tree: Path, *, with_meta: bool = True) -> Context:
        # meta.sourcePath is what the D5 runner touch (the GC-4/GC-5 shipped
        # flow) supplies per per-file DREF; the opaque inputs carry it too.
        meta = ({"sourcePath": "SYNTH-001.D/FID1A.CH", "contentHash": "abc123"}
                if with_meta else {})
        inputs = {
            "signal1": {"dataKind": "signal", "path": str(tree / "FID1A.CH"), "meta": meta},
            "sampleMeta": {"dataKind": "binary", "path": str(tree / "SAMPLE.XML"),
                           "meta": ({"sourcePath": "SYNTH-001.D/SAMPLE.XML"} if with_meta else {})},
            "runLog": {"dataKind": "binary", "path": str(tree / "RUN.LOG"),
                       "meta": ({"sourcePath": "SYNTH-001.D/RUN.LOG"} if with_meta else {})},
            "macBak": {"dataKind": "binary", "path": str(tree / "SAMPLE.MAC.bak"),
                       "meta": ({"sourcePath": "SYNTH-001.D/SAMPLE.MAC.bak"} if with_meta else {})},
            "methodAsset": {"dataKind": "binary", "path": str(tree / "ACQ.M" / "INFO.MTH"),
                            "meta": ({"sourcePath": "SYNTH-001.D/ACQ.M/INFO.MTH"} if with_meta else {})},
            "reg": {"dataKind": "binary", "path": str(tree / "ACQRES.REG"),
                    "meta": ({"sourcePath": "SYNTH-001.D/ACQRES.REG"} if with_meta else {})},
        }
        return Context(inputs=inputs)

    def test_attach_classifies_and_decodes(self):
        tree = self._make_tree()
        ctx = self._ctx(tree)
        decoded = attach(ctx)
        # signal → CH decode with header-derived scaling + channel identity from meta.sourcePath
        sig = decoded["signal1"]
        self.assertEqual(sig["channel"], "FID1A")
        self.assertEqual(sig["value_units"], "pA")
        self.assertEqual(sig["meta"]["reader"]["name"], READER_NAME)
        self.assertEqual(sig["meta"]["escape_tag_nonzero"], 0)
        # sample metadata → structured fields
        self.assertEqual(decoded["sampleMeta"]["name"], "SYNTH-001")
        # run log → lines with recognized count
        self.assertGreater(decoded["runLog"]["recognized_count"], 0)
        self.assertEqual(len(decoded["runLog"]["lines"]), 5)
        # method assets / opaque → SKIPPED, not in decoded, but named in logs
        self.assertNotIn("macBak", decoded)
        self.assertNotIn("methodAsset", decoded)
        self.assertNotIn("reg", decoded)
        messages = [m["message"] for m in ctx.manifest().logs]
        joined = " | ".join(messages)
        for skipped in ("SAMPLE.MAC.bak", "INFO.MTH", "ACQRES.REG"):
            self.assertIn(skipped, joined)
        # reader identity set on the manifest (D4)
        reader = ctx.manifest().to_dict().get("reader")
        self.assertEqual(reader, {
            "name": READER_NAME,
            "version": READER_VERSION,
            "sdk_version": "0.2.0",
        })
        # summary log line per decoded input
        self.assertTrue(any("FID1A.CH" in m for m in messages))

    def test_attach_no_meta_fallback_content_sniff(self):
        tree = self._make_tree()
        ctx = self._ctx(tree, with_meta=False)
        decoded = attach(ctx)
        # classification by pure content sniff: CH marker → signal; BOM+xml → sample;
        # BOM text → run_log
        self.assertEqual(decoded["signal1"]["channel"], "signal1")  # stem of handle name, not invented
        self.assertEqual(decoded["sampleMeta"]["name"], "SYNTH-001")
        self.assertGreater(decoded["runLog"]["recognized_count"], 0)

    def test_escape_tag_audit_warning(self):
        # X9: 2 tag≠0 escapes → escape_tag_nonzero == 2 + warning log line
        tree = self._make_tree(tag_escapes=2)
        ctx = self._ctx(tree)
        decoded = attach(ctx)
        self.assertEqual(decoded["signal1"]["meta"]["escape_tag_nonzero"], 2)
        warnings = [m for m in ctx.manifest().logs if m["level"] == "warning"]
        self.assertTrue(any("escape" in m["message"] and "2" in m["message"] for m in warnings),
                        f"expected an escape-tag warning; logs={[m['message'] for m in ctx.manifest().logs]}")

    def test_escape_tag_zero_no_warning(self):
        tree = self._make_tree(tag_escapes=0)
        ctx = self._ctx(tree)
        attach(ctx)
        warnings = [m for m in ctx.manifest().logs if m["level"] == "warning"]
        self.assertFalse(any("escape" in m["message"] for m in warnings))


# ---------------------------------------------------------------------------
# 7. Regression leg — the CSV path stays byte-identical
# ---------------------------------------------------------------------------
class TestCsvRegression(unittest.TestCase):
    def test_csv_signal_unchanged(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.csv"
            p.write_text("time,intensity\n0.1,5\n0.3,7\n", encoding="utf-8")
            h = DatasetHandle(name="t", data_kind="signal", path=str(p))
            out = h.read_signal()
            self.assertEqual(out, {"axis": [0.1, 0.3], "values": [5, 7]})

    def test_inline_dict_unchanged(self):
        h = DatasetHandle(name="t", data_kind="signal",
                          inline={"axis": [1, 2], "values": [3, 4]})
        self.assertEqual(h.read_signal(), {"axis": [1, 2], "values": [3, 4]})

    def test_read_signal_on_ch_bytes(self):
        # the DatasetHandle seam (D3.1): a file whose bytes carry the v181
        # marker is decoded by the reader, richer keys present too
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "FID1A.CH"
            p.write_bytes(_ch_bytes(raw_levels=[10, 20, 30], escapes=[]))
            h = DatasetHandle(name="sig", data_kind="signal", path=str(p))
            out = h.read_signal()
            self.assertEqual(len(out["values"]), 3)
            self.assertEqual(out["axis_units"], "min")
            self.assertEqual(out["value_units"], "pA")


# ---------------------------------------------------------------------------
# 8. Large-signal helper leg — publish_file → blob dict (D8, python-side)
# ---------------------------------------------------------------------------
class TestLargeSignalBlob(unittest.TestCase):
    def test_publish_file_blob(self):
        with tempfile.TemporaryDirectory() as d:
            sig_path = Path(d) / "signal.json"
            sig_path.write_text(json.dumps({"axis": [0.0, 1.0], "values": [5.0, 6.0]}))
            ctx = Context(inputs={})
            art = ctx.publish_file("signal", str(sig_path), kind="signal", format="json")
            self.assertIsNotNone(art.blob)
            self.assertEqual(art.blob["format"], "json")
            self.assertEqual(art.blob["sizeBytes"], sig_path.stat().st_size)
            self.assertRegex(art.blob["sha256"], r"^[0-9a-f]{64}$")
            # manifest JSON carries the reader-absent shape unchanged (bait #5):
            # no `reader` key when attach() never ran
            self.assertNotIn("reader", ctx.manifest().to_dict())


if __name__ == "__main__":
    unittest.main(verbosity=2)
