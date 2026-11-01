/**
 * trunk-journeys — FIXTURES (pure).
 *
 * The real .D acquisition tree + the v181 .CH signal bytes, built in TS. The
 * .CH builder is a VERBATIM mirror of the GC-7 proven builder
 * (server/src/analysis/analysisGcIntegration.test.ts buildSyntheticCh) — the
 * exact byte layout the shipped reader (d_reader.read_ch_bytes) decodes: a
 * v181 header + the canonical decD inverse loop (BE int16 slots, one 4-slot
 * zero-tag escape). N points of a real 2-Gaussian signal over 5 min, so the
 * runner's decode + peak-integration + the rendered chromatogram are REAL, not
 * fabricated.
 *
 * No domain truth invented: the .D member file NAMES are the GC-1 canonical
 * inventory (server/src/storage/acquisitionPackage.test.ts writeFullDotD) and
 * FID1A.CH is the role-resolved signal channel (acquisitionPackage.ts D10
 * default map). The non-signal members carry dummy bytes (they are
 * register-required members, never decoded by the runner). The knowledge-
 * layer records the seed mints (seed.ts) carry ONLY real, verified ontology
 * refs (the claim triple) — provenance actors are record refs, never ontology
 * CURIEs, and no external CURIE is mislabeled (adversarial gate D8).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Build a v181 .CH byte stream (GC-7 doctrine, verbatim). */
export function buildSyntheticCh(
  n: number,
  opts: { escIndex?: number } = {},
): { bytes: Buffer; t0: number; tEnd: number; scale: number } {
  const escIndex = opts.escIndex ?? 10;
  const SCALE = 1.302083401242271e-4; // corpus scale (GC-1 [G1:45/AS-3])
  const T0_TICKS = 3000.0; // f32-exact -> t0 = 0.05 min
  const T_END_TICKS = 300_000.0; // f32-exact -> t_end = 5.0 min
  // Two real Gaussian peaks so peak-integration finds peaks + the trace is
  // non-flat (a flat line would be a valid-but-honest blank — we want a REAL
  // visible chromatogram: non-blank AND structured).
  const P1 = { rt: 1.0, width: 0.1, rawAmp: 20_000 };
  const P2 = { rt: 3.0, width: 0.15, rawAmp: 12_000 };
  const DT = (T_END_TICKS / 60_000 - T0_TICKS / 60_000) / (n - 1);

  const rawAt = (i: number): number => {
    const t = T0_TICKS / 60_000 + i * DT;
    const g1 = P1.rawAmp * Math.exp(-0.5 * ((t - P1.rt) / P1.width) ** 2);
    const g2 = P2.rawAmp * Math.exp(-0.5 * ((t - P2.rt) / P2.width) ** 2);
    return Math.round(10_000 + g1 + g2);
  };

  const header = new Uint8Array(6144);
  const dv = new DataView(header.buffer);
  dv.setUint32(264, 13, false); // page -> body offset (13-1)*512 = 6144
  header[326] = 3;
  header.set([0x31, 0x00, 0x38, 0x00], 327); // UTF-16 "18" marker
  dv.setFloat32(282, T0_TICKS, false);
  dv.setFloat32(286, T_END_TICKS, false);
  dv.setFloat64(4724, 0.0, false); // intercept
  dv.setFloat64(4732, SCALE, false); // scale

  const nSlots = n + 3; // one 4-slot escape replaces one 1-slot point
  const body = new Uint8Array(nSlots * 2);
  const bdv = new DataView(body.buffer);
  let prevB1 = 0;
  let prevRaw = 0;
  let si = 0;
  for (let i = 0; i < n; i++) {
    const raw = rawAt(i);
    if (i === escIndex) {
      const level = raw;
      bdv.setInt16(si++ * 2, 32767, false); // sentinel
      bdv.setInt16(si++ * 2, 0, false); // tag (zero-tag escape)
      bdv.setInt16(si++ * 2, (level >>> 16) & 0xffff, false); // hi16 (0)
      bdv.setInt16(si++ * 2, level & 0xffff, false); // lo16
      prevB1 = 0;
      prevRaw = level;
    } else {
      const b1 = raw - prevRaw;
      const s = b1 - prevB1;
      if (s < -32768 || s > 32767) throw new Error(`slot ${s} at i=${i} does not fit int16`);
      bdv.setInt16(si++ * 2, s, false);
      prevB1 = b1;
      prevRaw = raw;
    }
  }
  const t0 = dv.getFloat32(282, false) / 60_000.0;
  const tEnd = dv.getFloat32(286, false) / 60_000.0;
  return { bytes: Buffer.concat([Buffer.from(header), Buffer.from(body)]), t0, tEnd, scale: SCALE };
}

/** The GC-1 canonical .D member inventory (dummy bytes except FID1A.CH). */
const MEMBER_DUMMY: Array<[string, string]> = [
  ['SAMPLE.XML', '<sample><id>trunk-journeys synthetic</id></sample>\n'],
  ['RUN.LOG', 'synthetic run log\n'],
  ['SAMPLE.MAC.bak', 'mac backup\n'],
  ['ACQ.M/ACQ.TXT', 'ACQ synthetic\nMETHOD_NAME=TRUNK-JOURNEYS\nVERSION=1\n'],
  ['ACQ.M/INFO.MTH', 'info member\n'],
  ['DA.M/INFO.MTH', 'da member\n'],
  ['ACQRES.REG', 'register file\n'],
  ['SINGLE.B', 'single byte file\n'],
];

/**
 * Write a REAL .D acquisition tree under <mountRoot>/<subdir>/<dirName>.
 * FID1A.CH carries the actual v181 .CH bytes (the runner's signal input);
 * the other members are the register-required canonical inventory with dummy
 * bytes (never decoded by the runner). Returns the absolute .D dir path.
 */
export async function writeDotDTree(
  mountRoot: string,
  subdir: string,
  dirName: string,
  chBytes: Buffer,
  marker: string,
): Promise<string> {
  const dir = join(mountRoot, subdir, dirName);
  const files: Array<[string, string | Buffer]> = [
    ['FID1A.CH', chBytes],
    ...MEMBER_DUMMY.map(([rel, content]) => [rel, content] as [string, string | Buffer]),
  ];
  for (const [rel, content] of files) {
    const abs = join(dir, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    const payload = typeof content === 'string' && content.length < 4096 ? `${marker}\n${content}` : content;
    await writeFile(abs, payload);
  }
  return dir;
}
