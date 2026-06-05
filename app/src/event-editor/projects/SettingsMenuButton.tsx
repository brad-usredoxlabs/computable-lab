/**
 * SettingsMenuButton — the gear icon hosting Settings / Theme / About
 * at the end of the project tab strip.
 *
 * Phase 12 retired the brand row above the project tabs. The Brand
 * menu's three items (Settings link, Theme toggle, About modal) used to
 * live there; they re-emerge here, anchored to a gear-icon button at
 * the trailing edge of the tab strip. Reuses `BrandMenuDropdown` from
 * `shared/shell` so the menu body is shared between the legacy stacked
 * pages and the workspace.
 */

import { useEffect, useRef, useState } from 'react'
import { BrandMenuDropdown } from '../../shared/shell'

export function SettingsMenuButton() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Tap-outside closes; Escape handling lives inside BrandMenuDropdown.
  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (target && wrapRef.current?.contains(target)) return
      // Don't close while the About modal is overlaying — the modal has
      // its own backdrop click handler. BrandMenuDropdown handles that
      // case by mounting the modal as a separate root-level element
      // that isn't inside `wrapRef`, so a click on the modal still
      // matches the !contains check. We close anyway; the modal stays
      // open because it's a separate element.
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div
      ref={wrapRef}
      className="settings-menu-button"
      data-testid="settings-menu-button"
    >
      <button
        type="button"
        className="settings-menu-button__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings, theme, and about"
        title="Settings · Theme · About"
        onClick={() => setOpen((o) => !o)}
        data-testid="settings-menu-trigger"
      >
        ⚙
      </button>
      {open ? (
        <BrandMenuDropdown onClose={() => setOpen(false)} align="right" />
      ) : null}
    </div>
  )
}
