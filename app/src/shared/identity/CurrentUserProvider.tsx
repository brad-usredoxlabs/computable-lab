/**
 * CurrentUserProvider — local-first identity context.
 *
 * Loads the active user (resolved by the backend from the `x-user-id` header)
 * plus the list of selectable users. Selecting a user persists the choice and
 * does a full page reload: records are filtered server-side per user, so a
 * reload is the simplest correct way to drop every cached list/detail and
 * re-fetch as the new user.
 *
 * NOTE: this is a convenience switcher, NOT authentication — the server trusts
 * the header. Do not expose on an untrusted network.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiClient, type MeResponse, type UserSummary } from '../api/client'
import { setCurrentUserId } from '../api/base'

interface CurrentUserContextValue {
  loading: boolean
  users: UserSummary[]
  /** Backend-resolved active user id (USR-* or null when unknown). */
  currentUserId: string | null
  currentUser: UserSummary | null
  isSystem: boolean
  groups: MeResponse['groups']
  setCurrentUser: (id: string | null) => void
  reload: () => void
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null)

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [me, setMe] = useState<MeResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiClient.listUsers().catch(() => [] as UserSummary[]),
      apiClient.getMe().catch(() => null),
    ])
      .then(([u, m]) => {
        if (cancelled) return
        setUsers(u)
        setMe(m)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setCurrentUser = useCallback((id: string | null) => {
    setCurrentUserId(id)
    // Hard-navigate to the homescreen (not just reload): the current URL may
    // point at a project the new user can't access, and the open-tab session
    // is per-user (it re-reads under the new user's scoped key). A full load to
    // '/' drops all in-memory state and lands on the home/Welcome screen, where
    // the new user sees only their own studies (and their own tab session).
    window.location.assign('/')
  }, [])

  const value: CurrentUserContextValue = {
    loading,
    users,
    currentUserId: me?.userId ?? null,
    currentUser: me?.user ?? null,
    isSystem: me?.isSystem ?? true,
    groups: me?.groups ?? [],
    setCurrentUser,
    reload: () => window.location.reload(),
  }

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) throw new Error('useCurrentUser must be used within a CurrentUserProvider')
  return ctx
}

/**
 * Like {@link useCurrentUser} but returns null outside a provider instead of
 * throwing — for components (e.g. UserSwitcher) that may render in trees or
 * tests where the provider isn't mounted, so they can degrade gracefully.
 */
export function useOptionalCurrentUser(): CurrentUserContextValue | null {
  return useContext(CurrentUserContext)
}
