/**
 * useConfig hook — Fetch and patch server configuration via /api/config.
 *
 * Follows the useServerMeta pattern but without polling (config doesn't
 * change spontaneously). Provides patchConfig for sparse updates.
 */

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../api/client'
import type {
  ConfigResponse,
  ConfigPatchResponse,
  ConfigPatchError,
  AiConnectionTestRequest,
  AiConnectionTestResponse,
} from '../../types/config'

export interface UseConfigReturn {
  /** Current config (repositories + ai) */
  config: ConfigResponse | null
  /** Initial load in progress */
  loading: boolean
  /** Error message from last fetch */
  error: string | null
  /** Re-fetch config from server */
  refresh: () => Promise<void>
  /** Send a sparse PATCH and update local state on success */
  patchConfig: (patch: Record<string, unknown>) => Promise<ConfigPatchResponse>
  /** Whether a PATCH is in flight */
  saving: boolean
  /** Validate/test AI settings against provider endpoint */
  testAiConfig: (req: AiConnectionTestRequest) => Promise<AiConnectionTestResponse>
}

export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiClient.getConfig()
      setConfig(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch config'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const patchConfig = useCallback(async (patch: Record<string, unknown>): Promise<ConfigPatchResponse> => {
    setSaving(true)
    try {
      const result = await apiClient.patchConfig(patch)

      if (!result.success) {
        // Backend returned a validation / error body
        const errBody = result as unknown as ConfigPatchError
        throw new Error(
          errBody.details
            ? errBody.details.map(d => `${d.path}: ${d.message}`).join('; ')
            : errBody.error
        )
      }

      // Update local state with the fresh config from server
      setConfig(result.config)
      return result
    } finally {
      setSaving(false)
    }
  }, [])

  const testAiConfig = useCallback(async (req: AiConnectionTestRequest): Promise<AiConnectionTestResponse> => {
    return apiClient.testAiConfig(req)
  }, [])

  return { config, loading, error, refresh: fetchConfig, patchConfig, saving, testAiConfig }
}
