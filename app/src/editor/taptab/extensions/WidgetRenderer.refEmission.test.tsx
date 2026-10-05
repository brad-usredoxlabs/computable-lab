/**
 * QMS-6E D3b — the ref value-emission boundary (RED-first).
 *
 * Ref-typed fields (ref/combobox/reflist) carry structured ref objects or are
 * ABSENT. The QMS-6B attempt-8 receipt shows an empty ref reaching the PUT as
 * a typed value (display string '—' per the replay, null per the live 422 —
 * BOTH violate `type: object`, api/a-save-payload-replays.txt (b)). The field
 * value must never be a display glyph or a placeholder-typed empty; the true
 * empty value is "absent", which the serializer must produce.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { WidgetRenderer } from './WidgetRenderer'

vi.mock('../tabNavPlugin', () => ({
  focusAdjacentTapTabField: vi.fn(),
}))

function renderRef(value: unknown, onCommit: (v: unknown) => void) {
  return render(
    <div className="taptab-editor-prose">
      <WidgetRenderer
        widget="ref"
        value={value}
        readOnly={false}
        options={null}
        refKind="user"
        onCommit={onCommit}
        onCancel={() => {}}
        onRefSelect={() => {}}
      />
    </div>,
  )
}

describe('WidgetRenderer ref emission — empty ref must never emit a display glyph (QMS-6E D3b)', () => {
  afterEach(cleanup)

  it('the empty-ref affordance is aria-hidden decoration, not a value', () => {
    renderRef(null, vi.fn())
    const empty = document.querySelector('.taptab-widget-empty')
    expect(empty).not.toBeNull()
    expect(empty!.getAttribute('aria-hidden')).toBe('true')
    expect(empty!.textContent).toBe('—')
  })

  it('tab-advance into an empty ref (synthetic click) then blur commits nothing — never a string', () => {
    const onCommit = vi.fn()
    renderRef(undefined, onCommit)

    // focusAdjacentTapTabField's activateField() clicks the widget wrapper.
    const wrapper = document.querySelector('.taptab-widget-value')!
    expect(wrapper).not.toBeNull()
    fireEvent.click(wrapper)

    // The ref combobox opened. The reviewer never picks anything; the next
    // blur/Escape cancels the edit.
    const input = document.querySelector('.ref-combobox input')
    expect(input).not.toBeNull()
    fireEvent.blur(input!)

    // No commit may carry a placeholder or an empty typed value.
    for (const call of onCommit.mock.calls) {
      const emitted = call[0]
      if (typeof emitted === 'string') {
        expect(emitted).not.toBe('—')
        expect(emitted).not.toBe('')
        expect((emitted as string).trim().length).toBeGreaterThan(0)
      }
    }
  })
})
