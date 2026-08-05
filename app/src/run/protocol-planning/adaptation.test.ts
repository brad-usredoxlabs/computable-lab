import { describe, it, expect } from 'vitest'
import {
  EMPTY_ADAPTATION,
  upsertBinding,
  upsertSubstitution,
  serializeOverrides,
} from './adaptation'

const PLATE = { kind: 'record' as const, id: 'LBR-96', type: 'labware' }
const QS5 = { kind: 'record' as const, id: 'EQP-QS5', type: 'equipment' }
const CLOF = { kind: 'record' as const, id: 'MSP-clof', type: 'material-spec' }

describe('adaptation', () => {
  it('starts empty and serializes to empty additive containers', () => {
    expect(EMPTY_ADAPTATION).toEqual({ bindings: [], substitutions: [] })
    expect(serializeOverrides(EMPTY_ADAPTATION)).toEqual({ bindings: [], substitutions: [] })
  })

  it('adds a binding for a role', () => {
    const d = upsertBinding(EMPTY_ADAPTATION, 'plate', PLATE)
    expect(d.bindings).toEqual([{ role: 'plate', ref: PLATE }])
    expect(d.substitutions).toEqual([])
  })

  it('replaces an existing binding for the same role (additive, no duplicates)', () => {
    const d = upsertBinding(EMPTY_ADAPTATION, 'plate', PLATE)
    const d2 = upsertBinding(d, 'plate', QS5)
    expect(d2.bindings).toHaveLength(1)
    expect(d2.bindings[0].ref.id).toBe('EQP-QS5')
  })

  it('adds a substitution with optional rationale', () => {
    const d = upsertSubstitution(EMPTY_ADAPTATION, 'dye', CLOF, 'our stock')
    expect(d.substitutions).toEqual([
      { role: 'dye', material_ref: CLOF, rationale: 'our stock' },
    ])
  })

  it('serializeOverrides keeps both containers', () => {
    const d = upsertSubstitution(upsertBinding(EMPTY_ADAPTATION, 'plate', PLATE), 'dye', CLOF)
    const o = serializeOverrides(d)
    expect(o.bindings).toHaveLength(1)
    expect(o.substitutions).toHaveLength(1)
  })
})
