import { useEffect, useRef, useState } from 'react'
import { useViewport } from '../lib/useViewport'
import { DeckModeSwitcher } from './DeckModeSwitcher'
import { VocabSwitcher } from './VocabSwitcher'
import { ToolSwitcher } from './ToolSwitcher'
import { TipChip } from './TipChip'
import { NavLinks } from './NavLinks'
import { ThemeToggle } from './ThemeToggle'

export function TopBar() {
  const { isMobile } = useViewport()
  if (isMobile) return <MobileTopBar />
  return <DesktopTopBar />
}

function DesktopTopBar() {
  return (
    <header className="topbar">
      <span className="topbar__brand">Event Editor</span>
      <span className="topbar__divider" />
      <div className="topbar__group">
        <DeckModeSwitcher />
        <VocabSwitcher />
        <ToolSwitcher />
        <TipChip />
      </div>
      <span className="topbar__spacer" />
      <ThemeToggle />
      <NavLinks />
    </header>
  )
}

/**
 * Mobile topbar: brand + hamburger only. All chips, theme toggle, and
 * nav links collapse into a slide-down menu below the topbar so the bar
 * itself fits a phone width without horizontal scrolling.
 */
function MobileTopBar() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Tap-outside to close. Listen at the document level; ignore clicks
  // that originated inside the menu or on the toggle button.
  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && menuRef.current?.contains(target)) return
      // The toggle button has data-topbar-hamburger so we can identify
      // it without a second ref.
      if (target instanceof Element && target.closest('[data-topbar-hamburger]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [open])

  // Close the menu when the user navigates (any link click). Falls
  // through to a global click listener inside the menu.
  function handleMenuClick(event: React.MouseEvent) {
    const target = event.target as Element | null
    if (target?.closest('a')) setOpen(false)
  }

  return (
    <>
      <header className="topbar topbar--mobile">
        <span className="topbar__brand">Event Editor</span>
        <span className="topbar__spacer" />
        <button
          type="button"
          className="topbar__hamburger"
          data-topbar-hamburger="true"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? '✕' : '☰'}
        </button>
      </header>
      {open ? (
        <div className="topbar__menu" ref={menuRef} role="menu" onClick={handleMenuClick}>
          <div className="topbar__menu-group">
            <DeckModeSwitcher />
            <VocabSwitcher />
            <ToolSwitcher />
            <TipChip />
          </div>
          <div className="topbar__menu-divider" aria-hidden />
          <div className="topbar__menu-group">
            <ThemeToggle />
            <NavLinks />
          </div>
        </div>
      ) : null}
    </>
  )
}
