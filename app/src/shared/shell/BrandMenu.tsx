/**
 * BrandMenu — the brand-click menu in the top-bar's left slot.
 *
 * Phase 7 retires the global Settings link from the nav: settings,
 * theme, and About all move into a single brand-anchored menu. Every
 * endpoint shares the same menu shape; AppShell wraps the `brand` prop
 * in this component so individual endpoint shells don't have to know.
 *
 * Settings opens the off-nav `/settings` shell route so the page gets normal
 * browser history and deep-link behavior. Theme toggles inline. About shows
 * a small dialog.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from './useTheme'

interface BrandMenuProps {
  brand: ReactNode
}

export function BrandMenu({ brand }: BrandMenuProps) {
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { resolvedTheme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Tap-outside / Escape closes the dropdown.
  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (target && containerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openSettings = useCallback(() => {
    setOpen(false)
    navigate('/settings')
  }, [navigate])

  const openAbout = useCallback(() => {
    setAboutOpen(true)
    setOpen(false)
  }, [])

  const handleThemeToggle = useCallback(() => {
    toggleTheme()
    setOpen(false)
  }, [toggleTheme])

  return (
    <>
      <div ref={containerRef} className="brand-menu" style={{ position: 'relative' }}>
        <button
          type="button"
          className="topbar__brand brand-menu__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {brand}
          <span className="brand-menu__caret" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <ul className="brand-menu__dropdown" role="menu">
            <li>
              <button type="button" role="menuitem" onClick={openSettings}>
                Settings
              </button>
            </li>
            <li>
              <button type="button" role="menuitem" onClick={handleThemeToggle}>
                Theme: {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </li>
            <li>
              <button type="button" role="menuitem" onClick={openAbout}>
                About
              </button>
            </li>
          </ul>
        )}
      </div>
      {aboutOpen && (
        <ModalOverlay onClose={() => setAboutOpen(false)} title="About">
          <AboutPanel />
        </ModalOverlay>
      )}
      <style>{brandMenuStyles}</style>
    </>
  )
}

function ModalOverlay({
  onClose,
  title,
  children,
}: {
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="brand-menu__modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="brand-menu__modal" role="dialog" aria-label={title}>
        <header className="brand-menu__modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="brand-menu__modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="brand-menu__modal-body">{children}</div>
      </div>
    </div>
  )
}

function AboutPanel() {
  return (
    <div className="brand-menu__about">
      <p>
        <strong>Computable Lab — 1.0 Appliance</strong>
      </p>
      <p>
        Schema-driven laboratory information substrate. The four endpoints —{' '}
        <code>/browser</code>, <code>/event-editor</code>, <code>/protocols</code>,{' '}
        <code>/literature</code> — share one shell, one design-token system, and
        one AI chat path.
      </p>
      <p>
        For source, issues, and documentation see the project repository.
      </p>
    </div>
  )
}

const brandMenuStyles = `
.brand-menu__trigger {
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}
.brand-menu__trigger:hover {
  background: var(--cl-bg-elev-2);
}
.brand-menu__caret {
  font-size: 0.7em;
  color: var(--cl-text-dim);
}
.brand-menu__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 30;
  margin: 4px 0 0 0;
  padding: 4px 0;
  list-style: none;
  background: var(--cl-bg-elev);
  border: 1px solid var(--cl-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  min-width: 180px;
}
.brand-menu__dropdown li button {
  font: inherit;
  text-align: left;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--cl-text);
  padding: 8px 12px;
  cursor: pointer;
}
.brand-menu__dropdown li button:hover {
  background: var(--cl-bg-elev-2);
}
.brand-menu__modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.brand-menu__modal {
  background: var(--cl-bg);
  color: var(--cl-text);
  border: 1px solid var(--cl-border);
  border-radius: 8px;
  width: min(960px, 90vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.brand-menu__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cl-border);
  flex-shrink: 0;
}
.brand-menu__modal-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.brand-menu__modal-close {
  font: inherit;
  font-size: 1.1em;
  background: transparent;
  border: 1px solid var(--cl-border);
  color: var(--cl-text-dim);
  border-radius: 4px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.brand-menu__modal-close:hover {
  color: var(--cl-text);
  border-color: var(--cl-border-strong);
}
.brand-menu__modal-body {
  overflow: auto;
  flex: 1;
}
.brand-menu__about {
  padding: 16px;
  font-size: 0.95em;
  color: var(--cl-text);
  line-height: 1.6;
}
.brand-menu__about code {
  font-size: 0.9em;
  padding: 1px 4px;
  background: var(--cl-bg-elev-2);
  border-radius: 3px;
}
`
