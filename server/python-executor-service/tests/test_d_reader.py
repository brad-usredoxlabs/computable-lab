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
    _classify,
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
            "sdk_version": "0.4.0",  # GC-8 OQ4 fold: __version__ 0.3.0 -> 0.4.0 (the block echoes the live __init__.py)
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
# ADV-1 defect fixes — pins for the adversarial-review defects (l1t0320)
# ---------------------------------------------------------------------------
class TestAdvFixDefs(unittest.TestCase):
    """Pins for the seven adversarial-review defects (review
    GC6-advreview-l1t0320.md). Each test names the defect it pins."""

    # --- defect 1 (MAJOR): corrupt metadata through attach() must RAISE,
    # not be swallowed into "opaque". The X6 tests above call the decoders
    # directly; this one exercises the PUBLIC attach() path (the review's
    # probe: BOM + b"<Sample" through attach → no error before the fix).
    def test_defect1_attach_raises_on_corrupt_sample_xml(self):
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "SAMPLE.XML"
            bad.write_bytes(b"\xff\xfe<Sample")  # BOM + 7 ASCII bytes: ODD length
            ctx = Context(inputs={
                "sampleMeta": {"dataKind": "binary", "path": str(bad),
                               "meta": {"sourcePath": "SYNTH-001.D/SAMPLE.XML"}},
            })
            try:
                attach(ctx)
            except ReaderError as e:
                self.assertIn(METADATA_DECODE_FAILED, str(e))
                # names the input (the spec X6 requirement)
                self.assertIn("SYNTH-001.D/SAMPLE.XML", str(e))
            else:
                self.fail("attach() swallowed corrupt metadata — run SUCCEEDED "
                          "with no metadata and NO named code")
            # the run must not have completed with an opaque skip log
            messages = [m["message"] for m in ctx.manifest().logs]
            self.assertFalse(any("skipped as opaque" in m for m in messages),
                             f"corrupt metadata logged as opaque: {messages}")

    def test_defect1_attach_raises_on_lone_surrogate(self):
        # lone-surrogate metadata (even length — not caught by a length check)
        # must also fail named through attach()
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "RUN.LOG"
            bad.write_bytes(b"\xff\xfe" + "ab".encode("utf-16-le") + b"\x80\xdc")
            ctx = Context(inputs={
                "runLog": {"dataKind": "binary", "path": str(bad)},
            })
            try:
                attach(ctx)
            except ReaderError as e:
                self.assertIn(METADATA_DECODE_FAILED, str(e))
            else:
                self.fail("attach() swallowed a lone-surrogate RUN.LOG")

    def test_defect1_genuinely_opaque_bom_file_stays_opaque(self):
        # OPAQUE must remain a real classification (the defect-1 fix must not
        # over-broaden into "BOM + anything = raise"): a no-BOM binary file
        # and a BOM XML that is not <Sample> are both skipped-as-opaque.
        # A BOM text file that is not XML at all stays a (lossless) run_log
        # per spec D3.3 — decodable metadata text is NOT opaque.
        with tempfile.TemporaryDirectory() as d:
            opaque = Path(d) / "SAMPLE.MAC.bak"
            opaque.write_bytes(b"\x00MACBAK\x00synthetic")  # no BOM, binary-ish
            other = Path(d) / "METHOD.XML"
            other.write_bytes(b"\xff\xfe" + "<Other>x</Other>".encode("utf-16-le"))
            logish = Path(d) / "NOTES.MAC"
            logish.write_bytes(b"\xff\xfe" + "M A C  b a k".encode("utf-16-le"))
            ctx = Context(inputs={
                "macBak": {"dataKind": "binary", "path": str(opaque),
                           "meta": {"sourcePath": "SYNTH-001.D/SAMPLE.MAC.bak"}},
                "methodXml": {"dataKind": "binary", "path": str(other),
                              "meta": {"sourcePath": "SYNTH-001.D/METHOD.XML"}},
                "logish": {"dataKind": "binary", "path": str(logish),
                           "meta": {"sourcePath": "SYNTH-001.D/NOTES.MAC"}},
            })
            decoded = attach(ctx)
            self.assertNotIn("macBak", decoded)
            self.assertNotIn("methodXml", decoded)
            messages = [m["message"] for m in ctx.manifest().logs]
            joined = " | ".join(messages)
            self.assertIn("SAMPLE.MAC.bak", joined)
            self.assertIn("METHOD.XML", joined)
            self.assertIn("skipped as opaque", joined)
            # D3.3: BOM-decodable non-XML text is a run_log, never opaque
            self.assertEqual(decoded["logish"]["recognized_count"], 0)
            self.assertEqual(len(decoded["logish"]["lines"]), 1)

    # --- defect 2: axis endpoint pinning — the review's off-by-1-ulp shape
    # (n=28812, t0=251.4796142578125, t_end=3927.47607421875): the UNPINNED
    # t0 + (n-1)*dt computation lands at 3927.4760742187505 (delta 4.5e-13).
    # The reader's header times come back from f32 ticks, so feed the f32-
    # rounded values — the same round-trip the reader performs.
    def test_defect2_axis_endpoint_pinned_review_shape(self):
        import struct as _s
        t0 = _s.unpack(">f", _s.pack(">f", 251.4796142578125 * 60000.0))[0] / 60000.0
        t_end = _s.unpack(">f", _s.pack(">f", 3927.47607421875 * 60000.0))[0] / 60000.0
        n = 28812
        data = _ch_bytes(raw_levels=list(range(n)), t0_ticks=t0 * 60000.0,
                         t_end_ticks=t_end * 60000.0)
        out = read_ch_bytes(data, source="REVIEW.D/FID1A.CH")
        # the UNPINNED value is provably != t_end (guard: this is a real drift shape)
        dt = (t_end - t0) / (n - 1)
        self.assertNotEqual(t0 + (n - 1) * dt, t_end,
                            "precondition broken: shape no longer drifts unpinned")
        self.assertEqual(out["axis"][-1], t_end)  # EXACT (decD np.linspace convention)
        self.assertEqual(out["axis"][0], t0)
        self.assertEqual(len(out["axis"]), n)
        # dt itself is the header-derived value, computed once
        self.assertEqual(out["meta"]["header"]["dt"], dt)

    def test_defect2_axis_endpoint_pinned_small_n(self):
        # a second shape (n=997) — endpoint exact, interior points on the grid
        data = _ch_bytes(raw_levels=[100] * 997, escapes=[],
                         t0_ticks=1.0, t_end_ticks=100000.0)
        out = read_ch_bytes(data)
        t0 = out["meta"]["header"]["t0"]
        t_end = out["meta"]["header"]["t_end"]
        self.assertEqual(out["axis"][-1], t_end)
        dt = (t_end - t0) / 996
        self.assertEqual(out["axis"][500], t0 + 500 * dt)  # interior: grid, not pinned

    # --- defect 3: page == 0 → negative body offset must be a NAMED code,
    # not a raw struct.error.
    def test_defect3_page_zero_named_truncation(self):
        data = bytearray(_ch_bytes(raw_levels=[1, 2, 3], escapes=[]))
        struct.pack_into(">I", data, 264, 0)  # page 0 → offset = -512
        e = _read_err(read_ch_bytes, bytes(data), source="page0.D/FID1A.CH")
        self.assertIn(CH_TRUNCATED, str(e))
        self.assertNotIn("struct.error", str(e))
        self.assertIn("page=0", str(e))       # names the header page
        self.assertIn("-512", str(e))        # names the (negative) offset
        self.assertIn("page0.D/FID1A.CH", str(e))

    # --- defect 4: odd body length must be CH_TRUNCATED, not a silent drop.
    def test_defect4_odd_body_byte_truncates(self):
        data = _ch_bytes(raw_levels=[10, 20, 30], escapes=[])
        page = struct.unpack_from(">I", data, 264)[0]
        off = (page - 1) * 512
        # the review's probe: +1 stray byte → must FAIL (not succeed with n=3),
        # naming the offset of the DANGLING byte (the last byte, len-1).
        odd1 = data + b"\x00"
        e = _read_err(read_ch_bytes, odd1, source="odd.D/FID1A.CH")
        self.assertIn(CH_TRUNCATED, str(e))
        self.assertIn(str(len(odd1) - 1), str(e))  # names the dangling byte's offset
        self.assertNotIn(str(off), str(e))        # not the body-start offset
        self.assertIn("odd.D/FID1A.CH", str(e))
        # +3 stray bytes → one whole slot silently discarded before the fix
        odd3 = data + b"\x00\x00\x00"
        e = _read_err(read_ch_bytes, odd3, source="odd3.D/FID1A.CH")
        self.assertIn(CH_TRUNCATED, str(e))
        self.assertIn(str(len(odd3) - 1), str(e))
        # even-length body still decodes exactly (the control)
        out = read_ch_bytes(data)
        self.assertEqual(out["meta"]["n_points"], 3)

    # --- defect 5: attach() must use the PUBLIC ctx.input_names() seam
    # (D3.2), not the private _inputs attribute.
    def test_defect5_attach_uses_input_names_seam(self):
        # A context object that EXPOSES input_names() but has no _inputs
        # attribute at all: the pre-fix attach() (getattr(ctx, "_inputs", {}))
        # silently iterates NOTHING and decodes zero inputs.
        class SeamCtx:
            def __init__(self, real):
                self._real = real
                self._logs = real.manifest().logs  # same manifest log list

            def input(self, name):
                return self._real.input(name)

            def input_names(self):
                return self._real.input_names()

            def log(self, message, *, level="info", code=None):
                self._real.log(message, level=level, code=code)

            def manifest(self):
                return self._real.manifest()

        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "SAMPLE.XML"
            bad.write_bytes(b"\xff\xfe<Sample")
            real = Context(inputs={
                "sampleMeta": {"dataKind": "binary", "path": str(bad)},
            })
            try:
                attach(SeamCtx(real))
            except ReaderError as e:
                self.assertIn(METADATA_DECODE_FAILED, str(e))
            else:
                self.fail("attach() did not see the input — it iterates the "
                          "private _inputs attribute, not ctx.input_names()")

    # --- defect 6: attach() must not CRASH on a non-file input. The runner's
    # exact inline shape (analysisRunner.ts:195): path: <inputDir>/<name>.inline
    # with NO file written, inline: <value> → file_bytes() raises
    # FileNotFoundError pre-fix.
    def test_defect6_attach_survives_inline_input_runner_shape(self):
        # the runner's literal spec shape for an inline artifact input
        inputs = {
            "signal1": {"dataKind": "signal", "inline": {"axis": [1, 2], "values": [3, 4]}},
            "prevTable": {"dataKind": "table",
                          "path": "/tmp/nonexistent-dir/prevTable.inline",
                          "inline": [{"a": 1}, {"a": 2}]},
        }
        ctx = Context(inputs=inputs)
        decoded = attach(ctx)  # pre-fix: FileNotFoundError / RuntimeError here
        # non-file inputs are classified opaque and logged (the method-asset
        # path) — never decoded, never crashed
        self.assertEqual(decoded, {})
        messages = [m["message"] for m in ctx.manifest().logs]
        joined = " | ".join(messages)
        self.assertIn("prevTable.inline", joined)   # names the input path
        self.assertIn("skipped as opaque", joined)
        self.assertNotIn("signal1", decoded)
        self.assertNotIn("prevTable", decoded)
        # the manifest reader block is still set (attach completed)
        self.assertEqual(ctx.manifest().to_dict()["reader"]["name"], READER_NAME)

    def test_defect6_attach_mixed_file_and_inline(self):
        # a file-backed .D member beside an inline table: the file decodes,
        # the inline skips, the run completes
        with tempfile.TemporaryDirectory() as d:
            xml = Path(d) / "SAMPLE.XML"
            xml.write_bytes(b"\xff\xfe" + "<Sample><Name>MIX</Name></Sample>".encode("utf-16-le"))
            ctx = Context(inputs={
                "sampleMeta": {"dataKind": "binary", "path": str(xml)},
                "params": {"dataKind": "table",
                           "path": "/tmp/nonexistent-dir/params.inline",
                           "inline": {"x": 1}},
            })
            decoded = attach(ctx)
            self.assertEqual(decoded["sampleMeta"]["name"], "MIX")
            self.assertNotIn("params", decoded)


