/** resolveSurface — pure route → "where am I" resolver tests. */
import { describe, expect, it } from 'vitest'
import { resolveSurfaceFromPath } from './resolveSurface'

describe('resolveSurfaceFromPath', () => {
  it('maps /find to the find surface', () => {
    const r = resolveSurfaceFromPath('/find?q=clofibrate')
    expect(r.surface).toBe('find')
    expect(r.label).toBe('Find')
    expect(r.active.objectType).toBe('collection')
  })

  it('maps /runs/:id to the run-design surface with the run as active object', () => {
    const r = resolveSurfaceFromPath('/runs/run-42')
    expect(r.surface).toBe('run-design')
    expect(r.active).toMatchObject({ objectType: 'run', objectId: 'run-42' })
  })

  it('refines a run surface to plan/execute via runMode', () => {
    expect(resolveSurfaceFromPath('/runs/run-42', { runMode: 'plan' }).surface).toBe('run-plan')
    expect(resolveSurfaceFromPath('/runs/run-42', { runMode: 'execute' }).surface).toBe('run-execute')
    expect(resolveSurfaceFromPath('/runs/run-42', { runMode: 'results' }).surface).toBe('results')
  })

  it('maps /literature and /artifact to the knowledge surface', () => {
    expect(resolveSurfaceFromPath('/literature').surface).toBe('knowledge')
    expect(resolveSurfaceFromPath('/artifact/pdf/ART-1').surface).toBe('knowledge')
  })

  it('maps /project/:id to the project surface', () => {
    const r = resolveSurfaceFromPath('/project/STU-1')
    expect(r.surface).toBe('project')
    expect(r.active.objectId).toBe('STU-1')
  })

  it('carries an explicit selection count', () => {
    expect(resolveSurfaceFromPath('/find', { selectionCount: 3 }).selectionCount).toBe(3)
  })
})