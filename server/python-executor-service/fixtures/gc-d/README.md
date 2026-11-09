# gc-d — synthetic ChemStation v181 .D fixture generator (GC-6)

`make_d_fixture.py` generates a SMALL SYNTHETIC `.D` tree at test time (never
committed bytes — the only files in git are this generator + this README; the
precedent is `../gc-area/`). NO real NAS bytes in git (spec B5); the real-NAS
proof lives in the lane-only read-only smoke script
`.hermes/plans/scripts/gc6-nas-smoke.sh` (T4).

- `encode_ch(...)` builds a v181-shaped `.CH`: 6144 B header (marker `b[326]==3`
  + `b"1\x008\x00"` @327, page u32BE@264, raw f32 ticks @282/286 — the reader
  divides by 60000 for minutes, f64 scale/intercept @4724/4732) + a body
  ENCODER that is the exact inverse of the canonical GC-1 decoder D loop
  (`.hermes/plans/scripts/gc1-decD.py`): BIG-endian int16 slots, unbounded
  Python-int accumulators (`b1 += slot; b2 += b1; raw = b2`), 4-slot escapes
  on slot == 32767 (`b1 = 0; b2 = tag*2**32 + u32BE(slots[2..3])`).
- `write_d_tree(root, name, raw_levels, escapes)` writes the full synthetic
  tree `{name}.D/{FID1A.CH, SAMPLE.XML, RUN.LOG, SAMPLE.MAC.bak, ACQ.M/INFO.MTH,
  ACQRES.REG}`; metadata are real UTF-16LE+BOM files mirroring the corpus shapes
  (`<ISTD Num="1">`, self-closed `<TargetMasses />`, hex event-code log lines).

Consumers: `tests/test_d_reader.py` (unit, stdlib-only) and
`server/src/analysis/analysisDReader.test.ts` (its TS mirror `buildSyntheticCh`
must stay the exact same byte layout — the reader is byte-level, the test
parses the persisted output, not the bytes).
