/**
 * L2-L2-VACUOUS-PINS-DEBT — unit uD2bpin.
 *
 * The existing RoleBindingProposalsPanel.test.tsx mocks the entire apiClient
 * module (line 9), so the route literal `/runs/:id/role-binding-proposals` at
 * client.ts:5641 is never built in any test. A rename or typo would leave
 * every test green while breaking the run surface at runtime.
 *
 * This file pins the fetch-level URL literal by importing the REAL apiClient
 * and stubbing global fetch — not by mocking the module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { ApiError } from './errors'

const fetchSpy = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

const ROLE_BINDING_BODY = {
  protocols: [
    {
      protocolId: 'lp-1',
      roles: [
        { roleId: 'cells', roleKind: 'material', state: 'proposed' as const, candidates: [] },
      ],
    },
  ],
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient.getRoleBindingProposals — route literal pin', () => {
  it('GETs /runs/:id/role-binding-proposals and resolves the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, ROLE_BINDING_BODY))

    const result = await apiClient.getRoleBindingProposals('run-1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]

    // Pin the route literal — regex + full string so neither tail nor prefix can drift
    expect(String(url)).toMatch(/\/runs\/run-1\/role-binding-proposals$/)
    expect(String(url)).toBe('/api/runs/run-1/role-binding-proposals')
    expect(init.method).toBeUndefined() // GET is default
    expect(init.method || 'GET').toBe('GET')

    expect(result.protocols).toHaveLength(1)
    expect(result.protocols[0].protocolId).toBe('lp-1')
    expect(result.protocols[0].roles[0].roleId).toBe('cells')
  })

  it('percent-encodes the runId (run/../1 → run%2F..%2F1)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, ROLE_BINDING_BODY))

    await apiClient.getRoleBindingProposals('run/../1')

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    // The encodeURIComponent in client.ts:5641 must encode slashes/dots
    expect(String(url)).toContain('run%2F..%2F1')
    expect(String(url)).toMatch(/\/runs\/run%2F\.\.%2F1\/role-binding-proposals$/)
  })

  it('surfaces 404 (absent run) as an ApiError', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, {
      error: 'NOT_FOUND',
      message: 'Run not found',
    }))

    try {
      await apiClient.getRoleBindingProposals('nonexistent')
      throw new Error('expected a rejection')
    } catch (err) {
      const apiErr = err as ApiError
      expect(apiErr).toBeInstanceOf(ApiError)
      expect(apiErr.status).toBe(404)
      expect(apiErr.message).toContain('Run not found')
    }
  })
})
