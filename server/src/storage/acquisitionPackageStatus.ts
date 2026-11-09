/**
 * FAME-1 — acquisition-status classification: the GENERIC extractor.
 *
 * Declarative boundary (reviewer bait #4, THE adversarial check): THIS FILE
 * CONTAINS ZERO STATUS REGEXES AND ZERO status literals-with-meaning. The
 * interpretation — which RUN.LOG lines mean which of
 * completed|aborted|stopped-by-user|unknown — lives ONLY in the data file
 * config/gc-acquisition-status/log-patterns.yaml (the
 * config/sequence-analysis loader precedent, sequenceRuntime.ts:15:
 * readFile of a config-declared pattern file, parsed generically). This
 * module only:
 *   1. loads the declared rule file (id/version/fallbackStatus/rules),
 *   2. strict-UTF-16-decodes the run_log member (mirroring
 *      d_reader._strict_utf16: FF FE BOM consumed by the utf-16 family,
 *      BOM-less falls back to explicit utf-16-le; ANY decode failure is an
 *      honest failure — recorded, never a crash, never a silent fallback),
 *   3. applies the rules IN FILE ORDER (precedence = file order, which is
 *      data, not a coded severity branch): the first rule that matches ANY
 *      line determines the status; every matched line is preserved VERBATIM
 *      (the d_reader lossless doctrine — matched lines are never rewritten
 *      nor dropped),
 *   4. returns the evidence object (the interpretation source, the decode
 *      facts, the matched lines, and — only when nothing matched — the named
 *      no-evidence reason).
 *
 * UNKNOWN IS THE FLOOR (bait #5): no run_log member, an unreadable member,
 * a decode failure, or zero rule hits all land on the DECLARED
 * fallbackStatus — never a coded completed default, and never a
 * registration failure (RUN.LOG is not a REQUIRED_MEMBERS member,
 * acquisitionPackage.ts:69).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/**
 * The acquisition-package stamp the registration flow writes onto the package
 * payload BEFORE the record is created (FAME-1). The ruleset identity (id /
 * version / sourceFile) is present ONLY when the rule file is readable — the
 * degenerate rule-file-missing arm reports an ABSENCE-SHAPED (empty) ruleset
 * (D5), so every ruleset member is optional here.
 */
export interface AcqpPackageStatusStamp {
  acquisitionStatus: string;
  /**
   * FAME-1 (D3): the DECLARED run-sheet qualification for this status (the
   * rule file's `statusQualification` lookup — DATA, not code). Stamped
   * conditionally on the payload (exactOptionalPropertyTypes); the chrome
   * renders this flag, never a hardcoded status-literal branch.
   */
  acquisitionStatusQualified?: boolean;
  acquisitionStatusEvidence: {
    ruleset: { id?: string; version?: string | number; sourceFile?: string };
    sourceMember: { relativePath: string };
    decode: { encoding: string; bomPresent: boolean };
    matched: Array<{ line: string; ruleId: string; lineIndex: number }>;
    noEvidenceReason?: string;
  };
}

/** The rule file's home (config/gc-acquisition-status, orch OQ-3 ratified). */
const PATTERN_FILE = 'log-patterns.yaml';
const PATTERN_SOURCE_LABEL = `config/gc-acquisition-status/${PATTERN_FILE}`;

export interface LogRule {
  id: string;
  status: string;
  pattern: string;
  note?: string;
}

/**
 * FAME-1 (D3): one declared per-status RUN-SHEET display qualification from
 * the rule file's `statusQualification` list — DATA, not code. Which
 * statuses render visibly qualified on the run sheet is declared here (the
 * rule file knows every status it can emit); the chrome renders the flag,
 * never a hardcoded status-literal branch.
 */
export interface StatusQualification {
  status: string;
  qualified: boolean;
  note?: string;
}

export interface LogPatterns {
  id: string;
  version: string | number;
  fallbackStatus: string;
  rules: LogRule[];
  /**
   * FAME-1 (D3): the declared per-status run-sheet qualification. Present in
   * the rule file; parsed generically (no status literals in code — the
   * lookup by status string is data-driven). Absent on a rule file that
   * predates D3 (defensive: an unlisted status is NOT qualified).
   */
  statusQualification?: StatusQualification[];
}

