import { describe, it, expect } from 'vitest'
import { normalizeSearchResults } from './SplashSearch'
import type { IndexEntry } from '../../types/tree'

const mk = (recordId: string, kind: string, title?: string): IndexEntry => ({
  recordId, kind, schemaId: kind, status: 'filed', path: `/records/${recordId}`,
  ...(title ? { title } : {}),
})

describe('normalizeSearchResults', () => {
  it('maps study→project, run→run, claim→claim, lab kinds→lab with correct routes', () => {
    const out = normalizeSearchResults([
      mk('STU-1', 'study', 'Proj'),
      mk('RUN-1', 'run', 'Run'),
      mk('CLAIM-1', 'claim', 'Claim'),
      mk('MAT-1', 'material', 'BSA'),
      mk('INST-1', 'instrument', 'Cytation 5'),
      mk('REL-1', 'relationship'), // not a first-class routable kind — dropped
    ])
    expect(out.map((r) => [r.entityType, r.path])).toEqual([
      ['project', '/project/STU-1'],
      ['run', '/runs/RUN-1'],
      ['claim', '/claims/CLAIM-1'],
      ['lab', '/lab/materials/MAT-1'],
      ['lab', '/lab/equipment/INST-1'],
    ])
  })

  it('falls back title to recordId', () => {
    const out = normalizeSearchResults([mk('MAT-9', 'material')])
    expect(out[0].title).toBe('MAT-9')
  })
})
