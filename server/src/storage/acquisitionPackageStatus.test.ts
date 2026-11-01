/**
 * FAME-1: acquisition-status classification — the RUN.LOG reader (strict
 * UTF-16) + the data-declared rule file (config/gc-acquisition-status/
 * log-patterns.yaml). RED-first per the spec's "First targeted check":
 * this file is authored BEFORE the module exists (expected RED: module
 * missing), and the fixture bytes are built in-test via the utf16leBom
 * idiom (analysisDReader.test.ts:106-129) — NEVER vendored real bytes
 * (the no-bytes invariant: acquisitionPackage.test.ts pins tmp-tree byte
 * hygiene).
 *
 * Hardcode boundary (reviewer bait #4): the lines below are copied
 * VERBATIM from the real corpus (the receipts + the composer's on-device
 * verification): WEGMANS 20201023 (aborted), COUNTRYSIDE 20201023
 * (completed), KERRYGOLD 20201023 (stopped-by-user). They are TEST
 * FIXTURES only; every status pattern lives ONLY in the pattern file.
 */
import { describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  classifyAcquisitionStatus,
  classifyAcquisitionPackageStatus,
  declaredStatusQualified,
  loadLogPatterns,
  resetLogPatternsCache,
} from './acquisitionPackageStatus.js';

/** The analysisDReader.test.ts:106-129 idiom: real UTF-16LE+BOM bytes. */
function utf16leBom(text: string): Buffer {
  const enc = Buffer.from(text, 'utf16le');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), enc]);
}

// The WEGMANS 20201023 tail — verbatim corpus lines (receipts
// 20261031T191154Z report.md:69-72; notes.md:178-183). The log carries
// BOTH a "Method/Sequence stopped" line AND "Method aborted": the aborted
// rule must land FIRST (precedence = pattern-file order, bait #6).
const WEGMANS_LOG = [
  'Method       Method started                                 12:41:55 10/23/26',
  'Method       Instrument running sample Vial 101 (front)     12:41:56 10/23/26',
  '6890       1 I/O error with 6890 GC                         13:19:32 10/23/26',
  '6890       1 Closing signal 1 due to I/O error              13:19:33 10/23/26',
  'Method       Instrument Error - Method/Sequence stopped     13:19:33 10/23/26',
  'Method       Method aborted                                 13:19:33 10/23/26',
].join('\r\n');

// COUNTRYSIDE 20201023 tail — verbatim (composer on-device verification).
// It carries BOTH "Instrument run completed" AND "Method completed" — the
// completed rule keys on the Method line, never the bare "completed".
const COUNTRYSIDE_LOG = [
  'Method       Method started                                 14:57:04 10/23/26',
  'Method       Instrument running sample Vial 101 (front)     14:57:05 10/23/26',
  'Method       Instrument run completed                       15:24:33 10/23/26',
  'Method       Method completed                               15:24:43 10/23/26',
].join('\r\n');

// KERRYGOLD 20201023 tail — verbatim. It ALSO carries "Instrument run
// completed" (the run finished, the sequence was stopped by the user):
// stopped-by-user must win over a bare "run completed" reading (bait #6).
const KERRYGOLD_LOG = [
  'Method       Method started                                 13:49:06 10/23/26',
  'Method       Instrument running sample Vial 101 (front)     13:49:07 10/23/26',
  'Method       Instrument run completed                       14:16:18 10/23/26',
  'Method       Method stopped by user                         14:16:27 10/23/26',
].join('\r\n');

// The lane1-gate-fixtures shape (verified with file(1): PLAIN ASCII, e.g.
// L1GATE-95dc64.D/RUN.LOG). A naive utf-16 decode of this yields mojibake,
// NOT a crash; every rule is a no-hit -> the declared fallback (unknown).
const ASCII_LOG = 'L1-SIGNALDREF gate fixture 95dc64\r\nsynthetic run log\r\n';

describe('loadLogPatterns (the data-declared rule file)', () => {
  it('loads config/gc-acquisition-status/log-patterns.yaml with the four declared statuses', async () => {
    const p = await loadLogPatterns();
    expect(p.id).toBeTruthy();
    expect(p.version).toBeTruthy();
    expect(p.fallbackStatus).toBe('unknown'); // DECLARED, not coded (bait #4)
    expect(p.rules.length).toBeGreaterThan(0);
    const statuses = new Set(p.rules.map((r) => r.status));
    expect(statuses.has('aborted')).toBe(true);
    expect(statuses.has('stopped-by-user')).toBe(true);
    expect(statuses.has('completed')).toBe(true);
    for (const r of p.rules) {
      expect(r.pattern).toBeTruthy();
      expect(r.note).toBeTruthy();
    }
  });
});

