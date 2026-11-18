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
  /**
   * Serving-tree identity (L2-P1-BUILDINFO-1 buildinfo): derived on the server
   * from git at process start. OPTIONAL — responses from pre-existing servers
   * (and fixtures) carry no `build` key.
   */
  build?: {
    /** 40-char hex sha of the serving tree's HEAD, or 'unknown'. */
    sha: string
    /** ISO timestamp of when the revision was resolved. */
    builtAt: string
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
