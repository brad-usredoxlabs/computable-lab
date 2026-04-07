/**
 * Types for server metadata and configuration.
 */

/**
 * Server meta response from GET /meta
 */
export interface ServerMetaResponse {
  server: {
    version: string
    uptime: string
    uptimeMs: number
  }
  repository?: {
    id: string
    url: string
    branch: string
    status: string
    ahead?: number
    behind?: number
    lastSync?: string
  }
  namespace?: {
    baseUri: string
    prefix: string
  }
  schemas: {
    source: 'bundled' | 'bundled+overlay'
    count: number
    bundledCount?: number
    overlayCount?: number
    overriddenCount?: number
  }
  lint: {
    ruleCount: number
  }
  jsonld: {
    context: string
  }
}

/**
 * Sync response from POST /sync
 */
export interface SyncResponse {
  success: boolean
  pulledCommits?: number
  pushedCommits?: number
  error?: string
  timestamp: string
}

/**
 * Repository status
 */
export type RepoStatus = 'clean' | 'dirty' | 'syncing' | 'error' | 'unknown' | 'disconnected'

/**
 * Derived repo status for UI
 */
export interface RepoStatusInfo {
  status: RepoStatus
  repoName: string
  branch: string
  ahead: number
  behind: number
  lastSync?: string
  error?: string
}
