/**
 * toSurfaceContext — standardize selection→AI seams onto SurfaceContext (phase 4).
 */
import { describe, expect, it } from 'vitest'
import { pdfSelectionToSurfaceContext, stepSelectionToSurfaceContext } from './toSurfaceContext'

describe('pdfSelectionToSurfaceContext', () => {
  it('builds a knowledge-surface context with a document selection', () => {
    const sc = pdfSelectionToSurfaceContext({ text: 'Lyse with solution A', pageNumber: 3 })
    expect(sc.surface).toBe('knowledge')
    expect(sc.active.objectType).toBe('document')
    expect(sc.selection[0].ref).toMatchObject({ kind: 'record', type: 'document' })
    expect(sc.prompt).toContain('page 3')
    expect(sc.prompt).toContain('Lyse with solution A')
  })
})

describe('stepSelectionToSurfaceContext', () => {
  it('builds a run-plan context with an event selection scoped to the run', () => {
    const sc = stepSelectionToSurfaceContext({
      runId: 'run:42',
      runLabel: 'Zymo run',
      stepId: 'STP-1',
      stepLabel: 'Lyse',
      highlightedSection: 'bead-beat 10 min',
    })
    expect(sc.surface).toBe('run-plan')
    expect(sc.active).toMatchObject({ objectType: 'run', objectId: 'run:42', label: 'Zymo run' })
    const ref = sc.selection[0].ref
    if (ref.kind !== 'record') throw new Error('expected record ref')
    expect(ref).toMatchObject({ type: 'event', id: 'STP-1' })
    expect(sc.prompt).toContain('Adapt step "Lyse"')
    expect(sc.prompt).toContain('Ghost')
  })
})