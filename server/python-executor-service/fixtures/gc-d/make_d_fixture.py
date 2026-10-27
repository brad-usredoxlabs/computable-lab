"""GC-6 — synthetic v181 .D tree generator (T1 fixture strategy; also used by the
vitest integration's TS-side mirror).

SYNTHETIC ONLY — NO real NAS bytes in git (spec B5; the real-NAS proof is the
manual read-only smoke script T4).

The body ENCODER below is the EXACT INVERSE of the canonical GC-1 decoder D
loop (.hermes/plans/scripts/gc1-decD.py:21-50 — that file is the authority):

  * header: 6144 B; page = u32BE@264 → body offset = (page-1)*512;
    version marker b[326]==3 AND b[327:331]==b"1\\x008\\x00" (UTF-16 "18") → v181;
    t0 = f32BE@282, t_end = f32BE@286 — the RAW f32 values are ticks; the
    reader divides by 60000 to get minutes (all three promoted decoders);
    intercept = f64BE@4724, scale = f64BE@4732 → signal(pA) = raw*scale+intercept.
  * body: slots are BIG-endian signed int16 (">h"); the decode loop runs
    UNBOUNDED Python ints: ``b1 += slot; b2 += b1; raw = b2``; a 4-slot escape
    fires on slot == 32767: ``b1 = 0; b2 = slot[i+1]*2**32 + u32BE(slots[i+2..3])``
    and consumes 4 slots for ONE point. ``n == n_slots - 3*escape_count``.

Encoding therefore works BACKWARDS from the chosen raw (b2) level sequence:
  - a non-escape point i emits slot s = b1_i - b1_{i-1} (b1 = raw[i]-raw[i-1],
    raw[-1] := 0, and b1 := 0 right after an escape) — s must fit in signed
    int16 and must never be the 32767 sentinel;
  - an escape point i emits [32767, tag, hi16, lo16] where
    raw[i] == tag*2**32 + (hi16:lo16 as u32 BE); tag is the i16 slot1
    (the KERRY "escape tag" GC-1's audit demand counts when != 0).

If a chosen level sequence cannot be expressed in int16 slots, the encoder
raises — the caller (the test) must pick expressible levels. Never "fix" the
encoder to wrap; the loop must stay the exact inverse of decD.
"""
from __future__ import annotations

import struct
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

HEADER_SIZE = 6144
DEFAULT_PAGE = 13  # body offset (13-1)*512 = 6144 (header only)
MARKER_POS = 326
MARKER_BYTES = b"1\x008\x00"

# The GC-4 file-role vocabulary — referenced by name, NOT redefined (GC-4
# acquisitionPackage.ts PackageFileRole; bait #11). Used only to name the
# synthetic tree's members in comments/assertions.
ROLES = ("signal_channel", "sample_metadata", "run_log", "method_asset", "uninterpreted")

# Corpus-pinned scale (pA/count, GC-1 [G1:45/AS-3]) — the vitest mirror uses it;
# the unit tests deliberately override it to prove values come FROM THE HEADER.
CORPUS_SCALE = 1.302083401242271e-4

DEFAULT_T0_TICKS = 0.000214 * 60000.0     # RES4-like start
DEFAULT_T_END_TICKS = 9.604214 * 60000.0  # RES4-like end


def _check_slot(s: int, where: str) -> None:
    if not (-32768 <= s <= 32767):
        raise ValueError(f"{where}: slot {s} outside int16 range — pick expressible raw levels")
    if s == 32767:
        raise ValueError(f"{where}: slot {s} is the escape sentinel — pick expressible raw levels")


def encode_ch(
    spec: Optional[Dict] = None,
    *,
    raw_levels: Sequence[int] = (1000, 2000, 3500, 2500, 1800, 900),
    escapes: Sequence[Tuple[int, int, int]] = ((2, 3500, 0),),
    page: int = DEFAULT_PAGE,
    scale: float = 1.5e-4,
    intercept: float = 0.5,
    t0_ticks: float = DEFAULT_T0_TICKS,
    t_end_ticks: float = DEFAULT_T_END_TICKS,
) -> bytes:
    """Encode a v181-shaped .CH file.

    raw_levels: the RAW (b2) value at each output point, in order.
    escapes: (index, level, tag) triples — a 4-slot escape at `index` whose
        raw value is tag*2**32 + level (level is the u32 lo half); the caller
        must have raw_levels[index] == tag*2**32 + level (checked, not ignored).
    t0_ticks / t_end_ticks: the RAW f32 header values (minutes*60000); packed
        as float32 — pass an already-f32-rounded value for exact round-trips.
    """
    spec = spec or {}
    if "raw_levels" in spec:
        raw_levels = spec["raw_levels"]
    if "escapes" in spec:
        escapes = spec["escapes"]
    if "page" in spec:
        page = spec["page"]
    if "scale" in spec:
        scale = spec["scale"]
    if "intercept" in spec:
        intercept = spec["intercept"]
    if "t0_ticks" in spec:
        t0_ticks = spec["t0_ticks"]
    if "t_end_ticks" in spec:
        t_end_ticks = spec["t_end_ticks"]

    raw = [int(v) for v in raw_levels]
    esc = {idx: (int(level), int(tag)) for idx, level, tag in escapes}
    for idx, (level, tag) in esc.items():
        if not (0 <= idx < len(raw)):
            raise ValueError(f"escape index {idx} out of range (n={len(raw)})")
        if not (-32768 <= tag <= 32767):
            raise ValueError(f"escape tag {tag} at index {idx} outside int16")
        if not (0 <= level <= 0xFFFFFFFF):
            raise ValueError(f"escape level {level} at index {idx} outside u32")
        if (level >> 16) > 0x7FFF:
            raise ValueError(f"escape level {level} at index {idx}: u32 hi half does not fit a positive i16 byte-pair encoding")
        if raw[idx] != tag * 4294967296 + level:
            raise ValueError(
                f"escape at index {idx}: raw_levels[{idx}]={raw[idx]} != tag*2**32+level={tag * 4294967296 + level} — keep them consistent"
            )

    slots: List[int] = []
    prev_b1 = 0
    prev_raw = 0
    for i, r in enumerate(raw):
        if i in esc:
            level, tag = esc[i]
            slots.extend([32767, tag, (level >> 16) & 0xFFFF, level & 0xFFFF])
            prev_b1 = 0
            prev_raw = r
        else:
            b1 = r - prev_raw
            s = b1 - prev_b1
            _check_slot(s, f"point {i}")
            slots.append(s)
            prev_b1 = b1
            prev_raw = r

    buf = bytearray(HEADER_SIZE)
    struct.pack_into(">I", buf, 264, page)
    buf[MARKER_POS] = 3
    buf[MARKER_POS + 1:MARKER_POS + 5] = MARKER_BYTES
    struct.pack_into(">f", buf, 282, float(t0_ticks))
    struct.pack_into(">f", buf, 286, float(t_end_ticks))
    struct.pack_into(">d", buf, 4724, float(intercept))
    struct.pack_into(">d", buf, 4732, float(scale))
    return bytes(buf) + struct.pack(f">{len(slots)}h", *slots)


