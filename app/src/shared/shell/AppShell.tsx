import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useTheme } from './useTheme'
import { useViewport } from './useViewport'
import { BrandMenu } from './BrandMenu'
import { GlobalNavbar } from './GlobalNavbar'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import './AppShell.css'

/**
 * AppShell — the one shared chrome for every appliance endpoint.
 *
 * Phase 0 lifted this out of `EventEditorShell` so the four endpoints
 * (/browser, /event-editor, /protocols, /literature) all compose under
 * one shell with the same top-bar layout, dock slot, and theme handling.
 *
 * The slot props define what an endpoint can fill in:
 * - `brand`         — leftmost top-bar label (and the entry point for a
 *                     future brand menu where Settings will live).
 * - `topbarMiddle`  — endpoint-specific chips (vocab, tool, mode, etc.).
 * - `topbarRight`   — right-hand chrome (theme toggle, endpoint nav links).
 * - `topbarTabs`    — second row beneath the chrome row, for project tabs
 *                     (browser-tab style). In the workspace layout this
 *                     defaults to <WorkspaceTabStrip /> when not provided,
 *                     so the appliance always shows the user's tab set.
 * - `viewerToolbar` — context-sensitive toolbar above the workspace viewer
 *                     (deck chips, rich-text toolbar, PDF nav). Only used
 *                     in workspace layout.
 * - `dock`          — the foot dock, scoped to the endpoint's AI layer.
 *                     Replaced by `rightPane` in workspace layout.
 * - `fixItLauncher` — optional Fix-It overlay (compilable-artifact endpoints).
 *
 * `layout` switches between two structural shapes:
 * - `'stacked'` (default) — the original 3-row grid (topbar / children / dock).
 *                            Every existing endpoint stays on this and is
 *                            unaffected by the new props.
 * - `'workspace'`         — the project-workspace shape: project tabs in the
 *                            topbar, a polymorphic viewer in the left pane,
 *                            and an AI/Search/Browse panel on the right.
 *                            The middle row hosts a `PanelGroup` so both
 *                            panes resize / collapse via drag.
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
  topbarTabs?: ReactNode
  viewerToolbar?: ReactNode
  leftPane?: ReactNode
  rightPane?: ReactNode
  dock?: ReactNode
  fixItLauncher?: ReactNode
  rootClassName?: string
  bare?: boolean
  layout?: 'stacked' | 'workspace'
  /**
   * When set, react-resizable-panels persists the pane sizes to localStorage
   * under this key. Workspace pages should pass a per-study id so different
   * studies remember their own pane widths.
   */
  panelAutoSaveId?: string
  children?: ReactNode
}

export function AppShell({
  brand,
  topbarMiddle,
  topbarRight,
  topbarTabs,
  viewerToolbar,
  leftPane,
  rightPane,
  dock,
  fixItLauncher,
  rootClassName,
  bare,
  layout = 'stacked',
  panelAutoSaveId,
  children,
}: AppShellProps) {
  const { resolvedTheme } = useTheme()
  const isWorkspace = layout === 'workspace' && !bare
  const cls = [
    'cl-app',
    bare ? 'cl-app--bare' : '',
    isWorkspace ? 'cl-app--workspace' : '',
    rootClassName,
  ]
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
      {isWorkspace ? (
        // Phase 1: the workspace header is two rows:
        //   1. GlobalNavbar — persistent 4-destination nav + search + create
        //   2. Tab strip — open workspace tabs (passed via topbarTabs prop)
        // The legacy stacked layout below keeps its multi-slot topbar
        // untouched for /protocols, /browser, /literature, /settings.
        <header className="topbar topbar--workspace">
          <GlobalNavbar />
          <div className="topbar__tabs">{topbarTabs ?? <WorkspaceTabStrip />}</div>
        </header>
      ) : (
        <AppShellTopBar
          brand={brand}
          middle={topbarMiddle}
          right={topbarRight}
          tabs={topbarTabs}
        />
      )}
      {isWorkspace ? (
        <WorkspaceMain
          viewerToolbar={viewerToolbar}
          leftPane={leftPane}
          rightPane={rightPane}
          panelAutoSaveId={panelAutoSaveId}
        />
      ) : (
        children
      )}
      {dock}
      {fixItLauncher}
    </div>
  )
}

interface WorkspaceMainProps {
  viewerToolbar?: ReactNode
  leftPane?: ReactNode
  rightPane?: ReactNode
  panelAutoSaveId?: string
}

/**
 * Workspace middle row — two stacked sub-rows:
 *   1. viewer toolbar (auto, only if provided)
 *   2. PanelGroup with viewer on the left and tools on the right
 *
 * Both panels are `collapsible` so the user can drag either side to zero
 * and snap it shut. Default split favors the viewer (60/40); per-study
 * sizes persist via `panelAutoSaveId` once the workspace context wires it
 * up in Phase 2.
 */