# ---------------------------------------------------------------------------
# ADV-2 defect fixes — pins for the CYCLE-2 adversarial-review regressions
# (review GC6-advreview-cycle2-l1t0400.md). Both are new MINOR defects the
# cycle-1 fix run introduced.
# ---------------------------------------------------------------------------
class TestAdvFixDefsCycle2(unittest.TestCase):
    """Pins for the two cycle-2 defects (new regressions of the cycle-1 fix).

    Cycle-2 defect 1: the cycle-1 _classify BOM arm RAISED for ANY BOM-prefixed
    input whose bytes were not valid strict UTF-16 — so a genuinely BINARY
    asset that merely starts with FF FE (spec's SINGLE.B-shaped opaque member)
    aborted the run instead of the X10 opaque skip. Spec D3.3 classifies only
    BOM+xml as sample_metadata; everything else is opaque. The discriminator
    must decide "metadata-shaped" from the DECODED LEADING TEXT, not from the
    input name and not via errors='ignore' (bait #3 still binds).

    Cycle-2 defect 2: the D6 fix set the decoded-artifact ``source`` for
    file-backed metadata/log inputs to the absolute mount path (handle.path)
    when meta.sourcePath is absent — a per-run nondeterministic provenance.
    Spec D7 pins ``source`` = meta.sourcePath / handle name.
    """

    # --- cycle-2 defect 1: BOM-prefixed BINARY must stay opaque (X10) ---

    def test_c2d1_bom_prefixed_binary_classified_opaque(self):
        # The reviewer's exact probe shape: FF FE + a 128-byte binary block
        # (bytes 0x80..0xFF; even length, invalid UTF-16 — strict decode
        # fails at position 90, a lone UTF-16 surrogate). Shaped like the
        # spec's SINGLE.B opaque member: NOT metadata-shaped (the bytes after
        # the BOM are not a decodable text prefix).
        payload = b"\xff\xfe" + bytes(range(0x80, 0x100))
        self.assertEqual(_classify(payload, "IN.D/SINGLE.B"), "opaque")

    def test_c2d1_bom_prefixed_binary_attach_skips_opaque(self):
        # End-to-end through attach(): the run COMPLETES, the member is NOT
        # decoded, and the X10 named log line is emitted (reviewer's probe
        # /tmp/gc6c2/probe_overbroad.py behaviour, pinned).
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "SINGLE.B"
            p.write_bytes(b"\xff\xfe" + bytes(range(0x80, 0x100)))
            ctx = Context(inputs={
                "single": {"dataKind": "binary", "path": str(p),
                           "meta": {"sourcePath": "IN.D/SINGLE.B"}},
            })
            decoded = attach(ctx)  # pre-fix: RAISED METADATA_DECODE_FAILED
            self.assertEqual(decoded, {})  # skipped, never decoded
            messages = [m["message"] for m in ctx.manifest().logs]
            joined = " | ".join(messages)
            self.assertIn("IN.D/SINGLE.B", joined)       # named log line (X10)
            self.assertIn("skipped as opaque", joined)
            # the run COMPLETED — reader identity set on the manifest
            self.assertEqual(ctx.manifest().to_dict()["reader"]["name"], READER_NAME)

    def test_c2d1_classification_is_content_not_name(self):
        # The discriminator is the BYTES, never the input name:
        #  - a file NAMED SINGLE.B whose content is a torn raw-ASCII
        #    metadata head (the reviewer's D1a probe shape: BOM + 7 ASCII
        #    bytes — odd length, strict UTF-16 decode fails on truncated
        #    data) is corrupt METADATA → METADATA_DECODE_FAILED, not
        #    opaque by virtue of its name;
        #  - a file NAMED SAMPLE.XML whose content is a BOM-prefixed
        #    binary head (the cycle-2 overbroad probe shape: FF FE +
        #    128 high bytes — a decodable CJK-style prefix, not text)
        #    is OPAQUE, not a failure by virtue of its name.
        torn = b"\xff\xfe<Sample"  # D1a shape: BOM + 7 raw ASCII bytes
        try:
            _classify(torn, "IN.D/SINGLE.B")
        except ReaderError as e:
            self.assertIn(METADATA_DECODE_FAILED, str(e))
        else:
            self.fail("torn metadata head (BOM + ASCII) named SINGLE.B "
                      "must classify as corrupt metadata — raise, not opaque")
        binary = b"\xff\xfe" + bytes(range(0x80, 0x100))
        self.assertEqual(_classify(binary, "SYNTH-001.D/SAMPLE.XML"), "opaque")
        # a BOM + lone-surrogate file whose leading bytes are NOT metadata
        # (0x80 0xDC alone — undecodable head) stays opaque, not a raise
        self.assertEqual(_classify(b"\xff\xfe\x80\xdc", "IN.D/SINGLE.B"), "opaque")

    def test_c2d1_corrupt_metadata_still_raises_through_attach(self):
        # KEEP the cycle-1 corrupt-metadata behaviour (control the new
        # narrowing must not break): a file with a VALID metadata head —
        # BOM + a strict UTF-16 ASCII '<' head — truncated mid-codepoint
        # must RAISE METADATA_DECODE_FAILED through attach(), naming the
        # input, with NO opaque-skip log. The shape: BOM + "<?xml
        # version=" in UTF-16LE (15 chars = 30 bytes), then ONE stray byte
        # so the strict decode fails on truncated data at the tail — a
        # torn SAMPLE.XML, not opaque content.
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "SAMPLE.XML"
            head = "<?xml version=\"1.0\"?>".encode("utf-16-le")[:30]
            bad.write_bytes(b"\xff\xfe" + head + b"\x41")  # +1 stray byte
            ctx = Context(inputs={
                "sampleMeta": {"dataKind": "binary", "path": str(bad),
                               "meta": {"sourcePath": "SYNTH-001.D/SAMPLE.XML"}},
            })
            try:
                attach(ctx)
            except ReaderError as e:
                self.assertIn(METADATA_DECODE_FAILED, str(e))
                self.assertIn("SYNTH-001.D/SAMPLE.XML", str(e))
            else:
                self.fail("corrupt (truncated) SAMPLE.XML must raise "
                          "METADATA_DECODE_FAILED through attach() — the "
                          "opaque narrowing must not swallow corrupt metadata")
            messages = [m["message"] for m in ctx.manifest().logs]
            self.assertFalse(any("skipped as opaque" in m for m in messages),
                             f"corrupt metadata logged as opaque: {messages}")

    # --- cycle-2 defect 2: decoded-artifact source = meta.sourcePath /
    # --- handle name, NEVER the absolute mount path (spec D7) ---

    def test_c2d2_source_pin_no_meta_sample(self):
        # A file-backed SAMPLE.XML with NO meta.sourcePath: the decoded
        # artifact's source is the HANDLE NAME — not the per-run absolute
        # mount path (the pre-fix value, which made the artifact differ
        # run-to-run for identical inputs).
        with tempfile.TemporaryDirectory() as d:
            xml = Path(d) / "SAMPLE.XML"
            xml.write_bytes(b"\xff\xfe" + "<Sample><Name>PIN</Name></Sample>".encode("utf-16-le"))
            ctx = Context(inputs={
                "sampleMeta": {"dataKind": "binary", "path": str(xml)},
            })
            decoded = attach(ctx)
            self.assertEqual(decoded["sampleMeta"]["name"], "PIN")
            # spec D7: source = meta.sourcePath / handle name
            self.assertEqual(decoded["sampleMeta"]["source"], "sampleMeta")
            self.assertNotIn(str(d), str(decoded["sampleMeta"]["source"]))  # no tempdir path

    def test_c2d2_source_pin_no_meta_runlog(self):
        # same pin for the RUN.LOG branch (the other decoder the regression
        # touched)
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / "RUN.LOG"
            log.write_bytes(b"\xff\xfe" + "  67 41e2 6adb7862    0\r\n".encode("utf-16-le"))
            ctx = Context(inputs={
                "runLog": {"dataKind": "binary", "path": str(log)},
            })
            decoded = attach(ctx)
            self.assertEqual(decoded["runLog"]["source"], "runLog")
            self.assertNotIn(str(d), str(decoded["runLog"]["source"]))

    def test_c2d2_source_prefers_meta_when_present(self):
        # meta.sourcePath still wins when the runner supplied it (the D5
        # leg the regression did not touch — guard against over-correction)
        with tempfile.TemporaryDirectory() as d:
            xml = Path(d) / "SAMPLE.XML"
            xml.write_bytes(b"\xff\xfe" + "<Sample><Name>PIN2</Name></Sample>".encode("utf-16-le"))
            ctx = Context(inputs={
                "sampleMeta": {"dataKind": "binary", "path": str(xml),
                               "meta": {"sourcePath": "SYNTH-001.D/SAMPLE.XML"}},
            })
            decoded = attach(ctx)
            self.assertEqual(decoded["sampleMeta"]["source"], "SYNTH-001.D/SAMPLE.XML")

    def test_c2d2_no_file_log_line_still_uses_path(self):
        # the DEFECT-6 fix stays intact: the no_file LOG LINE for an inline
        # input still names <name>.inline via handle.path (what distinguishes
        # the line from a decoded source). Only the DECODED source was
        # wrong; the log line was correct and must not change.
        ctx = Context(inputs={
            "prevTable": {"dataKind": "table",
                          "path": "/tmp/nonexistent-dir/prevTable.inline",
                          "inline": [{"a": 1}]},
        })
        decoded = attach(ctx)
        self.assertEqual(decoded, {})
        joined = " | ".join(m["message"] for m in ctx.manifest().logs)
        self.assertIn("prevTable.inline", joined)
        self.assertIn("skipped as opaque", joined)


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
