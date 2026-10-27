"""GC-6 — the ChemStation .D reader (v181) inside the shipped analysis SDK.

Stdlib-only by design (spec D1 / stop boundary B4): ``pyproject.toml`` declares
zero runtime deps and the production interpreter at dispatch time may be
``/usr/bin/python3`` for revisions without a provisioned-venv engine. A numeric
array library is FASTER but forbidden HERE (it may appear in entry scripts
only, never in this module) — the sequential loop is milliseconds at corpus
scale, exactly as the GC-1 decoders ran it.

Decode authority: the canonical GC-1 decoder D CODE
(``.hermes/plans/scripts/gc1-decD.py``, lines 21-50), NOT the GC-1 report's
prose — which is abbreviated and wrong on three points (the spec [G1] ERRATA,
accepted by orchestrator ruling OQ3):

  * slots are BIG-endian signed int16 (the prose says "little-endian");
  * t0/t_end raw f32 values are ticks, NOT minutes — all three promoted
    decoders divide by 60000;
  * the body accumulators are UNBOUNDED Python ints (no int16 wrap).

A "simplified variant" accumulator (e.g. ``(b2 + slot) & 0xFFFF``) reproduces
n/max on some files but corrupts RES4 tails and mis-decodes RES5/KERRY entirely
(the composer proved this live against the corpus). The loop below is decD's
exact loop; do not "clean it up".

Metadata (SAMPLE.XML / RUN.LOG) is strict UTF-16 (BOM ``FF FE`` on real
files): decode failure is a NAMED error (``METADATA_DECODE_FAILED``), never a
silent loss — no error-swallowing decode mode anywhere (spec bait #3).
Unrecognized RUN.LOG lines survive verbatim with ``parsed: None`` (lossless
clause).

Failure codes (spec §Failure table X1-X11) are STRING codes inside the
exception message — no new TS error tokens, no schema vocabulary (B6).
"""
from __future__ import annotations

import re
import struct
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Identity (D2/D4)
# ---------------------------------------------------------------------------
READER_NAME = "computable_lab_d_reader"
READER_VERSION = "1.0.0"

CH_FORMAT_LABEL = "agilent-chemstation-ch-v181"

# Failure codes (one per class; each appears verbatim in the exception message)
CH_UNSUPPORTED_VERSION = "CH_UNSUPPORTED_VERSION"
CH_TRUNCATED = "CH_TRUNCATED"
CH_AXIS_INVALID = "CH_AXIS_INVALID"
CH_NO_POINTS = "CH_NO_POINTS"
METADATA_DECODE_FAILED = "METADATA_DECODE_FAILED"
METADATA_XML_INVALID = "METADATA_XML_INVALID"


