import { describe, expect, it } from 'vitest'
import { declaredSurfaceRoute, surfaceRoute } from './surfaceRoute'
import type { SurfaceSpec } from '../surfaces'

const REGISTRY: SurfaceSpec[] = [
  {
    id: 'run-design',
    label: 'Run · Design',
    path: '/runs/:runId',
    params: { runId: 'run' },
    objectTypes: ['run'],
    selectableKinds: [],
  },
  {
    id: 'project',
    label: 'Project',
    path: '/project/:studyId',
    params: { studyId: 'project' },
    objectTypes: ['project'],
    selectableKinds: [],
  },
  { id: 'knowledge', label: 'Knowledge', path: '/knowledge', objectTypes: ['claim'], selectableKinds: [] },
]

describe('surfaceRoute', () => {
  it('builds a run route from a run context', () => {
    expect(surfaceRoute({ surface: 'run-design', active: { objectType: 'run', objectId: 'RUN-1' } }, REGISTRY)).toBe(
      '/runs/RUN-1',
    )
  })

  it('builds a project route from a project context', () => {
    expect(
      surfaceRoute({ surface: 'project', active: { objectType: 'project', objectId: 'STU-1' } }, REGISTRY),
    ).toBe('/project/STU-1')
  })

  it('returns null for a surface with no params (not deep-linkable)', () => {
    expect(
      surfaceRoute({ surface: 'knowledge', active: { objectType: 'claim', objectId: 'CLM-1' } }, REGISTRY),
    ).toBeNull()
  })

  it('returns null when the context objectType cannot fill a token', () => {
    expect(
      surfaceRoute({ surface: 'run-design', active: { objectType: 'project', objectId: 'STU-1' } }, REGISTRY),
    ).toBeNull()
  })

  it('returns null for an unknown surface (no TS literal fallback)', () => {
    expect(surfaceRoute({ surface: 'nope', active: { objectType: 'run', objectId: 'RUN-1' } }, REGISTRY)).toBeNull()
  })

  it('url-encodes the id it fills in', () => {
    expect(surfaceRoute({ surface: 'run-design', active: { objectType: 'run', objectId: 'a/b' } }, REGISTRY)).toBe(
      '/runs/a%2Fb',
    )
  })
})

/**
 * CREATE mode (L2-NOUN-CREATION-JOURNEY-1, advc c2 D3): a door lands on a
 * surface that does not exist yet, so a token is filled by the record type the
 * journey's completion CREATES — declared, never defaulted.
 */
describe('declaredSurfaceRoute', () => {
  it('fills a token from the declared created type', () => {
    expect(declaredSurfaceRoute({ surface: 'run-design', createdType: 'run' }, REGISTRY)).toBe('/runs/run')
  })

  it('follows the declared type rather than a fixed literal', () => {
    expect(declaredSurfaceRoute({ surface: 'run-design', createdType: 'labware' }, REGISTRY)).toBe('/runs/labware')
  })

  it('returns null when no created type is declared (fail closed)', () => {
    expect(declaredSurfaceRoute({ surface: 'run-design' }, REGISTRY)).toBeNull()
  })

  it('returns null for a surface with a token but no declared params slot', () => {
    const noParams = [{ ...REGISTRY[0]!, params: undefined }]
    expect(declaredSurfaceRoute({ surface: 'run-design', createdType: 'run' }, noParams)).toBeNull()
  })

  it('returns null for an unknown surface (no TS literal fallback)', () => {
    expect(declaredSurfaceRoute({ surface: 'nope', createdType: 'run' }, REGISTRY)).toBeNull()
  })

  it('returns the surface own path when its route has no token to fill', () => {
    expect(declaredSurfaceRoute({ surface: 'knowledge', createdType: 'claim' }, REGISTRY)).toBe('/knowledge')
  })

  it('returns null when a create route has more than one token (not decidable)', () => {
    const twoTokens = [
      {
        id: 'two',
        label: 'Two',
        path: '/x/:a/:b',
        params: { a: 'record', b: 'record' },
        objectTypes: ['record'],
        selectableKinds: [],
      },
    ] as unknown as SurfaceSpec[]
    expect(declaredSurfaceRoute({ surface: 'two', createdType: 'material' }, twoTokens)).toBeNull()
  })

  it('url-encodes the type it fills in', () => {
    expect(declaredSurfaceRoute({ surface: 'run-design', createdType: 'a/b' }, REGISTRY)).toBe('/runs/a%2Fb')
  })
})
