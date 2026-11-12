/**
 * MaterialReceivingDoor — tests for the /lab "Receive a lot" door
 * (L2-LAB-INVENTORY-CREATE-1, unit u6recvdoor).
 *
 * The door stages a material-receiving attestation through the EXISTING
 * /drafts/compile seam (adapter `receiving`) and renders the compiled draft or
 * the server's own refusal. Nothing is accepted here: this leg stops before
 * accept, so no accept call may happen.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const compileSpy = vi.fn()
const acceptSpy = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: {
    compileWorkstateDraft: (...args: unknown[]) => compileSpy(...args),
    acceptWorkstateDraft: (...args: unknown[]) => acceptSpy(...args),
  },
}))

import { MaterialReceivingDoor } from './MaterialReceivingDoor'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderDoor() {
  return render(<MaterialReceivingDoor isOpen onClose={() => {}} />)
}

function type(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

function fillClaim() {
  type('material-receiving-vendor', 'Sigma')
  type('material-receiving-product-label', 'D6429-500ML')
  type('material-receiving-lot-number', 'L2601')
  type('material-receiving-received-by-status', 'known')
  type('material-receiving-received-by-label', 'Brad')
  type('material-receiving-occurred-at-status', 'unknown')
}

const OK = { draftId: 'DRAFT-u6recv-1', revision: 1, reviewHash: 'sha256:abc123', canAccept: true, diagnostics: [] }

beforeEach(() => {
  compileSpy.mockResolvedValue(OK)
})

describe('MaterialReceivingDoor', () => {
  it('renders the attested-fact inputs (vendor, product label, lot, status triples, occurredAt)', () => {
    renderDoor()
    expect(screen.getByTestId('material-receiving-vendor')).toBeDefined()
    expect(screen.getByTestId('material-receiving-product-label')).toBeDefined()
    expect(screen.getByTestId('material-receiving-lot-number')).toBeDefined()
    expect(screen.getByTestId('material-receiving-occurred-at')).toBeDefined()
    const receivedBy = screen.getByTestId('material-receiving-received-by-status')
    for (const v of ['known', 'approximate', 'unknown']) {
      expect(within(receivedBy).getByRole('option', { name: v })).toBeDefined()
    }
    const occurredAt = screen.getByTestId('material-receiving-occurred-at-status')
    for (const v of ['known', 'approximate', 'unknown']) {
      expect(within(occurredAt).getByRole('option', { name: v })).toBeDefined()
    }
  })

  it('submits ONE compile with adapter receiving + operation compose-receiving and renders draftId/reviewHash', async () => {
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(screen.getByTestId('material-receiving-draft-id')).toBeDefined())

    expect(compileSpy).toHaveBeenCalledTimes(1)
    const req = compileSpy.mock.calls[0][0] as { adapter: string; intent: Record<string, unknown> }
    expect(req.adapter).toBe('receiving')
    expect(req.intent.operation).toBe('compose-receiving')
    const claim = req.intent.claim as Record<string, unknown>
    expect(claim).toMatchObject({
      vendor: 'Sigma', productLabel: 'D6429-500ML', lotNumber: 'L2601',
      receivedByLabel: 'Brad', receivedByStatus: 'known', occurredAtStatus: 'unknown',
    })
    // exactOptionalPropertyTypes bait: no optional key rides as present-but-undefined.
    expect(Object.values(claim).every((v) => v !== undefined)).toBe(true)
    expect('occurredAt' in claim).toBe(false)

    expect(screen.getByTestId('material-receiving-draft-id').textContent).toBe('DRAFT-u6recv-1')
    expect(screen.getByTestId('material-receiving-review-hash').textContent).toBe('sha256:abc123')
    expect(acceptSpy).not.toHaveBeenCalled()
    expect(screen.queryByTestId('material-receiving-accept')).toBeNull()
  })

  it('sends occurredAt when the occurrence status is stated and omits it when unknown', async () => {
    renderDoor()
    fillClaim()
    type('material-receiving-occurred-at-status', 'known')
    type('material-receiving-occurred-at', '2026-11-01')
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(compileSpy).toHaveBeenCalledTimes(1))
    const claim = (compileSpy.mock.calls[0][0] as { intent: { claim: Record<string, unknown> } }).intent.claim
    expect(claim.occurredAt).toBe('2026-11-01')
    expect(claim.occurredAtStatus).toBe('known')
  })

  it('renders the server diagnostics VERBATIM on refusal and shows no accept affordance', async () => {
    const message = 'material-receiving-lot-requires-product: vendor-scoped lot: a receipt claim carries assertion.lot without assertion.vendorProductRef (claims)'
    compileSpy.mockResolvedValue({
      draftId: 'DRAFT-u6recv-2', revision: 1, reviewHash: 'sha256:def456', canAccept: false,
      diagnostics: [{ ruleId: 'material-receiving-lot-requires-product', message }],
    })
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy())
    expect(screen.queryByTestId('material-receiving-draft-id')).toBeNull()
    expect(screen.queryByTestId('material-receiving-accept')).toBeNull()
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull()
  })
})