export interface AcqpMatch {
  /** The matched line VERBATIM (the exact decoded line — no trimming). */
  line: string;
  /** The declared rule id that matched. */
  ruleId: string;
  /** The 0-based index of the line within the decoded text. */
  lineIndex: number;
}

export interface AcqpStatusEvidence {
  status: string;
  ruleset: { id: string; version: string | number; sourceFile: string };
  sourceMember: { relativePath: string };
  decode: { encoding: string; bomPresent: boolean };
  matched: AcqpMatch[];
  /** Present ONLY when matched is empty — the named no-evidence reason. */
  noEvidenceReason?: string;
}

/**
 * Load the data-declared rule file (generic read + parse — the file is DATA;
 * no rule content is interpreted here). The first rule-file load is cached
 * for the process lifetime: the file is git-tracked config, not a
 * mutable device artifact, and a registration batch must not re-read +
 * re-compile per package. (tsx --watch does NOT hot-reload YAML — the lane
 * stack must be restarted after a rule-file edit; the cache makes that
 * explicit rather than half-true.)
 */
/**
 * The item's FIXED floor word for the DEGENERATE rule-file-missing arm ONLY
 * (bait #4/#5): when the rule file itself is unreadable there is no declared
 * fallback value to honor, so the status lands on this word — never a coded
 * `completed` default. (D5) this is the floor WORD only; it does NOT restate
 * the rule file's declared identity (id/version/sourceFile) — those belong to
 * the unread file, so the degenerate arm's ruleset is ABSENCE-SHAPED (empty).
 */
const FLOOR_STATUS = 'unknown';

let patternsCache: LogPatterns | null = null;
export async function loadLogPatterns(patternFileUrl?: URL | string): Promise<LogPatterns> {
  // The process-lifetime cache serves the CANONICAL rule file only. An
  // explicit override (a test seam — the degenerate rule-file-missing arm,
  // D4) always re-reads; resetLogPatternsCache clears the canonical cache.
  if (patternsCache && patternFileUrl === undefined) return patternsCache;
  const resolvedPath = patternFileUrl
    ? patternFileUrl instanceof URL
      ? fileURLToPath(patternFileUrl)
      : patternFileUrl
    : fileURLToPath(new URL(`../../../config/gc-acquisition-status/${PATTERN_FILE}`, import.meta.url));
  const text = await readFile(resolvedPath, 'utf8');
  const doc = parse(text) as {
    ruleset?: { id?: unknown; version?: unknown };
    fallbackStatus?: unknown;
    rules?: Array<{ id?: unknown; status?: unknown; pattern?: unknown; note?: unknown }>;
    statusQualification?: Array<{ status?: unknown; qualified?: unknown; note?: unknown }>;
  };
  const ruleset = doc.ruleset ?? {};
  const { id: setId, version: setVersion } = ruleset as { id?: unknown; version?: unknown };
  if (
    typeof setId !== 'string' ||
    setVersion === undefined ||
    (typeof setVersion !== 'string' && typeof setVersion !== 'number')
  ) {
    throw new Error(`acquisition-status rule file is malformed: missing ruleset.id/version (${PATTERN_SOURCE_LABEL})`);
  }
  if (typeof doc.fallbackStatus !== 'string') {
    throw new Error(`acquisition-status rule file is malformed: missing fallbackStatus (${PATTERN_SOURCE_LABEL})`);
  }
  const rules: LogRule[] = (Array.isArray(doc.rules) ? doc.rules : []).map((r) => {
    if (typeof r.id !== 'string' || typeof r.status !== 'string' || typeof r.pattern !== 'string') {
      throw new Error(`acquisition-status rule file is malformed: a rule needs string id/status/pattern (${PATTERN_SOURCE_LABEL})`);
    }
    return {
      id: r.id,
      status: r.status,
      pattern: r.pattern,
      ...(typeof r.note === 'string' ? { note: r.note } : {}),
    };
  });
  // FAME-1 (D3): the declared per-status run-sheet qualification (DATA).
  // Parsed generically — a malformed entry (non-string status or non-boolean
  // qualified) is a load-time error, so a bad qualification can never
  // silently render as quiet/qualified the wrong way.
  let statusQualification: StatusQualification[] | undefined;
  if (doc.statusQualification !== undefined) {
    if (!Array.isArray(doc.statusQualification)) {
      throw new Error(`acquisition-status rule file is malformed: statusQualification must be an array (${PATTERN_SOURCE_LABEL})`);
    }
    statusQualification = doc.statusQualification.map((q) => {
      if (typeof q.status !== 'string' || typeof q.qualified !== 'boolean') {
        throw new Error(`acquisition-status rule file is malformed: a statusQualification entry needs string status + boolean qualified (${PATTERN_SOURCE_LABEL})`);
      }
      return {
        status: q.status,
        qualified: q.qualified,
        ...(typeof q.note === 'string' ? { note: q.note } : {}),
      };
    });
  }
  const p: LogPatterns = {
    id: setId,
    version: setVersion,
    fallbackStatus: doc.fallbackStatus,
    rules,
    ...(statusQualification !== undefined ? { statusQualification } : {}),
  };
  // (FAME-1 FIX3, cycle-3 DEFECT 2) The cache serves the CANONICAL file only
  // (the contract stated above and in the D4 doc). An explicit override (the
  // test seam) re-reads and MUST NOT write the canonical cache: writing it
  // left the process-wide cache holding the OVERRIDE's ruleset, so every
  // later canonical caller in the same module instance mis-classified
  // (order-dependent; --sequence.shuffle RED). Production always passes the
  // canonical file (patternFileUrl undefined), so this changes nothing there.
  if (patternFileUrl === undefined) patternsCache = p;
  return p;
}

