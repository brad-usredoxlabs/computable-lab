import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import type { PlatformManifest } from '../../types/platformRegistry'

export function usePlatformRegistry() {
  const [platforms, setPlatforms] = useState<PlatformManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await apiClient.getPlatforms()
        if (!cancelled) setPlatforms(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load platform registry')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const platformsById = useMemo(
    () => new Map(platforms.map((platform) => [platform.id, platform])),
    [platforms]
  )

  return {
    platforms,
    platformsById,
    loading,
    error,
  }
}
