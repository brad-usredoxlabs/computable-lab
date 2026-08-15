/**
 * GlobalNavbar — persistent top-level navigation bar with 4 primary
 * destinations (Projects, Runs, Claims, Lab), global search, and
 * create menu. Sits above the workspace tab strip in the AppShell.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 *
 * Recommended complete header:
 *   [Computable Lab]  Projects  Runs  Claims  Lab  [Find anything…]  [+ Create]  [User] [Settings]
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { SettingsMenuButton } from '../../event-editor/projects/SettingsMenuButton'
import { UserSwitcher } from './UserSwitcher'
import { GlobalSearchBar } from './GlobalSearchBar'
import { CreateMenu } from './CreateMenu'
import { useViewport } from './useViewport'
import './GlobalNavbar.css'

type PrimaryDestination = 'projects' | 'runs' | 'claims' | 'lab' | 'ingestion'

const DESTINATIONS: { id: PrimaryDestination; label: string; path: string }[] = [
  { id: 'projects', label: 'Projects', path: '/projects' },
  { id: 'runs', label: 'Runs', path: '/runs' },
  { id: 'claims', label: 'Claims', path: '/claims' },
  { id: 'lab', label: 'Lab', path: '/lab' },
  { id: 'ingestion', label: 'Ingestion', path: '/ingestion' },
]

export function GlobalNavbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile } = useViewport()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Determine active destination from URL. /project/:studyId also
  // counts as "projects" active since it's a project workspace.
  const activeDest = DESTINATIONS.find((d) =>
    location.pathname === d.path || location.pathname.startsWith(d.path + '/'),
  ) ?? (location.pathname.startsWith('/project/') ? DESTINATIONS[0] : null)

  const handleDestination = (dest: { id: string; path: string; label: string }) => {
    navigate(dest.path)
    setMenuOpen(false)
  }

  // Tap-outside to close (mobile menu). Ignore clicks that started inside
  // the menu or on the hamburger toggle.
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && menuRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-topbar-hamburger]'))
        return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [menuOpen])

  const destinations = (
    <nav className="global-navbar__destinations" role="navigation">
      {DESTINATIONS.map((dest) => (
        <button
          key={dest.id}
          type="button"
          className={
            activeDest?.id === dest.id
              ? 'global-navbar__dest global-navbar__dest--active'
              : 'global-navbar__dest'
          }
          data-testid={`global-nav-${dest.id}`}
          onClick={() => handleDestination(dest)}
        >
          {dest.label}
        </button>
      ))}
    </nav>
  )

  if (isMobile) {
    return (
      <div className="global-navbar global-navbar--mobile" data-testid="global-navbar">
        <button
          type="button"
          className="global-navbar__brand"
          onClick={() => navigate('/projects')}
        >
          <span className="global-navbar__brand-text">Computable Lab</span>
        </button>
        <span className="global-navbar__spacer" />
        <button
          type="button"
          className="global-navbar__hamburger"
          data-topbar-hamburger="true"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
        {menuOpen ? (
          <div
            className="global-navbar__menu"
            ref={menuRef}
            role="menu"
            onClick={(event) => {
              const target = event.target as Element | null
              if (target?.closest('a, button')) setMenuOpen(false)
            }}
          >
            {destinations}
            <div className="global-navbar__menu-search">
              <GlobalSearchBar />
            </div>
            <div className="global-navbar__menu-footer">
              <div className="global-navbar__menu-actions">
                <CreateMenu />
              </div>
              <div className="global-navbar__menu-trailing">
                <UserSwitcher />
                <SettingsMenuButton />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="global-navbar" data-testid="global-navbar">
      <button
        type="button"
        className="global-navbar__brand"
        onClick={() => navigate('/projects')}
      >
        <span className="global-navbar__brand-text">Computable Lab</span>
      </button>
      {destinations}
      <div className="global-navbar__search">
        <GlobalSearchBar />
      </div>
      <div className="global-navbar__actions">
        <CreateMenu />
      </div>
      <div className="global-navbar__trailing">
        <UserSwitcher />
        <SettingsMenuButton />
      </div>
    </div>
  )
}