/** Test seam: clear the process-lifetime rule-file cache. */
export function resetLogPatternsCache(): void {
  patternsCache = null;
}

/**
 * FAME-1 (D3): the DECLARED run-sheet qualification for one classified
 * status — a pure data lookup over the rule file's `statusQualification`
 * list (DATA, not code). NO status literals in this function: the lookup is
 * by the status STRING the data already produced. An unlisted status is NOT
 * qualified (the safe default: a status the rule file does not declare as
 * visibly-qualified renders a quiet word — never a fabricated warning).
 */
export function declaredStatusQualified(
  patterns: LogPatterns,
  status: string,
): boolean {
  const entry = patterns.statusQualification?.find((q) => q.status === status);
  return entry?.qualified === true;
}

/**
 * Strict UTF-16 decode (mirrors d_reader._strict_utf16, d_reader.py:266-274):
 * FF FE BOM -> the utf-16 family (the BOM is consumed, LE endianness for
 * these instrument logs); BOM-less -> explicit utf-16-le. ANY decode error
 * (odd byte count, lone surrogate) is an honest failure: the DECODE FACTS
 * are still recorded (bait #7: facts recorded, not discarded on failure) and
 * the status lands on the declared fallback.
 */
function strictUtf16(bytes: Uint8Array): {
  text: string;
  encoding: string;
  bomPresent: boolean;
  ok: boolean;
} {
  const bomPresent = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const encoding = 'utf-16le';
  // fatal:true mirrors the python doctrine EXACTLY (d_reader raises
  // METADATA_DECODE_FAILED on any UnicodeDecodeError): Node's non-fatal
  // TextDecoder silently substitutes U+FFFD for odd byte counts and lone
  // surrogates — a silent loss the X6 doctrine forbids. fatal makes both
  // throw, so decode failure -> honest fallback with the facts preserved.
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    return { text, encoding, bomPresent, ok: true };
  } catch {
    return { text: '', encoding, bomPresent, ok: false };
  }
}

