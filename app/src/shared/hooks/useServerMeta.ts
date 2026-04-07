/**
 * useServerMeta hook - Fetch server metadata and status.
 * 
 * Polls the /meta endpoint periodically to keep status up to date.
 */

import { useState, useEffect, useCallback } from 'react'
import type { ServerMetaResponse, SyncResponse, RepoStatusInfo, RepoStatus } from '../../types/server'
import { API_BASE } from '../api/base'

/** Default poll interval in ms */
const DEFAULT_POLL_INTERVAL = 30000 // 30 seconds

/**
 * Extract repo name from URL.
 */
function extractRepoName(url: string): string {
  try {
    // Handle various URL formats
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = url.match(/[/:]([^/]+\/[^/.]+)(?:\.git)?$/)
    return match ? match[1] : url
  } catch {
    return url
  }
}

/**
 * Derive repo status info from server meta response.
 */
function deriveRepoStatus(meta: ServerMetaResponse | null): RepoStatusInfo {
  if (!meta?.repository) {
    return {
      status: 'disconnected',
      repoName: 'Not configured',
      branch: '',
      ahead: 0,
      behind: 0,
    }
  }

  const repo = meta.repository
  let status: RepoStatus = 'unknown'

  switch (repo.status) {
    case 'clean':
      status = repo.behind && repo.behind > 0 ? 'dirty' : 'clean'
      break
    case 'dirty':
      status = 'dirty'
      break
    case 'syncing':
      status = 'syncing'
      break
    case 'error':
    case 'unknown':
      status = repo.status as RepoStatus
      break
    default:
      status = 'unknown'
  }

  return {
    status,
    repoName: extractRepoName(repo.url),
    branch: repo.branch,
    ahead: repo.ahead || 0,
    behind: repo.behind || 0,
    lastSync: repo.lastSync,
  }
}

/**
 * Hook return type
 */
export interface UseServerMetaReturn {
  /** Server meta data */
  meta: ServerMetaResponse | null
  /** Derived repo status for easy UI rendering */
  repoStatus: RepoStatusInfo
  /** Loading state */
  loading: boolean
  /** Error message if fetch failed */
  error: string | null
  /** Refresh meta manually */
  refresh: () => Promise<void>
  /** Trigger sync with remote */
  sync: () => Promise<SyncResponse>
  /** Whether sync is in progress */
  syncing: boolean
}

/**
 * useServerMeta hook
 */
export function useServerMeta(options?: {
  /** Poll interval in ms (0 to disable) */
  pollInterval?: number
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean
}): UseServerMetaReturn {
  const { pollInterval = DEFAULT_POLL_INTERVAL, fetchOnMount = true } = options || {}

  const [meta, setMeta] = useState<ServerMetaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Fetch meta data
  const fetchMeta = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${API_BASE}/meta`)
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json() as ServerMetaResponse
      setMeta(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch server status'
      setError(message)
      // Keep old meta if we have it
    } finally {
      setLoading(false)
    }
  }, [])

  // Trigger sync
  const triggerSync = useCallback(async (): Promise<SyncResponse> => {
    try {
      setSyncing(true)
      const response = await fetch(`${API_BASE}/sync`, { method: 'POST' })
      const data = await response.json() as SyncResponse
      
      // Refresh meta after sync
      await fetchMeta()
      
      return data
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Sync failed',
        timestamp: new Date().toISOString(),
      }
    } finally {
      setSyncing(false)
    }
  }, [fetchMeta])

  // Fetch on mount
  useEffect(() => {
    if (fetchOnMount) {
      fetchMeta()
    }
  }, [fetchOnMount, fetchMeta])

  // Poll periodically
  useEffect(() => {
    if (pollInterval <= 0) return

    const interval = setInterval(fetchMeta, pollInterval)
    return () => clearInterval(interval)
  }, [pollInterval, fetchMeta])

  // Derive repo status
  const repoStatus = deriveRepoStatus(meta)

  return {
    meta,
    repoStatus,
    loading,
    error,
    refresh: fetchMeta,
    sync: triggerSync,
    syncing,
  }
}
