import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ThemeProvider } from './useTheme'
import { OpenTabsProvider } from './OpenTabsContext'

// The workspace layout renders a PanelGroup of panes. When a navPane is
// supplied alongside leftPane+rightPane, it should produce a THREE-pane split:
// nav (left) | action (center, the old leftPane) | chat (right). The two-pane
// path (no navPane) must stay byte-identical to today.

function renderShell(props: Parameters<typeof AppShell>[0]) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <OpenTabsProvider>
          <AppShell {...props} />
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function paneClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('*'))
    .map((e) => e.className && String(e.className))
    .filter(Boolean)
    .map(String)
    .filter((cls) => cls.includes('cl-workspace__pane--'))
}

describe('AppShell three-pane workspace layout', () => {
  it('renders three panes (nav/action/chat) when a navPane is supplied', () => {
    const { container } = renderShell({
      brand: 'Run',
      layout: 'workspace',
      leftPane: <div data-testid="action" />,
      rightPane: <div data-testid="chat" />,
      navPane: <div data-testid="nav" />,
    })
    const classes = paneClasses(container)
    expect(classes.join(' ')).toContain('cl-workspace__pane--nav')
    expect(classes.join(' ')).toContain('cl-workspace__pane--action')
    expect(classes.join(' ')).toContain('cl-workspace__pane--chat')
  })

  it('keeps two panes (action/right) when no navPane is supplied (back-compat)', () => {
    const { container } = renderShell({
      brand: 'Run',
      layout: 'workspace',
      leftPane: <div data-testid="action" />,
      rightPane: <div data-testid="chat" />,
    })
    const classes = paneClasses(container)
    // No nav pane in the two-pane shape.
    expect(classes.join(' ')).not.toContain('cl-workspace__pane--nav')
    // The existing two-pane path keeps the --left/--right classes (byte-compat).
    expect(classes.join(' ')).toContain('cl-workspace__pane--left')
    expect(classes.join(' ')).toContain('cl-workspace__pane--right')
  })
})