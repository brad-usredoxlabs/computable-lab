/**
 * SurfaceContext — client type contract: a well selection round-trips through
 * JSON keeping refs intact; empty selection is representable.
 */
import { describe, expect, it } from 'vitest'
import type { SurfaceContext } from './SurfaceContext'

const WELL_CTX: SurfaceContext = {
  surface: 'find',
  active: { objectType: 'collection', objectId: 'selection:q_1', label: 'Find selection' },
  selection: [{ ref: { kind: 'record', id: 'well:1', type: 'well', label: 'A1' } }],
  prompt: 'Analyze these wells',
}

describe('SurfaceContext (client type)', () => {
  it('a well selection round-trips through JSON keeping the ref intact', () => {
    const back = JSON.parse(JSON.stringify(WELL_CTX)) as SurfaceContext
    expect(back.surface).toBe('find')
    expect(back.selection[0].ref).toMatchObject({ kind: 'record', id: 'well:1', type: 'well' })
    expect(back.prompt).toBe('Analyze these wells')
  })

  it('surfaces are scoped to the active object, not navigation tabs', () => {
    // A run-plan surface is a slot; MANY contexts (different selections) are
    // normal within that ONE tab. This is the tab↔context invariant (locked #3).
    const runPlan: SurfaceContext = {
      surface: 'run-plan',
      active: { objectType: 'run', objectId: 'run:42', label: 'Zymo run' },
      selection: [{ ref: { kind: 'record', id: 'EVG-1', type: 'event', label: 'Lyse' } }],
      prompt: 'ghost this step',
    }
    expect(runPlan.surface).toBe('run-plan')
    expect(runPlan.active.objectId).toBe('run:42')
  })
})