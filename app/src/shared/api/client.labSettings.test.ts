/**
 * QMS-8-POLICY-BUNDLE-SWITCH — client contract tests for apiClient.patchLabSettings.
 *
 * Defect L1-A: SettingsPage.tsx:96 calls apiClient.patchLabSettings({policyBundleId})
 * — the method was ABSENT from client.ts at base 14637f6d (live browser error:
 * "apiClient.patchLabSettings is not a function"). These tests pin the contract:
 * PATCH /settings/lab, JSON body {policyBundleId}, LabSettings response, and the
 * wire error shape ({error, message}, no `code` field) surfacing verbatim so
 * SettingsPage can show the server's reason.
 *
 * fetch is mocked module-globally (style: client.signature.test.ts).
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

const LAB_SETTINGS_BODY = {
  materialTracking: { mode: 'relaxed', allowAdHocEventInstances: true },
  policyBundleId: 'POL-REGULATED',
  activePolicyBundle: { id: 'POL-REGULATED', label: 'Regulated', level: 3 },
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient.patchLabSettings (QMS-8)', () => {
  it('PATCHes /settings/lab with the {policyBundleId} body and resolves the LabSettings body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, LAB_SETTINGS_BODY))

    const result = await apiClient.patchLabSettings({ policyBundleId: 'POL-REGULATED' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/\/settings\/lab$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ policyBundleId: 'POL-REGULATED' })

    expect(result.policyBundleId).toBe('POL-REGULATED')
    expect(result.activePolicyBundle?.id).toBe('POL-REGULATED')
  })

  it('surfaces the server actionable 400 (unknown bundle id) as an ApiError carrying the server message', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(400, {
      error: 'BAD_REQUEST',
      message: 'Unknown policy bundle POL-NOPE. Known bundles: POL-SANDBOX, POL-NOTEBOOK, POL-TRACKED, POL-REGULATED',
    }))

    await expect(apiClient.patchLabSettings({ policyBundleId: 'POL-NOPE' })).rejects.toBeInstanceOf(ApiError)

    try {
      await apiClient.patchLabSettings({ policyBundleId: 'POL-NOPE' })
      throw new Error('expected a rejection')
    } catch (err) {
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(400)
      // The message the Settings page must show: names the bad id + known ids.
      expect(apiErr.message).toContain('POL-NOPE')
      expect(apiErr.message).toContain('POL-REGULATED')
    }
  })

  it('surfaces the 403 FORBIDDEN denial (wire shape {error, message}, no code field)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(403, {
      error: 'FORBIDDEN',
      message: 'Policy bundle change forbidden: admin privileges required.',
    }))

    try {
      await apiClient.patchLabSettings({ policyBundleId: 'POL-REGULATED' })
      throw new Error('expected a rejection')
    } catch (err) {
      const apiErr = err as ApiError
      expect(apiErr).toBeInstanceOf(ApiError)
      expect(apiErr.status).toBe(403)
      expect(apiErr.message).toContain('FORBIDDEN')
      expect(apiErr.message).toContain('admin privileges required')
    }
  })
})
