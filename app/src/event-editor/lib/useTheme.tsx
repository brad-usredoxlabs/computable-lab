import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ResolvedTheme = 'light' | 'dark'

/** Value stored in localStorage. `null` ⇒ follow system. */
type StoredTheme = ResolvedTheme | null

const STORAGE_KEY = 'ee-theme'

function readStored(): StoredTheme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function writeStored(theme: StoredTheme): void {
  try {
    if (theme === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export interface ThemeContextValue {
  resolvedTheme: ResolvedTheme
  userTheme: StoredTheme
  setTheme: (theme: StoredTheme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Provider that holds the editor's theme state in one place so that the
 * topbar toggle and the shell that paints `data-theme` on the root share a
 * single source of truth. Two separate `useTheme()` callers would otherwise
 * each spin up their own state, making the toggle invisible until the next
 * full reload.
 *
 * Tracks system `prefers-color-scheme` while the user has no explicit
 * choice. An explicit `setTheme('light' | 'dark')` pins the value in
 * `localStorage` and overrides the system until cleared with `setTheme(null)`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [userTheme, setUserTheme] = useState<StoredTheme>(() => readStored())
  const [sys, setSys] = useState<ResolvedTheme>(() => systemTheme())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (e: MediaQueryListEvent) => setSys(e.matches ? 'light' : 'dark')
    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [])

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedTheme: ResolvedTheme = userTheme ?? sys
    const setTheme = (theme: StoredTheme) => {
      writeStored(theme)
      setUserTheme(theme)
    }
    return {
      resolvedTheme,
      userTheme,
      setTheme,
      toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    }
  }, [userTheme, sys])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Read the active theme. Must be called inside a `<ThemeProvider>`; throws
 * otherwise so missing wiring is loud instead of silently desyncing.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>')
  }
  return ctx
}
