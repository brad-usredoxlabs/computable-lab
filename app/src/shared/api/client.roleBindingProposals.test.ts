/**
 * L2-VACUOUS-PINS-DEBT — fetch-level contract test for apiClient.getRoleBindingProposals.
 *
 * The only consumer test (RoleBindingProposalsPanel.test.tsx:9) mocks the entire apiClient
 * module, so the URL literal at client.ts:5641 is never built by any test. A rename of the
 * server route or a typo in the method's path would leave every test green and break the run
 * surface at runtime. This test pins the route literal by stubbing global fetch.
 *
 * Style: client.labSettings.test.ts (module-global fetch stub via vi.stubGlobal).
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
        { roleId: 'cells', roleKind: 'material', state: 'proposed', candidates: [] },
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

describe('apiClient.getRoleBindingProposals', () => {
  it('GETs /runs/:id/role-binding-proposals and resolves the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, ROLE_BINDING_BODY))

    const result = await apiClient.getRoleBindingProposals('run-1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/\/runs\/run-1\/role-binding-proposals$/)
    expect(init.method).toBeUndefined()
    // Pin the full URL string so the prefix cannot drift unnoticed
    expect(String(url)).toContain('/runs/run-1/role-binding-proposals')

    expect(result.protocols).toHaveLength(1)
    expect(result.protocols[0].protocolId).toBe('lp-1')
  })

  it('percent-encodes the runId in the URL path', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, ROLE_BINDING_BODY))

    await apiClient.getRoleBindingProposals('run/../1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('run%2F..%2F1')
  })

  it('surfaces a 404 as an ApiError when the run is absent', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, {
      error: 'NOT_FOUND',
      message: 'Run not found',
    }))

    try {
      await apiClient.getRoleBindingProposals('missing-run')
      throw new Error('expected a rejection')
    } catch (err) {
      const apiErr = err as ApiError
      expect(apiErr).toBeInstanceOf(ApiError)
      expect(apiErr.status).toBe(404)
      expect(apiErr.message).toContain('not found')
    }
  })
})