/**
 * Classify one run_log member's bytes against the declared rules.
 *
 * `memberBytes` is the full member content (the caller read it via the
 * storage provider — this module does no I/O of its own beyond the rule
 * file); `relativePath` is the member's package-relative path (e.g.
 * "RUN.LOG").
 *
 * Contract (D7 — corrected from the prior false "never throws" claim):
 * this floors the DECODE / MATCH paths (decode failure, empty log, zero rule
 * hits -> an honest-evidence classification on the declared fallbackStatus,
 * never a throw — bait #5/#7), but it THROWS on the two data-source failures
 * it cannot honestly re-label on its own: `loadLogPatterns()` (a missing /
 * malformed rule file) and `new RegExp(pattern)` (a malformed declared
 * pattern). Those propagate to the FLOOR-GUARANTEED entry point
 * (classifyAcquisitionPackageStatus), whose floor ladder distinguishes
 * 'rule-file-unreadable' from 'member-unreadable' and never lets registration
 * fail. A direct caller of THIS function must treat a thrown load/compile
 * failure as the rule-file-missing arm, not a member fault.
 *
 * `patternFileUrl` is an OPTIONAL TEST SEAM (mirrors the entry point): it is
 * forwarded to loadLogPatterns so a test can point the extractor at a missing
 * / malformed rule file and observe the documented load-failure throw.
 * Production callers omit it (the canonical file is used).
 */
export async function classifyAcquisitionStatus(
  memberBytes: Uint8Array,
  relativePath: string,
  patternFileUrl?: URL | string,
): Promise<AcqpStatusEvidence> {
  const patterns = await loadLogPatterns(patternFileUrl);
  const ruleset = { id: patterns.id, version: patterns.version, sourceFile: PATTERN_SOURCE_LABEL };
  const decode = strictUtf16(memberBytes);
  const base: Omit<AcqpStatusEvidence, 'matched' | 'noEvidenceReason'> = {
    status: patterns.fallbackStatus,
    ruleset,
    sourceMember: { relativePath },
    decode: { encoding: decode.encoding, bomPresent: decode.bomPresent },
  };
  if (!decode.ok) {
    return { ...base, matched: [], noEvidenceReason: 'decode-failed' };
  }
  const lines = decode.text.split(/\r\n|\r|\n/);
  if (lines.length === 0 || lines.every((l) => l === '')) {
    return { ...base, matched: [], noEvidenceReason: 'log-empty' };
  }
  const compiled = patterns.rules.map((r) => ({ rule: r, re: new RegExp(r.pattern) }));
  const matched: AcqpMatch[] = [];
  // PRECEDENCE = RULE-FILE ORDER (bait #4/#6): the status is the status of
  // the FIRST rule (in declared file order) that matches ANY line — never a
  // line-order or coded-severity branch. Every line is still recorded once,
  // against the first rule (in file order) it satisfies, verbatim (bait #7).
  let status: string | undefined;
  for (const { rule, re } of compiled) {
    if (status === undefined) {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const candidate = lines[lineIndex];
        if (candidate !== undefined && re.test(candidate)) {
          status = rule.status;
          break;
        }
      }
    }
    lines.forEach((line, lineIndex) => {
      if (re.test(line)) matched.push({ line, ruleId: rule.id, lineIndex });
    });
  }
  if (status === undefined) {
    return { ...base, matched: [], noEvidenceReason: 'no-rule-match' };
  }
  return {
    ...base,
    status,
    matched,
  };
}

