import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RecordProvenanceCard } from './RecordProvenanceCard'

const mocked = vi.hoisted(() => ({ listRecordRevisions: vi.fn() }))

vi.mock('../../shared/api/client', () => ({
  apiClient: { listRecordRevisions: mocked.listRecordRevisions },
}))

beforeEach(() => {
  mocked.listRecordRevisions.mockReset()
  mocked.listRecordRevisions.mockResolvedValue({ records: [] })
})

describe('RecordProvenanceCard', () => {
  it('renders nothing for a create draft (no record id)', () => {
    const { container } = render(<RecordProvenanceCard recordId="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows who/when from envelope meta', async () => {
    render(
      <RecordProvenanceCard
        recordId="TRR-DEMO-1"
        meta={{
          createdBy: 'USR-BRAD',
          createdAt: '2026-10-03T15:10:21.437Z',
          contentSha: 'dd544a153b87cbb4c6d663876aa9360f15152176',
          path: 'records/training-record/TRR-DEMO-1__untitled.yaml',
        }}
      />,
    )
    const card = screen.getByTestId('record-provenance')
    expect(card).toBeInTheDocument()
    expect(screen.getByText('USR-BRAD')).toBeInTheDocument()
    expect(screen.getByText('2026-10-03T15:10:21.437Z')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByText('records/training-record/TRR-DEMO-1__untitled.yaml'),
      ).toBeInTheDocument(),
    )
  })

  it('falls back to payload timestamps when meta is absent', () => {
    render(
      <RecordProvenanceCard
        recordId="TRR-X"
        payload={{ createdBy: 'USR-A', createdAt: '2026-01-01T00:00:00.000Z' }}
      />,
    )
    expect(screen.getByText('USR-A')).toBeInTheDocument()
    expect(screen.getByText('2026-01-01T00:00:00.000Z')).toBeInTheDocument()
  })

  it('shows a revision count only when revisions exist', async () => {
    mocked.listRecordRevisions.mockResolvedValue({ records: [{}, {}, {}] })
    render(<RecordProvenanceCard recordId="TRR-Y" meta={{ createdBy: 'USR-B' }} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })

  it('invents nothing: no meta and no payload timestamps means no card', () => {
    const { container } = render(<RecordProvenanceCard recordId="TRR-Z" payload={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
