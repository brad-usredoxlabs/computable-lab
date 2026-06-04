/**
 * RichTextToolbar tests — uses a fake Editor object so we don't pay the
 * TipTap init cost in this unit test. Verifies:
 *  - all buttons disabled when editor is null
 *  - active-mark detection wires through to aria-pressed + the active
 *    CSS class
 *  - clicking each button dispatches the right chain method (we just
 *    record the call and assert the right one fired)
 *  - the link button reads the previous href via getAttributes for the
 *    UX of "prompt with current value" before unset/set
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RichTextToolbar } from './RichTextToolbar'
import type { Editor } from '@tiptap/react'

afterEach(() => cleanup())

interface FakeEditor {
  activeMarks: Set<string>
  activeNodes: Set<string>
  activeHeadingLevel: number | null
  linkHref: string
  calls: string[]
}

function makeFakeEditor(init?: Partial<FakeEditor>): {
  editor: Editor
  state: FakeEditor
} {
  const state: FakeEditor = {
    activeMarks: init?.activeMarks ?? new Set<string>(),
    activeNodes: init?.activeNodes ?? new Set<string>(),
    activeHeadingLevel: init?.activeHeadingLevel ?? null,
    linkHref: init?.linkHref ?? '',
    calls: [],
  }

  // A self-returning chain proxy: any method call returns the same proxy
  // unless it's `.run()`, which returns true. We record the method name
  // so the test can assert which terminal verb the button hit.
  const chain: Record<string, unknown> = {}
  const chainProxy = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'run') return () => true
      return (...args: unknown[]) => {
        const label =
          args.length > 0 ? `${prop}(${JSON.stringify(args)})` : prop
        state.calls.push(label)
        return chainProxy
      }
    },
  })

  const editor = {
    isActive: (name: string, attrs?: { level?: number }) => {
      if (name === 'heading') {
        return state.activeHeadingLevel === (attrs?.level ?? null)
      }
      if (name === 'bulletList' || name === 'orderedList' || name === 'blockquote') {
        return state.activeNodes.has(name)
      }
      return state.activeMarks.has(name)
    },
    chain: () => chainProxy,
    getAttributes: (name: string) =>
      name === 'link' ? { href: state.linkHref } : {},
  } as unknown as Editor

  return { editor, state }
}

describe('RichTextToolbar', () => {
  it('renders all buttons disabled when editor is null', () => {
    render(<RichTextToolbar editor={null} />)
    const btns = document.querySelectorAll<HTMLButtonElement>(
      '.rich-text-toolbar__btn',
    )
    expect(btns.length).toBeGreaterThan(0)
    for (const b of btns) expect(b.disabled).toBe(true)
  })

  it('highlights active marks via aria-pressed and the active class', () => {
    const { editor } = makeFakeEditor({
      activeMarks: new Set(['bold', 'underline']),
    })
    render(<RichTextToolbar editor={editor} />)
    const bold = screen.getByTestId('rt-bold') as HTMLButtonElement
    const italic = screen.getByTestId('rt-italic') as HTMLButtonElement
    const underline = screen.getByTestId('rt-underline') as HTMLButtonElement
    expect(bold.getAttribute('aria-pressed')).toBe('true')
    expect(italic.getAttribute('aria-pressed')).toBe('false')
    expect(underline.getAttribute('aria-pressed')).toBe('true')
    expect(bold.className).toContain('active')
  })

  it('highlights the matching heading level', () => {
    const { editor } = makeFakeEditor({ activeHeadingLevel: 2 })
    render(<RichTextToolbar editor={editor} />)
    const h1 = screen.getByTestId('rt-h1') as HTMLButtonElement
    const h2 = screen.getByTestId('rt-h2') as HTMLButtonElement
    const h3 = screen.getByTestId('rt-h3') as HTMLButtonElement
    expect(h2.getAttribute('aria-pressed')).toBe('true')
    expect(h1.getAttribute('aria-pressed')).toBe('false')
    expect(h3.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking Bold runs toggleBold on the editor chain', () => {
    const { editor, state } = makeFakeEditor()
    render(<RichTextToolbar editor={editor} />)
    fireEvent.click(screen.getByTestId('rt-bold'))
    expect(state.calls).toEqual(['focus', 'toggleBold'])
  })

  it('clicking H2 toggles heading at the requested level', () => {
    const { editor, state } = makeFakeEditor()
    render(<RichTextToolbar editor={editor} />)
    fireEvent.click(screen.getByTestId('rt-h2'))
    expect(state.calls).toEqual(['focus', 'toggleHeading([{"level":2}])'])
  })

  it('clicking the bullet list button toggles bullet list', () => {
    const { editor, state } = makeFakeEditor()
    render(<RichTextToolbar editor={editor} />)
    fireEvent.click(screen.getByTestId('rt-ul'))
    expect(state.calls).toEqual(['focus', 'toggleBulletList'])
  })

  it('link button: empty prompt result unsets the link', () => {
    const { editor, state } = makeFakeEditor({ linkHref: 'https://old.example' })
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('')
    render(<RichTextToolbar editor={editor} />)
    fireEvent.click(screen.getByTestId('rt-link'))
    expect(promptSpy).toHaveBeenCalledWith('Link URL', 'https://old.example')
    expect(state.calls).toEqual(['focus', 'extendMarkRange(["link"])', 'unsetLink'])
    promptSpy.mockRestore()
  })

  it('link button: non-empty prompt result sets the link', () => {
    const { editor, state } = makeFakeEditor()
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('https://example.com')
    render(<RichTextToolbar editor={editor} />)
    fireEvent.click(screen.getByTestId('rt-link'))
    expect(state.calls).toEqual([
      'focus',
      'extendMarkRange(["link"])',
      'setLink([{"href":"https://example.com"}])',
    ])
    promptSpy.mockRestore()
  })

  it('link button: cancelled prompt does not call any chain method', () => {
    const { editor, state } = makeFakeEditor()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    render(<RichTextToolbar editor={editor} />)
    fireEvent.click(screen.getByTestId('rt-link'))
    expect(state.calls).toEqual([])
    promptSpy.mockRestore()
  })
})
