/**
 * REG-3 FIX1 D1 — the datetime widget's COMMIT must satisfy the schema's
 * `format: date-time` (Ajv2020 strict, via ajv-formats).
 *
 * The gate proved the create leg dies with 422 "/completedAt: Invalid
 * format: expected date-time": training-record.ui.yaml declared widget
 * "date" (commits bare "YYYY-MM-DD") against a schema requiring
 * date-time. The declarative fix is widget "datetime", but the datetime
 * widget commits the RAW datetime-local string "YYYY-MM-DDTHH:mm"
 * (DatetimeWidget.tsx:22) — and Ajv2020 REJECTS that too (no seconds).
 * Proven against the server's own Ajv config:
 *   "2026-10-18T14:30"        -> invalid (format date-time)
 *   "2026-10-18T14:30:00"     -> valid
 *
 * So the widget's commit path must complete the value it itself produced
 * (append ":00" when seconds are missing). Normalization lives ONLY in
 * the datetime widget's commit — never page-side, never schema-side.
 *
 * RED at base: the widget commits the raw "YYYY-MM-DDTHH:mm".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { WidgetRenderer } from '../extensions/WidgetRenderer'

function renderDatetime(value: unknown) {
  const onCommit = vi.fn()
  render(
    <WidgetRenderer
      widget="datetime"
      value={value}
      readOnly={false}
      options={null}
      refKind={undefined}
      onCommit={onCommit}
      onCancel={() => {}}
      onRefSelect={() => {}}
    />,
  )
  return { onCommit }
}

describe('datetime widget commit (D1)', () => {
  afterEach(cleanup)

  it('commits a full ISO date-time when the browser produced the bare datetime-local value', () => {
    const { onCommit } = renderDatetime(null)
    fireEvent.click(document.querySelector('.taptab-datetime-value')!)
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.change(input, { target: { value: '2026-10-18T14:30' } })
    fireEvent.blur(input)
    // RED at base: commits the raw '2026-10-18T14:30' -> Ajv 422.
    expect(onCommit).toHaveBeenCalledWith('2026-10-18T14:30:00')
  })

  it('commits a full ISO date-time on Enter too', () => {
    const { onCommit } = renderDatetime(null)
    fireEvent.click(document.querySelector('.taptab-datetime-value')!)
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-10-18T14:30' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('2026-10-18T14:30:00')
  })

  it('passes through a value that already carries seconds unchanged', () => {
    const { onCommit } = renderDatetime(null)
    fireEvent.click(document.querySelector('.taptab-datetime-value')!)
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-10-18T14:30:45' } })
    fireEvent.blur(input)
    // Seconds already present -> the commit is the control's own value,
    // untouched (jsdom canonicalizes to .000; the widget adds nothing).
    expect(onCommit.mock.calls[0][0]).toMatch(/^2026-10-18T14:30:45/)
  })

  it('passes through a stored full timestamp untouched when the field was not re-entered', () => {
    // Blur without typing must not corrupt a stored valid value (edit mode
    // of an existing record: click-to-edit then click away).
    const { onCommit } = renderDatetime('2026-10-03T15:10:13.995Z')
    fireEvent.click(document.querySelector('.taptab-datetime-value')!)
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('2026-10-03T15:10:13.995Z')
  })
})