/**
 * FAME-1 (D6): the registration read+classify ENTRY POINT — moved out of
 * acquisitionPackage.ts so the registration file keeps the classification
 * call + payload stamp ONLY (spec scope). Reads the package's run_log member
 * through the SAME storage provider the DREF acquire path uses
 * (provider.read — the acquisition.ts:100 / verifyAcquisitionPackage
 * re-hash idiom) and classifies it; returns the stamp fields the caller
 * writes onto the package payload BEFORE the record is created.
 *
 * UNKNOWN IS THE FLOOR, and this NEVER fails registration (bait #5): no
 * run_log member, an unreadable member, a decode failure, or zero rule hits
 * land on the DECLARED fallbackStatus (config/gc-acquisition-status/
 * log-patterns.yaml — the data file) with a NAMED noEvidenceReason, never on
 * a coded `completed` default and never on a thrown error. The ONE exception
 * is the degenerate rule-file-missing arm, where there is no declared
 * fallback value to read — that arm lands on the Coded FLOOR_STATUS
 * ('unknown', :135), which the rule file cannot itself name. RUN.LOG is not
 * a REQUIRED_MEMBERS member, so a missing/unreadable log is data, not a
 * fault.
 *
 * (D4) the rule-file load has its OWN try scope and its OWN named reason
 * ('rule-file-unreadable', encoding 'none'): a missing/malformed rule file
 * must NOT be recorded as the RUN.LOG member being unreadable (the member was
 * never read and no decode ran). 'member-unreadable' is reserved for
 * provider.read / stream failures. (FIX2 D3) a declared-pattern COMPILE
 * failure (the member read and decoded fine) has its OWN named reason
 * ('pattern-invalid', the successful decode's facts) — it is never folded
 * into 'member-unreadable'.
 *
 * (D5) the degenerate rule-file-missing arm reports an ABSENCE-SHAPED ruleset
 * — `ruleset: {}` (NO coordinates at all, :383): with the rule file unread
 * there is no declared interpretation source to name, so the code does not
 * restate the YAML's identity (no coded copy of declared data — the no-
 * evidence reason names the unread rule file).
 *
 * (D7) this is FLOOR-GUARANTEED end to end: the floor ladder belongs in this
 * module, so a direct caller gets the declared floor (or the coded
 * FLOOR_STATUS in the degenerate arm) on every failure path — including
 * rule-file load and pattern-compile failure — never a throw.
 * The registration caller therefore needs no catch of its own.
 */
