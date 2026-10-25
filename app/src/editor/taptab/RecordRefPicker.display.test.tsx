/**
 * REG-3 FIX1 D3 (constrained) — record-ref display fallback consistency.
 *
 * The gate observed: the read view shows the raw id ("PER-DEMO-AUTHOR")
 * when a stored ref carries no label, and "label (id)" when it does. The
 * picker's own edit affordance had the same inconsistency: it prefills the
 * raw id even though the candidate list it just loaded knows the record's
 * real label.
 *
 * Fix contract: resolve the label from the LOADED candidate list (the
 * picker's single kind-scoped fetch already carries it — no extra fetch
 * per open, no invented label data, no hardcoded strings). When the
 * current value is a bare record id that matches a loaded candidate, the
 * picker shows that candidate's real label.
 *
 * RED at base: the input prefills 'PER-1' after the list loads.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { WidgetRenderer } from './extensions/WidgetRenderer'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(async () => ({
      records: [
        { recordId: 'PER-1', payload: { kind: 'person', id: 'PER-1', displayName: 'Dennis Bray' } },
        { recordId: 'PER-2', payload: { kind: 'person', id: 'PER-2', displayName: 'Ada Lovelace' } },
      ],
      total: 2,
    })),
  },
}))

describe('record-ref picker display fallback (D3)', () => {
  afterEach(cleanup)

  it('prefills the picker with the loaded candidate label when the stored ref has no label', async () => {
    render(
      <WidgetRenderer
        widget="record-ref"
        value={{ kind: 'record', type: 'person', id: 'PER-1' }}
        readOnly={false}
        options={null}
        refKind="person"
        onCommit={() => {}}
        onCancel={() => {}}
        onRefSelect={() => {}}
      />,
    )
    // Read view without a stored label shows the id (deterministic, no invention).
    expect(screen.getByText('PER-1')).toBeInTheDocument()

    fireEvent.click(document.querySelector('.taptab-widget-value')!)
    await screen.findByText('Dennis Bray') // candidates loaded

    // The picker's affordance is now consistent with the committed
    // "label (id)" display: the label the loaded list KNOWS, not the bare id.
    const input = document.querySelector('.record-ref-picker input') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('Dennis Bray'))
  })

  it('prefills the stored label when the ref carries one', async () => {
    render(
      <WidgetRenderer
        widget="record-ref"
        value={{ kind: 'record', type: 'person', id: 'PER-2', label: 'Ada Lovelace' }}
        readOnly={false}
        options={null}
        refKind="person"
        onCommit={() => {}}
        onCancel={() => {}}
        onRefSelect={() => {}}
      />,
    )
    fireEvent.click(document.querySelector('.taptab-widget-value')!)
    await screen.findByText('Ada Lovelace')
    const input = document.querySelector('.record-ref-picker input') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('Ada Lovelace'))
  })
})