describe('classifyAcquisitionStatus (strict-UTF-16 RUN.LOG -> evidence DATA)', () => {
  it('WEGMANS lines (BOM + CRLF) -> aborted; the matched line is verbatim', async () => {
    const res = await classifyAcquisitionStatus(utf16leBom(WEGMANS_LOG), 'RUN.LOG');
    expect(res.status).toBe('aborted');
    expect(res.ruleset.id).toBeTruthy();
    expect(typeof res.ruleset.version === 'string' || typeof res.ruleset.version === 'number').toBe(true);
    expect(typeof res.ruleset.sourceFile).toBe('string');
    expect(res.sourceMember).toEqual({ relativePath: 'RUN.LOG' });
    expect(res.decode).toEqual({ encoding: 'utf-16le', bomPresent: true });
    expect(res.matched.length).toBeGreaterThanOrEqual(1);
    const abortedHit = res.matched.find((m) => m.ruleId === 'aborted-method-aborted');
    expect(abortedHit).toBeDefined();
    expect(abortedHit!.line).toBe(
      'Method       Method aborted                                 13:19:33 10/23/26',
    );
    expect(abortedHit!.lineIndex).toBe(5); // 0-based index within the decoded text
  });

  it('the I/O-error line corroborates the abort (declared corroborating rule)', async () => {
    const res = await classifyAcquisitionStatus(utf16leBom(WEGMANS_LOG), 'RUN.LOG');
    const ioHit = res.matched.find((m) => m.ruleId === 'aborted-io-error');
    expect(ioHit).toBeDefined();
    expect(ioHit!.line).toBe(
      '6890       1 I/O error with 6890 GC                         13:19:32 10/23/26',
    );
  });

  it('COUNTRYSIDE lines -> completed (the "Method completed" line, verbatim)', async () => {
    const res = await classifyAcquisitionStatus(utf16leBom(COUNTRYSIDE_LOG), 'RUN.LOG');
    expect(res.status).toBe('completed');
    expect(res.matched.some((m) => m.ruleId === 'completed-method-completed')).toBe(true);
    expect(res.matched.find((m) => m.ruleId === 'completed-method-completed')!.line).toBe(
      'Method       Method completed                               15:24:43 10/23/26',
    );
    expect(res.noEvidenceReason).toBeUndefined();
  });

  it('KERRYGOLD lines -> stopped-by-user, NOT completed (precedence: the user-stop rule precedes the completed rule)', async () => {
    const res = await classifyAcquisitionStatus(utf16leBom(KERRYGOLD_LOG), 'RUN.LOG');
    expect(res.status).toBe('stopped-by-user');
    expect(res.matched.some((m) => m.ruleId === 'stopped-by-user-method-stopped-by-user')).toBe(true);
  });

  it('a BOM-less UTF-16LE log still decodes (the d_reader fallback path)', async () => {
    const res = await classifyAcquisitionStatus(
      Buffer.from(COUNTRYSIDE_LOG, 'utf16le'),
      'RUN.LOG',
    );
    expect(res.status).toBe('completed');
    expect(res.decode).toEqual({ encoding: 'utf-16le', bomPresent: false });
  });

  it('the ASCII gate-fixture log -> unknown (mojibake never decodes into a rule hit; never completed)', async () => {
    const res = await classifyAcquisitionStatus(Buffer.from(ASCII_LOG, 'ascii'), 'RUN.LOG');
    expect(res.status).toBe('unknown');
    expect(res.matched).toEqual([]);
    expect(res.noEvidenceReason).toBe('no-rule-match');
  });

  it('an empty log -> unknown with the named no-evidence reason', async () => {
    const res = await classifyAcquisitionStatus(Buffer.alloc(0), 'RUN.LOG');
    expect(res.status).toBe('unknown');
    expect(res.matched).toEqual([]);
    expect(res.noEvidenceReason).toBe('log-empty');
  });

  it('an undecodable byte stream (odd length) -> unknown with the decode-failure reason, decode facts preserved', async () => {
    const full = utf16leBom(COUNTRYSIDE_LOG);
    const truncated = full.subarray(0, full.length - 1); // odd byte count
    const res = await classifyAcquisitionStatus(truncated, 'RUN.LOG');
    expect(res.status).toBe('unknown');
    expect(res.matched).toEqual([]);
    expect(res.noEvidenceReason).toBe('decode-failed');
    expect(res.decode.bomPresent).toBe(true); // facts recorded, not discarded (bait #7)
  });
});