export async function classifyAcquisitionPackageStatus(
  provider: { read(path: string): Promise<NodeJS.ReadableStream> },
  directoryKey: string,
  runLog: { relativePath: string } | undefined,
  patternFileUrl?: URL | string,
): Promise<AcqpPackageStatusStamp> {
  // The DEGENERATE arm only: the rule file itself could not be read, so there
  // is no declared fallback value to honor. FLOOR_STATUS is the item's fixed
  // floor word (bait #4/#5) — never a coded `completed` default.
  const degenerateFloor = (
    noEvidenceReason: string,
    sourceRelativePath: string,
  ): AcqpPackageStatusStamp => ({
    acquisitionStatus: FLOOR_STATUS,
    acquisitionStatusEvidence: {
      // Absence-shaped (D5): the rule file is unread, so there is no declared
      // interpretation source to name — the ruleset is EMPTY (no id, version,
      // or sourceFile restated from the YAML). The noEvidenceReason is the
      // named truth about why.
      ruleset: {},
      sourceMember: { relativePath: sourceRelativePath },
      decode: { encoding: 'none', bomPresent: false },
      matched: [],
      noEvidenceReason,
    },
  });

  // (D4) the rule-file load gets its OWN try scope and its OWN named reason.
  // A missing / malformed rule file must be recorded as 'rule-file-unreadable'
  // — NOT 'member-unreadable' (the member was never read, no decode ran). The
  // `patternFileUrl` arg is a TEST SEAM (D6 testability): production always
  // passes the canonical file; a test points it at an unreadable path to
  // exercise the degenerate arm in isolation.
  let patterns: LogPatterns;
  try {
    patterns = await loadLogPatterns(patternFileUrl);
  } catch (err) {
    return degenerateFloor(
      `rule-file-unreadable: ${err instanceof Error ? err.message : String(err)}`,
      runLog?.relativePath ?? '',
    );
  }

  try {
    // No run_log member declared in the package -> the declared floor, reason
    // named (bait #5: registration still succeeds).
    if (runLog === undefined) {
      return {
        acquisitionStatus: patterns.fallbackStatus,
        // (D3) the DECLARED qualification for the floor status (data lookup).
        acquisitionStatusQualified: declaredStatusQualified(patterns, patterns.fallbackStatus),
        acquisitionStatusEvidence: {
          ruleset: { id: patterns.id, version: patterns.version, sourceFile: PATTERN_SOURCE_LABEL },
          sourceMember: { relativePath: '' },
          decode: { encoding: 'none', bomPresent: false },
          matched: [],
          noEvidenceReason: 'run-log-member-absent',
        },
      };
    }
    const stream = await provider.read(`${directoryKey}/${runLog.relativePath}`);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
    const memberBytes = Buffer.concat(chunks);
    // (FIX2 D3) the member's decode facts, run HERE for the pattern-invalid
    // arm: the same strict-UTF-16 decode classifyAcquisitionStatus runs
    // internally (pure + deterministic — identical facts), so a compile
    // fault records the SUCCESSFUL decode's facts, never a decode-fault
    // label.
    const memberDecode = strictUtf16(memberBytes);
    let evidence: AcqpStatusEvidence;
    try {
      // (FIX2 D3) classifyAcquisitionStatus compiles the declared patterns
      // (bait #4: the compile is the PATTERN's step, not the member's).
      // (FAME-1 FIX3, cycle-3 DEFECT 2) the TEST SEAM is threaded through to
      // the extractor: an explicit override re-reads the SAME file end to end
      // (the seam contract — "an explicit override always re-reads"), so the
      // pattern-invalid arm is reachable deterministically from the override
      // itself. Pre-fix the arm was reached only because the override's load
      // POISONED the process-wide canonical cache and the (seam-less) inner
      // call read the bad pattern FROM THE CACHE — the very side effect this
      // fix removes. Production callers omit the seam (canonical file, both
      // levels), so this changes nothing there.
      evidence = await classifyAcquisitionStatus(
        memberBytes,
        runLog.relativePath,
        patternFileUrl,
      );
    } catch (err) {
      // (FIX2 D3) a declared-pattern COMPILE failure (new RegExp throws on a
      // malformed declared pattern). The rule file WAS read (the load try
      // above) and the member WAS read and decoded (the bytes are in hand) —
      // so the named reason points at the PATTERN: never 'member-unreadable'
      // (a false decode-fault label for a member that read fine) and never
      // 'rule-file-unreadable' (the file read fine). A load failure cannot
      // reach this arm: the entry point's own load try above would have
      // floored it first.
      return {
        acquisitionStatus: patterns.fallbackStatus,
        // (D3) the DECLARED qualification for the floor status (data lookup).
        acquisitionStatusQualified: declaredStatusQualified(patterns, patterns.fallbackStatus),
        acquisitionStatusEvidence: {
          ruleset: { id: patterns.id, version: patterns.version, sourceFile: PATTERN_SOURCE_LABEL },
          sourceMember: { relativePath: runLog.relativePath },
          // The decode ran and succeeded (the member read fine) — its
          // FACTS, not the decode-fault word 'unreadable' (bait #7).
          decode: { encoding: memberDecode.encoding, bomPresent: memberDecode.bomPresent },
          matched: [],
          noEvidenceReason: `pattern-invalid: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
    return {
      acquisitionStatus: evidence.status,
      // (D3) the DECLARED qualification for this classified status (data
      // lookup over the rule file's statusQualification — not a code branch).
      acquisitionStatusQualified: declaredStatusQualified(patterns, evidence.status),
      acquisitionStatusEvidence: {
        ruleset: evidence.ruleset,
        sourceMember: evidence.sourceMember,
        decode: evidence.decode,
        matched: evidence.matched,
        ...(evidence.noEvidenceReason !== undefined
          ? { noEvidenceReason: evidence.noEvidenceReason }
          : {}),
      },
    };
  } catch (err) {
    // (FIX2 D3) the pattern-invalid arm above caught the compile fault; the
    // ONLY failure remaining in this scope is the member READ (provider.read
    // / stream) — the DECLARED fallback applies and the reason names the
    // member failure (bait #7: facts preserved, never discarded).
    return {
      acquisitionStatus: patterns.fallbackStatus,
      // (D3) the DECLARED qualification for the floor status (data lookup).
      acquisitionStatusQualified: declaredStatusQualified(patterns, patterns.fallbackStatus),
      acquisitionStatusEvidence: {
        ruleset: { id: patterns.id, version: patterns.version, sourceFile: PATTERN_SOURCE_LABEL },
        sourceMember: { relativePath: runLog?.relativePath ?? '' },
        decode: { encoding: 'unreadable', bomPresent: false },
        matched: [],
        noEvidenceReason: `member-unreadable: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}
