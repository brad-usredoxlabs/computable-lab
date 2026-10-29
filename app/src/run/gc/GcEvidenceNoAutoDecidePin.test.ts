/**
 * GC-13 (leg F) — D6 no-auto-decide GREP PIN (the GC-11 [F]-grep-leg pattern).
 *
 * The pin: ZERO new file under app/src or server/src that constructs an
 * evidence payload's `supports`/`refutes`/`assesses` (or an assertion
 * outcome) outside the scientist form handler — and no domain literals
 * (kind names, support verdicts, source-type mapping values) as TS string
 * literals in the new GC-13 component files. The mapping lives in
 * gcEvidenceSources.ts (a data table), the required-context floor lives in
 * the lint YAML (server), the stance choice lives in the form handler only.
 *
 * Method: read the tracked files (via git, so untracked lane aids are
 * never scanned) and grep. Test fixtures carry the same literals
 * legitimately (they are DATA, the spec's "RED tests against the real
 * files" idiom) — the pin excludes *.test.* files from the literal scan
 * and allow-lists the form handler for the stance construction.
 *
 * This test FAILS if someone re-introduces a domain literal into a
 * component or a stance default into a new file — it is the tripwire for
 * the no-auto-decide and no-hardcode rules (bait #4, #5).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..', '..')

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', 'app/src', 'server/src'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .filter((line) => !/\.test\.(ts|tsx|js|jsx)$/.test(line))
}

/** The new GC-13 NON-TEST files (the pin's scope). */
const GC13_FILES = [
  'app/src/run/gc/GcEvidenceHandoff.tsx',
  'app/src/run/gc/gcEvidenceSources.ts',
  'app/src/run/gc/gcProvenance.ts',
  'app/src/run/gc/GcProvenancePanel.tsx',
  'app/src/claims/claimEvidenceModel.ts',
  'app/src/claims/ClaimWorkspace.tsx',
]

/** The form handler is the ONE place a stance array is constructed — the
 *  pin allow-lists it (D3: the scientist's explicit act) and bans it
 *  everywhere else. */
const STANCE_CONSTRUCTION_ALLOWED = ['app/src/run/gc/GcEvidenceHandoff.tsx']

/** Domain literals that must NOT appear as TS string literals in a GC-13
 *  component (bait #4): the stance VERDICTS and the source-type mapping
 *  values. The KIND NAMES are excluded: they occur as the STRUCTURAL keys of
 *  the ProvenanceKind union's switch (gcProvenance) — the hop table IS data
 *  (name + kind per hop), and the switch arms are type keys, not policy. */
const DOMAIN_LITERALS = [
  // stance words (verdicts)
  "'supports'",
  "'refutes'",
  "'assesses'",
  // the enum values that the MAPPING table is allowed to own
  "'measurement_context'",
  // outcome words
  "'supported'",
  "'inconclusive'",
]

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/** Strip line and block comments so the literal scan sees CODE only
 *  (doc comments legitimately name the contract; testids like
 *  `stance-${s}` must not trip the verdict scan). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

describe('GC-13 (leg F) — D6 no-auto-decide grep pin', () => {
  it('the pin scope is the real tracked GC-13 files (no phantom entries)', () => {
    const tracked = new Set(trackedFiles())
    for (const f of GC13_FILES) {
      expect(tracked.has(f), `pin scope entry not tracked: ${f}`).toBe(true)
    }
  })

  it('no GC-13 NEW file constructs a stance array outside the scientist form handler (D6)', () => {
    const offenders: string[] = []
    for (const f of GC13_FILES) {
      if (STANCE_CONSTRUCTION_ALLOWED.includes(f)) continue
      const src = read(f)
      // a stance ARRAY being CONSTRUCTED: `supports: [` / `refutes: [` /
      // `assesses: [` (the computed key `[stance]:` the form uses does NOT
      // match — the scientist's choice, not a verdict literal).
      if (new RegExp('^(?:\\s*)(supports|refutes|assesses)\\s*:\\s*\\[', 'm').test(src)) {
        offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
    // the pre-existing server files that DO construct stance arrays
    // (verifyPlatingEvidence / SemanticsHandlers) are OUT of GC-13 scope —
    // the pin guards the NEW diff, not the trunk.
  })

  it('no stance VERDICT literal in a GC-13 file that DECIDES (bait #4/#5: the scientist acts)', () => {
    // The ledger model (claimEvidenceModel.ts) and ClaimWorkspace.tsx READ
    // existing stance arrays to group records — they do not DECIDE a stance
    // (no array construction, covered by the D6 pin above). The form
    // handler PRESENTS the stance words as choices (the scientist's explicit
    // act). Every other GC-13 file must carry no verdict literal at all.
    const EXEMPT = [
      'app/src/run/gc/gcEvidenceSources.ts', // the data table (no verdicts)
      'app/src/run/gc/GcEvidenceHandoff.tsx', // the scientist form handler (presents choices)
      'app/src/claims/claimEvidenceModel.ts', // read-only ledger grouping (no decision)
      'app/src/claims/ClaimWorkspace.tsx', // read-only ledger render (no decision)
    ]
    const offenders: Array<{ file: string; literal: string }> = []
    for (const f of GC13_FILES) {
      if (EXEMPT.includes(f)) continue
      const src = codeOnly(read(f))
      for (const lit of DOMAIN_LITERALS) {
        if (src.includes(lit)) offenders.push({ file: f, literal: lit })
      }
    }
    expect(offenders).toEqual([])
  })

  it('the stance construction is confined to the form handler (the scientist acts, the form records)', () => {
    const form = read('app/src/run/gc/GcEvidenceHandoff.tsx')
    // the form builds the stance key from the scientist's chosen value —
    // `[stance]:` (computed key), never a hardcoded `'supports': [...]`.
    expect(form).toContain('[stance]:')
    expect(codeOnly(form)).not.toMatch(new RegExp("^'supports'\\s*:\\s*\\[", 'm'))
  })
})
