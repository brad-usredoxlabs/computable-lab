import { useTheme } from '../lib/useTheme'

/**
 * Two-state theme toggle for the event-editor topbar.
 *
 * Defaults to system preference; an explicit click persists `light`/`dark`
 * in localStorage and wins over the system value until cleared.
 */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${nextTheme} mode`}
      aria-label={`Switch to ${nextTheme} mode`}
    >
      <span aria-hidden>{resolvedTheme === 'dark' ? '☀' : '☾'}</span>
    </button>
  )
}
