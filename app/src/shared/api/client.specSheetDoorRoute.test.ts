/**
 * L2-VACUOUS-PINS-DEBT — pin the spec-sheet-door client route.
 *
 * The modal test (VendorProductBuilderModal.specSheetDoor.test.tsx) mocks
 * apiClient.extractSpecSheetProposals, so it stays green even if the route
 * literal drifts. This test exercises the real client call against a mocked
 * fetch and asserts the outbound URL suffix, so any change to the path turns
 * the suite RED.
 *
 * House style: module-global fetch spy (matches client.labSettings.test.ts).
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'

const fetchSpy = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient.extractSpecSheetProposals route pin (uD2pin)', () => {
  it('POSTs /ingestion/spec-sheet/extract with the {url, recordKind} body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      configured: true,
      proposals: [{
        targetField: 'name',
        value: 'TestCompound',
        sourceUrl: 'https://www.sigmaaldrich.com/spec-sheet',
        passage: 'The compound name is TestCompound.',
        specId: 'SPEC-001',
      }],
    }))

    const result = await apiClient.extractSpecSheetProposals({
      url: 'https://www.sigmaaldrich.com/spec-sheet',
      recordKind: 'vendor-product',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/\/ingestion\/spec-sheet\/extract$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      url: 'https://www.sigmaaldrich.com/spec-sheet',
      recordKind: 'vendor-product',
    })

    // Verify the result carries the expected fields
    expect(result.configured).toBe(true)
    expect(result.proposals[0].targetField).toBe('name')
    expect(result.proposals[0].sourceUrl).toBe('https://www.sigmaaldrich.com/spec-sheet')
  })

  it('round-trips the proposals payload from the server response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      configured: true,
      proposals: [
        {
          targetField: 'molecularWeight',
          value: '300.4',
          sourceUrl: 'https://www.sigmaaldrich.com/spec-sheet-2',
          passage: 'MW = 300.4 g/mol',
          specId: 'SPEC-002',
        },
      ],
    }))

    const result = await apiClient.extractSpecSheetProposals({
      url: 'https://www.sigmaaldrich.com/spec-sheet-2',
      recordKind: 'vendor-product',
    })

    expect(result.configured).toBe(true)
    expect(result.proposals[0].targetField).toBe('molecularWeight')
    expect(result.proposals[0].sourceUrl).toBe('https://www.sigmaaldrich.com/spec-sheet-2')
  })
})
