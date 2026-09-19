import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu } from './ContextMenu'

/**
 * The menu used to portal into `document.body`, which sits OUTSIDE the
 * `.cl-app` element that declares every `--cl-*` token. `var(--cl-bg-elev)`
 * therefore resolved to nothing and the panel painted transparent — in dark
 * mode, unreadable. These pin the mount target so the regression can't come
 * back silently.
 */

afterEach(() => {
  cleanup()
  // The app root is appended by hand (jsdom has no AppShell), so drop it —
  // otherwise the "no app root" case below would silently see one.
  for (const el of Array.from(document.querySelectorAll('.cl-app'))) el.remove()
})

function renderAppRoot() {
  const app = document.createElement('div')
  app.className = 'cl-app'
  app.setAttribute('data-theme', 'dark')
  document.body.appendChild(app)
  return app
}

describe('ContextMenu mount target', () => {
  it('mounts inside the themed app root so the --cl-* tokens cascade in', () => {
    const app = renderAppRoot()
    render(
      <ContextMenu open x={10} y={10} items={[{ id: 'a', label: 'Add material…' }]} onClose={() => {}} />,
    )

    expect(app.querySelector('.ctx-menu')).toBeTruthy()
    // Not a bare body child — that is the transparent-panel bug.
    expect(document.body.querySelector(':scope > .ctx-menu')).toBeNull()
  })

  it('falls back to document.body when no app root is rendered', () => {
    render(
      <ContextMenu open x={10} y={10} items={[{ id: 'a', label: 'Add material…' }]} onClose={() => {}} />,
    )

    expect(document.body.querySelector(':scope > .ctx-menu')).toBeTruthy()
  })
})

describe('ContextMenu behaviour', () => {
  it('renders the title, items, details and separators', () => {
    render(
      <ContextMenu
        open
        x={10}
        y={10}
        title="Well A1"
        onClose={() => {}}
        items={[
          { id: 'aspirate', label: 'Aspirate…', icon: '🩸', detail: 'empty', disabled: true },
          { id: 'sep', label: '', separator: true },
          { id: 'add-material', label: 'Add material…' },
        ]}
      />,
    )

    const menu = screen.getByRole('menu')
    expect(menu.textContent).toContain('Well A1')
    expect(menu.textContent).toContain('Aspirate…')
    expect(menu.textContent).toContain('empty')
    expect(menu.querySelectorAll('hr.ctx-menu__sep')).toHaveLength(1)
    // A disabled item renders as a disabled control, not a clickable row.
    expect((screen.getByRole('menuitem', { name: /aspirate/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('fires onSelect then closes on click', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <ContextMenu open x={10} y={10} items={[{ id: 'mix', label: 'Mix', onSelect }]} onClose={onClose} />,
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Mix' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape without bubbling to the surface underneath', () => {
    const onClose = vi.fn()
    const underlying = vi.fn()
    document.addEventListener('keydown', underlying)
    render(
      <ContextMenu open x={10} y={10} items={[{ id: 'mix', label: 'Mix' }]} onClose={onClose} />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    // Escape peels the menu, not the focus view behind it.
    expect(underlying).not.toHaveBeenCalled()
    document.removeEventListener('keydown', underlying)
  })

  it('closes on an outside click but not on a click inside the menu', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu open x={10} y={10} items={[{ id: 'mix', label: 'Mix' }]} onClose={onClose} />,
    )

    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
