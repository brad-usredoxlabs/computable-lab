import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTheme } from './useTheme'
import { useViewport } from './useViewport'
import { BrandMenu } from './BrandMenu'
import './AppShell.css'

/**
 * AppShell — the one shared chrome for every appliance endpoint.
 *
 * Phase 0 lifts this out of `EventEditorShell` so the four endpoints
 * (/browser, /event-editor, /protocols, /literature) all compose under
 * one shell with the same top-bar layout, dock slot, and theme handling.
 *
 * The slot props define what an endpoint can fill in:
 * - `brand`         — leftmost top-bar label (and the entry point for a
 *                     future brand menu where Settings will live).
 * - `topbarMiddle`  — endpoint-specific chips (vocab, tool, mode, etc.).
 * - `topbarRight`   — right-hand chrome (theme toggle, endpoint nav links).
 * - `dock`          — the foot dock, scoped to the endpoint's AI layer.
 * - `fixItLauncher` — optional Fix-It overlay (compilable-artifact endpoints).
 *
 * On mobile, the middle and right slots collapse into a slide-down menu
 * triggered by a hamburger so the bar fits a phone-width without scroll.
 *
 * `rootClassName` lets an endpoint add an extra class to the outer div
 * for endpoint-specific CSS scoping (e.g. `event-editor` to keep the
 * existing deck/dock/lawn styles matching their current selectors).
 *
 * `bare` skips the chrome grid and renders just `children` — used by
 * standalone routes like `/event-editor/fixit` that fill the viewport.
 */
export interface AppShellProps {
  brand: ReactNode
  topbarMiddle?: ReactNode
  topbarRight?: ReactNode
  dock?: ReactNode
  fixItLauncher?: ReactNode
  rootClassName?: string
  bare?: boolean
  children: ReactNode
}

export function AppShell({
  brand,
  topbarMiddle,
  topbarRight,
  dock,
  fixItLauncher,
  rootClassName,
  bare,
  children,
}: AppShellProps) {
  const { resolvedTheme } = useTheme()
  const cls = ['cl-app', bare ? 'cl-app--bare' : '', rootClassName]
    .filter(Boolean)
    .join(' ')

  if (bare) {
    return (
      <div className={cls} data-theme={resolvedTheme}>
        {children}
      </div>
    )
  }

  return (
    <div className={cls} data-theme={resolvedTheme}>
      <AppShellTopBar brand={brand} middle={topbarMiddle} right={topbarRight} />
      {children}
      {dock}
      {fixItLauncher}
    </div>
  )
}

interface TopBarProps {
  brand: ReactNode
  middle?: ReactNode
  right?: ReactNode
}

function AppShellTopBar({ brand, middle, right }: TopBarProps) {
  const { isMobile } = useViewport()
  if (isMobile) return <MobileTopBar brand={brand} middle={middle} right={right} />
  return <DesktopTopBar brand={brand} middle={middle} right={right} />
}

function DesktopTopBar({ brand, middle, right }: TopBarProps) {
  return (
    <header className="topbar">
      <BrandMenu brand={brand} />
      {middle ? (
        <>
          <span className="topbar__divider" />
          <div className="topbar__group">{middle}</div>
        </>
      ) : null}
      <span className="topbar__spacer" />
      {right}
    </header>
  )
}

/**
 * Mobile top bar: brand + hamburger only. The middle and right slots
 * collapse into a slide-down menu below the bar so it fits a phone width
 * without horizontal scrolling.
 */
function MobileTopBar({ brand, middle, right }: TopBarProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Tap-outside to close. Document-level listener; ignore clicks that
  // started inside the menu or on the hamburger toggle.
  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && menuRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-topbar-hamburger]'))
        return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [open])

  // Close the menu on link navigation. The menu itself catches the
  // bubbled click since each link is rendered inside.
  function handleMenuClick(event: React.MouseEvent) {
    const target = event.target as Element | null
    if (target?.closest('a')) setOpen(false)
  }

  return (
    <>
      <header className="topbar topbar--mobile">
        <BrandMenu brand={brand} />
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
        <div
          className="topbar__menu"
          ref={menuRef}
          role="menu"
          onClick={handleMenuClick}
        >
          {middle ? (
            <div className="topbar__menu-group">{middle}</div>
          ) : null}
          {middle && right ? (
            <div className="topbar__menu-divider" aria-hidden />
          ) : null}
          {right ? <div className="topbar__menu-group">{right}</div> : null}
        </div>
      ) : null}
    </>
  )
}
