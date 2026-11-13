// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../shared/api/errors'
import {
  isMissingGraphError,
  resolveRunMethodGraph,
  runMethodGraphMissingNotice,
} from './runMethodGraphLoad'

describe('runMethodGraphLoad (g3d4dangling)', () => {
  it('(a) hasMethod:false -> no-method without calling load', async () => {
    const load = vi.fn(async () => undefined)
    await expect(resolveRunMethodGraph({ hasMethod: false }, load)).resolves.toEqual({ kind: 'no-method' })
    expect(load).not.toHaveBeenCalled()
  })

  it('(b) hasMethod:true, methodEventGraphId:null -> no-method without calling load', async () => {
    const load = vi.fn(async () => undefined)
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: null }, load),
    ).resolves.toEqual({ kind: 'no-method' })
    expect(load).not.toHaveBeenCalled()
  })

  it('(b2) hasMethod:true, methodEventGraphId absent -> no-method without calling load', async () => {
    const load = vi.fn(async () => undefined)
    await expect(resolveRunMethodGraph({ hasMethod: true }, load)).resolves.toEqual({ kind: 'no-method' })
    expect(load).not.toHaveBeenCalled()
  })

  it('(c) load resolves -> loaded with the id', async () => {
    const load = vi.fn(async () => undefined)
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: 'EVG-1' }, load),
    ).resolves.toEqual({ kind: 'loaded', graphId: 'EVG-1' })
    expect(load).toHaveBeenCalledWith('EVG-1')
  })

  it('(d) load rejects with 404 NOT_FOUND ApiError -> missing with the id, no throw', async () => {
    const load = vi.fn(async () => {
      throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'record not found: EVG-1' })
    })
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: 'EVG-1' }, load),
    ).resolves.toEqual({ kind: 'missing', graphId: 'EVG-1' })
  })

  it('(d2) load rejects with 404 RECORD_NOT_FOUND ApiError -> missing', async () => {
    const load = vi.fn(async () => {
      throw new ApiError({ status: 404, code: 'RECORD_NOT_FOUND', message: 'no such graph' })
    })
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: 'EVG-2' }, load),
    ).resolves.toEqual({ kind: 'missing', graphId: 'EVG-2' })
  })

  it('(e) load rejects with 500 INTERNAL ApiError -> REJECTS (not swallowed)', async () => {
    const boom = new ApiError({ status: 500, code: 'INTERNAL', message: 'boom' })
    const load = vi.fn(async () => {
      throw boom
    })
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: 'EVG-1' }, load),
    ).rejects.toBe(boom)
  })

  it('(e2) load rejects with a non-ApiError "not found" message -> missing', async () => {
    const load = vi.fn(async () => {
      throw new Error('Graph not found: EVG-1')
    })
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: 'EVG-1' }, load),
    ).resolves.toEqual({ kind: 'missing', graphId: 'EVG-1' })
  })

  it('(e3) load rejects with a bare non-Error throw -> REJECTS (never treated as missing)', async () => {
    const load = vi.fn(async () => {
      throw 'network down'
    })
    await expect(
      resolveRunMethodGraph({ hasMethod: true, methodEventGraphId: 'EVG-1' }, load),
    ).rejects.toBe('network down')
  })

  it('(f) runMethodGraphMissingNotice: exact sentence naming the id', () => {
    expect(runMethodGraphMissingNotice('EVG-1')).toContain('EVG-1')
    expect(runMethodGraphMissingNotice('EVG-1')).toBe(
      'Run references plan graph EVG-1, which does not exist — build the plan graph to create it.',
    )
  })

  it('isMissingGraphError: bare throws and non-missing errors are never missing', () => {
    expect(isMissingGraphError(new Error('boom'))).toBe(false)
    expect(isMissingGraphError('not an error object')).toBe(false)
    expect(isMissingGraphError(new ApiError({ status: 500, code: 'INTERNAL', message: 'boom' }))).toBe(false)
  })
})
