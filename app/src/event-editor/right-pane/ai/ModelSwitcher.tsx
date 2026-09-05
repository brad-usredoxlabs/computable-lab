/**
 * ModelSwitcher — compact model/profile selector for the AI chatbox.
 *
 * Lists the server's saved AI profiles (from /api/config/ai/profiles) and lets
 * the user hot-swap the active model by calling activateAiProfile, which the
 * server applies live (rebuilds the inference client + orchestrator at the new
 * baseUrl/model). The switch affects BOTH the chatbox and the one-shot local
 * protocol compiler, since they share the same runtime.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../../shared/api/client'

export interface AiProfileSummary {
  name: string
  provider: string
  baseUrl: string
  model: string
  active: boolean
}

interface ModelSwitcherProps {
  /** Optional test hook to inject profiles (defaults to apiClient). */
  loadProfiles?: () => Promise<{ profiles: AiProfileSummary[]; activeProfile: string | null }>
  /** Optional test hook to activate a profile (defaults to apiClient). */
  activateProfile?: (name: string) => Promise<{ success: boolean; message?: string }>
}

export function ModelSwitcher({
  loadProfiles,
  activateProfile,
}: ModelSwitcherProps) {
  const load = loadProfiles ?? (() => apiClient.listAiProfiles())
  const activate = activateProfile ?? ((name: string) => apiClient.activateAiProfile(name))

  const [profiles, setProfiles] = useState<AiProfileSummary[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await load()
      setProfiles(res.profiles ?? [])
      setActive(res.activeProfile)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [load])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Guard: if the active profile disappears (or none is marked active), still
  // show a fallback so the control is never empty/blank, but mark it visually.
  const activeProfile = profiles.find((p) => p.name === active) ?? null

  const handleChange = useCallback(
    async (name: string) => {
      if (!name || name === active || switching) return
      setSwitching(name)
      setError(null)
      try {
        const res = await activate(name)
        if (!res.success) {
          setError(res.message || `Failed to switch to ${name}`)
        } else {
          await refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSwitching(null)
      }
    },
    [activate, refresh, active, switching],
  )

  if (profiles.length === 0) return null

  return (
    <span className="ai-tab__model-switch" data-testid="ai-model-switch">
      <select
        className="ai-tab__model-switch-select"
        value={active ?? ''}
        onChange={(e) => void handleChange(e.target.value)}
        disabled={switching !== null}
        aria-label="AI model"
        data-testid="ai-model-switch-select"
      >
        {!activeProfile && active ? (
          <option value={active}>{active}</option>
        ) : null}
        {profiles.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
      {switching ? (
        <span className="ai-tab__model-switch-status" data-testid="ai-model-switching">
          switching…
        </span>
      ) : null}
      {error ? (
        <span
          className="ai-tab__model-switch-status ai-tab__model-switch-status--error"
          data-testid="ai-model-switch-error"
          title={error}
        >
          ⚠
        </span>
      ) : null}
    </span>
  )
}