/**
 * declaredInputs (FAME-7) — pure-module unit tests. Generic slot/artifact
 * names only (R8: the module must carry zero analyte literal; these fixtures
 * use TEST-scoped generic names as VALUES).
 */
import { describe, expect, it } from 'vitest'
import { boundInputs, declaredInputsOf, inputGate, matchingSlotsForArtifact } from './declaredInputs'

describe('declaredInputsOf', () => {
  it('returns [] for an ABSENT inputs key (legacy revision — zero rows, zero chrome)', () => {
    expect(declaredInputsOf({ id: 'ANREV-X', title: 't' })).toEqual([])
    expect(declaredInputsOf(null)).toEqual([])
    expect(declaredInputsOf(undefined)).toEqual([])
  })

  it('returns [] for a malformed (non-array) inputs value', () => {
    expect(declaredInputsOf({ inputs: 'nope' })).toEqual([])
  })

  it('reads the declared slots (dropping entries without a name)', () => {
    const out = declaredInputsOf({
      inputs: [
        { name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] },
        { dataKind: 'table' },
        { name: 'right_table', acceptedArtifactNames: ['right_summary'] },
      ],
    })
    expect(out.map((d) => d.name)).toEqual(['left_table', 'right_table'])
    expect(out[0]?.acceptsKinds).toEqual(['data-reference'])
  })
})

describe('boundInputs', () => {
  const declared = [
    { name: 'left_table', dataKind: 'table', required: true },
    { name: 'right_table', dataKind: 'table', required: true },
  ]

  it('emits ONLY declared slots that have a staged ref — the exact wire shape', () => {
    const body = boundInputs(declared, {
      left_table: { kind: 'record', id: 'DREF-TEST-7', type: 'data-reference' },
      // A staged ref for an UNDECLARED slot must NOT leak into the body.
      ghost: { kind: 'record', id: 'DREF-TEST-8', type: 'data-reference' },
    })
    expect(body).toEqual({
      left_table: { kind: 'record', id: 'DREF-TEST-7', type: 'data-reference' },
    })
  })

  it('returns an empty object when nothing is staged (the caller never hardcodes inputs:{} — this builder is the source)', () => {
    expect(boundInputs(declared, {})).toEqual({})
  })
})

describe('inputGate', () => {
  it('names the required-unbound reason and blocks', () => {
    const g = inputGate([{ name: 'left_table', required: true }], {})
    expect(g.blocked).toBe(true)
    expect(g.reasons).toEqual(["required input 'left_table' is not bound"])
  })

  it('does not block on an optional unbound slot', () => {
    const g = inputGate([{ name: 'opt_table', required: false }], {})
    expect(g.blocked).toBe(false)
  })

  it('names the kind-mismatch reason when the slot declares acceptsKinds', () => {
    const g = inputGate(
      [{ name: 'left_table', required: true, acceptsKinds: ['data-reference'] }],
      { left_table: { kind: 'record', id: 'AOUT-TEST-1', type: 'analysis-output-artifact' } },
    )
    expect(g.blocked).toBe(true)
    expect(g.reasons[0]).toBe("input 'left_table' accepts kinds data-reference — got 'analysis-output-artifact'")
  })

  it('passes a fully satisfied gate', () => {
    const g = inputGate(
      [{ name: 'left_table', required: true, acceptsKinds: ['data-reference'] }],
      { left_table: { kind: 'record', id: 'DREF-TEST-1', type: 'data-reference' } },
    )
    expect(g).toEqual({ blocked: false, reasons: [] })
  })
})

describe('matchingSlotsForArtifact (Use result downstream routing — declared-data matching)', () => {
  it('matches by declared acceptedArtifactNames ∋ the artifact name AND the slot admits the artifact kind', () => {
    const slots = matchingSlotsForArtifact(
      [
        { name: 'right_table', acceptedArtifactNames: ['right_summary'] },
        { name: 'other_table', acceptedArtifactNames: ['something_else'] },
        { name: 'open_table' },
      ],
      'right_summary',
      'analysis-output-artifact',
    )
    // right_table (name match) AND open_table (no name gate — open slot) match.
    expect(slots).toEqual(['right_table', 'open_table'])
  })

  it('rejects a slot whose acceptsKinds does not admit the artifact record kind', () => {
    const slots = matchingSlotsForArtifact(
      [{ name: 'left_table', acceptsKinds: ['data-reference'] }],
      'right_summary',
      'analysis-output-artifact',
    )
    expect(slots).toEqual([])
  })

  it('returns [] when the artifact name is absent and the slot declares names (named 0-match, no silent drop)', () => {
    const slots = matchingSlotsForArtifact(
      [{ name: 'right_table', acceptedArtifactNames: ['right_summary'] }],
      undefined,
      'analysis-output-artifact',
    )
    expect(slots).toEqual([])
  })
})