class ReaderError(Exception):
    """Base reader failure. ``code`` is one of the CH_*/METADATA_* string codes."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


# ---------------------------------------------------------------------------
# v181 header constants (GC-1 [G1:33]; offsets into the 6144-byte header)
# ---------------------------------------------------------------------------
_HEADER_SIZE = 6144
_PAGE_OFFSET = 264          # u32BE page → body offset = (page - 1) * 512
_MARKER_POS = 326           # must be 3
_MARKER_TEXT = b"1\x008\x00"  # @327..331 — UTF-16 "18"
_T0_OFFSET = 282            # f32BE ticks (minutes * 60000)
_T_END_OFFSET = 286         # f32BE ticks
_INTERCEPT_OFFSET = 4724    # f64BE
_SCALE_OFFSET = 4732        # f64BE
_MIN_BODY_BYTES = _INTERCEPT_OFFSET + 16  # header fields alone
_TIME_DIVISOR = 60000.0     # ticks → minutes (ERRATA: the raw f32 is NOT minutes)
_ESCAPE_SENTINEL = 32767    # i16 max — the 4-slot absolute escape marker
_U32 = 4294967296           # 2**32


def _is_ch_marker(data: bytes) -> bool:
    """Cheap v181 marker probe (D3.1 seam check — a slice, no full parse)."""
    return len(data) > 331 and data[326] == 3 and data[327:331] == _MARKER_TEXT


def _linspace(t0: float, t_end: float, n: int) -> List[float]:
    """Linear axis over n points, decoder A endpoint convention (decD :47):
    ``axis[-1] == t_end`` EXACTLY — computed as t0 + i*dt with dt =
    (t_end - t0)/(n-1), then the endpoint PINNED to t_end (the decD
    ``np.linspace`` convention forces y[-1] = stop; ``t0 + (n-1)*dt`` alone
    is off by ~1 ulp for ~1.5% of header tick pairs — the adversarial review
    l1t0320 defect 2 pinned this). Do NOT switch to a recomputation that
    leaves the endpoint short (spec bait #6)."""
    if n == 1:
        return [t0]
    dt = (t_end - t0) / (n - 1)
    axis = [t0 + i * dt for i in range(n)]
    axis[-1] = t_end  # endpoint pinning (np.linspace): exact, not t0+(n-1)*dt
    return axis


def read_ch_bytes(data: bytes, *, source: Optional[str] = None) -> Dict[str, Any]:
    """Decode a v181 .CH byte stream into a signal dict.

    Returns ``{"axis", "values", "channel", "axis_units", "value_units",
    "meta"}`` where meta carries reader identity/version, format label,
    n_points, escape_count, escape_tag_nonzero, the header block, and source.
    Raises ReaderError with a NAMED code on every corrupt/truncated case
    (X1-X5); messages name the input and the byte offset where applicable.
    """
    src = source or "<bytes>"
    # X1 — size: the header fields alone must exist, and the body must reach
    # past the header-page offset the header itself claims.
    if len(data) < _MIN_BODY_BYTES:
        raise ReaderError(
            CH_TRUNCATED,
            f"{src}: file is {len(data)} bytes; a v181 .CH needs at least "
            f"{_MIN_BODY_BYTES} bytes (header fields end at {_SCALE_OFFSET + 8})",
        )
    page = struct.unpack_from(">I", data, _PAGE_OFFSET)[0]
    offset = (page - 1) * 512
    # X1 — page must host a body: page >= 1 (hence offset >= 0) AND the body
    # must fit in the file. A page of 0 yields a NEGATIVE offset that a raw
    # struct.unpack_from would surface as struct.error — a named failure, not
    # a library error (adversarial review l1t0320 defect 3).
    if offset < 0 or offset > len(data):
        raise ReaderError(
            CH_TRUNCATED,
            f"{src}: header page={page} places the body at byte offset {offset} "
            f"but the file is only {len(data)} bytes"
            + (" (page must be >= 1 — a page of 0 cannot host a body)" if offset < 0 else ""),
        )
    # (offset == len(data) is a legal EMPTY body — it surfaces as CH_NO_POINTS
    # after the loop, per the X5 row of the failure table.)
    # X2 — version marker (the honest boundary; unknowns stay UNKNOWN, B3).
    if data[_MARKER_POS] != 3 or data[_MARKER_POS + 1:_MARKER_POS + 5] != _MARKER_TEXT:
        observed = data[_MARKER_POS:_MARKER_POS + 5].hex()
        raise ReaderError(
            CH_UNSUPPORTED_VERSION,
            f"{src}: not a v181 .CH — version marker at byte {_MARKER_POS} is "
            f"0x{observed}, expected 0x03 + b'1\\x008\\x00' (UTF-16 '18'); "
            f"no speculative layout guessing (stop boundary B3)",
        )
    # Header times + scaling (ticks → minutes via /60000; ERRATA fold).
    t0 = struct.unpack_from(">f", data, _T0_OFFSET)[0] / _TIME_DIVISOR
    t_end = struct.unpack_from(">f", data, _T_END_OFFSET)[0] / _TIME_DIVISOR
    intercept, scale = struct.unpack_from(">dd", data, _INTERCEPT_OFFSET)
    # X4 — axis validity.
    if not (t0 == t0 and t_end == t_end) or t0 <= 0 or t_end <= 0 or t_end < t0:
        raise ReaderError(
            CH_AXIS_INVALID,
            f"{src}: invalid time axis — t0={t0!r} min, t_end={t_end!r} min "
            f"(raw f32 ticks at {_T0_OFFSET}/{_T_END_OFFSET} divided by {_TIME_DIVISOR:.0f}); "
            f"need finite t0 > 0 and t_end >= t0",
        )

    # Body: BIG-endian signed int16 slots (">h").
    body_len = len(data) - offset
    # X3 — an ODD body length means a dangling trailing byte: the spec lists
    # it as CH_TRUNCATED, and silently dropping the byte (or a whole slot)
    # would mis-decode the tail (adversarial review l1t0320 defect 4).
    if body_len % 2:
        raise ReaderError(
            CH_TRUNCATED,
            f"{src}: body has odd length {body_len} bytes — dangling byte at "
            f"offset {offset + body_len - 1} (slots are 2 bytes each; a "
            f"truncated trailing slot is corruption, not data)",
        )
    n_slots = body_len // 2
    slots = struct.unpack_from(f">{n_slots}h", data, offset)

    # THE canonical decD loop (gc1-decD.py:30-46) — unbounded Python ints,
    # NO int16 wrap; 4-slot escapes consume 4 slots for one point.
    raw: List[int] = []
    escape_count = 0
    escape_tag_nonzero = 0
    b1 = 0
    b2 = 0
    i = 0
    while i < n_slots:
        s = slots[i]
        if s == _ESCAPE_SENTINEL:
            if i + 3 >= n_slots:
                raise ReaderError(
                    CH_TRUNCATED,
                    f"{src}: body ends mid-escape at byte offset {offset + 2 * i} — "
                    f"escape sentinel (32767) has only {n_slots - i - 1} trailing slot(s), "
                    f"needs 3 more (tag + 2 payload slots)",
                )
            tag = slots[i + 1]
            lo = struct.unpack_from(">I", struct.pack(">hh", slots[i + 2], slots[i + 3]), 0)[0]
            b1 = 0
            b2 = slots[i + 1] * _U32 + lo
            raw.append(b2)
            escape_count += 1
            if tag != 0:
                escape_tag_nonzero += 1
            i += 4
        else:
            b1 += s
            b2 += b1
            raw.append(b2)
            i += 1

    n = len(raw)
    # Structural invariant (decD :46) — mandatory (spec bait #1).
    if n != n_slots - 3 * escape_count:
        raise ReaderError(
            CH_TRUNCATED,
            f"{src}: point count mismatch — decoded {n} points from {n_slots} slots "
            f"with {escape_count} escapes; expected {n_slots - 3 * escape_count}",
        )
    # X5 — explicit, not an empty success.
    if n == 0:
        raise ReaderError(
            CH_NO_POINTS,
            f"{src}: body decodes to zero points ({n_slots} slots, {escape_count} escapes) — "
            f"an empty signal is a named failure, not a success",
        )

    axis = _linspace(t0, t_end, n)
    values = [r * scale + intercept for r in raw]
    channel = _channel_identity(source)
    return {
        "axis": axis,
        "values": values,
        "channel": channel,
        "axis_units": "min",
        "value_units": "pA",
        "meta": {
            "reader": {"name": READER_NAME, "version": READER_VERSION},
            "format": CH_FORMAT_LABEL,
            "n_points": n,
            "escape_count": escape_count,
            "escape_tag_nonzero": escape_tag_nonzero,
            "header": {
                "page": page,
                "body_offset": offset,
                "t0": t0,
                "t_end": t_end,
                "dt": (t_end - t0) / (n - 1) if n > 1 else 0.0,
                "scale": scale,
                "intercept": intercept,
            },
            "source": source,
        },
    }


def _channel_identity(source: Optional[str]) -> Optional[str]:
    """Channel identity = the .CH file stem when the source names a .CH file;
    None otherwise — NEVER invented (D6; multi-channel neutrality, GC-4 D9)."""
    if not source:
        return None
    stem = Path(source).stem
    return stem or None


# ---------------------------------------------------------------------------
# Strict UTF-16 metadata decoding (X6)
# ---------------------------------------------------------------------------
def _strict_utf16(data: bytes, what: str) -> str:
    """Strict UTF-16 decode. Real files carry the FF FE BOM (``decode('utf-16')``
    consumes it); a BOM-less file falls back to explicit utf-16-le. ANY decode
    error (odd length, lone surrogate) is METADATA_DECODE_FAILED — never a
    silent loss (no error-swallowing decode modes; spec bait #3)."""
    try:
        if data[:2] == b"\xff\xfe":
            return data.decode("utf-16")
        return data.decode("utf-16-le")
    except (UnicodeDecodeError, UnicodeError) as e:
        raise ReaderError(METADATA_DECODE_FAILED, f"{what}: strict UTF-16 decode failed — {e}") from e


_KNOWN_SAMPLE_FIELDS = ("Name", "Amount", "Multiplier", "Dilution", "Version", "Description")


def decode_sample_xml(data: bytes, *, source: Optional[str] = None) -> Dict[str, Any]:
    """Decode SAMPLE.XML (UTF-16LE+BOM) into structured fields, LOSSLESS:
    known fields are pinned, ANY other element lands in ``extras``, and
    ``raw_text`` keeps the exact decoded string (provenance retained)."""
    what = source or "SAMPLE.XML"
    text = _strict_utf16(data, what)
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise ReaderError(METADATA_XML_INVALID, f"{what}: not well-formed XML — {e}") from e
    if root.tag != "Sample":
        raise ReaderError(
            METADATA_XML_INVALID,
            f"{what}: root element is <{root.tag}>, expected <Sample>",
        )

    out: Dict[str, Any] = {}
    extras: Dict[str, Any] = {}
    isstds: List[Dict[str, str]] = []
    target_masses: List[str] = []
    for el in root:
        tag = el.tag
        if tag in _KNOWN_SAMPLE_FIELDS:
            out[tag.lower()] = el.text or ""
        elif tag == "ISTDs":
            for std in el:
                isstds.append({"num": std.get("Num", ""), "value": std.text or ""})
        elif tag == "TargetMasses":
            # Self-closed empties are a REAL shape ([F-fixture]); child masses
            # would be captured here if present — handle, don't guess more.
            for m in el:
                target_masses.append(m.text or "")
        else:
            extras[tag] = el.text or ""
    out["isstds"] = isstds
    out["target_masses"] = target_masses
    out["extras"] = extras
    out["raw_text"] = text
    out["source"] = source
    return out


# ---------------------------------------------------------------------------
# RUN.LOG (X8/X9 honesty: unrecognized lines survive, recognized ones parse)
# ---------------------------------------------------------------------------
# The two-column ChemStation shape GC-1 verified on the real corpus
# ([F-fixture]): category, whitespace-padded message, HH:MM:SS, MM/DD/YY.
_RUN_LOG_RE = re.compile(r"^(\S.*?)\s{2,}(.+?)\s+(\d{2}:\d{2}:\d{2})\s+(\d{2}/\d{2}/\d{2})$")


def decode_run_log(data: bytes, *, source: Optional[str] = None) -> Dict[str, Any]:
    """Decode RUN.LOG (UTF-16LE+BOM) line-by-line. EVERY line survives:
    recognized lines get ``parsed`` {category,message,time,date}; everything
    else (hex event-code lines and anything vendor-undocumented) keeps
    ``parsed: None`` with ``raw`` verbatim — the lossless clause."""
    what = source or "RUN.LOG"
    text = _strict_utf16(data, what)
    lines: List[Dict[str, Any]] = []
    recognized = 0
    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        m = _RUN_LOG_RE.match(raw_line)
        parsed: Optional[Dict[str, str]] = None
        if m:
            parsed = {
                "category": m.group(1),
                "message": m.group(2),
                "time": m.group(3),
                "date": m.group(4),
            }
            recognized += 1
        lines.append({"line_no": line_no, "raw": raw_line, "parsed": parsed})
    total = len(lines)
    return {
        "lines": lines,
        "recognized_count": recognized,
        "unrecognized_count": total - recognized,
        "source": source,
    }


# ---------------------------------------------------------------------------
# attach() — the package-level convenience entry scripts call (D2/D3/D4)
# ---------------------------------------------------------------------------
def _handle_bytes(handle, source: str):
    """Return ``(role, data, read_err)`` for one input (adversarial review
    l1t0320 defects 1 + 6).

    A readable (file-backed) handle: ``(role, data, None)`` where role is the
    content classification — or a ``ReaderError`` (``METADATA_DECODE_FAILED``)
    is RAISED when the bytes are metadata-shaped but not valid strict UTF-16
    (defect 1 — never swallowed into opaque).

    A handle with NO readable file — the runner's inline artifact/table shape
    (``path: <inputDir>/<name>.inline`` with the file never written; or no
    path and no inline bytes) — ``file_bytes()`` raises FileNotFoundError /
    RuntimeError. The reader must not crash with a NON-READER error on any
    such revision: return ``("no_file", None, the_cause)`` so attach() logs
    it via the method-asset opaque path and decodes only file-backed
    handles.
    """
    try:
        data = handle.file_bytes()
    except (FileNotFoundError, RuntimeError, OSError) as e:
        return "no_file", None, e
    role = _classify(data, source)
    return role, data, None


def _leading_text_is_metadata_shaped(data: bytes, err: UnicodeError) -> bool:
    """Decide raise-vs-opaque for a BOM-prefixed input whose STRICT UTF-16
    decode failed (cycle-2 adversarial-review defect 1 — the cycle-1 arm
    keyed on the BOM alone, so a genuinely BINARY asset that merely begins
    with FF FE — the spec's SINGLE.B-shaped opaque member — aborted the run
    instead of the X10 opaque skip).

    "Metadata-shaped" means the leading content is 7-bit-ASCII metadata
    TEXT (the corpus shapes: BOM + ``<?xml``… / ``<Sample>`` / ASCII RUN.LOG
    lines — spec D3.3: only BOM+xml is sample_metadata, BOM-decodable text
    is run_log; everything else is opaque / X10). Two content-based checks,
    either one suffices — decided from BYTES, never the input name, and
    never via a lossy decode mode (bait #3: this prefix analysis only ever
    CLASSIFIES raise-vs-opaque; the artifact-producing decode downstream is
    still the full strict ``decode_sample_xml``/``decode_run_log``):

    (a) the strict UTF-16LE prefix up to the decode failure decodes and its
        first character is 7-bit ASCII — the UTF-16-encoded metadata head
        (e.g. a torn ``FF FE 3C 00 3F 00`` ``<?xml`` file);
    (b) the raw leading bytes (after the BOM, up to the failure) are all
        7-bit ASCII — the torn RAW-ASCII metadata head (e.g. the
        adversarial probe D1a shape ``FF FE`` + 7 ASCII bytes: odd length,
        strict UTF-16 decode fails on truncated data, but the head is
        unambiguously ASCII text, not binary).

    On any prefix decode error the answer is NO (opaque) — a file whose
    first content bytes are not cleanly decodable (lone surrogate at the
    head, raw high bytes, …) is opaque content, never a failure. A prefix
    decode of a slice of the same stream cannot succeed where the full
    strict decode proves the file corrupt: the bytes ARE corrupt metadata —
    the named X6 failure — or the input is opaque.
    """
    start = getattr(err, "start", None)
    if not isinstance(start, int) or start <= 2:
        # No content position (or no position at all — a non-decode
        # UnicodeError): nothing after the BOM to be metadata-shaped.
        return False
    content = data[2:]
    fail = start - 2
    if fail % 2:
        fail -= 1  # the prefix must be an even number of UTF-16 bytes
    pre = content[:fail]
    if not pre:
        return False
    try:
        text = pre.decode("utf-16-le")
    except UnicodeError:
        text = ""
    if text and ord(text[0]) < 0x80:
        return True
    return all(b < 0x80 for b in pre)


def _classify(data: bytes, source: str) -> str:
    """Classify one input's BYTES by content (D3.3 fallback — pure sniff,
    never requires meta): v181 CH marker → signal_channel; BOM+xml →
    sample_metadata; BOM-decodable UTF-16 text that is not XML → run_log;
    else opaque. The role strings are the GC-4 acquisition-package vocabulary
    (referenced by name, not redefined — bait #11).

    A BOM-prefixed input whose bytes are NOT valid strict UTF-16 is CORRUPT
    METADATA only when it is metadata-shaped — its leading content is
    7-bit-ASCII metadata text (``_leading_text_is_metadata_shaped``):
    ``decode_sample_xml`` / ``decode_run_log`` would raise
    METADATA_DECODE_FAILED (spec X6) — the SAME strict decode is re-run here
    so the named code surfaces through attach() instead of the run
    "succeeding" with an opaque-skip log and no metadata (adversarial review
    l1t0320 defect 1, MAJOR). A BOM-prefixed input whose leading bytes are
    NOT metadata text (genuine binary that happens to start with
    FF FE — the spec's ``SINGLE.B`` opaque member) is OPAQUE, never a
    failure (cycle-2 review defect 1 — the BOM arm must not over-broaden).
    """
    if _is_ch_marker(data):
        return "signal_channel"
    if data[:2] == b"\xff\xfe":
        try:
            text = data.decode("utf-16")
        except (UnicodeDecodeError, UnicodeError) as e:
            # Strict UTF-16 decode of the WHOLE file failed. Only
            # metadata-shaped bytes (7-bit-ASCII metadata head) are corrupt
            # metadata — a NAMED failure, never opaque; anything else is an
            # unknown BOM-prefixed binary → opaque (X10).
            if _leading_text_is_metadata_shaped(data, e):
                # The message names the input (spec X6).
                raise ReaderError(
                    METADATA_DECODE_FAILED,
                    f"{source}: strict UTF-16 decode failed — {e} "
                    f"(metadata-shaped BOM-prefixed input with invalid "
                    f"UTF-16 bytes: truncated or corrupt metadata)",
                ) from e
            return "opaque"
        stripped = text.lstrip("\ufeff").lstrip()
        if stripped.startswith("<?xml") or stripped.startswith("<"):
            # XML-shaped: distinguish sample metadata from any other XML by
            # the <Sample> root (the corpus shape); non-Sample XML stays opaque.
            head = stripped[:200]
            if "<Sample" in head:
                return "sample_metadata"
            return "opaque"
        return "run_log"
    return "opaque"


def attach(ctx) -> Dict[str, Dict[str, Any]]:
    """Decode every classified ctx input; set the manifest ``reader`` block
    (D4); return ``{input_name: decoded_dict}``.

    - signal_channel → ``read_ch_bytes`` (channel identity from
      ``meta.sourcePath`` stem when available, else the handle name, else None);
    - sample_metadata → ``decode_sample_xml``;
    - run_log → ``decode_run_log`` (+ a warning log when a non-empty file has
      ZERO recognized lines — X8: reported, never a failure);
    - method_asset / opaque → SKIPPED with a named ``ctx.log`` line (GC-1(e):
      referenceable-but-opaque — never silently dropped, never parsed).

    Escape-tag audit (X9 / GC-1 [G1:99]): when a decoded signal carries
    escapes with slot1 != 0, a WARNING log line reports the count — the KERRY
    distribution question stays OPEN and REPORTED per run; never a failure,
    never silent.
    """
    decoded: Dict[str, Dict[str, Any]] = {}
    # D3.2 — the PUBLIC input_names() seam (the diff added it FOR this; the
    # private _inputs attribute is not a contract the reader may depend on —
    # adversarial review l1t0320 defect 5).
    for name in ctx.input_names():
        handle = ctx.input(name)
        meta_source = handle.meta.get("sourcePath") if isinstance(handle.meta, dict) else None
        # DECODED artifacts pin source = meta.sourcePath / handle name (spec
        # D7) — NEVER the absolute mount path: a per-run input directory
        # would make the stored artifact differ run-to-run for identical
        # inputs (cycle-2 adversarial-review defect 2 — the D6 fix leaked
        # handle.path into the decoders; the signal branch at :473 was
        # already correct). ``source`` below is the LOG-LINE identity only:
        # for a no_file inline input it names <name>.inline via handle.path.
        source = meta_source or (handle.path or handle.name)
        # Defect 6 — only FILE-BACKED handles are decoded. Non-file inputs
        # (the runner's inline shape: path <inputDir>/<name>.inline with no
        # file written, or no path and no inline bytes) take the method-asset
        # opaque path: named log line, never a crash with a non-reader error.
        role, data, read_err = _handle_bytes(handle, source)
        # The DECODED source (spec D7 pin): meta.sourcePath or the handle
        # name — deterministic across runs, never a mount path.
        decoded_source = meta_source or handle.name
        if role == "no_file":
            ctx.log(
                f"d_reader: {name} ({source}) → opaque: no readable file "
                f"(non-file/inline input — {type(read_err).__name__}: {read_err}); "
                f"skipped as opaque (referenceable via its data-reference, "
                f"never parsed — GC-1(e))",
                level="info",
                code="D_READER_OPAQUE",
            )
            continue
        if role == "signal_channel":
            out = read_ch_bytes(data, source=meta_source or handle.name)
            # Channel identity precedence (D3.3): meta.sourcePath stem →
            # handle name → None. Never invented.
            if meta_source:
                out["channel"] = Path(meta_source).stem or None
            elif handle.name:
                out["channel"] = handle.name
            else:
                out["channel"] = None
            decoded[name] = out
            ctx.log(
                f"d_reader: {name} ({source}) → {role}: {out['meta']['n_points']} points, "
                f"{out['meta']['escape_count']} escapes, "
                f"max {max(out['values']):.4f} pA @ {out['axis'][out['values'].index(max(out['values']))]:.4f} min",
                level="info",
                code="D_READER_SIGNAL",
            )
            # X9 — the escape-tag audit demand (GC-1 [G1:99]).
            tag_nz = out["meta"]["escape_tag_nonzero"]
            if tag_nz > 0:
                ctx.log(
                    f"d_reader: {name}: {tag_nz} escape slot(s) carry tag≠0 — "
                    f"reported per the GC-1 audit demand; the tag distribution "
                    f"stays open (KERRY-style escapes are neither absorbed nor rejected)",
                    level="warning",
                    code="D_READER_ESCAPE_TAG",
                )
        elif role == "sample_metadata":
            out = decode_sample_xml(data, source=decoded_source)
            decoded[name] = out
            ctx.log(
                f"d_reader: {name} → {role}: sample '{out['name']}' "
                f"(isstds={len(out['isstds'])}, extras={list(out['extras']) or 'none'})",
                level="info",
                code="D_READER_SAMPLE",
            )
        elif role == "run_log":
            out = decode_run_log(data, source=decoded_source)
            decoded[name] = out
            ctx.log(
                f"d_reader: {name} → {role}: {len(out['lines'])} lines, "
                f"{out['recognized_count']} recognized, {out['unrecognized_count']} preserved verbatim",
                level="info",
                code="D_READER_RUNLOG",
            )
            if out["lines"] and out["recognized_count"] == 0:
                # X8 — NOT a failure (vendor-undocumented beyond GC-1's shapes);
                # the full lines[] is returned and a warning is logged.
                ctx.log(
                    f"d_reader: {name}: zero recognized lines in a non-empty RUN.LOG — "
                    f"all {len(out['lines'])} lines preserved verbatim (recognized shapes "
                    f"are only those GC-1 verified)",
                    level="warning",
                    code="D_READER_RUNLOG_UNRECOGNIZED",
                )
        else:
            # method_asset / opaque — skipped AS OPAQUE with a named log line
            # (GC-1(e): referenceable via their DREFs, never parsed). The log
            # names the SOURCE (meta.sourcePath when the runner supplied it,
            # else the input name) — never silently dropped.
            ctx.log(
                f"d_reader: {name} ({source}) → {role}: skipped as opaque "
                f"(referenceable via its data-reference, never parsed — GC-1(e))",
                level="info",
                code="D_READER_OPAQUE",
            )

    # D4 — reader identity + version into the run manifest (flows into the
    # stored outputManifest with zero TS change; GC-5 folds it into
    # engineProvenance.packages later). Set on the manifest object itself.
    import computable_lab_analysis as _sdk
    reader_block = {
        "name": READER_NAME,
        "version": READER_VERSION,
        "sdk_version": _sdk.__version__,
    }
    manifest = ctx.manifest()
    manifest.reader = reader_block
    return decoded
