/**
 * L2-MATERIAL-SELECTION-POLICY-1 / unit g2pin — source-pin (TEST-ONLY).
 *
 * Closes the item's unverified `verified by` clause (4): "A test asserts no
 * code path branches on a schema name or a vendor string."
 *
 * The resolver keys on record DATA — the ref's `kind` (`ontology` | `record`)
 * and its `id`/`recordId` (clarifyPickerRanking.ts:465/518, policy.ts:115,
 * MaterialSelectionPolicy.ts:23-26). It must never branch on the schema name
 * `material-selection-policy` nor on a vendor/catalogue string; a vendor
 * product is matched only by its record ref id.
 *
 * This pin is deliberately textual, not behavioural: the behaviour already
 * has 32 passing tests in clarifyPickerRanking.test.ts. The risk here is a
 * VACUOUS pin, so the predicate is positive-controlled on both forbidden
 * token classes (see the last test). Mutating the denylist or the schema
 * literal out of `branchHits` turns this file red.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCHEMA_NAME = 'material-selection-policy'

/** Absent-tokens: these must not appear in any branch line of the resolver. */
const VENDOR_TOKENS = [
  'Sigma',
  'Thermo',
  'Gibco',
  'ATCC',
  'Invitrogen',
  'Millipore',
  'Cell Signaling',
  'D6429',
  'F4135',
] as const

/** A line is a BRANCH line when it contains one of these control-flow tokens. */
const BRANCH_TOKENS = [
  'if (',
  '? ',
  'case ',
  '===',
  '!==',
  '==',
  '!=',
  '.includes(',
  'switch (',
]

/**
 * Return the branch lines that also mention the schema name or a vendor
 * token. Data-enum comparisons (`policies.length === 0`, `selection === 'only'`)
 * carry no forbidden token and are intentionally not flagged.
 */
function branchHits(source: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = []
  const forbidden = [SCHEMA_NAME, ...VENDOR_TOKENS]
  source.split('\n').forEach((text, index) => {
    if (!BRANCH_TOKENS.some((token) => text.includes(token))) return
    if (forbidden.some((token) => text.includes(token))) {
      hits.push({ line: index + 1, text })
    }
  })
  return hits
}

/** Resolve repo files from this module's URL — never from process.cwd(). */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const RESOLVER_FILES = {
  'clarifyPickerRanking.ts': './clarifyPickerRanking.ts',
  'policy.ts': './policy.ts',
  'MaterialSelectionPolicy.ts': '../../../../../server/src/materials/MaterialSelectionPolicy.ts',
} as const

describe('L2-MATERIAL-SELECTION-POLICY-1 g2pin — ref keying is data, not schema/vendor', () => {
  for (const [label, relativePath] of Object.entries(RESOLVER_FILES)) {
    it(`${label} has no branch line on the schema name or a vendor string`, () => {
      const source = read(relativePath)
      // A bad path must fail loudly, not vacuously pass over ''.
      expect(source.length, `${label} read as empty — path resolution is broken`).toBeGreaterThan(0)
      expect(branchHits(source)).toEqual([])
    })
  }

  it('branchHits flags both forbidden token classes (positive control)', () => {
    expect(branchHits(`if (schemaId === '${SCHEMA_NAME}') return true`)).not.toEqual([])
    expect(branchHits(`if (vendor === '${VENDOR_TOKENS[0]}') return true`)).not.toEqual([])
  })
})
