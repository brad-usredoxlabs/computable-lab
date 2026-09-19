import { describe, expect, it } from 'vitest'
import { surfaceRoute } from './surfaceRoute'
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
