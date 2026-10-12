/**
 * QMS-6A — SignOffReceipt tests.
 *
 * (e) DELTA D9 minimal revision visibility: a compact, honest readout
 * "N revisions · newest REV-x" built from the EXISTING
 * apiClient.listRecordRevisions (client.ts:2325 → GET /records/:id/revisions,
 * server RecordHandlers.ts:163-169 → { records: RecordEnvelope[] }, each
 * payload.kind === 'record-revision' with recordId REV-<32 uppercase hex>,
 * sourceRecordId, contentHash, createdAt — RecordRevisionService.ts:65).
 * The 0-revision case must be HONEST (never "0 revisions · newest —"), and the
 * readout must refetch when refreshKey bumps (same cadence as the receipt).
 *
 * The applied/orphan classification rows lock the existing D7 contract
 * (applied only via a matching lifecycle_transition audit event; legacy
 * signatures without a verifiable snapshot are historical evidence only).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { SignOffReceipt } from './SignOffReceipt'

// ---------------------------------------------------------------------------
// apiClient mock — SignOffReceipt consumes the client ONLY through the
// apiClient object; replace it wholesale (no predicates involved here).
// ---------------------------------------------------------------------------

const mocked = vi.hoisted(() => ({
  listRecordsByKind: vi.fn(),
  listRecordRevisions: vi.fn(),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: mocked.listRecordsByKind,
    listRecordRevisions: mocked.listRecordRevisions,
  },
}))

// ---------------------------------------------------------------------------
// Fixtures (server-true shapes; revision ids are REV-<32 uppercase hex>)
// ---------------------------------------------------------------------------

const RECORD_ID = 'DOC-DEMO-SOP'

function revisionEnvelope(recordId: string, createdAt: string) {
  return {
    recordId,
    schemaId: 'record-revision',
    payload: {
      kind: 'record-revision',
      recordId,
      sourceRecordId: RECORD_ID,
      contentHash: 'c'.repeat(64),
      purpose: 'derivation',
      createdAt,
    },
  }
}

const REV_OLDER = 'REV-7F7DC7390FD4C915341934A720BE634E'
const REV_NEWER = 'REV-AF7D11110FD4C915341934A720BE0000'

function noSignatures() {
  mocked.listRecordsByKind.mockImplementation(async () => ({ records: [], total: 0 }))
}

beforeEach(() => {
  mocked.listRecordsByKind.mockReset()
  mocked.listRecordRevisions.mockReset()
  noSignatures()
  mocked.listRecordRevisions.mockResolvedValue({ records: [] })
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------

describe('SignOffReceipt — revision readout (delta D9, gap (e))', () => {
  it('renders "N revisions · newest REV-x" from listRecordRevisions', async () => {
    // Array order deliberately oldest-first: "newest" must come from createdAt,
    // not from store listing order.
    mocked.listRecordRevisions.mockResolvedValue({
      records: [revisionEnvelope(REV_OLDER, '2026-10-01T10:00:00.000Z'), revisionEnvelope(REV_NEWER, '2026-10-03T22:30:54.097Z')],
    })

    render(<SignOffReceipt recordId={RECORD_ID} />)

    const readout = await screen.findByTestId('revision-readout')
    expect(readout.textContent).toMatch(/2 revisions/)
    expect(readout.textContent).toMatch(/·/)
    expect(readout.textContent).toMatch(/newest REV-AF7D/)
    // Full immutable id stays available on the compact display.
    expect(readout.querySelector('[title]')?.getAttribute('title')).toBe(REV_NEWER)
    expect(mocked.listRecordRevisions).toHaveBeenCalledWith(RECORD_ID)
  })

  it('singular wording for exactly one revision', async () => {
    mocked.listRecordRevisions.mockResolvedValue({
      records: [revisionEnvelope(REV_OLDER, '2026-10-01T10:00:00.000Z')],
    })

    render(<SignOffReceipt recordId={RECORD_ID} />)

    const readout = await screen.findByTestId('revision-readout')
    expect(readout.textContent).toMatch(/1 revision ·/)
    expect(readout.textContent).toMatch(/newest REV-7F7D/)
  })

  it('ZERO revisions is honest: no "0 revisions", no "newest —" — the readout is absent', async () => {
    mocked.listRecordRevisions.mockResolvedValue({ records: [] })

    render(<SignOffReceipt recordId={RECORD_ID} />)

    await screen.findByTestId('sign-off-receipt') // surface settled
    expect(screen.queryByTestId('revision-readout')).toBeNull()
    expect(document.body.textContent).not.toMatch(/0 revisions/)
    expect(document.body.textContent).not.toMatch(/newest\s+—/)
  })

  it('a FAILED revisions fetch is honest: no readout, no fabricated count', async () => {
    mocked.listRecordRevisions.mockRejectedValue(new Error('network down'))

    render(<SignOffReceipt recordId={RECORD_ID} />)

    await screen.findByTestId('sign-off-receipt')
    expect(screen.queryByTestId('revision-readout')).toBeNull()
    expect(document.body.textContent).not.toMatch(/revisions ·/)
  })

  it('refetches when refreshKey bumps (receipt refresh cadence)', async () => {
    mocked.listRecordRevisions.mockResolvedValue({
      records: [revisionEnvelope(REV_OLDER, '2026-10-01T10:00:00.000Z')],
    })

    const { rerender } = render(<SignOffReceipt recordId={RECORD_ID} refreshKey={0} />)
    const first = await screen.findByTestId('revision-readout')
    expect(first.textContent).toMatch(/1 revision/)

    // A transition happened: the bar bumps refreshKey; a new revision exists.
    mocked.listRecordRevisions.mockResolvedValue({
      records: [
        revisionEnvelope(REV_OLDER, '2026-10-01T10:00:00.000Z'),
        revisionEnvelope(REV_NEWER, '2026-10-03T22:30:54.097Z'),
      ],
    })
    rerender(<SignOffReceipt recordId={RECORD_ID} refreshKey={1} />)

    await waitFor(() => expect(mocked.listRecordRevisions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('revision-readout').textContent).toMatch(/2 revisions/))
  })
})

describe('SignOffReceipt — applied vs orphan classification (delta D7, lock)', () => {
  beforeEach(() => {
    mocked.listRecordsByKind.mockImplementation(async (kind: string) => {
      if (kind === 'signature') {
        return {
          records: [
            {
              recordId: 'SIG-OLD-APPLIED',
              schemaId: 'signature',
              payload: {
                kind: 'signature',
                recordId: 'SIG-OLD-APPLIED',
                signedBy: 'USR-REV',
                action: 'approved',
                subject: {
                  recordId: RECORD_ID,
                  targetState: 'approved',
                  revisionRef: { kind: 'record', type: 'record-revision', id: REV_OLDER },
                  contentHash: 'old000',
                },
              },
            },
            {
              recordId: 'SIG-ORPHAN',
              schemaId: 'signature',
              payload: {
                kind: 'signature',
                recordId: 'SIG-ORPHAN',
                signedBy: 'USR-X',
                action: 'approved',
                subject: {
                  recordId: RECORD_ID,
                  targetState: 'approved',
                  revisionRef: { kind: 'record', type: 'record-revision', id: REV_NEWER },
                  contentHash: 'abc123',
                },
              },
            },
            {
              recordId: 'SIG-LEGACY',
              schemaId: 'signature',
              payload: {
                kind: 'signature',
                recordId: 'SIG-LEGACY',
                signedBy: 'USR-OLD',
                action: 'approved',
                subject: { recordId: RECORD_ID }, // no revisionRef / contentHash
              },
            },
          ],
          total: 3,
        }
      }
      if (kind === 'audit-event') {
        return {
          records: [
            {
              recordId: 'EVT-1',
              schemaId: 'audit-event',
              payload: {
                kind: 'audit-event',
                recordId: 'EVT-1',
                actor: 'USR-REV',
                action: 'lifecycle_transition',
                subjectId: RECORD_ID,
                subjectType: 'controlled-document',
                data: { from: 'in_review', to: 'approved', event: 'APPROVE', signatureRefs: ['SIG-OLD-APPLIED'] },
              },
            },
          ],
          total: 1,
        }
      }
      return { records: [], total: 0 }
    })
  })

  it('an unapplied SIG renders as ORPHAN, never applied', async () => {
    render(<SignOffReceipt recordId={RECORD_ID} />)
    const receipt = await screen.findByTestId('sign-off-receipt')
    const orphanRow = receipt.textContent?.match(/SIG-ORPHAN/)
    expect(orphanRow).toBeTruthy()
    const lis = Array.from(receipt.querySelectorAll('li'))
    const orphanLi = lis.find(li => li.textContent?.includes('SIG-ORPHAN'))
    const appliedLi = lis.find(li => li.textContent?.includes('SIG-OLD-APPLIED'))
    expect(orphanLi?.textContent).toMatch(/orphan/i)
    expect(orphanLi?.textContent).not.toMatch(/applied →/i)
    expect(appliedLi?.textContent).toMatch(/applied → approved/i)
  })

  it('a legacy signature without a verifiable snapshot is historical evidence only', async () => {
    render(<SignOffReceipt recordId={RECORD_ID} />)
    const receipt = await screen.findByTestId('sign-off-receipt')
    const lis = Array.from(receipt.querySelectorAll('li'))
    const legacyLi = lis.find(li => li.textContent?.includes('SIG-LEGACY'))
    expect(legacyLi?.textContent).toMatch(/historical evidence only — does not authorize/i)
  })
})
