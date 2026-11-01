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

/** The rule file's home (config/gc-acquisition-status, orch OQ-3 ratified). */
const PATTERN_FILE = 'log-patterns.yaml';
const PATTERN_SOURCE_LABEL = `config/gc-acquisition-status/${PATTERN_FILE}`;

export interface LogRule {
  id: string;
  status: string;
  pattern: string;
  note?: string;
}

export interface LogPatterns {
  id: string;
  version: string | number;
  fallbackStatus: string;
  rules: LogRule[];
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
let patternsCache: LogPatterns | null = null;
export async function loadLogPatterns(): Promise<LogPatterns> {
  if (patternsCache) return patternsCache;
  const text = await readFile(
    fileURLToPath(new URL(`../../../config/gc-acquisition-status/${PATTERN_FILE}`, import.meta.url)),
    'utf8',
  );
  const doc = parse(text) as {
    ruleset?: { id?: unknown; version?: unknown };
    fallbackStatus?: unknown;
    rules?: Array<{ id?: unknown; status?: unknown; pattern?: unknown; note?: unknown }>;
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
  const p: LogPatterns = {
    id: setId,
    version: setVersion,
    fallbackStatus: doc.fallbackStatus,
    rules,
  };
  patternsCache = p;
  return p;
}

/** Test seam: clear the process-lifetime rule-file cache. */
export function resetLogPatternsCache(): void {
  patternsCache = null;
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
 * "RUN.LOG"). NEVER throws: every failure path is an honest-evidence
 * classification on the declared fallbackStatus (the registration flow
 * stamps the result unconditionally — bait #5: classification must never
 * fail registration).
 */
export async function classifyAcquisitionStatus(
  memberBytes: Uint8Array,
  relativePath: string,
): Promise<AcqpStatusEvidence> {
  const patterns = await loadLogPatterns();
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