describe('FAME-1 fix-run (D3/D4/D5/D7): entry point, declared qualification, distinct floors', () => {
  /** A minimal read provider returning one chunk of bytes for the member. */
  const readProvider = (bytes: Buffer) => ({
    read: async (_path: string) => Readable.from([bytes]),
  });

  it('D3: the rule file DECLARES a per-status run-sheet qualification (data, not code)', async () => {
    const p = await loadLogPatterns();
    expect(p.statusQualification).toBeDefined();
    expect(p.statusQualification!.length).toBeGreaterThanOrEqual(4);
    // The declared policy: aborted/stopped-by-user/unknown are visibly
    // qualified; completed is not. This is DATA the chrome renders.
    expect(declaredStatusQualified(p, 'aborted')).toBe(true);
    expect(declaredStatusQualified(p, 'stopped-by-user')).toBe(true);
    expect(declaredStatusQualified(p, 'unknown')).toBe(true);
    expect(declaredStatusQualified(p, 'completed')).toBe(false);
    // An UNLISTED status is NOT qualified (the safe default — never a
    // fabricated warning).
    expect(declaredStatusQualified(p, 'not-a-declared-status')).toBe(false);
  });

  it('D3: the entry point stamps the DECLARED qualification onto the payload (no TSX branch)', async () => {
    // A completed log -> qualified=false (declared).
    const completed = await classifyAcquisitionPackageStatus(
      readProvider(utf16leBom(COUNTRYSIDE_LOG)),
      'machine1/X.D',
      { relativePath: 'RUN.LOG' },
    );
    expect(completed.acquisitionStatus).toBe('completed');
    expect(completed.acquisitionStatusQualified).toBe(false);
    // An aborted log -> qualified=true (declared).
    const aborted = await classifyAcquisitionPackageStatus(
      readProvider(utf16leBom(WEGMANS_LOG)),
      'machine1/Y.D',
      { relativePath: 'RUN.LOG' },
    );
    expect(aborted.acquisitionStatus).toBe('aborted');
    expect(aborted.acquisitionStatusQualified).toBe(true);
  });

  it('D4: a missing rule file is recorded as rule-file-unreadable (NOT member-unreadable)', async () => {
    // The run_log member IS readable (a valid completed log); ONLY the rule
    // file is missing. The degenerate arm must name the RULE FILE as the
    // fault — never falsely claim the (readable) member was unreadable.
    const res = await classifyAcquisitionPackageStatus(
      readProvider(utf16leBom(COUNTRYSIDE_LOG)),
      'machine1/Z.D',
      { relativePath: 'RUN.LOG' },
      '/nonexistent-fame1-fix/rule-file.yaml',
    );
    expect(res.acquisitionStatus).toBe('unknown'); // the fixed floor word
    expect(res.acquisitionStatusEvidence.noEvidenceReason).toMatch(/^rule-file-unreadable:/);
    // The member was never read -> the decode facts say 'none', not
    // 'unreadable' (the prior defect recorded a false decode fact).
    expect(res.acquisitionStatusEvidence.decode.encoding).toBe('none');
    expect(res.acquisitionStatusEvidence.matched).toEqual([]);
  });

  it('D5: the degenerate arm reports an ABSENCE-SHAPED ruleset (no restated identity)', async () => {
    const res = await classifyAcquisitionPackageStatus(
      readProvider(utf16leBom(COUNTRYSIDE_LOG)),
      'machine1/Z.D',
      { relativePath: 'RUN.LOG' },
      '/nonexistent-fame1-fix/rule-file.yaml',
    );
    // The rule file is unread, so there is NO declared interpretation source
    // to name: the ruleset is EMPTY (id/version/sourceFile all absent) — the
    // code must not restate the YAML's identity (D5: no coded copy of data).
    expect(res.acquisitionStatusEvidence.ruleset).toEqual({});
    expect(res.acquisitionStatusEvidence.ruleset.id).toBeUndefined();
    expect(res.acquisitionStatusEvidence.ruleset.version).toBeUndefined();
    expect(res.acquisitionStatusEvidence.ruleset.sourceFile).toBeUndefined();
  });

  it('D4: an unreadable MEMBER with a readable rule file is member-unreadable (the two arms are distinct)', async () => {
    // The rule file IS readable (canonical); the member read THROWS. This must
    // be the member-unreadable arm (declared fallback, full ruleset), NOT the
    // degenerate rule-file arm.
    const throwingProvider = {
      read: async (_path: string) => {
        throw new Error('ENOENT: synthetic unreadable member');
      },
    };
    const res = await classifyAcquisitionPackageStatus(
      throwingProvider,
      'machine1/W.D',
      { relativePath: 'RUN.LOG' },
    );
    expect(res.acquisitionStatus).toBe('unknown'); // the DECLARED fallback
    expect(res.acquisitionStatusEvidence.noEvidenceReason).toMatch(/^member-unreadable:/);
    expect(res.acquisitionStatusEvidence.decode.encoding).toBe('unreadable');
    // The rule file was readable -> its declared identity IS present (contrast
    // with the D5 absence-shaped degenerate arm).
    expect(res.acquisitionStatusEvidence.ruleset.id).toBeTruthy();
    expect(res.acquisitionStatusEvidence.ruleset.sourceFile).toBeTruthy();
  });

  it('FIX2 D3: a MALFORMED DECLARED PATTERN (RegExp compile failure) is pattern-invalid, NOT member-unreadable (the member read and decoded fine)', async () => {
    // The rule file IS readable (the patternFileUrl seam) and the member IS
    // read and decoded (a valid completed log) — the ONLY fault is the
    // declared pattern failing to compile (new RegExp throws). The prior
    // label 'member-unreadable' + decode encoding 'unreadable' was a false
    // fact of the D4 class (the member was read; no decode failure ran).
    // The compile fault gets its OWN named reason (pattern-invalid) and the
    // decode facts come from the SUCCESSFUL decode (bait #7: facts
    // preserved, never mis-recorded).
    const badPatternRuleFile = [
      'ruleset:',
      '  id: gc-acquisition-status-bad-pattern',
      '  version: 99',
      'fallbackStatus: unknown',
      'rules:',
      '  - id: bad-pattern',
      '    status: aborted',
      '    pattern: "(unclosed"',
      '    note: a deliberately invalid regex (compile failure)',
    ].join('\n');
    // The seam is an ABSOLUTE FILE PATH (loadLogPatterns resolves a
    // non-URL string directly — fileURLToPath is file:-scheme only, so a
    // data: URL would hit the load-failure arm, not the compile arm).
    // (FAME-1 FIX3, cycle-3 DEFECT 2) The fixture lives under os.tmpdir(),
    // NOT process.cwd() (inside server/): a crash between write and finally
    // must never leave an untracked YAML in the worktree.
    const badPatternFile = join(tmpdir(), `fame1-fix3-bad-pattern-${Date.now()}-${process.pid}.yaml`);
    writeFileSync(badPatternFile, badPatternRuleFile, 'utf8');
    try {
      const res = await classifyAcquisitionPackageStatus(
        readProvider(utf16leBom(COUNTRYSIDE_LOG)),
        'machine1/P.D',
        { relativePath: 'RUN.LOG' },
        badPatternFile,
      );
      expect(res.acquisitionStatus).toBe('unknown'); // the DECLARED fallback
      // THE FIX: a named pattern fault — never the member-unreadable label.
      expect(res.acquisitionStatusEvidence.noEvidenceReason).toMatch(/^pattern-invalid:/);
      expect(res.acquisitionStatusEvidence.noEvidenceReason).not.toMatch(/^member-unreadable:/);
      // The member WAS read and decoded: the decode facts are the SUCCESSFUL
      // decode's facts (utf-16le + BOM), NOT 'unreadable' (a decode-fault
      // word).
      expect(res.acquisitionStatusEvidence.decode).toEqual({ encoding: 'utf-16le', bomPresent: true });
      // The rule file WAS readable -> its declared identity IS present.
      expect(res.acquisitionStatusEvidence.ruleset.id).toBe('gc-acquisition-status-bad-pattern');
      expect(res.acquisitionStatusEvidence.matched).toEqual([]);
    } finally {
      rmSync(badPatternFile, { force: true });
      // (FAME-1 FIX3, cycle-3 DEFECT 2) Hermetic: this test is the FIRST to
      // successfully load a patternFileUrl OVERRIDE. The seam's override load
      // must not poison the process-wide canonical patterns cache (FIX3 makes
      // the seam not write the cache on an override), but this finally ALSO
      // resets it so the test is order-independent even if that seam regresses
      // — every later canonical caller sees the canonical file. The reset is
      // idempotent (clearing an already-null cache is a no-op) and does not
      // affect the other tests, which never load an override.
      resetLogPatternsCache();
    }
  });

  it('D7: classifyAcquisitionStatus THROWS when the rule file cannot be loaded (the load/compile escape is documented)', async () => {
    // The low-level extractor does NOT floor the data-source failures — it
    // propagates them to the FLOOR-GUARANTEED entry point (which distinguishes
    // rule-file-unreadable from member-unreadable). A direct caller sees a
    // throw, matching the corrected contract (not the prior false
    // "never throws" claim). Point the extractor at a MISSING rule file (the
    // test seam) and observe the load-failure throw.
    await expect(
      classifyAcquisitionStatus(
        utf16leBom(COUNTRYSIDE_LOG),
        'RUN.LOG',
        '/nonexistent-fame1-fix/rule-file.yaml',
      ),
    ).rejects.toThrow();
  });
});
