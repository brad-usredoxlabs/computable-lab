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
