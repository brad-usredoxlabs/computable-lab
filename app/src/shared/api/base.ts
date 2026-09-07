/**
 * Shared API base URL resolver.
 *
 * Priority:
 * 1) VITE_API_BASE_URL (e.g. "http://localhost:3001/api")
 * 2) relative /api (for Vite proxy, same-origin deployments, and port-forwarded setups)
 */

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (envBase) {
    return trimTrailingSlashes(envBase)
  }
  return '/api'
}

export const API_BASE = resolveApiBase()

/**
 * Local-first identity: the selected user id is sent as the `x-user-id` header
 * on every API request so the backend (which already enforces access control)
 * resolves the chosen user instead of falling back to the local admin. This is
 * a convenience switcher, NOT authentication — the server trusts the header.
 */
const CURRENT_USER_STORAGE_KEY = 'cl.currentUserId'

let currentUserId: string | null =
  (typeof localStorage !== 'undefined' && localStorage.getItem(CURRENT_USER_STORAGE_KEY)) || null

export function getCurrentUserId(): string | null {
  return currentUserId
}

export function setCurrentUserId(id: string | null): void {
  currentUserId = id && id.trim() ? id.trim() : null
  if (typeof localStorage === 'undefined') return
  if (currentUserId) localStorage.setItem(CURRENT_USER_STORAGE_KEY, currentUserId)
  else localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
}

/**
 * Local login session token, sent as `x-cl-session`. Stronger identity signal
 * than `x-user-id`: a valid session resolves to its user for provenance + ACLs.
 * Persisted in localStorage so reloads keep the login.
 */
const SESSION_STORAGE_KEY = 'cl.sessionToken'

let sessionToken: string | null =
  (typeof localStorage !== 'undefined' && localStorage.getItem(SESSION_STORAGE_KEY)) || null

export function getSessionToken(): string | null {
  return sessionToken
}

export function setSessionToken(token: string | null): void {
  sessionToken = token && token.trim() ? token.trim() : null
  if (typeof localStorage === 'undefined') return
  if (sessionToken) localStorage.setItem(SESSION_STORAGE_KEY, sessionToken)
  else localStorage.removeItem(SESSION_STORAGE_KEY)
}
