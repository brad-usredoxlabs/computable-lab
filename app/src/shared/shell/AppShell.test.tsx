/**
 * Smoke tests for AppShell — covers the new workspace layout introduced
 * for the project-workspace redesign.
 *
 * Goals:
 *  1. Default (stacked) layout still renders children inline below the topbar
 *     and emits the dock slot — no regression for /browser, /protocols,
 *     /literature, or the legacy event-editor stacked render.
 *  2. Workspace layout renders the viewer-toolbar slot, both panes, and a
 *     resize handle. The plain `children` and `dock` props become optional
 *     here (right pane subsumes the dock's role).
 *  3. Topbar tabs slot stacks beneath the chrome row when supplied.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ThemeProvider } from './useTheme'

afterEach(() => {
  cleanup()
})

function renderShell(props: Parameters<typeof AppShell>[0]) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AppShell {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('AppShell — stacked (default) layout', () => {
  it('renders brand, children, and dock inline', () => {
    renderShell({
      brand: <span data-testid="brand">CL</span>,
      dock: <div data-testid="dock">DOCK</div>,
      children: <div data-testid="children">CHILDREN</div>,
    })
    expect(screen.getByTestId('brand')).toBeTruthy()
    expect(screen.getByTestId('children')).toBeTruthy()
    expect(screen.getByTestId('dock')).toBeTruthy()
    // Stacked mode does NOT add the workspace marker class.
    expect(document.querySelector('.cl-app--workspace')).toBeNull()
  })

  it('omits the workspace toolbar and panels when workspace props are not provided', () => {
    renderShell({
      brand: <span>CL</span>,
      children: <div>CHILDREN</div>,
      // viewerToolbar / leftPane / rightPane intentionally omitted
    })
    expect(document.querySelector('.cl-workspace')).toBeNull()
    expect(document.querySelector('.cl-workspace__handle')).toBeNull()
  })

  it('does NOT inject the .topbar__chrome wrapper when no project tabs', () => {
    // Regression: unconditionally wrapping brand/middle/right in
    // `.topbar__chrome` broke stacked-mode pages (Protocols / Literature /
    // Browser) because the wrapper has no flex CSS outside the
    // `.topbar--with-tabs` modifier. Items stacked vertically and pushed
    // the page content past the viewport.
    renderShell({
      brand: <span>CL</span>,
      topbarMiddle: <div>chips</div>,
      topbarRight: <nav>right</nav>,
      children: <div>BODY</div>,
    })
    expect(document.querySelector('.topbar__chrome')).toBeNull()
    expect(document.querySelector('.topbar--with-tabs')).toBeNull()
  })

  it('injects the .topbar__chrome wrapper only when tabs are present', () => {
    renderShell({
      brand: <span>CL</span>,
      topbarTabs: <div data-testid="tabs">[StudyA]</div>,
      children: <div>BODY</div>,
    })
    expect(document.querySelector('.topbar__chrome')).toBeTruthy()
    expect(document.querySelector('.topbar--with-tabs')).toBeTruthy()
  })
})

describe('AppShell — workspace layout', () => {
  it('renders the viewer toolbar + both panes + a resize handle', () => {
    renderShell({
      brand: <span>CL</span>,
      layout: 'workspace',
      viewerToolbar: <div data-testid="viewer-toolbar">TOOLBAR</div>,
      leftPane: <div data-testid="left-pane">LEFT</div>,
      rightPane: <div data-testid="right-pane">RIGHT</div>,
    })
    expect(screen.getByTestId('viewer-toolbar')).toBeTruthy()
    expect(screen.getByTestId('left-pane')).toBeTruthy()
    expect(screen.getByTestId('right-pane')).toBeTruthy()
    expect(document.querySelector('.cl-app--workspace')).toBeTruthy()
    // react-resizable-panels emits a handle element for each PanelResizeHandle.
    expect(document.querySelector('.cl-workspace__handle')).toBeTruthy()
  })

  it('omits the resize handle when there is no right pane', () => {
    renderShell({
      brand: <span>CL</span>,
      layout: 'workspace',
      leftPane: <div data-testid="left-pane-only">LEFT</div>,
    })
    expect(screen.getByTestId('left-pane-only')).toBeTruthy()
    expect(document.querySelector('.cl-workspace__handle')).toBeNull()
  })

  it('ignores plain children in workspace mode (left pane is the surface)', () => {
    renderShell({
      brand: <span>CL</span>,
      layout: 'workspace',
      leftPane: <div data-testid="left">LEFT</div>,
      rightPane: <div data-testid="right">RIGHT</div>,
      children: <div data-testid="ignored-children">should not render</div>,
    })
    expect(screen.queryByTestId('ignored-children')).toBeNull()
    expect(screen.getByTestId('left')).toBeTruthy()
  })
})

describe('AppShell — topbar tabs', () => {
  it('renders a tabs row beneath the chrome row when topbarTabs is supplied', () => {
    renderShell({
      brand: <span>CL</span>,
      topbarTabs: <div data-testid="tabs">[StudyA][StudyB][+]</div>,
      children: <div>BODY</div>,
    })
    expect(screen.getByTestId('tabs')).toBeTruthy()
    expect(document.querySelector('.topbar--with-tabs')).toBeTruthy()
    expect(document.querySelector('.topbar__tabs')).toBeTruthy()
  })

  it('does not render the tabs row when topbarTabs is not supplied', () => {
    renderShell({
      brand: <span>CL</span>,
      children: <div>BODY</div>,
    })
    expect(document.querySelector('.topbar--with-tabs')).toBeNull()
    expect(document.querySelector('.topbar__tabs')).toBeNull()
  })
})

describe('AppShell — bare mode', () => {
  it('skips chrome entirely', () => {
    renderShell({
      brand: <span>CL</span>,
      bare: true,
      children: <div data-testid="bare-content">FILL VIEWPORT</div>,
    })
    expect(screen.getByTestId('bare-content')).toBeTruthy()
    expect(document.querySelector('.cl-app--bare')).toBeTruthy()
    // Bare mode should never engage workspace layout even if layout='workspace'.
    expect(document.querySelector('.cl-workspace')).toBeNull()
  })

  it('does not switch to workspace mode when bare=true', () => {
    renderShell({
      brand: <span>CL</span>,
      bare: true,
      layout: 'workspace',
      leftPane: <div>LEFT</div>,
      children: <div data-testid="bare-content">FILL VIEWPORT</div>,
    })
    expect(document.querySelector('.cl-app--workspace')).toBeNull()
  })
})
