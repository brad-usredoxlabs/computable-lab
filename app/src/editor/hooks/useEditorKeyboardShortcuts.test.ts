import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useEditorKeyboardShortcuts } from './useEditorKeyboardShortcuts'

function press(key: string, opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  document.dispatchEvent(event)
  return event
}

afterEach(cleanup)

describe('useEditorKeyboardShortcuts', () => {
  it('fires onUndo for Ctrl+Z and onRedo for Ctrl+Shift+Z (key reports "Z")', () => {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    renderHook(() => useEditorKeyboardShortcuts({ onUndo, onRedo }))

    press('z')
    expect(onUndo).toHaveBeenCalledTimes(1)

    // Shift+Z reports an uppercase key — the redo branch must still match.
    press('Z', { shiftKey: true })
    expect(onRedo).toHaveBeenCalledTimes(1)

    press('y')
    expect(onRedo).toHaveBeenCalledTimes(2)
  })

  it('does not preventDefault shortcuts whose handler is absent', () => {
    renderHook(() => useEditorKeyboardShortcuts({ onUndo: vi.fn() }))

    expect(press('s').defaultPrevented).toBe(false)
    expect(press('a').defaultPrevented).toBe(false)
    expect(press('Delete', { ctrlKey: false }).defaultPrevented).toBe(false)
    expect(press('z').defaultPrevented).toBe(true)
  })

  it('skips events originating from inputs and contenteditable hosts', () => {
    const onUndo = vi.fn()
    renderHook(() => useEditorKeyboardShortcuts({ onUndo }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    )
    expect(onUndo).not.toHaveBeenCalled()
    input.remove()

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.appendChild(editable)
    editable.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    )
    expect(onUndo).not.toHaveBeenCalled()
    editable.remove()
  })

  it('honors disabled', () => {
    const onUndo = vi.fn()
    renderHook(() => useEditorKeyboardShortcuts({ onUndo, disabled: true }))
    press('z')
    expect(onUndo).not.toHaveBeenCalled()
  })
})