function WorkspaceMain({
  viewerToolbar,
  leftPane,
  rightPane,
  panelAutoSaveId,
}: WorkspaceMainProps) {
  const hasRight = rightPane !== undefined && rightPane !== null
  const { isMobile } = useViewport()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const topBar = viewerToolbar ? (
    <div className="cl-workspace__toolbar">{viewerToolbar}</div>
  ) : null

  // No right pane: there's nothing to split against, so render the left pane
  // filling the whole surface. Skips react-resizable-panels entirely here —
  // a lone `collapsible` Panel flipped to vertical on portrait collapses to 0
  // height, which blanked /splash and other single-pane workspace routes.
  if (!hasRight) {
    return (
      <div className="cl-workspace">
        {topBar}
        <div className="cl-workspace__panels cl-workspace__panels--single">
          <div className="cl-workspace__pane cl-workspace__pane--left">
            {leftPane}
          </div>
        </div>
      </div>
    )
  }

  // Mobile (portrait): the right pane becomes a right-side slide-in drawer,
  // docked ~90% out of the way. Tap its revealed edge to slide it into place;
  // tap the main pane to slide it back to the docked configuration.
  if (isMobile) {
    return (
      <div className="cl-workspace">
        {topBar}
        <div className="cl-workspace__drawer-stage">
          <div
            className="cl-workspace__pane cl-workspace__pane--main"
            onClick={() => setDrawerOpen(false)}
          >
            {leftPane}
          </div>
          <div
            className={
              drawerOpen
                ? 'cl-workspace__drawer cl-workspace__drawer--open'
                : 'cl-workspace__drawer'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="cl-workspace__drawer-peek"
              aria-label={drawerOpen ? 'Hide panel' : 'Show panel'}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((o) => !o)}
            />
            <div className="cl-workspace__drawer-body">{rightPane}</div>
          </div>
        </div>
      </div>
    )
  }

  // Desktop (wide): the viewer and the tabbed nav sit in a horizontal
  // resizable split.
  return (
    <div className="cl-workspace">
      {topBar}
      <PanelGroup
        direction="horizontal"
        className="cl-workspace__panels"
        {...(panelAutoSaveId ? { autoSaveId: panelAutoSaveId } : {})}
      >
        <Panel
          defaultSize={60}
          minSize={20}
          collapsible
          collapsedSize={0}
          className="cl-workspace__pane cl-workspace__pane--left"
        >
          {leftPane}
        </Panel>
        <PanelResizeHandle className="cl-workspace__handle" />
        <Panel
          defaultSize={40}
          minSize={20}
          collapsible
          collapsedSize={0}
          className="cl-workspace__pane cl-workspace__pane--right"
        >
          {rightPane}
        </Panel>
      </PanelGroup>
    </div>
  )
}

interface TopBarProps {
  brand: ReactNode
  middle?: ReactNode
  right?: ReactNode
  tabs?: ReactNode
}

function AppShellTopBar({ brand, middle, right, tabs }: TopBarProps) {
  const { isMobile } = useViewport()
  if (isMobile)
    return <MobileTopBar brand={brand} middle={middle} right={right} tabs={tabs} />
  return <DesktopTopBar brand={brand} middle={middle} right={right} tabs={tabs} />
}

function DesktopTopBar({ brand, middle, right, tabs }: TopBarProps) {
  // The single-row case (no project tabs) keeps the original `.topbar` flex
  // layout untouched — brand + middle + spacer + right line up horizontally
  // exactly like every existing endpoint expects. The two-row case wraps
  // the chrome in `.topbar__chrome` AND flips the outer header to
  // `flex-direction: column`, then drops the tabs row below. Wrapping
  // unconditionally would inject an unstyled div in the middle of the
  // single-row flex line, breaking ProtocolsPage / LiteraturePage / etc.
  const chromeRow = (
    <>
      <BrandMenu brand={brand} />
      {middle ? (
        <>
          <span className="topbar__divider" />
          <div className="topbar__group">{middle}</div>
        </>
      ) : null}
      <span className="topbar__spacer" />
      {right}
    </>
  )
  return (
    <header className={tabs ? 'topbar topbar--with-tabs' : 'topbar'}>
      {tabs ? <div className="topbar__chrome">{chromeRow}</div> : chromeRow}
      {tabs ? <div className="topbar__tabs">{tabs}</div> : null}
    </header>
  )
}

/**
 * Mobile top bar: brand + hamburger only. The middle and right slots
 * collapse into a slide-down menu below the bar so it fits a phone width
 * without horizontal scrolling.
 */
function MobileTopBar({ brand, middle, right, tabs }: TopBarProps) {
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
      {tabs ? <div className="topbar__tabs topbar__tabs--mobile">{tabs}</div> : null}
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