# ---------------------------------------------------------------------------
# The synthetic .D tree (mirrors the [F-fixture] shapes: UTF-16LE+BOM metadata,
# ISTD Num=…, self-closed <TargetMasses />, hex event-code log lines)
# ---------------------------------------------------------------------------
SAMPLE_XML_TEMPLATE = (
    '<?xml version="1.0"?>\r\n'
    "<Sample>\r\n"
    "  <Version>0</Version>\r\n"
    "  <Name>{name}</Name>\r\n"
    "  <Amount>0</Amount>\r\n"
    "  <Multiplier>1</Multiplier>\r\n"
    "  <Dilution>1</Dilution>\r\n"
    "  <Description></Description>\r\n"
    "  <ISTDs>\r\n"
    "    <ISTD Num=\"1\">0</ISTD>\r\n"
    "  </ISTDs>\r\n"
    "  <TargetMasses />\r\n"
    "</Sample>"
)

RUN_LOG_TEMPLATE = (
    "  67 41e2 6adb7862    0\r\n"
    "Method       Method started                                 10:08:18 10/23/26\r\n"
    "  67 41e2 6adb7862    0\r\n"
    "Method       Instrument running sample Vial 101 (front)     10:08:18 10/23/26\r\n"
    "6890       1 Not ready:F inlet flow 19.3 at runtime 6.37    10:18:19 10/23/26\r\n"
)


def write_d_tree(
    root: Path,
    sample_name: str,
    *,
    raw_levels: Sequence[int],
    escapes: Sequence[Tuple[int, int, int]],
    ch_name: str = "FID1A.CH",
    scale: float = CORPUS_SCALE,
    intercept: float = 0.0,
    t0_ticks: float = DEFAULT_T0_TICKS,
    t_end_ticks: float = DEFAULT_T_END_TICKS,
) -> Dict[str, Path]:
    """Write the synthetic .D tree (T1) under `root` and return {member: path}."""
    d = Path(root) / f"{sample_name}.D"
    acq_m = d / "ACQ.M"
    acq_m.mkdir(parents=True, exist_ok=True)
    ch_bytes = encode_ch(
        dict(raw_levels=raw_levels, escapes=escapes, scale=scale, intercept=intercept,
             t0_ticks=t0_ticks, t_end_ticks=t_end_ticks)
    )
    (d / ch_name).write_bytes(ch_bytes)
    (d / "SAMPLE.XML").write_bytes(b"\xff\xfe" + SAMPLE_XML_TEMPLATE.format(name=sample_name).encode("utf-16-le"))
    (d / "RUN.LOG").write_bytes(b"\xff\xfe" + RUN_LOG_TEMPLATE.encode("utf-16-le"))
    # Opaque members (GC-1(e): referenceable, never parsed) — synthetic bytes.
    (d / "SAMPLE.MAC.bak").write_bytes(b"\x00MACBAK\x00synthetic")
    (acq_m / "INFO.MTH").write_bytes(b"\x00MTH\x00synthetic")
    (d / "ACQRES.REG").write_bytes(b"\x00REG\x00synthetic")
    return {
        "signal_channel": d / ch_name,
        "sample_metadata": d / "SAMPLE.XML",
        "run_log": d / "RUN.LOG",
        "method_asset": acq_m / "INFO.MTH",
        "uninterpreted": d / "ACQRES.REG",
    }


if __name__ == "__main__":
    import sys, tempfile
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="gc6-dfix-"))
    paths = write_d_tree(out, "SYNTH-CLI", raw_levels=[i * 100 for i in range(50)], escapes=[(5, 500, 0)])
    for role, p in paths.items():
        print(f"{role:16s} {p} ({p.stat().st_size} B)")
