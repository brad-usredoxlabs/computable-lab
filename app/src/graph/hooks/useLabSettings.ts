import { useEffect, useState } from 'react'
import { apiClient, type LabSettings } from '../../shared/api/client'

const DEFAULT_SETTINGS: LabSettings = {
  materialTracking: {
    mode: 'relaxed',
    allowAdHocEventInstances: true,
  },
  policyBundleId: 'POL-SANDBOX',
  activePolicyBundle: {
    id: 'POL-SANDBOX',
    label: 'Sandbox',
    level: 0,
    description: 'Zero friction. All QMS checks allow. For demos and exploration.',
  },
}

export function useLabSettings() {
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiClient.getLabSettings()
        if (!cancelled) setSettings(response)
      } catch {
        if (!cancelled) setSettings(DEFAULT_SETTINGS)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { settings, loading }
}
