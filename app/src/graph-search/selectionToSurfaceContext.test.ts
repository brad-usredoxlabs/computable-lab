/**
 * selectionToSurfaceContext — pure builder tests (phase 3, Task 3.1).
 */
import { describe, expect, it } from 'vitest'
import { selectionToSurfaceContext, idsToSelection } from './selectionToSurfaceContext'

describe('selectionToSurfaceContext', () => {
  it('maps ids to well refs with surface=find and default prompt', () => {
    const ctx = selectionToSurfaceContext({ ids: ['well:1', 'well:2'] })
    expect(ctx.surface).toBe('find')
    expect(ctx.active.objectType).toBe('collection')
    expect(ctx.selection).toHaveLength(2)
    expect(ctx.selection[0].ref).toMatchObject({ kind: 'record', type: 'well', id: 'well:1' })
    expect(ctx.prompt).toBe('Analyze these wells')
  })

  it('uses a user-provided prompt when given', () => {
    const ctx = selectionToSurfaceContext({ ids: ['well:3'], prompt: 'compute mean ROS' })
    expect(ctx.prompt).toBe('compute mean ROS')
  })

  it('cleanly handles zero selections (empty prompt context)', () => {
    const ctx = selectionToSurfaceContext({ ids: [] })
    expect(ctx.selection).toEqual([])
    expect(ctx.active.objectId).toBe('selection:empty')
  })

  it('labels cells distinctly from wells', () => {
    const sel = idsToSelection(['cell:9'])
    const ref = sel[0].ref
    if (ref.kind !== 'record') throw new Error('expected record ref')
    expect(ref.type).toBe('cell')
  })
})