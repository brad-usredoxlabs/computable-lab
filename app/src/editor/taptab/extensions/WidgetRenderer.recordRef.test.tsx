import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { WidgetRenderer } from './WidgetRenderer'

vi.mock('../tabNavPlugin', () => ({ focusAdjacentTabField: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({
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

function renderRecordRef(value: unknown) {
  const onCommit = vi.fn()
  render(
    <WidgetRenderer
      widget={'record-ref' as never}
      value={value}
      readOnly={false}
      options={null}
      refKind="person"
      onCommit={onCommit}
      onCancel={() => {}}
      onRefSelect={() => {}}
    />,
  )
  return { onCommit }
}

describe('record-ref widget', () => {
  afterEach(cleanup)

  it('lists records of the declared ref kind instead of opening ontology search', async () => {
    renderRecordRef(null)
    fireEvent.click(document.querySelector('.taptab-widget-value')!)
    expect(await screen.findByText('Dennis Bray')).toBeInTheDocument()
    expect(document.querySelector('.ref-combobox')).toBeNull()
  })

  it('commits the canonical ref object (kind/type/id/label)', async () => {
    const { onCommit } = renderRecordRef(null)
    fireEvent.click(document.querySelector('.taptab-widget-value')!)
    const option = await screen.findByText('Dennis Bray')
    fireEvent.click(option.closest('li')!)
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith({
      kind: 'record', type: 'person', id: 'PER-1', label: 'Dennis Bray',
    }))
  })

  it('displays an existing ref as "label (id)"', () => {
    renderRecordRef({ kind: 'record', type: 'person', id: 'PER-2', label: 'Ada Lovelace' })
    expect(screen.getByText('Ada Lovelace (PER-2)')).toBeInTheDocument()
  })
})
